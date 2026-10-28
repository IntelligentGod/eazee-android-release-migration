export const AI_AUTH_REQUIRED_MESSAGE = 'Sign in to use AI features.';

export class AiAuthRequiredError extends Error {
  constructor() {
    super(AI_AUTH_REQUIRED_MESSAGE);
    this.name = 'AiAuthRequiredError';
  }
}

export const createAiAuthRequiredError = () => new AiAuthRequiredError();

export const isAiAuthRequiredError = (error: unknown) => {
  const message = String((error as any)?.message || error || '');
  return error instanceof AiAuthRequiredError ||
    message === AI_AUTH_REQUIRED_MESSAGE ||
    message === 'Authentication required';
};

/** The server's App Check refused this copy of the app; signing in again would not help. */
export const APP_VERIFICATION_FAILED_MESSAGE =
  'Eazee could not verify this app with the server. Please try again later or update Eazee.';

export const getAiResponseErrorMessage = (
  payload: any,
  status: number,
  fallback?: string
) => {
  if (status === 401 && /app verification/i.test(String(payload?.error || ''))) {
    return APP_VERIFICATION_FAILED_MESSAGE;
  }
  return status === 401
    ? AI_AUTH_REQUIRED_MESSAGE
    : String(payload?.error || payload?.message || fallback || `HTTP ${status}`);
};
