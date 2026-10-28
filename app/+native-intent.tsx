import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GOOGLE_OAUTH_IN_PROGRESS_MAX_AGE_MS,
  GOOGLE_OAUTH_IN_PROGRESS_STORAGE_KEY,
} from './context/googleOAuthConfig';
import { GOOGLE_CONNECTION_PRESENT_STORAGE_KEY } from '@/lib/googleTokenStorage';

const isOAuthRedirectPath = (path: string) => {
  try {
    const parsedUrl = new URL(path);
    return parsedUrl.pathname === '/oauthredirect' || parsedUrl.hostname === 'oauthredirect';
  } catch {
    return path.startsWith('/oauthredirect') || path.startsWith('oauthredirect');
  }
};

export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  const isOAuthRedirect = isOAuthRedirectPath(path);

  try {
    if (isOAuthRedirect) {
      if (!initial) {
        return '/(tabs)/home/account';
      }

      const oauthStartedAt = Number(await AsyncStorage.getItem(GOOGLE_OAUTH_IN_PROGRESS_STORAGE_KEY));
      const hasActiveOAuthAttempt =
        Number.isFinite(oauthStartedAt) &&
        Date.now() - oauthStartedAt < GOOGLE_OAUTH_IN_PROGRESS_MAX_AGE_MS;

      if (hasActiveOAuthAttempt) {
        return '/(tabs)/home/account';
      }

      if (await AsyncStorage.getItem(GOOGLE_CONNECTION_PRESENT_STORAGE_KEY)) {
        return '/(tabs)/chat';
      }

      return '/(tabs)/home/account';
    }
  } catch {
    return isOAuthRedirect ? '/(tabs)/home/account' : '/(tabs)/chat';
  }

  return path;
}
