import EventModel from '@/database/models/EventModel';
import GoalGuidancePlanModel from '@/database/models/GoalGuidancePlanModel';
import HomeEventCompletionModel from '@/database/models/HomeEventCompletionModel';
import SkillGuideModel from '@/database/models/SkillGuideModel';
import TaskGuideModel from '@/database/models/TaskGuideModel';
import TodoModel from '@/database/models/TodoModel';
import type { HomeSuggestionCandidate } from '@/lib/homeSuggestions';
import { getTodoOccurrenceDateKey } from '@/lib/todoRecurrence';
import { isSupportedTodoWorkspaceKey } from '@/lib/todoWorkspaces';

export type HomeGoogleEvent = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  isGoogleEvent: true;
  isAllDay?: boolean;
  source: 'google';
};

export type HomeSnapshot = {
  upcomingEvents: (EventModel | HomeGoogleEvent)[];
  suggestionEvents: (EventModel | HomeGoogleEvent)[];
  upcomingTodos: TodoModel[];
  completedHomeEventIds: Set<string>;
  suggestionCandidates: HomeSuggestionCandidate[];
};

type HomeGoalGuidancePlanRow = {
  goalId: string;
  activeTodoId?: string;
  activeStepIndex?: number;
  activeActionsJson?: string;
};

export const createEmptyHomeSnapshot = (): HomeSnapshot => ({
  upcomingEvents: [],
  suggestionEvents: [],
  upcomingTodos: [],
  completedHomeEventIds: new Set(),
  suggestionCandidates: [],
});

export const buildHomeEventCompletionId = (
  eventSource: 'local' | 'google',
  eventKey: string,
  occurrenceStart: Date
) => `${eventSource}:${eventKey}:${occurrenceStart.getTime()}`;

export const getHomeEventCompletionIdentity = (
  event: EventModel | HomeGoogleEvent
) => {
  const linkedGoogleEventId =
    'googleEventId' in event && typeof event.googleEventId === 'string'
      ? event.googleEventId
      : undefined;

  if (event.isGoogleEvent || linkedGoogleEventId) {
    return {
      eventSource: 'google' as const,
      eventKey: String(linkedGoogleEventId ?? event.id),
    };
  }

  return {
    eventSource: 'local' as const,
    eventKey: String(event.id),
  };
};

