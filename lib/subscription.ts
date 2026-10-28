import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { formatDailyLimit, type GuidanceFeature, type PlanLimits, type SubscriptionLimits } from '@/lib/subscriptionLimits';

export type SubscriptionPlanId = 'monthly' | 'yearly';

/**
 * The plans and their store product ids. Names, prices and periods come from
 * the App Store at runtime (lib/subscriptionProducts.ts).
 */
export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  title: string;
  /** Store product id; must match App Store Connect (group "Eazee Pro", 22404127), eazee_products.storekit and Play Console exactly. */
  productId: string;
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: 'monthly', title: 'Monthly', productId: 'com.eazee.subscription.pro.monthly' },
  { id: 'yearly', title: 'Yearly', productId: 'com.eazee.subscription.pro.yearly' },
];

export const DEFAULT_SUBSCRIPTION_PLAN_ID: SubscriptionPlanId = 'yearly';

export const getPlanIdForProduct = (productId?: string | null): SubscriptionPlanId | null =>
  SUBSCRIPTION_PLANS.find((plan) => plan.productId === productId)?.id ?? null;

export type SubscriptionTier = 'free' | 'pro';

/**
 * Server-backed AI capabilities, grouped by how they are billed rather than by
 * endpoint.
 */
export type AiFeatureKey =
  | 'aiChat'
  | 'aiChatToolResult'
  | 'aiChatTitle'
  | 'aiChatSummary'
  | 'voiceInput'
  | 'homeSuggestions'
  | 'dayPlanning'
  | 'guidance'
  | 'todoClassification'
  | 'recipeAndSkill'
  | 'wishlistIntent';

/** Capabilities Free never gets. Guidance has per-plan limits instead (see GUIDANCE_LIMITS_BY_FEATURE). */
export const PRO_ONLY_FEATURES: readonly AiFeatureKey[] = [
  'dayPlanning',
  'todoClassification',
];

/** The guidance allowances each guidance capability draws on; matches GUIDANCE_PATHS on the server. */
export const GUIDANCE_LIMITS_BY_FEATURE: Partial<Record<AiFeatureKey, readonly GuidanceFeature[]>> = {
  guidance: ['goalGuidance', 'taskGuidance', 'guidanceQuestions'],
  recipeAndSkill: ['recipeSkillGuide', 'guidanceQuestions'],
};

/**
 * Work that finishes a turn the user already spent an action on: the agent loop
 * posting a tool result back, and the automatic session title and summary. Never
 * charged and never refused - blocking these would strand an in-flight conversation
 * or quietly spend the allowance on something the user did not ask for.
 */
export const UNCHARGED_CHAT_FEATURES: readonly AiFeatureKey[] = ['aiChatToolResult', 'aiChatTitle', 'aiChatSummary'];

export const isProOnlyFeature = (feature: AiFeatureKey) => PRO_ONLY_FEATURES.includes(feature);

export const isUnchargedChatFeature = (feature: AiFeatureKey) =>
  UNCHARGED_CHAT_FEATURES.includes(feature);

/**
 * Counted against the daily AI actions, like the server's usage meter: not the
 * free follow-ups, voice (metered by minutes), Pro-only work, guidance (its own
 * limits) or home suggestions (limited by days).
 */
export const isChatMeteredFeature = (feature: AiFeatureKey) =>
  !isUnchargedChatFeature(feature)
  && !isProOnlyFeature(feature)
  && !GUIDANCE_LIMITS_BY_FEATURE[feature]
  && feature !== 'voiceInput'
  && feature !== 'homeSuggestions';

/** Free gets daily home suggestions on this many days per week. */
export const FREE_HOME_SUGGESTION_DAYS_PER_WEEK = 3;

/** Internal testing account that always gets Pro, with no purchase needed. */
export const UNLIMITED_ACCESS_EMAIL = 'developer_sandbox@eazee.ai';

export const hasUnlimitedAccess = (email?: string | null) =>
  String(email || '').trim().toLowerCase() === UNLIMITED_ACCESS_EMAIL;

