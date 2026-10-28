import { getPlanLegendKinds } from '../cards/PlanLegendCard';
import { differenceInCalendarDays, format } from 'date-fns';
import { getToolHandler } from '.';
import { presentTodoResult, presentCalendarResult, presentGoogleResult, presentGuidanceResult, presentAppNavigationResult } from './presenters';
import { getLastDayPlan, removeCreatedCalendarItems, removeLastCalendarItems, setLastDayPlan, setLastCalendarItems, setLastQueryItems } from './memory';
import type { ExecuteResult, ToolCall } from './types';
import { countAiActionsDone, getAiActionCost } from './aiActionMeter';
import {
  AI_ACTIONS_LIMIT_ERROR,
  AI_ACTIONS_LOW_THRESHOLD,
  getAiActionsAllowance,
  getRemainingAiActions,
  releaseAiActions,
  reserveAiActions,
} from '@/lib/aiActions';

type ExecuteToolDeps = {
  serverUrl: string;
  router?: any;
  requestText?: string;
  renameChatTitle?: (title: string) => Promise<{ title: string }>;
};

// Home's plan card can show today and the next 6 days (HOME_PLAN_MAX_DAY_OFFSET).
const HOME_PLAN_DAYS_AHEAD = 6;

/** The "go to schedule" button for a saved plan, opening Home on the plan's day. */
const getHomeScheduleShortcut = (date?: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!match) return null;
  const planDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const offset = differenceInCalendarDays(planDay, new Date());
  if (offset < 0 || offset > HOME_PLAN_DAYS_AHEAD) return null;
  const dayName = offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : format(planDay, 'EEEE');
  return {
    type: 'navigationShortcut',
    label: `${dayName}'s schedule (home)`,
    route: '/(tabs)/home',
    params: { planDate: date },
  };
};

