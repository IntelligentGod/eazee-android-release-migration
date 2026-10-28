import { SERVER_URL } from '@/config/backend';
import { auth } from '@/firebaseConfig';
import { getFirebaseAppCheckHeaders } from '@/lib/firebaseAppCheck';
import type { FirstChatIntent } from '@/lib/firstChatOnboarding';
import type { SavedPreferenceField } from '@/lib/aiSavedPreferences';

/**
 * First-chat onboarding events. Only these names and small enum or number
 * properties are sent, never chat text or goal text. Failures are ignored.
 */
export type FirstChatAnalyticsEvent =
  | 'welcome_shown'
  | 'starter_selected'
  | 'custom_request'
  | 'result_delivered'
  | 'result_used'
  | 'result_refined'
  | 'preference_saved'
  | 'preference_declined'
  | 'flow_left'
  | 'dismissed';

export type FirstChatAnalyticsProps = {
  intent?: FirstChatIntent;
  replies?: number;
  kind?: 'plan' | 'draft' | 'comparison' | 'first_step' | 'breakdown' | 'goal_plan'
    | 'draft_copied' | 'tasks_saved' | 'goal_saved' | 'schedule_confirmed';
  step?: 'welcome' | 'starter' | 'clarifying' | 'result';
  field?: SavedPreferenceField;
};

export function trackFirstChatEvent(event: FirstChatAnalyticsEvent, props: FirstChatAnalyticsProps = {}) {
  void (async () => {
    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    if (!idToken) return;
    await fetch(`${SERVER_URL}/analytics/first-chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        'X-Eazee-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        ...await getFirebaseAppCheckHeaders(),
      },
      body: JSON.stringify({ event, props: Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined)) }),
    });
  })().catch(() => {});
}
