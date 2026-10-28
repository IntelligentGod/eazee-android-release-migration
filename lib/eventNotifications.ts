import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { Q } from '@nozbe/watermelondb';
import { database } from '@/database/database';
import type EventModel from '@/database/models/EventModel';
import type TodoModel from '@/database/models/TodoModel';
import { fetchCalendarEventsInRange } from '@/lib/calendarRange';
import { canScheduleTodoReminder } from '@/utils/todoReminders';
import { configureTodoNotifications } from '@/lib/todoNotifications';

export const EVENT_REMINDER_MINUTE_OPTIONS = [5, 10, 15] as const;
export type EventReminderMinutes = (typeof EVENT_REMINDER_MINUTE_OPTIONS)[number];

export type EventReminderSettings = {
  /** null turns event reminders off. */
  minutesBefore: EventReminderMinutes | null;
};

export const DEFAULT_EVENT_REMINDER_SETTINGS: EventReminderSettings = { minutesBefore: 10 };

const EVENT_REMINDER_SETTINGS_KEY = 'eventReminders:settings:v1';
const EVENT_REMINDER_CHANNEL_ID = 'event-reminders';
const EVENT_REMINDER_KIND = 'event_reminder';
/** How far ahead reminders are scheduled; the app re-syncs every time it opens. */
const EVENT_REMINDER_LOOKAHEAD_DAYS = 7;
/** iOS keeps at most 64 pending notifications per app, shared with todo reminders. */
const MAX_SCHEDULED_EVENT_REMINDERS = 30;

export type ReminderEventInput = {
  id: string;
  title: string;
  startDate: Date;
  isAllDay: boolean;
  location?: string;
};

export type PlannedEventReminder = {
  eventId: string;
  triggerDate: Date;
  title: string;
  body: string;
};

/** A calendar event created from a todo ("Send to Calendar"), local or synced to Google. */
export type TodoCalendarCopy = ReminderEventInput & { localId: string; googleEventId?: string; sourceTodoId: string };

/**
 * The events that get the Event Reminder. A todo's calendar copy (local or on
 * Google) follows its todo: when the todo has its own reminder, that reminder
 * wins and the event gets none; without one, the event gets the Event Reminder.
 */
export function selectEventsForReminders(
  events: ReminderEventInput[],
  todoCopies: TodoCalendarCopy[],
  todoHasReminder: (todoId: string) => boolean
): ReminderEventInput[] {
  const copyByEventId = new Map<string, TodoCalendarCopy>();
  for (const copy of todoCopies) {
    copyByEventId.set(copy.localId, copy);
    if (copy.googleEventId) copyByEventId.set(copy.googleEventId, copy);
  }
  const keep = (eventId: string) => {
    const copy = copyByEventId.get(eventId);
    return !copy || !todoHasReminder(copy.sourceTodoId);
  };

  const selected = events.filter((event) => keep(event.id));
  const listedIds = new Set(events.map((event) => event.id));
  // Copies only on this device (or not returned by Google) are added from the local rows.
  for (const copy of todoCopies) {
    const id = copy.googleEventId || copy.localId;
    if (listedIds.has(id) || listedIds.has(copy.localId) || !keep(id)) continue;
    listedIds.add(id);
    selected.push({ id, title: copy.title, startDate: copy.startDate, isAllDay: false, location: copy.location });
  }
  return selected;
}

/** Calendar copies of todos starting in [start, end), with whether each todo has its own reminder. */
async function loadTodoCalendarCopies(start: Date, end: Date) {
  const rows = await database.collections
    .get<EventModel>('events')
    .query(Q.where('source_todo_id', Q.notEq(null)), Q.where('start_date', Q.gte(start.getTime())), Q.where('start_date', Q.lt(end.getTime())))
    .fetch();
  const copies: TodoCalendarCopy[] = rows
    .filter((row) => !!row.sourceTodoId)
    .map((row) => ({
      id: row.googleEventId || row.id,
      localId: row.id,
      googleEventId: row.googleEventId || undefined,
      sourceTodoId: row.sourceTodoId!,
      title: row.title,
      startDate: row.startDate,
      isAllDay: false,
      location: row.location,
    }));
  const todoIds = [...new Set(copies.map((copy) => copy.sourceTodoId))];
  const todos = todoIds.length
    ? await database.collections.get<TodoModel>('todos').query(Q.where('id', Q.oneOf(todoIds))).fetch()
    : [];
  const withReminder = new Set(todos.filter((todo) => canScheduleTodoReminder(todo)).map((todo) => todo.id));
  return { copies, todoHasReminder: (todoId: string) => withReminder.has(todoId) };
}

