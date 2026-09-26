/**
 * The expert's wallet. Each finished visit credits her share; it becomes withdrawable after a short hold
 * (so ops can look at a complaint first). She withdraws to her UPI or bank account whenever she has at least
 * ₹100, and on Monday mornings everything available goes out on its own unless she switched that off.
 * Money leaves through RazorpayX Payouts.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createContact, createFundAccount, createPayout, payoutsConfigured, RazorpayXError, verifyPayoutWebhook } from './razorpay';
import { db, must, onEmulator, requireAdmin, uid, type PartnerDoc, type PayoutMethod } from './shared';

export const MIN_WITHDRAW = 100;
/** A day in production. Two minutes on the emulator so the whole flow can be tried in one sitting. */
export const HOLD_MS = onEmulator ? 2 * 60_000 : 24 * 60 * 60_000;

export type EarningStatus = 'earned' | 'on_hold' | 'withdrawn';
export type Earning = {
  partnerId: string; bookingId: string; jobPay: number; extraPay: number; tip: number; total: number;
  status: EarningStatus; availableAt: number; withdrawalId?: string; holdReason?: string; createdAt: number; updatedAt: number;
};
export type WithdrawalStatus = 'processing' | 'paid' | 'failed';
export type Withdrawal = {
  partnerId: string; partnerName: string; amount: number; earningIds: string[]; status: WithdrawalStatus;
  method: { type: 'upi' | 'bank'; label: string }; trigger: 'manual' | 'weekly' | 'admin';
  payoutId?: string; utr?: string | null; error?: string; createdAt: number; updatedAt: number; paidAt?: number;
};

/** Older ledgers (from the Route version) used other words; read them in today's terms. */
const statusOf = (e: { status: string }): EarningStatus =>
  e.status === 'sent' || e.status === 'withdrawn' ? 'withdrawn' : e.status === 'on_hold' ? 'on_hold' : 'earned';
const isAvailable = (e: Earning, now: number) => statusOf(e) === 'earned' && (e.availableAt ?? 0) <= now;

/** Adds a finished visit to her wallet. Safe to call twice: an existing entry is left alone. */
export async function creditEarning(bookingId: string, partnerId: string, pay: { jobPay: number; extraPay: number; tip: number; total: number }) {
  const ref = db.collection('earnings').doc(bookingId);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return;
    const now = Date.now();
    tx.set(ref, { partnerId, bookingId, ...pay, status: 'earned', availableAt: now + HOLD_MS, createdAt: now, updatedAt: now } satisfies Earning);
  });
}

/** A low rating or complaint: the money stays in her wallet but cannot be withdrawn until ops releases it. */
export async function holdEarning(bookingId: string, reason: string) {
  const ref = db.collection('earnings').doc(bookingId);
  const e = (await ref.get()).data() as Earning | undefined;
  if (!e || statusOf(e) !== 'earned') return;
  await ref.update({ status: 'on_hold', holdReason: reason, updatedAt: Date.now() });
}

/* ------------------------------------------------------------------ */
/* payout method                                                       */
/* ------------------------------------------------------------------ */

const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

type MethodIn = { type: 'upi'; upi: string; holderName: string } | { type: 'bank'; holderName: string; ifsc: string; accountNumber: string };