export const sortTodosByDueDate = (left: TodoModel, right: TodoModel) => {
  const leftDueTime = left.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightDueTime = right.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;

  if (leftDueTime !== rightDueTime) {
    return leftDueTime - rightDueTime;
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
};

export const filterHomeRecurringTodos = (todos: TodoModel[], todayEnd: Date) => {
  const earliestDueTodoBySeries = new Map<string, TodoModel>();

  todos.forEach((todo) => {
    if (!todo.recurrenceSeriesId || !todo.dueDate || todo.dueDate.getTime() > todayEnd.getTime()) {
      return;
    }

    const current = earliestDueTodoBySeries.get(todo.recurrenceSeriesId);
    if (!current || sortTodosByDueDate(todo, current) < 0) {
      earliestDueTodoBySeries.set(todo.recurrenceSeriesId, todo);
    }
  });

  return todos.filter((todo) =>
    !todo.recurrenceSeriesId ||
    !todo.dueDate ||
    todo.dueDate.getTime() > todayEnd.getTime() ||
    earliestDueTodoBySeries.get(todo.recurrenceSeriesId)?.id === todo.id
  );
};

export const filterHomePlanTodos = (
  todos: TodoModel[],
  todayEnd: Date,
  suggestedTodoIds: Set<string>
) => filterHomeRecurringTodos(todos, todayEnd).filter((todo) => !suggestedTodoIds.has(todo.id));

export const isHomeCalendarReadyForSuggestions = (
  googleConnectionState: 'disconnected' | 'connected' | 'needsReconnect',
  googleSyncSucceeded: boolean
) => googleConnectionState === 'disconnected' || googleSyncSucceeded;

const sortEventsByStartDate = (
  left: EventModel | HomeGoogleEvent,
  right: EventModel | HomeGoogleEvent
) => left.startDate.getTime() - right.startDate.getTime();

export const buildCompletedHomeEventIds = (
  completions: Pick<HomeEventCompletionModel, 'eventSource' | 'eventKey' | 'occurrenceStart'>[]
) =>
  new Set(
    completions.map((completion) =>
      buildHomeEventCompletionId(
        completion.eventSource,
        completion.eventKey,
        completion.occurrenceStart
      )
    )
  );

export const getHomeEventCompletionOccurrenceStartTimes = (
  events: (EventModel | HomeGoogleEvent)[]
) => Array.from(new Set(
  events
    .map((event) => event.startDate.getTime())
    .filter((time) => Number.isFinite(time))
));

export const filterHomeEventCompletionsForEvents = (
  completions: Pick<HomeEventCompletionModel, 'eventSource' | 'eventKey' | 'occurrenceStart'>[],
  events: (EventModel | HomeGoogleEvent)[]
) => {
  const eventCompletionIds = new Set(events.map((event) => {
    const { eventSource, eventKey } = getHomeEventCompletionIdentity(event);
    return buildHomeEventCompletionId(eventSource, eventKey, event.startDate);
  }));

  return completions.filter((completion) =>
    eventCompletionIds.has(
      buildHomeEventCompletionId(
        completion.eventSource,
        completion.eventKey,
        completion.occurrenceStart
      )
    )
  );
};

const homeExcludedTodoWorkspaces = new Set(['Goals', 'Wishlist']);

const getGoalGuidanceTodoIdsForHomePlan = (plan: HomeGoalGuidancePlanRow) => {
  const todoIds = new Set<string>();

  if (plan.activeTodoId) {
    todoIds.add(plan.activeTodoId);
  }

  if (!plan.activeActionsJson) {
    return todoIds;
  }

  try {
    const parsed = JSON.parse(plan.activeActionsJson);
    const activeActions = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.activeActions)
        ? parsed.activeActions
        : [];
    activeActions.forEach((action: any) => {
      if (typeof action?.todoId === 'string' && action.todoId.length > 0) {
        todoIds.add(action.todoId);
      }
    });
    if (Array.isArray(parsed?.todoIds)) {
      parsed.todoIds.forEach((todoId: unknown) => {
        if (typeof todoId === 'string' && todoId.length > 0) {
          todoIds.add(todoId);
        }
      });
    }
  } catch {
    return todoIds;
  }

  return todoIds;
};

export const getHiddenHomeGoalGuidanceTodoIds = (
  plans: HomeGoalGuidancePlanRow[],
  rootGoalIds: Set<string>
) => {
  const firstLevelActionTodoIds = new Set<string>();

  plans.forEach((plan) => {
    if (rootGoalIds.has(plan.goalId)) {
      getGoalGuidanceTodoIdsForHomePlan(plan).forEach((todoId) => firstLevelActionTodoIds.add(todoId));
    }
  });

  const hiddenTodoIds = new Set<string>();
  plans.forEach((plan) => {
    if (firstLevelActionTodoIds.has(plan.goalId)) {
      getGoalGuidanceTodoIdsForHomePlan(plan).forEach((todoId) => hiddenTodoIds.add(todoId));
    }
  });

  return hiddenTodoIds;
};

export const buildLocalHomeSnapshot = ({
  events,
  suggestionEvents,
  todos,
  completions,
  excludedTodoIds,
  suggestionCandidates = [],
}: {
  events: EventModel[];
  suggestionEvents?: EventModel[];
  todos: TodoModel[];
  completions: Pick<HomeEventCompletionModel, 'eventSource' | 'eventKey' | 'occurrenceStart'>[];
  excludedTodoIds?: Set<string>;
  suggestionCandidates?: HomeSuggestionCandidate[];
}): HomeSnapshot => ({
  upcomingEvents: [...events].sort(sortEventsByStartDate),
  suggestionEvents: [...(suggestionEvents ?? events)].sort(sortEventsByStartDate),
  upcomingTodos: todos
    .filter((todo) =>
      isSupportedTodoWorkspaceKey(todo.workspace) &&
      !homeExcludedTodoWorkspaces.has(todo.workspace) &&
      !excludedTodoIds?.has(todo.id)
    )
    .sort(sortTodosByDueDate),
  completedHomeEventIds: buildCompletedHomeEventIds(completions),
  suggestionCandidates,
});

