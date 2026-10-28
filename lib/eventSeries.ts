import { Q } from '@nozbe/watermelondb';
import { addWeeks } from 'date-fns';

import { getGoogleConnectionStatusStatic } from '@/app/context/TokenContext';
import { database } from '@/database/database';
import type EventModel from '@/database/models/EventModel';
import type EventSeriesModel from '@/database/models/EventSeriesModel';
import { WAVE_EVENT_DESCRIPTION_SENTINEL } from '@/utils/calendarDetails';

/**
 * Weekly repeating calendar events.
 *
 * Each occurrence is a normal row in `events`, linked to its `event_series` row, so
 * every screen that reads the calendar shows it without knowing about repeats. Rows
 * are created a few weeks ahead and extended as time passes ({@link extendEventSeries}).
 * Rows are only ever added after the latest one, so deleting a single occurrence is final.
 *
 * On Google Calendar the series is one event with a weekly RRULE. Each local row is
 * linked to its Google instance, so the existing calendar sync matches them up.
 */

const OCCURRENCE_HORIZON_WEEKS = 8;
const GOOGLE_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export type WeeklyEventInput = {
  title: string;
  start: string;
  end: string;
  location?: string;
  details?: string;
};

/** Google's timestamp form for RRULE UNTIL and instance ids, e.g. 20261012T070000Z. */
export const formatGoogleUtcStamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Google names each instance of a timed repeating event `<event id>_<original start in UTC>`. */
export const toGoogleInstanceId = (seriesGoogleEventId: string, occurrenceStart: Date) =>
  `${seriesGoogleEventId}_${formatGoogleUtcStamp(occurrenceStart)}`;

/** Weekly starts after `after` (exclusive) up to `until` (exclusive), keeping the local clock time. */
export function getWeeklyOccurrenceStarts(first: Date, after: Date | null, until: Date) {
  const starts: Date[] = [];
  for (let index = 0, start = first; start < until; index += 1, start = addWeeks(first, index)) {
    if (!after || start > after) starts.push(start);
  }
  return starts;
}

const getHorizonEnd = (now: Date) => addWeeks(now, OCCURRENCE_HORIZON_WEEKS);

async function getGoogleAccessToken() {
  try {
    const status = await getGoogleConnectionStatusStatic();
    return status.isActive ? status.accessToken : null;
  } catch {
    return null;
  }
}

