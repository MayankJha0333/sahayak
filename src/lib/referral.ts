import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';

/**
 * Referral is a link, not a form. A friend shares https://…/r/CODE (or sahayak://r/CODE);
 * whoever opens the app from it has the code remembered until they finish signing up,
 * where it is attached to their profile. The reward is released on their first completed booking.
 */
const KEY = 'sahayak.pendingReferral';
export const SHARE_HOST = 'https://sahayak-b3d2a.web.app';

export const referralLink = (code: string) => `${SHARE_HOST}/r/${code}`;

export function codeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/r\/([A-Za-z0-9]{4,10})/) ?? url.match(/[?&]ref=([A-Za-z0-9]{4,10})/);
  return m ? m[1].toUpperCase() : null;
}

export async function rememberReferral(code: string) { try { await AsyncStorage.setItem(KEY, code); } catch {} }
export async function pendingReferral(): Promise<string | null> { try { return await AsyncStorage.getItem(KEY); } catch { return null; } }
export async function clearReferral() { try { await AsyncStorage.removeItem(KEY); } catch {} }

/** Mount once at the root: catches the launch URL and any link opened while the app is running. */
export function useReferralCapture() {
  useEffect(() => {
    Linking.getInitialURL().then((u) => { const c = codeFromUrl(u); if (c) void rememberReferral(c); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => { const c = codeFromUrl(url); if (c) void rememberReferral(c); });
    return () => sub.remove();
  }, []);
}
