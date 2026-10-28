import { Q } from '@nozbe/watermelondb';
import UserPreferenceModel from '../../../../database/models/UserPreferenceModel';
import { database } from '../../../../database/database';
import TodoModel from '../../../../database/models/TodoModel';
import { createTodos, deleteRecurringTodoOccurrence, deleteTodos, setTodoRecurrence, syncRecurringTodos, updateRecurringTodo, updateTodos } from '@/lib/todoMutations';
import { advanceGoalGuidanceForCompletedTodo, deleteGoalGuidanceForGoal, fetchGoalGuidancePlanForActionTodo, markGoalGuidanceActionDeleted } from '@/lib/goalGuidance';
import { fetchTaskGuideForTodo, saveTaskGuide } from '@/lib/taskGuidance';
import { fetchRecipeGuideForTodo } from '@/lib/recipeGuidance';
import { fetchSkillGuideForTodo } from '@/lib/skillGuidance';
import { isClassificationNotOnPlanError, requestTodoClassification, shouldClassifyTodoWorkspace, type TodoTaskKind } from '@/lib/todoClassification';
import {
  coerceTodoWorkspaceKey,
  isSupportedTodoWorkspaceKey,
  normalizeTodoWorkspaceKey,
} from '@/lib/todoWorkspaces';
import {
  getTodoRecurrenceLabel,
  normalizeTodoRecurrenceRule,
  type TodoRecurrenceRule,
} from '@/lib/todoRecurrence';

export type ToolHandler = (args: any) => Promise<any>;

const isMidnight = (d: Date) =>
  d.getHours() === 0 &&
  d.getMinutes() === 0 &&
  d.getSeconds() === 0 &&
  d.getMilliseconds() === 0;

const getDefaultTodoDueDate = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const normalizeDurationMinutes = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(15, Math.min(480, Math.round(parsed / 15) * 15));
};

const isTodoRecurrenceOffInput = (value: unknown) => {
  if (value == null) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'none' ||
    normalized === 'no repeat' ||
    normalized === 'never' ||
    normalized === 'off';
};

const normalizeTodoRecurrenceInput = (value: unknown): TodoRecurrenceRule | null => {
  if (value == null) return null;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (isTodoRecurrenceOffInput(normalized)) return null;
    if (normalized === 'daily' || normalized === 'every day') return { interval: 1, unit: 'day' };
    if (normalized === 'weekly') return { interval: 1, unit: 'week' };
    if (normalized === 'weekdays' || normalized === 'every weekday' || normalized === 'weekdays only') {
      return { interval: 1, unit: 'weekday' };
    }
    if (normalized === 'monthly') return { interval: 1, unit: 'month' };
    const match = normalized.match(/^every\s+(\d{1,2})\s+(day|days|week|weeks|month|months)$/);
    if (match) {
      const unit = match[2].replace(/s$/, '') as TodoRecurrenceRule['unit'];
      return normalizeTodoRecurrenceRule({ interval: Number(match[1]), unit });
    }
    return null;
  }
  return normalizeTodoRecurrenceRule(value);
};

const deleteGuidanceForDeletedGoals = async (ids: string[]) => {
  if (!ids.length) return new Set<string>();

  const todos = database.collections.get<TodoModel>('todos');
  const rows = await todos.query(Q.where('id', Q.oneOf(ids))).fetch();
  const goalIds = rows
    .filter((row) => row.workspace === 'Goals')
    .map((row) => String(row.id));

  const deletedTodos = await Promise.allSettled(goalIds.map((id) => deleteGoalGuidanceForGoal(id)));
  return new Set(
    deletedTodos
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof deleteGoalGuidanceForGoal>>> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .map((todo) => todo.id)
  );
};

const advanceGuidanceForCompletedTodos = async (ids: string[]) => {
  const results = [];
  for (const id of ids) {
    try {
      results.push(await advanceGoalGuidanceForCompletedTodo(id));
    } catch {
      results.push(null);
    }
  }
  const completedGoalIds = Array.from(new Set(results
    .filter((result) => result?.status === 'complete')
    .map((result) => result!.plan.goalId)));

  if (completedGoalIds.length) {
    await updateTodos(completedGoalIds.map((id) => ({
      id,
      input: { completed: true },
      options: { syncReminder: true },
    })));
  }
};

const completeTaskGuidanceForCompletedTodos = async (ids: string[]) => {
  for (const id of ids) {
    try {
      const guide = await fetchTaskGuideForTodo(id);
      if (!guide || !guide.steps.length || (guide.status !== 'preview' && guide.status !== 'accepted' && guide.status !== 'complete')) {
        continue;
      }

      await saveTaskGuide({
        todoId: id,
        steps: guide.steps.map((step) => ({ ...step, completed: true })),
        activeStepIndex: Math.max(0, guide.steps.length - 1),
        status: 'complete',
      });
    } catch {}
  }
};

const markGuidanceActionsDeleted = async (ids: string[]) => {
  for (const id of ids) {
    try {
      await markGoalGuidanceActionDeleted(id);
    } catch {}
  }
};

