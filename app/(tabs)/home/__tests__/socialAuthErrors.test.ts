import {
  ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL_MESSAGE,
  STALE_TOKEN_MESSAGE,
  getSocialAuthErrorMessage,
} from '../socialAuthErrors';

describe('social auth error messages', () => {
  it('does not show an alert message when the user cancels', () => {
    expect(getSocialAuthErrorMessage({ code: 'SIGN_IN_CANCELLED' }, 'Google')).toBeNull();
    expect(getSocialAuthErrorMessage({ code: 'ERR_REQUEST_CANCELED' }, 'Apple')).toBeNull();
  });

  it('asks existing email/password users to log in first', () => {
    expect(
      getSocialAuthErrorMessage({ code: 'auth/account-exists-with-different-credential' }, 'Google')
    ).toBe(ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL_MESSAGE);
  });

  it('explains when the Firebase provider is not enabled', () => {
    expect(getSocialAuthErrorMessage({ code: 'auth/operation-not-allowed' }, 'Apple')).toBe(
      'Apple sign-in is not enabled in Firebase yet.'
    );
  });

  it('points to the device clock when Firebase calls the Google token stale', () => {
    const stale = {
      code: 'auth/invalid-credential',
      message: 'Firebase: ID Token issued at 1790853094 is stale to sign-in. (auth/invalid-credential).',
    };
    expect(getSocialAuthErrorMessage(stale, 'Google')).toBe(STALE_TOKEN_MESSAGE);
    expect(getSocialAuthErrorMessage({ code: 'auth/invalid-credential' }, 'Google'))
      .toBe('Could not sign in with Google. Please try again.');
  });
});
