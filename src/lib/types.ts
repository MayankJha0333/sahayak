import type { LatLng } from './geo';

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
  payout?: { accountId?: string; linkedAt?: number };
  referralEarned?: number;
  firstJobDone?: boolean;
  referredBy?: string;
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
};

export type Extension = { minutes: number; amount: number; orderId: string; paymentId: string; at: number };

/** The expert's payout for one visit (Razorpay Route transfers to her linked account). */
export type EarningDoc = {
  partnerId: string; bookingId: string; jobPay: number; extraPay: number; tip: number; total: number;
  status: 'awaiting_account' | 'sent' | 'on_hold' | 'failed';
  transfers: { id: string; amount: number; source: string }[];
  releaseAt?: number; error?: string; createdAt: number; updatedAt: number;
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
