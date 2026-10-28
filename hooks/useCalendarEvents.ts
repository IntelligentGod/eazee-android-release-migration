import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { format, addDays } from 'date-fns';
import { Q } from '@nozbe/watermelondb';

import { database } from '@/database/database';
import EventModel from '@/database/models/EventModel';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import { normalizeCalendarDetailsText } from '@/utils/calendarDetails';
import { extendEventSeries } from '@/lib/eventSeries';
import {
  eventOverlapsCalendarRange,
  getCalendarWeekKey,
  normalizeCalendarWeekStart,
} from '@/utils/calendarWeeks';

type UseCalendarEventsOptions = {
  currentWeekKey: string;
  weekStartRef: MutableRefObject<Date>;
  getAccessToken: () => Promise<string | null>;
  isGoogleConnected: boolean;
  isTokenLoading: boolean;
};

type PendingOptimisticMove = {
  event: EventModel;
  prevStart: Date;
  prevEnd: Date;
  nextStart: Date;
  nextEnd: Date;
};

const cloneEventWithRange = (event: EventModel, startDate: Date, endDate: Date) => ({
  id: event.id,
  title: event.title,
  details: event.details,
  startDate,
  startTime: startDate.getHours(),
  endDate,
  endTime: endDate.getHours(),
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
  googleEventId: event.googleEventId,
  sourceTodoId: event.sourceTodoId,
  seriesId: event.seriesId,
  isGoogleEvent: event.isGoogleEvent,
  isTodo: event.isTodo,
  location: event.location,
  latitude: event.latitude,
  longitude: event.longitude,
  attendees: event.attendees,
  isAllDay: (event as any).isAllDay,
  editable: (event as any).editable,
  description: (event as any).description,
  hangoutLink: (event as any).hangoutLink,
}) as unknown as EventModel;

const eventMatchesRange = (event: EventModel, startDate: Date, endDate: Date) => (
  new Date(event.startDate).getTime() === startDate.getTime() &&
  new Date(event.endDate).getTime() === endDate.getTime()
);

