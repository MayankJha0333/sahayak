import * as crypto from 'crypto';
import Razorpay from 'razorpay';

const keyId = process.env.RAZORPAY_KEY_ID ?? '';
const keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

/**
 * Test mode: inside the emulator with no keys, orders, captures, refunds and transfers are stand-ins and
 * every signature from the test checkout is accepted, so the whole flow runs without a Razorpay account.
 * Never active in production: a deployed function without keys refuses to take money.
 */
export const razorpayMock = !keyId && process.env.FUNCTIONS_EMULATOR === 'true';
export const razorpayConfigured = Boolean(keyId && keySecret) || razorpayMock;
export const RAZORPAY_KEY_ID = keyId;

let client: Razorpay | null = null;
export function rzp() {
  if (!client) client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Razorpay signs order_id|payment_id with the key secret. Anything else is not a real payment. */
export function verifySignature(orderId: string, paymentId: string, signature: string) {
  if (razorpayMock) return signature === 'test-mode' && paymentId.startsWith('pay_test_');
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

/** Webhooks are signed with the webhook secret over the raw request body. */
export function verifyWebhook(rawBody: string, signature: string) {
  if (!webhookSecret) return razorpayMock;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

export async function createOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  if (razorpayMock) return { id: `order_test_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, amount: amountPaise, currency: 'INR', receipt, notes };
  // payment_capture: capture automatically once the customer pays, so money is never left merely "authorized".
  return rzp().orders.create({ amount: amountPaise, currency: 'INR', receipt: receipt.slice(0, 40), notes, payment_capture: true } as never);
}

export type Confirmed = { paymentId: string; amountPaise: number; method?: string };

/**
 * The checkout said "paid": check the signature, then ask Razorpay itself that this payment belongs to this
 * order, for this amount, and is captured (capturing it now if it was only authorized).
 */
export async function confirmPayment(orderId: string, paymentId: string, signature: string, expectedPaise: number): Promise<Confirmed> {
  if (!paymentId && !signature) return findOrderPayment(orderId, expectedPaise);
  if (!verifySignature(orderId, paymentId, signature)) throw new Error('Payment could not be verified.');
  if (razorpayMock) return { paymentId, amountPaise: expectedPaise, method: 'test' };
  let p = await rzp().payments.fetch(paymentId);
  if (p.order_id !== orderId) throw new Error('This payment is for a different order.');
  if (Number(p.amount) !== expectedPaise) throw new Error('The amount paid does not match the bill.');
  if (p.status === 'authorized') p = await rzp().payments.capture(paymentId, expectedPaise, 'INR');
  if (p.status !== 'captured') throw new Error(`Payment is ${p.status}, not captured.`);
  return { paymentId, amountPaise: Number(p.amount), method: p.method };
}

/** Thrown when the order simply has no successful payment: the customer failed or cancelled at the bank. */
export class NotPaidError extends Error {}

/**
 * Phones use Razorpay's redirect flow (banks and card checks open full pages, which a WebView can't do as
 * pop-ups), and that flow hands the app no payment id. So we ask Razorpay for the order's payments directly —
 * the answer comes from Razorpay, not the phone, so it can't be faked.
 */
async function findOrderPayment(orderId: string, expectedPaise: number): Promise<Confirmed> {
  if (razorpayMock) throw new NotPaidError('No payment on this order.');
  const list = (await rzp().orders.fetchPayments(orderId)) as unknown as { items: { id: string; status: string; amount: number; method?: string }[] };
  const items = list.items ?? [];
  const hit = items.find((p) => p.status === 'captured') ?? items.find((p) => p.status === 'authorized');
  if (!hit) throw new NotPaidError('No successful payment on this order.');
  if (Number(hit.amount) !== expectedPaise) throw new Error('The amount paid does not match the bill.');
  if (hit.status === 'authorized') await rzp().payments.capture(hit.id, expectedPaise, 'INR');
  return { paymentId: hit.id, amountPaise: Number(hit.amount), method: hit.method };
}

export async function refund(paymentId: string, amountPaise: number, notes: Record<string, string>) {
  if (razorpayMock) return { id: `rfnd_test_${Date.now().toString(36)}`, amount: amountPaise, notes };
  return rzp().payments.refund(paymentId, { amount: amountPaise, speed: 'optimum', notes });
}

/* ------------------------------------------------------------------ *
 * RazorpayX Payouts: experts withdraw their earnings to UPI or a bank account.
 * The Node SDK does not cover RazorpayX, so these call the REST API directly.
 * ------------------------------------------------------------------ */

const payoutAccount = process.env.RAZORPAYX_ACCOUNT_NUMBER ?? '';
/** Emulator without a RazorpayX account number: payouts are stand-ins that succeed at once. */
export const payoutsMock = !payoutAccount && process.env.FUNCTIONS_EMULATOR === 'true';
export const payoutsConfigured = Boolean(payoutAccount && keyId && keySecret) || payoutsMock;

export class RazorpayXError extends Error {
  constructor(message: string, public status = 0, public field?: string) { super(message); }
}

async function rzpx<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      ...(idempotencyKey ? { 'X-Payout-Idempotency': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { description?: string; field?: string } } & T;
  if (!res.ok) throw new RazorpayXError(json.error?.description ?? `RazorpayX error ${res.status}`, res.status, json.error?.field);
  return json;
}

/** One contact per expert; fund accounts (UPI or bank) hang off it. */
export async function createContact(p: { name: string; phone?: string; referenceId: string }) {
  if (payoutsMock) return { id: `cont_test_${p.referenceId.slice(0, 10)}` };
  return rzpx<{ id: string }>('/contacts', {
    name: p.name.slice(0, 50), contact: p.phone?.replace(/^\+91/, ''), type: 'employee', reference_id: p.referenceId.slice(0, 40),
  });
}

export async function createFundAccount(contactId: string, m: { type: 'upi'; upi: string } | { type: 'bank'; holderName: string; ifsc: string; accountNumber: string }) {
  if (payoutsMock) return { id: `fa_test_${Date.now().toString(36)}` };
  return rzpx<{ id: string }>('/fund_accounts', m.type === 'upi'
    ? { contact_id: contactId, account_type: 'vpa', vpa: { address: m.upi } }
    : { contact_id: contactId, account_type: 'bank_account', bank_account: { name: m.holderName, ifsc: m.ifsc, account_number: m.accountNumber } });
}

export type PayoutResult = { id: string; status: string; utr?: string | null; failureReason?: string | null };

/** Sends money from Sahayak's RazorpayX account. The withdrawal id doubles as the idempotency key, so a retry never pays twice. */
export async function createPayout(p: { fundAccountId: string; amountPaise: number; mode: 'UPI' | 'IMPS'; referenceId: string; narration: string }): Promise<PayoutResult> {
  if (payoutsMock) return { id: `pout_test_${Date.now().toString(36)}`, status: 'processed', utr: `TESTUTR${Date.now().toString().slice(-8)}` };
  if (!payoutAccount) throw new RazorpayXError('RazorpayX is not set up on the server (RAZORPAYX_ACCOUNT_NUMBER).');
  const r = await rzpx<{ id: string; status: string; utr?: string; status_details?: { description?: string } }>('/payouts', {
    account_number: payoutAccount, fund_account_id: p.fundAccountId, amount: p.amountPaise, currency: 'INR',
    mode: p.mode, purpose: 'payout', queue_if_low_balance: true, reference_id: p.referenceId.slice(0, 40), narration: p.narration.slice(0, 30),
  }, p.referenceId);
  return { id: r.id, status: r.status, utr: r.utr ?? null, failureReason: r.status_details?.description ?? null };
}

/** RazorpayX webhooks are signed with their own secret (set when adding the webhook in the RazorpayX dashboard). */
export function verifyPayoutWebhook(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAYX_WEBHOOK_SECRET || webhookSecret;
  if (!secret) return payoutsMock;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
