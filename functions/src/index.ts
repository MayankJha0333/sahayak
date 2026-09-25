import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger, setGlobalOptions } from 'firebase-functions/v2';
import {
  DURATIONS, FIRST_COUPON, GIVE_UP_MS, LATE_CANCEL_FEE, OVERTIME_PER_MIN, RADII_M, REFERRAL_REWARD,
  STAGE1_MS, STAGE2_MS, VISIT_FEE, priceForMinutes, service, skillsFor, isOpenAt } from './catalog';
import { HANDOVER_MIN, along, distanceM, etaMinutes, travelEstimate, type LatLng } from './geo';
import {
  NotPaidError, RAZORPAY_KEY_ID, confirmPayment, createOrder as rzpOrder, directTransfer, razorpayConfigured, razorpayMock,
  refund as rzpRefund, setTransferHold, transferFromPayment, verifyWebhook,
} from './razorpay';

initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 20 });
const db = getFirestore();

/* ================================================================== */
/* types + helpers                                                     */
/* ================================================================== */

type Address = { id: string; label: string; line1: string; line2: string; directions: string; at: LatLng };
type UserDoc = { role: string; phone: string; name: string; rewards: number; referredBy?: string; referralCode: string; addresses: Address[]; firstBookingDone?: boolean };
type PartnerDoc = {
  name: string; initials: string; rating: number; jobs: number; skills: string[]; hub: string; onShift: boolean; reliability: number; onTime: number; at: LatLng;
  bot?: boolean; referralEarned?: number; firstJobDone?: boolean; referredBy?: string;
  /** Razorpay Route linked account (acc_…) her share is transferred to. Set by ops after KYC. */
  payout?: { accountId?: string; linkedAt?: number };
};
/** Extra time the customer bought during the visit, paid there and then. */
type Extension = { minutes: number; amount: number; orderId: string; paymentId: string; at: number };
/** Travel from the expert to the door, estimated when she is assigned. */
type Eta = { roadM: number; minutes: number; from: number; arriveBy: number; startBy: number };
type Booking = {
  customerId: string; tasks: string[]; serviceSlug: string; durationMin: number; addonSlugs: string[]; address: Address;
  price: number; fee: number; discount: number; rewardUsed: number; amountDue: number;
  status: string; paid: boolean; razorpay: { orderId: string; paymentId?: string; refundId?: string };
  balance?: { orderId: string; amount: number; paid: boolean; paymentId?: string; tip: number };
  partnerId?: string; preferredPartnerId?: string; partnerAt?: LatLng; startCode: string; extraMin: number; tip: number;
  doneTasks: string[]; dispatchLog: string[]; createdAt: number; scheduledFor: number | null;
  assignedAt?: number; arrivedAt?: number; startedAt?: number; endedAt?: number; rating?: number; ratingTags?: string[];
  cancelFee?: number; autoCompleteAt?: number;
  /** End of the time that has been paid for. The session timer counts down to this. */
  endsAt?: number;
  extensions?: Extension[];
  pendingExtension?: { orderId: string; minutes: number; amount: number };
  eta?: Eta;
  /** Scheduled visits: when she should set off to reach the door on time. */
  leaveAt?: number;
  workedMin?: number;
  paymentError?: string;
};
type Earning = {
  partnerId: string; bookingId: string; jobPay: number; extraPay: number; tip: number; total: number;
  status: 'awaiting_account' | 'sent' | 'on_hold' | 'failed';
  transfers: { id: string; amount: number; source: string }[];
  releaseAt?: number; error?: string; createdAt: number; updatedAt: number;
};
const PARTNER_SHARE = 0.62;
/** Demo experts squeeze a visit into 90 s; one booked minute is one real second for them. */
const BOT_MS_PER_MIN = 1000;
const EXTENSION_OPTIONS = [15, 30, 60];
const MAX_EXTRA_MIN = 120;
/** After the paid time ends the visit closes on its own if nobody extends or finishes it. */
const GRACE_MS = 10 * 60_000;
/** The expert's share settles to her bank a day after the visit, leaving time to look at a complaint. */
const PAYOUT_HOLD_S = 24 * 60 * 60;

