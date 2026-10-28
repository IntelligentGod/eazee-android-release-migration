import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { refreshAsync } from 'expo-auth-session';
import { Platform } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { auth } from '@/firebaseConfig';
import { useAuthSession } from '../AuthSessionContext';
import { getGoogleConnectionStatusStatic, TokenProvider, useTokens } from '../TokenContext';
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_TOKEN_ENDPOINT,
} from '../googleOAuthConfig';

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

jest.mock('expo-auth-session', () => ({
  refreshAsync: jest.fn(),
}));

jest.mock('../AuthSessionContext', () => ({
  useAuthSession: jest.fn(),
}));

jest.mock('@/firebaseConfig', () => ({
  auth: { currentUser: { uid: 'user-1' } },
}));

const originalPlatformOS = Platform.OS;
const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const mockedRefreshAsync = refreshAsync as jest.MockedFunction<typeof refreshAsync>;
const mockedUseAuthSession = useAuthSession as jest.MockedFunction<typeof useAuthSession>;

const setPlatformOS = (os: typeof Platform.OS) => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => os,
  });
};

describe('TokenContext Google token refresh', () => {
  beforeEach(() => {
    setPlatformOS('ios');
    jest.clearAllMocks();
    mockedSecureStore.getItemAsync.mockResolvedValue(JSON.stringify({
      version: 1,
      userId: 'user-1',
      accessToken: null,
      refreshToken: 'stored-refresh-token',
    }));
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedRefreshAsync.mockResolvedValue({
      accessToken: 'refreshed-access-token',
      tokenType: 'bearer',
      issuedAt: 0,
    } as any);
    mockedUseAuthSession.mockReturnValue({ user: null, isLoading: false } as any);
  });

  afterEach(() => {
    setPlatformOS(originalPlatformOS);
  });

  it('refreshes stored iOS Google tokens with the iOS client id', async () => {
    const status = await getGoogleConnectionStatusStatic('user-1');

    expect(mockedRefreshAsync).toHaveBeenCalledWith(
      {
        clientId: GOOGLE_IOS_CLIENT_ID,
        refreshToken: 'stored-refresh-token',
      },
      { tokenEndpoint: GOOGLE_TOKEN_ENDPOINT }
    );
    expect(JSON.parse(String(mockedSecureStore.setItemAsync.mock.calls[0][1]))).toEqual({
      version: 1,
      userId: 'user-1',
      accessToken: 'refreshed-access-token',
      refreshToken: 'stored-refresh-token',
    });
    expect(status).toEqual({
      isConnected: true,
      isActive: true,
      accessToken: 'refreshed-access-token',
      refreshToken: 'stored-refresh-token',
    });
  });

  it('refreshes stored Android Google tokens with the Android client id', async () => {
    setPlatformOS('android');

    const status = await getGoogleConnectionStatusStatic('user-1');

    expect(mockedRefreshAsync).toHaveBeenCalledWith(
      {
        clientId: GOOGLE_ANDROID_CLIENT_ID,
        refreshToken: 'stored-refresh-token',
      },
      { tokenEndpoint: GOOGLE_TOKEN_ENDPOINT }
    );
    expect(status).toMatchObject({
      isConnected: true,
      isActive: true,
      accessToken: 'refreshed-access-token',
    });
  });
});

