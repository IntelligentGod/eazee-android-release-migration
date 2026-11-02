jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Linking: { openURL: jest.fn(async () => true) },
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { store.delete(key); }),
  };
});
jest.mock('@/config/backend', () => ({ SERVER_URL: 'https://api.test' }));
jest.mock('@/lib/firebaseAppCheck', () => ({ getFirebaseAppCheckHeaders: jest.fn(async () => ({})) }));
jest.mock('@/firebaseConfig', () => ({
  auth: { currentUser: { uid: 'user-1', getIdToken: jest.fn(async () => 'id-token') } },
}));

type Listener = (value: any) => void;
const mockListeners: { updated: Listener[]; error: Listener[] } = { updated: [], error: [] };

// What Google Play returns for a plan with a free-trial offer and its base plan.
const mockPlayProduct = (id: string, offers: Array<{ token: string; micros: string[] }>) => ({
  id,
  platform: 'android',
  subscriptionOffers: offers.map(({ token, micros }) => ({
    offerTokenAndroid: token,
    pricingPhasesAndroid: {
      pricingPhaseList: micros.map((priceAmountMicros) => ({ priceAmountMicros, billingPeriod: 'P1M', formattedPrice: '$9.99' })),
    },
  })),
});

jest.mock('expo-iap', () => ({
  initConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(async ({ skus }: { skus: string[] }) =>
    skus.map((id) => mockPlayProduct(id, [{ token: 'trial-offer', micros: ['0', '9990000'] }, { token: 'base-plan', micros: ['9990000'] }]))),
  requestPurchase: jest.fn(async () => null),
  finishTransaction: jest.fn(async () => undefined),
  getAvailablePurchases: jest.fn(async (): Promise<any[]> => []),
  restorePurchases: jest.fn(async () => undefined),
  purchaseUpdatedListener: (listener: Listener) => {
    mockListeners.updated.push(listener);
    return { remove: () => { mockListeners.updated = mockListeners.updated.filter((item) => item !== listener); } };
  },
  purchaseErrorListener: (listener: Listener) => {
    mockListeners.error.push(listener);
    return { remove: () => { mockListeners.error = mockListeners.error.filter((item) => item !== listener); } };
  },
  isUserCancelledError: (error: any) => error?.code === 'user-cancelled',
  getUserFriendlyErrorMessage: (error: any) => String(error?.message || ''),
}));

import { changeSubscriptionPlan, purchaseSubscription, syncStoreSubscriptionStatus } from '@/lib/storeBilling';
import { DEFAULT_SUBSCRIPTION_LIMITS } from '@/lib/subscriptionLimits';

const mockIap = jest.requireMock('expo-iap') as Record<string, jest.Mock>;
const YEARLY_SKU = 'com.eazee.subscription.pro.yearly';
const MONTHLY_SKU = 'com.eazee.subscription.pro.monthly';
const ACCOUNT_TOKEN = '11111111-2222-4333-8444-555555555555';
const flush = () => new Promise((resolve) => setImmediate(resolve));

const subscription = {
  isPro: true, isUnlimitedAccount: false, plan: 'yearly', state: 'active', productId: YEARLY_SKU,
  expiresAt: Date.now() + 86_400_000, autoRenew: true, pendingProductId: null, environment: 'Sandbox',
};
const fetchMock = jest.fn(async (url: string, _init?: { body?: string }) => {
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  if (url.endsWith('/subscriptions/apple/account-token')) return json({ appAccountToken: ACCOUNT_TOKEN });
  if (url.endsWith('/subscriptions/google/verify') || url.endsWith('/subscriptions/google/sync')) {
    return json({ isPro: true, planId: 'yearly', subscription });
  }
  if (url.endsWith('/subscriptions/status')) {
    const limits = DEFAULT_SUBSCRIPTION_LIMITS;
    return json({ subscription, limits, planLimits: limits.pro, usage: { aiActions: 0, voiceSeconds: 0 }, products: {} });
  }
  throw new Error(`unexpected ${url}`);
});
const bodyOf = (path: string) => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith(path));
  return call ? JSON.parse(call[1]!.body!) : null;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.updated = [];
  mockListeners.error = [];
  (global as any).fetch = fetchMock;
});

