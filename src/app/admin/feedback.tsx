import { ScrollView, Text, View } from 'react-native';
import { Panel } from '@/components/admin';
import { Badge, Stat, Tiny, Title } from '@/components/ui';
import { useAllBookings, useAllFeedback, useAllPartners } from '@/lib/db';
import { whenLabel } from '@/lib/format';

export default function AdminFeedback() {
  const { rows: feedback } = useAllFeedback();
  const { rows: partners } = useAllPartners();
  const { rows: bookings } = useAllBookings();
  // Problems first, newest first inside each group.
  const sorted = [...feedback].sort((a, b) => Number(b.kind === 'problem') - Number(a.kind === 'problem') || b.at - a.at);
  const who = (uid: string) => {
    const p = partners.find((x) => x.id === uid);
    return p ? `Expert ${p.name}` : 'Customer';
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Title>Feedback</Title>
      <View className="flex-row flex-wrap gap-2">
        <Stat label="Messages" value={String(feedback.length)} />
        <Stat label="Problems" value={String(feedback.filter((f) => f.kind === 'problem').length)} tone={feedback.some((f) => f.kind === 'problem') ? 'crit' : undefined} />
        <Stat label="Low ratings" value={String(feedback.filter((f) => f.auto).length)} />
        <Stat label="Requests" value={String(feedback.filter((f) => f.kind === 'request').length)} />
      </View>
      <Panel title="Problems first" wide>
        {sorted.length === 0 ? <Tiny>Nothing yet. Customers and experts send these from Help & support.</Tiny> : null}
        {sorted.map((f) => {
          const b = f.bookingId ? bookings.find((x) => x.id === f.bookingId) : undefined;
          return (
            <View key={f.id} className="gap-1 border-b border-line2 py-2.5 dark:border-line2-dark">
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge tone={f.kind === 'problem' ? 'crit' : f.kind === 'request' ? 'brand' : 'neutral'} label={f.auto ? 'low rating' : f.kind} />
                <Tiny>{who(f.userId)} · {whenLabel(f.at)}</Tiny>
              </View>
              <Text className="font-jk text-[13.5px] text-ink dark:text-ink-dark">{f.text}</Text>
              {f.bookingId ? <Tiny>Booking {f.bookingId}{b ? ` · ${b.address.line1}, ${b.address.line2} · ${b.status.replace('_', ' ')}` : ''}</Tiny> : null}
            </View>
          );
        })}
      </Panel>
    </ScrollView>
  );
}
