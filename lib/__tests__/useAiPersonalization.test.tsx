import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act } from 'react-test-renderer';

import {
  DEFAULT_AI_PERSONALIZATION_SETTINGS,
  type AiPersonalizationSettings,
} from '../aiPersonalization';
import { useAiPersonalization } from '../useAiPersonalization';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('useAiPersonalization', () => {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  let hook: ReturnType<typeof useAiPersonalization>;

  const renderHook = async () => {
    const Harness = () => {
      hook = useAiPersonalization('user-1');
      return null;
    };

    await act(async () => {
      renderer = TestRenderer.create(<Harness />);
    });

    return hook;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
    renderer = null;
  });

  it('keeps newer draft edits when a previous save finishes', async () => {
    let resolveSave!: () => void;
    const savedDraft: AiPersonalizationSettings = {
      ...DEFAULT_AI_PERSONALIZATION_SETTINGS,
      emoji: 'more',
    };
    const newerDraft: AiPersonalizationSettings = {
      ...savedDraft,
      responseLength: 'detailed',
    };

    mockedAsyncStorage.setItem.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));

    await renderHook();

    await act(async () => {
      hook.updateDraft({ emoji: 'more' });
    });

    let savePromise!: Promise<void>;
    await act(async () => {
      savePromise = hook.save();
    });

    await act(async () => {
      hook.updateDraft({ responseLength: 'detailed' });
    });

    await act(async () => {
      resolveSave();
      await savePromise;
    });

    expect(hook.settings).toEqual(savedDraft);
    expect(hook.draft).toEqual(newerDraft);
    expect(hook.hasChanges).toBe(true);
  });

  it('ignores stale initial loads after a local save', async () => {
    let resolveInitialLoad!: (value: string | null) => void;
    const savedDraft: AiPersonalizationSettings = {
      ...DEFAULT_AI_PERSONALIZATION_SETTINGS,
      responseLength: 'concise',
    };
    const staleStoredSettings = {
      baseStyle: 'efficient',
      warmth: 'less',
      emoji: 'less',
      responseLength: 'detailed',
    };

    mockedAsyncStorage.getItem.mockImplementationOnce(() => new Promise<string | null>((resolve) => {
      resolveInitialLoad = resolve;
    }));

    await renderHook();

    await act(async () => {
      hook.updateDraft({ responseLength: 'concise' });
    });

    await act(async () => {
      await hook.save();
    });

    await act(async () => {
      resolveInitialLoad(JSON.stringify(staleStoredSettings));
    });

    expect(hook.settings).toEqual(savedDraft);
    expect(hook.draft).toEqual(savedDraft);
    expect(hook.hasChanges).toBe(false);
  });
});