const uid = (r: CallableRequest<unknown>) => {
  if (!r.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return r.auth.uid;
};
const must = <T>(v: T | undefined | null, msg: string): T => { if (v == null) throw new HttpsError('failed-precondition', msg); return v; };
const code4 = () => String(Math.floor(1000 + Math.random() * 9000));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bookingRef = (id: string) => db.collection('bookings').doc(id);
const offerId = (bookingId: string, partnerId: string) => `${bookingId}_${partnerId}`;
/** Gurugram for now: addresses outside this circle are not served. Mirrors src/lib/useLiveLocation.ts. */
const CITY = { lat: 28.4419, lng: 77.0723 };
const SERVICE_RADIUS_M = 40_000;
const LIVE_STATUSES = ['payment_pending', 'matching', 'assigned', 'arrived', 'in_progress'];

/**
 * Who can take a scheduled visit: skilled, within 5 km, and not already booked for an overlapping slot.
 * Being online right now does not matter for a visit hours or days away.
 */
async function reserveFor(b: { tasks: string[]; address: Address; scheduledFor: number | null; durationMin: number; preferredPartnerId?: string }, ignoreBookingId?: string) {
  const start = b.scheduledFor ?? Date.now();
  const end = start + b.durationMin * 60_000;
  const upcoming = await db.collection('bookings').where('scheduledFor', '>', start - 4 * 60 * 60_000).get();
  const busy = new Set(upcoming.docs
    .filter((d) => d.id !== ignoreBookingId)
    .map((d) => d.data() as Booking)
    .filter((x) => x.partnerId && x.scheduledFor && ['assigned', 'arrived', 'in_progress'].includes(x.status))
    .filter((x) => x.scheduledFor! < end && x.scheduledFor! + x.durationMin * 60_000 > start)
    .map((x) => x.partnerId!));
  const partners = (await db.collection('partners').get()).docs.map((d) => ({ id: d.id, d: { ...(d.data() as PartnerDoc), onShift: true } }));
  const ranked = rank(partners, skillsFor(b.tasks), b.address.at, busy, 5000);
  return ranked.find((p) => p.id === b.preferredPartnerId) ?? ranked[0];
}

async function isAdmin(u: string) { return (await db.collection('admins').doc(u).get()).exists; }
async function requireAdmin(r: CallableRequest<unknown>) { const u = uid(r); if (!(await isAdmin(u))) throw new HttpsError('permission-denied', 'Admins only.'); return u; }

async function getBooking(id: string) {
  const s = await bookingRef(id).get();
  return must(s.exists ? (s.data() as Booking) : null, 'Booking not found.');
}

async function log(id: string, line: string) {
  await bookingRef(id).update({ dispatchLog: FieldValue.arrayUnion(line) });
}

/** Referral rewards are rupees off the next booking — there is no wallet to top up or withdraw. */
async function addReward(userId: string, amount: number, tx?: Transaction) {
  const uref = db.collection('users').doc(userId);
  if (tx) tx.update(uref, { rewards: FieldValue.increment(amount) });
  else await uref.update({ rewards: FieldValue.increment(amount) });
}

function rank(partners: { id: string; d: PartnerDoc }[], skills: string[], at: LatLng, excluded: Set<string>, radiusM: number) {
  return partners
    .filter((p) => p.d.onShift && skills.every((sk) => p.d.skills.includes(sk)) && !excluded.has(p.id))
    .map((p) => {
      const dist = distanceM(p.d.at, at);
      const score = (1 - Math.min(1, dist / 4000)) * 0.5 + p.d.reliability * 0.25 + (p.d.rating / 5) * 0.15 + 0.1;
      return { ...p, dist, score };
    })
    .filter((p) => p.dist <= radiusM)
    .sort((a, b) => b.score - a.score);
}

async function clearOffers(bookingId: string) {
  const snap = await db.collection('offers').where('bookingId', '==', bookingId).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/* ================================================================== */
/* payments                                                            */
/* ================================================================== */

type CreateOrderIn = {
  tasks: string[]; durationMin: number; addressId: string;
  scheduledFor: number | null; preferredPartnerId?: string; coupon?: string; useRewards?: boolean;
};

/** One price for the time booked; the tasks are what she does in it. Rewards and the first-booking coupon come off the top. */
export const createOrder = onCall<CreateOrderIn>(async (r) => {
  const u = uid(r);
  const i = r.data;
  const tasks = [...new Set(i.tasks ?? [])];
  if (tasks.length === 0) throw new HttpsError('invalid-argument', 'Pick at least one task.');
  tasks.forEach((t) => must(service(t), 'Unknown task.'));
  if (!DURATIONS.includes(i.durationMin)) throw new HttpsError('invalid-argument', 'That duration is not offered.');

  const user = must((await db.collection('users').doc(u).get()).data() as UserDoc | undefined, 'Profile missing.');
  const address = must(user.addresses.find((a) => a.id === i.addressId), 'Address not found.');
  if (distanceM(address.at, CITY) > SERVICE_RADIUS_M) throw new HttpsError('failed-precondition', 'We only serve Gurugram for now. Pick an address in the city.');

  // Experts work 8 AM to 7 PM: no instant visit outside those hours, and no slot that starts outside them.
  if (!isOpenAt(i.scheduledFor ?? Date.now())) {
    throw new HttpsError('failed-precondition', i.scheduledFor
      ? 'Pick a start time between 8 AM and 7 PM.'
      : 'Experts work from 8 AM to 7 PM. Schedule a visit for tomorrow morning instead.');
  }
  const mine = (await db.collection('bookings').where('customerId', '==', u).get()).docs.map((d) => ({ id: d.id, ...(d.data() as Booking) }));
  if (!i.scheduledFor && mine.some((b) => !b.scheduledFor && b.paid && LIVE_STATUSES.includes(b.status))) {
    throw new HttpsError('failed-precondition', 'You already have an expert booked right now. Track that visit, or schedule this one for later.');
  }
  if (i.scheduledFor) {
    const now = Date.now();
    if (i.scheduledFor < now + 30 * 60_000) throw new HttpsError('invalid-argument', 'That slot is too soon. Pick a time at least 30 minutes away.');
    if (i.scheduledFor > now + 7 * 24 * 60 * 60_000) throw new HttpsError('invalid-argument', 'You can book up to a week ahead.');
    const free = await reserveFor({ tasks, address, scheduledFor: i.scheduledFor, durationMin: i.durationMin, preferredPartnerId: i.preferredPartnerId });
    if (!free) throw new HttpsError('failed-precondition', 'No expert is free near you at that time. Pick another slot.');
  }

  const price = priceForMinutes(i.durationMin);
  // FIRST50 is for the first booking only: not after one is done, and not twice while the first is still open.
  const usedCouponBefore = mine.some((b) => b.paid && b.status !== 'cancelled' && b.discount - (b.rewardUsed ?? 0) > 0);
  const coupon = i.coupon?.toUpperCase() === FIRST_COUPON.code && !user.firstBookingDone && !usedCouponBefore ? FIRST_COUPON.amount : 0;
  const rewardUsed = i.useRewards === false ? 0 : Math.min(user.rewards ?? 0, Math.max(0, price - coupon));
  const discount = coupon + rewardUsed;
  const amountDue = Math.max(0, price + VISIT_FEE - discount);

  const ref = bookingRef(`B${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`);
  const base: Booking = {
    customerId: u, tasks, serviceSlug: tasks[0], durationMin: i.durationMin, addonSlugs: tasks.slice(1), address,
    price, fee: VISIT_FEE, discount, rewardUsed, amountDue,
    status: 'payment_pending', paid: false, razorpay: { orderId: '' },
    ...(i.preferredPartnerId ? { preferredPartnerId: i.preferredPartnerId } : {}),
    startCode: code4(), extraMin: 0, tip: 0,
    doneTasks: [], dispatchLog: [], createdAt: Date.now(), scheduledFor: i.scheduledFor ?? null,
  };

  if (amountDue <= 0) {
    // Fully covered by rewards: no Razorpay round-trip.
    await ref.set(base);
    await settlePaid(ref.id, base, null);
    return { bookingId: ref.id, orderId: '', amount: 0, currency: 'INR', keyId: RAZORPAY_KEY_ID, rewardUsed };
  }

  if (!razorpayConfigured) throw new HttpsError('failed-precondition', 'Razorpay keys are not set on the server.');
  const order = await rzpOrder(amountDue * 100, ref.id, { bookingId: ref.id, uid: u });
  await ref.set({ ...base, razorpay: { orderId: order.id } });
  return { bookingId: ref.id, orderId: order.id, amount: Number(order.amount), currency: 'INR', keyId: RAZORPAY_KEY_ID, rewardUsed };
});

/** After a verified payment: spend the reward part, then either reserve a partner (scheduled) or start matching. */
async function settlePaid(id: string, b: Booking, paymentId: string | null) {
  const first = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(bookingRef(id))).data() as Booking;
    if (cur.paid) return false;
    if (b.rewardUsed > 0) await addReward(b.customerId, -b.rewardUsed, tx);
    tx.update(bookingRef(id), {
      paid: true, paidAt: Date.now(), paymentError: FieldValue.delete(),
      ...(paymentId ? { 'razorpay.paymentId': paymentId } : {}),
      dispatchLog: FieldValue.arrayUnion(paymentId ? 'Payment received' : 'Covered by rewards'),
    });
    return true;
  });
  if (!first) return;
  if (b.scheduledFor) {
    const pick = await reserveFor(b, id);
    // Work back from the slot: she sets off early enough to ride over and hand over before the start time.
    const eta = pick ? travelEstimate(pick.d.at, b.address.at) : null;
    const leaveAt = eta ? b.scheduledFor - (eta.minutes + HANDOVER_MIN + 5) * 60_000 : undefined;
    await bookingRef(id).update({
      status: 'assigned', ...(pick ? { partnerId: pick.id } : {}), assignedAt: b.scheduledFor,
      ...(eta && leaveAt ? { leaveAt, eta: { ...eta, from: leaveAt, arriveBy: leaveAt + eta.minutes * 60_000, startBy: b.scheduledFor } } : {}),
      dispatchLog: FieldValue.arrayUnion(pick ? `Reserved ${pick.d.name} for the scheduled slot` : 'No expert free for the slot yet — ops must assign one'),
    });
  } else {
    await bookingRef(id).update({ status: 'matching' });
  }
}

/** What the customer reads when a payment can't be confirmed. */
function payFailed(e: unknown) {
  if (e instanceof NotPaidError) return new HttpsError('failed-precondition', 'The payment did not go through. Nothing was charged — please try again.');
  return new HttpsError('invalid-argument', 'We could not confirm this payment. If money was taken, it comes back in 5–7 working days.');
}

export const verifyPayment = onCall<{ bookingId: string; paymentId: string; orderId: string; signature: string }>(async (r) => {
  const u = uid(r);
  const { bookingId, paymentId, orderId, signature } = r.data;
  const b = await getBooking(bookingId);
  if (b.customerId !== u) throw new HttpsError('permission-denied', 'Not your booking.');
  if (b.paid) return { ok: true as const };
  if (b.razorpay.orderId !== orderId) throw new HttpsError('invalid-argument', 'This payment is for a different order.');
  let paid;
  try {
    paid = await confirmPayment(orderId, paymentId, signature, b.amountDue * 100);
  } catch (e) {
    await bookingRef(bookingId).update({ paymentError: (e as Error).message });
    throw payFailed(e);
  }
  await settleBookingPayment(bookingId, paid.paymentId);
  return { ok: true as const };
});

