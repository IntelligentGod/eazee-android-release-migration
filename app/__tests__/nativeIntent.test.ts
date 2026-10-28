import AsyncStorage from '@react-native-async-storage/async-storage';
import { redirectSystemPath } from '../+native-intent';
import {
  GOOGLE_OAUTH_IN_PROGRESS_STORAGE_KEY,
} from '../context/googleOAuthConfig';
import { GOOGLE_CONNECTION_PRESENT_STORAGE_KEY } from '@/lib/googleTokenStorage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('native intent redirects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    mockedAsyncStorage.getItem.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps active Google OAuth callbacks on the account screen', async () => {
    mockedAsyncStorage.getItem.mockImplementation(async (key) => {
      if (key === GOOGLE_OAUTH_IN_PROGRESS_STORAGE_KEY) return String(1_000_000);
      if (key === GOOGLE_CONNECTION_PRESENT_STORAGE_KEY) return '1';
      return null;
    });

    await expect(
      redirectSystemPath({
        path: 'com.eazee.ai:/oauthredirect?code=auth-code',
        initial: true,
      })
    ).resolves.toBe('/(tabs)/home/account');
  });

  it('sends stale Google OAuth callbacks to the default tab after connection exists', async () => {
    mockedAsyncStorage.getItem.mockImplementation(async (key) => {
      if (key === GOOGLE_CONNECTION_PRESENT_STORAGE_KEY) return '1';
      return null;
    });

    await expect(
      redirectSystemPath({
        path: 'com.eazee.ai:/oauthredirect?code=auth-code',
        initial: true,
      })
    ).resolves.toBe('/(tabs)/chat');
  });

  it('leaves non-OAuth paths unchanged', async () => {
    await expect(
      redirectSystemPath({
        path: '/(tabs)/calendar',
        initial: true,
      })
    ).resolves.toBe('/(tabs)/calendar');
  });

  it('keeps OAuth callbacks recoverable if storage cannot be read', async () => {
    mockedAsyncStorage.getItem.mockRejectedValue(new Error('storage unavailable'));

    await expect(
      redirectSystemPath({
        path: 'com.eazee.ai:/oauthredirect?code=auth-code',
        initial: true,
      })
    ).resolves.toBe('/(tabs)/home/account');
  });
});
