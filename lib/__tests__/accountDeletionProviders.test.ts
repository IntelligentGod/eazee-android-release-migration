import { getAccountDeletionReauthenticationProvider } from '../accountDeletionProviders';

describe('account deletion provider selection', () => {
  it('supports password, Google, and Apple accounts', () => {
    expect(getAccountDeletionReauthenticationProvider(['password'])).toBe('password');
    expect(getAccountDeletionReauthenticationProvider(['google.com'])).toBe('google.com');
    expect(getAccountDeletionReauthenticationProvider(['apple.com'])).toBe('apple.com');
  });

  it('requires Apple reauthentication for linked Apple accounts', () => {
    expect(getAccountDeletionReauthenticationProvider(['password', 'google.com', 'apple.com'])).toBe('apple.com');
  });

  it('uses Google when a linked account has no Apple provider', () => {
    expect(getAccountDeletionReauthenticationProvider(['password', 'google.com'])).toBe('google.com');
  });

  it('rejects empty or unsupported provider combinations', () => {
    expect(getAccountDeletionReauthenticationProvider([])).toBeNull();
    expect(getAccountDeletionReauthenticationProvider(['github.com'])).toBeNull();
    expect(getAccountDeletionReauthenticationProvider(['password', 'github.com'])).toBeNull();
  });
});
