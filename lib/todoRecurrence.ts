/** 'weekday' repeats Monday to Friday (its interval is always 1). */
export type TodoRecurrenceUnit = 'day' | 'week' | 'month' | 'weekday';

export type TodoRecurrenceRule = {
  interval: number;
  unit: TodoRecurrenceUnit;
};

export type TodoRecurrenceSeriesLike = TodoRecurrenceRule & {
  startDate: Date;
  anchorDay?: number | null;
  skippedDatesJson?: string | null;
};

export const TODO_RECURRENCE_MISSED_CAP_DAYS = 31;

const VALID_UNITS = new Set<TodoRecurrenceUnit>(['day', 'week', 'month', 'weekday']);

export const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const getTodoOccurrenceDay = (date: Date) => startOfLocalDay(date);

export const getTodoOccurrenceDateKey = (date?: Date | null) => {
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return getTodoOccurrenceDay(date).getTime();
};

export const normalizeTodoRecurrenceRule = (value: unknown): TodoRecurrenceRule | null => {
  const raw = value as Partial<TodoRecurrenceRule> | null | undefined;
  const interval = Number(raw?.interval);
  const unit = raw?.unit;

  if (!Number.isFinite(interval) || interval < 1 || interval > 99 || !VALID_UNITS.has(unit as TodoRecurrenceUnit)) {
    return null;
  }

  return {
    interval: unit === 'weekday' ? 1 : Math.round(interval),
    unit: unit as TodoRecurrenceUnit,
  };
};

export const getTodoRecurrenceLabel = (rule?: TodoRecurrenceRule | null) => {
  if (!rule) return 'No repeat';
  if (rule.interval === 1 && rule.unit === 'day') return 'Daily';
  if (rule.interval === 1 && rule.unit === 'week') return 'Weekly';
  if (rule.unit === 'weekday') return 'Weekdays';
  if (rule.interval === 1 && rule.unit === 'month') return 'Monthly';
  return `Every ${rule.interval} ${rule.unit}${rule.interval === 1 ? '' : 's'}`;
};

export const getTodoRecurrencePreset = (rule?: TodoRecurrenceRule | null) => {
  if (!rule) return 'none';
  if (rule.interval === 1 && rule.unit === 'day') return 'daily';
  if (rule.interval === 1 && rule.unit === 'week') return 'weekly';
  if (rule.unit === 'weekday') return 'weekdays';
  if (rule.interval === 1 && rule.unit === 'month') return 'monthly';
  return 'custom';
};

export const parseTodoSkippedDateKeys = (value?: string | null) => {
  if (!value) return new Set<number>();

  try {
    const parsed = JSON.parse(value);
    const items = Array.isArray(parsed) ? parsed : [];
    return new Set(items.map((item) => Number(item)).filter((item) => Number.isFinite(item)));
  } catch {
    return new Set<number>();
  }
};

export const serializeTodoSkippedDateKeys = (keys: Set<number>) =>
  JSON.stringify([...keys].filter((key) => Number.isFinite(key)).sort((a, b) => a - b));

const getDaysInMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

const getMonthOccurrenceDate = (startDate: Date, interval: number, index: number, anchorDay: number) => {
  const monthIndex = startDate.getMonth() + interval * index;
  const year = startDate.getFullYear() + Math.floor(monthIndex / 12);
  const normalizedMonth = ((monthIndex % 12) + 12) % 12;
  const day = Math.min(anchorDay, getDaysInMonth(year, normalizedMonth));
  const date = new Date(startDate);
  date.setFullYear(year, normalizedMonth, day);
  return date;
};

/** The index-th Monday-to-Friday day from the start (a weekend start begins on Monday). */
const getWeekdayOccurrenceDate = (startDate: Date, index: number) => {
  const first = new Date(startDate);
  while (first.getDay() === 0 || first.getDay() === 6) {
    first.setDate(first.getDate() + 1);
  }
  const weekdayOffset = first.getDay() - 1 + index;
  const date = new Date(first);
  date.setDate(first.getDate() - (first.getDay() - 1) + Math.floor(weekdayOffset / 5) * 7 + (weekdayOffset % 5));
  return date;
};

