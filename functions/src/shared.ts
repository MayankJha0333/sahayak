import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { LatLng } from './geo';
import type { AreaShape } from './areaGeo';

// Every module imports this first, so the app and region are set before any function is defined.
if (getApps().length === 0) initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 20 });

export const db = getFirestore();
export const onEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

export const uid = (r: CallableRequest<unknown>) => {
  if (!r.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return r.auth.uid;
};
export const must = <T>(v: T | undefined | null, msg: string): T => { if (v == null) throw new HttpsError('failed-precondition', msg); return v; };
export async function isAdmin(u: string) { return (await db.collection('admins').doc(u).get()).exists; }
export async function requireAdmin(r: CallableRequest<unknown>) {
  const u = uid(r);
  if (!(await isAdmin(u))) throw new HttpsError('permission-denied', 'Admins only.');
  return u;
}

export type KycStatus = 'not_started' | 'submitted' | 'approved' | 'rejected';
/** Identity check for an expert. Only the last 4 digits of her Aadhaar are ever stored. */
export type Kyc = {
  status: KycStatus;
  fullName?: string; dob?: string; gender?: string; homeAddress?: string;
  aadhaarLast4?: string; aadhaarHash?: string;
  submittedAt?: number; reviewedAt?: number; reviewedBy?: string; rejectReason?: string;
  /** Aadhaar photos and selfie are deleted this long after approval. */
  filesDeleteAt?: number; filesDeleted?: boolean;
};
/** Where her withdrawals go: a RazorpayX fund account. We keep only masked details. */
export type PayoutMethod = {
  type: 'upi' | 'bank'; label: string; holderName: string;
  upi?: string; ifsc?: string; last4?: string; bankName?: string;
  contactId: string; fundAccountId: string; addedAt: number;
};
export type PartnerDoc = {
  name: string; initials: string; phone?: string; rating: number; jobs: number; skills: string[]; hub: string; onShift: boolean;
  reliability: number; onTime: number; at: LatLng;
  bot?: boolean; referralEarned?: number; firstJobDone?: boolean; referredBy?: string;
  /** Set only by ops after the Aadhaar check. Unverified experts never see jobs. */
  verified?: boolean; suspended?: boolean; suspendReason?: string;
  kyc?: Kyc; areaId?: string;
  payoutMethod?: PayoutMethod; payoutContactId?: string;
  /** Weekly Monday payout of everything available. On unless she turns it off. */
  autoPayout?: boolean;
};

/** Experts who may be offered work: checked by ops (demo experts are always allowed) and not suspended. */
export const canWork = (p: PartnerDoc) => (p.verified === true || p.bot === true) && !p.suspended;

/** Where we serve. `shape: 'border'` areas follow a real state / district / city border from OpenStreetMap. */
export type Area = AreaShape & {
  name: string; city: string; state?: string;
  level?: 'state' | 'district' | 'subdistrict' | 'city' | 'place'; osmId?: number;
  /** Where a pin area came from, e.g. "Patel Nagar · West Delhi, Delhi" — shown to ops only. */
  place?: string;
  /** Bookings are on. */
  active: boolean;
  /** Launch date (ms). In the future: "coming soon" — customers there see the date. Once it passes, the area serves by itself. */
  opensAt?: number | null;
  createdAt: number; updatedAt?: number;
};
