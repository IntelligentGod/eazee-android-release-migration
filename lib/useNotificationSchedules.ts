import { useEffect } from 'react';
import { AppState } from 'react-native';

import { database } from '@/database/database';
import { cancelScheduledEventReminders, syncEventReminders } from '@/lib/eventNotifications';
import { cancelInactivityNudge, scheduleInactivityNudge } from '@/lib/inactivityNudge';

const EVENT_CHANGE_SYNC_DELAY_MS = 1500;

const logError = (label: string) => (error: unknown) => console.warn(label, error);

/**
 * Keeps event reminders and the 2-day inactivity nudge scheduled for the
 * signed-in user. Scheduling only happens while the app runs, so it re-runs on
 * every open, on every trip to the background, and when local events change.
 */
export function useNotificationSchedules(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      void cancelScheduledEventReminders().catch(logError('Failed to cancel event reminders'));
      void cancelInactivityNudge().catch(logError('Failed to cancel inactivity nudge'));
      return;
    }

    const syncReminders = () => void syncEventReminders().catch(logError('Failed to sync event reminders'));
    const rescheduleNudge = () => void scheduleInactivityNudge().catch(logError('Failed to schedule inactivity nudge'));

    syncReminders();
    rescheduleNudge();

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncReminders();
        rescheduleNudge();
      } else if (state === 'background') {
        // Leaving is the latest moment the user was here; count due tasks as of now.
        rescheduleNudge();
      }
    });

    let eventChangeTimeout: ReturnType<typeof setTimeout> | null = null;
    const eventsSubscription = database.withChangesForTables(['events']).subscribe(() => {
      if (eventChangeTimeout) clearTimeout(eventChangeTimeout);
      eventChangeTimeout = setTimeout(syncReminders, EVENT_CHANGE_SYNC_DELAY_MS);
    });

    return () => {
      appStateSubscription.remove();
      eventsSubscription.unsubscribe();
      if (eventChangeTimeout) clearTimeout(eventChangeTimeout);
    };
  }, [enabled]);
}
