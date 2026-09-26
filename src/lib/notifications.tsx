import { useRootNavigationState, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { useCollection } from './db';
import { db, doc, limit, orderBy, updateDoc } from './fb/firestore';
import { notif, registerForPush, remotePushOn } from './push';
import type { NoticeDoc, WithId } from './types';

/** The signed-in person's notices, newest first. */
export function useInbox() {
  const { user } = useAuth();
  return useCollection<NoticeDoc>(`notifications/${user?.uid ?? '_'}/items`,
    useMemo(() => [orderBy('createdAt', 'desc'), limit(60)], []), Boolean(user));
}

export const useUnreadCount = () => useInbox().rows.filter((n) => !n.read).length;

export async function markRead(uid: string, ids: string[]) {
  await Promise.all(ids.map((id) => updateDoc(doc(db(), `notifications/${uid}/items/${id}`), { read: true }).catch(() => undefined)));
}

/** Opens the screen a notice points to (links come from our own server). */
export function openNotice(router: ReturnType<typeof useRouter>, n: Pick<NoticeDoc, 'link'>) {
  if (n.link) router.push(n.link as Href);
}

/**
 * Mounted once at the root. After sign-in it asks for permission and links the phone for push.
 * When remote push cannot reach this phone (simulator, Expo Go on Android) it shows a banner itself
 * for each new notice. A tap on any banner opens the right screen and marks the notice read.
 */
export function NotificationBridge() {
  const { user } = useAuth();
  const router = useRouter();
  const uid = user?.uid;
  const { rows, loading } = useInbox();
  const seen = useRef<{ uid?: string; ids: Set<string> | null }>({ ids: null });
  // A tap that launched the app can arrive before navigation is ready; hold the link until it is.
  const navReady = Boolean(useRootNavigationState()?.key);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!navReady || !pending || !uid) return;
    const link = pending;
    const t = setTimeout(() => { setPending(null); openNotice(router, { link }); }, 50);
    return () => clearTimeout(t);
  }, [navReady, pending, uid, router]);

  useEffect(() => { if (uid) void registerForPush(); }, [uid]);

  // Show our own banner for notices that arrive while the app is open, when the server cannot push here.
  useEffect(() => {
    if (!uid || loading) return;
    if (seen.current.uid !== uid || !seen.current.ids) {
      // First load for this account: everything already there is old news.
      seen.current = { uid, ids: new Set(rows.map((r) => r.id)) };
      return;
    }
    const fresh = rows.filter((r) => !seen.current.ids!.has(r.id));
    fresh.forEach((r) => seen.current.ids!.add(r.id));
    if (remotePushOn()) return;
    const n = notif();
    if (!n) return;
    fresh.filter((r) => !r.read).slice(0, 3).forEach((r) => {
      void n.scheduleNotificationAsync({
        content: { title: r.title, body: r.body, sound: 'default', data: { link: r.link ?? null, noticeId: r.id, uid } },
        // Android: offers ring on the loud "New job offers" channel.
        trigger: r.kind === 'offer' ? { channelId: 'jobs' } : null,
      }).catch(() => undefined);
    });
  }, [rows, loading, uid]);

  // App icon badge = unread notices.
  const unread = rows.filter((r) => !r.read).length;
  useEffect(() => { if (uid) void notif()?.setBadgeCountAsync(unread).catch(() => undefined); }, [unread, uid]);

  // Taps on banners (ours or the server's), including the one that launched the app.
  useEffect(() => {
    const n = notif();
    if (!n) return;
    const handle = (resp: { notification: { request: { content: { data?: Record<string, unknown> } } } }) => {
      const data = resp.notification.request.content.data ?? {};
      const link = typeof data.link === 'string' ? data.link : undefined;
      if (uid && typeof data.noticeId === 'string') void markRead(uid, [data.noticeId]);
      if (link) setPending(link);
    };
    const sub = n.addNotificationResponseReceivedListener(handle);
    n.getLastNotificationResponseAsync().then((r) => { if (r) { handle(r); void n.clearLastNotificationResponseAsync(); } }).catch(() => undefined);
    return () => sub.remove();
  }, [uid]);

  // Coming back to the app: clear banners that are already on the lock screen.
  useEffect(() => {
    const s = AppState.addEventListener('change', (st) => { if (st === 'active') void notif()?.dismissAllNotificationsAsync().catch(() => undefined); });
    return () => s.remove();
  }, []);

  return null;
}

export type Notice = WithId<NoticeDoc>;
