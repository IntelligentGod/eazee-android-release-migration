import {
  getActiveGoogleRedirectPayload,
  getGoogleRedirectPayload,
} from '../googleAuthRedirect';

describe('googleAuthRedirect', () => {
  it('returns the auth code payload for the active oauth callback', () => {
    expect(
      getActiveGoogleRedirectPayload(
        'com.eazee.ai:/oauthredirect?code=auth-code&state=expected-state',
        'expected-state'
      )
    ).toEqual({
      code: 'auth-code',
      error: null,
      errorDescription: null,
      state: 'expected-state',
    });
  });

  it('ignores callbacks without oauth params', () => {
    expect(
      getActiveGoogleRedirectPayload('com.eazee.ai:/oauthredirect', 'expected-state')
    ).toBeNull();
  });

  it('ignores stale callbacks when the state is missing', () => {
    expect(
      getActiveGoogleRedirectPayload(
        'com.eazee.ai:/oauthredirect?code=auth-code',
        'expected-state'
      )
    ).toBeNull();
  });

  it('ignores stale callbacks when the state does not match', () => {
    expect(
      getActiveGoogleRedirectPayload(
        'com.eazee.ai:/oauthredirect?error=server_error&state=old-state',
        'expected-state'
      )
    ).toBeNull();
  });

  it('preserves oauth errors for the active request', () => {
    expect(
      getActiveGoogleRedirectPayload(
        'com.eazee.ai:/oauthredirect?error=access_denied&error_description=User%20cancelled&state=expected-state',
        'expected-state'
      )
    ).toEqual({
      code: null,
      error: 'access_denied',
      errorDescription: 'User cancelled',
      state: 'expected-state',
    });
  });

  it('parses the raw callback payload', () => {
    expect(
      getGoogleRedirectPayload(
        'com.eazee.ai:/oauthredirect?code=auth-code&error=server_error&error_description=Problem&state=expected-state'
      )
    ).toEqual({
      code: 'auth-code',
      error: 'server_error',
      errorDescription: 'Problem',
      state: 'expected-state',
    });
  });
});
