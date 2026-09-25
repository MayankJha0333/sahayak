import type { LatLng } from './geo';

export type ServiceIcon =
  | 'cleaning-services' | 'local-dining' | 'kitchen' | 'bathtub' | 'local-laundry-service' | 'restaurant';

/**
 * Pricing is by time, not by task. You book an expert for 30 minutes to 3 hours and she does
 * whatever is on your list in that time — sweep, dishes, bathroom, all of it. Same on the server.
 */
export const DURATIONS = [30, 60, 90, 120, 180] as const;
export const PRICE_BY_MIN: Record<number, number> = { 30: 99, 60: 169, 90: 239, 120: 299, 180: 429 };
export const priceForMinutes = (mins: number) => PRICE_BY_MIN[mins] ?? Math.round((mins / 60) * 169);

export type Service = {
  slug: string;
  name: string;
  blurb: string;
  typicalMin: number;  // what this task usually takes, used to suggest a duration
  includes: string[];
  excludes: string[];
  skill: string;
  emoji: string;
  icon: ServiceIcon;
};

/** The tasks an expert can take on. Kept as SERVICES so the rest of the app reads the same. */
export const SERVICES: Service[] = [
  {
    slug: 'sweep-mop', name: 'Sweep & mop', blurb: 'Floors across the whole house',
    typicalMin: 30, skill: 'cleaning', emoji: '\u{1F9F9}', icon: 'cleaning-services',
    includes: ['Sweep every room', 'Mop with your cleaner', 'Dust skirting and sills', 'Empty the bins'],
    excludes: ['Anything needing a ladder', 'Moving heavy furniture', 'Outside balconies and windows'],
  },
  {
    slug: 'dishes', name: 'Dishes', blurb: 'Washed, dried and stacked',
    typicalMin: 20, skill: 'cleaning', emoji: '\u{1F37D}', icon: 'local-dining',
    includes: ['Wash all utensils', 'Scrub the sink', 'Stack and put away', 'Wipe the slab'],
    excludes: ['Hand-wash of fragile crockery', 'Deep descaling'],
  },
  {
    slug: 'kitchen', name: 'Kitchen deep clean', blurb: 'Counters, stove, sink and floor',
    typicalMin: 45, skill: 'kitchen', emoji: '\u{1F373}', icon: 'kitchen',
    includes: ['Counter, stove and sink scrub', 'Dishes washed and stacked', 'Floor sweep and mop', 'Bin emptied'],
    excludes: ['Chimney or exhaust interiors', 'Inside the fridge', 'Anything needing a ladder'],
  },
  {
    slug: 'bathroom', name: 'Bathroom', blurb: 'Tiles, fittings and floor',
    typicalMin: 30, skill: 'bathroom', emoji: '\u{1F6BF}', icon: 'bathtub',
    includes: ['Tiles and floor scrub', 'Basin, mirror and taps', 'Toilet cleaned and disinfected', 'Bin emptied'],
    excludes: ['Drain unblocking', 'Grout resealing'],
  },
  {
    slug: 'laundry', name: 'Laundry & fold', blurb: 'Machine wash, dry and fold',
    typicalMin: 30, skill: 'laundry', emoji: '\u{1F9FA}', icon: 'local-laundry-service',
    includes: ['Sort and machine wash', 'Hang or tumble dry', 'Fold and put away', 'Light ironing'],
    excludes: ['Dry-clean-only items', 'Hand wash of delicates'],
  },
  {
    slug: 'cooking', name: 'Cooking help', blurb: 'Prep and cook a simple meal',
    typicalMin: 60, skill: 'cooking', emoji: '\u{1F35B}', icon: 'restaurant',
    includes: ['Chop and prep', 'Cook up to 3 dishes', 'Clean as you go', 'Store leftovers'],
    excludes: ['Grocery shopping', 'Party or bulk catering'],
  },
];

export const serviceBySlug = (slug: string) => SERVICES.find((s) => s.slug === slug) ?? SERVICES[0];