const parseJsonArray = <T,>(value?: string) => {
  if (!value) return [] as T[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [] as T[];
  }
};

const getGuideProgress = (stepsJson?: string, complete = false) => {
  const steps = parseJsonArray<{ completed?: boolean }>(stepsJson);
  if (!steps.length) {
    return null;
  }
  const completed = complete ? steps.length : steps.filter((step) => step.completed).length;
  return completed < steps.length ? { completed, total: steps.length } : null;
};

const getActiveGoalActionIds = (plan: Pick<GoalGuidancePlanModel, 'activeTodoId' | 'activeActionsJson'>) => {
  const actionIds = new Set<string>();
  if (plan.activeTodoId) {
    actionIds.add(plan.activeTodoId);
  }
  if (!plan.activeActionsJson) {
    return [...actionIds];
  }
  try {
    const parsed = JSON.parse(plan.activeActionsJson);
    const activeActions = Array.isArray(parsed) ? parsed : parsed?.activeActions;
    if (Array.isArray(activeActions)) {
      activeActions.forEach((action) => {
        if (typeof action?.todoId === 'string' && action.todoId) {
          actionIds.add(action.todoId);
        }
      });
    }
  } catch {}
  return [...actionIds];
};

export const buildHomeSuggestionCandidates = ({
  todos,
  goalGuidancePlans,
  taskGuides,
  skillGuides,
  todayStart,
  excludedTodoIds,
}: {
  todos: TodoModel[];
  goalGuidancePlans: GoalGuidancePlanModel[];
  taskGuides: TaskGuideModel[];
  skillGuides: SkillGuideModel[];
  todayStart: Date;
  excludedTodoIds?: Set<string>;
}) => {
  const todosById = new Map(todos.map((todo) => [todo.id, todo]));
  const oldestIncompleteTodoByRecurrenceSeries = new Map<string, TodoModel>();
  todos.forEach((todo) => {
    if (!todo.recurrenceSeriesId || todo.completed) {
      return;
    }

    const occurrenceDateKey = getTodoOccurrenceDateKey(todo.recurrenceOccurrenceDate || todo.dueDate);
    const currentTodo = oldestIncompleteTodoByRecurrenceSeries.get(todo.recurrenceSeriesId);
    const currentOccurrenceDateKey = currentTodo
      ? getTodoOccurrenceDateKey(currentTodo.recurrenceOccurrenceDate || currentTodo.dueDate)
      : null;
    if (
      occurrenceDateKey != null &&
      (
        currentOccurrenceDateKey == null ||
        occurrenceDateKey < currentOccurrenceDateKey ||
        (occurrenceDateKey === currentOccurrenceDateKey && sortTodosByDueDate(todo, currentTodo!) < 0)
      )
    ) {
      oldestIncompleteTodoByRecurrenceSeries.set(todo.recurrenceSeriesId, todo);
    }
  });
  const isActionableRecurringTodo = (todo: TodoModel) =>
    !todo.recurrenceSeriesId ||
    !oldestIncompleteTodoByRecurrenceSeries.has(todo.recurrenceSeriesId) ||
    oldestIncompleteTodoByRecurrenceSeries.get(todo.recurrenceSeriesId)?.id === todo.id;
  const activeGoalActionIds = new Set<string>();
  const candidateRecurrenceSeriesIds = new Set<string>();
  const candidates: HomeSuggestionCandidate[] = [];

  goalGuidancePlans.forEach((plan) => {
    const rootGoal = todosById.get(plan.goalId);
    if (!rootGoal || rootGoal.workspace !== 'Goals' || rootGoal.completed || plan.status !== 'accepted') {
      return;
    }

    const activeTodoIds = getActiveGoalActionIds(plan).filter((todoId) => {
      const todo = todosById.get(todoId);
      return (
        !!todo &&
        !todo.completed &&
        !excludedTodoIds?.has(todoId) &&
        isActionableRecurringTodo(todo) &&
        (!todo.recurrenceSeriesId || !candidateRecurrenceSeriesIds.has(todo.recurrenceSeriesId))
      );
    });
    if (!activeTodoIds.length) {
      return;
    }
    activeTodoIds.forEach((todoId) => activeGoalActionIds.add(todoId));
    activeTodoIds.forEach((todoId) => {
      const recurrenceSeriesId = todosById.get(todoId)?.recurrenceSeriesId;
      if (recurrenceSeriesId) {
        candidateRecurrenceSeriesIds.add(recurrenceSeriesId);
      }
    });

    const steps = parseJsonArray<unknown>(plan.stepsJson);
    const completed = parseJsonArray<number>(plan.completedStepIndexesJson).length;
    const goalContextDetails = [
      rootGoal.details,
      ...activeTodoIds.map((todoId) => todosById.get(todoId)?.details),
    ].filter((details): details is string => !!details?.trim()).join('\n');
    candidates.push({
      id: `goal:${rootGoal.id}`,
      kind: 'goal',
      openTodoId: rootGoal.id,
      title: `Continue ${rootGoal.text}`,
      details: goalContextDetails || undefined,
      dueDate: rootGoal.dueDate?.toISOString(),
      starred: rootGoal.starred,
      ...(steps.length ? { progress: { completed: Math.min(completed, steps.length), total: steps.length } } : {}),
      activeTodoIds,
    });
  });

  const candidateTodoIds = new Set(activeGoalActionIds);
  skillGuides.forEach((guide) => {
    const todo = todosById.get(guide.todoId);
    const progress = getGuideProgress(guide.stepsJson);
    if (
      !todo ||
      todo.completed ||
      excludedTodoIds?.has(todo.id) ||
      todo.workspace !== 'Personal' ||
      guide.status !== 'ready' ||
      !progress ||
      candidateTodoIds.has(todo.id) ||
      !isActionableRecurringTodo(todo) ||
      (!!todo.recurrenceSeriesId && candidateRecurrenceSeriesIds.has(todo.recurrenceSeriesId))
    ) {
      return;
    }
    candidateTodoIds.add(todo.id);
    if (todo.recurrenceSeriesId) {
      candidateRecurrenceSeriesIds.add(todo.recurrenceSeriesId);
    }
    candidates.push({
      id: `skillGuide:${todo.id}`,
      kind: 'skillGuide',
      openTodoId: todo.id,
      title: todo.text,
      details: todo.details,
      dueDate: todo.dueDate?.toISOString(),
      plannedDurationMinutes: todo.plannedDurationMinutes ?? undefined,
      starred: todo.starred,
      progress,
    });
  });

  taskGuides.forEach((guide) => {
    const todo = todosById.get(guide.todoId);
    const progress = getGuideProgress(guide.stepsJson, guide.status === 'complete');
    if (
      !todo ||
      todo.completed ||
      excludedTodoIds?.has(todo.id) ||
      todo.workspace !== 'Personal' ||
      (guide.status !== 'preview' && guide.status !== 'accepted') ||
      !progress ||
      candidateTodoIds.has(todo.id) ||
      !isActionableRecurringTodo(todo) ||
      (!!todo.recurrenceSeriesId && candidateRecurrenceSeriesIds.has(todo.recurrenceSeriesId))
    ) {
      return;
    }
    candidateTodoIds.add(todo.id);
    if (todo.recurrenceSeriesId) {
      candidateRecurrenceSeriesIds.add(todo.recurrenceSeriesId);
    }
    candidates.push({
      id: `taskGuide:${todo.id}`,
      kind: 'taskGuide',
      openTodoId: todo.id,
      title: todo.text,
      details: todo.details,
      dueDate: todo.dueDate?.toISOString(),
      plannedDurationMinutes: todo.plannedDurationMinutes ?? undefined,
      starred: todo.starred,
      progress,
    });
  });

  filterHomeRecurringTodos(
    todos.filter((todo) =>
      todo.workspace === 'Personal' &&
      !todo.completed &&
      !!todo.dueDate &&
      todo.dueDate.getTime() < todayStart.getTime() &&
      !excludedTodoIds?.has(todo.id) &&
      !candidateTodoIds.has(todo.id) &&
      (!todo.recurrenceSeriesId || !candidateRecurrenceSeriesIds.has(todo.recurrenceSeriesId))
    ),
    new Date(todayStart.getTime() - 1)
  )
    .sort(sortTodosByDueDate)
    .forEach((todo) => {
      if (todo.recurrenceSeriesId) {
        candidateRecurrenceSeriesIds.add(todo.recurrenceSeriesId);
      }
      candidates.push({
        id: `overdue:${todo.id}`,
        kind: 'overdue',
        openTodoId: todo.id,
        title: todo.text,
        details: todo.details,
        dueDate: todo.dueDate?.toISOString(),
        plannedDurationMinutes: todo.plannedDurationMinutes ?? undefined,
        starred: todo.starred,
      });
    });

  return candidates;
};