describe('Google Play purchases', () => {
  it('buys with the free-trial offer, stamped with this account, then verifies and acknowledges it', async () => {
    const result = purchaseSubscription('yearly');
    await flush();

    expect(mockIap.requestPurchase).toHaveBeenCalledWith({
      request: {
        google: {
          skus: [YEARLY_SKU],
          obfuscatedAccountId: ACCOUNT_TOKEN,
          subscriptionOffers: [{ sku: YEARLY_SKU, offerToken: 'trial-offer' }],
        },
      },
      type: 'subs',
    });
    mockListeners.updated.forEach((listener) =>
      listener({ id: 'GPA.1', productId: YEARLY_SKU, purchaseToken: 'play-token', purchaseState: 'purchased' }));

    await expect(result).resolves.toEqual({ status: 'success', planId: 'yearly' });
    expect(bodyOf('/subscriptions/google/verify')).toEqual({ purchaseToken: 'play-token' });
    expect(mockIap.finishTransaction).toHaveBeenCalledWith(expect.objectContaining({ isConsumable: false }));
  });

  it('waits for a purchase that is not paid yet instead of verifying it', async () => {
    const result = purchaseSubscription('monthly');
    await flush();
    mockListeners.updated.forEach((listener) =>
      listener({ id: 'GPA.2', productId: MONTHLY_SKU, purchaseToken: 'pending-token', purchaseState: 'pending' }));

    await expect(result).resolves.toEqual({ status: 'pending' });
    expect(bodyOf('/subscriptions/google/verify')).toBeNull();
    expect(mockIap.finishTransaction).not.toHaveBeenCalled();
  });

  it('replaces the current plan: an upgrade at once, a downgrade at renewal', async () => {
    mockIap.getAvailablePurchases.mockResolvedValue([
      { productId: MONTHLY_SKU, purchaseToken: 'monthly-token', purchaseState: 'purchased' },
    ]);
    const cancel = () => mockListeners.error.forEach((listener) => listener({ code: 'user-cancelled' }));
    const upgrade = changeSubscriptionPlan('monthly', 'yearly');
    await flush();
    expect(mockIap.requestPurchase.mock.calls[0][0].request.google).toMatchObject({
      purchaseToken: 'monthly-token',
      subscriptionProductReplacementParams: { oldProductId: MONTHLY_SKU, replacementMode: 'with-time-proration' },
    });
    cancel();
    await upgrade;

    mockIap.getAvailablePurchases.mockResolvedValue([
      { productId: YEARLY_SKU, purchaseToken: 'yearly-token', purchaseState: 'purchased' },
    ]);
    const downgrade = changeSubscriptionPlan('yearly', 'monthly');
    await flush();
    expect(mockIap.requestPurchase.mock.calls[1][0].request.google).toMatchObject({
      purchaseToken: 'yearly-token',
      subscriptionProductReplacementParams: { oldProductId: YEARLY_SKU, replacementMode: 'deferred' },
    });
    cancel();
    await downgrade;
    mockIap.getAvailablePurchases.mockResolvedValue([]);
  });

  it('sends paid Play purchases to the server at launch and acknowledges any left unacknowledged', async () => {
    mockIap.getAvailablePurchases.mockResolvedValueOnce([
      { productId: YEARLY_SKU, purchaseToken: 'acked', purchaseState: 'purchased', isAcknowledgedAndroid: true },
      { productId: MONTHLY_SKU, purchaseToken: 'not-acked', purchaseState: 'purchased', isAcknowledgedAndroid: false },
      { productId: MONTHLY_SKU, purchaseToken: 'unpaid', purchaseState: 'pending' },
      { productId: 'coins', purchaseToken: 'coins', purchaseState: 'purchased' },
    ]);

    await syncStoreSubscriptionStatus('user-1');

    expect(bodyOf('/subscriptions/google/sync')).toEqual({ purchaseTokens: ['acked', 'not-acked'] });
    expect(mockIap.finishTransaction).toHaveBeenCalledTimes(1);
    expect(mockIap.finishTransaction.mock.calls[0][0].purchase.purchaseToken).toBe('not-acked');
  });
});