export const setPayoutMethod = onCall<MethodIn>(async (r) => {
  const u = uid(r);
  const pref = db.collection('partners').doc(u);
  const p = must((await pref.get()).data() as PartnerDoc | undefined, 'Sign up as an expert first.');
  if (!p.kyc || p.kyc.status === 'not_started') throw new HttpsError('failed-precondition', 'Finish your Aadhaar check first.');
  const i = r.data;
  const holderName = String(i.holderName ?? '').trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z .']{3,100}$/.test(holderName)) throw new HttpsError('invalid-argument', 'Enter the account holder name (letters only).');
  if (!payoutsConfigured) throw new HttpsError('failed-precondition', 'Payouts are not set up yet. Please try again later.');

  let method: Omit<PayoutMethod, 'contactId' | 'fundAccountId' | 'addedAt'>;
  let fundInput: Parameters<typeof createFundAccount>[1];
  if (i.type === 'upi') {
    const upi = String(i.upi ?? '').trim().toLowerCase();
    if (!UPI_RE.test(upi)) throw new HttpsError('invalid-argument', 'That UPI ID does not look right. It looks like name@okaxis.');
    const [name, handle] = upi.split('@');
    method = { type: 'upi', upi, holderName, label: `${name.slice(0, 3)}•••@${handle}` };
    fundInput = { type: 'upi', upi };
  } else {
    const ifsc = String(i.ifsc ?? '').trim().toUpperCase();
    const acct = String(i.accountNumber ?? '').replace(/\s/g, '');
    if (!IFSC_RE.test(ifsc)) throw new HttpsError('invalid-argument', 'That IFSC code does not look right. It has 11 characters, like HDFC0001234.');
    if (!/^\d{9,18}$/.test(acct)) throw new HttpsError('invalid-argument', 'Enter your account number (9 to 18 digits).');
    method = { type: 'bank', holderName, ifsc, last4: acct.slice(-4), bankName: ifsc.slice(0, 4), label: `${ifsc.slice(0, 4)} ••••${acct.slice(-4)}` };
    fundInput = { type: 'bank', holderName, ifsc, accountNumber: acct };
  }

  try {
    const contactId = p.payoutContactId ?? (await createContact({ name: p.kyc.fullName ?? p.name, phone: p.phone, referenceId: u })).id;
    const fa = await createFundAccount(contactId, fundInput);
    // The full account number goes to RazorpayX only; we keep the last 4 digits.
    await pref.update({ payoutContactId: contactId, payoutMethod: { ...method, contactId, fundAccountId: fa.id, addedAt: Date.now() }, autoPayout: p.autoPayout ?? true });
  } catch (e) {
    if (e instanceof RazorpayXError) throw new HttpsError('invalid-argument', `Could not add that account: ${e.message}`);
    throw e;
  }
  return { ok: true as const, label: method.label };
});

export const setAutoPayout = onCall<{ on: boolean }>(async (r) => {
  const u = uid(r);
  await db.collection('partners').doc(u).update({ autoPayout: Boolean(r.data.on) });
  return { ok: true as const };
});

/* ------------------------------------------------------------------ */
/* withdrawals                                                         */
/* ------------------------------------------------------------------ */

async function releaseWithdrawal(withdrawalId: string) {
  const snap = await db.collection('earnings').where('withdrawalId', '==', withdrawalId).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { status: 'earned', withdrawalId: FieldValue.delete(), updatedAt: Date.now() }));
  await batch.commit();
}

const FAILED = ['failed', 'reversed', 'rejected', 'cancelled'];

/** Applies a RazorpayX payout status to our withdrawal. Failed money goes back into her wallet. */
async function applyPayoutStatus(withdrawalId: string, status: string, extra: { utr?: string | null; error?: string | null }) {
  const ref = db.collection('withdrawals').doc(withdrawalId);
  const w = (await ref.get()).data() as Withdrawal | undefined;
  if (!w || w.status !== 'processing') return;
  if (status === 'processed') {
    await ref.update({ status: 'paid', utr: extra.utr ?? null, paidAt: Date.now(), updatedAt: Date.now() });
  } else if (FAILED.includes(status)) {
    await ref.update({ status: 'failed', error: extra.error || `Payout ${status}`, updatedAt: Date.now() });
    await releaseWithdrawal(withdrawalId);
  }
}

/** Moves everything available into one payout. Returns null when there is less than ₹100 to send. */
export async function withdrawFor(partnerId: string, trigger: Withdrawal['trigger']) {
  const pref = db.collection('partners').doc(partnerId);
  const p = must((await pref.get()).data() as PartnerDoc | undefined, 'Expert not found.');
  // Ops sees messages about the expert; the expert sees messages about herself.
  const ops = trigger === 'admin';
  if (!p.verified) throw new HttpsError('failed-precondition', ops ? `${p.name} is not verified yet.` : 'Your account is not verified yet.');
  if (p.suspended) throw new HttpsError('failed-precondition', ops ? `${p.name} is suspended. Restore her on the Experts page first.` : 'Your account is on hold. Please call support.');
  const method = must(p.payoutMethod, ops ? `${p.name} has not added a UPI ID or bank account yet.` : 'Add a UPI ID or bank account first.');
  const wref = db.collection('withdrawals').doc();
  const now = Date.now();

  const picked = await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection('earnings').where('partnerId', '==', partnerId));
    const ready = snap.docs.filter((d) => isAvailable(d.data() as Earning, now));
    const amount = ready.reduce((n, d) => n + ((d.data() as Earning).total ?? 0), 0);
    if (amount < MIN_WITHDRAW) return null;
    ready.forEach((d) => tx.update(d.ref, { status: 'withdrawn', withdrawalId: wref.id, updatedAt: now }));
    tx.set(wref, {
      partnerId, partnerName: p.name, amount, earningIds: ready.map((d) => d.id), status: 'processing',
      method: { type: method.type, label: method.label }, trigger, createdAt: now, updatedAt: now,
    } satisfies Withdrawal);
    return { amount };
  });
  if (!picked) return null;

  try {
    const out = await createPayout({
      fundAccountId: method.fundAccountId, amountPaise: picked.amount * 100, mode: method.type === 'upi' ? 'UPI' : 'IMPS',
      referenceId: wref.id, narration: 'Sahayak earnings',
    });
    await wref.update({ payoutId: out.id, updatedAt: Date.now() });
    await applyPayoutStatus(wref.id, out.status, { utr: out.utr, error: out.failureReason });
  } catch (e) {
    logger.error('Payout failed', { partnerId, withdrawalId: wref.id, error: (e as Error).message });
    await wref.update({ status: 'failed', error: (e as Error).message, updatedAt: Date.now() });
    await releaseWithdrawal(wref.id);
  }
  return { withdrawalId: wref.id, amount: picked.amount };
}

