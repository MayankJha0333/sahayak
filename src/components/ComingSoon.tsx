import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Art } from '@/components/Art';
import { BrandPanel } from '@/components/BrandPanel';
import { useWaitlistJoin } from '@/components/NotServed';
import { Check, ChevronLeft, Clock, MapPin, Share2, ShieldCheck, Users, Zap } from '@/components/icons';
import { Btn, Tiny, shadow } from '@/components/ui';
import { waitlistNear } from '@/lib/api';
import { useServiceArea } from '@/lib/areas';
import { useAuth } from '@/lib/auth';
import { inr } from '@/lib/format';
import { km } from '@/lib/geo';
import { PRICE_BY_MIN } from '@/lib/mock';
import { useTheme } from '@/theme';

const LINK = process.env.EXPO_PUBLIC_SHARE_URL ?? '';
const DAY = 86_400_000;
const longDate = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const dist = (m: number) => (m < 10_000 ? km(m) : `${Math.round(m / 1000)} km`);

/**
 * Full "coming soon" page for an address we do not serve yet: where and when we arrive,
 * the waitlist in one tap, how many neighbours are already waiting, and a share button
 * so she can bring Sahayak to her area faster. It is the whole Home tab while her address
 * is outside every live area (`tab`), and a page of its own for any other saved address.
 */