export const isFetchedGoogleHomeEvent = (
  event: EventModel | HomeGoogleEvent
): event is HomeGoogleEvent => (event as HomeGoogleEvent).source === 'google';

export const mergeUpcomingHomeEvents = (
  localEvents: EventModel[],
  googleEvents: HomeGoogleEvent[]
) => {
  const googleEventIds = new Set(googleEvents.map((event) => event.id));
  const filteredLocalEvents = localEvents.filter((event) =>
    !event.googleEventId || !googleEventIds.has(String(event.googleEventId))
  );

  return [...filteredLocalEvents, ...googleEvents].sort(sortEventsByStartDate);
};

export const mergeGoogleEventsIntoHomeSnapshot = (
  snapshot: HomeSnapshot,
  googleEvents: HomeGoogleEvent[],
  suggestionGoogleEvents: HomeGoogleEvent[] = googleEvents
): HomeSnapshot => ({
  ...snapshot,
  upcomingEvents: mergeUpcomingHomeEvents(
    snapshot.upcomingEvents.filter(
      (event): event is EventModel => !isFetchedGoogleHomeEvent(event)
    ),
    googleEvents
  ),
  suggestionEvents: mergeUpcomingHomeEvents(
    snapshot.suggestionEvents.filter(
      (event): event is EventModel => !isFetchedGoogleHomeEvent(event)
    ),
    suggestionGoogleEvents
  ),
});

