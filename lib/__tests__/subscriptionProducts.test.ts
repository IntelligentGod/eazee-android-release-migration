jest.mock('expo-iap', () => ({
  fetchProducts: jest.fn(),
  isEligibleForIntroOfferIOS: jest.fn(async () => true),
}));

import {
  FALLBACK_STORE_PRODUCTS,
  formatPeriodLabel,
  getSwitchTargetPlanId,
  getYearlySavingsLabel,
  isUpgrade,
  loadStoreProducts,
  orderStoreProducts,
  toStoreProduct,
} from '@/lib/subscriptionProducts';

const mockIap = jest.requireMock('expo-iap') as Record<string, jest.Mock>;

// What expo-iap returns for the two products in eazee_products.storekit.
const storeKitProducts = [
  {
    id: 'com.eazee.subscription.pro.monthly',
    displayNameIOS: 'Eazee Pro Monthly',
    description: 'Unlock premium AI, voice, planning, and personalization',
    displayPrice: '$9.99',
    price: 9.99,
    currency: 'USD',
    subscriptionPeriodUnitIOS: 'month',
    subscriptionPeriodNumberIOS: '1',
    subscriptionGroupIdIOS: '00BD17D1',
    subscriptionOffers: [{ type: 'introductory', paymentMode: 'free-trial', period: { unit: 'week', value: 2 }, periodCount: 1 }],
  },
  {
    id: 'com.eazee.subscription.pro.yearly',
    displayNameIOS: 'Eazee Pro Yearly',
    displayPrice: '$79.99',
    price: 79.99,
    currency: 'USD',
    subscriptionPeriodUnitIOS: 'year',
    subscriptionPeriodNumberIOS: '1',
    subscriptionGroupIdIOS: '00BD17D1',
  },
  { id: 'com.eazee.coins', displayPrice: '$1.99' },
];

describe('toStoreProduct', () => {
  it('takes the name, price, period and free trial from StoreKit', () => {
    expect(toStoreProduct(storeKitProducts[0])).toEqual({
      productId: 'com.eazee.subscription.pro.monthly',
      planId: 'monthly',
      title: 'Eazee Pro Monthly',
      description: 'Unlock premium AI, voice, planning, and personalization',
      displayPrice: '$9.99',
      price: 9.99,
      currency: 'USD',
      periodUnit: 'month',
      periodCount: 1,
      introOffer: '2-week free trial',
      isFallback: false,
    });
    expect(formatPeriodLabel(toStoreProduct(storeKitProducts[1])!)).toBe('/ year');
  });

  it('ignores products the app does not sell', () => {
    expect(toStoreProduct(storeKitProducts[2])).toBeNull();
  });
});

describe('loadStoreProducts', () => {
  const connect = jest.fn(async () => true);

  it('returns the App Store products, without the trial once the Apple ID has used it', async () => {
    mockIap.fetchProducts.mockResolvedValueOnce(storeKitProducts);
    mockIap.isEligibleForIntroOfferIOS.mockResolvedValueOnce(false);

    const products = await loadStoreProducts(connect);

    expect(products.map((product) => product.displayPrice)).toEqual(['$9.99', '$79.99']);
    expect(products.every((product) => product.introOffer === null && !product.isFallback)).toBe(true);
    expect(mockIap.isEligibleForIntroOfferIOS).toHaveBeenCalledWith('00BD17D1');
  });

  it('keeps the last products when the App Store cannot be reached', async () => {
    mockIap.fetchProducts.mockRejectedValueOnce(new Error('offline'));
    const products = await loadStoreProducts(connect);
    expect(products[0].isFallback).toBe(false);
  });

  it('uses the offline placeholders only when nothing was ever loaded', async () => {
    let fresh: typeof import('@/lib/subscriptionProducts') | undefined;
    jest.isolateModules(() => {
      fresh = require('@/lib/subscriptionProducts');
      (jest.requireMock('expo-iap') as Record<string, jest.Mock>).fetchProducts.mockRejectedValueOnce(new Error('offline'));
    });

    await expect(fresh!.loadStoreProducts(connect)).resolves.toBe(fresh!.FALLBACK_STORE_PRODUCTS);
    expect(FALLBACK_STORE_PRODUCTS.every((product) => product.isFallback)).toBe(true);
  });
});

describe('plan helpers', () => {
  const products = storeKitProducts.slice(0, 2).map((raw) => toStoreProduct(raw)!);

  it('orders plans by the admin display order', () => {
    const ordered = orderStoreProducts(products, {
      'com.eazee.subscription.pro.yearly': { displayOrder: 0, badge: null, marketingText: null },
      'com.eazee.subscription.pro.monthly': { displayOrder: 1, badge: null, marketingText: null },
    });
    expect(ordered.map((product) => product.planId)).toEqual(['yearly', 'monthly']);
  });

  it('works out the yearly saving from the real prices', () => {
    expect(getYearlySavingsLabel(products)).toBe('Save 33%');
    expect(getYearlySavingsLabel([products[0]])).toBeNull();
  });

  it('offers only the other plan as the switch', () => {
    expect(getSwitchTargetPlanId('monthly')).toBe('yearly');
    expect(getSwitchTargetPlanId('yearly')).toBe('monthly');
    expect(getSwitchTargetPlanId(null)).toBeNull();
    expect(isUpgrade('monthly', 'yearly')).toBe(true);
    expect(isUpgrade('yearly', 'monthly')).toBe(false);
  });
});

describe('store prices', () => {
  const { formatStorePrice } = require('@/lib/subscriptionProducts');
  it('adds the currency so "$" is never ambiguous, without repeating a code already shown', () => {
    expect(formatStorePrice({ displayPrice: '$19.99', currency: 'NZD' })).toBe('$19.99 (NZD)');
    expect(formatStorePrice({ displayPrice: 'NZD 19.99', currency: 'NZD' })).toBe('NZD 19.99');
    expect(formatStorePrice({ displayPrice: '$9.99', currency: null })).toBe('$9.99');
  });
});
