import {
  eventOverlapsCalendarRange,
  getAdjacentCalendarWeekStarts,
  getCalendarWeekKey,
  normalizeCalendarWeekStart,
} from '../calendarWeeks';

describe('calendarWeeks', () => {
  it('normalizes dates to a Monday week start at midnight', () => {
    const weekStart = normalizeCalendarWeekStart(new Date(2026, 3, 15, 14, 30));

    expect(weekStart).toEqual(new Date(2026, 3, 13, 0, 0, 0, 0));
    expect(getCalendarWeekKey(new Date(2026, 3, 15, 14, 30))).toBe('2026-04-13');
    // A Sunday belongs to the week that started the Monday before.
    expect(getCalendarWeekKey(new Date(2026, 3, 19, 9))).toBe('2026-04-13');
  });

  it('builds previous, current, and next week starts', () => {
    expect(getAdjacentCalendarWeekStarts(new Date(2026, 3, 15)).map(getCalendarWeekKey)).toEqual([
      '2026-04-06',
      '2026-04-13',
      '2026-04-20',
    ]);
  });

  it('treats events as visible when they overlap the range', () => {
    const rangeStart = new Date(2026, 3, 12);
    const rangeEnd = new Date(2026, 3, 19);

    expect(eventOverlapsCalendarRange(new Date(2026, 3, 11, 23), new Date(2026, 3, 12, 1), rangeStart, rangeEnd)).toBe(true);
    expect(eventOverlapsCalendarRange(new Date(2026, 3, 18, 23), new Date(2026, 3, 19, 1), rangeStart, rangeEnd)).toBe(true);
    expect(eventOverlapsCalendarRange(new Date(2026, 3, 10), new Date(2026, 3, 12), rangeStart, rangeEnd)).toBe(false);
    expect(eventOverlapsCalendarRange(new Date(2026, 3, 19), new Date(2026, 3, 20), rangeStart, rangeEnd)).toBe(false);
  });
});
