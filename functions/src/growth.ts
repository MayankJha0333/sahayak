/**
 * Where we serve, what discounts exist, who is waiting for us, and what a referral pays.
 * Ops edits areas, coupons and config from the admin dashboard; this file is how the server reads them.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FIRST_COUPON, REFERRAL_REWARD } from './catalog';
import { coverageAt, pickArea, isServing } from './areaGeo';
import { distanceM, type LatLng } from './geo';
import { db, must, requireAdmin, uid, type Area } from './shared';

/* ------------------------------------------------------------------ */
/* service areas                                                       */
/* ------------------------------------------------------------------ */

/** Until ops adds an area, the app serves Gurugram as before. */
export const DEFAULT_AREA: Area & { id: string } = {
  id: 'default-gurugram', name: 'Gurugram', city: 'Gurugram', center: { lat: 28.4419, lng: 77.0723 }, radiusKm: 40, active: true, createdAt: 0,
};

export async function loadAreas() {
  const snap = await db.collection('areas').get();
  if (snap.empty) return [DEFAULT_AREA];
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Area) }));
}

/** The active area this point is in (the smallest wins when areas overlap, e.g. a city inside a state), or null. */
export async function areaFor(at: LatLng) {
  return pickArea((await loadAreas()).filter((a) => isServing(a)), at);
}

/** Serving area, or the "coming soon" area this point is in (with its launch date), or the nearest live one. */
export async function coverageFor(at: LatLng) {
  return coverageAt(await loadAreas(), at);
}

/** Customers outside every area leave their location; ops sees demand by place and tells them when we arrive. */
export const joinWaitlist = onCall<{ at: LatLng; line?: string; city?: string }>(async (r) => {
  const u = uid(r);
  const at = r.data.at;
  if (!at || typeof at.lat !== 'number' || typeof at.lng !== 'number') throw new HttpsError('invalid-argument', 'Pick a location first.');
  const user = (await db.collection('users').doc(u).get()).data() as { name?: string; phone?: string; role?: string } | undefined;
  const cov = await coverageFor(at);
  if (cov.serving) return { ok: true as const, served: true, areaName: cov.serving.name };
  await db.collection('waitlist').doc(u).set({
    userId: u, name: user?.name ?? '', phone: user?.phone ?? '', role: user?.role ?? 'customer',
    at, line: String(r.data.line ?? '').slice(0, 200), city: String(r.data.city ?? '').slice(0, 60),
    // The coming-soon area they are in, so ops can message everyone the day it opens.
    soonAreaId: cov.soon?.id ?? null, opensAt: cov.soon?.opensAt ?? null,
    status: 'waiting', createdAt: Date.now(), updatedAt: Date.now(),
  }, { merge: true });
  return { ok: true as const, served: false, opensAt: cov.soon?.opensAt ?? null, areaName: cov.soon?.name ?? null, phone: user?.phone ?? '' };
});

/**
 * How many people are already waiting within 3 km of this spot (not counting the caller),
 * so the coming-soon screen can say "12 neighbours are waiting". Only a count leaves the server.
 */
export const waitlistNear = onCall<{ at: LatLng }>(async (r) => {
  const u = uid(r);
  const at = r.data.at;
  if (!at || typeof at.lat !== 'number' || typeof at.lng !== 'number') throw new HttpsError('invalid-argument', 'Pick a location first.');
  const snap = await db.collection('waitlist').where('status', '==', 'waiting').get();
  const near = snap.docs.filter((d) => d.id !== u && d.data().at && distanceM(d.data().at as LatLng, at) <= 3000).length;
  return { near };
});

/** Ops has told these people (by SMS or a call) that we now serve them. */
export const adminMarkWaitlist = onCall<{ ids: string[]; status: 'notified' | 'waiting' | 'removed' }>(async (r) => {
  await requireAdmin(r);
  const ids = (r.data.ids ?? []).slice(0, 400);
  const batch = db.batch();
  ids.forEach((id) => {
    const ref = db.collection('waitlist').doc(id);
    if (r.data.status === 'removed') batch.delete(ref);
    else batch.update(ref, { status: r.data.status, updatedAt: Date.now(), ...(r.data.status === 'notified' ? { notifiedAt: Date.now() } : {}) });
  });
  await batch.commit();
  return { ok: true as const, count: ids.length };
});

