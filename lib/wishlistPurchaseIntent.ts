import { SERVER_URL } from '@/config/backend';
import { getAiResponseErrorMessage } from '@/lib/aiAuth';
import { getAiRequestHeaders as getFirebaseHeaders } from '@/lib/aiRequest';

export type WishlistPurchaseIntentSurface = 'goal' | 'task' | 'recipe' | 'skill';

export type WishlistPurchaseIntentResult = {
  hasPurchaseIntent: boolean;
  itemName?: string;
  confidence: number;
};

type WishlistPurchaseIntentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const PURCHASE_INTENT_TERMS = /\b(buy|order|purchase|wishlist|wish list|add (?:it|this|that|the first one|the second one|the third one|first one|second one|third one|1st one|2nd one|3rd one|the first book|the second book|the third book|.+? to (?:my )?(?:wishlist|wish list))|save (?:it|this|that|.+?) (?:to|in) (?:my )?(?:wishlist|wish list))\b/i;

export const normalizeWishlistItemName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bknif\b/gi, 'knife')
    .replace(/\broller smates\b/gi, 'roller skates');

export const getWishlistPurchaseReferenceMessages = (
  messages?: WishlistPurchaseIntentMessage[]
): WishlistPurchaseIntentMessage[] => {
  if (!Array.isArray(messages)) {
    return [];
  }

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message?.role === 'assistant' && String(message.content || '').trim().length > 0);

  return lastAssistantMessage
    ? [{
        role: 'assistant',
        content: String(lastAssistantMessage.content || '').trim(),
      }]
    : [];
};

const normalizeSurface = (value: unknown): WishlistPurchaseIntentSurface | null =>
  value === 'goal' || value === 'task' || value === 'recipe' || value === 'skill'
    ? value
    : null;

export const normalizeWishlistPurchaseIntentResult = (payload: any): WishlistPurchaseIntentResult => {
  const itemName = typeof payload?.itemName === 'string'
    ? normalizeWishlistItemName(payload.itemName)
    : '';
  const confidence = Number(payload?.confidence);
  const hasPurchaseIntent = payload?.hasPurchaseIntent === true && itemName.length > 0;

  return {
    hasPurchaseIntent,
    ...(hasPurchaseIntent ? { itemName } : {}),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(confidence, 1)) : 0,
  };
};

export const shouldRequestWishlistPurchaseIntent = (message: string) =>
  PURCHASE_INTENT_TERMS.test(message.trim());

export const requestWishlistPurchaseIntent = async (input: {
  message: string;
  surface: WishlistPurchaseIntentSurface;
  contextTitle?: string;
  contextDetails?: string;
  recentMessages?: WishlistPurchaseIntentMessage[];
}): Promise<WishlistPurchaseIntentResult> => {
  if (!shouldRequestWishlistPurchaseIntent(input.message)) {
    return { hasPurchaseIntent: false, confidence: 0 };
  }

  const surface = normalizeSurface(input.surface);
  if (!surface) {
    throw new Error('Invalid purchase intent surface.');
  }

  const response = await fetch(`${SERVER_URL}/ai/wishlist/purchase-intent`, {
    method: 'POST',
    headers: await getFirebaseHeaders('wishlistIntent'),
    body: JSON.stringify({
      message: input.message,
      surface,
      contextTitle: input.contextTitle || '',
      contextDetails: input.contextDetails || '',
      recentMessages: getWishlistPurchaseReferenceMessages(input.recentMessages),
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getAiResponseErrorMessage(payload, response.status));
  }

  return normalizeWishlistPurchaseIntentResult(payload);
};
