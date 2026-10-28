import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ONBOARDING_PHASE_KEY,
  clearOnboardingPhase,
  completeOnboarding,
  getOnboardingPhase,
  normalizeOnboardingPhase,
  resolveOnboardingRoute,
  setOnboardingPhase,
} from '../onboarding';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults to welcome when no phase is stored', async () => {
    mockedAsyncStorage.getItem.mockResolvedValueOnce(null);

    await expect(getOnboardingPhase()).resolves.toBe('welcome');
    expect(resolveOnboardingRoute('welcome')).toBe('/welcome');
  });

  it('routes cta and done phases to the expected screens', () => {
    expect(resolveOnboardingRoute('cta')).toBe('/welcome-finish');
    expect(resolveOnboardingRoute('done')).toBe('/(tabs)/chat');
  });

  it('treats video and unknown persisted values as welcome', async () => {
    mockedAsyncStorage.getItem.mockResolvedValueOnce('unknown-phase');

    await expect(getOnboardingPhase()).resolves.toBe('welcome');
    expect(normalizeOnboardingPhase('video')).toBe('welcome');
    expect(normalizeOnboardingPhase('bogus')).toBe('welcome');
  });

  it('writes expected phase values', async () => {
    mockedAsyncStorage.setItem.mockResolvedValue();

    await setOnboardingPhase('cta');

    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(ONBOARDING_PHASE_KEY, 'cta');
  });

  it('marks onboarding complete and clears persisted state', async () => {
    mockedAsyncStorage.setItem.mockResolvedValue();
    mockedAsyncStorage.removeItem.mockResolvedValue();

    await completeOnboarding();
    await clearOnboardingPhase();

    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(ONBOARDING_PHASE_KEY, 'done');
    expect(mockedAsyncStorage.removeItem).toHaveBeenCalledWith(ONBOARDING_PHASE_KEY);
  });
});