const getChatMutationProtectionReason = async (todo: TodoModel) => {
  if (todo.workspace === 'Goals') {
    return 'goal';
  }

  try {
    const parentPlan = await fetchGoalGuidancePlanForActionTodo(todo.id);
    if (parentPlan) {
      return 'goal guidance action';
    }
  } catch {}

  try {
    const taskGuide = await fetchTaskGuideForTodo(todo.id);
    if (taskGuide) {
      return 'task guide';
    }
  } catch {}

  try {
    const recipeGuide = await fetchRecipeGuideForTodo(todo.id);
    if (recipeGuide) {
      return 'recipe guide';
    }
  } catch {}

  try {
    const skillGuide = await fetchSkillGuideForTodo(todo.id);
    if (skillGuide) {
      return 'skill guide';
    }
  } catch {}

  return null;
};

const pushMutableTodoOrSkip = async (
  row: TodoModel,
  skippedItems: { id: string; text: string; reason: string }[]
) => {
  const reason = await getChatMutationProtectionReason(row);
  if (reason) {
    skippedItems.push({ id: String(row.id), text: row.text, reason });
    return false;
  }
  return true;
};

const getTodoOccurrenceKey = (todo: TodoModel) => {
  const date = todo.recurrenceOccurrenceDate || todo.dueDate;
  if (!date) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const getVisibleRecurringTodoIds = (rows: TodoModel[]) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = today.getTime();
  const visibleIds = new Set<string>();
  const incompleteBySeries = new Map<string, TodoModel[]>();
  const completedBySeries = new Map<string, TodoModel>();

  rows.forEach((row) => {
    if (!row.recurrenceSeriesId) return;

    if (row.completed) {
      const current = completedBySeries.get(row.recurrenceSeriesId);
      const rowKey = getTodoOccurrenceKey(row) ?? 0;
      const currentKey = current ? getTodoOccurrenceKey(current) ?? 0 : -1;
      if (!current || rowKey >= currentKey) {
        completedBySeries.set(row.recurrenceSeriesId, row);
      }
      return;
    }

    const items = incompleteBySeries.get(row.recurrenceSeriesId) || [];
    items.push(row);
    incompleteBySeries.set(row.recurrenceSeriesId, items);
  });

  incompleteBySeries.forEach((items) => {
    const ordered = [...items].sort((left, right) => {
      const leftKey = getTodoOccurrenceKey(left) ?? 0;
      const rightKey = getTodoOccurrenceKey(right) ?? 0;
      return leftKey - rightKey;
    });
    const dueOrMissed = ordered.find((row) => {
      const key = getTodoOccurrenceKey(row);
      return key != null && key <= todayKey;
    });
    const future = ordered.find((row) => {
      const key = getTodoOccurrenceKey(row);
      return key != null && key > todayKey;
    });

    const visible = dueOrMissed || future;
    if (visible) visibleIds.add(String(visible.id));
  });

  completedBySeries.forEach((row) => {
    visibleIds.add(String(row.id));
  });

  return visibleIds;
};

const hasEarlierIncompleteRecurringTodo = async (row: TodoModel) => {
  if (!row.recurrenceSeriesId) return false;
  const currentKey = getTodoOccurrenceKey(row);
  if (currentKey == null) return false;
  const rows = await database.collections
    .get<TodoModel>('todos')
    .query(Q.where('recurrence_series_id', row.recurrenceSeriesId))
    .fetch();
  return rows.some((item) => {
    if (item.id === row.id || item.completed) return false;
    const itemKey = getTodoOccurrenceKey(item);
    return itemKey != null && itemKey < currentKey;
  });
};

const parseDueInput = (raw?: string, hasDueTime?: boolean): { dueDate?: Date; hasDueTime: boolean } => {
  if (!raw || typeof raw !== 'string') return { dueDate: undefined, hasDueTime: false };
  const lower = raw.toLowerCase();
  const now = new Date();
  if (lower === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return { dueDate: d, hasDueTime: false };
  }
  if (lower === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return { dueDate: d, hasDueTime: false };
  }
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    d.setHours(0, 0, 0, 0);
    return { dueDate: d, hasDueTime: false };
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return { dueDate: undefined, hasDueTime: false };
  const resolvedHasDueTime =
    typeof hasDueTime === 'boolean'
      ? hasDueTime
      : /^\d{4}-\d{2}-\d{2}T/.test(raw) || !isMidnight(d);
  if (!resolvedHasDueTime) {
    d.setHours(0, 0, 0, 0);
  }
  return { dueDate: d, hasDueTime: resolvedHasDueTime };
};

const toLocalYmd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseDayInput = (s: string): string | null => {
  if (!s || typeof s !== 'string') return null;
  const trimmed = s.trim();
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const m1 = trimmed.match(dmy);
  if (m1) {
    const dd = parseInt(m1[1], 10);
    const mm = parseInt(m1[2], 10);
    const yyyy = parseInt(m1[3], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const d = new Date(yyyy, mm - 1, dd);
      if (!isNaN(d.getTime())) return toLocalYmd(d);
    }
    return null;
  }
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
  const m2 = trimmed.match(ymd);
  if (m2) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return toLocalYmd(d);
  }
  return null;
};

