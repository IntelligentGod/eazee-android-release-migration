import { useCallback, useEffect, useRef, useState } from 'react';
import { buildCompactActionSystemMessages } from '@/app/(tabs)/chat/prompt';
import { getToolHandler } from '@/app/(tabs)/chat/tools';
import { executeToolCall } from '@/app/(tabs)/chat/tools/engine';
import { AI_ACTIONS_LIMIT_ERROR, getAiActionsLimitMessage } from '@/lib/aiActions';
import type { UiAction } from '@/app/(tabs)/chat/tools/types';
import {
  getCompactNoticeTargetForAppScreen,
  getCompactNoticeTargetForMutation,
  type CompactAiNoticeTarget,
} from '@/lib/compactAiNoticeTargets';
import { dedupeToolCallsByBatchKey, getToolCallExecutionKey } from '@/lib/toolCallKeys';
import {
  getCreatedCalendarItems,
  getCreatedTodoItems,
  getLastCalendarItems,
  getLastDayPlan,
  getLastQueryItems,
} from '@/app/(tabs)/chat/tools/memory';
import { auth } from '@/firebaseConfig';
import { SERVER_URL } from '@/config/backend';
import { readAiPersonalizationSettings } from '@/lib/aiPersonalization';
import { AI_AUTH_REQUIRED_MESSAGE, getAiResponseErrorMessage } from '@/lib/aiAuth';
import { getAiRequestHeaders } from '@/lib/aiRequest';
export type { CompactAiNoticeTarget } from '@/lib/compactAiNoticeTargets';

type CompactSurface = 'todo' | 'calendar' | 'home';

type MutationSuccessInfo = {
  name: string;
  result: any;
};

type UiActionInfo = {
  name: string;
  result: any;
};

type UseCompactTabAIOptions = {
  onMutationSuccess?: (info: MutationSuccessInfo) => Promise<void> | void;
  onUiActions?: (actions: UiAction[], info: UiActionInfo) => Promise<void> | void;
};

type HiddenMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type CompactAiChatHandoff = {
  surface: CompactSurface;
  history: HiddenMessage[];
  reason: string;
};

export type CompactAiNoticeCalendarItem = {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  isAllDay?: boolean;
  source: 'local' | 'google';
  location?: string;
  details?: string;
};

export type CompactAiNotice = {
  kind: 'toast' | 'clarify' | 'handoff' | 'error' | 'confirm';
  message: string;
  actionLabel?: string;
  actionVariant?: 'default' | 'destructive';
  calendarItems?: CompactAiNoticeCalendarItem[];
  target?: CompactAiNoticeTarget;
};

type CalendarDeleteToolCall = {
  callId?: string;
  name: 'calendar_delete';
  arguments?: any;
};

type PendingConfirmation = {
  kind: 'calendar_delete';
  toolCalls: CalendarDeleteToolCall[];
  history: HiddenMessage[];
};

const MAX_ROUTE_ROUNDS = 3;
const TOAST_MS = 3500;
const MAX_TRACKED_TOOL_CALL_KEYS = 100;
const MUTATION_TOOL_NAMES = new Set([
  'todo_create_many',
  'todo_delete_many',
  'todo_delete_by_day_except',
  'todo_complete_many',
  'todo_edit_many',
  'todo_star_toggle_many',
  'calendar_create',
  'calendar_update',
  'calendar_delete',
]);
const SURFACE_ALLOWED_TOOL_NAMES: Record<CompactSurface, Set<string>> = {
  todo: new Set([
    'app_open_screen',
    'todo_create_many',
    'todo_delete_many',
    'todo_delete_by_day_except',
    'todo_complete_many',
    'todo_edit_many',
    'todo_star_toggle_many',
    'todo_query',
  ]),
  calendar: new Set([
    'app_open_screen',
    'calendar_fetch_range',
    'calendar_get_details',
    'calendar_create',
    'calendar_update',
    'calendar_delete',
    'calendar_search',
  ]),
  home: new Set([
    'app_open_screen',
    'todo_create_many',
    'todo_delete_many',
    'todo_delete_by_day_except',
    'todo_complete_many',
    'todo_edit_many',
    'todo_star_toggle_many',
    'todo_query',
    'calendar_fetch_range',
    'calendar_get_details',
    'calendar_create',
    'calendar_update',
    'calendar_delete',
    'calendar_search',
  ]),
};

const quoteLabel = (value: unknown) => `“${String(value || '').trim()}”`;
const normalizeCompactText = (value: unknown) => (typeof value === 'string' ? value : '').trim();

