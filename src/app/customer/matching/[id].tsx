import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { SearchMap } from '@/components/SearchMap';
import { AppBar, Btn, Card, Eyebrow, H, Note, Screen, Tiny, Title } from '@/components/ui';
import { cancelBooking } from '@/lib/api';
import { useAllPartners, useBooking } from '@/lib/db';
import { distanceM } from '@/lib/geo';
import { inr, mmss } from '@/lib/format';
import { bookingTasks } from '@/lib/mock';
import { useTheme } from '@/theme';

const GIVE_UP_MS = 90_000;

export default function Matching() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const b = useBooking(String(id));
  const { rows: partners } = useAllPartners();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cancelling = useRef(false);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (b && ['assigned', 'arrived', 'in_progress'].includes(b.status)) router.replace(`/customer/track/${b.id}`);
    if (b?.status === 'cancelled' && !cancelling.current) router.replace('/customer/(tabs)/bookings');
  }, [b, b?.status, router]);

  if (!b) return null;

  const cancel = () => Alert.alert('Cancel this booking?', `We stop looking and refund the full ${inr(b.amountDue)}.`, [
    { text: 'Keep looking', style: 'cancel' },
    {
      text: 'Cancel booking', style: 'destructive', onPress: async () => {
        setBusy(true); setErr(''); cancelling.current = true;
        try {
          const r = await cancelBooking({ bookingId: b.id, expectFee: 0 });
          Alert.alert('Booking cancelled', `${inr(r.refunded)} is on its way back to you. It reaches your card or UPI in 5–7 working days.`);
          router.replace('/customer/(tabs)/bookings');
        } catch (e) { cancelling.current = false; setErr((e as Error).message); }
        finally { setBusy(false); }
      },
    },
  ]);
  const again = { tasks: bookingTasks(b).join(','), duration: String(b.durationMin) };
  const left = Math.max(0, (GIVE_UP_MS - (now - b.createdAt)) / 1000);
  // Stage 1 (first 20 s) asks the nearest expert directly; stage 2 widens the ring 1.5 → 2.5 → 3 km.
  const elapsed = now ? now - b.createdAt : 0;
  const radiusM = elapsed < 20_000 ? 3000 : elapsed < 45_000 ? 1500 : elapsed < 70_000 ? 2500 : 3000;
  const online = partners.filter((p) => p.onShift).map((p) => ({ id: p.id, at: p.at }));
  const inRing = online.filter((e) => distanceM(e.at, b.address.at) <= radiusM).length;

  if (b.status === 'no_match') {
    return (
      <View className="flex-1 bg-ground dark:bg-ground-dark">
        <AppBar title="No one free right now" subtitle={b.id} />
        <Screen>
          <Note tone="crit">
            We could not find a free expert near you in 90 seconds. Your {inr(b.amountDue)} has been refunded — it reaches your card or UPI in 5–7 working days.
          </Note>
          <Eyebrow>What you can do</Eyebrow>
          <Card selected onPress={() => router.replace({ pathname: '/customer/book/[slug]', params: { slug: again.tasks, mode: 'later' } })}>
            <H>Pick a time instead</H><Tiny>We reserve an expert for the slot you choose</Tiny>
          </Card>
          <Card onPress={() => router.replace({ pathname: '/customer/review', params: { tasks: again.tasks, duration: again.duration, when: '' } })}>
            <H>Try again now</H><Tiny>Same list and time — you pay again, since the last payment was refunded</Tiny>
          </Card>
          <Card onPress={() => router.replace('/customer')}><H>Not now</H><Tiny>Nothing more is charged</Tiny></Card>
        </Screen>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="Finding an expert" subtitle={b.id} />
      <Screen footer={<Btn title="Cancel — full refund" tone="secondary" busy={busy} onPress={cancel} />}>
        {err ? <Note tone="crit">{err}</Note> : null}
        <SearchMap at={b.address.at} radiusM={radiusM} experts={online} height={220}
          label={elapsed < 20_000 ? 'Asking the nearest expert' : `${inRing} expert${inRing === 1 ? '' : 's'} within ${(radiusM / 1000).toFixed(1)} km`} />
        <View className="items-center gap-2 py-2">
          <ActivityIndicator color={c.brand} />
          <Title>Finding an expert near you</Title>
          <Text className="font-jkx text-[34px] text-ink dark:text-ink-dark">{mmss(left)}</Text>
          <Tiny>Usually under a minute</Tiny>
        </View>
        <Card>
          <Eyebrow>What is happening</Eyebrow>
          {b.dispatchLog.map((line, i) => (
            <View key={`${line}-${i}`} className="flex-row items-start gap-2.5 py-1">
              <View className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brand" />
              <Text className="font-jk flex-1 text-[13px] text-ink2 dark:text-ink2-dark">{line}</Text>
            </View>
          ))}
        </Card>
        <Note>We ask the nearest expert first. If she does not answer in 20 seconds, every expert nearby sees your booking and the first to accept gets it.</Note>
      </Screen>
    </View>
  );
}
