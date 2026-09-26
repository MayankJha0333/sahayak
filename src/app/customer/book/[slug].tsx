import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, ChevronRight, Info, MapPin, Moon, Sun, Sunrise } from '@/components/icons';
import { AppBar, Btn, Eyebrow, H, IconTile, Screen, SplitRow, Tiny, shadow } from '@/components/ui';
import { NotServed } from '@/components/NotServed';
import { useServiceArea } from '@/lib/areas';
import { useAuth } from '@/lib/auth';
import { slotAvailability } from '@/lib/api';
import { takeAddTask } from '@/lib/bookingDraft';
import { useAllPartners } from '@/lib/db';
import { inr } from '@/lib/format';
import { distanceM, etaMinutes } from '@/lib/geo';
import { CLOSE_HOUR, DURATIONS, HOURS_LABEL, OPEN_HOUR, SERVICES, isOpenAt, priceForMinutes, serviceBySlug, suggestMinutes } from '@/lib/mock';
import { useTheme } from '@/theme';

/** Start times on a scheduled day, grouped the way Pronto does it. Only the ones with a free expert nearby are shown. */
const DAY_TIMES = [
  { h: 8, m: 0, p: 0 }, { h: 9, m: 0, p: 0 }, { h: 10, m: 0, p: 0 }, { h: 11, m: 0, p: 0 },
  { h: 12, m: 30, p: 1 }, { h: 14, m: 0, p: 1 }, { h: 15, m: 30, p: 1 },
  { h: 17, m: 0, p: 2 }, { h: 18, m: 0, p: 2 }, { h: 19, m: 0, p: 2 },
];
const PERIODS = [{ label: 'Morning', Icon: Sunrise }, { label: 'Afternoon', Icon: Sun }, { label: 'Evening', Icon: Moon }];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * One booking = an expert for a stretch of time. You pay for the time; the tasks are her list.
 * `slug` is the task tapped on the home screen; `mode=later` opens on the scheduler.
 */
