import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_NAVIGATION_HELP_MODE,
  NAVIGATION_HELP_MODE_STORAGE_KEY,
  getShortcutForGuidanceTarget,
  readNavigationHelpMode,
  subscribeNavigationHelpMode,
  writeNavigationHelpMode,
} from '../navigationHelp';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('navigationHelp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  it('defaults to guided steps', async () => {
    await expect(readNavigationHelpMode()).resolves.toBe(DEFAULT_NAVIGATION_HELP_MODE);
    expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith(NAVIGATION_HELP_MODE_STORAGE_KEY);
  });

  it('reads and writes shortcut mode', async () => {
    mockedAsyncStorage.getItem.mockResolvedValueOnce('shortcut');

    await expect(readNavigationHelpMode()).resolves.toBe('shortcut');
    await writeNavigationHelpMode('shortcut');

    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(NAVIGATION_HELP_MODE_STORAGE_KEY, 'shortcut');
  });

  it('notifies subscribers after writes', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeNavigationHelpMode(listener);

    await writeNavigationHelpMode('shortcut');
    unsubscribe();
    await writeNavigationHelpMode('guide');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('shortcut');
  });

  it('preserves shortcut route params for todo, event, and home settings targets', () => {
    expect(getShortcutForGuidanceTarget({ type: 'todo', todoId: 'todo-1', workspaceKey: 'Wishlist' })).toMatchObject({
      pathname: '/(tabs)/todo',
      params: {
        workspaceKey: 'Wishlist',
        openTodoId: 'todo-1',
        openTodoNonce: expect.any(String),
      },
    });

    expect(getShortcutForGuidanceTarget({
      type: 'event',
      eventId: 'event-1',
      source: 'google',
      startDate: '2026-06-01T10:00:00.000Z',
    })).toMatchObject({
      pathname: '/(tabs)/calendar',
      params: {
        openEventId: 'event-1',
        openEventSource: 'google',
        openNonce: expect.any(String),
      },
    });

    expect(getShortcutForGuidanceTarget({
      type: 'screen',
      route: '/(tabs)/home',
      params: {
        manageAccount: 'true',
        manageAccountSection: 'google',
        manageAccountNonce: 'stale',
      },
    })).toMatchObject({
      pathname: '/(tabs)/home',
      params: {
        manageAccount: 'true',
        manageAccountSection: 'google',
        manageAccountNonce: expect.any(String),
      },
    });

    expect(getShortcutForGuidanceTarget({
      type: 'screen',
      route: '/(tabs)/home',
      params: {
        settings: 'true',
        settingsNonce: 'stale',
      },
    })).toMatchObject({
      pathname: '/(tabs)/home',
      params: {
        settings: 'true',
        settingsNonce: expect.any(String),
      },
    });
  });
});