/* ------------------------------------------------------------------ */
/* coupons                                                             */
/* ------------------------------------------------------------------ */

export type Coupon = {
  code: string; title: string; description?: string;
  type: 'flat' | 'percent'; value: number; maxDiscount?: number; minOrder?: number;
  firstOrderOnly?: boolean; perUserLimit?: number; totalLimit?: number; used?: number;
  active: boolean; public?: boolean; startsAt?: number | null; endsAt?: number | null; createdAt: number;
};

/** FIRST50 works out of the box; ops can edit or switch it off by saving a coupon with that code. */
const BUILT_IN: Record<string, Coupon> = {
  [FIRST_COUPON.code]: {
    code: FIRST_COUPON.code, title: `₹${FIRST_COUPON.amount} off your first booking`, type: 'flat', value: FIRST_COUPON.amount,
    firstOrderOnly: true, perUserLimit: 1, active: true, public: true, createdAt: 0,
  },
};

export const normaliseCode = (code: string) => String(code ?? '').trim().toUpperCase().replace(/\s+/g, '');

export async function getCoupon(code: string): Promise<Coupon | null> {
  const c = normaliseCode(code);
  if (!c) return null;
  const s = await db.collection('coupons').doc(c).get();
  if (s.exists) return { ...(s.data() as Coupon), code: c };
  return BUILT_IN[c] ?? null;
}

type Usage = { firstBookingDone?: boolean; paidBookings: { couponCode?: string; discount: number; rewardUsed?: number; status: string; paid: boolean }[] };

/** Rupees off `price`, or an error the customer can read. Never trusts the phone's maths. */
export function couponDiscount(coupon: Coupon | null, price: number, usage: Usage, now = Date.now()): { amount: number } | { error: string } {
  if (!coupon || !coupon.active) return { error: 'That coupon code is not valid.' };
  if (coupon.startsAt && now < coupon.startsAt) return { error: 'That coupon is not active yet.' };
  if (coupon.endsAt && now > coupon.endsAt) return { error: 'That coupon has expired.' };
  if (coupon.totalLimit && (coupon.used ?? 0) >= coupon.totalLimit) return { error: 'That coupon has been fully used.' };
  if (coupon.minOrder && price < coupon.minOrder) return { error: `This coupon needs a booking of at least ₹${coupon.minOrder}.` };
  const live = usage.paidBookings.filter((b) => b.paid && b.status !== 'cancelled');
  if (coupon.firstOrderOnly && (usage.firstBookingDone || live.length > 0)) return { error: 'This coupon is for your first booking only.' };
  const mine = live.filter((b) => b.couponCode === coupon.code
    // Bookings made before coupon codes were stored used FIRST50 whenever the discount was more than the rewards.
    || (!b.couponCode && coupon.code === FIRST_COUPON.code && b.discount - (b.rewardUsed ?? 0) > 0)).length;
  if (mine >= (coupon.perUserLimit ?? 1)) return { error: 'You have already used this coupon.' };
  const raw = coupon.type === 'percent' ? Math.round((price * coupon.value) / 100) : coupon.value;
  const capped = coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw;
  return { amount: Math.max(0, Math.min(capped, price)) };
}

async function usageOf(u: string): Promise<Usage> {
  const user = (await db.collection('users').doc(u).get()).data() as { firstBookingDone?: boolean } | undefined;
  const bookings = await db.collection('bookings').where('customerId', '==', u).get();
  return { firstBookingDone: user?.firstBookingDone, paidBookings: bookings.docs.map((d) => d.data() as Usage['paidBookings'][number]) };
}

export async function evaluateCoupon(u: string, code: string, price: number) {
  const coupon = await getCoupon(code);
  const res = couponDiscount(coupon, price, await usageOf(u));
  return { coupon, res };
}

