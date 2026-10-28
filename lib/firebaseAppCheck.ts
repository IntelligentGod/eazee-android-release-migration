import { Platform } from 'react-native';
import type { AppCheck } from '@react-native-firebase/app-check';

const APP_CHECK_HEADER = 'X-Firebase-AppCheck';

let appCheckInstancePromise: Promise<AppCheck> | null = null;

export function isFirebaseAppCheckEnabled() {
  return (
    process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED === 'true'
    && Platform.OS === 'ios'
  );
}

async function getFirebaseAppCheckInstance() {
  if (!appCheckInstancePromise) {
    appCheckInstancePromise = (async () => {
      const { getApp } = require('@react-native-firebase/app') as typeof import('@react-native-firebase/app');
      const appCheckModule = require('@react-native-firebase/app-check') as typeof import('@react-native-firebase/app-check');
      const provider = new appCheckModule.ReactNativeFirebaseAppCheckProvider();
      provider.configure({
        android: {
          provider: __DEV__ ? 'debug' : 'playIntegrity',
        },
        apple: {
          provider: __DEV__ ? 'debug' : 'appAttest',
        },
      });

      return appCheckModule.initializeAppCheck(getApp(), {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
    })();
  }

  return appCheckInstancePromise;
}

export async function getFirebaseAppCheckToken() {
  if (!isFirebaseAppCheckEnabled()) {
    return null;
  }

  try {
    const appCheckModule = require('@react-native-firebase/app-check') as typeof import('@react-native-firebase/app-check');
    const appCheckInstance = await getFirebaseAppCheckInstance();
    const result = await appCheckModule.getToken(appCheckInstance, false);
    const token = result.token?.trim();
    if (!token) {
      throw new Error('Firebase App Check returned an empty token');
    }
    return token;
  } catch (error) {
    appCheckInstancePromise = null;
    throw new Error('This app could not be verified. Please update or reinstall Eazee.', {
      cause: error,
    });
  }
}

export async function getFirebaseAppCheckHeaders(): Promise<Record<string, string>> {
  const token = await getFirebaseAppCheckToken();
  return token ? { [APP_CHECK_HEADER]: token } : {};
}
