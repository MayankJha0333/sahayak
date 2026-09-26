import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { PARTNER_SHARE, service } from './catalog';
import { distanceM, type LatLng } from './geo';
import { db, requireAdmin, uid, type PartnerDoc } from './shared';

/**
 * Notifications, two ways at once:
 *  1. An inbox row in notifications/{uid}/items — the bell in the app reads these, so nothing is lost
 *     even when push is off or the app runs in Expo Go.
 *  2. A phone push through Expo's push service to every device the person signed in on (pushTokens/{uid}).
 */

export type NoticeKind = 'booking' | 'job' | 'offer' | 'account' | 'promo';
export type Notice = {
  title: string; body: string; kind: NoticeKind;
  /** Screen the app opens when the notice is tapped, e.g. /customer/track/abc. */
  link?: string; bookingId?: string; broadcastId?: string;
};

const inbox = (u: string) => db.collection('notifications').doc(u).collection('items');
const tokensRef = (u: string) => db.collection('pushTokens').doc(u);
const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
const isExpoToken = (t: string) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);

const clean = (n: Notice) => Object.fromEntries(Object.entries(n).filter(([, v]) => v !== undefined && v !== ''));

/** Put the notice in each person's inbox and push it to their phones. Never throws: a notice must not break a booking. */
export async function notify(userIds: (string | undefined | null)[], n: Notice) {
  const ids = [...new Set(userIds.filter((u): u is string => Boolean(u)))];
  if (!ids.length) return { stored: 0, pushed: 0 };
  const createdAt = Date.now();
  try {
    for (let i = 0; i < ids.length; i += 400) {
      const batch = db.batch();
      ids.slice(i, i + 400).forEach((u) => batch.set(inbox(u).doc(), { ...clean(n), read: false, createdAt }));
      await batch.commit();
    }
  } catch (e) {
    logger.error('notify: could not write inbox', e);
  }
  const pushed = await push(ids, n).catch((e) => { logger.warn('notify: push failed', e); return 0; });
  return { stored: ids.length, pushed };
}

type Ticket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

/** Sends to Expo's push service, 100 messages per request, and forgets tokens of uninstalled apps. */
async function push(ids: string[], n: Notice) {
  const owners = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 300) {
    const snaps = await db.getAll(...ids.slice(i, i + 300).map(tokensRef));
    snaps.forEach((s) => ((s.data()?.tokens ?? []) as string[]).filter(isExpoToken).forEach((t) => owners.set(t, s.id)));
  }
  const tokens = [...owners.keys()];
  if (!tokens.length) return 0;

  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  // Only needed when "enhanced push security" is on in the Expo account.
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  let ok = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const messages = chunk.map((to) => ({
      to, title: n.title, body: n.body, sound: 'default', priority: 'high',
      // Android: job offers ring on their own loud channel; everything else on the default one.
      channelId: n.kind === 'offer' ? 'jobs' : 'default',
      data: { link: n.link ?? null, kind: n.kind, bookingId: n.bookingId ?? null },
    }));
    const res = await fetch(EXPO_PUSH, { method: 'POST', headers, body: JSON.stringify(messages) });
    if (!res.ok) { logger.warn('Expo push refused', res.status, await res.text()); continue; }
    const tickets = ((await res.json()) as { data?: Ticket[] }).data ?? [];
    const dead: string[] = [];
    tickets.forEach((t, k) => {
      if (t.status === 'ok') ok++;
      else if (t.details?.error === 'DeviceNotRegistered') dead.push(chunk[k]);
      else logger.warn('Expo push error', t.message);
    });
    await Promise.all(dead.map((t) => tokensRef(owners.get(t)!).set({ tokens: FieldValue.arrayRemove(t) }, { merge: true })));
  }
  return ok;
}

/* ------------------------------------------------------------------ */
/* devices                                                             */
/* ------------------------------------------------------------------ */

/** The app calls this after the person allows notifications. One phone belongs to one account at a time. */
export const savePushToken = onCall<{ token: string; platform?: string }>(async (r) => {
  const u = uid(r);
  const token = String(r.data?.token ?? '');
  if (!isExpoToken(token)) throw new HttpsError('invalid-argument', 'That is not a push token.');
  const others = await db.collection('pushTokens').where('tokens', 'array-contains', token).get();
  await Promise.all(others.docs.filter((d) => d.id !== u).map((d) => d.ref.update({ tokens: FieldValue.arrayRemove(token) })));
  await tokensRef(u).set({ tokens: FieldValue.arrayUnion(token), platform: r.data.platform ?? null, updatedAt: Date.now() }, { merge: true });
  return { ok: true as const };
});

