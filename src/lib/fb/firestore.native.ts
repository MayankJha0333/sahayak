import { useNativeSdk } from './runtime';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const impl = (useNativeSdk ? require('./firestore.rnfb') : require('./firestore.jssdk')) as typeof import('./firestore.jssdk');
export type { DocumentData, Query, QueryConstraint } from './firestore.jssdk';
export const db = impl.db;
export const addDoc = impl.addDoc;
export const collection = impl.collection;
export const doc = impl.doc;
export const getDoc = impl.getDoc;
export const limit = impl.limit;
export const onSnapshot = impl.onSnapshot;
export const orderBy = impl.orderBy;
export const query = impl.query;
export const setDoc = impl.setDoc;
export const updateDoc = impl.updateDoc;
export const where = impl.where;