const sentenceCaseQuestion = (message: string) => {
  const normalized = normalizeCompactText(message).replace(/\s+/g, ' ');
  if (!normalized) return '';
  const withoutTrailing = normalized.replace(/[?.!]+$/g, '');
  const first = withoutTrailing.charAt(0).toUpperCase();
  const rest = withoutTrailing.slice(1);
  return `${first}${rest}?`;
};

const sentenceCaseStatement = (message: string) => {
  const normalized = normalizeCompactText(message).replace(/\s+/g, ' ');
  if (!normalized) return '';
  const withoutTrailing = normalized.replace(/[?.!]+$/g, '');
  const first = withoutTrailing.charAt(0).toUpperCase();
  const rest = withoutTrailing.slice(1);
  return `${first}${rest}.`;
};

const getNoticeDuration = (notice: CompactAiNotice) => {
  if (notice.kind === 'clarify' || notice.kind === 'confirm' || notice.kind === 'handoff') return null;
  if (notice.target && notice.actionLabel) return null;
  return TOAST_MS;
};

const isNoActionHandoff = (message: string) => /^no .*action requested\.?$/i.test(normalizeCompactText(message));

const humanizeCompactClarifyMessage = (message: string, surface: CompactSurface) => {
  const raw = normalizeCompactText(message).replace(/^CLARIFY:\s*/i, '');
  if (!raw) {
    return surface === 'calendar' ? 'What should I change?' : 'What should I do?';
  }

  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const asksCalendarVsTodo =
    /(calendar event|event|appointment).*(todo|task)|(todo|task).*(calendar event|event|appointment)/.test(normalized);

  if (surface === 'calendar' && asksCalendarVsTodo) {
    return 'What day should I put it on?';
  }

  if (normalized === 'title' || normalized === 'title?' || normalized === 'event title' || normalized === 'event title?') {
    return surface === 'calendar' ? 'What should I call it?' : 'What should I call this?';
  }

  if (normalized === 'date' || normalized === 'date?') {
    return surface === 'calendar' ? 'What day should I put it on?' : 'What day should I use?';
  }

  if (normalized === 'time' || normalized === 'time?') {
    return surface === 'calendar' ? 'What time should it be?' : 'What time should I use?';
  }

  if (normalized === 'start time' || normalized === 'start time?') {
    return 'What time should it start?';
  }

  if (normalized === 'end time' || normalized === 'end time?') {
    return 'What time should it end?';
  }

  if (normalized === 'which event' || normalized === 'which event?') {
    return 'Which event did you mean?';
  }

  if (normalized === 'which todo' || normalized === 'which todo?') {
    return 'Which todo did you mean?';
  }

  return sentenceCaseQuestion(raw);
};

const humanizeCompactHandoffMessage = (message: string) => {
  const raw = normalizeCompactText(message).replace(/^HANDOFF:\s*/i, '');
  if (!raw) {
    return 'Open chat to continue.';
  }

  return sentenceCaseStatement(raw);
};

