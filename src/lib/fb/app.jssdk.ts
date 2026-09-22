/**
 * Web build: the Firebase JS SDK, configured from EXPO_PUBLIC_FIREBASE_* in .env.
 * On Android/iOS Metro picks app.native.ts instead (React Native Firebase,
 * configured from google-services.json / GoogleService-Info.plist).
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { firebaseConfig, firebaseConfigured } from '../firebase';

export const app: FirebaseApp | null = firebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

export const isNative = false;
export { firebaseConfigured };
