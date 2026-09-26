/**
 * LOCAL EMULATOR ONLY: fills the empty test database with realistic sample data so every admin page
 * has something to show — experts at each stage (one waiting with sample ID photos), bookings over the
 * last week, payouts that worked and one that failed, a coupon, waitlist entries and referrals.
 * Writes through the emulator's REST API as "owner" (bypasses security rules), which only works on the emulator.
 * Everything it creates is clearly fake (names end in "(test)", documents say TEST CARD).
 */
import { USE_EMULATORS } from './firebase';

type V = string | number | boolean | null | V[] | { [k: string]: V };
const toValue = (v: V): Record<string, unknown> => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
};

const HOST = `http://${window.location.hostname || '127.0.0.1'}:8080/v1/projects/demo-sahayak/databases/(default)/documents`;
async function put(path: string, data: Record<string, V>) {
  const r = await fetch(`${HOST}/${path}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }),
  });
  if (!r.ok) throw new Error(`Could not write ${path}: ${r.status}`);
}

/** A plainly fake ID-card-sized picture (or a face placeholder) as base64 JPEG, drawn on a canvas. */
function fakePhoto(kind: 'front' | 'back' | 'selfie', name: string): { data: string; width: number; height: number } {
  const selfie = kind === 'selfie';
  const c = document.createElement('canvas');
  c.width = selfie ? 480 : 640; c.height = selfie ? 600 : 400;
  const g = c.getContext('2d')!;
  g.fillStyle = selfie ? '#d9d2c7' : '#f3efe6'; g.fillRect(0, 0, c.width, c.height);
  if (selfie) {
    g.fillStyle = '#8a6a55'; g.beginPath(); g.arc(240, 250, 120, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5b4a3f'; g.fillRect(90, 420, 300, 180);
  } else {
    g.fillStyle = '#e46b3a'; g.fillRect(0, 0, c.width, 56); g.fillStyle = '#2d6a3e'; g.fillRect(0, c.height - 40, c.width, 40);
    g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.fillText('TEST CARD — NOT A REAL AADHAAR', 24, 38);
    g.fillStyle = '#333'; g.font = '22px sans-serif';
    if (kind === 'front') {
      g.fillStyle = '#bbb'; g.fillRect(30, 90, 140, 170);
      g.fillStyle = '#333'; g.fillText(name, 200, 120); g.fillText('DOB: 12/04/1990', 200, 160); g.fillText('Female', 200, 200);
      g.font = 'bold 30px monospace'; g.fillText('XXXX XXXX 2346', 200, 300);
    } else {
      g.fillText('Address: House 12, Sector 45,', 30, 130); g.fillText('Gurugram, Haryana 122003', 30, 170);
      g.font = 'bold 30px monospace'; g.fillText('XXXX XXXX 2346', 30, 300);
    }
  }
  return { data: c.toDataURL('image/jpeg', 0.7).split(',')[1], width: c.width, height: c.height };
}

export async function loadTestData() {
  if (!USE_EMULATORS) throw new Error('Test data can only be loaded on the local emulator.');
  const now = Date.now(), H = 3_600_000, D = 24 * H;
  const GGN = { lat: 28.4595, lng: 77.0266 };
  const near = (dLat: number, dLng: number) => ({ lat: Number((GGN.lat + dLat).toFixed(5)), lng: Number((GGN.lng + dLng).toFixed(5)) });
  const writes: Promise<void>[] = [];
  const w = (path: string, data: Record<string, V>) => writes.push(put(path, data));

  // Customers
  const customers = [
    { id: 'test-cust-priya', name: 'Priya Sharma (test)', phone: '+919800000011', code: 'PRIYA11', rewards: 50, done: true },
    { id: 'test-cust-rahul', name: 'Rahul Mehta (test)', phone: '+919800000012', code: 'RAHUL12', rewards: 0, done: true },
    { id: 'test-cust-anita', name: 'Anita Kapoor (test)', phone: '+919800000013', code: 'ANITA13', rewards: 100, done: false },
  ];
  customers.forEach((c, i) => w(`users/${c.id}`, {
    role: 'customer', phone: c.phone, name: c.name, rewards: c.rewards, referralCode: c.code, firstBookingDone: c.done,
    createdAt: now - (20 - i * 5) * D, ...(i === 1 ? { referredBy: 'PRIYA11' } : {}),
  }));

  // Experts at every stage
  const base = { rating: 4.7, jobs: 0, skills: ['cleaning', 'kitchen', 'bathroom', 'laundry'], hub: 'Gurugram', onShift: false, reliability: 0.95, onTime: 0.94, createdAt: now - 10 * D };
  w('partners/test-exp-kavita', {
    ...base, name: 'Kavita Devi (test)', initials: 'KD', phone: '+919811111111', jobs: 42, rating: 4.8, onShift: true, at: near(0.01, 0.02), verified: true,
    kyc: { status: 'approved', fullName: 'Kavita Devi (test)', dob: '1988-03-12', aadhaarLast4: '2346', homeAddress: 'House 4, Sector 45, Gurugram', submittedAt: now - 9 * D, reviewedAt: now - 8 * D },
    payoutMethod: { type: 'upi', label: 'kav•••@okaxis', holderName: 'Kavita Devi', addedAt: now - 8 * D }, autoPayout: true,
  });
  w('partners/test-exp-sunita', {
    ...base, name: 'Sunita Rani (test)', initials: 'SR', phone: '+919822222222', at: near(-0.02, 0.01),
    kyc: { status: 'submitted', fullName: 'Sunita Rani (test)', dob: '1992-07-21', gender: 'Female', aadhaarLast4: '2346', homeAddress: 'House 12, Sector 45, Gurugram, Haryana 122003', submittedAt: now - 3 * H },
  });
  (['front', 'back', 'selfie'] as const).forEach((k) => {
    const p = fakePhoto(k, 'Sunita Rani (test)');
    w(`kycFiles/test-exp-sunita_${k === 'front' ? 'aadhaarFront' : k === 'back' ? 'aadhaarBack' : 'selfie'}`, {
      partnerId: 'test-exp-sunita', kind: k === 'front' ? 'aadhaarFront' : k === 'back' ? 'aadhaarBack' : 'selfie', ...p, uploadedAt: now - 3 * H,
    });
  });
  w('partners/test-exp-rekha', {
    ...base, name: 'Rekha (test)', initials: 'R', phone: '+919833333333', at: near(0.03, -0.01),
    kyc: { status: 'rejected', fullName: 'Rekha (test)', aadhaarLast4: '1188', submittedAt: now - 2 * D, reviewedAt: now - D, rejectReason: 'Aadhaar photo is blurry — retake it in good light' },
  });
  w('partners/test-exp-meena', {
    ...base, name: 'Meena (test)', initials: 'M', phone: '+919844444444', jobs: 11, at: near(-0.01, -0.03), verified: true, suspended: true, suspendReason: 'Missed 3 visits in a row',
    kyc: { status: 'approved', fullName: 'Meena (test)', aadhaarLast4: '4410', submittedAt: now - 30 * D, reviewedAt: now - 29 * D },
  });

  // Bookings over the last 7 days, plus one live, one that found nobody and one cancelled
  const addr = (i: number) => ({ line1: `T-${i}, Flat ${100 + i}`, line2: 'Sector 52, Gurugram', label: 'Home', at: near(-0.015 + i * 0.002, 0.01) });
  const plan: [number, string, string][] = [
    [6, 'completed', 'test-cust-priya'], [5, 'completed', 'test-cust-rahul'], [4, 'completed', 'test-cust-priya'], [3, 'completed', 'test-cust-rahul'],
    [2, 'completed', 'test-cust-priya'], [1, 'completed', 'test-cust-rahul'], [0, 'completed', 'test-cust-priya'], [0, 'in_progress', 'test-cust-rahul'],
    [0, 'no_match', 'test-cust-anita'], [1, 'cancelled', 'test-cust-anita'],
  ];
  plan.forEach(([daysAgo, status, cust], i) => {
    const id = `TEST${1000 + i}`, price = i % 2 ? 99 : 149, coupon = i === 2 || i === 5;
    const created = now - daysAgo * D - (i + 1) * H;
    w(`bookings/${id}`, {
      customerId: cust, tasks: ['Sweep and mop', 'Dishes'], durationMin: i % 2 ? 60 : 90, address: addr(i),
      price, discount: coupon ? 100 : 0, rewardUsed: 0, amountDue: price - (coupon ? 100 : 0), ...(coupon ? { couponCode: 'DIWALI100', couponDiscount: 100 } : {}),
      status, paid: true, partnerId: status === 'no_match' || status === 'cancelled' ? null : 'test-exp-kavita', createdAt: created, scheduledFor: null,
      ...(status === 'completed' ? { endedAt: created + 2 * H, rating: i === 3 ? 2 : 5 } : {}), extraMin: 0, tip: 0,
      razorpay: { orderId: `order_test${i}`, paymentId: `pay_test${i}`, ...(status === 'cancelled' ? { refundId: 'rfnd_test' } : {}) },
      dispatchLog: ['Paid', status === 'no_match' ? 'No expert accepted within 10 minutes' : 'Kavita Devi (test) accepted'],
    });
    if (status === 'completed') {
      w(`earnings/${id}`, {
        partnerId: 'test-exp-kavita', bookingId: id, total: Math.round(price * 0.62), createdAt: created + 2 * H,
        status: i === 3 ? 'on_hold' : i < 3 ? 'withdrawn' : 'earned', availableAt: created + 2 * H + D, ...(i === 3 ? { holdReason: 'Rated 2★ by the customer' } : {}),
      });
    }
  });

  // Payouts: one paid, one failed, one on its way
  w('withdrawals/test-wd-1', { partnerId: 'test-exp-kavita', partnerName: 'Kavita Devi (test)', amount: 390, status: 'paid', method: { type: 'upi', label: 'kav•••@okaxis' }, trigger: 'weekly', utr: 'TESTUTR0001', createdAt: now - 4 * D });
  w('withdrawals/test-wd-2', { partnerId: 'test-exp-meena', partnerName: 'Meena (test)', amount: 640, status: 'failed', method: { type: 'bank', label: 'HDFC ••4411' }, trigger: 'manual', error: 'Bank account is closed', createdAt: now - 5 * H });
  w('withdrawals/test-wd-3', { partnerId: 'test-exp-kavita', partnerName: 'Kavita Devi (test)', amount: 148, status: 'processing', method: { type: 'upi', label: 'kav•••@okaxis' }, trigger: 'manual', createdAt: now - 10 * 60_000 });

  // A coupon, the referral settings and a couple of referrals
  w('coupons/DIWALI100', { code: 'DIWALI100', title: '₹100 off for Diwali', type: 'flat', value: 100, minOrder: 150, perUserLimit: 1, active: true, public: true, used: 2, createdAt: now - 7 * D, startsAt: null, endsAt: now + 20 * D });
  w('config/referral', { active: true, customerReward: 100, partnerReward: 150, updatedAt: now });
  w('referrals/test-ref-1', { referrerId: 'test-cust-priya', refereeId: 'test-cust-rahul', side: 'customer', name: 'Rahul Mehta (test)', phone: '+919800000012', status: 'joined', invitedAt: now - 16 * D, joinedAt: now - 15 * D, reward: 100 });
  w('referrals/test-ref-2', { referrerId: 'test-cust-priya', side: 'customer', name: 'Neha (test)', phone: '+919800000019', status: 'invited', invitedAt: now - 2 * D, reward: 100 });

  // People waiting outside our areas
  const waiting: [string, string, string, number, number, string][] = [
    ['test-wl-1', 'Neha Gupta (test)', 'Patel Nagar, New Delhi', 28.6519, 77.159, 'New Delhi'],
    ['test-wl-2', 'Arjun Rao (test)', 'Sector 21, Faridabad', 28.3915, 77.3176, 'Faridabad'],
    ['test-wl-3', 'Kiran (test)', 'Sector 62, Noida', 28.6273, 77.3725, 'Noida'],
    ['test-wl-4', 'Vikram Rao (test)', 'Koramangala, Bengaluru', 12.9352, 77.6245, 'Bengaluru'],
  ];
  waiting.forEach(([id, name, line, lat, lng, city], i) => w(`waitlist/${id}`, {
    userId: id, name, phone: `+91980000002${i}`, role: 'customer', at: { lat, lng }, line, city, status: 'waiting', createdAt: now - (i + 1) * 7 * H, updatedAt: now,
  }));

  await Promise.all(writes);
  return writes.length;
}
