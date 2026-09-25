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

export const emulatorHost = () => (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