const buildNowLocalIso = () => {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const pad = (value: number) => String(value).padStart(2, '0');
  const offsetHours = pad(Math.floor(absoluteOffset / 60));
  const offsetMins = pad(absoluteOffset % 60);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${offsetHours}:${offsetMins}`;
};

const getCalendarDeleteKey = (value: { id?: unknown; source?: unknown }) =>
  `${value?.source === 'google' ? 'google' : 'local'}|${String(value?.id || '')}`;

const dedupeCalendarDeleteToolCalls = (toolCalls: CalendarDeleteToolCall[]) => {
  const seen = new Set<string>();
  return toolCalls.filter((toolCall) => {
    const key = getCalendarDeleteKey({
      id: toolCall?.arguments?.id,
      source: toolCall?.arguments?.source,
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const dedupeToolCalls = <T extends { callId?: unknown; name?: unknown; arguments?: unknown; clientRequestId?: unknown }>(
  toolCalls: T[]
) => dedupeToolCallsByBatchKey(toolCalls);

const isAffirmativeConfirmationReply = (message: string) => {
  const normalized = normalizeCompactText(message).toLowerCase().replace(/[.!]+$/g, '');
  if (!normalized) return false;
  return /^(yes|y|delete|delete it|delete them|confirm|go ahead|do it|do that|sure|ok|okay|please do|remove it|remove them)$/.test(normalized);
};

const isNegativeConfirmationReply = (message: string) => {
  const normalized = normalizeCompactText(message).toLowerCase().replace(/[.!]+$/g, '');
  if (!normalized) return false;
  return /^(no|n|cancel|stop|keep it|keep them|don't|dont|do not|never mind|nevermind)$/.test(normalized);
};

const getLatestUserMessage = (messages: HiddenMessage[]) =>
  [...messages].reverse().find((message) => message.role === 'user')?.content || '';

const hasCompactOpenIntent = (message: string) =>
  /\b(open|show|details?|select|choose|pick|where|find|locate)\b/.test(message) ||
  /\b(take me|go to|bring me)\b/.test(message);

const getCompactTodoQueryTarget = (
  result: any,
  hiddenHistory: HiddenMessage[],
  surface: CompactSurface
): { message: string; target: CompactAiNoticeTarget } | null => {
  if (surface !== 'home' && surface !== 'todo') return null;

  const latestUserMessage = getLatestUserMessage(hiddenHistory).toLowerCase();
  const hasExplicitOpenIntent = hasCompactOpenIntent(latestUserMessage);
  const hasGuideSetupIntent =
    /\b(create|make|cook|bake|prepare|start|set up|setup|follow)\b.*\b(recipe|cooking guide|recipe guide|recipe video|video guide|guide video)\b/.test(latestUserMessage) ||
    /\b(recipe|cooking guide|recipe guide|recipe video|video guide|guide video)\b.*\b(create|make|cook|bake|prepare|start|set up|setup|follow)\b/.test(latestUserMessage);
  const wantsTodoDetails = hasExplicitOpenIntent || hasGuideSetupIntent;
  if (!wantsTodoDetails) return null;

  const items = Array.isArray(result?.items) ? result.items : [];
  const totalMatches = Number.isFinite(Number(result?.totalMatches))
    ? Number(result.totalMatches)
    : items.length;
  if (totalMatches !== 1 || items.length !== 1) return null;

  const item = items[0];
  const todoId = String(item?.id || '').trim();
  if (!todoId) return null;

  return {
    message: `Found ${quoteLabel(item?.text)}.`,
    target: {
      type: 'todo',
      todoId,
      workspaceKey: String(item?.workspace || 'Personal'),
    },
  };
};

const getCompactCalendarQueryTarget = (
  result: any,
  hiddenHistory: HiddenMessage[],
  surface: CompactSurface
): { message: string; target: CompactAiNoticeTarget } | null => {
  if (surface !== 'home' && surface !== 'calendar') return null;
  if (result?.openIntent !== true) return null;
  if (!hasCompactOpenIntent(getLatestUserMessage(hiddenHistory).toLowerCase())) return null;

  const items = Array.isArray(result?.items) ? result.items : [];
  const totalMatches = Number.isFinite(Number(result?.totalMatches))
    ? Number(result.totalMatches)
    : items.length;
  if (totalMatches !== 1 || items.length !== 1) return null;

  const item = items[0];
  const eventId = String(item?.id || '').trim();
  const startDate = typeof item?.startDate === 'string' ? item.startDate : '';
  if (!eventId || !startDate) return null;

  const googleEventId =
    typeof item?.googleEventId === 'string' && item.googleEventId.trim()
      ? item.googleEventId.trim()
      : undefined;

  return {
    message: `Found ${quoteLabel(item?.title || 'event')}.`,
    target: {
      type: 'event',
      eventId,
      source: item?.source === 'google' ? 'google' : 'local',
      startDate,
      googleEventId,
    },
  };
};

const buildCalendarDeleteConfirmationMessage = (count: number) =>
  count === 1 ? 'Delete this event? Tap Delete or reply.' : `Delete these ${count} events? Tap Delete or reply.`;

const mapCalendarNoticeItem = (
  item: any,
  fallback: { id: string; source: 'local' | 'google' }
): CompactAiNoticeCalendarItem => ({
  id: String(item?.id || fallback.id),
  title: String(item?.title || '').trim(),
  startDate: typeof item?.startDate === 'string' ? item.startDate : '',
  endDate: typeof item?.endDate === 'string' ? item.endDate : undefined,
  isAllDay: !!item?.isAllDay,
  source: item?.source === 'google' ? 'google' : fallback.source,
  location: typeof item?.location === 'string' && item.location.trim() ? item.location.trim() : undefined,
  details: typeof item?.details === 'string' && item.details.trim() ? item.details.trim() : undefined,
});

const getCalendarItemFromMemory = (id: string, source: 'local' | 'google') => {
  const memoryItems = [...getLastCalendarItems(), ...getCreatedCalendarItems()];
  return memoryItems.find((item) => item.id === id && item.source === source) || null;
};

const resolveCalendarDeleteNoticeItem = async (args: any): Promise<CompactAiNoticeCalendarItem | null> => {
  const id = String(args?.id || '');
  const source: 'local' | 'google' = args?.source === 'google' ? 'google' : 'local';
  if (!id) return null;

  const memoryItem = getCalendarItemFromMemory(id, source);
  if (memoryItem) {
    return mapCalendarNoticeItem(memoryItem, { id, source });
  }

  const detailHandler = getToolHandler('calendar_get_details');
  if (!detailHandler) {
    return mapCalendarNoticeItem({}, { id, source });
  }

  try {
    const result = await detailHandler({ id, source });
    if (result?.item) {
      return mapCalendarNoticeItem(result.item, { id, source });
    }
  } catch {}

  return mapCalendarNoticeItem({}, { id, source });
};

const mutationToastForCall = (name: string, result: any) => {
  if (/^todo_create_many$/.test(name)) {
    const createdItems = Array.isArray(result?.createdItems) ? result.createdItems : [];
    if (createdItems.length === 1) return `Created ${quoteLabel(createdItems[0]?.text)}.`;
    const count = Number(result?.created ?? createdItems.length ?? 0);
    return count === 1 ? 'Created 1 todo.' : `Created ${count} todos.`;
  }

  if (/^todo_delete_many$/.test(name)) {
    const deletedItems = Array.isArray(result?.deletedItems) ? result.deletedItems : [];
    if (deletedItems.length === 1) return `Deleted ${quoteLabel(deletedItems[0]?.text)}.`;
    const count = Number(result?.deleted ?? deletedItems.length ?? 0);
    return count === 1 ? 'Deleted 1 todo.' : `Deleted ${count} todos.`;
  }

  if (/^todo_delete_by_day_except$/.test(name)) {
    const deletedItems = Array.isArray(result?.deletedItems) ? result.deletedItems : [];
    if (deletedItems.length === 1) return `Deleted ${quoteLabel(deletedItems[0]?.text)}.`;
    const count = Number(result?.deleted ?? deletedItems.length ?? 0);
    return count === 1 ? 'Deleted 1 todo.' : `Deleted ${count} todos.`;
  }

  if (/^todo_complete_many$/.test(name)) {
    const completedItems = Array.isArray(result?.completedItems) ? result.completedItems : [];
    if (completedItems.length === 1) return `Completed ${quoteLabel(completedItems[0]?.text)}.`;
    const count = Number(result?.completed ?? completedItems.length ?? 0);
    return count === 1 ? 'Completed 1 todo.' : `Completed ${count} todos.`;
  }

  if (/^todo_edit_many$/.test(name)) {
    const updatedItems = Array.isArray(result?.updatedItems) ? result.updatedItems : [];
    if (updatedItems.length === 1) {
      const label = updatedItems[0]?.newText || updatedItems[0]?.oldText;
      return `Updated ${quoteLabel(label)}.`;
    }
    const count = Number(result?.updated ?? updatedItems.length ?? 0);
    return count === 1 ? 'Updated 1 todo.' : `Updated ${count} todos.`;
  }

  if (/^todo_star_toggle_many$/.test(name)) {
    const affectedItems = Array.isArray(result?.affectedItems) ? result.affectedItems : [];
    if (affectedItems.length === 1) {
      const starred = !!affectedItems[0]?.starred;
      return `${starred ? 'Starred' : 'Unstarred'} ${quoteLabel(affectedItems[0]?.text)}.`;
    }
    const count = Number(result?.affected ?? affectedItems.length ?? 0);
    return count === 1 ? 'Updated 1 todo.' : `Updated ${count} todos.`;
  }

  if (name === 'calendar_create') {
    const title = String(result?.item?.title || '').trim();
    return title ? `Created ${quoteLabel(title)}.` : 'Created calendar event.';
  }

  if (name === 'calendar_update') {
    const title = String(result?.item?.title || '').trim();
    return title ? `Updated ${quoteLabel(title)}.` : 'Updated calendar event.';
  }

  if (name === 'calendar_delete') {
    return 'Deleted calendar event.';
  }

  return 'Done.';
};

const compactOutcomeForTool = (
  name: string,
  result: any,
  success: boolean,
  error?: string,
  hiddenHistory: HiddenMessage[] = [],
  surface: CompactSurface = 'home'
) => {
  if (!success) {
    if (error === AI_ACTIONS_LIMIT_ERROR) {
      return { kind: 'toast' as const, message: getAiActionsLimitMessage(result?.aiActionsLimit?.limit) };
    }
    if (name === 'calendar_get_details' && error === 'EVENT_NOT_FOUND') {
      return { kind: 'toast' as const, message: 'That event no longer exists.' };
    }
    return {
      kind: 'error' as const,
      message: error ? `Something went wrong. (${error})` : 'Something went wrong.',
    };
  }

  if (name === 'app_open_screen') {
    const target = getCompactNoticeTargetForAppScreen(result);
    const label = String(result?.label || 'that screen').trim() || 'that screen';
    return target
      ? {
          kind: 'toast' as const,
          message: `Here's a shortcut to ${label}.`,
          actionLabel: `Open ${label}`,
          target,
        }
      : { kind: 'toast' as const, message: "I couldn't open that screen." };
  }

  if (name === 'todo_query') {
    const items = Array.isArray(result?.items) ? result.items : [];
    if (items.length === 0) {
      return { kind: 'toast' as const, message: "Couldn't find a matching todo." };
    }
    const queryTarget = getCompactTodoQueryTarget(result, hiddenHistory, surface);
    if (queryTarget) {
      return {
        kind: 'toast' as const,
        message: queryTarget.message,
        actionLabel: 'Open todo',
        target: queryTarget.target,
      };
    }
    return { kind: 'continue' as const };
  }

  if (name === 'calendar_search' || name === 'calendar_fetch_range') {
    const items = Array.isArray(result?.items) ? result.items : [];
    if (items.length === 0) {
      return { kind: 'toast' as const, message: "Couldn't find a matching event." };
    }
    const queryTarget = getCompactCalendarQueryTarget(result, hiddenHistory, surface);
    if (queryTarget) {
      return {
        kind: 'toast' as const,
        message: queryTarget.message,
        actionLabel: 'Open event',
        target: queryTarget.target,
      };
    }
    return { kind: 'continue' as const };
  }

  if (name === 'calendar_get_details') {
    return result?.item
      ? { kind: 'continue' as const }
      : { kind: 'toast' as const, message: "Couldn't load that event." };
  }

  const target = getCompactNoticeTargetForMutation(name, result);

  return {
    kind: 'toast' as const,
    message: mutationToastForCall(name, result),
    actionLabel: target ? (target.type === 'todo' ? 'Open todo' : 'Open') : undefined,
    target: target || undefined,
  };
};

