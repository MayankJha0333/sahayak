import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { Bell, BellOff, Briefcase, CalendarDays, Gift, ShieldCheck, Zap } from '@/components/icons';
import { AppBar, Btn, Screen, Tiny } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { markRead, openNotice, useInbox, type Notice } from '@/lib/notifications';
import { pushPermission, registerForPush, type PushState } from '@/lib/push';
import type { NoticeDoc } from '@/lib/types';
import { useTheme } from '@/theme';

const KIND = {
  booking: { Icon: CalendarDays, bg: 'bg-brand-soft dark:bg-brand-softdark', tone: 'brand' },
  job: { Icon: Briefcase, bg: 'bg-brand-soft dark:bg-brand-softdark', tone: 'brand' },
  offer: { Icon: Zap, bg: 'bg-warn-soft dark:bg-warn-softdark', tone: 'warn' },
  account: { Icon: ShieldCheck, bg: 'bg-ok-soft dark:bg-ok-softdark', tone: 'ok' },
  promo: { Icon: Gift, bg: 'bg-sunk dark:bg-sunk-dark', tone: 'ink2' },
} as const satisfies Record<NoticeDoc['kind'], unknown>;

/** "Just now", "12 min ago", "4:05 PM", "Yesterday", "26 Sep". */
function ago(ms: number) {
  const d = Date.now() - ms;
  if (d < 60_000) return 'Just now';
  if (d < 60 * 60_000) return `${Math.floor(d / 60_000)} min ago`;
  const t = new Date(ms);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (ms >= today.getTime()) return t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (ms >= today.getTime() - 86_400_000) return 'Yesterday';
  return t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Everything the app has told you: booking updates, job offers, account news and offers from Sahayak. */
export default function Notifications() {
  const router = useRouter();
  const { c } = useTheme();
  const { user, profile } = useAuth();
  const { rows, loading } = useInbox();
  const [perm, setPerm] = useState<PushState | null>(null);
  const home = profile?.role === 'partner' ? '/partner' : '/customer';

  useFocusEffect(useCallback(() => { void pushPermission().then(setPerm); }, []));

  const unread = rows.filter((n) => !n.read);
  const fresh = unread;
  const older = rows.filter((n) => n.read);
  const open = (n: Notice) => {
    if (user && !n.read) void markRead(user.uid, [n.id]);
    openNotice(router, n);
  };

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="Notifications" back onBack={() => (router.canGoBack() ? router.back() : router.replace(home))}
        right={unread.length && user ? (
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => void markRead(user.uid, unread.map((n) => n.id))}>
            <Text className="font-jkb text-[13px] text-brand dark:text-brand-dark">Mark all read</Text>
          </Pressable>
        ) : null} />
      <Screen>
        {perm === 'denied' ? (
          <View className="flex-row items-center gap-3 rounded-[22px] bg-warn-soft px-4 py-3.5 dark:bg-warn-softdark">
            <BellOff size={20} color={c.warn} />
            <View className="flex-1 gap-0.5">
              <Text className="font-jkb text-[14px] text-ink dark:text-ink-dark">Notifications are off</Text>
              <Tiny>Turn them on so you hear when your expert is coming.</Tiny>
            </View>
            <Btn title="Settings" size="sm" tone="secondary" onPress={() => void Linking.openSettings()} />
          </View>
        ) : perm === 'undetermined' ? (
          <View className="flex-row items-center gap-3 rounded-[22px] bg-brand-soft px-4 py-3.5 dark:bg-brand-softdark">
            <Bell size={20} color={c.brand} />
            <View className="flex-1"><Tiny>Get a ping when your booking is confirmed and your expert is on the way.</Tiny></View>
            <Btn title="Turn on" size="sm" onPress={async () => setPerm(await registerForPush())} />
          </View>
        ) : null}

        {loading ? (
          <View className="items-center py-16"><ActivityIndicator color={c.brand} /></View>
        ) : rows.length === 0 ? (
          <View className="items-center gap-3 rounded-[26px] bg-paper px-6 py-12 dark:bg-paper-dark">
            <View className="h-16 w-16 items-center justify-center rounded-3xl bg-sunk dark:bg-sunk-dark"><Bell size={28} color={c.ink3} /></View>
            <Text className="font-jkb text-[17px] text-ink dark:text-ink-dark">No notifications yet</Text>
            <Tiny className="text-center">Booking updates, job offers and news from Sahayak show up here.</Tiny>
          </View>
        ) : (
          <>
            {fresh.length ? <Section label="New" rows={fresh} onOpen={open} /> : null}
            {older.length ? <Section label="Earlier" rows={older} onOpen={open} /> : null}
          </>
        )}
      </Screen>
    </View>
  );
}

function Section({ label, rows, onOpen }: { label: string; rows: Notice[]; onOpen: (n: Notice) => void }) {
  return (
    <View className="gap-2">
      <Text className="px-1 font-jkx text-[11px] uppercase tracking-[1.3px] text-ink3 dark:text-ink3-dark">{label}</Text>
      <View className="overflow-hidden rounded-[24px] bg-paper dark:bg-paper-dark">
        {rows.map((n, i) => <Item key={n.id} n={n} last={i === rows.length - 1} onOpen={onOpen} />)}
      </View>
    </View>
  );
}

function Item({ n, last, onOpen }: { n: Notice; last: boolean; onOpen: (n: Notice) => void }) {
  const { c } = useTheme();
  const k = KIND[n.kind] ?? KIND.promo;
  const color = k.tone === 'ink2' ? c.ink2 : c[k.tone];
  return (
    <Pressable accessibilityRole="button" onPress={() => onOpen(n)}
      className={`flex-row gap-3 px-4 py-3.5 active:bg-sunk dark:active:bg-sunk-dark ${last ? '' : 'border-b border-line2 dark:border-line2-dark'} ${n.read ? '' : 'bg-brand-soft/40 dark:bg-brand-softdark/40'}`}>
      <View className={`h-11 w-11 items-center justify-center rounded-2xl ${k.bg}`}><k.Icon size={19} color={color} /></View>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-start gap-2">
          <Text className={`flex-1 text-[14.5px] leading-[20px] text-ink dark:text-ink-dark ${n.read ? 'font-jkm' : 'font-jkb'}`}>{n.title}</Text>
          <Text className="pt-0.5 font-jk text-[11.5px] text-ink3 dark:text-ink3-dark">{ago(n.createdAt)}</Text>
        </View>
        <Text className="font-jk text-[13px] leading-[19px] text-ink2 dark:text-ink2-dark">{n.body}</Text>
      </View>
      {n.read ? null : <View className="mt-1.5 h-2.5 w-2.5 rounded-full bg-brand" />}
    </Pressable>
  );
}
