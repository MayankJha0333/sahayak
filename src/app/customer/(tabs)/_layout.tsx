import { Tabs } from 'expo-router';
import { CalendarDays, Home, User } from '@/components/icons';
import { TabBar } from '@/components/TabBar';
import { useTheme } from '@/theme';

export default function CustomerTabs() {
  const { c } = useTheme();
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
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home size={size - 2} color={color} /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: ({ color, size }) => <CalendarDays size={size - 2} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <User size={size - 2} color={color} /> }} />
    </Tabs>
  );
}
