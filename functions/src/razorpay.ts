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
 * Route: the expert's share goes to her Razorpay linked account.
 * ------------------------------------------------------------------ */

export type TransferResult = { id: string; amountPaise: number; source: string };

/** Moves part of a captured customer payment to the expert, held until `holdUntil` (unix seconds) for disputes. */
export async function transferFromPayment(paymentId: string, account: string, amountPaise: number, notes: Record<string, string>, holdUntil?: number): Promise<TransferResult> {
  if (razorpayMock) return { id: `trf_test_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, amountPaise, source: paymentId };
  const res = await rzp().payments.transfer(paymentId, {
    transfers: [{ account, amount: amountPaise, currency: 'INR', notes, linked_account_notes: Object.keys(notes).slice(0, 3), on_hold: Boolean(holdUntil), ...(holdUntil ? { on_hold_until: holdUntil } : {}) } as never],
  });
  const t = (res as unknown as { items: { id: string; amount: number }[] }).items[0];
  return { id: t.id, amountPaise: Number(t.amount), source: paymentId };
}

/** When the customer paid less than the expert earns (coupon or rewards), Sahayak tops up from its own balance. */
export async function directTransfer(account: string, amountPaise: number, notes: Record<string, string>): Promise<TransferResult> {
  if (razorpayMock) return { id: `trf_test_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, amountPaise, source: 'balance' };
  const t = await rzp().transfers.create({ account, amount: amountPaise, currency: 'INR', notes } as never);
  return { id: t.id, amountPaise: Number(t.amount), source: 'balance' };
}

/** Keep (or release) a transfer's settlement, e.g. while a complaint is looked at. */
export async function setTransferHold(transferId: string, hold: boolean) {
  if (razorpayMock || transferId.startsWith('trf_test_')) return;
  await rzp().transfers.edit(transferId, { on_hold: hold ? 1 : 0 } as never);
}
