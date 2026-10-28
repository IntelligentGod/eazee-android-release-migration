// These suites cover feature behaviour, not billing: run them as an entitled
// user so the Pro gate in lib/aiRequest does not short-circuit the requests.
jest.mock('@/lib/subscriptionUsage', () => ({
  ...jest.requireActual('@/lib/subscriptionUsage'),
  checkAiFeatureAccess: jest.fn(async () => ({ allowed: true })),
  recordAiAction: jest.fn(async () => {}),
  recordVoiceUsage: jest.fn(async () => {}),
}));
import {
  classifyTodoForCreate,
  normalizeGuidancePath,
  normalizeTodoTaskKind,
  requestGoalQuotaDateResolution,
  requestTodoClassification,
  shouldClassifyTodoWorkspace,
  shouldUseLegacyRecipeFallback,
} from '@/lib/todoClassification';

let mockCurrentUser: any = null;

jest.mock('@/firebaseConfig', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
}));

jest.mock('@/lib/aiDataSharingConsent', () => ({
  requireAiDataSharingConsent: jest.fn(async () => {}),
}));

describe('todo classification routing helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockCurrentUser = null;
  });

  it('normalizes supported task kinds and guidance paths', () => {
    expect(normalizeTodoTaskKind('normal')).toBe('normal');
    expect(normalizeTodoTaskKind('recipe')).toBe('recipe');
    expect(normalizeTodoTaskKind('skill')).toBe('skill');
    expect(normalizeTodoTaskKind('todo')).toBeNull();

    expect(normalizeGuidancePath('actions')).toBe('actions');
    expect(normalizeGuidancePath('video')).toBe('video');
    expect(normalizeGuidancePath('recipe')).toBeNull();
  });

  it('classifies only Personal and Goals workspaces', () => {
    expect(shouldClassifyTodoWorkspace('Personal')).toBe(true);
    expect(shouldClassifyTodoWorkspace('Goals')).toBe(true);
    expect(shouldClassifyTodoWorkspace('Wishlist')).toBe(false);
    expect(shouldClassifyTodoWorkspace('Other')).toBe(false);
  });

  it('keeps recipe regex fallback limited to legacy Personal rows', () => {
    expect(shouldUseLegacyRecipeFallback({ workspace: 'Personal', taskKind: null })).toBe(true);
    expect(shouldUseLegacyRecipeFallback({ workspace: 'Goals', taskKind: null })).toBe(false);
    expect(shouldUseLegacyRecipeFallback({ workspace: 'Personal', taskKind: 'recipe' })).toBe(false);
  });

  it('does not send background classification while signed out', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(requestTodoClassification({
      title: 'buy milk',
      workspace: 'Personal',
    })).rejects.toThrow('Sign in to use AI features.');

    const result = await classifyTodoForCreate({
      title: 'buy milk',
      workspace: 'Personal',
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends goal timeframe and maps quota metadata for Goals', async () => {
    mockCurrentUser = {
      uid: 'user-1',
      getIdToken: jest.fn().mockResolvedValue('token-1'),
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        kind: 'normal',
        confidence: 0.9,
        goalBehavior: 'quota',
        quota: {
          targetCount: 3,
          unitLabel: 'days',
          unitType: 'distinct_days',
        },
      }),
    } as Response);

    const result = await requestTodoClassification({
      title: 'fast 3 days',
      workspace: 'Goals',
      goalTimeframe: 'thisMonth',
    });
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));

    expect(headers.Authorization).toBe('Bearer token-1');
    expect(body.goalTimeframe).toBe('thisMonth');
    expect(result.goalBehavior).toMatchObject({
      kind: 'quota',
      targetCount: 3,
      completedCount: 0,
      unitLabel: 'days',
      unitType: 'distinct_days',
    });
  });

  it('sends quota goal title and maps AI date intent responses', async () => {
    mockCurrentUser = {
      uid: 'user-1',
      getIdToken: jest.fn().mockResolvedValue('token-1'),
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        intent: 'schedule_date',
        dateIso: '2026-05-09',
        label: 'May 9',
      }),
    } as Response);

    const result = await requestGoalQuotaDateResolution({
      text: 'tomorrow',
      goalTitle: 'Fast 3 days this month',
      userTimezone: 'Asia/Kolkata',
      locale: 'en-US',
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));

    expect(body).toMatchObject({
      text: 'tomorrow',
      goalTitle: 'Fast 3 days this month',
      userTimezone: 'Asia/Kolkata',
      locale: 'en-US',
    });
    expect(result).toEqual({
      intent: 'schedule_date',
      dateIso: new Date(2026, 4, 9).toISOString(),
      label: 'May 9',
      message: undefined,
    });
  });

  it('keeps backward compatibility with date-only quota resolver responses', async () => {
    mockCurrentUser = {
      uid: 'user-1',
      getIdToken: jest.fn().mockResolvedValue('token-1'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        dateIso: '2026-05-15',
      }),
    } as Response);

    const result = await requestGoalQuotaDateResolution({
      text: 'next Friday',
      userTimezone: 'Asia/Kolkata',
    });

    expect(result.intent).toBe('schedule_date');
    expect(result.dateIso).toBe(new Date(2026, 4, 15).toISOString());
  });

  it('downgrades schedule_date without a usable date to clarification', async () => {
    mockCurrentUser = {
      uid: 'user-1',
      getIdToken: jest.fn().mockResolvedValue('token-1'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        intent: 'schedule_date',
        message: 'Pick today or a future date.',
      }),
    } as Response);

    const result = await requestGoalQuotaDateResolution({
      text: 'yesterday',
      userTimezone: 'Asia/Kolkata',
    });

    expect(result).toEqual({
      intent: 'needs_clarification',
      dateIso: undefined,
      label: undefined,
      message: 'Pick today or a future date.',
    });
  });
});
