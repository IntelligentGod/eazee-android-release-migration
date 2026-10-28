jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.1', applicationId: 'com.eazee.ai' }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.1' } }));
jest.mock('@/config/backend', () => ({ SERVER_URL: 'https://server.test' }));
const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => store[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => { store[key] = value; }),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import {
  checkAppUpdate,
  compareAppVersions,
  rememberAvailableUpdatePrompt,
  shouldPromptForAvailableUpdate,
} from '@/lib/appUpdate';

const respond = (server: unknown, appStore: unknown) => {
  (global as any).fetch = jest.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.startsWith('https://server.test') ? server : appStore),
  }));
};
const appStoreRelease = (version: string) => ({ results: [{ version, trackViewUrl: 'https://apps.apple.com/app/eazee/id1' }] });
const noConfig = { ios: { minimumVersion: null, latestVersion: null, storeUrl: null } };

describe('app update check', () => {
  it('compares dotted versions as numbers', () => {
    expect(compareAppVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareAppVersions('1.0', '1.0.0')).toBe(0);
    expect(compareAppVersions('1.0.1', '1.1')).toBe(-1);
  });

  it('offers a newer App Store version', async () => {
    respond(noConfig, appStoreRelease('1.0.2'));
    await expect(checkAppUpdate()).resolves.toEqual({
      kind: 'available', latestVersion: '1.0.2', storeUrl: 'https://apps.apple.com/app/eazee/id1',
    });
  });

  it('requires an update below the server minimum, and says nothing when current', async () => {
    respond({ ios: { minimumVersion: '1.0.2', latestVersion: null, storeUrl: null } }, appStoreRelease('1.0.2'));
    expect((await checkAppUpdate()).kind).toBe('required');
    respond(noConfig, appStoreRelease('1.0.1'));
    expect((await checkAppUpdate()).kind).toBe('none');
  });

  it('never blocks the app when the checks fail', async () => {
    (global as any).fetch = jest.fn(async () => { throw new Error('offline'); });
    expect((await checkAppUpdate()).kind).toBe('none');
  });

  it('asks about the same version at most once a day', async () => {
    const now = Date.now();
    await rememberAvailableUpdatePrompt('1.0.2', now);
    expect(await shouldPromptForAvailableUpdate('1.0.2', now + 60_000)).toBe(false);
    expect(await shouldPromptForAvailableUpdate('1.0.3', now + 60_000)).toBe(true);
    expect(await shouldPromptForAvailableUpdate('1.0.2', now + 25 * 60 * 60 * 1000)).toBe(true);
  });
});
