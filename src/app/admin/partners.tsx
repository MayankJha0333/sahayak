import { useState } from 'react';
import { ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Panel, Table } from '@/components/admin';
import { Avatar, Badge, Btn, Note, Stat, Tiny, Title } from '@/components/ui';
import { adminReleaseEarning, adminSetPayoutAccount } from '@/lib/api';
import { LIVE, useAllBookings, useAllEarnings, useAllPartners } from '@/lib/db';
import { distanceM, km } from '@/lib/geo';
import { inr } from '@/lib/format';
import { HOME, expertPay } from '@/lib/mock';

const payout = (b: { price: number; extraMin: number; tip: number }) => expertPay(b).total;

/** Link an expert's Razorpay Route account (acc_…) so her payouts can go out. */
function LinkAccount({ partnerId, name }: { partnerId: string; name: string }) {
  const [acc, setAcc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <View className="gap-2 border-b border-line2 py-2.5 dark:border-line2-dark">
      <Text className="font-jks text-[13px] text-ink dark:text-ink-dark">{name} · bank not linked</Text>
      <View className="flex-row items-center gap-2">
        <TextInput value={acc} onChangeText={setAcc} placeholder="acc_XXXXXXXXXXXXXX" autoCapitalize="none" autoCorrect={false}
          className="font-jk flex-1 rounded-xl bg-sunk px-3 py-2.5 text-[13px] text-ink dark:bg-sunk-dark dark:text-ink-dark" />
        <Btn title="Link" size="sm" busy={busy} disabled={acc.trim().length < 8} onPress={async () => {
          setBusy(true); setMsg('');
          try { const r = await adminSetPayoutAccount({ partnerId, accountId: acc.trim() }); setMsg(r.retried ? `Linked · ${r.retried} waiting payout${r.retried > 1 ? 's' : ''} sent` : 'Linked'); setAcc(''); }
          catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
        }} />
      </View>
      {msg ? <Tiny>{msg}</Tiny> : <Tiny>Create the linked account in Razorpay → Route after her KYC, then paste its id.</Tiny>}
    </View>
  );
}

export default function AdminPartners() {
  const { rows: partners } = useAllPartners();
  const { rows: bookings } = useAllBookings();
  const { rows: earnings } = useAllEarnings();
  const [releasing, setReleasing] = useState<string | null>(null);
  const needsAction = earnings.filter((e) => e.status !== 'sent');
  const unlinked = partners.filter((p) => !p.bot && !p.payout?.accountId);
  const { width } = useWindowDimensions();
  const narrow = width < 700;

  const busy = new Set(bookings.filter((b) => LIVE.includes(b.status)).map((b) => b.partnerId));
  const status = (p: (typeof partners)[number]) =>
    busy.has(p.id) ? { tone: 'brand' as const, label: 'on a job' } : p.onShift ? { tone: 'ok' as const, label: 'online' } : { tone: 'neutral' as const, label: 'offline' };
  const earned = (id: string) => bookings.filter((b) => b.partnerId === id && b.status === 'completed').reduce((n, b) => n + payout(b), 0);
  // Real people first, then whoever is online.
  const sorted = [...partners].sort((a, b) => Number(Boolean(a.bot)) - Number(Boolean(b.bot)) || Number(b.onShift) - Number(a.onShift));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Title>Partners</Title>
      <View className="flex-row flex-wrap gap-2">
        <Stat label="On roster" value={String(partners.length)} />
        <Stat label="Online" value={String(partners.filter((p) => p.onShift).length)} />
        <Stat label="On a job" value={String(busy.size)} />
        <Stat label="Demo experts" value={String(partners.filter((p) => p.bot).length)} />
      </View>

      <Panel title={`Payouts · Razorpay Route · ${earnings.filter((e) => e.status === 'sent').length} sent`} wide>
        {unlinked.map((p) => <LinkAccount key={p.id} partnerId={p.id} name={p.name} />)}
        {needsAction.map((e) => {
          const p = partners.find((x) => x.id === e.partnerId);
          return (
            <View key={e.bookingId} className="flex-row items-center gap-2 border-b border-line2 py-2.5 dark:border-line2-dark">
              <View className="flex-1">
                <Text className="font-jks text-[13px] text-ink dark:text-ink-dark">{p?.name ?? e.partnerId} · {inr(e.total)}</Text>
                <Tiny>{e.bookingId} · {e.status.replace('_', ' ')}{e.error ? ` · ${e.error}` : ''}</Tiny>
              </View>
              {e.status !== 'awaiting_account' ? (
                <Btn title={e.status === 'on_hold' ? 'Release' : 'Retry'} size="sm" tone="secondary" busy={releasing === e.bookingId}
                  onPress={async () => { setReleasing(e.bookingId); try { await adminReleaseEarning({ bookingId: e.bookingId }); } finally { setReleasing(null); } }} />
              ) : null}
            </View>
          );
        })}
        {!unlinked.length && !needsAction.length ? <Tiny>Every finished job has been paid out. Transfers settle to the expert's bank a day after the visit.</Tiny> : null}
      </Panel>
      {needsAction.some((e) => e.status === 'on_hold') ? <Note tone="warn">Payouts on hold came from a rating of 2★ or less. Release them once the complaint is sorted.</Note> : null}

      {narrow ? (
        <View className="gap-2.5">
          {sorted.length === 0 ? <Tiny>No partners yet.</Tiny> : null}
          {sorted.map((p) => {
            const s = status(p);
            return (
              <View key={p.id} className="gap-2 rounded-2xl border border-line2 bg-paper p-3.5 dark:border-line2-dark dark:bg-paper-dark">
                <View className="flex-row items-center gap-3">
                  <Avatar initials={p.initials} size={38} />
                  <View className="flex-1">
                    <Text className="font-jkb text-[14.5px] text-ink dark:text-ink-dark">{p.name}{p.bot ? ' · demo' : ''}</Text>
                    <Tiny>{p.hub} hub · {km(distanceM(p.at, HOME))} from centre</Tiny>
                  </View>
                  <Badge tone={s.tone} label={s.label} />
                </View>
                <View className="flex-row justify-between">
                  <Tiny>{p.rating}★ · {p.jobs} job{p.jobs === 1 ? '' : 's'} · {p.onTime}% on time</Tiny>
                  <Text className="font-jkx text-[12.5px] text-ink dark:text-ink-dark">{inr(earned(p.id))} earned</Text>
                </View>
                <Tiny>{p.skills.join(' · ')}</Tiny>
              </View>
            );
          })}
        </View>
      ) : (
        <Panel title="Roster" wide>
          <Table head={['Name', 'Type', 'Hub', 'Skills', 'Rating', 'Jobs', 'From centre', 'Earned', 'Status']}
            rows={sorted.map((p) => {
              const s = status(p);
              return [
                <Text key="n" className="font-jkx text-[12px] text-ink dark:text-ink-dark">{p.name}</Text>,
                p.bot ? 'demo' : 'real', p.hub, p.skills.join(', '), String(p.rating), String(p.jobs), km(distanceM(p.at, HOME)), inr(earned(p.id)),
                <Badge key="s" tone={s.tone} label={s.label} />,
              ];
            })} />
        </Panel>
      )}
      <Tiny>Demo experts only exist on test data. They accept jobs, ride to the door and finish on their own.</Tiny>
    </ScrollView>
  );
}
