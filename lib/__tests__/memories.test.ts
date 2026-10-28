jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
}));
jest.mock('@/config/backend', () => ({ SERVER_URL: 'https://server.test' }));
jest.mock('@/firebaseConfig', () => ({ auth: { currentUser: null } }));
jest.mock('@/lib/firebaseAppCheck', () => ({ getFirebaseAppCheckHeaders: async () => ({}) }));

import { parseAssistantMessageExtras } from '@/lib/assistantMessageExtras';
import { buildChatMemories, normalizeMemoryState } from '@/lib/memories';

describe('memory markers', () => {
  it('reads memories and forgets, hides them, and keeps at most two of each', () => {
    const extras = parseAssistantMessageExtras(
      'Good luck with the exams!\n[[memory: Is a nursing student]]\n[[memory: Has exams in May]]\n[[memory: Third one]]\n[[forget: Works nights]]'
    );
    expect(extras.text).toBe('Good luck with the exams!');
    expect(extras.memories).toEqual(['Is a nursing student', 'Has exams in May']);
    expect(extras.forget).toEqual(['Works nights']);
  });

  it('ignores empty markers and replies without them', () => {
    expect(parseAssistantMessageExtras('Hi [[memory: ]]').memories).toEqual([]);
    expect(parseAssistantMessageExtras('Plain reply').memories).toEqual([]);
  });
});

describe('chat memories', () => {
  it('sends the memory texts only while memory is on', () => {
    const state = normalizeMemoryState({
      enabled: true,
      memories: [{ id: 'a', text: 'Is a nursing student', source: 'chat', createdAt: 1, updatedAt: 1 }, { bad: true }],
    });
    expect(buildChatMemories(state)).toEqual(['Is a nursing student']);
    expect(buildChatMemories({ ...state, enabled: false })).toBeUndefined();
  });
});
