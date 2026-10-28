import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export type GoalTodoTimeframe = 'thisWeek' | 'nextWeek' | 'thisMonth' | 'thisYear' | 'longTerm';
type GoalGuidanceCompatibleTimeframe = Exclude<GoalTodoTimeframe, 'nextWeek'>;

export const GOAL_TIMEFRAME_OPTIONS: Array<{ value: GoalTodoTimeframe; label: string }> = [
  { value: 'thisWeek', label: 'This week' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'thisYear', label: 'Year' },
  { value: 'longTerm', label: 'Long term' },
];

export const isGoalTodoTimeframe = (value: unknown): value is GoalTodoTimeframe =>
  value === 'thisWeek' ||
  value === 'nextWeek' ||
  value === 'thisMonth' ||
  value === 'thisYear' ||
  value === 'longTerm';

export const getGoalTimeframeLabel = (timeframe?: GoalTodoTimeframe | null) =>
  GOAL_TIMEFRAME_OPTIONS.find((option) => option.value === timeframe)?.label || 'This week';

export const getGoalDefaultDueDate = (
  timeframe: GoalTodoTimeframe,
  now: Date,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
) => {
  if (timeframe === 'thisWeek') {
    return startOfDay(endOfWeek(now, { weekStartsOn }));
  }

  if (timeframe === 'nextWeek') {
    return startOfDay(addDays(now, 7));
  }

  if (timeframe === 'thisMonth') {
    return startOfDay(endOfMonth(now));
  }

  if (timeframe === 'thisYear') {
    return startOfDay(endOfYear(now));
  }

  return startOfDay(new Date(now.getFullYear() + 1, 0, 1));
};

export const getGoalSectionFromTimeframe = (timeframe?: GoalTodoTimeframe | null) => {
  if (timeframe === 'nextWeek') {
    return 'thisWeek' as const;
  }

  return timeframe || null;
};

export const getGoalGuidanceTimeframeFromTodoTimeframe = (
  timeframe?: GoalTodoTimeframe | null
): GoalGuidanceCompatibleTimeframe | null => {
  if (!timeframe) {
    return null;
  }

  return timeframe === 'nextWeek' ? 'thisWeek' : timeframe;
};

export const inferGoalTimeframeFromDueDate = (
  dueDate: Date | null | undefined,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  now = new Date(),
  includeNextWeek = false
): GoalTodoTimeframe => {
  const normalizedDueDate = dueDate ? startOfDay(dueDate) : startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn });
  const weekEnd = startOfDay(endOfWeek(now, { weekStartsOn }));
  const monthStart = startOfMonth(now);
  const monthEnd = startOfDay(endOfMonth(now));
  const yearEnd = startOfDay(endOfYear(now));
  const daysUntilDue = differenceInCalendarDays(normalizedDueDate, startOfDay(now));

  if (normalizedDueDate >= weekStart && normalizedDueDate <= weekEnd) {
    return 'thisWeek';
  }
  if (includeNextWeek && daysUntilDue === 7) {
    return 'nextWeek';
  }
  if (normalizedDueDate >= monthStart && normalizedDueDate <= monthEnd) {
    return 'thisMonth';
  }
  if (normalizedDueDate <= yearEnd) {
    return 'thisYear';
  }

  return 'longTerm';
};
