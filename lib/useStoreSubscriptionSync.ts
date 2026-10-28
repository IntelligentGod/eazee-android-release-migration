import { useEffect } from 'react';
import { AppState } from 'react-native';

import { listenForStoreTransactions, syncStoreSubscriptionStatus } from '@/lib/storeBilling';

/**
 * Keeps the signed-in user's cached Pro status in line with the App Store: at
 * launch, on every return to the foreground, and whenever StoreKit delivers a
 * transaction (renewal, or a purchase finished while the app was closed).
 */
export function useStoreSubscriptionSync(userId?: string | null) {
  useEffect(() => {
    if (!userId) return;

    const sync = () => void syncStoreSubscriptionStatus(userId);
    sync();

    const stopListening = listenForStoreTransactions(sync);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      stopListening();
      appStateSubscription.remove();
    };
  }, [userId]);
}
