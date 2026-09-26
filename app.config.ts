import { existsSync } from 'fs';
import type { ExpoConfig } from 'expo/config';

/**
 * Google Maps needs a key on Android. Put it in .env as
 * EXPO_PUBLIC_GOOGLE_MAPS_KEY=... (or set it as an EAS secret).
 * Without it the app still runs — TrackingMap falls back to the drawn map.
 */
const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;

// Downloaded from Firebase → Project settings → Your apps. Builds skip them when absent.
const androidServices = existsSync('./google-services.json') ? './google-services.json' : undefined;
const iosServices = existsSync('./GoogleService-Info.plist') ? './GoogleService-Info.plist' : undefined;

const config: ExpoConfig = {
  name: 'Sahayak',
  slug: 'sahayak',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'sahayak',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',

  ios: {
    bundleIdentifier: 'com.sahayak.app',
    supportsTablet: true,
    ...(iosServices ? { googleServicesFile: iosServices } : {}),
    icon: './assets/expo.icon',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'We use your location to find the nearest expert and to show you where she is.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: 'com.sahayak.app',
    predictiveBackGestureEnabled: false,
    ...(androidServices ? { googleServicesFile: androidServices } : {}),
    adaptiveIcon: {
      backgroundColor: '#DDE5F7',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    ...(googleMapsKey ? { config: { googleMaps: { apiKey: googleMapsKey } } } : {}),
  },

  web: { output: 'static', favicon: './assets/images/favicon.png' },

  plugins: [
    'expo-router',
    'expo-updates',
    '@react-native-firebase/app',
    // The auth plugin only edits the iOS project (reCAPTCHA URL scheme), and it refuses to run without the plist.
    ...(iosServices ? (['@react-native-firebase/auth'] as const) : []),
    '@react-native-google-signin/google-signin',
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    [
      'expo-splash-screen',
      { backgroundColor: '#2451B2', image: './assets/images/splash-icon.png', imageWidth: 76 },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'We use your location to find the nearest expert and to show you where she is.',
      },
    ],
    'expo-maps',
    ['expo-notifications', { color: '#EE5A40', defaultChannel: 'default' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'Experts upload a photo of their Aadhaar card for verification.',
        cameraPermission: 'Experts take a photo of their Aadhaar card and a selfie for verification.',
      },
    ],
  ],

  experiments: { typedRoutes: true, reactCompiler: true },

  // `eas init` writes the projectId here on first run.
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
    router: {},
  },

  updates: {
    // `eas update:configure` fills in the URL.
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: { policy: 'appVersion' },
};

export default config;
