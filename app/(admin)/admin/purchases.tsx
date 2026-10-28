import React, { useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import SimpleScreen, { ErrorState, LoadingState } from '@/components/SimpleScreen';
import { FilterChips, type ChipOption } from '@/components/admin/AdminControls';
import PurchaseRow from '@/components/subscription/PurchaseRow';
import { ADMIN_ENVIRONMENT_OPTIONS, adminApi, type AdminEnvironment, type AdminPurchase } from '@/lib/adminApi';
import { SUBSCRIPTION_PLANS } from '@/lib/subscription';
import type { PurchaseRecord } from '@/lib/subscriptionApi';
import { usePagedServerData } from '@/lib/usePagedServerData';

const PRODUCT_OPTIONS: ChipOption<string>[] = SUBSCRIPTION_PLANS.map((plan) => ({ value: plan.productId, label: plan.title }));
const STATUS_OPTIONS: ChipOption<PurchaseRecord['status']>[] = [
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
  { value: 'upgraded', label: 'Upgraded' },
  { value: 'refunded', label: 'Refunded' },
];
type Range = '7' | '30' | '90';
const RANGE_OPTIONS: ChipOption<Range>[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const utcDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export default function AdminPurchasesScreen() {
  const [productId, setProductId] = useState<string | null>(null);
  const [status, setStatus] = useState<PurchaseRecord['status'] | null>(null);
  const [environment, setEnvironment] = useState<AdminEnvironment | null>(null);
  const [range, setRange] = useState<Range | null>('30');
  const filters = {
    productId: productId ?? undefined,
    status: status ?? undefined,
    environment: environment ?? undefined,
    from: range ? utcDaysAgo(Number(range)) : undefined,
  };
  const purchases = usePagedServerData<AdminPurchase>(
    async (cursor) => {
      const page = await adminApi.purchases({ ...filters, cursor });
      return { items: page.purchases, nextCursor: page.nextCursor };
    },
    JSON.stringify(filters)
  );

  return (
    <SimpleScreen title="Purchases">
      <View className="pt-3" style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)' }}>
        <FilterChips label="Product" options={PRODUCT_OPTIONS} value={productId} onChange={setProductId} />
        <FilterChips label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        <FilterChips label="Environment" options={ADMIN_ENVIRONMENT_OPTIONS} value={environment} onChange={setEnvironment} />
        <FilterChips label="Date" options={RANGE_OPTIONS} value={range} onChange={setRange} />
      </View>
      {purchases.error && !purchases.items.length ? (
        <ErrorState error={purchases.error} onRetry={purchases.reload} />
      ) : purchases.isLoading && !purchases.items.length ? (
        <LoadingState />
      ) : (
        <FlatList
          data={purchases.items}
          keyExtractor={(item) => `${item.uid}/${item.transactionId}`}
          renderItem={({ item }) => <PurchaseRow purchase={item} subtitle={item.email || item.uid} />}
          onRefresh={purchases.reload}
          refreshing={purchases.isLoading && purchases.items.length > 0}
          onEndReached={purchases.loadMore}
          ListEmptyComponent={<Text className="p-8 text-center text-sm text-gray-600">No purchases match these filters.</Text>}
          ListFooterComponent={purchases.hasMore ? (
            <TouchableOpacity accessibilityRole="button" onPress={purchases.loadMore} className="items-center p-4">
              <Text className="font-semibold text-[#0F5A4D]">Load more</Text>
            </TouchableOpacity>
          ) : null}
        />
      )}
    </SimpleScreen>
  );
}