// Map user-provided workspace names to stable keys (e.g., "work" → "Goals")
const resolveWorkspaceKey = async (input?: string): Promise<string> => {
  const raw = String(input || '').trim();
  if (!raw) return 'Personal';
  const normalizedInput = normalizeTodoWorkspaceKey(raw);
  if (normalizedInput !== raw) return normalizedInput;
  const norm = raw.toLowerCase().replace(/\s+workspace$/i, '').trim();
  try {
    const prefs = await database.collections.get<UserPreferenceModel>('user_preferences').query().fetch();
    for (const p of prefs) {
      const key = normalizeTodoWorkspaceKey(String((p as any).original_name || (p as any).workspace_name || ''));
      const disp = String((p as any).display_name || (p as any).workspace_name || '');
      if (!key) continue;
      const names = [key, disp].map((s) => s.toLowerCase());
      if (names.includes(norm)) return coerceTodoWorkspaceKey(key);
    }
  } catch {}
  return coerceTodoWorkspaceKey(raw);
};

type CreateTodoItemsOptions = {
  classify?: boolean;
  taskKindFallback?: TodoTaskKind | null;
  requestPermission?: boolean;
};

export const createTodoItems = async (items: any[], options: CreateTodoItemsOptions = {}) => {
  if (!items.length) return { created: 0, createdItems: [], skippedItems: [] };
  const createInputs = [];
  const skippedItems: { text: string; reason: string }[] = [];
  for (const it of items) {
    const wsKey = await resolveWorkspaceKey(it.workspace);
    const parsedDue = parseDueInput(it.dueDate, it.hasDueTime);
    const text = String(it.text || '').trim();
    const details = it.details || '';
    const recurrence = wsKey === 'Personal' ? normalizeTodoRecurrenceInput(it.recurrence) : null;
    if (wsKey === 'Goals') {
      skippedItems.push({ text, reason: 'goal creation requires goal_create with a timeframe' });
      continue;
    }
    let classification = null;
    if (options.classify !== false && shouldClassifyTodoWorkspace(wsKey || 'Personal')) {
      try {
        classification = await requestTodoClassification({
          title: text,
          details,
          workspace: wsKey || 'Personal',
        });
      } catch (error: any) {
        if (!isClassificationNotOnPlanError(error)) {
          skippedItems.push({
            text,
            reason: `classification failed: ${String(error?.message || error || 'unknown error')}`,
          });
          continue;
        }
      }
    }
    const taskKind = classification?.kind || options.taskKindFallback || null;
    createInputs.push({
      text,
      completed: false,
      details,
      dueDate: parsedDue.dueDate || getDefaultTodoDueDate(),
      hasDueTime: parsedDue.hasDueTime,
      starred: !!it.starred,
      workspace: wsKey || 'Personal',
      type: 'basic' as const,
      progress: 0,
      isAmazonUrlLoaded: false,
      amazonUrlLoadAttempts: 0,
      taskKind,
      guidancePath: null,
      plannedDurationMinutes: normalizeDurationMinutes(it.plannedDurationMinutes ?? it.durationMinutes),
      recurrence,
    });
  }
  if (!createInputs.length) return { created: 0, createdItems: [], skippedItems };
  const results = await createTodos(createInputs, { requestPermission: options.requestPermission });
  const createdItems: { id: string; text: string; dueDate: string | null; hasDueTime: boolean; workspace: string; starred: boolean; taskKind?: string | null; guidancePath?: string | null; plannedDurationMinutes?: number | null; recurrence?: string | null }[] = results.map(({ todo }) => ({
      id: String(todo.id),
      text: String(todo.text),
      dueDate: todo.dueDate ? new Date(todo.dueDate).toISOString() : null,
      hasDueTime: !!todo.hasDueTime,
      workspace: String(todo.workspace || 'Personal'),
      starred: !!todo.starred,
      taskKind: todo.taskKind || null,
      guidancePath: todo.guidancePath || null,
      plannedDurationMinutes: todo.plannedDurationMinutes ?? null,
      recurrence: todo.recurrenceSeriesId ? 'Recurring' : null,
    }));
  return { created: createdItems.length, createdItems, skippedItems };
};

const classifyCreatedTodoItem = async (createdItem: any, originalItem: any) => {
  const id = String(createdItem?.id || '').trim();
  const text = String(createdItem?.text || originalItem?.text || '').trim();
  const workspace = String(createdItem?.workspace || originalItem?.workspace || 'Personal');
  if (!id || !text || !shouldClassifyTodoWorkspace(workspace)) return;

  const classification = await requestTodoClassification({
    title: text,
    details: String(originalItem?.details || ''),
    workspace,
  });

  await updateTodos([{
    id,
    input: { taskKind: classification.kind },
    options: { syncReminder: false },
  }]);
};

