import { useNativeSdk } from './runtime';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const impl = (useNativeSdk ? require('./app.rnfb') : require('./app.jssdk')) as typeof import('./app.jssdk');
export const app = impl.app;
export const isNative = useNativeSdk;
export const firebaseConfigured = impl.firebaseConfigured;
