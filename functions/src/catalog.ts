/**
 * Prices are decided here, never on the phone. Keep in step with src/lib/mock.ts.
 */
export const DURATIONS = [30, 60, 90, 120, 180];
export const PRICE_BY_MIN: Record<number, number> = { 30: 99, 60: 169, 90: 239, 120: 299, 180: 429 };
export const priceForMinutes = (mins: number) => PRICE_BY_MIN[mins];

export type Service = { slug: string; name: string; skill: string; includes: string[] };

/** Tasks the expert can do inside the booked time. Price depends only on the time. */
export const SERVICES: Service[] = [
  { slug: 'sweep-mop', name: 'Sweep & mop', skill: 'cleaning', includes: ['Sweep every room', 'Mop with your cleaner', 'Dust skirting and sills', 'Empty the bins'] },
  { slug: 'dishes', name: 'Dishes', skill: 'cleaning', includes: ['Wash all utensils', 'Scrub the sink', 'Stack and put away', 'Wipe the slab'] },
  { slug: 'kitchen', name: 'Kitchen deep clean', skill: 'kitchen', includes: ['Counter, stove and sink scrub', 'Dishes washed and stacked', 'Floor sweep and mop', 'Bin emptied'] },
  { slug: 'bathroom', name: 'Bathroom', skill: 'bathroom', includes: ['Tiles and floor scrub', 'Basin, mirror and taps', 'Toilet cleaned and disinfected', 'Bin emptied'] },
  { slug: 'laundry', name: 'Laundry & fold', skill: 'laundry', includes: ['Sort and machine wash', 'Hang or tumble dry', 'Fold and put away', 'Light ironing'] },
  { slug: 'cooking', name: 'Cooking help', skill: 'cooking', includes: ['Chop and prep', 'Cook up to 3 dishes', 'Clean as you go', 'Store leftovers'] },
];

export const service = (slug: string) => SERVICES.find((s) => s.slug === slug);
/** Every skill the chosen tasks need; a partner must have all of them. */
export const skillsFor = (slugs: string[]) => [...new Set(slugs.map((s) => service(s)?.skill ?? 'cleaning'))];

export const VISIT_FEE = 0;
export const OVERTIME_PER_MIN = 3;
export const LATE_CANCEL_FEE = 49;
/** Working hours in India time: a visit can start from 8 AM up to 7 PM. Mirrors src/lib/mock.ts. */
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 19;
/** Minutes since midnight in India (UTC+5:30), whatever time zone the server runs in. */
export const istMinutes = (ms: number) => { const d = new Date(ms + 330 * 60_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export const isOpenAt = (ms: number) => { const m = istMinutes(ms); return m >= OPEN_HOUR * 60 && m <= CLOSE_HOUR * 60; };
export const FIRST_COUPON = { code: 'FIRST50', amount: 50 };
export const REFERRAL_REWARD = 100;
export const PARTNER_SHARE = 0.62;

export const STAGE1_MS = 20_000;
export const STAGE2_MS = 25_000;
export const GIVE_UP_MS = 90_000;
export const RADII_M = [1500, 2500, 3000];