export const classifyCreatedTodoItemsInBackground = (originalItems: any[], createdItems: any[]) => {
  const jobs = (Array.isArray(createdItems) ? createdItems : [])
    .map((createdItem, index) => ({ createdItem, originalItem: originalItems[index] }))
    .filter(({ createdItem, originalItem }) => {
      const workspace = String(createdItem?.workspace || originalItem?.workspace || 'Personal');
      return !!String(createdItem?.id || '').trim() && shouldClassifyTodoWorkspace(workspace);
    });

  if (!jobs.length) return;
  setTimeout(() => {
    void Promise.allSettled(
      jobs.map(({ createdItem, originalItem }) => classifyCreatedTodoItem(createdItem, originalItem))
    );
  }, 0);
};

const normalizeTaskStep = (step: any) => {
  const title = String(step?.title || '').trim();
  if (!title) return null;
  const details = typeof step?.details === 'string' ? step.details.trim() : '';
  return {
    title,
    ...(details ? { details } : {}),
    completed: false,
  };
};

const truncateTaskGuidanceMessage = (value: unknown) => {
  const text = String(value || '').trim();
  return text.length > 2000 ? `${text.slice(0, 1997)}...` : text;
};

const todo_create_many: ToolHandler = async (args: any) => {
  const items = Array.isArray(args?.items) ? args.items : [];
  return createTodoItems(items);
};

const todo_create_with_steps: ToolHandler = async (args: any) => {
  const title = String(args?.title || '').trim();
  const details = typeof args?.details === 'string' ? args.details.trim() : '';
  const steps = (Array.isArray(args?.steps) ? args.steps : [])
    .map(normalizeTaskStep)
    .filter(Boolean);

  if (!title || !steps.length) {
    return { created: 0, createdItems: [], skippedItems: [{ text: title || 'task', reason: 'missing title or steps' }] };
  }

  const parsedDue = parseDueInput(args?.dueDate, args?.hasDueTime);
  const results = await createTodos([{
    text: title,
    completed: false,
    details,
    dueDate: parsedDue.dueDate || getDefaultTodoDueDate(),
    hasDueTime: parsedDue.hasDueTime,
    starred: !!args?.starred,
    workspace: 'Personal',
    type: 'basic' as const,
    progress: 0,
    isAmazonUrlLoaded: false,
    amazonUrlLoadAttempts: 0,
    taskKind: 'normal' as const,
    guidancePath: null,
  }]);
  const todo = results[0]?.todo;
  if (!todo) return { created: 0, createdItems: [], skippedItems: [{ text: title, reason: 'todo creation failed' }] };

  const sourceQuestion = truncateTaskGuidanceMessage(args?.sourceQuestion);
  const sourceAnswer = truncateTaskGuidanceMessage(args?.sourceAnswer);
  const note = typeof args?.note === 'string' ? args.note.trim() : '';
  const conversation = [
    ...(sourceQuestion ? [{ role: 'user' as const, content: sourceQuestion }] : []),
    ...(sourceAnswer ? [{ role: 'assistant' as const, content: sourceAnswer }] : []),
  ];
  let guide;
  try {
    guide = await saveTaskGuide({
      todoId: String(todo.id),
      steps,
      conversation,
      activeStepIndex: 0,
      status: 'accepted',
      note,
      errorMessage: '',
    });
  } catch (error: any) {
    try {
      await deleteTodos([String(todo.id)]);
    } catch {}
    return {
      created: 0,
      createdItems: [],
      skippedItems: [{
        text: title,
        reason: `guidance save failed: ${String(error?.message || error || 'unknown error')}`,
      }],
    };
  }
  const createdItem = {
    id: String(todo.id),
    text: String(todo.text),
    dueDate: todo.dueDate ? new Date(todo.dueDate).toISOString() : null,
    hasDueTime: !!todo.hasDueTime,
    workspace: String(todo.workspace || 'Personal'),
    starred: !!todo.starred,
    taskKind: todo.taskKind || null,
    guidancePath: todo.guidancePath || null,
  };

  return {
    created: 1,
    createdItems: [createdItem],
    guide: {
      id: guide.id,
      todoId: guide.todoId,
      steps: guide.steps,
      status: guide.status,
      activeStepIndex: guide.activeStepIndex,
      note: guide.note,
    },
    skippedItems: [],
  };
};

const todo_delete_many: ToolHandler = async (args: any) => {
  const items = Array.isArray(args?.items) ? args.items : [];
  let deleted = 0;
  const deletedItems: { id: string; text: string }[] = [];
  const skippedItems: { id: string; text: string; reason: string }[] = [];
  const normalize = (s: string) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const todos = database.collections.get<TodoModel>('todos');
  const idsToDelete: string[] = [];
  const recurringOccurrenceIdsToDelete: string[] = [];
  for (const it of items) {
    if (it?.id) {
      try {
        const row = await todos.find(String(it.id));
        if (!(await pushMutableTodoOrSkip(row, skippedItems))) continue;
        deletedItems.push({ id: String(row.id), text: row.text });
        if (row.recurrenceSeriesId) {
          recurringOccurrenceIdsToDelete.push(String(row.id));
        } else {
          idsToDelete.push(String(row.id));
        }
        continue;
      } catch {}
    }
    const target = normalize(it.text);
    const all = await todos.query().fetch();
    const matches = all.filter(t => normalize(t.text) === target);
    for (const row of matches) {
      if (!(await pushMutableTodoOrSkip(row, skippedItems))) continue;
      deletedItems.push({ id: String(row.id), text: row.text });
      if (row.recurrenceSeriesId) {
        recurringOccurrenceIdsToDelete.push(String(row.id));
      } else {
        idsToDelete.push(String(row.id));
      }
    }
  }
  if (idsToDelete.length || recurringOccurrenceIdsToDelete.length) {
    const guidanceDeletedIds = await deleteGuidanceForDeletedGoals(idsToDelete);
    const remainingIdsToDelete = idsToDelete.filter((id) => !guidanceDeletedIds.has(id));
    await deleteTodos(remainingIdsToDelete);
    for (const id of recurringOccurrenceIdsToDelete) {
      await deleteRecurringTodoOccurrence(id);
    }
    await markGuidanceActionsDeleted(remainingIdsToDelete);
    deleted = idsToDelete.length + recurringOccurrenceIdsToDelete.length;
  }
  return { deleted, deletedItems, skippedItems };
};

