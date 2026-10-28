import { fetchProducts, isEligibleForIntroOfferIOS } from 'expo-iap';

import {
  SUBSCRIPTION_PLANS,
  getPlanIdForProduct,
  type SubscriptionPlanId,
} from '@/lib/subscription';
import type { ProductDisplaySettings } from '@/lib/subscriptionApi';

/**
 * A plan as the App Store sells it: name, localized price and period come from
 * StoreKit, so they follow App Store Connect (or eazee_products.storekit when
 * testing from Xcode) without an app release.
 */
export type StoreProduct = {
  productId: string;
  planId: SubscriptionPlanId;
  title: string;
  description: string;
  displayPrice: string;
  price: number | null;
  currency: string | null;
  periodUnit: 'day' | 'week' | 'month' | 'year';
  periodCount: number;
  /** e.g. "2-week free trial"; null once the Apple ID has used its trial. */
  introOffer: string | null;
  /** True when the App Store could not be reached and these are the offline placeholders. */
  isFallback: boolean;
};

/** Offline placeholders only; replaced by StoreKit's answer whenever it is available. */
export const FALLBACK_STORE_PRODUCTS: StoreProduct[] = [
  {
    productId: 'com.eazee.subscription.pro.monthly',
    planId: 'monthly',
    title: 'Eazee Pro Monthly',
    description: '',
    displayPrice: '$9.99',
    price: 9.99,
    currency: 'USD',
    periodUnit: 'month',
    periodCount: 1,
    introOffer: null,
    isFallback: true,
  },
  {
    productId: 'com.eazee.subscription.pro.yearly',
    planId: 'yearly',
    title: 'Eazee Pro Yearly',
    description: '',
    displayPrice: '$79.99',
    price: 79.99,
    currency: 'USD',
    periodUnit: 'year',
    periodCount: 1,
    introOffer: null,
    isFallback: true,
  },
];

/** The currency the App Store charges in, e.g. "NZD"; null when it is not known. */
export const getStoreCurrencyCode = (product: Pick<StoreProduct, 'displayPrice' | 'currency'>) => {
  const code = product.currency?.trim().toUpperCase() || '';
  // Some locales already spell it out ("NZD 19.99"); then it is not repeated.
  return code && !product.displayPrice.toUpperCase().includes(code) ? code : null;
};

/** "$19.99 (NZD)": Apple's local price with its currency, so "$" is never ambiguous. */
export const formatStorePrice = (product: Pick<StoreProduct, 'displayPrice' | 'currency'>) => {
  const code = getStoreCurrencyCode(product);
  return code ? `${product.displayPrice} (${code})` : product.displayPrice;
};

const PERIOD_UNITS = ['day', 'week', 'month', 'year'] as const;
const asPeriodUnit = (value: unknown) => PERIOD_UNITS.find((unit) => unit === value) ?? null;

export const formatPeriodLabel = (product: Pick<StoreProduct, 'periodUnit' | 'periodCount'>) =>
  product.periodCount > 1 ? `/ ${product.periodCount} ${product.periodUnit}s` : `/ ${product.periodUnit}`;

function describeIntroOffer(raw: any): string | null {
  const offer = Array.isArray(raw?.subscriptionOffers)
    ? raw.subscriptionOffers.find((item: any) => item?.type === 'introductory' && item?.paymentMode === 'free-trial')
    : null;
  if (offer?.period?.unit && offer.period.value) {
    const total = offer.period.value * (offer.periodCount || 1);
    return `${total}-${offer.period.unit} free trial`;
  }
  return raw?.introductoryPricePaymentModeIOS === 'free-trial' ? 'Free trial' : null;
}

/** StoreKit's product as a plan card, or null for products this app does not sell. */
export function toStoreProduct(raw: any): StoreProduct | null {
  const productId = String(raw?.id || '');
  const planId = getPlanIdForProduct(productId);
  if (!planId) return null;
  const unit = asPeriodUnit(raw?.subscriptionPeriodUnitIOS) ?? (planId === 'yearly' ? 'year' : 'month');
  return {
    productId,
    planId,
    title: String(raw?.displayNameIOS || raw?.displayName || raw?.title || SUBSCRIPTION_PLANS.find((plan) => plan.id === planId)!.title),
    description: String(raw?.description || ''),
    displayPrice: String(raw?.displayPrice || ''),
    price: typeof raw?.price === 'number' ? raw.price : null,
    currency: typeof raw?.currency === 'string' ? raw.currency : null,
    periodUnit: unit,
    periodCount: Math.max(1, Number(raw?.subscriptionPeriodNumberIOS) || 1),
    introOffer: describeIntroOffer(raw),
    isFallback: false,
  };
}

/** Used until the server's display settings arrive; matches the server's defaults. */
export const DEFAULT_PRODUCT_DISPLAY: ProductDisplaySettings = {
  'com.eazee.subscription.pro.yearly': { displayOrder: 0, badge: 'Best value', marketingText: null },
  'com.eazee.subscription.pro.monthly': { displayOrder: 1, badge: null, marketingText: 'Cancel anytime' },
};

/** Plans in the admin's display order. */
export const orderStoreProducts = (products: StoreProduct[], settings: ProductDisplaySettings = DEFAULT_PRODUCT_DISPLAY) =>
  [...products].sort((a, b) =>
    (settings[a.productId]?.displayOrder ?? 99) - (settings[b.productId]?.displayOrder ?? 99)
    || a.productId.localeCompare(b.productId));

/** "Save 33%" from the two real prices, so it stays right when prices change. */
export function getYearlySavingsLabel(products: StoreProduct[]): string | null {
  const monthly = products.find((product) => product.planId === 'monthly');
  const yearly = products.find((product) => product.planId === 'yearly');
  if (!monthly?.price || !yearly?.price || monthly.currency !== yearly.currency) return null;
  const savings = Math.round((1 - yearly.price / (monthly.price * 12)) * 100);
  return savings > 0 ? `Save ${savings}%` : null;
}

/** Only the other plan can be switched to; the current one is never offered. */
export const getSwitchTargetPlanId = (currentPlanId: SubscriptionPlanId | null): SubscriptionPlanId | null =>
  currentPlanId === 'monthly' ? 'yearly' : currentPlanId === 'yearly' ? 'monthly' : null;

export const isUpgrade = (from: SubscriptionPlanId, to: SubscriptionPlanId) => from === 'monthly' && to === 'yearly';

let lastLoaded: StoreProduct[] | null = null;

/**
 * Loads the plans from StoreKit. Falls back to the last products loaded this
 * session, then to the offline placeholders, so the paywall always renders.
 */
export async function loadStoreProducts(ensureConnection: () => Promise<unknown>): Promise<StoreProduct[]> {
  try {
    await ensureConnection();
    const raw = await fetchProducts({ skus: SUBSCRIPTION_PLANS.map((plan) => plan.productId), type: 'subs' });
    const products = (raw ?? []).map(toStoreProduct).filter((product): product is StoreProduct => !!product);
    if (!products.length) return lastLoaded ?? FALLBACK_STORE_PRODUCTS;

    const groupId: string | undefined = (raw as any[] | null)?.find((item) => item?.subscriptionGroupIdIOS)?.subscriptionGroupIdIOS;
    const eligible = groupId ? await isEligibleForIntroOfferIOS(groupId).catch(() => true) : true;
    lastLoaded = eligible ? products : products.map((product) => ({ ...product, introOffer: null }));
    return lastLoaded;
  } catch (error) {
    console.warn('Could not load App Store products:', error);
    return lastLoaded ?? FALLBACK_STORE_PRODUCTS;
  }
}
