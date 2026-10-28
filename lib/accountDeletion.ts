import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { reload, signOut, type User } from 'firebase/auth';
import { database, getActiveDatabaseName, setActiveDatabaseName } from '@/database/database';
import { auth } from '@/firebaseConfig';
import { getFirebaseAppCheckHeaders } from '@/lib/firebaseAppCheck';
import { SERVER_URL } from '@/config/backend';
import { revokeGoogleSignInAccess } from '@/app/(tabs)/home/socialAuth';
import { clearGoogleTokens, readGoogleRefreshTokenForCleanup } from '@/lib/googleTokenStorage';

const ACCOUNT_DELETION_STATE_KEY = 'accountDeletion:v1';
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const VOICE_MESSAGE_PREFIX = 'chat-voice-';
const CLEANUP_TIMEOUT_MS = 5000;

type AccountDeletionStatus = 'remotePending' | 'remoteDeleted';

type AccountDeletionState = {
  version: 2;
  status: AccountDeletionStatus;
  uid: string;
  recoveryToken: string;
  googleProviderUid?: string;
  databaseName?: string;
};

type LegacyAccountDeletionState = {
  version: 1;
  status: AccountDeletionStatus;
};

type StoredAccountDeletionState = AccountDeletionState | LegacyAccountDeletionState;

type DeleteAccountOptions = {
  appleAuthorizationCode?: string;
};

export class AccountDeletedLocalCleanupError extends Error {
  constructor() {
    super('Your account was deleted, but device cleanup did not finish. Retry to complete cleanup.');
    this.name = 'AccountDeletedLocalCleanupError';
  }
}

export class AccountDeletionUnconfirmedError extends Error {
  constructor() {
    super('Account deletion could not be confirmed. Your data remains on this device.');
    this.name = 'AccountDeletionUnconfirmedError';
  }
}

const isDeletedFirebaseUserError = (error: unknown) => {
  const code = String((error as { code?: string })?.code || '');
  return code === 'auth/user-not-found';
};

async function saveDeletionState(state: StoredAccountDeletionState) {
  await AsyncStorage.setItem(ACCOUNT_DELETION_STATE_KEY, JSON.stringify(state));
}

async function readDeletionState(): Promise<StoredAccountDeletionState | null> {
  const rawState = await AsyncStorage.getItem(ACCOUNT_DELETION_STATE_KEY);
  if (!rawState) {
    return null;
  }

  if (rawState === 'remotePending' || rawState === 'remoteDeleted') {
    return { version: 1, status: rawState };
  }

  try {
    const state = JSON.parse(rawState) as Partial<AccountDeletionState>;
    if (
      state.version === 2 &&
      (state.status === 'remotePending' || state.status === 'remoteDeleted') &&
      typeof state.uid === 'string' &&
      typeof state.recoveryToken === 'string'
    ) {
      return state as AccountDeletionState;
    }
  } catch {}

  await AsyncStorage.removeItem(ACCOUNT_DELETION_STATE_KEY);
  return null;
}

export async function hasPendingAccountDeletion() {
  return (await readDeletionState()) !== null;
}

async function runCleanupWithTimeout(cleanup: () => Promise<unknown>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(cleanup),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Cleanup timed out')), CLEANUP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function runBestEffort(cleanups: (() => Promise<unknown>)[]) {
  await Promise.allSettled(cleanups.map(runCleanupWithTimeout));
}

async function revokeConnectedGoogleAccess(userId?: string) {
  const refreshToken = await readGoogleRefreshTokenForCleanup(userId);
  if (!refreshToken) {
    await clearGoogleTokens(userId);
    return;
  }

  const response = await fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(refreshToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const body = response.ok ? null : await response.json().catch(() => null);
  if (!response.ok && body?.error !== 'invalid_token') {
    throw new Error(`Google OAuth revocation failed with status ${response.status}`);
  }
  await clearGoogleTokens(userId);
}

async function revokeGoogleAccess(userId: string | undefined, googleProviderUid?: string) {
  const results = await Promise.allSettled([
    () => revokeConnectedGoogleAccess(userId),
    () => revokeGoogleSignInAccess(googleProviderUid),
  ].map(runCleanupWithTimeout));
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) {
    throw failure.reason;
  }
}

async function deleteVoiceMessageFiles() {
  const directories = Array.from(new Set([FileSystem.documentDirectory, FileSystem.cacheDirectory].filter(Boolean)));

  await Promise.all(directories.map(async (directory) => {
    const names = await FileSystem.readDirectoryAsync(directory!);
    await Promise.all(
      names
        .filter((name) => name.startsWith(VOICE_MESSAGE_PREFIX) && name.endsWith('.wav'))
        .map((name) => FileSystem.deleteAsync(`${directory}${name}`, { idempotent: true }))
    );
  }));
}

async function deleteLocalDatabase() {
  await database.write(async () => {
    for (const collection of Object.values(database.collections.map)) {
      await collection.query().destroyAllPermanently();
    }
  }, 'delete account local database');
}