/** The real Google instance ids for a range, keyed by start time; empty when Google can't be reached. */
async function fetchGoogleInstanceIds(token: string, seriesGoogleEventId: string, from: Date, until: Date) {
  const instanceIds = new Map<number, string>();
  try {
    const params = new URLSearchParams({ timeMin: from.toISOString(), timeMax: until.toISOString(), maxResults: '250' });
    const response = await fetch(`${GOOGLE_EVENTS_URL}/${encodeURIComponent(seriesGoogleEventId)}/instances?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return instanceIds;
    const data: any = await response.json().catch(() => ({}));
    for (const instance of Array.isArray(data?.items) ? data.items : []) {
      const start = new Date(instance?.originalStartTime?.dateTime || instance?.start?.dateTime || '');
      if (instance?.id && !isNaN(start.getTime())) instanceIds.set(start.getTime(), String(instance.id));
    }
  } catch {}
  return instanceIds;
}

async function linkGoogleInstances(seriesGoogleEventId: string | null | undefined, starts: Date[], token: string | null) {
  if (!seriesGoogleEventId || !starts.length) return new Map<number, string>();
  const known = token
    ? await fetchGoogleInstanceIds(token, seriesGoogleEventId, starts[0], new Date(starts[starts.length - 1].getTime() + 1))
    : new Map<number, string>();
  return new Map(starts.map((start) => [
    start.getTime(),
    known.get(start.getTime()) || toGoogleInstanceId(seriesGoogleEventId, start),
  ]));
}

async function createGoogleWeeklyEvent(token: string, input: WeeklyEventInput) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try {
    const response = await fetch(GOOGLE_EVENTS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: input.title,
        description: input.details || WAVE_EVENT_DESCRIPTION_SENTINEL,
        location: input.location || undefined,
        // Google needs a time zone on repeating events to keep the same local time each week.
        start: { dateTime: new Date(input.start).toISOString(), timeZone },
        end: { dateTime: new Date(input.end).toISOString(), timeZone },
        recurrence: ['RRULE:FREQ=WEEKLY'],
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
      }),
    });
    if (!response.ok) return null;
    const data: any = await response.json().catch(() => ({}));
    return data?.id ? String(data.id) : null;
  } catch {
    return null;
  }
}

const writeOccurrenceRow = (
  row: EventModel,
  series: Pick<EventSeriesModel, 'id' | 'title' | 'details' | 'location'>,
  start: Date,
  durationMs: number,
  googleEventId?: string
) => {
  const end = new Date(start.getTime() + durationMs);
  row.title = series.title;
  row.details = series.details || '';
  row.startDate = start;
  row.startTime = start.getHours();
  row.endDate = end;
  row.endTime = end.getHours();
  row.isGoogleEvent = false;
  row.seriesId = series.id;
  if (series.location) row.location = series.location;
  if (googleEventId) row.googleEventId = googleEventId;
};

/** Creates a weekly repeating event: its first weeks of occurrences locally, and one repeating event on Google. */
export async function createWeeklyEventSeries(input: WeeklyEventInput, now = new Date()) {
  const first = new Date(input.start);
  const firstEnd = new Date(input.end);
  if (!input.title.trim() || isNaN(first.getTime()) || isNaN(firstEnd.getTime()) || firstEnd <= first) {
    throw new Error('MISSING_PARAMS');
  }
  const durationMs = firstEnd.getTime() - first.getTime();
  const horizonEnd = getHorizonEnd(now);
  const starts = getWeeklyOccurrenceStarts(first, null, horizonEnd > first ? horizonEnd : addWeeks(first, 1));

  const token = await getGoogleAccessToken();
  const seriesGoogleEventId = token ? await createGoogleWeeklyEvent(token, input) : null;
  const instanceIds = await linkGoogleInstances(seriesGoogleEventId, starts, token);

  let seriesId = '';
  let firstEventId = '';
  await database.write(async () => {
    const series = await database.get<EventSeriesModel>('event_series').create((record) => {
      record.title = input.title.trim();
      record.details = input.details?.trim() || null;
      record.location = input.location?.trim() || null;
      record.startDate = first;
      record.endDate = firstEnd;
      record.active = true;
      record.lastOccurrenceStart = starts[starts.length - 1];
      record.googleEventId = seriesGoogleEventId;
    });
    seriesId = series.id;
    const events = database.get<EventModel>('events');
    for (const start of starts) {
      const row = await events.create((record) =>
        writeOccurrenceRow(record, series, start, durationMs, instanceIds.get(start.getTime())));
      if (!firstEventId) firstEventId = row.id;
    }
  });

  return { seriesId, firstEventId, googleEventId: seriesGoogleEventId, occurrenceCount: starts.length };
}

let extendQueue: Promise<void> = Promise.resolve();

/**
 * Makes sure every repeating event has occurrence rows up to `through` (and at least a few
 * weeks past today). Cheap when nothing is missing. Runs one at a time, so two screens
 * asking at once never create the same occurrence twice.
 */
export function extendEventSeries(through: Date, now = new Date()) {
  const run = extendQueue.then(() => extendEventSeriesNow(through, now));
  extendQueue = run.catch(() => {});
  return run;
}

async function extendEventSeriesNow(through: Date, now: Date) {
  const horizonEnd = getHorizonEnd(now);
  const until = through > horizonEnd ? through : horizonEnd;
  const activeSeries = await database.get<EventSeriesModel>('event_series')
    .query(Q.where('active', true), Q.where('last_occurrence_start', Q.lt(addWeeks(until, -1).getTime())))
    .fetch();
  const pending = activeSeries
    .map((series) => ({ series, starts: getWeeklyOccurrenceStarts(series.startDate, series.lastOccurrenceStart, until) }))
    .filter(({ starts }) => starts.length > 0);
  if (!pending.length) return;

  const token = pending.some(({ series }) => series.googleEventId) ? await getGoogleAccessToken() : null;
  const instanceIdsBySeries = new Map<string, Map<number, string>>();
  for (const { series, starts } of pending) {
    instanceIdsBySeries.set(series.id, await linkGoogleInstances(series.googleEventId, starts, token));
  }

  await database.write(async () => {
    const events = database.get<EventModel>('events');
    for (const { series, starts } of pending) {
      const durationMs = series.endDate.getTime() - series.startDate.getTime();
      const instanceIds = instanceIdsBySeries.get(series.id);
      for (const start of starts) {
        await events.create((record) => writeOccurrenceRow(record, series, start, durationMs, instanceIds?.get(start.getTime())));
      }
      await series.update((record) => {
        record.lastOccurrenceStart = starts[starts.length - 1];
      });
    }
  });
}

/**
 * Stops a repeating event from one occurrence on: that occurrence and every later one
 * are deleted, earlier ones stay. On Google the repeat is ended the same way.
 */
export async function stopEventSeriesFrom(seriesId: string, from: Date) {
  const series = await database.get<EventSeriesModel>('event_series').find(seriesId).catch(() => null);
  if (!series) {
    // The repeat's record is already gone; delete the occurrences still showing.
    const leftovers = await database.get<EventModel>('events')
      .query(Q.where('series_id', seriesId), Q.where('start_date', Q.gte(from.getTime())))
      .fetch();
    await database.write(async () => {
      for (const occurrence of leftovers) await occurrence.destroyPermanently();
    });
    return { deletedCount: leftovers.length };
  }
  const isFromFirstOccurrence = from.getTime() <= series.startDate.getTime();

  if (series.googleEventId) {
    const token = await getGoogleAccessToken();
    if (!token) throw new Error('GOOGLE_AUTH_REQUIRED');
    const url = `${GOOGLE_EVENTS_URL}/${encodeURIComponent(series.googleEventId)}`;
    const response = isFromFirstOccurrence
      ? await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      : await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recurrence: [`RRULE:FREQ=WEEKLY;UNTIL=${formatGoogleUtcStamp(new Date(from.getTime() - 1000))}`] }),
      });
    if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error('GOOGLE_DELETE_FAILED');
  }

  const laterOccurrences = await database.get<EventModel>('events')
    .query(Q.where('series_id', seriesId), Q.where('start_date', Q.gte(from.getTime())))
    .fetch();
  await database.write(async () => {
    for (const occurrence of laterOccurrences) await occurrence.destroyPermanently();
    if (isFromFirstOccurrence) {
      await series.destroyPermanently();
    } else {
      await series.update((record) => {
        record.active = false;
      });
    }
  });
  return { deletedCount: laterOccurrences.length };
}
