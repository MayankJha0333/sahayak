import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Which Firebase SDK this process can use.
 *  - web            → Firebase JS SDK
 *  - Expo Go        → Firebase JS SDK (no native modules available)
 *  - dev/prod build → React Native Firebase (native)
 */
export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const useNativeSdk = Platform.OS !== 'web' && !inExpoGo;