/** The review screen asks before paying, so the customer sees the saving (or why it does not apply). */
export const previewCoupon = onCall<{ code: string; price: number }>(async (r) => {
  const u = uid(r);
  const { coupon, res } = await evaluateCoupon(u, r.data.code, Math.max(0, Number(r.data.price) || 0));
  if ('error' in res) throw new HttpsError('failed-precondition', res.error);
  return { code: coupon!.code, title: coupon!.title, amount: res.amount };
});

/**
 * The coupon page: public coupons she can use on this booking, best saving first, and the ones that
 * do not fit this booking yet with the reason (too small, first booking only). Expired, paused,
 * fully used and already-used coupons are left out.
 */
export const listMyCoupons = onCall<{ price: number }>(async (r) => {
  const u = uid(r);
  const usage = await usageOf(u);
  const snap = await db.collection('coupons').where('public', '==', true).get();
  const all: Coupon[] = snap.docs.map((d) => ({ ...(d.data() as Coupon), code: d.id }));
  if (!all.some((c) => c.code === FIRST_COUPON.code)) all.push(BUILT_IN[FIRST_COUPON.code]);
  const price = Math.max(0, Number(r.data.price) || 0);
  const now = Date.now();
  const info = (c: Coupon) => ({
    code: c.code, title: c.title, description: c.description ?? '',
    type: c.type, value: c.value, maxDiscount: c.maxDiscount ?? null, minOrder: c.minOrder ?? null,
    endsAt: c.endsAt ?? null, firstOrderOnly: Boolean(c.firstOrderOnly),
  });
  const coupons: (ReturnType<typeof info> & { amount: number })[] = [];
  const unavailable: (ReturnType<typeof info> & { reason: string })[] = [];
  for (const c of all) {
    if (!c.active || (c.startsAt && now < c.startsAt) || (c.endsAt && now > c.endsAt) || (c.totalLimit && (c.used ?? 0) >= c.totalLimit)) continue;
    const res = couponDiscount(c, price, usage, now);
    if ('amount' in res && res.amount > 0) coupons.push({ ...info(c), amount: res.amount });
    else if ('error' in res && !/already used/i.test(res.error)) {
      const reason = c.minOrder && price < c.minOrder ? `Add ₹${c.minOrder - price} more to use this` : res.error;
      unavailable.push({ ...info(c), reason });
    }
  }
  coupons.sort((a, b) => b.amount - a.amount);
  return { coupons, unavailable };
});

/** Counted once the booking is paid, so abandoned checkouts do not use up a limited coupon. */
export async function countCouponUse(code?: string) {
  if (!code) return;
  const ref = db.collection('coupons').doc(code);
  if ((await ref.get()).exists) await ref.update({ used: FieldValue.increment(1) });
}

/* ------------------------------------------------------------------ */
/* referral settings                                                   */
/* ------------------------------------------------------------------ */

export type ReferralConfig = { active: boolean; customerReward: number; partnerReward: number };

export async function referralConfig(): Promise<ReferralConfig> {
  const d = (await db.collection('config').doc('referral').get()).data() as Partial<ReferralConfig> | undefined;
  return { active: d?.active ?? true, customerReward: d?.customerReward ?? REFERRAL_REWARD, partnerReward: d?.partnerReward ?? REFERRAL_REWARD };
}

/** Ops can give a customer credit by hand (a goodwill gesture after a bad visit, say). */
export const adminGiveCredit = onCall<{ userId: string; amount: number; note?: string }>(async (r) => {
  const admin = await requireAdmin(r);
  const amount = Math.round(Number(r.data.amount));
  if (!amount || amount < 1 || amount > 5000) throw new HttpsError('invalid-argument', 'Enter an amount between ₹1 and ₹5,000.');
  const ref = db.collection('users').doc(r.data.userId);
  must((await ref.get()).exists ? true : null, 'Customer not found.');
  await ref.update({ rewards: FieldValue.increment(amount) });
  await db.collection('creditLog').add({ userId: r.data.userId, amount, note: String(r.data.note ?? '').slice(0, 200), by: admin, at: Date.now() });
  return { ok: true as const };
});
