import { Redirect, Slot, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Tiny } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

const NAV = [
  { href: '/admin', label: 'Live ops' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/partners', label: 'Experts' },
  { href: '/admin/areas', label: 'Areas' },
  { href: '/admin/coupons', label: 'Coupons' },
  { href: '/admin/waitlist', label: 'Waitlist' },
  { href: '/admin/referrals', label: 'Referrals' },
  { href: '/admin/feedback', label: 'Feedback' },
] as const;

export default function AdminLayout() {
  const router = useRouter();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { c } = useTheme();
  const { ready, user, isAdmin, adminKnown, signOut } = useAuth();
  const wide = width >= 900;

  if (path === '/admin/login') return <Slot />;
  if (!ready || !adminKnown) return <View className="flex-1 items-center justify-center bg-ground dark:bg-ground-dark"><ActivityIndicator color={c.brand} /></View>;
  if (!user || !isAdmin) return <Redirect href="/admin/login" />;

  const item = (href: string, label: string) => {
    const on = path === href || (href === '/admin/partners' && path.startsWith('/admin/expert'));
    return (
      <Pressable key={href} accessibilityRole="button" onPress={() => router.replace(href as '/admin')}
        className={`rounded-lg px-3 py-2 ${on ? 'bg-brand-soft dark:bg-brand-softdark' : ''}`}>
        <Text className={`text-[12.5px] ${on ? 'font-jkb text-ink dark:text-ink-dark' : 'font-jk text-ink2 dark:text-ink2-dark'}`}>{label}</Text>
      </Pressable>
    );
  };
  const out = async () => { await signOut(); router.replace('/'); };

  if (wide) {
    return (
      <View className="flex-1 flex-row bg-ground dark:bg-ground-dark" style={{ paddingTop: insets.top }}>
        <View className="w-[190px] gap-1 border-r border-line2 bg-sunk p-3 dark:border-line2-dark dark:bg-sunk-dark">
          <Text className="font-jkx px-3 pb-3 pt-1 text-[14px] text-ink dark:text-ink-dark">Ops console</Text>
          {NAV.map((n) => item(n.href, n.label))}
          <View className="mt-auto flex-row items-center gap-2 border-t border-line2 px-2 pt-3 dark:border-line2-dark">
            <Avatar initials="OP" size={30} />
            <View className="flex-1"><Tiny>{user.email}</Tiny></View>
          </View>
          <Pressable onPress={out} className="px-3 py-2"><Tiny>Sign out</Tiny></Pressable>
        </View>
        <View className="flex-1"><Slot /></View>
      </View>
    );
  }
  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark" style={{ paddingTop: insets.top }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-[48px] grow-0 border-b border-line2 dark:border-line2-dark">
        <View className="flex-row gap-1 px-3 py-2">
          {NAV.map((n) => item(n.href, n.label))}
          <Pressable onPress={out} className="px-3 py-2"><Tiny>Sign out</Tiny></Pressable>
        </View>
      </ScrollView>
      <View className="flex-1"><Slot /></View>
    </View>
  );
}
