import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { SERVER_URL } from '@/config/backend';

/**
 * Whether this install should update: "required" when it is older than the minimum the
 * server sets (a prompt that keeps coming back), "available" when the store has a newer
 * version (asked at most once a day per version). Any failure means "none": an update
 * check must never get in the way of using the app.
 */
export type AppUpdateStatus =
  | { kind: 'none' }
  | { kind: 'available' | 'required'; latestVersion: string | null; storeUrl: string };

const ANDROID_STORE_URL = `https://play.google.com/store/apps/details?id=${Application.applicationId || 'com.eazee.ai'}`;
const PROMPT_STORAGE_KEY = 'appUpdate:lastPrompt:v1';
const PROMPT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;

/** -1, 0 or 1, comparing dotted numbers (1.0.10 is newer than 1.0.9). */
export function compareAppVersions(left: string, right: string) {
  const a = left.split('.').map((part) => Number(part) || 0);
  const b = right.split('.').map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export const getInstalledAppVersion = () =>
  Application.nativeApplicationVersion || Constants.expoConfig?.version || null;

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type PlatformConfig = { minimumVersion: string | null; latestVersion: string | null; storeUrl: string | null };

async function fetchServerConfig(): Promise<PlatformConfig | null> {
  const data = await fetchJson(`${SERVER_URL}/app/version-config`);
  const platform = data?.[Platform.OS === 'ios' ? 'ios' : 'android'];
  if (!platform || typeof platform !== 'object') return null;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return { minimumVersion: text(platform.minimumVersion), latestVersion: text(platform.latestVersion), storeUrl: text(platform.storeUrl) };
}

/** The App Store's current version and page, looked up in the device's own store region. */
async function fetchAppStoreRelease(): Promise<{ version: string; url: string } | null> {
  if (Platform.OS !== 'ios') return null;
  const bundleId = Application.applicationId || 'com.eazee.ai';
  const region = (Intl.DateTimeFormat().resolvedOptions().locale.split('-')[1] || '').toLowerCase();
  for (const country of region ? [region, ''] : ['']) {
    const data = await fetchJson(
      `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}${country ? `&country=${country}` : ''}&_=${Date.now()}`
    );
    const result = data?.results?.[0];
    if (typeof result?.version === 'string' && typeof result?.trackViewUrl === 'string') {
      return { version: result.version, url: result.trackViewUrl };
    }
  }
  return null;
}

export async function checkAppUpdate(): Promise<AppUpdateStatus> {
  const installed = getInstalledAppVersion();
  if (!installed) return { kind: 'none' };
  const [config, store] = await Promise.all([fetchServerConfig(), fetchAppStoreRelease()]);
  const storeUrl = config?.storeUrl || store?.url || (Platform.OS === 'android' ? ANDROID_STORE_URL : null);
  if (!storeUrl) return { kind: 'none' };

  const latestVersion = [config?.latestVersion, store?.version]
    .filter((version): version is string => !!version)
    .sort((left, right) => compareAppVersions(right, left))[0] || null;
  if (config?.minimumVersion && compareAppVersions(installed, config.minimumVersion) < 0) {
    return { kind: 'required', latestVersion, storeUrl };
  }
  if (latestVersion && compareAppVersions(installed, latestVersion) < 0) {
    return { kind: 'available', latestVersion, storeUrl };
  }
  return { kind: 'none' };
}

/** "Update available" is asked once a day at most, and again as soon as a newer version appears. */
export async function shouldPromptForAvailableUpdate(latestVersion: string | null, now = Date.now()) {
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(PROMPT_STORAGE_KEY)) || 'null');
    if (stored && stored.version === latestVersion && now - Number(stored.at) < PROMPT_INTERVAL_MS) return false;
  } catch {}
  return true;
}

export async function rememberAvailableUpdatePrompt(latestVersion: string | null, now = Date.now()) {
  try {
    await AsyncStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify({ version: latestVersion, at: now }));
  } catch {}
}
