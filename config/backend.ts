import { Platform } from 'react-native';

/**
 * The local server for development builds. The Android emulator reaches the
 * computer at 10.0.2.2, which needs no `adb reverse` (that forwarding is lost
 * whenever adb restarts); the iOS simulator shares the computer's localhost.
 * A physical phone needs the computer's LAN address, e.g.
 * EXPO_PUBLIC_DEV_BACKEND_URL=http://192.168.1.20:8787 in .env.
 */
const DEVELOPMENT_URL =
  process.env.EXPO_PUBLIC_DEV_BACKEND_URL?.trim()
  || (Platform.OS === 'android' ? 'http://10.0.2.2:8787' : 'http://localhost:8787');

export const BACKEND_URLS = {
  development: DEVELOPMENT_URL,
  // development: 'https://king-prawn-app-clone-r7mhu.ondigitalocean.app',
  production: 'https://king-prawn-app-clone-r7mhu.ondigitalocean.app',
} as const;

export type BackendEnvironment = keyof typeof BACKEND_URLS;

const BACKEND_ENVIRONMENT_OVERRIDE: BackendEnvironment | null = null;

export const BACKEND_ENVIRONMENT: BackendEnvironment =
  BACKEND_ENVIRONMENT_OVERRIDE ?? (__DEV__ ? 'development' : 'production');

export const SERVER_URL = BACKEND_URLS[BACKEND_ENVIRONMENT];
