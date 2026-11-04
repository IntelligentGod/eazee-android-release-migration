import React, { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppToast from '@/components/AppToast';
import { formatAiActionsLeftToday, subscribeAiActionsUsed } from '@/lib/aiActions';

/**
 * After every AI action, on any screen (chat, calendar, to-do...), shows how many free AI actions
 * are left today. Pro is unlimited, so nothing shows there.
 */
export default function AiActionsLeftToast() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; nonce: number } | null>(null);

  useEffect(() => subscribeAiActionsUsed(() => {
    const message = formatAiActionsLeftToday();
    if (message) setToast({ message, nonce: Date.now() });
  }), []);

  return <AppToast message={toast?.message ?? null} nonce={toast?.nonce ?? 0} top={insets.top + 120} visibleMs={3000} />;
}
