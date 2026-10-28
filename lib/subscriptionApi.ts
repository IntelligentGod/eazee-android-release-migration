import { SERVER_URL } from '@/config/backend';
import { auth } from '@/firebaseConfig';
import { getFirebaseAppCheckHeaders } from '@/lib/firebaseAppCheck';
import {
  getPlanIdForProduct,
  type SubscriptionPlanId,
  type SubscriptionState,
  type SubscriptionStatus,
} from '@/lib/subscription';
import { parseSubscriptionLimits, type PlanLimits, type SubscriptionLimits } from '@/lib/subscriptionLimits';

/** The server refused the transaction: it was bought by a different Eazee account. */
export class OtherAccountSubscriptionError extends Error {}

export async function subscriptionApiRequest(path: string, init: { method: 'GET' | 'POST'; body?: unknown }) {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (!idToken) {
    throw new Error('Sign in to manage Eazee Pro');
  }
  const response = await fetch(`${SERVER_URL}/subscriptions${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      // Today's usage is counted per local day.
      'X-Eazee-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      ...await getFirebaseAppCheckHeaders(),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = await response.json().catch(() => null);
  if (response.status === 403) {
    throw new OtherAccountSubscriptionError('This App Store subscription belongs to another Eazee account.');
  }
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Could not reach Eazee');
  }
  return body;
}

export type ServerSubscription = {
  isPro: boolean;
  isUnlimitedAccount: boolean;
  plan: SubscriptionPlanId | null;
  state: SubscriptionState;
  productId: string | null;
  expiresAt: number | null;
  autoRenew: boolean | null;
  pendingProductId: string | null;
  environment: string | null;
};

export type ProductDisplaySettings = Record<string, { displayOrder: number; badge: string | null; marketingText: string | null }>;

export type ServerUsage = {
  aiActions: number;
  /** AI actions as the plans count them (lib/aiActions.ts); missing on older servers. */
  aiItemActions?: number;
  voiceSeconds: number;
  guidanceGoal: number;
  guidanceTask: number;
  guidanceRecipeSkill: number;
  guidanceQuestions: number;
};

export type SubscriptionOverview = {
  subscription: ServerSubscription;
  limits: SubscriptionLimits;
  planLimits: PlanLimits;
  usage: ServerUsage;
  products: ProductDisplaySettings;
};

/** The server's subscription summary as the status the app caches. */
export const toSubscriptionStatus = (subscription: ServerSubscription): SubscriptionStatus => ({
  isPro: subscription.isPro,
  planId: subscription.plan,
  verifiedAt: Date.now(),
  state: subscription.state,
  expiresAt: subscription.expiresAt,
  autoRenew: subscription.autoRenew,
  pendingPlanId: getPlanIdForProduct(subscription.pendingProductId),
});

/** Plan, limits, today's usage and product display settings; the server is the source of truth. */
export async function fetchSubscriptionOverview(): Promise<SubscriptionOverview> {
  const body = await subscriptionApiRequest('/status', { method: 'GET' });
  const limits = parseSubscriptionLimits(body?.limits);
  if (!body?.subscription || !limits) {
    throw new Error('Could not load your subscription');
  }
  return { ...body, limits };
}

export type PurchaseRecord = {
  transactionId: string;
  productId: string;
  planId: SubscriptionPlanId | null;
  price: number | null;
  currency: string | null;
  purchaseDate: number;
  expiresDate: number | null;
  type: 'purchase' | 'renewal' | 'upgrade' | 'downgrade' | 'crossgrade';
  status: 'active' | 'cancelled' | 'expired' | 'upgraded' | 'refunded';
  isTrial: boolean;
  environment: string;
};

export async function fetchPurchaseHistory(cursor?: string | null): Promise<{ transactions: PurchaseRecord[]; nextCursor: string | null }> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const body = await subscriptionApiRequest(`/history${query}`, { method: 'GET' });
  return { transactions: Array.isArray(body?.transactions) ? body.transactions : [], nextCursor: body?.nextCursor ?? null };
}

export type RenewalSnapshot = {
  productId: string;
  willAutoRenew: boolean;
  pendingProductId?: string | null;
  isInBillingRetry?: boolean;
};

/** Sends the device's current entitlement and recent transactions; the answer is the account's subscription. */
export async function syncAppleTransactions(signedTransactions: string[], renewal?: RenewalSnapshot) {
  const body = await subscriptionApiRequest('/apple/sync', { method: 'POST', body: { signedTransactions, renewal } });
  return body?.subscription as ServerSubscription | undefined;
}

export async function verifyAppleTransaction(signedTransaction: string) {
  return subscriptionApiRequest('/apple/verify', { method: 'POST', body: { signedTransaction } });
}

export async function fetchAppAccountToken(): Promise<string> {
  const body = await subscriptionApiRequest('/apple/account-token', { method: 'GET' });
  if (typeof body?.appAccountToken !== 'string') {
    throw new Error('Could not prepare the purchase');
  }
  return body.appAccountToken;
}
