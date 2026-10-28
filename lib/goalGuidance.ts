import { Q } from '@nozbe/watermelondb';
import { addDays, differenceInCalendarDays, isSameDay, startOfDay } from 'date-fns';
import { database } from '@/database/database';
import GoalGuidancePlanModel from '@/database/models/GoalGuidancePlanModel';
import TodoModel from '@/database/models/TodoModel';
import { createTodo, deleteTodos, updateTodo, type TodoSnapshot } from '@/lib/todoMutations';
import { SERVER_URL } from '@/config/backend';
import { AI_AUTH_REQUIRED_MESSAGE } from '@/lib/aiAuth';
import { getAiRequestHeaders } from '@/lib/aiRequest';
import {
  getGoalQuotaActionTitle,
  isGoalQuotaComplete,
  isQuotaGoalBehavior,
  parseGoalBehavior,
  serializeGoalBehavior,
  type GoalQuotaBehavior,
} from '@/lib/goalBehavior';

const MAX_ACTIVE_GOAL_ACTION_SLOTS = 2;
const advancingGoalGuidanceTodoIds = new Set<string>();

export type GoalGuidanceTimeframe = 'thisWeek' | 'thisMonth' | 'thisYear' | 'longTerm';
export type GoalGuidanceStatus = 'preview' | 'accepted' | 'complete';
export type GoalGuidanceFeasibility = 'realistic' | 'tight' | 'unrealistic';
export type GoalGuidanceResponseType = 'clarify' | 'plan' | 'not_feasible';
export type GoalGuidanceMode = 'generate' | 'answer_clarification' | 'cram' | 'chat_create';

export type GoalGuidanceMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type GoalGuidanceRequestParentGoal = {
  title: string;
  details?: string;
  timeframe: GoalGuidanceTimeframe;
  deadlineLocalIso: string;
};

export type GoalGuidanceRequestActiveMilestone = {
  title: string;
  details?: string;
  stepIndex?: number;
};

export type GoalGuidanceStep = {
  title: string;
  details?: string;
  cadence?: 'once' | 'daily';
  effort?: 'light' | 'medium' | 'heavy';
  youtubeQuery?: string;
};

export type GoalGuidanceSourceStep = {
  title: string;
  details?: string;
};

export type GoalGuidanceActiveAction = {
  stepIndex: number;
  todoId: string;
  dueDate: string;
};

type GoalGuidanceActionState = {
  activeActions: GoalGuidanceActiveAction[];
  todoIds: string[];
  todoStepIndexes: Record<string, number>;
  pausedUntilDate?: string;
};

type GoalGuidanceTodoLinkRow = Pick<
  GoalGuidancePlanModel,
  'goalId' | 'activeTodoId' | 'activeStepIndex' | 'activeActionsJson'
>;

export type GoalGuidanceResponse = {
  type: GoalGuidanceResponseType;
  question?: string;
  goalTitle?: string;
  feasibility: GoalGuidanceFeasibility;
  feasibilityNote: string;
  steps: GoalGuidanceStep[];
  alternativeSuggestion?: string;
  alternativeTimeframe?: GoalGuidanceTimeframe;
  alternativeGoalTitle?: string;
};

export type GoalGuidancePlan = {
  id: string;
  goalId: string;
  timeframe: GoalGuidanceTimeframe;
  deadline: Date;
  feasibilityStatus: GoalGuidanceFeasibility;
  feasibilityNote: string;
  alternativeSuggestion?: string;
  steps: GoalGuidanceStep[];
  activeStepIndex: number;
  activeTodoId?: string;
  activeActions: GoalGuidanceActiveAction[];
  actionTodoIds: string[];
  actionTodoStepIndexes: Record<string, number>;
  completedStepIndexes: number[];
  pausedUntilDate?: string;
  status: GoalGuidanceStatus;
  cram: boolean;
  conversation: GoalGuidanceMessage[];
  createdAt: Date;
};

type SaveGoalGuidancePlanInput = {
  goalId: string;
  timeframe: GoalGuidanceTimeframe;
  deadline: Date;
  response: GoalGuidanceResponse;
  conversation: GoalGuidanceMessage[];
  cram: boolean;
};

export type RequestGoalGuidanceInput = {
  goalTitle: string;
  goalDetails?: string;
  timeframe: GoalGuidanceTimeframe;
  deadlineLocalIso: string;
  nowLocalIso: string;
  userTimezone: string;
  currentPlan?: string;
  conversation: GoalGuidanceMessage[];
  mode: GoalGuidanceMode;
  parentGoal?: GoalGuidanceRequestParentGoal;
  activeMilestone?: GoalGuidanceRequestActiveMilestone;
  sourceSteps?: GoalGuidanceSourceStep[];
  sourceQuestion?: string;
  sourceAnswer?: string;
  quota?: {
    targetCount: number;
    completedCount?: number;
    unitLabel: string;
    unitType: 'distinct_days' | 'count';
  };
};

const MAX_GOAL_GUIDANCE_CONVERSATION_MESSAGES = 20;
const MAX_GOAL_GUIDANCE_MESSAGE_LENGTH = 2000;
const MAX_GOAL_GUIDANCE_CURRENT_PLAN_LENGTH = 4000;
const MAX_GOAL_GUIDANCE_DETAILS_LENGTH = 4000;
const MAX_GOAL_GUIDANCE_TITLE_LENGTH = 300;

const truncateGoalGuidanceText = (value: string | undefined, maxLength: number) => {
  const text = String(value || '').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
};

const normalizeGoalGuidanceTitle = (title: string) =>
  truncateGoalGuidanceText(title, MAX_GOAL_GUIDANCE_TITLE_LENGTH) || 'Goal';

const normalizeGoalGuidanceConversation = (messages: GoalGuidanceMessage[]) =>
  messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-MAX_GOAL_GUIDANCE_CONVERSATION_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: truncateGoalGuidanceText(message.content, MAX_GOAL_GUIDANCE_MESSAGE_LENGTH),
    }))
    .filter((message) => message.content.length > 0);

const isLongRangeGoalGuidanceTimeframe = (timeframe: GoalGuidanceTimeframe) =>
  timeframe === 'thisYear' || timeframe === 'longTerm';

const getMaxActiveGoalActionSlots = (plan: Pick<GoalGuidancePlan, 'timeframe'>) =>
  isLongRangeGoalGuidanceTimeframe(plan.timeframe) ? 1 : MAX_ACTIVE_GOAL_ACTION_SLOTS;

const isGoalGuidanceTimeframe = (value: unknown): value is GoalGuidanceTimeframe =>
  value === 'thisWeek' || value === 'thisMonth' || value === 'thisYear' || value === 'longTerm';

