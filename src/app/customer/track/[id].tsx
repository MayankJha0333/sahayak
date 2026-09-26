import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View, ActivityIndicator } from 'react-native';
import { Phone, ShieldCheck } from '@/components/icons';
import { TrackingMap } from '@/components/TrackingMap';
import { AppBar, Avatar, Badge, Btn, Card, Eyebrow, H, Note, Progress, Screen, SplitRow, Tiny } from '@/components/ui';
import { Check } from '@/components/icons';
import { cancelBooking, createExtensionOrder, finishJob, startJob, verifyExtension } from '@/lib/api';
import { useRoute } from '@/lib/route';
import { usePay } from '@/lib/usePay';
import { useBooking, usePartner } from '@/lib/db';
import { HANDOVER_MIN, km } from '@/lib/geo';
import { clock, inr, mmss, whenLabel } from '@/lib/format';
import { LATE_CANCEL_FEE, OVERTIME_PER_MIN, bookingTitle, taskLines } from '@/lib/mock';
import { useTheme } from '@/theme';

export default function Track() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const b = useBooking(String(id));
  const partner = usePartner(b?.partnerId);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const checkout = usePay();

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (b?.status === 'completed') router.replace(`/customer/rate/${b.id}`);
    if (b?.status === 'cancelled') router.replace('/customer/(tabs)/bookings');
    if (b?.status === 'matching' || b?.status === 'no_match') router.replace(`/customer/matching/${b.id}`);
  }, [b, b?.status, router]);

  const riding = b?.status === 'assigned' && !(b.scheduledFor && now && b.scheduledFor - now > 60 * 60_000);
  const route = useRoute(riding ? (b?.partnerAt ?? partner?.at) : null, riding ? b?.address.at : null);

  if (!b) return null;

  const at = b.partnerAt ?? partner?.at;
  // Road distance and ride time from where she is now; arrival and start follow from them.
  const eta = route?.minutes ?? b.eta?.minutes ?? 0;
  const arriveAt = now + eta * 60_000;
  const startAround = arriveAt + HANDOVER_MIN * 60_000;
  const roadLabel = route ? `${km(route.roadM)}${route.source === 'road' ? ' by road' : ''}` : '';
  const title = bookingTitle(b);
  const tasks = taskLines(b);
  const bookedMin = b.durationMin + b.extraMin;
  // Session timer: counts down to the end of the paid time; `elapsed` is how long she has been working.
  const endsAt = b.endsAt ?? b.autoCompleteAt ?? (b.startedAt ? b.startedAt + bookedMin * 60_000 : 0);
  const leftSecs = endsAt && now ? Math.max(0, (endsAt - now) / 1000) : bookedMin * 60;
  const totalSecs = b.startedAt ? Math.max(1, (endsAt - b.startedAt) / 1000) : bookedMin * 60;
  const elapsedSecs = b.startedAt && now ? Math.max(0, (now - b.startedAt) / 1000) : 0;
  const timeUp = b.status === 'in_progress' && Boolean(endsAt) && now >= endsAt;
  const bot = Boolean(partner?.bot);
  const paidExtra = (b.extensions ?? []).reduce((n, x) => n + x.amount, 0);
  const unpaidExtraMin = Math.max(0, b.extraMin - (b.extensions ?? []).reduce((n, x) => n + x.minutes, 0));
  const runningTotal = b.amountDue + paidExtra + unpaidExtraMin * OVERTIME_PER_MIN;

  // Same rule as the server: a late cancel costs up to ₹49, never more than what was paid.
  // Upcoming = a scheduled visit more than 2 hours away: she is not riding yet and cancelling is free.
  const upcoming = Boolean(b.scheduledFor && now && b.scheduledFor - now > 2 * 60 * 60_000);
  const waitingForSlot = Boolean(b.scheduledFor && now && b.scheduledFor > now && b.status === 'assigned');
  // Free for 2 minutes after she accepts (same rule as the server), then the late fee applies.
  const inGrace = !b.scheduledFor && b.status === 'assigned' && Boolean(b.assignedAt) && now - (b.assignedAt ?? 0) < 2 * 60_000;
  const cancelFee = upcoming || inGrace ? 0 : Math.min(LATE_CANCEL_FEE, b.amountDue);
  const graceLeft = inGrace ? Math.max(0, (2 * 60_000 - (now - (b.assignedAt ?? 0))) / 1000) : 0;
  const cancelTitle = inGrace ? `Cancel free · ${mmss(graceLeft)} left` : cancelFee === 0 ? `Cancel · full ${inr(b.amountDue)} refunded` : b.amountDue <= cancelFee
    ? `Cancel · ${inr(cancelFee)} is kept as the late fee`
    : `Cancel · ${inr(cancelFee)} fee, ${inr(b.amountDue - cancelFee)} refunded`;
  const callExpert = () => { if (partner?.phone) Linking.openURL(`tel:${partner.phone}`).catch(() => {}); };

  // Each button spins on its own, and a failure is shown instead of being swallowed.
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr('');
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const cancel = () => Alert.alert(
    cancelFee ? `Cancel and pay the ${inr(cancelFee)} late fee?` : 'Cancel this visit?',
    cancelFee
      ? `${partner?.name ?? 'Your expert'} is already on her way. ${b.amountDue > cancelFee ? `${inr(b.amountDue - cancelFee)} comes back to you.` : 'Nothing comes back.'}`
      : `The full ${inr(b.amountDue)} comes back to you in 5–7 working days.`,
    [
      { text: 'Keep visit', style: 'cancel' },
      { text: 'Cancel visit', style: 'destructive', onPress: () => run('cancel', async () => {
        const r = await cancelBooking({ bookingId: b.id, expectFee: cancelFee });
        Alert.alert('Visit cancelled', r.refunded ? `${inr(r.refunded)} is on its way back — 5–7 working days.` : 'The late fee covers her trip.');
      }) },
    ],
  );
  // Extend: Razorpay order → checkout → server confirms → the end of the session moves (both apps update live).
  const extend = (minutes: number) => run(`x${minutes}`, async () => {
    const order = await createExtensionOrder({ bookingId: b.id, minutes });
    const outcome = await checkout.pay(order, `${minutes} more minutes · ${title}`, (r) =>
      verifyExtension({ bookingId: b.id, paymentId: r.razorpay_payment_id, orderId: r.razorpay_order_id, signature: r.razorpay_signature }));
    if (outcome === 'paid') Alert.alert(`${minutes} minutes added`, `${partner?.name?.split(' ')[0] ?? 'Your expert'} can keep going. Paid ${inr(minutes * OVERTIME_PER_MIN)}.`);
  });

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar
        title={b.scheduledFor && b.assignedAt && b.assignedAt > now ? 'Scheduled visit' : 'Your booking'}
        subtitle={title} back />
      <Screen
        footer={
          b.status === 'in_progress' ? (
            <>
              <View className="flex-row items-baseline justify-between">
                <Text className={`font-jkb text-[15px] ${timeUp ? 'text-crit dark:text-crit-dark' : 'text-ink dark:text-ink-dark'}`}>{timeUp ? 'Time is up — add more?' : 'Add more time'}</Text>
                <Tiny>{inr(OVERTIME_PER_MIN)} a minute</Tiny>
              </View>
              <View className="flex-row gap-2">
                {[15, 30, 60].map((m) => {
                  const urgent = timeUp || leftSecs < 300;
                  const going = busy === `x${m}`;
                  return (
                    <Pressable key={m} accessibilityRole="button" accessibilityLabel={`Add ${m} minutes for ${inr(m * OVERTIME_PER_MIN)}`}
                      disabled={Boolean(busy)} onPress={() => extend(m)}
                      className={`flex-1 items-center rounded-2xl border-[1.5px] py-2.5 active:opacity-80 ${urgent ? 'border-brand bg-brand dark:border-brand-dark dark:bg-brand-dark' : 'border-line bg-paper dark:border-line-dark dark:bg-paper-dark'} ${busy && !going ? 'opacity-40' : ''}`}>
                      {going ? <ActivityIndicator size="small" color={urgent ? c.onBrand : c.brand} style={{ height: 38 }} /> : (
                        <>
                          <Text className={`font-jkx text-[16px] ${urgent ? 'text-onbrand' : 'text-ink dark:text-ink-dark'}`}>+{m} min</Text>
                          <Text className={`font-jkm text-[12.5px] ${urgent ? 'text-onbrand' : 'text-ink2 dark:text-ink2-dark'}`}>{inr(m * OVERTIME_PER_MIN)}</Text>
                        </>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : b.status === 'arrived' ? (
            bot
              ? <Btn title="She has started — I shared the code" busy={busy === 'start'} onPress={() => run('start', () => startJob({ bookingId: b.id, code: b.startCode }))} />
              : <Tiny className="text-center">Read the code out to her. The job starts when she enters it.</Tiny>
          ) : (
            <Btn title={cancelTitle} tone="danger" busy={busy === 'cancel'} onPress={cancel} />
          )
        }>
        <TrackingMap
          origin={partner?.at ?? b.address.at} dest={b.address.at} at={at} hideExpert={waitingForSlot} height={230}
          route={route?.points}
          label={waitingForSlot ? 'Your address' : b.status === 'assigned' ? `${eta} min away` : b.status === 'arrived' ? 'At your gate' : 'Working'}
          footer={waitingForSlot
            ? (b.leaveAt ? `She leaves at ${clock(b.leaveAt)} to reach you by ${clock(b.scheduledFor!)}` : undefined)
            : b.status === 'assigned' ? `${roadLabel} · ${eta} min ride · here by ${clock(arriveAt)}` : undefined} />

        {err ? <Note tone="crit">{err}</Note> : null}
        {/* Status: one chip, one big line, the journey, then the person — the pattern every tracking screen shares. */}
        <Card>
          <View className="flex-row items-center justify-between">
            <Badge tone={b.status === 'assigned' ? 'ok' : 'brand'} label={waitingForSlot ? 'confirmed' : b.status === 'assigned' ? 'on the way' : b.status === 'arrived' ? 'at your door' : 'in progress'} />
            <Tiny>{b.id}</Tiny>
          </View>
          <Text className="font-jkx text-[26px] leading-8 tracking-tight text-ink dark:text-ink-dark">
            {waitingForSlot ? whenLabel(b.scheduledFor!) : b.status === 'assigned' ? (eta <= 1 ? 'Arriving now' : `Arriving in ${eta} min`) : b.status === 'arrived' ? 'She is at your gate' : timeUp ? 'Paid time is up' : `${mmss(leftSecs)} left`}
          </Text>
          {bot && b.status === 'in_progress' ? <Badge tone="warn" label="demo expert · job shortened to 90 s" /> : null}
          <Tiny>{waitingForSlot
            ? `${partner?.name ?? 'Your expert'} is booked for you${b.leaveAt ? ` and leaves at ${clock(b.leaveAt)}` : ''}${upcoming ? ' — cancel free until 2 hours before' : ''}.`
            : b.status === 'assigned' ? `${partner?.name ?? 'Your expert'} is riding to ${b.address.line1} · work starts around ${clock(startAround)}`
            : b.status === 'arrived' ? 'Share the start code to begin the clock'
            : `${bookedMin} min booked · working for ${mmss(elapsedSecs)} · ${b.doneTasks.length}/${tasks.length} tasks done`}</Tiny>
          <Journey step={waitingForSlot ? 0 : b.status === 'assigned' ? 1 : b.status === 'arrived' ? 2 : 3} />
        </Card>

        {partner ? (
          <Card>
            <View className="flex-row items-center gap-3">
              <Avatar initials={partner.initials} size={44} />
              <View className="flex-1"><H>{partner.name}</H><Tiny>★ {partner.rating} · {partner.jobs} jobs · ID verified</Tiny></View>
            </View>
            <View className="flex-row gap-2">
              <View className="flex-1"><Btn title={partner.phone ? `Call ${partner.name.split(' ')[0]}` : 'Calling opens at launch'} tone="secondary" size="sm" disabled={!partner.phone} onPress={callExpert} icon={<Phone size={15} color={c.ink2} />} /></View>
            </View>
            <Tiny>Her photo, name and ID badge will match what you see here.</Tiny>
          </Card>
        ) : null}

        {b.status === 'arrived' ? (
          <Card selected className="items-center">
            <Eyebrow>Read this out to start the clock</Eyebrow>
            <Text className="font-jkx text-[44px] tracking-[8px] text-ink dark:text-ink-dark">{b.startCode}</Text>
            <View className="flex-row items-center gap-2">
              <ShieldCheck size={15} color={c.ok} />
              <Tiny>Check her photo and badge match before you share it</Tiny>
            </View>
          </Card>
        ) : null}

        {b.status === 'in_progress' ? (
          <>
            <Card selected className="items-center">
              <Eyebrow>{timeUp ? 'Paid time is up' : 'Time left'}</Eyebrow>
              <Text className={`font-jkx text-[38px] ${timeUp || leftSecs < 300 ? 'text-crit dark:text-crit-dark' : 'text-ink dark:text-ink-dark'}`}>{mmss(leftSecs)}</Text>
              <View className="w-full"><Progress value={totalSecs ? Math.min(1, elapsedSecs / totalSecs) : 0} /></View>
              <View className="w-full flex-row justify-between">
                <Tiny>Started {b.startedAt ? clock(b.startedAt) : '—'} · working {mmss(elapsedSecs)}</Tiny>
                <Tiny>Ends {endsAt ? clock(endsAt) : '—'}</Tiny>
              </View>
              {b.extraMin ? <Tiny>includes {b.extraMin} extra minutes you added</Tiny> : null}
              {timeUp ? <Tiny className="text-center">She is wrapping up. Add time below to keep her, or she finishes and the visit closes.</Tiny> : null}
            </Card>
            <Card>
              <Eyebrow>Her checklist — updates live</Eyebrow>
              {tasks.map((t) => {
                const on = b.doneTasks.includes(t);
                return (
                  <View key={t} className="flex-row items-center gap-2.5 py-1.5">
                    <View className={`h-4 w-4 rounded ${on ? 'bg-brand' : 'border border-line dark:border-line-dark'}`} />
                    <Text className={`font-jk flex-1 text-[13.5px] ${on ? 'text-ink dark:text-ink-dark' : 'text-ink3 dark:text-ink3-dark'}`}>{t}</Text>
                  </View>
                );
              })}
            </Card>
            {bot ? <Btn title="Finish early" tone="ghost" busy={busy === 'finish'} onPress={() => run('finish', () => finishJob({ bookingId: b.id }))} /> : null}
          </>
        ) : null}

        <Card>
          <Eyebrow>Booking</Eyebrow>
          <SplitRow label={`Expert for ${b.durationMin} min`} value={inr(b.price)} />
          {b.discount ? <SplitRow label="Discounts" value={`-${inr(b.discount)}`} /> : null}
          <SplitRow label="Paid at booking" value={inr(b.amountDue)} />
          {(b.extensions ?? []).map((x) => <SplitRow key={x.orderId} label={`Extra ${x.minutes} min · paid ${clock(x.at)}`} value={inr(x.amount)} />)}
          {unpaidExtraMin ? <SplitRow label={`Extra ${unpaidExtraMin} min · pay at the end`} value={inr(unpaidExtraMin * OVERTIME_PER_MIN)} /> : null}
          <SplitRow label="Running total" value={inr(runningTotal)} strong />
        </Card>

        <Note>The clock starts when the code is entered, not at the scheduled time. You never pay for her being late.</Note>
      </Screen>
      {checkout.element}
    </View>
  );
}

const STEPS = ['Booked', 'Riding', 'At door', 'Working', 'Done'];

/** Five dots joined by a line; everything up to `step` is filled. */
function Journey({ step }: { step: number }) {
  const { c } = useTheme();
  return (
    <View className="mt-1 flex-row items-center">
      {STEPS.map((label, i) => {
        const done = i < step; const now = i === step;
        return (
          <View key={label} className="flex-1 flex-row items-center">
            <View className="items-center" style={{ width: 52 }}>
              <View className={`h-5 w-5 items-center justify-center rounded-full ${done || now ? 'bg-brand' : 'bg-line dark:bg-line-dark'} ${now ? 'border-2 border-brand-soft dark:border-brand-softdark' : ''}`}>
                {done ? <Check size={11} color={c.onBrand} /> : null}
              </View>
              <Text className={`mt-1 text-[9.5px] ${now ? 'font-jkb text-ink dark:text-ink-dark' : 'font-jkm text-ink3 dark:text-ink3-dark'}`} numberOfLines={1}>{label}</Text>
            </View>
            {i < STEPS.length - 1 ? <View className={`-mx-3 mb-4 h-0.5 flex-1 ${i < step ? 'bg-brand' : 'bg-line dark:bg-line-dark'}`} /> : null}
          </View>
        );
      })}
    </View>
  );
}
