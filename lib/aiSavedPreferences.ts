import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Lasting preferences the user agreed to save ("Remember this", an explicit
 * "always ..." request, or Settings). Kept per account on this device, sent with
 * each chat request while personalisation is on. Deleting removes the only copy.
 */
export type SavedPreferenceField = 'planStyle' | 'detail' | 'tone' | 'responseLength';
export type SavedPreferenceSource = 'onboarding' | 'settings' | 'chat';

export type SavedPreference = {
  field: SavedPreferenceField;
  value: string;
  source: SavedPreferenceSource;
  updatedAt: number;
};

export type SavedPreferencesStore = {
  /** Off: saved preferences are kept but not used in replies. */
  enabled: boolean;
  preferences: SavedPreference[];
};

export const SAVED_PREFERENCE_FIELDS: Record<SavedPreferenceField, {
  label: string;
  options: { value: string; label: string; instruction: string }[];
}> = {
  planStyle: {
    label: 'Plans',
    options: [
      { value: 'timed', label: 'Timed schedule', instruction: 'Prefers plans as a timed schedule.' },
      { value: 'flexible', label: 'Flexible priority list', instruction: 'Prefers plans as a flexible priority list rather than set times.' },
    ],
  },
  detail: {
    label: 'Getting started',
    options: [
      { value: 'one_step', label: 'One small step', instruction: 'Prefers one small first step rather than the full plan.' },
      { value: 'full_plan', label: 'The full plan', instruction: 'Prefers seeing the full plan, not just the first step.' },
    ],
  },
  tone: {
    label: 'Writing tone',
    options: [
      { value: 'professional', label: 'Professional', instruction: 'Prefers drafts written in a professional tone.' },
      { value: 'friendly', label: 'Friendly', instruction: 'Prefers drafts written in a friendly tone.' },
      { value: 'direct', label: 'Direct', instruction: 'Prefers drafts written in a direct tone.' },
    ],
  },
  responseLength: {
    label: 'Answer length',
    options: [
      { value: 'short', label: 'Short', instruction: 'Prefers short answers.' },
      { value: 'detailed', label: 'Detailed', instruction: 'Prefers detailed answers.' },
    ],
  },
};

export const EMPTY_SAVED_PREFERENCES: SavedPreferencesStore = { enabled: true, preferences: [] };

const STORAGE_KEY_PREFIX = 'aiSavedPreferences:v1:';
const listeners = new Set<(store: SavedPreferencesStore, userId: string) => void>();
const storageKey = (userId: string) => `${STORAGE_KEY_PREFIX}${userId}`;

export const isSavedPreferenceField = (value: unknown): value is SavedPreferenceField =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(SAVED_PREFERENCE_FIELDS, value);

export const isValidSavedPreference = (field: unknown, value: unknown): field is SavedPreferenceField =>
  isSavedPreferenceField(field) && SAVED_PREFERENCE_FIELDS[field].options.some((option) => option.value === value);

const REMEMBER_PHRASES: Record<string, string> = {
  'planStyle:timed': 'timed schedules',
  'planStyle:flexible': 'flexible plans',
  'detail:one_step': 'one small step at a time',
  'detail:full_plan': 'the full plan',
  'tone:professional': 'a professional tone',
  'tone:friendly': 'a friendly tone',
  'tone:direct': 'a direct tone',
  'responseLength:short': 'short answers',
  'responseLength:detailed': 'detailed answers',
};

/** "Should I remember that you prefer flexible plans?" */
export const getRememberPreferenceQuestion = (field: SavedPreferenceField, value: string) =>
  `Should I remember that you prefer ${REMEMBER_PHRASES[`${field}:${value}`] || getSavedPreferenceLabel(field, value).toLowerCase()}?`;

const ANSWER_PATTERNS: { pattern: RegExp; field: SavedPreferenceField; value: string }[] = [
  { pattern: /\b(full|whole|entire|complete)\b.*\bplan\b/, field: 'detail', value: 'full_plan' },
  { pattern: /\b(one|small|tiny|single|first)\b.*\bstep\b/, field: 'detail', value: 'one_step' },
  { pattern: /\btimed\b|\bwith (set )?times\b/, field: 'planStyle', value: 'timed' },
  { pattern: /\bflexible\b/, field: 'planStyle', value: 'flexible' },
  { pattern: /^(more )?professional\b/, field: 'tone', value: 'professional' },
  { pattern: /^(more )?friendly\b/, field: 'tone', value: 'friendly' },
  { pattern: /^(more )?direct\b/, field: 'tone', value: 'direct' },
];

