import {
  GoogleAuthProvider, RecaptchaVerifier, createUserWithEmailAndPassword, getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, signInWithPhoneNumber, signInWithPopup, signOut as fbSignOut, updateProfile,
  connectAuthEmulator, type Auth,
} from 'firebase/auth';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USE_EMULATORS, emulatorHost } from '../firebase';
import { app } from './app.jssdk';
import { inExpoGo } from './runtime';

/** On a phone the JS SDK forgets the session on restart unless told where to keep it. */
function makeAuth(a: NonNullable<typeof app>): Auth {
  if (Platform.OS === 'web') return getAuth(a);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getReactNativePersistence, initializeAuth } = require('firebase/auth') as {
      getReactNativePersistence: (s: unknown) => unknown; initializeAuth: (a: unknown, o: unknown) => Auth;
    };
    return initializeAuth(a, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch { return getAuth(a); }
}

export type AuthUser = { uid: string; email: string | null; phoneNumber: string | null; displayName: string | null };

let _auth: Auth | null = null;
export function auth(): Auth {
  if (!_auth) {
    if (!app) throw new Error('Firebase is not configured');
    _auth = makeAuth(app);
    if (USE_EMULATORS) connectAuthEmulator(_auth, `http://${emulatorHost()}:9099`, { disableWarnings: true });
  }
  return _auth;
}

const pick = (u: { uid: string; email: string | null; phoneNumber: string | null; displayName: string | null } | null): AuthUser | null =>
  u ? { uid: u.uid, email: u.email, phoneNumber: u.phoneNumber, displayName: u.displayName } : null;

export const currentUid = () => auth().currentUser?.uid ?? null;
export const watchAuth = (cb: (u: AuthUser | null) => void) => onAuthStateChanged(auth(), (u) => cb(pick(u)));

export async function signInEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth(), email, password);
}

export async function signUpEmail(email: string, password: string, name: string) {
  const cred = await createUserWithEmailAndPassword(auth(), email, password);
  if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
}

export async function signInGoogle() {
  if (Platform.OS !== 'web') {
    throw new Error(inExpoGo
      ? 'Google sign-in needs a development build (npm run build:dev:android). In Expo Go, use Email.'
      : 'Google sign-in is not available here.');
  }
  await signInWithPopup(auth(), new GoogleAuthProvider());
}

export type PhoneVerifier = { readonly type: 'recaptcha'; verify(): Promise<string>; _reset?(): void };

/**
 * Phone sign-in. The browser gets an invisible reCAPTCHA of its own; a phone
 * running the JS SDK (Expo Go) must pass a verifier from <RecaptchaGate />.
 */
export async function startPhone(phoneE164: string, verifier?: PhoneVerifier) {
  let appVerifier: PhoneVerifier | RecaptchaVerifier | undefined = verifier;
  let cleanup = () => {};
  if (USE_EMULATORS) {
    // The Auth emulator does not check the token; it prints the code instead of sending an SMS.
    appVerifier = { type: 'recaptcha', verify: async () => 'emulator', _reset: () => {} };
  } else if (Platform.OS === 'web') {
    let host = document.getElementById('recaptcha-host');
    if (!host) { host = document.createElement('div'); host.id = 'recaptcha-host'; document.body.appendChild(host); }
    const rv = new RecaptchaVerifier(auth(), host, { size: 'invisible' });
    appVerifier = rv; cleanup = () => rv.clear();
  }
  if (!appVerifier) throw Object.assign(new Error('Phone sign-in needs the security check component'), { code: 'auth/argument-error' });
  const result = await signInWithPhoneNumber(auth(), phoneE164, appVerifier as RecaptchaVerifier);
  return {
    confirm: async (code: string) => { await result.confirm(code); cleanup(); },
  };
}

export const signOutAll = () => fbSignOut(auth());

/** Emulator only: the code the Auth emulator "sent" to a number, read back from its REST API. */
export async function emulatorOtp(phoneE164: string): Promise<string | null> {
  if (!USE_EMULATORS) return null;
  try {
    const res = await fetch(`http://${emulatorHost()}:9099/emulator/v1/projects/${app?.options.projectId}/verificationCodes`);
    const json = (await res.json()) as { verificationCodes?: { phoneNumber: string; code: string }[] };
    const hit = [...(json.verificationCodes ?? [])].reverse().find((v) => v.phoneNumber === phoneE164);
    return hit?.code ?? null;
  } catch { return null; }
}
