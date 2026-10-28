import { addDays, startOfWeek } from 'date-fns';

/** The Calendar's weeks run Monday to Sunday. */
export const CALENDAR_WEEK_STARTS_ON = 1;

export const normalizeCalendarWeekStart = (date: Date) => {
  const weekStart = startOfWeek(date, { weekStartsOn: CALENDAR_WEEK_STARTS_ON });
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

export const getCalendarWeekKey = (date: Date) => {
  const weekStart = normalizeCalendarWeekStart(date);
  const year = weekStart.getFullYear();
  const month = String(weekStart.getMonth() + 1).padStart(2, '0');
  const day = String(weekStart.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getAdjacentCalendarWeekStarts = (date: Date) => {
  const weekStart = normalizeCalendarWeekStart(date);
  return [addDays(weekStart, -7), weekStart, addDays(weekStart, 7)];
};

export const eventOverlapsCalendarRange = (
  eventStart: Date,
  eventEnd: Date,
  rangeStart: Date,
  rangeEnd: Date
) => eventStart < rangeEnd && eventEnd > rangeStart;
