import { formToLimits, limitsToForm } from '@/lib/adminLimitsForm';
import { DEFAULT_SUBSCRIPTION_LIMITS } from '@/lib/subscriptionLimits';

describe('admin limits form', () => {
  it('round-trips the limits, with unlimited as an empty field', () => {
    const form = limitsToForm(DEFAULT_SUBSCRIPTION_LIMITS);
    expect(form.free.aiActionsPerDay).toBe('8');
    expect(form.pro.aiActionsPerDay).toBe('');
    expect(Object.keys(form.free)).toEqual(['aiActionsPerDay']);
    expect(formToLimits(form)).toEqual({ limits: DEFAULT_SUBSCRIPTION_LIMITS });
  });

  it('reads edited fields as numbers, and empty as unlimited', () => {
    const form = limitsToForm(DEFAULT_SUBSCRIPTION_LIMITS);
    form.free.aiActionsPerDay = ' 12 ';
    form.pro.aiActionsPerDay = '500';

    const result = formToLimits(form);
    expect('limits' in result && result.limits.free.aiActionsPerDay).toBe(12);
    expect('limits' in result && result.limits.pro.aiActionsPerDay).toBe(500);
    expect('limits' in result && result.limits.free.guidance.goalGuidance).toBeNull();
    expect('limits' in result && result.limits.free.chatMessagesPerDay).toBeNull();
  });

  it('rejects anything that is not a whole number in range', () => {
    const form = limitsToForm(DEFAULT_SUBSCRIPTION_LIMITS);
    form.pro.aiActionsPerDay = '2.5';
    expect(formToLimits(form)).toEqual({ error: expect.stringContaining('Pro: AI actions') });
    form.pro.aiActionsPerDay = '100001';
    expect(formToLimits(form)).toEqual({ error: expect.stringContaining('Pro: AI actions') });
  });
});
