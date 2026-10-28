export type CreateSlotResizeEdge = 'start' | 'end';

export const CREATE_SLOT_RESIZE_STEP_MINUTES = 15;
export const CREATE_SLOT_MIN_DURATION_MINUTES = 15;
export const CALENDAR_DAY_MINUTES = 24 * 60;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const getMinutesSinceStartOfDay = (date: Date) =>
  date.getHours() * 60 + date.getMinutes();

export const getDateAtDayMinute = (day: Date, minutes: number) => {
  const next = new Date(day);
  next.setHours(0, 0, 0, 0);
  next.setMinutes(clamp(minutes, 0, CALENDAR_DAY_MINUTES), 0, 0);
  return next;
};

export const getResizedCreateSlotMinutes = ({
  edge,
  startMinutes,
  endMinutes,
  translationY,
  pxPerMinute,
}: {
  edge: CreateSlotResizeEdge;
  startMinutes: number;
  endMinutes: number;
  translationY: number;
  pxPerMinute: number;
}) => {
  const safePxPerMinute = pxPerMinute > 0 ? pxPerMinute : 1;
  const safeStartMinutes = clamp(Math.round(startMinutes), 0, CALENDAR_DAY_MINUTES);
  const safeEndMinutes = clamp(
    Math.round(endMinutes),
    safeStartMinutes + CREATE_SLOT_MIN_DURATION_MINUTES,
    CALENDAR_DAY_MINUTES
  );
  const minutesDelta =
    Math.round((translationY / safePxPerMinute) / CREATE_SLOT_RESIZE_STEP_MINUTES) *
    CREATE_SLOT_RESIZE_STEP_MINUTES;

  if (edge === 'start') {
    return {
      startMinutes: clamp(
        safeStartMinutes + minutesDelta,
        0,
        safeEndMinutes - CREATE_SLOT_MIN_DURATION_MINUTES
      ),
      endMinutes: safeEndMinutes,
    };
  }

  return {
    startMinutes: safeStartMinutes,
    endMinutes: clamp(
      safeEndMinutes + minutesDelta,
      safeStartMinutes + CREATE_SLOT_MIN_DURATION_MINUTES,
    CALENDAR_DAY_MINUTES
  ),
  };
};

export const getMovedCreateSlotMinutes = ({
  dayIndex,
  startMinutes,
  endMinutes,
  translationX,
  translationY,
  dayColumnWidth,
  dayCount,
  pxPerMinute,
}: {
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
  translationX: number;
  translationY: number;
  dayColumnWidth: number;
  dayCount: number;
  pxPerMinute: number;
}) => {
  const safeDayCount = Math.max(1, Math.round(dayCount));
  const safeDayIndex = clamp(Math.round(dayIndex), 0, safeDayCount - 1);
  const safePxPerMinute = pxPerMinute > 0 ? pxPerMinute : 1;
  const safeDayColumnWidth = dayColumnWidth > 0 ? dayColumnWidth : 1;
  const safeStartMinutes = clamp(Math.round(startMinutes), 0, CALENDAR_DAY_MINUTES);
  const safeEndMinutes = clamp(
    Math.round(endMinutes),
    safeStartMinutes + CREATE_SLOT_MIN_DURATION_MINUTES,
    CALENDAR_DAY_MINUTES
  );
  const durationMinutes = Math.min(
    CALENDAR_DAY_MINUTES,
    Math.max(CREATE_SLOT_MIN_DURATION_MINUTES, safeEndMinutes - safeStartMinutes)
  );
  const maxStartMinutes = Math.max(0, CALENDAR_DAY_MINUTES - durationMinutes);
  const dayDelta = Math.round(translationX / safeDayColumnWidth);
  const minutesDelta =
    Math.round((translationY / safePxPerMinute) / CREATE_SLOT_RESIZE_STEP_MINUTES) *
    CREATE_SLOT_RESIZE_STEP_MINUTES;
  const nextStartMinutes = clamp(safeStartMinutes + minutesDelta, 0, maxStartMinutes);

  return {
    dayIndex: clamp(safeDayIndex + dayDelta, 0, safeDayCount - 1),
    startMinutes: nextStartMinutes,
    endMinutes: nextStartMinutes + durationMinutes,
  };
};
