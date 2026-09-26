import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandPanel } from '@/components/BrandPanel';
import { Book, CalendarDays, ChevronRight, CreditCard, Gift, Headphones, Info, MapPin, Shield } from '@/components/icons';
import { Avatar, Btn, Divider, H, Tiny, shadow } from '@/components/ui';
import { setDefaultAddress } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMyBookings } from '@/lib/db';
import { inr, phonePretty } from '@/lib/format';
import { useTheme } from '@/theme';

/** Profile in the Pronto layout: brand header, three quick tiles, then plain rows. */
export default function Account() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { profile, signOut } = useAuth();
  const { rows: bookings } = useMyBookings();
  const done = bookings.filter((b) => b.status === 'completed');
  // What actually left her account: bookings she completed (incl. extra time she paid at the end) and any late-cancel fees.
  const spent = bookings.reduce((n, b) => n + (b.status === 'completed' ? b.amountDue + (b.balance?.paid ? b.balance.amount : 0) : b.status === 'cancelled' && b.paid ? (b.cancelFee ?? 0) : 0), 0);
  const initials = (profile?.name ?? 'S').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const tile = (Icon: typeof Book, label: string, onPress: () => void, badge?: string) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress} className="flex-1 gap-6 rounded-[22px] bg-paper p-4 dark:bg-paper-dark" style={shadow}>
      <View className="flex-row items-start justify-between">
        <Icon size={30} color={c.ink2} />
        {badge ? <View className="rounded-full bg-brand-soft px-2 py-0.5 dark:bg-brand-softdark"><Text className="font-jkb text-[11px] text-brand dark:text-brand-dark">{badge}</Text></View> : null}
      </View>
      <Text className="font-jks text-[16px] leading-[21px] text-ink dark:text-ink-dark">{label}</Text>
    </Pressable>
  );

  const row = (Icon: typeof Book, label: string, onPress: () => void, sub?: string) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress} className="flex-row items-center gap-4 px-4 py-4">
      <Icon size={20} color={c.ink2} />
      <View className="flex-1"><Text className="font-jkm text-[17px] text-ink dark:text-ink-dark">{label}</Text>{sub ? <Tiny>{sub}</Tiny> : null}</View>
      <ChevronRight size={18} color={c.ink3} />
    </Pressable>
  );

  return (
    <ScrollView className="flex-1 bg-ground dark:bg-ground-dark" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
      <BrandPanel style={{ paddingTop: insets.top + 14, paddingBottom: 36, paddingHorizontal: 20 }}>
        <Text className="font-jkb text-[22px] text-white">Profile</Text>
        <View className="mt-7 flex-row items-center gap-5">
          <View className="h-[92px] w-[92px] items-center justify-center rounded-full bg-white"><Avatar initials={initials} size={78} /></View>
          <View className="flex-1">
            <Text className="font-jkx text-[30px] text-white" numberOfLines={1}>{profile?.name}</Text>
            <Text className="font-jkm text-[16px] text-white/85">{phonePretty(profile?.phone ?? '')}</Text>
            <Text className="font-jkm text-[13px] text-white/70">{done.length} booking{done.length === 1 ? '' : 's'} · {inr(spent)} spent</Text>
          </View>
        </View>
      </BrandPanel>

      <View className="gap-4 px-4 pt-4">
        <View className="flex-row gap-3">
          {tile(CalendarDays, 'My bookings', () => router.push('/customer/(tabs)/bookings'))}
          {tile(CreditCard, 'Payments', () => router.push('/customer/payments'))}
          {tile(Headphones, 'Help & support', () => router.push('/help'))}
        </View>

        {/* Refer & earn, with her credit */}
        <Pressable accessibilityRole="button" onPress={() => router.push('/customer/refer')} className="active:opacity-90">
          <BrandPanel radius={22} style={{ paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20"><Gift size={22} color="#FFFFFF" /></View>
            <View className="flex-1">
              <Text className="font-jkx text-[17px] text-white">Refer & earn</Text>
              <Text className="font-jkm text-[12.5px] text-white/85">{(profile?.rewards ?? 0) > 0 ? `${inr(profile!.rewards)} credit · invite more friends` : 'Get credit for every friend who books'}</Text>
            </View>
            <ChevronRight size={20} color="#FFFFFF" />
          </BrandPanel>
        </Pressable>

        <View className="overflow-hidden rounded-[22px] bg-paper dark:bg-paper-dark" style={shadow}>
          <View className="px-4 pb-1 pt-4"><Text className="font-jks text-[13px] text-ink3 dark:text-ink3-dark">Saved addresses</Text></View>
          {profile?.addresses.map((a) => (
            <Pressable key={a.id} accessibilityRole="button" onPress={() => setDefaultAddress(a.id)} className="flex-row items-center gap-4 px-4 py-3.5">
              <View className={`h-9 w-9 items-center justify-center rounded-full ${a.id === profile.defaultAddressId ? 'bg-brand' : 'bg-sunk dark:bg-sunk-dark'}`}>
                <MapPin size={17} color={a.id === profile.defaultAddressId ? c.onBrand : c.ink2} />
              </View>
              <View className="flex-1">
                <H>{a.line1 ? `${a.label} · ${a.line1}` : a.label}</H>
                <Tiny>{a.line2}</Tiny>
              </View>
              <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${a.label}`} onPress={() => router.push({ pathname: '/customer/address', params: { id: a.id } })}>
                <Text className="font-jkb text-[12.5px] text-brand dark:text-brand-dark">Edit</Text>
              </Pressable>
            </Pressable>
          ))}
          <Divider />
          {row(MapPin, 'Add an address on the map', () => router.push('/customer/address'))}
        </View>

        <View className="overflow-hidden rounded-[22px] bg-paper dark:bg-paper-dark" style={shadow}>
          {row(Info, 'About Sahayak', () => router.push({ pathname: '/legal', params: { page: 'about' } }))}
          <Divider />
          {row(Book, 'Terms of service', () => router.push({ pathname: '/legal', params: { page: 'terms' } }))}
          <Divider />
          {row(Shield, 'Privacy policy', () => router.push({ pathname: '/legal', params: { page: 'privacy' } }))}
        </View>

        <Btn title="Sign out" tone="secondary" onPress={async () => { await signOut(); router.replace('/'); }} />
      </View>
    </ScrollView>
  );
}
