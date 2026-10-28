import type { AiFeatureKey } from '@/lib/subscription';
import { DEFAULT_SUBSCRIPTION_LIMITS, type SubscriptionLimits } from '@/lib/subscriptionLimits';
import type { AccessDecision } from '@/lib/subscriptionUsage';

export type SubscriptionRequiredReason =
  | 'proOnly'
  | 'aiActionsExhausted'
  | 'voiceExhausted'
  | 'notToday';

/** Worded like the server's refusals, with the free plan's current limits. */
export function getSubscriptionRequiredMessage(
  reason: SubscriptionRequiredReason,
  limits: SubscriptionLimits = DEFAULT_SUBSCRIPTION_LIMITS
) {
  switch (reason) {
    case 'proOnly':
      return 'This is an Eazee Pro feature. Upgrade to turn it on.';
    case 'aiActionsExhausted':
      return `You have used today's ${limits.free.chatMessagesPerDay ?? 0} free AI actions. They reset tomorrow, or upgrade to Eazee Pro for more.`;
    case 'voiceExhausted':
      return `You have used today's ${limits.free.voiceMinutesPerDay ?? 0} minutes of free voice input. It resets tomorrow, or upgrade to Eazee Pro for more.`;
    case 'notToday':
      return 'Eazee Pro gets daily suggestions every day. On the free plan they arrive a few days a week.';
  }
}

export class SubscriptionRequiredError extends Error {
  readonly reason: SubscriptionRequiredReason;
  readonly feature: AiFeatureKey;

  constructor(reason: SubscriptionRequiredReason, feature: AiFeatureKey, limits?: SubscriptionLimits) {
    super(getSubscriptionRequiredMessage(reason, limits));
    this.name = 'SubscriptionRequiredError';
    this.reason = reason;
    this.feature = feature;
  }
}

export const createSubscriptionRequiredError = (
  decision: Extract<AccessDecision, { allowed: false }>,
  feature: AiFeatureKey,
  limits?: SubscriptionLimits
) => new SubscriptionRequiredError(decision.reason, feature, limits);

/** Whether a stored error message says the feature needs Eazee Pro (app or server wording). */
export const isProRequiredMessage = (message: unknown) => {
  const text = typeof message === 'string' ? message.trim() : '';
  return text === getSubscriptionRequiredMessage('proOnly') || text === 'Eazee Pro required';
};

export const isSubscriptionRequiredError = (error: unknown): error is SubscriptionRequiredError =>
  error instanceof SubscriptionRequiredError
  || (error as any)?.name === 'SubscriptionRequiredError';
