import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  GoogleAuthProvider,
  OAuthProvider,
  getAdditionalUserInfo,
  reauthenticateWithCredential,
  signInWithCredential,
  updateProfile,
  type AuthCredential,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { auth } from '@/firebaseConfig';
import { FIREBASE_GOOGLE_IOS_CLIENT_ID, FIREBASE_GOOGLE_WEB_CLIENT_ID } from '@/app/context/googleOAuthConfig';

let isGoogleConfigured = false;

function configureGoogleSignIn() {
  if (isGoogleConfigured) {
    return;
  }

  GoogleSignin.configure({
    iosClientId: FIREBASE_GOOGLE_IOS_CLIENT_ID,
    webClientId: FIREBASE_GOOGLE_WEB_CLIENT_ID,
    scopes: ['email', 'profile'],
  });
  isGoogleConfigured = true;
}

async function getGoogleCredential(): Promise<AuthCredential> {
  configureGoogleSignIn();

  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  const googleUser = await GoogleSignin.signIn();
  const tokens = await GoogleSignin.getTokens().catch(() => null);
  const idToken = googleUser.idToken || tokens?.idToken || null;
  const accessToken = tokens?.accessToken || null;

  if (!idToken && !accessToken) {
    throw new Error('Google did not return an identity token.');
  }

  return GoogleAuthProvider.credential(idToken, accessToken);
}

export async function signInWithGoogleAccount(): Promise<UserCredential> {
  return signInWithCredential(auth, await getGoogleCredential());
}

export function isNewAuthUserCredential(userCredential: UserCredential) {
  return getAdditionalUserInfo(userCredential)?.isNewUser === true;
}

export async function reauthenticateWithGoogleAccount(user: User): Promise<UserCredential> {
  try {
    return await reauthenticateWithCredential(user, await getGoogleCredential());
  } catch (error) {
    await GoogleSignin.signOut().catch(() => {});
    throw error;
  }
}

export async function revokeGoogleSignInAccess(expectedGoogleUid?: string) {
  configureGoogleSignIn();

  if (!GoogleSignin.hasPreviousSignIn()) {
    return;
  }

  const currentUser = GoogleSignin.getCurrentUser();
  if (!expectedGoogleUid || currentUser?.user.id !== expectedGoogleUid) {
    await GoogleSignin.signOut();
    return;
  }

  await GoogleSignin.revokeAccess();
}

export async function isAppleSignInAvailable() {
  if (Platform.OS !== 'ios') {
    return false;
  }

  return AppleAuthentication.isAvailableAsync();
}

function getAppleDisplayName(fullName: AppleAuthentication.AppleAuthenticationFullName | null) {
  if (!fullName) {
    return '';
  }

  return [fullName.givenName, fullName.familyName].filter(Boolean).join(' ').trim();
}

export async function signInWithAppleAccount(): Promise<UserCredential> {
  const { credential, displayName } = await getAppleCredential();
  const userCredential = await signInWithCredential(auth, credential);

  if (displayName && !userCredential.user.displayName) {
    await updateProfile(userCredential.user, { displayName }).catch((error) => {
      console.warn('Failed to save Apple profile name', error);
    });
  }

  return userCredential;
}

async function getAppleCredential() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!appleCredential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  const provider = new OAuthProvider('apple.com');
  return {
    authorizationCode: appleCredential.authorizationCode,
    credential: provider.credential({
      idToken: appleCredential.identityToken,
      rawNonce,
    }),
    displayName: getAppleDisplayName(appleCredential.fullName),
  };
}

export async function reauthenticateWithAppleAccount(user: User) {
  const { authorizationCode, credential } = await getAppleCredential();

  if (!authorizationCode) {
    throw new Error('Apple did not return an authorization code.');
  }

  await reauthenticateWithCredential(user, credential);
  return authorizationCode;
}
