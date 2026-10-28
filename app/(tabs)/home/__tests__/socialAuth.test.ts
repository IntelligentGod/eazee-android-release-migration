import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { reauthenticateWithCredential } from 'firebase/auth';
import {
  isNewAuthUserCredential,
  reauthenticateWithAppleAccount,
  reauthenticateWithGoogleAccount,
  revokeGoogleSignInAccess,
} from '../socialAuth';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => undefined),
    signIn: jest.fn(),
    getTokens: jest.fn(),
    hasPreviousSignIn: jest.fn(),
    getCurrentUser: jest.fn(),
    signOut: jest.fn(async () => undefined),
    revokeAccess: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1,
  },
  signInAsync: jest.fn(),
  isAvailableAsync: jest.fn(async () => true),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  randomUUID: jest.fn(() => 'raw-nonce'),
  digestStringAsync: jest.fn(async () => 'hashed-nonce'),
}));

jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: { credential: jest.fn(() => ({ providerId: 'google.com' })) },
  OAuthProvider: jest.fn().mockImplementation(() => ({
    credential: jest.fn(() => ({ providerId: 'apple.com' })),
  })),
  getAdditionalUserInfo: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  signInWithCredential: jest.fn(),
  updateProfile: jest.fn(),
}));

jest.mock('@/firebaseConfig', () => ({ auth: {} }));

jest.mock('@/app/context/googleOAuthConfig', () => ({
  FIREBASE_GOOGLE_IOS_CLIENT_ID: 'ios-client',
  FIREBASE_GOOGLE_WEB_CLIENT_ID: 'web-client',
}));

const mockGoogleSignIn = GoogleSignin.signIn as jest.Mock;
const mockGoogleGetTokens = GoogleSignin.getTokens as jest.Mock;
const mockGoogleHasPreviousSignIn = GoogleSignin.hasPreviousSignIn as jest.Mock;
const mockGoogleGetCurrentUser = GoogleSignin.getCurrentUser as jest.Mock;
const mockGoogleSignOut = GoogleSignin.signOut as jest.Mock;
const mockGoogleRevokeAccess = GoogleSignin.revokeAccess as jest.Mock;
const mockAppleSignIn = AppleAuthentication.signInAsync as jest.Mock;
const mockFirebaseReauthenticate = reauthenticateWithCredential as jest.Mock;
const { getAdditionalUserInfo: mockGetAdditionalUserInfo } = jest.requireMock('firebase/auth');

describe('social account deletion authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGoogleGetTokens.mockResolvedValue({ idToken: null, accessToken: null });
  });

  it('rejects a wrong Google identity and clears the selected Google session', async () => {
    const mismatch = Object.assign(new Error('wrong account'), { code: 'auth/user-mismatch' });
    mockGoogleSignIn.mockResolvedValue({ idToken: 'wrong-google-id-token' });
    mockFirebaseReauthenticate.mockRejectedValueOnce(mismatch);

    await expect(reauthenticateWithGoogleAccount({} as any)).rejects.toBe(mismatch);

    expect(mockGoogleSignOut).toHaveBeenCalled();
  });

  it('revokes only the linked Google login identity', async () => {
    mockGoogleHasPreviousSignIn.mockReturnValue(true);
    mockGoogleGetCurrentUser.mockReturnValue({ user: { id: 'wrong-google-user' } });

    await revokeGoogleSignInAccess('linked-google-user');

    expect(mockGoogleSignOut).toHaveBeenCalled();
    expect(mockGoogleRevokeAccess).not.toHaveBeenCalled();

    jest.clearAllMocks();
    mockGoogleHasPreviousSignIn.mockReturnValue(true);
    mockGoogleGetCurrentUser.mockReturnValue({ user: { id: 'linked-google-user' } });

    await revokeGoogleSignInAccess('linked-google-user');

    expect(mockGoogleRevokeAccess).toHaveBeenCalled();
    expect(mockGoogleSignOut).not.toHaveBeenCalled();
  });

  it('returns the fresh Apple authorization code after reauthentication', async () => {
    const user = {} as any;
    mockAppleSignIn.mockResolvedValue({
      identityToken: 'apple-identity-token',
      authorizationCode: 'fresh-apple-code',
      fullName: null,
    });
    mockFirebaseReauthenticate.mockResolvedValue({});

    await expect(reauthenticateWithAppleAccount(user)).resolves.toBe('fresh-apple-code');
    expect(mockFirebaseReauthenticate).toHaveBeenCalledWith(user, { providerId: 'apple.com' });
  });

  it('detects new social auth users from Firebase credential metadata', () => {
    mockGetAdditionalUserInfo.mockReturnValueOnce({ isNewUser: true });
    expect(isNewAuthUserCredential({} as any)).toBe(true);

    mockGetAdditionalUserInfo.mockReturnValueOnce({ isNewUser: false });
    expect(isNewAuthUserCredential({} as any)).toBe(false);
  });
});