export const isStaleHomeRefresh = (latestRequestId: number, requestId: number) =>
  latestRequestId !== requestId;

export const orderNextStepTodoCandidates = <T extends { sourceId: string }>(
  candidates: T[],
  snoozedTodoIds: Set<string>
) => {
  if (snoozedTodoIds.size === 0) {
    return candidates;
  }

  const activeCandidates: T[] = [];
  const snoozedCandidates: T[] = [];

  candidates.forEach((candidate) => {
    if (snoozedTodoIds.has(candidate.sourceId)) {
      snoozedCandidates.push(candidate);
      return;
    }

    activeCandidates.push(candidate);
  });

  return [...activeCandidates, ...snoozedCandidates];
};

export const getNextUnsnoozedTodoCandidate = <T extends { sourceId: string }>(
  todayCandidates: T[],
  overdueCandidates: T[],
  snoozedTodoIds: Set<string>
) =>
  todayCandidates.find((candidate) => !snoozedTodoIds.has(candidate.sourceId)) ??
  overdueCandidates.find((candidate) => !snoozedTodoIds.has(candidate.sourceId));

export const getNextStepTodoCandidate = <T extends { sourceId: string }>(
  todayCandidates: T[],
  overdueCandidates: T[],
  snoozedTodoIds: Set<string>
) =>
  getNextUnsnoozedTodoCandidate(todayCandidates, overdueCandidates, snoozedTodoIds) ??
  orderNextStepTodoCandidates(todayCandidates, snoozedTodoIds)[0] ??
  orderNextStepTodoCandidates(overdueCandidates, snoozedTodoIds)[0];

export const orderScheduleItemsWithSnoozesLast = <T extends { sourceId: string; type: string }>(
  items: T[],
  snoozedTodoIds: Set<string>,
  snoozedEventIds: Set<string>,
  getEventSnoozeKey: (item: T) => string
) => {
  if (snoozedTodoIds.size === 0 && snoozedEventIds.size === 0) {
    return items;
  }

  const activeItems: T[] = [];
  const snoozedItems: T[] = [];

  items.forEach((item) => {
    if (
      (item.type === 'todo' && snoozedTodoIds.has(item.sourceId)) ||
      (item.type === 'event' && snoozedEventIds.has(getEventSnoozeKey(item)))
    ) {
      snoozedItems.push(item);
      return;
    }

    activeItems.push(item);
  });

  return [...activeItems, ...snoozedItems];
};