const normalizeGoalGuidanceRequest = (input: RequestGoalGuidanceInput): RequestGoalGuidanceInput => ({
  ...input,
  goalTitle: normalizeGoalGuidanceTitle(input.goalTitle),
  goalDetails: truncateGoalGuidanceText(input.goalDetails, MAX_GOAL_GUIDANCE_DETAILS_LENGTH),
  currentPlan: truncateGoalGuidanceText(input.currentPlan, MAX_GOAL_GUIDANCE_CURRENT_PLAN_LENGTH),
  conversation: normalizeGoalGuidanceConversation(input.conversation),
  parentGoal: input.parentGoal
    ? {
        ...input.parentGoal,
        title: normalizeGoalGuidanceTitle(input.parentGoal.title),
        details: truncateGoalGuidanceText(input.parentGoal.details, MAX_GOAL_GUIDANCE_DETAILS_LENGTH),
      }
    : undefined,
  activeMilestone: input.activeMilestone
    ? {
        ...input.activeMilestone,
        title: normalizeGoalGuidanceTitle(input.activeMilestone.title),
        details: truncateGoalGuidanceText(input.activeMilestone.details, MAX_GOAL_GUIDANCE_DETAILS_LENGTH),
      }
    : undefined,
  sourceSteps: Array.isArray(input.sourceSteps)
    ? input.sourceSteps
        .map((step) => ({
          title: truncateGoalGuidanceText(step?.title, 200),
          details: truncateGoalGuidanceText(step?.details, 1000),
        }))
        .filter((step) => step.title.length > 0)
        .slice(0, 24)
    : [],
  sourceQuestion: truncateGoalGuidanceText(input.sourceQuestion, 8000),
  sourceAnswer: truncateGoalGuidanceText(input.sourceAnswer, 8000),
  quota: input.quota && Number.isFinite(Number(input.quota.targetCount))
    ? {
        targetCount: Math.max(1, Math.floor(Number(input.quota.targetCount))),
        completedCount: Math.max(0, Math.floor(Number(input.quota.completedCount || 0))),
        unitLabel: truncateGoalGuidanceText(input.quota.unitLabel, 80) || 'times',
        unitType: input.quota.unitType === 'distinct_days' ? 'distinct_days' : 'count',
      }
    : undefined,
});

const formatGoalGuidanceRequestError = (payload: any, status: number) => {
  const fieldErrors = payload?.details?.fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') {
    return String(payload?.error || `HTTP ${status}`);
  }

  const details = Object.entries(fieldErrors)
    .flatMap(([field, errors]) =>
      Array.isArray(errors) && errors.length > 0
        ? [`${field}: ${errors.join(', ')}`]
        : []
    )
    .join('; ');

  return details
    ? `${String(payload?.error || `HTTP ${status}`)} (${details})`
    : String(payload?.error || `HTTP ${status}`);
};

const parseJsonArray = <T,>(value: string | undefined, fallback: T[]): T[] => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const toDateKey = (date: Date) => startOfDay(date).toISOString();

const getTodayDueDate = () => startOfDay(new Date());

const getTomorrowDateKey = () => toDateKey(addDays(getTodayDueDate(), 1));

