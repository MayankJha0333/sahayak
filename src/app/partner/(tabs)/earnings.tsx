import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandPanel } from '@/components/BrandPanel';
import { Banknote, ChevronRight, Star } from '@/components/icons';
import { Badge, Btn, Card, Divider, Eyebrow, H, Note, Row, Tiny } from '@/components/ui';
import { setAutoPayout, withdraw } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMyEarnings, useMyWithdrawals, usePartnerBookings } from '@/lib/db';
import { clock, inr, mins, whenLabel } from '@/lib/format';
import { OVERTIME_PER_MIN, PARTNER_SHARE, bookingTitle } from '@/lib/mock';
import type { EarningDoc, WithdrawalDoc } from '@/lib/types';
import { useTheme } from '@/theme';

const MIN_WITHDRAW = 100;

/** Monday 00:00 of the current week, local time. */
function weekStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

type State = 'ready' | 'pending' | 'on_hold' | 'withdrawn';
/** Older entries used other words; read them the way the server does. */
const stateOf = (e: EarningDoc, now: number): State =>
  e.status === 'sent' || e.status === 'withdrawn' ? 'withdrawn'
    : e.status === 'on_hold' ? 'on_hold'
    : (e.availableAt ?? 0) <= now ? 'ready' : 'pending';

const BADGE: Record<State, { tone: 'ok' | 'warn' | 'neutral' | 'brand'; label: string }> = {
  ready: { tone: 'ok', label: 'ready' },
  pending: { tone: 'neutral', label: 'on its way' },
  on_hold: { tone: 'warn', label: 'on hold' },
  withdrawn: { tone: 'brand', label: 'withdrawn' },
};
const W_BADGE: Record<WithdrawalDoc['status'], { tone: 'ok' | 'warn' | 'crit'; label: string }> = {
  processing: { tone: 'warn', label: 'sending' },
  paid: { tone: 'ok', label: 'paid' },
  failed: { tone: 'crit', label: 'failed' },
};

/**
 * Her wallet. Each finished job adds her share; after a short hold it is ready to withdraw to her UPI or bank
 * account (at least ₹100). Everything ready also goes out on its own every Monday morning, unless she turns that off.
 */
