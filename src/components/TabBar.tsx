import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

/** Bottom tabs with a soft pill behind the active one — the Pronto / Zepto convention. */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  return (
    <View className="flex-row border-t border-line2 bg-paper px-2 pt-2 dark:border-line2-dark dark:bg-paper-dark" style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
      {state.routes.map((route, i) => {
        const on = state.index === i;
        const { options } = descriptors[route.key];
        // A tab switched off for now (e.g. Bookings where we do not serve yet).
        if ((options.tabBarItemStyle as { display?: string } | undefined)?.display === 'none') return null;
        const label = typeof options.title === 'string' ? options.title : route.name;
        const Icon = options.tabBarIcon;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => { const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }); if (!on && !e.defaultPrevented) navigation.navigate(route.name); }}
            className="flex-1 items-center">
            <View className={`flex-row items-center gap-2.5 rounded-[18px] px-5 py-3.5 ${on ? 'bg-brand-soft dark:bg-brand-softdark' : ''}`}>
              {Icon ? Icon({ focused: on, color: on ? c.brand : c.ink2, size: 22 }) : null}
              <Text className={`text-[15px] ${on ? 'font-jkb text-brand dark:text-brand-dark' : 'font-jkm text-ink2 dark:text-ink2-dark'}`}>{label}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
