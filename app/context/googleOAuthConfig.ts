import { Platform } from 'react-native';

export const GOOGLE_IOS_CLIENT_ID = '66318687320-4nm86m63fits0ph84p1hg6tghg04jf4c.apps.googleusercontent.com';
// The eazee-app project's Android client (google-services.json), registered for com.eazee.ai and the debug keystore's SHA-1.
export const GOOGLE_ANDROID_CLIENT_ID = '66318687320-mdc52qtvtauidu10dt1ml14na923ffuh.apps.googleusercontent.com';
export const GOOGLE_WEB_CLIENT_ID = '66318687320-t4kcjaqjmmi6pgctleub3ca7bhfhlmvv.apps.googleusercontent.com';
export const FIREBASE_GOOGLE_IOS_CLIENT_ID = GOOGLE_IOS_CLIENT_ID;
export const FIREBASE_GOOGLE_WEB_CLIENT_ID = GOOGLE_WEB_CLIENT_ID;
export const GOOGLE_REDIRECT_URI = 'com.eazee.ai:/oauthredirect';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REFRESH_TOKEN_STORAGE_KEY = 'googleRefreshToken';
export const GOOGLE_OAUTH_IN_PROGRESS_STORAGE_KEY = 'googleOAuthInProgressAt';
export const GOOGLE_OAUTH_IN_PROGRESS_MAX_AGE_MS = 10 * 60 * 1000;
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
];

export const getGoogleOAuthClientId = () => (
  Platform.OS === 'ios' ? GOOGLE_IOS_CLIENT_ID : GOOGLE_ANDROID_CLIENT_ID
);
