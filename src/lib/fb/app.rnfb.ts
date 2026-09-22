/**
 * Native build: React Native Firebase reads google-services.json (Android) and
 * GoogleService-Info.plist (iOS) at build time, so there is nothing to configure here.
 */
import { getApp, type ReactNativeFirebase } from '@react-native-firebase/app';

let resolved: ReactNativeFirebase.FirebaseApp | null = null;
try { resolved = getApp(); } catch { resolved = null; }

export const app = resolved;
export const isNative = true;
export const firebaseConfigured = resolved !== null;
