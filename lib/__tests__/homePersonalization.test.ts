import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_HOME_PERSONALIZATION_SETTINGS,
  getHomePersonalizationStorageKey,
  normalizeHomePersonalizationSettings,
  readHomePersonalizationSettings,
  subscribeHomePersonalizationSettings,
  writeHomePersonalizationSettings,
} from '@/lib/homePersonalization';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('home personalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  it('normalizes invalid order and preserves every card once', () => {
    expect(normalizeHomePersonalizationSettings({
      order: ['todayPlan', 'bad', 'todayPlan'],
      suggestionsEnabled: false,
    })).toEqual({
      order: ['todayPlan', 'nextStep', 'suggestions'],
      suggestionsEnabled: false,
    });
  });

  it('builds separate user and guest storage keys', () => {
    expect(getHomePersonalizationStorageKey('user-1')).toBe('home:personalization:v1:user-1');
    expect(getHomePersonalizationStorageKey(null)).toBe('home:personalization:v1:guest');
  });

  it('uses the enabled middle default', async () => {
    await expect(readHomePersonalizationSettings('user-1')).resolves.toEqual(
      DEFAULT_HOME_PERSONALIZATION_SETTINGS
    );
    expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith('home:personalization:v1:user-1');
  });

  it('persists normalized settings and identifies the updated user', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeHomePersonalizationSettings(listener);

    await writeHomePersonalizationSettings({
      order: ['suggestions', 'todayPlan', 'nextStep'],
      suggestionsEnabled: false,
    }, 'user-1');
    unsubscribe();

    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
      'home:personalization:v1:user-1',
      JSON.stringify({
        order: ['suggestions', 'todayPlan', 'nextStep'],
        suggestionsEnabled: false,
      })
    );
    expect(listener).toHaveBeenCalledWith({
      order: ['suggestions', 'todayPlan', 'nextStep'],
      suggestionsEnabled: false,
    }, 'user-1');
  });
});
