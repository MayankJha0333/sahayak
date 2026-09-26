import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Art, type ArtName } from '@/components/Art';
import { BrandPanel } from '@/components/BrandPanel';
import { ComingSoonView } from '@/components/ComingSoon';
import { NotServed } from '@/components/NotServed';
import { ChevronDown, ChevronRight, Plus, User } from '@/components/icons';
import { Badge, Btn, Card, H, Progress, Tiny, shadow } from '@/components/ui';
import { seedDemo } from '@/lib/api';
import { useServiceArea } from '@/lib/areas';
import { USE_EMULATORS } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAllPartners, useLiveBooking, useMyBookings } from '@/lib/db';
import { distanceM, etaMinutes } from '@/lib/geo';
import { inr, whenLabel } from '@/lib/format';
import { PRICE_BY_MIN, SERVICES, bookingTasks, bookingTitle, isOpenAt } from '@/lib/mock';
import { useTheme } from '@/theme';

const LIVE_LABEL = { matching: 'finding an expert', assigned: 'on the way', arrived: 'at your door', in_progress: 'in progress' } as const;
const LIVE_PROGRESS = { matching: 0.2, assigned: 0.55, arrived: 0.78, in_progress: 0.92 } as const;

export default function CustomerHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { profile } = useAuth();
  const live = useLiveBooking();
  const { rows: bookings } = useMyBookings();
  const { rows: partners } = useAllPartners();

  const address = profile?.addresses.find((a) => a.id === profile.defaultAddressId) ?? profile?.addresses[0];
  const nearby = address ? partners.filter((p) => p.onShift && distanceM(p.at, address.at) < 3000) : [];
  // Same number the booking screen shows: the nearest expert, never under 4 minutes.
  const eta = nearby.length && address ? Math.max(4, Math.min(...nearby.map((p) => etaMinutes(distanceM(p.at, address.at))))) : null;
  // A visit later today or on another day is not "on the way" yet.
  const liveIsLater = Boolean(live?.scheduledFor && live.scheduledFor > Date.now() && live.status === 'assigned');
  const instantLive = live && !live.scheduledFor ? live : undefined;
  const open = isOpenAt(Date.now());
  const lastDone = bookings.find((b) => b.status === 'completed');
  const [seeding, setSeeding] = useState(false);
  const { served, loading: areasLoading } = useServiceArea();
  const outside = Boolean(address) && !areasLoading && !served(address!.at);
  // Once the coral header scrolls away, a plain strip keeps the clock and battery readable.
  const [scrolled, setScrolled] = useState(false);

  // Her address is outside every live area: the whole Home tab becomes the coming-soon page, no booking buttons.
  if (address && areasLoading) return <View className="flex-1 items-center justify-center bg-paper dark:bg-paper-dark"><ActivityIndicator color={c.brand} /></View>;
  if (outside) return <ComingSoonView tab />;

  return (
    <View className="flex-1 bg-paper dark:bg-paper-dark">
    {scrolled ? <View pointerEvents="none" className="absolute left-0 right-0 top-0 z-10 bg-paper dark:bg-paper-dark" style={{ height: insets.top }} /> : null}
    <ScrollView className="flex-1 bg-paper dark:bg-paper-dark" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}
      scrollEventThrottle={64} onScroll={(e) => { const past = e.nativeEvent.contentOffset.y > 560; if (past !== scrolled) setScrolled(past); }}>
      {/* ── Brand header + hero, edge to edge ─────────────────────────── */}
      <BrandPanel style={{ borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingTop: insets.top + 12, paddingBottom: 20, paddingHorizontal: 16 }}>
        <View className="flex-row items-center">
          <Pressable className="flex-1 pr-3" accessibilityRole="button" onPress={() => router.push(address ? '/customer/(tabs)/account' : '/customer/address')}>
            <View className="flex-row items-center gap-1.5">
              <Text className="font-jkx text-[26px] text-white">{address?.label ?? 'Add address'}</Text>
              <ChevronDown size={20} color="#FFFFFF" />
            </View>
            <Text className="font-jkm text-[15px] text-white/90" numberOfLines={1}>{address ? `${address.line1}, ${address.line2}` : 'Tap to set your address on the map'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Account" onPress={() => router.push('/customer/(tabs)/account')}
            className="h-14 w-14 items-center justify-center rounded-full bg-white">
            <User size={26} color={c.ink} />
          </Pressable>
        </View>

        <View className="mt-8 flex-row items-center">
          <Text className="font-jkb text-[31px] leading-[38px] text-white" style={{ flex: 1.55 }}>One expert,{'\n'}every household{'\n'}chore</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}><Art name="sweep-mop" size={128} /></View>
        </View>
        <Text className="mt-1 font-jkm text-[14px] text-white/90">From {inr(PRICE_BY_MIN[30])} for 30 min · pay for her time, not per task</Text>

        {/* Outside every live area: no booking buttons, just the honest answer and the waitlist. */}
        {outside && address ? (
          <View className="mt-6">
            <NotServed at={address.at} line={`${address.line1}, ${address.line2}`} city={address.line2.split(',').pop()?.trim()} onChangeAddress={() => router.push('/customer/address')} onMore={() => router.push('/customer/coming-soon')} />
          </View>
        ) : (
          <View className="mt-6 flex-row gap-3">
            <Pressable accessibilityRole="button"
              // One instant visit at a time: if an expert is already booked for now, take her to that visit.
              onPress={() => router.push(instantLive ? (instantLive.status === 'matching' ? `/customer/matching/${instantLive.id}` : `/customer/track/${instantLive.id}`)
                : open ? '/customer/book/any' : { pathname: '/customer/book/[slug]', params: { slug: 'any', mode: 'later' } })}
              className="flex-1 rounded-[24px] bg-paper p-5 active:opacity-90 dark:bg-paper-dark" style={{ minHeight: 210 }}>
              <Text className="font-jkb text-[22px] leading-[28px] text-ink dark:text-ink-dark">Get instant{'\n'}service</Text>
              <Text className="mt-1 font-jkm text-[12.5px] text-ink3 dark:text-ink3-dark">{instantLive ? 'You have a visit running — tap to track' : !open ? 'Opens at 8 AM · book a slot' : eta ? `Expert in ~${eta} min` : 'Nearest expert online'}</Text>
              <View className="mt-auto self-end"><Art name="bolt" size={82} /></View>
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/customer/book/[slug]', params: { slug: 'any', mode: 'later' } })} accessibilityRole="button"
              className="flex-1 rounded-[24px] bg-paper p-5 active:opacity-90 dark:bg-paper-dark" style={{ minHeight: 210 }}>
              <Text className="font-jkb text-[22px] leading-[28px] text-ink dark:text-ink-dark">Schedule{'\n'}for later</Text>
              <View className="mt-3 flex-row"><View className="rounded-full border border-brand px-3 py-1.5"><Text className="font-jkb text-[13px] text-brand dark:text-brand-dark">Pick a slot</Text></View></View>
              <View className="mt-auto self-end"><Art name="calendar" size={82} /></View>
            </Pressable>
          </View>
        )}
      </BrandPanel>

      <View className="gap-5 px-4 pt-5">
        {live ? (
          <Card selected onPress={() => router.push(live.status === 'matching' ? `/customer/matching/${live.id}` : `/customer/track/${live.id}`)}>
            <View className="flex-row items-center justify-between">
              <Badge tone={live.status === 'matching' ? 'warn' : 'ok'} label={liveIsLater ? `scheduled · ${whenLabel(live.scheduledFor!)}` : LIVE_LABEL[live.status as 'matching']} />
              <ChevronRight size={18} color={c.ink3} />
            </View>
            <H>{bookingTitle(live)} · {live.durationMin} min</H>
            {!liveIsLater ? <Progress value={LIVE_PROGRESS[live.status as 'matching'] ?? 0.3} /> : <Tiny>{live.address.label} · expert confirmed</Tiny>}
          </Card>
        ) : null}

        {USE_EMULATORS && partners.length === 0 && !outside ? (
          <Card flat>
            <H>Testing alone? No experts online yet.</H>
            <Tiny>Load five demo experts who accept jobs and ride to your door on their own.</Tiny>
            <Btn title="Load demo experts" size="sm" tone="secondary" busy={seeding} onPress={async () => { setSeeding(true); try { await seedDemo({}); } finally { setSeeding(false); } }} />
          </Card>
        ) : null}

        {/* ── Promo strip (the refer-a-friend slot in the reference) ────── */}
        {!outside ? <Pressable onPress={() => router.push(`/customer/book/${lastDone ? bookingTasks(lastDone).join(',') : 'any'}`)} accessibilityRole="button">
          <BrandPanel radius={24} style={{ paddingHorizontal: 20, paddingVertical: 22, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Art name="party" size={72} />
            <View className="flex-1">
              <Text className="font-jkm text-[13px] uppercase tracking-[1px] text-white/80">{profile?.firstBookingDone ? 'Quick rebook' : 'First booking'}</Text>
              <Text className="font-jkb text-[24px] leading-[30px] text-white">{profile?.firstBookingDone ? 'Same list, in a tap' : `${inr(50)} off with FIRST50`}</Text>
            </View>
            <View className="h-12 w-12 items-center justify-center rounded-full bg-hero-deep"><ChevronRight size={22} color="#FFFFFF" /></View>
          </BrandPanel>
        </Pressable> : null}

        {/* ── Task catalogue ───────────────────────────────────────────── */}
        <View className="px-1">
          <Text className="font-jkb text-[30px] leading-[36px] text-ink dark:text-ink-dark">All house help tasks</Text>
          <Text className="font-jkm text-[16px] text-ink3 dark:text-ink3-dark">Tick any of them, pay for her time</Text>
        </View>
        <View className="flex-row flex-wrap gap-3">
          {SERVICES.map((s, i) => (
            <Pressable key={s.slug} onPress={() => router.push(`/customer/book/${s.slug}`)} accessibilityRole="button"
              className="w-[30%] grow active:opacity-85">
              <View className="overflow-hidden rounded-[22px] bg-brand-soft dark:bg-brand-softdark" style={{ height: 176 }}>
                <View className="flex-1 items-center justify-center"><Art name={s.slug as ArtName} size={104} /></View>
                {s.slug === 'cooking' || s.slug === 'laundry' ? (
                  <View className="absolute left-0 top-2 rounded-r-lg bg-crit px-2.5 py-1"><Text className="font-jkx text-[11px] text-white">NEW</Text></View>
                ) : null}
                <View className="absolute bottom-0 right-0 h-16 w-16 items-center justify-center rounded-tl-[22px] bg-paper dark:bg-paper-dark">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl bg-paper dark:bg-paper-dark" style={shadow}><Plus size={22} color={c.brand} /></View>
                </View>
              </View>
              <Text className="mt-2 px-1 font-jkb text-[16px] leading-[21px] text-ink dark:text-ink-dark" numberOfLines={2}>{s.name}</Text>
              <Text className="px-1 font-jkm text-[12.5px] text-ink3 dark:text-ink3-dark">~{s.typicalMin} min</Text>
            </Pressable>
          ))}
        </View>

        {lastDone ? (
          <Card flat onPress={() => router.push(`/customer/book/${bookingTasks(lastDone).join(',')}`)}>
            <Text className="font-jkx text-[10.5px] uppercase tracking-[1.3px] text-brand dark:text-brand-dark">Book again</Text>
            <View className="flex-row items-center gap-3">
              <Art name={bookingTasks(lastDone)[0] as ArtName} size={44} />
              <View className="flex-1"><H>{bookingTitle(lastDone)} · {lastDone.durationMin} min</H><Tiny>{partners.find((p) => p.id === lastDone.partnerId)?.name ?? 'Nearest expert'}</Tiny></View>
              <Text className="font-jkx text-[16px] text-ink dark:text-ink-dark">{inr(lastDone.price)}</Text>
            </View>
          </Card>
        ) : null}
      </View>
    </ScrollView>
    </View>
  );
}