const ANDROID_PACKAGE_NAME = 'com.eazee.ai';

/**
 * Apps cannot cancel store subscriptions themselves; Apple and Google require
 * users to do it in their store account, so the app links there.
 */
export function getManageSubscriptionUrl(planId: SubscriptionPlanId | null) {
  if (Platform.OS === 'ios') {
    return 'https://apps.apple.com/account/subscriptions';
  }
  const productId = SUBSCRIPTION_PLANS.find((plan) => plan.id === planId)?.productId;
  return productId
    ? `https://play.google.com/store/account/subscriptions?sku=${productId}&package=${ANDROID_PACKAGE_NAME}`
    : 'https://play.google.com/store/account/subscriptions';
}

export const SUBSCRIPTION_STORE_NAME = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';

/** The plan the sandbox account appears to have, so plan-specific screens can be tested. */
export const UNLIMITED_ACCESS_PLAN_ID: SubscriptionPlanId = 'yearly';

export type ComparisonValue = { kind: 'check' } | { kind: 'none' } | { kind: 'text'; label: string };

export type ComparisonRow = {
  icon:
    | 'text-box-outline'
    | 'google'
    | 'shimmer'
    | 'message-text-outline'
    | 'microphone-outline'
    | 'home-outline'
    | 'target'
    | 'calendar-check-outline'
    | 'play-circle-outline'
    | 'cart-outline';
  title: string;
  description: string;
  free: ComparisonValue;
  pro: ComparisonValue;
};

const guidanceValue = (limits: (number | null)[]): ComparisonValue => {
  if (limits.every((limit) => limit === 0)) return { kind: 'none' };
  // Say it, like the AI actions and Voice rows, rather than a tick that reads as "included".
  if (limits.every((limit) => limit === null)) return { kind: 'text', label: formatDailyLimit(null, '') };
  const daily = limits.filter((limit): limit is number => typeof limit === 'number' && limit > 0);
  return { kind: 'text', label: daily.length ? `Up to ${Math.max(...daily)} / day` : 'Unlimited' };
};

const allowanceValue = (limit: number | null, unit: string): ComparisonValue =>
  ({ kind: 'text', label: formatDailyLimit(limit, unit) });

/** The paywall's Free vs Pro table, from the limits the server enforces. */
export function buildPlanComparisonRows(limits: SubscriptionLimits): ComparisonRow[] {
  const goalAndTask = (plan: PlanLimits) => guidanceValue([plan.guidance.goalGuidance, plan.guidance.taskGuidance]);
  return [
    {
      icon: 'text-box-outline',
      title: 'Notes / todos / calendar / booking',
      description: 'Keep your life in one place',
      free: { kind: 'text', label: 'Unlimited' },
      pro: { kind: 'text', label: 'Unlimited' },
    },
    {
      icon: 'google',
      title: 'Google Calendar sync',
      description: 'Sync your events and stay on track',
      free: { kind: 'check' },
      pro: { kind: 'check' },
    },
    {
      icon: 'message-text-outline',
      title: 'AI Chat',
      description: 'Talk with Eazee as much as you like',
      free: { kind: 'text', label: 'Unlimited' },
      pro: { kind: 'text', label: 'Unlimited' },
    },
    {
      icon: 'shimmer',
      title: 'AI actions',
      description: 'Eazee adds, changes or deletes items for you',
      free: allowanceValue(limits.free.aiActionsPerDay, '/ day'),
      pro: allowanceValue(limits.pro.aiActionsPerDay, '/ day'),
    },
    {
      icon: 'microphone-outline',
      title: 'Voice input',
      description: 'Speak naturally, get things done',
      free: allowanceValue(limits.free.voiceMinutesPerDay, 'min / day'),
      pro: allowanceValue(limits.pro.voiceMinutesPerDay, 'min / day'),
    },
    {
      icon: 'home-outline',
      title: 'Daily home suggestions',
      description: 'Personalized ideas to improve your day',
      free: { kind: 'text', label: `${FREE_HOME_SUGGESTION_DAYS_PER_WEEK} days / week` },
      pro: { kind: 'text', label: 'Every day' },
    },
    {
      icon: 'target',
      title: 'Goal & task guidance',
      description: 'Plan smarter with AI',
      free: goalAndTask(limits.free),
      pro: goalAndTask(limits.pro),
    },
    {
      icon: 'calendar-check-outline',
      title: 'Automatic planning & todo classification',
      description: 'Let AI organize your day and tasks',
      free: { kind: 'none' },
      pro: { kind: 'check' },
    },
    {
      icon: 'play-circle-outline',
      title: 'Recipe & skill generation, video lookup',
      description: 'Find recipes, learn new skills',
      free: guidanceValue([limits.free.guidance.recipeSkillGuide]),
      pro: guidanceValue([limits.pro.guidance.recipeSkillGuide]),
    },
    {
      icon: 'cart-outline',
      title: 'Wishlist purchase intent',
      description: 'Save ideas and get smart shopping help',
      free: { kind: 'check' },
      pro: { kind: 'check' },
    },
  ];
}

