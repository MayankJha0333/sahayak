import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const env = import.meta.env;
export const USE_EMULATORS = (env.VITE_USE_EMULATORS ?? 'true') === 'true';
const REGION = env.VITE_FUNCTIONS_REGION || 'asia-south1';

const app = initializeApp(USE_EMULATORS
  ? { apiKey: 'demo', authDomain: 'demo-sahayak.firebaseapp.com', projectId: 'demo-sahayak', appId: '1:0:web:demo' }
  : { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID });

export const auth = getAuth(app);
export const db = getFirestore(app);
const functions = getFunctions(app, REGION);

if (USE_EMULATORS) {
  const host = window.location.hostname || '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}

/** Calls a Cloud Function and returns its data. Errors carry the server's plain-English message. */
export async function call<I, O>(name: string, data: I): Promise<O> {
  try {
    const r = await httpsCallable<I, O>(functions, name)(data);
    return r.data;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    // "internal" with no message means the request never reached a function: the backend is down or unreachable.
    if (err.code === 'functions/internal' && /^internal/i.test(err.message ?? '')) {
      throw new Error(USE_EMULATORS ? 'Cannot reach the local backend. Start it with: npm run firebase:emulators' : 'Cannot reach the server. Check your connection and try again.');
    }
    if (err.code === 'functions/unavailable' || err.code === 'functions/deadline-exceeded') throw new Error('The server is not answering. Try again in a moment.');
    throw new Error(err.message?.replace(/^\[\d+\]\s*/, '').replace(/\s*\[\d+\]$/, '') || 'Something went wrong.');
  }
}