/**
 * One place that turns a confirmed payment into a live booking. The app and the webhook can both get here
 * (the app may close mid-payment), so it only acts once. A payment that lands on a booking that already
 * timed out is refunded.
 */
async function settleBookingPayment(id: string, paymentId: string) {
  const snap = await bookingRef(id).get();
  const b = snap.data() as Booking | undefined;
  if (!b || b.paid) return;
  if (b.status === 'cancelled') {
    const rid = await issueRefund(id, paymentId, b.amountDue * 100, 'paid after the booking expired', false);
    await bookingRef(id).update({ 'razorpay.paymentId': paymentId, 'razorpay.refundId': rid, dispatchLog: FieldValue.arrayUnion(rid === 'queued' ? 'Late payment — refund queued' : 'Late payment refunded') });
    return;
  }
  await settlePaid(id, b, paymentId);
}

export const createBalanceOrder = onCall<{ bookingId: string; tip: number }>(async (r) => {
  const u = uid(r);
  const b = await getBooking(r.data.bookingId);
  if (b.customerId !== u) throw new HttpsError('permission-denied', 'Not your booking.');
  const tip = Math.max(0, Math.round(r.data.tip || 0));
  // Extra time bought during the visit is already paid; only time that was never paid for is left.
  const prepaidMin = (b.extensions ?? []).reduce((n, x) => n + x.minutes, 0);
  const amount = Math.max(0, b.extraMin - prepaidMin) * OVERTIME_PER_MIN + tip;
  if (amount <= 0) {
    await bookingRef(r.data.bookingId).update({ tip, balance: FieldValue.delete() });
    return { bookingId: r.data.bookingId, orderId: '', amount: 0, currency: 'INR', keyId: RAZORPAY_KEY_ID, rewardUsed: 0 };
  }
  if (!razorpayConfigured) throw new HttpsError('failed-precondition', 'Razorpay keys are not set on the server.');
  const order = await rzpOrder(amount * 100, `${r.data.bookingId}-bal`, { bookingId: r.data.bookingId, uid: u, kind: 'balance' });
  await bookingRef(r.data.bookingId).update({ balance: { orderId: order.id, amount, paid: false, tip } });
  return { bookingId: r.data.bookingId, orderId: order.id, amount: Number(order.amount), currency: 'INR', keyId: RAZORPAY_KEY_ID, rewardUsed: 0 };
});

export const verifyBalancePayment = onCall<{ bookingId: string; paymentId: string; orderId: string; signature: string }>(async (r) => {
  const u = uid(r);
  const b = await getBooking(r.data.bookingId);
  if (b.customerId !== u) throw new HttpsError('permission-denied', 'Not your booking.');
  if (!b.balance || b.balance.orderId !== r.data.orderId) throw new HttpsError('invalid-argument', 'This payment is for a different order.');
  if (b.balance.paid) return { ok: true as const };
  let paid;
  try { paid = await confirmPayment(r.data.orderId, r.data.paymentId, r.data.signature, b.balance.amount * 100); }
  catch (e) { throw payFailed(e); }
  await bookingRef(r.data.bookingId).update({ 'balance.paid': true, 'balance.paymentId': paid.paymentId, tip: b.balance.tip });
  return { ok: true as const };
});

/**
 * Razorpay → us. Backs up the app: if the phone closed before it could confirm a payment, this still turns it
 * into a booking (or extra time). Set it up in Razorpay → Webhooks with payment.captured and payment.failed.
 */
export const razorpayWebhook = onRequest({ cors: false }, async (req, res) => {
  const raw = req.rawBody?.toString('utf8') ?? '';
  if (!verifyWebhook(raw, String(req.headers['x-razorpay-signature'] ?? ''))) { res.status(400).send('bad signature'); return; }
  const ev = JSON.parse(raw || '{}') as { event?: string; payload?: { payment?: { entity?: { id: string; order_id: string; amount: number; notes?: Record<string, string>; error_description?: string } } } };
  const pay = ev.payload?.payment?.entity;
  const bookingId = pay?.notes?.bookingId;
  if (!pay || !bookingId) { res.status(200).send('ignored'); return; }
  try {
    const b = await getBooking(bookingId);
    if (ev.event === 'payment.captured') {
      if (pay.notes?.kind === 'extension') {
        const minutes = Number(pay.notes.minutes);
        await applyExtension(bookingId, pay.order_id, pay.id, minutes, pay.amount / 100).catch(() => undefined);
      } else if (pay.notes?.kind === 'balance') {
        if (b.balance?.orderId === pay.order_id && !b.balance.paid) await bookingRef(bookingId).update({ 'balance.paid': true, 'balance.paymentId': pay.id, tip: b.balance.tip ?? 0 });
      } else if (b.razorpay.orderId === pay.order_id) {
        await settleBookingPayment(bookingId, pay.id);
      }
    } else if (ev.event === 'payment.failed') {
      await bookingRef(bookingId).update({ paymentError: pay.error_description ?? 'Payment failed' });
    }
    res.status(200).send('ok');
  } catch (e) {
    res.status(500).send((e as Error).message);
  }
});

/* ================================================================== */
/* dispatch — stage 1 direct, stage 2 broadcast, bots accept alone    */
/* ================================================================== */

export const onBookingWritten = onDocumentWritten({ document: 'bookings/{id}', timeoutSeconds: 540 }, async (ev) => {
  const before = ev.data?.before.data() as Booking | undefined;
  const after = ev.data?.after.data() as Booking | undefined;
  if (!after) return;
  const id = ev.params.id;

  if (after.status === 'matching' && before?.status !== 'matching') await runDispatch(id);
  if (after.status === 'assigned' && before?.status !== 'assigned' && after.partnerId) await maybeSimulateRide(id);
  if (after.status === 'in_progress' && before?.status !== 'in_progress' && after.partnerId) await maybeSimulateWork(id);
  if (after.status === 'completed' && before?.status !== 'completed') await onCompleted({ ...after, id } as Booking);
});

