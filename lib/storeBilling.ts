import { Linking, Platform } from 'react-native';
import {
  fetchProducts,
  finishTransaction,
  getActiveSubscriptions,
  getAllTransactionsIOS,
  getUserFriendlyErrorMessage,
  initConnection,
  isUserCancelledError,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases as restoreStorePurchases,
  showManageSubscriptionsIOS,
  type ActiveSubscription,
  type Purchase,
} from 'expo-iap';

import { auth } from '@/firebaseConfig';
import {
  FREE_SUBSCRIPTION_STATUS,
  SUBSCRIPTION_PLANS,
  getManageSubscriptionUrl,
  getPlanIdForProduct,
  readCachedSubscriptionStatus,
  writeCachedSubscriptionStatus,
  type BillingOutcome,
  type SubscriptionPlanId,
  type SubscriptionStatus,
} from '@/lib/subscription';
import {
  OtherAccountSubscriptionError,
  fetchAppAccountToken,
  fetchSubscriptionOverview,
  syncAppleTransactions,
  toSubscriptionStatus,
  verifyAppleTransaction,
  type RenewalSnapshot,
  type SubscriptionOverview,
} from '@/lib/subscriptionApi';
import { writeCachedSubscriptionLimits } from '@/lib/subscriptionLimits';
import { mergeServerUsage } from '@/lib/subscriptionUsage';
import { setAiActionsAllowanceFromStatus } from '@/lib/aiActions';
import { FALLBACK_STORE_PRODUCTS, loadStoreProducts, type StoreProduct } from '@/lib/subscriptionProducts';

/**
 * The server checks Apple's signature, the app, the plan, and that this account
 * bought it, then records Pro on the account. Its answer is the source of truth.
 */
async function verifyTransactionWithServer(signedTransaction: string): Promise<SubscriptionStatus> {
  const body = await verifyAppleTransaction(signedTransaction);
  // New ID tokens carry the Pro claim the server just set, for its own Pro checks.
  await auth.currentUser?.getIdToken(true).catch(() => null);
  if (body?.subscription) return toSubscriptionStatus(body.subscription);
  const planId = body?.planId === 'monthly' || body?.planId === 'yearly' ? body.planId : null;
  return body?.isPro === true && planId
    ? { isPro: true, planId, verifiedAt: Date.now() }
    : { ...FREE_SUBSCRIPTION_STATUS, verifiedAt: Date.now() };
}

/** Eazee Pro is sold through the App Store only for now. */
export const isBillingConfigured = () => Platform.OS === 'ios';

const NOT_AVAILABLE_MESSAGE = 'Eazee Pro can be purchased on iPhone through the App Store.';
const PRODUCT_IDS = SUBSCRIPTION_PLANS.map((plan) => plan.productId);
/** StoreKit sometimes reports a downgrade without a new transaction; stop waiting after this. */
const PURCHASE_RESULT_TIMEOUT_MS = 90_000;
/** The server accepts at most 25 transactions per sync. */
const MAX_SYNCED_TRANSACTIONS = 25;

let connectionPromise: Promise<boolean> | null = null;

/** One StoreKit connection for the app's lifetime; a failed attempt is retried on the next call. */
function ensureStoreConnection() {
  if (!connectionPromise) {
    connectionPromise = initConnection().catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }
  return connectionPromise;
}

/** Plans with their App Store names and localized prices. */
export const getStoreProducts = async (): Promise<StoreProduct[]> =>
  isBillingConfigured() ? loadStoreProducts(ensureStoreConnection) : FALLBACK_STORE_PRODUCTS;

const toFailureOutcome = (error: unknown): BillingOutcome =>
  isUserCancelledError(error)
    ? { status: 'cancelled' }
    : { status: 'unavailable', message: getUserFriendlyErrorMessage(error as any) || 'The purchase could not be completed.' };

/**
 * Buys a plan and resolves once StoreKit reports the result. The purchase result
 * arrives on expo-iap's listeners, not from requestPurchase's return value.
 *
 * Switching between monthly and yearly is the same call: both plans are in one
 * subscription group, and buying the other one with the same appAccountToken
 * lets Apple handle proration and timing (an upgrade starts now, a downgrade at
 * the next renewal).
 */
