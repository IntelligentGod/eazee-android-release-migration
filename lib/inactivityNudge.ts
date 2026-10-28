import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { database } from '@/database/database';
import TodoModel from '@/database/models/TodoModel';
import { configureTodoNotifications } from '@/lib/todoNotifications';

/** A fixed id, so scheduling again replaces the pending nudge instead of adding another. */
const INACTIVITY_NUDGE_ID = 'inactivity-nudge';
const INACTIVITY_NUDGE_CHANNEL_ID = 'inactivity-nudge';
export const INACTIVITY_NUDGE_DELAY_MS = 2 * 24 * 60 * 60_000;

const INACTIVITY_NUDGE_ENABLED_KEY = 'inactivityNudge:enabled:v1';

export type InactivityNudgeContent = { title: string; body: string };

/** The Settings switch for the 2-day check-in; on unless the user turned it off. */
export async function readInactivityNudgeEnabled() {
  const stored = await AsyncStorage.getItem(INACTIVITY_NUDGE_ENABLED_KEY).catch(() => null);
  return stored !== '0';
}

export async function writeInactivityNudgeEnabled(enabled: boolean) {
  await AsyncStorage.setItem(INACTIVITY_NUDGE_ENABLED_KEY, enabled ? '1' : '0').catch(() => {});
}

export function buildInactivityNudgeContent(dueTaskCount: number): InactivityNudgeContent {
  if (dueTaskCount === 0) {
    return {
      title: 'Your day is a blank page',
      body: 'Take a minute in Eazee to plan what comes next.',
    };
  }
  return {
    title: dueTaskCount === 1 ? '1 task is waiting for you' : `${dueTaskCount} tasks are waiting for you`,
    body: 'Open Eazee to catch up and keep your week on track.',
  };
}

/** Open tasks due or overdue by the time the nudge fires; undated ones count because the app lists them under Today. */
async function countTasksDueBy(date: Date) {
  const endOfNudgeDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return database
    .get<TodoModel>('todos')
    .query(
      Q.where('completed', false),
      Q.where('workspace', Q.notEq('Wishlist')),
      Q.or(Q.where('due_date', null), Q.where('due_date', Q.lt(endOfNudgeDay.getTime())))
    )
    .fetchCount();
}

export async function cancelInactivityNudge() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  await Notifications.cancelScheduledNotificationAsync(INACTIVITY_NUDGE_ID).catch(() => {});
}

/**
 * Pushes the nudge 2 days past the latest time the user was in the app. Called
 * whenever the app opens or goes to the background, so it only fires after a
 * real 2-day absence, and every absence gets its own nudge.
 */
export async function scheduleInactivityNudge() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  await cancelInactivityNudge();
  if (!(await readInactivityNudgeEnabled())) return;

  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) return;

  await configureTodoNotifications();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(INACTIVITY_NUDGE_CHANNEL_ID, {
      name: 'Check-in reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const fireDate = new Date(Date.now() + INACTIVITY_NUDGE_DELAY_MS);
  const content = buildInactivityNudgeContent(await countTasksDueBy(fireDate));
  await Notifications.scheduleNotificationAsync({
    identifier: INACTIVITY_NUDGE_ID,
    content: { ...content, sound: true, data: { kind: 'inactivity_nudge' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
      channelId: Platform.OS === 'android' ? INACTIVITY_NUDGE_CHANNEL_ID : undefined,
    } as Notifications.DateTriggerInput,
  });
}
