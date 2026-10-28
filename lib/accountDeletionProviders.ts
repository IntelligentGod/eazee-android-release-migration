const SUPPORTED_ACCOUNT_PROVIDERS = new Set(['apple.com', 'google.com', 'password']);

export type AccountDeletionReauthenticationProvider = 'apple.com' | 'google.com' | 'password';

export function getAccountDeletionReauthenticationProvider(providerIds: string[]) {
  const providers = new Set(providerIds);
  if (providers.size === 0 || [...providers].some((provider) => !SUPPORTED_ACCOUNT_PROVIDERS.has(provider))) {
    return null;
  }

  if (providers.has('apple.com')) {
    return 'apple.com';
  }
  if (providers.has('google.com')) {
    return 'google.com';
  }
  return providers.has('password') ? 'password' : null;
}
