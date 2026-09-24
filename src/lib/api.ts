import { currentUid } from './fb/auth';
import { addDoc, collection, db, doc, getDoc, setDoc, updateDoc } from './fb/firestore';
import { callable as call } from './fb/functions';
import type { LatLng } from './geo';
import type { Address, FeedbackDoc, ShiftDoc } from './types';

/* ---------- payments ---------- */

export type OrderResult = { bookingId: string; orderId: string; amount: number; currency: 'INR'; keyId: string; rewardUsed: number };
export const createOrder = call<{
  tasks: string[]; durationMin: number; addressId: string;
  scheduledFor: number | null; preferredPartnerId?: string; coupon?: string; useRewards?: boolean;
}, OrderResult>('createOrder');

export const verifyPayment = call<{ bookingId: string; paymentId: string; orderId: string; signature: string }, { ok: true }>('verifyPayment');

export const createBalanceOrder = call<{ bookingId: string; tip: number }, OrderResult>('createBalanceOrder');
export const verifyBalancePayment = call<{ bookingId: string; paymentId: string; orderId: string; signature: string }, { ok: true }>('verifyBalancePayment');

/* ---------- booking lifecycle ---------- */

export const cancelBooking = call<{ bookingId: string; expectFee?: number }, { refunded: number; fee: number }>('cancelBooking');
export const retryMatching = call<{ bookingId: string }, { ok: true }>('retryMatching');
export const acceptOffer = call<{ bookingId: string }, { ok: true }>('acceptOffer');
export const declineOffer = call<{ bookingId: string; reason?: string }, { ok: true }>('declineOffer');
export const markArrived = call<{ bookingId: string }, { ok: true }>('markArrived');
export const startJob = call<{ bookingId: string; code: string }, { ok: boolean }>('startJob');
export const toggleTask = call<{ bookingId: string; task: string }, { ok: true }>('toggleTask');
export const addTime = call<{ bookingId: string; minutes: number }, { ok: true }>('addTime');
/** Extend a running visit: order → Razorpay checkout → verify. The server moves the end of the session. */
export const createExtensionOrder = call<{ bookingId: string; minutes: number }, OrderResult & { minutes: number }>('createExtensionOrder');
export const verifyExtension = call<{ bookingId: string; paymentId: string; orderId: string; signature: string }, { ok: true; minutes: number }>('verifyExtension');
export const finishJob = call<{ bookingId: string; flags?: string[] }, { ok: true }>('finishJob');
export const rateJob = call<{ bookingId: string; rating: number; tags: string[] }, { ok: true }>('rateJob');

/* ---------- admin ---------- */

export const adminForceAssign = call<{ bookingId: string; partnerId?: string }, { ok: true }>('adminForceAssign');
export const adminCancelRefund = call<{ bookingId: string }, { refunded: number }>('adminCancelRefund');
export const adminSetPayoutAccount = call<{ partnerId: string; accountId: string }, { ok: true; retried: number }>('adminSetPayoutAccount');
export const adminReleaseEarning = call<{ bookingId: string }, { ok: true }>('adminReleaseEarning');
export const devTestJob = call<Record<string, never>, { bookingId: string }>('devTestJob');
export const devAdmin = call<Record<string, never>, { email: string; password: string }>('devAdmin');
export const seedDemo = call<Record<string, never>, { partners: number; shifts: number }>('seedDemo');

/* ---------- direct writes the rules allow ---------- */

export async function updatePartnerLocation(at: LatLng) {
  const uid = currentUid(); if (!uid) return;
  await updateDoc(doc(db(), `partners/${uid}`), { at });
}

export async function setOnShift(onShift: boolean) {
  const uid = currentUid(); if (!uid) return;
  await updateDoc(doc(db(), `partners/${uid}`), { onShift });
}

export async function addFeedback(kind: FeedbackDoc['kind'], text: string, bookingId?: string) {
  const uid = currentUid(); if (!uid) return;
  const f: FeedbackDoc = { userId: uid, kind, text: text.trim(), at: Date.now(), ...(bookingId ? { bookingId } : {}) };
  await addDoc(collection(db(), 'feedback'), f);
}

export async function saveShift(id: string, s: ShiftDoc) {
  await setDoc(doc(db(), `shifts/${id}`), s);
}

/** Add or replace an address on the profile. `makeDefault` also points bookings at it. */
export async function saveAddress(a: Address, makeDefault = false) {
  const uid = currentUid(); if (!uid) return;
  const ref = doc(db(), `users/${uid}`);
  const snap = await getDoc(ref);
  const current = ((snap.data() as { addresses?: Address[] } | undefined)?.addresses ?? []);
  const addresses = current.some((x) => x.id === a.id) ? current.map((x) => (x.id === a.id ? a : x)) : [...current, a];
  await updateDoc(ref, { addresses, ...(makeDefault || current.length === 0 ? { defaultAddressId: a.id } : {}) });
}

export async function setDefaultAddress(addressId: string) {
  const uid = currentUid(); if (!uid) return;
  await updateDoc(doc(db(), `users/${uid}`), { defaultAddressId: addressId });
}
