import { database } from '@/database/database';
import TodoModel from '@/database/models/TodoModel';
import TodoRecurrenceSeriesModel from '@/database/models/TodoRecurrenceSeriesModel';
import { Q } from '@nozbe/watermelondb';
import {
  cancelTodoReminder,
  rescheduleTodoReminder,
  scheduleTodoReminder,
  type TodoReminderResultStatus,
} from '@/lib/todoNotifications';
import {
  getDefaultTodoReminderState,
  normalizeTodoReminderState,
  type TodoReminderMode,
} from '@/utils/todoReminders';
import type { GoalTodoTimeframe } from '@/utils/goalTimeframes';
import { deleteTaskGuidesForTodos } from '@/lib/taskGuidance';
import { deleteRecipeGuidesForTodos } from '@/lib/recipeGuidance';
import { deleteSkillGuidesForTodos } from '@/lib/skillGuidance';
import type { GuidancePath, TodoTaskKind } from '@/lib/todoClassification';
import {
  compareTodosForSectionOrder,
  getMaxTodoSortOrderForScope,
  getNextTodoSortOrder,
  getNormalizedTodoSortOrder,
  getTodoOrderingWeekStartsOnFromLocale,
  getTodoSortScope,
  TODO_SORT_ORDER_STEP,
} from '@/lib/todoOrdering';
import {
  copyTodoTimeOntoOccurrenceDate,
  getTodoOccurrenceDay,
  getTodoOccurrenceDateKey,
  getTodoRecurrenceExpectedDateKeys,
  getNextTodoRecurrenceDateKeyAfter,
  normalizeTodoRecurrenceRule,
  parseTodoSkippedDateKeys,
  serializeTodoSkippedDateKeys,
  startOfLocalDay,
  type TodoRecurrenceRule,
} from '@/lib/todoRecurrence';

type TodoKind = 'basic' | 'progress' | 'slider';
type CreateTodoResult = {
  todo: TodoModel;
  reminderStatus: TodoReminderResultStatus;
};

const CREATE_TODO_DEDUPE_WINDOW_MS = 3000;
const pendingCreateTodoResults = new Map<string, Promise<CreateTodoResult>>();
const recentCreateTodoResults = new Map<string, { result: CreateTodoResult; expiresAt: number }>();

export type TodoSnapshot = {
  id: string;
  text: string;
  completed: boolean;
  details?: string;
  dueDate?: Date;
  hasDueTime: boolean;
  starred: boolean;
  workspace: string;
  amazonUrl?: string;
  isAmazonUrlLoaded: boolean;
  amazonUrlLoadAttempts: number;
  emailId?: string;
  type: TodoKind;
  startedAt?: Date;
  progress?: number;
  reminderEnabled: boolean;
  reminderMode: TodoReminderMode;
  reminderMinutesBefore?: number | null;
  notificationId?: string | null;
  goalTimeframe?: GoalTodoTimeframe | null;
  taskKind?: TodoTaskKind | null;
  guidancePath?: GuidancePath | null;
  goalBehaviorJson?: string | null;
  plannedDurationMinutes?: number | null;
  recurrenceSeriesId?: string | null;
  recurrenceOccurrenceDate?: Date | null;
  recurrenceOverride?: boolean | null;
  recurrence?: TodoRecurrenceRule | null;
};

export type CreateTodoInput = {
  text: string;
  completed?: boolean;
  details?: string;
  dueDate?: Date;
  hasDueTime?: boolean;
  starred?: boolean;
  workspace?: string;
  amazonUrl?: string;
  isAmazonUrlLoaded?: boolean;
  amazonUrlLoadAttempts?: number;
  emailId?: string;
  type?: TodoKind;
  startedAt?: Date;
  progress?: number;
  reminderEnabled?: boolean | null;
  reminderMode?: TodoReminderMode | null;
  reminderMinutesBefore?: number | null;
  goalTimeframe?: GoalTodoTimeframe | null;
  taskKind?: TodoTaskKind | null;
  guidancePath?: GuidancePath | null;
  goalBehaviorJson?: string | null;
  plannedDurationMinutes?: number | null;
  recurrence?: TodoRecurrenceRule | null;
  recurrenceSeriesId?: string | null;
  recurrenceOccurrenceDate?: Date | null;
  recurrenceOverride?: boolean | null;
};

export type UpdateTodoInput = Partial<{
  text: string;
  completed: boolean;
  details: string;
  dueDate: Date;
  hasDueTime: boolean;
  starred: boolean;
  workspace: string;
  amazonUrl: string;
  isAmazonUrlLoaded: boolean;
  amazonUrlLoadAttempts: number;
  emailId: string;
  type: TodoKind;
  startedAt: Date | null;
  progress: number | undefined;
  reminderEnabled: boolean;
  reminderMode: TodoReminderMode;
  reminderMinutesBefore: number | null;
  goalTimeframe: GoalTodoTimeframe | null;
  taskKind: TodoTaskKind | null;
  guidancePath: GuidancePath | null;
  goalBehaviorJson: string | null;
  plannedDurationMinutes: number | null;
  recurrenceSeriesId: string | null;
  recurrenceOccurrenceDate: Date | null;
  recurrenceOverride: boolean | null;
  recurrence: TodoRecurrenceRule | null;
}>;