const todo_complete_many: ToolHandler = async (args: any) => {
  const items = Array.isArray(args?.items) ? args.items : [];
  let completed = 0;
  const completedItems: { text: string }[] = [];
  const skippedItems: { id: string; text: string; reason: string }[] = [];
  const normalize = (s: string) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const todos = database.collections.get<TodoModel>('todos');
  const updates: Parameters<typeof updateTodos>[0] = [];
  for (const it of items) {
    if (it?.id) {
      try {
        const row = await todos.find(String(it.id));
        if (!(await pushMutableTodoOrSkip(row, skippedItems))) continue;
        if (await hasEarlierIncompleteRecurringTodo(row)) {
          skippedItems.push({ id: String(row.id), text: row.text, reason: 'complete earlier recurring occurrence first' });
          continue;
        }
        completedItems.push({ text: row.text });
        updates.push({ id: String(row.id), input: { completed: true }, options: { syncReminder: true } });
        continue;
      } catch {}
    }
    const target = normalize(it.text);
    const all = await todos.query().fetch();
    const matches = all.filter(t => normalize(t.text) === target);
    for (const row of matches) {
      if (!(await pushMutableTodoOrSkip(row, skippedItems))) continue;
      if (await hasEarlierIncompleteRecurringTodo(row)) {
        skippedItems.push({ id: String(row.id), text: row.text, reason: 'complete earlier recurring occurrence first' });
        continue;
      }
      completedItems.push({ text: row.text });
      updates.push({ id: String(row.id), input: { completed: true }, options: { syncReminder: true } });
    }
  }
  if (updates.length) {
    await updateTodos(updates);
    await syncRecurringTodos();
    await completeTaskGuidanceForCompletedTodos(updates.map((update) => update.id));
    await advanceGuidanceForCompletedTodos(updates.map((update) => update.id));
    completed = updates.length;
  }
  return { completed, completedItems, skippedItems };
};

const todo_edit_many: ToolHandler = async (args: any) => {
  const items = Array.isArray(args?.items) ? args.items : [];
  let updated = 0;
  const updatedItems: { id: string; oldText: string; newText?: string; workspace?: string; dueDate?: string | null; hasDueTime?: boolean; starred?: boolean; recurrence?: string | null }[] = [];
  const skippedItems: { id: string; text: string; reason: string }[] = [];
  const normalize = (s: string) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const todos = database.collections.get<TodoModel>('todos');
  const updates: Parameters<typeof updateTodos>[0] = [];
  const recurringUpdates: {
    id: string;
    input: Parameters<typeof updateRecurringTodo>[1];
    scope: Parameters<typeof updateRecurringTodo>[2];
    options?: Parameters<typeof updateRecurringTodo>[3];
  }[] = [];
  const recurrenceChanges: { id: string; recurrence: TodoRecurrenceRule | null }[] = [];
  const apply = async (row: TodoModel, it: any) => {
    const wsKey = typeof it.workspace === 'string' ? await resolveWorkspaceKey(it.workspace) : undefined;
    const parsedDue = parseDueInput(it.dueDate, it.hasDueTime);
    const recurrenceWasProvided = Object.prototype.hasOwnProperty.call(it, 'recurrence');
    const recurrence = recurrenceWasProvided ? normalizeTodoRecurrenceInput(it.recurrence) : undefined;
    if (recurrenceWasProvided && recurrence == null && !isTodoRecurrenceOffInput(it.recurrence)) {
      skippedItems.push({ id: String(row.id), text: row.text, reason: 'unsupported recurrence' });
      return;
    }
    const input = {
      text: it.newText ? String(it.newText) : undefined,
      details: typeof it.details === 'string' ? it.details : undefined,
      dueDate: parsedDue.dueDate,
      hasDueTime: parsedDue.dueDate ? parsedDue.hasDueTime : undefined,
      workspace: wsKey,
      starred: typeof it.starred === 'boolean' ? it.starred : undefined,
    };
    const options = {
      applyDefaultReminderWhenTimingAdded: !!parsedDue.dueDate,
      syncReminder: !!parsedDue.dueDate,
    };
    if (row.recurrenceSeriesId && (parsedDue.dueDate || it.newText || typeof it.details === 'string' || typeof it.starred === 'boolean')) {
      recurringUpdates.push({
        id: String(row.id),
        input,
        scope: parsedDue.dueDate ? 'one' : 'future',
        options,
      });
    } else {
      updates.push({
        id: String(row.id),
        input,
        options,
      });
    }
    if (recurrenceWasProvided) {
      recurrenceChanges.push({ id: String(row.id), recurrence: recurrence || null });
    }
    updated++;
    updatedItems.push({
      id: String(row.id),
      oldText: String(it.oldText || row.text),
      newText: it.newText ? String(it.newText) : undefined,
      workspace: typeof it.workspace === 'string' ? wsKey : undefined,
      dueDate: parsedDue.dueDate ? parsedDue.dueDate.toISOString() : undefined,
      hasDueTime: parsedDue.dueDate ? parsedDue.hasDueTime : undefined,
      starred: typeof it.starred === 'boolean' ? !!it.starred : undefined,
      recurrence: recurrenceWasProvided ? getTodoRecurrenceLabel(recurrence || null) : undefined,
    });
  };
  for (const it of items) {
    if (it?.id) {
      try {
        const row = await todos.find(String(it.id));
        if (!(await pushMutableTodoOrSkip(row, skippedItems))) continue;
        await apply(row, it);
        continue;
      } catch {}
    }
    const target = normalize(it.oldText);
    const all = await todos.query().fetch();
    const matches = all.filter(t => normalize(t.text) === target);
    for (const row of matches) {
      if (!(await pushMutableTodoOrSkip(row, skippedItems))) continue;
      await apply(row, it);
    }
  }
  if (updates.length) {
    await updateTodos(updates);
  }
  for (const update of recurringUpdates) {
    await updateRecurringTodo(update.id, update.input, update.scope, update.options);
  }
  for (const change of recurrenceChanges) {
    await setTodoRecurrence(change.id, change.recurrence);
  }
  if (recurringUpdates.length || recurrenceChanges.length) {
    await syncRecurringTodos();
  }
  return { updated, updatedItems, skippedItems };
};

