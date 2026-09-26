import {
  addDoc, collection, connectFirestoreEmulator, doc, getDoc, getFirestore, limit, onSnapshot, orderBy, query,
  deleteDoc, setDoc, updateDoc, where, type DocumentData, type Firestore, type Query, type QueryConstraint,
} from '@react-native-firebase/firestore';
import { USE_EMULATORS, emulatorHost } from '../firebase';

let _db: Firestore | null = null;
export function db() {
  if (!_db) {
    _db = getFirestore();
    if (USE_EMULATORS) connectFirestoreEmulator(_db, emulatorHost(), 8080);
  }
  return _db;
}

export { addDoc, collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, updateDoc, where };
export type { DocumentData, Query, QueryConstraint };
