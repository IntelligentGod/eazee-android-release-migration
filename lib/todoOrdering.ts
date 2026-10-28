import {
  getGoalSectionFromTimeframe,
  inferGoalTimeframeFromDueDate,
  type GoalTodoTimeframe,
} from '@/utils/goalTimeframes';

export type TodoOrderingSectionKey =
  | 'today'
  | 'upcoming'
  | 'past'
  | 'completed'
  | 'wishlist'
  | 'thisWeek'
  | 'thisMonth'
  | 'thisYear'
  | 'longTerm';

export type TodoOrderingInput = {
  id?: string;
  text?: string;
  completed?: boolean | null;
  workspace?: string | null;
  dueDate?: Date | null;
  goalTimeframe?: GoalTodoTimeframe | null;
  sortScope?: string | null;
  sortOrder?: number | null;
  createdAt?: Date | null;
};

export const TODO_SORT_ORDER_STEP = 1000;

export const getTodoOrderingWeekStartsOnFromLocale = (): 0 | 1 | 2 | 3 | 4 | 5 | 6 => {
  try {
    const LocaleCtor = (Intl as any)?.Locale;
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const firstDay = LocaleCtor ? new LocaleCtor(locale).weekInfo?.firstDay : undefined;
    if (typeof firstDay === 'number') {
      return (firstDay === 7 ? 0 : firstDay) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    }
  } catch {}
  return 1;
};

const isValidDate = (date?: Date | null): date is Date =>
  !!date && !Number.isNaN(date.getTime());

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const isSameLocalDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const getFiniteSortOrder = (todo: Pick<TodoOrderingInput, 'sortOrder'>) =>
  typeof todo.sortOrder === 'number' && Number.isFinite(todo.sortOrder)
    ? todo.sortOrder
    : null;

export const getTodoOrderingSection = (
  todo: Pick<TodoOrderingInput, 'completed' | 'workspace' | 'dueDate' | 'goalTimeframe'>,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = getTodoOrderingWeekStartsOnFromLocale(),
  now = new Date()
): TodoOrderingSectionKey => {
  if (todo.completed) {
    return 'completed';
  }

  if (todo.workspace === 'Wishlist') {
    return 'wishlist';
  }

  if (todo.workspace === 'Goals') {
    const section = getGoalSectionFromTimeframe(
      todo.goalTimeframe || inferGoalTimeframeFromDueDate(todo.dueDate || undefined, weekStartsOn, now)
    );
    return section || 'thisWeek';
  }

  const dueDate = todo.dueDate;
  if (!isValidDate(dueDate) || isSameLocalDay(dueDate, now)) {
    return 'today';
  }

  if (todo.workspace === 'Personal') {
    return endOfLocalDay(dueDate).getTime() < now.getTime() ? 'today' : 'upcoming';
  }

  return endOfLocalDay(dueDate).getTime() < now.getTime() ? 'past' : 'upcoming';
};

export const getTodoSortScope = (
  todo: Pick<TodoOrderingInput, 'completed' | 'workspace' | 'dueDate' | 'goalTimeframe'>,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = getTodoOrderingWeekStartsOnFromLocale(),
  now = new Date()
) => {
  const workspace = todo.workspace || 'Personal';
  const section = getTodoOrderingSection({ ...todo, workspace }, weekStartsOn, now);
  return section === 'completed' ? `${workspace}:completed` : `${workspace}:${section}`;
};

export const isTodoSectionReorderable = (workspace: string, section: TodoOrderingSectionKey) => {
  if (workspace === 'Personal') {
    return section === 'today' || section === 'upcoming';
  }
  if (workspace === 'Goals') {
    return section === 'thisWeek' || section === 'thisMonth' || section === 'thisYear' || section === 'longTerm';
  }
  return workspace === 'Wishlist' && section === 'wishlist';
};

export const getTodoFallbackSortTime = (todo: Pick<TodoOrderingInput, 'createdAt' | 'dueDate'>) => {
  if (isValidDate(todo.createdAt)) {
    return todo.createdAt.getTime();
  }
  if (isValidDate(todo.dueDate)) {
    return todo.dueDate.getTime();
  }
  return 0;
};

export const compareTodosForSectionOrder = (
  left: TodoOrderingInput,
  right: TodoOrderingInput,
  scope: string
) => {
  const leftOrder = left.sortScope === scope ? getFiniteSortOrder(left) : null;
  const rightOrder = right.sortScope === scope ? getFiniteSortOrder(right) : null;

  if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  if (leftOrder !== null && rightOrder === null) {
    return -1;
  }

  if (leftOrder === null && rightOrder !== null) {
    return 1;
  }

  const leftFallback = getTodoFallbackSortTime(left);
  const rightFallback = getTodoFallbackSortTime(right);
  if (leftFallback !== rightFallback) {
    return leftFallback - rightFallback;
  }

  return String(left.id || left.text || '').localeCompare(String(right.id || right.text || ''));
};

export const sortTodosForSectionOrder = <T extends TodoOrderingInput>(
  items: T[],
  scope: string,
  orderedIds?: readonly string[]
) => {
  const orderById = orderedIds?.length
    ? new Map(orderedIds.map((id, index) => [id, index]))
    : null;

  return [...items].sort((left, right) => {
    const leftOverrideOrder = left.id && orderById ? orderById.get(left.id) : undefined;
    const rightOverrideOrder = right.id && orderById ? orderById.get(right.id) : undefined;

    if (leftOverrideOrder !== undefined && rightOverrideOrder !== undefined) {
      return leftOverrideOrder - rightOverrideOrder;
    }

    if (leftOverrideOrder !== undefined) {
      return -1;
    }

    if (rightOverrideOrder !== undefined) {
      return 1;
    }

    return compareTodosForSectionOrder(left, right, scope);
  });
};

export const getMaxTodoSortOrderForScope = (todos: TodoOrderingInput[], scope: string) =>
  todos.reduce((maxOrder, todo) => {
    if (todo.sortScope !== scope) {
      return maxOrder;
    }
    const sortOrder = getFiniteSortOrder(todo);
    return sortOrder === null ? maxOrder : Math.max(maxOrder, sortOrder);
  }, 0);

export const getNextTodoSortOrder = (todos: TodoOrderingInput[], scope: string, offset = 1) =>
  getMaxTodoSortOrderForScope(todos, scope) + TODO_SORT_ORDER_STEP * offset;

export const getNormalizedTodoSortOrder = (index: number) =>
  (index + 1) * TODO_SORT_ORDER_STEP;

export const getTodoOrderingDayKey = (date = new Date()) =>
  startOfLocalDay(date).getTime();
