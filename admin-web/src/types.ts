import type { AreaShape } from './areaGeo';
export type LatLng = { lat: number; lng: number };
export type WithId<T> = T & { id: string };

export type Kyc = {
  status: 'not_started' | 'submitted' | 'approved' | 'rejected';
  fullName?: string; dob?: string; gender?: string; homeAddress?: string; aadhaarLast4?: string;
  submittedAt?: number; reviewedAt?: number; rejectReason?: string; filesDeleteAt?: number; filesDeleted?: boolean;
};
export type Partner = {
  name: string; initials: string; phone?: string; rating: number; jobs: number; skills: string[]; hub: string; onShift: boolean;
  reliability: number; onTime: number; at: LatLng; bot?: boolean; verified?: boolean; suspended?: boolean; suspendReason?: string;
  kyc?: Kyc; areaId?: string; autoPayout?: boolean;
  payoutMethod?: { type: 'upi' | 'bank'; label: string; holderName: string; addedAt: number };
};
export type KycFile = { partnerId: string; kind: 'aadhaarFront' | 'aadhaarBack' | 'selfie'; data: string; width: number; height: number; uploadedAt: number };
export type User = { role: string; phone: string; name: string; rewards: number; referralCode: string; referredBy?: string; firstBookingDone?: boolean; createdAt: number; addresses?: { at: LatLng; line1: string; line2: string }[] };
export type Booking = {
  customerId: string; tasks: string[]; durationMin: number; address: { line1: string; line2: string; label: string; at: LatLng };
  price: number; discount: number; rewardUsed: number; amountDue: number; couponCode?: string; couponDiscount?: number;
  status: string; paid: boolean; partnerId?: string; createdAt: number; scheduledFor: number | null; endedAt?: number; rating?: number;
  extraMin: number; tip: number; razorpay: { orderId: string; paymentId?: string; refundId?: string }; dispatchLog: string[];
};
export type Earning = { partnerId: string; bookingId: string; total: number; status: string; availableAt?: number; holdReason?: string; createdAt: number };
export type Withdrawal = {
  partnerId: string; partnerName: string; amount: number; status: 'processing' | 'paid' | 'failed';
  method: { type: 'upi' | 'bank'; label: string }; trigger: string; utr?: string | null; error?: string; createdAt: number;
};
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
export type Coupon = {
  code: string; title: string; description?: string; type: 'flat' | 'percent'; value: number; maxDiscount?: number; minOrder?: number;
  firstOrderOnly?: boolean; perUserLimit?: number; totalLimit?: number; used?: number; active: boolean; public?: boolean;
  startsAt?: number | null; endsAt?: number | null; createdAt: number;
};
export type Waitlist = { userId: string; name: string; phone: string; at: LatLng; line: string; city: string; status: 'waiting' | 'notified'; createdAt: number };
export type Referral = { referrerId: string; refereeId?: string; side: string; name: string; phone: string; status: string; invitedAt: number; joinedAt?: number; reward: number };
export type ReferralConfig = { active: boolean; customerReward: number; partnerReward: number };
