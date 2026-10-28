const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => store[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    store[key] = value;
  }),
}));

import { claimPreferencePromptChat, readPreferencePromptChatIds } from '@/lib/preferencePromptChats';

describe('preference follow-ups in the first chats', () => {
  it('counts the first three chats, keeps them, and stops after', async () => {
    expect((await claimPreferencePromptChat('u1', 'chat-1')).isPreferenceChat).toBe(true);
    expect((await claimPreferencePromptChat('u1', 'chat-2')).isPreferenceChat).toBe(true);
    expect((await claimPreferencePromptChat('u1', 'chat-1')).isPreferenceChat).toBe(true);
    expect((await claimPreferencePromptChat('u1', 'chat-3')).isPreferenceChat).toBe(true);
    const fourth = await claimPreferencePromptChat('u1', 'chat-4');
    expect(fourth.isPreferenceChat).toBe(false);
    expect(fourth.sessionIds).toEqual(['chat-1', 'chat-2', 'chat-3']);
    expect((await claimPreferencePromptChat('u1', 'chat-2')).isPreferenceChat).toBe(true);
  });

  it('counts per account, so an existing user starts from zero', async () => {
    expect(await readPreferencePromptChatIds('u2')).toEqual([]);
    expect((await claimPreferencePromptChat('u2', 'chat-a')).isPreferenceChat).toBe(true);
    expect(await readPreferencePromptChatIds(null)).toEqual([]);
  });
});

describe('which preference question the app asks', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pickPreferenceQuestion } = require('@/lib/preferencePromptChats');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { findPreferenceForAnswer } = require('@/lib/aiSavedPreferences');
  const pick = (userText: string, extra: Record<string, unknown> = {}) =>
    pickPreferenceQuestion({ intent: null, userText, isDraft: false, isPlan: false, ...extra }).field;

  it('asks about tone for writing, plan style for planning, otherwise how much at once', () => {
    expect(pick('Write a message to my landlord')).toBe('tone');
    expect(pick('anything', { isDraft: true })).toBe('tone');
    expect(pick('Help me plan my week')).toBe('planStyle');
    expect(pick('I keep putting off my taxes')).toBe('detail');
    expect(pick('hi', { intent: 'write' })).toBe('tone');
  });

  it('offers answers the remember prompt recognises', () => {
    for (const userText of ['Write an email', 'Plan my day', 'Do my taxes']) {
      const question = pickPreferenceQuestion({ intent: null, userText, isDraft: false, isPlan: false });
      for (const option of question.options) {
        expect(findPreferenceForAnswer(option)?.field).toBe(question.field);
      }
    }
  });
});

describe('which chats can still show a preference question', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isPreferencePromptChatOpen } = require('@/lib/preferencePromptChats');

  it('is open until three chats have shown one, and stays open in those three', () => {
    expect(isPreferencePromptChatOpen([], 'calendar-chat')).toBe(true);
    expect(isPreferencePromptChatOpen(['a', 'b'], 'c')).toBe(true);
    expect(isPreferencePromptChatOpen(['a', 'b', 'c'], 'b')).toBe(true);
    expect(isPreferencePromptChatOpen(['a', 'b', 'c'], 'd')).toBe(false);
    expect(isPreferencePromptChatOpen(['a'], null)).toBe(false);
  });
});
