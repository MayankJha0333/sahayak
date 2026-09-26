import type { LatLng } from './geo';
import type { AreaShape } from './areaGeo';

export type Role = 'customer' | 'partner' | 'admin';

export type Address = { id: string; label: string; line1: string; line2: string; directions: string; at: LatLng };

export type UserDoc = {
  role: Role;
  phone: string;
  name: string;
  /** Rupees off the next booking, earned from referrals. Not a wallet: nothing is topped up or withdrawn. */
  rewards: number;
  referredBy?: string;
  referralCode: string;
  addresses: Address[];
  defaultAddressId?: string;
  firstBookingDone?: boolean;
  createdAt: number;
};

export type PartnerDoc = {
  name: string;
  initials: string;
  phone?: string;
  rating: number;
  jobs: number;
  skills: string[];
  hub: string;
  onShift: boolean;
  shift: string;
  reliability: number;
  onTime: number;
  at: LatLng;
  bot?: boolean;
  /** Set only by ops after the Aadhaar check. Unverified experts cannot go online. */
  verified?: boolean;
  suspended?: boolean;
  suspendReason?: string;
  kyc?: Kyc;
  areaId?: string;
  payoutMethod?: PayoutMethod;
  /** Weekly Monday payout of everything available (on unless she turns it off). */
  autoPayout?: boolean;
  referralEarned?: number;
  firstJobDone?: boolean;
  referredBy?: string;
};

export type KycStatus = 'not_started' | 'submitted' | 'approved' | 'rejected';
export type Kyc = {
  status: KycStatus;
  fullName?: string; dob?: string; gender?: string; homeAddress?: string;
  /** Only the last 4 digits are ever stored. */
  aadhaarLast4?: string;
  submittedAt?: number; reviewedAt?: number; rejectReason?: string;
  filesDeleteAt?: number; filesDeleted?: boolean;
};
export type KycFileKind = 'aadhaarFront' | 'aadhaarBack' | 'selfie';
export type KycFileDoc = { partnerId: string; kind: KycFileKind; data: string; mime: string; bytes: number; width: number; height: number; uploadedAt: number };

export type PayoutMethod = {
  type: 'upi' | 'bank'; label: string; holderName: string;
  upi?: string; ifsc?: string; last4?: string; bankName?: string; addedAt: number;
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
  code: string; title: string; description?: string;
  type: 'flat' | 'percent'; value: number; maxDiscount?: number; minOrder?: number;
  firstOrderOnly?: boolean; perUserLimit?: number; totalLimit?: number; used?: number;
  active: boolean; public?: boolean; startsAt?: number | null; endsAt?: number | null; createdAt: number; updatedAt?: number;
};

export type WaitlistDoc = {
  userId: string; name: string; phone: string; role: string; at: LatLng; line: string; city: string;
  status: 'waiting' | 'notified'; createdAt: number; updatedAt: number; notifiedAt?: number;
  /** The "coming soon" area this address is in, and its launch date, when they joined. */
  soonAreaId?: string | null; opensAt?: number | null;
};

export type ReferralConfig = { active: boolean; customerReward: number; partnerReward: number };

export type WithdrawalDoc = {
  partnerId: string; partnerName: string; amount: number; earningIds: string[];
  status: 'processing' | 'paid' | 'failed';
  method: { type: 'upi' | 'bank'; label: string }; trigger: 'manual' | 'weekly' | 'admin';
  payoutId?: string; utr?: string | null; error?: string; createdAt: number; updatedAt: number; paidAt?: number;
};

export type BookingStatus =
  | 'payment_pending' | 'matching' | 'no_match' | 'assigned' | 'arrived'
  | 'in_progress' | 'completed' | 'cancelled';

export type BookingDoc = {
  customerId: string;
  /** What she does in the booked time. Price depends only on durationMin. */
  tasks: string[];
  serviceSlug: string;     // tasks[0], kept for older documents
  durationMin: number;
  addonSlugs: string[];    // tasks.slice(1), kept for older documents
  address: Address;
  price: number;         // for the time booked
  fee: number;
  discount: number;      // coupon + rewards
  rewardUsed: number;
  amountDue: number;     // rupees actually charged to Razorpay
  status: BookingStatus;
  paid: boolean;
  razorpay: { orderId: string; paymentId?: string; refundId?: string };
  balance?: { orderId: string; amount: number; paid: boolean; paymentId?: string };
  partnerId?: string;
  preferredPartnerId?: string;
  partnerAt?: LatLng;
  startCode: string;
  extraMin: number;
  tip: number;
  doneTasks: string[];
  dispatchLog: string[];
  createdAt: number;
  scheduledFor: number | null;
  assignedAt?: number;
  arrivedAt?: number;
  startedAt?: number;
  endedAt?: number;
  rating?: number;
  ratingTags?: string[];
  cancelFee?: number;
  autoCompleteAt?: number;
  /** End of the paid time; the session timer counts down to this. */
  endsAt?: number;
  /** Extra time bought (and paid for) during the visit. */
  extensions?: Extension[];
  pendingExtension?: { orderId: string; minutes: number; amount: number };
  /** Travel from the expert to the door, estimated when she was assigned. */
  eta?: { roadM: number; minutes: number; from: number; arriveBy: number; startBy: number };
  /** Scheduled visits: when she should set off. */
  leaveAt?: number;
  workedMin?: number;
  paymentError?: string;
  paidAt?: number;
  couponCode?: string;
  couponDiscount?: number;
};

export type Extension = { minutes: number; amount: number; orderId: string; paymentId: string; at: number };

/** One visit's pay in the expert's wallet. Withdrawable from `availableAt` unless on hold. */
export type EarningDoc = {
  partnerId: string; bookingId: string; jobPay: number; extraPay: number; tip: number; total: number;
  /** Older entries may say 'sent' (paid out) or 'awaiting_account' / 'failed' (still in the wallet). */
  status: 'earned' | 'on_hold' | 'withdrawn' | 'sent' | 'awaiting_account' | 'failed';
  availableAt?: number; withdrawalId?: string; holdReason?: string; createdAt: number; updatedAt: number;
};

export type OfferDoc = { bookingId: string; partnerId: string; stage: 1 | 2; expiresAt: number; createdAt: number };

export type ShiftDoc = {
  partnerId: string; day: string; start: string; end: string; pay: number; hub: string;
  taken: boolean; expectedJobs: number; demand: 'normal' | 'high';
};

export type ReferralDoc = {
  referrerId: string; refereeId?: string; side: 'customer' | 'partner'; name: string; phone: string;
  status: 'invited' | 'joined'; invitedAt: number; joinedAt?: number; reward: number;
};

export type FeedbackDoc = { userId: string; kind: 'feedback' | 'request' | 'problem'; text: string; bookingId?: string; at: number; /** Written by the server for a rating of 2★ or less. */ auto?: boolean };

export type WithId<T> = T & { id: string };