const todo_star_toggle_many: ToolHandler = async (args: any) => {
  const items = Array.isArray(args?.items) ? args.items : [];
  let affected = 0;
  const affectedItems: { text: string; starred?: boolean }[] = [];
  const skippedItems: { id: string; text: string; reason: string }[] = [];
  const todos = database.collections.get<TodoModel>('todos');
  const updates: Parameters<typeof updateTodos>[0] = [];
  for (const it of items) {
    if (it?.id) {
      try {
        const row = await todos.find(String(it.id));
        if (!(await pushMutableTodoOrSkip(row, skippedItems))) continue;
        affectedItems.push({ text: row.text, starred: typeof it.starred === 'boolean' ? !!it.starred : undefined });
        updates.push({ id: String(row.id), input: { starred: typeof it.starred === 'boolean' ? it.starred : !row.starred } });
        continue;
      } catch {}
    }
    const rows = await todos.query(Q.where('text', Q.eq(String(it.text || '')))).fetch();
    for (const row of rows) {
      if (!(await pushMutableTodoOrSkip(row, skippedItems))) continue;
      affectedItems.push({ text: row.text, starred: typeof it.starred === 'boolean' ? !!it.starred : undefined });
      updates.push({ id: String(row.id), input: { starred: typeof it.starred === 'boolean' ? it.starred : !row.starred } });
    }
  }
  if (updates.length) {
    await updateTodos(updates);
    affected = updates.length;
  }
  return { affected, affectedItems, skippedItems };
};

