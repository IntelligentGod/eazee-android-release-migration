import React from 'react';
import { Text, View } from 'react-native';
import type { PurchaseRecord } from '@/lib/subscriptionApi';
import {
  PURCHASE_STATUS_LABELS,
  PURCHASE_TYPE_LABELS,
  formatPrice,
  formatSubscriptionDate,
} from '@/lib/subscriptionStatusText';

const STATUS_CLASSES: Record<PurchaseRecord['status'], string> = {
  active: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-amber-100 text-amber-800',
  expired: 'bg-gray-200 text-gray-700',
  upgraded: 'bg-sky-100 text-sky-800',
  refunded: 'bg-rose-100 text-rose-800',
};

/** One App Store transaction: product, price, dates and status. */
export default function PurchaseRow({ purchase, subtitle }: { purchase: PurchaseRecord; subtitle?: string | null }) {
  const plan = purchase.planId === 'yearly' ? 'Eazee Pro Yearly' : purchase.planId === 'monthly' ? 'Eazee Pro Monthly' : purchase.productId;

  return (
    <View className="mx-3 mt-2 rounded-2xl bg-white px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-base font-semibold text-gray-900" numberOfLines={1}>{plan}</Text>
        <Text className="ml-3 text-base font-semibold text-gray-900">
          {formatPrice(purchase.price, purchase.currency, purchase.isTrial)}
        </Text>
      </View>
      {!!subtitle && <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={1}>{subtitle}</Text>}
      <View className="mt-1.5 flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <Text className={`overflow-hidden rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSES[purchase.status]}`}>
          {PURCHASE_STATUS_LABELS[purchase.status]}
        </Text>
        <Text className="text-xs text-gray-600">{PURCHASE_TYPE_LABELS[purchase.type]}</Text>
        <Text className="text-xs text-gray-600">Bought {formatSubscriptionDate(purchase.purchaseDate)}</Text>
        {!!purchase.expiresDate && (
          <Text className="text-xs text-gray-600">
            {purchase.status === 'active' ? 'Renews' : 'Ends'} {formatSubscriptionDate(purchase.expiresDate)}
          </Text>
        )}
        {purchase.environment !== 'Production' && (
          <Text className="text-xs font-semibold text-violet-700">{purchase.environment}</Text>
        )}
      </View>
    </View>
  );
}
