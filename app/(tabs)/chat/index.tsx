import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, Easing, FlatList, Image, ImageBackground, Keyboard, Linking, Modal, Platform, RefreshControl, ScrollView, Share, StyleSheet, type ScrollViewProps, Text, TouchableOpacity, View } from 'react-native';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useDeepgramTranscription } from '../../../lib/useDeepgramTranscription';
import { getDeepgramConfig } from '../../../config/deepgram';
import { database } from '../../../database/database';
import ChatSessionModel from '../../../database/models/ChatSessionModel';
import TodoModel from '../../../database/models/TodoModel';
import { executeToolCall } from './tools/engine';
import ScrollViewWithBar from '@/components/ScrollViewWithBar';
import AppToast from '@/components/AppToast';
import { appendCreatedTodoItems, getCreatedCalendarItems, getCreatedTodoItems, getLastDayPlan, getLastQueryItems, getLastCalendarItems, resetToolMemory, setLastCalendarItems, setLastDayPlan, setLastQueryItems } from './tools/memory';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import Markdown, { MarkdownIt, renderRules } from 'react-native-markdown-display';
import type { ASTNode, RenderRules } from 'react-native-markdown-display';
import { TodoCard, CalendarListCard, CalendarDetailCard, DailyOverviewCard, DayPlanCard, NavigationShortcutCard, GoalQuotaScheduleCard, PlanLegendCard, RecipeTodoOfferCard, type RecipeTodoOfferCardValue } from './cards';
import { AiActionsLimitCard, AiActionsNotice } from './cards/AiActionsCards';
import { formatAiActionsRemaining, getAiActionsAllowance, getAiActionsLimitMessage, useAiActionsAllowance, withAiActions } from '@/lib/aiActions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarInset } from '@/components/navigation/floatingTabBar';
import AIInputBox from '@/components/AIInputBox';
import AiReplyLoadingOverlay from '@/components/AiReplyLoadingOverlay';
import FancyText from '@/components/FancyText';
import ScreenHeader from '@/components/ScreenHeader';
import LiquidGlassIconButton from '@/components/LiquidGlassIconButton';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import SSEEventSource from 'react-native-sse';
import { buildChatSystemMessages } from './prompt';
import { ChatHistoryModal, RenameChatDialog } from './ChatHistoryModal';
import { FIX_MY_LIFE_PROMPT, appendChatMessagesToSession, deleteChatSessionById, ensureChatSession, isMeaningfulChatMessage, listChatSessions, loadChatSession, normalizeChatSessionTitle, updateChatSessionPin, updateChatSessionTitle, updateRecipeTodoOfferCardState, updateDayPlanCardState, updateChatMessageDeliveryState } from './history';
import type { ChatSessionListItem, ChatUIMessage } from './types';
import type { DayPlanCardValue } from './dayPlan';
import type { CompactAiChatHandoff } from '@/lib/useCompactTabAI';
import { CHAT_SURFACE_RADIUS } from './constants';
import LowerSwipeGesture from '@/components/navigation/LowerSwipeGesture';
import { auth } from '@/firebaseConfig';
import { checkAiFeatureAccess } from '@/lib/subscriptionUsage';
import { loadWeekPlanContext } from '@/lib/weekPlanContext';
import { SERVER_URL } from '@/config/backend';
import { dedupeToolCallsByBatchKey, getToolCallExecutionKey } from '@/lib/toolCallKeys';
import { LinearGradient } from 'expo-linear-gradient';
import { dismissGoalQuotaInitialPrompt, scheduleGoalQuotaAction } from '@/lib/goalGuidance';
import { GoalQuotaDatePickerModal } from './GoalQuotaDatePickerModal';
import { startOfDay } from 'date-fns';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { requestGoalQuotaDateResolution, type GoalQuotaDateResolution } from '@/lib/todoClassification';
import { createTodo } from '@/lib/todoMutations';
import { getRecipeTodoOffer, getRecipeTodoOfferKey } from '@/lib/recipeTodoOffer';
import { Q } from '@nozbe/watermelondb';
import { buildAmazonSearchUrl } from '@/lib/amazonSearch';
import { readProfileCountryCode } from '@/lib/profileCountry';
import { setGuidanceActiveTab } from '@/lib/guidanceActiveTab';
import { GuidedTarget, showGuidanceTab, useGuidance } from '@/components/guidance/GuidanceProvider';
import { getChatAiBarGuidanceTargetId, getChatEazeeButtonGuidanceTargetId, getChatHeaderGuidanceTargetId, getChatPlanDayComposerGuidanceTargetId, getChatWishlistMessageGuidanceTargetId } from '@/lib/navigationHelp';
import { useLeftHandedMode } from '@/lib/useLeftHandedMode';
import {
  AI_BASE_PERSONALIZATION_OPTIONS,
  DEFAULT_AI_PERSONALIZATION_SETTINGS,
  readAiPersonalizationSettings,
  subscribeAiPersonalizationSettings,
  writeAiPersonalizationSettings,
  type AiBasePersonalization,
} from '@/lib/aiPersonalization';
import FirstChatWelcome from '@/components/chat/FirstChatWelcome';
import AssistantMessageActions, { type AssistantMessageActionHandlers } from '@/components/chat/AssistantMessageActions';
import {
  buildFirstChatSystemMessage,
  FIRST_CHAT_STARTERS,
  INITIAL_FIRST_CHAT_STATE,
  readFirstChatState,
  shouldOfferFirstChatWelcome,
  subscribeFirstChatState,
  updateFirstChatState,
  type FirstChatIntent,
  type FirstChatStarter,
  type FirstChatState,
} from '@/lib/firstChatOnboarding';
import { trackFirstChatEvent } from '@/lib/firstChatAnalytics';
import { ASSISTANT_ACTION_MARKERS_INSTRUCTIONS, parseAssistantMessageExtras } from '@/lib/assistantMessageExtras';
import {
  buildSavedPreferencesSystemMessage,
  getSavedPreferenceLabel,
  readSavedPreferences,
  saveSavedPreference,
  SAVED_PREFERENCE_FIELDS,
} from '@/lib/aiSavedPreferences';
import { guidanceToolHandlers } from './tools/guidance';
import {
  buildFirstChatDataSection,
  buildStarterPrompt,
  loadSavedGoals,
  loadTodaySummary,
  type SavedGoalSummary,
  type TodaySummary,
} from '@/lib/firstChatContext';
import { findPreferenceForAnswer, getRememberPreferenceQuestion, type SavedPreferenceField } from '@/lib/aiSavedPreferences';
import { AI_AUTH_REQUIRED_MESSAGE, getAiResponseErrorMessage, isAiAuthRequiredError } from '@/lib/aiAuth';
import { getFirebaseAppCheckHeaders } from '@/lib/firebaseAppCheck';
import { getAiRequestHeaders } from '@/lib/aiRequest';
import { requestAiDataSharingConsent } from '@/lib/aiDataSharingConsent';
import { useAuthSession } from '@/app/context/AuthSessionContext';
import {
  addMemory,
  buildChatMemories,
  forgetMemory,
  readCachedMemories,
  refreshMemories,
} from '@/lib/memories';
import {
  buildAboutMeChatContext,
  canShowAboutMeInvite,
  hasAboutMeContent,
  readAboutMeInviteState,
  readCachedAboutMeProfile,
  refreshAboutMeProfile,
  subscribeAboutMeProfile,
  trackAboutMeEvent,
  writeAboutMeInviteState,
  type AboutMeInviteState,
} from '@/lib/aboutMe/profile';
import { openNewChatAfterTutorial } from '@/lib/tutorialEnd';
import {
  PREFERENCE_FOLLOW_UP_SYSTEM_MESSAGE,
  claimPreferencePromptChat,
  isPreferencePromptChatOpen,
  pickPreferenceQuestion,
  readPreferencePromptChatIds,
  type PreferenceQuestion,
} from '@/lib/preferencePromptChats';
import {
  TUTORIAL_CALENDAR_EVENT_STEP,
  TUTORIAL_CHAT_DAY_PLAN_STEP,
  TUTORIAL_GOAL_GUIDANCE_STEP,
  TUTORIAL_HOME_OVERVIEW_STEP,
  TUTORIAL_TODO_GUIDANCE_STEP,
  TUTORIAL_WISHLIST_SHOPPING_STEP,
  uncompleteTutorialStep,
  TODO_TUTORIAL_HANDOFF_MESSAGE,
  TUTORIAL_DEMO_TODO_DETAILS,
  TUTORIAL_DEMO_TODO_TITLE,
  completeTutorialStep,
  getTutorialProgress,
  isActiveTutorialStepPending,
  isTutorialDemoTodoReusable,
  isTutorialSessionActive,
  setTutorialTodoDemoTodoId,
  subscribeTutorialProgress,
} from '@/lib/tutorial';
const CALENDAR_CARD_TYPES = new Set(['calendarList', 'calendarDetail']);
const CHAT_TEXT_FONT_SIZE = 16;
const CHAT_TEXT_LINE_HEIGHT = 20;
const CHAT_BOTTOM_THRESHOLD = 40;
const CHAT_HEADER_GLASS_BUTTON_SIZE = 44;
const CHAT_HEADER_GLASS_EDGE_MARGIN = 4;
const CHAT_HEADER_GLASS_TINT_COLOR = 'rgba(0, 67, 74, 0.32)';
const CHAT_HEADER_GLASS_FALLBACK_BACKGROUND = 'rgba(0, 67, 74, 0.28)';
const CHAT_HEADER_GLASS_FALLBACK_BORDER = 'rgba(200, 255, 251, 0.24)';
const CHAT_HEADER_GLASS_ICON_COLOR = '#01636C';
const MAX_TRACKED_TOOL_CALL_KEYS = 200;
const CHAT_BLOCK_SPACING = 8;
const CHAT_NESTED_BLOCK_SPACING = 6;
const CHAT_NESTED_LIST_ITEM_SPACING = 4;
const ANDROID_CHAT_KEYBOARD_GAP = 10;
const AUTO_TITLE_MAX_USER_MESSAGES = 1;
const VOICE_MESSAGE_SAMPLE_RATE = 16000;
const VOICE_MESSAGE_CHANNELS = 1;
const VOICE_MESSAGE_BITS_PER_SAMPLE = 16;
const VOICE_MESSAGE_WAVEFORM_BARS = 34;
const VOICE_MESSAGE_LIVE_WAVEFORM_BARS = 26;
const VOICE_MESSAGE_LONG_PRESS_DELAY_MS = 280;
const chatMarkdownParser = MarkdownIt({ typographer: true, linkify: true });

type ChatDayPlanTutorialStage = 'eazee-button' | 'ai-bar' | 'plan-day';

type VoiceMessageCardValue = {
  type: 'voiceMessage';
  audioUri: string;
  durationMs: number;
  waveform: number[];
  transcript: string;
  createdAt: number;
};

type VoiceMessageDraft = VoiceMessageCardValue & {
  isTranscribing: boolean;
  error?: string;
};

type GoalQuotaDatePickInput = {
  planId: string;
  goalId?: string;
  goalTitle: string;
};

type PendingGoalQuotaDateRequest = GoalQuotaDatePickInput & {
  sessionId: string | null;
};

type ChatSendOptions = {
  showUserMessage?: boolean;
  hiddenMessages?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  onRequestStarted?: () => void;
  displayUserMessage?: ChatUIMessage;
  retryMessageId?: string;
};

const toChatTodoCardItem = (todo: any) => ({
  id: String(todo?.id || ''),
  text: String(todo?.text || ''),
  dueDate: todo?.dueDate ? new Date(todo.dueDate).toISOString() : null,
  hasDueTime: !!todo?.hasDueTime,
  completed: !!todo?.completed,
  workspace: String(todo?.workspace || 'Personal'),
});

const isRecurringTodoQueryText = (value: unknown) => {
  const text = String(value || '').toLowerCase();
  if (!text) return false;
  if (/\b(recurring|repeating|repeat(?:s|ing)?)\b/.test(text)) return true;
  return /\b(daily|weekly|monthly)\b/.test(text) && /\b(todo|todos|task|tasks)\b/.test(text);
};

const toTodoMemoryItem = (todo: TodoModel) => ({
  id: String(todo.id),
  text: String(todo.text || ''),
  dueDate: todo.dueDate ? new Date(todo.dueDate).toISOString() : null,
  hasDueTime: !!todo.hasDueTime,
  completed: !!todo.completed,
  starred: !!todo.starred,
  workspace: String(todo.workspace || 'Personal'),
  taskKind: todo.taskKind || null,
  guidancePath: todo.guidancePath || null,
});

const getDefaultRecipeTodoDueDate = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const findExistingTutorialDemoTodo = async () => {
  const rows = await database
    .collections
    .get<TodoModel>('todos')
    .query(
      Q.where('workspace', 'Personal'),
      Q.where('text', TUTORIAL_DEMO_TODO_TITLE)
    )
    .fetch();

  const tutorialRows = rows.filter((todo) => (todo.details || '').trim() === TUTORIAL_DEMO_TODO_DETAILS);
  return tutorialRows.find(isTutorialDemoTodoReusable) || null;
};

const ensureTutorialDemoTodo = async () => {
  const existing = await findExistingTutorialDemoTodo();
  if (existing) {
    return existing;
  }

  const result = await createTodo({
    text: TUTORIAL_DEMO_TODO_TITLE,
    details: TUTORIAL_DEMO_TODO_DETAILS,
    completed: false,
    dueDate: startOfDay(new Date()),
    hasDueTime: false,
    starred: false,
    workspace: 'Personal',
    type: 'basic',
    progress: 0,
    isAmazonUrlLoaded: false,
    amazonUrlLoadAttempts: 0,
    taskKind: 'normal',
    guidancePath: null,
  });

  return result.todo;
};

const CHAT_TUTORIAL_TODO_CREATE_TOOLS = new Set([
  'todo_create_many',
  'todo.create_many',
  'todo_create_with_steps',
]);
const WISHLIST_TUTORIAL_TODO_CREATE_TOOLS = new Set([
  'todo_create_many',
  'todo.create_many',
]);

const isWishlistTutorialCreateTool = (toolName: unknown) =>
  WISHLIST_TUTORIAL_TODO_CREATE_TOOLS.has(String(toolName || '').trim());

const didCreateChatTutorialScheduleItem = (toolName: unknown, result: any) => {
  const name = String(toolName || '').trim();
  if (name === 'calendar_create' || name === 'calendar_create_many') {
    return result?.created === true || !!result?.item?.id;
  }

  if (CHAT_TUTORIAL_TODO_CREATE_TOOLS.has(name)) {
    return Array.isArray(result?.createdItems) && result.createdItems.length > 0;
  }

  return false;
};

const didCreateWishlistTutorialItem = (toolName: unknown, result: any) => {
  if (!isWishlistTutorialCreateTool(toolName)) {
    return false;
  }

  return Array.isArray(result?.createdItems) &&
    result.createdItems.some((item: any) => String(item?.workspace || '').trim() === 'Wishlist');
};

const hasRecipeTodoOfferForKey = (messages: ChatUIMessage[], offerKey: string) =>
  messages.some((message) => message?.card?.type === 'recipeTodoOffer' && message.card.offerKey === offerKey);

const buildRecipeTodoOfferMessage = (messages: ChatUIMessage[]): ChatUIMessage | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    const offer = getRecipeTodoOffer(String(message.content || ''));
    if (!offer || hasRecipeTodoOfferForKey(messages, offer.offerKey)) {
      return null;
    }
    return {
      role: 'assistant',
      content: '',
      card: {
        type: 'recipeTodoOffer',
        recipeTitle: offer.recipeTitle,
        details: String(message.content || '').trim(),
        offerKey: offer.offerKey,
      },
    };
  }

  return null;
};

const patchRecipeTodoOfferMessages = (
  messages: ChatUIMessage[],
  offerKey: string,
  patch: Pick<RecipeTodoOfferCardValue, 'opened' | 'dismissed'>
) => {
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message?.card?.type !== 'recipeTodoOffer' || String(message.card.offerKey || '').trim() !== offerKey) {
      return message;
    }
    changed = true;
    return {
      ...message,
      card: {
        ...message.card,
        ...patch,
      },
    };
  });

  return changed ? nextMessages : messages;
};

const findExistingPersonalRecipeTodo = async (offerKey: string) => {
  const rows = await database.collections
    .get<TodoModel>('todos')
    .query(Q.where('workspace', 'Personal'))
    .fetch();

  return rows
    .filter((todo) =>
      !todo.completed &&
      getRecipeTodoOfferKey(todo.text || '') === offerKey &&
      (todo.taskKind === 'recipe' || !todo.taskKind)
    )
    .sort((left, right) =>
      new Date(right.createdAt as any).getTime() - new Date(left.createdAt as any).getTime()
    )[0] || null;
};

const getGoalQuotaScheduleInputFromCard = (card: any): GoalQuotaDatePickInput | null => {
  if (!card || card.type !== 'goalQuotaSchedule') {
    return null;
  }

  const planId = typeof card.planId === 'string' ? card.planId.trim() : '';
  if (!planId) {
    return null;
  }

  const goalId = typeof card.goal?.id === 'string' ? card.goal.id : undefined;
  return {
    planId,
    goalId,
    goalTitle: String(card.goal?.text || 'Goal'),
  };
};

const findLatestOpenGoalQuotaSchedule = (
  messages: ChatUIMessage[],
  resolvedPlanIds: Set<string>,
  ignoredTypedPlanIds: Set<string>
) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const input = getGoalQuotaScheduleInputFromCard(messages[index]?.card);
    if (input && !resolvedPlanIds.has(input.planId) && !ignoredTypedPlanIds.has(input.planId)) {
      return input;
    }
  }
  return null;
};

const formatGoalQuotaDateLabel = (date: Date) =>
  date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

const clampVoiceLevel = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const formatVoiceDuration = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const getPcmChunkLevel = (chunk: Uint8Array) => {
  let sumSquares = 0;
  let sampleCount = 0;

  for (let index = 0; index + 1 < chunk.length; index += 2) {
    let sample = chunk[index] | (chunk[index + 1] << 8);
    if (sample & 0x8000) sample -= 0x10000;
    const normalized = sample / 32768;
    sumSquares += normalized * normalized;
    sampleCount += 1;
  }

  if (!sampleCount) return 0;
  return clampVoiceLevel(Math.sqrt(sumSquares / sampleCount) * 3.2);
};

const getLiveVoiceLevel = (chunk: Uint8Array) => {
  let sumSquares = 0;
  let peak = 0;
  let sampleCount = 0;

  for (let index = 0; index + 1 < chunk.length; index += 2) {
    let sample = chunk[index] | (chunk[index + 1] << 8);
    if (sample & 0x8000) sample -= 0x10000;
    const normalized = Math.abs(sample / 32768);
    peak = Math.max(peak, normalized);
    sumSquares += normalized * normalized;
    sampleCount += 1;
  }

  if (!sampleCount) return 0;
  const rms = Math.sqrt(sumSquares / sampleCount);
  return clampVoiceLevel(Math.pow(Math.max(rms * 18, peak * 5), 0.72));
};

const getPcmDurationMs = (chunks: Uint8Array[]) => {
  const byteLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytesPerSecond = VOICE_MESSAGE_SAMPLE_RATE * VOICE_MESSAGE_CHANNELS * (VOICE_MESSAGE_BITS_PER_SAMPLE / 8);
  return bytesPerSecond > 0 ? Math.round((byteLength / bytesPerSecond) * 1000) : 0;
};

const getDisplayWaveformLevels = (levels: number[], barCount = VOICE_MESSAGE_WAVEFORM_BARS) => {
  const cleanLevels = levels.map(clampVoiceLevel);
  if (!cleanLevels.length) {
    return Array.from({ length: barCount }, () => 0.08);
  }

  if (cleanLevels.length <= barCount) {
    return [
      ...cleanLevels,
      ...Array.from({ length: barCount - cleanLevels.length }, () => 0),
    ].map((level) => Math.max(0.08, level));
  }

  return Array.from({ length: barCount }, (_, index) => {
    const start = Math.floor((index * cleanLevels.length) / barCount);
    const end = Math.max(start + 1, Math.floor(((index + 1) * cleanLevels.length) / barCount));
    let peak = 0;
    for (let levelIndex = start; levelIndex < end; levelIndex += 1) {
      peak = Math.max(peak, cleanLevels[levelIndex] || 0);
    }
    return Math.max(0.08, peak);
  });
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    let part = '';
    for (let byteIndex = 0; byteIndex < chunk.length; byteIndex += 1) {
      part += String.fromCharCode(chunk[byteIndex]);
    }
    binary += part;
  }
  return btoa(binary);
};

const buildWavBytes = (chunks: Uint8Array[]) => {
  const dataLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const wavBytes = new Uint8Array(44 + dataLength);
  const view = new DataView(wavBytes.buffer);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  const blockAlign = VOICE_MESSAGE_CHANNELS * (VOICE_MESSAGE_BITS_PER_SAMPLE / 8);
  const byteRate = VOICE_MESSAGE_SAMPLE_RATE * blockAlign;

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, VOICE_MESSAGE_CHANNELS, true);
  view.setUint32(24, VOICE_MESSAGE_SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, VOICE_MESSAGE_BITS_PER_SAMPLE, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (const chunk of chunks) {
    wavBytes.set(chunk, offset);
    offset += chunk.length;
  }

  return wavBytes;
};

const writeVoiceMessageWav = async (chunks: Uint8Array[]) => {
  const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error('No writable audio directory available');
  }
  const fileName = `chat-voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
  const uri = `${directory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(buildWavBytes(chunks)), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
};

const transcribeVoiceMessage = async (
  audioUri: string,
  onUploadTask: (uploadTask: FileSystem.UploadTask) => void,
  isCurrentOperation: () => boolean
) => {
  const firebaseIdToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (!firebaseIdToken) {
    throw new Error('Sign in to transcribe voice messages');
  }
  if (!isCurrentOperation()) {
    throw new Error('Voice transcription cancelled');
  }

  const appCheckHeaders = await getFirebaseAppCheckHeaders();
  if (!isCurrentOperation()) {
    throw new Error('Voice transcription cancelled');
  }

  const uploadTask = FileSystem.createUploadTask(`${SERVER_URL}/deepgram/transcribe`, audioUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${firebaseIdToken}`,
      'Content-Type': 'audio/wav',
      ...appCheckHeaders,
    },
  });
  onUploadTask(uploadTask);
  const response = await uploadTask.uploadAsync();
  if (!response) {
    throw new Error('Voice transcription cancelled');
  }
  const body = (() => {
    try {
      return JSON.parse(response.body);
    } catch {
      return null;
    }
  })();
  if (response.status < 200 || response.status >= 300) {
    const message = typeof body?.error === 'string' ? body.error : 'Voice transcription failed';
    throw new Error(message);
  }

  return typeof body?.transcript === 'string' ? body.transcript.trim() : '';
};

const assistantMessageContentStyle = {
  minWidth: 0 as const,
  flexShrink: 1 as const,
  flexBasis: 0 as const,
  width: '100%' as const,
  maxWidth: '100%' as const,
  overflow: 'hidden' as const,
};

const userMessageTextStyle = {
  color: 'white',
  fontSize: CHAT_TEXT_FONT_SIZE,
  lineHeight: CHAT_TEXT_LINE_HEIGHT,
  minWidth: 0 as const,
  maxWidth: '100%' as const,
  flexShrink: 1 as const,
};

const assistantMarkdownStyle = {
  body: {
    color: 'white',
    fontSize: CHAT_TEXT_FONT_SIZE,
    lineHeight: CHAT_TEXT_LINE_HEIGHT,
    padding: 0,
    margin: 0,
    minWidth: 0,
    flexShrink: 1,
    flexBasis: 0,
    width: '100%' as const,
    maxWidth: '100%' as const,
  },
  text: {
    color: 'white',
    fontSize: CHAT_TEXT_FONT_SIZE,
    lineHeight: CHAT_TEXT_LINE_HEIGHT,
    minWidth: 0,
    flexShrink: 1,
    flexBasis: 0,
    width: '100%' as const,
    maxWidth: '100%' as const,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 0,
    padding: 0,
    lineHeight: CHAT_TEXT_LINE_HEIGHT,
    minWidth: 0,
    flexShrink: 1,
    flexBasis: 0,
    width: '100%' as const,
    maxWidth: '100%' as const,
  },
  bullet_list: {
    marginTop: 0,
    marginBottom: 0,
    minWidth: 0,
    flexShrink: 1,
  },
  ordered_list: {
    marginTop: 0,
    marginBottom: 0,
    minWidth: 0,
    flexShrink: 1,
  },
  list_item: {
    minWidth: 0,
    flexShrink: 1,
  },
  heading1: { color: 'white', fontWeight: 'bold', marginVertical: 5 },
  heading2: { color: 'white', fontWeight: 'bold', marginVertical: 5 },
  heading3: { color: 'white', fontWeight: 'bold', marginVertical: 5 },
  hr: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    height: 1,
    marginVertical: CHAT_BLOCK_SPACING,
  },
  code_inline: {
    backgroundColor: '#1F1F1F',
    color: '#E0E0E0',
    borderRadius: 4,
  },
  code_block: {
    backgroundColor: '#1F1F1F',
    borderRadius: 8,
    padding: 8,
    marginVertical: 5,
    minWidth: 0,
    flexShrink: 1,
  },
  fence: {
    backgroundColor: '#1F1F1F',
    borderRadius: 8,
    padding: 8,
    marginVertical: 5,
    minWidth: 0,
    flexShrink: 1,
  },
  blockquote: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'transparent',
    borderLeftColor: 'rgba(255,255,255,0.2)',
    borderLeftWidth: 3,
    marginVertical: 5,
    marginLeft: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  softbreak: {
    lineHeight: CHAT_TEXT_LINE_HEIGHT,
  },
  hardbreak: {
    lineHeight: CHAT_TEXT_LINE_HEIGHT,
  },
  link: { color: '#9EE8DB' },
};

const assistantMarkdownRules: RenderRules = {
  text: (node: ASTNode, children, parent, styles, inheritedStyles = {}) => (
    <Text key={node.key} selectable style={[inheritedStyles, styles.text]}>
      {node.content}
    </Text>
  ),
  paragraph: (node: ASTNode, children, parent, styles) => {
    const blockSpacing = node.index > 0 ? { marginTop: CHAT_BLOCK_SPACING } : null;

    return (
      <View key={node.key} style={[styles._VIEW_SAFE_paragraph, blockSpacing]}>
        {children}
      </View>
    );
  },
  bullet_list: (node: ASTNode, children, parent, styles) => {
    const listDepth = Array.isArray(parent)
      ? parent.filter((ancestor) => ancestor?.type === 'bullet_list' || ancestor?.type === 'ordered_list').length
      : 0;
    const listSpacing = node.index > 0 ? { marginTop: listDepth === 0 ? CHAT_BLOCK_SPACING : CHAT_NESTED_BLOCK_SPACING } : null;

    return (
      <View key={node.key} style={[styles._VIEW_SAFE_bullet_list, listSpacing]}>
        {children}
      </View>
    );
  },
  ordered_list: (node: ASTNode, children, parent, styles) => {
    const listDepth = Array.isArray(parent)
      ? parent.filter((ancestor) => ancestor?.type === 'bullet_list' || ancestor?.type === 'ordered_list').length
      : 0;
    const listSpacing = node.index > 0 ? { marginTop: listDepth === 0 ? CHAT_BLOCK_SPACING : CHAT_NESTED_BLOCK_SPACING } : null;

    return (
      <View key={node.key} style={[styles._VIEW_SAFE_ordered_list, listSpacing]}>
        {children}
      </View>
    );
  },
  list_item: (node: ASTNode, children, parent, styles, inheritedStyles = {}) => {
    const baseListItemRule = renderRules.list_item;
    if (!baseListItemRule) {
      return children;
    }

    const listDepth = Array.isArray(parent)
      ? parent.filter((ancestor) => ancestor?.type === 'bullet_list' || ancestor?.type === 'ordered_list').length
      : 0;
    const siblingItemSpacing = node.index > 0 ? { marginTop: listDepth <= 1 ? CHAT_BLOCK_SPACING : CHAT_NESTED_LIST_ITEM_SPACING } : null;

    return baseListItemRule(
      node,
      children,
      parent,
      {
        ...styles,
        list_item: StyleSheet.flatten([styles.list_item, siblingItemSpacing]),
        _VIEW_SAFE_list_item: StyleSheet.flatten([styles._VIEW_SAFE_list_item, siblingItemSpacing]),
      },
      inheritedStyles
    );
  },
};

function buildAssistantMetaCard(meta: any) {
  if (meta?.webSearch) {
    return {
      type: 'webSearch',
      query: typeof meta?.webSearchQuery === 'string' ? meta.webSearchQuery : '',
    };
  }

  return undefined;
}

function logChatStream(event: string, details?: Record<string, unknown>) {
  void event;
  void details;
}

function parseChatTitlePayload(raw: string) {
  const clean = (raw || '').trim();
  if (!clean) return '';
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return typeof parsed.title === 'string' ? parsed.title.trim() : '';
    } catch { }
  }
  return clean;
}

const INCOMPLETE_TITLE_END_WORDS = new Set([
  'a',
  'an',
  'and',
  'about',
  'at',
  'for',
  'from',
  'in',
  'my',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'your',
]);

function normalizeGeneratedChatTitle(title: string) {
  const normalizedTitle = normalizeChatSessionTitle(title);
  const words = normalizedTitle.split(' ').filter(Boolean);
  const lastWord = words[words.length - 1]?.toLowerCase() || '';
  if (!normalizedTitle || INCOMPLETE_TITLE_END_WORDS.has(lastWord)) {
    return '';
  }
  return normalizedTitle;
}

const STARTER_MESSAGE_TEXTS = new Set(FIRST_CHAT_STARTERS.map((starter) => `${starter.emoji} ${starter.label}`));

function isSubstantiveTitleUserMessage(message: ChatUIMessage) {
  if (message.role !== 'user') return false;
  const text = String(message.content || '').trim().replace(/\s+/g, ' ');
  if (!text) return false;
  // A tapped starter ("🚀 Stop putting something off") is the same for everyone; the chat
  // is named after what the user says next.
  if (STARTER_MESSAGE_TEXTS.has(text)) return false;
  return !/^(?:hi|hello|hey|yo|sup|hiya|good morning|good afternoon|good evening|thanks|thank you|ok|okay|cool|great)(?:\s+there)?[.!?]*$/i.test(text);
}

function serializeTitleMessage(message: ChatUIMessage) {
  const content = String(message.content || '').trim();
  if (content) return content;
  const cardType = typeof message.card?.type === 'string' ? message.card.type : '';
  // A plan card says nothing about the topic, and would end up as the title.
  if (cardType === 'dayPlan' || cardType === 'weekPlanSaveAll' || cardType === 'planLegend' || cardType === 'aiActionsLimit' || cardType === 'aiActionsNotice') return '';
  return cardType ? `${cardType} card` : '';
}

/**
 * A key for an assistant reply that survives the chat reloading its messages (which can
 * give them new ids), so a prompt or notice added under a reply stays with it.
 */
const getReplyKey = (message: Pick<ChatUIMessage, 'role' | 'content' | 'card'>) => {
  // Only the visible text, so markers or spacing changed when the reply is saved and
  // reloaded do not change the key.
  const text = message.role === 'assistant'
    ? parseAssistantMessageExtras(String(message.content || '')).text
    : String(message.content || '');
  // A card-only reply (a day plan, say) has no text; its card tells it apart.
  if (!text.trim() && message.card) {
    // A replanned day keeps its draft id, so its items tell the two cards apart.
    const card = message.card as { type?: string; draftId?: string; date?: string; timelineItems?: { title?: string; start?: string; dueDate?: string }[] };
    const items = (Array.isArray(card.timelineItems) ? card.timelineItems : [])
      .map((item) => `${item.title || ''}@${item.start || item.dueDate || ''}`)
      .join('|');
    return `${message.role}:card:${card.type || ''}:${card.draftId || card.date || ''}:${items.slice(0, 160)}`;
  }
  return `${message.role}:${text.replace(/\s+/g, ' ').trim().slice(0, 100)}`;
};

/** Saved goals for the goal starter, today's tasks and events for the day-plan starter. */
async function loadFirstChatData(intent?: FirstChatIntent): Promise<{ goals?: SavedGoalSummary[]; today?: TodaySummary }> {
  if (intent === 'goal') return { goals: await loadSavedGoals().catch(() => []) };
  if (intent === 'plan_day') return { today: await loadTodaySummary().catch(() => undefined) };
  return {};
}

function getTitleContextMessages(messages: ChatUIMessage[]) {
  const firstSubstantiveUserIndex = messages.findIndex(isSubstantiveTitleUserMessage);
  if (firstSubstantiveUserIndex < 0) return [];

  return messages
    .slice(firstSubstantiveUserIndex, firstSubstantiveUserIndex + 8)
    .map((message) => ({
      role: message.role,
      // Reply-button markers are not part of what the chat is about.
      content: message.role === 'assistant' ? parseAssistantMessageExtras(serializeTitleMessage(message)).text : serializeTitleMessage(message),
    }))
    .filter((message) => message.content.length > 0);
}

function dedupeToolCalls<T extends { callId?: unknown; name?: unknown; arguments?: unknown; clientRequestId?: unknown }>(
  toolCalls: T[],
  fallbackRequestId?: string
) {
  return dedupeToolCallsByBatchKey(toolCalls, fallbackRequestId);
}

let localVisibleMessageCounter = 0;

function ensureVisibleMessageIds(messages: ChatUIMessage[], prefix: string, usedIds = new Set<string>()) {
  return messages.map((message) => {
    const rawId = typeof message.id === 'string' ? message.id.trim() : '';
    if (rawId && !usedIds.has(rawId)) {
      usedIds.add(rawId);
      return rawId === message.id ? message : { ...message, id: rawId };
    }

    let nextId = '';
    do {
      localVisibleMessageCounter += 1;
      nextId = rawId
        ? `${rawId}-visible-${localVisibleMessageCounter}`
        : `${prefix}-${localVisibleMessageCounter}`;
    } while (usedIds.has(nextId));

    usedIds.add(nextId);
    return { ...message, id: nextId };
  });
}

function createChatClientMessageId(role: ChatUIMessage['role']) {
  localVisibleMessageCounter += 1;
  return `${role}-${Date.now()}-${localVisibleMessageCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function isCalendarRedisplayRequest(text: string) {
  const clean = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ');

  if (!clean) return false;

  return (
    /^(?:can you |could you |would you |please )?(?:show|display|open|view|pull up|bring up|list) (?:me )?(?:it|them|that|those)(?: again)?$/.test(clean) ||
    /^(?:can you |could you |would you |please )?(?:show|display|open|view|pull up|bring up|list) (?:the )?(?:event|events|meeting|meetings|calendar|card|list)(?: again| back)$/.test(clean)
  );
}

function findLatestCalendarCard(messages: ChatUIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    const cardType = typeof message?.card?.type === 'string' ? message.card.type : '';
    if (CALENDAR_CARD_TYPES.has(cardType)) {
      return message;
    }
  }
  return null;
}

function isDraftDayPlanMessage(message: ChatUIMessage) {
  if (message?.role !== 'assistant') return false;
  const content = typeof message.content === 'string' ? message.content.toLowerCase() : '';
  return (
    content.includes("i'll save it") ||
    content.includes('reply with any edits') ||
    content.includes("say 'looks good' to save it")
  );
}

function findLatestDraftDayPlanMessage(messages: ChatUIMessage[]) {
  let index = messages.length - 1;

  while (index >= 0 && messages[index]?.role === 'user') {
    index -= 1;
  }

  let hasDraftPrompt = false;
  let planCardMessage: ChatUIMessage | null = null;

  while (index >= 0 && messages[index]?.role === 'assistant') {
    const message = messages[index];
    if (isDraftDayPlanMessage(message)) {
      hasDraftPrompt = true;
    }
    if (message?.card?.type === 'dayPlan' && !planCardMessage) {
      planCardMessage = message;
    }
    index -= 1;
  }

  return hasDraftPrompt ? planCardMessage : null;
}

/** "Save all": adds every day of a week plan that is still waiting to the calendar. */
function WeekPlanSaveAllButton({
  draftIds,
  pendingDraftIds,
  onSaveAll,
}: {
  draftIds: string[];
  pendingDraftIds: Set<string>;
  onSaveAll: (draftIds: string[]) => Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const pendingCount = draftIds.filter((id) => pendingDraftIds.has(id)).length;
  const isDone = pendingCount === 0;
  const disabled = isSaving || isDone;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.86}
      disabled={disabled}
      onPress={() => {
        setIsSaving(true);
        void onSaveAll(draftIds).finally(() => setIsSaving(false));
      }}
      style={{
        marginTop: 4,
        marginBottom: 8,
        minHeight: 48,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        backgroundColor: isDone ? 'rgba(0, 0, 0, 0.35)' : '#0F766E',
        opacity: isSaving ? 0.75 : 1,
      }}
    >
      {isSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
      <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>
        {isSaving ? 'Saving...' : isDone ? 'All days saved' : `Save all (${pendingCount} ${pendingCount === 1 ? 'day' : 'days'})`}
      </Text>
    </TouchableOpacity>
  );
}

function isDayPlanSaveConfirmation(text: string) {
  const clean = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .replace(/,\s*/g, ' ')
    .replace(/\s+/g, ' ');

  if (!clean) return false;

  if (/^(?:yes|yeah|yep|sure|ok|okay)$/.test(clean)) {
    return true;
  }

  return /^(?:(?:yes|yeah|yep|sure|ok|okay)\s+)?(?:looks good|looks great|sounds good|save|save it|save the plan|confirm|confirmed|go ahead|do it|add it|put it in my calendar and todos)$/.test(clean);
}

/** The chat list scrolls inside the app's scroll bar instead of the system one. */
const renderChatScrollComponent = (props: ScrollViewProps) => <ScrollViewWithBar {...props} />;

function setLastDayPlanFromCard(card: DayPlanCardValue) {
  if (!card || card.type !== 'dayPlan') return;
  setLastDayPlan({
    draftId: typeof card.draftId === 'string' ? card.draftId : undefined,
    date: card.date,
    calendarItems: card.calendarItems || [],
    todoItems: card.todoItems || [],
    timelineItems: card.timelineItems || [],
    saveBlockedReason: card.saveBlockedReason,
    repeatWeekly: card.repeatWeekly === true,
  });
}

function getDayPlanDraftCount(card: DayPlanCardValue) {
  if (Array.isArray(card?.timelineItems)) {
    return card.timelineItems.filter((item) => item?.source === 'draft' && (item.kind === 'event' || item.kind === 'task')).length;
  }
  return (Array.isArray(card?.calendarItems) ? card.calendarItems.length : 0) +
    (Array.isArray(card?.todoItems) ? card.todoItems.length : 0);
}

function VoiceWaveform({
  levels,
  barCount = VOICE_MESSAGE_WAVEFORM_BARS,
  animated = false,
  color = '#C8FFFB',
  inactiveColor = 'rgba(200,255,251,0.34)',
}: {
  levels: number[];
  barCount?: number;
  animated?: boolean;
  color?: string;
  inactiveColor?: string;
}) {
  const displayLevels = getDisplayWaveformLevels(levels, barCount);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) {
      pulseAnim.stopAnimation(() => pulseAnim.setValue(0));
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animated, pulseAnim]);

  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        height: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        overflow: 'hidden',
      }}
    >
      {displayLevels.map((level, index) => {
        const height = 4 + clampVoiceLevel(level) * 24;
        const scaleY = animated
          ? pulseAnim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [1, 1 + ((index % 4) + 1) * 0.06, 1],
            })
          : 1;
        return (
          <Animated.View
            key={`voice-bar-${index}`}
            style={{
              width: 2,
              height,
              borderRadius: 999,
              backgroundColor: level > 0.1 ? color : inactiveColor,
              transform: [{ scaleY }],
            }}
          />
        );
      })}
    </View>
  );
}