export default function BookScreen() {
  const { slug, mode } = useLocalSearchParams<{ slug: string; mode?: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const { profile } = useAuth();
  const { rows: partners } = useAllPartners();

  // `slug` may be one task or a comma list (quick rebook passes the last visit's list).
  const initialTasks = slug && slug !== 'any' ? String(slug).split(',').filter((t) => SERVICES.some((x) => x.slug === t)) : ['sweep-mop'];
  const [tasks, setTasks] = useState<string[]>(initialTasks);
  const [picked, setDuration] = useState<number>(() => suggestMinutes(initialTasks));
  // Never below the shortest visit we sell (1 hour), even if an older value is still in memory.
  const duration = (DURATIONS as readonly number[]).includes(picked) ? picked : DURATIONS[0];
  const [touchedDuration, setTouchedDuration] = useState(false);
  const [dayIdx, setDayIdx] = useState(mode === 'later' ? 1 : -1); // -1 = now
  const [period, setPeriod] = useState(0);
  const [slotAt, setSlotAt] = useState<number | null | undefined>(undefined); // undefined = not chosen yet
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => { const t = setTimeout(() => setNowTick(Date.now()), 0); return () => clearTimeout(t); }, []);

  const later = dayIdx >= 0;
  // Outside 8 AM–7 PM there is no "Now": open on the scheduler instead.
  const nowOpen = !nowTick || isOpenAt(nowTick);
  useEffect(() => { if (nowTick && !nowOpen && dayIdx === -1) setDayIdx(0); }, [nowTick, nowOpen, dayIdx]);
  const days = useMemo(() => {
    const start = new Date(nowTick || 0); start.setHours(0, 0, 0, 0);
    return Array.from({ length: 6 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [nowTick]);
  const slots = useMemo(() => {
    if (!later) return [];
    const d = days[dayIdx];
    return DAY_TIMES.map((t) => {
      const at = new Date(d); at.setHours(t.h, t.m, 0, 0);
      const past = at.getTime() < nowTick + 45 * 60_000 || t.h * 60 + t.m < OPEN_HOUR * 60 || t.h * 60 + t.m > CLOSE_HOUR * 60;
      return { at: at.getTime(), p: t.p, past, label: at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) };
    });
  }, [days, dayIdx, nowTick, later]);

  const address = profile?.addresses.find((a) => a.id === profile.defaultAddressId) ?? profile?.addresses[0];
  const { served, loading: areasLoading } = useServiceArea();
  // This address is outside every live area: say so plainly instead of offering slots nobody can take.
  const outside = Boolean(address) && !areasLoading && !served(address!.at);
  // Only experts who can do everything on the list count (the server matches the same way).
  const skills = [...new Set(tasks.map((t) => serviceBySlug(t).skill))];

  // Ask the server which start times have a skilled expert nearby who is not booked then.
  const open = slots.filter((x) => !x.past).map((x) => x.at);
  const availKey = later && address && !outside && open.length ? `${address.id}|${[...tasks].sort().join(',')}|${duration}|${open.join(',')}` : '';
  const [avail, setAvail] = useState<{ key: string; free: Set<number>; experts: number; err?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!availKey || !address) return;
    let live = true;
    slotAvailability({ tasks, addressId: address.id, durationMin: duration, times: open })
      .then((r) => { if (live) setAvail({ key: availKey, free: new Set(r.free), experts: r.experts }); })
      .catch((e) => { if (live) setAvail({ key: availKey, free: new Set(), experts: 0, err: (e as Error).message }); });
    return () => { live = false; };
  }, [availKey, retry]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = Boolean(availKey) && avail?.key === availKey;
  const checking = Boolean(availKey) && !ready;
  const bookable = slots.filter((x) => !x.past && ready && avail!.free.has(x.at));
  const visible = bookable.filter((x) => x.p === period);

  // Today has no start times left: move to tomorrow. Otherwise land on the first free slot of the day.
  useEffect(() => {
    if (!later || !nowTick) return;
    if (!slots.some((x) => !x.past)) { if (dayIdx < days.length - 1) setDayIdx(dayIdx + 1); return; }
    if (!ready) return;
    const first = bookable[0];
    if (!first) { if (slotAt !== null) setSlotAt(null); return; }
    if (slotAt === undefined || slotAt === null || !bookable.some((x) => x.at === slotAt)) {
      const inPeriod = bookable.find((x) => x.p === period);
      setSlotAt((inPeriod ?? first).at); if (!inPeriod) setPeriod(first.p);
    }
  }, [later, nowTick, slots, slotAt, dayIdx, days.length, ready, bookable, period]);
  const nearby = address ? partners.filter((p) => p.onShift && skills.every((sk) => p.skills.includes(sk)) && distanceM(p.at, address.at) < 3000) : [];
  const eta = nearby.length && address ? Math.max(4, Math.min(...nearby.map((p) => etaMinutes(distanceM(p.at, address.at))))) : null;

  const suggested = suggestMinutes(tasks);
  const needMin = tasks.reduce((n, t) => n + serviceBySlug(t).typicalMin, 0);
  const toggleTask = (t: string) => {
    const next = tasks.includes(t) ? tasks.filter((x) => x !== t) : [...tasks, t];
    if (next.length === 0) return;
    setTasks(next);
    if (!touchedDuration) setDuration(suggestMinutes(next));
  };
  // Back from a service page with "Add to my booking": tick that task.
  useFocusEffect(useCallback(() => {
    const add = takeAddTask();
    if (add) setTasks((cur) => {
      if (cur.includes(add)) return cur;
      const next = [...cur, add];
      if (!touchedDuration) setDuration(suggestMinutes(next));
      return next;
    });
  }, [touchedDuration]));
  const price = priceForMinutes(duration);
  const chosen = bookable.find((s) => s.at === slotAt);
  const canContinue = tasks.length > 0 && (!later || Boolean(chosen));
  const whenLabel = later && chosen ? `${dayIdx === 0 ? 'Today' : dayIdx === 1 ? 'Tomorrow' : DAY[days[dayIdx].getDay()]} ${chosen.label}` : null;

  if (outside) return <Redirect href="/customer/coming-soon" />;

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title={later ? 'Schedule for later' : 'Book now'} back
        right={address ? <Text className="font-jkm text-[12px] text-ink3 dark:text-ink3-dark">{address.label}</Text> : undefined} />

      {/* When: Now, then the next days — always visible, like the day tabs in Pronto */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}>
        {[{ i: -1, label: 'Now' }, ...days.map((d, i) => ({ i, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : LONG[d.getDay()] }))].map(({ i, label }) => {
          const on = dayIdx === i;
          // Late in the evening today has no start times left; say so instead of silently jumping to tomorrow.
          const over = i === 0 && Boolean(nowTick) && !DAY_TIMES.some((t) => { const at = new Date(days[0]); at.setHours(t.h, t.m, 0, 0); return at.getTime() >= nowTick + 45 * 60_000; });
          const closedNow = i === -1 && !nowOpen;
          const off = over || closedNow;
          return (
            <Pressable key={i} accessibilityRole="button" accessibilityState={{ disabled: off }} disabled={off} onPress={() => { setDayIdx(i); setSlotAt(undefined); }}
              className={`rounded-2xl border px-5 py-3.5 ${on ? 'border-brand bg-brand-soft dark:border-brand-dark dark:bg-brand-softdark' : 'border-line bg-paper dark:border-line-dark dark:bg-paper-dark'} ${off ? 'opacity-40' : ''}`}>
              <Text className={`text-[16px] ${on ? 'font-jkb text-ink dark:text-ink-dark' : 'font-jkm text-ink2 dark:text-ink2-dark'}`}>{closedNow ? 'Now · opens 8 AM' : over ? 'Today · closed' : label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Screen
        footer={
          <>
            <SplitRow label={`${duration} min · ${tasks.length} task${tasks.length > 1 ? 's' : ''}${whenLabel ? ` · ${whenLabel}` : ''}`} value={inr(price)} strong />
            {!address ? (
              <Btn title="Add your address to continue" onPress={() => router.push('/customer/address')} />
            ) : outside ? (
              <Btn title="Not available here yet — change address" tone="secondary" onPress={() => router.push('/customer/address')} />
            ) : !later && !eta ? (
              <Btn title="No one online now — pick a slot" onPress={() => { setDayIdx(0); setSlotAt(undefined); }} />
            ) : (
            <Btn
              title={later ? 'Review booking' : eta ? `Review — expert in ~${eta} min` : 'Review — find an expert'}
              disabled={!canContinue || !nowTick}
              onPress={() => router.push({ pathname: '/customer/review', params: { tasks: tasks.join(','), duration: String(duration), when: later && chosen ? String(chosen.at) : '' } })}
            />
            )}
          </>
        }>
        {!nowOpen ? (
          <View className="flex-row items-start gap-3 rounded-2xl bg-lavender px-4 py-3.5">
            <Moon size={18} color={c.ink} style={{ marginTop: 2 }} />
            <Text className="font-jkm flex-1 text-[14.5px] leading-[21px] text-ink">
              Experts work from {HOURS_LABEL}. Pick a slot below — the earliest is tomorrow at 8 AM.
            </Text>
          </View>
        ) : null}
        {!address ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/customer/address')}
            className="flex-row items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3.5 dark:bg-brand-softdark">
            <MapPin size={18} color={c.brand} />
            <Text className="font-jkm flex-1 text-[14.5px] leading-[21px] text-ink dark:text-ink-dark">Drop a pin on your home so we can find the nearest expert.</Text>
            <Text className="font-jkb text-[13px] text-brand dark:text-brand-dark">Add</Text>
          </Pressable>
        ) : outside ? (
          <NotServed at={address.at} line={[address.line1, address.line2].filter(Boolean).join(', ')} city={address.line2.split(',').pop()?.trim()} />
        ) : !later ? (
          <View className="flex-row items-start gap-3 rounded-2xl bg-lavender px-4 py-3.5">
            <Info size={18} color={c.ink} style={{ marginTop: 2 }} />
            <Text className="font-jkm flex-1 text-[14.5px] leading-[21px] text-ink">
              {eta ? `${nearby.length} expert${nearby.length > 1 ? 's are' : ' is'} online near you. The nearest one reaches you in about ${eta} minutes.` : 'No expert is online near you right now. Schedule a slot instead — we will reserve one for you.'}
            </Text>
          </View>
        ) : null}

        <View className="gap-4 rounded-[26px] bg-paper p-4 dark:bg-paper-dark" style={shadow}>
          <Text className="font-jkm text-[19px] text-ink2 dark:text-ink2-dark">Service duration</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {DURATIONS.map((d) => {
              const on = d === duration;
              return (
                <Pressable key={d} accessibilityRole="button" onPress={() => { setDuration(d); setTouchedDuration(true); }}
                  className={`w-[96px] items-center rounded-2xl border py-3.5 ${on ? 'border-brand bg-brand-soft dark:border-brand-dark dark:bg-brand-softdark' : 'border-line bg-paper dark:border-line-dark dark:bg-paper-dark'}`}>
                  <Text className="font-jkb text-[19px] text-ink dark:text-ink-dark">{`${d / 60} hr`}</Text>
                  <Text className="font-jkm text-[15px] text-ink dark:text-ink-dark">{inr(priceForMinutes(d))}</Text>
                  {d === suggested ? <Text className="mt-1 font-jkx text-[9px] uppercase tracking-[0.8px] text-brand dark:text-brand-dark">fits your list</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <Tiny>Your list usually takes about {needMin} min{duration < needMin ? ' — shorter than that and she may not finish everything' : ''}.</Tiny>

          {later ? (
            <>
              <Text className="font-jkm text-[19px] text-ink2 dark:text-ink2-dark">Service start time</Text>
              <View className="flex-row rounded-full border border-line bg-paper p-1 dark:border-line-dark dark:bg-paper-dark">
                {PERIODS.map(({ label, Icon }, i) => {
                  const on = period === i;
                  return (
                    <Pressable key={label} accessibilityRole="button" onPress={() => { setPeriod(i); setSlotAt(bookable.find((x) => x.p === i)?.at ?? null); }}
                      className={`flex-1 flex-row items-center justify-center gap-2 rounded-full py-3 ${on ? 'bg-brand' : ''}`}>
                      <Icon size={16} color={on ? c.onBrand : c.ink2} />
                      <Text className={`text-[14.5px] ${on ? 'font-jkb text-onbrand' : 'font-jkm text-ink2 dark:text-ink2-dark'}`}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {checking ? (
                <View className="flex-row items-center justify-center gap-2 py-5">
                  <ActivityIndicator size="small" color={c.brand} />
                  <Tiny>Checking which experts are free…</Tiny>
                </View>
              ) : avail?.err ? (
                <View className="items-center gap-2 py-4">
                  <H>Could not check free slots</H>
                  <Tiny>{avail.err}</Tiny>
                  <Btn title="Try again" size="sm" tone="secondary" onPress={() => setRetry((n) => n + 1)} />
                </View>
              ) : visible.length ? (
                <View className="flex-row flex-wrap gap-2">
                  {visible.map((s) => {
                    const on = s.at === slotAt;
                    return (
                      <Pressable key={s.at} accessibilityRole="button" onPress={() => setSlotAt(s.at)}
                        className={`rounded-2xl border px-5 py-3.5 ${on ? 'border-brand bg-brand-soft dark:border-brand-dark dark:bg-brand-softdark' : 'border-line bg-paper dark:border-line-dark dark:bg-paper-dark'}`}>
                        <Text className={`text-[15px] ${on ? 'font-jkb text-ink dark:text-ink-dark' : 'font-jkm text-ink dark:text-ink-dark'}`}>{s.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View className="items-center gap-1 py-4">
                  <H>{ready && avail!.experts === 0 ? 'No expert near you yet' : bookable.length ? `No expert free in the ${PERIODS[period].label.toLowerCase()}` : 'No expert is free on this day'}</H>
                  <Tiny>{ready && avail!.experts === 0 ? 'We have no expert near this address for this list yet. Try fewer tasks, or check again soon.' : bookable.length ? 'Try another time of day.' : 'Every expert near you is booked. Try the next day.'}</Tiny>
                </View>
              )}
            </>
          ) : null}
        </View>

        <View className="gap-1 px-1">
          <Text className="font-jkm text-[19px] text-ink2 dark:text-ink2-dark">What should she do?</Text>
          <Tiny>Tick as many as you like — you pay only for her time, not per task.</Tiny>
        </View>
        <View className="gap-2">
          {SERVICES.map((t) => {
            const on = tasks.includes(t.slug);
            return (
              <Pressable key={t.slug} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggleTask(t.slug)}
                className={`flex-row items-center gap-3 rounded-[22px] border px-3.5 py-3 ${on ? 'border-brand bg-brand-soft dark:border-brand-dark dark:bg-brand-softdark' : 'border-line bg-paper dark:border-line-dark dark:bg-paper-dark'}`}>
                <IconTile icon={t.icon} size={40} strong={on} />
                <View className="flex-1"><H>{t.name}</H><Tiny>{t.blurb} · ~{t.typicalMin} min</Tiny></View>
                <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={`What ${t.name} includes`} onPress={() => router.push({ pathname: '/customer/service/[slug]', params: { slug: t.slug, on: on ? '1' : '0' } })}>
                  <ChevronRight size={18} color={c.ink3} />
                </Pressable>
                <View className={`h-6 w-6 items-center justify-center rounded-full ${on ? 'bg-brand' : 'border border-line dark:border-line-dark'}`}>
                  {on ? <Check size={14} color={c.onBrand} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View className="px-1">
          <Eyebrow>Note</Eyebrow>
          <Tiny>{later ? `Experts arrive within 10 minutes of the selected slot. Start times run from ${HOURS_LABEL}.` : 'The clock starts only when you share the start code with her — never while she is on the way.'}</Tiny>
        </View>
      </Screen>
    </View>
  );
}
