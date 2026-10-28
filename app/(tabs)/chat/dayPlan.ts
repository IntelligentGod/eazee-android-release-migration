import { addMinutes, format } from 'date-fns';
import { parseCalendarDateValue } from '@/utils/calendarDates';

export type DayPlanItemKind = 'task' | 'event' | 'blocker' | 'buffer';
export type DayPlanTimeSource = 'user' | 'ai' | 'none';
export type DayPlanItemSource = 'draft' | 'existing';

export type DayPlanTimelineItem = {
  id: string;
  kind: DayPlanItemKind;
  source: DayPlanItemSource;
  title: string;
  start?: string;
  end?: string;
  dueDate?: string;
  hasDueTime?: boolean;
  durationMinutes: number;
  timeSource: DayPlanTimeSource;
  userEdited?: boolean;
  hidden?: boolean;
  location?: string;
  details?: string;
  priority?: 'low' | 'medium' | 'high';
  starred?: boolean;
  /** Set when a planned task is one the user already has; saving reschedules it instead of creating a copy. */
  existingTodoId?: string;
};

export type DayPlanCardValue = {
  type: 'dayPlan';
  draftId?: string;
  date: string;
  calendarItems?: Array<{
    title: string;
    start?: string;
    end?: string;
    location?: string;
    details?: string;
  }>;
  todoItems?: Array<{
    text: string;
    dueDate: string;
    hasDueTime: boolean;
    details?: string;
    starred: boolean;
    priority: 'low' | 'medium' | 'high';
    durationMinutes?: number;
    existingTodoId?: string;
  }>;
  timelineItems?: DayPlanTimelineItem[];
  saveBlockedReason?: string;
  /** The day's main goal, set when the day was drafted as part of a week plan. */
  mainGoal?: string;
  /** A week plan day saved as calendar events that repeat every week. */
  repeatWeekly?: boolean;
  saved?: boolean;
  cancelled?: boolean;
};

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;
const SLOT_MINUTES = 15;
const DEFAULT_TASK_DURATION_MINUTES = 45;
const DEFAULT_EVENT_DURATION_MINUTES = 60;

const clampDuration = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(15, Math.min(480, Math.round(parsed / SLOT_MINUTES) * SLOT_MINUTES));
};

const toDate = (value?: string) => {
  const parsed = value ? parseCalendarDateValue(value) : null;
  return parsed && !isNaN(parsed.getTime()) ? parsed : null;
};

export const getDayPlanItemStart = (item: Pick<DayPlanTimelineItem, 'kind' | 'start' | 'dueDate' | 'hasDueTime'>) =>
  item.kind === 'task' ? (item.hasDueTime ? toDate(item.dueDate) : null) : toDate(item.start);

export const getDayPlanItemEnd = (item: DayPlanTimelineItem) => {
  if (item.kind === 'task') {
    const start = getDayPlanItemStart(item);
    return start ? addMinutes(start, item.durationMinutes) : null;
  }
  return toDate(item.end) || (toDate(item.start) ? addMinutes(toDate(item.start)!, item.durationMinutes) : null);
};

const getDayBounds = (date: string) => {
  const base = parseCalendarDateValue(date) || new Date();
  const start = new Date(base);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  const end = new Date(base);
  end.setHours(DAY_END_HOUR, 0, 0, 0);
  return { start, end };
};

const roundUpToSlot = (date: Date) => {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const remainder = next.getMinutes() % SLOT_MINUTES;
  if (remainder) next.setMinutes(next.getMinutes() + SLOT_MINUTES - remainder);
  return next;
};

const hasTime = (item: DayPlanTimelineItem) => !!getDayPlanItemStart(item);

const isFixedForAutoPlan = (item: DayPlanTimelineItem, movingId?: string) =>
  item.kind === 'blocker' ||
  (!!movingId && item.id !== movingId && (item.timeSource === 'user' || item.userEdited) && hasTime(item)) ||
  (!movingId && (item.timeSource === 'user' || item.userEdited) && hasTime(item));

const findSlot = (
  durationMinutes: number,
  earliest: Date,
  dayEnd: Date,
  fixedRanges: Array<{ start: Date; end: Date }>
) => {
  let cursor = roundUpToSlot(earliest);
  for (const range of fixedRanges) {
    if (cursor.getTime() + durationMinutes * 60_000 <= range.start.getTime()) {
      return cursor;
    }
    if (cursor < range.end && cursor.getTime() + durationMinutes * 60_000 > range.start.getTime()) {
      cursor = roundUpToSlot(range.end);
    }
  }
  return cursor.getTime() + durationMinutes * 60_000 <= dayEnd.getTime() ? cursor : null;
};