function VoiceMessagePlayer({
  audioUri,
  waveform,
  durationMs,
  transcript,
  isRecording,
  isTranscribing,
  error,
  onDiscard,
}: {
  audioUri?: string;
  waveform: number[];
  durationMs: number;
  transcript?: string;
  isRecording?: boolean;
  isTranscribing?: boolean;
  error?: string;
  onDiscard?: () => void;
}) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => { });
      soundRef.current = null;
    };
  }, []);

  const handlePlaybackStatus = useCallback((status: any) => {
    if (!status?.isLoaded) return;
    if (status.didJustFinish) {
      setIsPlaying(false);
      soundRef.current?.setPositionAsync(0).catch(() => { });
    } else {
      setIsPlaying(!!status.isPlaying);
    }
  }, []);

  const togglePlayback = useCallback(async () => {
    if (!audioUri || isRecording) return;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        playThroughEarpieceAndroid: false,
      });
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
          return;
        }
        if (status.isLoaded && status.positionMillis >= (status.durationMillis || 0)) {
          await soundRef.current.replayAsync();
        } else {
          await soundRef.current.playAsync();
        }
        setIsPlaying(true);
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true, progressUpdateIntervalMillis: 120 },
        handlePlaybackStatus
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      Alert.alert('Playback Error', 'Could not play this voice message.');
    }
  }, [audioUri, handlePlaybackStatus, isRecording]);

  const normalizedTranscript = String(transcript || '').trim();
  const canPlay = !!audioUri && !isRecording;

  return (
    <View style={{ width: '100%', minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0, gap: 8 }}>
        <TouchableOpacity
          onPress={togglePlayback}
          disabled={!canPlay}
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canPlay ? 'rgba(200,255,251,0.2)' : 'rgba(200,255,251,0.1)',
            borderWidth: 1,
            borderColor: 'rgba(200,255,251,0.36)',
            opacity: canPlay ? 1 : 0.7,
          }}
        >
          <MIcon
            name={isRecording ? 'microphone' : isPlaying ? 'pause' : 'play'}
            size={17}
            color="#C8FFFB"
          />
        </TouchableOpacity>
        <VoiceWaveform levels={waveform} />
        <Text style={{ color: '#C8FFFB', fontSize: 11, fontWeight: '700', width: 38, textAlign: 'right' }}>
          {isRecording ? 'Rec' : formatVoiceDuration(durationMs)}
        </Text>
        {onDiscard ? (
          <TouchableOpacity
            onPress={onDiscard}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(200,255,251,0.14)',
            }}
          >
            <MIcon name="close" size={15} color="#C8FFFB" />
          </TouchableOpacity>
        ) : null}
      </View>
      {isTranscribing || error || normalizedTranscript ? (
        <View style={{ marginTop: 7 }}>
          {isTranscribing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ActivityIndicator size="small" color="#C8FFFB" />
              <Text style={{ color: '#C8FFFB', fontSize: 11, fontWeight: '700' }}>
                Transcribing
              </Text>
            </View>
          ) : null}
          {!isTranscribing && error ? (
            <Text style={{ color: '#FFD3D3', fontSize: 11, fontWeight: '700' }}>
              {error}
            </Text>
          ) : null}
          {!isTranscribing && normalizedTranscript ? (
            <>
              <TouchableOpacity
                onPress={() => setShowTranscript((current) => !current)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ alignSelf: 'flex-start' }}
              >
                <Text style={{ color: '#C8FFFB', fontSize: 11, fontWeight: '800' }}>
                  {showTranscript ? 'Hide transcript' : 'Show transcript'}
                </Text>
              </TouchableOpacity>
              {showTranscript ? (
                <Text style={{ color: 'rgba(232,255,252,0.9)', fontSize: 12, lineHeight: 17, marginTop: 5 }}>
                  {normalizedTranscript}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function VoiceInputWaveformPreview({
  waveform,
  durationMs,
  isRecording,
  isTranscribing,
  error,
  onDiscard,
}: {
  waveform: number[];
  durationMs: number;
  isRecording?: boolean;
  isTranscribing?: boolean;
  error?: string;
  onDiscard?: () => void;
}) {
  const statusText = error || (isRecording ? 'Recording' : isTranscribing ? 'Transcribing' : formatVoiceDuration(durationMs));
  const showWaveform = !isTranscribing && !error;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', minWidth: 0, gap: 6 }}>
      {isTranscribing && !error ? (
        <View style={{ width: 18, height: 22, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color="#C8FFFB" />
        </View>
      ) : (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(200,255,251,0.18)',
            borderWidth: 1,
            borderColor: 'rgba(200,255,251,0.32)',
          }}
        >
          <MIcon name={error ? 'alert-circle' : 'microphone'} size={13} color={error ? '#FFD3D3' : '#C8FFFB'} />
        </View>
      )}
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{
          flexShrink: 1,
          minWidth: 0,
          color: error ? '#FFD3D3' : '#C8FFFB',
          fontSize: showWaveform ? 9 : 11,
          lineHeight: showWaveform ? 11 : 14,
          fontWeight: '800',
          width: showWaveform ? 54 : undefined,
          flex: showWaveform ? undefined : 1,
          textAlign: 'left',
        }}
      >
        {statusText}
      </Text>
      {showWaveform ? (
        <VoiceWaveform levels={waveform} barCount={VOICE_MESSAGE_LIVE_WAVEFORM_BARS} animated={isRecording} />
      ) : null}
      {onDiscard ? (
        <TouchableOpacity
          onPress={onDiscard}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(200,255,251,0.14)',
          }}
        >
          <MIcon name="close" size={15} color="#C8FFFB" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const ChatMessageBubble = React.memo(function ChatMessageBubble({
  message,
  messageKey,
  router,
  serverUrl,
  setAssistantTyping,
  appendChatMessages,
  onPickGoalQuotaDate,
  onDoGoalQuotaToday,
  onDecideGoalQuotaLater,
  onClearPendingGoalQuotaDate,
  onOpenRecipeTodoOffer,
  onDismissRecipeTodoOffer,
  onBuyWishlistTodo,
  onUpdateDayPlanCard,
  onSaveDayPlanCard,
  onCancelDayPlanCard,
  onSaveAllDayPlans,
  weekPlanPendingDraftIds,
  onRetryMessage,
  buyingWishlistTodoId,
  resolvedGoalQuotaPlanIds,
  isLatest,
  showRememberPrompt,
  savedPreferenceNotice,
  rememberSuggestion,
  preferenceQuestion,
  actionHandlers,
}: {
  /** The newest message in the chat; only it shows quick-reply buttons. */
  isLatest: boolean;
  showRememberPrompt: boolean;
  savedPreferenceNotice?: string | null;
  rememberSuggestion?: { field: SavedPreferenceField; value: string; question: string } | null;
  preferenceQuestion?: PreferenceQuestion | null;
  actionHandlers: AssistantMessageActionHandlers;
  message: ChatUIMessage;
  messageKey: string;
  router: any;
  serverUrl: string;
  setAssistantTyping: (value: boolean) => void;
  appendChatMessages: (messages: ChatUIMessage[]) => Promise<string | null>;
  onPickGoalQuotaDate: (input: GoalQuotaDatePickInput) => void;
  onDoGoalQuotaToday: (input: GoalQuotaDatePickInput) => Promise<boolean>;
  onDecideGoalQuotaLater: (input: GoalQuotaDatePickInput) => Promise<boolean>;
  onClearPendingGoalQuotaDate: (planId?: string) => void;
  onOpenRecipeTodoOffer: (offer: RecipeTodoOfferCardValue) => Promise<boolean>;
  onDismissRecipeTodoOffer: (offer: RecipeTodoOfferCardValue) => Promise<void>;
  onBuyWishlistTodo: (item: { id?: string; text: string; workspace?: string }) => Promise<void>;
  onUpdateDayPlanCard: (card: DayPlanCardValue) => Promise<void>;
  onSaveDayPlanCard: (card: DayPlanCardValue) => Promise<unknown>;
  onCancelDayPlanCard: (card: DayPlanCardValue) => Promise<void>;
  onSaveAllDayPlans: (draftIds: string[]) => Promise<void>;
  /** Day plans in this chat not yet saved or cancelled. */
  weekPlanPendingDraftIds: Set<string>;
  onRetryMessage: (message: ChatUIMessage) => void;
  buyingWishlistTodoId: string | null;
  resolvedGoalQuotaPlanIds: Set<string>;
}) {
  // Eazee's action markers become buttons below; the bubble shows the text without them.
  const assistantExtras = useMemo(
    () => (message.role === 'assistant' ? parseAssistantMessageExtras(message.content) : null),
    [message.content, message.role]
  );
  const visibleContent = assistantExtras ? assistantExtras.text : message.content;
  const isCardOnlyAssistantMessage = message.role === 'assistant' && !visibleContent && !!message.card;
  const assistantActions = assistantExtras ? (
    <AssistantMessageActions
      extras={assistantExtras}
      isLatest={isLatest}
      isStreaming={message.isStreaming}
      showRememberPrompt={showRememberPrompt}
      savedPreferenceNotice={savedPreferenceNotice}
      rememberSuggestion={rememberSuggestion}
      preferenceQuestion={preferenceQuestion}
      handlers={actionHandlers}
    />
  ) : null;
  const isUserVoiceMessage = message.role === 'user' && message.card?.type === 'voiceMessage';
  const isUserDeliveryFailed = message.role === 'user' && message.deliveryStatus === 'failed';
  const deliveryFailureReason = (message.deliveryError || '')
    .replace(/^Failed to send to AI\.\s*/, '')
    .replace(/^\((.*)\)$/, '$1')
    .trim();
  const bubbleBackgroundColor = isCardOnlyAssistantMessage
    ? 'transparent'
    : message.role === 'user'
      ? '#177470'
      : message.card?.type === 'webSearch'
        ? 'rgba(1, 58, 61, 0.88)'
        : 'rgba(0, 0, 0, 0.65)';
  const bubbleStrokeWidth = isCardOnlyAssistantMessage ? 0 : 2;

  return (
    <View
      key={messageKey}
      style={{
        alignSelf: message.role === 'user' ? 'flex-end' : 'stretch',
        width: message.role === 'user' ? undefined : '100%',
        maxWidth: message.role === 'user' ? '90%' : '100%',
        marginVertical: 4,
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'visible',
      }}
    >
      <View
        style={{
          backgroundColor: isCardOnlyAssistantMessage ? 'transparent' : '#32AA9D',
          padding: isCardOnlyAssistantMessage ? 0 : bubbleStrokeWidth,
          borderRadius: CHAT_SURFACE_RADIUS,
          flex: message.role === 'user' ? undefined : 1,
          flexBasis: message.role === 'user' ? undefined : 0,
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'visible',
          shadowColor: isCardOnlyAssistantMessage ? undefined : '#000000',
          shadowOffset: isCardOnlyAssistantMessage
            ? undefined
            : { width: 0, height: message.role === 'user' ? 4 : 3 },
          shadowOpacity: isCardOnlyAssistantMessage ? undefined : 0.25,
          shadowRadius: isCardOnlyAssistantMessage ? undefined : message.role === 'user' ? 4 : 0,
          elevation: message.role === 'user' ? 4 : undefined,
        }}
      >
        <View
          style={{
            backgroundColor: bubbleBackgroundColor,
            paddingTop: isCardOnlyAssistantMessage ? 0 : message.card?.type === 'webSearch' ? 12 : 12,
            paddingBottom: isCardOnlyAssistantMessage ? 0 : 12,
            paddingHorizontal: isCardOnlyAssistantMessage ? 0 : 12,
            borderRadius: Math.max(0, CHAT_SURFACE_RADIUS - bubbleStrokeWidth),
            minWidth: 0,
            maxWidth: '100%',
            overflow: isCardOnlyAssistantMessage ? 'visible' : 'hidden',
          }}
        >
        {message.card?.type === 'webSearch' && (
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: message.content ? 6 : 0,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: 'rgba(125, 233, 216, 0.14)',
            }}
          >
            <MIcon name="web" size={12} color="#9EE8DB" style={{ marginRight: 5 }} />
            <Text style={{ color: '#9EE8DB', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
              Web search
            </Text>
          </View>
        )}
        {isUserVoiceMessage ? (
          <View style={{ minWidth: 230, maxWidth: '100%' }}>
            <VoiceMessagePlayer
              audioUri={String(message.card?.audioUri || '')}
              waveform={Array.isArray(message.card?.waveform) ? message.card.waveform : []}
              durationMs={Number(message.card?.durationMs || 0)}
              transcript={String(message.card?.transcript || message.content || '')}
            />
          </View>
        ) : null}
        {!!visibleContent && !isUserVoiceMessage && (
          message.role === 'user' ? (
            <Text selectable style={userMessageTextStyle}>{visibleContent}</Text>
          ) : (
            <View style={assistantMessageContentStyle}>
              <Markdown markdownit={chatMarkdownParser} rules={assistantMarkdownRules} style={assistantMarkdownStyle}>
                {visibleContent}
              </Markdown>
            </View>
          )
        )}
        {/* A reply's buttons sit under its text; a card's (a plan, say) sit under the card. */}
        {assistantExtras && !isCardOnlyAssistantMessage && assistantActions}
        {message.card && (message.card.type === 'todoCreated' || message.card.type === 'todoUpdated' || message.card.type === 'todoQuery') && (
          <View style={{ marginTop: message.content ? 8 : 0 }}>
            <TodoCard
              items={message.card.items ?? []}
              router={router}
              showGoalSuggestionsOnOpen={message.card.showGoalSuggestionsOnOpen === true}
              buyingTodoId={buyingWishlistTodoId}
              onBuyWishlistItem={onBuyWishlistTodo}
            />
          </View>
        )}
        {message.card?.type === 'goalQuotaSchedule' && (
          <View style={{ marginTop: message.content ? 8 : 0 }}>
            <GoalQuotaScheduleCard
              goal={message.card.goal}
              planId={message.card.planId}
              router={router}
              isResolved={typeof message.card.planId === 'string' && resolvedGoalQuotaPlanIds.has(message.card.planId)}
              onDoToday={onDoGoalQuotaToday}
              onPickDate={onPickGoalQuotaDate}
              onDecideLater={onDecideGoalQuotaLater}
              onClearPendingDate={onClearPendingGoalQuotaDate}
            />
          </View>
        )}
        {message.card?.type === 'calendarList' && (
          <View style={{ marginTop: message.content ? 8 : 0 }}>
            <CalendarListCard items={message.card.items ?? []} router={router} />
          </View>
        )}
        {message.card?.type === 'calendarDetail' && (
          <View style={{ marginTop: message.content ? 8 : 0 }}>
            <CalendarDetailCard items={message.card.items ?? []} router={router} />
          </View>
        )}
        {message.card?.type === 'dailyOverview' && (
          <View style={{ marginTop: message.content ? 8 : 0, marginBottom: 8 }}>
            <DailyOverviewCard
              date={message.card.date}
              todos={message.card.todos ?? []}
              calendar={message.card.calendar ?? []}
              router={router}
            />
          </View>
        )}
        {message.card?.type === 'dayPlan' && (
          <View style={{ marginTop: message.content ? 8 : 0, marginBottom: 8 }}>
            <DayPlanCard
              draftId={message.card.draftId}
              date={message.card.date}
              calendarItems={message.card.calendarItems ?? []}
              todoItems={message.card.todoItems ?? []}
              timelineItems={message.card.timelineItems ?? []}
              saveBlockedReason={message.card.saveBlockedReason}
              mainGoal={message.card.mainGoal}
              repeatWeekly={message.card.repeatWeekly === true}
              saved={message.card.saved === true}
              cancelled={message.card.cancelled === true}
              onChange={onUpdateDayPlanCard}
              onSave={async () => { await onSaveDayPlanCard(message.card as DayPlanCardValue); }}
              onCancel={() => onCancelDayPlanCard(message.card as DayPlanCardValue)}
            />
          </View>
        )}
        {message.card?.type === 'aiActionsLimit' && (
          <View style={{ marginTop: message.content ? 8 : 0 }}>
            <AiActionsLimitCard limit={message.card.limit} notDone={message.card.notDone} router={router} />
          </View>
        )}
        {message.card?.type === 'aiActionsNotice' && (
          <AiActionsNotice remaining={message.card.remaining} limit={message.card.limit} />
        )}
        {message.card?.type === 'planLegend' && (
          <View style={{ marginBottom: 4 }}>
            <PlanLegendCard kinds={Array.isArray(message.card.kinds) ? message.card.kinds : []} />
          </View>
        )}
        {message.card?.type === 'weekPlanSaveAll' && (
          <WeekPlanSaveAllButton
            draftIds={Array.isArray(message.card.draftIds) ? message.card.draftIds : []}
            pendingDraftIds={weekPlanPendingDraftIds}
            onSaveAll={onSaveAllDayPlans}
          />
        )}
        {message.card?.type === 'navigationShortcut' && (
          <View style={{ marginTop: message.content ? 8 : 0 }}>
            <NavigationShortcutCard
              label={message.card.label}
              route={message.card.route}
              params={message.card.params}
              target={message.card.target}
              router={router}
            />
          </View>
        )}
        {message.card?.type === 'recipeTodoOffer' && (
          <View style={{ marginTop: message.content ? 8 : 0 }}>
            <RecipeTodoOfferCard
              offer={message.card}
              onOpen={onOpenRecipeTodoOffer}
              onDismiss={onDismissRecipeTodoOffer}
            />
          </View>
        )}
        {assistantExtras && isCardOnlyAssistantMessage && assistantActions}
        </View>
      </View>
      {isUserDeliveryFailed ? (
        <View
          style={{
            alignSelf: 'flex-end',
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 5,
            paddingHorizontal: 2,
          }}
        >
          <MIcon name="alert-circle-outline" size={14} color="#FFD6D6" />
          <Text
            style={{
              color: '#FFD6D6',
              fontSize: 12,
              lineHeight: 16,
              fontWeight: '700',
            }}
          >
            Failed to send
          </Text>
          <TouchableOpacity
            onPress={() => onRetryMessage(message)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: 'rgba(216, 255, 250, 0.16)',
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MIcon name="refresh" size={13} color="#D8FFFA" />
            <Text
              style={{
                color: '#D8FFFA',
                fontSize: 12,
                lineHeight: 16,
                fontWeight: '800',
              }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {isUserDeliveryFailed && !!deliveryFailureReason ? (
        <Text
          selectable
          numberOfLines={3}
          style={{
            alignSelf: 'flex-end',
            maxWidth: '85%',
            marginTop: 3,
            paddingHorizontal: 2,
            color: 'rgba(255, 214, 214, 0.85)',
            fontSize: 11,
            lineHeight: 15,
            textAlign: 'right',
          }}
        >
          {deliveryFailureReason}
        </Text>
      ) : null}
    </View>
  );
}, (prev, next) => (
  // Prompts the app adds under a reply after it arrives must redraw it too.
  prev.message === next.message &&
  prev.isLatest === next.isLatest &&
  prev.showRememberPrompt === next.showRememberPrompt &&
  prev.savedPreferenceNotice === next.savedPreferenceNotice &&
  prev.rememberSuggestion === next.rememberSuggestion &&
  prev.preferenceQuestion === next.preferenceQuestion &&
  prev.actionHandlers === next.actionHandlers
));

const CALENDAR_QUERY_STOP_WORDS = new Set([
  'a',
  'an',
  'any',
  'are',
  'at',
  'be',
  'do',
  'does',
  'for',
  'have',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'scheduled',
  'the',
  'there',
  'to',
]);

function normalizeCalendarQueryText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCalendarQueryTokens(value: string) {
  return normalizeCalendarQueryText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !CALENDAR_QUERY_STOP_WORDS.has(token));
}

function findLastCalendarFollowUpMatches(text: string) {
  const normalized = normalizeCalendarQueryText(text);
  if (!normalized) return [];

  const match = normalized.match(
    /^(?:do i have(?: any)?|did i have(?: any)?|what about|how about|is there(?: any)?|is|am i going to|am i attending|show me)\s+(.+)$/
  );
  if (!match) return [];

  const rawQuery = match[1]
    .replace(/\b(?:coming up|scheduled|on my calendar|in my calendar|for me)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!rawQuery || /^(?:it|that|them|those|anything|something|events?)$/.test(rawQuery)) return [];

  const queryTokens = getCalendarQueryTokens(rawQuery);
  if (!queryTokens.length) return [];

  return (getLastCalendarItems() || []).filter((item) => {
    const title = typeof item?.title === 'string' ? item.title : '';
    const details = typeof item?.details === 'string' ? item.details : '';
    const searchableText = `${title} ${details}`.trim();
    const normalizedSearchableText = normalizeCalendarQueryText(searchableText);
    const normalizedTitle = normalizeCalendarQueryText(title);
    if (!normalizedSearchableText) return false;
    if (normalizedSearchableText.includes(rawQuery) || (!!normalizedTitle && rawQuery.includes(normalizedTitle))) return true;

    const searchableTokens = new Set(getCalendarQueryTokens(searchableText));
    const matchedTokens = queryTokens.filter((token) => searchableTokens.has(token)).length;
    if (matchedTokens === queryTokens.length) return true;
    return matchedTokens >= Math.min(2, queryTokens.length) && matchedTokens / queryTokens.length >= 0.6;
  });
}

function readRouteParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

function parseCompactHandoff(value: string): CompactAiChatHandoff | null {
  try {
    const parsed = JSON.parse(value);
    const surface = parsed?.surface;
    const history = Array.isArray(parsed?.history)
      ? parsed.history
          .filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
          .map((item: any) => ({
            role: item.role,
            content: item.content.trim(),
          }))
          .filter((item: { content: string }) => item.content.length > 0)
      : [];
    const reason = typeof parsed?.reason === 'string' ? parsed.reason.trim() : '';

    if (surface !== 'todo' && surface !== 'calendar' && surface !== 'home') {
      return null;
    }

    return {
      surface,
      history,
      reason,
    };
  } catch {
    return null;
  }
}

function buildCompactHandoffRequest(handoff: CompactAiChatHandoff) {
  const history = handoff.history.slice(-6);
  const latestUserMessage = [...history].reverse().find((message) => message.role === 'user')?.content || '';
  const transcript = history
    .map((message) => {
      if (/^HANDOFF:\s*/i.test(message.content)) {
        return `Compact AI: ${message.content.replace(/^HANDOFF:\s*/i, '').trim()}`;
      }
      return `${message.role === 'user' ? 'User' : 'Compact AI'}: ${message.content}`;
    })
    .join('\n');

  const hiddenMessages = [
    [
      'Compact AI handoff context.',
      `Started in the ${handoff.surface} tab.`,
      handoff.reason ? `Handoff reason: ${handoff.reason}` : '',
      transcript ? `Recent compact context:\n${transcript}` : '',
      'Continue naturally without asking the user to repeat any of this context.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  ]
    .filter(Boolean)
    .map((content) => ({ role: 'system' as const, content }));

  return {
    hiddenMessages,
    requestText: latestUserMessage || 'Continue the request from Compact AI.',
  };
}

/** Longest the Fix my life overlay may block the screen if no reply ever arrives. */
const FIX_MY_LIFE_MAX_WAIT_MS = 120_000;

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { compactHandoff, compactHandoffNonce, chatAction, chatActionNonce } = useLocalSearchParams<{
    compactHandoff?: string | string[];
    compactHandoffNonce?: string | string[];
    chatAction?: string | string[];
    chatActionNonce?: string | string[];
  }>();
  const [microphoneColor, setMicrophoneColor] = useState('#FFFFFF');
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [inputValue, setInputValue] = useState('');
  const pendingGoalQuotaDateRequestRef = useRef<PendingGoalQuotaDateRequest | null>(null);
  const [goalQuotaDatePickerInput, setGoalQuotaDatePickerInput] = useState<GoalQuotaDatePickInput | null>(null);
  const [pendingGoalQuotaDate, setPendingGoalQuotaDate] = useState(() => startOfDay(new Date()));
  const [isSchedulingGoalQuotaAction, setIsSchedulingGoalQuotaAction] = useState(false);
  const [resolvedGoalQuotaPlanIds, setResolvedGoalQuotaPlanIds] = useState<Set<string>>(() => new Set());
  const [ignoredGoalQuotaTypedPlanIds, setIgnoredGoalQuotaTypedPlanIds] = useState<Set<string>>(() => new Set());
  const [buyingWishlistTodoId, setBuyingWishlistTodoId] = useState<string | null>(null);
  const isSchedulingGoalQuotaActionRef = useRef(false);
  const router = useRouter();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user: authUser } = useAuthSession();
  const aiActionsAllowance = useAiActionsAllowance(authUser?.uid);
  const aiActionsRemainingText = formatAiActionsRemaining(aiActionsAllowance);
  const { activeTarget, cancelGuidance, startGuidance } = useGuidance();
  const getTutorialUserId = useCallback(() => authUser?.uid || auth.currentUser?.uid || '', [authUser?.uid]);
  const { isLeftHanded } = useLeftHandedMode();
  const [isChatDayPlanTutorialPending, setIsChatDayPlanTutorialPending] = useState(false);
  const [chatDayPlanTutorialStage, setChatDayPlanTutorialStage] = useState<ChatDayPlanTutorialStage | null>(null);
  const chatDayPlanTutorialStageRef = useRef<ChatDayPlanTutorialStage | null>(null);
  const chatDayPlanTutorialRequestIdRef = useRef<string | null>(null);
  const skipChatDayPlanTutorialRef = useRef(() => {});
  const hasStartedChatDayPlanTutorialRef = useRef(false);
  const isChatDayPlanTutorialPendingRef = useRef(false);
  const isFinishingChatDayPlanTutorialRef = useRef(false);
  /** Tutorial "back" into the day-plan part: the stage to show instead of starting over. */
  const restoreChatDayPlanStageRef = useRef<ChatDayPlanTutorialStage | null>(null);
  const [isWishlistTutorialPending, setIsWishlistTutorialPending] = useState(false);
  const isWishlistTutorialPendingRef = useRef(false);
  const hasStartedWishlistTutorialRef = useRef(false);
  const wishlistTutorialRequestIdRef = useRef<string | null>(null);
  const shouldTrackNextWishlistTutorialRequestRef = useRef(false);
  const showWishlistTutorialInfoRef = useRef<() => void>(() => {});
  const restoreWishlistTutorialStepRef = useRef<(step: 'info' | 'prompt') => void>(() => {});
  const isFocusedRef = useRef(false);
  useEffect(() => {
    isFocusedRef.current = isFocused;
    if (isFocused) {
      setGuidanceActiveTab('chat');
    }
  }, [isFocused]);

  const compactHandoffValue = readRouteParam(compactHandoff);
  const compactHandoffKey = readRouteParam(compactHandoffNonce);
  const chatActionValue = readRouteParam(chatAction);
  const chatActionKey = readRouteParam(chatActionNonce);
  const handledChatActionRef = useRef('');
  /** Fix my life week context; stays attached to every request in the chat it started. */
  const weekPlanContextRef = useRef<{ sessionId: string | null; content: string } | null>(null);
  const [fixMyLifeRequestKey, setFixMyLifeRequestKey] = useState('');
  const [toast, setToast] = useState<{ message: string; nonce: number } | null>(null);
  const showToast = useCallback((message: string) => setToast({ message, nonce: Date.now() }), []);

  // First-chat onboarding: the welcome buttons and the one-result flow they start.
  const [firstChatState, setFirstChatState] = useState<FirstChatState>(INITIAL_FIRST_CHAT_STATE);
  const firstChatStateRef = useRef<FirstChatState>(INITIAL_FIRST_CHAT_STATE);
  const [isStartingFirstChat, setIsStartingFirstChat] = useState(false);
  const isStartingFirstChatRef = useRef(false);
  const hasTrackedWelcomeRef = useRef(false);
  const hasTrackedRefinementRef = useRef(false);
  /** Replies already looked at for [[save_preference]]; loaded history is never re-saved. */
  const seenAssistantMessageIdsRef = useRef(new Set<string>());
  const [savedPreferenceNotices, setSavedPreferenceNotices] = useState<Record<string, string>>({});
  /** A preference answer the user tapped ("Flexible priority list"), waiting for the result reply. */
  const pendingPreferenceAnswerRef = useRef<{ field: SavedPreferenceField; value: string; sessionId: string | null } | null>(null);
  /** "Remember this?" prompts the app adds under a result reply, by message id. */
  const [rememberSuggestions, setRememberSuggestions] = useState<Record<string, { field: SavedPreferenceField; value: string; question: string }>>({});
  const rememberPromptSessionIdsRef = useRef(new Set<string>());
  // The account's first few chats, where preference follow-ups and "Remember this?" run.
  const [preferencePromptChatIds, setPreferencePromptChatIds] = useState<string[]>([]);
  const preferencePromptChatIdsRef = useRef<string[]>([]);
  // The one preference question the app adds in each of those chats, by the reply it sits under.
  const [preferenceQuestions, setPreferenceQuestions] = useState<Record<string, PreferenceQuestion>>({});
  const preferenceQuestionSessionIdsRef = useRef(new Set<string>());
  /** A preference question or "remember?" prompt showed in this chat: it uses one of the few. */
  const countPreferencePromptChat = useCallback((sessionId: string) => {
    const uid = authUser?.uid || auth.currentUser?.uid;
    if (!uid || !sessionId) return;
    void claimPreferencePromptChat(uid, sessionId)
      .then((result) => setPreferencePromptChatIds(result.sessionIds))
      .catch(() => {});
  }, [authUser?.uid]);
  preferencePromptChatIdsRef.current = preferencePromptChatIds;
  // "Get to know me": the invitation shown once Eazee has helped, and whether a profile exists.
  const [aboutMeInvite, setAboutMeInvite] = useState<AboutMeInviteState>({ status: 'dismissed', sessionIds: [] });
  const [hasAboutMeProfile, setHasAboutMeProfile] = useState(true);
  useEffect(() => {
    const uid = authUser?.uid;
    if (!uid || !isFocused) return;
    let cancelled = false;
    void Promise.all([readAboutMeInviteState(uid), readCachedAboutMeProfile(uid)]).then(([invite, profile]) => {
      if (cancelled) return;
      setAboutMeInvite(invite);
      setHasAboutMeProfile(hasAboutMeContent(profile));
    });
    // Picks up changes made on another device.
    void refreshAboutMeProfile(uid).catch(() => {});
    void refreshMemories(uid).catch(() => {});
    const unsubscribe = subscribeAboutMeProfile((profile, changedUserId) => {
      if (changedUserId === uid) setHasAboutMeProfile(hasAboutMeContent(profile));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authUser?.uid, isFocused]);
  useEffect(() => {
    let cancelled = false;
    void readPreferencePromptChatIds(authUser?.uid).then((ids) => {
      if (!cancelled) setPreferencePromptChatIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [authUser?.uid]);
  useEffect(() => {
    const uid = authUser?.uid;
    let cancelled = false;
    const apply = (state: FirstChatState) => {
      firstChatStateRef.current = state;
      setFirstChatState(state);
    };
    void readFirstChatState(uid).then((state) => {
      if (!cancelled) apply(state);
    });
    const unsubscribe = subscribeFirstChatState((state, userId) => {
      if (userId === uid) apply(state);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authUser?.uid]);
  /** Set by the header +, so the new Fix my life chat announces itself. */
  const fixMyLifeFromNewChatRef = useRef(false);
  /** Bumped by pull-to-refresh to tear down and reopen the live reply stream. */
  const [streamConnectionKey, setStreamConnectionKey] = useState(0);
  const [isRefreshingChat, setIsRefreshingChat] = useState(false);
  const hasPendingCompactHandoff = !!compactHandoffValue && !!compactHandoffKey;
  const floatingTabBarInset = getFloatingTabBarInset(insets.bottom);
  const aiInputBottom = floatingTabBarInset - 6;
  const [aiInputHeight, setAiInputHeight] = useState(68);
  const aiInputSpacer = floatingTabBarInset + aiInputHeight + 6;
  const chatBackdropScrimHeight = Math.max(220, floatingTabBarInset + aiInputHeight + 88);
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isAiInputFocused, setIsAiInputFocused] = useState(false);
  const isAiComposerActive = isKeyboardVisible || isAiInputFocused;
  const androidActiveKeyboardGap = Platform.OS === 'android' && isAiComposerActive ? ANDROID_CHAT_KEYBOARD_GAP : 0;
  const aiInputKeyboardBottom = Platform.OS === 'android' && isAiComposerActive ? androidActiveKeyboardGap : aiInputBottom;
  const chatSwipeBandHeight = isAiComposerActive
    ? Math.max(keyboardInset, aiInputKeyboardBottom) + aiInputHeight + 24
    : aiInputBottom + aiInputHeight + 12;
  const activeAiInputSpacer = isAiComposerActive
    ? Math.max(aiInputSpacer, keyboardInset + aiInputHeight + 16 + androidActiveKeyboardGap)
    : aiInputSpacer;

  const completeChatGuidanceAction = useCallback((action: 'history' | 'new') => {
    if (activeTarget?.type === 'screen' && activeTarget.params?.chatAction === action) {
      cancelGuidance();
    }
  }, [activeTarget, cancelGuidance]);

  const showTutorialCompleteCard = useCallback(() => {
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/chat',
        params: { chatAction: 'tutorial-complete' },
      },
      'tutorial complete',
      {
        onNext: () => {
          cancelGuidance();
          openNewChatAfterTutorial();
        },
        onSkipSegment: openNewChatAfterTutorial,
        onCancel: openNewChatAfterTutorial,
      }
    );
  }, [cancelGuidance, startGuidance]);

  const completeWishlistTutorial = useCallback(async (closeGuidance: boolean) => {
    const uid = authUser?.uid || auth.currentUser?.uid || '';
    if (!uid) {
      return;
    }

    await completeTutorialStep(uid, TUTORIAL_WISHLIST_SHOPPING_STEP).catch((error) => {
      console.warn('Failed to persist wishlist tutorial completion', error);
    });
    wishlistTutorialRequestIdRef.current = null;
    shouldTrackNextWishlistTutorialRequestRef.current = false;
    isWishlistTutorialPendingRef.current = false;
    setIsWishlistTutorialPending(false);
    hasStartedWishlistTutorialRef.current = false;
    if (closeGuidance) {
      cancelGuidance();
    }
  }, [authUser?.uid, cancelGuidance]);

  const completeWishlistTutorialAndShowEnd = useCallback(async () => {
    await completeWishlistTutorial(false);
    showTutorialCompleteCard();
  }, [completeWishlistTutorial, showTutorialCompleteCard]);

  const showWishlistTutorialPrompt = useCallback(() => {
    shouldTrackNextWishlistTutorialRequestRef.current = false;
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/chat',
        params: { chatAction: 'tutorial-wishlist-message' },
      },
      'AI bar',
      {
        onBack: () => {
          showWishlistTutorialInfoRef.current();
        },
        onSkipSegment: () => {
          void completeWishlistTutorialAndShowEnd();
        },
        onNext: () => {
          void completeWishlistTutorialAndShowEnd();
        },
        restore: () => restoreWishlistTutorialStepRef.current('prompt'),
      }
    );
  }, [completeWishlistTutorialAndShowEnd, startGuidance]);

  const showWishlistTutorialInfo = useCallback(() => {
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/chat',
        params: { chatAction: 'tutorial-wishlist' },
      },
      'Wishlist',
      {
        onNext: showWishlistTutorialPrompt,
        onSkipSegment: () => {
          void completeWishlistTutorialAndShowEnd();
        },
        restore: () => restoreWishlistTutorialStepRef.current('info'),
      }
    );
  }, [completeWishlistTutorialAndShowEnd, showWishlistTutorialPrompt, startGuidance]);
  showWishlistTutorialInfoRef.current = showWishlistTutorialInfo;

  // Back from the end card: the wishlist part is in progress again, in the same chat.
  restoreWishlistTutorialStepRef.current = (step) => {
    showGuidanceTab('chat');
    hasStartedWishlistTutorialRef.current = true;
    if (!isWishlistTutorialPendingRef.current) {
      isWishlistTutorialPendingRef.current = true;
      setIsWishlistTutorialPending(true);
      const uid = getTutorialUserId();
      if (uid) void uncompleteTutorialStep(uid, TUTORIAL_WISHLIST_SHOPPING_STEP);
    }
    if (step === 'info') showWishlistTutorialInfo();
    else showWishlistTutorialPrompt();
  };

  const restoreWishlistTutorialAfterFailedRequest = useCallback((requestId: string) => {
    if (
      requestId &&
      isWishlistTutorialPendingRef.current &&
      wishlistTutorialRequestIdRef.current === requestId
    ) {
      wishlistTutorialRequestIdRef.current = null;
      showWishlistTutorialPrompt();
    }
  }, [showWishlistTutorialPrompt]);

  const completeWishlistTutorialForRequest = useCallback(async (requestId: string) => {
    if (
      requestId &&
      isWishlistTutorialPendingRef.current &&
      wishlistTutorialRequestIdRef.current === requestId
    ) {
      wishlistTutorialRequestIdRef.current = null;
      await completeWishlistTutorialAndShowEnd();
    }
  }, [completeWishlistTutorialAndShowEnd]);

  const hideWishlistTutorialPrompt = useCallback(() => {
    if (
      activeTarget?.type === 'screen' &&
      activeTarget.params?.chatAction === 'tutorial-wishlist-message'
    ) {
      shouldTrackNextWishlistTutorialRequestRef.current = true;
      cancelGuidance();
    }
  }, [activeTarget, cancelGuidance]);

  const completeChatDayPlanTutorial = useCallback(async (closeGuidance: boolean) => {
    const uid = authUser?.uid || auth.currentUser?.uid || '';
    if (!uid) {
      return;
    }

    chatDayPlanTutorialRequestIdRef.current = null;
    await completeTutorialStep(uid, TUTORIAL_CHAT_DAY_PLAN_STEP).catch((error) => {
      console.warn('Failed to persist chat tutorial completion', error);
    });
    isChatDayPlanTutorialPendingRef.current = false;
    setIsChatDayPlanTutorialPending(false);
    chatDayPlanTutorialStageRef.current = null;
    setChatDayPlanTutorialStage(null);
    hasStartedChatDayPlanTutorialRef.current = false;
    if (closeGuidance) {
      cancelGuidance();
    }
  }, [authUser?.uid, cancelGuidance]);

  const showChatDayPlanTutorialStage = useCallback((stage: ChatDayPlanTutorialStage) => {
    function startChatTutorialStage(currentStage: ChatDayPlanTutorialStage) {
      const nextStage =
        currentStage === 'eazee-button'
          ? 'ai-bar'
          : currentStage === 'ai-bar'
            ? 'plan-day'
            : null;

      chatDayPlanTutorialStageRef.current = currentStage;
      setChatDayPlanTutorialStage(currentStage);
      startGuidance(
        { type: 'screen', route: '/(tabs)/chat', params: { chatAction: currentStage } },
        currentStage === 'eazee-button' ? 'Eazee button' : 'AI bar',
        {
          onBack: currentStage === 'ai-bar'
            ? () => startChatTutorialStage('eazee-button')
            : currentStage === 'plan-day'
              ? () => startChatTutorialStage('ai-bar')
              : undefined,
          onSkipSegment: () => { skipChatDayPlanTutorialRef.current(); },
          // The last stage waits for a day plan; next moves on without one.
          onNext: nextStage ? () => startChatTutorialStage(nextStage) : () => { skipChatDayPlanTutorialRef.current(); },
          nextLabel: nextStage ? undefined : 'skip',
          restore: () => {
            showGuidanceTab('chat');
            if (isChatDayPlanTutorialPendingRef.current) {
              startChatTutorialStage(currentStage);
              return;
            }
            // Back from the To Do part: this part is in progress again, resumed at this
            // stage in the same chat (the start effect would otherwise begin a new chat).
            restoreChatDayPlanStageRef.current = currentStage;
            const uid = getTutorialUserId();
            if (uid) void uncompleteTutorialStep(uid, TUTORIAL_CHAT_DAY_PLAN_STEP);
          },
        }
      );
    }

    startChatTutorialStage(stage);
  }, [getTutorialUserId, startGuidance]);

  const advanceChatDayPlanTutorial = useCallback((nextStage: ChatDayPlanTutorialStage) => {
    if (!isChatDayPlanTutorialPendingRef.current) return;
    showChatDayPlanTutorialStage(nextStage);
  }, [showChatDayPlanTutorialStage]);

  const restoreChatDayPlanTutorialAfterFailedRequest = useCallback((requestId: string) => {
    if (
      requestId &&
      isChatDayPlanTutorialPendingRef.current &&
      chatDayPlanTutorialRequestIdRef.current === requestId
    ) {
      showChatDayPlanTutorialStage('plan-day');
    }
  }, [showChatDayPlanTutorialStage]);

  const maybeRestoreChatDayPlanTutorialAfterResponse = useCallback((requestId: string, messages: ChatUIMessage[]) => {
    if (
      !requestId ||
      !isChatDayPlanTutorialPendingRef.current ||
      chatDayPlanTutorialRequestIdRef.current !== requestId
    ) {
      return;
    }

    const hasSaveableDayPlan = messages.some((message) =>
      message?.card?.type === 'dayPlan' &&
      message.card.saved !== true &&
      message.card.cancelled !== true &&
      getDayPlanDraftCount(message.card as DayPlanCardValue) > 0
    );
    if (!hasSaveableDayPlan) {
      showChatDayPlanTutorialStage('plan-day');
      return;
    }
    // The plan is here: say what to do with it (saving it finishes this part).
    startGuidance(
      { type: 'screen', route: '/(tabs)/chat', params: { chatAction: 'tutorial-save-plan' } },
      'Save plan',
      {
        onSkipSegment: () => { skipChatDayPlanTutorialRef.current(); },
        // Like the plan-your-day step: skip moves on to the To Do part without saving.
        onNext: () => { skipChatDayPlanTutorialRef.current(); },
        nextLabel: 'skip',
        onBack: () => showChatDayPlanTutorialStage('plan-day'),
      }
    );
  }, [showChatDayPlanTutorialStage, startGuidance]);

  useEffect(() => {
    let isActive = true;

    const refreshTutorial = async () => {
      const uid = authUser?.uid || auth.currentUser?.uid || '';
      if (!uid) {
        if (isActive) {
          isChatDayPlanTutorialPendingRef.current = false;
          setIsChatDayPlanTutorialPending(false);
          chatDayPlanTutorialStageRef.current = null;
          setChatDayPlanTutorialStage(null);
        }
        return;
      }

      const pending = isActiveTutorialStepPending(uid, TUTORIAL_CHAT_DAY_PLAN_STEP);
      if (isActive) {
        isChatDayPlanTutorialPendingRef.current = pending;
        setIsChatDayPlanTutorialPending(pending);
        if (!pending) {
          chatDayPlanTutorialStageRef.current = null;
          setChatDayPlanTutorialStage(null);
        }
      }
    };

    void refreshTutorial();
    const unsubscribe = subscribeTutorialProgress(() => {
      void refreshTutorial();
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [authUser?.uid]);

  useEffect(() => {
    let isActive = true;

    const refreshTutorial = async () => {
      const uid = authUser?.uid || auth.currentUser?.uid || '';
      if (!uid) {
        if (isActive) {
          isWishlistTutorialPendingRef.current = false;
          setIsWishlistTutorialPending(false);
          hasStartedWishlistTutorialRef.current = false;
        }
        return;
      }

      const progress = await getTutorialProgress(uid).catch(() => null);
      const pending = isTutorialSessionActive(uid) &&
        !!progress?.hasStarted &&
        progress.completedSteps.includes(TUTORIAL_HOME_OVERVIEW_STEP) &&
        !progress.completedSteps.includes(TUTORIAL_WISHLIST_SHOPPING_STEP);

      if (isActive) {
        isWishlistTutorialPendingRef.current = pending;
        setIsWishlistTutorialPending(pending);
        if (!pending) {
          hasStartedWishlistTutorialRef.current = false;
        }
      }
    };

    void refreshTutorial();
    const unsubscribe = subscribeTutorialProgress(() => {
      void refreshTutorial();
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [authUser?.uid]);

  const eventSourceRef = useRef<any>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatUIMessage[]>([]);
  const [isBootstrappingCompactHandoff, setIsBootstrappingCompactHandoff] = useState(false);
  /**
   * Fix my life waits for the AI's first reply behind a blocking overlay:
   * 'starting' while the new chat is prepared, 'sent' until the first reply appears.
   */
  const [fixMyLifeWaitPhase, setFixMyLifeWaitPhase] = useState<'starting' | 'sent' | null>(null);
  // Set when the user cancels Fix my life, so a start still in progress does not send it.
  const fixMyLifeCancelledRef = useRef(false);
  const [chatSessions, setChatSessions] = useState<ChatSessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionSummary, setActiveSessionSummary] = useState('');
  const [isHistoryModalVisible, setIsHistoryModalVisible] = useState(false);
  const [isRenamingActiveChat, setIsRenamingActiveChat] = useState(false);
  // The AI's personality (Positive / Neutral / Roast), the same setting as in Settings.
  const [isPersonalityMenuOpen, setIsPersonalityMenuOpen] = useState(false);
  const [aiBaseStyle, setAiBaseStyle] = useState<AiBasePersonalization>(DEFAULT_AI_PERSONALIZATION_SETTINGS.baseStyle);
  useEffect(() => {
    let cancelled = false;
    const uid = authUser?.uid || null;
    void readAiPersonalizationSettings(uid).then((settings) => {
      if (!cancelled) setAiBaseStyle(settings.baseStyle);
    });
    // A change in Settings shows here too.
    const unsubscribe = subscribeAiPersonalizationSettings((settings, settingsUserId) => {
      if (settingsUserId === (uid || 'guest')) setAiBaseStyle(settings.baseStyle);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authUser?.uid]);
  const handleSelectAiBaseStyle = useCallback(async (baseStyle: AiBasePersonalization) => {
    setIsPersonalityMenuOpen(false);
    setAiBaseStyle(baseStyle);
    void Haptics.selectionAsync().catch(() => {});
    const uid = authUser?.uid || null;
    try {
      const current = await readAiPersonalizationSettings(uid);
      await writeAiPersonalizationSettings({ ...current, baseStyle }, uid);
    } catch {
      showToast('Could not change the personality. Please try again.');
    }
  }, [authUser?.uid, showToast]);
  const isChatSwipeDisabled = isAiComposerActive || isHistoryModalVisible;
  const [isSummaryTestMode, setIsSummaryTestMode] = useState(false);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [typingSessionIds, setTypingSessionIds] = useState<string[]>([]);
  const typingAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<any>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const assistantReadAnchorIndexRef = useRef<number | null>(null);
  const assistantReadAnchorRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceBottomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceBottomUntilRef = useRef(0);
  const scrollOffsetYRef = useRef(0);
  const visibleListHeightRef = useRef(0);
  const totalContentHeightRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const stickyFollowEnabledRef = useRef(true);
  const footerHeightRef = useRef(0);
  const isUserScrollingRef = useRef(false);
  const inputRef = useRef<any>(null);
  const inputValueRef = useRef('');
  const activeSessionIdRef = useRef<string | null>(null);
  const isCreatingNewChatRef = useRef(false);
  const chatMessagesRef = useRef<ChatUIMessage[]>([]);
  const typingSessionIdsRef = useRef<string[]>([]);
  const handleToolCallRef = useRef<((payload: any, sessionIdOverride?: string | null) => Promise<void>) | null>(null);
  const sseReadyResolversRef = useRef<((clientId: string | null) => void)[]>([]);
  const callSessionMapRef = useRef(new Map<string, string>());
  const callRequestMapRef = useRef(new Map<string, string>());
  const requestSessionMapRef = useRef(new Map<string, string>());
  const requestAbortControllersRef = useRef(new Map<string, AbortController>());
  const requestTextMapRef = useRef(new Map<string, string>());
  const requestUserMessageMapRef = useRef(new Map<string, string>());
  const pendingRetryMessageIdsRef = useRef(new Set<string>());
  const inFlightToolCallKeysRef = useRef(new Set<string>());
  const handledToolCallKeysRef = useRef(new Set<string>());
  const handledCompactHandoffRef = useRef<string | null>(null);
  const initialSessionLoadRef = useRef(false);
  const pendingStreamChunksRef = useRef(new Map<string, string>());
  const titleGenerationSessionIdsRef = useRef(new Set<string>());
  useEffect(() => { clientIdRef.current = clientId; }, [clientId]);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
  useEffect(() => { chatMessagesRef.current = chatMessages; }, [chatMessages]);
  useEffect(() => { typingSessionIdsRef.current = typingSessionIds; }, [typingSessionIds]);

  const dismissChatKeyboard = useCallback(() => {
    inputRef.current?.blur?.();
    Keyboard.dismiss();
    setIsAiInputFocused(false);
  }, []);
  useEffect(() => { inputValueRef.current = inputValue; }, [inputValue]);

  const updateNearBottomState = useCallback((nextOffsetY?: number, nextVisibleHeight?: number, nextContentHeight?: number) => {
    const offsetY = typeof nextOffsetY === 'number' ? nextOffsetY : scrollOffsetYRef.current;
    const visibleHeight = typeof nextVisibleHeight === 'number' ? nextVisibleHeight : visibleListHeightRef.current;
    const contentHeight = typeof nextContentHeight === 'number' ? nextContentHeight : totalContentHeightRef.current;
    const distanceFromBottom = Math.max(0, contentHeight - (offsetY + visibleHeight));
    const isNearBottom = distanceFromBottom <= CHAT_BOTTOM_THRESHOLD;
    isNearBottomRef.current = isNearBottom;
    return isNearBottom;
  }, []);

  const shouldKeepLatestVisible = useCallback((sessionId?: string | null) => {
    const targetSessionId = sessionId ?? activeSessionIdRef.current;
    if (Date.now() < forceBottomUntilRef.current) {
      return true;
    }
    if (targetSessionId && typingSessionIdsRef.current.includes(targetSessionId)) {
      return true;
    }
    return stickyFollowEnabledRef.current && isNearBottomRef.current;
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    try {
      const node: any = scrollViewRef.current;
      if (!node) return;
      if (typeof node.scrollToEnd === 'function') {
        node.scrollToEnd({ animated });
      } else if (typeof node.getNode === 'function') {
        const realNode = node.getNode?.();
        realNode?.scrollToEnd?.({ animated });
      } else if (typeof node.scrollToOffset === 'function') {
        node.scrollToOffset({ offset: Number.MAX_SAFE_INTEGER, animated });
      }
    } catch { }
  }, []);

  const queueScrollToBottom = useCallback((animated = true) => {
    if (scrollFrameRef.current !== null) {
      try { cancelAnimationFrame(scrollFrameRef.current); } catch { }
    }
    try {
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        scrollToBottom(animated);
      });
    } catch {
      scrollToBottom(animated);
    }
  }, [scrollToBottom]);

  const scrollToAssistantStart = useCallback((index: number, animated = true) => {
    try {
      const node: any = scrollViewRef.current;
      if (!node || index < 0 || assistantReadAnchorIndexRef.current !== index) return;
      if (typeof node.scrollToIndex === 'function') {
        node.scrollToIndex({ index, animated, viewPosition: 0 });
      }
    } catch { }
  }, []);

  const queueScrollToAssistantStart = useCallback((index: number, animated = true) => {
    if (index < 0) return;
    assistantReadAnchorIndexRef.current = index;
    if (assistantReadAnchorRetryTimeoutRef.current) {
      clearTimeout(assistantReadAnchorRetryTimeoutRef.current);
      assistantReadAnchorRetryTimeoutRef.current = null;
    }
    if (scrollFrameRef.current !== null) {
      try { cancelAnimationFrame(scrollFrameRef.current); } catch { }
    }
    try {
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        scrollToAssistantStart(index, animated);
      });
    } catch {
      scrollToAssistantStart(index, animated);
    }
  }, [scrollToAssistantStart]);

  const queuePendingAssistantReadAnchor = useCallback((animated = false) => {
    const index = assistantReadAnchorIndexRef.current;
    if (index === null) return false;
    queueScrollToAssistantStart(index, animated);
    return true;
  }, [queueScrollToAssistantStart]);

  const clearAssistantReadAnchor = useCallback(() => {
    assistantReadAnchorIndexRef.current = null;
    if (scrollFrameRef.current !== null) {
      try { cancelAnimationFrame(scrollFrameRef.current); } catch { }
      scrollFrameRef.current = null;
    }
    if (assistantReadAnchorRetryTimeoutRef.current) {
      clearTimeout(assistantReadAnchorRetryTimeoutRef.current);
      assistantReadAnchorRetryTimeoutRef.current = null;
    }
  }, []);

  const lockBottomTemporarily = useCallback((durationMs = 450) => {
    forceBottomUntilRef.current = Date.now() + durationMs;
    if (forceBottomTimeoutRef.current) {
      clearTimeout(forceBottomTimeoutRef.current);
    }
    forceBottomTimeoutRef.current = setTimeout(() => {
      forceBottomTimeoutRef.current = null;
      forceBottomUntilRef.current = 0;
    }, durationMs);
  }, []);

  const deepgramConfig = getDeepgramConfig();
  const sendTextMessageRef = useRef<((text: string, options?: ChatSendOptions) => Promise<void>) | null>(null);
  const voiceRecordingModeRef = useRef<'text' | 'voiceMessage' | null>(null);
  const voiceAudioChunksRef = useRef<Uint8Array[]>([]);
  const voiceWaveformLevelsRef = useRef<number[]>([]);
  const voiceRecordingStartTokenRef = useRef(0);
  const voiceTranscriptionAudioUriRef = useRef<string | null>(null);
  const voiceTranscriptionUploadTaskRef = useRef<FileSystem.UploadTask | null>(null);
  const isVoiceMessageRecordingRef = useRef(false);
  const ignoreNextMicrophonePressRef = useRef(false);
  const [voiceLiveWaveformLevels, setVoiceLiveWaveformLevels] = useState<number[]>([]);
  const [voiceMessageDraft, setVoiceMessageDraft] = useState<VoiceMessageDraft | null>(null);
  const voiceMessageDraftRef = useRef<VoiceMessageDraft | null>(null);
  const [isVoiceMessageRecording, setIsVoiceMessageRecording] = useState(false);
  const [isVoiceMessageFinalizing, setIsVoiceMessageFinalizing] = useState(false);

  const setVoiceDraft = useCallback((draft: VoiceMessageDraft | null) => {
    voiceMessageDraftRef.current = draft;
    setVoiceMessageDraft(draft);
  }, []);

  const handleDeepgramAudioChunk = useCallback((chunk: Uint8Array) => {
    if (voiceRecordingModeRef.current !== 'voiceMessage') return;
    const capturedChunk = new Uint8Array(chunk);
    voiceAudioChunksRef.current.push(capturedChunk);
    const nextLevels = [...voiceWaveformLevelsRef.current, getPcmChunkLevel(capturedChunk)];
    voiceWaveformLevelsRef.current = nextLevels;
    setVoiceLiveWaveformLevels((currentLevels) => [
      ...currentLevels,
      getLiveVoiceLevel(capturedChunk),
    ].slice(-VOICE_MESSAGE_LIVE_WAVEFORM_BARS));
  }, []);

  const {
    isStreaming,
    partialTranscript,
    startListening: deepgramStartListening,
    stopListening: deepgramStopListening,
    cancelListening: deepgramCancelListening,
  } = useDeepgramTranscription({
    getAccessToken: deepgramConfig.getAccessToken,
    model: deepgramConfig.model,
    language: deepgramConfig.language,
    onAudioChunk: handleDeepgramAudioChunk,
    shouldAutoStopOnSilence: () => voiceRecordingModeRef.current !== 'voiceMessage',
    shouldUseStreamingTranscription: () => voiceRecordingModeRef.current !== 'voiceMessage',
    onFinalTranscript: (transcript) => {
      const normalizedTranscript = transcript.trim();
      sendTextMessageRef.current?.(normalizedTranscript);
    },
    onError: (error) => {
      if (voiceRecordingModeRef.current === 'voiceMessage') {
        voiceRecordingStartTokenRef.current += 1;
        isVoiceMessageRecordingRef.current = false;
        voiceRecordingModeRef.current = null;
        ignoreNextMicrophonePressRef.current = false;
        setIsVoiceMessageRecording(false);
        setIsVoiceMessageFinalizing(false);
      }
      Alert.alert('Transcription Error', error);
    },
  });

  const isListening = isStreaming;
  /**
   * Moving to another chat (new, starter, or from history) starts with an empty bar: typed
   * text and a voice session still listening belong to the chat being left. A recorded voice
   * message keeps its own draft flow.
   */
  const resetComposerForChatSwitch = useCallback(() => {
    inputValueRef.current = '';
    setInputValue('');
    if (voiceRecordingModeRef.current !== 'voiceMessage') {
      void deepgramCancelListening().catch(() => {});
    }
  }, [deepgramCancelListening]);
  const isCurrentSessionTyping = !!activeSessionId && typingSessionIds.includes(activeSessionId);
  const showCompactHandoffLoader = isBootstrappingCompactHandoff && chatMessages.length === 0;
  // Fix my life starts a new chat, so any assistant text or card in it is the first reply.
  const hasFirstAssistantReply = chatMessages.some((message) => message.role === 'assistant' && (!!message.content?.trim() || !!message.card));
  const hasFailedDelivery = chatMessages.some((message) => message.deliveryStatus === 'failed');
  const isAwaitingFixMyLifeReply = fixMyLifeWaitPhase === 'starting'
    || (fixMyLifeWaitPhase === 'sent' && !hasFirstAssistantReply && !hasFailedDelivery);
  const activeChatSession = activeSessionId
    ? chatSessions.find((session) => session.id === activeSessionId)
    : null;
  const weekPlanPendingDraftIds = useMemo(() => new Set(
    chatMessages
      .map((message) => message?.card)
      .filter((card) => card?.type === 'dayPlan' && card.saved !== true && card.cancelled !== true)
      .map((card) => String(card.draftId || ''))
  ), [chatMessages]);
  // The chat history always lists every chat, Fix my life ones included.
  const historySessions = chatSessions;
  const visibleChatTitle =
    (activeChatSession?.titleGeneratedAt || activeChatSession?.titleManuallySet) &&
    activeChatSession.title &&
    activeChatSession.title !== 'New Chat'
      ? activeChatSession.title
      : '';

  const stopAssistantTyping = useCallback((sessionId?: string | null) => {
    if (!sessionId) return;
    setTypingSessionIds((current) => current.filter((id) => id !== sessionId));
  }, []);

  const replaceVisibleChat = useCallback((sessionId: string | null, messages: ChatUIMessage[], summary = '') => {
    const nextMessages = ensureVisibleMessageIds(messages, sessionId || 'chat');
    nextMessages.forEach((message) => {
      if (message.role === 'assistant' && message.id && !message.isStreaming) seenAssistantMessageIdsRef.current.add(message.id);
    });
    activeSessionIdRef.current = sessionId;
    chatMessagesRef.current = nextMessages;
    footerHeightRef.current = 0;
    setActiveSessionId(sessionId);
    setActiveSessionSummary(summary);
    setChatMessages(nextMessages);
  }, []);

  const refreshChatSessions = useCallback(async () => {
    try {
      const sessions = await listChatSessions();
      setChatSessions(sessions);
      return sessions;
    } catch {
      return [];
    }
  }, []);

  const maybeGenerateEarlyChatTitle = useCallback(async (sessionId: string | null, messages: ChatUIMessage[]) => {
    if (!sessionId || titleGenerationSessionIdsRef.current.has(sessionId)) return;
    const meaningful = messages.filter((message) => isMeaningfulChatMessage(message));
    if (!meaningful.some((message) => message.role === 'assistant')) return;

    const substantiveUserMessageCount = meaningful.filter(isSubstantiveTitleUserMessage).length;
    // A Fix my life chat always opens the same way, so it is named after the user's
    // answer (the week's goal), which is their second message.
    const isFixMyLife = meaningful.find((message) => message.role === 'user')?.content?.trim() === FIX_MY_LIFE_PROMPT;
    const titleAtUserMessage = isFixMyLife ? 2 : AUTO_TITLE_MAX_USER_MESSAGES;
    if (substantiveUserMessageCount < titleAtUserMessage || substantiveUserMessageCount > titleAtUserMessage + (isFixMyLife ? 2 : 0)) return;

    titleGenerationSessionIdsRef.current.add(sessionId);
    try {
      const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
      // Fix my life chats named before this rule all read "Plan Whole Week"; those are renamed too.
      const hasGenericFixMyLifeTitle = isFixMyLife && /^(?:plan (?:my )?whole week|dayplan card)$/i.test(String(session.title || '').trim());
      if (session.titleManuallySet || (session.titleGeneratedAt && !hasGenericFixMyLifeTitle)) return;

      const recent = getTitleContextMessages(meaningful);
      if (!recent.length) return;

      const resp = await fetch(`${SERVER_URL}/ai/route`, {
        method: 'POST',
        headers: await getAiRequestHeaders('aiChatTitle'),
        body: JSON.stringify({
          clientId: clientIdRef.current || undefined,
          messages: [
            ...(isFixMyLife ? [{
              role: 'system',
              content: 'This chat plans the week around one goal. Name it after that goal, as "Week: <goal>", e.g. "Week: Learn English" or "Week: Run 10k". Use the goal the user gave, not the opening request.',
            }] : []),
            {
              role: 'system',
              content: 'Create a concise, specific title for this chat session. Respond only as JSON with key: title. Do not call tools. Ignore greetings and small talk. Base the title on the user request and the useful assistant answer, not the assistant greeting. Prefer a compact noun phrase over copying a question verbatim. Include the key object or service, so never cut off after words like my, your, the, a, an, to, for, with, or about. Use 2 to 5 words. Never exceed 5 words. Examples: "Where do I connect my Google account?" -> "Connect Google Account"; "How can I reply to Sarah?" -> "Reply To Sarah".',
            },
            ...recent,
          ],
        }),
      });
      if (!resp.ok) return;

      const json = await resp.json().catch(() => null);
      const nextTitle = normalizeGeneratedChatTitle(parseChatTitlePayload(String(json?.result?.message?.content || '')));
      if (!nextTitle) return;

      await database.write(async () => {
        const fresh = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
        if (fresh.titleManuallySet || (fresh.titleGeneratedAt && !hasGenericFixMyLifeTitle)) return;
        await fresh.update((record) => {
          record.title = nextTitle;
          record.titleGeneratedAt = Date.now();
        });
      });
      await refreshChatSessions();
    } catch {
    } finally {
      titleGenerationSessionIdsRef.current.delete(sessionId);
    }
  }, [refreshChatSessions]);

  const renameChatSession = useCallback(async (sessionId: string | null, title: string) => {
    if (!sessionId) {
      throw new Error('CHAT_SESSION_NOT_FOUND');
    }
    const updatedTitle = await updateChatSessionTitle(sessionId, title, true);
    setChatSessions((current) => current.map((session) =>
      session.id === sessionId
        ? { ...session, title: updatedTitle, titleManuallySet: true, titleGeneratedAt: 0 }
        : session
    ));
    await refreshChatSessions();
    return { title: updatedTitle };
  }, [refreshChatSessions]);

  const loadSessionIntoChat = useCallback(async (sessionId: string) => {
    try {
      const { session, messages } = await loadChatSession(sessionId);
      resetToolMemory();
      clearAssistantReadAnchor();
      pendingGoalQuotaDateRequestRef.current = null;
      setGoalQuotaDatePickerInput(null);
      replaceVisibleChat(session.id, messages, session.summary || '');
      footerHeightRef.current = 0;
      stickyFollowEnabledRef.current = true;
      queueScrollToBottom(true);
    } catch (error) {
      console.error('Failed to load chat session:', error);
      Alert.alert('Error', 'Could not load this chat session.');
    }
  }, [clearAssistantReadAnchor, queueScrollToBottom, replaceVisibleChat]);

  const appendMessagesToSession = useCallback(async (
    targetSessionId: string | null,
    messages: ChatUIMessage[],
    options?: { showInVisibleChat?: boolean; seedMessages?: ChatUIMessage[]; suppressAssistantScroll?: boolean }
  ) => {
    const lastVisibleMessage = targetSessionId && targetSessionId === activeSessionIdRef.current
      ? chatMessagesRef.current[chatMessagesRef.current.length - 1]
      : null;
    const meaningful = messages.filter((message, index) => {
      if (!isMeaningfulChatMessage(message)) return false;
      if (message.role !== 'assistant' || message.card) return true;
      const previousMessage = index > 0
        ? messages.slice(0, index).reverse().find((candidate) => isMeaningfulChatMessage(candidate))
        : lastVisibleMessage;
      return !(
        previousMessage?.role === 'assistant' &&
        !previousMessage.card &&
        String(previousMessage.content || '').trim() === String(message.content || '').trim()
      );
    });
    if (!meaningful.length) return targetSessionId;
    const titleSourceMessages = options?.seedMessages || chatMessagesRef.current.concat(meaningful);
    const sessionId = await appendChatMessagesToSession(targetSessionId, meaningful, {
      seedMessages: options?.seedMessages,
      titleSourceMessages,
    });
    if (!sessionId) return null;
    const visibleMessages = ensureVisibleMessageIds(
      meaningful,
      sessionId,
      options?.showInVisibleChat && activeSessionIdRef.current === sessionId
        ? new Set(chatMessagesRef.current.map((message) => String(message.id || '')).filter(Boolean))
        : new Set<string>()
    );
    let nextVisibleMessagesForTitle: ChatUIMessage[] | null = null;
    if (options?.showInVisibleChat) {
      const firstAssistantIndex = visibleMessages.findIndex((message) => message.role === 'assistant');
      if (activeSessionIdRef.current !== sessionId) {
        replaceVisibleChat(sessionId, visibleMessages, '');
        nextVisibleMessagesForTitle = visibleMessages;
        if (firstAssistantIndex >= 0 && !options?.suppressAssistantScroll) {
          queueScrollToAssistantStart(firstAssistantIndex, false);
        }
      } else {
        const firstAssistantAbsoluteIndex = firstAssistantIndex >= 0
          ? chatMessagesRef.current.length + firstAssistantIndex
          : -1;
        const nextMessages = [...chatMessagesRef.current, ...visibleMessages];
        chatMessagesRef.current = nextMessages;
        setChatMessages(nextMessages);
        nextVisibleMessagesForTitle = nextMessages;
        if (firstAssistantAbsoluteIndex >= 0 && !options?.suppressAssistantScroll) {
          queueScrollToAssistantStart(firstAssistantAbsoluteIndex, false);
        }
      }
      if (firstAssistantIndex < 0 && sessionId === activeSessionIdRef.current && shouldKeepLatestVisible(sessionId)) {
        queueScrollToBottom(false);
      }
    }
    await refreshChatSessions();
    if (nextVisibleMessagesForTitle && meaningful.some((message) => message.role === 'assistant')) {
      void maybeGenerateEarlyChatTitle(sessionId, nextVisibleMessagesForTitle);
    }
    return sessionId;
  }, [maybeGenerateEarlyChatTitle, queueScrollToAssistantStart, queueScrollToBottom, refreshChatSessions, replaceVisibleChat, shouldKeepLatestVisible]);

  const appendRecipeTodoOfferIfNeeded = useCallback(async (
    sessionId: string | null,
    messages: ChatUIMessage[]
  ) => {
    if (!sessionId || sessionId !== activeSessionIdRef.current) {
      return false;
    }
    const offerMessage = buildRecipeTodoOfferMessage(messages);
    if (!offerMessage) {
      return false;
    }
    await appendMessagesToSession(sessionId, [offerMessage], {
      showInVisibleChat: true,
    });
    return true;
  }, [appendMessagesToSession]);

  const finishChatDayPlanTutorialAndOpenTodo = useCallback(async (
    sessionId: string | null,
    options: { appendHandoffMessage?: boolean } = {}
  ) => {
    const uid = authUser?.uid || auth.currentUser?.uid || '';
    if (!uid || isFinishingChatDayPlanTutorialRef.current || !isChatDayPlanTutorialPendingRef.current) {
      return;
    }

    isFinishingChatDayPlanTutorialRef.current = true;
    try {
      let demoTodoId = '';
      try {
        const demoTodo = await ensureTutorialDemoTodo();
        demoTodoId = demoTodo.id;
        await setTutorialTodoDemoTodoId(uid, demoTodoId);
      } catch (error) {
        console.warn('Failed to prepare tutorial todo', error);
      }

      if (options.appendHandoffMessage !== false && sessionId) {
        await appendMessagesToSession(sessionId, [{ role: 'assistant', content: TODO_TUTORIAL_HANDOFF_MESSAGE }], {
          showInVisibleChat: sessionId === activeSessionIdRef.current,
        }).catch((error) => {
          console.warn('Failed to append tutorial handoff message', error);
        });
      }

      await completeChatDayPlanTutorial(false);

      if (demoTodoId) {
        const skipTodoAndGoalTutorialsToCalendar = async () => {
          await completeTutorialStep(uid, TUTORIAL_TODO_GUIDANCE_STEP).catch((error) => {
            console.warn('Failed to persist skipped todo tutorial completion', error);
          });
          await completeTutorialStep(uid, TUTORIAL_GOAL_GUIDANCE_STEP).catch((error) => {
            console.warn('Failed to persist skipped goal tutorial completion', error);
          });
          startGuidance(
            {
              type: 'screen',
              route: '/(tabs)/calendar',
              // "Great! Now you know how to create goals… Tap Calendar in the bottom bar."
              params: { calendarAction: 'tutorial-create', calendarTutorialHandoff: 'goal-complete' },
            },
            'Calendar',
            {
              onSkipSegment: () => {
                void (async () => {
                  await completeTutorialStep(uid, TUTORIAL_CALENDAR_EVENT_STEP).catch((error) => {
                    console.warn('Failed to persist skipped calendar tutorial completion', error);
                  });
                  startGuidance(
                    {
                      type: 'screen',
                      route: '/(tabs)/home',
                      params: { homeAction: 'tutorial-open-home' },
                    },
                    'Home',
                    {
                      onSkipSegment: () => {
                        void (async () => {
                          await completeTutorialStep(uid, TUTORIAL_HOME_OVERVIEW_STEP).catch((error) => {
                            console.warn('Failed to persist skipped home tutorial completion', error);
                          });
                          showWishlistTutorialInfo();
                        })();
                      },
                    }
                  );
                })();
              },
            }
          );
        };

        startGuidance(
          { type: 'todo', todoId: demoTodoId, workspaceKey: 'Personal' },
          'the demo task. Tap it to open details',
          {
            keepLocatedTargetCard: true,
            useTutorialCardPlacement: true,
            onSkipSegment: () => {
              void skipTodoAndGoalTutorialsToCalendar();
            },
            // "skip": past the To Do part; the To Do screen then starts the Goals part.
            onNext: () => {
              showGuidanceTab('todo');
              startGuidance(
                { type: 'screen', route: '/(tabs)/todo', params: { todoAction: 'tutorial-skip-personal' } },
                'Goals',
                { onSkipSegment: () => { void skipTodoAndGoalTutorialsToCalendar(); } }
              );
            },
            nextLabel: 'skip',
          }
        );
      }

    } finally {
      isFinishingChatDayPlanTutorialRef.current = false;
    }
  }, [appendMessagesToSession, authUser?.uid, completeChatDayPlanTutorial, showWishlistTutorialInfo, startGuidance]);

  skipChatDayPlanTutorialRef.current = () => {
    void finishChatDayPlanTutorialAndOpenTodo(activeSessionIdRef.current, { appendHandoffMessage: false });
  };

  const clearPendingStreamChunks = useCallback((requestId: string) => {
    pendingStreamChunksRef.current.delete(requestId);
  }, []);

  const clearAllPendingStreamChunks = useCallback(() => {
    pendingStreamChunksRef.current.clear();
  }, []);

  const updateVisibleMessageDelivery = useCallback((
    messageId: string | null | undefined,
    deliveryStatus?: ChatUIMessage['deliveryStatus'],
    deliveryError?: string
  ) => {
    const normalizedMessageId = String(messageId || '').trim();
    if (!normalizedMessageId) return false;
    const sessionId = activeSessionIdRef.current;

    let didUpdate = false;
    const nextMessages = chatMessagesRef.current.map((message) => {
      if (message.id !== normalizedMessageId) return message;
      if (message.deliveryStatus === deliveryStatus && message.deliveryError === deliveryError) return message;
      didUpdate = true;
      return {
        ...message,
        deliveryStatus,
        deliveryError,
      };
    });

    if (!didUpdate) return false;
    chatMessagesRef.current = nextMessages;
    setChatMessages(nextMessages);
    if (sessionId) {
      void updateChatMessageDeliveryState(sessionId, normalizedMessageId, deliveryStatus, deliveryError)
        .catch((error) => {
          console.warn('Could not update chat message delivery state:', error);
        });
    }
    return true;
  }, []);

  const clearTrackedRequest = useCallback((requestId: string) => {
    requestSessionMapRef.current.delete(requestId);
    requestTextMapRef.current.delete(requestId);
    requestUserMessageMapRef.current.delete(requestId);
  }, []);

  const markRequestMessageDeliveryFailed = useCallback(async (requestId: string, deliveryError = 'Failed to send to AI.') => {
    const messageId = requestUserMessageMapRef.current.get(requestId);
    if (!messageId) return false;
    const sessionId = requestSessionMapRef.current.get(requestId) || activeSessionIdRef.current;
    const didUpdate = updateVisibleMessageDelivery(messageId, 'failed', deliveryError);
    let didPersist = false;
    if (sessionId) {
      didPersist = await updateChatMessageDeliveryState(sessionId, messageId, 'failed', deliveryError)
        .catch((error) => {
          console.warn('Could not update chat message delivery state:', error);
          return false;
        });
    }
    return didUpdate || didPersist;
  }, [updateVisibleMessageDelivery]);

  const finalizeStreamingMessage = useCallback(async (requestId: string, content: string, meta?: any) => {
    const sessionId = requestSessionMapRef.current.get(requestId) || null;
    if (!sessionId) {
      logChatStream('finalize-missing-session', { requestId, contentLength: content.length });
      return;
    }
    const fallbackContent = pendingStreamChunksRef.current.get(requestId) || '';
    clearPendingStreamChunks(requestId);
    clearTrackedRequest(requestId);

    const trimmedContent = (content || fallbackContent).trim();
    logChatStream('finalize-message', {
      sessionId,
      requestId,
      contentLength: trimmedContent.length,
    });
    const card = buildAssistantMetaCard(meta);
    if (trimmedContent) {
      const didAppendRecipeOffer = await appendRecipeTodoOfferIfNeeded(sessionId, chatMessagesRef.current);
      await appendMessagesToSession(sessionId, [{ role: 'assistant', content: trimmedContent, card }], { showInVisibleChat: false });
      if (sessionId === activeSessionIdRef.current) {
        const assistantIndex = chatMessagesRef.current.length;
        const nextMessages = [
          ...chatMessagesRef.current,
          ...ensureVisibleMessageIds(
            [{ role: 'assistant' as const, content: trimmedContent, card }],
            `final-${requestId}`,
            new Set(chatMessagesRef.current.map((message) => String(message.id || '')).filter(Boolean))
          ),
        ];
        chatMessagesRef.current = nextMessages;
        setChatMessages(nextMessages);
        if (!didAppendRecipeOffer) {
          queueScrollToAssistantStart(assistantIndex, false);
        }
        void maybeGenerateEarlyChatTitle(sessionId, nextMessages);
      }
      maybeRestoreChatDayPlanTutorialAfterResponse(requestId, [{ role: 'assistant', content: trimmedContent, card } as ChatUIMessage]);
    }
    restoreWishlistTutorialAfterFailedRequest(requestId);
  }, [appendMessagesToSession, appendRecipeTodoOfferIfNeeded, clearPendingStreamChunks, clearTrackedRequest, maybeGenerateEarlyChatTitle, maybeRestoreChatDayPlanTutorialAfterResponse, queueScrollToAssistantStart, restoreWishlistTutorialAfterFailedRequest]);

  const startAssistantTyping = useCallback((sessionId?: string | null) => {
    if (!sessionId) return;
    setTypingSessionIds((current) => current.includes(sessionId) ? current : [...current, sessionId]);
    if (sessionId === activeSessionIdRef.current) {
      queueScrollToBottom(false);
    }
  }, [queueScrollToBottom]);

  const waitForStreamingClientId = useCallback(async (timeoutMs = 1200) => {
    if (clientIdRef.current) return clientIdRef.current;
    if (!eventSourceRef.current) return null;

    logChatStream('wait-for-sse-ready', { timeoutMs });

    return await new Promise<string | null>((resolve) => {
      let settled = false;

      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        try { clearTimeout(timeout); } catch { }
        resolve(value);
      };

      const timeout = setTimeout(() => {
        sseReadyResolversRef.current = sseReadyResolversRef.current.filter((item) => item !== finish);
        finish(clientIdRef.current || null);
      }, timeoutMs);

      sseReadyResolversRef.current.push(finish);
    });
  }, []);

  const setAssistantTypingForActiveSession = useCallback((value: boolean) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    if (value) {
      startAssistantTyping(sessionId);
    } else {
      stopAssistantTyping(sessionId);
    }
  }, [startAssistantTyping, stopAssistantTyping]);

  const handleChatInputFocus = useCallback(() => {
    // The wishlist step's card stays up while they type (sending closes it), like the
    // plan-your-day step, so the instruction and example stay in view.
    const tutorialStage = chatDayPlanTutorialStageRef.current;
    if (isChatDayPlanTutorialPendingRef.current && tutorialStage === 'ai-bar') {
      advanceChatDayPlanTutorial('plan-day');
      inputRef.current?.blur?.();
      return;
    }
    if (isChatDayPlanTutorialPendingRef.current && tutorialStage === 'eazee-button') {
      inputRef.current?.blur?.();
      return;
    }
    setIsAiInputFocused(true);
    if (queuePendingAssistantReadAnchor(false)) {
      return;
    }
    stickyFollowEnabledRef.current = true;
    isUserScrollingRef.current = false;
    lockBottomTemporarily();
    queueScrollToBottom(false);
    if (Platform.OS === 'android') {
      if (keyboardSyncTimeoutRef.current) {
        clearTimeout(keyboardSyncTimeoutRef.current);
      }
      keyboardSyncTimeoutRef.current = setTimeout(() => {
        keyboardSyncTimeoutRef.current = null;
        lockBottomTemporarily();
        queueScrollToBottom(false);
      }, 80);
    }
  }, [advanceChatDayPlanTutorial, lockBottomTemporarily, queuePendingAssistantReadAnchor, queueScrollToBottom]);

  const appendVisibleChatMessages = useCallback((messages: ChatUIMessage[]) => {
    return appendMessagesToSession(activeSessionIdRef.current, messages, { showInVisibleChat: true });
  }, [appendMessagesToSession]);

  const persistRecipeTodoOfferCardState = useCallback(async (
    offerKey: string,
    patch: Pick<RecipeTodoOfferCardValue, 'opened' | 'dismissed'>
  ) => {
    const normalizedOfferKey = String(offerKey || '').trim();
    if (!normalizedOfferKey) return;

    const nextMessages = patchRecipeTodoOfferMessages(chatMessagesRef.current, normalizedOfferKey, patch);
    if (nextMessages !== chatMessagesRef.current) {
      chatMessagesRef.current = nextMessages;
      setChatMessages(nextMessages);
    }

    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    try {
      await updateRecipeTodoOfferCardState(sessionId, normalizedOfferKey, patch);
    } catch (error) {
      console.warn('Could not update recipe todo offer card state:', error);
    }
  }, []);

  const persistDayPlanCardState = useCallback(async (card: DayPlanCardValue) => {
    const draftId = String(card?.draftId || '').trim();
    if (!draftId) return;

    const nextMessages = chatMessagesRef.current.map((message) => {
      if (message?.card?.type !== 'dayPlan' || String(message.card.draftId || '').trim() !== draftId) {
        return message;
      }
      return { ...message, card };
    });
    chatMessagesRef.current = nextMessages;
    setChatMessages(nextMessages);
    setLastDayPlan({
      draftId,
      date: card.date,
      calendarItems: card.calendarItems || [],
      todoItems: card.todoItems || [],
      timelineItems: card.timelineItems || [],
      saveBlockedReason: card.saveBlockedReason,
      repeatWeekly: card.repeatWeekly === true,
    });

    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    try {
      await updateDayPlanCardState(sessionId, draftId, card);
    } catch (error) {
      console.warn('Could not update day plan card state:', error);
    }
  }, []);

  const saveDayPlanCard = useCallback(async (card: DayPlanCardValue, options?: { quiet?: boolean }): Promise<boolean> => {
    if (!card || card.type !== 'dayPlan' || card.saved === true || card.cancelled === true || getDayPlanDraftCount(card) === 0) return false;
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return false;

    setLastDayPlanFromCard(card);
    startAssistantTyping(sessionId);
    try {

      let saveResult: any = null;
      try {
        saveResult = await executeToolCall(
          {
            name: 'save_day_plan',
            arguments: {},
          },
          { serverUrl: SERVER_URL, router }
        );
      } catch (e: any) {
        saveResult = {
          success: false,
          error: String(e?.message || e || 'Tool execution failed'),
          messages: [{ role: 'assistant', content: 'Something went wrong while I was doing that.' }],
        };
      }

      const saveMessages = Array.isArray(saveResult?.messages) ? saveResult.messages : [];
      if (saveMessages.length && !options?.quiet) {
        await appendMessagesToSession(sessionId, saveMessages, {
          showInVisibleChat: sessionId === activeSessionIdRef.current,
        });
      }

      const saveActions = Array.isArray(saveResult?.uiActions) && !options?.quiet ? saveResult.uiActions : [];
      for (const action of saveActions) {
        if (action?.type === 'navigate') {
          try { router.push({ pathname: action.route, params: action.params || {} }); } catch { }
        }
      }

      if (saveResult?.success) {
        const draftId = String(card.draftId || '').trim();
        if (draftId) {
          const savedCard = { ...card, saved: true };
          const nextMessages = chatMessagesRef.current.map((message) => {
            if (message?.card?.type !== 'dayPlan' || String(message.card.draftId || '').trim() !== draftId) {
              return message;
            }
            return { ...message, card: savedCard };
          });
          chatMessagesRef.current = nextMessages;
          setChatMessages(nextMessages);
          try {
            await updateDayPlanCardState(sessionId, draftId, savedCard);
          } catch (error) {
            console.warn('Could not mark day plan card saved:', error);
          }
          if (isChatDayPlanTutorialPendingRef.current) {
            void finishChatDayPlanTutorialAndOpenTodo(sessionId);
          }
        }
      }
      return !!saveResult?.success;
    } finally {
      stopAssistantTyping(sessionId);
    }
  }, [appendMessagesToSession, finishChatDayPlanTutorialAndOpenTodo, router, startAssistantTyping, stopAssistantTyping]);

  /** Saves every day of a week plan still waiting, in date order, with one message at the end. */
  const saveAllDayPlanCards = useCallback(async (draftIds: string[]) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    const wanted = new Set(draftIds);
    const pending = chatMessagesRef.current
      .map((message) => message?.card)
      .filter((card): card is DayPlanCardValue => (
        card?.type === 'dayPlan' && wanted.has(String(card.draftId || '')) && card.saved !== true && card.cancelled !== true
      ));
    let savedDays = 0;
    for (const card of pending) {
      if (await saveDayPlanCard(card, { quiet: true })) savedDays += 1;
    }
    const failedDays = pending.length - savedDays;
    await appendMessagesToSession(sessionId, [{
      role: 'assistant',
      content: failedDays
        ? `Added ${savedDays} of ${pending.length} days to your calendar. Check the others and tap Save plan on them.`
        : `Added ${savedDays} ${savedDays === 1 ? 'day' : 'days'} to your calendar.`,
    }], { showInVisibleChat: sessionId === activeSessionIdRef.current });
  }, [appendMessagesToSession, saveDayPlanCard]);

  const cancelDayPlanCard = useCallback(async (card: DayPlanCardValue) => {
    if (!card || card.type !== 'dayPlan' || card.saved === true || card.cancelled === true) return;
    const draftId = String(card.draftId || '').trim();
    if (!draftId) return;

    const cancelledCard = { ...card, cancelled: true };
    const nextMessages = chatMessagesRef.current.map((message) => {
      if (message?.card?.type !== 'dayPlan' || String(message.card.draftId || '').trim() !== draftId) {
        return message;
      }
      return { ...message, card: cancelledCard };
    });
    chatMessagesRef.current = nextMessages;
    setChatMessages(nextMessages);
    setLastDayPlan(null);

    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    try {
      await updateDayPlanCardState(sessionId, draftId, cancelledCard);
    } catch (error) {
      console.warn('Could not cancel day plan card:', error);
    }
    await appendMessagesToSession(sessionId, [{ role: 'assistant', content: 'Cancelled the plan.' }], {
      showInVisibleChat: sessionId === activeSessionIdRef.current,
    });
  }, [appendMessagesToSession]);

  const openAmazonSearch = useCallback(async (searchUrl: string) => {
    const amazonAppUrl = searchUrl.replace(/^https:\/\//, 'com.amazon.mobile.shopping://');

    try {
      await Linking.openURL(amazonAppUrl);
      return;
    } catch {}

    try {
      await Linking.openURL(searchUrl);
    } catch (error) {
      console.error('Error opening Amazon search URL from chat:', error);
      Alert.alert('Error', 'Unable to open Amazon. Please try again.');
    }
  }, []);

  const handleBuyWishlistTodo = useCallback(async (item: { id?: string; text: string; workspace?: string }) => {
    if (item.workspace !== 'Wishlist') return;

    const todoId = typeof item.id === 'string' ? item.id : '';
    if (todoId && buyingWishlistTodoId === todoId) {
      return;
    }

    if (todoId) {
      setBuyingWishlistTodoId(todoId);
    }

    try {
      const countryCode = await readProfileCountryCode(auth.currentUser?.uid);
      const searchUrl = buildAmazonSearchUrl(String(item.text || ''), countryCode);
      if (!searchUrl) {
        Alert.alert('Error', 'Unable to search Amazon for this item.');
        return;
      }

      await openAmazonSearch(searchUrl);
    } finally {
      if (todoId) {
        setBuyingWishlistTodoId((currentTodoId) => currentTodoId === todoId ? null : currentTodoId);
      }
    }
  }, [buyingWishlistTodoId, openAmazonSearch]);

  const handleOpenRecipeTodoOffer = useCallback(async (offer: RecipeTodoOfferCardValue) => {
    const recipeTitle = String(offer?.recipeTitle || '').trim();
    const offerKey = String(offer?.offerKey || getRecipeTodoOfferKey(recipeTitle)).trim();
    if (!recipeTitle || !offerKey) {
      return false;
    }

    try {
      let todo = await findExistingPersonalRecipeTodo(offerKey);
      let didCreate = false;
      if (!todo) {
        const details = String(offer?.details || '').trim();
        const created = await createTodo({
          text: recipeTitle,
          details: details && getRecipeTodoOfferKey(details) !== offerKey ? details : '',
          completed: false,
          dueDate: getDefaultRecipeTodoDueDate(),
          hasDueTime: false,
          starred: false,
          workspace: 'Personal',
          type: 'basic',
          progress: 0,
          isAmazonUrlLoaded: false,
          amazonUrlLoadAttempts: 0,
          taskKind: 'recipe',
          guidancePath: null,
        });
        todo = created.todo;
        didCreate = true;
      }

      const memoryItem = toTodoMemoryItem(todo);
      setLastQueryItems([memoryItem]);
      if (didCreate) {
        appendCreatedTodoItems([memoryItem]);
      }
      await persistRecipeTodoOfferCardState(offerKey, { opened: true, dismissed: false });
      router.push({
        pathname: '/(tabs)/todo',
        params: {
          workspaceKey: 'Personal',
          openTodoId: String(todo.id),
          openTodoNonce: String(Date.now()),
        },
      });
      return true;
    } catch (error) {
      console.warn('Could not open recipe todo offer:', error);
      return false;
    }
  }, [persistRecipeTodoOfferCardState, router]);

  const handleDismissRecipeTodoOffer = useCallback(async (offer: RecipeTodoOfferCardValue) => {
    const offerKey = String(offer?.offerKey || getRecipeTodoOfferKey(String(offer?.recipeTitle || ''))).trim();
    await persistRecipeTodoOfferCardState(offerKey, { dismissed: true });
  }, [persistRecipeTodoOfferCardState]);

  const markGoalQuotaPlanResolved = useCallback((planId: string) => {
    setResolvedGoalQuotaPlanIds((current) => {
      if (current.has(planId)) {
        return current;
      }
      const next = new Set(current);
      next.add(planId);
      return next;
    });
  }, []);

  const markGoalQuotaTypedPlanIgnored = useCallback((planId: string) => {
    setIgnoredGoalQuotaTypedPlanIds((current) => {
      if (current.has(planId)) {
        return current;
      }
      const next = new Set(current);
      next.add(planId);
      return next;
    });
  }, []);

  const clearPendingGoalQuotaDate = useCallback((planId?: string) => {
    const pending = pendingGoalQuotaDateRequestRef.current;
    if (!pending) {
      return;
    }
    if (!planId || pending.planId === planId) {
      pendingGoalQuotaDateRequestRef.current = null;
    }
  }, []);

  const handlePickGoalQuotaDate = useCallback((input: GoalQuotaDatePickInput, sessionId?: string | null) => {
    pendingGoalQuotaDateRequestRef.current = {
      ...input,
      sessionId: sessionId ?? activeSessionIdRef.current,
    };
    setPendingGoalQuotaDate(startOfDay(new Date()));
    setGoalQuotaDatePickerInput(input);
  }, []);

  const handleCloseGoalQuotaDatePicker = useCallback(() => {
    clearPendingGoalQuotaDate(goalQuotaDatePickerInput?.planId);
    setGoalQuotaDatePickerInput(null);
  }, [clearPendingGoalQuotaDate, goalQuotaDatePickerInput?.planId]);

  const handleScheduleGoalQuotaForDate = useCallback(async (
    input: GoalQuotaDatePickInput,
    date: Date,
    sessionIdOverride?: string | null
  ) => {
    if (!input.planId || isSchedulingGoalQuotaActionRef.current) {
      return false;
    }

    const sessionId = sessionIdOverride ?? activeSessionIdRef.current;
    if (!sessionId) {
      return false;
    }

    isSchedulingGoalQuotaActionRef.current = true;
    setIsSchedulingGoalQuotaAction(true);
    startAssistantTyping(sessionId);
    try {
      clearPendingGoalQuotaDate(input.planId);
      const scheduled = await scheduleGoalQuotaAction(input.planId, startOfDay(date));
      markGoalQuotaPlanResolved(input.planId);
      await appendMessagesToSession(sessionId, [{
        role: 'assistant',
        content: `Scheduled for ${formatGoalQuotaDateLabel(startOfDay(date))}.`,
        card: { type: 'todoCreated', items: scheduled.todo ? [toChatTodoCardItem(scheduled.todo)] : [] },
      }], {
        showInVisibleChat: sessionId === activeSessionIdRef.current,
      });
      return true;
    } catch (error: any) {
      await appendMessagesToSession(sessionId, [{
        role: 'assistant',
        content: String(error?.message || error || 'Could not schedule that action.'),
      }], {
        showInVisibleChat: sessionId === activeSessionIdRef.current,
      });
      return false;
    } finally {
      stopAssistantTyping(sessionId);
      isSchedulingGoalQuotaActionRef.current = false;
      setIsSchedulingGoalQuotaAction(false);
    }
  }, [
    appendMessagesToSession,
    clearPendingGoalQuotaDate,
    markGoalQuotaPlanResolved,
    startAssistantTyping,
    stopAssistantTyping,
  ]);

  const handleDoGoalQuotaToday = useCallback((input: GoalQuotaDatePickInput) =>
    handleScheduleGoalQuotaForDate(input, startOfDay(new Date())), [handleScheduleGoalQuotaForDate]);

  const handleDecideGoalQuotaLater = useCallback(async (
    input: GoalQuotaDatePickInput,
    sessionIdOverride?: string | null
  ) => {
    if (!input.planId || isSchedulingGoalQuotaActionRef.current) {
      return false;
    }

    const sessionId = sessionIdOverride ?? activeSessionIdRef.current;
    if (!sessionId) {
      return false;
    }

    isSchedulingGoalQuotaActionRef.current = true;
    setIsSchedulingGoalQuotaAction(true);
    startAssistantTyping(sessionId);
    try {
      clearPendingGoalQuotaDate(input.planId);
      await dismissGoalQuotaInitialPrompt(input.planId);
      markGoalQuotaPlanResolved(input.planId);
      await appendMessagesToSession(sessionId, [{
        role: 'assistant',
        content: 'Okay, no action was added. You can schedule it from the goal later.',
      }], {
        showInVisibleChat: sessionId === activeSessionIdRef.current,
      });
      return true;
    } catch (error: any) {
      await appendMessagesToSession(sessionId, [{
        role: 'assistant',
        content: String(error?.message || error || 'Could not update that goal.'),
      }], {
        showInVisibleChat: sessionId === activeSessionIdRef.current,
      });
      return false;
    } finally {
      stopAssistantTyping(sessionId);
      isSchedulingGoalQuotaActionRef.current = false;
      setIsSchedulingGoalQuotaAction(false);
    }
  }, [
    appendMessagesToSession,
    clearPendingGoalQuotaDate,
    markGoalQuotaPlanResolved,
    startAssistantTyping,
    stopAssistantTyping,
  ]);

  const handleGoalQuotaDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      handleCloseGoalQuotaDatePicker();
      return;
    }

    if (!selectedDate) {
      return;
    }

    const nextDate = startOfDay(selectedDate);
    if (Platform.OS === 'android' && event.type === 'set') {
      const input = goalQuotaDatePickerInput;
      const sessionId = pendingGoalQuotaDateRequestRef.current?.sessionId;
      setGoalQuotaDatePickerInput(null);
      clearPendingGoalQuotaDate(input?.planId);
      if (input) {
        requestAnimationFrame(() => {
          void handleScheduleGoalQuotaForDate(input, nextDate, sessionId);
        });
      }
      return;
    }

    setPendingGoalQuotaDate(nextDate);
  }, [
    clearPendingGoalQuotaDate,
    goalQuotaDatePickerInput,
    handleCloseGoalQuotaDatePicker,
    handleScheduleGoalQuotaForDate,
  ]);

  const handleConfirmGoalQuotaDate = useCallback(() => {
    const input = goalQuotaDatePickerInput;
    const sessionId = pendingGoalQuotaDateRequestRef.current?.sessionId;
    setGoalQuotaDatePickerInput(null);
    clearPendingGoalQuotaDate(input?.planId);
    if (input) {
      void handleScheduleGoalQuotaForDate(input, pendingGoalQuotaDate, sessionId);
    }
  }, [
    clearPendingGoalQuotaDate,
    goalQuotaDatePickerInput,
    handleScheduleGoalQuotaForDate,
    pendingGoalQuotaDate,
  ]);

  const parseSummaryPayload = useCallback((raw: string) => {
    const clean = (raw || '').trim();
    if (!clean) return { title: '', summary: '' };
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch?.[0]) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
          summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
        };
      } catch { }
    }
    return { title: '', summary: clean };
  }, []);

  const formatChatDateForModel = useCallback((value?: string | null, hasDueTime?: boolean) => {
    if (!value) return '';
    const date = parseCalendarDateValue(value);
    if (!date) return String(value);
    if (hasDueTime) {
      return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }, []);

  const summarizeCardForModel = useCallback((card: any) => {
    if (!card || typeof card !== 'object') return '';

    if (card.type === 'webSearch') {
      const query = typeof card.query === 'string' ? card.query.trim() : '';
      return query
        ? `The previous assistant answer came from a live web search for: ${query}`
        : 'The previous assistant answer came from a live web search.';
    }

    if (card.type === 'todoCreated' || card.type === 'todoUpdated' || card.type === 'todoQuery') {
      const items = Array.isArray(card.items) ? card.items : [];
      return items
        .slice(0, 8)
        .map((item: any) => {
          const text = String(item?.text || '').trim();
          const due = formatChatDateForModel(item?.dueDate, !!item?.hasDueTime);
          return text ? `Task: ${text}${due ? ` | due ${due}` : ''}` : '';
        })
        .filter(Boolean)
        .join('\n');
    }

    if (card.type === 'goalQuotaSchedule') {
      const goalTitle = String(card.goal?.text || '').trim();
      return goalTitle
        ? `Quota goal scheduling pending for: ${goalTitle}`
        : 'Quota goal scheduling pending.';
    }

    if (card.type === 'recipeTodoOffer') {
      const recipeTitle = String(card.recipeTitle || '').trim();
      return recipeTitle
        ? `Recipe Todo offer shown for: ${recipeTitle}`
        : 'Recipe Todo offer shown.';
    }

    if (card.type === 'calendarDetail' || card.type === 'calendarList') {
      const items = Array.isArray(card.items) ? card.items : [];
      return items
        .slice(0, 8)
        .map((item: any) => {
          const title = String(item?.title || '').trim();
          const hasTime = item?.isAllDay !== true;
          const start = formatChatDateForModel(item?.startDate, hasTime);
          const end = formatChatDateForModel(item?.endDate, hasTime);
          const schedule = start ? `${start}${end ? ` to ${end}` : ''}` : '';
          return title ? `Event: ${title}${schedule ? ` | ${schedule}` : ''}` : '';
        })
        .filter(Boolean)
        .join('\n');
    }

    if (card.type === 'dailyOverview') {
      const date = typeof card.date === 'string' ? card.date : '';
      const todoCount = Array.isArray(card.todos) ? card.todos.length : 0;
      const calendarCount = Array.isArray(card.calendar) ? card.calendar.length : 0;
      return `Overview for ${date || 'the day'}: ${todoCount} tasks and ${calendarCount} events.`;
    }

    if (card.type === 'dayPlan') {
      const date = typeof card.date === 'string' ? card.date : '';
      const todoCount = Array.isArray(card.todoItems) ? card.todoItems.length : 0;
      const calendarCount = Array.isArray(card.calendarItems) ? card.calendarItems.length : 0;
      return `Plan for ${date || 'the day'}: ${todoCount} tasks and ${calendarCount} events.`;
    }

    if (card.type === 'aiActionsLimit') {
      return 'The free daily AI action limit was reached; chatting is still unlimited.';
    }

    if (card.type === 'navigationShortcut') {
      const label = typeof card.label === 'string' ? card.label.trim() : '';
      return label ? `Navigation shortcut to ${label}.` : 'Navigation shortcut to an app screen.';
    }

    return '';
  }, [formatChatDateForModel]);

  const serializeMessageForModel = useCallback((message: ChatUIMessage) => {
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (message.card?.type === 'voiceMessage') {
      return content || String(message.card.transcript || '').trim();
    }
    const cardSummary = summarizeCardForModel(message.card);
    if (content && cardSummary) return `${content}\n${cardSummary}`;
    return content || cardSummary;
  }, [summarizeCardForModel]);

  const summarizeSession = useCallback(async (sessionId: string, messages: ChatUIMessage[]) => {
    const meaningful = messages.filter((message) => isMeaningfulChatMessage(message));
    if (!meaningful.length) return;
    try {
      const session = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
      const recent = meaningful
        .slice(-20)
        .map((message) => ({
          role: message.role,
          content: serializeMessageForModel(message),
        }))
        .filter((message) => message.content.trim().length > 0);
      if (!recent.length) return;
      const resp = await fetch(`${SERVER_URL}/ai/route`, {
        method: 'POST',
        headers: await getAiRequestHeaders('aiChatSummary'),
        body: JSON.stringify({
          clientId: clientIdRef.current || undefined,
          messages: [
            {
              role: 'system',
              content: 'Create a concise rolling summary for this chat session. Respond only as JSON with key: summary. Do not call tools. Keep summary under 600 characters.'
            },
            ...(session.summary ? [{ role: 'system', content: `Previous summary: ${session.summary}` }] : []),
            ...recent,
          ],
        }),
      });
      if (!resp.ok) return;
      const json = await resp.json().catch(() => null);
      const content = String(json?.result?.message?.content || '').trim();
      const parsed = parseSummaryPayload(content);
      const nextSummary = parsed.summary || session.summary || '';
      await database.write(async () => {
        const fresh = await database.collections.get<ChatSessionModel>('chat_sessions').find(sessionId);
        await fresh.update((record) => {
          record.summary = nextSummary;
        });
      });
      if (sessionId === activeSessionIdRef.current) {
        setActiveSessionSummary(nextSummary);
      }
      await refreshChatSessions();
    } catch { }
  }, [parseSummaryPayload, refreshChatSessions, serializeMessageForModel]);

  useEffect(() => {
    if (initialSessionLoadRef.current) return;
    initialSessionLoadRef.current = true;

    const boot = async () => {
      const sessions = await refreshChatSessions();
      try {
        // The chat opens on a fresh chat with the starter buttons; earlier chats are in history.
        void sessions;
      } catch { }
    };
    boot();
  }, [hasPendingCompactHandoff, loadSessionIntoChat, refreshChatSessions]);

  useEffect(() => {
    if (!isHistoryModalVisible) return;
    void refreshChatSessions();
  }, [isHistoryModalVisible, refreshChatSessions]);

  useEffect(() => {
    if (isCurrentSessionTyping) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(typingAnim, {
            toValue: 1,
            duration: 650,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(typingAnim, {
            toValue: 0,
            duration: 650,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      typingAnim.setValue(0);
    }
  }, [isCurrentSessionTyping, typingAnim]);

  useEffect(() => {
    setMicrophoneColor(isListening ? '#12F61A' : '#FFFFFF');
    if (isListening) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      Animated.timing(glowAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [isListening, glowAnim]);

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const syncKeyboardScroll = () => {
      if (Platform.OS !== 'android') return;
      if (queuePendingAssistantReadAnchor(false)) {
        return;
      }
      lockBottomTemporarily();
      if (!(stickyFollowEnabledRef.current || typingSessionIdsRef.current.includes(activeSessionIdRef.current || ''))) {
        return;
      }
      if (keyboardSyncTimeoutRef.current) {
        clearTimeout(keyboardSyncTimeoutRef.current);
      }
      keyboardSyncTimeoutRef.current = setTimeout(() => {
        keyboardSyncTimeoutRef.current = null;
        if (queuePendingAssistantReadAnchor(false)) {
          return;
        }
        queueScrollToBottom(false);
      }, 80);
    };
    const onShow = (e: any) => {
      setIsKeyboardVisible(true);
      const keyboardHeight = e?.endCoordinates?.height || 0;
      const androidKeyboardTop = e?.endCoordinates?.screenY;
      const androidWindowHeight = Dimensions.get('window').height;
      const androidCalculatedOverlap =
        Platform.OS === 'android' && typeof androidKeyboardTop === 'number'
          ? Math.max(0, androidWindowHeight - androidKeyboardTop)
          : keyboardHeight;
      const keyboardOverlap =
        Platform.OS === 'android' && keyboardHeight > 0
          ? Math.min(androidCalculatedOverlap, keyboardHeight)
          : androidCalculatedOverlap;
      setKeyboardInset(Platform.OS === 'android' ? keyboardOverlap : keyboardHeight);
      syncKeyboardScroll();
      const nextOffset =
        Platform.OS === 'android'
          ? keyboardOverlap
          : Math.max(0, keyboardHeight - aiInputBottom);
      Animated.timing(keyboardOffset, {
        toValue: nextOffset,
        duration: Platform.OS === 'ios' ? (e?.duration || 250) : 250,
        useNativeDriver: true,
      }).start();
    };
    const onHide = (e: any) => {
      setIsKeyboardVisible(false);
      setIsAiInputFocused(false);
      setKeyboardInset(0);
      inputRef.current?.blur?.();
      syncKeyboardScroll();
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e?.duration || 250) : 250,
        useNativeDriver: true,
      }).start();
    };
    const subShow = Keyboard.addListener(show, onShow);
    const subHide = Keyboard.addListener(hide, onHide);
    return () => {
      if (keyboardSyncTimeoutRef.current) {
        clearTimeout(keyboardSyncTimeoutRef.current);
        keyboardSyncTimeoutRef.current = null;
      }
      if (forceBottomTimeoutRef.current) {
        clearTimeout(forceBottomTimeoutRef.current);
        forceBottomTimeoutRef.current = null;
      }
      subShow.remove();
      subHide.remove();
    };
  }, [aiInputBottom, keyboardOffset, lockBottomTemporarily, queuePendingAssistantReadAnchor, queueScrollToBottom]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'android') return;

    const parent = navigation.getParent();
    if (!parent) return;

    parent.setOptions({
      tabBarStyle: {
        position: 'absolute',
        left: 28,
        right: 28,
        bottom: 10,
        height: 56,
        marginHorizontal: 20,
        paddingTop: 9,
        paddingBottom: 9,
        paddingHorizontal: 8,
        borderTopWidth: 0,
        borderRadius: 999,
        backgroundColor: 'transparent',
        elevation: 0,
        shadowColor: '#000000',
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        overflow: 'hidden',
        display: isFocused && isAiComposerActive ? 'none' : 'flex',
      },
    });

    return () => {
      parent.setOptions({
        tabBarStyle: {
          position: 'absolute',
          left: 28,
          right: 28,
          bottom: 10,
          height: 56,
          marginHorizontal: 20,
          paddingTop: 9,
          paddingBottom: 9,
          paddingHorizontal: 8,
          borderTopWidth: 0,
          borderRadius: 999,
          backgroundColor: 'transparent',
          elevation: 0,
          shadowColor: '#000000',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          overflow: 'hidden',
          display: 'flex',
        },
      });
    };
  }, [isAiComposerActive, isFocused, navigation]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        try { cancelAnimationFrame(scrollFrameRef.current); } catch { }
      }
      if (keyboardSyncTimeoutRef.current) {
        clearTimeout(keyboardSyncTimeoutRef.current);
      }
      if (forceBottomTimeoutRef.current) {
        clearTimeout(forceBottomTimeoutRef.current);
      }
      if (assistantReadAnchorRetryTimeoutRef.current) {
        clearTimeout(assistantReadAnchorRetryTimeoutRef.current);
      }
    };
  }, []);

  const handleChatScroll = useCallback((event: any) => {
    const offsetY = event?.nativeEvent?.contentOffset?.y || 0;
    const visibleHeight = event?.nativeEvent?.layoutMeasurement?.height || 0;
    const contentHeight = event?.nativeEvent?.contentSize?.height || 0;
    scrollOffsetYRef.current = offsetY;
    if (visibleHeight > 0) {
      visibleListHeightRef.current = visibleHeight;
    }
    totalContentHeightRef.current = contentHeight;
    const isNearBottom = updateNearBottomState(offsetY, visibleHeight, contentHeight);
    if (isNearBottom) {
      stickyFollowEnabledRef.current = true;
      return;
    }
    if (Date.now() < forceBottomUntilRef.current) {
      return;
    }
    if (isUserScrollingRef.current && !typingSessionIdsRef.current.includes(activeSessionIdRef.current || '')) {
      stickyFollowEnabledRef.current = false;
    }
  }, [updateNearBottomState]);

  const handleChatListLayout = useCallback((event: any) => {
    const shouldPreserveLatest = shouldKeepLatestVisible();
    const visibleHeight = event?.nativeEvent?.layout?.height || 0;
    if (visibleHeight <= 0) return;
    visibleListHeightRef.current = visibleHeight;
    updateNearBottomState();
    if (queuePendingAssistantReadAnchor(false)) {
      return;
    }
    if (shouldPreserveLatest || shouldKeepLatestVisible()) {
      queueScrollToBottom(false);
    }
  }, [queuePendingAssistantReadAnchor, queueScrollToBottom, shouldKeepLatestVisible, updateNearBottomState]);

  const handleChatContentSizeChange = useCallback((_width: number, height: number) => {
    const shouldPreserveLatest = shouldKeepLatestVisible();
    totalContentHeightRef.current = height;
    updateNearBottomState();
    if (queuePendingAssistantReadAnchor(false)) {
      return;
    }
    if (shouldPreserveLatest || shouldKeepLatestVisible()) {
      queueScrollToBottom(false);
    }
  }, [queuePendingAssistantReadAnchor, queueScrollToBottom, shouldKeepLatestVisible, updateNearBottomState]);

  const handleChatFooterLayout = useCallback((event: any) => {
    const shouldPreserveLatest = shouldKeepLatestVisible();
    const footerHeight = Math.ceil(event?.nativeEvent?.layout?.height || 0);
    footerHeightRef.current = footerHeight;
    if (queuePendingAssistantReadAnchor(false)) {
      return;
    }
    if (shouldPreserveLatest || shouldKeepLatestVisible()) {
      queueScrollToBottom(false);
    }
  }, [queuePendingAssistantReadAnchor, queueScrollToBottom, shouldKeepLatestVisible]);

  const handleChatScrollToIndexFailed = useCallback((info: any) => {
    const index = assistantReadAnchorIndexRef.current;
    if (index === null || info?.index !== index) return;
    try {
      scrollViewRef.current?.scrollToOffset?.({
        offset: Math.max(0, (info?.averageItemLength || 0) * index),
        animated: false,
      });
    } catch { }
    if (assistantReadAnchorRetryTimeoutRef.current) {
      clearTimeout(assistantReadAnchorRetryTimeoutRef.current);
    }
    assistantReadAnchorRetryTimeoutRef.current = setTimeout(() => {
      assistantReadAnchorRetryTimeoutRef.current = null;
      if (assistantReadAnchorIndexRef.current === index) {
        queueScrollToAssistantStart(index, false);
      }
    }, 80);
  }, [queueScrollToAssistantStart]);

  useEffect(() => {
    if (queuePendingAssistantReadAnchor(false)) {
      return;
    }
    if (stickyFollowEnabledRef.current || isCurrentSessionTyping) {
      queueScrollToBottom(false);
    }
  }, [activeAiInputSpacer, isCurrentSessionTyping, queuePendingAssistantReadAnchor, queueScrollToBottom]);

  // SSE connect
  useEffect(() => {
    if (eventSourceRef.current) return;
    try {
      const es = new SSEEventSource<string>(`${SERVER_URL}/events`);
      eventSourceRef.current = es;
      es.addEventListener('ready', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const nextClientId = data?.clientId ? String(data.clientId) : null;
          if (nextClientId) {
            clientIdRef.current = nextClientId;
            setClientId(nextClientId);
          }
          logChatStream('sse-ready', { clientId: nextClientId });
          if (nextClientId && sseReadyResolversRef.current.length > 0) {
            const resolvers = [...sseReadyResolversRef.current];
            sseReadyResolversRef.current = [];
            for (const resolve of resolvers) {
              resolve(nextClientId);
            }
          }
        } catch { }
      });
      es.addEventListener('assistant.start', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          if (!requestId) return;
          const sessionId = requestSessionMapRef.current.get(requestId);
          logChatStream('assistant-start', {
            requestId,
            sessionId: sessionId || null,
            activeSessionId: activeSessionIdRef.current,
          });
          if (!sessionId) return;
          startAssistantTyping(sessionId);
        } catch { }
      });
      es.addEventListener('assistant.delta', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const delta = typeof data?.delta === 'string' ? data.delta : '';
          const sessionId = requestId ? requestSessionMapRef.current.get(requestId) || null : null;
          logChatStream('assistant-delta', {
            requestId,
            sessionId,
            deltaLength: delta.length,
            deltaPreview: delta.slice(0, 80),
          });
          if (!requestId || !delta || !sessionId) return;
          pendingStreamChunksRef.current.set(requestId, `${pendingStreamChunksRef.current.get(requestId) || ''}${delta}`);
        } catch { }
      });
      es.addEventListener('assistant.done', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const content = typeof data?.content === 'string' ? data.content : '';
          const meta = data?.meta;
          const sessionId = requestId ? requestSessionMapRef.current.get(requestId) || null : null;
          logChatStream('assistant-done', {
            requestId,
            sessionId,
            contentLength: content.length,
          });
          if (!requestId || !sessionId) return;
          void finalizeStreamingMessage(requestId, content, meta).finally(() => {
            stopAssistantTyping(sessionId);
          });
        } catch { }
      });
      es.addEventListener('assistant.reset', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const sessionId = requestId ? requestSessionMapRef.current.get(requestId) || null : null;
          if (!requestId || !sessionId) return;
          clearPendingStreamChunks(requestId);
        } catch { }
      });
      es.addEventListener('assistant.error', async (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const sessionId = requestId ? requestSessionMapRef.current.get(requestId) || null : null;
          const error = String(data?.error || 'Something went wrong while generating that response.');
          logChatStream('assistant-error', {
            requestId,
            sessionId,
            error,
          });
          if (!sessionId) return;
          const didMarkUserMessageFailed = await markRequestMessageDeliveryFailed(requestId, error);
          clearPendingStreamChunks(requestId);
          clearTrackedRequest(requestId);
          if (!didMarkUserMessageFailed) {
            void appendMessagesToSession(sessionId, [
              { role: 'assistant', content: `I ran into a problem while trying that. (${error})` },
            ], { showInVisibleChat: sessionId === activeSessionIdRef.current });
          }
          stopAssistantTyping(sessionId);
          restoreChatDayPlanTutorialAfterFailedRequest(requestId);
          restoreWishlistTutorialAfterFailedRequest(requestId);
        } catch { }
      });
      es.addEventListener('tool.call', async (evt: any) => {
        try {
          const payload = JSON.parse(evt.data || '{}');
          const callId = payload?.callId ? String(payload.callId) : '';
          const requestId = payload?.clientRequestId ? String(payload.clientRequestId) : '';
          const sessionId =
            (callId ? callSessionMapRef.current.get(callId) || null : null)
            || (requestId ? requestSessionMapRef.current.get(requestId) || null : null);
          if (callId && sessionId) {
            callSessionMapRef.current.set(callId, sessionId);
            callRequestMapRef.current.set(callId, requestId);
          }
          if (sessionId && requestId) {
            clearPendingStreamChunks(requestId);
          }
          if (!sessionId) return;
          await handleToolCallRef.current?.(payload, sessionId);
        } catch { }
      });
      es.addEventListener('tool.validation_error', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const name = String(data?.name || 'unknown tool');
          const err = String(data?.error || 'validation error');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const sessionId = data?.callId
            ? callSessionMapRef.current.get(String(data.callId)) || (requestId ? requestSessionMapRef.current.get(requestId) || null : null)
            : (requestId ? requestSessionMapRef.current.get(requestId) || null : null);
          if (!sessionId) return;
          void appendMessagesToSession(sessionId || null, [
            { role: 'assistant', content: `I ran into a problem while trying that. (${name}: ${err})` },
          ], { showInVisibleChat: sessionId === activeSessionIdRef.current });
          if (requestId && sessionId) {
            clearPendingStreamChunks(requestId);
            clearTrackedRequest(requestId);
          }
          stopAssistantTyping(sessionId || null);
          restoreChatDayPlanTutorialAfterFailedRequest(requestId);
          restoreWishlistTutorialAfterFailedRequest(requestId);
        } catch { }
      });
      es.addEventListener('tool.server_not_implemented', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const name = String(data?.name || 'unknown tool');
          const requestId = data?.clientRequestId ? String(data.clientRequestId) : '';
          const sessionId = data?.callId
            ? callSessionMapRef.current.get(String(data.callId)) || (requestId ? requestSessionMapRef.current.get(requestId) || null : null)
            : (requestId ? requestSessionMapRef.current.get(requestId) || null : null);
          if (!sessionId) return;
          void appendMessagesToSession(sessionId || null, [
            { role: 'assistant', content: `That action (${name}) isn’t available yet.` },
          ], { showInVisibleChat: sessionId === activeSessionIdRef.current });
          if (requestId && sessionId) {
            clearPendingStreamChunks(requestId);
            clearTrackedRequest(requestId);
          }
          stopAssistantTyping(sessionId || null);
          restoreChatDayPlanTutorialAfterFailedRequest(requestId);
          restoreWishlistTutorialAfterFailedRequest(requestId);
        } catch { }
      });
      es.addEventListener('tool.result', (evt: any) => {
        try {
          const data = JSON.parse(evt.data || '{}');
          const callId = data?.callId ? String(data.callId) : '';
          const sessionId = callId ? callSessionMapRef.current.get(callId) || null : null;
          const requestId = callId ? callRequestMapRef.current.get(callId) || '' : '';
          if (callId) {
            callSessionMapRef.current.delete(callId);
            callRequestMapRef.current.delete(callId);
          }
          if (requestId) {
            clearPendingStreamChunks(requestId);
            clearTrackedRequest(requestId);
          }
          stopAssistantTyping(sessionId);
        } catch { }
      });
    } catch { }
    return () => {
      if (sseReadyResolversRef.current.length > 0) {
        const resolvers = [...sseReadyResolversRef.current];
        sseReadyResolversRef.current = [];
        for (const resolve of resolvers) {
          resolve(null);
        }
      }
      clearAllPendingStreamChunks();
      try { eventSourceRef.current?.close?.(); } catch { }
      eventSourceRef.current = null;
    };
  }, [appendMessagesToSession, clearAllPendingStreamChunks, clearPendingStreamChunks, clearTrackedRequest, finalizeStreamingMessage, markRequestMessageDeliveryFailed, restoreChatDayPlanTutorialAfterFailedRequest, restoreWishlistTutorialAfterFailedRequest, startAssistantTyping, stopAssistantTyping, streamConnectionKey]);

  const handleToolCall = useCallback(async (payload: any, sessionIdOverride?: string | null) => {
    const { callId, name } = payload || {};
    const rawArgs = payload?.arguments;
    const payloadRequestId = payload?.clientRequestId ? String(payload.clientRequestId) : '';
    const requestId = payloadRequestId || (callId ? callRequestMapRef.current.get(String(callId)) || '' : '');
    const requestText = requestId ? requestTextMapRef.current.get(requestId) || '' : '';
    const args = name === 'todo_query' && isRecurringTodoQueryText(requestText)
      ? { ...(rawArgs && typeof rawArgs === 'object' ? rawArgs : {}), recurringOnly: true }
      : rawArgs;
    const sessionId = sessionIdOverride
      || (callId ? callSessionMapRef.current.get(String(callId)) || null : null)
      || (requestId ? requestSessionMapRef.current.get(requestId) || null : null);
    if (!sessionId) {
      return;
    }
    const toolCallKey = getToolCallExecutionKey({ callId, name, arguments: args, clientRequestId: requestId });
    const shouldPersistHandledToolCallKey = !!callId || !!requestId;
    const handledToolCallKey = shouldPersistHandledToolCallKey ? toolCallKey : '';
    if (handledToolCallKey && handledToolCallKeysRef.current.has(handledToolCallKey)) {
      return;
    }
    if (toolCallKey) {
      if (inFlightToolCallKeysRef.current.has(toolCallKey)) {
        return;
      }
      inFlightToolCallKeysRef.current.add(toolCallKey);
    }
    let res: any = null;
    try {
      res = await executeToolCall(
        { callId, name, arguments: args },
        {
          serverUrl: SERVER_URL,
          router,
          requestText,
          renameChatTitle: (title) => renameChatSession(sessionId, title),
        }
      );
    } catch (e: any) {
      res = { success: false, error: String(e?.message || e || 'Tool execution failed'), messages: [{ role: 'assistant', content: 'Something went wrong while I was doing that.' }] };
    }
    try {
      const cid = clientIdRef.current || '';
      await fetch(`${SERVER_URL}/ai/tools/result`, {
        method: 'POST',
        headers: await getAiRequestHeaders('aiChatToolResult'),
        body: JSON.stringify({ clientId: cid, callId, name, clientRequestId: requestId || undefined, success: !!res?.success, result: res?.result ?? null, error: res?.error })
      });
    } catch { }
    try {
      const msgs = Array.isArray(res?.messages) ? res.messages : [];
      if (msgs.length) {
        await appendMessagesToSession(sessionId || null, msgs, { showInVisibleChat: sessionId === activeSessionIdRef.current });
      }
      if (
        res?.success &&
        isChatDayPlanTutorialPendingRef.current &&
        (name === 'save_day_plan' || didCreateChatTutorialScheduleItem(name, res.result))
      ) {
        void finishChatDayPlanTutorialAndOpenTodo(sessionId);
      } else if (requestId && res?.success && didCreateWishlistTutorialItem(name, res.result)) {
        await completeWishlistTutorialForRequest(requestId);
      } else if (requestId && res?.success && isWishlistTutorialCreateTool(name)) {
        restoreWishlistTutorialAfterFailedRequest(requestId);
      } else if (requestId && !res?.success) {
        restoreWishlistTutorialAfterFailedRequest(requestId);
      } else if (requestId && res?.success) {
        maybeRestoreChatDayPlanTutorialAfterResponse(requestId, msgs as ChatUIMessage[]);
      }
      const acts = Array.isArray(res?.uiActions) ? res.uiActions : [];
      for (const act of acts) {
        if (act?.type === 'navigate') {
          try { router.push({ pathname: act.route, params: act.params || {} }); } catch { }
        }
      }
    } catch { }
    if (toolCallKey) {
      inFlightToolCallKeysRef.current.delete(toolCallKey);
      if (handledToolCallKey) {
        handledToolCallKeysRef.current.add(handledToolCallKey);
        if (handledToolCallKeysRef.current.size > MAX_TRACKED_TOOL_CALL_KEYS) {
          const oldestKey = handledToolCallKeysRef.current.values().next().value;
          if (oldestKey) {
            handledToolCallKeysRef.current.delete(oldestKey);
          }
        }
      }
    }
    if (callId) {
      callSessionMapRef.current.delete(String(callId));
      callRequestMapRef.current.delete(String(callId));
    }
    if (requestId) {
      clearTrackedRequest(requestId);
    }
    stopAssistantTyping(sessionId);
  }, [appendMessagesToSession, clearTrackedRequest, completeWishlistTutorialForRequest, finishChatDayPlanTutorialAndOpenTodo, maybeRestoreChatDayPlanTutorialAfterResponse, renameChatSession, restoreWishlistTutorialAfterFailedRequest, router, stopAssistantTyping]);

  useEffect(() => {
    handleToolCallRef.current = handleToolCall;
  }, [handleToolCall]);

  const handleNewChat = useCallback(async () => {
    if (isCreatingNewChatRef.current) return;
    const previousSessionId = activeSessionId;
    const previousMessages = [...chatMessages];
    const firstChat = firstChatStateRef.current;
    if (firstChat.status === 'in_progress' && firstChat.sessionId && firstChat.sessionId === previousSessionId) {
      trackFirstChatEvent('flow_left', {
        intent: firstChat.intent,
        step: firstChat.assistantReplies <= 1 ? 'starter' : 'clarifying',
      });
    }
    isCreatingNewChatRef.current = true;
    setIsCreatingNewChat(true);
    footerHeightRef.current = 0;
    clearAssistantReadAnchor();
    stickyFollowEnabledRef.current = true;
    replaceVisibleChat(null, [], '');
    resetComposerForChatSwitch();
    pendingGoalQuotaDateRequestRef.current = null;
    setGoalQuotaDatePickerInput(null);
    resetToolMemory();
    weekPlanContextRef.current = null;
    try {
      if (previousSessionId && previousMessages.some((message) => isMeaningfulChatMessage(message))) {
        await summarizeSession(previousSessionId, previousMessages);
      }
    } finally {
      isCreatingNewChatRef.current = false;
      setIsCreatingNewChat(false);
    }
  }, [activeSessionId, chatMessages, clearAssistantReadAnchor, replaceVisibleChat, resetComposerForChatSwitch, summarizeSession]);

  useEffect(() => {
    if (!isFocused || !isChatDayPlanTutorialPending) {
      hasStartedChatDayPlanTutorialRef.current = false;
      return;
    }

    if (hasStartedChatDayPlanTutorialRef.current) {
      return;
    }

    hasStartedChatDayPlanTutorialRef.current = true;

    const restoreStage = restoreChatDayPlanStageRef.current;
    if (restoreStage) {
      restoreChatDayPlanStageRef.current = null;
      showChatDayPlanTutorialStage(restoreStage);
      return;
    }

    const startChatDayPlanTutorial = async () => {
      if (chatMessages.some((message) => isMeaningfulChatMessage(message))) {
        await handleNewChat();
      }

      if (!isFocusedRef.current || !isChatDayPlanTutorialPendingRef.current) {
        return;
      }

      showChatDayPlanTutorialStage('eazee-button');
    };

    void startChatDayPlanTutorial();
  }, [
    chatMessages,
    handleNewChat,
    isChatDayPlanTutorialPending,
    isFocused,
    showChatDayPlanTutorialStage,
  ]);

  useEffect(() => {
    const isWishlistHandoffActive = activeTarget?.type === 'screen' &&
      activeTarget.params?.chatAction === 'tutorial-open-chat';
    const shouldStartWishlistTutorial = isWishlistTutorialPending || isWishlistHandoffActive;

    if (!isFocused || !shouldStartWishlistTutorial || isChatDayPlanTutorialPending) {
      if (!isFocused || !shouldStartWishlistTutorial) {
        hasStartedWishlistTutorialRef.current = false;
      }
      return;
    }

    if (hasStartedWishlistTutorialRef.current) {
      return;
    }

    hasStartedWishlistTutorialRef.current = true;

    const startWishlistTutorial = async () => {
      void handleNewChat();

      if (
        !isFocusedRef.current ||
        (!isWishlistTutorialPendingRef.current && !isWishlistHandoffActive)
      ) {
        return;
      }

      showWishlistTutorialInfo();
    };

    void startWishlistTutorial();
  }, [
    activeTarget,
    handleNewChat,
    isChatDayPlanTutorialPending,
    isFocused,
    isWishlistTutorialPending,
    showWishlistTutorialInfo,
  ]);

  useEffect(() => {
    if (!chatActionValue || !chatActionKey || handledChatActionRef.current === chatActionKey) {
      return;
    }

    handledChatActionRef.current = chatActionKey;
    router.setParams({
      chatAction: undefined,
      chatActionNonce: undefined,
    } as any);

    if (chatActionValue === 'history') {
      setIsSummaryTestMode(false);
      setIsHistoryModalVisible(true);
      completeChatGuidanceAction('history');
      return;
    }

    if (chatActionValue === 'new') {
      void handleNewChat();
      completeChatGuidanceAction('new');
      return;
    }

    if (chatActionValue === 'fix-my-life') {
      // Started by the effect after sendTextMessage, which this effect runs before.
      setFixMyLifeRequestKey(chatActionKey);
    }
  }, [chatActionKey, chatActionValue, completeChatGuidanceAction, handleNewChat, router]);

  const openHistorySession = useCallback(async (sessionId: string) => {
    if (sessionId === activeSessionId) {
      setIsHistoryModalVisible(false);
      return;
    }
    const previousSessionId = activeSessionId;
    const previousMessages = [...chatMessages];
    setIsHistoryModalVisible(false);
    resetComposerForChatSwitch();
    await loadSessionIntoChat(sessionId);
    if (previousSessionId && previousMessages.some((message) => isMeaningfulChatMessage(message))) {
      void summarizeSession(previousSessionId, previousMessages);
    }
  }, [activeSessionId, chatMessages, loadSessionIntoChat, resetComposerForChatSwitch, summarizeSession]);

  const toggleSessionPin = useCallback(async (sessionId: string, pinned: boolean) => {
    try {
      await updateChatSessionPin(sessionId, pinned);
      await refreshChatSessions();
    } catch { }
  }, [refreshChatSessions]);

  // ChatHistoryModal asks for confirmation before calling this.
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await deleteChatSessionById(sessionId);
      stopAssistantTyping(sessionId);
      if (activeSessionId === sessionId) {
        replaceVisibleChat(null, [], '');
        resetToolMemory();
      }
      await refreshChatSessions();
    } catch { }
  }, [activeSessionId, refreshChatSessions, replaceVisibleChat, stopAssistantTyping]);

  const closeHistoryModal = useCallback(() => {
    setIsHistoryModalVisible(false);
    setIsSummaryTestMode(false);
  }, []);

  const sendTextMessage = useCallback(async (
    text: string,
    options?: ChatSendOptions
  ) => {
    if (!text.trim()) return;
    const aiUserId = authUser?.uid || auth.currentUser?.uid;
    if (!aiUserId) {
      Alert.alert('Sign in required', AI_AUTH_REQUIRED_MESSAGE, [
        { text: 'Not Now', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => router.push({ pathname: '/home/login', params: { source: 'chat' } }),
        },
      ]);
      return;
    }
    if (!(await requestAiDataSharingConsent(aiUserId))) {
      return;
    }
    try { inputRef.current?.blur?.(); } catch { }
    try { Keyboard.dismiss(); } catch { }
    footerHeightRef.current = 0;
    clearAssistantReadAnchor();
    stickyFollowEnabledRef.current = true;
    inputValueRef.current = '';
    setInputValue('');
    let requestSessionId: string | null = null;
    const retryMessageId = String(options?.retryMessageId || '').trim();
    let visibleUserMessageId = retryMessageId;
    let clientRequestId = '';
    let requestController: AbortController | null = null;
    const showUserMessage = options?.showUserMessage !== false;
    const hiddenMessages = (options?.hiddenMessages || []).filter((message) => message.content.trim().length > 0);
    const clearVisibleUserDeliveryStatus = () => {
      if (visibleUserMessageId) {
        updateVisibleMessageDelivery(visibleUserMessageId, undefined, undefined);
      }
    };
    const markVisibleUserDeliveryFailed = async (deliveryError = 'Failed to send to AI.') => {
      if (!visibleUserMessageId) return false;
      const didUpdate = updateVisibleMessageDelivery(visibleUserMessageId, 'failed', deliveryError);
      const deliverySessionId = requestSessionId || activeSessionIdRef.current;
      let didPersist = false;
      if (deliverySessionId) {
        didPersist = await updateChatMessageDeliveryState(deliverySessionId, visibleUserMessageId, 'failed', deliveryError)
          .catch((error) => {
            console.warn('Could not update chat message delivery state:', error);
            return false;
          });
      }
      return didUpdate || didPersist;
    };

    clearVisibleUserDeliveryStatus();

    try {
      if (showUserMessage && visibleUserMessageId) {
        requestSessionId = activeSessionIdRef.current;
      } else if (showUserMessage) {
        const baseUserMessage: ChatUIMessage = options?.displayUserMessage || { role: 'user', content: text };
        const userMessage: ChatUIMessage = {
          ...baseUserMessage,
          id: baseUserMessage.id || createChatClientMessageId('user'),
        };
        requestSessionId = await appendMessagesToSession(activeSessionIdRef.current, [userMessage], {
          showInVisibleChat: true,
          seedMessages: [...chatMessagesRef.current, userMessage],
        });
        const lastVisibleMessage = chatMessagesRef.current[chatMessagesRef.current.length - 1];
        if (lastVisibleMessage?.role === 'user') {
          visibleUserMessageId = String(lastVisibleMessage.id || '').trim();
        }
      } else {
        requestSessionId = await ensureChatSession(activeSessionIdRef.current, [{ role: 'user', content: text }]);
        if (requestSessionId && activeSessionIdRef.current !== requestSessionId) {
          replaceVisibleChat(requestSessionId, chatMessagesRef.current, '');
        }
      }
      if (!requestSessionId) {
        if (visibleUserMessageId && !(await markVisibleUserDeliveryFailed())) {
          Alert.alert('Error', 'Failed to send to AI.');
        }
        return;
      }
      queueScrollToBottom(true);
      const pendingGoalQuotaDateRequest = pendingGoalQuotaDateRequestRef.current;
      if (
        showUserMessage &&
        pendingGoalQuotaDateRequest?.sessionId &&
        pendingGoalQuotaDateRequest.sessionId !== requestSessionId
      ) {
        pendingGoalQuotaDateRequestRef.current = null;
      }

      const goalQuotaScheduleInput = showUserMessage
        ? pendingGoalQuotaDateRequestRef.current ||
          findLatestOpenGoalQuotaSchedule(chatMessagesRef.current, resolvedGoalQuotaPlanIds, ignoredGoalQuotaTypedPlanIds)
        : null;
      if (showUserMessage && goalQuotaScheduleInput) {
        let goalQuotaDateResolution: GoalQuotaDateResolution | null = null;
        startAssistantTyping(requestSessionId);
        try {
          goalQuotaDateResolution = await requestGoalQuotaDateResolution({
            text,
            goalTitle: goalQuotaScheduleInput.goalTitle,
            userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            locale: Intl.DateTimeFormat().resolvedOptions().locale,
          });
        } catch (error) {
          if (!isAiAuthRequiredError(error)) {
            console.warn('Goal quota date resolution failed:', error);
          }
        } finally {
          stopAssistantTyping(requestSessionId);
        }

        if (goalQuotaDateResolution?.intent === 'open_picker') {
          clearVisibleUserDeliveryStatus();
          handlePickGoalQuotaDate(goalQuotaScheduleInput, requestSessionId);
          return;
        }
        if (goalQuotaDateResolution?.intent === 'decide_later') {
          await handleDecideGoalQuotaLater(goalQuotaScheduleInput, requestSessionId);
          clearVisibleUserDeliveryStatus();
          return;
        }
        if (goalQuotaDateResolution?.intent === 'schedule_date' && goalQuotaDateResolution.dateIso) {
          await handleScheduleGoalQuotaForDate(goalQuotaScheduleInput, new Date(goalQuotaDateResolution.dateIso), requestSessionId);
          clearVisibleUserDeliveryStatus();
          return;
        }
        if (goalQuotaDateResolution?.intent === 'needs_clarification') {
          pendingGoalQuotaDateRequestRef.current = {
            ...goalQuotaScheduleInput,
            sessionId: requestSessionId,
          };
          await appendMessagesToSession(requestSessionId, [{
            role: 'assistant',
            content: goalQuotaDateResolution.message || 'I could not tell which date you meant. Please type a clearer date.',
          }], {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
          });
          clearVisibleUserDeliveryStatus();
          return;
        }
        if (goalQuotaDateResolution?.intent === 'none') {
          markGoalQuotaTypedPlanIgnored(goalQuotaScheduleInput.planId);
          clearPendingGoalQuotaDate(goalQuotaScheduleInput.planId);
        }
      }
      if (showUserMessage && pendingGoalQuotaDateRequestRef.current) {
        pendingGoalQuotaDateRequestRef.current = null;
      }
      if (showUserMessage && isCalendarRedisplayRequest(text)) {
        const lastCalendarCardMessage = findLatestCalendarCard(chatMessagesRef.current);
        if (lastCalendarCardMessage?.card) {
          const replayMessage: ChatUIMessage = {
            role: 'assistant',
            content: typeof lastCalendarCardMessage.content === 'string' ? lastCalendarCardMessage.content : 'Here it is.',
            card: JSON.parse(JSON.stringify(lastCalendarCardMessage.card)),
          };
          await appendMessagesToSession(requestSessionId, [replayMessage], {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
          });
          clearVisibleUserDeliveryStatus();
          return;
        }
      }
      const matchedLastCalendarItems = findLastCalendarFollowUpMatches(text);
      if (matchedLastCalendarItems.length > 0) {
        setLastCalendarItems(matchedLastCalendarItems);
        await appendMessagesToSession(requestSessionId, [{
          role: 'assistant',
          content: matchedLastCalendarItems.length === 1 ? 'I found 1 matching event.' : `I found ${matchedLastCalendarItems.length} matching events.`,
          card: { type: 'calendarList', items: matchedLastCalendarItems },
        }], {
          showInVisibleChat: requestSessionId === activeSessionIdRef.current,
        });
        clearVisibleUserDeliveryStatus();
        return;
      }
      const latestDraftDayPlanMessage = findLatestDraftDayPlanMessage(chatMessagesRef.current);
      if (showUserMessage && isDayPlanSaveConfirmation(text) && latestDraftDayPlanMessage?.card?.type === 'dayPlan') {
        const latestDayPlanCard = latestDraftDayPlanMessage.card as DayPlanCardValue;
        if (latestDayPlanCard.saved === true) {
          await appendMessagesToSession(requestSessionId, [{ role: 'assistant', content: 'This plan is already saved.' }], {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
          });
        } else if (latestDayPlanCard.cancelled === true) {
          await appendMessagesToSession(requestSessionId, [{ role: 'assistant', content: 'This plan was cancelled.' }], {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
          });
        } else if (getDayPlanDraftCount(latestDayPlanCard) === 0) {
          await appendMessagesToSession(requestSessionId, [{ role: 'assistant', content: "There's nothing in this plan to save." }], {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
          });
        } else {
          await saveDayPlanCard(latestDayPlanCard);
        }
        clearVisibleUserDeliveryStatus();
        return;
      }
      startAssistantTyping(requestSessionId);
      const cid = clientIdRef.current || await waitForStreamingClientId();
      clientRequestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      requestSessionMapRef.current.set(clientRequestId, requestSessionId);
      requestTextMapRef.current.set(clientRequestId, text);
      if (visibleUserMessageId) {
        requestUserMessageMapRef.current.set(clientRequestId, visibleUserMessageId);
      }
      if (showUserMessage && isChatDayPlanTutorialPending) {
        chatDayPlanTutorialRequestIdRef.current = clientRequestId;
        cancelGuidance();
      }
      if (
        showUserMessage &&
        (
          shouldTrackNextWishlistTutorialRequestRef.current ||
          (
            activeTarget?.type === 'screen' &&
            activeTarget.params?.chatAction === 'tutorial-wishlist-message'
          )
        )
      ) {
        wishlistTutorialRequestIdRef.current = clientRequestId;
        shouldTrackNextWishlistTutorialRequestRef.current = false;
        cancelGuidance();
      }
      const expectsStream = !!cid && !!eventSourceRef.current;
      logChatStream('send-message', {
        requestSessionId,
        clientRequestId,
        expectsStream,
        clientId: cid || null,
        activeSessionId: activeSessionIdRef.current,
        promptLength: text.length,
      });
      // Provide local time context so the model returns absolute ISO datetime
      const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
      const now = new Date();
      const offMin = -now.getTimezoneOffset();
      const sign = offMin >= 0 ? '+' : '-';
      const abs = Math.abs(offMin);
      const hh = String(Math.floor(abs / 60)).padStart(2, '0');
      const mm = String(abs % 60).padStart(2, '0');
      const pad2 = (n: number) => String(n).padStart(2, '0');
      const nowLocalIso = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}${sign}${hh}:${mm}`;
      const history = chatMessagesRef.current
        .slice(-20)
        .filter((message) => !retryMessageId || message.id !== retryMessageId)
        .map((m) => ({ role: m.role, content: serializeMessageForModel(m) }))
        .filter((m) => m.content.trim().length > 0);
      const requestMessages = showUserMessage
        ? retryMessageId
          ? [
              ...history,
              { role: 'user' as const, content: text },
            ]
          : history
        : [
            ...history,
            ...hiddenMessages,
            { role: 'user' as const, content: text },
          ];
      const aiPersonalization = await readAiPersonalizationSettings(auth.currentUser?.uid);
      const weekPlanContext = weekPlanContextRef.current;
      if (weekPlanContext && weekPlanContext.sessionId === null) {
        weekPlanContext.sessionId = requestSessionId;
      }
      const weekPlanMessages = weekPlanContext && weekPlanContext.sessionId === requestSessionId
        ? [{ role: 'system' as const, content: weekPlanContext.content }]
        : [];
      const isFixMyLifeRequest = weekPlanMessages.length > 0;
      const requestUserId = auth.currentUser?.uid;
      // First use: the starter chat, or the first request typed into an empty chat.
      const firstChat = firstChatStateRef.current;
      let firstChatForRequest: FirstChatState | null =
        firstChat.status === 'in_progress' && !!requestSessionId && firstChat.sessionId === requestSessionId ? firstChat : null;
      if (
        !firstChatForRequest &&
        !isFixMyLifeRequest &&
        showUserMessage &&
        !retryMessageId &&
        !!requestSessionId &&
        shouldOfferFirstChatWelcome(firstChat) &&
        !isChatDayPlanTutorialPendingRef.current &&
        !chatMessagesRef.current.some((message) => message.role === 'assistant')
      ) {
        firstChatForRequest = await updateFirstChatState(requestUserId, {
          status: 'in_progress',
          intent: 'custom',
          sessionId: requestSessionId,
          startedAt: Date.now(),
          assistantReplies: 0,
          resultDelivered: false,
          preferencePromptShown: false,
          preferencePromptMessageId: null,
        });
        trackFirstChatEvent('custom_request', { intent: 'custom' });
      }
      const savedPreferencesMessage = buildSavedPreferencesSystemMessage(await readSavedPreferences(requestUserId));
      // The enabled parts of the "Get to know me" profile; the server turns them into instructions.
      const aboutMeContext = buildAboutMeChatContext(await readCachedAboutMeProfile(requestUserId));
      // Persistent memory: what Eazee remembers about the user (absent while memory is off).
      const chatMemories = requestUserId && !isFixMyLifeRequest
        ? buildChatMemories(await readCachedMemories(requestUserId))
        : undefined;
      // While the account has preference chats left, the AI may ask one (the first-use flow
      // has its own version). A chat only counts once a question is actually shown.
      const preferenceChatIds = requestUserId ? await readPreferencePromptChatIds(requestUserId) : [];
      setPreferencePromptChatIds(preferenceChatIds);
      const needsPreferenceFollowUp = !isFixMyLifeRequest
        && isPreferencePromptChatOpen(preferenceChatIds, requestSessionId)
        && !firstChatForRequest;
      const personalizationMessages = [
        // Fix my life has its own cards, so it does not get the reply buttons.
        ...(isFixMyLifeRequest ? [] : [{ role: 'system' as const, content: ASSISTANT_ACTION_MARKERS_INSTRUCTIONS }]),
        ...(savedPreferencesMessage ? [{ role: 'system' as const, content: savedPreferencesMessage }] : []),
        ...(needsPreferenceFollowUp ? [{ role: 'system' as const, content: PREFERENCE_FOLLOW_UP_SYSTEM_MESSAGE }] : []),
        ...(firstChatForRequest
          ? [{
              role: 'system' as const,
              content: buildFirstChatSystemMessage(
                firstChatForRequest,
                buildFirstChatDataSection(firstChatForRequest.intent, await loadFirstChatData(firstChatForRequest.intent))
              ),
            }]
          : []),
      ];
      const body = {
        clientId: cid || undefined,
        clientRequestId,
        aiPersonalization,
        // App-run tools this build has; the server only offers these to builds that list them.
        clientCapabilities: ['calendar_create_many'],
        aboutMe: aboutMeContext,
        memories: chatMemories,
        messages: [
          ...buildChatSystemMessages({
            userTimezone: tz,
            nowLocalIso,
            activeSessionSummary,
            lastResults: getLastQueryItems() || [],
            createdTodoItems: getCreatedTodoItems() || [],
            lastCalendarItems: getLastCalendarItems() || [],
            createdCalendarItems: getCreatedCalendarItems() || [],
            lastDayPlan: getLastDayPlan(),
          }),
          ...personalizationMessages,
          ...weekPlanMessages,
          ...requestMessages,
        ]
      };
      requestController = new AbortController();
      requestAbortControllersRef.current.set(clientRequestId, requestController);
      const resp = await fetch(`${SERVER_URL}/ai/route`, {
        method: 'POST',
        headers: await getAiRequestHeaders(),
        body: JSON.stringify(body),
        signal: requestController.signal,
      });
      options?.onRequestStarted?.();
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        const msg = getAiResponseErrorMessage(errJson, resp.status);
        logChatStream('route-http-error', {
          requestSessionId,
          clientRequestId,
          status: resp.status,
          message: msg,
        });
        if (expectsStream && !requestSessionMapRef.current.has(clientRequestId)) {
          stopAssistantTyping(requestSessionId);
          return;
        }
        const displayMessage = resp.status === 401 ? msg : `Failed to send to AI. (${msg})`;
        const didMarkUserMessageFailed = await markVisibleUserDeliveryFailed(displayMessage);
        clearPendingStreamChunks(clientRequestId);
        clearTrackedRequest(clientRequestId);
        if (!didMarkUserMessageFailed) {
          await appendMessagesToSession(requestSessionId, [{ role: 'assistant', content: resp.status === 401 ? msg : `I ran into a problem while trying that. (${msg})` }], {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
          });
        }
        stopAssistantTyping(requestSessionId);
        restoreChatDayPlanTutorialAfterFailedRequest(clientRequestId);
        restoreWishlistTutorialAfterFailedRequest(clientRequestId);
        return;
      }
      const json = await resp.json().catch(() => null);
      if (requestController.signal.aborted) return;
      logChatStream('route-response', {
        requestSessionId,
        clientRequestId,
        status: json?.status || null,
        expectsStream,
      });
      // Fallback: if no clientId or SSE missing, execute tool calls inline
      if (json && json.status === 'tool_calls_dispatched') {
        const calls = dedupeToolCalls(Array.isArray(json.toolCalls) ? json.toolCalls : [], clientRequestId);
        const routingErrors = Array.isArray(json?.routing?.errors) ? json.routing.errors : [];

        if (calls.length === 0) {
          if (expectsStream && !requestSessionMapRef.current.has(clientRequestId)) {
            stopAssistantTyping(requestSessionId);
            return;
          }
          const firstError = routingErrors[0];
          const errorMessage = firstError?.name
            ? `${String(firstError.name)}: ${String(firstError.error || 'Tool routing failed')}`
            : String(firstError?.error || 'Tool routing failed');
          const didMarkUserMessageFailed = await markVisibleUserDeliveryFailed(`Failed to send to AI. (${errorMessage})`);
          clearPendingStreamChunks(clientRequestId);
          clearTrackedRequest(clientRequestId);
          if (!didMarkUserMessageFailed) {
            await appendMessagesToSession(requestSessionId, [{ role: 'assistant', content: `I ran into a problem while trying that. (${errorMessage})` }], {
              showInVisibleChat: requestSessionId === activeSessionIdRef.current,
            });
          }
          stopAssistantTyping(requestSessionId);
          restoreChatDayPlanTutorialAfterFailedRequest(clientRequestId);
          restoreWishlistTutorialAfterFailedRequest(clientRequestId);
          return;
        }

        if (!calls.some((call) => isWishlistTutorialCreateTool(call?.name))) {
          restoreWishlistTutorialAfterFailedRequest(clientRequestId);
        }

        if (!expectsStream || requestSessionMapRef.current.has(clientRequestId)) {
          clearVisibleUserDeliveryStatus();
        }
        if (!expectsStream) {
          for (const call of calls) {
            if (requestController.signal.aborted) break;
            if (call && call.name) {
              await handleToolCall({ ...call, clientRequestId }, requestSessionId);
            }
          }
          clearTrackedRequest(clientRequestId);
        } else {
          for (const call of calls) {
            if (call?.callId) {
              callSessionMapRef.current.set(String(call.callId), requestSessionId);
              callRequestMapRef.current.set(String(call.callId), clientRequestId);
            }
          }
        }
      } else if (json && json.status === 'no_tool_calls') {
        const requestStillTracked = requestSessionMapRef.current.has(clientRequestId);
        if (!expectsStream || requestStillTracked) {
          clearVisibleUserDeliveryStatus();
        }
        const content = String(json?.result?.message?.content || '').trim();
        const card = buildAssistantMetaCard(json?.meta);
        if (!expectsStream && content) {
          const didAppendRecipeOffer = await appendRecipeTodoOfferIfNeeded(requestSessionId, chatMessagesRef.current);
          await appendMessagesToSession(requestSessionId, [{ role: 'assistant', content, card }], {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
            suppressAssistantScroll: didAppendRecipeOffer,
          });
          maybeRestoreChatDayPlanTutorialAfterResponse(clientRequestId, [{ role: 'assistant', content, card } as ChatUIMessage]);
          clearTrackedRequest(clientRequestId);
        } else if (expectsStream && requestStillTracked) {
          await finalizeStreamingMessage(clientRequestId, content, json?.meta);
        } else if (!expectsStream) {
          clearTrackedRequest(clientRequestId);
        }
        restoreWishlistTutorialAfterFailedRequest(clientRequestId);
        stopAssistantTyping(requestSessionId);
      } else {
        // Unknown response shape
        if (expectsStream && !requestSessionMapRef.current.has(clientRequestId)) {
          stopAssistantTyping(requestSessionId);
          return;
        }
        const didMarkUserMessageFailed = await markVisibleUserDeliveryFailed();
        clearPendingStreamChunks(clientRequestId);
        clearTrackedRequest(clientRequestId);
        if (!didMarkUserMessageFailed) {
          await appendMessagesToSession(requestSessionId, [{ role: 'assistant', content: 'Sorry—something unexpected happened. Please try again.' }], {
            showInVisibleChat: requestSessionId === activeSessionIdRef.current,
          });
        }
        stopAssistantTyping(requestSessionId);
        restoreChatDayPlanTutorialAfterFailedRequest(clientRequestId);
        restoreWishlistTutorialAfterFailedRequest(clientRequestId);
      }
    } catch (error: any) {
      if (requestController?.signal.aborted) return;
      console.warn(`Chat request to ${SERVER_URL} failed:`, error);
      const didMarkUserMessageFailed = await markVisibleUserDeliveryFailed(
        `Failed to send to AI. (${String(error?.message || error)})`,
      );
      for (const [requestId, sessionId] of requestSessionMapRef.current.entries()) {
        if (sessionId === requestSessionId) {
          clearPendingStreamChunks(requestId);
          clearTrackedRequest(requestId);
        }
      }
      if (!didMarkUserMessageFailed) {
        Alert.alert('Error', 'Failed to send to AI.');
      }
      stopAssistantTyping(requestSessionId);
      restoreChatDayPlanTutorialAfterFailedRequest(clientRequestId);
      restoreWishlistTutorialAfterFailedRequest(clientRequestId);
    } finally {
      requestAbortControllersRef.current.delete(clientRequestId);
    }
  }, [activeSessionSummary, activeTarget, appendMessagesToSession, appendRecipeTodoOfferIfNeeded, authUser?.uid, cancelGuidance, clearAssistantReadAnchor, clearPendingGoalQuotaDate, clearPendingStreamChunks, clearTrackedRequest, finalizeStreamingMessage, handleDecideGoalQuotaLater, handlePickGoalQuotaDate, handleScheduleGoalQuotaForDate, handleToolCall, ignoredGoalQuotaTypedPlanIds, isChatDayPlanTutorialPending, markGoalQuotaTypedPlanIgnored, maybeRestoreChatDayPlanTutorialAfterResponse, queueScrollToBottom, replaceVisibleChat, resolvedGoalQuotaPlanIds, restoreChatDayPlanTutorialAfterFailedRequest, restoreWishlistTutorialAfterFailedRequest, router, saveDayPlanCard, serializeMessageForModel, startAssistantTyping, startGuidance, stopAssistantTyping, updateVisibleMessageDelivery, waitForStreamingClientId]);

  useEffect(() => {
    sendTextMessageRef.current = sendTextMessage;
  }, [sendTextMessage]);

  // Untracking the request makes the stream listeners drop its remaining events.
  // Tool calls that already ran are not rolled back.
  const stopActiveChatResponse = useCallback(() => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    for (const [requestId, requestSessionId] of requestSessionMapRef.current.entries()) {
      if (requestSessionId !== sessionId) continue;
      requestAbortControllersRef.current.get(requestId)?.abort();
      requestAbortControllersRef.current.delete(requestId);
      clearPendingStreamChunks(requestId);
      clearTrackedRequest(requestId);
      restoreChatDayPlanTutorialAfterFailedRequest(requestId);
      restoreWishlistTutorialAfterFailedRequest(requestId);
    }
    for (const [callId, callSessionId] of callSessionMapRef.current.entries()) {
      if (callSessionId !== sessionId) continue;
      callSessionMapRef.current.delete(callId);
      callRequestMapRef.current.delete(callId);
    }
    stopAssistantTyping(sessionId);
  }, [clearPendingStreamChunks, clearTrackedRequest, restoreChatDayPlanTutorialAfterFailedRequest, restoreWishlistTutorialAfterFailedRequest, stopAssistantTyping]);

  // Cancel on the "Planning your week" screen: stops the request (or a start still in
  // progress) and goes back to the empty chat with the starter buttons. The Fix my life
  // chat it had opened is removed, as it only holds the unanswered request. Nothing else
  // is saved, since a week plan is only a draft until the user saves it.
  const cancelFixMyLife = useCallback(() => {
    fixMyLifeCancelledRef.current = true;
    weekPlanContextRef.current = null;
    const sessionId = activeSessionIdRef.current;
    stopActiveChatResponse();
    setFixMyLifeWaitPhase(null);
    setIsBootstrappingCompactHandoff(false);
    replaceVisibleChat(null, [], '');
    resetToolMemory();
    if (sessionId) {
      void deleteChatSessionById(sessionId)
        .catch((error) => console.warn('Could not remove the cancelled Fix my life chat:', error))
        .finally(() => { void refreshChatSessions(); });
    }
    showToast('Stopped planning your week');
  }, [refreshChatSessions, replaceVisibleChat, showToast, stopActiveChatResponse]);

  useEffect(() => {
    if (!compactHandoffValue || !compactHandoffKey) return;
    if (handledCompactHandoffRef.current === compactHandoffKey) return;

    const handoff = parseCompactHandoff(compactHandoffValue);
    handledCompactHandoffRef.current = compactHandoffKey;
    router.setParams({
      compactHandoff: undefined,
      compactHandoffNonce: undefined,
    } as any);

    const run = async () => {
      try {
        setIsBootstrappingCompactHandoff(true);
        await handleNewChat();
        if (handoff) {
          const request = buildCompactHandoffRequest(handoff);
          if (request.requestText.trim()) {
            await sendTextMessage(request.requestText, {
              showUserMessage: false,
              hiddenMessages: request.hiddenMessages,
              onRequestStarted: () => {
                setIsBootstrappingCompactHandoff(false);
              },
            });
          }
        }
      } finally {
        setIsBootstrappingCompactHandoff(false);
      }
    };

    void run();
  }, [compactHandoffKey, compactHandoffValue, handleNewChat, router, sendTextMessage]);

  // Recovers a chat that is out of date or stuck: drops any reply still waiting,
  // reopens the live stream, and reloads the messages saved on the device.
  // Unlike loadSessionIntoChat, it keeps the tool memory (e.g. the last day plan).
  const handleRefreshChat = useCallback(async () => {
    setIsRefreshingChat(true);
    try {
      stopActiveChatResponse();
      setClientId(null);
      clientIdRef.current = null;
      setStreamConnectionKey((key) => key + 1);
      const sessionId = activeSessionIdRef.current;
      if (sessionId) {
        const { session, messages } = await loadChatSession(sessionId);
        if (activeSessionIdRef.current === sessionId) {
          replaceVisibleChat(session.id, messages, session.summary || '');
        }
      }
      await refreshChatSessions();
    } catch (error) {
      console.warn('Could not refresh chat:', error);
    } finally {
      setIsRefreshingChat(false);
    }
  }, [refreshChatSessions, replaceVisibleChat, stopActiveChatResponse]);

  // The wait ends with the first reply or a failed send; the timeout only guards against a stuck stream.
  useEffect(() => {
    if (fixMyLifeWaitPhase === 'sent' && (hasFirstAssistantReply || hasFailedDelivery)) {
      setFixMyLifeWaitPhase(null);
    }
  }, [fixMyLifeWaitPhase, hasFailedDelivery, hasFirstAssistantReply]);

  useEffect(() => {
    if (!fixMyLifeWaitPhase) return;
    const timeout = setTimeout(() => setFixMyLifeWaitPhase(null), FIX_MY_LIFE_MAX_WAIT_MS);
    return () => clearTimeout(timeout);
  }, [fixMyLifeWaitPhase]);

  useEffect(() => {
    if (!fixMyLifeRequestKey) return;
    setFixMyLifeRequestKey('');

    const run = async () => {
      const user = auth.currentUser;
      const access = user ? await checkAiFeatureAccess(user.uid, 'dayPlanning', user.email) : null;
      if (!access?.allowed) {
        fixMyLifeFromNewChatRef.current = false;
        Alert.alert('Eazee Pro feature', 'Fix my life plans your whole week. Upgrade to Eazee Pro in Settings to use it.');
        return;
      }

      try {
        fixMyLifeCancelledRef.current = false;
        setFixMyLifeWaitPhase('starting');
        setIsBootstrappingCompactHandoff(true);
        await handleNewChat();
        const content = await loadWeekPlanContext(user?.uid);
        if (fixMyLifeCancelledRef.current) return;
        weekPlanContextRef.current = { sessionId: null, content };
        setFixMyLifeWaitPhase('sent');
        if (fixMyLifeFromNewChatRef.current) showToast('Opened a new Fix my life chat');
        await sendTextMessage(FIX_MY_LIFE_PROMPT, {
          onRequestStarted: () => {
            setIsBootstrappingCompactHandoff(false);
            // Cancelled while the request was being sent.
            if (fixMyLifeCancelledRef.current) stopActiveChatResponse();
          },
        });
      } catch (error) {
        console.warn('Could not start Fix my life:', error);
        setFixMyLifeWaitPhase(null);
        Alert.alert('Error', 'Could not start planning your week. Please try again.');
      } finally {
        fixMyLifeFromNewChatRef.current = false;
        setIsBootstrappingCompactHandoff(false);
      }
    };

    void run();
  }, [fixMyLifeRequestKey, handleNewChat, sendTextMessage, showToast, stopActiveChatResponse]);

  const handleSend = useCallback(() => {
    const text = (inputValueRef.current || '').trim();
    if (text) sendTextMessage(text);
  }, [sendTextMessage]);

  const handleSendPress = useCallback(() => {
    if (!(inputValueRef.current || '').trim()) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    handleSend();
  }, [handleSend]);

  const handleRetryMessage = useCallback((message: ChatUIMessage) => {
    const retryText = String(message.content || message.card?.transcript || '').trim();
    const retryMessageId = String(message.id || '').trim();
    if (!retryText || !retryMessageId) return;
    if (pendingRetryMessageIdsRef.current.has(retryMessageId)) return;
    pendingRetryMessageIdsRef.current.add(retryMessageId);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void sendTextMessage(retryText, { retryMessageId }).finally(() => {
      pendingRetryMessageIdsRef.current.delete(retryMessageId);
    });
  }, [sendTextMessage]);

  const handleInputChange = useCallback((text: string) => {
    inputValueRef.current = text;
    setInputValue(text);
  }, []);

  const discardVoiceMessageDraft = useCallback(() => {
    voiceRecordingStartTokenRef.current += 1;
    const uploadTask = voiceTranscriptionUploadTaskRef.current;
    const pendingAudioUri = voiceTranscriptionAudioUriRef.current;
    const draftAudioUri = voiceMessageDraftRef.current?.audioUri;
    voiceTranscriptionUploadTaskRef.current = null;
    voiceTranscriptionAudioUriRef.current = null;
    if (uploadTask) {
      void uploadTask.cancelAsync().catch(() => { }).finally(() => {
        if (pendingAudioUri) {
          FileSystem.deleteAsync(pendingAudioUri, { idempotent: true }).catch(() => { });
        }
      });
    } else if (pendingAudioUri) {
      FileSystem.deleteAsync(pendingAudioUri, { idempotent: true }).catch(() => { });
    }
    if (draftAudioUri && draftAudioUri !== pendingAudioUri) {
      FileSystem.deleteAsync(draftAudioUri, { idempotent: true }).catch(() => { });
    }
    isVoiceMessageRecordingRef.current = false;
    voiceRecordingModeRef.current = null;
    ignoreNextMicrophonePressRef.current = false;
    voiceAudioChunksRef.current = [];
    voiceWaveformLevelsRef.current = [];
    setVoiceLiveWaveformLevels([]);
    setIsVoiceMessageRecording(false);
    setIsVoiceMessageFinalizing(false);
    setVoiceDraft(null);
  }, [setVoiceDraft]);

  useEffect(() => {
    return () => {
      voiceRecordingStartTokenRef.current += 1;
      const uploadTask = voiceTranscriptionUploadTaskRef.current;
      const pendingAudioUri = voiceTranscriptionAudioUriRef.current;
      const draftAudioUri = voiceMessageDraftRef.current?.audioUri;
      voiceTranscriptionUploadTaskRef.current = null;
      voiceTranscriptionAudioUriRef.current = null;
      if (uploadTask) {
        void uploadTask.cancelAsync().catch(() => { }).finally(() => {
          if (pendingAudioUri) {
            FileSystem.deleteAsync(pendingAudioUri, { idempotent: true }).catch(() => { });
          }
        });
      } else if (pendingAudioUri) {
        FileSystem.deleteAsync(pendingAudioUri, { idempotent: true }).catch(() => { });
      }
      if (draftAudioUri && draftAudioUri !== pendingAudioUri) {
        FileSystem.deleteAsync(draftAudioUri, { idempotent: true }).catch(() => { });
      }
      voiceMessageDraftRef.current = null;
    };
  }, []);

  const beginVoiceMessageRecording = useCallback(async () => {
    discardVoiceMessageDraft();
    const startToken = voiceRecordingStartTokenRef.current + 1;
    voiceRecordingStartTokenRef.current = startToken;
    ignoreNextMicrophonePressRef.current = true;
    try { inputRef.current?.blur?.(); } catch { }
    try { Keyboard.dismiss(); } catch { }
    voiceRecordingModeRef.current = 'voiceMessage';
    voiceAudioChunksRef.current = [];
    voiceWaveformLevelsRef.current = [];
    setVoiceLiveWaveformLevels([]);
    setIsVoiceMessageFinalizing(false);
    setIsVoiceMessageRecording(true);
    isVoiceMessageRecordingRef.current = true;
    try {
      await deepgramStartListening();
      if (
        voiceRecordingStartTokenRef.current !== startToken ||
        voiceRecordingModeRef.current !== 'voiceMessage' ||
        !isVoiceMessageRecordingRef.current
      ) {
        return;
      }
    } catch {
      if (voiceRecordingStartTokenRef.current !== startToken) return;
      isVoiceMessageRecordingRef.current = false;
      voiceRecordingModeRef.current = null;
      ignoreNextMicrophonePressRef.current = false;
      setIsVoiceMessageRecording(false);
      setIsVoiceMessageFinalizing(false);
      Alert.alert('Transcription Error', 'Could not start voice recording.');
    }
  }, [deepgramStartListening, discardVoiceMessageDraft]);

  const finishVoiceMessageRecording = useCallback(async () => {
    if (!isVoiceMessageRecordingRef.current || voiceRecordingModeRef.current !== 'voiceMessage') return;

    const operationToken = voiceRecordingStartTokenRef.current + 1;
    voiceRecordingStartTokenRef.current = operationToken;
    isVoiceMessageRecordingRef.current = false;
    setIsVoiceMessageRecording(false);
    setIsVoiceMessageFinalizing(true);
    setVoiceLiveWaveformLevels([]);

    await deepgramStopListening();
    if (voiceRecordingStartTokenRef.current !== operationToken) return;

    const capturedChunks = voiceAudioChunksRef.current.slice();
    const capturedLevels = voiceWaveformLevelsRef.current.slice();
    const durationMs = getPcmDurationMs(capturedChunks);
    const createdAt = Date.now();

    if (!capturedChunks.length) {
      voiceRecordingModeRef.current = null;
      ignoreNextMicrophonePressRef.current = false;
      setIsVoiceMessageFinalizing(false);
      return;
    }

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      playThroughEarpieceAndroid: false,
    }).catch(() => { });
    if (voiceRecordingStartTokenRef.current !== operationToken) return;

    let audioUri = '';
    try {
      audioUri = await writeVoiceMessageWav(capturedChunks);
    } catch {
      if (voiceRecordingStartTokenRef.current !== operationToken) return;
      voiceRecordingModeRef.current = null;
      ignoreNextMicrophonePressRef.current = false;
      setIsVoiceMessageFinalizing(false);
      Alert.alert('Voice Message Error', 'Could not save the voice message.');
      return;
    }
    voiceTranscriptionAudioUriRef.current = audioUri;
    if (voiceRecordingStartTokenRef.current !== operationToken) {
      voiceTranscriptionAudioUriRef.current = null;
      await FileSystem.deleteAsync(audioUri, { idempotent: true }).catch(() => { });
      return;
    }

    let transcript = '';
    let transcriptionError = '';
    let uploadTask: FileSystem.UploadTask | null = null;
    try {
      transcript = await transcribeVoiceMessage(
        audioUri,
        (nextUploadTask) => {
          uploadTask = nextUploadTask;
          voiceTranscriptionUploadTaskRef.current = nextUploadTask;
        },
        () => voiceRecordingStartTokenRef.current === operationToken
      );
    } catch (error: any) {
      transcriptionError = String(error?.message || error || 'Voice transcription failed');
    } finally {
      if (voiceTranscriptionUploadTaskRef.current === uploadTask) {
        voiceTranscriptionUploadTaskRef.current = null;
      }
    }
    if (voiceRecordingStartTokenRef.current !== operationToken) {
      if (voiceTranscriptionAudioUriRef.current === audioUri) {
        voiceTranscriptionAudioUriRef.current = null;
      }
      await FileSystem.deleteAsync(audioUri, { idempotent: true }).catch(() => { });
      return;
    }

    const nextDraft: VoiceMessageDraft = {
      type: 'voiceMessage',
      audioUri,
      durationMs,
      waveform: getDisplayWaveformLevels(capturedLevels),
      transcript,
      createdAt,
      isTranscribing: false,
      error: transcriptionError || (!transcript ? 'No transcript detected. Record again.' : undefined),
    };
    setVoiceDraft(nextDraft);
    voiceTranscriptionAudioUriRef.current = null;

    voiceRecordingModeRef.current = null;
    ignoreNextMicrophonePressRef.current = false;
    setIsVoiceMessageFinalizing(false);

    if (transcript) {
      const voiceMessage: ChatUIMessage = {
        role: 'user',
        content: transcript,
        card: {
          type: 'voiceMessage',
          audioUri,
          durationMs,
          waveform: getDisplayWaveformLevels(capturedLevels),
          transcript,
          createdAt,
        } satisfies VoiceMessageCardValue,
      };
      voiceAudioChunksRef.current = [];
      voiceWaveformLevelsRef.current = [];
      setVoiceLiveWaveformLevels([]);
      setVoiceDraft(null);
      void sendTextMessage(transcript, { displayUserMessage: voiceMessage });
      return;
    }

  }, [deepgramStopListening, sendTextMessage, setVoiceDraft]);

  const handleVoiceMessageLongPress = useCallback(() => {
    hideWishlistTutorialPrompt();
    if (isStreaming || voiceMessageDraftRef.current || isVoiceMessageRecordingRef.current) return;
    if (String(inputValueRef.current || '').trim()) return;
    if (isChatDayPlanTutorialPendingRef.current && chatDayPlanTutorialStageRef.current === 'eazee-button') {
      advanceChatDayPlanTutorial('ai-bar');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    void beginVoiceMessageRecording();
  }, [advanceChatDayPlanTutorial, beginVoiceMessageRecording, hideWishlistTutorialPrompt, isStreaming]);

  const handleVoiceMessagePressOut = useCallback(() => {
    if (voiceRecordingModeRef.current !== 'voiceMessage') return;
    void finishVoiceMessageRecording();
  }, [finishVoiceMessageRecording]);

  const handleMicrophonePress = useCallback(() => {
    hideWishlistTutorialPrompt();
    if (ignoreNextMicrophonePressRef.current) {
      return;
    }
    if (voiceMessageDraftRef.current || isVoiceMessageRecordingRef.current || isVoiceMessageFinalizing) {
      return;
    }
    if (isChatDayPlanTutorialPendingRef.current && chatDayPlanTutorialStageRef.current === 'eazee-button') {
      advanceChatDayPlanTutorial('ai-bar');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isListening) {
      deepgramStopListening();
    } else {
      deepgramStartListening();
    }
  }, [advanceChatDayPlanTutorial, hideWishlistTutorialPrompt, isListening, deepgramStartListening, deepgramStopListening, isVoiceMessageFinalizing]);

  const isFirstChatSession = !!firstChatState.sessionId && firstChatState.sessionId === activeSessionId;

  const handleSelectFirstChatStarter = useCallback(async (starter: FirstChatStarter) => {
    if (isStartingFirstChatRef.current) return;
    isStartingFirstChatRef.current = true;
    resetComposerForChatSwitch();
    setIsStartingFirstChat(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      // The starter's question appears at once without waiting for the AI, built from what
      // the app already has: saved goals for a goal, today's tasks and events for a day plan.
      const starterData = await loadFirstChatData(starter.intent);
      const sessionId = await appendVisibleChatMessages([
        { role: 'user', content: `${starter.emoji} ${starter.label}` },
        { role: 'assistant', content: buildStarterPrompt(starter, starterData) },
      ]);
      if (!sessionId) throw new Error('No chat session');
      hasTrackedRefinementRef.current = false;
      await updateFirstChatState(authUser?.uid, {
        status: 'in_progress',
        intent: starter.intent,
        sessionId,
        startedAt: Date.now(),
        assistantReplies: 1,
        resultDelivered: false,
        preferencePromptShown: false,
        preferencePromptMessageId: null,
      });
      trackFirstChatEvent('starter_selected', { intent: starter.intent });
    } catch {
      showToast('Could not start that chat. Please try again.');
    } finally {
      isStartingFirstChatRef.current = false;
      setIsStartingFirstChat(false);
    }
  }, [appendVisibleChatMessages, authUser?.uid, resetComposerForChatSwitch, showToast]);

  // Counts replies in the first-chat flow, marks it complete once a result arrives, and
  // saves preferences the user explicitly asked to keep ([[save_preference]]).
  useEffect(() => {
    const uid = authUser?.uid;
    const state = firstChatStateRef.current;
    const isOnboardingChat = !!state.sessionId && state.sessionId === activeSessionId;
    let replies = 0;
    let resultKind: ReturnType<typeof parseAssistantMessageExtras>['result'] = null;
    let rememberMessageId: string | null = null;

    for (const message of chatMessages) {
      if (message.role !== 'assistant' || message.isStreaming) continue;
      const extras = parseAssistantMessageExtras(message.content);
      if (extras.text || message.card) replies += 1;
      // A copyable draft or a proposed task list or goal is a result too, even when the
      // model forgets its [[result]] marker.
      const messageResult = extras.result
        || (extras.copyable ? 'draft' : extras.tasks.length || message.card?.type === 'dayPlan' ? 'plan' : extras.goal ? 'goal_plan' : null);
      if (messageResult && !resultKind) resultKind = messageResult;
      if (extras.remember && !rememberMessageId && message.id) rememberMessageId = getReplyKey(message);

      const messageId = message.id;
      if (!messageId || seenAssistantMessageIdsRef.current.has(messageId)) continue;
      seenAssistantMessageIdsRef.current.add(messageId);
      if (extras.remember && isPreferencePromptChatOpen(preferencePromptChatIdsRef.current, activeSessionId)) {
        countPreferencePromptChat(activeSessionId || '');
      }

      // The user picked a preference answer earlier; once the result arrives, offer to
      // remember it (once per chat, and once in the first-chat flow), unless the AI asked.
      const pendingAnswer = pendingPreferenceAnswerRef.current;
      const sessionKey = activeSessionId || '';
      if (
        pendingAnswer &&
        pendingAnswer.sessionId === activeSessionId &&
        messageResult &&
        !extras.remember &&
        !rememberPromptSessionIdsRef.current.has(sessionKey) &&
        isPreferencePromptChatOpen(preferencePromptChatIdsRef.current, sessionKey) &&
        !(isOnboardingChat && state.preferencePromptShown)
      ) {
        pendingPreferenceAnswerRef.current = null;
        rememberPromptSessionIdsRef.current.add(sessionKey);
        const replyKey = getReplyKey(message);
        const suggestion = {
          field: pendingAnswer.field,
          value: pendingAnswer.value,
          question: getRememberPreferenceQuestion(pendingAnswer.field, pendingAnswer.value),
        };
        void readSavedPreferences(uid).then((store) => {
          // Already saved with the same value: nothing to ask.
          if (store.preferences.some((item) => item.field === suggestion.field && item.value === suggestion.value)) return;
          setRememberSuggestions((current) => ({ ...current, [replyKey]: suggestion }));
          countPreferencePromptChat(sessionKey);
        });
        if (isOnboardingChat && uid) {
          void updateFirstChatState(uid, { preferencePromptShown: true, preferencePromptMessageId: replyKey });
        }
      }
      // In the first chats, ask one preference question under the first useful answer, unless
      // the AI already asked one or this chat already went through the remember prompt.
      const isUsefulReply = message.card?.type === 'dayPlan'
        || (!!extras.text && (!!messageResult || (extras.text.length >= 160 && !extras.text.trim().endsWith('?'))));
      if (
        isUsefulReply &&
        uid &&
        !extras.remember &&
        !pendingPreferenceAnswerRef.current &&
        isPreferencePromptChatOpen(preferencePromptChatIdsRef.current, sessionKey) &&
        !preferenceQuestionSessionIdsRef.current.has(sessionKey) &&
        !rememberPromptSessionIdsRef.current.has(sessionKey) &&
        !chatMessages.some((item) => item.role === 'assistant'
          && parseAssistantMessageExtras(item.content).options.some((option) => !!findPreferenceForAnswer(option)))
      ) {
        preferenceQuestionSessionIdsRef.current.add(sessionKey);
        const question = pickPreferenceQuestion({
          intent: isOnboardingChat ? state.intent : null,
          userText: chatMessages.filter((item) => item.role === 'user').map((item) => String(item.content || '')).join(' '),
          isDraft: extras.copyable,
          isPlan: messageResult === 'plan' || extras.tasks.length > 0,
        });
        const replyKey = getReplyKey(message);
        void readSavedPreferences(uid).then((store) => {
          // Already saved: nothing to ask.
          if (store.preferences.some((item) => item.field === question.field)) return;
          setPreferenceQuestions((current) => ({ ...current, [replyKey]: question }));
          countPreferencePromptChat(sessionKey);
        });
      }
      // Persistent memory: facts Eazee chose to remember (or forget). Saving is automatic; a small
      // note under the reply says what was remembered, and Settings → Memory lists everything.
      if (uid && (extras.memories.length || extras.forget.length)) {
        const replyKey = getReplyKey(message);
        void (async () => {
          const remembered: string[] = [];
          let forgot = 0;
          for (const fact of extras.forget) {
            const result = await forgetMemory(uid, fact).catch(() => null);
            if (result) forgot += 1;
          }
          for (const fact of extras.memories) {
            const result = await addMemory(uid, fact).catch(() => null);
            if (result) remembered.push(fact);
          }
          const note = remembered.length
            ? `Remembered: ${remembered.join(' · ')}. Manage in Settings → Memory.`
            : forgot
              ? 'Forgotten. Manage in Settings → Memory.'
              : null;
          if (note) setSavedPreferenceNotices((current) => ({ ...current, [replyKey]: note }));
        })();
      }
      for (const preference of extras.savePreferences) {
        const label = `${SAVED_PREFERENCE_FIELDS[preference.field].label}: ${getSavedPreferenceLabel(preference.field, preference.value)}`;
        void saveSavedPreference(uid, preference.field, preference.value, 'chat')
          .then(() => {
            setSavedPreferenceNotices((current) => ({ ...current, [getReplyKey(message)]: `Saved to your preferences (${label}). Change it in Settings.` }));
            trackFirstChatEvent('preference_saved', { field: preference.field });
          })
          .catch(() => {
            setSavedPreferenceNotices((current) => ({ ...current, [getReplyKey(message)]: 'That preference was not saved. Please try again.' }));
          });
      }
    }

    if (!isOnboardingChat || !uid) return;
    const patch: Partial<FirstChatState> = {};
    if (rememberMessageId && !state.preferencePromptShown) {
      patch.preferencePromptShown = true;
      patch.preferencePromptMessageId = rememberMessageId;
    }
    if (state.status === 'in_progress') {
      if (replies !== state.assistantReplies) patch.assistantReplies = replies;
      if (resultKind && !state.resultDelivered) {
        patch.resultDelivered = true;
        patch.status = 'completed';
        trackFirstChatEvent('result_delivered', {
          intent: state.intent,
          // The starter's own question is not an answer, so it is not counted.
          replies: Math.max(0, state.intent === 'custom' ? replies : replies - 1),
          kind: resultKind,
        });
      }
    }
    if (Object.keys(patch).length) void updateFirstChatState(uid, patch);
  }, [activeSessionId, authUser?.uid, chatMessages]);

  const assistantActionHandlers = useMemo<AssistantMessageActionHandlers>(() => {
    const isOnboardingChat = () => {
      const state = firstChatStateRef.current;
      return !!state.sessionId && state.sessionId === activeSessionIdRef.current;
    };
    return {
      onChoose: (text) => {
        const preference = findPreferenceForAnswer(text);
        if (preference) {
          pendingPreferenceAnswerRef.current = { ...preference, sessionId: activeSessionIdRef.current };
          // Answered: the question is done in this chat.
          setPreferenceQuestions((current) => Object.fromEntries(
            Object.entries(current).filter(([, question]) => !question.options.includes(text))
          ));
        }
        if (isOnboardingChat() && firstChatStateRef.current.resultDelivered && !hasTrackedRefinementRef.current) {
          hasTrackedRefinementRef.current = true;
          trackFirstChatEvent('result_refined', { intent: firstChatStateRef.current.intent });
        }
        void sendTextMessage(text);
      },
      onAddTasks: async (tasks) => {
        try {
          // Tasks already open in To Do are skipped, so a second tap never adds duplicates.
          const openTodos = await database.get<TodoModel>('todos')
            .query(Q.where('completed', false), Q.where('workspace', 'Personal'))
            .fetch();
          const existing = new Set(openTodos.map((todo) => String(todo.text || '').trim().toLowerCase()));
          const toAdd = tasks.filter((task) => !existing.has(task.trim().toLowerCase()));
          if (!toAdd.length) return { ok: true, message: 'These are already in your To Do.' };
          // Each task is an AI action; with fewer left than tasks, the first ones are added.
          const saved = await withAiActions(toAdd.length, async (granted) => {
            let done = 0;
            for (const text of toAdd.slice(0, granted)) {
              await createTodo({
                text,
                completed: false,
                dueDate: startOfDay(new Date()),
                hasDueTime: false,
                starred: false,
                workspace: 'Personal',
                goalTimeframe: null,
                type: 'basic',
                progress: 0,
                isAmazonUrlLoaded: false,
                amazonUrlLoadAttempts: 0,
              });
              done += 1;
            }
            return { value: done, done };
          });
          if (!saved) return { ok: false, error: getAiActionsLimitMessage(getAiActionsAllowance()?.limit), limitReached: true };
          if (isOnboardingChat()) trackFirstChatEvent('result_used', { intent: firstChatStateRef.current.intent, kind: 'tasks_saved' });
          const skipped = tasks.length - toAdd.length;
          const notAdded = toAdd.length - saved.value;
          return {
            ok: true,
            message: `Added ${saved.value} to To Do for today.${skipped ? ` ${skipped} ${skipped === 1 ? 'was' : 'were'} already there.` : ''}${
              notAdded ? ` ${notAdded} more didn't fit in today's free AI actions. Upgrade to Pro for unlimited AI actions.` : ''
            }`,
          };
        } catch (error) {
          return { ok: false, error: String((error as Error)?.message || 'the tasks could not be saved') };
        }
      },
      onSaveGoal: async (goal) => {
        try {
          const openGoals = await database.get<TodoModel>('todos')
            .query(Q.where('completed', false), Q.where('workspace', 'Goals'))
            .fetch();
          if (openGoals.some((todo) => String(todo.text || '').trim().toLowerCase() === goal.title.trim().toLowerCase())) {
            return { ok: true, message: 'This goal is already in your Goals.' };
          }
          const saved = await withAiActions(1, async () => {
            const created = await guidanceToolHandlers.goal_create({ title: goal.title, timeframe: goal.timeframe });
            return { value: created, done: Number(created?.created) > 0 ? 1 : 0 };
          });
          if (!saved) return { ok: false, error: getAiActionsLimitMessage(getAiActionsAllowance()?.limit), limitReached: true };
          const result = saved.value;
          if (!result || !(Number(result.created) > 0)) {
            return { ok: false, error: String(result?.message || 'the goal could not be saved') };
          }
          if (isOnboardingChat()) trackFirstChatEvent('result_used', { intent: firstChatStateRef.current.intent, kind: 'goal_saved' });
          return { ok: true, message: 'Saved to Goals.' };
        } catch (error) {
          return { ok: false, error: String((error as Error)?.message || 'the goal could not be saved') };
        }
      },
      onRemember: async (field, value, remember) => {
        if (!remember) {
          trackFirstChatEvent('preference_declined', { field });
          return { ok: true };
        }
        try {
          await saveSavedPreference(auth.currentUser?.uid, field, value, isOnboardingChat() ? 'onboarding' : 'chat');
          trackFirstChatEvent('preference_saved', { field });
          return { ok: true };
        } catch (error) {
          return { ok: false, error: String((error as Error)?.message || 'the preference could not be saved') };
        }
      },
      onShare: async (text) => {
        try {
          const result = await Share.share({ message: text });
          if (result.action === Share.sharedAction && isOnboardingChat()) {
            trackFirstChatEvent('result_used', { intent: firstChatStateRef.current.intent, kind: 'draft_copied' });
          }
        } catch {
          // Closing the share sheet is not an error worth showing.
        }
      },
    };
  }, [sendTextMessage]);

  const showFirstChatWelcome =
    !!authUser?.uid &&
    chatMessages.length === 0 &&
    !isCurrentSessionTyping &&
    !showCompactHandoffLoader &&
    // Shown during the walkthrough too, so a replayed tutorial starts on the same screen.
    !isAwaitingFixMyLifeReply;

  useEffect(() => {
    if (!showFirstChatWelcome || hasTrackedWelcomeRef.current) return;
    hasTrackedWelcomeRef.current = true;
    trackFirstChatEvent('welcome_shown');
  }, [showFirstChatWelcome]);

  const lastChatMessageId = chatMessages[chatMessages.length - 1]?.id;
  const isPreferencePromptChat = isPreferencePromptChatOpen(preferencePromptChatIds, activeSessionId);
  const chatRowExtraData = useMemo(
    () => ({ rememberSuggestions, savedPreferenceNotices, promptId: firstChatState.preferencePromptMessageId, isPreferencePromptChat, preferenceQuestions }),
    [firstChatState.preferencePromptMessageId, isPreferencePromptChat, preferenceQuestions, rememberSuggestions, savedPreferenceNotices]
  );

  const renderChatMessage = useCallback(({ item, index }: { item: ChatUIMessage; index: number }) => (
    <ChatMessageBubble
      isLatest={!!item.id && item.id === lastChatMessageId}
      showRememberPrompt={
        // "Remember this?" only in the account's first few chats, once in the first-use one.
        isPreferencePromptChat && (
          !isFirstChatSession ||
          !firstChatState.preferencePromptShown ||
          getReplyKey(item) === firstChatState.preferencePromptMessageId
        )
      }
      savedPreferenceNotice={savedPreferenceNotices[getReplyKey(item)] ?? null}
      rememberSuggestion={rememberSuggestions[getReplyKey(item)] ?? null}
      preferenceQuestion={isPreferencePromptChat ? preferenceQuestions[getReplyKey(item)] ?? null : null}
      actionHandlers={assistantActionHandlers}
      message={item}
      messageKey={item.id || `${item.role}-${index}`}
      router={router}
      serverUrl={SERVER_URL}
      setAssistantTyping={setAssistantTypingForActiveSession}
      appendChatMessages={appendVisibleChatMessages}
      onPickGoalQuotaDate={handlePickGoalQuotaDate}
      onDoGoalQuotaToday={handleDoGoalQuotaToday}
      onDecideGoalQuotaLater={handleDecideGoalQuotaLater}
      onClearPendingGoalQuotaDate={clearPendingGoalQuotaDate}
      onOpenRecipeTodoOffer={handleOpenRecipeTodoOffer}
      onDismissRecipeTodoOffer={handleDismissRecipeTodoOffer}
      onBuyWishlistTodo={handleBuyWishlistTodo}
      onUpdateDayPlanCard={persistDayPlanCardState}
      onSaveDayPlanCard={saveDayPlanCard}
      onSaveAllDayPlans={saveAllDayPlanCards}
      weekPlanPendingDraftIds={weekPlanPendingDraftIds}
      onCancelDayPlanCard={cancelDayPlanCard}
      onRetryMessage={handleRetryMessage}
      buyingWishlistTodoId={buyingWishlistTodoId}
      resolvedGoalQuotaPlanIds={resolvedGoalQuotaPlanIds}
    />
  ), [assistantActionHandlers, isPreferencePromptChat, preferenceQuestions, rememberSuggestions, firstChatState.preferencePromptMessageId, firstChatState.preferencePromptShown, isFirstChatSession, lastChatMessageId, savedPreferenceNotices, saveAllDayPlanCards, weekPlanPendingDraftIds, appendVisibleChatMessages, buyingWishlistTodoId, cancelDayPlanCard, clearPendingGoalQuotaDate, handleBuyWishlistTodo, handleDecideGoalQuotaLater, handleDismissRecipeTodoOffer, handleDoGoalQuotaToday, handleOpenRecipeTodoOffer, handlePickGoalQuotaDate, handleRetryMessage, persistDayPlanCardState, resolvedGoalQuotaPlanIds, router, saveDayPlanCard, setAssistantTypingForActiveSession]);

  // Invite the user to "Get to know me" after Eazee has helped, never in the middle of a task:
  // not while a reply is coming, a question or plan is waiting on them, or another prompt shows.
  const lastChatMessage = chatMessages[chatMessages.length - 1];
  const showAboutMeInvite = useMemo(() => {
    if (!authUser?.uid || hasAboutMeProfile || !canShowAboutMeInvite(aboutMeInvite, activeSessionId)) return false;
    // Never during the walkthrough: it has its own card on screen.
    if (isCurrentSessionTyping || isChatDayPlanTutorialPending || isTutorialSessionActive(authUser.uid)) return false;
    if (weekPlanContextRef.current?.sessionId && weekPlanContextRef.current.sessionId === activeSessionId) return false;
    if (!lastChatMessage || lastChatMessage.role !== 'assistant' || lastChatMessage.isStreaming || lastChatMessage.card) return false;
    const replyKey = getReplyKey(lastChatMessage);
    if (rememberSuggestions[replyKey] || preferenceQuestions[replyKey]) return false;
    const extras = parseAssistantMessageExtras(lastChatMessage.content);
    // Waits while Eazee is asking the user something; suggestion buttons and offered tasks
    // come with almost every answer, so they don't count as an unfinished task.
    if (extras.remember || !extras.text || extras.text.trim().endsWith('?')) return false;
    const helpfulReplies = chatMessages.filter((message) => message.role === 'assistant'
      && !message.isStreaming
      && (!!message.card || !!parseAssistantMessageExtras(message.content).text)).length;
    return helpfulReplies >= 2;
  }, [
    aboutMeInvite,
    activeSessionId,
    authUser?.uid,
    chatMessages,
    hasAboutMeProfile,
    isChatDayPlanTutorialPending,
    isCurrentSessionTyping,
    lastChatMessage,
    preferenceQuestions,
    rememberSuggestions,
  ]);
  useEffect(() => {
    const uid = authUser?.uid;
    if (!showAboutMeInvite || !uid || !activeSessionId || aboutMeInvite.sessionIds.includes(activeSessionId)) return;
    const next = { ...aboutMeInvite, sessionIds: [...aboutMeInvite.sessionIds, activeSessionId] };
    setAboutMeInvite(next);
    void writeAboutMeInviteState(uid, next);
    trackAboutMeEvent('invite_shown', { entry: 'chat' });
    // It sits below the last reply, so bring it into view.
    setTimeout(() => queueScrollToBottom(true), 150);
  }, [aboutMeInvite, activeSessionId, authUser?.uid, queueScrollToBottom, showAboutMeInvite]);
  const answerAboutMeInvite = useCallback((accepted: boolean) => {
    const uid = authUser?.uid;
    if (!uid) return;
    const next: AboutMeInviteState = { ...aboutMeInvite, status: accepted ? 'accepted' : 'dismissed' };
    setAboutMeInvite(next);
    void writeAboutMeInviteState(uid, next);
    trackAboutMeEvent(accepted ? 'invite_accepted' : 'invite_dismissed', { entry: 'chat' });
    if (accepted) router.push({ pathname: '/about-me', params: { entry: 'chat' } });
  }, [aboutMeInvite, authUser?.uid, router]);

  const renderChatFooter = useCallback(() => {
    const logoBounceStyle = {
      opacity: typingAnim.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }),
      transform: [
        {
          translateY: typingAnim.interpolate({ inputRange: [0, 1], outputRange: [3, -3] }),
        },
      ],
    } as const;

    return (
      <View style={{ width: '100%' }} onLayout={handleChatFooterLayout}>
        {isCurrentSessionTyping && !isBootstrappingCompactHandoff && (
          <View style={{ alignSelf: 'flex-start', marginVertical: 4 }}>
            <View style={{ width: 28, height: 22, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.Image
                source={require('../../../assets/images/eazee-logo-big.png')}
                style={[
                  {
                    width: 24,
                    height: 24,
                  },
                  logoBounceStyle,
                ]}
                resizeMode="contain"
              />
            </View>
          </View>
        )}
        {showAboutMeInvite && (
          <View style={styles.aboutMeInvite}>
            <Text style={styles.aboutMeInviteText}>
              Want Eazee to get you a little better? Tell me about yourself and discover your Eazee personality.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => answerAboutMeInvite(true)}
                style={[styles.aboutMeInviteButton, { backgroundColor: '#AEFFE8' }]}
              >
                <Text style={[styles.aboutMeInviteButtonText, { color: '#04403A' }]}>Get to know me</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => answerAboutMeInvite(false)}
                style={[styles.aboutMeInviteButton, { borderWidth: 1, borderColor: 'rgba(173, 255, 240, 0.45)' }]}
              >
                <Text style={styles.aboutMeInviteButtonText}>Maybe later</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }, [answerAboutMeInvite, handleChatFooterLayout, isBootstrappingCompactHandoff, isCurrentSessionTyping, showAboutMeInvite, typingAnim]);

  const showChatPanel = showCompactHandoffLoader || isCurrentSessionTyping || chatMessages.length > 0;
  const isVoiceInputActive = isVoiceMessageRecording || isVoiceMessageFinalizing || !!voiceMessageDraft;
  const voicePreviewContent = isVoiceInputActive ? (
    <VoiceInputWaveformPreview
      waveform={isVoiceMessageRecording ? voiceLiveWaveformLevels : voiceMessageDraft?.waveform || voiceLiveWaveformLevels}
      durationMs={voiceMessageDraft?.durationMs || 0}
      isRecording={isVoiceMessageRecording}
      isTranscribing={isVoiceMessageFinalizing || voiceMessageDraft?.isTranscribing}
      error={voiceMessageDraft?.error}
      onDiscard={isVoiceMessageRecording ? undefined : discardVoiceMessageDraft}
    />
  ) : undefined;
  const chatHistoryHeaderButton = (
    <View
      className="mt-2"
      style={{
        marginLeft: isLeftHanded ? 0 : CHAT_HEADER_GLASS_EDGE_MARGIN,
        marginRight: isLeftHanded ? CHAT_HEADER_GLASS_EDGE_MARGIN : 0,
      }}
    >
      <GuidedTarget
        targetId={getChatHeaderGuidanceTargetId('history')}
        label="Chat history"
        highlightMode="local"
        localHighlightRadius={999}
        localHighlightInset={4}
        style={{ width: CHAT_HEADER_GLASS_BUTTON_SIZE, height: CHAT_HEADER_GLASS_BUTTON_SIZE }}
      >
        <LiquidGlassIconButton
          debugLabel="chat:header:history"
          accessibilityLabel="Open chat history"
          disabled={isChatDayPlanTutorialPending}
          size={CHAT_HEADER_GLASS_BUTTON_SIZE}
          colorScheme="dark"
          tintColor={CHAT_HEADER_GLASS_TINT_COLOR}
          fallbackTint="dark"
          fallbackBackgroundColor={CHAT_HEADER_GLASS_FALLBACK_BACKGROUND}
          fallbackBorderColor={CHAT_HEADER_GLASS_FALLBACK_BORDER}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => {
            if (isChatDayPlanTutorialPending) return;
            setIsSummaryTestMode(false);
            setIsHistoryModalVisible(true);
            completeChatGuidanceAction('history');
          }}
        >
          <View style={{ width: 24, alignItems: 'flex-start' }}>
            <View style={{ width: 24, height: 4, borderRadius: 999, backgroundColor: CHAT_HEADER_GLASS_ICON_COLOR }} />
            <View style={{ width: 17, height: 4, borderRadius: 999, backgroundColor: CHAT_HEADER_GLASS_ICON_COLOR, marginTop: 6 }} />
          </View>
        </LiquidGlassIconButton>
      </GuidedTarget>
    </View>
  );
  const personalityHeaderButton = (
    <View className="mt-2">
    <LiquidGlassIconButton
      debugLabel="chat:header:personality"
      accessibilityLabel={`AI personality: ${AI_BASE_PERSONALIZATION_OPTIONS.find((option) => option.value === aiBaseStyle)?.label || ''}. Change it`}
      size={CHAT_HEADER_GLASS_BUTTON_SIZE}
      colorScheme="dark"
      tintColor={CHAT_HEADER_GLASS_TINT_COLOR}
      fallbackTint="dark"
      fallbackBackgroundColor={CHAT_HEADER_GLASS_FALLBACK_BACKGROUND}
      fallbackBorderColor={CHAT_HEADER_GLASS_FALLBACK_BORDER}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      onPress={() => setIsPersonalityMenuOpen(true)}
    >
      <View style={{ width: 22 }}>
        {[0, 1, 2].map((bar) => (
          <View
            key={bar}
            style={{ height: 3.5, borderRadius: 999, backgroundColor: CHAT_HEADER_GLASS_ICON_COLOR, marginTop: bar ? 4 : 0 }}
          />
        ))}
      </View>
    </LiquidGlassIconButton>
    </View>
  );
  // The personality button sits beside chat history, on whichever side history is.
  const historyAndPersonalityHeaderButtons = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {isLeftHanded ? personalityHeaderButton : chatHistoryHeaderButton}
      {isLeftHanded ? chatHistoryHeaderButton : personalityHeaderButton}
    </View>
  );
  const newChatHeaderButton = (
    <View
      className="mt-2"
      style={{
        marginLeft: isLeftHanded ? CHAT_HEADER_GLASS_EDGE_MARGIN : 0,
        marginRight: isLeftHanded ? 0 : CHAT_HEADER_GLASS_EDGE_MARGIN,
      }}
    >
      <GuidedTarget
        targetId={getChatHeaderGuidanceTargetId('new')}
        label="New chat"
        highlightMode="local"
        localHighlightRadius={999}
        localHighlightInset={4}
        style={{ width: CHAT_HEADER_GLASS_BUTTON_SIZE, height: CHAT_HEADER_GLASS_BUTTON_SIZE }}
      >
        <LiquidGlassIconButton
          debugLabel="chat:header:new"
          accessibilityLabel="Start new chat"
          disabled={isCreatingNewChat || isChatDayPlanTutorialPending}
          size={CHAT_HEADER_GLASS_BUTTON_SIZE}
          colorScheme="dark"
          tintColor={CHAT_HEADER_GLASS_TINT_COLOR}
          fallbackTint="dark"
          fallbackBackgroundColor={CHAT_HEADER_GLASS_FALLBACK_BACKGROUND}
          fallbackBorderColor={CHAT_HEADER_GLASS_FALLBACK_BORDER}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => {
            if (isChatDayPlanTutorialPending) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            void handleNewChat().then(() => showToast('Opened a new chat'));
            completeChatGuidanceAction('new');
          }}
        >
          <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 22, height: 5, borderRadius: 999, backgroundColor: CHAT_HEADER_GLASS_ICON_COLOR }} />
            <View style={{ position: 'absolute', width: 5, height: 22, borderRadius: 999, backgroundColor: CHAT_HEADER_GLASS_ICON_COLOR }} />
          </View>
        </LiquidGlassIconButton>
      </GuidedTarget>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#28D5D1' }}>
      {isFocused && (
        <StatusBar style="light" backgroundColor="transparent" translucent={true} />
      )}
      <ImageBackground 
        source={require('../../../assets/images/chat-bg.png')} 
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        resizeMode="cover"
      />
      {Platform.OS === 'ios' && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(1, 99, 108, 0)', 'rgba(0, 67, 74, 0.38)', 'rgba(0, 34, 40, 0.68)']}
          locations={[0, 0.58, 1]}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: chatBackdropScrimHeight,
          }}
        />
      )}
      <View
        style={{
          position: 'absolute',
          top: -24,
          left: -12,
          right: -12,
          bottom: -24,
          zIndex: 11,
        }}
        pointerEvents="none"
      >
        <Image
          source={require('../../../assets/images/chat-bg-stars.png')}
          style={{
            width: '100%',
            height: '100%',
            opacity: 0.08,
          }}
          resizeMode="stretch"
        />
      </View>
      <View className="flex-1">
        <ScreenHeader
          title="AI Chat"
          titleColor="#C8FFFB"
          left={isLeftHanded ? newChatHeaderButton : historyAndPersonalityHeaderButtons}
          right={isLeftHanded ? historyAndPersonalityHeaderButtons : newChatHeaderButton}
        />
        {!!visibleChatTitle && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setIsRenamingActiveChat(true)}
            accessibilityRole="button"
            accessibilityLabel={`Chat name: ${visibleChatTitle}. Tap to rename`}
          >
          <FancyText
            key={`${activeSessionId || 'chat'}-${visibleChatTitle}`}
            words={[visibleChatTitle]}
            style={{
              height: 24,
              marginTop: -6,
              marginBottom: 2,
              paddingHorizontal: 24,
            }}
            textProps={{
              style: {
                color: '#F4FFFD',
                fontSize: 16,
                lineHeight: 20,
                fontWeight: '800',
                textShadowColor: 'rgba(0,0,0,0.22)',
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 6,
              },
            }}
          />
          </TouchableOpacity>
        )}

        <View style={{ flex: 1 }}>
          <View className="flex-1" style={{ marginHorizontal: 16, marginTop: 13, marginBottom: activeAiInputSpacer }}>
            <View
              style={{
                flex: 1,
                borderRadius: showChatPanel ? 30 : 0,
                overflow: showChatPanel ? 'hidden' : 'visible',
                backgroundColor: showChatPanel ? 'rgba(0, 0, 0, 0.18)' : 'transparent',
              }}
            >
              {showCompactHandoffLoader ? (
                // Fix my life shows its own blocking overlay, so the inline loader stays empty under it.
                isAwaitingFixMyLifeReply ? <View style={{ flex: 1 }} /> : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                  <ActivityIndicator size="small" color="#C8FFFB" />
                  <Text
                    style={{
                      marginTop: 12,
                      color: '#C8FFFB',
                      fontSize: 14,
                      fontWeight: '700',
                      textAlign: 'center',
                    }}
                  >
                    Continuing chat
                  </Text>
                </View>
                )
              ) : showChatPanel ? (
                <FlatList
                  key={activeSessionId || 'empty-chat'}
                  ref={scrollViewRef}
                  style={{ flex: 1, width: '100%' }}
                  contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 12, paddingBottom: 20, paddingTop: 20, width: '100%' }}
                  data={chatMessages}
                  // Rows also change when a prompt or notice is added under an existing reply.
                  extraData={chatRowExtraData}
                  renderItem={renderChatMessage}
                  keyExtractor={(item, index) => item.id || `${item.role}-${index}`}
                  ListFooterComponent={renderChatFooter}
                  ListFooterComponentStyle={{ width: '100%' }}
                  onLayout={handleChatListLayout}
                  onContentSizeChange={handleChatContentSizeChange}
                  onScroll={handleChatScroll}
                  onScrollToIndexFailed={handleChatScrollToIndexFailed}
                  onScrollBeginDrag={() => {
                    clearAssistantReadAnchor();
                    isUserScrollingRef.current = true;
                  }}
                  onScrollEndDrag={() => {
                    isUserScrollingRef.current = false;
                    if (typingSessionIdsRef.current.includes(activeSessionIdRef.current || '')) {
                      queueScrollToBottom(false);
                    }
                  }}
                  onMomentumScrollBegin={() => {
                    clearAssistantReadAnchor();
                    isUserScrollingRef.current = true;
                  }}
                  onMomentumScrollEnd={() => {
                    isUserScrollingRef.current = false;
                    if (typingSessionIdsRef.current.includes(activeSessionIdRef.current || '')) {
                      queueScrollToBottom(false);
                    }
                  }}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  renderScrollComponent={renderChatScrollComponent}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  refreshControl={(
                    <RefreshControl
                      refreshing={isRefreshingChat}
                      onRefresh={() => void handleRefreshChat()}
                      tintColor="#C8FFFB"
                      colors={['#137D78']}
                      progressBackgroundColor="#C8FFFB"
                    />
                  )}
                />
              ) : showFirstChatWelcome ? (
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 12 }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={{ borderRadius: 28, padding: 14, backgroundColor: 'rgba(0, 0, 0, 0.32)' }}>
                    <FirstChatWelcome
                      disabled={isStartingFirstChat}
                      onSelect={(starter) => void handleSelectFirstChatStarter(starter)}
                    />
                  </View>
                </ScrollView>
              ) : (
                <TouchableOpacity
                  accessible={false}
                  activeOpacity={1}
                  onPress={dismissChatKeyboard}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </View>
          <LowerSwipeGesture
            currentTab="chat"
            disabled={isChatSwipeDisabled || isChatDayPlanTutorialPending}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: chatSwipeBandHeight,
              zIndex: 70,
              elevation: 70,
            }}
          >
            <Animated.View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: aiInputKeyboardBottom,
                transform: [{
                  translateY: keyboardOffset.interpolate({
                    inputRange: [0, 1000],
                    outputRange: [0, -1000],
                    extrapolate: 'clamp',
                  }),
                }],
              }}
            >
              {!!aiActionsRemainingText && (
                // Above the composer without moving it: free plans only.
                <View pointerEvents="none" style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, alignItems: 'center', paddingBottom: 4 }}>
                  <Text style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 11, fontWeight: '700' }}>{aiActionsRemainingText}</Text>
                </View>
              )}
              <GuidedTarget
                targetId={getChatPlanDayComposerGuidanceTargetId()}
                label="Chat composer"
                highlightMode="local"
                localHighlightVisible={false}
                style={{ width: '100%' }}
              >
                <AIInputBox
                  textInput={isStreaming && !isVoiceInputActive ? partialTranscript : inputValue}
                  isListening={isListening && !isVoiceInputActive}
                  microphoneColor={microphoneColor}
                  glowAnim={glowAnim}
                  placeholder={isStreaming && !isVoiceInputActive ? 'Listening...' : ''}
                  editable={!isChatDayPlanTutorialPending || chatDayPlanTutorialStage === 'plan-day'}
                  showSoftInputOnFocus={(!isChatDayPlanTutorialPending || chatDayPlanTutorialStage === 'plan-day') && !isStreaming && !isVoiceInputActive}
                  caretHidden={(isChatDayPlanTutorialPending && chatDayPlanTutorialStage !== 'plan-day') || isStreaming || isVoiceInputActive}
                  showSendButton={isVoiceInputActive ? false : !isStreaming}
                  multiline
                  minInputHeight={40}
                  maxInputHeight={120}
                  onHeightChange={(height) => setAiInputHeight(Math.max(68, Math.ceil(height)))}
                  inputRef={inputRef}
                  onChangeText={isStreaming || isVoiceInputActive ? undefined : handleInputChange}
                  onSubmitEditing={isVoiceInputActive ? undefined : handleSend}
                  onSendPress={isVoiceInputActive ? undefined : handleSendPress}
                  onStopPress={stopActiveChatResponse}
                  isResponding={isCurrentSessionTyping}
                  voicePreviewContent={voicePreviewContent}
                  returnKeyType="default"
                  autoCapitalize="sentences"
                  blurOnSubmit={false}
                  onFocus={handleChatInputFocus}
                  onBlur={() => setIsAiInputFocused(false)}
                  onTextInputPress={handleChatInputFocus}
                  onMicrophonePress={handleMicrophonePress}
                  onMicrophoneLongPress={isVoiceInputActive || isStreaming || inputValue.trim().length > 0 ? undefined : handleVoiceMessageLongPress}
                  onMicrophonePressOut={handleVoiceMessagePressOut}
                  microphoneDelayLongPress={VOICE_MESSAGE_LONG_PRESS_DELAY_MS}
                  microphoneSide={isLeftHanded ? 'left' : 'right'}
                  inputWrapper={(node) => (
                  <GuidedTarget
                    targetId={getChatAiBarGuidanceTargetId()}
                    label="AI bar"
                    highlightMode="local"
                    highlightWhenTargetId={chatDayPlanTutorialStage === 'plan-day' ? getChatPlanDayComposerGuidanceTargetId() : undefined}
                    highlightWhenTargetIds={[getChatWishlistMessageGuidanceTargetId()]}
                    localHighlightColor="#AEFFE8"
                    localHighlightBackgroundColor="rgba(174, 255, 232, 0.08)"
                    localHighlightInset={-2}
                    localHighlightLeftInset={-10}
                    localHighlightTopInset={-10}
                    localHighlightBottomInset={-10}
                    localHighlightRadius={22}
                    localHighlightShape="rect"
                    localHighlightPulseScale={1.025}
                    localHighlightShadowRadius={9}
                    localHighlightShadowOpacity={0.55}
                    style={{ flex: 1 }}
                  >
                    {isChatDayPlanTutorialPending && chatDayPlanTutorialStage === 'ai-bar' ? (
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => advanceChatDayPlanTutorial('plan-day')}
                        style={{ flex: 1 }}
                      >
                        {node}
                      </TouchableOpacity>
                    ) : node}
                  </GuidedTarget>
                )}
                microphoneWrapper={(node) => (
                  <GuidedTarget
                    targetId={getChatEazeeButtonGuidanceTargetId()}
                    label="Eazee button"
                    highlightMode="local"
                    highlightWhenTargetIds={[getChatWishlistMessageGuidanceTargetId()]}
                    localHighlightColor="#AEFFE8"
                    localHighlightBackgroundColor="rgba(174, 255, 232, 0.08)"
                    localHighlightInset={-2}
                    localHighlightLeftInset={-3}
                    localHighlightRightInset={-12}
                    localHighlightTopInset={-6}
                    localHighlightBottomInset={-6}
                    localHighlightRadius={24}
                    localHighlightShape="rect"
                    localHighlightPulseScale={1.025}
                    localHighlightShadowRadius={9}
                    localHighlightShadowOpacity={0.55}
                  >
                    <View style={{ position: 'relative' }}>
                      {node}
                      {isChatDayPlanTutorialPending && chatDayPlanTutorialStage === 'eazee-button' ? (
                        <TouchableOpacity
                          activeOpacity={1}
                          onPress={() => advanceChatDayPlanTutorial('ai-bar')}
                          onLongPress={() => advanceChatDayPlanTutorial('ai-bar')}
                          delayLongPress={VOICE_MESSAGE_LONG_PRESS_DELAY_MS}
                          style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            bottom: 0,
                            left: 0,
                            zIndex: 60,
                            elevation: 60,
                          }}
                        />
                      ) : null}
                    </View>
                  </GuidedTarget>
                )}
                  surfaceVariant="chat"
                />
              </GuidedTarget>
            </Animated.View>
          </LowerSwipeGesture>
        </View>
        <AppToast message={toast?.message ?? null} nonce={toast?.nonce ?? 0} top={insets.top + 120} />
        <AiReplyLoadingOverlay
          visible={isAwaitingFixMyLifeReply}
          title="Planning your week..."
          subtitle="Eazee is looking at your todos, calendar and goals. This can take a little while."
          onCancel={cancelFixMyLife}
        />
        <ChatHistoryModal
          visible={isHistoryModalVisible}
          title="Chats"
          sessions={historySessions}
          activeSessionId={activeSessionId}
          showSummaries={isSummaryTestMode}
          isLeftHanded={isLeftHanded}
          onClose={closeHistoryModal}
          onSelectSession={(sessionId) => { void openHistorySession(sessionId); }}
          onTogglePin={(sessionId, pinned) => { void toggleSessionPin(sessionId, pinned); }}
          onDeleteSession={deleteSession}
          onRenameSession={(sessionId, title) => {
            void renameChatSession(sessionId, title).catch(() => showToast('Could not rename the chat. Please try again.'));
          }}
        />
        <Modal
          transparent
          visible={isPersonalityMenuOpen}
          animationType="fade"
          onRequestClose={() => setIsPersonalityMenuOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setIsPersonalityMenuOpen(false)}
            style={{ flex: 1, backgroundColor: 'rgba(0, 20, 18, 0.25)' }}
          >
            <View
              style={{
                position: 'absolute',
                top: insets.top + 64,
                ...(isLeftHanded ? { right: 16 } : { left: 16 }),
                minWidth: 220,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: 'rgba(173, 255, 240, 0.55)',
                backgroundColor: '#05504A',
                paddingVertical: 6,
                elevation: 12,
                shadowColor: '#001A17',
                shadowOpacity: 0.3,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
              }}
            >
              <Text style={{ color: 'rgba(216, 255, 250, 0.7)', fontSize: 12, fontWeight: '700', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 }}>
                AI personality
              </Text>
              {AI_BASE_PERSONALIZATION_OPTIONS.map((option) => {
                const selected = option.value === aiBaseStyle;
                return (
                  <TouchableOpacity
                    key={option.value}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    onPress={() => { void handleSelectAiBaseStyle(option.value); }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 16,
                      paddingVertical: 11,
                      backgroundColor: selected ? 'rgba(174, 255, 232, 0.12)' : 'transparent',
                    }}
                  >
                    <Text style={{ color: '#F4FFFD', fontSize: 15, fontWeight: selected ? '800' : '600' }}>{option.label}</Text>
                    {selected && <MIcon name="check" size={18} color="#AEFFE8" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </Modal>
        <Modal
          transparent
          visible={isRenamingActiveChat}
          animationType="fade"
          onRequestClose={() => setIsRenamingActiveChat(false)}
        >
          {isRenamingActiveChat && (
            <RenameChatDialog
              initialTitle={visibleChatTitle}
              onCancel={() => setIsRenamingActiveChat(false)}
              onSave={(title) => {
                setIsRenamingActiveChat(false);
                void renameChatSession(activeSessionIdRef.current, title).catch(() => showToast('Could not rename the chat. Please try again.'));
              }}
            />
          )}
        </Modal>
        <GoalQuotaDatePickerModal
          visible={!!goalQuotaDatePickerInput}
          value={pendingGoalQuotaDate}
          minimumDate={startOfDay(new Date())}
          isConfirming={isSchedulingGoalQuotaAction}
          onChange={handleGoalQuotaDateChange}
          onClose={handleCloseGoalQuotaDatePicker}
          onConfirm={handleConfirmGoalQuotaDate}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  aboutMeInvite: {
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(173, 255, 240, 0.35)',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    padding: 14,
    gap: 12,
  },
  aboutMeInviteText: { color: '#E8FFFA', fontSize: 15, lineHeight: 21, fontWeight: '600' },
  aboutMeInviteButton: { flex: 1, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  aboutMeInviteButtonText: { color: '#E8FFFA', fontSize: 15, fontWeight: '800' },
});