const getGoalQuotaDateLimitMessage = (input: RequestGoalGuidanceInput) => {
  if (input.quota?.unitType !== 'distinct_days') {
    return null;
  }

  const deadline = startOfDay(new Date(input.deadlineLocalIso));
  const now = startOfDay(new Date(input.nowLocalIso));
  if (Number.isNaN(deadline.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  const availableDays = Math.max(0, differenceInCalendarDays(deadline, now) + 1);
  const remainingCount = Math.max(
    0,
    Math.floor(Number(input.quota.targetCount)) - Math.max(0, Math.floor(Number(input.quota.completedCount || 0)))
  );
  if (remainingCount <= availableDays) {
    return null;
  }

  return `This quota asks for ${remainingCount} ${input.quota.unitLabel || 'days'}, but there ${availableDays === 1 ? 'is' : 'are'} only ${availableDays} day${availableDays === 1 ? '' : 's'} left. Lower the count or extend/change the goal timeframe.`;
};

const getGoalBehaviorForGoal = async (goalId: string) => {
  try {
    const todo = await database.collections.get<TodoModel>('todos').find(goalId);
    return parseGoalBehavior(todo.goalBehaviorJson);
  } catch {
    return null;
  }
};

const getQuotaBehaviorForGoal = async (goalId: string): Promise<GoalQuotaBehavior | null> => {
  const behavior = await getGoalBehaviorForGoal(goalId);
  return isQuotaGoalBehavior(behavior) ? behavior : null;
};

const updateGoalBehaviorForGoal = async (goalId: string, behavior: GoalQuotaBehavior) => {
  const todo = await database.collections.get<TodoModel>('todos').find(goalId);
  await database.write(async () => {
    await todo.update((record) => {
      record.goalBehaviorJson = serializeGoalBehavior(behavior);
    });
  });
};

const parseActionState = (row: GoalGuidanceTodoLinkRow): GoalGuidanceActionState => {
  let parsed: any = [];
  if (row.activeActionsJson) {
    try {
      parsed = JSON.parse(row.activeActionsJson);
    } catch {
      parsed = [];
    }
  }

  const actions: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.activeActions)
      ? parsed.activeActions
      : [];
  const validActions = actions.filter((action): action is GoalGuidanceActiveAction =>
    !!action &&
    typeof action === 'object' &&
    typeof (action as GoalGuidanceActiveAction).todoId === 'string' &&
    Number.isInteger((action as GoalGuidanceActiveAction).stepIndex)
  );
  const todoIds = Array.isArray(parsed?.todoIds)
    ? parsed.todoIds.filter((todoId: unknown): todoId is string => typeof todoId === 'string' && todoId.length > 0)
    : [];
  const todoStepIndexes: Record<string, number> = {};
  if (typeof parsed?.todoStepIndexes === 'object' && parsed.todoStepIndexes) {
    Object.entries(parsed.todoStepIndexes).forEach(([todoId, stepIndex]) => {
      if (Number.isInteger(stepIndex)) {
        todoStepIndexes[todoId] = stepIndex as number;
      }
    });
  }
  const pausedUntilDate = typeof parsed?.pausedUntilDate === 'string' ? parsed.pausedUntilDate : undefined;
  const nextTodoStepIndexes = {
    ...todoStepIndexes,
    ...Object.fromEntries(validActions.map((action) => [action.todoId, action.stepIndex])),
  };

  if (validActions.length > 0) {
    return {
      activeActions: validActions,
      todoIds: Array.from(new Set([...todoIds, ...validActions.map((action) => action.todoId)])),
      todoStepIndexes: nextTodoStepIndexes,
      pausedUntilDate,
    };
  }

  if (row.activeTodoId) {
    return {
      activeActions: [{
        stepIndex: row.activeStepIndex || 0,
        todoId: row.activeTodoId,
        dueDate: '',
      }],
      todoIds: Array.from(new Set([...todoIds, row.activeTodoId])),
      todoStepIndexes: {
        ...nextTodoStepIndexes,
        [row.activeTodoId]: row.activeStepIndex || 0,
      },
      pausedUntilDate,
    };
  }

  return {
    activeActions: [],
    todoIds,
    todoStepIndexes: nextTodoStepIndexes,
    pausedUntilDate,
  };
};

export const collectGoalGuidanceManagedTodoIds = (
  plans: GoalGuidanceTodoLinkRow[],
  rootGoalIds: Iterable<string>
) => {
  const plansByGoalId = new Map<string, GoalGuidanceTodoLinkRow[]>();
  plans.forEach((plan) => {
    const existing = plansByGoalId.get(plan.goalId);
    if (existing) {
      existing.push(plan);
      return;
    }
    plansByGoalId.set(plan.goalId, [plan]);
  });

  const managedTodoIds = new Set<string>();
  const goalIdsToVisit = Array.from(rootGoalIds);
  const visitedGoalIds = new Set<string>();

  while (goalIdsToVisit.length > 0) {
    const goalId = goalIdsToVisit.shift();
    if (!goalId || visitedGoalIds.has(goalId)) {
      continue;
    }

    visitedGoalIds.add(goalId);
    const matchingPlans = plansByGoalId.get(goalId) || [];
    matchingPlans.forEach((plan) => {
      parseActionState(plan).todoIds.forEach((todoId) => {
        managedTodoIds.add(todoId);
        goalIdsToVisit.push(todoId);
      });
    });
  }

  return managedTodoIds;
};

const parseCompletedStepIndexes = (row: GoalGuidancePlanModel) =>
  parseJsonArray<number>(row.completedStepIndexesJson, [])
    .filter((index) => Number.isInteger(index));

const syncActiveActionTodosToToday = async (activeActions: GoalGuidanceActiveAction[]) => {
  if (!activeActions.length) {
    return activeActions;
  }

  const today = getTodayDueDate();
  const todayKey = toDateKey(today);
  const todoIds = Array.from(new Set(activeActions.map((action) => action.todoId).filter(Boolean)));
  const existingTodos = await database.collections
    .get<TodoModel>('todos')
    .query(Q.where('id', Q.oneOf(todoIds)))
    .fetch();
  const todosToUpdate = existingTodos.filter((todo) =>
    !todo.completed &&
    (!todo.dueDate || !isSameDay(todo.dueDate, today) || todo.hasDueTime)
  );

  if (todosToUpdate.length > 0) {
    await database.write(async () => {
      await database.batch(todosToUpdate.map((todo) =>
        todo.prepareUpdate((record) => {
          record.dueDate = today;
          record.hasDueTime = false;
        })
      ));
    });
  }

  return activeActions.map((action) => ({
    ...action,
    dueDate: todayKey,
  }));
};

const normalizeAcceptedPlanActionsForToday = async (row: GoalGuidancePlanModel) => {
  if (row.status !== 'accepted') {
    return row;
  }

  if (await getQuotaBehaviorForGoal(row.goalId)) {
    return row;
  }

  const actionState = parseActionState(row);
  if (!actionState.activeActions.length) {
    const completedStepIndexes = parseCompletedStepIndexes(row);
    const steps = parseJsonArray<GoalGuidanceStep>(row.stepsJson, []);
    const isPausedUntilToday =
      !!actionState.pausedUntilDate &&
      startOfDay(new Date(actionState.pausedUntilDate)).getTime() <= getTodayDueDate().getTime();
    const hasRemainingSteps = getNextInactiveStepIndex(steps, [], completedStepIndexes) >= 0;

    if (!isPausedUntilToday || !hasRemainingSteps) {
      return row;
    }

    const plan = toGoalGuidancePlan(row);
    const filled = await createActionsUntilFull(plan, [], completedStepIndexes);
    const activeActions = await syncActiveActionTodosToToday(filled.activeActions);
    await persistActiveActions(row, activeActions, completedStepIndexes, 'accepted');
    return database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans').find(row.id);
  }

  const activeActions = await syncActiveActionTodosToToday(actionState.activeActions);
  const hasChangedActionDate = activeActions.some((action, index) =>
    action.dueDate !== actionState.activeActions[index]?.dueDate
  );

  if (hasChangedActionDate) {
    await database.write(async () => {
      await row.update((record) => {
        record.activeActionsJson = JSON.stringify({
          activeActions,
          todoIds: actionState.todoIds,
          todoStepIndexes: actionState.todoStepIndexes,
          ...(actionState.pausedUntilDate ? { pausedUntilDate: actionState.pausedUntilDate } : {}),
        });
      });
    });
    return database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans').find(row.id);
  }

  return row;
};

export const toGoalGuidancePlan = (row: GoalGuidancePlanModel): GoalGuidancePlan => {
  const actionState = parseActionState(row);
  return {
    id: row.id,
    goalId: row.goalId,
    timeframe: row.timeframe,
    deadline: row.deadline,
    feasibilityStatus: row.feasibilityStatus,
    feasibilityNote: row.feasibilityNote,
    alternativeSuggestion: row.alternativeSuggestion,
    steps: parseJsonArray<GoalGuidanceStep>(row.stepsJson, []),
    activeStepIndex: row.activeStepIndex,
    activeTodoId: row.activeTodoId || undefined,
    activeActions: actionState.activeActions,
    actionTodoIds: actionState.todoIds,
    actionTodoStepIndexes: actionState.todoStepIndexes,
    completedStepIndexes: parseCompletedStepIndexes(row),
    pausedUntilDate: actionState.pausedUntilDate,
    status: row.status,
    cram: !!row.cram,
    conversation: parseJsonArray<GoalGuidanceMessage>(row.conversationJson, []),
    createdAt: row.createdAt,
  };
};

export const requestGoalGuidance = async (input: RequestGoalGuidanceInput): Promise<GoalGuidanceResponse> => {
  const quotaDateLimitMessage = getGoalQuotaDateLimitMessage(input);
  if (quotaDateLimitMessage) {
    throw new Error(quotaDateLimitMessage);
  }

  const requestBody = normalizeGoalGuidanceRequest(input);
  const response = await fetch(`${SERVER_URL}/ai/goal-guidance`, {
    method: 'POST',
    headers: await getAiRequestHeaders('guidance', { guidanceTitle: requestBody.goalTitle }),
    body: JSON.stringify(requestBody),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(response.status === 401
      ? AI_AUTH_REQUIRED_MESSAGE
      : formatGoalGuidanceRequestError(payload, response.status));
  }

  const feasibility =
    payload?.type === 'not_feasible'
      ? 'unrealistic'
      : payload?.feasibility === 'tight' || payload?.feasibility === 'unrealistic'
        ? payload.feasibility
        : 'realistic';

  return {
    type: payload?.type,
    question: typeof payload?.question === 'string' ? payload.question : undefined,
    goalTitle:
      payload?.type === 'plan' &&
      typeof payload?.goalTitle === 'string' &&
      payload.goalTitle.trim().length > 0
        ? normalizeGoalGuidanceTitle(payload.goalTitle)
        : undefined,
    feasibility,
    feasibilityNote: String(payload?.feasibilityNote || ''),
    steps: Array.isArray(payload?.steps)
      ? payload.steps
          .map((step: any) => ({
            title: String(step?.title || '').trim(),
            details: typeof step?.details === 'string' ? step.details.trim() : undefined,
            cadence: step?.cadence === 'daily' ? 'daily' : 'once',
            effort: step?.effort === 'heavy' || step?.effort === 'light' ? step.effort : 'medium',
            youtubeQuery: typeof step?.youtubeQuery === 'string' ? step.youtubeQuery.trim() : undefined,
          }))
          .filter((step: GoalGuidanceStep) => step.title.length > 0)
      : [],
    alternativeSuggestion:
      typeof payload?.alternativeSuggestion === 'string'
        ? payload.alternativeSuggestion
        : undefined,
    alternativeTimeframe: isGoalGuidanceTimeframe(payload?.alternativeTimeframe)
      ? payload.alternativeTimeframe
      : undefined,
    alternativeGoalTitle:
      typeof payload?.alternativeGoalTitle === 'string' && payload.alternativeGoalTitle.trim().length > 0
        ? normalizeGoalGuidanceTitle(payload.alternativeGoalTitle)
        : undefined,
  };
};

export const fetchGoalGuidancePlanForGoal = async (goalId: string) => {
  const rows = await database.collections
    .get<GoalGuidancePlanModel>('goal_guidance_plans')
    .query(Q.where('goal_id', goalId))
    .fetch();
  const row = rows[0] ? await normalizeAcceptedPlanActionsForToday(rows[0]) : null;
  return row ? toGoalGuidancePlan(row) : null;
};

export const refreshGoalGuidancePlansForToday = async () => {
  const rows = await database.collections
    .get<GoalGuidancePlanModel>('goal_guidance_plans')
    .query(Q.where('status', 'accepted'))
    .fetch();

  for (const row of rows) {
    await normalizeAcceptedPlanActionsForToday(row);
  }
};

export const deleteGoalGuidanceForGoal = async (goalId: string) => {
  const plansCollection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const rowsById = new Map<string, GoalGuidancePlanModel>();
  const goalIdsToVisit = [goalId];
  const visitedGoalIds = new Set<string>();
  const todoIdsToDelete = new Set<string>();

  while (goalIdsToVisit.length > 0) {
    const currentGoalId = goalIdsToVisit.shift();
    if (!currentGoalId || visitedGoalIds.has(currentGoalId)) {
      continue;
    }
    visitedGoalIds.add(currentGoalId);

    const rows = await plansCollection.query(Q.where('goal_id', currentGoalId)).fetch();
    rows.forEach((row) => {
      rowsById.set(row.id, row);

      const actionState = parseActionState(row);
      const todoIds = row.activeTodoId ? [...actionState.todoIds, row.activeTodoId] : actionState.todoIds;
      todoIds.filter(Boolean).forEach((todoId) => {
        todoIdsToDelete.add(todoId);
        if (!visitedGoalIds.has(todoId)) {
          goalIdsToVisit.push(todoId);
        }
      });
    });
  }

  const rows = Array.from(rowsById.values());
  if (!rows.length) {
    return [];
  }

  let deletedTodos: TodoSnapshot[] = [];
  const todoIds = Array.from(todoIdsToDelete);
  if (todoIds.length > 0) {
    const existingTodos = await database.collections
      .get<TodoModel>('todos')
      .query(Q.where('id', Q.oneOf(todoIds)))
      .fetch();
    deletedTodos = await deleteTodos(existingTodos.map((todo) => todo.id));
  }

  await database.write(async () => {
    await database.batch(rows.map((row) => row.prepareDestroyPermanently()));
  });

  return deletedTodos;
};

export const saveGoalGuidancePreview = async (input: SaveGoalGuidancePlanInput) => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const existing = await collection.query(Q.where('goal_id', input.goalId)).fetch();
  const row = existing[0];
  let savedPlan!: GoalGuidancePlanModel;

  if (row && row.status !== 'preview') {
    const todoIds = parseActionState(row).todoIds;
    if (todoIds.length > 0) {
      const existingTodos = await database.collections
        .get<TodoModel>('todos')
        .query(Q.where('id', Q.oneOf(todoIds)))
        .fetch();
      await deleteTodos(existingTodos.map((todo) => todo.id));
    }
  }

  await database.write(async () => {
    const applyFields = (record: GoalGuidancePlanModel) => {
      record.goalId = input.goalId;
      record.timeframe = input.timeframe;
      record.deadline = input.deadline;
      record.feasibilityStatus = input.response.feasibility;
      record.feasibilityNote = input.response.feasibilityNote;
      record.alternativeSuggestion = input.response.alternativeSuggestion;
      record.stepsJson = JSON.stringify(input.response.steps);
      record.activeStepIndex = 0;
      record.activeTodoId = undefined;
      record.activeActionsJson = JSON.stringify({ activeActions: [], todoIds: [], todoStepIndexes: {} });
      record.completedStepIndexesJson = JSON.stringify([]);
      record.status = 'preview';
      record.cram = input.cram;
      record.conversationJson = JSON.stringify(input.conversation);
    };

    if (row) {
      savedPlan = await row.update(applyFields);
      return;
    }

    savedPlan = await collection.create(applyFields);
  });

  return toGoalGuidancePlan(savedPlan);
};

export const saveGoalGuidanceResponse = async (input: SaveGoalGuidancePlanInput) => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const existing = await collection.query(Q.where('goal_id', input.goalId)).fetch();
  const row = existing[0];

  if (!row || row.status === 'preview') {
    return saveGoalGuidancePreview(input);
  }

  const actionState = parseActionState(row);
  const nextSteps = input.response.steps.length > 0
    ? input.response.steps
    : parseJsonArray<GoalGuidanceStep>(row.stepsJson, []);
  const activeActions = actionState.activeActions.filter((action) => action.stepIndex < nextSteps.length);
  const completedStepIndexes = parseCompletedStepIndexes(row).filter((index) => index < nextSteps.length);
  const activeTodoIds = activeActions.map((action) => action.todoId);
  const existingTodos = activeTodoIds.length > 0
    ? await database.collections
        .get<TodoModel>('todos')
        .query(Q.where('id', Q.oneOf(activeTodoIds)))
        .fetch()
    : [];
  const nextStatus =
    row.status === 'complete' || (nextSteps.length > 0 && completedStepIndexes.length >= nextSteps.length)
      ? 'complete'
      : 'accepted';
  const isNestedActionPlan = await isNestedGoalGuidanceActionPlan({
    id: row.id,
    goalId: input.goalId,
  });
  const quotaBehavior = await getQuotaBehaviorForGoal(input.goalId);
  const nextQuotaBehavior = quotaBehavior
    ? withGoalQuotaActionTemplate(quotaBehavior, nextSteps)
    : null;
  const nextActiveActions = isNestedActionPlan ? [] : activeActions;

  await database.write(async () => {
    await row.update((record) => {
      record.timeframe = input.timeframe;
      record.deadline = input.deadline;
      record.feasibilityStatus = input.response.feasibility;
      record.feasibilityNote = input.response.feasibilityNote;
      record.alternativeSuggestion = input.response.alternativeSuggestion;
      record.stepsJson = JSON.stringify(nextSteps);
      record.status = nextStatus;
      record.cram = row.cram || input.cram;
      record.conversationJson = JSON.stringify(input.conversation);
      record.completedStepIndexesJson = JSON.stringify(completedStepIndexes);
      record.activeActionsJson = JSON.stringify({
        activeActions: nextActiveActions,
        todoIds: actionState.todoIds,
        todoStepIndexes: actionState.todoStepIndexes,
        ...(actionState.pausedUntilDate ? { pausedUntilDate: actionState.pausedUntilDate } : {}),
      });

      const firstAction = nextActiveActions[0];
      if (firstAction) {
        record.activeStepIndex = firstAction.stepIndex;
        record.activeTodoId = firstAction.todoId;
      } else {
        record.activeTodoId = undefined;
      }
    });

    for (const todo of existingTodos) {
      const activeAction = activeActions.find((action) => action.todoId === todo.id);
      const step = activeAction ? nextSteps[activeAction.stepIndex] : undefined;
      if (!step || todo.completed) {
        continue;
      }

      await todo.update((record) => {
        record.text = step.title;
        record.details = step.details || '';
      });
    }
  });

  if (nextQuotaBehavior) {
    await updateGoalBehaviorForGoal(input.goalId, nextQuotaBehavior);
  }

  if (nextStatus === 'accepted' && !isNestedActionPlan && !nextQuotaBehavior) {
    const intermediate = await collection.find(row.id);
    const filled = await createActionsUntilFull(
      toGoalGuidancePlan(intermediate),
      activeActions,
      completedStepIndexes
    );
    const syncedActiveActions = await syncActiveActionTodosToToday(filled.activeActions);
    await persistActiveActions(
      intermediate,
      syncedActiveActions,
      completedStepIndexes,
      'accepted',
      syncedActiveActions.length > 0 ? undefined : actionState.pausedUntilDate
    );
  }

  const fresh = await collection.find(row.id);
  return toGoalGuidancePlan(fresh);
};

