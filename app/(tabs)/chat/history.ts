import { Q } from '@nozbe/watermelondb';
import * as FileSystem from 'expo-file-system/legacy';
import { database } from '../../../database/database';
import ChatMessageModel from '../../../database/models/ChatMessageModel';
import ChatSessionModel from '../../../database/models/ChatSessionModel';
import type { ChatSessionListItem, ChatUIMessage } from './types';

type AppendMessagesOptions = {
  seedMessages?: ChatUIMessage[];
  titleSourceMessages?: ChatUIMessage[];
};

const MESSAGE_META_CARD_TYPE = '__chatMessageMeta';
const MESSAGE_CLIENT_ID_KEY = '__clientMessageId';
const MESSAGE_DELIVERY_STATUS_KEY = '__deliveryStatus';
const MESSAGE_DELIVERY_ERROR_KEY = '__deliveryError';
const TITLE_WORD_LIMIT = 5;
const CHAT_TITLE_PREFIX_PATTERNS = [
  /^(?:please\s+)+/i,
  /^(?:can you|could you|would you|help me|i need to|i want to|show me|tell me|give me|make|create)\s+/i,
  /^(?:where|how)\s+(?:do|can|should|would|could)\s+(?:i|we|you)\s+/i,
  /^(?:where|how)\s+to\s+/i,
];

export function isMeaningfulChatMessage(message?: ChatUIMessage | null) {
  if (!message) return false;
  const text = typeof message.content === 'string' ? message.content.trim() : '';
  return text.length > 0 || !!message.card;
}

export function normalizeChatSessionTitle(title?: string | null) {
  const clean = (title || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?,:;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return '';

  const words = clean.split(' ');
  if (words.length <= TITLE_WORD_LIMIT) return clean;
  return words.slice(0, TITLE_WORD_LIMIT).join(' ');
}

function stripChatTitlePrefix(value: string) {
  let clean = value;
  for (let i = 0; i < 3; i += 1) {
    const next = CHAT_TITLE_PREFIX_PATTERNS.reduce((current, pattern) => current.replace(pattern, ''), clean).trim();
    if (!next || next === clean) return clean;
    clean = next;
  }
  return clean;
}

export function deriveChatSessionTitle(messages: ChatUIMessage[]) {
  const firstUser = messages.find((message) => message.role === 'user' && typeof message.content === 'string' && message.content.trim().length > 0);
  if (!firstUser?.content) return 'New Chat';
  const clean = stripChatTitlePrefix(firstUser.content
    .replace(/\s+/g, ' ')
    .trim());

  return normalizeChatSessionTitle(clean) || 'New Chat';
}

export function sortChatSessions(sessions: ChatSessionListItem[]) {
  return [...sessions].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aTime = a.lastMessageAt || a.createdAt;
    const bTime = b.lastMessageAt || b.createdAt;
    return bTime - aTime;
  });
}

function parseStoredCard(cardJson?: string) {
  if (!cardJson) return undefined;
  try {
    return JSON.parse(cardJson);
  } catch {
    return undefined;
  }
}

function getStoredCardMessageId(card: any) {
  return typeof card?.[MESSAGE_CLIENT_ID_KEY] === 'string'
    ? card[MESSAGE_CLIENT_ID_KEY].trim()
    : '';
}

function getStoredCardDeliveryStatus(card: any): ChatUIMessage['deliveryStatus'] | undefined {
  if (card?.[MESSAGE_DELIVERY_STATUS_KEY] === 'failed' || card?.deliveryStatus === 'failed') {
    return 'failed';
  }
  return undefined;
}

