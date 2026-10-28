import * as Linking from 'expo-linking';

export type GoogleRedirectPayload = {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  state: string | null;
};

export const getGoogleRedirectPayload = (returnUrl: string): GoogleRedirectPayload => {
  const queryParams = Linking.parse(returnUrl).queryParams ?? {};

  return {
    code: typeof queryParams.code === 'string' ? queryParams.code : null,
    error: typeof queryParams.error === 'string' ? queryParams.error : null,
    errorDescription:
      typeof queryParams.error_description === 'string' ? queryParams.error_description : null,
    state: typeof queryParams.state === 'string' ? queryParams.state : null,
  };
};

export const getActiveGoogleRedirectPayload = (
  returnUrl: string,
  expectedState: string | null | undefined
): GoogleRedirectPayload | null => {
  const payload = getGoogleRedirectPayload(returnUrl);

  if (!payload.code && !payload.error) {
    return null;
  }

  if (expectedState && payload.state !== expectedState) {
    return null;
  }

  return payload;
};
