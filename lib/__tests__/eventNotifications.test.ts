jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock('expo-notifications', () => ({}));
jest.mock('@/app/context/TokenContext', () => ({ getAccessTokenStatic: jest.fn() }));
jest.mock('@/database/database', () => ({ database: {} }));
jest.mock('@/lib/todoNotifications', () => ({ configureTodoNotifications: jest.fn() }));

import { planEventReminders, selectEventsForReminders, type TodoCalendarCopy } from '@/lib/eventNotifications';
import { buildInactivityNudgeContent } from '@/lib/inactivityNudge';

const now = new Date(2026, 8, 30, 9, 0);
const at = (hours: number, minutes = 0) => new Date(2026, 8, 30, hours, minutes);

describe('planEventReminders', () => {
  it('schedules each timed event the chosen minutes before it starts', () => {
    const reminders = planEventReminders([
      { id: 'b', title: 'Standup', startDate: at(11), isAllDay: false, location: ' Room 4 ' },
      { id: 'a', title: 'Coffee', startDate: at(10), isAllDay: false },
    ], 15, now);

    expect(reminders).toEqual([
      { eventId: 'a', triggerDate: at(9, 45), title: 'Coffee', body: 'Starts in 15 minutes' },
      { eventId: 'b', triggerDate: at(10, 45), title: 'Standup', body: 'Starts in 15 minutes · Room 4' },
    ]);
  });

  it('skips all-day events and reminders whose time has already passed', () => {
    const reminders = planEventReminders([
      { id: 'all-day', title: 'Holiday', startDate: at(0), isAllDay: true },
      { id: 'soon', title: 'Call', startDate: at(9, 4), isAllDay: false },
      { id: 'later', title: '', startDate: at(9, 30), isAllDay: false },
    ], 5, now);

    expect(reminders.map((reminder) => reminder.eventId)).toEqual(['later']);
    expect(reminders[0].title).toBe('Upcoming event');
  });

  it('keeps only the soonest reminders so todo reminders still fit', () => {
    const events = Array.from({ length: 40 }, (_, index) => ({
      id: `event-${index}`,
      title: `Event ${index}`,
      startDate: new Date(now.getTime() + (index + 1) * 60 * 60_000),
      isAllDay: false,
    }));

    const reminders = planEventReminders(events, 10, now);
    expect(reminders).toHaveLength(30);
    expect(reminders[29].eventId).toBe('event-29');
  });
});

describe('buildInactivityNudgeContent', () => {
  it('mentions how many tasks are waiting', () => {
    expect(buildInactivityNudgeContent(3).title).toBe('3 tasks are waiting for you');
    expect(buildInactivityNudgeContent(1).title).toBe('1 task is waiting for you');
    expect(buildInactivityNudgeContent(0).title).toBe('Your day is a blank page');
  });
});

describe('selectEventsForReminders', () => {
  const copy = (overrides: Partial<TodoCalendarCopy>): TodoCalendarCopy => ({
    id: 'local-1', localId: 'local-1', sourceTodoId: 'todo-1', title: 'Study', startDate: at(14), isAllDay: false, ...overrides,
  });

  it('gives a todo calendar copy no Event Reminder when the todo has its own reminder', () => {
    const synced = copy({ id: 'g-1', googleEventId: 'g-1' });
    const events = [{ id: 'g-1', title: 'Study', startDate: at(14), isAllDay: false }, { id: 'e-2', title: 'Lunch', startDate: at(12), isAllDay: false }];
    expect(selectEventsForReminders(events, [synced], () => true).map((event) => event.id)).toEqual(['e-2']);
  });

  it('gives a todo calendar copy the Event Reminder when the todo has no reminder, without duplicating it', () => {
    const synced = copy({ id: 'g-1', googleEventId: 'g-1' });
    const localOnly = copy({ id: 'local-2', localId: 'local-2', sourceTodoId: 'todo-2', title: 'Read', startDate: at(16) });
    const events = [{ id: 'g-1', title: 'Study', startDate: at(14), isAllDay: false }];
    const selected = selectEventsForReminders(events, [synced, localOnly], () => false);
    expect(selected.map((event) => event.id)).toEqual(['g-1', 'local-2']);
    expect(selected[1]).toMatchObject({ title: 'Read', startDate: at(16) });
  });
});
