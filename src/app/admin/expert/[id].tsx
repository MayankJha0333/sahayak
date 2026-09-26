import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Panel, kycBadge } from '@/components/admin';
import { Avatar, Badge, Btn, Chip, Note, SplitRow, Tiny, Title } from '@/components/ui';
import { adminPayoutNow, adminReviewKyc, adminUpdatePartner } from '@/lib/api';
import { useAllEarnings, useAllWithdrawals, useAreas, useKycFile, usePartner } from '@/lib/db';
import { inr, whenLabel } from '@/lib/format';
import type { KycFileKind } from '@/lib/types';
import { useTheme } from '@/theme';

const REASONS = ['Aadhaar photo is blurry', 'Selfie does not match Aadhaar', 'Name does not match Aadhaar', 'Back of Aadhaar missing'];

/** One expert: her documents (to approve or send back), her status, wallet and payouts. */
export default function AdminExpert() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const p = usePartner(id);
  const { rows: earnings } = useAllEarnings();
  const { rows: withdrawals } = useAllWithdrawals();
  const { rows: areas } = useAreas();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (p === undefined) return <View className="flex-1 bg-ground dark:bg-ground-dark" />;
  if (!p) return <View className="flex-1 bg-ground p-4 dark:bg-ground-dark"><Tiny>Expert not found.</Tiny></View>;
  const kyc = p.kyc;
  const badge = kycBadge(p);
  const mine = earnings.filter((e) => e.partnerId === p.id);
  const wallet = mine.filter((e) => !['withdrawn', 'sent'].includes(e.status)).reduce((n, e) => n + e.total, 0);
  const myW = withdrawals.filter((w) => w.partnerId === p.id);

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: done }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(null); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <View className="flex-row items-center gap-3">
        <Btn title="← Experts" size="sm" tone="ghost" onPress={() => router.back()} />
      </View>
      <View className="flex-row items-center gap-3">
        <Avatar initials={p.initials} size={48} />
        <View className="flex-1">
          <Title>{kyc?.fullName ?? p.name}</Title>
          <Tiny>{p.phone ?? 'no phone'} · {p.hub} · {p.rating}★ · {p.jobs} jobs</Tiny>
        </View>
        <Badge tone={badge.tone} label={badge.label} />
      </View>
      {msg ? <Note tone={msg.ok ? 'ok' : 'crit'}>{msg.text}</Note> : null}

      {!p.bot ? (
        <Panel title="Aadhaar check" wide>
          {!kyc || kyc.status === 'not_started' ? <Tiny>She has not sent her documents yet.</Tiny> : (
            <>
              <SplitRow label="Name on Aadhaar" value={kyc.fullName ?? '—'} />
              <SplitRow label="Date of birth" value={kyc.dob ?? '—'} />
              {kyc.gender ? <SplitRow label="Gender" value={kyc.gender} /> : null}
              <SplitRow label="Aadhaar" value={`•••• •••• ${kyc.aadhaarLast4 ?? '????'}`} />
              <SplitRow label="Home address" value={kyc.homeAddress ?? '—'} />
              <SplitRow label="Work" value={p.skills.join(', ')} />
              <SplitRow label="Sent" value={kyc.submittedAt ? whenLabel(kyc.submittedAt) : '—'} />
              {kyc.rejectReason && kyc.status === 'rejected' ? <Tiny>Sent back: {kyc.rejectReason}</Tiny> : null}
              {kyc.filesDeleted ? <Tiny>Photos were deleted 30 days after approval.</Tiny> : (
                <View className="flex-row flex-wrap gap-3">
                  <Doc uid={p.id} kind="aadhaarFront" label="Aadhaar front" />
                  <Doc uid={p.id} kind="aadhaarBack" label="Aadhaar back" />
                  <Doc uid={p.id} kind="selfie" label="Selfie" />
                </View>
              )}
              {kyc.status === 'submitted' ? (
                <View className="gap-2">
                  <Tiny>Check: the name and photo on the card match the selfie, the card is not a photocopy, and all 12 digits end in {kyc.aadhaarLast4}.</Tiny>
                  <Btn title="Approve — she can start work" busy={busy === 'approve'} onPress={() => act('approve', () => adminReviewKyc({ partnerId: p.id, decision: 'approve' }), 'Approved. She can go online now.')} />
                  <View className="flex-row flex-wrap gap-2">{REASONS.map((r) => <Chip key={r} label={r} on={reason === r} onPress={() => setReason(r)} />)}</View>
                  <TextInput value={reason} onChangeText={setReason} placeholder="Or type what she should fix" placeholderTextColor={c.ink3}
                    className="font-jk rounded-xl bg-sunk px-3 py-2.5 text-[13px] text-ink dark:bg-sunk-dark dark:text-ink-dark" />
                  <Btn title="Send back to fix" tone="danger" disabled={reason.trim().length < 5} busy={busy === 'reject'}
                    onPress={() => act('reject', () => adminReviewKyc({ partnerId: p.id, decision: 'reject', reason }), 'Sent back. She sees your note in the app.')} />
                </View>
              ) : null}
            </>
          )}
        </Panel>
      ) : null}

      <Panel title="Work" wide>
        <Tiny>Area</Tiny>
        <View className="flex-row flex-wrap gap-2">
          {areas.map((a) => <Chip key={a.id} label={a.name} on={p.areaId === a.id} onPress={() => act('area', () => adminUpdatePartner({ partnerId: p.id, areaId: a.id }), `Moved to ${a.name}.`)} />)}
          {!areas.length ? <Tiny>Add service areas first (Areas tab).</Tiny> : null}
        </View>
        {p.suspended ? (
          <Btn title="Restore — let her work again" tone="secondary" busy={busy === 'susp'} onPress={() => act('susp', () => adminUpdatePartner({ partnerId: p.id, suspended: false }), 'Restored.')} />
        ) : (
          <Btn title="Suspend — stop all jobs" tone="danger" busy={busy === 'susp'} onPress={() => act('susp', () => adminUpdatePartner({ partnerId: p.id, suspended: true, reason: 'Suspended by ops' }), 'Suspended and taken offline.')} />
        )}
      </Panel>

      <Panel title={`Wallet · ${inr(wallet)}`} wide>
        <SplitRow label="Payout account" value={p.payoutMethod ? `${p.payoutMethod.label} (${p.payoutMethod.holderName})` : 'Not added'} />
        <SplitRow label="Weekly auto-payout" value={p.autoPayout === false ? 'Off' : 'On'} />
        <Btn title="Pay out what is ready now" size="sm" tone="secondary" busy={busy === 'pay'} disabled={!p.payoutMethod}
          onPress={() => act('pay', () => adminPayoutNow({ partnerId: p.id }), 'Payout started.')} />
        {myW.slice(0, 8).map((w) => (
          <View key={w.id} className="flex-row items-center justify-between border-t border-line2 pt-2 dark:border-line2-dark">
            <Text className="font-jk text-[12.5px] text-ink2 dark:text-ink2-dark">{inr(w.amount)} · {w.method.label} · {whenLabel(w.createdAt)}{w.utr ? ` · ${w.utr}` : ''}</Text>
            <Badge tone={w.status === 'paid' ? 'ok' : w.status === 'failed' ? 'crit' : 'warn'} label={w.status} />
          </View>
        ))}
      </Panel>
    </ScrollView>
  );
}

function Doc({ uid, kind, label }: { uid: string; kind: KycFileKind; label: string }) {
  const f = useKycFile(uid, kind);
  return (
    <View className="gap-1" style={{ width: 300, maxWidth: '100%' }}>
      <Tiny>{label}</Tiny>
      {f?.data ? (
        <Image source={{ uri: `data:image/jpeg;base64,${f.data}` }} contentFit="contain" style={{ width: '100%', aspectRatio: f.width / Math.max(1, f.height), borderRadius: 12, backgroundColor: '#0001' }} />
      ) : <Text className="font-jk text-[12px] text-crit dark:text-crit-dark">{f === null ? 'Missing' : 'Loading…'}</Text>}
    </View>
  );
}
