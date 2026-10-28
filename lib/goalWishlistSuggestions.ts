import { SERVER_URL } from '@/config/backend';
import { getAiResponseErrorMessage } from '@/lib/aiAuth';
import { getAiRequestHeaders as getFirebaseHeaders } from '@/lib/aiRequest';
import type { GoalTodoTimeframe } from '@/utils/goalTimeframes';
import type { TodoTaskKind } from '@/lib/todoClassification';

export type GoalWishlistSuggestion = {
  itemName: string;
  reason?: string;
  confidence: number;
};

export type GoalWishlistSuggestionsResult = {
  suggestions: GoalWishlistSuggestion[];
};

export const normalizeGoalWishlistSuggestionItemName = (value: string) =>
  value.trim().replace(/\s+/g, ' ');

const normalizeGoalWishlistSuggestionReason = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

const getGoalWishlistSuggestionDedupeKey = (itemName: string) =>
  itemName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clampConfidence = (value: unknown) => {
  const confidence = Number(value);
  return Number.isFinite(confidence) ? Math.max(0, Math.min(confidence, 1)) : 0;
};

const normalizeTimeframe = (value: unknown): Exclude<GoalTodoTimeframe, 'nextWeek'> | undefined =>
  value === 'thisWeek' || value === 'thisMonth' || value === 'thisYear' || value === 'longTerm'
    ? value
    : undefined;

const normalizeTaskKind = (value: unknown): TodoTaskKind | undefined =>
  value === 'normal' || value === 'recipe' || value === 'skill' ? value : undefined;

export const normalizeGoalWishlistSuggestionsResult = (payload: any): GoalWishlistSuggestionsResult => {
  const rawSuggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  const suggestions: GoalWishlistSuggestion[] = [];
  const seen = new Set<string>();

  for (const rawSuggestion of rawSuggestions) {
    const itemName = typeof rawSuggestion?.itemName === 'string'
      ? normalizeGoalWishlistSuggestionItemName(rawSuggestion.itemName)
      : '';
    const key = getGoalWishlistSuggestionDedupeKey(itemName);
    if (!itemName || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    const reason = normalizeGoalWishlistSuggestionReason(rawSuggestion?.reason);
    suggestions.push({
      itemName,
      ...(reason ? { reason } : {}),
      confidence: clampConfidence(rawSuggestion?.confidence),
    });

    if (suggestions.length >= 3) {
      break;
    }
  }

  return { suggestions };
};

export const buildGoalWishlistSuggestionsRequestBody = (input: {
  goalTitle: string;
  goalDetails?: string;
  timeframe?: GoalTodoTimeframe | null;
  taskKind?: TodoTaskKind | null;
}) => {
  const timeframe = normalizeTimeframe(input.timeframe);
  const taskKind = normalizeTaskKind(input.taskKind);

  return {
    goalTitle: input.goalTitle,
    goalDetails: input.goalDetails || '',
    ...(timeframe ? { timeframe } : {}),
    ...(taskKind ? { taskKind } : {}),
    userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
  };
};

export const requestGoalWishlistSuggestions = async (input: {
  goalTitle: string;
  goalDetails?: string;
  timeframe?: GoalTodoTimeframe | null;
  taskKind?: TodoTaskKind | null;
}): Promise<GoalWishlistSuggestionsResult> => {
  const goalTitle = input.goalTitle.trim();
  if (!goalTitle) {
    return { suggestions: [] };
  }

  const response = await fetch(`${SERVER_URL}/ai/goal-wishlist-suggestions`, {
    method: 'POST',
    headers: await getFirebaseHeaders('wishlistIntent'),
    body: JSON.stringify(buildGoalWishlistSuggestionsRequestBody({
      ...input,
      goalTitle,
    })),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getAiResponseErrorMessage(payload, response.status));
  }

  return normalizeGoalWishlistSuggestionsResult(payload);
};