async function runDispatch(id: string) {
  const start = Date.now();
  const excluded = new Set<string>();
  let stage: 1 | 2 = 1;
  let radiusIdx = 0;

  while (Date.now() - start < GIVE_UP_MS) {
    const b = await getBooking(id);
    if (b.status !== 'matching') return;
    const partners = (await db.collection('partners').get()).docs.map((d) => ({ id: d.id, d: d.data() as PartnerDoc }));
    const radius = RADII_M[Math.min(radiusIdx, RADII_M.length - 1)];
    const ranked = rank(partners, skillsFor(b.tasks), b.address.at, excluded, stage === 1 ? RADII_M[RADII_M.length - 1] : radius);

    if (ranked.length === 0) {
      if (stage === 2 && radiusIdx < RADII_M.length - 1) { radiusIdx++; continue; }
      break;
    }

    // Preferred expert goes first if she is free.
    const targets = stage === 1
      ? [ranked.find((p) => p.id === b.preferredPartnerId) ?? ranked[0]]
      : ranked;
    const windowMs = stage === 1 ? STAGE1_MS : STAGE2_MS;
    const expiresAt = Date.now() + windowMs;

    const batch = db.batch();
    targets.forEach((t) => batch.set(db.collection('offers').doc(offerId(id, t.id)),
      { bookingId: id, partnerId: t.id, stage, expiresAt, createdAt: Date.now() }));
    await batch.commit();
    await log(id, stage === 1
      ? `Sent to ${targets[0].d.name} — nearest on shift, ${(targets[0].dist / 1000).toFixed(1)} km`
      : `Sent to ${targets.length} expert${targets.length > 1 ? 's' : ''} within ${radius / 1000} km — first to accept wins`);

    // Demo experts answer for themselves so one person can test the whole flow.
    const bot = targets.find((t) => t.d.bot);
    if (bot) {
      await sleep(3000);
      try { await acceptInternal(id, bot.id, stage); } catch { /* a human beat the bot to it */ }
    }

    // Wait for someone to accept.
    while (Date.now() < expiresAt) {
      await sleep(1500);
      const now = (await bookingRef(id).get()).data() as Booking;
      if (now.status !== 'matching') { await clearOffers(id); return; }
    }

    await clearOffers(id);
    targets.forEach((t) => excluded.add(t.id));
    await log(id, stage === 1 ? `${targets[0].d.name} did not answer in time` : 'Nobody accepted — widening the search');
    if (stage === 1) stage = 2; else radiusIdx++;
  }

  // Give up: release the money, tell the customer, tell ops.
  const b = await getBooking(id);
  if (b.status !== 'matching') return;
  await clearOffers(id);
  await refundBooking(id, b, b.amountDue, 'No expert found');
  await bookingRef(id).update({ status: 'no_match', dispatchLog: FieldValue.arrayUnion('No expert found within 3 km — hold released') });
}

async function acceptInternal(bookingId: string, partnerId: string, stage: 1 | 2) {
  const partner = (await db.collection('partners').doc(partnerId).get()).data() as PartnerDoc | undefined;
  await db.runTransaction(async (tx) => {
    const s = await tx.get(bookingRef(bookingId));
    const b = s.data() as Booking;
    if (b.status !== 'matching') throw new HttpsError('failed-precondition', 'This job was already taken.');
    const now = Date.now();
    const est = partner?.at ? travelEstimate(partner.at, b.address.at) : null;
    tx.update(bookingRef(bookingId), {
      status: 'assigned', partnerId, assignedAt: now,
      ...(partner?.at ? { partnerAt: partner.at } : {}),
      ...(est ? { eta: { ...est, from: now, arriveBy: now + est.minutes * 60_000, startBy: now + (est.minutes + HANDOVER_MIN) * 60_000 } } : {}),
      dispatchLog: FieldValue.arrayUnion(`${partner?.name ?? 'Expert'} accepted (stage ${stage})`),
    });
  });
  await clearOffers(bookingId);
}

export const acceptOffer = onCall<{ bookingId: string }>(async (r) => {
  const u = uid(r);
  const o = await db.collection('offers').doc(offerId(r.data.bookingId, u)).get();
  if (!o.exists) throw new HttpsError('failed-precondition', 'That offer is no longer open.');
  await acceptInternal(r.data.bookingId, u, (o.data() as { stage: 1 | 2 }).stage);
  return { ok: true as const };
});

export const declineOffer = onCall<{ bookingId: string; reason?: string }>(async (r) => {
  const u = uid(r);
  const p = (await db.collection('partners').doc(u).get()).data() as PartnerDoc | undefined;
  await db.collection('offers').doc(offerId(r.data.bookingId, u)).delete();
  await log(r.data.bookingId, `${p?.name ?? 'Expert'} declined${r.data.reason ? ` (${r.data.reason})` : ''} — widening the search`);
  return { ok: true as const };
});

/** Demo experts ride to the door on their own; a real partner's phone reports her position. */
async function maybeSimulateRide(id: string) {
  const b = await getBooking(id);
  const p = (await db.collection('partners').doc(b.partnerId!).get()).data() as PartnerDoc | undefined;
  if (!p?.bot || b.scheduledFor) return;
  const from = p.at, to = b.address.at;
  const total = distanceM(from, to);
  const rideMs = Math.min(60_000, etaMinutes(total) * 60_000 * 0.25);
  const t0 = Date.now();
  while (Date.now() - t0 < rideMs) {
    await sleep(2000);
    const now = (await bookingRef(id).get()).data() as Booking;
    if (now.status !== 'assigned') return;
    await bookingRef(id).update({ partnerAt: along(from, to, (Date.now() - t0) / rideMs) });
  }
  await bookingRef(id).update({ status: 'arrived', arrivedAt: Date.now(), partnerAt: to });
  // Nobody is holding the demo customer's phone to read out the start code, so a bot starts that job herself.
  if (b.customerId === 'demo-customer') {
    await sleep(3000);
    await startSession(id, (await bookingRef(id).get()).data() as Booking, true);
  }
}

/** Demo experts also do the work: tick the checklist over the (shortened) job and finish on time. */
async function maybeSimulateWork(id: string) {
  const b = await getBooking(id);
  const p = (await db.collection('partners').doc(b.partnerId!).get()).data() as PartnerDoc | undefined;
  if (!p?.bot) return;
  const lines = b.tasks.flatMap((t) => service(t)?.includes ?? []);
  while (true) {
    await sleep(4000);
    const now = (await bookingRef(id).get()).data() as Booking;
    if (now.status !== 'in_progress') return;
    const end = now.endsAt ?? now.autoCompleteAt ?? Date.now();
    const start = now.startedAt ?? Date.now();
    const frac = Math.min(1, (Date.now() - start) / Math.max(1, end - start));
    const shouldBeDone = lines.slice(0, Math.floor(frac * lines.length));
    if (shouldBeDone.length > now.doneTasks.length) await bookingRef(id).update({ doneTasks: shouldBeDone });
    if (Date.now() >= end) {
      await bookingRef(id).update({ status: 'completed', endedAt: Date.now(), workedMin: Math.max(1, Math.round((Date.now() - start) / 60_000)), doneTasks: lines });
      return;
    }
  }
}

/* ================================================================== */
/* job lifecycle                                                       */
/* ================================================================== */

/** The assigned partner may act; the customer may act too when the partner is a demo bot; admins always. */
async function partyCheck(b: Booking, u: string, allowCustomerForBots: boolean) {
  const p = b.partnerId ? ((await db.collection('partners').doc(b.partnerId).get()).data() as PartnerDoc | undefined) : undefined;
  const isPartner = b.partnerId === u;
  const customerOk = allowCustomerForBots && b.customerId === u && Boolean(p?.bot);
  if (!isPartner && !customerOk && !(await isAdmin(u))) throw new HttpsError('permission-denied', 'Not allowed.');
  return p;
}

export const markArrived = onCall<{ bookingId: string }>(async (r) => {
  const u = uid(r); const b = await getBooking(r.data.bookingId);
  await partyCheck(b, u, false);
  if (b.status === 'assigned') await bookingRef(r.data.bookingId).update({ status: 'arrived', arrivedAt: Date.now(), partnerAt: b.address.at });
  return { ok: true as const };
});

export const startJob = onCall<{ bookingId: string; code: string }>(async (r) => {
  const u = uid(r); const b = await getBooking(r.data.bookingId);
  const p = await partyCheck(b, u, true);
  if (b.status !== 'arrived') throw new HttpsError('failed-precondition', 'Not at the door yet.');
  if (b.startCode !== String(r.data.code)) return { ok: false };
  await startSession(r.data.bookingId, b, Boolean(p?.bot));
  return { ok: true };
});

/** The clock starts the moment the start code is accepted; `endsAt` is the end of the paid time. */
async function startSession(id: string, b: Booking, bot: boolean) {
  const startedAt = Date.now();
  const unit = bot ? BOT_MS_PER_MIN : 60_000;
  const endsAt = startedAt + (bot ? 90_000 : (b.durationMin + b.extraMin) * unit);
  await bookingRef(id).update({
    status: 'in_progress', startedAt, endsAt,
    autoCompleteAt: bot ? endsAt : endsAt + GRACE_MS,
    dispatchLog: FieldValue.arrayUnion('Session started'),
  });
}