export async function executeToolCall(
  call: ToolCall,
  deps: ExecuteToolDeps
): Promise<ExecuteResult> {
  const name = String(call?.name || '');
  const args = call?.arguments;
  let success = true;
  let result: any = null;
  let error: string | undefined = undefined;
  // AI actions (lib/aiActions.ts): reserved before anything changes, settled after.
  const actionCost = getAiActionCost(name, args);
  let reservedActions = 0;
  let skippedActions = 0;
  const remainingBefore = getRemainingAiActions();
  try {
    if (actionCost) {
      reservedActions = await reserveAiActions(actionCost.count);
      const canSplit = !!actionCost.trim || !!actionCost.countAfter;
      if (reservedActions === 0 || (reservedActions < actionCost.count && !canSplit)) {
        await releaseAiActions(reservedActions);
        skippedActions = actionCost.count;
        reservedActions = 0;
        throw new Error(AI_ACTIONS_LIMIT_ERROR);
      }
      if (reservedActions < actionCost.count && actionCost.trim) {
        skippedActions = actionCost.count - reservedActions;
      }
    }
    if (name === 'chat_rename') {
      const title = typeof args?.title === 'string' ? String(args.title).trim() : '';
      if (!title || !deps.renameChatTitle) {
        success = false; error = 'CHAT_RENAME_UNAVAILABLE';
      } else {
        result = await deps.renameChatTitle(title);
      }
    } else {
      const handler = getToolHandler(name);
      if (!handler) {
        success = false; error = `Unknown tool: ${name}`;
      } else {
        const handlerArgs = name === 'app_open_screen'
          ? { ...(args && typeof args === 'object' ? args : {}), requestText: deps.requestText || '' }
          : skippedActions && actionCost?.trim
          ? actionCost.trim(args, reservedActions)
          : args;
        result = await handler(handlerArgs);
      }
    }
  } catch (e: any) {
    success = false; error = String(e?.message || e || 'Tool execution failed');
    if (name === 'save_day_plan' && error !== 'DAY_PLAN_TIME_REQUIRED' && error !== AI_ACTIONS_LIMIT_ERROR) {
      setLastDayPlan(null);
    }
    if (name === 'calendar_get_details' && error === 'EVENT_NOT_FOUND') {
      const source = args?.source === 'google' ? 'google' as const : 'local' as const;
      const staleItem = [{ id: String(args?.id || ''), source }];
      removeLastCalendarItems(staleItem);
      removeCreatedCalendarItems(staleItem);
    }
  }

  if (actionCost && error !== AI_ACTIONS_LIMIT_ERROR) {
    // Only what actually happened counts: failed and skipped items are given back. Changes to
    // "everything on a day" are counted once known.
    const done = success ? countAiActionsDone(name, result) : 0;
    if (done < reservedActions) await releaseAiActions(reservedActions - done);
    else if (done > reservedActions) await reserveAiActions(done - reservedActions);
  }
  const allowance = getAiActionsAllowance();
  const remainingAfter = getRemainingAiActions(allowance);
  const limitReached = error === AI_ACTIONS_LIMIT_ERROR;
  if (limitReached || skippedActions) {
    // Tells Eazee what happened, so its reply matches.
    result = {
      ...(result && typeof result === 'object' ? result : {}),
      aiActionsLimit: {
        limit: allowance?.limit ?? null,
        notDone: skippedActions,
        note: 'The free daily AI action limit was reached, so these items were not done. The user can still chat as much as they like; Eazee Pro has unlimited AI actions.',
      },
    };
  }

  // Present results into chat-friendly messages/cards and optional navigation actions
  let messages: ExecuteResult['messages'] = [];
  let uiActions: ExecuteResult['uiActions'] = undefined;
  try {
    if (success) {
      if (name === 'chat_rename') {
        const title = String(result?.title || '').trim();
        messages = [{
          role: 'assistant',
          content: title ? `Renamed this chat to ${title}.` : 'Renamed this chat.',
        }];
      } else if (name === 'app_open_screen') {
        const pres = presentAppNavigationResult(name, result);
        messages = pres.messages || [];
        uiActions = pres.uiActions;
      } else if (name.startsWith('goal_') || name.startsWith('guidance_')) {
        const pres = presentGuidanceResult(name, result);
        messages = pres.messages || [];
      } else if (name.startsWith('google_')) {
        const pres = presentGoogleResult(name, result);
        messages = pres.messages || [];
        uiActions = pres.uiActions;
      } else if (name.startsWith('todo_') || name.startsWith('todo.') || name.includes('todo')) {
        const pres = presentTodoResult(name, result);
        messages = pres.messages || [];
      } else if (name.startsWith('calendar_')) {
        const pres = presentCalendarResult(name, result);
        messages = pres.messages || [];
        uiActions = pres.uiActions;
      } else if (name === 'plan_my_day') {
        const date = typeof result?.date === 'string' ? result.date : new Date().toISOString().slice(0, 10);
        const draftId = typeof result?.draftId === 'string' ? result.draftId : undefined;
        const calendarItems = Array.isArray(result?.calendarItems) ? result.calendarItems : [];
        const todoItems = Array.isArray(result?.todoItems) ? result.todoItems : [];
        const timelineItems = Array.isArray(result?.timelineItems) ? result.timelineItems : undefined;
        const saveBlockedReason = typeof result?.saveBlockedReason === 'string' ? result.saveBlockedReason : undefined;
        const card = { type: 'dayPlan', draftId, date, calendarItems, todoItems, timelineItems, saveBlockedReason };
        setLastDayPlan({ draftId, date, calendarItems, todoItems, timelineItems, saveBlockedReason });
        // A day plan shows only its new items, so the key leaves out "already in your calendar".
        const legendKinds = getPlanLegendKinds([timelineItems || []]).filter((kind) => kind !== 'blocker');
        messages = [
          {
            role: 'assistant',
            content: "Here's your plan. Say 'looks good' to save it, or reply with edits.",
          },
          ...(legendKinds.length ? [{ role: 'assistant' as const, content: '', card: { type: 'planLegend', kinds: legendKinds } }] : []),
          {
            role: 'assistant',
            content: '',
            card,
          },
        ];
      } else if (name === 'plan_my_week') {
        const days: any[] = Array.isArray(result?.days) ? result.days : [];
        const cards = days.map((day) => ({
          type: 'dayPlan' as const,
          draftId: typeof day?.draftId === 'string' ? day.draftId : undefined,
          date: String(day?.date || ''),
          mainGoal: typeof day?.mainGoal === 'string' ? day.mainGoal : undefined,
          repeatWeekly: false,
          calendarItems: Array.isArray(day?.calendarItems) ? day.calendarItems : [],
          todoItems: Array.isArray(day?.todoItems) ? day.todoItems : [],
          timelineItems: Array.isArray(day?.timelineItems) ? day.timelineItems : undefined,
          saveBlockedReason: typeof day?.saveBlockedReason === 'string' ? day.saveBlockedReason : undefined,
        }));
        const first = cards[0];
        if (first) setLastDayPlan(first);
        const unscheduledTasks: string[] = Array.isArray(result?.unscheduledTasks)
          ? result.unscheduledTasks.filter((title: unknown): title is string => typeof title === 'string' && !!title.trim())
          : [];
        messages = [
          {
            role: 'assistant',
            content: [
              `Here's your week: ${cards.length} ${cards.length === 1 ? 'day' : 'days'}, each with its main focus and schedule.`,
              "Tap Save plan on a day, or Save all at the end, to add it to your calendar. Turn on Repeat weekly to keep a day's schedule every week. Reply with any changes.",
              ...(unscheduledTasks.length
                ? [`These tasks didn't fit this week: ${unscheduledTasks.map((title) => `"${title}"`).join(', ')}. Ask me to swap them in for something else.`]
                : []),
            ].join(' '),
          },
          // One colour key for the whole week, above its day cards.
          ...(() => {
            const kinds = getPlanLegendKinds(cards.map((card) => card.timelineItems || []));
            return kinds.length ? [{ role: 'assistant' as const, content: '', card: { type: 'planLegend', kinds } }] : [];
          })(),
          ...cards.map((card) => ({ role: 'assistant' as const, content: '', card })),
          ...(cards.length > 1
            ? [{
                role: 'assistant' as const,
                content: '',
                card: { type: 'weekPlanSaveAll', draftIds: cards.map((card) => card.draftId).filter(Boolean) },
              }]
            : []),
        ];
      } else if (name === 'save_day_plan') {
        const savedPlan = getLastDayPlan();
        const homeShortcut = getHomeScheduleShortcut(savedPlan?.date);
        setLastDayPlan(null);
        messages = [
          {
            role: 'assistant',
            content: result?.repeatWeekly ? 'Added to your calendar, repeating every week.' : 'Added to your schedule.',
          },
          ...(homeShortcut ? [{ role: 'assistant' as const, content: '', card: homeShortcut }] : []),
        ];
      } else if (name === 'daily_overview') {
        const date = result?.date || new Date().toISOString().slice(0, 10);
        const todos = Array.isArray(result?.todos) ? result.todos : [];
        const calendar = Array.isArray(result?.calendar) ? result.calendar : [];
        if (calendar.length) {
          setLastCalendarItems(calendar);
        }
        if (todos.length) {
          setLastQueryItems(todos);
        }
        messages = [
          {
            role: 'assistant',
            content: "Here's your overview.",
          },
          {
            role: 'assistant',
            content: '',
            card: { type: 'dailyOverview', date, todos, calendar },
          },
        ];
      } else {
        messages = [{ role: 'assistant', content: 'Done.' }];
      }
    } else {
      if (limitReached) {
        messages = [];
      } else if (name === 'calendar_get_details' && error === 'EVENT_NOT_FOUND') {
        messages = [{ role: 'assistant', content: 'That event no longer exists.' }];
      } else if (name === 'save_day_plan' && error === 'DAY_PLAN_TIME_REQUIRED') {
        messages = [{ role: 'assistant', content: 'Set a time for every event before saving this plan.' }];
      } else if (name.startsWith('calendar_') && error === 'GOOGLE_AUTH_REQUIRED') {
        messages = [{ role: 'assistant', content: 'Google Calendar needs to be reconnected.' }];
      } else {
        messages = [{ role: 'assistant', content: 'Something went wrong while I was doing that.' }];
      }
    }
  } catch {
    // If presenter fails, still return a generic message
    if (success) messages = [{ role: 'assistant', content: 'Done.' }];
    else if (name === 'calendar_get_details' && error === 'EVENT_NOT_FOUND') messages = [{ role: 'assistant', content: 'That event no longer exists.' }];
    else if (name === 'save_day_plan' && error === 'DAY_PLAN_TIME_REQUIRED') messages = [{ role: 'assistant', content: 'Set a time for every event before saving this plan.' }];
    else messages = [{ role: 'assistant', content: 'Something went wrong while I was doing that.' }];
  }

  // The limit card when the day's actions run out (or a request did not fit), and a quiet notice
  // when only a couple are left.
  if (actionCost && allowance?.limit != null) {
    if (limitReached || skippedActions || (remainingAfter === 0 && remainingBefore !== 0)) {
      messages = [...(messages || []), { role: 'assistant', content: '', card: { type: 'aiActionsLimit', limit: allowance.limit, notDone: skippedActions } }];
    } else if (
      remainingAfter !== null && remainingAfter > 0 && remainingAfter <= AI_ACTIONS_LOW_THRESHOLD
      && (remainingBefore === null || remainingBefore > AI_ACTIONS_LOW_THRESHOLD)
    ) {
      messages = [...(messages || []), { role: 'assistant', content: '', card: { type: 'aiActionsNotice', remaining: remainingAfter, limit: allowance.limit } }];
    }
  }

  return { success, messages, uiActions, error, result };
}
