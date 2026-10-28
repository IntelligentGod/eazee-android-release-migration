import { Q } from '@nozbe/watermelondb';
import { addDays, startOfDay } from 'date-fns';
import { database } from '@/database/database';
import TodoModel from '@/database/models/TodoModel';
import TodoRecurrenceSeriesModel from '@/database/models/TodoRecurrenceSeriesModel';
import { fetchCalendarEventsInRange, type RangeCalendarEvent } from '@/lib/calendarRange';
import { getTodoHasDueTime } from '@/utils/todoDates';
import {
  copyTodoTimeOntoOccurrenceDate,
  getTodoOccurrenceDateKey,
  isTodoRecurrenceOccurrenceOn,
  normalizeTodoRecurrenceRule,
} from '@/lib/todoRecurrence';

/** How many days after today the Home "plan" card can show. */
export const HOME_PLAN_MAX_DAY_OFFSET = 6;

export type HomeDayPlanItem = {
  id: string;
  sourceId: string;
  label: string;
  type: 'event' | 'todo';
  time?: Date;
  endTime?: Date;
  hasTime: boolean;
  isStarred?: boolean;
  completionSource?: 'local' | 'google';
  completionKey?: string;
  workspaceKey?: string;
};

/** "Today's plan", "Tomorrow's plan", then the weekday: "Wednesday's plan". */
export function getHomePlanTitle(dayOffset: number, day: Date) {
  if (dayOffset <= 0) return "Today's plan";
  if (dayOffset === 1) return "Tomorrow's plan";
  return `${day.toLocaleDateString(undefined, { weekday: 'long' })}'s plan`;
}

export function getHomePlanDay(today: Date, dayOffset: number) {
  return addDays(startOfDay(today), dayOffset);
}

/** Timed items by time, then all-day events, then tasks without a time. */
export function orderHomeDayPlanItems(items: HomeDayPlanItem[]) {
  const timed = items.filter((item) => item.hasTime && item.time)
    .sort((left, right) => left.time!.getTime() - right.time!.getTime());
  const allDayEvents = items.filter((item) => item.type === 'event' && !(item.hasTime && item.time));
  const untimedTodos = items.filter((item) => item.type === 'todo' && !(item.hasTime && item.time));
  return [...timed, ...allDayEvents, ...untimedTodos];
}

export function toHomeDayPlanEventItem(event: RangeCalendarEvent): HomeDayPlanItem {
  return {
    id: `event-${event.id}`,
    sourceId: event.id,
    label: event.title || 'Untitled event',
    type: 'event',
    time: event.startDate,
    endTime: event.endDate,
    hasTime: !event.isAllDay,
    completionSource: event.source || 'local',
    completionKey: event.openId || event.id,
  };
}

/**
 * Repeating tasks only store their next occurrence, so a later day has no row for
 * them. This adds the occurrence that falls on `day` for each active series that
 * has no row there yet, from the series' latest task (its title and time).
 */
export async function loadRepeatingTodoItemsForDay(
  day: Date,
  rowsOnDay: Pick<TodoModel, 'recurrenceSeriesId'>[]
): Promise<HomeDayPlanItem[]> {
  const series = (await database.get<TodoRecurrenceSeriesModel>('todo_recurrence_series').query().fetch())
    .filter((row) => row.active);
  if (!series.length) return [];

  const seriesOnDay = new Set(rowsOnDay.map((row) => row.recurrenceSeriesId).filter(Boolean));
  const seriesTodos = await database.get<TodoModel>('todos')
    .query(Q.where('recurrence_series_id', Q.oneOf(series.map((row) => row.id))))
    .fetch();
  const dayKey = startOfDay(day).getTime();

  return series.flatMap((row): HomeDayPlanItem[] => {
    const rule = normalizeTodoRecurrenceRule({ interval: row.interval, unit: row.unit });
    if (!rule || seriesOnDay.has(row.id)) return [];
    if (!isTodoRecurrenceOccurrenceOn({ ...rule, startDate: row.startDate, anchorDay: row.anchorDay, skippedDatesJson: row.skippedDatesJson }, day)) {
      return [];
    }
    const todos = seriesTodos.filter((todo) => todo.recurrenceSeriesId === row.id);
    // Any row already on this day (even a completed one) means it is not added again.
    if (todos.some((todo) => getTodoOccurrenceDateKey(todo.recurrenceOccurrenceDate || todo.dueDate) === dayKey)) return [];
    const template = [...todos]
      .filter((todo) => !todo.recurrenceOverride)
      .sort((left, right) =>
        (getTodoOccurrenceDateKey(right.recurrenceOccurrenceDate || right.dueDate) ?? 0)
        - (getTodoOccurrenceDateKey(left.recurrenceOccurrenceDate || left.dueDate) ?? 0))[0];
    if (!template || template.workspace === 'Goals' || template.workspace === 'Wishlist') return [];

    const hasTime = getTodoHasDueTime(template.dueDate, template.hasDueTime);
    return [{
      id: `todo-repeat-${row.id}-${dayKey}`,
      // Opens the series' current task; that day's own task is created when it comes round.
      sourceId: template.id,
      label: template.text,
      type: 'todo',
      hasTime,
      isStarred: template.starred,
      workspaceKey: template.workspace,
      ...(hasTime ? { time: copyTodoTimeOntoOccurrenceDate(day, template.dueDate) } : {}),
    }];
  });
}

/** Events and open tasks for one future day, in the same shape as the today list. */
export async function loadHomeDayPlanItems(day: Date): Promise<HomeDayPlanItem[]> {
  const start = startOfDay(day);
  const endExclusive = addDays(start, 1);
  const [events, todos] = await Promise.all([
    fetchCalendarEventsInRange(start, endExclusive).catch(() => [] as RangeCalendarEvent[]),
    database.get<TodoModel>('todos')
      .query(
        Q.where('completed', false),
        Q.where('due_date', Q.gte(start.getTime())),
        Q.where('due_date', Q.lt(endExclusive.getTime()))
      )
      .fetch(),
  ]);

  const todoItems = todos
    // Goals and wishlist items have their own tabs and are not day plans.
    .filter((todo) => todo.workspace !== 'Goals' && todo.workspace !== 'Wishlist')
    .map((todo): HomeDayPlanItem => {
      const hasTime = getTodoHasDueTime(todo.dueDate, todo.hasDueTime);
      return {
        id: `todo-${todo.id}`,
        sourceId: todo.id,
        label: todo.text,
        type: 'todo',
        hasTime,
        isStarred: todo.starred,
        workspaceKey: todo.workspace,
        ...(hasTime && todo.dueDate ? { time: todo.dueDate } : {}),
      };
    });

  const repeatingItems = await loadRepeatingTodoItemsForDay(start, todos).catch(() => [] as HomeDayPlanItem[]);

  return orderHomeDayPlanItems([...events.map(toHomeDayPlanEventItem), ...todoItems, ...repeatingItems]);
}