export const saveGoalGuidanceConversation = async (
  planId: string,
  conversation: GoalGuidanceMessage[]
) => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const row = await collection.find(planId);

  await database.write(async () => {
    await row.update((record) => {
      record.conversationJson = JSON.stringify(conversation);
    });
  });

  const fresh = await collection.find(planId);
  return toGoalGuidancePlan(fresh);
};

const createActionTodoForStep = async (step: GoalGuidanceStep, dueDate = startOfDay(new Date())) => {
  const result = await createTodo({
    text: step.title,
    details: step.details,
    completed: false,
    dueDate,
    hasDueTime: false,
    starred: false,
    workspace: 'Personal',
    type: 'basic',
    progress: 0,
    isAmazonUrlLoaded: false,
    amazonUrlLoadAttempts: 0,
  });

  return result.todo;
};

const reviveExistingActionTodoForStep = async (
  plan: GoalGuidancePlan,
  stepIndex: number,
  activeActions: GoalGuidanceActiveAction[],
  dueDate = startOfDay(new Date())
) => {
  const activeTodoIds = new Set(activeActions.map((action) => action.todoId));
  const reusableTodoId = [...plan.actionTodoIds]
    .reverse()
    .find((todoId) =>
      plan.actionTodoStepIndexes[todoId] === stepIndex &&
      !activeTodoIds.has(todoId)
    );

  if (!reusableTodoId) {
    return null;
  }

  try {
    const existingTodo = await database.collections.get<TodoModel>('todos').find(reusableTodoId);
    const result = await updateTodo(reusableTodoId, {
      text: plan.steps[stepIndex]?.title || existingTodo.text,
      details: plan.steps[stepIndex]?.details || '',
      completed: false,
      dueDate,
      hasDueTime: false,
      workspace: 'Personal',
    });
    return result.todo;
  } catch {
    return null;
  }
};