export const toggleTask = onCall<{ bookingId: string; task: string }>(async (r) => {
  const u = uid(r); const b = await getBooking(r.data.bookingId);
  await partyCheck(b, u, false);
  const done = b.doneTasks.includes(r.data.task) ? FieldValue.arrayRemove(r.data.task) : FieldValue.arrayUnion(r.data.task);
  await bookingRef(r.data.bookingId).update({ doneTasks: done });
  return { ok: true as const };
});

/** Older app versions added time to pay later; extra time is now bought up front. */
export const addTime = onCall<{ bookingId: string; minutes: number }>(async () => {
  throw new HttpsError('failed-precondition', 'Update the app to add time — extra time is now paid when you add it.');
});

/** Step 1 of extending a running visit: a Razorpay order for the extra minutes. */
export const createExtensionOrder = onCall<{ bookingId: string; minutes: number }>(async (r) => {
  const u = uid(r); const b = await getBooking(r.data.bookingId);
  if (b.customerId !== u) throw new HttpsError('permission-denied', 'Not your booking.');
  if (b.status !== 'in_progress') throw new HttpsError('failed-precondition', 'The visit is not running, so there is nothing to extend.');
  const minutes = Math.round(r.data.minutes);
  if (!EXTENSION_OPTIONS.includes(minutes)) throw new HttpsError('invalid-argument', 'Pick 15, 30 or 60 minutes.');
  if (b.extraMin + minutes > MAX_EXTRA_MIN) throw new HttpsError('failed-precondition', `A visit can be extended by up to ${MAX_EXTRA_MIN / 60} hours. Book a new visit for more.`);
  if (b.endsAt && b.endsAt + GRACE_MS < Date.now()) throw new HttpsError('failed-precondition', 'This visit has already ended.');
  if (!razorpayConfigured) throw new HttpsError('failed-precondition', 'Razorpay keys are not set on the server.');
  const amount = minutes * OVERTIME_PER_MIN;
  const order = await rzpOrder(amount * 100, `${r.data.bookingId}-x${(b.extensions?.length ?? 0) + 1}`, { bookingId: r.data.bookingId, uid: u, kind: 'extension', minutes: String(minutes) });
  await bookingRef(r.data.bookingId).update({ pendingExtension: { orderId: order.id, minutes, amount } });
  return { bookingId: r.data.bookingId, orderId: order.id, amount: Number(order.amount), currency: 'INR', keyId: RAZORPAY_KEY_ID, rewardUsed: 0, minutes };
});

/** Step 2: the customer paid; add the minutes and move the end of the session. */
export const verifyExtension = onCall<{ bookingId: string; paymentId: string; orderId: string; signature: string }>(async (r) => {
  const u = uid(r); const b = await getBooking(r.data.bookingId);
  if (b.customerId !== u) throw new HttpsError('permission-denied', 'Not your booking.');
  const pend = b.pendingExtension;
  if (b.extensions?.some((x) => x.orderId === r.data.orderId)) return { ok: true as const, minutes: 0 };
  if (!pend || pend.orderId !== r.data.orderId) throw new HttpsError('invalid-argument', 'This payment is for a different order.');
  let paid;
  try { paid = await confirmPayment(r.data.orderId, r.data.paymentId, r.data.signature, pend.amount * 100); }
  catch (e) { throw payFailed(e); }
  const added = await applyExtension(r.data.bookingId, r.data.orderId, paid.paymentId, pend.minutes, pend.amount);
  return { ok: true as const, minutes: added };
});

/**
 * Adds paid minutes once per order (app and webhook may both call). If the visit ended while the customer
 * was paying, the money goes straight back.
 */
async function applyExtension(id: string, orderId: string, paymentId: string, minutes: number, amount: number) {
  const p = await db.runTransaction(async (tx) => {
    const b = (await tx.get(bookingRef(id))).data() as Booking;
    if (b.extensions?.some((x) => x.orderId === orderId)) return { added: 0, refund: false };
    if (b.status !== 'in_progress') return { added: 0, refund: true };
    const partner = b.partnerId ? ((await tx.get(db.collection('partners').doc(b.partnerId))).data() as PartnerDoc | undefined) : undefined;
    const unit = partner?.bot ? BOT_MS_PER_MIN : 60_000;
    const base = Math.max(b.endsAt ?? Date.now(), Date.now() - (partner?.bot ? 0 : GRACE_MS));
    const endsAt = base + minutes * unit;
    const ext: Extension = { minutes, amount, orderId, paymentId, at: Date.now() };
    tx.update(bookingRef(id), {
      extraMin: FieldValue.increment(minutes), endsAt, autoCompleteAt: partner?.bot ? endsAt : endsAt + GRACE_MS,
      extensions: FieldValue.arrayUnion(ext), pendingExtension: FieldValue.delete(),
      dispatchLog: FieldValue.arrayUnion(`Customer added ${minutes} min (paid)`),
    });
    return { added: minutes, refund: false };
  });
  if (p.refund) {
    await issueRefund(id, paymentId, amount * 100, 'visit ended before the extension', false);
    throw new HttpsError('failed-precondition', 'The visit ended before the payment went through, so we have refunded it.');
  }
  return p.added;
}

export const finishJob = onCall<{ bookingId: string; flags?: string[] }>(async (r) => {
  const u = uid(r); const b = await getBooking(r.data.bookingId);
  await partyCheck(b, u, true);
  if (b.status !== 'in_progress') throw new HttpsError('failed-precondition', 'The job is not running.');
  const flags = (r.data.flags ?? []).filter((f) => typeof f === 'string').slice(0, 6);
  const endedAt = Date.now();
  await bookingRef(r.data.bookingId).update({
    status: 'completed', endedAt, workedMin: b.startedAt ? Math.round((endedAt - b.startedAt) / 60_000) : 0,
    ...(flags.length ? { partnerFlags: flags } : {}),
  });
  return { ok: true as const };
});

export const rateJob = onCall<{ bookingId: string; rating: number; tags: string[] }>(async (r) => {
  const u = uid(r); const b = await getBooking(r.data.bookingId);
  if (b.customerId !== u) throw new HttpsError('permission-denied', 'Not your booking.');
  const rating = Math.max(1, Math.min(5, Math.round(r.data.rating)));
  await bookingRef(r.data.bookingId).update({ rating, ratingTags: (r.data.tags ?? []).slice(0, 8) });
  // A low rating goes to the ops console as a problem report, so someone calls the customer back.
  if (rating <= 2) {
    await holdEarning(r.data.bookingId, `Customer rated ${rating}★`);
    await db.collection('feedback').add({
      userId: u, kind: 'problem', bookingId: r.data.bookingId, at: Date.now(), auto: true,
      text: `Rated ${rating}★${(r.data.tags ?? []).length ? ` · ${(r.data.tags ?? []).slice(0, 8).join(', ')}` : ''}. Our team will call you back.`,
    });
  }
  if (b.partnerId) {
    const pref = db.collection('partners').doc(b.partnerId);
    await db.runTransaction(async (tx) => {
      const p = (await tx.get(pref)).data() as PartnerDoc;
      const n = Math.max(1, p.jobs);
      tx.update(pref, { rating: Math.round(((p.rating * (n - 1) + rating) / n) * 10) / 10 });
    });
  }
  return { ok: true as const };
});

/* ================================================================== */
/* expert payouts — Razorpay Route                                     */
/* ================================================================== */

