import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Art, type ArtName } from '@/components/Art';
import { BrandPanel } from '@/components/BrandPanel';
import { ChevronRight } from '@/components/icons';
import { useAuth } from '@/lib/auth';
import { inr } from '@/lib/format';
import { PRICE_BY_MIN } from '@/lib/mock';
import { useTheme } from '@/theme';

/**
 * Entry point. A signed-in user goes straight to their app; everyone else
 * picks which app to sign in to.
 */
export default function Launcher() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { ready, user, profile, isAdmin, signOut } = useAuth();
  // White status text over the coral panel while this screen is in front; dark again once something covers it.
  useFocusEffect(useCallback(() => { setStatusBarStyle('light'); return () => setStatusBarStyle('dark'); }, []));

  if (!ready || (user && profile === undefined)) {
    return (
      <View className="flex-1 items-center justify-center bg-ground dark:bg-ground-dark">
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }
  if (user && isAdmin) return <Redirect href="/admin" />;
  if (user && profile?.role === 'customer') return <Redirect href="/customer" />;
  if (user && profile?.role === 'partner') return <Redirect href="/partner" />;

  const apps: { role: 'customer' | 'partner'; art: ArtName; name: string; sub: string }[] = [
    { role: 'customer', art: 'sweep-mop', name: 'I need help at home', sub: `Book an expert from ${inr(PRICE_BY_MIN[30])} · at your door in minutes` },
    { role: 'partner', art: 'bolt', name: 'I am a house-help expert', sub: 'Get jobs near you · paid every Monday' },
  ];

  return (
    <BrandPanel style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <View className="flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center rounded-xl bg-white"><Text className="font-jkx text-[16px] text-brand">S</Text></View>
          <Text className="font-jkx text-[18px] text-white">Sahayak</Text>
        </View>

        <View className="flex-row items-center">
          <View style={{ flex: 1.5 }}>
            <Text className="font-jkx text-[36px] leading-[42px] text-white">House help{'\n'}in ten{'\n'}minutes</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}><Art name="sweep-mop" size={132} /></View>
        </View>
        <Text className="font-jkm text-[15px] leading-[22px] text-white/85">
          Verified experts, paid by the hour. Sweeping, dishes, kitchen, bathrooms — one person does it all.
        </Text>

        <View className="flex-row flex-wrap gap-2">
          {['ID-verified', 'Insured', 'Pay with Razorpay'].map((t) => (
            <View key={t} className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5">
              <Text className="font-jks text-[12px] text-white">{t}</Text>
            </View>
          ))}
        </View>

        <View className="mt-auto gap-3 pt-6">
          {apps.map((a) => (
            <Pressable key={a.role} accessibilityRole="button" onPress={() => router.push({ pathname: '/login', params: { role: a.role } })}
              className="flex-row items-center gap-3 rounded-[24px] bg-paper p-4 dark:bg-paper-dark"
              style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
              <View className="h-16 w-16 items-center justify-center rounded-[18px] bg-brand-soft dark:bg-brand-softdark"><Art name={a.art} size={54} /></View>
              <View className="flex-1 gap-0.5">
                <Text className="font-jkb text-[17px] text-ink dark:text-ink-dark">{a.name}</Text>
                <Text className="font-jk text-[12.5px] leading-[17px] text-ink3 dark:text-ink3-dark">{a.sub}</Text>
              </View>
              <ChevronRight size={20} color={c.ink3} />
            </Pressable>
          ))}

          {user && profile === null ? (
            <Text className="font-jk text-center text-[12.5px] text-white/85">
              Your number is verified. Pick an option above to finish setting up, or{' '}
              <Text className="font-jkb underline" onPress={() => signOut()}>sign out</Text>.
            </Text>
          ) : null}

          <Pressable accessibilityRole="button" onPress={() => router.push('/admin/login')} className="items-center py-2">
            <Text className="font-jkm text-[12.5px] text-white/70">Sahayak staff? <Text className="font-jkb text-white">Open the ops console</Text></Text>
          </Pressable>
        </View>
      </ScrollView>
    </BrandPanel>
  );
}
