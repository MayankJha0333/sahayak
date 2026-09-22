import { Tabs } from 'expo-router';
import { CircleUser, IndianRupee, Zap } from '@/components/icons';
import { useAuth } from '@/lib/auth';
import { useLiveLocation } from '@/lib/useLiveLocation';
import { TabBar } from '@/components/TabBar';
import { useTheme } from '@/theme';

export default function PartnerTabs() {
  const { c } = useTheme();
  const { partner } = useAuth();
  useLiveLocation(Boolean(partner?.onShift) && !partner?.bot);
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.ink3,
        tabBarStyle: { backgroundColor: c.paper, borderTopColor: c.line2 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Jobs', tabBarIcon: ({ color, size }) => <Zap size={size - 2} color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: ({ color, size }) => <IndianRupee size={size - 2} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'You', tabBarIcon: ({ color, size }) => <CircleUser size={size - 2} color={color} /> }} />
    </Tabs>
  );
}
