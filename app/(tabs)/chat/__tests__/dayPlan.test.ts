import {
  buildDayPlanCardValue,
  deleteTimelineItem,
  getDayPlanItemStart,
  removeTimelineItemTime,
  replanTimelineItems,
  setTimelineItemEndTime,
  setTimelineItemTime,
  type DayPlanTimelineItem,
} from '../dayPlan';

const date = '2026-05-13';

const task = (patch: Partial<DayPlanTimelineItem>): DayPlanTimelineItem => ({
  id: 'task',
  kind: 'task',
  source: 'draft',
  title: 'Task',
  dueDate: '2026-05-13T10:00:00.000Z',
  hasDueTime: true,
  durationMinutes: 45,
  timeSource: 'ai',
  priority: 'medium',
  ...patch,
});

const event = (patch: Partial<DayPlanTimelineItem>): DayPlanTimelineItem => ({
  id: 'event',
  kind: 'event',
  source: 'draft',
  title: 'Event',
  start: '2026-05-13T12:00:00.000Z',
  end: '2026-05-13T13:00:00.000Z',
  durationMinutes: 60,
  timeSource: 'user',
  ...patch,
});

describe('day plan timeline helpers', () => {
  it('removes task time and keeps it date-only in save payload', () => {
    const next = removeTimelineItemTime([task({})], 'task', date);
    const card = buildDayPlanCardValue(date, next, 'draft-1');

    expect(card.todoItems?.[0]).toMatchObject({
      text: 'Task',
      hasDueTime: false,
    });
    expect(card.timelineItems?.[0]).toMatchObject({
      timeSource: 'none',
      userEdited: true,
    });
    expect(getDayPlanItemStart(card.timelineItems![0])).toBeNull();
  });

  it('keeps task duration in the save payload', () => {
    const card = buildDayPlanCardValue(date, [task({ durationMinutes: 120 })], 'draft-1');

    expect(card.todoItems?.[0]).toMatchObject({
      text: 'Task',
      durationMinutes: 120,
    });
  });

  it('removing an AI event time blocks save until time is set again', () => {
    const untimed = removeTimelineItemTime([event({ timeSource: 'ai' })], 'event', date);
    const blockedCard = buildDayPlanCardValue(date, untimed, 'draft-1');

    expect(blockedCard.saveBlockedReason).toBe('Set a time for every event before saving.');

    const timed = setTimelineItemTime(untimed, 'event', date, new Date('2026-05-13T15:30:00.000Z'));
    const readyCard = buildDayPlanCardValue(date, timed, 'draft-1');
    expect(readyCard.saveBlockedReason).toBeUndefined();
    expect(readyCard.calendarItems?.[0]?.start).toBe('2026-05-13T15:30:00.000Z');
  });

  it('updates event end time without changing start time', () => {
    const next = setTimelineItemEndTime([event({})], 'event', date, new Date('2026-05-13T14:30:00.000Z'));
    const card = buildDayPlanCardValue(date, next, 'draft-1');

    expect(card.calendarItems?.[0]).toMatchObject({
      start: '2026-05-13T12:00:00.000Z',
      end: '2026-05-13T14:30:00.000Z',
    });
    expect(card.timelineItems?.[0]).toMatchObject({
      durationMinutes: 150,
      userEdited: true,
    });
  });

  it('moves event start one hour before end if selected before start', () => {
    const next = setTimelineItemEndTime([event({})], 'event', date, new Date('2026-05-13T11:30:00.000Z'));
    const card = buildDayPlanCardValue(date, next, 'draft-1');

    expect(card.calendarItems?.[0]).toMatchObject({
      start: '2026-05-13T10:30:00.000Z',
      end: '2026-05-13T11:30:00.000Z',
    });
  });

  it('uses existing events as blockers without forcing every task after them', () => {
    const items = [
      task({ id: 'first', title: 'First', dueDate: undefined, hasDueTime: false, timeSource: 'none' }),
      task({ id: 'second', title: 'Second', dueDate: undefined, hasDueTime: false, timeSource: 'none' }),
      {
        id: 'blocker',
        kind: 'blocker',
        source: 'existing',
        title: 'Lunch',
        start: '2026-05-13T12:00:00.000Z',
        end: '2026-05-13T13:00:00.000Z',
        durationMinutes: 60,
        timeSource: 'user',
      } satisfies DayPlanTimelineItem,
    ];

    const next = replanTimelineItems(items, date, { assignUntimedTasks: true });
    const first = next.find((item) => item.id === 'first');
    const second = next.find((item) => item.id === 'second');

    expect(new Date(first?.dueDate || '').getTime()).toBeLessThan(new Date('2026-05-13T12:00:00.000Z').getTime());
    expect(new Date(second?.dueDate || '').getTime()).toBeLessThan(new Date('2026-05-13T12:00:00.000Z').getTime());
  });

  it('pushes flexible items after a timed draft event in earlier order', () => {
    const items = [
      event({
        id: 'morning-event',
        start: '2026-05-13T10:00:00.000Z',
        end: '2026-05-13T12:00:00.000Z',
        durationMinutes: 120,
        timeSource: 'ai',
      }),
      task({ id: 'after-event', dueDate: undefined, hasDueTime: false, timeSource: 'none' }),
    ];

    const next = replanTimelineItems(items, date, { assignUntimedTasks: true });
    const plannedTask = next.find((item) => item.id === 'after-event');

    expect(new Date(plannedTask?.dueDate || '').getTime()).toBeGreaterThanOrEqual(new Date('2026-05-13T12:00:00.000Z').getTime());
  });

  it('preserves AI-chosen breathing room between planned items', () => {
    const items = [
      event({
        id: 'morning-event',
        start: '2026-05-13T10:00:00.000Z',
        end: '2026-05-13T12:00:00.000Z',
        durationMinutes: 120,
        timeSource: 'ai',
      }),
      task({
        id: 'after-break',
        dueDate: '2026-05-13T12:45:00.000Z',
        hasDueTime: true,
        timeSource: 'ai',
      }),
    ];

    const next = replanTimelineItems(items, date, { assignUntimedTasks: true });
    const plannedTask = next.find((item) => item.id === 'after-break');

    expect(plannedTask?.dueDate).toBe('2026-05-13T12:45:00.000Z');
  });

  it('does not move other items when a user-edited event gets longer', () => {
    const items = [
      event({
        id: 'user-event',
        start: '2026-05-13T10:00:00.000Z',
        end: '2026-05-13T12:00:00.000Z',
        durationMinutes: 120,
        timeSource: 'user',
      }),
      event({
        id: 'ai-event',
        start: '2026-05-13T12:00:00.000Z',
        end: '2026-05-13T13:00:00.000Z',
        timeSource: 'ai',
      }),
    ];

    const next = setTimelineItemEndTime(items, 'user-event', date, new Date('2026-05-13T13:00:00.000Z'));
    const movedEvent = next.find((item) => item.id === 'ai-event');

    expect(movedEvent?.start).toBe('2026-05-13T12:00:00.000Z');
    expect(movedEvent?.end).toBe('2026-05-13T13:00:00.000Z');
  });

  it('does not move other items when a user-edited event gets shorter', () => {
    const items = [
      event({
        id: 'user-event',
        start: '2026-05-13T10:00:00.000Z',
        end: '2026-05-13T13:00:00.000Z',
        durationMinutes: 180,
        timeSource: 'user',
        userEdited: true,
      }),
      event({
        id: 'ai-event',
        start: '2026-05-13T13:00:00.000Z',
        end: '2026-05-13T14:00:00.000Z',
        timeSource: 'ai',
      }),
      task({
        id: 'ai-task',
        dueDate: '2026-05-13T14:00:00.000Z',
        timeSource: 'ai',
      }),
    ];

    const next = setTimelineItemEndTime(items, 'user-event', date, new Date('2026-05-13T11:00:00.000Z'));
    const movedEvent = next.find((item) => item.id === 'ai-event');
    const movedTask = next.find((item) => item.id === 'ai-task');

    expect(movedEvent?.start).toBe('2026-05-13T13:00:00.000Z');
    expect(movedEvent?.end).toBe('2026-05-13T14:00:00.000Z');
    expect(movedTask?.dueDate).toBe('2026-05-13T14:00:00.000Z');
  });

  it('only moves the item whose start time changed', () => {
    const items = [
      task({
        id: 'first',
        dueDate: '2026-05-13T09:00:00.000Z',
        durationMinutes: 60,
        timeSource: 'ai',
      }),
      task({
        id: 'moved-later',
        dueDate: '2026-05-13T10:00:00.000Z',
        durationMinutes: 60,
        timeSource: 'ai',
      }),
      task({
        id: 'third',
        dueDate: '2026-05-13T11:00:00.000Z',
        durationMinutes: 60,
        timeSource: 'ai',
      }),
    ];

    const next = setTimelineItemTime(items, 'moved-later', date, new Date('2026-05-13T16:00:00.000Z'));
    const first = next.find((item) => item.id === 'first');
    const third = next.find((item) => item.id === 'third');
    const moved = next.find((item) => item.id === 'moved-later');

    expect(first?.dueDate).toBe('2026-05-13T09:00:00.000Z');
    expect(third?.dueDate).toBe('2026-05-13T11:00:00.000Z');
    expect(moved?.dueDate).toBe('2026-05-13T16:00:00.000Z');
  });

  it('keeps no-time tasks below timed items and supports deleting draft rows', () => {
    const untimed = removeTimelineItemTime([task({ id: 'untimed' }), task({ id: 'timed' })], 'untimed', date);

    expect(untimed[untimed.length - 1]).toMatchObject({
      id: 'untimed',
      hasDueTime: false,
    });

    const deleted = deleteTimelineItem(untimed, 'timed', date);
    expect(deleted.some((item) => item.id === 'timed')).toBe(false);
    expect(deleted.some((item) => item.id === 'untimed')).toBe(true);
  });
});

