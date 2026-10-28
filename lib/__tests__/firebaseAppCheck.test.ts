const mockGetApp = jest.fn(() => ({ name: '[DEFAULT]' }));
const mockInitializeAppCheck = jest.fn(async () => ({ app: 'check' }));
const mockGetToken = jest.fn(async () => ({ token: 'app-check-token' }));
const mockConfigure = jest.fn();

jest.mock('@react-native-firebase/app', () => ({
  getApp: mockGetApp,
}));

jest.mock('@react-native-firebase/app-check', () => ({
  ReactNativeFirebaseAppCheckProvider: jest.fn(() => ({ configure: mockConfigure })),
  initializeAppCheck: mockInitializeAppCheck,
  getToken: mockGetToken,
}));

describe('Firebase App Check headers', () => {
  const originalEnabled = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalEnabled === undefined) {
      delete process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED;
    } else {
      process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED = originalEnabled;
    }
  });

  it('leaves requests unchanged during staged rollout', async () => {
    process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED = 'false';
    const { getFirebaseAppCheckHeaders } = require('@/lib/firebaseAppCheck');

    await expect(getFirebaseAppCheckHeaders()).resolves.toEqual({});
    expect(mockInitializeAppCheck).not.toHaveBeenCalled();
  });

  it('adds an App Check token when enabled', async () => {
    process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ENABLED = 'true';
    const { getFirebaseAppCheckHeaders } = require('@/lib/firebaseAppCheck');

    await expect(getFirebaseAppCheckHeaders()).resolves.toEqual({
      'X-Firebase-AppCheck': 'app-check-token',
    });
    expect(mockConfigure).toHaveBeenCalled();
    expect(mockInitializeAppCheck).toHaveBeenCalledTimes(1);
  });
});
