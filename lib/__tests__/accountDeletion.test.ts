import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { reload, signOut } from 'firebase/auth';
import { auth } from '@/firebaseConfig';
import { revokeGoogleSignInAccess } from '@/app/(tabs)/home/socialAuth';
import {
  AccountDeletedLocalCleanupError,
  AccountDeletionUnconfirmedError,
  deleteAccount,
  finishPendingAccountDeletion,
  hasPendingAccountDeletion,
} from '../accountDeletion';

const mockStorage = new Map<string, string>();
const mockSecureStorage = new Map<string, string>();
const mockDestroyFirstCollection = jest.fn(async () => undefined);
const mockDestroySecondCollection = jest.fn(async () => undefined);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStorage.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockStorage.delete(key);
  }),
  getAllKeys: jest.fn(async () => [...mockStorage.keys()]),
  multiRemove: jest.fn(async (keys: string[]) => {
    keys.forEach((key) => mockStorage.delete(key));
  }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStorage.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStorage.delete(key);
  }),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  readDirectoryAsync: jest.fn(async () => ['chat-voice-one.wav', 'keep.txt']),
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-notifications', () => ({
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  dismissAllNotificationsAsync: jest.fn(async () => undefined),
  setBadgeCountAsync: jest.fn(async () => true),
}));

jest.mock('firebase/auth', () => ({
  reload: jest.fn(),
  signOut: jest.fn(async () => undefined),
}));

jest.mock('@/firebaseConfig', () => ({
  auth: { currentUser: null },
}));

jest.mock('@/database/database', () => ({
  getActiveDatabaseName: jest.fn(() => 'NotesApp'),
  setActiveDatabaseName: jest.fn(),
  database: {
    collections: {
      map: {
        first: { query: () => ({ destroyAllPermanently: mockDestroyFirstCollection }) },
        second: { query: () => ({ destroyAllPermanently: mockDestroySecondCollection }) },
      },
    },
    write: jest.fn(async (work: () => Promise<void>) => work()),
  },
}));

jest.mock('@/app/(tabs)/home/socialAuth', () => ({
  revokeGoogleSignInAccess: jest.fn(async () => undefined),
}));

const mockedReload = reload as jest.MockedFunction<typeof reload>;
const mockedSignOut = signOut as jest.MockedFunction<typeof signOut>;
const mockedRevokeGoogleSignInAccess = revokeGoogleSignInAccess as jest.MockedFunction<typeof revokeGoogleSignInAccess>;
const mockedDeleteFile = FileSystem.deleteAsync as jest.MockedFunction<typeof FileSystem.deleteAsync>;
const mockedCancelNotifications = Notifications.cancelAllScheduledNotificationsAsync as jest.MockedFunction<
  typeof Notifications.cancelAllScheduledNotificationsAsync
>;

const user = {
  uid: 'firebase-user',
  providerData: [{ providerId: 'google.com', uid: 'linked-google-user' }],
  getIdToken: jest.fn(async () => 'fresh-firebase-token'),
} as any;

const response = (body: unknown, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  json: jest.fn(async () => body),
});

const storedState = (status: 'remotePending' | 'remoteDeleted') => JSON.stringify({
  version: 2,
  status,
  uid: 'firebase-user',
  recoveryToken: 'recovery-token',
  googleProviderUid: 'linked-google-user',
  databaseName: 'NotesApp',
});

