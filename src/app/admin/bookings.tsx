import { useState } from 'react';
import { Alert, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Panel, Table } from '@/components/admin';
import { Badge, Btn, Chip, Note, Stat, Tiny, Title } from '@/components/ui';
import { adminCancelRefund, adminForceAssign } from '@/lib/api';
import { LIVE, useAllBookings, useAllPartners } from '@/lib/db';
import { clock, inr } from '@/lib/format';
import { OVERTIME_PER_MIN, bookingTitle } from '@/lib/mock';
import type { BookingStatus } from '@/lib/types';

const FILTERS = ['All', 'Live', 'Problem', 'Completed'] as const;
const TONE: Record<BookingStatus, 'ok' | 'warn' | 'crit' | 'brand' | 'neutral'> = {
  payment_pending: 'warn', matching: 'warn', no_match: 'crit', assigned: 'ok', arrived: 'ok', in_progress: 'brand', completed: 'neutral', cancelled: 'neutral',
};

export default function AdminBookings() {
  const { rows: bookings } = useAllBookings();
  const { rows: partners } = useAllPartners();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [busy, setBusy] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const narrow = width < 700;

  const shown = bookings.filter((b) => {
    if (filter === 'Live') return LIVE.includes(b.status);
    if (filter === 'Problem') return ['no_match', 'cancelled', 'payment_pending'].includes(b.status);
    if (filter === 'Completed') return b.status === 'completed';
    return true;
  });
  const total = (b: (typeof bookings)[number]) => b.amountDue + b.extraMin * OVERTIME_PER_MIN + b.tip;
  const act = async (id: string, fn: () => Promise<unknown>) => { setBusy(id); try { await fn(); } finally { setBusy(null); } };
  const refund = (b: (typeof bookings)[number]) => {
    const go = () => act(b.id, () => adminCancelRefund({ bookingId: b.id }));
    if (Platform.OS === 'web') return go();
    Alert.alert('Cancel and refund?', `${b.id} will be cancelled and ${inr(b.amountDue)} refunded to the customer. This cannot be undone.`, [
      { text: 'Keep booking', style: 'cancel' },
      { text: 'Cancel + refund', style: 'destructive', onPress: go },
    ]);
  };
  const action = (b: (typeof bookings)[number]) => {
    const waiting = b.status === 'matching' || b.status === 'no_match';
    const cancellable = ['payment_pending', 'matching', 'assigned', 'arrived'].includes(b.status);
    if (waiting) return <Btn key="a" title="Force assign" tone="secondary" size="sm" busy={busy === b.id} onPress={() => act(b.id, () => adminForceAssign({ bookingId: b.id }))} />;
    if (cancellable) return <Btn key="a" title="Cancel + refund" tone="danger" size="sm" busy={busy === b.id} onPress={() => refund(b)} />;
    return null;
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Title>Bookings</Title>
      <View className="flex-row flex-wrap gap-2">{FILTERS.map((f) => <Chip key={f} label={f} on={filter === f} onPress={() => setFilter(f)} />)}</View>
      <View className="flex-row flex-wrap gap-2">
        <Stat label="Total" value={String(bookings.length)} />
        <Stat label="Live" value={String(bookings.filter((b) => LIVE.includes(b.status)).length)} />
        <Stat label="No match" value={String(bookings.filter((b) => b.status === 'no_match').length)} tone="crit" />
        <Stat label="Refunds" value={String(bookings.filter((b) => b.razorpay?.refundId).length)} />
        <Stat label="Revenue" value={inr(bookings.filter((b) => b.status === 'completed').reduce((n, b) => n + total(b), 0))} />
      </View>
      {narrow ? (
        <View className="gap-2.5">
          {shown.length === 0 ? <Tiny>Nothing here yet.</Tiny> : null}
          {shown.map((b) => {
            const p = partners.find((x) => x.id === b.partnerId);
            const a = action(b);
            return (
              <View key={b.id} className="gap-1.5 rounded-2xl border border-line2 bg-paper p-3.5 dark:border-line2-dark dark:bg-paper-dark">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="font-jkx text-[12.5px] text-ink dark:text-ink-dark">{b.id}</Text>
                  <Badge tone={TONE[b.status]} label={b.status.replace('_', ' ')} />
                </View>
                <Text className="font-jks text-[14px] text-ink dark:text-ink-dark">{bookingTitle(b)} · {b.durationMin + b.extraMin} min</Text>
                <Tiny>{b.address.line1}, {b.address.line2} · {clock(b.createdAt)}</Tiny>
                <View className="flex-row items-center justify-between">
                  <Tiny>{p ? `Expert: ${p.name}` : 'No expert yet'}{b.rating ? ` · ${b.rating}★` : ''}</Tiny>
                  <Text className="font-jkx text-[13px] text-ink dark:text-ink-dark">{inr(b.amountDue)}{b.razorpay?.refundId === 'queued' ? ' · refund pending' : b.razorpay?.refundId ? ' · refunded' : ''}</Text>
                </View>
                {a ? <View className="pt-1">{a}</View> : null}
              </View>
            );
          })}
        </View>
      ) : (
      <Panel title="All bookings" wide>
        <Table head={['ID', 'Service', 'Where', 'Expert', 'Status', 'Paid', 'Razorpay', 'Action']}
          rows={shown.map((b) => {
            const p = partners.find((x) => x.id === b.partnerId);
            return [
              <Text key="id" className="font-jkx text-[12px] text-ink dark:text-ink-dark">{b.id}</Text>,
              `${bookingTitle(b)} · ${b.durationMin + b.extraMin}m`,
              b.address.line2,
              p?.name ?? '—',
              <Badge key="s" tone={TONE[b.status]} label={b.status.replace('_', ' ')} />,
              inr(b.amountDue),
              <Tiny key="r">{b.razorpay?.refundId === 'queued' ? 'refund pending' : b.razorpay?.refundId ? 'refunded' : b.razorpay?.paymentId ? b.razorpay.paymentId.slice(-8) : b.razorpay?.orderId ? 'order' : '—'}</Tiny>,
              action(b) ?? <Tiny key="a">{b.rating ? `${b.rating}★` : '—'}</Tiny>,
            ];
          })} />
      </Panel>
      )}
      <Note>Force assign hands the job to the best available expert. Cancel + refund returns the full Razorpay payment and any reward used.</Note>
    </ScrollView>
  );
}