describe('TokenProvider account isolation', () => {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  let tokenContext: ReturnType<typeof useTokens>;

  const renderProvider = async () => {
    const Harness = () => {
      tokenContext = useTokens();
      return null;
    };

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(
        TokenProvider,
        null,
        React.createElement(Harness)
      ));
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue(undefined);
    mockedAsyncStorage.removeItem.mockResolvedValue(undefined);
    mockedAsyncStorage.multiRemove.mockResolvedValue(undefined);
    mockedSecureStore.getItemAsync.mockResolvedValue(null);
    mockedSecureStore.setItemAsync.mockResolvedValue(undefined);
    mockedSecureStore.deleteItemAsync.mockResolvedValue(undefined);
    mockedUseAuthSession.mockReturnValue({ user: { uid: 'user-1' }, isLoading: false } as any);
    (auth as any).currentUser = { uid: 'user-1' };
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
    renderer = null;
  });

  it('does not report a connection when encrypted token persistence fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedSecureStore.setItemAsync.mockRejectedValueOnce(new Error('secure storage unavailable'));
    await renderProvider();

    await act(async () => {
      await expect(tokenContext.setTokens('access-token', 'refresh-token')).rejects.toThrow(
        'secure storage unavailable'
      );
    });

    expect(tokenContext.accessToken).toBeNull();
    expect(tokenContext.refreshToken).toBeNull();
    expect(tokenContext.googleConnectionState).toBe('disconnected');
    consoleError.mockRestore();
  });

  it('waits for logout cleanup before storing tokens for a newly signed-in account', async () => {
    let resolveCleanup!: () => void;
    const cleanupPromise = new Promise<void>((resolve) => {
      resolveCleanup = resolve;
    });
    await renderProvider();
    mockedSecureStore.deleteItemAsync.mockImplementationOnce(() => cleanupPromise);

    mockedUseAuthSession.mockReturnValue({ user: null, isLoading: false } as any);
    (auth as any).currentUser = null;
    await act(async () => {
      renderer?.update(React.createElement(TokenProvider, null, React.createElement(React.Fragment)));
    });

    mockedUseAuthSession.mockReturnValue({ user: { uid: 'user-2' }, isLoading: false } as any);
    (auth as any).currentUser = { uid: 'user-2' };
    await act(async () => {
      renderer?.update(React.createElement(
        TokenProvider,
        null,
        React.createElement(TokenCapture, { onChange: (value) => { tokenContext = value; } })
      ));
    });

    const savePromise = tokenContext.setTokens('user-2-access', 'user-2-refresh');
    expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();

    await act(async () => {
      resolveCleanup();
      await savePromise;
    });

    expect(JSON.parse(String(mockedSecureStore.setItemAsync.mock.calls[0][1]))).toMatchObject({
      userId: 'user-2',
      accessToken: 'user-2-access',
      refreshToken: 'user-2-refresh',
    });
    expect(tokenContext.googleConnectionState).toBe('connected');
  });

  it('waits for direct account-switch cleanup before storing the new account tokens', async () => {
    let resolveCleanup!: () => void;
    const cleanupPromise = new Promise<void>((resolve) => {
      resolveCleanup = resolve;
    });
    await renderProvider();
    mockedSecureStore.deleteItemAsync.mockImplementationOnce(() => cleanupPromise);

    mockedUseAuthSession.mockReturnValue({ user: { uid: 'user-2' }, isLoading: false } as any);
    (auth as any).currentUser = { uid: 'user-2' };
    await act(async () => {
      renderer?.update(React.createElement(
        TokenProvider,
        null,
        React.createElement(TokenCapture, { onChange: (value) => { tokenContext = value; } })
      ));
    });

    const savePromise = tokenContext.setTokens('user-2-access', 'user-2-refresh');
    expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled();

    await act(async () => {
      resolveCleanup();
      await savePromise;
    });

    expect(JSON.parse(String(mockedSecureStore.setItemAsync.mock.calls[0][1]))).toMatchObject({
      userId: 'user-2',
      accessToken: 'user-2-access',
      refreshToken: 'user-2-refresh',
    });
    expect(tokenContext.googleConnectionState).toBe('connected');
  });

  it('starts a fresh status request when the same account returns during an older request', async () => {
    let resolveInitialStatus!: (value: string | null) => void;
    const initialStatusPromise = new Promise<string | null>((resolve) => {
      resolveInitialStatus = resolve;
    });
    mockedSecureStore.getItemAsync
      .mockImplementationOnce(() => initialStatusPromise)
      .mockResolvedValue(null);

    await renderProvider();

    mockedUseAuthSession.mockReturnValue({ user: null, isLoading: false } as any);
    (auth as any).currentUser = null;
    await act(async () => {
      renderer?.update(React.createElement(TokenProvider, null, React.createElement(React.Fragment)));
    });

    mockedUseAuthSession.mockReturnValue({ user: { uid: 'user-1' }, isLoading: false } as any);
    (auth as any).currentUser = { uid: 'user-1' };
    await act(async () => {
      renderer?.update(React.createElement(
        TokenProvider,
        null,
        React.createElement(TokenCapture, { onChange: (value) => { tokenContext = value; } })
      ));
    });

    expect(mockedSecureStore.getItemAsync).toHaveBeenCalledTimes(4);
    expect(tokenContext.isLoading).toBe(false);
    expect(tokenContext.isGoogleConnectionLoading).toBe(false);

    await act(async () => {
      resolveInitialStatus(null);
      await initialStatusPromise;
    });

    expect(tokenContext.isLoading).toBe(false);
    expect(tokenContext.isGoogleConnectionLoading).toBe(false);
  });
});

function TokenCapture({ onChange }: { onChange: (value: ReturnType<typeof useTokens>) => void }) {
  onChange(useTokens());
  return null;
}