export type SubscriptionState = 'none' | 'active' | 'cancelled' | 'billing_retry' | 'expired' | 'refunded';

export type SubscriptionStatus = {
  isPro: boolean;
  planId: SubscriptionPlanId | null;
  /** Epoch ms the entitlement was last confirmed by the store or backend. */
  verifiedAt: number | null;
  /** From the server; absent in statuses cached by older builds. */
  state?: SubscriptionState;
  expiresAt?: number | null;
  autoRenew?: boolean | null;
  /** A plan change that takes effect at the next renewal (a downgrade). */
  pendingPlanId?: SubscriptionPlanId | null;
};

export const FREE_SUBSCRIPTION_STATUS: SubscriptionStatus = {
  isPro: false,
  planId: null,
  verifiedAt: null,
};

export type BillingOutcome =
  | { status: 'success'; planId: SubscriptionPlanId }
  | { status: 'cancelled' }
  /** StoreKit has not reported a result yet, e.g. a downgrade that starts at renewal. */
  | { status: 'pending' }
  | { status: 'unavailable'; message: string };

const SUBSCRIPTION_STATUS_STORAGE_KEY = 'subscription:status:v1:';

const getStatusStorageKey = (userId: string) => `${SUBSCRIPTION_STATUS_STORAGE_KEY}${userId}`;

/**
 * Entitlement is cached per user so the app renders the right tier offline. The
 * store and the backend stay the source of truth - this is only ever refreshed
 * from a verified result.
 */
export async function readCachedSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  try {
    const stored = await AsyncStorage.getItem(getStatusStorageKey(userId));
    if (!stored) {
      return FREE_SUBSCRIPTION_STATUS;
    }

    const parsed = JSON.parse(stored) as Partial<SubscriptionStatus>;
    if (typeof parsed?.isPro !== 'boolean') {
      return FREE_SUBSCRIPTION_STATUS;
    }

    const asPlanId = (value: unknown) => (value === 'monthly' || value === 'yearly' ? value : null);
    return {
      isPro: parsed.isPro,
      planId: asPlanId(parsed.planId),
      verifiedAt: typeof parsed.verifiedAt === 'number' ? parsed.verifiedAt : null,
      state: parsed.state,
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : null,
      autoRenew: typeof parsed.autoRenew === 'boolean' ? parsed.autoRenew : null,
      pendingPlanId: asPlanId(parsed.pendingPlanId),
    };
  } catch {
    return FREE_SUBSCRIPTION_STATUS;
  }
}

export async function writeCachedSubscriptionStatus(userId: string, status: SubscriptionStatus) {
  try {
    await AsyncStorage.setItem(getStatusStorageKey(userId), JSON.stringify(status));
  } catch (error) {
    console.warn('Failed to cache subscription status', error);
  }
}

export async function clearCachedSubscriptionStatus(userId: string) {
  try {
    await AsyncStorage.removeItem(getStatusStorageKey(userId));
  } catch (error) {
    console.warn('Failed to clear subscription status', error);
  }
}
