import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ChevronRight } from '@/components/icons';
import { Badge, Body, Btn, Card, Eyebrow, H, Tiny, Title } from '@/components/ui';
import { LIVE, useMyBookings } from '@/lib/db';
import { inr, whenLabel } from '@/lib/format';
import { OVERTIME_PER_MIN, bookingTitle } from '@/lib/mock';
import type { BookingStatus } from '@/lib/types';
import { useTheme } from '@/theme';

const TONE: Record<BookingStatus, 'ok' | 'warn' | 'crit' | 'brand' | 'neutral'> = {
  payment_pending: 'warn', matching: 'warn', no_match: 'crit', assigned: 'ok', arrived: 'ok',
  in_progress: 'brand', completed: 'neutral', cancelled: 'neutral',
};
const LABEL: Record<BookingStatus, string> = {
  payment_pending: 'payment pending', matching: 'finding', no_match: 'no match', assigned: 'on the way',
  arrived: 'at your door', in_progress: 'in progress', completed: 'done', cancelled: 'cancelled',
};

export default function Bookings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { rows: all, loading } = useMyBookings();
  // A checkout that was never paid is not a booking from the customer's point of view.
  const bookings = all.filter((b) => b.paid);
  const later = (b: (typeof all)[number]) => Boolean(b.scheduledFor && b.scheduledFor > Date.now() && b.status === 'assigned');
  const live = bookings.filter((b) => LIVE.includes(b.status));
  const past = bookings.filter((b) => !LIVE.includes(b.status));

  const total = (b: (typeof bookings)[number]) => b.price - b.discount + b.extraMin * OVERTIME_PER_MIN + b.tip;

  return (
    <ScrollView
      className="flex-1 bg-ground dark:bg-ground-dark"
      contentContainerStyle={{ padding: 16, gap: 12, paddingTop: insets.top + 14, paddingBottom: 28 }}>
      <Title>Bookings</Title>
      {!loading && bookings.length === 0 ? (
        <Card className="items-center py-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-soft dark:bg-brand-softdark"><CalendarDays size={26} color={c.brand} /></View>
          <H>Nothing booked yet</H>
          <Body className="text-center">Your live and past visits will show up here. The first one takes about a minute to book.</Body>
          <Btn title="Book a service" size="sm" onPress={() => router.push('/customer')} />
        </Card>
      ) : null}

      {live.length ? <Eyebrow>Happening now</Eyebrow> : null}
      {live.map((b) => (
        <Card key={b.id} selected onPress={() => router.push(b.status === 'matching' ? `/customer/matching/${b.id}` : `/customer/track/${b.id}`)}>
          <View className="flex-row items-center justify-between">
            <Badge tone={TONE[b.status]} label={later(b) ? 'scheduled' : LABEL[b.status]} />
            <ChevronRight size={18} color={c.ink3} />
          </View>
          <H>{bookingTitle(b)} · {b.durationMin} min</H>
          <Tiny>{b.scheduledFor ? `For ${whenLabel(b.scheduledFor)}` : whenLabel(b.createdAt)}</Tiny>
        </Card>
      ))}

      {past.length ? <Eyebrow className="mt-2">Past</Eyebrow> : null}
      {past.map((b) => (
        <Card key={b.id} onPress={() => (b.status === 'completed' ? router.push(`/customer/rate/${b.id}`) : b.status === 'no_match' ? router.push(`/customer/matching/${b.id}`) : undefined)}>
          <View className="flex-row items-center justify-between">
            <Badge tone={TONE[b.status]} label={LABEL[b.status]} />
            <Text className="font-jkx text-[14px] text-ink dark:text-ink-dark">
              {b.status === 'cancelled'
                ? (b.cancelFee ? `${inr(b.cancelFee)} fee${b.amountDue > b.cancelFee ? ` · ${inr(b.amountDue - b.cancelFee)} back` : ''}` : `${inr(b.amountDue)} refunded`)
                : b.status === 'no_match' ? `${inr(b.amountDue)} refunded` : inr(total(b))}
            </Text>
          </View>
          <H>{bookingTitle(b)} · {b.durationMin + b.extraMin} min</H>
          <Tiny>{whenLabel(b.scheduledFor ?? b.createdAt)}{b.rating ? ` · you rated ${b.rating}★` : ''}</Tiny>
        </Card>
      ))}
    </ScrollView>
  );
}
