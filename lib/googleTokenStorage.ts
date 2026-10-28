import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { GOOGLE_REFRESH_TOKEN_STORAGE_KEY } from '@/app/context/googleOAuthConfig';

const LEGACY_GOOGLE_ACCESS_TOKEN_STORAGE_KEY = 'googleAccessToken';
const GOOGLE_TOKENS_SECURE_STORAGE_KEY = 'googleTokens.v1';

export const GOOGLE_CONNECTION_PRESENT_STORAGE_KEY = 'googleConnectionPresent:v1';

type GoogleTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

type StoredGoogleTokens = GoogleTokens & {
  userId: string;
  version: 1;
};

const readSecureGoogleTokens = async (): Promise<StoredGoogleTokens | null> => {
  const value = await SecureStore.getItemAsync(GOOGLE_TOKENS_SECURE_STORAGE_KEY);
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredGoogleTokens>;
    if (parsed.version === 1 && typeof parsed.userId === 'string') {
      return {
        version: 1,
        userId: parsed.userId,
        accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : null,
        refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
      };
    }
  } catch {}

  await SecureStore.deleteItemAsync(GOOGLE_TOKENS_SECURE_STORAGE_KEY);
  return null;
};

const updateConnectionMarker = async (hasTokens: boolean) => {
  if (hasTokens) {
    await AsyncStorage.setItem(GOOGLE_CONNECTION_PRESENT_STORAGE_KEY, '1');
  } else {
    await AsyncStorage.removeItem(GOOGLE_CONNECTION_PRESENT_STORAGE_KEY);
  }
};

export async function writeGoogleTokens(
  userId: string,
  accessToken: string | null,
  refreshToken: string | null
) {
  if (accessToken || refreshToken) {
    await SecureStore.setItemAsync(GOOGLE_TOKENS_SECURE_STORAGE_KEY, JSON.stringify({
      version: 1,
      userId,
      accessToken,
      refreshToken,
    } satisfies StoredGoogleTokens));
    await updateConnectionMarker(true);
  } else {
    const storedTokens = await readSecureGoogleTokens();
    if (!storedTokens || storedTokens.userId === userId) {
      await SecureStore.deleteItemAsync(GOOGLE_TOKENS_SECURE_STORAGE_KEY);
      await updateConnectionMarker(false);
    }
  }
}

export async function readGoogleTokens(userId: string): Promise<GoogleTokens> {
  const [storedTokens, legacyAccessToken, legacyRefreshToken] = await Promise.all([
    readSecureGoogleTokens(),
    AsyncStorage.getItem(LEGACY_GOOGLE_ACCESS_TOKEN_STORAGE_KEY),
    AsyncStorage.getItem(GOOGLE_REFRESH_TOKEN_STORAGE_KEY),
  ]);
  const secureAccessToken = storedTokens?.userId === userId ? storedTokens.accessToken : null;
  const secureRefreshToken = storedTokens?.userId === userId ? storedTokens.refreshToken : null;
  const accessToken = secureAccessToken || legacyAccessToken;
  const refreshToken = secureRefreshToken || legacyRefreshToken;

  if (legacyAccessToken || legacyRefreshToken) {
    await writeGoogleTokens(userId, accessToken, refreshToken);
    await AsyncStorage.multiRemove([
      LEGACY_GOOGLE_ACCESS_TOKEN_STORAGE_KEY,
      GOOGLE_REFRESH_TOKEN_STORAGE_KEY,
    ]);
  } else {
    await updateConnectionMarker(!!storedTokens);
  }

  return { accessToken, refreshToken };
}

export async function readGoogleRefreshTokenForCleanup(userId?: string) {
  if (userId) {
    return (await readGoogleTokens(userId)).refreshToken;
  }

  const [storedTokens, legacyRefreshToken] = await Promise.all([
    readSecureGoogleTokens(),
    AsyncStorage.getItem(GOOGLE_REFRESH_TOKEN_STORAGE_KEY),
  ]);
  return legacyRefreshToken || storedTokens?.refreshToken || null;
}

export async function clearGoogleTokens(userId?: string | null) {
  const storedTokens = await readSecureGoogleTokens();
  const shouldClearSecureTokens = !userId || !storedTokens || storedTokens.userId === userId;
  if (shouldClearSecureTokens) {
    await SecureStore.deleteItemAsync(GOOGLE_TOKENS_SECURE_STORAGE_KEY);
  }

  await AsyncStorage.multiRemove([
    LEGACY_GOOGLE_ACCESS_TOKEN_STORAGE_KEY,
    GOOGLE_REFRESH_TOKEN_STORAGE_KEY,
  ]);
  if (shouldClearSecureTokens) {
    await updateConnectionMarker(false);
  }
}