const getFixedRanges = (items: DayPlanTimelineItem[], movingId?: string) =>
  items
    .filter((item) => isFixedForAutoPlan(item, movingId))
    .map((item) => {
      const start = getDayPlanItemStart(item);
      const end = getDayPlanItemEnd(item);
      return start && end && end > start ? { start, end } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a!.start.getTime() - b!.start.getTime()) as Array<{ start: Date; end: Date }>;

const applyTime = (item: DayPlanTimelineItem, start: Date, timeSource: DayPlanTimeSource) => {
  const end = addMinutes(start, item.durationMinutes);
  if (item.kind === 'task') {
    return {
      ...item,
      dueDate: start.toISOString(),
      hasDueTime: true,
      timeSource,
    };
  }
  return {
    ...item,
    start: start.toISOString(),
    end: end.toISOString(),
    timeSource,
  };
};

/**
 * The earliest time Eazee may put something on this day: the start of the day, or for
 * today, now (rounded up to the next slot), so a plan never uses times already past.
 */
export const getEarliestPlanTime = (date: string, now = new Date()) => {
  const { start: dayStart } = getDayBounds(date);
  const isToday = dayStart.getFullYear() === now.getFullYear()
    && dayStart.getMonth() === now.getMonth()
    && dayStart.getDate() === now.getDate();
  if (!isToday) return dayStart;
  const nextSlot = roundUpToSlot(now);
  return nextSlot > dayStart ? nextSlot : dayStart;
};

export const replanTimelineItems = (
  items: DayPlanTimelineItem[],
  date: string,
  options?: { movingId?: string; assignUntimedTasks?: boolean; compactAiTimes?: boolean; now?: Date }
) => {
  const { end: dayEnd } = getDayBounds(date);
  const fixedRanges = getFixedRanges(items, options?.movingId);
  // Times the user set stay put; everything Eazee places starts from here.
  let cursor = getEarliestPlanTime(date, options?.now);
  const nextItems: DayPlanTimelineItem[] = [];

  for (const item of items) {
    const itemStart = getDayPlanItemStart(item);
    const itemEnd = getDayPlanItemEnd(item);
    const isMoving = item.id === options?.movingId;
    const fixed = isFixedForAutoPlan(item, options?.movingId);

    if (fixed) {
      nextItems.push(item);
      if (itemEnd && itemEnd > cursor) cursor = itemEnd;
      continue;
    }

    if (item.timeSource === 'none' && item.userEdited && !isMoving) {
      nextItems.push(item);
      continue;
    }

    if (item.kind === 'task' && item.timeSource === 'none' && !options?.assignUntimedTasks && !isMoving) {
      nextItems.push(item);
      continue;
    }

    const earliest = !options?.compactAiTimes && itemStart && item.timeSource === 'ai' && itemStart > cursor ? itemStart : cursor;
    const slot = findSlot(item.durationMinutes, earliest, dayEnd, fixedRanges);
    if (!slot) {
      nextItems.push({ ...item, timeSource: item.kind === 'task' ? 'none' : item.timeSource });
      continue;
    }
    const source: DayPlanTimeSource = isMoving ? 'user' : 'ai';
    const planned = applyTime(item, slot, source);
    nextItems.push(isMoving ? { ...planned, userEdited: true } : planned);
    cursor = addMinutes(slot, item.durationMinutes);
  }

  return sortTimelineItems(nextItems);
};

export const sortTimelineItems = (items: DayPlanTimelineItem[]) =>
  [...items].sort((a, b) => {
    const aStart = getDayPlanItemStart(a);
    const bStart = getDayPlanItemStart(b);
    if (aStart && bStart) return aStart.getTime() - bStart.getTime();
    if (aStart) return -1;
    if (bStart) return 1;
    return 0;
  });

export const removeTimelineItemTime = (items: DayPlanTimelineItem[], id: string, date: string) => {
  const next = items.map((item) => {
    if (item.id !== id || item.kind === 'blocker') return item;
    if (item.kind === 'task') {
      const base = toDate(item.dueDate) || parseCalendarDateValue(date) || new Date();
      base.setHours(0, 0, 0, 0);
      return {
        ...item,
        dueDate: base.toISOString(),
        hasDueTime: false,
        timeSource: 'none' as const,
        userEdited: true,
      };
    }
    return {
      ...item,
      start: undefined,
      end: undefined,
      timeSource: 'none' as const,
      userEdited: true,
    };
  });
  return sortTimelineItems(next);
};

export const deleteTimelineItem = (items: DayPlanTimelineItem[], id: string, date: string) =>
  sortTimelineItems(items.filter((item) => item.id !== id || item.kind === 'blocker'));

export const setTimelineItemTime = (items: DayPlanTimelineItem[], id: string, date: string, selectedTime: Date) => {
  const { start: dayStart } = getDayBounds(date);
  const nextStart = new Date(dayStart);
  nextStart.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
  const next = items.map((item) => {
    if (item.id !== id || item.kind === 'blocker') return item;
    return {
      ...applyTime(item, nextStart, 'user'),
      userEdited: true,
    };
  });
  return sortTimelineItems(next);
};

export const setTimelineItemEndTime = (items: DayPlanTimelineItem[], id: string, date: string, selectedTime: Date) => {
  const { start: dayStart } = getDayBounds(date);
  const nextEnd = new Date(dayStart);
  nextEnd.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
  const next = items.map((item) => {
    if (item.id !== id || item.kind !== 'event') return item;
    const start = toDate(item.start);
    if (!start) return item;
    if (nextEnd <= start) {
      const nextStart = addMinutes(nextEnd, -DEFAULT_EVENT_DURATION_MINUTES);
      return {
        ...item,
        start: nextStart.toISOString(),
        end: nextEnd.toISOString(),
        durationMinutes: DEFAULT_EVENT_DURATION_MINUTES,
        timeSource: 'user' as const,
        userEdited: true,
      };
    }
    return {
      ...item,
      end: nextEnd.toISOString(),
      durationMinutes: clampDuration((nextEnd.getTime() - start.getTime()) / 60_000, DEFAULT_EVENT_DURATION_MINUTES),
      timeSource: 'user' as const,
      userEdited: true,
    };
  });
  return sortTimelineItems(next);
};

export const reorderTimelineItems = (items: DayPlanTimelineItem[], from: number, to: number, date: string) => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return replanTimelineItems(next, date, { movingId: moved.id, assignUntimedTasks: true, compactAiTimes: true });
};

