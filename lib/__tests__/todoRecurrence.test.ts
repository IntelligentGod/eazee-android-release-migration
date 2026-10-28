import {
  getTodoRecurrenceExpectedDateKeys,
  getTodoRecurrenceLabel,
  getNextTodoRecurrenceDateKeyAfter,
  getTodoRecurrenceOccurrenceDate,
  normalizeTodoRecurrenceRule,
  getTodoRecurrencePreset,
  isTodoRecurrenceOccurrenceOn,
  serializeTodoSkippedDateKeys,
  startOfLocalDay,
} from '../todoRecurrence';

const localDate = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day);

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const key = (year: number, month: number, day: number) =>
  startOfLocalDay(localDate(year, month, day)).getTime();

describe('todoRecurrence', () => {
  it('normalizes rules and labels presets/custom values', () => {
    expect(normalizeTodoRecurrenceRule({ interval: 1, unit: 'day' })).toEqual({ interval: 1, unit: 'day' });
    expect(normalizeTodoRecurrenceRule({ interval: 2.4, unit: 'week' })).toEqual({ interval: 2, unit: 'week' });
    expect(normalizeTodoRecurrenceRule({ interval: 0, unit: 'day' })).toBeNull();
    expect(normalizeTodoRecurrenceRule({ interval: 100, unit: 'day' })).toBeNull();
    expect(normalizeTodoRecurrenceRule({ interval: 2, unit: 'year' })).toBeNull();

    expect(getTodoRecurrenceLabel(null)).toBe('No repeat');
    expect(getTodoRecurrenceLabel({ interval: 1, unit: 'day' })).toBe('Daily');
    expect(getTodoRecurrenceLabel({ interval: 1, unit: 'week' })).toBe('Weekly');
    expect(getTodoRecurrenceLabel({ interval: 1, unit: 'month' })).toBe('Monthly');
    expect(getTodoRecurrenceLabel({ interval: 3, unit: 'week' })).toBe('Every 3 weeks');
  });

  it('calculates day and week interval occurrences from start date', () => {
    const startDate = localDate(2026, 5, 4);

    expect(ymd(getTodoRecurrenceOccurrenceDate({ startDate, interval: 2, unit: 'day' }, 3))).toBe('2026-05-10');
    expect(ymd(getTodoRecurrenceOccurrenceDate({ startDate, interval: 2, unit: 'week' }, 2))).toBe('2026-06-01');
  });

  it('keeps monthly anchor day and clamps invalid month days', () => {
    const startDate = localDate(2026, 1, 31);
    const series = { startDate, interval: 1, unit: 'month' as const, anchorDay: 31 };

    expect(ymd(getTodoRecurrenceOccurrenceDate(series, 0))).toBe('2026-01-31');
    expect(ymd(getTodoRecurrenceOccurrenceDate(series, 1))).toBe('2026-02-28');
    expect(ymd(getTodoRecurrenceOccurrenceDate(series, 2))).toBe('2026-03-31');
  });

  it('generates only last 31 missed/current days plus one next future', () => {
    const keys = getTodoRecurrenceExpectedDateKeys(
      { startDate: localDate(2026, 1, 1), interval: 1, unit: 'day' },
      localDate(2026, 5, 31)
    );

    expect(keys).toHaveLength(32);
    expect(keys[0]).toBe(key(2026, 5, 1));
    expect(keys[30]).toBe(key(2026, 5, 31));
    expect(keys[31]).toBe(key(2026, 6, 1));
  });

  it('skips deleted occurrence dates and still finds one next future', () => {
    const skippedDatesJson = serializeTodoSkippedDateKeys(new Set([
      key(2026, 5, 30),
      key(2026, 6, 1),
    ]));

    const keys = getTodoRecurrenceExpectedDateKeys(
      { startDate: localDate(2026, 5, 29), interval: 1, unit: 'day', skippedDatesJson },
      localDate(2026, 5, 31)
    );

    expect(keys).toEqual([
      key(2026, 5, 29),
      key(2026, 5, 31),
      key(2026, 6, 2),
    ]);
  });

  it('finds next future date after a completed future occurrence', () => {
    const skippedDatesJson = serializeTodoSkippedDateKeys(new Set([
      key(2026, 6, 2),
    ]));

    expect(getNextTodoRecurrenceDateKeyAfter(
      { startDate: localDate(2026, 5, 31), interval: 1, unit: 'day', skippedDatesJson },
      key(2026, 6, 1)
    )).toBe(key(2026, 6, 3));
  });
});

describe('repeating tasks on later days', () => {
  const { isTodoRecurrenceOccurrenceOn } = require('@/lib/todoRecurrence');
  const start = new Date(2026, 9, 9, 10, 15); // Fri Oct 9, 10:15

  it('finds a daily task on every later day, and nothing before it started', () => {
    const daily = { interval: 1, unit: 'day', startDate: start };
    expect(isTodoRecurrenceOccurrenceOn(daily, new Date(2026, 9, 13))).toBe(true);
    expect(isTodoRecurrenceOccurrenceOn(daily, new Date(2026, 9, 15, 18))).toBe(true);
    expect(isTodoRecurrenceOccurrenceOn(daily, new Date(2026, 9, 8))).toBe(false);
  });

  it('respects the interval, weekly repeats and skipped days', () => {
    expect(isTodoRecurrenceOccurrenceOn({ interval: 2, unit: 'day', startDate: start }, new Date(2026, 9, 11))).toBe(true);
    expect(isTodoRecurrenceOccurrenceOn({ interval: 2, unit: 'day', startDate: start }, new Date(2026, 9, 12))).toBe(false);
    expect(isTodoRecurrenceOccurrenceOn({ interval: 1, unit: 'week', startDate: start }, new Date(2026, 9, 16))).toBe(true);
    expect(isTodoRecurrenceOccurrenceOn({ interval: 1, unit: 'week', startDate: start }, new Date(2026, 9, 14))).toBe(false);
    const skipped = JSON.stringify([new Date(2026, 9, 12).getTime()]);
    expect(isTodoRecurrenceOccurrenceOn({ interval: 1, unit: 'day', startDate: start, skippedDatesJson: skipped }, new Date(2026, 9, 12))).toBe(false);
  });
});

describe('weekday repeats', () => {
  const series = (startDate: Date) => ({ interval: 1, unit: 'weekday' as const, startDate });
  const ymd = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;

  it('repeats Monday to Friday and skips weekends', () => {
    const friday = new Date(2026, 9, 9, 9, 0); // Fri Oct 9
    const days = [0, 1, 2, 3, 4, 5].map((index) => ymd(getTodoRecurrenceOccurrenceDate(series(friday), index)));
    expect(days).toEqual(['10/9', '10/12', '10/13', '10/14', '10/15', '10/16']);
    expect(isTodoRecurrenceOccurrenceOn(series(friday), new Date(2026, 9, 10))).toBe(false);
    expect(isTodoRecurrenceOccurrenceOn(series(friday), new Date(2026, 9, 12))).toBe(true);
  });

  it('starts on Monday when created on a weekend, and is labelled Weekdays', () => {
    expect(ymd(getTodoRecurrenceOccurrenceDate(series(new Date(2026, 9, 10)), 0))).toBe('10/12');
    expect(getTodoRecurrenceLabel({ interval: 1, unit: 'weekday' })).toBe('Weekdays');
    expect(getTodoRecurrencePreset({ interval: 1, unit: 'weekday' })).toBe('weekdays');
    expect(normalizeTodoRecurrenceRule({ interval: 3, unit: 'weekday' })).toEqual({ interval: 1, unit: 'weekday' });
  });
});
