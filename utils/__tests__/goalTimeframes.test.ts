import {
  getGoalDefaultDueDate,
  inferGoalTimeframeFromDueDate,
} from '@/utils/goalTimeframes';

const toLocalDateKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

describe('goal timeframe helpers', () => {
  const weekStartsOn = 1 as const;
  const monday = new Date('2026-04-20T10:00:00');

  it('defaults this-week goals to the end of the current locale week', () => {
    expect(toLocalDateKey(getGoalDefaultDueDate('thisWeek', monday, weekStartsOn))).toBe('2026-04-26');
  });

  it('keeps legacy due-date bucketing when no persisted timeframe exists', () => {
    expect(
      inferGoalTimeframeFromDueDate(new Date('2026-04-27T00:00:00'), weekStartsOn, monday)
    ).toBe('thisMonth');
  });
});
