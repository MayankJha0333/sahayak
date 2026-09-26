import { currentUid } from './fb/auth';
import { addDoc, collection, db, deleteDoc, doc, getDoc, setDoc, updateDoc } from './fb/firestore';
import { callable as call } from './fb/functions';
import type { LatLng } from './geo';
import type { Address, Area, Coupon, FeedbackDoc, KycFileDoc, KycFileKind, ReferralConfig, ShiftDoc } from './types';

/* ---------- payments ---------- */

export type OrderResult = { bookingId: string; orderId: string; amount: number; currency: 'INR'; keyId: string; rewardUsed: number };
export const createOrder = call<{
  tasks: string[]; durationMin: number; addressId: string;
  scheduledFor: number | null; preferredPartnerId?: string; coupon?: string; useRewards?: boolean;
}, OrderResult>('createOrder');

export const verifyPayment = call<{ bookingId: string; paymentId: string; orderId: string; signature: string }, { ok: true }>('verifyPayment');

export const createBalanceOrder = call<{ bookingId: string; tip: number }, OrderResult>('createBalanceOrder');
export const verifyBalancePayment = call<{ bookingId: string; paymentId: string; orderId: string; signature: string }, { ok: true }>('verifyBalancePayment');

/* ---------- notifications ---------- */

/** Links this phone's Expo push address to the signed-in account (and unlinks it from anyone else). */
export const savePushToken = call<{ token: string; platform?: string }, { ok: true }>('savePushToken');
export const removePushToken = call<{ token: string }, { ok: true }>('removePushToken');
export type Audience = 'all' | 'customers' | 'experts';
export const sendBroadcast = call<{ title: string; body: string; audience: Audience; open?: string }, { recipients: number; pushed: number }>('sendBroadcast');

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

/* ---------- coupons, areas, waitlist ---------- */

export const previewCoupon = call<{ code: string; price: number }, { code: string; title: string; amount: number }>('previewCoupon');
/** Of the given start times, the ones with a free, skilled expert near this address. */
export const slotAvailability = call<{ tasks: string[]; addressId: string; durationMin: number; times: number[] }, { free: number[]; experts: number }>('slotAvailability');
export type CouponInfo = {
  code: string; title: string; description: string; type: 'flat' | 'percent'; value: number;
  maxDiscount: number | null; minOrder: number | null; endsAt: number | null; firstOrderOnly: boolean;
};
/** Coupons that fit this booking (with the saving) and the ones that do not yet (with why). */
export const listMyCoupons = call<{ price: number }, { coupons: (CouponInfo & { amount: number })[]; unavailable?: (CouponInfo & { reason: string })[] }>('listMyCoupons');
/** Referral codes (customers only): check whose code it is, then attach it once, before the first booking. */
type ReferralOffer = { ok: true; referrerName: string; reward: number; signupReward: number };
export const checkReferralCode = call<{ code: string }, ReferralOffer>('checkReferralCode');
export const applyReferral = call<{ code: string }, ReferralOffer>('applyReferral');
/** How many people are already waiting within 3 km of a spot (only the count). */
export const waitlistNear = call<{ at: LatLng }, { near: number }>('waitlistNear');
export const joinWaitlist = call<{ at: LatLng; line?: string; city?: string }, { ok: true; served: boolean; opensAt?: number | null; areaName?: string | null; phone?: string }>('joinWaitlist');

/* ---------- expert sign-up and wallet ---------- */

export const submitKyc = call<{
  fullName: string; dob: string; gender?: string; homeAddress: string; areaId: string; skills: string[]; aadhaar: string; consent: boolean;
}, { ok: true }>('submitKyc');
export const setPayoutMethod = call<
  { type: 'upi'; upi: string; holderName: string } | { type: 'bank'; holderName: string; ifsc: string; accountNumber: string },
  { ok: true; label: string }>('setPayoutMethod');
export const setAutoPayout = call<{ on: boolean }, { ok: true }>('setAutoPayout');
export const withdraw = call<Record<string, never>, { ok: true; amount: number; status: string }>('withdraw');

/** Saves one Aadhaar photo or the selfie (a small base64 JPEG) where only she and ops can read it. */
export async function uploadKycFile(kind: KycFileKind, img: { base64: string; width: number; height: number }) {
  const uid = currentUid(); if (!uid) throw new Error('Not signed in');
  const f: KycFileDoc = {
    partnerId: uid, kind, data: img.base64, mime: 'image/jpeg', bytes: Math.round((img.base64.length * 3) / 4),
    width: img.width, height: img.height, uploadedAt: Date.now(),
  };
  await setDoc(doc(db(), `kycFiles/${uid}_${kind}`), f);
}

/* ---------- admin ---------- */

export const adminForceAssign = call<{ bookingId: string; partnerId?: string }, { ok: true }>('adminForceAssign');
export const adminCancelRefund = call<{ bookingId: string }, { refunded: number }>('adminCancelRefund');
export const adminReleaseEarning = call<{ bookingId: string }, { ok: true }>('adminReleaseEarning');
export const adminHoldEarning = call<{ bookingId: string; reason: string }, { ok: true }>('adminHoldEarning');
export const adminPayoutNow = call<{ partnerId: string }, { ok: true; amount: number }>('adminPayoutNow');
export const adminReviewKyc = call<{ partnerId: string; decision: 'approve' | 'reject'; reason?: string }, { ok: true }>('adminReviewKyc');
export const adminUpdatePartner = call<{ partnerId: string; suspended?: boolean; reason?: string; areaId?: string }, { ok: true }>('adminUpdatePartner');
export const adminMarkWaitlist = call<{ ids: string[]; status: 'notified' | 'waiting' | 'removed' }, { ok: true; count: number }>('adminMarkWaitlist');
export const adminGiveCredit = call<{ userId: string; amount: number; note?: string }, { ok: true }>('adminGiveCredit');
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

/* ---------- ops: direct writes the rules allow for admins ---------- */

export async function saveArea(id: string | null, a: Omit<Area, 'createdAt'> & { createdAt?: number }) {
  const ref = id ? doc(db(), `areas/${id}`) : doc(collection(db(), 'areas'));
  await setDoc(ref, { ...a, createdAt: a.createdAt ?? Date.now(), updatedAt: Date.now() });
  return ref.id;
}
export const deleteArea = (id: string) => deleteDoc(doc(db(), `areas/${id}`));

/** Coupon codes are the document id, upper-case with no spaces. */
export const couponId = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');
export async function saveCoupon(c: Coupon) {
  const code = couponId(c.code);
  await setDoc(doc(db(), `coupons/${code}`), { ...c, code, updatedAt: Date.now() });
}
export const deleteCoupon = (code: string) => deleteDoc(doc(db(), `coupons/${couponId(code)}`));
export const saveReferralConfig = (c: ReferralConfig) => setDoc(doc(db(), 'config/referral'), { ...c, updatedAt: Date.now() });
