import { buildPlanComparisonRows } from '@/lib/subscription';
import { DEFAULT_SUBSCRIPTION_LIMITS, parseSubscriptionLimits } from '@/lib/subscriptionLimits';
import {
  describeSubscriptionStatus,
  formatPrice,
  formatSubscriptionDate,
} from '@/lib/subscriptionStatusText';

const NOW = Date.UTC(2026, 9, 1);
const EXPIRES = Date.UTC(2026, 10, 12);

describe('describeSubscriptionStatus', () => {
  const base = { isPro: true, planId: 'yearly' as const, verifiedAt: NOW, expiresAt: EXPIRES };

  it('says when a cancelled subscription stays active until', () => {
    expect(describeSubscriptionStatus({ ...base, state: 'cancelled', autoRenew: false }, NOW))
      .toBe(`Cancelled, active until ${formatSubscriptionDate(EXPIRES)}`);
  });

  it('shows the renewal date, or a downgrade due at renewal', () => {
    expect(describeSubscriptionStatus({ ...base, state: 'active' }, NOW)).toBe(`Renews ${formatSubscriptionDate(EXPIRES)}`);
    expect(describeSubscriptionStatus({ ...base, state: 'active', pendingPlanId: 'monthly' }, NOW))
      .toBe(`Switches to Monthly on ${formatSubscriptionDate(EXPIRES)}`);
  });

  it('reads a passed expiry as expired even if the cached state is older', () => {
    expect(describeSubscriptionStatus({ ...base, state: 'cancelled' }, EXPIRES + 1))
      .toBe(`Expired on ${formatSubscriptionDate(EXPIRES)}`);
    expect(describeSubscriptionStatus({ ...base, state: undefined }, NOW)).toBeNull();
  });
});

describe('formatPrice', () => {
  it('formats a price in its currency, and a free trial as such', () => {
    expect(formatPrice(9.99, 'USD')).toMatch(/9\.99/);
    expect(formatPrice(0, 'USD')).toBe('Free trial');
    expect(formatPrice(9.99, 'USD', true)).toBe('Free trial');
    expect(formatPrice(null, null)).toBe('-');
  });
});

describe('plan comparison table', () => {
  const rowFor = (title: string, limits = DEFAULT_SUBSCRIPTION_LIMITS) =>
    buildPlanComparisonRows(limits).find((row) => row.title === title)!;

  it('shows AI chat as unlimited and the AI actions the server reports', () => {
    expect(rowFor('AI Chat').free).toEqual({ kind: 'text', label: 'Unlimited' });
    expect(rowFor('AI actions').free).toEqual({ kind: 'text', label: '8 / day' });
    expect(rowFor('AI actions').pro).toEqual({ kind: 'text', label: 'Unlimited\n(fair use)' });
    const limits = { ...DEFAULT_SUBSCRIPTION_LIMITS, free: { ...DEFAULT_SUBSCRIPTION_LIMITS.free, aiActionsPerDay: 12 } };
    expect(rowFor('AI actions', limits).free).toEqual({ kind: 'text', label: '12 / day' });
  });

  it('shows guidance, recipes and skills on both plans, and automatic planning as Pro only', () => {
    for (const title of ['Goal & task guidance', 'Recipe & skill generation, video lookup']) {
      expect(rowFor(title).free).toEqual({ kind: 'text', label: 'Unlimited\n(fair use)' });
      expect(rowFor(title).pro).toEqual({ kind: 'text', label: 'Unlimited\n(fair use)' });
    }
    expect(rowFor('Automatic planning & todo classification').free).toEqual({ kind: 'none' });
    expect(rowFor('Google Calendar sync').free).toEqual({ kind: 'check' });
    expect(rowFor('Daily home suggestions').free).toEqual({ kind: 'text', label: '3 days / week' });
  });
});

describe('parseSubscriptionLimits', () => {
  it('accepts the server shape and rejects anything incomplete', () => {
    expect(parseSubscriptionLimits(DEFAULT_SUBSCRIPTION_LIMITS)).toEqual(DEFAULT_SUBSCRIPTION_LIMITS);
    expect(parseSubscriptionLimits({ free: DEFAULT_SUBSCRIPTION_LIMITS.free })).toBeNull();
    expect(parseSubscriptionLimits({ ...DEFAULT_SUBSCRIPTION_LIMITS, pro: { ...DEFAULT_SUBSCRIPTION_LIMITS.pro, chatMessagesPerDay: -1 } })).toBeNull();
  });

  it('gives limits saved before AI actions existed the default allowance', () => {
    const { aiActionsPerDay: _free, ...oldFree } = DEFAULT_SUBSCRIPTION_LIMITS.free;
    const { aiActionsPerDay: _pro, ...oldPro } = DEFAULT_SUBSCRIPTION_LIMITS.pro;
    const parsed = parseSubscriptionLimits({ free: { ...oldFree, guidance: { goalGuidance: 0, taskGuidance: 0, recipeSkillGuide: 0, guidanceQuestions: 0 } }, pro: oldPro });
    expect(parsed?.free.aiActionsPerDay).toBe(8);
    expect(parsed?.pro.aiActionsPerDay).toBeNull();
    expect(parsed?.free.guidance.goalGuidance).toBeNull();
  });
});
