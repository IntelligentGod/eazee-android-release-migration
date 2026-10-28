import AsyncStorage from '@react-native-async-storage/async-storage';

export type OnboardingPhase = 'welcome' | 'cta' | 'done';
export type OnboardingRoute = '/welcome' | '/welcome-finish' | '/(tabs)/chat';

export const ONBOARDING_PHASE_KEY = 'onboardingPhaseV1';

const validPhases: OnboardingPhase[] = ['welcome', 'cta', 'done'];

export const normalizeOnboardingPhase = (value: string | null | undefined): OnboardingPhase =>
  validPhases.includes(value as OnboardingPhase) ? (value as OnboardingPhase) : 'welcome';

export const getOnboardingPhase = async (): Promise<OnboardingPhase> => {
  const storedPhase = await AsyncStorage.getItem(ONBOARDING_PHASE_KEY);
  return normalizeOnboardingPhase(storedPhase);
};

export const setOnboardingPhase = async (phase: OnboardingPhase) => {
  await AsyncStorage.setItem(ONBOARDING_PHASE_KEY, phase);
};

export const clearOnboardingPhase = async () => {
  await AsyncStorage.removeItem(ONBOARDING_PHASE_KEY);
};

export const completeOnboarding = async () => {
  await setOnboardingPhase('done');
};

export const resolveOnboardingRoute = (phase: OnboardingPhase): OnboardingRoute => {
  if (phase === 'cta') {
    return '/welcome-finish';
  }

  if (phase === 'done') {
    return '/(tabs)/chat';
  }

  return '/welcome';
};