const bookingIdOf = (b: Booking) => (b as Booking & { id: string }).id;

/** What the expert earns for a visit: her share of the booked time and every extra minute, plus any tip. */
function expertPay(b: Booking) {
  const jobPay = Math.round(b.price * PARTNER_SHARE);
  const extraPay = Math.round(b.extraMin * OVERTIME_PER_MIN * PARTNER_SHARE);
  return { jobPay, extraPay, tip: b.tip ?? 0, total: jobPay + extraPay + (b.tip ?? 0) };
}

/**
 * Sends the expert's share to her Razorpay linked account. The money comes out of the customer's own
 * payments first (booking, then extra time, then any balance), and Sahayak tops up the rest when a coupon
 * or rewards made the customer pay less. Each transfer is held for a day before it settles to her bank.
 * Safe to call again: it only sends what has not been sent yet.
 */
async function payExpert(bookingId: string) {
  const b = await getBooking(bookingId);
  if (!b.partnerId || b.status !== 'completed') return;
  const eref = db.collection('earnings').doc(bookingId);
  const prev = (await eref.get()).data() as Earning | undefined;
  if (prev && (prev.status === 'sent' || prev.status === 'on_hold')) return;
  const pay = expertPay(b);
  const partner = (await db.collection('partners').doc(b.partnerId).get()).data() as PartnerDoc | undefined;
  const account = partner?.payout?.accountId;
  const base: Earning = {
    partnerId: b.partnerId, bookingId, ...pay, status: 'awaiting_account', transfers: prev?.transfers ?? [],
    createdAt: prev?.createdAt ?? Date.now(), updatedAt: Date.now(),
  };
  if (!account) { await eref.set(base); return; }

  const sources: { paymentId: string; paise: number }[] = [];
  if (b.razorpay.paymentId && b.amountDue > 0 && !b.razorpay.refundId) sources.push({ paymentId: b.razorpay.paymentId, paise: b.amountDue * 100 });
  (b.extensions ?? []).forEach((x) => sources.push({ paymentId: x.paymentId, paise: x.amount * 100 }));
  if (b.balance?.paid && b.balance.paymentId) sources.push({ paymentId: b.balance.paymentId, paise: b.balance.amount * 100 });

  const holdUntil = Math.floor(Date.now() / 1000) + PAYOUT_HOLD_S;
  const notes = { bookingId, partnerId: b.partnerId, purpose: 'Sahayak visit payout' };
  const already = base.transfers.reduce((n, t) => n + t.amount, 0) * 100;
  let left = pay.total * 100 - already;
  const transfers = [...base.transfers];
  try {
    for (const s of sources) {
      if (left < 100) break;
      const used = transfers.filter((t) => t.source === s.paymentId).reduce((n, t) => n + t.amount * 100, 0);
      const take = Math.min(left, s.paise - used);
      if (take < 100) continue;
      const t = await transferFromPayment(s.paymentId, account, take, notes, holdUntil);
      transfers.push({ id: t.id, amount: t.amountPaise / 100, source: s.paymentId });
      left -= t.amountPaise;
    }
    if (left >= 100) {
      const t = await directTransfer(account, left, notes);
      transfers.push({ id: t.id, amount: t.amountPaise / 100, source: 'balance' });
      left = 0;
    }
    await eref.set({ ...base, status: 'sent', transfers, releaseAt: holdUntil * 1000, updatedAt: Date.now() });
    await log(bookingId, `Payout of ₹${pay.total} sent to ${partner?.name ?? 'the expert'}`);
  } catch (e) {
    await eref.set({ ...base, status: 'failed', transfers, error: (e as Error).message, updatedAt: Date.now() });
  }
}

/** A complaint keeps the expert's money from settling until ops has looked at it. */
async function holdEarning(bookingId: string, reason: string) {
  const eref = db.collection('earnings').doc(bookingId);
  const e = (await eref.get()).data() as Earning | undefined;
  if (!e || e.status !== 'sent') return;
  for (const t of e.transfers) await setTransferHold(t.id, true).catch(() => undefined);
  await eref.update({ status: 'on_hold', error: reason, updatedAt: Date.now() });
}

/** A first completed booking (or first finished job) is what unlocks a referral reward. */
async function onCompleted(b: Booking) {
  const uref = db.collection('users').doc(b.customerId);
  const user = (await uref.get()).data() as UserDoc | undefined;
  if (b.partnerId) await db.collection('partners').doc(b.partnerId).update({ jobs: FieldValue.increment(1) });
  if (b.partnerId) await payExpert(bookingIdOf(b)).catch((e) => log(bookingIdOf(b), `Payout error: ${(e as Error).message}`));

  if (user && !user.firstBookingDone) {
    await uref.update({ firstBookingDone: true });
    if (user.referredBy) {
      const refUser = await db.collection('users').where('referralCode', '==', user.referredBy).limit(1).get();
      if (!refUser.empty) {
        const referrer = refUser.docs[0];
        await addReward(referrer.id, REFERRAL_REWARD);
        // The link carried the code, so this is the first we hear of the friend: record it now.
        await db.collection('referrals').add({
          referrerId: referrer.id, refereeId: b.customerId, side: 'customer', name: user.name, phone: user.phone,
          status: 'joined', invitedAt: Date.now(), joinedAt: Date.now(), reward: REFERRAL_REWARD,
        });
      }
    }
  }

  if (b.partnerId) {
    const pref = db.collection('partners').doc(b.partnerId);
    const p = (await pref.get()).data() as PartnerDoc | undefined;
    if (p && !p.firstJobDone) {
      await pref.update({ firstJobDone: true });
      if (p.referredBy) {
        const refUser = await db.collection('users').where('referralCode', '==', p.referredBy).limit(1).get();
        if (!refUser.empty) await db.collection('partners').doc(refUser.docs[0].id).update({ referralEarned: FieldValue.increment(REFERRAL_REWARD) });
      }
    }
  }
}

/* ================================================================== */
/* cancellations and refunds                                           */
/* ================================================================== */

/**
 * Sends money back. Razorpay pays refunds out of Sahayak's balance, so one can fail (say the day's collections
 * don't cover it yet). A failure must never block the customer's cancel or lose her money: it goes into
 * `refundQueue` and the minute tick keeps retrying until Razorpay takes it.
 */
async function issueRefund(bookingId: string, paymentId: string, paise: number, reason: string, onBooking: boolean): Promise<string> {
  try {
    const rf = await rzpRefund(paymentId, paise, { bookingId, reason });
    return rf.id;
  } catch (e) {
    const msg = rzpErrorText(e);
    logger.error('Refund failed, queued for retry', { bookingId, paymentId, paise, msg });
    await db.collection('refundQueue').add({ bookingId, paymentId, paise, reason, onBooking, tries: 1, lastError: msg, createdAt: Date.now(), nextAt: Date.now() + 10 * 60_000 });
    await bookingRef(bookingId).update({ dispatchLog: FieldValue.arrayUnion(`Refund of ${'\u20B9'}${paise / 100} queued: ${msg}`) });
    return 'queued';
  }
}

const rzpErrorText = (e: unknown) => {
  const x = e as { error?: { description?: string }; message?: string };
  return x?.error?.description ?? x?.message ?? 'unknown error';
};

