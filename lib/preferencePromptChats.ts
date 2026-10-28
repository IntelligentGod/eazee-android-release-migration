import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SavedPreferenceField } from '@/lib/aiSavedPreferences';

/**
 * The preference follow-ups ("Timed schedule or flexible list?" then "Should I remember
 * that you prefer …?") run in an account's first few chats where they are actually shown,
 * then stop. A chat with nothing to ask (a calendar change, say) does not use one up.
 * Kept per account on this device.
 */
export const PREFERENCE_PROMPT_CHAT_LIMIT = 3;

// v2: everyone, testers included, gets three fresh chats with the app-asked question.
// v4: counted only where a question was shown; everyone starts fresh.
const storageKey = (userId: string) => `preferencePromptChats:v4:${userId}`;

export async function readPreferencePromptChatIds(userId?: string | null): Promise<string[]> {
  if (!userId) return [];
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(storageKey(userId))) || '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string').slice(0, PREFERENCE_PROMPT_CHAT_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Whether this chat may still show a preference question: it already has, or there is room. */
export const isPreferencePromptChatOpen = (countedChatIds: string[], sessionId: string | null | undefined) =>
  !!sessionId && (countedChatIds.includes(sessionId) || countedChatIds.length < PREFERENCE_PROMPT_CHAT_LIMIT);

/**
 * Counts this chat as one of the first few if there is room; called once a question shows. Returns the counted chats
 * and whether this one is among them.
 */
export async function claimPreferencePromptChat(userId: string, sessionId: string) {
  const sessionIds = await readPreferencePromptChatIds(userId);
  if (sessionIds.includes(sessionId)) return { sessionIds, isPreferenceChat: true };
  if (sessionIds.length >= PREFERENCE_PROMPT_CHAT_LIMIT) return { sessionIds, isPreferenceChat: false };
  const next = [...sessionIds, sessionId];
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {}
  return { sessionIds: next, isPreferenceChat: true };
}

/** For a counted chat outside the first-use flow, which has its own version of this. */
export const PREFERENCE_FOLLOW_UP_SYSTEM_MESSAGE = [
  'PREFERENCE FOLLOW-UP (this is one of the user\'s first chats).',
  'When a choice about how the user likes things would materially improve this result, ask it once in this conversation with [[options: ...]] buttons, keeping free-text replies welcome. Examples: planning: [[options: Timed schedule | Flexible priority list]]; getting started: [[options: One small step | The full plan]]; writing: [[options: Professional | Friendly | Direct]].',
  'Skip the question when the user already said it or a saved preference covers it, and never interrupt useful work to collect profile information. Apply the answer to this task only; do not treat a task choice as a permanent trait.',
  'After you deliver the result, you may ask once whether to remember the preference the user chose, with [[remember: ...]]. Do not save it yourself unless they explicitly ask.',
].join('\n');

export type PreferenceQuestion = { field: SavedPreferenceField; question: string; options: string[] };

/** The answers match the saved-preference labels, so a tap can be offered for remembering. */
export const PREFERENCE_QUESTIONS: Record<'planStyle' | 'detail' | 'tone', PreferenceQuestion> = {
  planStyle: {
    field: 'planStyle',
    question: 'Quick question: do you like plans as a timed schedule or a flexible priority list?',
    options: ['Timed schedule', 'Flexible priority list'],
  },
  detail: {
    field: 'detail',
    question: 'Quick question: would you rather start with one small step, or see the full plan?',
    options: ['One small step', 'The full plan'],
  },
  tone: {
    field: 'tone',
    question: 'Quick question: should messages like this sound professional, friendly or direct?',
    options: ['Professional', 'Friendly', 'Direct'],
  },
};

const WRITING_RE = /\b(write|draft|message|email|e-mail|text|reply|letter|post|caption|note to)\b/i;
const PLANNING_RE = /\b(plan|schedule|day|week|today|tomorrow|routine|calendar|tasks?|to-?dos?)\b/i;

/** Which question fits the chat: tone for writing, plan style for planning, otherwise how much at once. */
export function pickPreferenceQuestion(input: {
  intent?: string | null;
  userText: string;
  isDraft: boolean;
  isPlan: boolean;
}): PreferenceQuestion {
  if (input.intent === 'write' || input.isDraft || WRITING_RE.test(input.userText)) return PREFERENCE_QUESTIONS.tone;
  if (input.intent === 'plan_day' || input.isPlan || PLANNING_RE.test(input.userText)) return PREFERENCE_QUESTIONS.planStyle;
  return PREFERENCE_QUESTIONS.detail;
}