const todo_query: ToolHandler = async (args: any) => {
  const openIntent = args?.openIntent === true;
  const requestedLimit = Math.min(Math.max(Number(args?.limit || 50), 1), 200);
  const limit = openIntent ? Math.max(requestedLimit, 2) : requestedLimit;
  const normalize = (s: string) => String(s || '').toLowerCase();
  const dayStrRaw = typeof args?.dueDateDay === 'string' ? args.dueDateDay : undefined;
  const dayStr = dayStrRaw ? parseDayInput(dayStrRaw) : undefined; // normalize to YYYY-MM-DD
  const parseDayToDate = (s?: string | null) => {
    if (!s) return null;
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
    const m = s.match(ymd);
    if (m) {
      // Correctly map capture groups: 1=year, 2=month, 3=day
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const day = parseInt(m[3], 10);
      return new Date(year, month, day);
    }
    const norm = parseDayInput(s);
    if (norm) return parseDayToDate(norm);
    return null;
  };
  const rangeFrom = typeof args?.range?.from === 'string' ? parseDayToDate(args.range.from) : null;
  const rangeTo = typeof args?.range?.to === 'string' ? parseDayToDate(args.range.to) : null;
  const textContains = typeof args?.textContains === 'string' ? normalize(args.textContains) : undefined;
  const completed = typeof args?.completed === 'boolean' ? args.completed : false;
  const overdueOnly = args?.overdueOnly === true;
  const recurringOnly = args?.recurringOnly === true ||
    args?.recurrenceOnly === true ||
    args?.repeatingOnly === true ||
    args?.repeatOnly === true;
  const starred = typeof args?.starred === 'boolean' ? args.starred : undefined;
  const workspace = typeof args?.workspace === 'string' ? await resolveWorkspaceKey(args.workspace) : undefined;
  const matchingItems: { id: string; text: string; dueDate: string | null; hasDueTime: boolean; completed: boolean; starred: boolean; workspace?: string; taskKind?: string | null; guidancePath?: string | null; recurrence?: string | null; recurrenceSeriesId?: string | null }[] = [];
  const todos = database.collections.get<TodoModel>('todos');
  await syncRecurringTodos();
  const rows = await todos.query().fetch();
  const visibleRecurringTodoIds = getVisibleRecurringTodoIds(rows);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayKey = toLocalYmd(todayStart);
  const dayCheck = (d?: Date | null) => {
    if (!dayStr) return true;
    if (!d) return false;
    return toLocalYmd(d) === dayStr;
  };
  const rangeCheck = (d?: Date | null) => {
    if (!rangeFrom && !rangeTo) return true;
    if (!d) return false;
    const t = d.getTime();
    if (rangeFrom && t < rangeFrom.getTime()) return false;
    if (rangeTo && t > rangeTo.getTime()) return false;
    return true;
  };
  const overdueCheck = (d?: Date | null) => {
    if (!overdueOnly) return true;
    if (!d) return false;
    return d.getTime() < todayStart.getTime();
  };
  for (const row of rows) {
    if (!isSupportedTodoWorkspaceKey(row.workspace)) continue;
    if (recurringOnly && !row.recurrenceSeriesId) continue;
    if (recurringOnly && row.workspace !== 'Personal') continue;
    if (row.recurrenceSeriesId && !visibleRecurringTodoIds.has(String(row.id))) continue;
    if (typeof workspace === 'string' && row.workspace !== workspace) continue;
    if (typeof completed === 'boolean' && !!row.completed !== completed) continue;
    if (typeof starred === 'boolean' && !!row.starred !== starred) continue;
    const d = row.dueDate ? new Date(row.dueDate) : null;
    if (!dayCheck(d)) continue;
    if (!rangeCheck(d)) continue;
    if (!overdueCheck(d)) continue;
    if (textContains && !normalize(row.text).includes(textContains)) continue;
    matchingItems.push({
      id: String(row.id),
      text: row.text,
      dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
      hasDueTime: !!row.hasDueTime,
      completed: !!row.completed,
      starred: !!row.starred,
      workspace: row.workspace,
      taskKind: row.taskKind || null,
      guidancePath: row.guidancePath || null,
      recurrence: row.recurrenceSeriesId ? 'Recurring' : null,
      recurrenceSeriesId: row.recurrenceSeriesId ?? null,
    });
  }
  matchingItems.sort((left, right) => {
    const leftDate = left.dueDate ? new Date(left.dueDate) : null;
    const rightDate = right.dueDate ? new Date(right.dueDate) : null;

    const bucketFor = (date: Date | null) => {
      if (!date || isNaN(date.getTime())) return 3;
      const dateKey = toLocalYmd(date);
      if (dateKey === todayKey) return 0;
      if (date.getTime() < todayStart.getTime()) return 1;
      return 2;
    };

    const leftBucket = bucketFor(leftDate);
    const rightBucket = bucketFor(rightDate);
    if (leftBucket !== rightBucket) return leftBucket - rightBucket;

    const leftTime = leftDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightTime = rightDate?.getTime() ?? Number.MAX_SAFE_INTEGER;

    if (leftBucket === 1) return rightTime - leftTime;
    if (leftBucket === 0 || leftBucket === 2) return leftTime - rightTime;
    return left.text.localeCompare(right.text);
  });

  const resultItems = recurringOnly
    ? matchingItems.filter((item, _index, items) => {
        if (!item.recurrenceSeriesId) return false;
        return items.findIndex((candidate) => candidate.recurrenceSeriesId === item.recurrenceSeriesId) === _index;
      })
    : matchingItems;

  return {
    openIntent,
    totalMatches: resultItems.length,
    items: resultItems.slice(0, limit).map(({ recurrenceSeriesId: _recurrenceSeriesId, ...item }) => item),
  };
};

const todo_delete_by_day: ToolHandler = async (args: any) => {
  const day = parseDayInput(args?.date);
  if (!day) return { deleted: 0, deletedItems: [] };
  const deletedItems: { id: string; text: string }[] = [];
  const skippedItems: { id: string; text: string; reason: string }[] = [];
  const todos = database.collections.get<TodoModel>('todos');
  const all = await todos.query().fetch();
  const idsToDelete: string[] = [];
  const recurringOccurrenceIdsToDelete: string[] = [];
  for (const row of all) {
    const dd = row.dueDate ? new Date(row.dueDate) : null;
    if (dd && toLocalYmd(dd) === day) {
      if (!(await pushMutableTodoOrSkip(row, skippedItems))) continue;
      deletedItems.push({ id: String(row.id), text: row.text });
      if (row.recurrenceSeriesId) {
        recurringOccurrenceIdsToDelete.push(String(row.id));
      } else {
        idsToDelete.push(String(row.id));
      }
    }
  }
  if (idsToDelete.length || recurringOccurrenceIdsToDelete.length) {
    const guidanceDeletedIds = await deleteGuidanceForDeletedGoals(idsToDelete);
    const remainingIdsToDelete = idsToDelete.filter((id) => !guidanceDeletedIds.has(id));
    await deleteTodos(remainingIdsToDelete);
    for (const id of recurringOccurrenceIdsToDelete) {
      await deleteRecurringTodoOccurrence(id);
    }
    await markGuidanceActionsDeleted(remainingIdsToDelete);
  }
  const deleted = idsToDelete.length + recurringOccurrenceIdsToDelete.length;
  return { deleted, deletedItems, skippedItems };
};

