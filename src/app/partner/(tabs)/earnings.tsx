import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandPanel } from '@/components/BrandPanel';
import { Star } from '@/components/icons';
import { Badge, Card, Divider, Eyebrow, H, Note, Row, Tiny } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { usePartnerBookings, useMyEarnings } from '@/lib/db';
import { inr, mins, whenLabel } from '@/lib/format';
import { OVERTIME_PER_MIN, PARTNER_SHARE, bookingTitle, expertPay } from '@/lib/mock';
import type { EarningDoc } from '@/lib/types';

/** Monday 00:00 of the current week, local time. */
function weekStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

const STATUS: Record<EarningDoc['status'], { tone: 'ok' | 'warn' | 'crit' | 'neutral'; label: string }> = {
  sent: { tone: 'ok', label: 'sent' },
  on_hold: { tone: 'warn', label: 'on hold' },
  awaiting_account: { tone: 'neutral', label: 'waiting for bank' },
  failed: { tone: 'crit', label: 'retrying' },
};

/**
 * What she earned and where the money is. Each finished visit becomes a Razorpay Route transfer to her
 * linked bank account: held for a day in case of a complaint, then it settles like any Razorpay payout.
 */
export default function Earnings() {
  const insets = useSafeAreaInsets();
  const { partner } = useAuth();
  const { rows: bookings } = usePartnerBookings();
  const { rows: earnings } = useMyEarnings();
  const since = weekStart();
  const done = bookings
    .filter((b) => b.status === 'completed' && (b.endedAt ?? b.createdAt) >= since)
    .sort((a, b) => (b.endedAt ?? b.createdAt) - (a.endedAt ?? a.createdAt));
  const ledger = new Map(earnings.map((e) => [e.bookingId, e]));
  const pay = (b: (typeof done)[number]) => ledger.get(b.id) ?? { ...expertPay(b), status: 'awaiting_account' as const };

  const jobPay = done.reduce((n, b) => n + pay(b).jobPay, 0);
  const extraPay = done.reduce((n, b) => n + pay(b).extraPay, 0);
  const tips = done.reduce((n, b) => n + pay(b).tip, 0);
  const total = jobPay + extraPay + tips;
  const sent = done.reduce((n, b) => n + (ledger.get(b.id)?.status === 'sent' ? pay(b).total : 0), 0);
  const minutes = done.reduce((n, b) => n + (b.workedMin ?? b.durationMin + b.extraMin), 0);
  const rated = done.filter((b) => b.rating);
  const avg = rated.length ? Math.round((rated.reduce((n, b) => n + (b.rating ?? 0), 0) / rated.length) * 10) / 10 : null;
  const linked = Boolean(partner?.payout?.accountId);

  return (
    <ScrollView className="flex-1 bg-ground dark:bg-ground-dark" showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, gap: 14, paddingTop: insets.top + 8, paddingBottom: 32 }}>
      <BrandPanel radius={34} style={{ gap: 16, padding: 20 }}>
        <View>
          <Text className="font-jkx text-[10.5px] uppercase tracking-[1.4px] text-white/70">This week · since Monday</Text>
          <Text className="font-jkx text-[40px] text-white">{inr(total)}</Text>
          <Text className="font-jk text-[12.5px] text-white/75">
            {linked ? `${inr(sent)} sent · lands in your bank a day after each job` : 'Your bank account is not linked yet — money waits safely until it is'}
          </Text>
        </View>
        <View className="flex-row gap-3">
          {[
            { k: 'Jobs', v: String(done.length) },
            { k: 'Time', v: minutes ? mins(minutes) : '0 min' },
            { k: 'Rating', v: avg ? String(avg) : '—' },
          ].map((t) => (
            <View key={t.k} className="flex-1 rounded-3xl border border-white/15 bg-white/10 p-3">
              <Text className="font-jkx text-[9.5px] uppercase tracking-[1.1px] text-white/60">{t.k}</Text>
              <Text className="font-jkx text-[18px] text-white">{t.v}</Text>
            </View>
          ))}
        </View>
      </BrandPanel>

      {!linked ? (
        <Note tone="warn">The Sahayak team links your bank account through Razorpay after your ID check. Every job you finish before then is paid out as soon as it is linked.</Note>
      ) : null}

      <Card>
        <Eyebrow>How it adds up</Eyebrow>
        <Row title={`Job pay · ${done.length} job${done.length === 1 ? '' : 's'}`} sub={`${Math.round(PARTNER_SHARE * 100)}% of the booked time`}
          right={<Text className="font-jks text-[13.5px] text-ink dark:text-ink-dark">{inr(jobPay)}</Text>} />
        <Divider />
        <Row title="Extra time" sub={`When a customer adds minutes · ${inr(OVERTIME_PER_MIN)}/min fare`}
          right={<Text className="font-jks text-[13.5px] text-ink dark:text-ink-dark">{inr(extraPay)}</Text>} />
        {tips ? (<><Divider /><Row title="Tips" sub="100% yours" right={<Text className="font-jks text-[13.5px] text-ink dark:text-ink-dark">{inr(tips)}</Text>} /></>) : null}
        <Divider />
        <Row title="Deductions" sub="None" right={<Text className="font-jks text-[13.5px] text-ok dark:text-ok-dark">{inr(0)}</Text>} />
      </Card>

      <Eyebrow className="mt-1 px-1">Jobs this week</Eyebrow>
      {done.length === 0 ? (
        <Card><H>No finished jobs yet</H><Tiny>Go online from the Jobs tab. Each finished job shows up here with what you earned.</Tiny></Card>
      ) : null}
      {done.map((b) => {
        const e = ledger.get(b.id);
        const st = STATUS[e?.status ?? 'awaiting_account'];
        return (
          <Card key={b.id}>
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <H>{bookingTitle(b)}</H>
                <Tiny>{whenLabel(b.endedAt ?? b.createdAt)} · {mins(b.workedMin ?? b.durationMin + b.extraMin)}{b.extraMin ? ` · +${b.extraMin} min added` : ''}</Tiny>
              </View>
              <View className="items-end gap-1">
                <Text className="font-jkx text-[16px] text-ink dark:text-ink-dark">{inr(pay(b).total)}</Text>
                {b.rating ? <View className="flex-row items-center gap-1"><Star size={12} /><Tiny>{b.rating}</Tiny></View> : null}
              </View>
            </View>
            <View className="flex-row items-center justify-between">
              <Badge tone={st.tone} label={st.label} />
              <Tiny>
                {e?.status === 'sent' ? `In your bank by ${whenLabel(e.releaseAt ?? Date.now()).replace(/^(Today|Tomorrow)/, (w) => w.toLowerCase())}`
                  : e?.status === 'on_hold' ? 'Held while we look at a complaint'
                  : e?.status === 'failed' ? 'Transfer failed — the team will retry'
                  : 'Paid as soon as your bank is linked'}
              </Tiny>
            </View>
          </Card>
        );
      })}
      <Note tone="ok">You keep {Math.round(PARTNER_SHARE * 100)}% of every booking and every extra minute. Each job is sent through Razorpay the moment you finish it and settles to your bank the next day.</Note>
    </ScrollView>
  );
}
