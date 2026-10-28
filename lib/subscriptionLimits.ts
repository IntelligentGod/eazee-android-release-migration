import AsyncStorage from '@react-native-async-storage/async-storage';

/** Guidance features with their own daily allowance; matches GUIDANCE_FEATURES on the server. */
export type GuidanceFeature = 'goalGuidance' | 'taskGuidance' | 'recipeSkillGuide' | 'guidanceQuestions';

/** null means unlimited. */
export type PlanLimits = {
  chatMessagesPerDay: number | null;
  voiceMinutesPerDay: number | null;
  /** Items Eazee may create, change or delete per day (lib/aiActions.ts). */
  aiActionsPerDay: number | null;
  guidance: Record<GuidanceFeature, number | null>;
};

/** Free AI actions per day; matches FREE_AI_ACTIONS_PER_DAY on the server. */
export const FREE_AI_ACTIONS_PER_DAY = 8;

const UNLIMITED_GUIDANCE: PlanLimits['guidance'] = { goalGuidance: null, taskGuidance: null, recipeSkillGuide: null, guidanceQuestions: null };

export type SubscriptionLimits = { free: PlanLimits; pro: PlanLimits };

/**
 * Only used until the server has answered once, or when it cannot be reached.
 * The server reads the real limits from Firestore (config/subscription), and an
 * admin can change them without an app release.
 */
export const DEFAULT_SUBSCRIPTION_LIMITS: SubscriptionLimits = {
  free: {
    chatMessagesPerDay: null,
    voiceMinutesPerDay: null,
    aiActionsPerDay: FREE_AI_ACTIONS_PER_DAY,
    guidance: UNLIMITED_GUIDANCE,
  },
  pro: {
    chatMessagesPerDay: null,
    voiceMinutesPerDay: null,
    aiActionsPerDay: null,
    guidance: UNLIMITED_GUIDANCE,
  },
};

export const GUIDANCE_FEATURE_LABELS: Record<GuidanceFeature, string> = {
  goalGuidance: 'Goal guidance',
  taskGuidance: 'Task guidance',
  recipeSkillGuide: 'Recipe and skill guides',
  guidanceQuestions: 'Questions about a guide',
};

const isLimit = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0);

function parsePlanLimits(value: unknown, defaultAiActions: number | null): PlanLimits | null {
  const plan = value as Partial<PlanLimits> | undefined;
  const guidance = plan?.guidance as Partial<PlanLimits['guidance']> | undefined;
  if (!plan || !isLimit(plan.chatMessagesPerDay) || !isLimit(plan.voiceMinutesPerDay) || !guidance) return null;
  const features: GuidanceFeature[] = ['goalGuidance', 'taskGuidance', 'recipeSkillGuide', 'guidanceQuestions'];
  if (!features.every((feature) => isLimit(guidance[feature]))) return null;
  // AI chat, voice input and guidance are unlimited on every plan, even in limits saved before that.
  return {
    chatMessagesPerDay: null,
    voiceMinutesPerDay: null,
    aiActionsPerDay: isLimit(plan.aiActionsPerDay) ? plan.aiActionsPerDay : defaultAiActions,
    guidance: UNLIMITED_GUIDANCE,
  };
}

export function parseSubscriptionLimits(value: unknown): SubscriptionLimits | null {
  const limits = value as Partial<SubscriptionLimits> | undefined;
  const free = parsePlanLimits(limits?.free, FREE_AI_ACTIONS_PER_DAY);
  const pro = parsePlanLimits(limits?.pro, null);
  return free && pro ? { free, pro } : null;
}

const LIMITS_STORAGE_KEY = 'subscription:limits:v1:';

export async function readCachedSubscriptionLimits(userId: string): Promise<SubscriptionLimits> {
  try {
    const stored = await AsyncStorage.getItem(`${LIMITS_STORAGE_KEY}${userId}`);
    return (stored && parseSubscriptionLimits(JSON.parse(stored))) || DEFAULT_SUBSCRIPTION_LIMITS;
  } catch {
    return DEFAULT_SUBSCRIPTION_LIMITS;
  }
}

export async function writeCachedSubscriptionLimits(userId: string, limits: SubscriptionLimits) {
  try {
    await AsyncStorage.setItem(`${LIMITS_STORAGE_KEY}${userId}`, JSON.stringify(limits));
  } catch (error) {
    console.warn('Failed to cache subscription limits', error);
  }
}

export const formatDailyLimit = (limit: number | null, unit: string) =>
  limit === null ? 'Unlimited\n(fair use)' : `${limit} ${unit}`;
