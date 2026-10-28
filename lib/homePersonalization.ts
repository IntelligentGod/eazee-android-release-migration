import AsyncStorage from '@react-native-async-storage/async-storage';

export type HomeCardId = 'nextStep' | 'suggestions' | 'todayPlan';

export type HomePersonalizationSettings = {
  order: HomeCardId[];
  suggestionsEnabled: boolean;
};

export const HOME_PERSONALIZATION_STORAGE_KEY_PREFIX = 'home:personalization:v1:';
export const HOME_PERSONALIZATION_GUEST_USER_ID = 'guest';

export const DEFAULT_HOME_PERSONALIZATION_SETTINGS: HomePersonalizationSettings = {
  order: ['nextStep', 'suggestions', 'todayPlan'],
  suggestionsEnabled: true,
};

const homeCardIds = new Set<HomeCardId>(DEFAULT_HOME_PERSONALIZATION_SETTINGS.order);
const listeners = new Set<(settings: HomePersonalizationSettings, userId: string) => void>();

const normalizeUserId = (userId?: string | null) => {
  const trimmed = typeof userId === 'string' ? userId.trim() : '';
  return trimmed || HOME_PERSONALIZATION_GUEST_USER_ID;
};

export const getHomePersonalizationStorageKey = (userId?: string | null) =>
  `${HOME_PERSONALIZATION_STORAGE_KEY_PREFIX}${normalizeUserId(userId)}`;

export const normalizeHomePersonalizationSettings = (value: unknown): HomePersonalizationSettings => {
  if (!value || typeof value !== 'object') {
    return DEFAULT_HOME_PERSONALIZATION_SETTINGS;
  }

  const input = value as Partial<HomePersonalizationSettings>;
  const storedOrder = Array.isArray(input.order)
    ? input.order.filter((cardId): cardId is HomeCardId =>
        typeof cardId === 'string' && homeCardIds.has(cardId as HomeCardId)
      )
    : [];
  const order = Array.from(new Set([
    ...storedOrder,
    ...DEFAULT_HOME_PERSONALIZATION_SETTINGS.order,
  ]));

  return {
    order,
    suggestionsEnabled: input.suggestionsEnabled !== false,
  };
};

export async function readHomePersonalizationSettings(
  userId?: string | null
): Promise<HomePersonalizationSettings> {
  try {
    const storedValue = await AsyncStorage.getItem(getHomePersonalizationStorageKey(userId));
    return storedValue
      ? normalizeHomePersonalizationSettings(JSON.parse(storedValue))
      : DEFAULT_HOME_PERSONALIZATION_SETTINGS;
  } catch {
    return DEFAULT_HOME_PERSONALIZATION_SETTINGS;
  }
}

export async function writeHomePersonalizationSettings(
  settings: HomePersonalizationSettings,
  userId?: string | null
) {
  const normalizedSettings = normalizeHomePersonalizationSettings(settings);
  const normalizedUserId = normalizeUserId(userId);
  await AsyncStorage.setItem(
    getHomePersonalizationStorageKey(normalizedUserId),
    JSON.stringify(normalizedSettings)
  );
  listeners.forEach((listener) => listener(normalizedSettings, normalizedUserId));
}

export function subscribeHomePersonalizationSettings(
  listener: (settings: HomePersonalizationSettings, userId: string) => void
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