export function ComingSoonView({ addressId, tab }: { addressId?: string; tab?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { profile } = useAuth();
  const { coverage, loading } = useServiceArea();
  // A just-saved address is passed in; otherwise the one bookings use.
  const address = profile?.addresses.find((a) => a.id === (addressId ?? profile.defaultAddressId)) ?? profile?.addresses[0];
  const line = address ? `${address.line1}, ${address.line2}` : '';
  // The town or city from the address ("…, Sector 52, Gurugram" → "Gurugram") reads better in a headline than the street.
  const locality = address?.line2.split(',').map((p) => p.trim()).filter(Boolean).pop() || 'your area';
  const wl = useWaitlistJoin(address?.at ?? { lat: 0, lng: 0 }, line, address?.line2.split(',').pop()?.trim());

  const [near, setNear] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    if (!address) return;
    let live = true;
    waitlistNear({ at: address.at }).then((r) => { if (live) setNear(r.near); }).catch(() => undefined);
    return () => { live = false; };
  }, [address?.at.lat, address?.at.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!address) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-ground px-8 dark:bg-ground-dark">
        <Text className="font-jkb text-center text-[18px] text-ink dark:text-ink-dark">Add your address first</Text>
        <Btn title="Drop a pin" onPress={() => router.replace('/customer/address')} />
      </View>
    );
  }
  const cov = loading ? null : coverage(address.at);
  // Served after all (ops just opened it): nothing to wait for.
  if (cov?.serving) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-ground px-8 dark:bg-ground-dark">
        <Art name="party" size={96} />
        <Text className="font-jkx text-center text-[24px] text-ink dark:text-ink-dark">We are live in {cov.serving.name}!</Text>
        <Tiny className="text-center">You can book an expert to your door right now.</Tiny>
        <Btn title="Book now" onPress={() => router.replace('/customer')} />
      </View>
    );
  }

  const opensAt = cov?.soon?.opensAt ?? null;
  const place = cov?.soon?.name ?? locality;
  // Calendar days, so a launch next Thursday reads the same all day today.
  const midnight = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  const daysLeft = opensAt ? Math.max(0, Math.round((midnight(opensAt) - midnight(now)) / DAY)) : null;
  const phone = profile?.phone ? `+91 ${profile.phone.replace(/^\+91/, '').replace(/(\d{5})(\d{5})/, '$1 $2')}` : 'your number';

  const share = async () => {
    const msg = [
      opensAt
        ? `Sahayak is starting house help in ${place} on ${longDate(opensAt)} — verified experts at your door in minutes, from ${inr(PRICE_BY_MIN[30])} for 30 min.`
        : `I just joined the Sahayak waitlist for ${place} — verified house help at your door in minutes, from ${inr(PRICE_BY_MIN[30])} for 30 min.`,
      'Join the waitlist too: the more of us from here, the sooner they start.',
      profile?.referralCode ? `Use my code ${profile.referralCode} when you sign up.` : '',
      LINK,
    ].filter(Boolean).join('\n\n');
    try { await Share.share({ message: msg }); } catch { /* she closed the share sheet */ }
  };

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      {scrolled ? <View pointerEvents="none" className="absolute left-0 right-0 top-0 z-10 bg-ground dark:bg-ground-dark" style={{ height: insets.top }} /> : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tab ? 120 : 150 }} scrollEventThrottle={64}
        onScroll={(e) => { const past = e.nativeEvent.contentOffset.y > 260; if (past !== scrolled) setScrolled(past); }}>
        {/* Hero */}
        <BrandPanel style={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}>
          {tab ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/customer/(tabs)/account')} className="flex-row items-center gap-1.5 self-start">
              <MapPin size={16} color="#FFFFFF" />
              <Text className="font-jkb text-[15px] text-white" numberOfLines={1}>{address.label} · {locality}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/customer'))}
              className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
              <ChevronLeft size={22} color="#FFFFFF" />
            </Pressable>
          )}
          <View className="mt-5 flex-row items-end">
            <View className="flex-1 gap-3">
              <View className="self-start rounded-full bg-white/20 px-3 py-1.5">
                <Text className="font-jkx text-[11px] uppercase tracking-[1.5px] text-white">{opensAt ? 'Launch date set' : 'Coming soon'}</Text>
              </View>
              <Text className="font-jkx text-[30px] leading-[36px] text-white">Sahayak is coming to {place}</Text>
            </View>
            <Art name={opensAt ? 'calendar' : 'party'} size={104} />
          </View>
          <Text className="mt-3 font-jkm text-[15px] leading-[22px] text-white/90">
            {opensAt
              ? `Experts start working here on ${longDate(opensAt)}. You can book from 8 AM that day.`
              : 'We are not in your area yet, but we open new areas every few weeks. Join the waitlist and you will be the first to know.'}
          </Text>
          {daysLeft !== null ? (
            <View className="mt-5 flex-row items-center gap-3 self-start rounded-[20px] bg-white px-4 py-3" style={shadow}>
              <Text className="font-jkx text-[34px] leading-[38px] text-brand dark:text-brand">{daysLeft}</Text>
              <Text className="font-jkb text-[14px] leading-[18px] text-ink">{daysLeft === 1 ? 'day' : 'days'}{'\n'}to go</Text>
            </View>
          ) : null}
        </BrandPanel>

        <View className="gap-4 px-4 pt-5">
          {/* Their address */}
          <View className="flex-row items-center gap-3 rounded-[22px] bg-paper px-4 py-3.5 dark:bg-paper-dark">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-brand-soft dark:bg-brand-softdark"><MapPin size={18} color={c.brand} /></View>
            <View className="flex-1">
              <Text className="font-jkx text-[10.5px] uppercase tracking-[1.2px] text-ink3 dark:text-ink3-dark">{address.label}</Text>
              <Text className="font-jkm text-[14px] text-ink dark:text-ink-dark" numberOfLines={2}>{line}</Text>
            </View>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/customer/address')}>
              <Text className="font-jkb text-[13px] text-brand dark:text-brand-dark">Change</Text>
            </Pressable>
          </View>

          {/* Neighbours waiting */}
          <View className="flex-row items-center gap-3 rounded-[22px] bg-paper px-4 py-4 dark:bg-paper-dark">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-sunk dark:bg-sunk-dark"><Users size={18} color={c.ink} /></View>
            <View className="flex-1">
              {near === null ? <ActivityIndicator size="small" color={c.brand} style={{ alignSelf: 'flex-start' }} /> : (
                <Text className="font-jkb text-[15px] text-ink dark:text-ink-dark">
                  {near === 0 ? 'Be the first on your street' : `${near} ${near === 1 ? 'neighbour is' : 'neighbours are'} waiting nearby`}
                </Text>
              )}
              <Tiny>The more people join from here, the sooner we start.</Tiny>
            </View>
          </View>

          {/* Share */}
          <View className="gap-3 rounded-[24px] bg-paper p-4 dark:bg-paper-dark" style={shadow}>
            <Text className="font-jkb text-[17px] text-ink dark:text-ink-dark">Bring Sahayak here faster</Text>
            <Tiny>Send it to neighbours, your society group or family nearby. Every person who joins moves {place} up our list.</Tiny>
            {profile?.referralCode ? (
              <View className="flex-row items-center justify-between rounded-2xl border border-dashed border-line px-4 py-3 dark:border-line-dark">
                <Tiny>Your invite code</Tiny>
                <Text className="font-jkx text-[16px] tracking-[2px] text-ink dark:text-ink-dark">{profile.referralCode}</Text>
              </View>
            ) : null}
            <Btn title="Share with neighbours" tone="secondary" icon={<Share2 size={16} color={c.ink} />} onPress={share} />
          </View>

          {/* What she gets */}
          <View className="gap-3 rounded-[24px] bg-paper p-4 dark:bg-paper-dark">
            <Text className="font-jkb text-[17px] text-ink dark:text-ink-dark">When we start in {place}</Text>
            {[
              { Icon: Zap, title: 'An expert at your door in about 10 minutes', sub: 'Or book a slot for later — morning, afternoon or evening.' },
              { Icon: Clock, title: `From ${inr(PRICE_BY_MIN[30])} for 30 minutes`, sub: 'Pay for her time, not per task. Sweeping, dishes, kitchen, bathrooms, laundry.' },
              { Icon: ShieldCheck, title: 'ID-verified, trained and insured', sub: 'Every expert’s Aadhaar is checked before her first job.' },
            ].map(({ Icon, title, sub }) => (
              <View key={title} className="flex-row gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft dark:bg-brand-softdark"><Icon size={16} color={c.brand} /></View>
                <View className="flex-1"><Text className="font-jkb text-[14px] text-ink dark:text-ink-dark">{title}</Text><Tiny>{sub}</Tiny></View>
              </View>
            ))}
          </View>

          {!opensAt && cov?.nearest ? (
            <Tiny className="px-2 text-center">Nearest area we serve today: {cov.nearest.area.name}, {dist(cov.nearest.metres)} away.</Tiny>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky action */}
      <View className="absolute bottom-0 left-0 right-0 gap-2 border-t border-line bg-paper px-4 pt-3 dark:border-line-dark dark:bg-paper-dark" style={{ paddingBottom: tab ? 12 : insets.bottom + 12 }}>
        {wl.onList ? (
          <View className="flex-row items-center gap-3 rounded-2xl bg-ok-soft px-4 py-3.5 dark:bg-ok-softdark">
            <Check size={18} color={c.ok} />
            <View className="flex-1">
              <Text className="font-jkb text-[14.5px] text-ok dark:text-ok-dark">You are on the waitlist</Text>
              <Tiny>{opensAt ? `We will message ${phone} on ${longDate(opensAt)}.` : `We will message ${phone} as soon as we start near you.`}</Tiny>
            </View>
          </View>
        ) : (
          <Btn title={opensAt ? 'Remind me on launch day' : 'Join the waitlist'} busy={wl.busy} onPress={wl.join} />
        )}
        {wl.err ? <Text className="font-jkm text-center text-[12.5px] text-crit dark:text-crit-dark">{wl.err}</Text> : null}
      </View>
    </View>
  );
}