export const buildDayPlanCardValue = (date: string, timelineItems: DayPlanTimelineItem[], draftId?: string): DayPlanCardValue => {
  const calendarItems = timelineItems
    .filter((item) => item.kind === 'event' && item.source === 'draft')
    .map((item) => ({
      title: item.title,
      start: item.start,
      end: item.end,
      location: item.location,
    }));
  const todoItems = timelineItems
    .filter((item) => item.kind === 'task' && item.source === 'draft')
    .map((item) => ({
      text: item.title,
      dueDate: item.dueDate || date,
      hasDueTime: !!item.hasDueTime,
      starred: !!item.starred,
      priority: item.priority || 'medium',
      durationMinutes: item.durationMinutes,
      existingTodoId: item.existingTodoId,
    }));
  const missingEventTime = calendarItems.some((item) => !item.start || !item.end);

  return {
    type: 'dayPlan',
    draftId,
    date,
    calendarItems,
    todoItems,
    timelineItems,
    saveBlockedReason: missingEventTime ? 'Set a time for every event before saving.' : undefined,
  };
};

export const getTimelineDurationMinutes = (item: any, kind: 'task' | 'event', start?: string, end?: string) => {
  const parsedStart = toDate(start);
  const parsedEnd = toDate(end);
  if (parsedStart && parsedEnd && parsedEnd > parsedStart) {
    return clampDuration((parsedEnd.getTime() - parsedStart.getTime()) / 60_000, kind === 'event' ? DEFAULT_EVENT_DURATION_MINUTES : DEFAULT_TASK_DURATION_MINUTES);
  }
  return clampDuration(item?.durationMinutes, kind === 'event' ? DEFAULT_EVENT_DURATION_MINUTES : DEFAULT_TASK_DURATION_MINUTES);
};

export const formatTimelineTime = (item: DayPlanTimelineItem) => {
  const start = getDayPlanItemStart(item);
  if (!start) return item.kind === 'event' ? 'Set time' : 'Any time';
  const end = getDayPlanItemEnd(item);
  if (item.kind === 'task' || !end) return format(start, 'h:mm a');
  return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
};