function getStoredCardDeliveryError(card: any) {
  const value = card?.[MESSAGE_DELIVERY_ERROR_KEY] || card?.deliveryError;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getVisibleStoredCard(card: any) {
  if (!card || typeof card !== 'object') return undefined;
  if (card.type === MESSAGE_META_CARD_TYPE) return undefined;

  const {
    [MESSAGE_CLIENT_ID_KEY]: _clientMessageId,
    [MESSAGE_DELIVERY_STATUS_KEY]: _deliveryStatus,
    [MESSAGE_DELIVERY_ERROR_KEY]: _deliveryError,
    ...visibleCard
  } = card;

  return visibleCard;
}

function buildStoredCardJson(message: ChatUIMessage) {
  const clientMessageId = typeof message.id === 'string' ? message.id.trim() : '';
  const deliveryStatus = message.deliveryStatus === 'failed' ? 'failed' : undefined;
  const deliveryError = typeof message.deliveryError === 'string' ? message.deliveryError.trim() : '';
  const sourceCard = message.card && typeof message.card === 'object' ? message.card : undefined;

  if (!sourceCard && !clientMessageId && !deliveryStatus) return undefined;

  const storedCard = sourceCard
    ? { ...sourceCard }
    : { type: MESSAGE_META_CARD_TYPE };

  if (clientMessageId) {
    storedCard[MESSAGE_CLIENT_ID_KEY] = clientMessageId;
  }
  if (deliveryStatus) {
    storedCard[MESSAGE_DELIVERY_STATUS_KEY] = deliveryStatus;
  } else {
    delete storedCard[MESSAGE_DELIVERY_STATUS_KEY];
  }
  if (deliveryError) {
    storedCard[MESSAGE_DELIVERY_ERROR_KEY] = deliveryError;
  } else {
    delete storedCard[MESSAGE_DELIVERY_ERROR_KEY];
  }

  return JSON.stringify(storedCard);
}

function buildStoredCardJsonFromExisting(cardJson: string | undefined, patch: {
  clientMessageId?: string;
  deliveryStatus?: ChatUIMessage['deliveryStatus'];
  deliveryError?: string;
}) {
  const parsedCard = parseStoredCard(cardJson);
  const visibleCard = getVisibleStoredCard(parsedCard);
  return buildStoredCardJson({
    id: patch.clientMessageId || getStoredCardMessageId(parsedCard),
    role: 'user',
    card: visibleCard,
    deliveryStatus: patch.deliveryStatus,
    deliveryError: patch.deliveryError,
  });
}

function getStoredVoiceMessageAudioUri(cardJson?: string) {
  const card = parseStoredCard(cardJson);
  const audioUri = card?.type === 'voiceMessage' && typeof card.audioUri === 'string'
    ? card.audioUri.trim()
    : '';
  return audioUri || null;
}

/** The opening message of every Fix my life chat; it also marks a chat as one. */
export const FIX_MY_LIFE_PROMPT = 'Fix my life: plan my whole week.';

function mapSession(row: ChatSessionModel, lastMessageAt?: number, isFixMyLife = false): ChatSessionListItem {
  return {
    id: row.id,
    isFixMyLife,
    title: row.title || 'New Chat',
    summary: row.summary || '',
    titleManuallySet: !!row.titleManuallySet,
    titleGeneratedAt: Number(row.titleGeneratedAt || 0),
    pinned: !!row.pinned,
    lastMessageAt: Number(row.lastMessageAt || lastMessageAt || 0),
    updatedAt: new Date(row.updatedAt as any).getTime() || 0,
    createdAt: new Date(row.createdAt as any).getTime() || 0,
  };
}

export async function listChatSessions() {
  const rows = await database.collections.get<ChatSessionModel>('chat_sessions').query().fetch();
  const missingLastMessage = rows.filter((row) => !row.lastMessageAt);
  const backfilledLastMessageAt = new Map<string, number>();

  if (missingLastMessage.length > 0) {
    const allMessages = await database.collections.get<ChatMessageModel>('chat_messages').query().fetch();
    const lastMessageBySession = new Map<string, number>();

    for (const message of allMessages) {
      const timestamp = new Date(message.createdAt as any).getTime();
      if (!timestamp) continue;
      const previous = lastMessageBySession.get(message.sessionId) || 0;
      if (timestamp > previous) lastMessageBySession.set(message.sessionId, timestamp);
    }

    await database.write(async () => {
      for (const row of missingLastMessage) {
        const lastMessageAt = lastMessageBySession.get(row.id);
        if (!lastMessageAt) continue;
        backfilledLastMessageAt.set(row.id, lastMessageAt);
        await row.update((record) => {
          record.lastMessageAt = lastMessageAt;
        });
      }
    });
  }

  // Fix my life chats all open with the same message, which tells the two histories apart.
  const fixMyLifeOpeners = await database.collections
    .get<ChatMessageModel>('chat_messages')
    .query(Q.where('role', 'user'), Q.where('content', FIX_MY_LIFE_PROMPT))
    .fetch();
  const fixMyLifeSessionIds = new Set(fixMyLifeOpeners.map((message) => message.sessionId));

  return sortChatSessions(rows.map((row) => mapSession(row, backfilledLastMessageAt.get(row.id), fixMyLifeSessionIds.has(row.id))));
}

export async function loadChatSession(sessionId: string) {
  const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
  const rows = await database.collections
    .get<ChatMessageModel>('chat_messages')
    .query(Q.where('session_id', Q.eq(sessionId)))
    .fetch();

  const messages = rows
    .sort((a, b) => {
      const aTime = new Date(a.createdAt as any).getTime();
      const bTime = new Date(b.createdAt as any).getTime();
      return aTime - bTime;
    })
    .map((row) => {
      const storedCard = parseStoredCard(row.cardJson);
      const clientMessageId = getStoredCardMessageId(storedCard);
      const deliveryStatus = getStoredCardDeliveryStatus(storedCard);
      const deliveryError = getStoredCardDeliveryError(storedCard);
      return {
        id: clientMessageId || row.id,
        role: (row.role as ChatUIMessage['role']) || 'assistant',
        content: row.content || undefined,
        card: getVisibleStoredCard(storedCard),
        deliveryStatus,
        deliveryError,
      };
    });

  return {
    session: mapSession(session),
    messages,
  };
}

export async function ensureChatSession(sessionId: string | null, seedMessages: ChatUIMessage[]) {
  if (sessionId) return sessionId;

  const title = deriveChatSessionTitle(seedMessages);
  let createdId = '';

  await database.write(async () => {
    const session = await database.collections.get<ChatSessionModel>('chat_sessions').create((record) => {
      record.title = title;
      record.summary = '';
      record.pinned = false;
      record.lastMessageAt = 0;
      record.titleManuallySet = false;
      record.titleGeneratedAt = 0;
    });
    createdId = session.id;
  });

  return createdId;
}

export async function appendChatMessagesToSession(
  targetSessionId: string | null,
  messages: ChatUIMessage[],
  options?: AppendMessagesOptions
) {
  const meaningful = messages.filter((message) => isMeaningfulChatMessage(message));
  if (!meaningful.length) return targetSessionId;

  const sessionId = await ensureChatSession(targetSessionId, options?.seedMessages || meaningful);
  if (!sessionId) return null;

  const titleSourceMessages = options?.titleSourceMessages || options?.seedMessages || meaningful;
  const now = Date.now();

  await database.write(async () => {
    const messagesCollection = database.collections.get<ChatMessageModel>('chat_messages');

    for (const message of meaningful) {
      await messagesCollection.create((record) => {
        record.sessionId = sessionId;
        record.role = message.role;
        record.content = typeof message.content === 'string' ? message.content : undefined;
        record.cardJson = buildStoredCardJson(message);
      });
    }

    const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
    await session.update((record) => {
      record.lastMessageAt = now;
      if (!record.titleManuallySet && (!record.title || record.title === 'New Chat')) {
        record.title = deriveChatSessionTitle(titleSourceMessages);
      }
    });
  });

  return sessionId;
}

export async function updateChatMessageDeliveryState(
  sessionId: string | null,
  clientMessageId: string,
  deliveryStatus?: ChatUIMessage['deliveryStatus'],
  deliveryError?: string
) {
  const normalizedMessageId = String(clientMessageId || '').trim();
  if (!sessionId || !normalizedMessageId) return false;

  const rows = await database.collections
    .get<ChatMessageModel>('chat_messages')
    .query(Q.where('session_id', Q.eq(sessionId)))
    .fetch();

  let didUpdate = false;
  await database.write(async () => {
    for (const row of rows) {
      const storedCard = parseStoredCard(row.cardJson);
      const storedClientMessageId = getStoredCardMessageId(storedCard);
      if (storedClientMessageId !== normalizedMessageId && row.id !== normalizedMessageId) {
        continue;
      }

      await row.update((record) => {
        record.cardJson = buildStoredCardJsonFromExisting(record.cardJson, {
          clientMessageId: normalizedMessageId,
          deliveryStatus,
          deliveryError,
        });
      });
      didUpdate = true;
      break;
    }
  });

  return didUpdate;
}

export async function updateChatSessionTitle(sessionId: string, title: string, manuallySet: boolean) {
  const normalizedTitle = normalizeChatSessionTitle(title) || 'New Chat';
  const now = Date.now();

  await database.write(async () => {
    const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
    await session.update((record) => {
      record.title = normalizedTitle;
      record.titleManuallySet = manuallySet;
      record.titleGeneratedAt = manuallySet ? 0 : now;
    });
  });

  return normalizedTitle;
}

export async function updateRecipeTodoOfferCardState(
  sessionId: string,
  offerKey: string,
  patch: { opened?: boolean; dismissed?: boolean }
) {
  const normalizedOfferKey = String(offerKey || '').trim();
  if (!sessionId || !normalizedOfferKey) return;

  const rows = await database.collections
    .get<ChatMessageModel>('chat_messages')
    .query(Q.where('session_id', Q.eq(sessionId)))
    .fetch();

  await database.write(async () => {
    for (const row of rows) {
      const card = parseStoredCard(row.cardJson);
      if (card?.type !== 'recipeTodoOffer' || String(card.offerKey || '').trim() !== normalizedOfferKey) {
        continue;
      }

      await row.update((record) => {
        record.cardJson = JSON.stringify({ ...card, ...patch });
      });
    }
  });
}

export async function updateDayPlanCardState(sessionId: string, draftId: string, card: any) {
  const normalizedDraftId = String(draftId || '').trim();
  if (!sessionId || !normalizedDraftId || card?.type !== 'dayPlan') return;

  const rows = await database.collections
    .get<ChatMessageModel>('chat_messages')
    .query(Q.where('session_id', Q.eq(sessionId)))
    .fetch();

  await database.write(async () => {
    for (const row of rows) {
      const storedCard = parseStoredCard(row.cardJson);
      if (storedCard?.type !== 'dayPlan' || String(storedCard.draftId || '').trim() !== normalizedDraftId) {
        continue;
      }

      await row.update((record) => {
        record.cardJson = JSON.stringify(card);
      });
    }
  });
}

export async function updateChatSessionPin(sessionId: string, pinned: boolean) {
  await database.write(async () => {
    const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
    await session.update((record) => {
      record.pinned = !pinned;
    });
  });
}

export async function deleteChatSessionById(sessionId: string) {
  const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
  const messages = await database.collections
    .get<ChatMessageModel>('chat_messages')
    .query(Q.where('session_id', Q.eq(sessionId)))
    .fetch();
  const voiceAudioUris = messages
    .map((message) => getStoredVoiceMessageAudioUri(message.cardJson))
    .filter((audioUri): audioUri is string => !!audioUri);

  await database.write(async () => {
    for (const message of messages) {
      await message.destroyPermanently();
    }

    await session.destroyPermanently();
  });

  await Promise.all(
    voiceAudioUris.map((audioUri) =>
      FileSystem.deleteAsync(audioUri, { idempotent: true }).catch(() => { })
    )
  );
}
