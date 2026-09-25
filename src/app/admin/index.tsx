import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Bars, Panel, Table } from '@/components/admin';
import { OpsMap } from '@/components/OpsMap';
import { Badge, Btn, Stat, Tiny, Title } from '@/components/ui';
import { seedDemo } from '@/lib/api';
import { LIVE, useAllBookings, useAllFeedback, useAllOffers, useAllPartners } from '@/lib/db';
import { distanceM, etaMinutes } from '@/lib/geo';
import { clock, inr, mmss } from '@/lib/format';
import { HOME, bookingTitle } from '@/lib/mock';

export default function LiveOps() {
  const router = useRouter();
  const { rows: bookings } = useAllBookings();
  const { rows: offers } = useAllOffers();
  const { rows: partners } = useAllPartners();
  const { rows: feedback } = useAllFeedback();
  const [now, setNow] = useState(() => Date.now());
  const [seeding, setSeeding] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const live = bookings.filter((b) => LIVE.includes(b.status));
  const noMatch = bookings.filter((b) => b.status === 'no_match');
  const completed = bookings.filter((b) => b.status === 'completed');
  const onShift = partners.filter((p) => p.onShift);
  const ata = completed.filter((b) => b.assignedAt && b.arrivedAt).map((b) => (b.arrivedAt! - b.assignedAt!) / 60000);
  const medianAta = ata.length ? (ata.reduce((a, b) => a + b, 0) / ata.length).toFixed(1) : '—';
  const attempted = bookings.filter((b) => !['cancelled', 'payment_pending'].includes(b.status)).length;
  const fill = attempted ? Math.round(((attempted - noMatch.length) / attempted) * 100) : 100;
  const revenue = completed.reduce((n, b) => n + b.amountDue, 0);
  const busyIds = new Set(live.map((b) => b.partnerId).filter(Boolean));
  // A busy expert is drawn where her job says she is (the ride updates the booking, not her profile).
  const mapPartners = partners.map((p) => ({ id: p.id, name: p.name, at: live.find((b) => b.partnerId === p.id)?.partnerAt ?? p.at, state: (busyIds.has(p.id) ? 'busy' : p.onShift ? 'free' : 'offline') as 'busy' | 'free' | 'offline' }));
  const mapJobs = live.map((b) => ({ id: b.id, at: b.address.at, partnerAt: b.partnerAt,
    state: (b.status === 'matching' ? 'matching' : b.status === 'assigned' ? 'riding' : 'on_site') as 'matching' | 'riding' | 'on_site' }));
  // Bookings created in each of the last 12 hours, oldest first.
  const hourMs = 3_600_000;
  const perHour = Array.from({ length: 12 }, (_, i) => {
    const from = now - (12 - i) * hourMs;
    return bookings.filter((b) => b.createdAt >= from && b.createdAt < from + hourMs).length;
  });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View className="flex-row flex-wrap items-center gap-2">
        <Title>Live ops · Gurugram</Title>
        <Badge tone="ok" label={`${onShift.length} on shift`} />
        {offers.length ? <Badge tone="warn" label={`${offers.length} open offers`} /> : null}
        <Tiny>live from Firestore</Tiny>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Stat label="Live jobs" value={String(live.length)} />
        <Stat label="Median ATA" value={`${medianAta}m`} />
        <Stat label="Fill rate" value={`${fill}%`} />
        <Stat label="No match" value={String(noMatch.length)} tone={noMatch.length ? 'crit' : undefined} />
        <Stat label="Completed" value={String(completed.length)} />
        <Stat label="Revenue" value={inr(revenue)} />
      </View>

      {partners.length === 0 ? (
        <Panel title="Empty database" wide>
          <Tiny>No partners yet. Load five demo experts who accept jobs and ride to the door on their own.</Tiny>
          <Btn title="Load demo experts" busy={seeding} size="sm" onPress={async () => { setSeeding(true); try { await seedDemo({}); } finally { setSeeding(false); } }} />
        </Panel>
      ) : null}

      <Panel title="Map · experts and live jobs" wide>
        <OpsMap partners={mapPartners} jobs={mapJobs} center={HOME} height={300} />
      </Panel>

      <View className="flex-row flex-wrap gap-3">
        <Panel title="Needs a human now">
          {noMatch.slice(0, 3).map((b) => (
            <View key={b.id} className="flex-row items-start gap-2.5 border-b border-line2 py-2 dark:border-line2-dark">
              <Badge tone="crit" label="no match" />
              <View className="flex-1"><Text className="font-jks text-[12.5px] text-ink dark:text-ink-dark">{b.id} · {bookingTitle(b)}</Text><Tiny>{b.address.line2} · refunded {inr(b.amountDue)}</Tiny></View>
            </View>
          ))}
          {offers.map((o) => {
            const p = partners.find((x) => x.id === o.partnerId);
            return (
              <View key={o.id} className="flex-row items-start gap-2.5 border-b border-line2 py-2 dark:border-line2-dark">
                <Badge tone="warn" label={`stage ${o.stage}`} />
                <View className="flex-1"><Text className="font-jks text-[12.5px] text-ink dark:text-ink-dark">{o.bookingId} waiting on {p?.name ?? o.partnerId}</Text><Tiny>{mmss((o.expiresAt - now) / 1000)} left to accept</Tiny></View>
              </View>
            );
          })}
          {!noMatch.length && !offers.length ? <Tiny>Nothing waiting on a person.</Tiny> : null}
          <Btn title="Open bookings" tone="secondary" size="sm" onPress={() => router.replace('/admin/bookings')} />
        </Panel>
      </View>

      <Panel title="Live queue" wide>
        {live.length === 0 ? <Tiny>No live jobs.</Tiny> : null}
        {live.map((b) => {
          const p = partners.find((x) => x.id === b.partnerId);
          const away = b.partnerAt ? distanceM(b.partnerAt, b.address.at) : 0;
          return (
            <View key={b.id} className="flex-row items-center gap-2 border-b border-line2 py-2 dark:border-line2-dark">
              <Badge tone={b.status === 'matching' ? 'warn' : 'ok'} label={b.status.replace('_', ' ')} />
              <View className="flex-1"><Text className="font-jks text-[12.5px] text-ink dark:text-ink-dark">{b.id} · {bookingTitle(b)}</Text>
                <Tiny>{p ? `${p.name} · ${b.status === 'assigned' ? `${etaMinutes(away)} min out` : b.address.line1}` : 'looking for an expert'} · {clock(b.createdAt)}</Tiny></View>
              <Text className="font-jkx text-[12.5px] text-ink dark:text-ink-dark">{inr(b.amountDue)}</Text>
            </View>
          );
        })}
      </Panel>

      <View className="flex-row flex-wrap gap-3">
        <Panel title="Bookings · last 12 hours">
          <Bars values={perHour} />
          <Tiny>{perHour.reduce((a, b) => a + b, 0)} bookings · one bar per hour, newest on the right</Tiny>
        </Panel>
        <Panel title={`Latest feedback · ${feedback.length}`}>
          {feedback.slice(0, 4).map((f) => (
            <View key={f.id} className="gap-1 border-b border-line2 py-2 dark:border-line2-dark">
              <View className="flex-row items-center gap-2"><Badge tone={f.kind === 'problem' ? 'crit' : f.kind === 'request' ? 'brand' : 'neutral'} label={f.kind} /><Tiny>{clock(f.at)}</Tiny></View>
              <Text className="font-jk text-[12.5px] text-ink2 dark:text-ink2-dark" numberOfLines={2}>{f.text}</Text>
            </View>
          ))}
          {feedback.length === 0 ? <Tiny>Nothing yet.</Tiny> : null}
        </Panel>
      </View>
    </ScrollView>
  );
}