/** All-day events have no start time to count down from, so they get no reminder. */
export function planEventReminders(
  events: ReminderEventInput[],
  minutesBefore: EventReminderMinutes,
  now: Date
): PlannedEventReminder[] {
  return events
    .filter((event) => !event.isAllDay)
    .map((event) => ({ event, triggerDate: new Date(event.startDate.getTime() - minutesBefore * 60_000) }))
    .filter(({ triggerDate }) => triggerDate.getTime() > now.getTime())
    .sort((left, right) => left.triggerDate.getTime() - right.triggerDate.getTime())
    .slice(0, MAX_SCHEDULED_EVENT_REMINDERS)
    .map(({ event, triggerDate }) => ({
      eventId: event.id,
      triggerDate,
      title: event.title.trim() || 'Upcoming event',
      body: `Starts in ${minutesBefore} minutes${event.location?.trim() ? ` · ${event.location.trim()}` : ''}`,
    }));
}

export async function readEventReminderSettings(): Promise<EventReminderSettings> {
  try {
    const stored = await AsyncStorage.getItem(EVENT_REMINDER_SETTINGS_KEY);
    if (!stored) return DEFAULT_EVENT_REMINDER_SETTINGS;
    const minutesBefore = JSON.parse(stored)?.minutesBefore;
    return {
      minutesBefore: EVENT_REMINDER_MINUTE_OPTIONS.includes(minutesBefore) ? minutesBefore : null,
    };
  } catch {
    return DEFAULT_EVENT_REMINDER_SETTINGS;
  }
}

export async function writeEventReminderSettings(settings: EventReminderSettings) {
  try {
    await AsyncStorage.setItem(EVENT_REMINDER_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save event reminder settings', error);
  }
}

export async function cancelScheduledEventReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((notification) => notification.content.data?.kind === EVENT_REMINDER_KIND)
      .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier))
  );
}

let syncInFlight: Promise<void> | null = null;
let syncRequestedDuringFlight = false;

/**
 * Replaces every scheduled event reminder with a fresh set for the next week of
 * local and Google Calendar events. Safe to call often; overlapping calls are merged.
 */
export function syncEventReminders(): Promise<void> {
  if (syncInFlight) {
    syncRequestedDuringFlight = true;
    return syncInFlight;
  }

  syncInFlight = (async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

    const { minutesBefore } = await readEventReminderSettings();
    await cancelScheduledEventReminders();
    if (!minutesBefore) return;

    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) return;

    await configureTodoNotifications();
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(EVENT_REMINDER_CHANNEL_ID, {
        name: 'Event reminders',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    const now = new Date();
    const end = new Date(now.getTime() + EVENT_REMINDER_LOOKAHEAD_DAYS * 24 * 60 * 60_000);
    const [calendarEvents, todoCopies] = await Promise.all([
      fetchCalendarEventsInRange(now, end),
      loadTodoCalendarCopies(now, end),
    ]);
    const events = selectEventsForReminders(calendarEvents, todoCopies.copies, todoCopies.todoHasReminder);

    for (const reminder of planEventReminders(events, minutesBefore, now)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: reminder.title,
          body: reminder.body,
          sound: true,
          data: { kind: EVENT_REMINDER_KIND, eventId: reminder.eventId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.triggerDate,
          channelId: Platform.OS === 'android' ? EVENT_REMINDER_CHANNEL_ID : undefined,
        } as Notifications.DateTriggerInput,
      });
    }
  })().finally(() => {
    syncInFlight = null;
    if (syncRequestedDuringFlight) {
      syncRequestedDuringFlight = false;
      void syncEventReminders();
    }
  });

  return syncInFlight;
}
