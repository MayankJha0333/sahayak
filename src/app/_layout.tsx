import '../global.css';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import { colorScheme } from 'nativewind';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SetupScreen } from '@/components/SetupScreen';
import { AuthProvider } from '@/lib/auth';
import { firebaseConfigured } from '@/lib/firebase';
import { useReferralCapture } from '@/lib/referral';
import { ThemeProvider } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
colorScheme.set('light');

export default function RootLayout() {
  const [ready] = useFonts({
    Jakarta400: PlusJakartaSans_400Regular,
    Jakarta500: PlusJakartaSans_500Medium,
    Jakarta600: PlusJakartaSans_600SemiBold,
    Jakarta700: PlusJakartaSans_700Bold,
    Jakarta800: PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useReferralCapture();

  if (!ready) return <View className="flex-1 bg-ground dark:bg-ground-dark" />;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StatusBar style="dark" />
        {firebaseConfigured ? (
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
          </AuthProvider>
        ) : (
          <SetupScreen />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
