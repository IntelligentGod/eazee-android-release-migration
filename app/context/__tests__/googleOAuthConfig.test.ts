import { Platform } from 'react-native';
import {
  FIREBASE_GOOGLE_IOS_CLIENT_ID,
  FIREBASE_GOOGLE_WEB_CLIENT_ID,
  getGoogleOAuthClientId,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_SCOPES,
  GOOGLE_WEB_CLIENT_ID,
} from '../googleOAuthConfig';

const originalPlatformOS = Platform.OS;

const setPlatformOS = (os: typeof Platform.OS) => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => os,
  });
};

describe('googleOAuthConfig', () => {
  afterEach(() => {
    setPlatformOS(originalPlatformOS);
  });

  it('uses the iOS client id on iOS', () => {
    setPlatformOS('ios');

    expect(getGoogleOAuthClientId()).toBe(GOOGLE_IOS_CLIENT_ID);
  });

  it('uses the Android client id outside iOS', () => {
    setPlatformOS('android');

    expect(getGoogleOAuthClientId()).toBe(GOOGLE_ANDROID_CLIENT_ID);
  });

  it('keeps the Firebase web client id available for native Google sign-in', () => {
    expect(GOOGLE_WEB_CLIENT_ID).toBe('66318687320-t4kcjaqjmmi6pgctleub3ca7bhfhlmvv.apps.googleusercontent.com');
    expect(FIREBASE_GOOGLE_WEB_CLIENT_ID).toBe(GOOGLE_WEB_CLIENT_ID);
  });

  it('uses the same iOS client for Firebase Google login and Google Calendar connect', () => {
    expect(FIREBASE_GOOGLE_IOS_CLIENT_ID).toBe('66318687320-4nm86m63fits0ph84p1hg6tghg04jf4c.apps.googleusercontent.com');
    expect(FIREBASE_GOOGLE_IOS_CLIENT_ID).toBe(GOOGLE_IOS_CLIENT_ID);
  });

  it('requests calendar access only', () => {
    expect(GOOGLE_SCOPES).toEqual(['https://www.googleapis.com/auth/calendar']);
  });
});