/** Retries queued refunds, waiting longer after each failure (10 min, 20, 40 … up to 6 h). */
async function retryRefunds(now: number) {
  const due = await db.collection('refundQueue').where('nextAt', '<=', now).limit(20).get();
  for (const d of due.docs) {
    const q = d.data() as { bookingId: string; paymentId: string; paise: number; reason: string; onBooking: boolean; tries: number };
    try {
      const rf = await rzpRefund(q.paymentId, q.paise, { bookingId: q.bookingId, reason: q.reason });
      if (q.onBooking) await bookingRef(q.bookingId).update({ 'razorpay.refundId': rf.id });
      await bookingRef(q.bookingId).update({ dispatchLog: FieldValue.arrayUnion(`Refund of ${'\u20B9'}${q.paise / 100} sent after retry`) });
      await d.ref.delete();
    } catch (e) {
      const tries = q.tries + 1;
      await d.ref.update({ tries, lastError: rzpErrorText(e), nextAt: now + Math.min(6 * 60, 10 * 2 ** (tries - 1)) * 60_000 });
    }
  }
}

async function refundBooking(id: string, b: Booking, rupees: number, reason: string) {
  if (b.rewardUsed > 0) await addReward(b.customerId, b.rewardUsed);
  if (rupees > 0 && b.razorpay.paymentId && razorpayConfigured) {
    const rid = await issueRefund(id, b.razorpay.paymentId, rupees * 100, reason, true);
    await bookingRef(id).update({ 'razorpay.refundId': rid });
  }
}

export const cancelBooking = onCall<{ bookingId: string; expectFee?: number }>(async (r) => {
  const u = uid(r); const b = await getBooking(r.data.bookingId);
  if (b.customerId !== u) throw new HttpsError('permission-denied', 'Not your booking.');
  if (['completed', 'cancelled', 'in_progress'].includes(b.status)) throw new HttpsError('failed-precondition', 'Too late to cancel.');
  // A scheduled visit is free to cancel until 2 hours before the slot; after that, or once she is riding, the late fee applies.
  const upcoming = Boolean(b.scheduledFor && b.scheduledFor - Date.now() > 2 * 60 * 60_000);
  // A 2-minute grace after an expert accepts, so a change of mind right after booking stays free.
  const graceOver = !b.assignedAt || Date.now() - b.assignedAt > 2 * 60_000;
  const late = b.scheduledFor
    ? !upcoming && (b.status === 'assigned' || b.status === 'arrived')
    : (b.status === 'assigned' && graceOver) || b.status === 'arrived';
  const fee = late ? Math.min(LATE_CANCEL_FEE, b.amountDue) : 0;
  // The app shows the fee on the button. If an expert accepted in the meantime, do not charge a fee she never saw.
  if (typeof r.data.expectFee === 'number' && fee > r.data.expectFee) {
    throw new HttpsError('failed-precondition', `An expert just accepted your booking and is on her way. Cancelling now costs ${'\u20B9'}${fee}.`);
  }
  const refunded = b.paid ? b.amountDue - fee : 0;
  await clearOffers(r.data.bookingId);
  if (b.paid) await refundBooking(r.data.bookingId, b, refunded, late ? 'cancelled after assignment' : 'cancelled');
  await bookingRef(r.data.bookingId).update({ status: 'cancelled', cancelFee: fee, dispatchLog: FieldValue.arrayUnion('Cancelled by customer') });
  return { refunded, fee };
});

export const retryMatching = onCall<{ bookingId: string }>(async (r) => {
  const u = uid(r); const b = await getBooking(r.data.bookingId);
  if (b.customerId !== u) throw new HttpsError('permission-denied', 'Not your booking.');
  if (b.status !== 'no_match') throw new HttpsError('failed-precondition', 'Nothing to retry.');
  // The earlier hold was released, so a retry needs a fresh payment.
  if (!razorpayConfigured) throw new HttpsError('failed-precondition', 'Razorpay keys are not set on the server.');
  const order = await rzpOrder(b.amountDue * 100, `${r.data.bookingId}-retry`, { bookingId: r.data.bookingId, uid: u });
  await bookingRef(r.data.bookingId).update({ status: 'payment_pending', paid: false, razorpay: { orderId: order.id }, dispatchLog: ['Searching again'] });
  return { ok: true as const };
});

/* ================================================================== */
/* housekeeping                                                        */
/* ================================================================== */

export const tick = onSchedule('every 1 minutes', async () => {
  const now = Date.now();
  const running = await db.collection('bookings').where('status', '==', 'in_progress').get();
  for (const d of running.docs) {
    const b = d.data() as Booking;
    if (b.autoCompleteAt && b.autoCompleteAt <= now) {
      // Paid time plus the grace period ran out with nobody finishing: close it, counting only the paid time as worked.
      const endedAt = Math.min(now, b.endsAt ?? now);
      await d.ref.update({ status: 'completed', endedAt, workedMin: b.startedAt ? Math.round((endedAt - b.startedAt) / 60_000) : 0, doneTasks: b.tasks.flatMap((t) => service(t)?.includes ?? []) });
    }
  }
  const stale = await db.collection('bookings').where('status', '==', 'payment_pending').where('createdAt', '<', now - 30 * 60_000).get();
  for (const d of stale.docs) await d.ref.update({ status: 'cancelled', dispatchLog: FieldValue.arrayUnion('Payment not completed') });
  await retryRefunds(now);
  const dead = await db.collection('offers').where('expiresAt', '<', now - 60_000).get();
  const batch = db.batch(); dead.docs.forEach((d) => batch.delete(d.ref)); await batch.commit();
});

/* ================================================================== */
/* admin                                                               */
/* ================================================================== */

export const adminForceAssign = onCall<{ bookingId: string; partnerId?: string }>(async (r) => {
  await requireAdmin(r);
  const b = await getBooking(r.data.bookingId);
  if (b.status !== 'matching' && b.status !== 'no_match') throw new HttpsError('failed-precondition', 'Booking is not waiting for an expert.');
  let partnerId = r.data.partnerId;
  if (!partnerId) {
    const partners = (await db.collection('partners').get()).docs.map((d) => ({ id: d.id, d: d.data() as PartnerDoc }));
    partnerId = rank(partners, skillsFor(b.tasks), b.address.at, new Set(), 10_000)[0]?.id;
  }
  if (!partnerId) throw new HttpsError('failed-precondition', 'No partner available.');
  if (b.status === 'no_match') await bookingRef(r.data.bookingId).update({ status: 'matching' });
  await acceptInternal(r.data.bookingId, partnerId, 1);
  await log(r.data.bookingId, 'Assigned by ops');
  return { ok: true as const };
});

export const adminCancelRefund = onCall<{ bookingId: string }>(async (r) => {
  await requireAdmin(r);
  const b = await getBooking(r.data.bookingId);
  if (['completed', 'cancelled'].includes(b.status)) throw new HttpsError('failed-precondition', 'Already closed.');
  await clearOffers(r.data.bookingId);
  if (b.paid) await refundBooking(r.data.bookingId, b, b.amountDue, 'cancelled by ops');
  await bookingRef(r.data.bookingId).update({ status: 'cancelled', cancelFee: 0, dispatchLog: FieldValue.arrayUnion('Cancelled and refunded by ops') });
  return { refunded: b.paid ? b.amountDue : 0 };
});

/** Ops links an expert's Razorpay Route account (created and KYC'd in the Razorpay dashboard), then pays out anything waiting. */
export const adminSetPayoutAccount = onCall<{ partnerId: string; accountId: string }>(async (r) => {
  await requireAdmin(r);
  const accountId = String(r.data.accountId ?? '').trim();
  if (!/^acc_[A-Za-z0-9]{6,}$/.test(accountId)) throw new HttpsError('invalid-argument', 'That is not a Razorpay account id (it starts with acc_).');
  await db.collection('partners').doc(r.data.partnerId).update({ payout: { accountId, linkedAt: Date.now() } });
  const waiting = await db.collection('earnings').where('partnerId', '==', r.data.partnerId).get();
  let sent = 0;
  for (const d of waiting.docs) {
    const e = d.data() as Earning;
    if (e.status === 'awaiting_account' || e.status === 'failed') { await payExpert(d.id); sent += 1; }
  }
  return { ok: true as const, retried: sent };
});

