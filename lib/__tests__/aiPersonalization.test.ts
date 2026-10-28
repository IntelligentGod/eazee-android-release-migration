import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AI_PERSONALIZATION_LEVEL_OPTIONS,
  AI_RESPONSE_LENGTH_OPTIONS,
  DEFAULT_AI_PERSONALIZATION_SETTINGS,
  getAiPersonalizationStorageKey,
  normalizeAiPersonalizationSettings,
  readAiPersonalizationSettings,
  subscribeAiPersonalizationSettings,
  writeAiPersonalizationSettings,
} from '../aiPersonalization';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('aiPersonalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  it('builds user and guest storage keys', () => {
    expect(getAiPersonalizationStorageKey('user-1')).toBe('aiPersonalization:v1:user-1');
    expect(getAiPersonalizationStorageKey(null)).toBe('aiPersonalization:v1:guest');
  });

  it('orders menu options from highest to lowest intensity', () => {
    expect(AI_PERSONALIZATION_LEVEL_OPTIONS.map((option) => option.label)).toEqual(['Lots', 'Some', 'None']);
    expect(AI_RESPONSE_LENGTH_OPTIONS.map((option) => option.label)).toEqual(['Long', 'Medium', 'Short']);
  });

  it('normalizes invalid values to defaults', () => {
    expect(normalizeAiPersonalizationSettings({
      baseStyle: 'roast',
      warmth: 'less',
      emoji: 'more',
      responseLength: 'invalid',
    })).toEqual({
      ...DEFAULT_AI_PERSONALIZATION_SETTINGS,
      baseStyle: 'roast',
      emoji: 'more',
    });

    expect(normalizeAiPersonalizationSettings('bad')).toEqual(DEFAULT_AI_PERSONALIZATION_SETTINGS);
  });

  it('reads valid stored settings', async () => {
    mockedAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify({
      baseStyle: 'efficient',
      warmth: 'less',
      emoji: 'less',
    }));

    await expect(readAiPersonalizationSettings('user-1')).resolves.toEqual({
      baseStyle: 'positive',
      warmth: 'default',
      emoji: 'less',
      responseLength: 'default',
    });
    expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith('aiPersonalization:v1:user-1');
  });

  it('returns defaults for invalid stored JSON', async () => {
    mockedAsyncStorage.getItem.mockResolvedValueOnce('{bad');

    await expect(readAiPersonalizationSettings('user-1')).resolves.toEqual(DEFAULT_AI_PERSONALIZATION_SETTINGS);
  });

  it('writes settings and notifies matching subscribers', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAiPersonalizationSettings(listener);

    await writeAiPersonalizationSettings({
      ...DEFAULT_AI_PERSONALIZATION_SETTINGS,
      emoji: 'more',
      responseLength: 'detailed',
    }, 'user-1');
    unsubscribe();

    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
      'aiPersonalization:v1:user-1',
      JSON.stringify({
        baseStyle: 'positive',
        warmth: 'default',
        emoji: 'more',
        responseLength: 'detailed',
      })
    );
    expect(listener).toHaveBeenCalledWith({
      baseStyle: 'positive',
      warmth: 'default',
      emoji: 'more',
      responseLength: 'detailed',
    }, 'user-1');
  });
});
