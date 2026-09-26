import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppBar, Btn, Card, Eyebrow, Note, Screen, SplitRow, Tiny } from '@/components/ui';
import { Check, ChevronRight, Tag } from '@/components/icons';
import { takeCoupon } from '@/lib/bookingDraft';
import { createOrder, listMyCoupons, verifyPayment, type OrderResult } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAllPartners } from '@/lib/db';
import { usePay } from '@/lib/usePay';
import { distanceM, km, travelEstimate } from '@/lib/geo';
import { clock, inr, whenLabel } from '@/lib/format';
import { OVERTIME_PER_MIN, priceForMinutes, serviceBySlug, tasksTitle } from '@/lib/mock';
import { useTheme } from '@/theme';
import { NotServed } from '@/components/NotServed';
import { useServiceArea } from '@/lib/areas';

type Applied = { code: string; title: string; amount: number; description?: string };

export default function Review() {
  const router = useRouter();
  const { tasks: tasksParam, duration, when } = useLocalSearchParams<{ tasks: string; duration: string; when: string }>();
  const { profile } = useAuth();
  const { rows: partners } = useAllPartners();
  const { c } = useTheme();

  const tasks = String(tasksParam ?? '').split(',').filter(Boolean);
  const durationMin = Number(duration);
  const title = tasksTitle(tasks);
  const skills = [...new Set(tasks.map((t) => serviceBySlug(t).skill))];
  const scheduledFor = when ? Number(when) : null;
  const address = profile?.addresses.find((a) => a.id === profile.defaultAddressId) ?? profile?.addresses[0];
  const { served, loading: areasLoading } = useServiceArea();
  // Outside every live area (checked live, and again by the server when paying).
  const blocked = Boolean(address) && !areasLoading && (!served(address!.at));

  // Coupons she can use are listed by the server, which applies the same rules when she pays.
  const [offers, setOffers] = useState<Applied[]>([]);
  const [applied, setApplied] = useState<Applied | null>(null);
  // "FIRST50 applied" for a moment after she comes back from the coupon page.
  const [justApplied, setJustApplied] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const checkout = usePay();
  const [note, setNote] = useState('');
  // A checkout that was closed or failed is reused on the next tap, so a retry does not create a second booking.
  const lastOrder = useRef<{ key: string; o: OrderResult } | null>(null);

  const base = priceForMinutes(durationMin);
  useEffect(() => {
    let live = true;
    listMyCoupons({ price: base }).then((r) => {
      if (!live) return;
      const list = r.coupons.sort((a, b) => b.amount - a.amount);
      // Nothing is applied for her: she opens the list and picks one herself.
      setOffers(list);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [base]);
  // Back from the coupon page: take what she picked (or removed).
  useFocusEffect(useCallback(() => {
    const picked = takeCoupon();
    if (picked === undefined) return;
    setApplied(picked);
    setJustApplied(picked ? `${picked.code} applied — you save ${inr(picked.amount)}` : '');
  }, [setApplied, setJustApplied]));
  useEffect(() => {
    if (!justApplied) return;
    const t = setTimeout(() => setJustApplied(''), 3500);
    return () => clearTimeout(t);
  }, [justApplied]);
  const couponOff = applied?.amount ?? 0;
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
    const key = `${tasks.join(',')}|${durationMin}|${scheduledFor}|${applied?.code ?? ''}|${address.id}`;
    try {
      // A checkout that was closed or failed is reused on the next tap, so a retry never makes a second booking.
      let o = lastOrder.current?.key === key ? lastOrder.current.o : null;
      if (!o) {
        o = await createOrder({ tasks, durationMin, addressId: address.id, scheduledFor, coupon: applied?.code });
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
            {address && blocked ? <Btn title="Not available here yet — change address" tone="secondary" onPress={() => router.push('/customer/address')} />
              : address ? <Btn title={due > 0 ? `Pay ${inr(due)} with Razorpay` : 'Confirm · covered by rewards'} busy={busy || checkout.busy} onPress={pay} />
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
          {couponOff && applied ? <SplitRow label={`Coupon ${applied.code}`} value={`-${inr(couponOff)}`} /> : null}
          {rewardOff ? <SplitRow label="Referral reward" value={`-${inr(rewardOff)}`} /> : null}
          <View className="h-px bg-line2 dark:bg-line2-dark" />
          <SplitRow label="Pay now" value={inr(due)} strong />
        </Card>

        <Pressable accessibilityRole="button" accessibilityLabel={applied ? `Coupon ${applied.code} applied. Change coupon` : 'Apply a coupon'}
          onPress={() => router.push({ pathname: '/customer/coupons', params: { price: String(base), ...(applied ? { applied: applied.code } : {}) } })}
          className="flex-row items-center gap-3 rounded-[24px] bg-paper px-4 py-4 active:opacity-90 dark:bg-paper-dark">
          <View className={`h-10 w-10 items-center justify-center rounded-2xl ${applied ? 'bg-ok-soft dark:bg-ok-softdark' : 'bg-brand-soft dark:bg-brand-softdark'}`}>
            {applied ? <Check size={18} color={c.ok} /> : <Tag size={18} color={c.brand} />}
          </View>
          <View className="flex-1">
            <Text className="font-jkb text-[15px] text-ink dark:text-ink-dark">{applied ? `${applied.code} applied` : 'Apply coupon'}</Text>
            <Tiny>{applied ? `You save ${inr(applied.amount)} · tap to change` : offers.length ? `${offers.length} offer${offers.length > 1 ? 's' : ''} available · save up to ${inr(Math.max(...offers.map((o) => o.amount)))}` : 'See offers or enter a code'}</Tiny>
          </View>
          {applied ? (
            <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove coupon" onPress={() => { setApplied(null); setJustApplied(''); }}>
              <Text className="font-jkb text-[13px] text-crit dark:text-crit-dark">Remove</Text>
            </Pressable>
          ) : <ChevronRight size={20} color={c.ink3} />}
        </Pressable>
        {justApplied ? <Note tone="ok">{justApplied}</Note> : null}

        {err && !blocked ? <Note tone="crit">{err}</Note> : null}
        {blocked && address ? (
          <NotServed at={address.at} line={`${address.line1}, ${address.line2}`} city={address.line2.split(',').pop()?.trim()} onChangeAddress={() => router.push('/customer/address')} />
        ) : null}
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
