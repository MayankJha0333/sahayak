import { Tabs } from 'expo-router';
import { CalendarDays, Home, User } from '@/components/icons';
import { TabBar } from '@/components/TabBar';
import { useServiceArea } from '@/lib/areas';
import { useAuth } from '@/lib/auth';
import { useMyBookings } from '@/lib/db';
import { useTheme } from '@/theme';

export default function CustomerTabs() {
  const { c } = useTheme();
  const { profile } = useAuth();
  const { served, loading } = useServiceArea();
  const { rows: bookings } = useMyBookings();
  const address = profile?.addresses.find((a) => a.id === profile.defaultAddressId) ?? profile?.addresses[0];
  // Not served here and nothing booked before: only the coming-soon Home and Account. Past bookings stay reachable.
  const hideBookings = Boolean(address) && !loading && !served(address!.at) && bookings.length === 0;
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
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarItemStyle: hideBookings ? { display: 'none' } : undefined, tabBarIcon: ({ color, size }) => <CalendarDays size={size - 2} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <User size={size - 2} color={color} /> }} />
    </Tabs>
  );
}
