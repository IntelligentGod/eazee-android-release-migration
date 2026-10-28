import { parseAssistantMessageExtras, stripAssistantMarkers } from '@/lib/assistantMessageExtras';
import { buildSavedPreferencesSystemMessage, normalizeSavedPreferences } from '@/lib/aiSavedPreferences';
import { buildFirstChatSystemMessage, INITIAL_FIRST_CHAT_STATE, normalizeFirstChatState } from '@/lib/firstChatOnboarding';

describe('assistant message markers', () => {
  it('turns markers into buttons and hides them from the text', () => {
    const extras = parseAssistantMessageExtras([
      'Here is your summary.',
      '',
      '[[copy]]',
      '[[result: draft]]',
      '[[options: Make it shorter | Adjust the tone | Make it shorter]]',
      '[[remember: tone=direct | Should I remember that you like a direct tone?]]',
    ].join('\n'));

    expect(extras.text).toBe('Here is your summary.');
    expect(extras.copyable).toBe(true);
    expect(extras.result).toBe('draft');
    expect(extras.options).toEqual(['Make it shorter', 'Adjust the tone']);
    expect(extras.remember).toEqual({ field: 'tone', value: 'direct', question: 'Should I remember that you like a direct tone?' });
  });

  it('reads proposed tasks and goals, defaulting an unknown timeframe', () => {
    const extras = parseAssistantMessageExtras('Plan ready.\n[[tasks: Update CV summary | Apply to 3 roles]]\n[[goal: Find a remote job | someday]]');
    expect(extras.tasks).toEqual(['Update CV summary', 'Apply to 3 roles']);
    expect(extras.goal).toEqual({ title: 'Find a remote job', timeframe: 'thisWeek' });
  });

  it('ignores preferences the app does not support', () => {
    const extras = parseAssistantMessageExtras('Ok.\n[[save_preference: responseLength=short]]\n[[save_preference: mood=angry]]\n[[remember: tone=rude | Remember?]]');
    expect(extras.savePreferences).toEqual([{ field: 'responseLength', value: 'short' }]);
    expect(extras.remember).toBeNull();
  });

  it('hides a half-written marker while a reply streams in', () => {
    expect(stripAssistantMarkers('Here you go.\n[[options: Make it')).toBe('Here you go.');
    expect(stripAssistantMarkers('No markers here.')).toBe('No markers here.');
  });
});

describe('saved preferences', () => {
  it('keeps one value per field, drops unknown ones, and is silent when off or empty', () => {
    const store = normalizeSavedPreferences({
      preferences: [
        { field: 'planStyle', value: 'timed', source: 'chat', updatedAt: 1 },
        { field: 'planStyle', value: 'flexible', source: 'chat', updatedAt: 2 },
        { field: 'planStyle', value: 'chaotic', source: 'chat', updatedAt: 3 },
        { field: 'secret', value: 'x' },
      ],
    });
    expect(store.preferences).toEqual([{ field: 'planStyle', value: 'flexible', source: 'chat', updatedAt: 2 }]);
    expect(buildSavedPreferencesSystemMessage(store)).toContain('flexible priority list');
    expect(buildSavedPreferencesSystemMessage({ ...store, enabled: false })).toBeNull();
    expect(buildSavedPreferencesSystemMessage({ enabled: true, preferences: [] })).toBeNull();
  });
});

describe('first-chat onboarding', () => {
  it('describes the chosen starter and stops offering the preference prompt once shown', () => {
    const message = buildFirstChatSystemMessage({ ...INITIAL_FIRST_CHAT_STATE, status: 'in_progress', intent: 'write' });
    expect(message).toContain('Write a message');
    expect(message).toContain('A usable draft');
    expect(buildFirstChatSystemMessage({ ...INITIAL_FIRST_CHAT_STATE, preferencePromptShown: true }))
      .toContain('do not ask again');
  });

  it('falls back to a fresh state for anything unreadable', () => {
    expect(normalizeFirstChatState({ status: 'weird', intent: 'x', assistantReplies: -3 })).toMatchObject({
      status: 'not_started',
      intent: undefined,
      assistantReplies: 0,
    });
  });
});

describe('AI error messages', () => {
  const { getAiResponseErrorMessage, AI_AUTH_REQUIRED_MESSAGE, APP_VERIFICATION_FAILED_MESSAGE } = require('@/lib/aiAuth');
  it('says the app could not be verified instead of asking a signed-in user to sign in', () => {
    expect(getAiResponseErrorMessage({ error: 'App verification required' }, 401)).toBe(APP_VERIFICATION_FAILED_MESSAGE);
    expect(getAiResponseErrorMessage({ error: 'Authentication required' }, 401)).toBe(AI_AUTH_REQUIRED_MESSAGE);
    expect(getAiResponseErrorMessage({ error: 'Too many requests' }, 429)).toBe('Too many requests');
  });
});

describe('default follow-ups', () => {
  const { getDefaultFollowUps } = require('@/components/chat/AssistantMessageActions');
  it('adds follow-ups to a result that came without any, and none to a chat reply', () => {
    expect(getDefaultFollowUps(parseAssistantMessageExtras('Hi Sarah...\n[[copy]]'))).toEqual(['Make it shorter', 'Adjust the tone']);
    expect(getDefaultFollowUps(parseAssistantMessageExtras('Plan...\n[[tasks: A | B]]'))).toEqual(['Make it simpler', 'Adjust the plan']);
    expect(getDefaultFollowUps(parseAssistantMessageExtras('Option A wins.\n[[result: comparison]]'))).toEqual(['Explain the trade-offs', 'Help me decide']);
    expect(getDefaultFollowUps(parseAssistantMessageExtras('Sure, happy to help!'))).toEqual([]);
  });
});