/** Suggested duration for a set of tasks: their typical minutes added up, rounded to an offered slot. */
export function suggestMinutes(taskSlugs: string[]) {
  const need = taskSlugs.reduce((n, t) => n + serviceBySlug(t).typicalMin, 0);
  return DURATIONS.find((d) => d >= need) ?? DURATIONS[DURATIONS.length - 1];
}

/** "Sweep & mop", "Sweep & mop + Dishes", "Sweep & mop + 2 more" */
export function tasksTitle(taskSlugs: string[]) {
  const names = taskSlugs.map((t) => serviceBySlug(t).name);
  if (names.length <= 2) return names.join(' + ');
  return `${names[0]} + ${names.length - 1} more`;
}

/** Works for new bookings (tasks) and older ones (serviceSlug + addonSlugs). */
export const bookingTasks = (b: { tasks?: string[]; serviceSlug?: string; addonSlugs?: string[] }) =>
  b.tasks && b.tasks.length ? b.tasks : [b.serviceSlug ?? SERVICES[0].slug, ...(b.addonSlugs ?? [])];
export const bookingTitle = (b: { tasks?: string[]; serviceSlug?: string; addonSlugs?: string[] }) => tasksTitle(bookingTasks(b));
/** Every checklist line across the booked tasks — the same list the expert ticks off. */
export const taskLines = (b: { tasks?: string[]; serviceSlug?: string; addonSlugs?: string[] }) =>
  bookingTasks(b).flatMap((t) => serviceBySlug(t).includes);

/** Legacy shape kept for callers that price a single task by time. */
export function priceFor(_s: Service, durationMin: number) { return priceForMinutes(durationMin); }

export const VISIT_FEE = 0;
export const OVERTIME_PER_MIN = 3;
export const LATE_CANCEL_FEE = 49;

/** The expert keeps 62% of the booked time and of every extra minute, plus all tips. Mirrors expertPay() on the server. */
export const PARTNER_SHARE = 0.62;
export const expertPay = (b: { price: number; extraMin: number; tip?: number }) => {
  const jobPay = Math.round(b.price * PARTNER_SHARE);
  const extraPay = Math.round(b.extraMin * OVERTIME_PER_MIN * PARTNER_SHARE);
  return { jobPay, extraPay, tip: b.tip ?? 0, total: jobPay + extraPay + (b.tip ?? 0) };
};

/** Working hours: a visit can start from 8 AM up to 7 PM (phone's local time, India). */
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 19;
export const HOURS_LABEL = '8 AM to 7 PM';
export const isOpenAt = (ms: number) => {
  const d = new Date(ms);
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= OPEN_HOUR * 60 && m <= CLOSE_HOUR * 60;
};

export type Partner = {
  id: string; name: string; initials: string; rating: number; jobs: number;
  skills: string[]; hub: string; onShift: boolean; shift: string;
  reliability: number; onTime: number; at: LatLng;
};

/** Home base for the demo: Sector 52, Gurugram. */
export const HOME: LatLng = { lat: 28.4419, lng: 77.0723 };

export const PARTNERS: Partner[] = [
  { id: 'SG-4471', name: 'Sunita Devi', initials: 'SD', rating: 4.9, jobs: 1240, skills: ['cleaning', 'kitchen', 'bathroom'], hub: 'Sector 45', onShift: true, shift: '7:00 AM - 11:00 AM', reliability: 0.96, onTime: 96, at: { lat: 28.4472, lng: 77.0661 } },
  { id: 'SG-1180', name: 'Meena Kumari', initials: 'MK', rating: 4.6, jobs: 880, skills: ['cleaning', 'laundry'], hub: 'DLF 3', onShift: true, shift: '7:00 AM - 11:00 AM', reliability: 0.91, onTime: 91, at: { lat: 28.4361, lng: 77.0808 } },
  { id: 'SG-3302', name: 'Anita Prasad', initials: 'AP', rating: 4.3, jobs: 410, skills: ['cleaning', 'bathroom'], hub: 'Sector 45', onShift: true, shift: '11:00 AM - 3:00 PM', reliability: 0.79, onTime: 79, at: { lat: 28.4509, lng: 77.0779 } },
  { id: 'SG-2210', name: 'Laxmi Sahu', initials: 'LS', rating: 4.7, jobs: 640, skills: ['cleaning', 'kitchen', 'cooking'], hub: 'Sector 45', onShift: true, shift: '7:00 AM - 11:00 AM', reliability: 0.93, onTime: 94, at: { lat: 28.4388, lng: 77.0602 } },
  { id: 'SG-5514', name: 'Rekha Kumari', initials: 'RK', rating: 4.5, jobs: 120, skills: ['cleaning'], hub: 'Sector 57', onShift: false, shift: 'off today', reliability: 0.88, onTime: 90, at: { lat: 28.4610, lng: 77.0890 } },
];

