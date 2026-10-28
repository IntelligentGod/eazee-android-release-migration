jest.mock('@/database/database', () => ({ database: {} }));
jest.mock('@/lib/calendarRange', () => ({ fetchCalendarEventsInRange: jest.fn() }));

import { getHomePlanDay, getHomePlanTitle, orderHomeDayPlanItems, toHomeDayPlanEventItem } from '@/lib/homeDayPlan';

describe('home plan card days', () => {
  const today = new Date(2026, 9, 9, 15, 30); // Friday

  it('names today, tomorrow, then the weekday', () => {
    expect(getHomePlanTitle(0, getHomePlanDay(today, 0))).toBe("Today's plan");
    expect(getHomePlanTitle(1, getHomePlanDay(today, 1))).toBe("Tomorrow's plan");
    expect(getHomePlanTitle(3, getHomePlanDay(today, 3))).toMatch(/^Monday's plan$/);
    expect(getHomePlanDay(today, 2)).toEqual(new Date(2026, 9, 11));
  });

  it('lists timed items first, then all-day events, then tasks without a time', () => {
    const at = (hour: number) => new Date(2026, 9, 10, hour);
    const ordered = orderHomeDayPlanItems([
      { id: 'todo-a', sourceId: 'a', label: 'Untimed task', type: 'todo', hasTime: false },
      { id: 'event-b', sourceId: 'b', label: 'Holiday', type: 'event', hasTime: false, time: at(0) },
      { id: 'todo-c', sourceId: 'c', label: 'Call', type: 'todo', hasTime: true, time: at(14) },
      { id: 'event-d', sourceId: 'd', label: 'Standup', type: 'event', hasTime: true, time: at(9) },
    ]);
    expect(ordered.map((item) => item.label)).toEqual(['Standup', 'Call', 'Holiday', 'Untimed task']);
  });

  it('opens a Google event in Google and a local event by its own row', () => {
    const start = new Date(2026, 9, 10, 9);
    expect(toHomeDayPlanEventItem({ id: 'g1', title: 'Gym', startDate: start, isAllDay: false, source: 'google', openId: 'g1' }))
      .toMatchObject({ completionSource: 'google', completionKey: 'g1', hasTime: true });
    expect(toHomeDayPlanEventItem({ id: 'g2', title: '', startDate: start, isAllDay: true, source: 'local', openId: 'row-7' }))
      .toMatchObject({ completionSource: 'local', completionKey: 'row-7', hasTime: false, label: 'Untitled event' });
  });
});
