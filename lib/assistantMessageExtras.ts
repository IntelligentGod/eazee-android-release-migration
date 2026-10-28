import { isValidSavedPreference, type SavedPreferenceField } from '@/lib/aiSavedPreferences';

/**
 * Eazee's replies can end with small markers, such as [[options: A | B]], that the
 * app turns into buttons and review cards. They are hidden from the visible text.
 * Every save still goes through the app (review, confirm, then save), so a marker
 * only ever proposes an action.
 */
export type AssistantResultKind = 'plan' | 'draft' | 'comparison' | 'first_step' | 'breakdown' | 'goal_plan';
export type GoalTimeframe = 'thisWeek' | 'thisMonth' | 'thisYear' | 'longTerm';

export type AssistantMessageExtras = {
  /** The reply with every marker removed. */
  text: string;
  options: string[];
  tasks: string[];
  goal: { title: string; timeframe: GoalTimeframe } | null;
  remember: { field: SavedPreferenceField; value: string; question: string } | null;
  savePreferences: { field: SavedPreferenceField; value: string }[];
  /** Lasting facts to remember ([[memory: ...]]) and ones to forget ([[forget: ...]]). */
  memories: string[];
  forget: string[];
  result: AssistantResultKind | null;
  copyable: boolean;
};

const RESULT_KINDS: AssistantResultKind[] = ['plan', 'draft', 'comparison', 'first_step', 'breakdown', 'goal_plan'];
const GOAL_TIMEFRAMES: GoalTimeframe[] = ['thisWeek', 'thisMonth', 'thisYear', 'longTerm'];
const MAX_OPTIONS = 4;
const MAX_TASKS = 8;
const MAX_ITEM_LENGTH = 120;

const MARKER_PATTERN = /\[\[\s*([a-z_]+)\s*(?::([^\]]*))?\]\]/gi;

const splitItems = (value: string, max: number) =>
  value
    .split('|')
    .map((item) => item.trim().replace(/\s+/g, ' ').slice(0, MAX_ITEM_LENGTH))
    .filter(Boolean)
    .filter((item, index, items) => items.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, max);

const parsePreference = (value: string) => {
  const [field, preferenceValue] = value.split('=').map((part) => part.trim());
  return isValidSavedPreference(field, preferenceValue) ? { field, value: preferenceValue } : null;
};

export const EMPTY_ASSISTANT_EXTRAS: Omit<AssistantMessageExtras, 'text'> = {
  options: [],
  tasks: [],
  goal: null,
  remember: null,
  savePreferences: [],
  memories: [],
  forget: [],
  result: null,
  copyable: false,
};
const MAX_MEMORIES_PER_REPLY = 2;
const MAX_MEMORY_LENGTH = 200;

export function parseAssistantMessageExtras(content: string | undefined | null): AssistantMessageExtras {
  const raw = String(content || '');
  if (!raw.includes('[[')) return { ...EMPTY_ASSISTANT_EXTRAS, text: raw };

  const extras: Omit<AssistantMessageExtras, 'text'> = { ...EMPTY_ASSISTANT_EXTRAS, savePreferences: [], memories: [], forget: [] };
  const withoutMarkers = raw.replace(MARKER_PATTERN, (_match, rawName: string, rawValue: string | undefined) => {
    const name = rawName.toLowerCase();
    const value = (rawValue || '').trim();
    if (name === 'options') extras.options = splitItems(value, MAX_OPTIONS);
    if (name === 'tasks') extras.tasks = splitItems(value, MAX_TASKS);
    if (name === 'goal') {
      const [title, timeframe] = value.split('|').map((part) => part.trim());
      if (title) {
        extras.goal = {
          title: title.slice(0, MAX_ITEM_LENGTH),
          timeframe: GOAL_TIMEFRAMES.includes(timeframe as GoalTimeframe) ? timeframe as GoalTimeframe : 'thisWeek',
        };
      }
    }
    if (name === 'remember') {
      const [preference, ...questionParts] = value.split('|');
      const parsed = parsePreference(preference || '');
      const question = questionParts.join('|').trim();
      if (parsed && question) extras.remember = { ...parsed, question: question.slice(0, 200) };
    }
    if (name === 'save_preference') {
      const parsed = parsePreference(value);
      if (parsed) extras.savePreferences.push(parsed);
    }
    if ((name === 'memory' || name === 'forget') && value.length >= 2) {
      const list = name === 'memory' ? extras.memories : extras.forget;
      const fact = value.replace(/\s+/g, ' ').slice(0, MAX_MEMORY_LENGTH);
      if (list.length < MAX_MEMORIES_PER_REPLY && !list.some((item) => item.toLowerCase() === fact.toLowerCase())) list.push(fact);
    }
    if (name === 'result' && RESULT_KINDS.includes(value as AssistantResultKind)) extras.result = value as AssistantResultKind;
    if (name === 'copy') extras.copyable = true;
    return '';
  });

  // While a reply streams in, a marker can be half written; never show it.
  const text = withoutMarkers.replace(/\[\[[^\]]*$/, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { ...extras, text };
}

/** The visible text only, for titles, summaries and copying. */
export const stripAssistantMarkers = (content: string | undefined | null) => parseAssistantMessageExtras(content).text;

/** Explains the markers to the model; sent with normal chats. */
export const ASSISTANT_ACTION_MARKERS_INSTRUCTIONS = [
  'App buttons: end a reply with markers on their own lines; the app hides them and shows buttons instead. Never mention or explain them.',
  'Required: whenever a reply gives a plan, steps, a draft, a comparison or a breakdown, end it with [[options: ...]] holding 2-3 short follow-ups that fit it; if it contains concrete tasks the user could do, also add [[tasks: ...]] with those tasks as short titles; if it is a draft, also add [[copy]]. Casual replies and quick answers need no markers.',
  '- [[options: A | B | C]] up to 4 short tappable replies, for a quick choice (e.g. "Timed schedule | Flexible priority list") or follow-ups after a result (e.g. "Make it shorter | Adjust the tone"). Tapping sends that text as the user\'s message.',
  '- [[tasks: Task one | Task two]] to offer adding tasks you proposed to their To Do. The app shows them for review and only adds them after the user confirms. Do not say they were added.',
  '- [[goal: Goal title | thisWeek]] to offer saving a goal (timeframe: thisWeek, thisMonth, thisYear or longTerm). The app asks the user to confirm first.',
  '- [[copy]] after a draft the user may want to copy (a message, CV text, email).',
  '- [[result: plan|draft|comparison|first_step|breakdown|goal_plan]] when this reply delivers a usable result.',
  '- [[remember: field=value | Question]] to ask whether to remember a preference the user chose, e.g. [[remember: planStyle=flexible | Should I remember that you prefer flexible plans?]]. Fields: planStyle (timed, flexible), detail (one_step, full_plan), tone (professional, friendly, direct), responseLength (short, detailed). At most once in a conversation, and only when a system message for this conversation says you may.',
  '- [[save_preference: field=value]] only when the user explicitly asks for a lasting preference ("always keep answers short"). A one-off request ("keep this one short") is not a lasting preference. Do not claim it was saved; the app confirms it.',
  'When the user explicitly asks you to create tasks, events or goals, keep using your tools for that as usual.',
].join('\n');
