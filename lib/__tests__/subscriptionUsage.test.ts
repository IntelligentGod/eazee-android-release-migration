import {
  PRO_ONLY_FEATURES,
  UNCHARGED_CHAT_FEATURES,
  isProOnlyFeature,
  writeCachedSubscriptionStatus,
  type AiFeatureKey,
} from '@/lib/subscription';
import {
  EMPTY_DAILY_USAGE,
  checkAiFeatureAccess,
  decideAiFeatureAccess,
  getUsagePeriodKey,
  readDailyUsage,
  recordAiAction,
  recordVoiceUsage,
  type DailyUsage,
  mergeServerUsage,
} from '@/lib/subscriptionUsage';
import {
  DEFAULT_SUBSCRIPTION_LIMITS,
  writeCachedSubscriptionLimits,
  type PlanLimits,
} from '@/lib/subscriptionLimits';

// AI chat and voice input are unlimited on every plan; these stand for a heavy day of use.
const FREE_DAILY_AI_ACTIONS = 500;
const FREE_DAILY_VOICE_SECONDS = 600 * 60;

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    __reset: () => {
      store = {};
    },
  };
});

const storageMock = jest.requireMock('@react-native-async-storage/async-storage') as {
  __reset: () => void;
};

const usage = (overrides: Partial<DailyUsage> = {}): DailyUsage => ({
  ...EMPTY_DAILY_USAGE,
  ...overrides,
});

// A Sunday, which isHomeSuggestionDayForFree treats as a suggestion day.
const SUGGESTION_DAY = new Date(2026, 8, 20);

describe('plan entitlements', () => {
  describe('free tier', () => {
    it('never runs out of AI chat', () => {
      expect(decideAiFeatureAccess('free', 'aiChat', usage({ aiActions: 0 }))).toEqual({ allowed: true });
      expect(decideAiFeatureAccess('free', 'aiChat', usage({ aiActions: FREE_DAILY_AI_ACTIONS }))).toEqual({ allowed: true });
    });

    it('never runs out of voice input', () => {
      expect(decideAiFeatureAccess('free', 'voiceInput', usage({ voiceSeconds: FREE_DAILY_VOICE_SECONDS })))
        .toEqual({ allowed: true });
    });

    it('meters voice separately from chat actions', () => {
      expect(
        decideAiFeatureAccess('free', 'voiceInput', usage({ aiActions: FREE_DAILY_AI_ACTIONS }))
      ).toEqual({ allowed: true });
      expect(
        decideAiFeatureAccess('free', 'aiChat', usage({ voiceSeconds: FREE_DAILY_VOICE_SECONDS }))
      ).toEqual({ allowed: true });
    });

    it.each(PRO_ONLY_FEATURES)('refuses %s even with allowance left', (feature) => {
      expect(decideAiFeatureAccess('free', feature, usage())).toEqual({
        allowed: false,
        reason: 'proOnly',
      });
    });

    it('keeps wishlist purchase intent on the free plan', () => {
      expect(decideAiFeatureAccess('free', 'wishlistIntent', usage(), SUGGESTION_DAY)).toEqual({
        allowed: true,
      });
      expect(isProOnlyFeature('wishlistIntent')).toBe(false);
    });

    it('gives home suggestions on some days and not others', () => {
      const days = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
        const date = new Date(2026, 8, 20 + offset);
        return decideAiFeatureAccess('free', 'homeSuggestions', usage(), date).allowed;
      });

      expect(days.filter(Boolean).length).toBeGreaterThan(0);
      expect(days.filter((allowed) => !allowed).length).toBeGreaterThan(0);
    });

    // Refusing these would strand an agent turn mid-loop, or leave a session
    // untitled, after the user already paid for the turn.
    it.each(UNCHARGED_CHAT_FEATURES)('still allows %s once the allowance is spent', (feature) => {
      expect(
        decideAiFeatureAccess('free', feature, usage({ aiActions: FREE_DAILY_AI_ACTIONS }))
      ).toEqual({ allowed: true });
    });
  });

  describe('pro tier', () => {
    const allFeatures: AiFeatureKey[] = [
      'aiChat',
      'aiChatToolResult',
      'aiChatTitle',
      'voiceInput',
      'homeSuggestions',
      'wishlistIntent',
      ...PRO_ONLY_FEATURES,
    ];

    it.each(allFeatures)('allows %s regardless of usage', (feature) => {
      expect(
        decideAiFeatureAccess('pro', feature, usage({ aiActions: 9_999, voiceSeconds: 9_999 }))
      ).toEqual({ allowed: true });
    });
  });
});

describe('usage period', () => {
  it('buckets by calendar day so allowances reset overnight', () => {
    expect(getUsagePeriodKey(new Date(2026, 8, 18, 23, 59))).toBe('2026-09-18');
    expect(getUsagePeriodKey(new Date(2026, 8, 19, 0, 1))).toBe('2026-09-19');
    expect(getUsagePeriodKey(new Date(2026, 11, 5))).toBe('2026-12-05');
  });
});

