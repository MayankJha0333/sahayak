import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  auth, signInEmail, signInGoogle, signOutAll, signUpEmail, startPhone, watchAuth, type AuthUser, type PhoneVerifier,
} from './fb/auth';
import { doc, db, getDoc, onSnapshot, setDoc } from './fb/firestore';
import type { PartnerDoc, Role, UserDoc } from './types';

export type PhoneConfirmation = { confirm: (code: string) => Promise<void> };

type AuthState = {
  ready: boolean;
  user: AuthUser | null;
  /** undefined while loading, null when the user has no profile document. */
  profile: UserDoc | null | undefined;
  partner: PartnerDoc | null;
  isAdmin: boolean;
  /** False while the signed-in user's admin flag is still loading — do not redirect on isAdmin until this is true. */
  adminKnown: boolean;

  /** Step 1 of phone sign-in: Firebase sends the SMS. Step 2: confirm(code). The verifier is only needed by the JS SDK on a phone. */
  phoneStart: (phoneE164: string, verifier?: PhoneVerifier) => Promise<PhoneConfirmation>;
  /** True when this account already has a users/{uid} document. */
  profileExists: () => Promise<boolean>;
  emailSignIn: (email: string, password: string) => Promise<void>;
  emailSignUp: (email: string, password: string, name: string) => Promise<void>;
  googleSignIn: () => Promise<void>;
  /** After any sign-in: create the profile (and partner doc) if this is the first time. */
  ensureProfile: (role: Exclude<Role, 'admin'>, extras?: { name?: string; phone?: string; referralCode?: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState>(null as never);

/** The SDK's current user, which is set before React state catches up after a sign-in. */
const liveUser = (): AuthUser | null => {
  const u = auth().currentUser as AuthUser | null | undefined;
  return u ? { uid: u.uid, email: u.email, phoneNumber: u.phoneNumber, displayName: u.displayName } : null;
};

const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'NA';
/** Six characters, no 0/O or 1/I, so it survives being read out over the phone. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [pstate, setPstate] = useState<{ uid: string; profile?: UserDoc | null; partner?: PartnerDoc | null; admin?: boolean }>({ uid: '' });

  useEffect(() => watchAuth((u) => { setUser(u); setReady(true); }), []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const merge = (patch: Partial<typeof pstate>) => setPstate((s) => (s.uid === uid ? { ...s, ...patch } : { uid, ...patch }));
    const unsubs = [
      onSnapshot(doc(db(), `users/${uid}`), (s) => merge({ profile: s.exists() ? (s.data() as UserDoc) : null }), () => merge({ profile: null })),
      onSnapshot(doc(db(), `partners/${uid}`), (s) => merge({ partner: s.exists() ? (s.data() as PartnerDoc) : null }), () => merge({ partner: null })),
      onSnapshot(doc(db(), `admins/${uid}`), (s) => merge({ admin: s.exists() }), () => merge({ admin: false })),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [user]);

  const same = Boolean(user) && pstate.uid === user?.uid;
  const profile: UserDoc | null | undefined = !user ? null : same ? pstate.profile : undefined;
  const partner: PartnerDoc | null = same ? (pstate.partner ?? null) : null;
  const isAdmin = same ? Boolean(pstate.admin) : false;
  const adminKnown = !user || (same && pstate.admin !== undefined);

  const value = useMemo<AuthState>(() => ({
    ready, user, profile, partner, isAdmin, adminKnown,
    phoneStart: startPhone,
    emailSignIn: signInEmail,
    emailSignUp: signUpEmail,
    googleSignIn: signInGoogle,

    profileExists: async () => {
      const uid = liveUser()?.uid;
      return Boolean(uid) && (await getDoc(doc(db(), `users/${uid}`))).exists();
    },

    ensureProfile: async (role, extras) => {
      const u = liveUser() ?? user;
      if (!u) throw new Error('Not signed in');
      const ref = doc(db(), `users/${u.uid}`);
      const existing = await getDoc(ref);
      const name = (extras?.name ?? u.displayName ?? '').trim() || (role === 'partner' ? 'New expert' : 'Customer');
      const phone = extras?.phone ?? u.phoneNumber ?? '';
      if (!existing.exists()) {
        const profileDoc: UserDoc = {
          role, phone, name, rewards: 0, referralCode: code(),
          // No made-up address: the customer drops her own pin on the map before the first booking.
          addresses: [], createdAt: Date.now(),
          ...(extras?.referralCode ? { referredBy: extras.referralCode.trim().toUpperCase() } : {}),
        };
        await setDoc(ref, profileDoc);
      }
      if (role === 'partner') {
        const pref = doc(db(), `partners/${u.uid}`);
        if (!(await getDoc(pref)).exists()) {
          const pd: PartnerDoc = {
            name, initials: initials(name), phone,
            rating: 5, jobs: 0, skills: ['cleaning', 'kitchen', 'bathroom'], hub: 'Sector 45',
            onShift: false, shift: '7:00 AM - 11:00 AM', reliability: 0.95, onTime: 100,
            at: { lat: 28.4472, lng: 77.0661 },
          };
          await setDoc(pref, pd);
        }
      }
    },

    signOut: async () => { await signOutAll(); },
  }), [ready, user, profile, partner, isAdmin, adminKnown]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
