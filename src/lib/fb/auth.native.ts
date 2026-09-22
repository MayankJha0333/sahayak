import { useNativeSdk } from './runtime';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const impl = (useNativeSdk ? require('./auth.rnfb') : require('./auth.jssdk')) as typeof import('./auth.jssdk');
export type { AuthUser, PhoneVerifier } from './auth.jssdk';
export const auth = impl.auth;
export const currentUid = impl.currentUid;
export const watchAuth = impl.watchAuth;
export const signInEmail = impl.signInEmail;
export const signUpEmail = impl.signUpEmail;
export const signInGoogle = impl.signInGoogle;
export const startPhone = impl.startPhone;
export const signOutAll = impl.signOutAll;
export const emulatorOtp = impl.emulatorOtp;
