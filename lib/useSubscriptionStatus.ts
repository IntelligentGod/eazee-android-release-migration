import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/firebaseConfig';
import {
  FREE_SUBSCRIPTION_STATUS,
  hasUnlimitedAccess,
  UNLIMITED_ACCESS_PLAN_ID,
  readCachedSubscriptionStatus,
  type SubscriptionStatus,
  type SubscriptionTier,
} from '@/lib/subscription';
import {
  DEFAULT_SUBSCRIPTION_LIMITS,
  readCachedSubscriptionLimits,
  type PlanLimits,
  type SubscriptionLimits,
} from '@/lib/subscriptionLimits';
import { EMPTY_DAILY_USAGE, readDailyUsage, type DailyUsage } from '@/lib/subscriptionUsage';

export type SubscriptionSnapshot = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  isSandboxAccount: boolean;
  usage: DailyUsage;
  /** Both plans' limits, as last reported by the server. */
  limits: SubscriptionLimits;
  /** The limits of this account's plan. */
  planLimits: PlanLimits;
  /** null when the plan has no limit. */
  remainingAiActions: number | null;
  remainingVoiceSeconds: number | null;
  isLoading: boolean;
  refresh: () => void;
};

/**
 * Reads the cached entitlement, limits and today's usage. Purchases, syncs and
 * the daily reset all happen outside React, so `refresh` is exposed for screens
 * that act and need to re-read.
 */
export function useSubscriptionStatus(userId?: string | null): SubscriptionSnapshot {
  const [status, setStatus] = useState<SubscriptionStatus>(FREE_SUBSCRIPTION_STATUS);
  const [usage, setUsage] = useState<DailyUsage>(EMPTY_DAILY_USAGE);
  const [limits, setLimits] = useState<SubscriptionLimits>(DEFAULT_SUBSCRIPTION_LIMITS);
  const [isLoading, setIsLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!userId) {
      setStatus(FREE_SUBSCRIPTION_STATUS);
      setUsage(EMPTY_DAILY_USAGE);
      setLimits(DEFAULT_SUBSCRIPTION_LIMITS);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void Promise.all([readCachedSubscriptionStatus(userId), readDailyUsage(userId), readCachedSubscriptionLimits(userId)])
      .then(([nextStatus, nextUsage, nextLimits]) => {
        if (cancelled) return;
        setStatus(nextStatus);
        setUsage(nextUsage);
        setLimits(nextLimits);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce, userId]);

  const isSandboxAccount = hasUnlimitedAccess(auth.currentUser?.email);
  const tier: SubscriptionTier = status.isPro || isSandboxAccount ? 'pro' : 'free';
  const planLimits = limits[tier];
  return {
    tier,
    // A plan actually recorded for the account still wins over the sandbox default.
    status: isSandboxAccount
      ? { ...status, isPro: true, planId: status.planId ?? UNLIMITED_ACCESS_PLAN_ID }
      : status,
    /** Pro through the sandbox email, with no store purchase behind it. */
    isSandboxAccount,
    usage,
    limits,
    planLimits,
    remainingAiActions: planLimits.chatMessagesPerDay === null
      ? null
      : Math.max(0, planLimits.chatMessagesPerDay - usage.aiActions),
    remainingVoiceSeconds: planLimits.voiceMinutesPerDay === null
      ? null
      : Math.max(0, planLimits.voiceMinutesPerDay * 60 - usage.voiceSeconds),
    isLoading,
    refresh,
  };
}