describe('account deletion', () => {
  beforeEach(() => {
    mockStorage.clear();
    mockSecureStorage.clear();
    mockStorage.set('googleRefreshToken', 'google-refresh-token');
    jest.clearAllMocks();
    user.getIdToken.mockResolvedValue('fresh-firebase-token');
    (auth as any).currentUser = null;
    mockedReload.mockResolvedValue(undefined);
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ recoveryToken: 'recovery-token' }))
      .mockResolvedValueOnce(response({ deleted: true }))
      .mockResolvedValueOnce(response({})) as any;
  });

  it('creates a recovery intent and marks confirmed remote deletion without clearing mounted device data', async () => {
    await deleteAccount(user, { appleAuthorizationCode: 'apple-code' });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/account/deletion-intent'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/account$/),
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({
          recoveryToken: 'recovery-token',
          appleAuthorizationCode: 'apple-code',
        }),
      })
    );
    expect(mockStorage.get('accountDeletion:v1')).toBe(storedState('remoteDeleted'));
    expect(mockedRevokeGoogleSignInAccess).not.toHaveBeenCalled();
    expect(mockedSignOut).not.toHaveBeenCalled();
    expect(mockDestroyFirstCollection).not.toHaveBeenCalled();
  });

  it('does not revoke Google when the backend rejects deletion and status confirms the account exists', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ recoveryToken: 'recovery-token' }))
      .mockResolvedValueOnce(response({ error: 'Account deletion failed' }, false, 500))
      .mockResolvedValueOnce(response({ deleted: false })) as any;

    await expect(deleteAccount(user, {})).rejects.toThrow(
      'Account deletion failed'
    );

    expect(mockedRevokeGoogleSignInAccess).not.toHaveBeenCalled();
    expect(mockStorage.has('googleRefreshToken')).toBe(true);
    expect(mockStorage.has('accountDeletion:v1')).toBe(false);
    expect(mockDestroyFirstCollection).not.toHaveBeenCalled();
  });

  it('treats a 500 as ambiguous and marks remote deletion when signed status confirms deletion', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ recoveryToken: 'recovery-token' }))
      .mockResolvedValueOnce(response({ error: 'Account deletion failed' }, false, 500))
      .mockResolvedValueOnce(response({ deleted: true }))
      .mockResolvedValueOnce(response({})) as any;

    await expect(deleteAccount(user, {})).resolves.toBeUndefined();

    expect(mockStorage.get('accountDeletion:v1')).toBe(storedState('remoteDeleted'));
    expect(mockDestroyFirstCollection).not.toHaveBeenCalled();
    expect(mockedRevokeGoogleSignInAccess).not.toHaveBeenCalled();
  });

  it('keeps the pending marker when deletion status cannot be confirmed', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ recoveryToken: 'recovery-token' }))
      .mockRejectedValueOnce(new Error('network failed'))
      .mockRejectedValueOnce(new Error('status unavailable')) as any;

    await expect(deleteAccount(user, {})).rejects.toBeInstanceOf(
      AccountDeletionUnconfirmedError
    );

    expect(mockStorage.get('accountDeletion:v1')).toBe(storedState('remotePending'));
    expect(mockedRevokeGoogleSignInAccess).not.toHaveBeenCalled();
  });

  it('does not leave a deletion marker when creating the intent is canceled', async () => {
    user.getIdToken.mockRejectedValueOnce(Object.assign(new Error('canceled'), { code: 'SIGN_IN_CANCELLED' }));

    await expect(deleteAccount(user, {})).rejects.toMatchObject({
      code: 'SIGN_IN_CANCELLED',
    });

    expect(global.fetch).not.toHaveBeenCalled();
    await expect(hasPendingAccountDeletion()).resolves.toBe(false);
  });

  it('does not revoke Google or save a marker when creating the deletion intent fails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ error: 'Recent authentication required' }, false, 401)) as any;

    await expect(deleteAccount(user, {})).rejects.toThrow(
      'Recent authentication required'
    );

    expect(mockedRevokeGoogleSignInAccess).not.toHaveBeenCalled();
    expect(mockStorage.has('accountDeletion:v1')).toBe(false);
  });

  it('recovers a pending deletion without a Firebase session using the signed status token', async () => {
    mockStorage.set('accountDeletion:v1', storedState('remotePending'));
    const clearTokenState = jest.fn(async () => undefined);
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ deleted: true }))
      .mockResolvedValueOnce(response({})) as any;

    await expect(finishPendingAccountDeletion(clearTokenState)).resolves.toBe(true);

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/account/deletion-status'),
      expect.objectContaining({
        headers: { 'x-account-deletion-recovery-token': 'recovery-token' },
      })
    );
    expect(clearTokenState).toHaveBeenCalled();
    expect(mockDestroyFirstCollection).toHaveBeenCalled();
    expect(mockStorage.size).toBe(0);
    expect(mockSecureStorage.size).toBe(0);
  });

  it('clears a pending marker when signed status confirms the account still exists', async () => {
    mockStorage.set('accountDeletion:v1', storedState('remotePending'));
    global.fetch = jest.fn().mockResolvedValueOnce(response({ deleted: false })) as any;

    await expect(finishPendingAccountDeletion()).resolves.toBe(false);

    expect(mockDestroyFirstCollection).not.toHaveBeenCalled();
    expect(mockStorage.has('accountDeletion:v1')).toBe(false);
  });

  it('does not permanently lock on a legacy pending marker with no Firebase session', async () => {
    mockStorage.set('accountDeletion:v1', 'remotePending');

    await expect(finishPendingAccountDeletion()).resolves.toBe(false);

    expect(mockDestroyFirstCollection).not.toHaveBeenCalled();
    expect(mockStorage.has('accountDeletion:v1')).toBe(false);
  });

  it('revokes legacy Google access while recovering a deleted account without a Firebase session', async () => {
    mockStorage.set('accountDeletion:v1', 'remoteDeleted');
    global.fetch = jest.fn().mockResolvedValueOnce(response({})) as any;

    await expect(finishPendingAccountDeletion()).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('token=google-refresh-token'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(mockStorage.size).toBe(0);
  });

  it('uses only user-not-found as deletion proof for a legacy pending marker', async () => {
    mockStorage.set('accountDeletion:v1', 'remotePending');
    (auth as any).currentUser = user;
    mockedReload.mockRejectedValueOnce({ code: 'auth/invalid-user-token' });

    await expect(finishPendingAccountDeletion()).rejects.toBeInstanceOf(AccountDeletionUnconfirmedError);

    expect(mockDestroyFirstCollection).not.toHaveBeenCalled();
    expect(mockStorage.get('accountDeletion:v1')).toBe('remotePending');
  });

  it('keeps a retry marker when mandatory database cleanup fails', async () => {
    mockDestroyFirstCollection.mockRejectedValueOnce(new Error('database failed'));
    await deleteAccount(user, {});

    await expect(finishPendingAccountDeletion()).rejects.toBeInstanceOf(
      AccountDeletedLocalCleanupError
    );

    expect(mockStorage.get('accountDeletion:v1')).toBe(storedState('remoteDeleted'));
    expect(mockedSignOut).not.toHaveBeenCalled();
  });

  it('keeps a retry marker when voice-file deletion fails', async () => {
    mockedDeleteFile.mockRejectedValueOnce(new Error('voice delete failed'));
    await deleteAccount(user, {});

    await expect(finishPendingAccountDeletion()).rejects.toBeInstanceOf(
      AccountDeletedLocalCleanupError
    );

    expect(mockStorage.get('accountDeletion:v1')).toBe(storedState('remoteDeleted'));
    expect(mockedSignOut).not.toHaveBeenCalled();
  });

  it('keeps a retry marker when Firebase sign-out fails', async () => {
    mockedSignOut.mockRejectedValueOnce(new Error('sign out failed'));
    await deleteAccount(user, {});

    await expect(finishPendingAccountDeletion()).rejects.toBeInstanceOf(
      AccountDeletedLocalCleanupError
    );

    expect(mockStorage.get('accountDeletion:v1')).toBe(storedState('remoteDeleted'));
  });

  it('does not block core cleanup when notification cleanup fails', async () => {
    mockedCancelNotifications.mockRejectedValueOnce(new Error('notification cleanup failed'));
    await deleteAccount(user, {});

    await expect(finishPendingAccountDeletion()).resolves.toBe(true);

    expect(mockDestroyFirstCollection).toHaveBeenCalled();
    expect(mockStorage.size).toBe(0);
  });

  it('keeps a retry marker when Google revocation fails', async () => {
    mockedRevokeGoogleSignInAccess.mockRejectedValueOnce(new Error('native Google revoke failed'));
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ recoveryToken: 'recovery-token' }))
      .mockResolvedValueOnce(response({ deleted: true }))
      .mockRejectedValueOnce(new Error('connected Google revoke failed')) as any;

    await expect(deleteAccount(user, {})).resolves.toBeUndefined();
    await expect(finishPendingAccountDeletion()).rejects.toBeInstanceOf(AccountDeletedLocalCleanupError);

    expect(mockedRevokeGoogleSignInAccess).toHaveBeenCalledWith('linked-google-user');
    expect(mockDestroyFirstCollection).not.toHaveBeenCalled();
    expect(mockStorage.get('accountDeletion:v1')).toBe(storedState('remoteDeleted'));
  });

  it('retries native Google revocation without resending a revoked connected token', async () => {
    mockedRevokeGoogleSignInAccess.mockRejectedValueOnce(new Error('native Google revoke failed'));
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ recoveryToken: 'recovery-token' }))
      .mockResolvedValueOnce(response({ deleted: true }))
      .mockResolvedValueOnce(response({})) as any;

    await deleteAccount(user, {});
    await expect(finishPendingAccountDeletion()).rejects.toBeInstanceOf(AccountDeletedLocalCleanupError);
    await expect(finishPendingAccountDeletion()).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(mockedRevokeGoogleSignInAccess).toHaveBeenCalledTimes(2);
    expect(mockStorage.size).toBe(0);
  });

  it('treats a Google revoke HTTP failure as retryable cleanup failure', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ recoveryToken: 'recovery-token' }))
      .mockResolvedValueOnce(response({ deleted: true }))
      .mockResolvedValueOnce(response({ error: 'temporarily_unavailable' }, false, 503)) as any;

    await deleteAccount(user, {});
    await expect(finishPendingAccountDeletion()).rejects.toBeInstanceOf(AccountDeletedLocalCleanupError);

    expect(mockDestroyFirstCollection).not.toHaveBeenCalled();
    expect(mockStorage.get('accountDeletion:v1')).toBe(storedState('remoteDeleted'));
  });

  it('treats Google invalid_token as already revoked', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ recoveryToken: 'recovery-token' }))
      .mockResolvedValueOnce(response({ deleted: true }))
      .mockResolvedValueOnce(response({ error: 'invalid_token' }, false, 400)) as any;

    await deleteAccount(user, {});
    await expect(finishPendingAccountDeletion()).resolves.toBe(true);

    expect(mockDestroyFirstCollection).toHaveBeenCalled();
    expect(mockStorage.size).toBe(0);
  });
});
