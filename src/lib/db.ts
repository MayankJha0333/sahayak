import {
  collection, db, doc, limit, onSnapshot, orderBy, query, where,
  type DocumentData, type Query, type QueryConstraint,
} from './fb/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import type {
  BookingDoc, EarningDoc, FeedbackDoc, OfferDoc, PartnerDoc, ReferralDoc, ShiftDoc, WithId,
} from './types';

/* ---------- generic live hooks ---------- */

export function useDoc<T>(path: string | null) {
  const [state, setState] = useState<{ path: string; data: WithId<T> | null }>({ path: '', data: null });
  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      doc(db(), path),
      (s) => setState({ path, data: s.exists() ? ({ id: s.id, ...(s.data() as T) }) : null }),
      () => setState({ path, data: null }),
    );
  }, [path]);
  if (!path) return null;
  return state.path === path ? state.data : undefined;
}

export function useCollection<T>(col: string, constraints: QueryConstraint[], enabled = true) {
  const key = `${col}|${enabled}|${JSON.stringify(constraints.map((c) => String(c)))}`;
  const [state, setState] = useState<{ key: string; rows: WithId<T>[] }>({ key: '', rows: [] });
  useEffect(() => {
    if (!enabled) return;
    const q: Query<DocumentData> = query(collection(db(), col), ...(constraints as never[]));
    return onSnapshot(
      q,
      (s) => setState({ key, rows: s.docs.map((d) => ({ id: d.id, ...(d.data() as T) })) }),
      () => setState({ key, rows: [] }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const fresh = state.key === key;
  return { rows: fresh ? state.rows : [], loading: enabled && !fresh };
}

/* ---------- customer ---------- */

export const LIVE: BookingDoc['status'][] = ['matching', 'assigned', 'arrived', 'in_progress'];

export function useMyBookings() {
  const { user } = useAuth();
  return useCollection<BookingDoc>('bookings',
    useMemo(() => [where('customerId', '==', user?.uid ?? '_'), orderBy('createdAt', 'desc'), limit(50)], [user?.uid]),
    Boolean(user));
}

export function useLiveBooking() {
  const { rows } = useMyBookings();
  return rows.find((b) => LIVE.includes(b.status));
}

export const useBooking = (id?: string) => useDoc<BookingDoc>(id ? `bookings/${id}` : null);
export const usePartner = (id?: string) => useDoc<PartnerDoc>(id ? `partners/${id}` : null);


export function useMyReferrals() {
  const { user } = useAuth();
  return useCollection<ReferralDoc>('referrals',
    useMemo(() => [where('referrerId', '==', user?.uid ?? '_'), orderBy('invitedAt', 'desc')], [user?.uid]), Boolean(user));
}

export function useMyFeedback() {
  const { user } = useAuth();
  return useCollection<FeedbackDoc>('feedback',
    useMemo(() => [where('userId', '==', user?.uid ?? '_'), orderBy('at', 'desc'), limit(30)], [user?.uid]), Boolean(user));
}

/* ---------- partner ---------- */

export function useMyOffer() {
  const { user } = useAuth();
  const { rows } = useCollection<OfferDoc>('offers',
    useMemo(() => [where('partnerId', '==', user?.uid ?? '_'), limit(1)], [user?.uid]), Boolean(user));
  return rows[0];
}

export function usePartnerBookings() {
  const { user } = useAuth();
  return useCollection<BookingDoc>('bookings',
    useMemo(() => [where('partnerId', '==', user?.uid ?? '_'), orderBy('createdAt', 'desc'), limit(50)], [user?.uid]),
    Boolean(user));
}

export function useMyJob() {
  const { rows } = usePartnerBookings();
  return rows.find((b) => ['assigned', 'arrived', 'in_progress'].includes(b.status));
}

/** The signed-in expert's payouts, newest first. */
export function useMyEarnings() {
  const { user } = useAuth();
  return useCollection<EarningDoc>('earnings',
    useMemo(() => [where('partnerId', '==', user?.uid ?? '_'), orderBy('createdAt', 'desc'), limit(100)], [user?.uid]), Boolean(user));
}

export function useMyShifts() {
  const { user } = useAuth();
  return useCollection<ShiftDoc>('shifts',
    useMemo(() => [where('partnerId', '==', user?.uid ?? '_')], [user?.uid]), Boolean(user));
}

/* ---------- admin ---------- */

export const useAllPartners = () => useCollection<PartnerDoc>('partners', useMemo(() => [limit(200)], []));
export const useAllBookings = () => useCollection<BookingDoc>('bookings', useMemo(() => [orderBy('createdAt', 'desc'), limit(100)], []));
export const useAllOffers = () => useCollection<OfferDoc>('offers', useMemo(() => [limit(100)], []));
export const useAllFeedback = () => useCollection<FeedbackDoc>('feedback', useMemo(() => [orderBy('at', 'desc'), limit(50)], []));
export const useAllEarnings = () => useCollection<EarningDoc>('earnings', useMemo(() => [orderBy('createdAt', 'desc'), limit(200)], []));
export const useAllReferrals = () => useCollection<ReferralDoc>('referrals', useMemo(() => [orderBy('invitedAt', 'desc'), limit(100)], []));
