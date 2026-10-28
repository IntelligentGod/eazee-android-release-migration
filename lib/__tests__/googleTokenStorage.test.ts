import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  clearGoogleTokens,
  GOOGLE_CONNECTION_PRESENT_STORAGE_KEY,
  readGoogleTokens,
  writeGoogleTokens,
} from '@/lib/googleTokenStorage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
  multiRemove: jest.fn(async () => undefined),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

describe('Google token storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedSecureStore.getItemAsync.mockResolvedValue(null);
  });

  it('stores account-scoped tokens in SecureStore', async () => {
    await writeGoogleTokens('user-1', 'access-token', 'refresh-token');

    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(
      'googleTokens.v1',
      JSON.stringify({
        version: 1,
        userId: 'user-1',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    );
    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
      GOOGLE_CONNECTION_PRESENT_STORAGE_KEY,
      '1'
    );
  });

  it('migrates legacy AsyncStorage tokens and removes the plaintext values', async () => {
    mockedAsyncStorage.getItem.mockImplementation(async (key) => {
      if (key === 'googleAccessToken') return 'legacy-access';
      if (key === 'googleRefreshToken') return 'legacy-refresh';
      return null;
    });

    await expect(readGoogleTokens('user-1')).resolves.toEqual({
      accessToken: 'legacy-access',
      refreshToken: 'legacy-refresh',
    });
    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(
      'googleTokens.v1',
      JSON.stringify({
        version: 1,
        userId: 'user-1',
        accessToken: 'legacy-access',
        refreshToken: 'legacy-refresh',
      })
    );
    expect(mockedAsyncStorage.multiRemove).toHaveBeenCalledWith([
      'googleAccessToken',
      'googleRefreshToken',
    ]);
  });

  it('clears the account-scoped tokens and connection marker', async () => {
    await clearGoogleTokens('user-1');

    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith('googleTokens.v1');
    expect(mockedAsyncStorage.multiRemove).toHaveBeenCalledWith([
      'googleAccessToken',
      'googleRefreshToken',
    ]);
    expect(mockedAsyncStorage.removeItem).toHaveBeenCalledWith(
      GOOGLE_CONNECTION_PRESENT_STORAGE_KEY
    );
  });

  it('does not clear another account token record', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValue(JSON.stringify({
      version: 1,
      userId: 'user-2',
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    }));

    await clearGoogleTokens('user-1');

    expect(mockedSecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(mockedAsyncStorage.removeItem).not.toHaveBeenCalledWith(
      GOOGLE_CONNECTION_PRESENT_STORAGE_KEY
    );
  });
});