const todo_delete_by_day_except: ToolHandler = async (args: any) => {
  const day = parseDayInput(args?.date);
  const exceptItems = Array.isArray(args?.except) ? args.except : [];
  if (!day) return { deleted: 0, deletedItems: [], keptItems: [] };

  const normalize = (s: string) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const keepIds = new Set(exceptItems.map((item: any) => String(item?.id || '')).filter(Boolean));
  const keepTexts = new Set(exceptItems.map((item: any) => normalize(item?.text)).filter(Boolean));
  const deletedItems: { id: string; text: string }[] = [];
  const keptItems: { id: string; text: string }[] = [];
  const skippedItems: { id: string; text: string; reason: string }[] = [];
  const todos = database.collections.get<TodoModel>('todos');
  const all = await todos.query().fetch();
  const idsToDelete: string[] = [];
  const recurringOccurrenceIdsToDelete: string[] = [];

  for (const row of all) {
    const dueDate = row.dueDate ? new Date(row.dueDate) : null;
    if (!dueDate || toLocalYmd(dueDate) !== day) continue;

    const rowId = String(row.id);
    const rowText = normalize(row.text);
    if (keepIds.has(rowId) || keepTexts.has(rowText)) {
      keptItems.push({ id: rowId, text: row.text });
      continue;
    }

    if (!(await pushMutableTodoOrSkip(row, skippedItems))) continue;
    deletedItems.push({ id: rowId, text: row.text });
    if (row.recurrenceSeriesId) {
      recurringOccurrenceIdsToDelete.push(rowId);
    } else {
      idsToDelete.push(rowId);
    }
  }

  if (idsToDelete.length || recurringOccurrenceIdsToDelete.length) {
    const guidanceDeletedIds = await deleteGuidanceForDeletedGoals(idsToDelete);
    const remainingIdsToDelete = idsToDelete.filter((id) => !guidanceDeletedIds.has(id));
    await deleteTodos(remainingIdsToDelete);
    for (const id of recurringOccurrenceIdsToDelete) {
      await deleteRecurringTodoOccurrence(id);
    }
    await markGuidanceActionsDeleted(remainingIdsToDelete);
  }

  return { deleted: idsToDelete.length + recurringOccurrenceIdsToDelete.length, deletedItems, keptItems, skippedItems };
};

const todo_complete_by_day: ToolHandler = async (args: any) => {
  const day = parseDayInput(args?.date);
  if (!day) return { completed: 0, skippedItems: [] };
  const todos = database.collections.get<TodoModel>('todos');
  const all = await todos.query().fetch();
  const updates: Parameters<typeof updateTodos>[0] = [];
  const skippedItems: { id: string; text: string; reason: string }[] = [];
  for (const row of all) {
    const dd = row.dueDate ? new Date(row.dueDate) : null;
    if (dd && toLocalYmd(dd) === day) {
      if (!(await pushMutableTodoOrSkip(row, skippedItems))) continue;
      if (await hasEarlierIncompleteRecurringTodo(row)) {
        skippedItems.push({ id: String(row.id), text: row.text, reason: 'complete earlier recurring occurrence first' });
        continue;
      }
      updates.push({ id: String(row.id), input: { completed: true }, options: { syncReminder: true } });
    }
  }
  if (updates.length) {
    await updateTodos(updates);
    await syncRecurringTodos();
    await completeTaskGuidanceForCompletedTodos(updates.map((update) => update.id));
    await advanceGuidanceForCompletedTodos(updates.map((update) => update.id));
  }
  const completed = updates.length;
  return { completed, skippedItems };
};

export const todoToolHandlers: Record<string, ToolHandler> = {
  'todo_create_with_steps': todo_create_with_steps,
  'todo.create_many': todo_create_many,
  'todo_create_many': todo_create_many,
  'todo.delete_many': todo_delete_many,
  'todo_delete_many': todo_delete_many,
  'todo.complete_many': todo_complete_many,
  'todo_complete_many': todo_complete_many,
  'todo.edit_many': todo_edit_many,
  'todo_edit_many': todo_edit_many,
  'todo.star_toggle_many': todo_star_toggle_many,
  'todo_star_toggle_many': todo_star_toggle_many,
  'todo_query': todo_query,
  'todo_delete_by_day': todo_delete_by_day,
  'todo_delete_by_day_except': todo_delete_by_day_except,
  'todo_complete_by_day': todo_complete_by_day,
};
