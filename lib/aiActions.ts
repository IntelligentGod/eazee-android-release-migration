import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_URL } from '@/config/backend';
import { auth } from '@/firebaseConfig';
import { getFirebaseAppCheckHeaders } from '@/lib/firebaseAppCheck';
import { getDeviceTimeZone } from '@/lib/aiRequest';
import { getUsagePeriodKey } from '@/lib/subscriptionUsage';

/**
 * AI actions: each item Eazee creates, changes or deletes for the user (5 tasks are 5 actions).
 * Chatting, suggestions, recipes and guidance are not actions, and neither are the user's own
 * edits. Free gets a daily allowance (8 by default), Pro is unlimited.
 *
 * Before a tool changes anything, the app reserves what it needs on the server, which may grant
 * fewer when the day's allowance is nearly used; the ones that did not happen are released, so
 * only successful changes count. The server keeps the count, per day in the user's time zone.
 */
export type AiActionsAllowance = {
  /** Actions used today. */
  used: number;
  /** null when the plan is unlimited. */
  limit: number | null;
  /** The local day this was read on (allowances reset at midnight). */
  day: string;
};

/** Free users see a quiet notice once this many actions are left. */
export const AI_ACTIONS_LOW_THRESHOLD = 2;

const STORAGE_KEY = 'aiActions:allowance:v1:';
let current: AiActionsAllowance | null = null;
const listeners = new Set<(allowance: AiActionsAllowance | null) => void>();

const today = () => getUsagePeriodKey();

/** Today's allowance as last reported; null until known, and after midnight until the next report. */
export function getAiActionsAllowance(): AiActionsAllowance | null {
  return current && current.day === today() ? current : null;
}

export function getRemainingAiActions(allowance = getAiActionsAllowance()): number | null {
  if (!allowance || allowance.limit === null) return null;
  return Math.max(0, allowance.limit - allowance.used);
}

export function subscribeAiActionsAllowance(listener: (allowance: AiActionsAllowance | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setAllowance(next: AiActionsAllowance | null) {
  current = next;
  const userId = auth.currentUser?.uid;
  if (userId) {
    (next
      ? AsyncStorage.setItem(`${STORAGE_KEY}${userId}`, JSON.stringify(next))
      : AsyncStorage.removeItem(`${STORAGE_KEY}${userId}`)
    ).catch(() => {});
  }
  listeners.forEach((listener) => listener(getAiActionsAllowance()));
}

/** Reads the cached allowance for this account, e.g. when the chat opens. */
export async function loadAiActionsAllowance(userId: string) {
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(`${STORAGE_KEY}${userId}`)) || 'null');
    if (stored && typeof stored.used === 'number' && (stored.limit === null || typeof stored.limit === 'number') && typeof stored.day === 'string') {
      current = stored;
      listeners.forEach((listener) => listener(getAiActionsAllowance()));
    }
  } catch {}
  return getAiActionsAllowance();
}

/** From the subscription status (plan limits and today's usage). */
export function setAiActionsAllowanceFromStatus(limit: number | null | undefined, used: number | undefined) {
  // A server without AI action counting reports no usage for it: show no count then, as
  // nothing is being counted.
  if (used === undefined) {
    setAllowance(null);
    return;
  }
  setAllowance({ used: Math.max(0, Number(used) || 0), limit: limit === undefined ? null : limit, day: today() });
}

async function postAiActions(path: 'reserve' | 'release', count: number) {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (!idToken) return null;
  const response = await fetch(`${SERVER_URL}/usage/ai-actions/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      'X-Eazee-Timezone': getDeviceTimeZone(),
      ...await getFirebaseAppCheckHeaders(),
    },
    body: JSON.stringify({ count }),
  });
  // 404: a server from before AI action counting. Nothing is counted, so no count is shown.
  if (response.status === 404) setAllowance(null);
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  if (typeof body?.granted !== 'number') return null;
  setAllowance({ used: Number(body.used) || 0, limit: typeof body.limit === 'number' ? body.limit : null, day: today() });
  return body.granted as number;
}

/**
 * Reserves up to `count` actions and returns how many were granted. If the server cannot be
 * reached (or runs an older version without this endpoint), everything is granted: a network
 * problem should not stop Eazee from working.
 */
export async function reserveAiActions(count: number): Promise<number> {
  const wanted = Math.min(100, Math.max(0, Math.floor(count)));
  if (!wanted) return 0;
  try {
    return (await postAiActions('reserve', wanted)) ?? wanted;
  } catch {
    return wanted;
  }
}

/** Gives back reserved actions that did not happen (failed or skipped items). */
export async function releaseAiActions(count: number): Promise<void> {
  const unused = Math.min(100, Math.max(0, Math.floor(count)));
  if (!unused) return;
  try {
    await postAiActions('release', unused);
  } catch {}
}

export const AI_ACTIONS_LIMIT_ERROR = 'AI_ACTIONS_LIMIT_REACHED';

export const getAiActionsLimitMessage = (limit?: number | null) =>
  `You've used your ${typeof limit === 'number' ? `${limit} ` : ''}free AI actions today. You can still chat with Eazee as much as you like! Upgrade to Pro for unlimited AI actions.`;

/** "5/8 AI actions remaining"; null when unlimited or not known yet. */
export function formatAiActionsRemaining(allowance = getAiActionsAllowance()): string | null {
  const remaining = getRemainingAiActions(allowance);
  return remaining === null || !allowance || allowance.limit === null ? null : `${remaining}/${allowance.limit} AI actions remaining`;
}

/**
 * For the chat's own buttons that create items (Add tasks, Save goal): reserves `count`, runs
 * `save` with the number granted, and gives back what was not saved. Returns null when no
 * actions are left.
 */
export async function withAiActions<T>(count: number, save: (granted: number) => Promise<{ value: T; done: number }>) {
  const granted = await reserveAiActions(count);
  if (granted === 0) return null;
  let done = 0;
  try {
    const outcome = await save(granted);
    done = Math.min(granted, outcome.done);
    return { value: outcome.value, granted };
  } finally {
    if (done < granted) await releaseAiActions(granted - done);
  }
}

/** Today's allowance, kept current as actions are used (null when unknown or past midnight). */
export function useAiActionsAllowance(userId?: string | null) {
  const [allowance, setAllowanceState] = useState<AiActionsAllowance | null>(() => getAiActionsAllowance());
  useEffect(() => {
    const unsubscribe = subscribeAiActionsAllowance(setAllowanceState);
    if (userId) void loadAiActionsAllowance(userId).then(setAllowanceState);
    return unsubscribe;
  }, [userId]);
  return allowance;
}
