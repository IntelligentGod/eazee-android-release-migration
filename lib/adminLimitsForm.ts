import type { PlanLimits, SubscriptionLimits } from '@/lib/subscriptionLimits';

/**
 * AI chat, voice input and guidance are unlimited on every plan, so only the AI actions
 * limit (items Eazee creates, changes or deletes per day) is set here.
 */
export type LimitField = 'aiActionsPerDay';
export type LimitsForm = Record<'free' | 'pro', Record<LimitField, string>>;

export const LIMIT_FIELDS: { field: LimitField; label: string; unit: string }[] = [
  { field: 'aiActionsPerDay', label: 'AI actions', unit: 'items per day' },
];

const MAX_LIMIT = 100_000;

const UNLIMITED_GUIDANCE: PlanLimits['guidance'] = { goalGuidance: null, taskGuidance: null, recipeSkillGuide: null, guidanceQuestions: null };

/** An empty field means unlimited. */
const toText = (value: number | null) => (value === null ? '' : String(value));

export function limitsToForm(limits: SubscriptionLimits): LimitsForm {
  const plan = (limits: PlanLimits) => Object.fromEntries(LIMIT_FIELDS.map(({ field }) => [
    field,
    toText(limits[field]),
  ])) as Record<LimitField, string>;
  return { free: plan(limits.free), pro: plan(limits.pro) };
}

/** Whole numbers from 0 up; empty for unlimited. */
export function formToLimits(form: LimitsForm): { limits: SubscriptionLimits } | { error: string } {
  const result: Partial<SubscriptionLimits> = {};
  for (const tier of ['free', 'pro'] as const) {
    const values: Partial<Record<LimitField, number | null>> = {};
    for (const { field, label } of LIMIT_FIELDS) {
      const text = form[tier][field].trim();
      if (text === '') {
        values[field] = null;
        continue;
      }
      if (!/^\d+$/.test(text) || Number(text) > MAX_LIMIT) {
        return { error: `${tier === 'free' ? 'Free' : 'Pro'}: ${label} must be a whole number from 0 to ${MAX_LIMIT}, or empty for unlimited.` };
      }
      values[field] = Number(text);
    }
    result[tier] = {
      chatMessagesPerDay: null,
      voiceMinutesPerDay: null,
      aiActionsPerDay: values.aiActionsPerDay ?? null,
      guidance: UNLIMITED_GUIDANCE,
    };
  }
  return { limits: result as SubscriptionLimits };
}
