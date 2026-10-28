import {
  buildGoalWishlistSuggestionsRequestBody,
  normalizeGoalWishlistSuggestionItemName,
  normalizeGoalWishlistSuggestionsResult,
  requestGoalWishlistSuggestions,
} from '@/lib/goalWishlistSuggestions';

jest.mock('@/firebaseConfig', () => ({
  auth: {
    currentUser: {
      uid: 'user-1',
      getIdToken: jest.fn(async () => 'token-1'),
    },
  },
}));

jest.mock('@/lib/aiDataSharingConsent', () => ({
  requireAiDataSharingConsent: jest.fn(async () => {}),
}));

describe('goal wishlist suggestions helper', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes item names, dedupes, and caps suggestions at three', () => {
    expect(normalizeGoalWishlistSuggestionItemName('  protein   powder ')).toBe('protein powder');
    expect(normalizeGoalWishlistSuggestionsResult({
      suggestions: [
        { itemName: '  Protein powder ', reason: ' Helps hit protein targets ', confidence: 0.9 },
        { itemName: 'the protein powder', reason: 'duplicate', confidence: 0.8 },
        { itemName: 'Resistance bands', confidence: 2 },
        { itemName: 'Workout gloves', confidence: -1 },
        { itemName: 'Water bottle', confidence: 0.7 },
      ],
    })).toEqual({
      suggestions: [
        { itemName: 'Protein powder', reason: 'Helps hit protein targets', confidence: 0.9 },
        { itemName: 'Resistance bands', confidence: 1 },
        { itemName: 'Workout gloves', confidence: 0 },
      ],
    });
  });

  it('returns empty suggestions for empty or invalid payloads', () => {
    expect(normalizeGoalWishlistSuggestionsResult(null)).toEqual({ suggestions: [] });
    expect(normalizeGoalWishlistSuggestionsResult({ suggestions: [] })).toEqual({ suggestions: [] });
    expect(normalizeGoalWishlistSuggestionsResult({
      suggestions: [
        { itemName: '', confidence: 0.8 },
        { reason: 'missing item', confidence: 0.9 },
      ],
    })).toEqual({ suggestions: [] });
  });

  it('builds a trimmed request body with supported goal context only', () => {
    expect(buildGoalWishlistSuggestionsRequestBody({
      goalTitle: 'Learn guitar',
      goalDetails: 'practice chords',
      timeframe: 'thisMonth',
      taskKind: 'skill',
    })).toEqual(expect.objectContaining({
      goalTitle: 'Learn guitar',
      goalDetails: 'practice chords',
      timeframe: 'thisMonth',
      taskKind: 'skill',
    }));

    expect(buildGoalWishlistSuggestionsRequestBody({
      goalTitle: 'Learn guitar',
      timeframe: 'nextWeek',
      taskKind: null,
    })).toEqual(expect.not.objectContaining({
      timeframe: expect.any(String),
      taskKind: expect.any(String),
    }));
  });

  it('sends goal context to the backend and normalizes the response', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          { itemName: '  guitar tuner ', confidence: 0.85 },
        ],
      }),
    } as Response);

    await expect(requestGoalWishlistSuggestions({
      goalTitle: ' Learn guitar ',
      goalDetails: 'practice chords',
      timeframe: 'thisMonth',
      taskKind: 'skill',
    })).resolves.toEqual({
      suggestions: [
        { itemName: 'guitar tuner', confidence: 0.85 },
      ],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(body).toEqual(expect.objectContaining({
      goalTitle: 'Learn guitar',
      goalDetails: 'practice chords',
      timeframe: 'thisMonth',
      taskKind: 'skill',
    }));
  });

  it('does not call the backend for an empty title', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(requestGoalWishlistSuggestions({
      goalTitle: '   ',
    })).resolves.toEqual({ suggestions: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