/** Ops looked at a complaint and the expert should be paid after all. */
export const adminReleaseEarning = onCall<{ bookingId: string }>(async (r) => {
  await requireAdmin(r);
  const eref = db.collection('earnings').doc(r.data.bookingId);
  const e = (await eref.get()).data() as Earning | undefined;
  if (!e) throw new HttpsError('not-found', 'No payout for that booking.');
  if (e.status === 'on_hold') {
    for (const t of e.transfers) await setTransferHold(t.id, false);
    await eref.update({ status: 'sent', releaseAt: Date.now(), error: FieldValue.delete(), updatedAt: Date.now() });
  } else if (e.status === 'failed' || e.status === 'awaiting_account') {
    await payExpert(r.data.bookingId);
  }
  return { ok: true as const };
});

/**
 * Five demo experts who accept jobs and ride to the door by themselves, plus a
 * week of shifts for the caller if she is a partner. On the emulator anyone can run it once;
 * on the live project only admins can.
 */
/** Emulator only: makes a staff account (ops@sahayak.test / sahayak123) and puts it on the admins list. */
export const devAdmin = onCall<Record<string, never>>(async () => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') throw new HttpsError('permission-denied', 'Only available on the local emulator.');
  const email = 'ops@sahayak.test'; const password = 'sahayak123';
  const auth = getAuth();
  const user = await auth.getUserByEmail(email).catch(() => auth.createUser({ email, password, displayName: 'Ops' }));
  await db.collection('admins').doc(user.uid).set({ email, addedAt: Date.now() }, { merge: true });
  return { email, password };
});

/**
 * Emulator only: a paid booking from a demo customer ~700 m from the caller, offered to her first.
 * Lets one person test the partner app end to end on one phone.
 */
export const devTestJob = onCall<Record<string, never>>(async (r) => {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') throw new HttpsError('permission-denied', 'Only available on the local emulator.');
  const u = uid(r);
  const p = (await db.collection('partners').doc(u).get()).data() as PartnerDoc | undefined;
  if (!p) throw new HttpsError('failed-precondition', 'Sign in as a partner first.');
  if (!p.onShift) throw new HttpsError('failed-precondition', 'Go online first.');
  const at = { lat: p.at.lat + 0.0045, lng: p.at.lng + 0.004 };
  const address: Address = { id: 'demo', label: 'Home', line1: 'A-402, Tower A', line2: 'Palm Grove Residency, Sector 52', directions: 'Gate 1. Say "Sahayak" at security.', at };
  await db.collection('users').doc('demo-customer').set({ role: 'customer', phone: '+910000000000', name: 'Demo Customer', rewards: 0, referralCode: 'DEMO00', addresses: [address], firstBookingDone: true }, { merge: true });
  const ref = bookingRef(`BT${Date.now().toString(36).toUpperCase()}`);
  const b: Booking = {
    customerId: 'demo-customer', tasks: ['sweep-mop', 'dishes'], serviceSlug: 'sweep-mop', durationMin: 60, addonSlugs: ['dishes'], address,
    price: priceForMinutes(60), fee: 0, discount: 0, rewardUsed: 0, amountDue: priceForMinutes(60),
    status: 'matching', paid: true, razorpay: { orderId: 'order_test_dev', paymentId: 'pay_test_dev' }, preferredPartnerId: u,
    startCode: code4(), extraMin: 0, tip: 0, doneTasks: [], dispatchLog: ['Test job created on the emulator'], createdAt: Date.now(), scheduledFor: null,
  };
  await ref.set(b);
  return { bookingId: ref.id };
});

export const seedDemo = onCall<Record<string, never>>(async (r) => {
  const u = uid(r);
  // Live project: only staff may add demo experts (they would otherwise take real customers' jobs).
  // Local emulator: anyone may, once, so a single tester can try every flow.
  const onEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
  const admin = await isAdmin(u);
  if (!onEmulator && !admin) throw new HttpsError('permission-denied', 'Only Sahayak staff can add demo experts.');
  const bots = await db.collection('partners').where('bot', '==', true).limit(1).get();
  if (!bots.empty && !admin) throw new HttpsError('permission-denied', 'Demo data already exists.');
  const seed: (PartnerDoc & { id: string })[] = [
    { id: 'bot-sunita', name: 'Sunita Devi', initials: 'SD', rating: 4.9, jobs: 1240, skills: ['cleaning', 'kitchen', 'bathroom'], hub: 'Sector 45', onShift: true, reliability: 0.96, onTime: 96, at: { lat: 28.4472, lng: 77.0661 }, bot: true },
    { id: 'bot-meena', name: 'Meena Kumari', initials: 'MK', rating: 4.6, jobs: 880, skills: ['cleaning', 'laundry'], hub: 'DLF 3', onShift: true, reliability: 0.91, onTime: 91, at: { lat: 28.4361, lng: 77.0808 }, bot: true },
    { id: 'bot-anita', name: 'Anita Prasad', initials: 'AP', rating: 4.3, jobs: 410, skills: ['cleaning', 'bathroom'], hub: 'Sector 45', onShift: true, reliability: 0.79, onTime: 79, at: { lat: 28.4509, lng: 77.0779 }, bot: true },
    { id: 'bot-laxmi', name: 'Laxmi Sahu', initials: 'LS', rating: 4.7, jobs: 640, skills: ['cleaning', 'kitchen', 'cooking'], hub: 'Sector 45', onShift: true, reliability: 0.93, onTime: 94, at: { lat: 28.4388, lng: 77.0602 }, bot: true },
    { id: 'bot-rekha', name: 'Rekha Kumari', initials: 'RK', rating: 4.5, jobs: 120, skills: ['cleaning'], hub: 'Sector 57', onShift: false, reliability: 0.88, onTime: 90, at: { lat: 28.461, lng: 77.089 }, bot: true },
  ];
  const batch = db.batch();
  seed.forEach(({ id, ...d }) => batch.set(db.collection('partners').doc(id), { ...d, ...(razorpayMock ? { payout: { accountId: `acc_test${id.replace(/[^a-z]/g, '')}`, linkedAt: Date.now() } } : {}) }, { merge: true }));

  const me = (await db.collection('partners').doc(u).get()).exists;
  const shifts = me ? [
    { day: 'Mon 23', start: '7:00 AM', end: '11:00 AM', pay: 880, hub: 'Sector 45', taken: true, expectedJobs: 4, demand: 'high' },
    { day: 'Tue 24', start: '7:00 AM', end: '11:00 AM', pay: 880, hub: 'Sector 45', taken: true, expectedJobs: 4, demand: 'normal' },
    { day: 'Wed 25', start: '11:00 AM', end: '3:00 PM', pay: 760, hub: 'Sector 45', taken: false, expectedJobs: 3, demand: 'normal' },
    { day: 'Thu 26', start: '4:00 PM', end: '8:00 PM', pay: 820, hub: 'DLF 3', taken: false, expectedJobs: 4, demand: 'high' },
    { day: 'Fri 27', start: '7:00 AM', end: '11:00 AM', pay: 880, hub: 'Sector 45', taken: false, expectedJobs: 4, demand: 'normal' },
    { day: 'Sat 28', start: '7:00 AM', end: '11:00 AM', pay: 960, hub: 'Sector 45', taken: false, expectedJobs: 5, demand: 'high' },
  ] : [];
  shifts.forEach((s, i) => batch.set(db.collection('shifts').doc(`${u}_sh${i + 1}`), { partnerId: u, ...s }));
  await batch.commit();
  return { partners: seed.length, shifts: shifts.length };
});