const getNextInactiveStepIndex = (
  steps: GoalGuidanceStep[],
  activeActions: GoalGuidanceActiveAction[],
  completedStepIndexes: number[]
) => {
  const activeStepIndexes = new Set(activeActions.map((action) => action.stepIndex));
  const completedIndexes = new Set(completedStepIndexes);

  for (let index = 0; index < steps.length; index += 1) {
    if (!activeStepIndexes.has(index) && !completedIndexes.has(index)) {
      return index;
    }
  }

  return -1;
};

const getGoalGuidanceStepSlotCost = (step?: GoalGuidanceStep) =>
  step?.effort === 'heavy' ? MAX_ACTIVE_GOAL_ACTION_SLOTS : 1;

const withGoalQuotaActionTemplate = (
  behavior: GoalQuotaBehavior,
  steps: GoalGuidanceStep[]
): GoalQuotaBehavior => {
  const template = steps[0];
  if (!template) {
    return behavior;
  }

  return {
    ...behavior,
    actionTemplateTitle: template.title || behavior.actionTemplateTitle,
    actionTemplateDetails: template.details || behavior.actionTemplateDetails,
  };
};

const getActiveActionSlotCount = (
  steps: GoalGuidanceStep[],
  activeActions: GoalGuidanceActiveAction[]
) => activeActions.reduce(
  (total, action) => total + getGoalGuidanceStepSlotCost(steps[action.stepIndex]),
  0
);