/** Called on sign-out, so the next person on this phone does not get the last one's notices. */
export const removePushToken = onCall<{ token: string }>(async (r) => {
  const u = uid(r);
  await tokensRef(u).set({ tokens: FieldValue.arrayRemove(String(r.data?.token ?? '')), updatedAt: Date.now() }, { merge: true });
  return { ok: true as const };
});

/* ------------------------------------------------------------------ */
/* booking notices                                                     */
/* ------------------------------------------------------------------ */

type BookingLite = {
  customerId: string; partnerId?: string; status: string; tasks: string[]; durationMin: number; price: number;
  scheduledFor: number | null; amountDue: number; cancelFee?: number; paid: boolean; endsAt?: number;
  address: { label: string; line2: string; at: LatLng }; eta?: { minutes: number }; dispatchLog?: string[];
};

const IST = 'Asia/Kolkata';
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true });
const dayTime = (ms: number) => new Date(ms).toLocaleString('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const tasksText = (b: BookingLite) => b.tasks.map((t) => service(t)?.name ?? t).join(' + ');
const area = (b: BookingLite) => b.address.line2.split(',')[0]?.trim() || b.address.label;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const firstName = (s?: string) => (s ?? 'Your expert').replace(/\s*\(.*\)\s*/, '').split(/\s+/)[0];

async function partnerOf(b: BookingLite) {
  if (!b.partnerId) return undefined;
  return (await db.collection('partners').doc(b.partnerId).get()).data() as PartnerDoc | undefined;
}

/** Called from onBookingWritten: tells the customer and the expert what just changed. Demo experts get nothing. */
export async function bookingNotices(id: string, before: BookingLite | undefined, after: BookingLite) {
  const was = before?.status;
  const now = after.status;
  if (was === now) return;
  const track = `/customer/track/${id}`;
  const expert = await partnerOf(after);
  const expertId = expert && !expert.bot ? after.partnerId : undefined;
  const her = firstName(expert?.name);

  if (now === 'matching' && (was === undefined || was === 'payment_pending')) {
    await notify([after.customerId], { kind: 'booking', bookingId: id, link: `/customer/matching/${id}`,
      title: 'Booking confirmed', body: `Payment received. We are finding the nearest expert for your ${tasksText(after)}.` });
  }

  if (now === 'assigned') {
    if (after.scheduledFor) {
      await notify([after.customerId], { kind: 'booking', bookingId: id, link: track,
        title: `Booked for ${dayTime(after.scheduledFor)}`,
        body: after.partnerId ? `${her} will come to your ${after.address.label} for ${tasksText(after)}.` : 'We are lining up an expert for your slot. We will tell you who is coming.' });
    } else {
      await notify([after.customerId], { kind: 'booking', bookingId: id, link: track,
        title: `${her} is on the way`, body: after.eta ? `She should reach in about ${after.eta.minutes} min. Keep your start code ready.` : 'Track her live in the app. Keep your start code ready.' });
    }
    // An instant job she accepted herself needs no ping; a reserved slot or an ops assignment does.
    const opsAssigned = (after.dispatchLog ?? []).includes('Assigned by ops');
    if (after.scheduledFor || opsAssigned) await notify([expertId], { kind: 'job', bookingId: id, link: `/partner/job/${id}`,
      title: after.scheduledFor ? `New booking · ${dayTime(after.scheduledFor)}` : 'New job assigned · go now',
      body: `${tasksText(after)} · ${after.durationMin} min at ${area(after)}. You earn ${inr(after.price * PARTNER_SHARE)}.` });
  }

  if (now === 'arrived') {
    await notify([after.customerId], { kind: 'booking', bookingId: id, link: track,
      title: `${her} has arrived`, body: 'Share your 4-digit start code with her to begin.' });
  }

  if (now === 'in_progress') {
    await notify([after.customerId], { kind: 'booking', bookingId: id, link: track,
      title: 'Your visit has started', body: after.endsAt ? `Paid time ends at ${clock(after.endsAt)}. You can add more time from the app.` : 'You can add more time from the app.' });
  }

  if (now === 'completed') {
    await notify([after.customerId], { kind: 'booking', bookingId: id, link: `/customer/rate/${id}`,
      title: 'All done!', body: `How did ${her} do? Rate your visit — it takes 5 seconds.` });
    await notify([expertId], { kind: 'job', bookingId: id, link: '/partner/earnings',
      title: 'Job completed', body: `Well done! ${inr(after.price * PARTNER_SHARE)} is on its way to your wallet.` });
  }

  if (now === 'cancelled' && was && ['matching', 'assigned', 'arrived', 'in_progress', 'no_match'].includes(was)) {
    const back = Math.max(0, after.amountDue - (after.cancelFee ?? 0));
    await notify([after.customerId], { kind: 'booking', bookingId: id, link: '/customer/bookings',
      title: 'Booking cancelled',
      body: after.paid && back > 0 ? `${inr(back)} is on its way back to you. It reaches you in 5–7 working days.` : 'Your booking was cancelled.' });
    await notify([expertId], { kind: 'job', bookingId: id, link: '/partner',
      title: 'Job cancelled', body: `The ${after.scheduledFor ? dayTime(after.scheduledFor) + ' ' : ''}job at ${area(after)} was cancelled. You do not need to go.` });
  }

  if (now === 'no_match') {
    await notify([after.customerId], { kind: 'booking', bookingId: id, link: '/customer/bookings',
      title: 'No expert free right now', body: 'Sorry! Your full refund has started. Please try again in a few minutes.' });
  }
}

/**
 * New job offers: ring each expert's phone. Called by dispatch right after the offers are written (not from a
 * separate trigger), because an offer only stays open for about 20 seconds.
 */
export async function offerNotices(bookingId: string, b: BookingLite, experts: { id: string; d: PartnerDoc }[]) {
  await Promise.all(experts.filter((p) => !p.d.bot).map((p) => {
    const far = p.d.at ? distanceM(p.d.at, b.address.at) : null;
    return notify([p.id], { kind: 'offer', bookingId, link: `/partner/offer/${bookingId}`,
      title: `New job · earn ${inr(b.price * PARTNER_SHARE)}`,
      body: `${tasksText(b)} · ${b.durationMin} min${far != null ? ` · ${(far / 1000).toFixed(1)} km away` : ''} at ${area(b)}. Tap to accept before it goes to someone else.` });
  }));
}

/* ------------------------------------------------------------------ */
/* ops broadcasts                                                      */
/* ------------------------------------------------------------------ */

export type Audience = 'all' | 'customers' | 'experts';
/** Where a tap on the broadcast takes people. Customer screens for customers, expert screens for experts. */
const LINKS: Record<string, { customer: string; partner: string }> = {
  home: { customer: '/customer', partner: '/partner' },
  book: { customer: '/customer/book/any', partner: '/partner' },
  refer: { customer: '/customer/refer', partner: '/partner' },
  earnings: { customer: '/customer', partner: '/partner/earnings' },
};

/** Ops sends one message to everyone, only customers, or only experts. Kept in broadcasts/ for the history list. */
export const sendBroadcast = onCall<{ title: string; body: string; audience: Audience; open?: string }>({ timeoutSeconds: 300 }, async (r) => {
  const admin = await requireAdmin(r);
  const title = String(r.data?.title ?? '').trim();
  const body = String(r.data?.body ?? '').trim();
  const audience = r.data?.audience;
  if (title.length < 3 || title.length > 65) throw new HttpsError('invalid-argument', 'Give it a title of 3 to 65 characters.');
  if (body.length < 3 || body.length > 240) throw new HttpsError('invalid-argument', 'Write a message of 3 to 240 characters.');
  if (!['all', 'customers', 'experts'].includes(audience)) throw new HttpsError('invalid-argument', 'Pick who gets it.');
  const open = r.data.open && r.data.open in LINKS ? r.data.open : 'home';

  const users = await db.collection('users').select('role').get();
  const bots = new Set((await db.collection('partners').where('bot', '==', true).select().get()).docs.map((d) => d.id));
  const ids = users.docs
    .filter((d) => !bots.has(d.id) && d.id !== 'demo-customer')
    .filter((d) => audience === 'all' || (audience === 'customers' ? d.get('role') === 'customer' : d.get('role') === 'partner'))
    .map((d) => d.id);
  if (!ids.length) throw new HttpsError('failed-precondition', 'Nobody to send to yet.');

  const ref = db.collection('broadcasts').doc();
  await ref.set({ title, body, audience, open, sentBy: admin, createdAt: Date.now(), status: 'sending', recipients: ids.length });
  const byRole = new Map<string, string[]>();
  users.docs.filter((d) => ids.includes(d.id)).forEach((d) => { const k = d.get('role') === 'partner' ? 'partner' : 'customer'; byRole.set(k, [...(byRole.get(k) ?? []), d.id]); });
  let pushed = 0;
  for (const [role, group] of byRole) {
    const res = await notify(group, { kind: 'promo', title, body, link: LINKS[open][role as 'customer' | 'partner'], broadcastId: ref.id });
    pushed += res.pushed;
  }
  await ref.update({ status: 'sent', pushed, sentAt: Date.now() });
  return { recipients: ids.length, pushed };
});
