import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Star } from '@/components/icons';
import { AppBar, Avatar, Btn, Card, Chip, Eyebrow, H, Note, Screen, SplitRow, Tiny } from '@/components/ui';
import { createBalanceOrder, rateJob, verifyBalancePayment } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBooking, usePartner } from '@/lib/db';
import { clock, inr } from '@/lib/format';
import { usePay } from '@/lib/usePay';
import { OVERTIME_PER_MIN, bookingTitle } from '@/lib/mock';
import { useTheme } from '@/theme';

const GOOD = ['On time', 'Thorough', 'Polite', 'Careful with things', 'Left it spotless'];
const BAD = ['Came late', 'Rushed the work', 'Missed tasks', 'Rude', 'Broke something'];

export default function Rate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const { profile } = useAuth();
  const b = useBooking(String(id));
  const partner = usePartner(b?.partnerId);
  const [stars, setStars] = useState(5);
  const [tags, setTags] = useState<string[]>(['On time']);
  const tip = 0; // tips are postponed for the MVP
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const checkout = usePay();

  if (!b) return null;
  const title = bookingTitle(b);
  // Extra time bought during the visit was paid there and then; only older unpaid minutes are left to pay.
  const paidExtensions = b.extensions ?? [];
  const prepaidMin = paidExtensions.reduce((n, x) => n + x.minutes, 0);
  const unpaidMin = Math.max(0, b.extraMin - prepaidMin);
  const extra = unpaidMin * OVERTIME_PER_MIN;
  const balanceDue = b.balance?.paid ? 0 : extra + tip;
  const alreadyRated = Boolean(b.rating);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      if (!alreadyRated) await rateJob({ bookingId: b.id, rating: stars, tags });
      if (balanceDue > 0 && !b.balance?.paid) {
        const o = await createBalanceOrder({ bookingId: b.id, tip });
        if (o.amount > 0) {
          const outcome = await checkout.pay(o, `Extra time · ${b.id}`, (r) =>
            verifyBalancePayment({ bookingId: b.id, paymentId: r.razorpay_payment_id, orderId: r.razorpay_order_id, signature: r.razorpay_signature }));
          if (outcome !== 'paid') { setErr('Payment cancelled. Your rating is saved — tap to pay the balance.'); return; }
        }
      }
      router.replace('/customer');
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="How did it go?" subtitle="Job complete" />
      <Screen footer={<Btn title={balanceDue > 0 ? `Submit and pay ${inr(balanceDue)}` : 'Submit'} busy={busy} onPress={submit} />}>
        <Card className="items-center">
          <Avatar initials={partner?.initials ?? '--'} size={56} />
          <H>{partner?.name ?? 'Your expert'}</H>
          <View className="flex-row gap-1.5 pt-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => { if (alreadyRated) return; if ((n <= 3) !== (stars <= 3)) setTags([]); setStars(n); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${n} stars`}>
                <Star size={34} color={c.amber} filled={n <= (alreadyRated ? b.rating ?? 0 : stars)} />
              </Pressable>
            ))}
          </View>
        </Card>

        {!alreadyRated ? (
          <>
            <Eyebrow>{stars <= 3 ? 'What went wrong?' : 'What went well?'}</Eyebrow>
            <View className="flex-row flex-wrap gap-2">
              {(stars <= 3 ? BAD : GOOD).map((t) => <Chip key={t} label={t} on={tags.includes(t)} onPress={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])} />)}
            </View>
          </>
        ) : null}

        <Card>
          <Eyebrow>Final bill</Eyebrow>
          <SplitRow label={`Expert for ${b.durationMin} min`} value={inr(b.price)} />
          {b.discount ? <SplitRow label="Discounts" value={`-${inr(b.discount)}`} /> : null}
          <SplitRow label="Paid at booking" value={`-${inr(b.amountDue)}`} />
          {paidExtensions.map((x) => <SplitRow key={x.orderId} label={`Extra ${x.minutes} min (${inr(x.amount)})`} value="paid" />)}
          {extra ? <SplitRow label={`Extra ${unpaidMin} min · ${inr(OVERTIME_PER_MIN)}/min`} value={inr(extra)} /> : null}
          {b.workedMin != null ? <Tiny>She worked {b.workedMin} min{b.startedAt && b.endedAt ? ` (${clock(b.startedAt)} – ${clock(b.endedAt)})` : ''}.</Tiny> : null}
          {tip ? <SplitRow label="Tip" value={inr(tip)} /> : null}
          <View className="h-px bg-line2 dark:bg-line2-dark" />
          <SplitRow label={b.balance?.paid ? 'Balance paid' : 'To pay now'} value={inr(b.balance?.paid ? 0 : balanceDue)} strong />
        </Card>


        {err ? <Note tone="crit">{err}</Note> : null}
        {!alreadyRated && stars <= 2 ? <Note tone="warn">Sorry it went badly. Our team will call you within a day to put it right.</Note> : null}
      </Screen>

      {checkout.element}
    </View>
  );
}