export default function Earnings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  const { partner } = useAuth();
  const { rows: bookings } = usePartnerBookings();
  const { rows: earnings } = useMyEarnings();
  const { rows: withdrawals } = useMyWithdrawals();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);

  const sum = (s: State) => earnings.filter((e) => stateOf(e, now) === s).reduce((n, e) => n + e.total, 0);
  const ready = sum('ready');
  const pending = sum('pending');
  const held = sum('on_hold');
  const nextReady = earnings.filter((e) => stateOf(e, now) === 'pending').map((e) => e.availableAt ?? 0).sort((a, b) => a - b)[0];
  const method = partner?.payoutMethod;
  const canWithdraw = Boolean(method) && ready >= MIN_WITHDRAW && Boolean(partner?.verified);

  const since = weekStart();
  const week = bookings.filter((b) => b.status === 'completed' && (b.endedAt ?? b.createdAt) >= since);
  const ledger = new Map(earnings.map((e) => [e.bookingId, e]));
  const weekPay = week.reduce((a, b) => {
    const e = ledger.get(b.id);
    return e ? { job: a.job + e.jobPay, extra: a.extra + e.extraPay, tip: a.tip + e.tip } : a;
  }, { job: 0, extra: 0, tip: 0 });

  const doWithdraw = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await withdraw({});
      Alert.alert(r.status === 'paid' ? 'Money sent' : 'Withdrawal started',
        `${inr(r.amount)} is on its way to ${method?.label}. ${r.status === 'paid' ? 'It usually shows in your account within minutes.' : 'We will update this screen when it reaches you.'}`);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView className="flex-1 bg-ground dark:bg-ground-dark" showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, gap: 14, paddingTop: insets.top + 8, paddingBottom: 32 }}>
      <BrandPanel radius={34} style={{ gap: 14, padding: 20 }}>
        <View>
          <Text className="font-jkx text-[10.5px] uppercase tracking-[1.4px] text-white/70">Ready to withdraw</Text>
          <Text className="font-jkx text-[40px] text-white">{inr(ready)}</Text>
          <Text className="font-jk text-[12.5px] text-white/75">
            {pending ? `${inr(pending)} more is on its way${nextReady ? ` · ready ${clock(nextReady)}` : ''}` : 'New jobs are ready to withdraw a day after you finish them.'}
            {held ? ` · ${inr(held)} on hold` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" disabled={!canWithdraw || busy} onPress={doWithdraw}
          className="items-center rounded-full bg-white py-3.5" style={{ opacity: canWithdraw && !busy ? 1 : 0.5 }}>
          <Text className="font-jkb text-[15px] text-brand">{busy ? 'Sending…' : `Withdraw ${inr(ready)}`}</Text>
        </Pressable>
        {!canWithdraw ? (
          <Text className="font-jk text-center text-[12px] text-white/75">
            {!method ? 'Add your UPI ID or bank account below to withdraw.' : ready < MIN_WITHDRAW ? `You can withdraw once ${inr(MIN_WITHDRAW)} is ready.` : 'Your account is not verified yet.'}
          </Text>
        ) : null}
      </BrandPanel>
      {err ? <Note tone="crit">{err}</Note> : null}
      {partner?.suspended ? <Note tone="warn">Your account is on hold, so withdrawals are paused. Please call support.</Note> : null}

      <Card>
        <Eyebrow>Money goes to</Eyebrow>
        <Pressable accessibilityRole="button" onPress={() => router.push('/partner/payout' as Href)} className="flex-row items-center gap-3 py-1">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-sunk dark:bg-sunk-dark"><Banknote size={18} color={method ? c.ok : c.ink3} /></View>
          <View className="flex-1">
            <H>{method ? method.label : 'Add UPI ID or bank account'}</H>
            <Tiny>{method ? `${method.type === 'upi' ? 'UPI' : 'Bank account'} · ${method.holderName}` : 'Needed before you can withdraw'}</Tiny>
          </View>
          <Text className="font-jkm text-[13px] text-brand dark:text-brand-dark">{method ? 'Change' : 'Add'}</Text>
          <ChevronRight size={16} color={c.ink3} />
        </Pressable>
        <Divider />
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <H>Weekly auto-payout</H>
            <Tiny>Every Monday at 9 AM, whatever is ready (at least {inr(MIN_WITHDRAW)}) is sent to you.</Tiny>
          </View>
          <Switch value={partner?.autoPayout !== false} disabled={!method} onValueChange={(v) => { setAutoPayout({ on: v }).catch((e) => setErr((e as Error).message)); }}
            trackColor={{ true: c.ok, false: c.line }} />
        </View>
      </Card>

      {withdrawals.length ? (
        <>
          <Eyebrow className="mt-1 px-1">Withdrawals</Eyebrow>
          <Card>
            {withdrawals.slice(0, 10).map((w, i) => (
              <View key={w.id}>
                {i ? <Divider /> : null}
                <View className="flex-row items-center gap-3 py-2.5">
                  <View className="flex-1">
                    <Text className="font-jks text-[14px] text-ink dark:text-ink-dark">{inr(w.amount)} to {w.method.label}</Text>
                    <Tiny>
                      {whenLabel(w.createdAt)}{w.trigger === 'weekly' ? ' · weekly payout' : ''}
                      {w.status === 'paid' && w.utr ? ` · UTR ${w.utr}` : ''}
                      {w.status === 'failed' ? ` · ${w.error ?? 'failed'} — money is back in your wallet` : ''}
                    </Tiny>
                  </View>
                  <Badge tone={W_BADGE[w.status].tone} label={W_BADGE[w.status].label} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Card>
        <Eyebrow>This week · since Monday</Eyebrow>
        <Row title={`Job pay · ${week.length} job${week.length === 1 ? '' : 's'}`} sub={`${Math.round(PARTNER_SHARE * 100)}% of the booked time`}
          right={<Text className="font-jks text-[13.5px] text-ink dark:text-ink-dark">{inr(weekPay.job)}</Text>} />
        <Divider />
        <Row title="Extra time" sub={`When a customer adds minutes · ${inr(OVERTIME_PER_MIN)}/min fare`}
          right={<Text className="font-jks text-[13.5px] text-ink dark:text-ink-dark">{inr(weekPay.extra)}</Text>} />
        {weekPay.tip ? (<><Divider /><Row title="Tips" sub="100% yours" right={<Text className="font-jks text-[13.5px] text-ink dark:text-ink-dark">{inr(weekPay.tip)}</Text>} /></>) : null}
      </Card>

      <Eyebrow className="mt-1 px-1">Recent jobs</Eyebrow>
      {earnings.length === 0 ? (
        <Card><H>No earnings yet</H><Tiny>Go online from the Jobs tab. Each finished job adds your share here.</Tiny></Card>
      ) : null}
      {earnings.slice(0, 30).map((e) => {
        const b = bookings.find((x) => x.id === e.bookingId);
        const st = stateOf(e, now);
        return (
          <Card key={e.id}>
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <H>{b ? bookingTitle(b) : `Job ${e.bookingId.slice(-6)}`}</H>
                <Tiny>{whenLabel(b?.endedAt ?? e.createdAt)}{b ? ` · ${mins(b.workedMin ?? b.durationMin + b.extraMin)}` : ''}{e.tip ? ` · ${inr(e.tip)} tip` : ''}</Tiny>
              </View>
              <View className="items-end gap-1">
                <Text className="font-jkx text-[16px] text-ink dark:text-ink-dark">{inr(e.total)}</Text>
                {b?.rating ? <View className="flex-row items-center gap-1"><Star size={12} /><Tiny>{b.rating}</Tiny></View> : null}
              </View>
            </View>
            <View className="flex-row items-center justify-between">
              <Badge tone={BADGE[st].tone} label={BADGE[st].label} />
              <Tiny>
                {st === 'pending' ? `Ready ${whenLabel(e.availableAt ?? now).replace(/^(Today|Tomorrow)/, (w) => w.toLowerCase())}`
                  : st === 'on_hold' ? (e.holdReason ? `Held: ${e.holdReason}` : 'Held while we look at a complaint')
                  : st === 'ready' ? 'In your wallet' : 'Sent to your account'}
              </Tiny>
            </View>
          </Card>
        );
      })}
      <Note tone="ok">You keep {Math.round(PARTNER_SHARE * 100)}% of every booking and every extra minute, plus all tips. Coupons never reduce your pay.</Note>
    </ScrollView>
  );
}