export function useCalendarEvents({
  currentWeekKey,
  weekStartRef,
  getAccessToken,
  isGoogleConnected,
  isTokenLoading,
}: UseCalendarEventsOptions) {
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<EventModel[]>([]);
  const [weekEventsByKey, setWeekEventsByKey] = useState<Record<string, EventModel[]>>({});
  const weekEventsByKeyRef = useRef<Record<string, EventModel[]>>({});
  const [weekLoadingByKey, setWeekLoadingByKey] = useState<Record<string, boolean>>({});
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, { startDate: Date; endDate: Date }>>({});
  const pendingOptimisticEventIdsRef = useRef<Set<string>>(new Set());
  const pendingOptimisticMovesRef = useRef<Record<string, PendingOptimisticMove>>({});
  const weekFetchRequestByKeyRef = useRef<Record<string, number>>({});
  const weekFetchSequenceRef = useRef(0);

  useEffect(() => {
    weekEventsByKeyRef.current = weekEventsByKey;
    const hasCurrentWeekCache = Object.prototype.hasOwnProperty.call(weekEventsByKey, currentWeekKey);
    setEvents(weekEventsByKey[currentWeekKey] ?? []);
    setIsLoading(!hasCurrentWeekCache && (weekLoadingByKey[currentWeekKey] ?? true));
  }, [currentWeekKey, weekEventsByKey, weekLoadingByKey]);

  const fetchGoogleCalendarEvents = useCallback(async (start: Date, end: Date) => {
    const currentAccessToken = await getAccessToken();

    if (!currentAccessToken) {
      console.error('No access token available, attempting to refresh');
      return null;
    }

    const timeMin = format(start, "yyyy-MM-dd'T'HH:mm:ssxxx");
    const timeMax = format(end, "yyyy-MM-dd'T'HH:mm:ssxxx");

    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${currentAccessToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Google Calendar API response not OK:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const items = data.items || [];

      return items.map((item: any) => ({
        id: item.id,
        title: item.summary,
        startDate: parseCalendarDateValue(item.start.dateTime || item.start.date) || new Date(),
        endDate: parseCalendarDateValue(item.end.dateTime || item.end.date) || new Date(),
        isGoogleEvent: true,
        description: item.description,
        location: item.location,
        hangoutLink: item.hangoutLink,
        attendees: item.attendees?.map((attendee: any) => ({
          email: attendee.email,
          responseStatus: attendee.responseStatus,
        })) || [],
        isAllDay: !!(item.start?.date && !item.start?.dateTime),
        editable: !!(item?.organizer?.self || item?.guestsCanModify) && item?.status !== 'cancelled' && item?.eventType !== 'outOfOffice',
      }));
    } catch (error) {
      console.error('Error fetching Google Calendar events:', error);
      return null;
    }
  }, [getAccessToken]);

  const fetchGoogleCalendarEventStatus = useCallback(async (eventId: string) => {
    const currentAccessToken = await getAccessToken();
    if (!currentAccessToken) {
      return 'unknown' as const;
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
        {
          headers: {
            Authorization: `Bearer ${currentAccessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.status === 'cancelled') {
          return 'deleted' as const;
        }
        return 'exists' as const;
      }
      if (response.status === 404 || response.status === 410) {
        return 'deleted' as const;
      }
      return 'unknown' as const;
    } catch (error) {
      console.error('Error checking Google Calendar event:', error);
      return 'unknown' as const;
    }
  }, [getAccessToken]);

  const updateCurrentWeekEvents = useCallback((updater: (current: EventModel[]) => EventModel[]) => {
    setEvents((current) => {
      const next = updater(current);
      const key = getCalendarWeekKey(weekStartRef.current);
      setWeekEventsByKey((previous) => {
        const updated = { ...previous, [key]: next };
        weekEventsByKeyRef.current = updated;
        return updated;
      });
      return next;
    });
  }, [weekStartRef]);

  const commitWeekEvents = useCallback((weekKey: string, nextEvents: EventModel[]) => {
    setWeekEventsByKey((previous) => {
      const updated = { ...previous, [weekKey]: nextEvents };
      weekEventsByKeyRef.current = updated;
      return updated;
    });
    if (weekKey === getCalendarWeekKey(weekStartRef.current)) {
      setEvents(nextEvents);
      setIsLoading(false);
    }
  }, [weekStartRef]);

  const applyPendingMovesToWeek = useCallback((weekKey: string, weekStart: Date, sourceEvents: EventModel[]) => {
    const weekEnd = addDays(weekStart, 7);
    const moves = Object.values(pendingOptimisticMovesRef.current);
    if (moves.length === 0) return sourceEvents;

    const movedIds = new Set(moves.map((move) => String(move.event.id)));
    const sourceById = new Map(sourceEvents.map((event) => [String(event.id), event]));
    const nextEvents = sourceEvents.filter((event) => !movedIds.has(String(event.id)));

    moves.forEach((move) => {
      if (eventOverlapsCalendarRange(move.nextStart, move.nextEnd, weekStart, weekEnd)) {
        const sourceEvent = sourceById.get(String(move.event.id));
        nextEvents.push(
          sourceEvent && eventMatchesRange(sourceEvent, move.nextStart, move.nextEnd)
            ? sourceEvent
            : cloneEventWithRange(move.event, move.nextStart, move.nextEnd)
        );
      }
    });

    return nextEvents.sort(
      (a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    ) as EventModel[];
  }, []);

  const updateWeeksForOptimisticMove = useCallback((move: PendingOptimisticMove, startDate: Date, endDate: Date) => {
    const cached = weekEventsByKeyRef.current;
    const currentKey = getCalendarWeekKey(weekStartRef.current);
    const nextWeekEventsByKey: Record<string, EventModel[]> = { ...cached };
    const weekKeys = new Set([...Object.keys(cached), currentKey]);

    weekKeys.forEach((weekKey) => {
      const [year, month, day] = weekKey.split('-').map(Number);
      const weekStart = new Date(year, month - 1, day);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = addDays(weekStart, 7);
      const baseEvents = nextWeekEventsByKey[weekKey] ?? [];
      const currentEvent = baseEvents.find((event) => String(event.id) === String(move.event.id));
      const withoutMovedEvent = baseEvents.filter((event) => String(event.id) !== String(move.event.id));

      if (eventOverlapsCalendarRange(startDate, endDate, weekStart, weekEnd)) {
        const eventForRange = currentEvent && eventMatchesRange(currentEvent, startDate, endDate)
          ? currentEvent
          : eventMatchesRange(move.event, startDate, endDate)
            ? move.event
            : cloneEventWithRange(move.event, startDate, endDate);
        withoutMovedEvent.push(eventForRange);
      }

      nextWeekEventsByKey[weekKey] = withoutMovedEvent.sort(
        (a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      ) as EventModel[];
    });

    weekEventsByKeyRef.current = nextWeekEventsByKey;
    setWeekEventsByKey(nextWeekEventsByKey);
    setEvents(nextWeekEventsByKey[currentKey] ?? []);
  }, [weekStartRef]);

  const applyOptimisticEventMove = useCallback((event: EventModel, nextStart: Date, nextEnd: Date) => {
    const eventKey = String(event.id);
    const previousMove = pendingOptimisticMovesRef.current[eventKey];
    const move = {
      event,
      prevStart: previousMove?.prevStart ?? new Date(event.startDate),
      prevEnd: previousMove?.prevEnd ?? new Date(event.endDate),
      nextStart,
      nextEnd,
    };

    pendingOptimisticMovesRef.current = {
      ...pendingOptimisticMovesRef.current,
      [eventKey]: move,
    };
    pendingOptimisticEventIdsRef.current.add(eventKey);
    setOptimisticOverrides((previous) => ({
      ...previous,
      [eventKey]: { startDate: nextStart, endDate: nextEnd },
    }));
    updateWeeksForOptimisticMove(move, nextStart, nextEnd);
  }, [pendingOptimisticEventIdsRef, updateWeeksForOptimisticMove]);

  const confirmOptimisticEventMove = useCallback((eventId: string) => {
    const eventKey = String(eventId);
    pendingOptimisticEventIdsRef.current.delete(eventKey);
    delete pendingOptimisticMovesRef.current[eventKey];
    setOptimisticOverrides((previous) => {
      const next = { ...previous };
      delete next[eventKey];
      return next;
    });
  }, [pendingOptimisticEventIdsRef]);

  const revertOptimisticEventMove = useCallback((eventId: string) => {
    const eventKey = String(eventId);
    const move = pendingOptimisticMovesRef.current[eventKey];
    if (!move) return;

    pendingOptimisticEventIdsRef.current.delete(eventKey);
    delete pendingOptimisticMovesRef.current[eventKey];
    setOptimisticOverrides((previous) => {
      const next = { ...previous };
      delete next[eventKey];
      return next;
    });
    updateWeeksForOptimisticMove(move, move.prevStart, move.prevEnd);
  }, [pendingOptimisticEventIdsRef, updateWeeksForOptimisticMove]);

  const cancelCalendarEventRequests = useCallback(() => {
    weekFetchSequenceRef.current += 1;
    weekFetchRequestByKeyRef.current = {};
    setWeekLoadingByKey({});
    setIsLoading(false);
  }, []);

  const fetchEventsForWeek = useCallback(async (start: Date, opts?: { silent?: boolean }) => {
    const normalizedStart = normalizeCalendarWeekStart(start);
    const weekKey = getCalendarWeekKey(normalizedStart);
    const requestId = weekFetchSequenceRef.current + 1;
    weekFetchSequenceRef.current = requestId;
    weekFetchRequestByKeyRef.current[weekKey] = requestId;

    const hasCachedWeek = Object.prototype.hasOwnProperty.call(weekEventsByKeyRef.current, weekKey);
    if (!hasCachedWeek) {
      if (!opts?.silent && weekKey === getCalendarWeekKey(weekStartRef.current)) setIsLoading(true);
      setWeekLoadingByKey((previous) => ({ ...previous, [weekKey]: true }));
    }

    const end = addDays(normalizedStart, 7);

    try {
      await extendEventSeries(end).catch(() => {});
      const localEvents = await database.collections
        .get('events')
        .query(
          Q.where('start_date', Q.lt(end.getTime())),
          Q.where('end_date', Q.gt(normalizedStart.getTime()))
        )
        .fetch() as EventModel[];

      if (weekFetchRequestByKeyRef.current[weekKey] !== requestId) {
        return;
      }

      const shouldFetchGoogleEvents = !isTokenLoading && isGoogleConnected;
      const localSorted = [...localEvents].sort(
        (a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      ) as EventModel[];

      if (!shouldFetchGoogleEvents || !hasCachedWeek) {
        commitWeekEvents(weekKey, applyPendingMovesToWeek(weekKey, normalizedStart, localSorted));
        setWeekLoadingByKey((previous) =>
          previous[weekKey] ? { ...previous, [weekKey]: false } : previous
        );
      }

      if (!shouldFetchGoogleEvents) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
      const googleEvents = await fetchGoogleCalendarEvents(normalizedStart, end);
      if (!googleEvents) {
        return;
      }

      if (weekFetchRequestByKeyRef.current[weekKey] !== requestId) {
        return;
      }

      const byGoogleId: Record<string, any> = Object.create(null);
      for (const googleEvent of (googleEvents as any[])) byGoogleId[googleEvent.id] = googleEvent;
      const deletedLocalEventIds = new Set<string>();
      const linkedLocalEventsMissingFromGoogle = (localEvents as any[]).filter((localEvent: any) =>
        localEvent.googleEventId && !byGoogleId[String(localEvent.googleEventId)]
      );

      for (const localEvent of linkedLocalEventsMissingFromGoogle) {
        const googleEventId = String(localEvent.googleEventId || '');
        const status = await fetchGoogleCalendarEventStatus(googleEventId);
        if (status !== 'deleted') {
          continue;
        }

        deletedLocalEventIds.add(String(localEvent.id));
      }

      if (deletedLocalEventIds.size > 0) {
        void database.write(async () => {
          for (const localEventId of deletedLocalEventIds) {
            try {
              const rec = await database.get<EventModel>('events').find(localEventId);
              await rec.destroyPermanently();
            } catch {}
          }
        }).catch(() => {});
      }

      const activeLocalEvents = (localEvents as any[]).filter((localEvent: any) =>
        !deletedLocalEventIds.has(String(localEvent.id))
      );
      const newlyMatchedLinks: { id: string; googleEventId: string }[] = [];

      try {
        const usedGoogleIds = new Set<string>();
        for (const localEvent of activeLocalEvents) {
          if (localEvent.googleEventId) usedGoogleIds.add(String(localEvent.googleEventId));
        }
        const normalizeTitle = (value: any) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
        for (const localEvent of activeLocalEvents) {
          if (localEvent.googleEventId) continue;
          const localStart = new Date(localEvent.startDate).getTime();
          const localEnd = new Date(localEvent.endDate).getTime();
          const localTitle = normalizeTitle(localEvent.title);
          let matched: any = null;
          for (const googleEvent of (googleEvents as any[])) {
            const googleId = String(googleEvent.id);
            if (usedGoogleIds.has(googleId)) continue;
            const googleStart = new Date(googleEvent.startDate).getTime();
            const googleEnd = new Date(googleEvent.endDate).getTime();
            const timeClose = Math.abs(googleStart - localStart) <= 60000 && Math.abs(googleEnd - localEnd) <= 60000;
            if (!timeClose) continue;
            const googleTitle = normalizeTitle(googleEvent.title);
            const titleOk = localTitle && googleTitle ? localTitle === googleTitle : true;
            if (titleOk) {
              matched = googleEvent;
              break;
            }
          }
          if (matched) {
            (localEvent as any).googleEventId = matched.id;
            newlyMatchedLinks.push({
              id: String(localEvent.id),
              googleEventId: String(matched.id),
            });
            usedGoogleIds.add(String(matched.id));
          }
        }
      } catch {}

      const newOverrides: Record<string, { startDate: Date; endDate: Date }> = Object.create(null);
      for (const localEvent of activeLocalEvents) {
        const googleEvent = localEvent.googleEventId ? byGoogleId[localEvent.googleEventId] : undefined;
        if (googleEvent && googleEvent.startDate && googleEvent.endDate) {
          newOverrides[String(localEvent.id)] = {
            startDate: new Date(googleEvent.startDate),
            endDate: new Date(googleEvent.endDate),
          };
        }
      }

      setOptimisticOverrides((previous) => {
        const merged = { ...newOverrides };
        pendingOptimisticEventIdsRef.current.forEach((id) => {
          if (previous[id]) {
            merged[id] = previous[id];
          }
        });
        return merged;
      });

      const localWithOverlays = activeLocalEvents.map((localEvent: any) => {
        const googleEvent = localEvent.googleEventId ? byGoogleId[localEvent.googleEventId] : undefined;
        if (googleEvent) {
          const googleDetails = normalizeCalendarDetailsText(googleEvent.description);
          return {
            id: localEvent.id,
            title: typeof googleEvent.title === 'string' && googleEvent.title ? googleEvent.title : localEvent.title,
            details: googleDetails,
            startDate: googleEvent.startDate || localEvent.startDate,
            startTime: localEvent.startTime,
            endDate: googleEvent.endDate || localEvent.endDate,
            endTime: localEvent.endTime,
            createdAt: localEvent.createdAt,
            updatedAt: localEvent.updatedAt,
            googleEventId: localEvent.googleEventId,
            isGoogleEvent: localEvent.isGoogleEvent,
            isTodo: localEvent.isTodo,
            location: localEvent.location,
            latitude: localEvent.latitude,
            longitude: localEvent.longitude,
            isAllDay: googleEvent.isAllDay === true,
            editable: googleEvent.editable,
          };
        }
        return localEvent;
      });

      const titlesToPersist = activeLocalEvents.filter((localEvent: any) => {
        const googleEvent = localEvent.googleEventId ? byGoogleId[localEvent.googleEventId] : undefined;
        return googleEvent && typeof googleEvent.title === 'string' && googleEvent.title && googleEvent.title !== localEvent.title;
      });
      const detailsToPersist = activeLocalEvents.filter((localEvent: any) => {
        const googleEvent = localEvent.googleEventId ? byGoogleId[localEvent.googleEventId] : undefined;
        if (!googleEvent) return false;
        return normalizeCalendarDetailsText(localEvent.details) !== normalizeCalendarDetailsText(googleEvent.description);
      });

      if (newlyMatchedLinks.length || titlesToPersist.length || detailsToPersist.length) {
        setTimeout(() => {
          void database.write(async () => {
            for (const link of newlyMatchedLinks) {
              try {
                const rec = await database.get<EventModel>('events').find(link.id);
                await rec.update((record: any) => { record.googleEventId = link.googleEventId; });
              } catch {}
            }
            for (const localEvent of titlesToPersist) {
              try {
                const rec = await database.get<EventModel>('events').find(localEvent.id);
                await rec.update((record) => {
                  // @ts-ignore
                  record.title = byGoogleId[localEvent.googleEventId].title;
                });
              } catch {}
            }
            for (const localEvent of detailsToPersist) {
              try {
                const rec = await database.get<EventModel>('events').find(localEvent.id);
                await rec.update((record) => {
                  record.details = normalizeCalendarDetailsText(byGoogleId[localEvent.googleEventId]?.description);
                });
              } catch {}
            }
          }).catch(() => {});
        }, 0);
      }

      const googleOnly = (googleEvents as any[]).filter((googleEvent: any) =>
        !activeLocalEvents.some((localEvent: any) => localEvent.googleEventId === googleEvent.id)
      );

      const makeKey = (event: any) => (event.isGoogleEvent ? event.id : event.googleEventId || event.id);
      const mergedPreferred = [...localWithOverlays, ...googleOnly];
      const seen = new Set<string>();
      const deduped = mergedPreferred.filter((event: any) => {
        const key = String(makeKey(event));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      deduped.sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      commitWeekEvents(weekKey, applyPendingMovesToWeek(weekKey, normalizedStart, deduped as any));
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      if (weekFetchRequestByKeyRef.current[weekKey] === requestId) {
        setWeekLoadingByKey((previous) =>
          previous[weekKey] ? { ...previous, [weekKey]: false } : previous
        );
        if (!hasCachedWeek && weekKey === getCalendarWeekKey(weekStartRef.current)) {
          setIsLoading(false);
        }
      }
    }
  }, [applyPendingMovesToWeek, commitWeekEvents, fetchGoogleCalendarEventStatus, fetchGoogleCalendarEvents, isGoogleConnected, isTokenLoading, weekStartRef]);

  const prefetchWeeksAround = useCallback((centerWeekStart: Date, opts?: { includeCenter?: boolean }) => {
    [-7, 0, 7].forEach((offset) => {
      if (!opts?.includeCenter && offset === 0) return;
      const start = addDays(centerWeekStart, offset);
      void fetchEventsForWeek(start, { silent: true });
    });
  }, [fetchEventsForWeek]);

  return {
    isLoading,
    events,
    weekEventsByKey,
    weekEventsByKeyRef,
    weekLoadingByKey,
    optimisticOverrides,
    setOptimisticOverrides,
    pendingOptimisticEventIdsRef,
    applyOptimisticEventMove,
    confirmOptimisticEventMove,
    revertOptimisticEventMove,
    updateCurrentWeekEvents,
    fetchEventsForWeek,
    prefetchWeeksAround,
    cancelCalendarEventRequests,
  };
}