describe('usage accounting', () => {
  beforeEach(() => {
    storageMock.__reset();
  });

  it('accumulates actions and voice seconds per user', async () => {
    await recordAiAction('user-1');
    await recordAiAction('user-1');
    await recordVoiceUsage('user-1', 42.4);

    await expect(readDailyUsage('user-1')).resolves.toEqual({ aiActions: 2, voiceSeconds: 42 });
  });

  it('keeps usage isolated between users', async () => {
    await recordAiAction('user-1');

    await expect(readDailyUsage('user-2')).resolves.toEqual(EMPTY_DAILY_USAGE);
  });

  it('ignores non-positive voice durations', async () => {
    await recordVoiceUsage('user-1', 0);
    await recordVoiceUsage('user-1', -5);

    await expect(readDailyUsage('user-1')).resolves.toEqual(EMPTY_DAILY_USAGE);
  });

  it('reads another day as empty so the allowance resets', async () => {
    await recordAiAction('user-1');

    await expect(readDailyUsage('user-1', '1999-01-01')).resolves.toEqual(EMPTY_DAILY_USAGE);
  });

  it('never blocks AI chat for a free user, however much they use', async () => {
    for (let i = 0; i < 50; i += 1) {
      await recordAiAction('user-1');
    }

    await expect(checkAiFeatureAccess('user-1', 'aiChat')).resolves.toEqual({ allowed: true });
  });

  it('unblocks the same user once they are on pro', async () => {
    for (let i = 0; i < FREE_DAILY_AI_ACTIONS; i += 1) {
      await recordAiAction('user-1');
    }
    await writeCachedSubscriptionStatus('user-1', {
      isPro: true,
      planId: 'yearly',
      verifiedAt: Date.now(),
    });

    await expect(checkAiFeatureAccess('user-1', 'aiChat')).resolves.toEqual({ allowed: true });
    await expect(checkAiFeatureAccess('user-1', 'guidance')).resolves.toEqual({ allowed: true });
  });

  it('treats only the developer sandbox account as pro without a purchase', async () => {
    await expect(
      checkAiFeatureAccess('user-1', 'guidance', ' Developer_Sandbox@eazee.ai ')
    ).resolves.toEqual({ allowed: true });
    await expect(checkAiFeatureAccess('user-1', 'dayPlanning', ' Developer_Sandbox@eazee.ai ')).resolves.toEqual({ allowed: true });
    await expect(checkAiFeatureAccess('user-1', 'dayPlanning', 'someone@eazee.ai')).resolves.toEqual({
      allowed: false,
      reason: 'proOnly',
    });
  });
});

describe('limits from the server', () => {
  const freeLimits = (overrides: Partial<PlanLimits> = {}): PlanLimits => ({
    ...DEFAULT_SUBSCRIPTION_LIMITS.free,
    ...overrides,
  });

  beforeEach(() => {
    storageMock.__reset();
  });

  it('applies the chat and voice limits it is given', () => {
    const limits = freeLimits({ chatMessagesPerDay: 2, voiceMinutesPerDay: 1 });
    expect(decideAiFeatureAccess('free', 'aiChat', usage({ aiActions: 1 }), SUGGESTION_DAY, limits)).toEqual({ allowed: true });
    expect(decideAiFeatureAccess('free', 'aiChat', usage({ aiActions: 2 }), SUGGESTION_DAY, limits))
      .toEqual({ allowed: false, reason: 'aiActionsExhausted' });
    expect(decideAiFeatureAccess('free', 'voiceInput', usage({ voiceSeconds: 60 }), SUGGESTION_DAY, limits))
      .toEqual({ allowed: false, reason: 'voiceExhausted' });
  });

  it('treats a null limit as unlimited, and applies a Pro fair-use limit when set', () => {
    expect(decideAiFeatureAccess('free', 'aiChat', usage({ aiActions: 999 }), SUGGESTION_DAY, freeLimits({ chatMessagesPerDay: null })))
      .toEqual({ allowed: true });
    const proLimits = { ...DEFAULT_SUBSCRIPTION_LIMITS.pro, chatMessagesPerDay: 200 };
    expect(decideAiFeatureAccess('pro', 'aiChat', usage({ aiActions: 200 }), SUGGESTION_DAY, proLimits))
      .toEqual({ allowed: false, reason: 'aiActionsExhausted' });
  });

  it('allows guidance, recipes and skills on free, even with an old limit of 0', () => {
    const oldLimits = freeLimits({ guidance: { goalGuidance: 0, taskGuidance: 0, recipeSkillGuide: 0, guidanceQuestions: 0 } });
    expect(decideAiFeatureAccess('free', 'guidance', usage(), SUGGESTION_DAY, oldLimits)).toEqual({ allowed: true });
    expect(decideAiFeatureAccess('free', 'recipeAndSkill', usage(), SUGGESTION_DAY, oldLimits)).toEqual({ allowed: true });
    expect(decideAiFeatureAccess('free', 'dayPlanning', usage(), SUGGESTION_DAY, oldLimits)).toEqual({ allowed: false, reason: 'proOnly' });
  });

  it('reads the cached limits when checking access, ignoring an old chat limit', async () => {
    await writeCachedSubscriptionLimits('user-1', {
      ...DEFAULT_SUBSCRIPTION_LIMITS,
      free: freeLimits({ chatMessagesPerDay: 1, guidance: { ...DEFAULT_SUBSCRIPTION_LIMITS.free.guidance, goalGuidance: 1 } }),
    });
    await recordAiAction('user-1');
    await recordAiAction('user-1');

    await expect(checkAiFeatureAccess('user-1', 'aiChat')).resolves.toEqual({ allowed: true });
    await expect(checkAiFeatureAccess('user-1', 'guidance')).resolves.toEqual({ allowed: true });
  });

  it('takes the server count when it is higher than the local one', async () => {
    await recordAiAction('user-1');
    await mergeServerUsage('user-1', { aiActions: 4, voiceSeconds: 0 });
    await expect(readDailyUsage('user-1')).resolves.toEqual({ aiActions: 4, voiceSeconds: 0 });

    await mergeServerUsage('user-1', { aiActions: 1 });
    await expect(readDailyUsage('user-1')).resolves.toEqual({ aiActions: 4, voiceSeconds: 0 });
  });
});
