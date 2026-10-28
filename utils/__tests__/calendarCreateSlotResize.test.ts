import {
  CALENDAR_DAY_MINUTES,
  getDateAtDayMinute,
  getMinutesSinceStartOfDay,
  getMovedCreateSlotMinutes,
  getResizedCreateSlotMinutes,
} from '../calendarCreateSlotResize';

describe('calendarCreateSlotResize', () => {
  const pxPerMinute = 2;

  it('resizes the bottom edge in 15-minute increments', () => {
    const startMinutes = 10 * 60;
    const endMinutes = 11 * 60;

    expect(getResizedCreateSlotMinutes({
      edge: 'end',
      startMinutes,
      endMinutes,
      translationY: -45 * pxPerMinute,
      pxPerMinute,
    })).toEqual({ startMinutes, endMinutes: 10 * 60 + 15 });
    expect(getResizedCreateSlotMinutes({
      edge: 'end',
      startMinutes,
      endMinutes,
      translationY: -30 * pxPerMinute,
      pxPerMinute,
    })).toEqual({ startMinutes, endMinutes: 10 * 60 + 30 });
    expect(getResizedCreateSlotMinutes({
      edge: 'end',
      startMinutes,
      endMinutes,
      translationY: -15 * pxPerMinute,
      pxPerMinute,
    })).toEqual({ startMinutes, endMinutes: 10 * 60 + 45 });
    expect(getResizedCreateSlotMinutes({
      edge: 'end',
      startMinutes,
      endMinutes,
      translationY: 15 * pxPerMinute,
      pxPerMinute,
    })).toEqual({ startMinutes, endMinutes: 11 * 60 + 15 });
    expect(getResizedCreateSlotMinutes({
      edge: 'end',
      startMinutes,
      endMinutes,
      translationY: 30 * pxPerMinute,
      pxPerMinute,
    })).toEqual({ startMinutes, endMinutes: 11 * 60 + 30 });
    expect(getResizedCreateSlotMinutes({
      edge: 'end',
      startMinutes,
      endMinutes,
      translationY: 45 * pxPerMinute,
      pxPerMinute,
    })).toEqual({ startMinutes, endMinutes: 11 * 60 + 45 });
    expect(getResizedCreateSlotMinutes({
      edge: 'end',
      startMinutes,
      endMinutes,
      translationY: 60 * pxPerMinute,
      pxPerMinute,
    })).toEqual({ startMinutes, endMinutes: 12 * 60 });
  });

  it('clamps the top edge to midnight and the minimum duration', () => {
    expect(getResizedCreateSlotMinutes({
      edge: 'start',
      startMinutes: 0,
      endMinutes: 60,
      translationY: -90 * pxPerMinute,
      pxPerMinute,
    })).toEqual({ startMinutes: 0, endMinutes: 60 });

    expect(getResizedCreateSlotMinutes({
      edge: 'start',
      startMinutes: 10 * 60,
      endMinutes: 11 * 60,
      translationY: 60 * pxPerMinute,
      pxPerMinute,
    })).toEqual({ startMinutes: 10 * 60 + 45, endMinutes: 11 * 60 });
  });

  it('clamps the bottom edge to end of day and the minimum duration', () => {
    expect(getResizedCreateSlotMinutes({
      edge: 'end',
      startMinutes: 23 * 60,
      endMinutes: CALENDAR_DAY_MINUTES,
      translationY: 90 * pxPerMinute,
      pxPerMinute,
    })).toEqual({ startMinutes: 23 * 60, endMinutes: CALENDAR_DAY_MINUTES });

    expect(getResizedCreateSlotMinutes({
      edge: 'end',
      startMinutes: 10 * 60,
      endMinutes: 11 * 60,
      translationY: -60 * pxPerMinute,
      pxPerMinute,
    })).toEqual({ startMinutes: 10 * 60, endMinutes: 10 * 60 + 15 });
  });

  it('maps 24:00 to the next day', () => {
    const date = getDateAtDayMinute(new Date(2026, 4, 6, 10), CALENDAR_DAY_MINUTES);

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(7);
    expect(getMinutesSinceStartOfDay(date)).toBe(0);
  });

  it('moves the slot across days and 15-minute rows while preserving duration', () => {
    expect(getMovedCreateSlotMinutes({
      dayIndex: 2,
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
      translationX: 1.2 * 80,
      translationY: 45 * pxPerMinute,
      dayColumnWidth: 80,
      dayCount: 7,
      pxPerMinute,
    })).toEqual({
      dayIndex: 3,
      startMinutes: 9 * 60 + 45,
      endMinutes: 10 * 60 + 45,
    });
  });

  it('clamps moved slots inside the visible week and day', () => {
    expect(getMovedCreateSlotMinutes({
      dayIndex: 0,
      startMinutes: 23 * 60,
      endMinutes: CALENDAR_DAY_MINUTES,
      translationX: -3 * 80,
      translationY: 90 * pxPerMinute,
      dayColumnWidth: 80,
      dayCount: 7,
      pxPerMinute,
    })).toEqual({
      dayIndex: 0,
      startMinutes: 23 * 60,
      endMinutes: CALENDAR_DAY_MINUTES,
    });
  });
});