const createActionsUntilFull = async (
  plan: GoalGuidancePlan,
  activeActions: GoalGuidanceActiveAction[],
  completedStepIndexes: number[]
) => {
  const nextActions = [...activeActions];
  const createdTodos = [];
  const maxActiveSlots = getMaxActiveGoalActionSlots(plan);

  while (getActiveActionSlotCount(plan.steps, nextActions) < maxActiveSlots) {
    const nextStepIndex = getNextInactiveStepIndex(plan.steps, nextActions, completedStepIndexes);
    if (nextStepIndex < 0) {
      break;
    }

    const step = plan.steps[nextStepIndex];
    const currentSlotCount = getActiveActionSlotCount(plan.steps, nextActions);
    const nextStepSlotCost = getGoalGuidanceStepSlotCost(step);
    if (nextActions.length > 0 && currentSlotCount + nextStepSlotCost > maxActiveSlots) {
      break;
    }

    const dueDate = getTodayDueDate();
    const todo = await reviveExistingActionTodoForStep(plan, nextStepIndex, nextActions, dueDate) ||
      await createActionTodoForStep(step, dueDate);
    createdTodos.push(todo);
    nextActions.push({
      stepIndex: nextStepIndex,
      todoId: todo.id,
      dueDate: toDateKey(dueDate),
    });
  }

  return { activeActions: nextActions, createdTodos };
};

const persistActiveActions = async (
  row: GoalGuidancePlanModel,
  activeActions: GoalGuidanceActiveAction[],
  completedStepIndexes: number[],
  status: GoalGuidanceStatus,
  pausedUntilDate?: string
) => {
  await database.write(async () => {
    const firstAction = activeActions[0];
    await row.update((record) => {
      record.status = status;
      record.activeStepIndex = firstAction?.stepIndex ?? completedStepIndexes[completedStepIndexes.length - 1] ?? 0;
      record.activeTodoId = firstAction?.todoId;
      const actionState = parseActionState(row);
      const todoIds = Array.from(new Set([
        ...actionState.todoIds,
        ...activeActions.map((action) => action.todoId),
      ]));
      const todoStepIndexes = {
        ...actionState.todoStepIndexes,
        ...Object.fromEntries(activeActions.map((action) => [action.todoId, action.stepIndex])),
      };
      record.activeActionsJson = JSON.stringify({
        activeActions,
        todoIds,
        todoStepIndexes,
        ...(pausedUntilDate ? { pausedUntilDate } : {}),
      });
      record.completedStepIndexesJson = JSON.stringify(completedStepIndexes);
    });
  });
};

const findAcceptedPlanByActiveTodo = async (todoId: string) => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const rows = await collection.query(Q.where('status', 'accepted')).fetch();
  return rows.find((row) =>
    parseActionState(row).activeActions.some((action) => action.todoId === todoId) ||
    row.activeTodoId === todoId
  ) || null;
};

const findAcceptedPlanByAnyActionTodo = async (todoId: string) => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const rows = await collection.query(Q.where('status', 'accepted')).fetch();
  return rows.find((row) => parseActionState(row).todoIds.includes(todoId)) || null;
};

const isNestedGoalGuidanceActionPlan = async (plan: Pick<GoalGuidancePlan, 'id' | 'goalId'>) => {
  const parentRow = await findAcceptedPlanByActiveTodo(plan.goalId);
  return !!parentRow && parentRow.id !== plan.id;
};

export const acceptGoalGuidancePlan = async (planId: string) => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const row = await collection.find(planId);
  const plan = toGoalGuidancePlan(row);

  if (!plan.steps.length) {
    throw new Error('No guidance steps to accept.');
  }

  const quotaBehavior = await getQuotaBehaviorForGoal(plan.goalId);
  if (quotaBehavior) {
    await updateGoalBehaviorForGoal(plan.goalId, withGoalQuotaActionTemplate(quotaBehavior, plan.steps));
    await persistActiveActions(row, [], [], 'accepted');

    const fresh = await collection.find(planId);
    return { plan: toGoalGuidancePlan(fresh), todo: null };
  }

  if (await isNestedGoalGuidanceActionPlan(plan)) {
    await persistActiveActions(row, [], [], 'accepted');

    const fresh = await collection.find(planId);
    return { plan: toGoalGuidancePlan(fresh), todo: null };
  }

  const { activeActions, createdTodos } = await createActionsUntilFull(plan, [], []);
  await persistActiveActions(row, activeActions, [], 'accepted');

  const fresh = await collection.find(planId);
  return { plan: toGoalGuidancePlan(fresh), todo: createdTodos[0] ?? null };
};

const assertQuotaActionCanUseDate = (behavior: GoalQuotaBehavior, dueDate: Date) => {
  const dueDay = startOfDay(dueDate);
  const today = getTodayDueDate();
  if (dueDay.getTime() < today.getTime()) {
    throw new Error('Pick today or a future date.');
  }

  if (
    behavior.unitType === 'distinct_days' &&
    behavior.lastCompletedDate &&
    isSameDay(startOfDay(new Date(behavior.lastCompletedDate)), dueDay)
  ) {
    throw new Error('This quota needs a different day for the next action.');
  }
};

