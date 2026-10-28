import type { SubscriptionPlanId, SubscriptionState, SubscriptionStatus } from '@/lib/subscription';
import type { PurchaseRecord } from '@/lib/subscriptionApi';

export const formatSubscriptionDate = (epochMs: number) =>
  new Date(epochMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const PLAN_NAMES: Record<SubscriptionPlanId, string> = { monthly: 'Monthly', yearly: 'Yearly' };

/**
 * One line under the current plan, e.g. "Cancelled, active until 12 Nov 2026"
 * or "Renews 1 Nov 2026 as Monthly" for a downgrade due at renewal.
 */
export function describeSubscriptionStatus(status: SubscriptionStatus, now: number = Date.now()): string | null {
  const expiresAt = status.expiresAt ?? null;
  const until = expiresAt ? formatSubscriptionDate(expiresAt) : null;
  const state: SubscriptionState | undefined =
    expiresAt && expiresAt <= now && status.state !== 'refunded' ? 'expired' : status.state;

  switch (state) {
    case 'cancelled':
      return until ? `Cancelled, active until ${until}` : 'Cancelled';
    case 'billing_retry':
      return 'Payment issue: update your payment method in the App Store';
    case 'expired':
      return until ? `Expired on ${until}` : 'Expired';
    case 'refunded':
      return 'Refunded';
    case 'active':
      if (status.pendingPlanId && status.pendingPlanId !== status.planId && until) {
        return `Switches to ${PLAN_NAMES[status.pendingPlanId]} on ${until}`;
      }
      return until ? `Renews ${until}` : null;
    default:
      return null;
  }
}

export const PURCHASE_STATUS_LABELS: Record<PurchaseRecord['status'], string> = {
  active: 'Active',
  cancelled: 'Cancelled',
  expired: 'Expired',
  upgraded: 'Upgraded',
  refunded: 'Refunded',
};

export const PURCHASE_TYPE_LABELS: Record<PurchaseRecord['type'], string> = {
  purchase: 'Purchase',
  renewal: 'Renewal',
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
  crossgrade: 'Plan change',
};

export function formatCurrency(amount: number, currency: string | null) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || ''}`.trim();
  }
}

/** A transaction's price; a free trial reads as such rather than as zero. */
export function formatPrice(price: number | null, currency: string | null, isTrial = false) {
  if (isTrial || price === 0) return 'Free trial';
  if (price === null) return '-';
  return formatCurrency(price, currency);
}
