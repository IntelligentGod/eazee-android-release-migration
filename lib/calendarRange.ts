import { Q } from '@nozbe/watermelondb';

import { getAccessTokenStatic } from '@/app/context/TokenContext';
import { database } from '@/database/database';
import EventModel from '@/database/models/EventModel';
import { extendEventSeries } from '@/lib/eventSeries';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import { WAVE_EVENT_DESCRIPTION_SENTINEL } from '@/utils/calendarDetails';

export type RangeCalendarEvent = {
  id: string;
  title: string;
  startDate: Date;
  endDate?: Date;
  isAllDay: boolean;
  location?: string;
  /** Where to open the event: the app's own event row, or Google Calendar. */
  source?: 'local' | 'google';
  /** The id to open it with in the Calendar screen. */
  openId?: string;
};

/** Local events starting in [start, end); events mirrored from a todo are left out. */
export async function fetchLocalCalendarEvents(start: Date, end: Date): Promise<RangeCalendarEvent[]> {
  await extendEventSeries(end).catch(() => {});
  const rows = await database.collections
    .get<EventModel>('events')
    .query(Q.where('start_date', Q.gte(start.getTime())), Q.where('start_date', Q.lt(end.getTime())))
    .fetch();

  return rows
    .filter((row) => !row.isTodo && !row.sourceTodoId)
    .map((row) => ({
      id: row.googleEventId || row.id,
      title: row.title,
      startDate: row.startDate,
      endDate: row.endDate,
      isAllDay: false,
      location: row.location,
      source: 'local' as const,
      openId: row.id,
    }));
}

/** Primary Google Calendar events in [start, end); empty when Google is not connected. */
export async function fetchGoogleCalendarEvents(start: Date, end: Date): Promise<RangeCalendarEvent[]> {
  const token = await getAccessTokenStatic();
  if (!token) return [];

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
    start.toISOString()
  )}&timeMax=${encodeURIComponent(end.toISOString())}&singleEvents=true&orderBy=startTime`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!response.ok) return [];

  const data = await response.json().catch(() => ({}));
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((item) => item?.status !== 'cancelled' && item?.description !== WAVE_EVENT_DESCRIPTION_SENTINEL)
    .flatMap((item) => {
      const startDate = parseCalendarDateValue(item.start?.dateTime || item.start?.date);
      if (!startDate) return [];
      return [{
        id: String(item.id),
        title: String(item.summary || ''),
        startDate,
        endDate: parseCalendarDateValue(item.end?.dateTime || item.end?.date) || undefined,
        isAllDay: !!(item.start?.date && !item.start?.dateTime),
        location: typeof item.location === 'string' ? item.location : undefined,
        source: 'google' as const,
        openId: String(item.id),
      }];
    });
}

/** Local and Google events together; a local copy of a Google event shares its id, so Google's wins. */
export async function fetchCalendarEventsInRange(start: Date, end: Date): Promise<RangeCalendarEvent[]> {
  const [localEvents, googleEvents] = await Promise.all([
    fetchLocalCalendarEvents(start, end),
    fetchGoogleCalendarEvents(start, end).catch(() => []),
  ]);
  const eventsById = new Map([...localEvents, ...googleEvents].map((event) => [event.id, event]));
  return [...eventsById.values()].sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
}
