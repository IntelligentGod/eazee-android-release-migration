import React from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import SimpleScreen, { ErrorState, LoadingState } from '@/components/SimpleScreen';
import PurchaseRow from '@/components/subscription/PurchaseRow';
import { fetchPurchaseHistory, type PurchaseRecord } from '@/lib/subscriptionApi';
import { usePagedServerData } from '@/lib/usePagedServerData';
import { useAuthSession } from './context/AuthSessionContext';

/** The signed-in user's App Store transactions, as the server recorded them. */
export default function PurchaseHistoryScreen() {
  const { user } = useAuthSession();
  const history = usePagedServerData<PurchaseRecord>(
    async (cursor) => {
      const page = await fetchPurchaseHistory(cursor);
      return { items: page.transactions, nextCursor: page.nextCursor };
    },
    user?.uid ?? 'signed-out'
  );

  return (
    <SimpleScreen title="Purchase history" subtitle="Eazee Pro subscriptions">
      {history.error && !history.items.length ? (
        <ErrorState error={history.error} onRetry={history.reload} />
      ) : history.isLoading && !history.items.length ? (
        <LoadingState />
      ) : (
        <FlatList
          data={history.items}
          keyExtractor={(item) => item.transactionId}
          renderItem={({ item }) => <PurchaseRow purchase={item} />}
          onRefresh={history.reload}
          refreshing={history.isLoading && history.items.length > 0}
          onEndReached={history.loadMore}
          ListEmptyComponent={(
            <View className="items-center p-8">
              <Text className="text-center text-sm text-gray-600">No purchases yet.</Text>
            </View>
          )}
          ListFooterComponent={history.hasMore ? (
            <TouchableOpacity accessibilityRole="button" onPress={history.loadMore} className="items-center p-4">
              <Text className="font-semibold text-[#0F5A4D]">Load more</Text>
            </TouchableOpacity>
          ) : (
            <Text className="px-4 py-4 text-center text-xs text-gray-500">
              Refunds and billing are handled by Apple. To cancel or change your plan, use Manage or cancel on the Eazee Pro page.
            </Text>
          )}
        />
      )}
    </SimpleScreen>
  );
}