export const getTodoRecurrenceOccurrenceDate = (
  series: TodoRecurrenceSeriesLike,
  index: number
) => {
  const startDate = new Date(series.startDate);
  const safeIndex = Math.max(0, Math.floor(index));
  const interval = Math.max(1, Math.round(series.interval));

  if (series.unit === 'weekday') {
    return getWeekdayOccurrenceDate(startDate, safeIndex);
  }

  if (series.unit === 'month') {
    return getMonthOccurrenceDate(
      startDate,
      interval,
      safeIndex,
      series.anchorDay || startDate.getDate()
    );
  }

  const date = new Date(startDate);
  const daysToAdd = series.unit === 'week'
    ? interval * safeIndex * 7
    : interval * safeIndex;
  date.setDate(date.getDate() + daysToAdd);
  return date;
};

/** Whether the series has an occurrence on `day` (skipped dates excluded). */
export const isTodoRecurrenceOccurrenceOn = (series: TodoRecurrenceSeriesLike, day: Date) => {
  const dayKey = startOfLocalDay(day).getTime();
  if (dayKey < startOfLocalDay(series.startDate).getTime()) return false;
  if (parseTodoSkippedDateKeys(series.skippedDatesJson).has(dayKey)) return false;
  for (let index = 0; index < 5000; index += 1) {
    const occurrenceKey = getTodoOccurrenceDateKey(getTodoRecurrenceOccurrenceDate(series, index));
    if (occurrenceKey == null) continue;
    if (occurrenceKey === dayKey) return true;
    if (occurrenceKey > dayKey) return false;
  }
  return false;
};

export const copyTodoTimeOntoOccurrenceDate = (
  occurrenceDate: Date,
  templateDate?: Date | null
) => {
  const nextDate = new Date(occurrenceDate);
  if (!templateDate) {
    nextDate.setHours(0, 0, 0, 0);
    return nextDate;
  }

  nextDate.setHours(
    templateDate.getHours(),
    templateDate.getMinutes(),
    templateDate.getSeconds(),
    templateDate.getMilliseconds()
  );
  return nextDate;
};

export const getTodoRecurrenceExpectedDateKeys = (
  series: TodoRecurrenceSeriesLike,
  now = new Date()
) => {
  const today = startOfLocalDay(now);
  const capStart = new Date(today);
  capStart.setDate(capStart.getDate() - (TODO_RECURRENCE_MISSED_CAP_DAYS - 1));

  const skippedDateKeys = parseTodoSkippedDateKeys(series.skippedDatesJson);
  const expectedDateKeys: number[] = [];
  let nextFutureDateKey: number | null = null;

  for (let index = 0; index < 5000; index += 1) {
    const occurrenceDate = getTodoRecurrenceOccurrenceDate(series, index);
    const occurrenceDateKey = getTodoOccurrenceDateKey(occurrenceDate);
    if (occurrenceDateKey == null) {
      continue;
    }

    if (occurrenceDateKey > today.getTime()) {
      if (!skippedDateKeys.has(occurrenceDateKey)) {
        nextFutureDateKey = occurrenceDateKey;
        break;
      }
      continue;
    }

    if (occurrenceDateKey >= capStart.getTime() && !skippedDateKeys.has(occurrenceDateKey)) {
      expectedDateKeys.push(occurrenceDateKey);
    }
  }

  if (nextFutureDateKey != null && !skippedDateKeys.has(nextFutureDateKey)) {
    expectedDateKeys.push(nextFutureDateKey);
  }

  return expectedDateKeys;
};

export const getNextTodoRecurrenceDateKeyAfter = (
  series: TodoRecurrenceSeriesLike,
  afterDateKey: number
) => {
  const skippedDateKeys = parseTodoSkippedDateKeys(series.skippedDatesJson);

  for (let index = 0; index < 5000; index += 1) {
    const dateKey = getTodoOccurrenceDateKey(getTodoRecurrenceOccurrenceDate(series, index));
    if (dateKey != null && dateKey > afterDateKey && !skippedDateKeys.has(dateKey)) {
      return dateKey;
    }
  }

  return null;
};

export const getTodoRecurrenceRuleFromSeries = (series?: TodoRecurrenceRule | null) => {
  const rule = normalizeTodoRecurrenceRule(series);
  return rule;
};