export const scheduleGoalQuotaAction = async (planId: string, dueDateInput = new Date()) => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const row = await collection.find(planId);
  const plan = toGoalGuidancePlan(row);
  const behavior = await getQuotaBehaviorForGoal(plan.goalId);
  if (!behavior) {
    throw new Error('This goal is not a quota goal.');
  }
  if (isGoalQuotaComplete(behavior) || plan.status === 'complete') {
    throw new Error('This quota goal is already complete.');
  }

  const dueDate = startOfDay(dueDateInput);
  assertQuotaActionCanUseDate(behavior, dueDate);

  const template: GoalGuidanceStep = plan.steps[0] || { title: 'Action', cadence: 'once', effort: 'medium' };
  const nextBehavior = withGoalQuotaActionTemplate(behavior, plan.steps);
  const actionTitle = getGoalQuotaActionTitle(nextBehavior, template.title);
  const actionDetails = nextBehavior.actionTemplateDetails || template.details || '';
  let todo: TodoModel | null = null;

  if (nextBehavior.scheduledActionTodoId) {
    try {
      const existingTodo = await database.collections.get<TodoModel>('todos').find(nextBehavior.scheduledActionTodoId);
      if (!existingTodo.completed) {
        const result = await updateTodo(existingTodo.id, {
          text: actionTitle,
          details: actionDetails,
          dueDate,
          hasDueTime: false,
          workspace: 'Personal',
        });
        todo = result.todo;
      }
    } catch {}
  }

  if (!todo) {
    todo = await createActionTodoForStep({
      title: actionTitle,
      details: actionDetails,
      cadence: 'once',
      effort: template.effort,
      youtubeQuery: template.youtubeQuery,
    }, dueDate);
  }

  const scheduledBehavior: GoalQuotaBehavior = {
    ...nextBehavior,
    initialPromptDismissed: true,
    scheduledActionTodoId: todo.id,
    scheduledActionDate: toDateKey(dueDate),
  };
  await updateGoalBehaviorForGoal(plan.goalId, scheduledBehavior);
  await persistActiveActions(row, [{
    stepIndex: 0,
    todoId: todo.id,
    dueDate: toDateKey(dueDate),
  }], [], 'accepted');

  const fresh = await collection.find(planId);
  return { plan: toGoalGuidancePlan(fresh), todo, goalBehavior: scheduledBehavior };
};

export const dismissGoalQuotaInitialPrompt = async (planId: string) => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const row = await collection.find(planId);
  const plan = toGoalGuidancePlan(row);
  const behavior = await getQuotaBehaviorForGoal(plan.goalId);
  if (!behavior) {
    throw new Error('This goal is not a quota goal.');
  }

  const nextBehavior = {
    ...withGoalQuotaActionTemplate(behavior, plan.steps),
    initialPromptDismissed: true,
  };

  await updateGoalBehaviorForGoal(plan.goalId, nextBehavior);

  const fresh = await collection.find(planId);
  return { plan: toGoalGuidancePlan(fresh), goalBehavior: nextBehavior };
};

export const recreateActiveGoalGuidanceTodo = async (planId: string) => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const row = await collection.find(planId);
  const plan = toGoalGuidancePlan(row);

  if (plan.status !== 'accepted') {
    throw new Error('Only accepted plans can recreate an action.');
  }

  if (await getQuotaBehaviorForGoal(plan.goalId)) {
    return scheduleGoalQuotaAction(planId, getTodayDueDate());
  }

  if (await isNestedGoalGuidanceActionPlan(plan)) {
    await persistActiveActions(row, [], plan.completedStepIndexes, 'accepted');

    const fresh = await collection.find(planId);
    return { plan: toGoalGuidancePlan(fresh), todo: null };
  }

  const { activeActions, createdTodos } = await createActionsUntilFull(
    plan,
    plan.activeActions,
    plan.completedStepIndexes
  );
  const syncedActiveActions = await syncActiveActionTodosToToday(activeActions);
  await persistActiveActions(row, syncedActiveActions, plan.completedStepIndexes, 'accepted');

  const fresh = await collection.find(planId);
  return { plan: toGoalGuidancePlan(fresh), todo: createdTodos[0] ?? null };
};

export const fetchGoalGuidancePlanForActionTodo = async (todoId: string) => {
  const row = await findAcceptedPlanByAnyActionTodo(todoId);
  if (!row) {
    return null;
  }

  const normalized = await normalizeAcceptedPlanActionsForToday(row);
  return toGoalGuidancePlan(normalized);
};

export const markGoalGuidanceActionDeleted = async (todoId: string) => {
  const row = await findAcceptedPlanByActiveTodo(todoId);
  if (!row) return null;

  const actionState = parseActionState(row);
  const activeActions = actionState.activeActions.filter((action) => action.todoId !== todoId);
  await database.write(async () => {
    const firstAction = activeActions[0];
    await row.update((record) => {
      record.activeTodoId = firstAction?.todoId;
      record.activeStepIndex = firstAction?.stepIndex ?? record.activeStepIndex;
      record.activeActionsJson = JSON.stringify({
        activeActions,
        todoIds: actionState.todoIds,
        todoStepIndexes: actionState.todoStepIndexes,
      });
    });
  });

  const fresh = await database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans').find(row.id);
  return toGoalGuidancePlan(fresh);
};

export const linkActiveGoalGuidanceTodo = async (planId: string, todoId: string) => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const row = await collection.find(planId);
  const plan = toGoalGuidancePlan(row);
  const existingTodoIds = new Set(plan.activeActions.map((action) => action.todoId));

  if (existingTodoIds.has(todoId)) {
    return plan;
  }

  const { activeActions } = await createActionsUntilFull(
    plan,
    [
      ...plan.activeActions,
      {
        stepIndex: plan.activeStepIndex,
        todoId,
        dueDate: toDateKey(new Date()),
      },
    ],
    plan.completedStepIndexes
  );
  const syncedActiveActions = await syncActiveActionTodosToToday(activeActions);
  await persistActiveActions(row, syncedActiveActions, plan.completedStepIndexes, 'accepted');

  const fresh = await collection.find(planId);
  return toGoalGuidancePlan(fresh);
};

export const saveGoalGuidanceStepProgress = async (
  planId: string,
  completedStepIndexes: number[],
  options?: { deleteActiveActionTodos?: boolean }
): Promise<{ plan: GoalGuidancePlan; deletedTodoIds: string[] }> => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const row = await collection.find(planId);
  const steps = parseJsonArray<GoalGuidanceStep>(row.stepsJson, []);
  const validCompletedStepIndexes = Array.from(new Set(completedStepIndexes))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < steps.length)
    .sort((a, b) => a - b);
  const isComplete = steps.length > 0 && validCompletedStepIndexes.length >= steps.length;
  const nextActiveStepIndex = isComplete
    ? Math.max(0, steps.length - 1)
    : steps.findIndex((_, index) => !validCompletedStepIndexes.includes(index));
  const actionState = parseActionState(row);
  const activeActionTodoIdsToDelete = options?.deleteActiveActionTodos
    ? Array.from(new Set(actionState.activeActions.map((action) => action.todoId).filter(Boolean)))
    : [];

  await database.write(async () => {
    await row.update((record) => {
      record.status = isComplete ? 'complete' : 'accepted';
      record.activeStepIndex = nextActiveStepIndex < 0 ? 0 : nextActiveStepIndex;
      record.activeTodoId = undefined;
      record.activeActionsJson = JSON.stringify({
        activeActions: [],
        todoIds: actionState.todoIds,
        todoStepIndexes: actionState.todoStepIndexes,
      });
      record.completedStepIndexesJson = JSON.stringify(validCompletedStepIndexes);
    });
  });

  if (activeActionTodoIdsToDelete.length > 0) {
    const existingTodos = await database.collections
      .get<TodoModel>('todos')
      .query(Q.where('id', Q.oneOf(activeActionTodoIdsToDelete)))
      .fetch();
    if (existingTodos.length > 0) {
      await deleteTodos(existingTodos.map((todo) => todo.id));
    }
  }

  const fresh = await collection.find(planId);
  return {
    plan: toGoalGuidancePlan(fresh),
    deletedTodoIds: activeActionTodoIdsToDelete,
  };
};

