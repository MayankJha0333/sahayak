import {
  GoogleAuthProvider, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, onAuthStateChanged,
  signInWithCredential, signInWithEmailAndPassword, signInWithPhoneNumber, signOut as fbSignOut, updateProfile,
  type Auth, type User,
} from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID, USE_EMULATORS, emulatorHost } from '../firebase';

export type AuthUser = { uid: string; email: string | null; phoneNumber: string | null; displayName: string | null };

let configured = false;
function ensureGoogle() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  configured = true;
}

let _auth: Auth | null = null;
export function auth() {
  if (!_auth) {
    _auth = getAuth();
    if (USE_EMULATORS) connectAuthEmulator(_auth, `http://${emulatorHost()}:9099`);
  }
  return _auth;
}

const pick = (u: User | null): AuthUser | null =>
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

/** Native Google Sign-In → Firebase credential. Needs the Web client id and the app's SHA-1 in Firebase. */
export async function signInGoogle() {
  ensureGoogle();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  const idToken = res.type === 'success' ? res.data.idToken : null;
  if (!idToken) throw new Error('Google sign-in was cancelled');
  await signInWithCredential(auth(), GoogleAuthProvider.credential(idToken));
}

/** Real SMS OTP. On Android Firebase may auto-verify without a code; confirm() still resolves. */
export async function startPhone(phoneE164: string, _verifier?: unknown) {
  const result = await signInWithPhoneNumber(auth(), phoneE164);
  return { confirm: async (code: string) => { await result.confirm(code); } };
}

export const signOutAll = () => fbSignOut(auth());
export const emulatorOtp = async (_phone: string): Promise<string | null> => null;