const mergeCompactNotices = (
  notices: Pick<CompactAiNotice, 'kind' | 'message' | 'actionLabel' | 'actionVariant' | 'target'>[]
): CompactAiNotice | null => {
  if (notices.length === 0) return null;
  if (notices.length === 1) {
    const [notice] = notices;
    return {
      kind: notice.kind,
      message: notice.message,
      actionLabel: notice.actionLabel,
      actionVariant: notice.actionVariant,
      target: notice.target,
    };
  }

  return {
    kind: notices.some((notice) => notice.kind === 'error' || /went wrong/i.test(notice.message)) ? 'error' : 'toast',
    message: notices.map((notice) => notice.message).join(' '),
  };
};

export function useCompactTabAI(surface: CompactSurface, options: UseCompactTabAIOptions = {}) {
  const { onMutationSuccess, onUiActions } = options;
  const [inputValue, setInputValueState] = useState('');
  const [notice, setNotice] = useState<CompactAiNotice | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<HiddenMessage[]>([]);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingConfirmationRef = useRef<PendingConfirmation | null>(null);
  const inputValueRef = useRef('');
  const handledToolCallKeysRef = useRef(new Set<string>());
  const activeRequestRef = useRef<AbortController | null>(null);

  const setInputValue = useCallback((value: string) => {
    inputValueRef.current = value;
    setInputValueState(value);
  }, []);

  const showNotice = useCallback((nextNotice: CompactAiNotice | null) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setNotice(nextNotice);
    if (!nextNotice) return;
    const duration = getNoticeDuration(nextNotice);
    if (!duration) return;
    toastTimeoutRef.current = setTimeout(() => {
      setNotice((current) => (current === nextNotice ? null : current));
      toastTimeoutRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const buildRouteMessages = useCallback((hiddenHistory: HiddenMessage[], continuedRequest: boolean) => {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return [
      ...buildCompactActionSystemMessages({
        userTimezone,
        nowLocalIso: buildNowLocalIso(),
        activeSessionSummary: '',
        lastResults: getLastQueryItems() || [],
        createdTodoItems: getCreatedTodoItems() || [],
        lastCalendarItems: getLastCalendarItems() || [],
        createdCalendarItems: getCreatedCalendarItems() || [],
        lastDayPlan: getLastDayPlan(),
        continuedRequest,
      }),
      ...hiddenHistory,
    ];
  }, []);

  const executeCompactToolCalls = useCallback(async (toolCalls: any[], hiddenHistory: HiddenMessage[]) => {
    const toastNotices: Pick<CompactAiNotice, 'kind' | 'message' | 'actionLabel' | 'actionVariant' | 'target'>[] = [];
    let shouldContinue = false;
    let handledUiActions = false;

    for (const toolCall of dedupeToolCalls(toolCalls)) {
      const toolCallKey = getToolCallExecutionKey(toolCall);
      if (toolCallKey && handledToolCallKeysRef.current.has(toolCallKey)) {
        continue;
      }
      if (toolCallKey) {
        handledToolCallKeysRef.current.add(toolCallKey);
        if (handledToolCallKeysRef.current.size > MAX_TRACKED_TOOL_CALL_KEYS) {
          const oldestKey = handledToolCallKeysRef.current.values().next().value;
          if (oldestKey) {
            handledToolCallKeysRef.current.delete(oldestKey);
          }
        }
      }
      const result = await executeToolCall(
        { callId: toolCall?.callId, name: toolCall?.name, arguments: toolCall?.arguments },
        { serverUrl: SERVER_URL, requestText: getLatestUserMessage(hiddenHistory) }
      );
      const toolName = String(toolCall?.name || '');
      const resultUiActions = Array.isArray(result?.uiActions)
        ? result.uiActions.filter((action: UiAction) => action?.type !== 'none')
        : [];
      const uiActions = [...resultUiActions];
      if (result?.success && uiActions.length > 0 && onUiActions) {
        await onUiActions(uiActions, { name: toolName, result: result?.result });
        handledUiActions = true;
      }
      const outcome = compactOutcomeForTool(toolName, result?.result, !!result?.success, result?.error, hiddenHistory, surface);

      if (outcome.kind === 'continue') {
        shouldContinue = true;
        continue;
      }

      if (MUTATION_TOOL_NAMES.has(toolName) && result?.success && onMutationSuccess) {
        try {
          await onMutationSuccess({
            name: toolName,
            result: result?.result,
          });
        } catch {}
      }

      toastNotices.push({
        kind: outcome.kind,
        message: outcome.message,
        actionLabel: 'actionLabel' in outcome ? outcome.actionLabel : undefined,
        actionVariant:
          'actionVariant' in outcome && (outcome.actionVariant === 'default' || outcome.actionVariant === 'destructive')
            ? outcome.actionVariant
            : undefined,
        target: 'target' in outcome ? outcome.target : undefined,
      });
    }

    return { shouldContinue, toastNotices, handledUiActions };
  }, [onMutationSuccess, onUiActions, surface]);

  const executePendingConfirmation = useCallback(async (pending: PendingConfirmation) => {
    const { toastNotices } = await executeCompactToolCalls(pending.toolCalls, pending.history);
    showNotice(mergeCompactNotices(toastNotices));
    setHistory([]);
  }, [executeCompactToolCalls, showNotice]);

  const requestRoute = useCallback(async (hiddenHistory: HiddenMessage[], continuedRequest: boolean, signal: AbortSignal) => {
    const messages = buildRouteMessages(hiddenHistory, continuedRequest);
    const aiPersonalization = await readAiPersonalizationSettings(auth.currentUser?.uid);
    const requestBodies = [
      {
        assistantSurface: surface,
        assistantMode: 'compact',
        aiPersonalization,
        messages,
      },
    ];

    let lastError = 'Something went wrong.';
    const headers = await getAiRequestHeaders();

    for (const body of requestBodies) {
      const response = await fetch(`${SERVER_URL}/ai/route`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (response.ok) {
        return response.json().catch(() => null);
      }

      const errorPayload = await response.json().catch(() => null);
      const message = getAiResponseErrorMessage(errorPayload, response.status);
      lastError = message;

      throw new Error(message);
    }

    throw new Error(lastError);
  }, [buildRouteMessages, surface]);

  const runRequest = useCallback(async (hiddenHistory: HiddenMessage[], signal: AbortSignal) => {
    let currentHistory = hiddenHistory;

    for (let round = 0; round < MAX_ROUTE_ROUNDS; round += 1) {
      const routeResponse = await requestRoute(currentHistory, round > 0, signal);
      if (signal.aborted) return;

      if (routeResponse?.status === 'no_tool_calls') {
        const metaKind = routeResponse?.meta?.assistantKind;
        const metaText = String(routeResponse?.meta?.assistantText || routeResponse?.result?.message?.content || '').trim();

        if (metaKind === 'clarify' && metaText) {
          const clarifyMessage = humanizeCompactClarifyMessage(metaText, surface);
          const assistantMessage = `CLARIFY: ${clarifyMessage}`;
          setHistory([...currentHistory, { role: 'assistant', content: assistantMessage }]);
          showNotice({ kind: 'clarify', message: clarifyMessage });
          return;
        }

        if (metaKind === 'handoff' && metaText) {
          if (isNoActionHandoff(metaText)) {
            showNotice(null);
            setHistory([]);
            return;
          }
          const handoffMessage = humanizeCompactHandoffMessage(metaText);
          const assistantMessage = `HANDOFF: ${handoffMessage}`;
          setHistory([...currentHistory, { role: 'assistant', content: assistantMessage }]);
          showNotice({ kind: 'handoff', message: handoffMessage, actionLabel: 'Open chat' });
          return;
        }

        showNotice({
          kind: metaText ? 'toast' : 'error',
          message: metaText || 'Nothing happened.',
        });
        setHistory([]);
        return;
      }

      if (routeResponse?.status !== 'tool_calls_dispatched') {
        showNotice({ kind: 'error', message: 'Something went wrong.' });
        setHistory([]);
        return;
      }

      const toolCalls = Array.isArray(routeResponse?.toolCalls) ? routeResponse.toolCalls : [];
      if (!toolCalls.length) {
        const routingErrors = Array.isArray(routeResponse?.routing?.errors) ? routeResponse.routing.errors : [];
        const message = String(routingErrors[0]?.error || 'Tool routing failed.');
        showNotice({ kind: 'error', message });
        setHistory([]);
        return;
      }

      const allowedToolNames = SURFACE_ALLOWED_TOOL_NAMES[surface];
      const disallowedToolCall = toolCalls.find((toolCall: any) => !allowedToolNames.has(String(toolCall?.name || '')));
      if (disallowedToolCall) {
        showNotice({
          kind: 'error',
          message: `Invalid ${surface} action returned. Open chat to finish this.`,
        });
        setHistory([]);
        return;
      }

      const rawCalendarDeleteToolCalls = toolCalls.filter(
        (toolCall: any) => String(toolCall?.name || '') === 'calendar_delete'
      ) as CalendarDeleteToolCall[];
      const calendarDeleteToolCalls = dedupeCalendarDeleteToolCalls(rawCalendarDeleteToolCalls);
      if (rawCalendarDeleteToolCalls.length > 0 && rawCalendarDeleteToolCalls.length === toolCalls.length) {
        const calendarItems = (
          await Promise.all(calendarDeleteToolCalls.map((toolCall) => resolveCalendarDeleteNoticeItem(toolCall.arguments)))
        ).filter(Boolean) as CompactAiNoticeCalendarItem[];
        if (signal.aborted) return;
        const confirmationMessage = buildCalendarDeleteConfirmationMessage(calendarDeleteToolCalls.length);
        const nextHistory = [...currentHistory, { role: 'assistant' as const, content: confirmationMessage }];
        pendingConfirmationRef.current = {
          kind: 'calendar_delete',
          toolCalls: calendarDeleteToolCalls,
          history: nextHistory,
        };
        setHistory(nextHistory);
        showNotice({
          kind: 'confirm',
          message: confirmationMessage,
          actionLabel: 'Delete',
          actionVariant: 'destructive',
          calendarItems,
        });
        return;
      }

      const { shouldContinue, toastNotices, handledUiActions } = await executeCompactToolCalls(toolCalls, currentHistory);
      if (signal.aborted) return;
      if (shouldContinue) {
        continue;
      }

      if (handledUiActions && toastNotices.length === 0) {
        showNotice(null);
        setHistory([]);
        return;
      }

      showNotice(mergeCompactNotices(toastNotices));
      setHistory([]);
      return;
    }

    const handoffMessage = humanizeCompactHandoffMessage('Open chat to finish this');
    setHistory([...currentHistory, { role: 'assistant', content: `HANDOFF: ${handoffMessage}` }]);
    showNotice({ kind: 'handoff', message: handoffMessage, actionLabel: 'Open chat' });
  }, [executeCompactToolCalls, onUiActions, requestRoute, showNotice, surface]);

  const confirmPendingAction = useCallback(async () => {
    const pending = pendingConfirmationRef.current;
    if (!pending || isRunning) return;

    pendingConfirmationRef.current = null;
    setInputValue('');
    handledToolCallKeysRef.current.clear();
    setIsRunning(true);
    try {
      await executePendingConfirmation(pending);
    } catch (error: any) {
      showNotice({
        kind: 'error',
        message: String(error?.message || error || 'Something went wrong.'),
      });
      setHistory([]);
    } finally {
      setIsRunning(false);
    }
  }, [executePendingConfirmation, isRunning, setInputValue, showNotice]);

  const submitText = useCallback(async (text: string) => {
    const trimmed = normalizeCompactText(text);
    if (!trimmed || isRunning) return;
    if (!auth.currentUser?.uid) {
      showNotice({ kind: 'error', message: AI_AUTH_REQUIRED_MESSAGE });
      return;
    }
    handledToolCallKeysRef.current.clear();
    const request = new AbortController();
    activeRequestRef.current = request;
    const finishRequest = () => {
      if (activeRequestRef.current !== request) return;
      activeRequestRef.current = null;
      setIsRunning(false);
    };

    const pendingConfirmation = pendingConfirmationRef.current;
    if (pendingConfirmation) {
      setInputValue('');
      setIsRunning(true);
      try {
        if (isAffirmativeConfirmationReply(trimmed)) {
          pendingConfirmationRef.current = null;
          await executePendingConfirmation(pendingConfirmation);
          return;
        }

        if (isNegativeConfirmationReply(trimmed)) {
          pendingConfirmationRef.current = null;
          setHistory([]);
          showNotice({ kind: 'toast', message: 'Okay, I did not delete it.' });
          return;
        }

        pendingConfirmationRef.current = null;
        const nextHistory = [...pendingConfirmation.history, { role: 'user' as const, content: trimmed }];
        setHistory(nextHistory);
        showNotice(null);
        await runRequest(nextHistory, request.signal);
        return;
      } catch (error: any) {
        if (request.signal.aborted) return;
        showNotice({
          kind: 'error',
          message: String(error?.message || error || 'Something went wrong.'),
        });
        setHistory([]);
        return;
      } finally {
        finishRequest();
      }
    }

    const nextHistory = [...history, { role: 'user' as const, content: trimmed }];
    setInputValue('');
    setHistory(nextHistory);
    setIsRunning(true);
    if (notice?.kind !== 'clarify') {
      showNotice(null);
    }

    try {
      await runRequest(nextHistory, request.signal);
    } catch (error: any) {
      if (request.signal.aborted) return;
      showNotice({
        kind: 'error',
        message: String(error?.message || error || 'Something went wrong.'),
      });
      setHistory([]);
    } finally {
      finishRequest();
    }
  }, [executePendingConfirmation, history, isRunning, notice?.kind, runRequest, setInputValue, showNotice]);

  // Whether the latest request was spoken; only then does a follow-up question
  // switch the microphone on by itself.
  const lastRequestWasVoiceRef = useRef(false);

  const submit = useCallback(async () => {
    lastRequestWasVoiceRef.current = false;
    await submitText(inputValueRef.current);
  }, [submitText]);

  const submitVoiceText = useCallback(async (text: string) => {
    lastRequestWasVoiceRef.current = true;
    await submitText(text);
  }, [submitText]);

  const wasLastRequestSpoken = useCallback(() => lastRequestWasVoiceRef.current, []);

  const dismissNotice = useCallback(() => {
    if (pendingConfirmationRef.current) {
      pendingConfirmationRef.current = null;
      setHistory([]);
    }
    showNotice(null);
  }, [showNotice]);

  const cancelPending = useCallback(() => {
    pendingConfirmationRef.current = null;
    showNotice(null);
    setHistory([]);
  }, [showNotice]);

  /** Tool calls that already ran are not rolled back; only what is still in flight stops. */
  const stopRequest = useCallback(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    pendingConfirmationRef.current = null;
    setIsRunning(false);
    setHistory([]);
    showNotice(null);
  }, [showNotice]);

  const getHandoffChatParams = useCallback(() => {
    if (notice?.kind !== 'handoff') return null;

    return {
      compactHandoff: JSON.stringify({
        surface,
        history,
        reason: notice.message,
      } satisfies CompactAiChatHandoff),
      compactHandoffNonce: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }, [history, notice, surface]);

  return {
    inputValue,
    setInputValue,
    submit,
    submitText,
    submitVoiceText,
    wasLastRequestSpoken,
    isRunning,
    notice,
    dismissNotice,
    confirmPendingAction,
    cancelPending,
    stopRequest,
    getHandoffChatParams,
    clearConversation: () => {
      pendingConfirmationRef.current = null;
      setHistory([]);
    },
  };
}
