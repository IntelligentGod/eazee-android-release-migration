import AsyncStorage from '@react-native-async-storage/async-storage';

export type AiPersonalizationLevel = 'less' | 'default' | 'more';
export type AiResponseLength = 'concise' | 'default' | 'detailed';
export type AiBasePersonalization = 'positive' | 'neutral' | 'roast';

export type AiPersonalizationSettings = {
  baseStyle: AiBasePersonalization;
  warmth: 'default';
  emoji: AiPersonalizationLevel;
  responseLength: AiResponseLength;
};

export const AI_PERSONALIZATION_STORAGE_KEY_PREFIX = 'aiPersonalization:v1:';
export const AI_PERSONALIZATION_GUEST_USER_ID = 'guest';

export const DEFAULT_AI_PERSONALIZATION_SETTINGS: AiPersonalizationSettings = {
  baseStyle: 'positive',
  warmth: 'default',
  emoji: 'default',
  responseLength: 'default',
};

export const AI_BASE_PERSONALIZATION_OPTIONS: { value: AiBasePersonalization; label: string }[] = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'roast', label: 'Roast Mode' },
];

export const AI_PERSONALIZATION_LEVEL_OPTIONS: { value: AiPersonalizationLevel; label: string }[] = [
  { value: 'more', label: 'Lots' },
  { value: 'default', label: 'Some' },
  { value: 'less', label: 'None' },
];

export const AI_RESPONSE_LENGTH_OPTIONS: { value: AiResponseLength; label: string }[] = [
  { value: 'detailed', label: 'Long' },
  { value: 'default', label: 'Medium' },
  { value: 'concise', label: 'Short' },
];

const levelValues = new Set<AiPersonalizationLevel>(AI_PERSONALIZATION_LEVEL_OPTIONS.map((option) => option.value));
const basePersonalizationValues = new Set<AiBasePersonalization>(
  AI_BASE_PERSONALIZATION_OPTIONS.map((option) => option.value)
);
const responseLengthValues = new Set<AiResponseLength>(AI_RESPONSE_LENGTH_OPTIONS.map((option) => option.value));
const listeners = new Set<(settings: AiPersonalizationSettings, userId: string) => void>();

const normalizeUserId = (userId?: string | null) => {
  const trimmed = typeof userId === 'string' ? userId.trim() : '';
  return trimmed || AI_PERSONALIZATION_GUEST_USER_ID;
};

export const getAiPersonalizationStorageKey = (userId?: string | null) =>
  `${AI_PERSONALIZATION_STORAGE_KEY_PREFIX}${normalizeUserId(userId)}`;

const normalizeLevel = (value: unknown): AiPersonalizationLevel =>
  typeof value === 'string' && levelValues.has(value as AiPersonalizationLevel)
    ? value as AiPersonalizationLevel
    : DEFAULT_AI_PERSONALIZATION_SETTINGS.emoji;

const normalizeBasePersonalization = (value: unknown): AiBasePersonalization =>
  typeof value === 'string' && basePersonalizationValues.has(value as AiBasePersonalization)
    ? value as AiBasePersonalization
    : DEFAULT_AI_PERSONALIZATION_SETTINGS.baseStyle;

const normalizeResponseLength = (value: unknown): AiResponseLength =>
  typeof value === 'string' && responseLengthValues.has(value as AiResponseLength)
    ? value as AiResponseLength
    : DEFAULT_AI_PERSONALIZATION_SETTINGS.responseLength;

export const normalizeAiPersonalizationSettings = (value: unknown): AiPersonalizationSettings => {
  if (!value || typeof value !== 'object') {
    return DEFAULT_AI_PERSONALIZATION_SETTINGS;
  }

  const input = value as Partial<AiPersonalizationSettings>;
  return {
    baseStyle: normalizeBasePersonalization(input.baseStyle),
    warmth: 'default',
    emoji: normalizeLevel(input.emoji),
    responseLength: normalizeResponseLength(input.responseLength),
  };
};

export const areAiPersonalizationSettingsEqual = (
  left: AiPersonalizationSettings,
  right: AiPersonalizationSettings
) =>
  left.baseStyle === right.baseStyle &&
  left.warmth === right.warmth &&
  left.emoji === right.emoji &&
  left.responseLength === right.responseLength;

export async function readAiPersonalizationSettings(userId?: string | null): Promise<AiPersonalizationSettings> {
  try {
    const storedValue = await AsyncStorage.getItem(getAiPersonalizationStorageKey(userId));
    if (!storedValue) {
      return DEFAULT_AI_PERSONALIZATION_SETTINGS;
    }
    return normalizeAiPersonalizationSettings(JSON.parse(storedValue));
  } catch {
    return DEFAULT_AI_PERSONALIZATION_SETTINGS;
  }
}

export async function writeAiPersonalizationSettings(
  settings: AiPersonalizationSettings,
  userId?: string | null
) {
  const normalizedSettings = normalizeAiPersonalizationSettings(settings);
  const normalizedUserId = normalizeUserId(userId);
  await AsyncStorage.setItem(
    getAiPersonalizationStorageKey(normalizedUserId),
    JSON.stringify(normalizedSettings)
  );
  listeners.forEach((listener) => listener(normalizedSettings, normalizedUserId));
}

export function subscribeAiPersonalizationSettings(
  listener: (settings: AiPersonalizationSettings, userId: string) => void
) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
