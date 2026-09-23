import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { REGION, USE_EMULATORS, emulatorHost } from '../firebase';
import { app } from './app.jssdk';

let _fns: Functions | null = null;
function fns(): Functions {
  if (!_fns) {
    if (!app) throw new Error('Firebase is not configured');
    _fns = getFunctions(app, REGION);
    if (USE_EMULATORS) connectFunctionsEmulator(_fns, emulatorHost(), 5001);
  }
  return _fns;
}

export const callable = <I, O>(name: string) => async (input: I): Promise<O> => {
  const fn = httpsCallable<I, O>(fns(), name);
  try {
    return (await fn(input)).data;
  } catch (e) {
    // Server messages are written for people; drop the transport's "[400]" tag and hide raw internals.
    const err = e as Error & { code?: string };
    const raw = (err.message ?? '').replace(/\s*\[\d+\]\s*$/, '').trim();
    const msg = !raw || /^internal$/i.test(raw) || err.code === 'functions/internal'
      ? 'Something went wrong on our side. Please try again.'
      : err.code === 'functions/unavailable' || /network/i.test(raw) ? 'No connection. Check your internet and try again.' : raw;
    throw Object.assign(new Error(msg), { code: err.code });
  }
};
