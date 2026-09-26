import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { LogBox, Platform } from 'react-native';
import { removePushToken, savePushToken } from './api';

type Notif = typeof import('expo-notifications');

/**
 * Phone notifications.
 *
 * Every notice is also written to the in-app inbox (the bell), so nothing is lost when push is off.
 * On a real phone with a build (or Expo Go on iPhone) the server pushes through Expo. Where remote push is
 * not possible — the simulator, Expo Go on Android — the app shows the same banner itself when a new
 * inbox row arrives (see NotificationBridge).
 */

const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let N: Notif | null = null;
/** Loaded on first use, after we hide Expo Go's "not fully supported" warning (local banners still work there). */
export function notif(): Notif | null {
  if (Platform.OS === 'web') return null;
  if (!N) {
    LogBox.ignoreLogs(['`expo-notifications` functionality is not fully supported', 'expo-notifications: Android Push notifications']);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    N = require('expo-notifications') as Notif;
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
    });
  }
  return N;
}

let token: string | null = null;
let remote = false;
/** True once the server can reach this phone directly; then the app stops making its own banners. */
export const remotePushOn = () => remote;

async function channels(n: Notif) {
  if (Platform.OS !== 'android') return;
  await n.setNotificationChannelAsync('default', { name: 'Booking updates', importance: n.AndroidImportance.HIGH, sound: 'default' });
  await n.setNotificationChannelAsync('jobs', {
    name: 'New job offers', importance: n.AndroidImportance.MAX, sound: 'default', vibrationPattern: [0, 400, 200, 400],
    lockscreenVisibility: n.AndroidNotificationVisibility.PUBLIC,
  });
}

export type PushState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function pushPermission(): Promise<PushState> {
  const n = notif();
  if (!n) return 'unsupported';
  const { status } = await n.getPermissionsAsync();
  return status as PushState;
}

/** Ask once, then link this phone to the account. Safe to call on every sign-in. */
export async function registerForPush(): Promise<PushState> {
  const n = notif();
  if (!n) return 'unsupported';
  try {
    await channels(n);
    let { status } = await n.getPermissionsAsync();
    if (status !== 'granted') status = (await n.requestPermissionsAsync()).status;
    if (status !== 'granted') return status as PushState;

    const projectId = (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ?? Constants.easConfig?.projectId;
    // Remote push needs a real phone, an EAS project id, and (on Android) a build rather than Expo Go.
    if (Device.isDevice && projectId && !(inExpoGo && Platform.OS === 'android')) {
      const t = (await n.getExpoPushTokenAsync({ projectId })).data;
      await savePushToken({ token: t, platform: Platform.OS });
      token = t;
      remote = true;
    }
    return 'granted';
  } catch (e) {
    console.warn('Push registration skipped:', (e as Error).message);
    return 'granted';
  }
}

/** On sign-out: stop this phone getting the account's notices. */
export async function unregisterPush() {
  const t = token;
  token = null;
  remote = false;
  if (t) await removePushToken({ token: t }).catch(() => undefined);
  await notif()?.setBadgeCountAsync(0).catch(() => undefined);
}