async function clearAsyncStorageExceptDeletionState() {
  const keys = await AsyncStorage.getAllKeys();
  const keysToRemove = keys.filter((key) => key !== ACCOUNT_DELETION_STATE_KEY);
  if (keysToRemove.length > 0) {
    await AsyncStorage.multiRemove(keysToRemove);
  }
}

async function clearDeviceData(state: StoredAccountDeletionState, clearTokenState: () => Promise<void>) {
  if (state.version === 2 && state.databaseName) {
    setActiveDatabaseName(state.databaseName);
  }

  await revokeGoogleAccess(
    state.version === 2 ? state.uid : auth.currentUser?.uid,
    state.version === 2 ? state.googleProviderUid : undefined
  );
  await deleteLocalDatabase();
  await clearAsyncStorageExceptDeletionState();
  await deleteVoiceMessageFiles();
  await clearTokenState();
  await signOut(auth);

  await runBestEffort([
    Notifications.cancelAllScheduledNotificationsAsync,
    Notifications.dismissAllNotificationsAsync,
    () => Notifications.setBadgeCountAsync(0),
  ]);
  await AsyncStorage.removeItem(ACCOUNT_DELETION_STATE_KEY);
}

async function createDeletionIntent(user: User) {
  const firebaseIdToken = await user.getIdToken(true);
  const response = await fetch(`${SERVER_URL}/account/deletion-intent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${firebaseIdToken}`,
      'Content-Type': 'application/json',
      ...await getFirebaseAppCheckHeaders(),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.recoveryToken !== 'string') {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Account deletion could not start');
  }
  return { firebaseIdToken, recoveryToken: body.recoveryToken };
}

async function callDeleteAccount(
  firebaseIdToken: string,
  recoveryToken: string,
  appleAuthorizationCode?: string
) {
  const response = await fetch(`${SERVER_URL}/account`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${firebaseIdToken}`,
      'Content-Type': 'application/json',
      ...await getFirebaseAppCheckHeaders(),
    },
    body: JSON.stringify({
      recoveryToken,
      ...(appleAuthorizationCode ? { appleAuthorizationCode } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : `ACCOUNT_DELETE_HTTP_${response.status}`);
  }
}

async function confirmRemoteDeletion(state: StoredAccountDeletionState, user?: User | null) {
  if (state.version === 2) {
    const response = await fetch(`${SERVER_URL}/account/deletion-status`, {
      method: 'GET',
      headers: {
        'x-account-deletion-recovery-token': state.recoveryToken,
        ...await getFirebaseAppCheckHeaders(),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.deleted !== 'boolean') {
      throw new AccountDeletionUnconfirmedError();
    }
    return body.deleted;
  }

  if (!user) {
    return false;
  }

  try {
    await reload(user);
    return false;
  } catch (error) {
    if (isDeletedFirebaseUserError(error)) {
      return true;
    }
    throw new AccountDeletionUnconfirmedError();
  }
}

async function finishLocalDeletion(state: StoredAccountDeletionState, clearTokenState: () => Promise<void>) {
  const deletedState = { ...state, status: 'remoteDeleted' as const };
  await saveDeletionState(deletedState);
  try {
    await clearDeviceData(deletedState, clearTokenState);
  } catch {
    await saveDeletionState(deletedState).catch(() => {});
    throw new AccountDeletedLocalCleanupError();
  }
}

export async function deleteAccount(user: User, options: DeleteAccountOptions) {
  const { firebaseIdToken, recoveryToken } = await createDeletionIntent(user);
  const state: AccountDeletionState = {
    version: 2,
    status: 'remotePending',
    uid: user.uid,
    recoveryToken,
    googleProviderUid: user.providerData.find((provider) => provider.providerId === 'google.com')?.uid,
    databaseName: getActiveDatabaseName(),
  };

  await saveDeletionState(state);
  try {
    await callDeleteAccount(firebaseIdToken, recoveryToken, options.appleAuthorizationCode);
  } catch (error) {
    let wasDeleted = false;
    try {
      wasDeleted = await confirmRemoteDeletion(state, user);
    } catch {
      throw new AccountDeletionUnconfirmedError();
    }

    if (!wasDeleted) {
      await AsyncStorage.removeItem(ACCOUNT_DELETION_STATE_KEY);
      throw error;
    }
  }

  await saveDeletionState({ ...state, status: 'remoteDeleted' });
}

export async function finishPendingAccountDeletion(clearTokenState: () => Promise<void> = async () => {}) {
  const state = await readDeletionState();
  if (!state) {
    return false;
  }

  if (state.status === 'remotePending') {
    const wasDeleted = await confirmRemoteDeletion(state, auth.currentUser);
    if (!wasDeleted) {
      await AsyncStorage.removeItem(ACCOUNT_DELETION_STATE_KEY);
      return false;
    }
  }

  await finishLocalDeletion(state, clearTokenState);
  return true;
}
