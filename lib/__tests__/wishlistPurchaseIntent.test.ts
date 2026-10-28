import {
  getWishlistPurchaseReferenceMessages,
  normalizeWishlistItemName,
  normalizeWishlistPurchaseIntentResult,
  requestWishlistPurchaseIntent,
  shouldRequestWishlistPurchaseIntent,
} from '@/lib/wishlistPurchaseIntent';

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

describe('wishlist purchase intent helper', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes true intent only when an item name is present', () => {
    expect(normalizeWishlistPurchaseIntentResult({
      hasPurchaseIntent: true,
      itemName: '  iphone   17 ',
      confidence: 0.95,
    })).toEqual({
      hasPurchaseIntent: true,
      itemName: 'iphone 17',
      confidence: 0.95,
    });

    expect(normalizeWishlistPurchaseIntentResult({
      hasPurchaseIntent: true,
      confidence: 0.5,
    })).toEqual({
      hasPurchaseIntent: false,
      confidence: 0.5,
    });
  });

  it('clamps invalid confidence values', () => {
    expect(normalizeWishlistPurchaseIntentResult({
      hasPurchaseIntent: false,
      confidence: 12,
    }).confidence).toBe(1);

    expect(normalizeWishlistPurchaseIntentResult({
      hasPurchaseIntent: false,
      confidence: -4,
    }).confidence).toBe(0);
  });

  it('normalizes obvious generic item typos', () => {
    expect(normalizeWishlistItemName('knif')).toBe('knife');
    expect(normalizeWishlistItemName('roller smates')).toBe('roller skates');
    expect(normalizeWishlistPurchaseIntentResult({
      hasPurchaseIntent: true,
      itemName: 'roller smates',
      confidence: 0.8,
    })).toEqual({
      hasPurchaseIntent: true,
      itemName: 'roller skates',
      confidence: 0.8,
    });
  });

  it('sends recent messages for referenced purchases', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        hasPurchaseIntent: true,
        itemName: 'Automate the Boring Stuff with Python',
        confidence: 0.9,
      }),
    } as Response);

    await requestWishlistPurchaseIntent({
      message: 'can I buy the first one',
      surface: 'skill',
      contextTitle: 'learn python',
      recentMessages: [
        {
          role: 'assistant',
          content: 'Try 1. Automate the Boring Stuff with Python 2. Python Crash Course',
        },
      ],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(body.recentMessages).toEqual([
      {
        role: 'assistant',
        content: 'Try 1. Automate the Boring Stuff with Python 2. Python Crash Course',
      },
    ]);
  });

  it('uses only the latest assistant message for ordinal references', async () => {
    expect(getWishlistPurchaseReferenceMessages([
      { role: 'assistant', content: 'Old list: 1. Automate the Boring Stuff with Python 2. Fluent Python' },
      { role: 'user', content: 'other recs' },
      { role: 'assistant', content: 'New list: 1. Python Crash Course 2. Head First Python' },
    ])).toEqual([
      { role: 'assistant', content: 'New list: 1. Python Crash Course 2. Head First Python' },
    ]);
  });

  it('does not send older assistant lists to the classifier', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        hasPurchaseIntent: true,
        itemName: 'Python Crash Course',
        confidence: 0.9,
      }),
    } as Response);

    await requestWishlistPurchaseIntent({
      message: 'add the first one',
      surface: 'skill',
      contextTitle: 'learn python',
      recentMessages: [
        { role: 'assistant', content: 'Old list: 1. Automate the Boring Stuff with Python' },
        { role: 'user', content: 'ask for other recs' },
        { role: 'assistant', content: 'New list: 1. Python Crash Course' },
      ],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(body.recentMessages).toEqual([
      { role: 'assistant', content: 'New list: 1. Python Crash Course' },
    ]);
  });

  it('skips classifier calls for recommendation-only wording', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(requestWishlistPurchaseIntent({
      message: 'give me three more python book recommendations',
      surface: 'skill',
      recentMessages: [
        { role: 'assistant', content: 'Add Automate the Boring Stuff with Python to Wishlist?' },
      ],
    })).resolves.toEqual({ hasPurchaseIntent: false, confidence: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only preflights explicit purchase or wishlist wording', () => {
    expect(shouldRequestWishlistPurchaseIntent('can I buy the first one')).toBe(true);
    expect(shouldRequestWishlistPurchaseIntent('add the first one')).toBe(true);
    expect(shouldRequestWishlistPurchaseIntent('i want to buy knif')).toBe(true);
    expect(shouldRequestWishlistPurchaseIntent('i want to buy roller smates')).toBe(true);
    expect(shouldRequestWishlistPurchaseIntent('add it to my wishlist')).toBe(true);
    expect(shouldRequestWishlistPurchaseIntent('give me 3 book recommendations')).toBe(false);
  });
});
