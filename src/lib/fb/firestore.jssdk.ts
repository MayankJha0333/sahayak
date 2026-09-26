import {
  addDoc, collection, connectFirestoreEmulator, doc, getDoc, getFirestore, initializeFirestore, limit, onSnapshot,
  orderBy, query, deleteDoc, setDoc, updateDoc, where, type Firestore,
} from 'firebase/firestore';
import { Platform } from 'react-native';
import { USE_EMULATORS, emulatorHost } from '../firebase';
import { app } from './app.jssdk';

let _db: Firestore | null = null;
export function db(): Firestore {
  if (!_db) {
    if (!app) throw new Error('Firebase is not configured');
    _db = Platform.OS === 'web' ? getFirestore(app) : initializeFirestore(app, { experimentalForceLongPolling: true });
    if (USE_EMULATORS) connectFirestoreEmulator(_db, emulatorHost(), 8080);
  }
  return _db;
}

export { addDoc, collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, updateDoc, where };
export type { DocumentData, Query, QueryConstraint } from 'firebase/firestore';