export type Address = { id: string; label: string; line1: string; line2: string; directions: string; at: LatLng };

export const ADDRESSES: Address[] = [
  { id: 'a1', label: 'Home', line1: 'B-1204, Tower B', line2: 'Palm Grove Residency, Sector 52', directions: 'Gate 2, tell the guard "Sahayak". Lift on the right.', at: HOME },
  { id: 'a2', label: 'Parents', line1: 'C-704', line2: 'Ridgewood Estate, DLF Phase 4', directions: 'Visitor parking, then Block C.', at: { lat: 28.4695, lng: 77.0836 } },
];

export type Plan = {
  id: string; name: string; blurb: string; serviceSlug: string; durationMin: number;
  days: number[]; visitsPerMonth: number; discountPct: number;
};

export const PLANS: Plan[] = [
  { id: 'daily-morning', name: 'Morning help', blurb: 'Every weekday morning, same expert', serviceSlug: 'sweep-mop', durationMin: 60, days: [1, 2, 3, 4, 5, 6], visitsPerMonth: 26, discountPct: 15 },
  { id: 'alt-days', name: 'Alternate days', blurb: 'Three visits a week', serviceSlug: 'sweep-mop', durationMin: 60, days: [1, 3, 5], visitsPerMonth: 13, discountPct: 10 },
  { id: 'kitchen-daily', name: 'Kitchen every day', blurb: 'Dishes and counters, daily', serviceSlug: 'kitchen', durationMin: 60, days: [0, 1, 2, 3, 4, 5, 6], visitsPerMonth: 30, discountPct: 18 },
  { id: 'weekend-deep', name: 'Weekend deep clean', blurb: 'Two hours every Saturday', serviceSlug: 'kitchen', durationMin: 120, days: [6], visitsPerMonth: 4, discountPct: 8 },
];

export function planPricing(plan: Plan) {
  const s = serviceBySlug(plan.serviceSlug);
  const perVisitFull = priceFor(s, plan.durationMin) + VISIT_FEE;
  const monthlyFull = perVisitFull * plan.visitsPerMonth;
  const monthly = Math.round((monthlyFull * (100 - plan.discountPct)) / 100);
  return { perVisitFull, monthlyFull, monthly, perVisit: Math.round(monthly / plan.visitsPerMonth), saving: monthlyFull - monthly };
}

export type Zone = { id: string; name: string; partners: number; jobsPerDay: number; ataMin: number; fillRate: number; health: 'healthy' | 'tight' | 'short' };

export const ZONES: Zone[] = [
  { id: 'sec52', name: 'Sector 52', partners: 68, jobsPerDay: 410, ataMin: 8.9, fillRate: 98, health: 'healthy' },
  { id: 'dlf3', name: 'DLF Phase 3', partners: 52, jobsPerDay: 330, ataMin: 10.4, fillRate: 96, health: 'healthy' },
  { id: 'sec57', name: 'Sector 57', partners: 29, jobsPerDay: 240, ataMin: 14.1, fillRate: 89, health: 'short' },
  { id: 'sec45', name: 'Sector 45', partners: 41, jobsPerDay: 300, ataMin: 11.2, fillRate: 94, health: 'tight' },
];

export const TASK_LISTS: Record<string, string[]> = Object.fromEntries(
  SERVICES.map((s) => [s.slug, s.includes]),
);
