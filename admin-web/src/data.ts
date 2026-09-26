import { collection, doc, limit, onSnapshot, orderBy, query, type QueryConstraint } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';
import type { WithId } from './types';

/** A live Firestore collection. Re-subscribes when `key` changes. */
export function useCol<T>(path: string, constraints: QueryConstraint[] = [], key = '') {
  const [rows, setRows] = useState<WithId<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    setLoading(true);
    return onSnapshot(query(collection(db, path), ...constraints),
      (s) => { setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))); setLoading(false); setError(''); },
      (e) => { setError(e.message); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return { rows, loading, error };
}

export function useDocument<T>(path: string | null) {
  const [data, setData] = useState<WithId<T> | null | undefined>(undefined);
  useEffect(() => {
    if (!path) { setData(null); return; }
    setData(undefined);
    return onSnapshot(doc(db, path), (s) => setData(s.exists() ? ({ id: s.id, ...(s.data() as T) }) : null), () => setData(null));
  }, [path]);
  return data;
}

export const recent = (field: string, n = 300) => [orderBy(field, 'desc'), limit(n)];
export { limit };