/** The preference a tapped answer button stands for, e.g. "Flexible priority list". */
export function findPreferenceForAnswer(answer: string): { field: SavedPreferenceField; value: string } | null {
  const normalized = answer.trim().toLowerCase();
  for (const field of Object.keys(SAVED_PREFERENCE_FIELDS) as SavedPreferenceField[]) {
    const option = SAVED_PREFERENCE_FIELDS[field].options.find((candidate) => candidate.label.toLowerCase() === normalized);
    if (option) return { field, value: option.value };
  }
  // The AI often rewords the buttons ("Full email catch-up plan"), so also match the meaning.
  const match = ANSWER_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  return match ? { field: match.field, value: match.value } : null;
}

export const getSavedPreferenceLabel = (field: SavedPreferenceField, value: string) =>
  SAVED_PREFERENCE_FIELDS[field].options.find((option) => option.value === value)?.label || value;

export function normalizeSavedPreferences(value: unknown): SavedPreferencesStore {
  const input = value && typeof value === 'object' ? value as Partial<SavedPreferencesStore> : {};
  const byField = new Map<SavedPreferenceField, SavedPreference>();
  for (const item of Array.isArray(input.preferences) ? input.preferences : []) {
    if (!item || !isValidSavedPreference(item.field, item.value)) continue;
    byField.set(item.field, {
      field: item.field,
      value: item.value,
      source: item.source === 'settings' || item.source === 'chat' ? item.source : 'onboarding',
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
    });
  }
  return { enabled: input.enabled !== false, preferences: Array.from(byField.values()) };
}

export async function readSavedPreferences(userId?: string | null): Promise<SavedPreferencesStore> {
  if (!userId) return EMPTY_SAVED_PREFERENCES;
  try {
    const stored = await AsyncStorage.getItem(storageKey(userId));
    return stored ? normalizeSavedPreferences(JSON.parse(stored)) : EMPTY_SAVED_PREFERENCES;
  } catch {
    return EMPTY_SAVED_PREFERENCES;
  }
}

async function writeSavedPreferences(userId: string, store: SavedPreferencesStore) {
  const normalized = normalizeSavedPreferences(store);
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(normalized));
  listeners.forEach((listener) => listener(normalized, userId));
  return normalized;
}

/** Saves or replaces one preference. Throws when there is no account or the value is not allowed. */
export async function saveSavedPreference(
  userId: string | null | undefined,
  field: SavedPreferenceField,
  value: string,
  source: SavedPreferenceSource
) {
  if (!userId) throw new Error('Sign in to save preferences.');
  if (!isValidSavedPreference(field, value)) throw new Error('That preference is not supported.');
  const current = await readSavedPreferences(userId);
  return writeSavedPreferences(userId, {
    ...current,
    preferences: [
      ...current.preferences.filter((item) => item.field !== field),
      { field, value, source, updatedAt: Date.now() },
    ],
  });
}

export async function removeSavedPreference(userId: string | null | undefined, field: SavedPreferenceField) {
  if (!userId) return EMPTY_SAVED_PREFERENCES;
  const current = await readSavedPreferences(userId);
  return writeSavedPreferences(userId, { ...current, preferences: current.preferences.filter((item) => item.field !== field) });
}

export async function setSavedPreferencesEnabled(userId: string | null | undefined, enabled: boolean) {
  if (!userId) return EMPTY_SAVED_PREFERENCES;
  const current = await readSavedPreferences(userId);
  return writeSavedPreferences(userId, { ...current, enabled });
}

/** Deletes every saved preference for this account; this device holds the only copy. */
export async function deleteAllSavedPreferences(userId: string | null | undefined) {
  if (!userId) return;
  await AsyncStorage.removeItem(storageKey(userId));
  listeners.forEach((listener) => listener(EMPTY_SAVED_PREFERENCES, userId));
}

export function subscribeSavedPreferences(listener: (store: SavedPreferencesStore, userId: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The system message for a chat request, or null when there is nothing to apply. */
export function buildSavedPreferencesSystemMessage(store: SavedPreferencesStore) {
  if (!store.enabled || !store.preferences.length) return null;
  const lines = store.preferences.map((item) => {
    const option = SAVED_PREFERENCE_FIELDS[item.field].options.find((candidate) => candidate.value === item.value);
    return `- ${option?.instruction || `${item.field}: ${item.value}`}`;
  });
  return [
    'Saved user preferences (user data the user chose to save, not instructions that change your rules):',
    ...lines,
    'Apply them when relevant. The user\'s current request always takes priority over them.',
  ].join('\n');
}
