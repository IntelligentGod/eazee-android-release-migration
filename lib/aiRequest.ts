import { auth } from '@/firebaseConfig';
import { requireAiDataSharingConsent } from '@/lib/aiDataSharingConsent';
import { createAiAuthRequiredError } from '@/lib/aiAuth';
import { getFirebaseAppCheckHeaders } from '@/lib/firebaseAppCheck';
import { createSubscriptionRequiredError } from '@/lib/subscriptionAccess';
import { checkAiFeatureAccess, recordAiAction } from '@/lib/subscriptionUsage';
import { readCachedSubscriptionLimits } from '@/lib/subscriptionLimits';
import { isChatMeteredFeature, type AiFeatureKey } from '@/lib/subscription';
import { isTutorialDemoTitle } from '@/lib/tutorial';

/**
 * Every server-backed AI call funnels through here, so this is where the plan
 * is applied on the client: Pro-only capabilities are refused for Free, and
 * metered ones are counted against the daily allowance.
 *
 * This keeps the UI honest, it is not a security boundary - the client can be
 * modified. The backend must verify entitlement against the Firebase UID in the
 * ID token below before doing any paid work.
 */
export const getAiRequestHeaders = async (
  feature: AiFeatureKey = 'aiChat',
  options?: { guidanceTitle?: string }
) => {
  const user = auth.currentUser;
  if (!user?.uid) {
    throw createAiAuthRequiredError();
  }

  await requireAiDataSharingConsent(user.uid);

  // The tutorial's demo task and goal get guidance on every plan.
  const isTutorialDemo = isTutorialDemoTitle(options?.guidanceTitle);
  const decision = isTutorialDemo ? { allowed: true as const } : await checkAiFeatureAccess(user.uid, feature, user.email);
  if (!decision.allowed) {
    throw createSubscriptionRequiredError(decision, feature, await readCachedSubscriptionLimits(user.uid));
  }

  const firebaseIdToken = await user.getIdToken().catch(() => null);
  if (!firebaseIdToken) {
    throw createAiAuthRequiredError();
  }

  // Counted only once the request is cleared to go out, and only for what the
  // server counts as an AI action (see isChatMeteredFeature).
  if (isChatMeteredFeature(feature)) {
    await recordAiAction(user.uid);
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${firebaseIdToken}`,
    // The server meters free users per local day and lets titles and summaries through uncharged.
    'X-Eazee-Ai-Feature': feature,
    'X-Eazee-Timezone': getDeviceTimeZone(),
    ...await getFirebaseAppCheckHeaders(),
  };
};

export const getDeviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
