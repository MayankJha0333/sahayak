import { Alert, Linking, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { Check, Navigation, Phone } from '@/components/icons';
import { TrackingMap } from '@/components/TrackingMap';
import { AppBar, Btn, Card, Chip, Eyebrow, H, Note, Progress, Screen, SplitRow, Tiny } from '@/components/ui';
import { finishJob, markArrived, startJob, toggleTask } from '@/lib/api';
import { directionsUrl } from '@/lib/useLiveLocation';
import { useAuth } from '@/lib/auth';
import { useBooking } from '@/lib/db';
import { HANDOVER_MIN, distanceM, km } from '@/lib/geo';
import { useRoute } from '@/lib/route';
import { clock, inr, mmss, whenLabel } from '@/lib/format';
import { OVERTIME_PER_MIN, bookingTitle, expertPay, taskLines } from '@/lib/mock';
import { useTheme } from '@/theme';

const FLAGS = ['Pet in the house', 'No supplies', 'Unsafe', 'Asked for extra work'];
const payout = (b: { price: number; extraMin: number; tip: number }) => expertPay(b).total;

export default function PartnerJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const { partner } = useAuth();
  const b = useBooking(String(id));
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [flags, setFlags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Ticks show instantly; the server copy catches up a moment later.
  const [ticks, setTicks] = useState<Record<string, boolean>>({});

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (b && ['completed', 'cancelled'].includes(b.status)) router.replace('/partner'); }, [b, b?.status, router]);


  const route = useRoute(b?.status === 'assigned' ? (b.partnerAt ?? partner?.at) : null, b?.status === 'assigned' ? b.address.at : null);

  if (!b || !partner) return null;
  const at = b.partnerAt ?? partner.at;
  const away = distanceM(at, b.address.at);
  // Ride time on the road from where she is; the customer's app shows the same arrival time.
  const rideMin = route?.minutes ?? 0;
  const reachBy = now + rideMin * 60_000;
  const scheduledLater = Boolean(b.scheduledFor && b.scheduledFor > now + 5 * 60_000);
  const leaveIn = b.leaveAt ? Math.round((b.leaveAt - now) / 60_000) : null;
  const title = bookingTitle(b);
  const tasks = taskLines(b);
  // Session timer: starts when the start code is accepted, counts down to the end of the paid time.
  const endsAt = b.endsAt ?? b.autoCompleteAt ?? 0;
  const leftSecs = endsAt && now ? Math.max(0, (endsAt - now) / 1000) : (b.durationMin + b.extraMin) * 60;
  const totalSecs = b.startedAt && endsAt ? Math.max(1, (endsAt - b.startedAt) / 1000) : (b.durationMin + b.extraMin) * 60;
  const elapsedSecs = b.startedAt && now ? Math.max(0, (now - b.startedAt) / 1000) : 0;
  const timeUp = Boolean(endsAt) && now >= endsAt;
  const lastExt = b.extensions?.[b.extensions.length - 1];
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  if (b.status === 'assigned') {
    return (
      <View className="flex-1 bg-ground dark:bg-ground-dark">
        <AppBar title={scheduledLater ? whenLabel(b.scheduledFor!) : `${rideMin} min away`} subtitle={scheduledLater ? 'Scheduled job' : 'Job accepted'} back />
        <Screen footer={<>
          <Btn title="I have reached" busy={busy} disabled={away > 250 && !partner.bot && !__DEV__} onPress={() => run(() => markArrived({ bookingId: b.id }))} />
          <Tiny>{away > 250 ? `Unlocks within 250 m of the address — you are ${km(away)} away${__DEV__ ? ' (dev: allowed anyway)' : ''}` : 'You are at the address'}</Tiny>
        </>}>
          <TrackingMap origin={partner.at} dest={b.address.at} at={at} height={240} route={route?.points}
            label={`${route ? km(route.roadM) : km(away)} to go`}
            footer={scheduledLater && b.leaveAt
              ? `Leave by ${clock(b.leaveAt)} · ~${rideMin || b.eta?.minutes || 0} min ride · start ${clock(b.scheduledFor!)}`
              : `~${rideMin} min ride · reach by ${clock(reachBy)} · start ~${clock(reachBy + HANDOVER_MIN * 60_000)}`} />
          {scheduledLater && leaveIn != null ? (
            <Note tone={leaveIn <= 10 ? 'warn' : 'ok'}>
              {leaveIn > 0 ? `Leave in ${leaveIn} min (at ${clock(b.leaveAt!)}) to reach on time for ${clock(b.scheduledFor!)}.` : `Leave now — the visit starts at ${clock(b.scheduledFor!)}.`}
            </Note>
          ) : null}
          <Card>
            <Eyebrow>Entry instructions</Eyebrow>
            <H>{b.address.line1}, {b.address.line2}</H>
            <Text className="font-jk text-[13.5px] text-ink2 dark:text-ink2-dark">{b.address.directions}</Text>
          </Card>
          <View className="flex-row gap-2">
            <View className="flex-1"><Btn title="Call customer" tone="secondary" size="sm" icon={<Phone size={15} color={c.ink2} />} /></View>
            <View className="flex-1"><Btn title="Navigate" tone="secondary" size="sm" icon={<Navigation size={15} color={c.ink2} />}
              onPress={() => { const u = directionsUrl(b.address.at); Linking.openURL(Platform.OS === 'ios' ? u.ios : u.google).catch(() => Linking.openURL(u.google)); }} /></View>
          </View>
          <Card><SplitRow label={`${title} · ${b.durationMin} min`} value={inr(payout(b))} strong /></Card>
          <Note>Your phone shares its position while you ride so the customer sees you coming.</Note>
        </Screen>
      </View>
    );
  }

  if (b.status === 'arrived') {
    return (
      <View className="flex-1 bg-ground dark:bg-ground-dark">
        <AppBar title="At the door" subtitle={title} back />
        <Screen footer={<Btn title="Start the clock" busy={busy} disabled={code.length !== 4}
          onPress={() => run(async () => { const r = await startJob({ bookingId: b.id, code }); setCodeError(!r.ok); })} />}>
          <Card selected className="items-center">
            <Eyebrow>Ask for the 4-digit start code</Eyebrow>
            <TextInput value={code} onChangeText={(t) => { const v = t.replace(/\D/g, '').slice(0, 4); setCode(v); setCodeError(false); if (v.length === 4) Keyboard.dismiss(); }}
              keyboardType="number-pad" placeholder="- - - -" placeholderTextColor={c.ink3} accessibilityLabel="Start code"
              className="font-jkx w-full rounded-xl bg-paper py-3 text-center text-[34px] tracking-[10px] text-ink dark:bg-paper-dark dark:text-ink-dark" />
            {codeError ? <Tiny>That code does not match. Ask the customer to read it again.</Tiny> : null}
            {__DEV__ && b.customerId === 'demo-customer' ? <Tiny>Test job — the customer's code is {b.startCode}</Tiny> : null}
          </Card>
          <Card>
            <Eyebrow>Before you start</Eyebrow>
            {['Show your ID badge', 'Check the supplies are there', 'Take a photo of the room as it is'].map((t) => <Text key={t} className="font-jk py-0.5 text-[13.5px] text-ink2 dark:text-ink2-dark">• {t}</Text>)}
          </Card>
          <Note tone="ok">Your pay starts when the clock starts. Waiting time is paid separately.</Note>
        </Screen>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="Working" subtitle={title} back />
      <Screen footer={<Btn title="Finish job" busy={busy} onPress={() => {
        const finish = () => run(async () => { await finishJob({ bookingId: b.id, flags }); router.replace('/partner'); });
        const minsLeft = Math.floor(leftSecs / 60);
        const open = tasks.filter((t) => !(ticks[t] ?? b.doneTasks.includes(t))).length;
        if (minsLeft < 2 && open === 0) return finish();
        Alert.alert('Finish the job now?', [
          minsLeft >= 2 ? `${minsLeft} min are still left on the clock.` : '',
          open ? `${open} task${open > 1 ? 's are' : ' is'} not ticked yet.` : '',
          'Only finish if the customer is happy.',
        ].filter(Boolean).join(' '), [
          { text: 'Keep working', style: 'cancel' },
          { text: 'Finish job', style: 'destructive', onPress: finish },
        ]);
      }} />}>
        <Card selected className="items-center">
          <Eyebrow>{timeUp ? 'Paid time is up' : 'Time left'}</Eyebrow>
          <Text className={`font-jkx text-[38px] ${timeUp || leftSecs < 300 ? 'text-crit dark:text-crit-dark' : 'text-ink dark:text-ink-dark'}`}>{mmss(leftSecs)}</Text>
          <View className="w-full"><Progress value={totalSecs ? Math.min(1, elapsedSecs / totalSecs) : 0} /></View>
          <View className="w-full flex-row justify-between">
            <Tiny>Working {mmss(elapsedSecs)}</Tiny>
            <Tiny>Ends {endsAt ? clock(endsAt) : '—'}</Tiny>
          </View>
          {timeUp ? <Tiny className="text-center">Wrap up and tap Finish. If the customer wants more, she adds time from her app.</Tiny> : null}
        </Card>
        {lastExt ? <Note tone="ok">The customer added {lastExt.minutes} min at {clock(lastExt.at)} and paid for it. {b.extraMin} extra min in total — your payout is now {inr(payout(b))}.</Note> : null}
        <Card>
          <Eyebrow>Tick as you go — the customer is watching this</Eyebrow>
          {tasks.map((t) => {
            const on = ticks[t] ?? b.doneTasks.includes(t);
            return (
              <Pressable key={t} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={t}
                className="flex-row items-center gap-3 py-2"
                onPress={() => {
                  setTicks((m) => ({ ...m, [t]: !on }));
                  toggleTask({ bookingId: b.id, task: t }).catch(() => setTicks((m) => ({ ...m, [t]: on })));
                }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Check size={15} color="#fff" /> : null}
                </View>
                <Text className={`font-jk flex-1 text-[14px] ${on ? 'text-ink3 line-through dark:text-ink3-dark' : 'text-ink dark:text-ink-dark'}`}>{t}</Text>
              </Pressable>
            );
          })}
        </Card>
        <Card>
          <Eyebrow>Anything to report?</Eyebrow>
          <View className="flex-row flex-wrap gap-2">{FLAGS.map((f) => <Chip key={f} label={f} on={flags.includes(f)} onPress={() => setFlags(flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f])} />)}</View>
        </Card>
        <Card><SplitRow label="You earn from this job" value={inr(payout(b))} strong /><Tiny>Paid into your weekly payout on Monday.</Tiny></Card>
      </Screen>
    </View>
  );
}
