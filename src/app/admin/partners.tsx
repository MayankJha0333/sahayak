import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Panel, Table, kycBadge } from '@/components/admin';
import { Avatar, Badge, Btn, Note, Stat, Tiny, Title } from '@/components/ui';
import { adminReleaseEarning } from '@/lib/api';
import { LIVE, useAllBookings, useAllEarnings, useAllPartners, useAllWithdrawals } from '@/lib/db';
import { inr, whenLabel } from '@/lib/format';

export default function AdminPartners() {
  const router = useRouter();
  const { rows: partners } = useAllPartners();
  const { rows: bookings } = useAllBookings();
  const { rows: earnings } = useAllEarnings();
  const { rows: withdrawals } = useAllWithdrawals();
  const [releasing, setReleasing] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const narrow = width < 700;

  const queue = partners.filter((p) => !p.bot && p.kyc?.status === 'submitted').sort((a, b) => (a.kyc?.submittedAt ?? 0) - (b.kyc?.submittedAt ?? 0));
  const onHold = earnings.filter((e) => e.status === 'on_hold');
  const failed = withdrawals.filter((w) => w.status === 'failed').slice(0, 10);
  const paidOut = withdrawals.filter((w) => w.status === 'paid').reduce((n, w) => n + w.amount, 0);
  const busy = new Set(bookings.filter((b) => LIVE.includes(b.status)).map((b) => b.partnerId));
  const live = (p: (typeof partners)[number]) =>
    busy.has(p.id) ? { tone: 'brand' as const, label: 'on a job' } : p.onShift ? { tone: 'ok' as const, label: 'online' } : { tone: 'neutral' as const, label: 'offline' };
  const wallet = (id: string) => earnings.filter((e) => e.partnerId === id && !['withdrawn', 'sent'].includes(e.status)).reduce((n, e) => n + e.total, 0);
  const sorted = [...partners].sort((a, b) => Number(Boolean(a.bot)) - Number(Boolean(b.bot)) || Number(b.onShift) - Number(a.onShift));
  const open = (id: string) => router.push(`/admin/expert/${id}` as Href);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Title>Experts</Title>
      <View className="flex-row flex-wrap gap-2">
        <Stat label="To verify" value={String(queue.length)} tone={queue.length ? 'crit' : undefined} />
        <Stat label="Verified" value={String(partners.filter((p) => p.verified && !p.bot).length)} />
        <Stat label="Online" value={String(partners.filter((p) => p.onShift).length)} />
        <Stat label="Paid out" value={inr(paidOut)} />
      </View>

      <Panel title={`Waiting for verification · ${queue.length}`} wide>
        {queue.length === 0 ? <Tiny>No one is waiting. New experts appear here once they send their Aadhaar and selfie.</Tiny> : null}
        {queue.map((p) => (
          <Pressable key={p.id} onPress={() => open(p.id)} accessibilityRole="button" className="flex-row items-center gap-3 border-b border-line2 py-2.5 dark:border-line2-dark">
            <Avatar initials={p.initials} size={34} />
            <View className="flex-1">
              <Text className="font-jks text-[13.5px] text-ink dark:text-ink-dark">{p.kyc?.fullName ?? p.name}</Text>
              <Tiny>{p.hub} · Aadhaar ••{p.kyc?.aadhaarLast4} · sent {p.kyc?.submittedAt ? whenLabel(p.kyc.submittedAt) : ''}</Tiny>
            </View>
            <Btn title="Review" size="sm" onPress={() => open(p.id)} />
          </Pressable>
        ))}
      </Panel>

      <Panel title="Payouts that need you" wide>
        {onHold.map((e) => {
          const p = partners.find((x) => x.id === e.partnerId);
          return (
            <View key={e.id} className="flex-row items-center gap-2 border-b border-line2 py-2.5 dark:border-line2-dark">
              <View className="flex-1">
                <Text className="font-jks text-[13px] text-ink dark:text-ink-dark">{p?.name ?? e.partnerId} · {inr(e.total)} on hold</Text>
                <Tiny>{e.bookingId}{e.holdReason ? ` · ${e.holdReason}` : ''}</Tiny>
              </View>
              <Btn title="Release" size="sm" tone="secondary" busy={releasing === e.id}
                onPress={async () => { setReleasing(e.id); try { await adminReleaseEarning({ bookingId: e.bookingId }); } finally { setReleasing(null); } }} />
            </View>
          );
        })}
        {failed.map((w) => (
          <Pressable key={w.id} onPress={() => open(w.partnerId)} className="flex-row items-center gap-2 border-b border-line2 py-2.5 dark:border-line2-dark">
            <View className="flex-1">
              <Text className="font-jks text-[13px] text-ink dark:text-ink-dark">{w.partnerName} · {inr(w.amount)} failed</Text>
              <Tiny>{w.method.label} · {whenLabel(w.createdAt)} · {w.error}</Tiny>
            </View>
            <Badge tone="crit" label="failed" />
          </Pressable>
        ))}
        {!onHold.length && !failed.length ? <Tiny>Nothing on hold and no failed payouts. Experts withdraw to UPI or bank through RazorpayX.</Tiny> : null}
      </Panel>
      {onHold.length ? <Note tone="warn">Money on hold came from a rating of 2★ or less. Release it once the complaint is sorted.</Note> : null}

      {narrow ? (
        <View className="gap-2.5">
          {sorted.map((p) => {
            const s = live(p); const k = kycBadge(p);
            return (
              <Pressable key={p.id} onPress={() => open(p.id)} className="gap-2 rounded-2xl border border-line2 bg-paper p-3.5 dark:border-line2-dark dark:bg-paper-dark">
                <View className="flex-row items-center gap-3">
                  <Avatar initials={p.initials} size={38} />
                  <View className="flex-1">
                    <Text className="font-jkb text-[14.5px] text-ink dark:text-ink-dark">{p.name}</Text>
                    <Tiny>{p.hub} · {p.rating}★ · {p.jobs} job{p.jobs === 1 ? '' : 's'}</Tiny>
                  </View>
                  <View className="items-end gap-1"><Badge tone={k.tone} label={k.label} /><Badge tone={s.tone} label={s.label} /></View>
                </View>
                <Tiny>Wallet {inr(wallet(p.id))} · {p.payoutMethod ? p.payoutMethod.label : 'no payout account'}</Tiny>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Panel title="Roster" wide>
          <Table head={['Name', 'Check', 'Area', 'Skills', 'Rating', 'Jobs', 'Wallet', 'Payout to', 'Status']}
            rows={sorted.map((p) => {
              const s = live(p); const k = kycBadge(p);
              return [
                <Pressable key="n" onPress={() => open(p.id)}><Text className="font-jkx text-[12px] text-brand dark:text-brand-dark">{p.name}</Text></Pressable>,
                <Badge key="k" tone={k.tone} label={k.label} />,
                p.hub, p.skills.join(', '), String(p.rating), String(p.jobs), inr(wallet(p.id)), p.payoutMethod?.label ?? '—',
                <Badge key="s" tone={s.tone} label={s.label} />,
              ];
            })} />
        </Panel>
      )}
      <Tiny>Demo experts only exist on test data. They accept jobs, ride to the door and finish on their own.</Tiny>
    </ScrollView>
  );
}
