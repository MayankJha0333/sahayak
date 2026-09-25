import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { AppBar, Btn, Card, Chip, Eyebrow, Note, Screen, SplitRow, Tiny } from '@/components/ui';
import { createOrder, verifyPayment, type OrderResult } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAllPartners, useMyBookings } from '@/lib/db';
import { usePay } from '@/lib/usePay';
import { distanceM, km, travelEstimate } from '@/lib/geo';
import { clock, inr, whenLabel } from '@/lib/format';
import { OVERTIME_PER_MIN, priceForMinutes, serviceBySlug, tasksTitle } from '@/lib/mock';

export default function Review() {
  const router = useRouter();
  const { tasks: tasksParam, duration, when } = useLocalSearchParams<{ tasks: string; duration: string; when: string }>();
  const { profile } = useAuth();
  const { rows: partners } = useAllPartners();
  const { rows: mine } = useMyBookings();

  const tasks = String(tasksParam ?? '').split(',').filter(Boolean);
  const durationMin = Number(duration);
  const title = tasksTitle(tasks);
  const skills = [...new Set(tasks.map((t) => serviceBySlug(t).skill))];
  const scheduledFor = when ? Number(when) : null;
  const address = profile?.addresses.find((a) => a.id === profile.defaultAddressId) ?? profile?.addresses[0];

  // Same rule as the server: FIRST50 once, and not while another booking that used it is still open.
  const couponUsed = mine.some((b) => b.paid && b.status !== 'cancelled' && b.discount - (b.rewardUsed ?? 0) > 0);
  const couponAllowed = !profile?.firstBookingDone && !couponUsed;
  const [couponOn, setCoupon] = useState(true);
  const coupon = couponOn && couponAllowed;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const checkout = usePay();
  const [note, setNote] = useState('');
  // A checkout that was closed or failed is reused on the next tap, so a retry does not create a second booking.
  const lastOrder = useRef<{ key: string; o: OrderResult } | null>(null);

  const base = priceForMinutes(durationMin);
  const couponOff = coupon ? 50 : 0;
  const rewardOff = Math.min(profile?.rewards ?? 0, Math.max(0, base - couponOff));
  const due = Math.max(0, base - couponOff - rewardOff);
  const skilled = partners.filter((p) => p.onShift && skills.every((sk) => p.skills.includes(sk)) && (!address || distanceM(p.at, address.at) < 3000));
  const nearby = skilled.length;
  // The nearest skilled expert decides when she can be at the door and when the clock can start.
  const nearest = address && skilled.length
    ? skilled.map((p) => travelEstimate(p.at, address.at)).sort((a, b) => a.minutes - b.minutes)[0]
    : null;
  const [now] = useState(() => Date.now());
  const startsAround = nearest ? now + (nearest.minutes + 4) * 60_000 : null;

  // Paid: drop the booking form and this review from the stack, so Back from the visit goes home.
  const openBooking = (id: string) => {
    if (router.canDismiss()) router.dismissAll();
    router.push(scheduledFor ? `/customer/track/${id}` : `/customer/matching/${id}`);
  };

  const pay = async () => {
    if (!address) return;
    setBusy(true); setErr(''); setNote('');
    const key = `${tasks.join(',')}|${durationMin}|${scheduledFor}|${coupon}|${address.id}`;
    try {
      // A checkout that was closed or failed is reused on the next tap, so a retry never makes a second booking.
      let o = lastOrder.current?.key === key ? lastOrder.current.o : null;
      if (!o) {
        o = await createOrder({ tasks, durationMin, addressId: address.id, scheduledFor, coupon: coupon ? 'FIRST50' : undefined });
        if (o.amount === 0) { openBooking(o.bookingId); return; }
        lastOrder.current = { key, o };
      }
      const order = o;
      const outcome = await checkout.pay(order, `${title} · ${durationMin} min`, (r) =>
        verifyPayment({ bookingId: order.bookingId, paymentId: r.razorpay_payment_id, orderId: r.razorpay_order_id, signature: r.razorpay_signature }));
      if (outcome === 'paid') { lastOrder.current = null; openBooking(order.bookingId); }
      else setNote('Payment cancelled. Nothing was charged and nothing is booked yet.');
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="Review" subtitle="Before you pay" back />
      <Screen
        footer={
          <>
            {address ? <Btn title={due > 0 ? `Pay ${inr(due)} with Razorpay` : 'Confirm · covered by rewards'} busy={busy || checkout.busy} onPress={pay} />
              : <Btn title="Add your address to continue" onPress={() => router.push('/customer/address')} />}
            <Tiny>{scheduledFor ? 'Free to cancel until 2 hours before the slot.' : 'Free to cancel until 2 minutes after an expert accepts.'} Refunds go back the way you paid.</Tiny>
          </>
        }>
        <Card>
          <SplitRow label="Time" value={`${durationMin} min`} />
          <SplitRow label="Her list" value={title} />
          <SplitRow label="When" value={scheduledFor ? whenLabel(scheduledFor) : 'Now · nearest expert on shift'} />
          <SplitRow label="Where" value={address ? `${address.line1}, ${address.label}` : '—'} />
          {!scheduledFor ? <SplitRow label="Experts online nearby" value={nearby ? String(nearby) : 'none yet'} /> : null}
          {!scheduledFor && nearest && startsAround ? (
            <SplitRow label="Nearest expert" value={`${km(nearest.roadM)} · ~${nearest.minutes} min ride`} />
          ) : null}
          {!scheduledFor && startsAround ? <SplitRow label="Work starts around" value={clock(startsAround)} /> : null}
          {address?.directions ? <Tiny>{address.directions}</Tiny> : null}
        </Card>


        <Card>
          <Eyebrow>Bill</Eyebrow>
          <SplitRow label={`Expert for ${durationMin} min`} value={inr(base)} />
          {couponOff ? <SplitRow label="FIRST50" value={`-${inr(couponOff)}`} /> : null}
          {rewardOff ? <SplitRow label="Referral reward" value={`-${inr(rewardOff)}`} /> : null}
          <View className="h-px bg-line2 dark:bg-line2-dark" />
          <SplitRow label="Pay now" value={inr(due)} strong />
          <View className="flex-row flex-wrap gap-2 pt-1">
            {couponAllowed ? <Chip label={coupon ? 'FIRST50 applied' : 'Apply FIRST50'} on={coupon} onPress={() => setCoupon(!couponOn)} /> : null}
          </View>
        </Card>

        {err ? <Note tone="crit">{err}</Note> : null}
        {note ? <Note>{note}</Note> : null}
        <Note tone="warn">
          Need more time during the visit? Add 15, 30 or 60 minutes from the app at {inr(OVERTIME_PER_MIN)} a minute, paid when you add it.
        </Note>
        <Text className="font-jk text-center text-[11px] text-ink3 dark:text-ink3-dark">UPI · cards · net banking, via Razorpay</Text>
      </Screen>

      {checkout.element}
    </View>
  );
}