export async function purchaseSubscription(planId: SubscriptionPlanId): Promise<BillingOutcome> {
  if (!isBillingConfigured()) {
    return { status: 'unavailable', message: NOT_AVAILABLE_MESSAGE };
  }

  const sku = SUBSCRIPTION_PLANS.find((plan) => plan.id === planId)?.productId;
  if (!sku) {
    return { status: 'unavailable', message: 'This plan is not available.' };
  }

  let appAccountToken: string;
  try {
    await ensureStoreConnection();
    const products = await fetchProducts({ skus: [sku], type: 'subs' });
    if (!products?.length) {
      return { status: 'unavailable', message: 'This plan is not available in the App Store right now.' };
    }
    appAccountToken = await fetchAppAccountToken();
  } catch (error) {
    return toFailureOutcome(error);
  }

  const outcome = await new Promise<BillingOutcome>((resolve) => {
    let settled = false;
    const settle = (result: BillingOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      updatedSubscription.remove();
      errorSubscription.remove();
      resolve(result);
    };

    // A plan change can come back as a transaction for either plan, so any of ours settles it.
    const updatedSubscription = purchaseUpdatedListener((purchase: Purchase) => {
      if (!getPlanIdForProduct(purchase.productId)) return;
      void handleStoreTransaction(purchase)
        .then((status) => settle(
          status.isPro && status.planId
            ? { status: 'success', planId: status.planId }
            : { status: 'unavailable', message: 'The App Store did not confirm an active subscription.' }
        ))
        .catch((error) => settle(
          error instanceof OtherAccountSubscriptionError
            ? { status: 'unavailable', message: error.message }
            : {
              status: 'unavailable',
              message: 'Your purchase went through, but Eazee could not confirm it yet. It will be applied automatically when you are back online.',
            }
        ));
    });
    const errorSubscription = purchaseErrorListener((error) => settle(toFailureOutcome(error)));
    const timeout = setTimeout(() => settle({ status: 'pending' }), PURCHASE_RESULT_TIMEOUT_MS);

    requestPurchase({ request: { apple: { sku, appAccountToken } }, type: 'subs' })
      .catch((error) => settle(toFailureOutcome(error)));
  });

  // Renewal info (a downgrade due at renewal, auto-renew) only reaches the server through a sync.
  if (outcome.status === 'success' || outcome.status === 'pending') {
    const userId = auth.currentUser?.uid;
    if (userId) await syncStoreSubscriptionStatus(userId);
  }
  return outcome;
}

/** Monthly <-> yearly. Refuses to "switch" to the plan the account already has. */
export async function changeSubscriptionPlan(currentPlanId: SubscriptionPlanId | null, targetPlanId: SubscriptionPlanId) {
  if (currentPlanId === targetPlanId) {
    return { status: 'unavailable', message: 'You are already on this plan.' } satisfies BillingOutcome;
  }
  return purchaseSubscription(targetPlanId);
}

/**
 * Verifies a StoreKit transaction with the server, then finishes it. A
 * transaction that could not be verified (e.g. offline) is left unfinished, so
 * StoreKit delivers it again at the next launch and it is retried.
 */
function handleStoreTransaction(purchase: Purchase): Promise<SubscriptionStatus> {
  // The purchase flow and the app-wide listener both receive a new purchase; verify it once.
  const key = purchase.id || purchase.purchaseToken || '';
  const inFlight = transactionsInFlight.get(key);
  if (inFlight) return inFlight;
  const handling = verifyAndFinishTransaction(purchase).finally(() => transactionsInFlight.delete(key));
  transactionsInFlight.set(key, handling);
  return handling;
}

const transactionsInFlight = new Map<string, Promise<SubscriptionStatus>>();

async function verifyAndFinishTransaction(purchase: Purchase): Promise<SubscriptionStatus> {
  if (!purchase.purchaseToken) {
    throw new Error('The App Store transaction has no signed data');
  }
  try {
    const status = await verifyTransactionWithServer(purchase.purchaseToken);
    await finishTransaction({ purchase, isConsumable: false });
    return status;
  } catch (error) {
    if (error instanceof OtherAccountSubscriptionError) {
      // Valid for its own account; finishing it stops StoreKit replaying it here.
      await finishTransaction({ purchase, isConsumable: false }).catch(() => {});
    }
    throw error;
  }
}

const toRenewalSnapshot = (subscription: ActiveSubscription): RenewalSnapshot | undefined => {
  const renewal = subscription.renewalInfoIOS;
  if (!renewal) return undefined;
  return {
    productId: subscription.productId,
    willAutoRenew: renewal.willAutoRenew,
    pendingProductId: renewal.pendingUpgradeProductId ?? null,
    isInBillingRetry: renewal.isInBillingRetry ?? undefined,
  };
};

/**
 * Sends StoreKit's view of this Apple ID to the server: the active subscription
 * with its renewal info (auto-renew, a pending downgrade) and recent
 * transactions, so purchase history includes renewals and plan changes made
 * outside the app. Returns false when there is nothing to send.
 */
