import { useNativeSdk } from './runtime';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const impl = (useNativeSdk ? require('./functions.rnfb') : require('./functions.jssdk')) as typeof import('./functions.jssdk');
export const callable = impl.callable;