export const rewindGoalGuidanceStepProgress = async (
  planId: string,
  completedStepIndexes: number[]
): Promise<{ plan: GoalGuidancePlan; deletedTodoIds: string[]; todo: TodoModel | null }> => {
  const collection = database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans');
  const row = await collection.find(planId);
  const plan = toGoalGuidancePlan(row);
  const validCompletedStepIndexes = Array.from(new Set(completedStepIndexes))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < plan.steps.length)
    .sort((a, b) => a - b);
  const isComplete = plan.steps.length > 0 && validCompletedStepIndexes.length >= plan.steps.length;
  const nextActiveStepIndex = isComplete
    ? Math.max(0, plan.steps.length - 1)
    : plan.steps.findIndex((_, index) => !validCompletedStepIndexes.includes(index));
  const actionState = parseActionState(row);
  const activeActionTodoIdsToDelete = Array.from(new Set(
    actionState.activeActions.map((action) => action.todoId).filter(Boolean)
  ));

  const deleteActiveActionTodos = async () => {
    if (activeActionTodoIdsToDelete.length === 0) {
      return;
    }

    const existingTodos = await database.collections
      .get<TodoModel>('todos')
      .query(Q.where('id', Q.oneOf(activeActionTodoIdsToDelete)))
      .fetch();
    if (existingTodos.length > 0) {
      await deleteTodos(existingTodos.map((todo) => todo.id));
    }
  };

  const nextPlan: GoalGuidancePlan = {
    ...plan,
    completedStepIndexes: validCompletedStepIndexes,
    activeStepIndex: nextActiveStepIndex < 0 ? 0 : nextActiveStepIndex,
    activeActions: [],
    activeTodoId: undefined,
    status: isComplete ? 'complete' : 'accepted',
  };

  if (isComplete) {
    await persistActiveActions(row, [], validCompletedStepIndexes, 'complete');
    await deleteActiveActionTodos();
    const fresh = await collection.find(planId);
    return {
      plan: toGoalGuidancePlan(fresh),
      deletedTodoIds: activeActionTodoIdsToDelete,
      todo: null,
    };
  }

  if (await isNestedGoalGuidanceActionPlan(nextPlan)) {
    await persistActiveActions(row, [], validCompletedStepIndexes, 'accepted');
    await deleteActiveActionTodos();
    const fresh = await collection.find(planId);
    return {
      plan: toGoalGuidancePlan(fresh),
      deletedTodoIds: activeActionTodoIdsToDelete,
      todo: null,
    };
  }

  const { activeActions, createdTodos } = await createActionsUntilFull(nextPlan, [], validCompletedStepIndexes);
  const syncedActiveActions = await syncActiveActionTodosToToday(activeActions);
  await persistActiveActions(row, syncedActiveActions, validCompletedStepIndexes, 'accepted');
  await deleteActiveActionTodos();

  const fresh = await collection.find(planId);
  return {
    plan: toGoalGuidancePlan(fresh),
    deletedTodoIds: activeActionTodoIdsToDelete,
    todo: createdTodos[0] ?? null,
  };
};

export const advanceGoalGuidanceForCompletedTodo = async (todoId: string) => {
  if (advancingGoalGuidanceTodoIds.has(todoId)) {
    return null;
  }

  advancingGoalGuidanceTodoIds.add(todoId);

  try {
    const row = await findAcceptedPlanByActiveTodo(todoId);
    if (!row) return null;

    const plan = toGoalGuidancePlan(row);
    const completedAction = plan.activeActions.find((action) => action.todoId === todoId);
    if (!completedAction) return null;

    const quotaBehavior = await getQuotaBehaviorForGoal(plan.goalId);
    if (quotaBehavior) {
      const completedCount = Math.min(quotaBehavior.completedCount + 1, quotaBehavior.targetCount);
      const nextBehavior: GoalQuotaBehavior = {
        ...withGoalQuotaActionTemplate(quotaBehavior, plan.steps),
        completedCount,
        initialPromptDismissed: true,
        scheduledActionTodoId: undefined,
        scheduledActionDate: undefined,
        lastCompletedDate: toDateKey(getTodayDueDate()),
      };
      const isComplete = isGoalQuotaComplete(nextBehavior);
      await updateGoalBehaviorForGoal(plan.goalId, nextBehavior);
      await persistActiveActions(row, [], isComplete ? [0] : [], isComplete ? 'complete' : 'accepted');

      const fresh = await database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans').find(row.id);
      return {
        status: isComplete ? 'complete' as const : 'paused' as const,
        plan: toGoalGuidancePlan(fresh),
        todo: null,
      };
    }

    let activeActions = plan.activeActions.filter((action) => action.todoId !== todoId);
    const completedStepIndexes = [...plan.completedStepIndexes];

    if (!completedStepIndexes.includes(completedAction.stepIndex)) {
      completedStepIndexes.push(completedAction.stepIndex);
    }

    if (activeActions.length > 0) {
      activeActions = await syncActiveActionTodosToToday(activeActions);
      await persistActiveActions(row, activeActions, completedStepIndexes, 'accepted');

      const fresh = await database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans').find(row.id);
      return { status: 'advanced' as const, plan: toGoalGuidancePlan(fresh), todo: null };
    }

    const hasRemainingSteps = getNextInactiveStepIndex(plan.steps, [], completedStepIndexes) >= 0;
    const status = hasRemainingSteps ? 'accepted' : 'complete';
    const pausedUntilDate = hasRemainingSteps ? getTomorrowDateKey() : undefined;
    await persistActiveActions(row, [], completedStepIndexes, status, pausedUntilDate);

    const fresh = await database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans').find(row.id);
    return {
      status: status === 'complete' ? 'complete' as const : 'paused' as const,
      plan: toGoalGuidancePlan(fresh),
      todo: null,
    };
  } finally {
    advancingGoalGuidanceTodoIds.delete(todoId);
  }
};
