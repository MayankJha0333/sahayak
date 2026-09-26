import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Read each key by its full name: Expo only bakes EXPO_PUBLIC_* values into the app when written as process.env.NAME.

/** Web config. Native builds read google-services.json / GoogleService-Info.plist instead. */
export const USE_EMULATORS = (process.env.EXPO_PUBLIC_USE_EMULATORS ?? '') === 'true';
/** The emulators run under a `demo-` project id, which needs no Firebase login and never touches the cloud. */
export const EMULATOR_PROJECT = 'demo-sahayak';

export const firebaseConfig = USE_EMULATORS
  ? { apiKey: 'demo', authDomain: `${EMULATOR_PROJECT}.firebaseapp.com`, projectId: EMULATOR_PROJECT, storageBucket: '', messagingSenderId: '0', appId: '1:0:web:demo' }
  : {
    apiKey: (process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? ''),
    authDomain: (process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? ''),
    projectId: (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? ''),
    storageBucket: (process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? ''),
    messagingSenderId: (process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? ''),
    appId: (process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? ''),
  };

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export const REGION = (process.env.EXPO_PUBLIC_FUNCTIONS_REGION ?? '') || 'asia-south1';
export const RAZORPAY_KEY_ID = (process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? '');
/** No key + emulators = the server accepts a stand-in payment, so checkout shows a test sheet instead of Razorpay. */
export const PAYMENTS_TEST_MODE = USE_EMULATORS && !RAZORPAY_KEY_ID;
/** OAuth "Web client" id from the Firebase project — Google Sign-In on Android needs it to mint an id token. */
export const GOOGLE_WEB_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '');

/**
 * Where the app finds the Firebase emulators running on your computer.
 *  1. EXPO_PUBLIC_EMULATOR_HOST in .env, if set — your computer's Wi-Fi IP (e.g. 192.168.1.5). Needed for a real iPhone.
 *  2. Android (real phone or emulator): the computer Expo Go loaded the app from (Metro's Wi-Fi address),
 *     so a phone on the same Wi-Fi just works. Skipped with `--tunnel`, where that address is an internet tunnel.
 *  3. Otherwise localhost (the iOS simulator shares your computer's network), or 10.0.2.2 on the Android emulator.
 */
export const emulatorHost = () => {
  const fixed = (process.env.EXPO_PUBLIC_EMULATOR_HOST ?? '').trim();
  if (fixed) return fixed;
  if (Platform.OS === 'android') {
    const host = (Constants.expoConfig?.hostUri ?? '').split(':')[0];
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && host !== '127.0.0.1') return host;
    return '10.0.2.2';
  }
  return 'localhost';
};