describe('planning today', () => {
  // Local times, so the test reads the same in any time zone.
  const at = (hour: number, minute = 0) => new Date(2026, 4, 13, hour, minute);
  const untimed = (id: string, durationMinutes: number) =>
    task({ id, title: id, dueDate: '2026-05-13', hasDueTime: false, timeSource: 'none', durationMinutes });

  it('never places anything before now on today', () => {
    const planned = replanTimelineItems(
      [untimed('email', 15), untimed('gym', 60), task({ id: 'study', timeSource: 'ai', dueDate: at(9, 30).toISOString() })],
      date,
      { assignUntimedTasks: true, now: at(11, 9) }
    );
    const starts = planned.map((item) => getDayPlanItemStart(item)!);
    expect(starts.every((start) => start >= at(11, 15))).toBe(true);
    expect(starts[0]).toEqual(at(11, 15));
  });

  it('still starts other days at 9:00', () => {
    const planned = replanTimelineItems([untimed('email', 15)], date, { assignUntimedTasks: true, now: new Date(2026, 4, 12, 11, 9) });
    expect(getDayPlanItemStart(planned[0])).toEqual(at(9, 0));
  });

  it('keeps a time the user set, even if it has passed', () => {
    const planned = replanTimelineItems(
      [task({ id: 'standup', timeSource: 'user', dueDate: at(9, 0).toISOString(), durationMinutes: 15 }), untimed('email', 15)],
      date,
      { assignUntimedTasks: true, now: at(11, 9) }
    );
    expect(getDayPlanItemStart(planned.find((item) => item.id === 'standup')!)).toEqual(at(9, 0));
    expect(getDayPlanItemStart(planned.find((item) => item.id === 'email')!)).toEqual(at(11, 15));
  });
});