async function sendStoreStateToServer(): Promise<boolean> {
  await ensureStoreConnection();
  const [active, history] = await Promise.all([
    getActiveSubscriptions(PRODUCT_IDS),
    getAllTransactionsIOS().catch(() => [] as Purchase[]),
  ]);
  const current = active.find((subscription) => subscription.isActive && getPlanIdForProduct(subscription.productId));
  const recent = [...history]
    .filter((purchase) => getPlanIdForProduct(purchase.productId) && purchase.purchaseToken)
    .sort((a, b) => (b.transactionDate || 0) - (a.transactionDate || 0))
    .map((purchase) => purchase.purchaseToken!);
  const tokens = [...new Set([current?.purchaseToken, ...recent].filter((token): token is string => !!token))]
    .slice(0, MAX_SYNCED_TRANSACTIONS);
  if (!tokens.length) return false;
  try {
    await syncAppleTransactions(tokens, current ? toRenewalSnapshot(current) : undefined);
    await auth.currentUser?.getIdToken(true).catch(() => null);
  } catch (error) {
    // Bought by another Eazee account on this Apple ID: nothing to apply here.
    if (!(error instanceof OtherAccountSubscriptionError)) throw error;
  }
  return true;
}

/** Caches what the server reports: plan, limits and today's usage. */
async function cacheSubscriptionOverview(userId: string, overview: SubscriptionOverview) {
  await Promise.all([
    writeCachedSubscriptionStatus(userId, toSubscriptionStatus(overview.subscription)),
    writeCachedSubscriptionLimits(userId, overview.limits),
    mergeServerUsage(userId, overview.usage),
  ]);
  setAiActionsAllowanceFromStatus(overview.planLimits?.aiActionsPerDay ?? overview.limits[overview.subscription.isPro ? 'pro' : 'free'].aiActionsPerDay, overview.usage?.aiItemActions);
}

export async function restorePurchases(): Promise<BillingOutcome> {
  if (!isBillingConfigured()) {
    return { status: 'unavailable', message: NOT_AVAILABLE_MESSAGE };
  }

  try {
    await ensureStoreConnection();
    await restoreStorePurchases();
    await sendStoreStateToServer();
    const overview = await fetchSubscriptionOverview();
    const userId = auth.currentUser?.uid;
    if (userId) await cacheSubscriptionOverview(userId, overview);
    const { isPro, plan, isUnlimitedAccount } = overview.subscription;
    return isPro && plan && !isUnlimitedAccount
      ? { status: 'success', planId: plan }
      : { status: 'unavailable', message: 'No active Eazee Pro subscription was found for this Eazee account and Apple ID.' };
  } catch (error) {
    return toFailureOutcome(error);
  }
}

/**
 * Refreshes the cached Pro status, limits and usage: StoreKit's state goes to
 * the server first, then the server's answer is cached. A failed check keeps the
 * cached status, so being offline never takes Pro away.
 */
export async function syncStoreSubscriptionStatus(userId: string): Promise<SubscriptionOverview | null> {
  if (isBillingConfigured()) {
    try {
      await sendStoreStateToServer();
    } catch (error) {
      console.warn('Could not check the App Store subscription:', error);
    }
  }
  try {
    const overview = await fetchSubscriptionOverview();
    await cacheSubscriptionOverview(userId, overview);
    return overview;
  } catch (error) {
    console.warn('Could not load the Eazee subscription:', error);
    return null;
  }
}

/**
 * StoreKit replays unfinished transactions at launch (e.g. a purchase interrupted
 * by the app closing, or a renewal); finishing them keeps them from replaying forever.
 */
export function listenForStoreTransactions(onTransaction: () => void) {
  if (!isBillingConfigured()) return () => {};
  void ensureStoreConnection().catch((error) => console.warn('Could not connect to the App Store:', error));
  try {
    const subscription = purchaseUpdatedListener((purchase: Purchase) => {
      if (!getPlanIdForProduct(purchase.productId)) return;
      void handleStoreTransaction(purchase)
        .catch((error) => console.warn('Could not verify App Store transaction:', error))
        .finally(onTransaction);
    });
    return () => subscription.remove();
  } catch (error) {
    // A build made before expo-iap was added has no native module; purchases then report it instead of crashing here.
    console.warn('App Store purchases are unavailable in this build:', error);
    return () => {};
  }
}

/**
 * Apple's manage-subscriptions sheet, shown inside the app, where the user can
 * cancel or switch plans (apps cannot cancel a subscription themselves). Falls
 * back to the App Store's subscriptions page when the sheet is unavailable.
 * Once it closes, StoreKit's new state is sent to the server and cached.
 */
/** onSheetClosed runs once the user is back in the app, before the (slower) status check. */
export async function openManageSubscriptions(
  userId: string,
  options?: { onSheetClosed?: () => void }
): Promise<SubscriptionStatus> {
  const cached = await readCachedSubscriptionStatus(userId);
  if (isBillingConfigured()) {
    try {
      await ensureStoreConnection();
      await showManageSubscriptionsIOS();
    } catch (error) {
      console.warn('Manage subscriptions sheet unavailable:', error);
      await Linking.openURL(getManageSubscriptionUrl(cached.planId)).catch(() => {});
    }
  } else {
    await Linking.openURL(getManageSubscriptionUrl(cached.planId)).catch(() => {});
  }
  options?.onSheetClosed?.();
  await syncStoreSubscriptionStatus(userId);
  return readCachedSubscriptionStatus(userId);
}
