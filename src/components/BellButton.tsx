import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useUnreadCount } from '@/lib/notifications';
import { useTheme } from '@/theme';
import { Bell } from './icons';

/** The bell in a header. Shows how many notices are unread and opens the list. */
export function BellButton({ tone = 'solid', size = 56 }: { tone?: 'solid' | 'glass'; size?: number }) {
  const router = useRouter();
  const { c } = useTheme();
  const unread = useUnreadCount();
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={() => router.push('/notifications')}
      className={`items-center justify-center rounded-full active:opacity-80 ${tone === 'solid' ? 'bg-white' : 'bg-white/15'}`}
      style={{ width: size, height: size }}>
      <Bell size={Math.round(size * 0.42)} color={tone === 'solid' ? c.ink : '#FFFFFF'} />
      {unread ? (
        <View className="absolute items-center justify-center rounded-full border-2 border-white bg-crit px-1"
          style={{ top: size * 0.08, right: size * 0.06, minWidth: 20, height: 20 }}>
          <Text className="font-jkx text-[10px] text-white">{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