const getTodoDateKey = (date?: Date) => {
  if (!date) {
    return null;
  }

  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const getCreateTodoDedupeKey = (
  input: CreateTodoInput,
  options?: { requestPermission?: boolean }
) => JSON.stringify([
  input.text.trim(),
  !!input.completed,
  input.details || '',
  getTodoDateKey(input.dueDate),
  !!input.hasDueTime,
  !!input.starred,
  input.workspace || 'Personal',
  input.amazonUrl || '',
  !!input.isAmazonUrlLoaded,
  input.amazonUrlLoadAttempts || 0,
  input.emailId || '',
  input.type || 'basic',
  getTodoDateKey(input.startedAt),
  input.progress ?? null,
  input.reminderEnabled ?? null,
  input.reminderMode ?? null,
  input.reminderMinutesBefore ?? null,
  input.goalTimeframe ?? null,
  input.taskKind ?? null,
  input.guidancePath ?? null,
  input.goalBehaviorJson ?? null,
  input.plannedDurationMinutes ?? null,
  input.recurrence ? `${input.recurrence.interval}:${input.recurrence.unit}` : null,
  options?.requestPermission ?? true,
]);

const pruneRecentCreateTodoResults = (now: number) => {
  for (const [key, value] of recentCreateTodoResults) {
    if (value.expiresAt <= now) {
      recentCreateTodoResults.delete(key);
    }
  }
};

type UpdateTodoSpec = {
  id: string;
  input: UpdateTodoInput;
  options?: {
    applyDefaultReminderWhenTimingAdded?: boolean;
    syncReminder?: boolean;
    requestPermission?: boolean;
  };
};

const todoOrderingWeekStartsOn = getTodoOrderingWeekStartsOnFromLocale();

const getTodoRowSortScope = (todo: Pick<
  TodoModel,
  'completed' | 'workspace' | 'dueDate' | 'goalTimeframe'
>) => getTodoSortScope(todo, todoOrderingWeekStartsOn);

const getTodoInputSortScope = (input: CreateTodoInput) =>
  getTodoSortScope(
    {
      completed: !!input.completed,
      workspace: input.workspace || 'Personal',
      dueDate: input.dueDate || new Date(),
      goalTimeframe: input.goalTimeframe,
    },
    todoOrderingWeekStartsOn
  );

const getUpdatedTodoSortScope = (todo: TodoModel, input: UpdateTodoInput) =>
  getTodoSortScope(
    {
      completed: input.completed ?? todo.completed,
      workspace: input.workspace ?? todo.workspace,
      dueDate: input.dueDate ?? todo.dueDate,
      goalTimeframe:
        input.goalTimeframe !== undefined
          ? input.goalTimeframe
          : todo.goalTimeframe,
    },
    todoOrderingWeekStartsOn
  );

const hasStoredOrderForScope = (todo: Pick<TodoModel, 'sortScope' | 'sortOrder'>, scope: string) =>
  todo.sortScope === scope &&
  typeof todo.sortOrder === 'number' &&
  Number.isFinite(todo.sortOrder);

const getFiniteStoredSortOrder = (todo: Pick<TodoModel, 'sortOrder'>) =>
  typeof todo.sortOrder === 'number' && Number.isFinite(todo.sortOrder)
    ? todo.sortOrder
    : null;

const toTodoOrderingInput = (todo: Pick<
  TodoModel,
  'id' | 'text' | 'dueDate' | 'sortScope' | 'sortOrder' | 'createdAt'
>) => ({
  id: todo.id,
  text: todo.text,
  dueDate: todo.dueDate,
  sortScope: todo.sortScope,
  sortOrder: todo.sortOrder,
  createdAt: todo.createdAt,
});

const nextOrderForScope = (scope: string, rows: TodoModel[], nextOrderByScope: Map<string, number>) => {
  const previousOrder = nextOrderByScope.get(scope) ?? getMaxTodoSortOrderForScope(rows, scope);
  const nextOrder = previousOrder + TODO_SORT_ORDER_STEP;
  nextOrderByScope.set(scope, nextOrder);
  return nextOrder;
};

const getTodoRecurrenceDateKey = (
  todo: Pick<TodoModel, 'recurrenceOccurrenceDate' | 'dueDate'>
) => getTodoOccurrenceDateKey(todo.recurrenceOccurrenceDate || todo.dueDate);

const compareTodoRecurrenceDates = (
  left: Pick<TodoModel, 'recurrenceOccurrenceDate' | 'dueDate' | 'createdAt'>,
  right: Pick<TodoModel, 'recurrenceOccurrenceDate' | 'dueDate' | 'createdAt'>
) => {
  const leftKey = getTodoRecurrenceDateKey(left) ?? left.createdAt?.getTime?.() ?? 0;
  const rightKey = getTodoRecurrenceDateKey(right) ?? right.createdAt?.getTime?.() ?? 0;
  return leftKey - rightKey;
};

const getSeriesTemplateTodo = (todos: TodoModel[]) => {
  const templateTodos = todos.filter((todo) => !todo.recurrenceOverride);
  if (!templateTodos.length) return null;
  return [...templateTodos].sort((left, right) => {
    if (left.completed !== right.completed) {
      return left.completed ? 1 : -1;
    }
    return compareTodoRecurrenceDates(right, left);
  })[0];
};

const getSeriesTodoRows = (todos: TodoModel[], seriesId: string) =>
  todos.filter((todo) => todo.recurrenceSeriesId === seriesId);

const getSeriesRule = (series: TodoRecurrenceSeriesModel): TodoRecurrenceRule | null =>
  normalizeTodoRecurrenceRule({
    interval: series.interval,
    unit: series.unit,
  });

const getTodoOrderingNormalizationUpdates = (rows: TodoModel[]) => {
  const nextOrderByScope = new Map<string, number>();
  rows.forEach((row) => {
    const expectedScope = getTodoRowSortScope(row);
    if (hasStoredOrderForScope(row, expectedScope)) {
      const currentMax = nextOrderByScope.get(expectedScope) || 0;
      nextOrderByScope.set(expectedScope, Math.max(currentMax, row.sortOrder || 0));
    }
  });

  return rows
    .filter((row) => !hasStoredOrderForScope(row, getTodoRowSortScope(row)))
    .sort((left, right) => {
      const leftScope = getTodoRowSortScope(left);
      const rightScope = getTodoRowSortScope(right);
      if (leftScope !== rightScope) {
        return leftScope.localeCompare(rightScope);
      }
      const leftStoredOrder = getFiniteStoredSortOrder(left);
      const rightStoredOrder = getFiniteStoredSortOrder(right);
      const leftStaleScope = left.sortScope && left.sortScope !== leftScope && leftStoredOrder !== null
        ? left.sortScope
        : null;
      const rightStaleScope = right.sortScope && right.sortScope !== rightScope && rightStoredOrder !== null
        ? right.sortScope
        : null;
      if (leftStaleScope !== rightStaleScope) {
        if (leftStaleScope === null) return -1;
        if (rightStaleScope === null) return 1;
        return leftStaleScope.localeCompare(rightStaleScope);
      }
      if (leftStaleScope && leftStoredOrder !== null && rightStoredOrder !== null && leftStoredOrder !== rightStoredOrder) {
        return leftStoredOrder - rightStoredOrder;
      }
      return compareTodosForSectionOrder(
        toTodoOrderingInput(left),
        toTodoOrderingInput(right),
        leftScope
      );
    })
    .map((row) => {
      const sortScope = getTodoRowSortScope(row);
      const sortOrder = (nextOrderByScope.get(sortScope) || 0) + TODO_SORT_ORDER_STEP;
      nextOrderByScope.set(sortScope, sortOrder);
      return { row, sortScope, sortOrder };
    });
};

const prepareTodoOrderingNormalizationUpdates = (rows: TodoModel[]) =>
  getTodoOrderingNormalizationUpdates(rows).map(({ row, sortScope, sortOrder }) =>
    row.prepareUpdate((record) => {
      record.sortScope = sortScope;
      record.sortOrder = sortOrder;
    })
  );

const applyReminderFields = (
  todo: TodoModel,
  reminder: ReturnType<typeof normalizeTodoReminderState>
) => {
  todo.reminderEnabled = reminder.reminderEnabled;
  todo.reminderMode = reminder.reminderMode;
  todo.reminderMinutesBefore = reminder.reminderMinutesBefore;
};

const getCreateInputRecurrenceRule = (input: CreateTodoInput) => {
  const rule = normalizeTodoRecurrenceRule(input.recurrence);
  const workspace = input.workspace || 'Personal';
  const type = input.type || 'basic';
  return workspace === 'Personal' && type === 'basic' ? rule : null;
};

const applyRecurrenceSeriesFields = (
  series: TodoRecurrenceSeriesModel,
  rule: TodoRecurrenceRule,
  startDate: Date
) => {
  series.unit = rule.unit;
  series.interval = rule.interval;
  series.startDate = startDate;
  series.anchorDay = rule.unit === 'month' ? startDate.getDate() : null;
  series.active = true;
  series.skippedDatesJson = '[]';
};

const applyCreateFields = (
  todo: TodoModel,
  input: CreateTodoInput,
  ordering: { sortScope: string; sortOrder: number }
) => {
  const hasDueTime = !!input.hasDueTime;
  const reminder = normalizeTodoReminderState(
    {
      reminderEnabled: input.reminderEnabled,
      reminderMode: input.reminderMode,
      reminderMinutesBefore: input.reminderMinutesBefore,
    },
    hasDueTime
  );
  const fallbackReminder =
    input.reminderMode == null &&
    input.reminderEnabled == null &&
    input.reminderMinutesBefore == null
      ? getDefaultTodoReminderState(hasDueTime)
      : reminder;

  todo.text = input.text;
  todo.completed = !!input.completed;
  todo.details = input.details || '';
  todo.dueDate = input.dueDate || new Date();
  todo.hasDueTime = hasDueTime;
  todo.starred = !!input.starred;
  todo.workspace = input.workspace || 'Personal';
  todo.goalTimeframe = input.goalTimeframe;
  todo.taskKind = input.taskKind;
  todo.guidancePath = input.guidancePath;
  todo.goalBehaviorJson = input.goalBehaviorJson;
  todo.plannedDurationMinutes = input.plannedDurationMinutes ?? null;
  todo.recurrenceSeriesId = input.recurrenceSeriesId ?? null;
  todo.recurrenceOccurrenceDate = input.recurrenceOccurrenceDate ?? null;
  todo.recurrenceOverride = !!input.recurrenceOverride;
  todo.sortScope = ordering.sortScope;
  todo.sortOrder = ordering.sortOrder;
  todo.amazonUrl = input.amazonUrl;
  todo.isAmazonUrlLoaded = !!input.isAmazonUrlLoaded;
  todo.amazonUrlLoadAttempts = input.amazonUrlLoadAttempts || 0;
  todo.emailId = input.emailId;
  // @ts-ignore
  todo.type = input.type || 'basic';
  // @ts-ignore
  todo.startedAt = input.startedAt;
  // @ts-ignore
  todo.progress = input.progress;
  applyReminderFields(todo, fallbackReminder);
  todo.notificationId = null;
};

const applyUpdateFields = (
  todo: TodoModel,
  input: UpdateTodoInput,
  options?: { applyDefaultReminderWhenTimingAdded?: boolean }
) => {
  const previousHasDueTime = todo.hasDueTime;
  const previousReminderEnabled = todo.reminderEnabled;
  const previousReminderMode = todo.reminderMode;

  if (input.text !== undefined) todo.text = input.text;
  if (input.completed !== undefined) todo.completed = input.completed;
  if (input.details !== undefined) todo.details = input.details;
  if (input.dueDate !== undefined) todo.dueDate = input.dueDate;
  if (input.hasDueTime !== undefined) todo.hasDueTime = input.hasDueTime;
  if (input.starred !== undefined) todo.starred = input.starred;
  if (input.workspace !== undefined) todo.workspace = input.workspace;
  if (input.goalTimeframe !== undefined) todo.goalTimeframe = input.goalTimeframe;
  if (input.taskKind !== undefined) todo.taskKind = input.taskKind;
  if (input.guidancePath !== undefined) todo.guidancePath = input.guidancePath;
  if (input.goalBehaviorJson !== undefined) todo.goalBehaviorJson = input.goalBehaviorJson;
  if (input.plannedDurationMinutes !== undefined) todo.plannedDurationMinutes = input.plannedDurationMinutes;
  if (input.recurrenceSeriesId !== undefined) todo.recurrenceSeriesId = input.recurrenceSeriesId;
  if (input.recurrenceOccurrenceDate !== undefined) todo.recurrenceOccurrenceDate = input.recurrenceOccurrenceDate;
  if (input.recurrenceOverride !== undefined) todo.recurrenceOverride = !!input.recurrenceOverride;
  if (input.amazonUrl !== undefined) todo.amazonUrl = input.amazonUrl;
  if (input.isAmazonUrlLoaded !== undefined) todo.isAmazonUrlLoaded = input.isAmazonUrlLoaded;
  if (input.amazonUrlLoadAttempts !== undefined) todo.amazonUrlLoadAttempts = input.amazonUrlLoadAttempts;
  if (input.emailId !== undefined) todo.emailId = input.emailId;
  if (input.type !== undefined) {
    // @ts-ignore
    todo.type = input.type;
  }
  if (input.startedAt !== undefined) {
    // @ts-ignore
    todo.startedAt = input.startedAt ?? undefined;
  }
  if (input.progress !== undefined) {
    // @ts-ignore
    todo.progress = input.progress;
  }

  const hasExplicitReminderChange =
    input.reminderEnabled !== undefined ||
    input.reminderMode !== undefined ||
    input.reminderMinutesBefore !== undefined;

  const shouldApplyDefaultReminder =
    !hasExplicitReminderChange &&
    !!options?.applyDefaultReminderWhenTimingAdded &&
    !previousHasDueTime &&
    !!todo.hasDueTime &&
    !previousReminderEnabled &&
    previousReminderMode === 'none';

  const reminder = shouldApplyDefaultReminder
    ? getDefaultTodoReminderState(true)
    : normalizeTodoReminderState(
        {
          reminderEnabled: input.reminderEnabled ?? todo.reminderEnabled,
          reminderMode: input.reminderMode ?? todo.reminderMode,
          reminderMinutesBefore:
            input.reminderMinutesBefore !== undefined
              ? input.reminderMinutesBefore
              : todo.reminderMinutesBefore,
        },
        todo.hasDueTime
      );

  applyReminderFields(todo, reminder);
};

export const snapshotTodo = (todo: Pick<
  TodoModel,
  | 'id'
  | 'text'
  | 'completed'
  | 'details'
  | 'dueDate'
  | 'hasDueTime'
  | 'starred'
  | 'workspace'
  | 'amazonUrl'
  | 'isAmazonUrlLoaded'
  | 'amazonUrlLoadAttempts'
  | 'emailId'
  | 'type'
  | 'startedAt'
  | 'progress'
  | 'reminderEnabled'
  | 'reminderMode'
  | 'reminderMinutesBefore'
  | 'notificationId'
  | 'goalTimeframe'
  | 'taskKind'
  | 'guidancePath'
  | 'goalBehaviorJson'
  | 'plannedDurationMinutes'
  | 'recurrenceSeriesId'
  | 'recurrenceOccurrenceDate'
  | 'recurrenceOverride'
>) => {
  const reminder = normalizeTodoReminderState(todo, todo.hasDueTime);

  return {
    id: todo.id,
    text: todo.text,
    completed: todo.completed,
    details: todo.details,
    dueDate: todo.dueDate || undefined,
    hasDueTime: todo.hasDueTime,
    starred: todo.starred,
    workspace: todo.workspace,
    amazonUrl: todo.amazonUrl,
    isAmazonUrlLoaded: todo.isAmazonUrlLoaded,
    amazonUrlLoadAttempts: todo.amazonUrlLoadAttempts,
    emailId: todo.emailId,
    type: todo.type || 'basic',
    startedAt: todo.startedAt || undefined,
    progress: todo.progress,
    reminderEnabled: reminder.reminderEnabled,
    reminderMode: reminder.reminderMode,
    reminderMinutesBefore: reminder.reminderMinutesBefore,
    notificationId: todo.notificationId ?? null,
    goalTimeframe: todo.goalTimeframe ?? null,
    taskKind: todo.taskKind ?? null,
    guidancePath: todo.guidancePath ?? null,
    goalBehaviorJson: todo.goalBehaviorJson ?? null,
    plannedDurationMinutes: todo.plannedDurationMinutes ?? null,
    recurrenceSeriesId: todo.recurrenceSeriesId ?? null,
    recurrenceOccurrenceDate: todo.recurrenceOccurrenceDate ?? null,
    recurrenceOverride: !!todo.recurrenceOverride,
    recurrence: null,
  } satisfies TodoSnapshot;
};

/**
 * A todo's reminder decides whether its calendar copy gets the Event Reminder, so
 * event reminders are re-synced after a change. Loaded on use: event reminders
 * read the calendar, which this module does not otherwise need.
 */
const resyncEventReminders = () => {
  void import('@/lib/eventNotifications')
    .then(({ syncEventReminders }) => syncEventReminders())
    .catch(() => {});
};

const syncReminderForTodo = async (todo: TodoModel, requestPermission = true) => {
  const result = todo.reminderMode === 'none' || !todo.hasDueTime || todo.completed
    ? await cancelTodoReminder(todo)
    : await rescheduleTodoReminder(todo, { requestPermission });
  resyncEventReminders();

  return {
    todo: await database.collections.get<TodoModel>('todos').find(todo.id),
    reminderStatus: result.status,
  };
};

export const createTodo = async (input: CreateTodoInput, options?: { requestPermission?: boolean }) => {
  const now = Date.now();
  const dedupeKey = getCreateTodoDedupeKey(input, options);
  pruneRecentCreateTodoResults(now);
  const recentResult = recentCreateTodoResults.get(dedupeKey);

  if (recentResult && recentResult.expiresAt > now) {
    return recentResult.result;
  }

  const pendingResult = pendingCreateTodoResults.get(dedupeKey);
  if (pendingResult) {
    return pendingResult;
  }

  const createPromise = createTodos([input], options).then(([result]) => result);
  pendingCreateTodoResults.set(dedupeKey, createPromise);

  try {
    const result = await createPromise;
    recentCreateTodoResults.set(dedupeKey, {
      result,
      expiresAt: Date.now() + CREATE_TODO_DEDUPE_WINDOW_MS,
    });
    return result;
  } finally {
    pendingCreateTodoResults.delete(dedupeKey);
  }
};

export const createTodos = async (
  inputs: CreateTodoInput[],
  options?: { requestPermission?: boolean }
) => {
  if (!inputs.length) {
    return [];
  }

  const todosCollection = database.collections.get<TodoModel>('todos');
  const recurrenceSeriesCollection = database.collections.get<TodoRecurrenceSeriesModel>('todo_recurrence_series');
  let createdTodos: TodoModel[] = [];

  await database.write(async () => {
    let existingRows = await todosCollection.query().fetch();
    const normalizationUpdates = prepareTodoOrderingNormalizationUpdates(existingRows);
    if (normalizationUpdates.length) {
      await database.batch(normalizationUpdates);
      existingRows = await todosCollection.query().fetch();
    }
    const nextOrderByScope = new Map<string, number>();
    const preparedSeries: TodoRecurrenceSeriesModel[] = [];
    createdTodos = inputs.map((input) => {
      const sortScope = getTodoInputSortScope(input);
      const sortOrder = nextOrderForScope(sortScope, existingRows, nextOrderByScope);
      const recurrenceRule = getCreateInputRecurrenceRule(input);
      let recurrenceSeriesId = input.recurrenceSeriesId ?? null;
      let recurrenceOccurrenceDate = input.recurrenceOccurrenceDate ?? null;
      if (recurrenceRule && !recurrenceSeriesId) {
        const startDate = input.dueDate || new Date();
        const series = recurrenceSeriesCollection.prepareCreate((row) => {
          applyRecurrenceSeriesFields(row, recurrenceRule, startDate);
        });
        preparedSeries.push(series);
        recurrenceSeriesId = series.id;
        recurrenceOccurrenceDate = getTodoOccurrenceDay(startDate);
      }
      return todosCollection.prepareCreate((todo) => {
        applyCreateFields(todo, {
          ...input,
          recurrenceSeriesId,
          recurrenceOccurrenceDate,
        }, { sortScope, sortOrder });
      });
    });
    await database.batch([...preparedSeries, ...createdTodos]);
  });

  const results = [];
  for (const todo of createdTodos) {
    if (todo.completed || !todo.hasDueTime) {
      results.push({ todo, reminderStatus: 'skipped' as const });
      continue;
    }

    const result = await scheduleTodoReminder(todo, {
      requestPermission: options?.requestPermission ?? true,
    });
    results.push({
      todo: await todosCollection.find(todo.id),
      reminderStatus: result.status,
    });
  }

  if (inputs.some((input) => !!getCreateInputRecurrenceRule(input))) {
    await syncRecurringTodos();
  }

  return results;
};

export const syncRecurringTodos = async (now = new Date()) => {
  const todosCollection = database.collections.get<TodoModel>('todos');
  const recurrenceSeriesCollection = database.collections.get<TodoRecurrenceSeriesModel>('todo_recurrence_series');
  const seriesRows = await recurrenceSeriesCollection.query().fetch();
  const activeSeriesRows = seriesRows.filter((series) => series.active);

  if (!activeSeriesRows.length) {
    return false;
  }

  let createdTodos: TodoModel[] = [];
  let changed = false;

  await database.write(async () => {
    const existingRows = await todosCollection.query().fetch();
    const normalizationUpdates = prepareTodoOrderingNormalizationUpdates(existingRows);
    if (normalizationUpdates.length) {
      await database.batch(normalizationUpdates);
      changed = true;
    }

    const rows = normalizationUpdates.length
      ? await todosCollection.query().fetch()
      : existingRows;
    const preparedTodos: TodoModel[] = [];

    for (const series of activeSeriesRows) {
      const rule = getSeriesRule(series);
      if (!rule) {
        continue;
      }

      const seriesTodos = getSeriesTodoRows(rows, series.id);
      const template = getSeriesTemplateTodo(seriesTodos);
      if (!template) {
        continue;
      }

      const existingDateKeys = new Set(
        seriesTodos
          .map(getTodoRecurrenceDateKey)
          .filter((key): key is number => key != null)
      );
      const todayKey = startOfLocalDay(now).getTime();
      const expectedDateKeys = getTodoRecurrenceExpectedDateKeys({
        startDate: series.startDate,
        interval: rule.interval,
        unit: rule.unit,
        anchorDay: series.anchorDay,
        skippedDatesJson: series.skippedDatesJson,
      }, now);
      const hasIncompleteFuture = seriesTodos.some((row) => {
        if (row.completed) return false;
        const dateKey = getTodoRecurrenceDateKey(row);
        return dateKey != null && dateKey > todayKey;
      });

      if (!hasIncompleteFuture) {
        const latestFutureDateKey = seriesTodos.reduce((latest, row) => {
          const dateKey = getTodoRecurrenceDateKey(row);
        return dateKey != null && dateKey > latest ? dateKey : latest;
      }, todayKey);

        const nextFutureDateKey = getNextTodoRecurrenceDateKeyAfter({
          startDate: series.startDate,
          interval: rule.interval,
          unit: rule.unit,
          anchorDay: series.anchorDay,
          skippedDatesJson: series.skippedDatesJson,
        }, latestFutureDateKey);
        if (nextFutureDateKey != null) {
          expectedDateKeys.push(nextFutureDateKey);
        }
      }

      for (const dateKey of expectedDateKeys) {
        if (existingDateKeys.has(dateKey)) {
          continue;
        }

        const occurrenceDate = new Date(dateKey);
        const dueDate = copyTodoTimeOntoOccurrenceDate(occurrenceDate, template.dueDate);
        const sortScope = getTodoSortScope({
          completed: false,
          workspace: 'Personal',
          dueDate,
          goalTimeframe: null,
        }, todoOrderingWeekStartsOn);
        const sortOrder = typeof template.sortOrder === 'number' && Number.isFinite(template.sortOrder)
          ? template.sortOrder
          : getNextTodoSortOrder(rows, sortScope);

        const preparedTodo = todosCollection.prepareCreate((todo) => {
          applyCreateFields(todo, {
            text: template.text,
            completed: false,
            details: template.details || '',
            dueDate,
            hasDueTime: template.hasDueTime,
            starred: template.starred,
            workspace: 'Personal',
            amazonUrl: undefined,
            isAmazonUrlLoaded: false,
            amazonUrlLoadAttempts: 0,
            emailId: undefined,
            type: 'basic',
            startedAt: undefined,
            progress: 0,
            reminderEnabled: template.reminderEnabled,
            reminderMode: template.reminderMode,
            reminderMinutesBefore: template.reminderMinutesBefore,
            goalTimeframe: null,
            taskKind: null,
            guidancePath: null,
            goalBehaviorJson: null,
            plannedDurationMinutes: template.plannedDurationMinutes ?? null,
            recurrenceSeriesId: series.id,
            recurrenceOccurrenceDate: occurrenceDate,
          }, { sortScope, sortOrder });
        });

        preparedTodos.push(preparedTodo);
        rows.push(preparedTodo);
        seriesTodos.push(preparedTodo);
        existingDateKeys.add(dateKey);
      }
    }

    if (preparedTodos.length) {
      await database.batch(preparedTodos);
      createdTodos = preparedTodos;
      changed = true;
    }
  });

  for (const todo of createdTodos) {
    if (!todo.completed && todo.hasDueTime) {
      await scheduleTodoReminder(todo, { requestPermission: false });
    }
  }

  return changed;
};

export const updateTodo = async (
  id: string,
  input: UpdateTodoInput,
  options?: {
    applyDefaultReminderWhenTimingAdded?: boolean;
    syncReminder?: boolean;
    requestPermission?: boolean;
  }
) => {
  const [result] = await updateTodos([{ id, input, options }]);
  return result;
};

export const updateTodos = async (specs: UpdateTodoSpec[]) => {
  if (!specs.length) {
    return [];
  }

  const todosCollection = database.collections.get<TodoModel>('todos');
  let updatedTodos: TodoModel[] = [];

  await database.write(async () => {
    let existingRows = await todosCollection.query().fetch();
    const normalizationUpdates = prepareTodoOrderingNormalizationUpdates(existingRows);
    if (normalizationUpdates.length) {
      await database.batch(normalizationUpdates);
      existingRows = await todosCollection.query().fetch();
    }
    const nextOrderByScope = new Map<string, number>();
    updatedTodos = await Promise.all(
      specs.map(async (spec) => {
        const todo = await todosCollection.find(spec.id);
        const targetSortScope = getUpdatedTodoSortScope(todo, spec.input);
        const shouldAppendToTargetScope = !hasStoredOrderForScope(todo, targetSortScope);
        const targetSortOrder = shouldAppendToTargetScope
          ? nextOrderForScope(targetSortScope, existingRows, nextOrderByScope)
          : todo.sortOrder;
        return todo.prepareUpdate((row) => {
          applyUpdateFields(row, spec.input, {
            applyDefaultReminderWhenTimingAdded: spec.options?.applyDefaultReminderWhenTimingAdded,
          });
          row.sortScope = targetSortScope;
          row.sortOrder = targetSortOrder;
        });
      })
    );
    await database.batch(updatedTodos);
  });

  const results = [];
  for (let index = 0; index < updatedTodos.length; index += 1) {
    const todo = updatedTodos[index];
    const spec = specs[index];

    if (!spec.options?.syncReminder) {
      results.push({ todo, reminderStatus: 'skipped' as const });
      continue;
    }

    results.push(await syncReminderForTodo(todo, spec.options?.requestPermission ?? true));
  }

  return results;
};

export type RecurringTodoEditScope = 'one' | 'future';

const addSkippedOccurrenceDate = async (seriesId: string, dateKey: number | null) => {
  if (dateKey == null) {
    return;
  }

  const recurrenceSeriesCollection = database.collections.get<TodoRecurrenceSeriesModel>('todo_recurrence_series');
  const series = await recurrenceSeriesCollection.find(seriesId);
  const skippedDateKeys = parseTodoSkippedDateKeys(series.skippedDatesJson);
  skippedDateKeys.add(dateKey);

  await database.write(async () => {
    await series.update((row) => {
      row.skippedDatesJson = serializeTodoSkippedDateKeys(skippedDateKeys);
    });
  });
};

const getRecurringTodoRowsForTodo = async (todo: TodoModel) => {
  if (!todo.recurrenceSeriesId) {
    return [];
  }

  return database.collections
    .get<TodoModel>('todos')
    .query(Q.where('recurrence_series_id', todo.recurrenceSeriesId))
    .fetch();
};

const createNextTemplateTodoForOneOffEdit = async (todo: TodoModel, seriesId: string) => {
  const rows = await getRecurringTodoRowsForTodo(todo);
  const hasOtherTemplate = rows.some((row) => row.id !== todo.id && !row.recurrenceOverride);
  if (hasOtherTemplate) {
    return null;
  }

  const todosCollection = database.collections.get<TodoModel>('todos');
  const recurrenceSeriesCollection = database.collections.get<TodoRecurrenceSeriesModel>('todo_recurrence_series');
  const series = await recurrenceSeriesCollection.find(seriesId);
  const rule = getSeriesRule(series);
  const currentDateKey = getTodoRecurrenceDateKey(todo);
  if (!rule || currentDateKey == null) {
    return null;
  }

  const nextDateKey = getNextTodoRecurrenceDateKeyAfter({
    startDate: series.startDate,
    interval: rule.interval,
    unit: rule.unit,
    anchorDay: series.anchorDay,
    skippedDatesJson: series.skippedDatesJson,
  }, currentDateKey);
  if (nextDateKey == null) {
    return null;
  }

  const alreadyExists = rows.some((row) => getTodoRecurrenceDateKey(row) === nextDateKey);
  if (alreadyExists) {
    return null;
  }

  let createdTodo: TodoModel | null = null;
  await database.write(async () => {
    let existingRows = await todosCollection.query().fetch();
    const normalizationUpdates = prepareTodoOrderingNormalizationUpdates(existingRows);
    if (normalizationUpdates.length) {
      await database.batch(normalizationUpdates);
      existingRows = await todosCollection.query().fetch();
    }

    const occurrenceDate = new Date(nextDateKey);
    const dueDate = copyTodoTimeOntoOccurrenceDate(occurrenceDate, todo.dueDate);
    const sortScope = getTodoSortScope({
      completed: false,
      workspace: 'Personal',
      dueDate,
      goalTimeframe: null,
    }, todoOrderingWeekStartsOn);
    const sortOrder = getNextTodoSortOrder(existingRows, sortScope);

    createdTodo = todosCollection.prepareCreate((row) => {
      applyCreateFields(row, {
        text: todo.text,
        completed: false,
        details: todo.details || '',
        dueDate,
        hasDueTime: todo.hasDueTime,
        starred: todo.starred,
        workspace: 'Personal',
        amazonUrl: undefined,
        isAmazonUrlLoaded: false,
        amazonUrlLoadAttempts: 0,
        emailId: undefined,
        type: 'basic',
        startedAt: undefined,
        progress: 0,
        reminderEnabled: todo.reminderEnabled,
        reminderMode: todo.reminderMode,
        reminderMinutesBefore: todo.reminderMinutesBefore,
        goalTimeframe: null,
        taskKind: null,
        guidancePath: null,
        goalBehaviorJson: null,
        plannedDurationMinutes: todo.plannedDurationMinutes ?? null,
        recurrenceSeriesId: seriesId,
        recurrenceOccurrenceDate: occurrenceDate,
        recurrenceOverride: false,
      }, { sortScope, sortOrder });
    });
    await database.batch(createdTodo);
  });

  const scheduledTodo = createdTodo as TodoModel | null;
  if (scheduledTodo && !scheduledTodo.completed && scheduledTodo.hasDueTime) {
    await scheduleTodoReminder(scheduledTodo, { requestPermission: false });
  }

  return scheduledTodo;
};

export const updateRecurringTodo = async (
  id: string,
  input: UpdateTodoInput,
  scope: RecurringTodoEditScope,
  options?: UpdateTodoSpec['options']
) => {
  const todosCollection = database.collections.get<TodoModel>('todos');
  const recurrenceSeriesCollection = database.collections.get<TodoRecurrenceSeriesModel>('todo_recurrence_series');
  const todo = await todosCollection.find(id);
  const seriesId = todo.recurrenceSeriesId;

  if (!seriesId) {
    return updateTodo(id, input, options);
  }

  if (input.recurrence === null) {
    return stopTodoRecurrence(id);
  }

  if (scope === 'one') {
    if (!todo.recurrenceOverride) {
      await createNextTemplateTodoForOneOffEdit(todo, seriesId);
    }
    const nextInput = { ...input };
    nextInput.recurrenceOverride = true;
    if (input.dueDate) {
      const currentDateKey = getTodoRecurrenceDateKey(todo);
      await addSkippedOccurrenceDate(seriesId, currentDateKey);
      nextInput.recurrenceOccurrenceDate = getTodoOccurrenceDay(input.dueDate);
    }
    return updateTodo(id, nextInput, options);
  }

  const targetDateKey = getTodoRecurrenceDateKey(todo) ?? 0;
  const rows = await getRecurringTodoRowsForTodo(todo);
  const futureRows = rows.filter((row) => {
    const rowDateKey = getTodoRecurrenceDateKey(row) ?? 0;
    return !row.completed && (row.id === id || !row.recurrenceOverride) && rowDateKey >= targetDateKey;
  });

  if (input.recurrence) {
    const rule = normalizeTodoRecurrenceRule(input.recurrence);
    if (rule) {
      const startDate = input.dueDate || todo.dueDate || new Date();
      const futureIdsToDelete = futureRows
        .filter((row) => row.id !== id)
        .map((row) => row.id);
      await database.write(async () => {
        const series = await recurrenceSeriesCollection.find(seriesId);
        await series.update((row) => {
          applyRecurrenceSeriesFields(row, rule, startDate);
        });
      });
      if (futureIdsToDelete.length) {
        await deleteTodos(futureIdsToDelete);
      }
      const result = await updateTodo(id, {
        ...input,
        recurrenceSeriesId: seriesId,
        recurrenceOccurrenceDate: getTodoOccurrenceDay(startDate),
        recurrenceOverride: false,
      }, options);
      await syncRecurringTodos();
      return result;
    }
  }

  const inputDueDateKey = input.dueDate ? getTodoOccurrenceDateKey(input.dueDate) : null;
  const isDateReanchor = inputDueDateKey != null && inputDueDateKey !== targetDateKey;

  if (isDateReanchor) {
    const startDate = input.dueDate!;
    const rule = getSeriesRule(await recurrenceSeriesCollection.find(seriesId));
    const futureIdsToDelete = futureRows
      .filter((row) => row.id !== id)
      .map((row) => row.id);

    if (rule) {
      await database.write(async () => {
        const series = await recurrenceSeriesCollection.find(seriesId);
        await series.update((row) => {
          applyRecurrenceSeriesFields(row, rule, startDate);
        });
      });
    }

    if (futureIdsToDelete.length) {
      await deleteTodos(futureIdsToDelete);
    }

    const result = await updateTodo(id, {
      ...input,
      recurrenceSeriesId: seriesId,
      recurrenceOccurrenceDate: getTodoOccurrenceDay(startDate),
      recurrenceOverride: false,
    }, options);
    await syncRecurringTodos();
    return result;
  }

  const updateSpecs = futureRows.map((row) => {
    if (!input.dueDate) {
      return { id: row.id, input: { ...input, recurrenceOverride: false }, options };
    }

    const occurrenceDateKey = getTodoRecurrenceDateKey(row);
    const occurrenceDate = occurrenceDateKey != null
      ? new Date(occurrenceDateKey)
      : row.dueDate || input.dueDate;

    return {
      id: row.id,
      input: {
        ...input,
        dueDate: copyTodoTimeOntoOccurrenceDate(occurrenceDate, input.dueDate),
        recurrenceOverride: false,
      },
      options,
    };
  });

  if (!updateSpecs.length) {
    return updateTodo(id, input, options);
  }

  const results = await updateTodos(updateSpecs);
  await syncRecurringTodos();
  return results.find((result) => result.todo.id === id) || results[0];
};

export const stopTodoRecurrence = async (id: string) => {
  const todosCollection = database.collections.get<TodoModel>('todos');
  const recurrenceSeriesCollection = database.collections.get<TodoRecurrenceSeriesModel>('todo_recurrence_series');
  const todo = await todosCollection.find(id);
  const seriesId = todo.recurrenceSeriesId;

  if (!seriesId) {
    return updateTodo(id, { recurrenceSeriesId: null, recurrenceOccurrenceDate: null, recurrenceOverride: false });
  }

  const rows = await getRecurringTodoRowsForTodo(todo);
  const deleteIds = rows
    .filter((row) => row.id !== id && !row.completed)
    .map((row) => row.id);

  await database.write(async () => {
    const series = await recurrenceSeriesCollection.find(seriesId);
    await series.update((row) => {
      row.active = false;
    });
  });

  if (deleteIds.length) {
    await deleteTodos(deleteIds);
  }

  return updateTodo(id, {
    recurrenceSeriesId: null,
    recurrenceOccurrenceDate: null,
    recurrenceOverride: false,
  }, { syncReminder: true });
};

export const setTodoRecurrence = async (
  id: string,
  recurrence: TodoRecurrenceRule | null
) => {
  const rule = normalizeTodoRecurrenceRule(recurrence);
  if (!rule) {
    return stopTodoRecurrence(id);
  }

  const todosCollection = database.collections.get<TodoModel>('todos');
  const recurrenceSeriesCollection = database.collections.get<TodoRecurrenceSeriesModel>('todo_recurrence_series');
  const todo = await todosCollection.find(id);

  if (todo.recurrenceSeriesId) {
    return updateRecurringTodo(id, { recurrence: rule }, 'future', { syncReminder: true });
  }

  if (todo.workspace !== 'Personal' || todo.type !== 'basic') {
    return { todo, reminderStatus: 'skipped' as const };
  }

  const startDate = todo.dueDate || new Date();
  let seriesId = '';
  await database.write(async () => {
    const series = recurrenceSeriesCollection.prepareCreate((row) => {
      applyRecurrenceSeriesFields(row, rule, startDate);
    });
    seriesId = series.id;
    await database.batch([series, todo.prepareUpdate((row) => {
      row.recurrenceSeriesId = series.id;
      row.recurrenceOccurrenceDate = getTodoOccurrenceDay(startDate);
      row.recurrenceOverride = false;
    })]);
  });

  await syncRecurringTodos();
  return updateTodo(id, {
    recurrenceSeriesId: seriesId,
    recurrenceOccurrenceDate: getTodoOccurrenceDay(startDate),
    recurrenceOverride: false,
  }, { syncReminder: true });
};

export const normalizeTodoOrdering = async (inputRows?: TodoModel[]) => {
  const todosCollection = database.collections.get<TodoModel>('todos');
  const rows = inputRows || await todosCollection.query().fetch();
  if (!rows.length) {
    return false;
  }

  const updates = getTodoOrderingNormalizationUpdates(rows);
  if (!updates.length) {
    return false;
  }

  await database.write(async () => {
    await database.batch(updates.map(({ row, sortScope, sortOrder }) =>
      row.prepareUpdate((record) => {
        record.sortScope = sortScope;
        record.sortOrder = sortOrder;
      })
    ));
  });

  return true;
};

export const reorderTodosInSection = async (todoIds: string[], sortScope: string) => {
  const orderedIds = Array.from(new Set(todoIds.filter(Boolean)));
  if (!orderedIds.length || orderedIds.length !== todoIds.length) {
    return false;
  }

  const todosCollection = database.collections.get<TodoModel>('todos');
  const rows = await todosCollection.query(Q.where('id', Q.oneOf(orderedIds))).fetch();
  if (rows.length !== orderedIds.length) {
    return false;
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const orderedRows = orderedIds.map((id) => rowsById.get(id));
  if (orderedRows.some((row) => !row || getTodoRowSortScope(row) !== sortScope)) {
    return false;
  }

  await database.write(async () => {
    await database.batch(orderedRows.map((row, index) =>
      row!.prepareUpdate((record) => {
        record.sortScope = sortScope;
        record.sortOrder = getNormalizedTodoSortOrder(index);
      })
    ));
  });

  return true;
};

export const deleteTodo = async (id: string) => {
  const [snapshot] = await deleteTodos([id]);
  return snapshot;
};

export const deleteTodos = async (ids: string[]) => {
  if (!ids.length) {
    return [];
  }

  const todosCollection = database.collections.get<TodoModel>('todos');
  const rows = await Promise.all(ids.map((id) => todosCollection.find(id)));
  const snapshots = rows.map(snapshotTodo);
  const notificationTargets = rows.map((row) => ({ id: row.id, notificationId: row.notificationId }));

  await Promise.all([
    deleteTaskGuidesForTodos(ids),
    deleteRecipeGuidesForTodos(ids),
    deleteSkillGuidesForTodos(ids),
  ]);

  await database.write(async () => {
    await database.batch(rows.map((row) => row.prepareDestroyPermanently()));
  });

  for (const target of notificationTargets) {
    await cancelTodoReminder(target, { persist: false });
  }
  // The tasks' calendar events go with them, in the app and on Google Calendar.
  await import('@/lib/todoCalendarCopies')
    .then(({ deleteCalendarCopiesForTodos }) => deleteCalendarCopiesForTodos(ids))
    .catch((error) => console.warn('Could not delete calendar events for deleted tasks:', error));
  resyncEventReminders();

  return snapshots;
};

export const deleteRecurringTodoOccurrence = async (id: string) => {
  const todosCollection = database.collections.get<TodoModel>('todos');
  const todo = await todosCollection.find(id);

  if (todo.recurrenceSeriesId) {
    await addSkippedOccurrenceDate(todo.recurrenceSeriesId, getTodoRecurrenceDateKey(todo));
  }

  return deleteTodo(id);
};

export const deleteRecurringTodoCompletedHistory = async (id: string) => {
  const todosCollection = database.collections.get<TodoModel>('todos');
  const todo = await todosCollection.find(id);

  if (!todo.recurrenceSeriesId) {
    const snapshot = await deleteTodo(id);
    return snapshot ? [snapshot] : [];
  }

  const rows = await getRecurringTodoRowsForTodo(todo);
  const idsToDelete = rows
    .filter((row) => row.completed)
    .map((row) => row.id);

  return deleteTodos(idsToDelete);
};

export const deleteRecurringTodoSeries = async (
  id: string,
  options?: { deleteCompletedHistory?: boolean }
) => {
  const todosCollection = database.collections.get<TodoModel>('todos');
  const recurrenceSeriesCollection = database.collections.get<TodoRecurrenceSeriesModel>('todo_recurrence_series');
  const todo = await todosCollection.find(id);
  const seriesId = todo.recurrenceSeriesId;

  if (!seriesId) {
    const snapshot = await deleteTodo(id);
    return snapshot ? [snapshot] : [];
  }

  const rows = await getRecurringTodoRowsForTodo(todo);
  const idsToDelete = rows
    .filter((row) => options?.deleteCompletedHistory || !row.completed)
    .map((row) => row.id);

  await database.write(async () => {
    const series = await recurrenceSeriesCollection.find(seriesId);
    await series.update((row) => {
      row.active = false;
    });
  });

  return deleteTodos(idsToDelete);
};

const buildDirtyRawFromSnapshot = (snapshot: TodoSnapshot) => {
  const now = Date.now();
  const sortScope = getTodoSortScope(
    {
      completed: snapshot.completed,
      workspace: snapshot.workspace,
      dueDate: snapshot.dueDate,
      goalTimeframe: snapshot.goalTimeframe,
    },
    todoOrderingWeekStartsOn
  );

  return {
    id: snapshot.id,
    text: snapshot.text,
    completed: snapshot.completed,
    details: snapshot.details ?? '',
    due_date: snapshot.dueDate ? snapshot.dueDate.getTime() : null,
    has_due_time: snapshot.hasDueTime,
    starred: snapshot.starred,
    workspace: snapshot.workspace,
    amazon_url: snapshot.amazonUrl ?? null,
    is_amazon_url_loaded: snapshot.isAmazonUrlLoaded,
    amazon_url_load_attempts: snapshot.amazonUrlLoadAttempts,
    created_at: now,
    updated_at: now,
    email_id: snapshot.emailId ?? null,
    type: snapshot.type,
    started_at: snapshot.startedAt ? snapshot.startedAt.getTime() : null,
    progress: snapshot.progress ?? null,
    reminder_enabled: snapshot.reminderEnabled,
    reminder_mode: snapshot.reminderMode,
    reminder_minutes_before: snapshot.reminderMinutesBefore ?? null,
    notification_id: null,
    goal_timeframe: snapshot.goalTimeframe ?? null,
    task_kind: snapshot.taskKind ?? null,
    guidance_path: snapshot.guidancePath ?? null,
    goal_behavior_json: snapshot.goalBehaviorJson ?? null,
    planned_duration_minutes: snapshot.plannedDurationMinutes ?? null,
    recurrence_series_id: snapshot.recurrenceSeriesId ?? null,
    recurrence_occurrence_date: snapshot.recurrenceOccurrenceDate ? snapshot.recurrenceOccurrenceDate.getTime() : null,
    recurrence_override: !!snapshot.recurrenceOverride,
    sort_scope: sortScope,
    sort_order: null as number | null,
  };
};

export const restoreTodo = async (snapshot: TodoSnapshot, options?: { requestPermission?: boolean }) => {
  const todosCollection = database.collections.get<TodoModel>('todos');
  let restoredTodo!: TodoModel;

  await database.write(async () => {
    let existingRows = await todosCollection.query().fetch();
    const normalizationUpdates = prepareTodoOrderingNormalizationUpdates(existingRows);
    if (normalizationUpdates.length) {
      await database.batch(normalizationUpdates);
      existingRows = await todosCollection.query().fetch();
    }
    const raw = buildDirtyRawFromSnapshot(snapshot);
    raw.sort_order = getNextTodoSortOrder(existingRows, raw.sort_scope);
    restoredTodo = todosCollection.prepareCreateFromDirtyRaw(raw);
    await database.batch(restoredTodo);
  });

  if (restoredTodo.completed || !restoredTodo.hasDueTime) {
    return { todo: restoredTodo, reminderStatus: 'skipped' as const };
  }

  const result = await scheduleTodoReminder(restoredTodo, {
    requestPermission: options?.requestPermission ?? true,
  });

  return {
    todo: await todosCollection.find(restoredTodo.id),
    reminderStatus: result.status,
  };
};
