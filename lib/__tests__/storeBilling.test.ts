jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
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

// Built inside the factory: imports are hoisted above module-level constants.
jest.mock('expo-iap', () => ({
  initConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(async ({ skus }: { skus: string[] }) => skus.map((id) => ({ id }))),
  isEligibleForIntroOfferIOS: jest.fn(async () => true),
  requestPurchase: jest.fn(async () => null),
  finishTransaction: jest.fn(async () => undefined),
  getActiveSubscriptions: jest.fn(async (): Promise<any[]> => []),
  getAllTransactionsIOS: jest.fn(async (): Promise<any[]> => []),
  restorePurchases: jest.fn(async () => undefined),
  showManageSubscriptionsIOS: jest.fn(async () => []),
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

import { Linking } from 'react-native';
import { readCachedSubscriptionStatus } from '@/lib/subscription';
import { readCachedSubscriptionLimits, DEFAULT_SUBSCRIPTION_LIMITS } from '@/lib/subscriptionLimits';
import {
  changeSubscriptionPlan,
  openManageSubscriptions,
  purchaseSubscription,
  restorePurchases,
  syncStoreSubscriptionStatus,
} from '@/lib/storeBilling';

const mockIap = jest.requireMock('expo-iap') as Record<string, jest.Mock>;
const YEARLY_SKU = 'com.eazee.subscription.pro.yearly';
const MONTHLY_SKU = 'com.eazee.subscription.pro.monthly';
const ACCOUNT_TOKEN = '11111111-2222-4333-8444-555555555555';
const flush = () => new Promise((resolve) => setImmediate(resolve));

type ServerReply = { status: number; body: unknown };
const subscription = (overrides: Record<string, unknown> = {}) => ({
  isPro: true,
  isUnlimitedAccount: false,
  plan: 'yearly',
  state: 'active',
  productId: YEARLY_SKU,
  expiresAt: Date.now() + 86_400_000,
  autoRenew: true,
  pendingProductId: null,
  environment: 'Xcode',
  ...overrides,
});
const overview = (sub: Record<string, unknown>, limits = DEFAULT_SUBSCRIPTION_LIMITS) => ({
  status: 200,
  body: { subscription: sub, limits, planLimits: limits.pro, usage: { aiActions: 0, voiceSeconds: 0 }, products: {} },
});

let verifyReply: ServerReply | Error;
let syncReply: ServerReply | Error;
let statusReply: ServerReply | Error;
const reply = (value: ServerReply | Error) => {
  if (value instanceof Error) throw value;
  return { ok: value.status >= 200 && value.status < 300, status: value.status, json: async () => value.body };
};
const fetchMock = jest.fn(async (url: string) => {
  if (url.endsWith('/subscriptions/apple/account-token')) {
    return { ok: true, status: 200, json: async () => ({ appAccountToken: ACCOUNT_TOKEN }) };
  }
  if (url.endsWith('/subscriptions/apple/verify')) return reply(verifyReply);
  if (url.endsWith('/subscriptions/apple/sync')) return reply(syncReply);
  if (url.endsWith('/subscriptions/status')) return reply(statusReply);
  throw new Error(`unexpected ${url}`);
});
const callsTo = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.updated = [];
  mockListeners.error = [];
  verifyReply = { status: 200, body: { isPro: true, planId: 'yearly', expiresAt: Date.now() + 1000, subscription: subscription() } };
  syncReply = { status: 200, body: { isPro: true, planId: 'yearly', subscription: subscription() } };
  statusReply = overview(subscription());
  (global as any).fetch = fetchMock;
});

describe('purchaseSubscription', () => {
  it('stamps the purchase with this account, verifies it on the server, then finishes it', async () => {
    const result = purchaseSubscription('yearly');
    await flush();

    expect(mockIap.requestPurchase).toHaveBeenCalledWith({
      request: { apple: { sku: YEARLY_SKU, appAccountToken: ACCOUNT_TOKEN } },
      type: 'subs',
    });
    mockListeners.updated.forEach((listener) => listener({ id: 't-1', productId: YEARLY_SKU, purchaseToken: 'jws' }));

    await expect(result).resolves.toEqual({ status: 'success', planId: 'yearly' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/subscriptions/apple/verify',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ signedTransaction: 'jws' }) })
    );
    expect(mockIap.finishTransaction).toHaveBeenCalledTimes(1);
    expect(mockListeners.updated).toHaveLength(0);
    expect(callsTo('/subscriptions/status')).toHaveLength(1);
  });

  it('leaves the transaction unfinished when the server cannot be reached, so it is retried', async () => {
    verifyReply = new Error('offline');
    const result = purchaseSubscription('yearly');
    await flush();
    mockListeners.updated.forEach((listener) => listener({ id: 't-1', productId: YEARLY_SKU, purchaseToken: 'jws' }));

    await expect(result).resolves.toMatchObject({ status: 'unavailable' });
    expect(mockIap.finishTransaction).not.toHaveBeenCalled();
  });

  it('reports a cancel without an error message', async () => {
    const result = purchaseSubscription('monthly');
    await flush();
    mockListeners.error.forEach((listener) => listener({ code: 'user-cancelled' }));

    await expect(result).resolves.toEqual({ status: 'cancelled' });
  });

  it('explains when the product is missing from the App Store', async () => {
    mockIap.fetchProducts.mockResolvedValueOnce([]);

    await expect(purchaseSubscription('yearly')).resolves.toEqual({
      status: 'unavailable',
      message: 'This plan is not available in the App Store right now.',
    });
    expect(mockIap.requestPurchase).not.toHaveBeenCalled();
  });
});

describe('changeSubscriptionPlan', () => {
  it('never offers the plan the account already has', async () => {
    await expect(changeSubscriptionPlan('yearly', 'yearly')).resolves.toMatchObject({ status: 'unavailable' });
    expect(mockIap.requestPurchase).not.toHaveBeenCalled();
  });

  it('buys the other plan with the same account token, and accepts the result for either plan', async () => {
    verifyReply = { status: 200, body: { isPro: true, planId: 'monthly', subscription: subscription({ plan: 'monthly' }) } };
    const result = changeSubscriptionPlan('yearly', 'monthly');
    await flush();

    expect(mockIap.requestPurchase).toHaveBeenCalledWith({
      request: { apple: { sku: MONTHLY_SKU, appAccountToken: ACCOUNT_TOKEN } },
      type: 'subs',
    });
    // A downgrade starts at renewal, so StoreKit may hand back the yearly transaction.
    mockListeners.updated.forEach((listener) => listener({ id: 't-2', productId: YEARLY_SKU, purchaseToken: 'jws-2' }));
    await expect(result).resolves.toEqual({ status: 'success', planId: 'monthly' });
  });
});

describe('restorePurchases and status sync', () => {
  const activeSubscription = {
    productId: YEARLY_SKU,
    isActive: true,
    purchaseToken: 'jws-active',
    renewalInfoIOS: { willAutoRenew: false, pendingUpgradeProductId: null },
  };

  it('sends the active subscription, its renewal info and recent transactions to the server', async () => {
    mockIap.getActiveSubscriptions.mockResolvedValueOnce([activeSubscription]);
    mockIap.getAllTransactionsIOS.mockResolvedValueOnce([
      { productId: MONTHLY_SKU, purchaseToken: 'jws-old', transactionDate: 1 },
      { productId: 'coins', purchaseToken: 'jws-coins', transactionDate: 2 },
      { productId: YEARLY_SKU, purchaseToken: 'jws-active', transactionDate: 3 },
    ]);

    await syncStoreSubscriptionStatus('user-1');

    const [, init] = callsTo('/subscriptions/apple/sync')[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({
      signedTransactions: ['jws-active', 'jws-old'],
      renewal: { productId: YEARLY_SKU, willAutoRenew: false, pendingProductId: null },
    });
  });

  it('restores an active subscription the server confirms', async () => {
    mockIap.getActiveSubscriptions.mockResolvedValueOnce([activeSubscription]);

    await expect(restorePurchases()).resolves.toEqual({ status: 'success', planId: 'yearly' });
  });

  it('treats a subscription bought by another Eazee account as free here', async () => {
    mockIap.getActiveSubscriptions.mockResolvedValueOnce([activeSubscription]);
    syncReply = { status: 403, body: { error: 'Transaction does not belong to this account' } };
    statusReply = overview(subscription({ isPro: false, plan: null, state: 'none', productId: null, expiresAt: null }));

    await expect(restorePurchases()).resolves.toEqual({
      status: 'unavailable',
      message: 'No active Eazee Pro subscription was found for this Eazee account and Apple ID.',
    });
  });

  it('caches what the server reports, including the limits', async () => {
    const limits = { ...DEFAULT_SUBSCRIPTION_LIMITS, free: { ...DEFAULT_SUBSCRIPTION_LIMITS.free, aiActionsPerDay: 9 } };
    statusReply = overview(subscription(), limits);
    await syncStoreSubscriptionStatus('user-1');
    expect(await readCachedSubscriptionStatus('user-1')).toMatchObject({ isPro: true, planId: 'yearly', state: 'active' });
    expect((await readCachedSubscriptionLimits('user-1')).free.aiActionsPerDay).toBe(9);

    statusReply = overview(subscription({ isPro: false, state: 'expired', expiresAt: Date.now() - 1 }));
    await syncStoreSubscriptionStatus('user-1');
    expect(await readCachedSubscriptionStatus('user-1')).toMatchObject({ isPro: false, state: 'expired' });
  });

  it('keeps the cached status when the server cannot be reached', async () => {
    await syncStoreSubscriptionStatus('user-2');
    statusReply = new Error('offline');
    syncReply = new Error('offline');

    await syncStoreSubscriptionStatus('user-2');
    expect(await readCachedSubscriptionStatus('user-2')).toMatchObject({ isPro: true, planId: 'yearly' });
  });
});

describe('openManageSubscriptions', () => {
  it("shows Apple's sheet in the app, then re-syncs so a cancellation shows at once", async () => {
    statusReply = overview(subscription({ state: 'cancelled', autoRenew: false }));

    const status = await openManageSubscriptions('user-3');

    expect(mockIap.showManageSubscriptionsIOS).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(status).toMatchObject({ isPro: true, state: 'cancelled', autoRenew: false });
  });

  it('falls back to the App Store subscriptions page when the sheet is unavailable', async () => {
    mockIap.showManageSubscriptionsIOS.mockRejectedValueOnce(new Error('not supported'));

    await openManageSubscriptions('user-3');

    expect(Linking.openURL).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
    expect(callsTo('/subscriptions/status')).toHaveLength(1);
  });
});