export const withdraw = onCall<Record<string, never>>(async (r) => {
  const u = uid(r);
  const res = await withdrawFor(u, 'manual');
  if (!res) throw new HttpsError('failed-precondition', `You need at least ₹${MIN_WITHDRAW} ready to withdraw.`);
  const w = (await db.collection('withdrawals').doc(res.withdrawalId).get()).data() as Withdrawal;
  if (w.status === 'failed') throw new HttpsError('aborted', `The payout did not go through: ${w.error}. Your money is back in your wallet.`);
  return { ok: true as const, amount: res.amount, status: w.status };
});

/** Monday 9 AM India time: pay out everyone who has at least ₹100 ready and has not turned this off. */
export const weeklyPayouts = onSchedule({ schedule: 'every monday 09:00', timeZone: 'Asia/Kolkata', timeoutSeconds: 540 }, async () => {
  const partners = await db.collection('partners').where('verified', '==', true).get();
  for (const d of partners.docs) {
    const p = d.data() as PartnerDoc;
    if (!p.payoutMethod || p.autoPayout === false || p.suspended) continue;
    try { await withdrawFor(d.id, 'weekly'); } catch (e) { logger.warn('Weekly payout skipped', { partnerId: d.id, error: (e as Error).message }); }
  }
});

/** RazorpayX → us: a payout finished, failed or bounced back. */
export const razorpayXWebhook = onRequest({ cors: false }, async (req, res) => {
  const raw = req.rawBody?.toString('utf8') ?? '';
  if (!verifyPayoutWebhook(raw, String(req.headers['x-razorpay-signature'] ?? ''))) { res.status(400).send('bad signature'); return; }
  const ev = JSON.parse(raw || '{}') as { event?: string; payload?: { payout?: { entity?: { id: string; reference_id?: string; status: string; utr?: string; status_details?: { description?: string }; failure_reason?: string } } } };
  const p = ev.payload?.payout?.entity;
  if (!p?.reference_id) { res.status(200).send('ignored'); return; }
  try {
    await applyPayoutStatus(p.reference_id, p.status, { utr: p.utr, error: p.status_details?.description ?? p.failure_reason });
    res.status(200).send('ok');
  } catch (e) {
    res.status(500).send((e as Error).message);
  }
});

/* ------------------------------------------------------------------ */
/* ops                                                                 */
/* ------------------------------------------------------------------ */

/** Ops looked at a complaint and the expert should be paid after all. */
export const adminReleaseEarning = onCall<{ bookingId: string }>(async (r) => {
  await requireAdmin(r);
  const ref = db.collection('earnings').doc(r.data.bookingId);
  const e = must((await ref.get()).data() as Earning | undefined, 'No earning for that booking.');
  if (statusOf(e) === 'on_hold') await ref.update({ status: 'earned', holdReason: FieldValue.delete(), availableAt: Date.now(), updatedAt: Date.now() });
  return { ok: true as const };
});

/** Ops holds a visit's money while looking into it. */
export const adminHoldEarning = onCall<{ bookingId: string; reason: string }>(async (r) => {
  await requireAdmin(r);
  await holdEarning(r.data.bookingId, String(r.data.reason ?? 'Held by ops').slice(0, 200));
  return { ok: true as const };
});

/** Pays out an expert's available balance now (after fixing a failed payout, say). */
export const adminPayoutNow = onCall<{ partnerId: string }>(async (r) => {
  await requireAdmin(r);
  const res = await withdrawFor(r.data.partnerId, 'admin');
  if (!res) throw new HttpsError('failed-precondition', `She has less than ₹${MIN_WITHDRAW} ready.`);
  return { ok: true as const, amount: res.amount };
});
