import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

export default function PartnerLayout() {
  const { ready, user, profile } = useAuth();
  const { c } = useTheme();
  if (!ready || (user && profile === undefined)) {
    return <View className="flex-1 items-center justify-center bg-ground dark:bg-ground-dark"><ActivityIndicator color={c.brand} /></View>;
  }
  if (!user || profile?.role !== 'partner') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
