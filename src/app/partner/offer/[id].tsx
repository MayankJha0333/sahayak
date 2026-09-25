import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { TrackingMap } from '@/components/TrackingMap';
import { AppBar, Badge, Btn, Card, Eyebrow, Note, Screen, SplitRow, Tiny, Title } from '@/components/ui';
import { acceptOffer, declineOffer } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBooking, useMyOffer } from '@/lib/db';
import { distanceM, etaMinutes, km } from '@/lib/geo';
import { inr, mmss } from '@/lib/format';
import { bookingTitle, expertPay, taskLines } from '@/lib/mock';

const payout = (b: { price: number; extraMin: number; tip: number }) => expertPay(b).total;

export default function Offer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { partner } = useAuth();
  const b = useBooking(String(id));
  const offer = useMyOffer();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (b && ['assigned', 'arrived', 'in_progress'].includes(b.status)) router.replace(`/partner/job/${b.id}`);
    else if (b && !offer && b.status === 'matching' && now) router.replace('/partner');
  }, [b, b?.status, offer, now, router]);

  if (!b || !offer || !partner) return null;
  const away = distanceM(partner.at, b.address.at);
  const title = bookingTitle(b);
  const lines = taskLines(b);

  const act = async (fn: () => Promise<unknown>, after?: string) => {
    setBusy(true); setErr('');
    try { await fn(); if (after) router.replace(after as '/partner'); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="New job for you" subtitle={offer.stage === 1 ? 'Assigned to you' : 'Open — first to accept wins'}
        right={<View className="rounded-full bg-crit-soft dark:bg-crit-softdark px-3 py-1.5"><Text className="font-jkx text-[14px] text-crit dark:text-crit-dark">{mmss((offer.expiresAt - now) / 1000)}</Text></View>} />
      <Screen
        footer={
          <>
            <Btn title={`Accept · you earn ${inr(payout(b))}`} busy={busy} onPress={() => act(() => acceptOffer({ bookingId: b.id }))} />
            <Btn title="Decline" tone="secondary" size="sm" disabled={busy} onPress={() => act(() => declineOffer({ bookingId: b.id }), '/partner')} />
          </>
        }>
        <TrackingMap origin={partner.at} dest={b.address.at} at={partner.at} height={250} label={`${km(away)} · about ${etaMinutes(away)} min`} />
        <View className="flex-row items-center justify-between">
          <Title>{title} · {b.durationMin} min</Title>
          <Badge tone={offer.stage === 1 ? 'brand' : 'warn'} label={offer.stage === 1 ? 'direct' : 'broadcast'} />
        </View>
        <Card>
          <Eyebrow>Where</Eyebrow>
          <Text className="font-jks text-[15px] text-ink dark:text-ink-dark">{b.address.line1}, {b.address.line2}</Text>
          <Tiny>{b.address.directions}</Tiny>
        </Card>
        <Card>
          <SplitRow label="You earn" value={inr(payout(b))} strong />
          <SplitRow label="Duration" value={`${b.durationMin} min`} />
          <SplitRow label="Distance" value={`${km(away)} · ${etaMinutes(away)} min by e-bike`} />
        </Card>
        <Card flat>
          <Eyebrow>What the job is</Eyebrow>
          {lines.map((t) => <Text key={t} className="font-jk py-0.5 text-[13.5px] text-ink2 dark:text-ink2-dark">• {t}</Text>)}
        </Card>
        {err ? <Note tone="crit">{err}</Note> : null}
        <Note tone="warn">Declining needs a reason. The first two time-outs in a shift cost you nothing; after that your reliability score drops.</Note>
      </Screen>
    </View>
  );
}
