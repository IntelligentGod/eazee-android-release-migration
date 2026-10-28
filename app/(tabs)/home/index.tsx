import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Image, Keyboard, LayoutAnimation, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Blur, Canvas, Group, Paragraph, Paint, Skia, type SkParagraph } from '@shopify/react-native-skia';
import Reanimated, { runOnJS, useAnimatedScrollHandler, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  getHomePlanDay,
  getHomePlanTitle,
  HOME_PLAN_MAX_DAY_OFFSET,
  loadHomeDayPlanItems,
} from '@/lib/homeDayPlan';
import { differenceInCalendarDays, endOfDay, format, startOfDay } from 'date-fns';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../../database/database';
import EventModel from '../../../database/models/EventModel';
import HomeEventCompletionModel from '../../../database/models/HomeEventCompletionModel';
import TodoModel from '../../../database/models/TodoModel';
import GoalGuidancePlanModel from '../../../database/models/GoalGuidancePlanModel';
import SkillGuideModel from '../../../database/models/SkillGuideModel';
import TaskGuideModel from '../../../database/models/TaskGuideModel';
import AIInputBox from '@/components/AIInputBox';
import HomeBlob, { BLOB_APPEARANCE_PRESETS, type BlobAppearancePresetId } from '@/components/blob/HomeBlob';
import FixMyLifeButton from '@/components/FixMyLifeButton';
import ProRequiredDialog from '@/components/ProRequiredDialog';
import { checkAiFeatureAccess } from '@/lib/subscriptionUsage';
import type { MoodState } from '@/components/blob/BlobFace';
import LifeGraphSettingsModal from '@/components/blob/LifeGraphSettingsModal';
import { useLifeGraph } from '@/lib/useLifeGraph';
import CompactAiBanner from '@/components/CompactAiBanner';
import LiquidGlassIconButton from '@/components/LiquidGlassIconButton';
import ScreenHeader from '@/components/ScreenHeader';
import { getFloatingTabBarInset } from '@/components/navigation/floatingTabBar';
import LowerSwipeGesture from '@/components/navigation/LowerSwipeGesture';
import ManageAccountSheet from './ManageAccountSheet';
import HomeSettingsSheet from './HomeSettingsSheet';
import { useAuthSession } from '../../context/AuthSessionContext';
import { useTokens } from '../../context/TokenContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTodoHasDueTime } from '@/utils/todoDates';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import { useCompactTabAI, type CompactAiNoticeTarget } from '@/lib/useCompactTabAI';
import { useCompactGuidanceBridge } from '@/lib/useCompactGuidanceBridge';
import { useCompactVoiceInput } from '@/lib/useCompactVoiceInput';
import { GuidedTarget, showGuidanceTab, useGuidance } from '@/components/guidance/GuidanceProvider';
import {
  getHomeControlGuidanceTargetId,
  getHomeSettingsGuidanceTargetId,
  getShortcutForGuidanceTarget,
  type GuidanceTarget,
} from '@/lib/navigationHelp';
import { setGuidanceActiveTab } from '@/lib/guidanceActiveTab';
import { HOME_MOTIVATIONAL_QUOTES } from '@/lib/homeMotivationalQuotes';
import { useLeftHandedMode } from '@/lib/useLeftHandedMode';
import { useHomePersonalization } from '@/lib/useHomePersonalization';
import {
  TUTORIAL_CALENDAR_EVENT_STEP,
  TUTORIAL_HOME_OVERVIEW_STEP,
  TUTORIAL_WISHLIST_SHOPPING_STEP,
  uncompleteTutorialStep,
  completeTutorialStep,
  getTutorialProgress,
  isTutorialSessionActive,
  subscribeTutorialProgress,
} from '@/lib/tutorial';
import {
  findHomeSuggestionFreeWindow,
  getHomeSuggestionsRetryDelay,
  normalizeHomeSuggestions,
  readHomeSuggestionsCache,
  requestHomeSuggestions,
  writeHomeSuggestionsCache,
  type HomeSuggestion,
  type HomeSuggestionBusyRange,
  type HomeSuggestionTodayContext,
} from '@/lib/homeSuggestions';
import {
  isAiDataSharingConsentDeclinedError,
  subscribeAiDataSharingConsentAccepted,
} from '@/lib/aiDataSharingConsent';
import { updateTodo } from '@/lib/todoMutations';
import {
  advanceGoalGuidanceForCompletedTodo,
  fetchGoalGuidancePlanForGoal,
  refreshGoalGuidancePlansForToday,
  saveGoalGuidanceStepProgress,
} from '@/lib/goalGuidance';
import {
  buildCompletedHomeEventIds,
  buildHomeEventCompletionId,
  buildHomeSuggestionCandidates,
  buildLocalHomeSnapshot,
  createEmptyHomeSnapshot,
  filterHomePlanTodos,
  filterHomeEventCompletionsForEvents,
  getHiddenHomeGoalGuidanceTodoIds,
  getHomeEventCompletionOccurrenceStartTimes,
  getHomeEventCompletionIdentity,
  getNextStepTodoCandidate,
  getNextUnsnoozedTodoCandidate,
  isHomeCalendarReadyForSuggestions,
  isFetchedGoogleHomeEvent,
  mergeGoogleEventsIntoHomeSnapshot,
  orderScheduleItemsWithSnoozesLast,
  type HomeGoogleEvent,
  type HomeSnapshot,
  sortTodosByDueDate,
} from './homeData';
import type {
  ActivityEvent as BlobActivityEvent,
  CalendarEvent as BlobCalendarEvent,
  Task as BlobTask,
} from '@/core/blob/BehaviorMetrics';
import { computeBehaviorMetrics } from '@/core/blob/BehaviorMetrics';
import { extendEventSeries } from '@/lib/eventSeries';
import { computeBlobVisualMeaning } from '@/src/blob/blobMeaning';
import { blobMeaningFromBehaviorMetrics } from '@/src/blob/blobMeaningFromSignals';
import { BLOB_SCENARIOS } from '@/src/blob/blobScenarioPresets';
import { openNewChatAfterTutorial } from '@/lib/tutorialEnd';

type GoogleEvent = HomeGoogleEvent;

type ScheduleItem = {
  id: string;
  sourceId: string;
  label: string;
  type: 'event' | 'todo';
  time?: Date;
  endTime?: Date;
  hasTime: boolean;
  isStarred?: boolean;
  isOverdue?: boolean;
  createdAt?: Date;
  completionSource?: 'local' | 'google';
  completionKey?: string;
  occurrenceStart?: Date;
  workspaceKey?: string;
  /** A timed event that has already ended today: still listed, shown faded. */
  isPast?: boolean;
};

type NextStepState = {
  items: ScheduleItem[];
  helperText?: string;
};

type HomeTutorialStage = 'overview' | 'next-step' | 'todays-plan';

const FREE_WINDOW_MINUTES = 3 * 60;
const HOME_ITEM_FADE_OUT_MS = 240;
const ALIGN_ALL_DASHES = false;
const HOME_AI_INPUT_MIN_HEIGHT = 61;
const ANDROID_HOME_KEYBOARD_GAP = 10;
const TODAY_CARD_BASE_HEIGHT = 192;
const TODAY_CARD_MAX_HEIGHT = 360;
const TODAY_CARD_BLUR_HEIGHT = 60;
const TODAY_CARD_RADIUS = 22;
const TODAY_CARD_SURFACE = 'rgba(46,45,34,0.25)';
const TODAY_CARD_TEXT = '#C1BDB1';
const TODAY_CARD_PAST_TEXT = 'rgba(193, 189, 177, 0.45)';
const TODAY_CARD_LIST_LEFT = 16;
const TODAY_CARD_LIST_RIGHT = 16;
const HIDDEN_HOME_ITEM_IDS_STORAGE_KEY = 'home:hiddenItemIds:v1';
const NEXT_STEP_SNOOZED_TODO_IDS_STORAGE_KEY = 'home:nextStepSnoozedTodoIds:v1';
const SNOOZED_HOME_EVENT_IDS_STORAGE_KEY = 'home:snoozedEventIds:v1';
const HEART_TASK_THRESHOLD = 3;
const HOME_BLOB_COLOR_OPTIONS: { id: BlobAppearancePresetId; label: string }[] = [
  { id: 'liquidGold', label: 'Gold' },
  { id: 'bubblegumPink', label: 'Pink' },
  { id: 'obsidianBlack', label: 'Black' },
];
const FACE_MOODS: MoodState[] = [
  'calm',
  'happy',
  'excited',
  'focused',
  'stressed',
  'sad',
  'hat',
  'cap',
  'crown',
  'crown2',
  'bow',
  'sunglasses',
  'purple_sunglasses',
  'mustache',
  'beard',
  'long_lashes',
  'mouth_overlay',
  'mouth_1',
  'mouth_braces',
  'pout_lips',
  'cape',
];
const getMinuteKey = (date: Date) => Math.floor(date.getTime() / 60000);

function moodButtonLabel(mood: MoodState): string {
  if (mood === 'purple_sunglasses') return 'Purple sunglasses';
  if (mood === 'crown2') return 'Crown 2';
  if (mood === 'long_lashes') return 'Long lashes';
  if (mood === 'mouth_braces') return 'Braces';
  if (mood === 'pout_lips') return 'Pout lips';
  if (mood === 'mouth_overlay') return '2';
  if (mood === 'mouth_1') return '1';
  return mood.charAt(0).toUpperCase() + mood.slice(1);
}

const formatScheduleTime = (date: Date) => format(date, 'h:mm a').toLowerCase();
const formatCompactScheduleTime = (date: Date) => format(date, 'h:mma').toLowerCase().replace(':00', '');
const formatScheduleLabel = (item: ScheduleItem) => {
  if (!item.hasTime || !item.time) {
    return 'Any time';
  }

  if (item.type === 'event' && item.endTime) {
    return `${formatScheduleTime(item.time)} - ${formatScheduleTime(item.endTime)}`;
  }

  return formatScheduleTime(item.time);
};

const sortTimedScheduleItems = (left: ScheduleItem, right: ScheduleItem) => {
  if (!left.time || !right.time) {
    return 0;
  }

  return left.time.getTime() - right.time.getTime();
};

const getScheduleItemEventSnoozeKey = (item: ScheduleItem) => {
  if (item.type !== 'event' || !item.completionSource || !item.completionKey || !item.occurrenceStart) {
    return '';
  }

  return buildHomeEventCompletionId(item.completionSource, item.completionKey, item.occurrenceStart);
};

const mergeHomeEventCompletionsIntoSnapshot = (
  snapshot: HomeSnapshot,
  completions: Pick<HomeEventCompletionModel, 'eventSource' | 'eventKey' | 'occurrenceStart'>[]
) => {
  if (completions.length === 0) {
    return snapshot;
  }

  const nextCompletedHomeEventIds = new Set(snapshot.completedHomeEventIds);
  let changed = false;
  buildCompletedHomeEventIds(completions).forEach((completionId) => {
    if (!nextCompletedHomeEventIds.has(completionId)) {
      nextCompletedHomeEventIds.add(completionId);
      changed = true;
    }
  });

  return changed
    ? { ...snapshot, completedHomeEventIds: nextCompletedHomeEventIds }
    : snapshot;
};

/** A freshly loaded local snapshot, keeping the Google events already fetched until Google answers again. */
function keepFetchedGoogleEvents(snapshot: HomeSnapshot, current: HomeSnapshot) {
  const existingGoogleEvents = current.upcomingEvents.filter(isFetchedGoogleHomeEvent);
  const existingSuggestionGoogleEvents = current.suggestionEvents.filter(isFetchedGoogleHomeEvent);
  if (existingGoogleEvents.length > 0 || existingSuggestionGoogleEvents.length > 0) {
    return mergeGoogleEventsIntoHomeSnapshot(snapshot, existingGoogleEvents, existingSuggestionGoogleEvents);
  }
  return snapshot;
}

export default function HomePage() {
  const { manageAccount, manageAccountSection, manageAccountNonce, settings, settingsNonce, settingsPanel, planDate, navNonce } = useLocalSearchParams<{
    /** Open the plan card on this day (yyyy-MM-dd) and scroll to it, e.g. from a saved chat plan. */
    planDate?: string;
    navNonce?: string;
    manageAccount?: string;
    manageAccountSection?: string;
    manageAccountNonce?: string;
    settings?: string;
    settingsNonce?: string;
    settingsPanel?: string;
  }>();
  const isFocused = useIsFocused();
  const { cancelGuidance, startGuidance } = useGuidance();
  const { isLeftHanded } = useLeftHandedMode();
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const [isHomeTutorialPending, setIsHomeTutorialPending] = useState(false);
  const isHomeTutorialPendingRef = useRef(false);
  const homeTutorialStageRef = useRef<HomeTutorialStage | null>(null);
  const showHomeTutorialStageRef = useRef<(stage: HomeTutorialStage) => void>(() => {});
  const {
    settings: homePersonalization,
    isLoaded: isHomePersonalizationLoaded,
  } = useHomePersonalization(user?.uid);
  useEffect(() => {
    if (isFocused) {
      setGuidanceActiveTab('home');
    }
  }, [isFocused]);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const homeScrollRef = useRef<ScrollView | null>(null);
  const homeTutorialCardYRef = useRef<Record<HomeTutorialStage, number>>({
    overview: 0,
    'next-step': 0,
    'todays-plan': 0,
  });
  const {
    accessToken,
    getAccessToken,
    googleConnectionState,
    isLoading: isTokenLoading,
  } = useTokens();
  const floatingTabBarInset = getFloatingTabBarInset(insets.bottom);
  const aiInputBottom = floatingTabBarInset - 6;
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const autoReplyMicNoticeRef = useRef<object | null>(null);
  const [aiInputHeight, setAiInputHeight] = useState(HOME_AI_INPUT_MIN_HEIGHT);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isAiInputFocused, setIsAiInputFocused] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isManageAccountVisible, setIsManageAccountVisible] = useState(false);
  const [isSheetTransitionCoverVisible, setIsSheetTransitionCoverVisible] = useState(false);
  const [returnToSettingsAfterManageAccount, setReturnToSettingsAfterManageAccount] = useState(false);
  const sheetTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetHandoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [todayHandledCanvasWidth, setTodayHandledCanvasWidth] = useState(0);
  const [selectedTodayHandledItem, setSelectedTodayHandledItem] = useState<ScheduleItem | null>(null);
  // The plan card can step through today and the next days; 0 is today.
  const [planDayOffset, setPlanDayOffset] = useState(0);
  /** The selected later day's items; null while they load. */
  const [otherDayPlanItems, setOtherDayPlanItems] = useState<ScheduleItem[] | null>(null);
  const handleHomeTutorialCardLayout = useCallback((stage: HomeTutorialStage) => (event: LayoutChangeEvent) => {
    homeTutorialCardYRef.current[stage] = event.nativeEvent.layout.y;
  }, []);
  const scrollHomeTutorialCardIntoView = useCallback((stage: HomeTutorialStage) => {
    const scroll = () => {
      homeScrollRef.current?.scrollTo({
        y: stage === 'overview'
          ? 0
          : Math.max(0, homeTutorialCardYRef.current[stage] - 4),
        animated: true,
      });
    };
    requestAnimationFrame(scroll);
    setTimeout(scroll, 180);
  }, []);
  const startWishlistTutorialGuidance = useCallback(() => {
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/chat',
        params: { chatAction: 'tutorial-open-chat' },
      },
      'Chat',
      {
        onSkipSegment: () => {
          const uid = user?.uid || '';
          if (!uid) return;
          void completeTutorialStep(uid, TUTORIAL_WISHLIST_SHOPPING_STEP).catch((error) => {
            console.warn('Failed to persist skipped wishlist tutorial completion', error);
          });
          startGuidance(
            {
              type: 'screen',
              route: '/(tabs)/home',
              params: { homeAction: 'tutorial-complete' },
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
        },
      }
    );
  }, [cancelGuidance, startGuidance, user?.uid]);
  const finishHomeTutorial = useCallback(async (closeGuidance: boolean) => {
    const uid = user?.uid || '';
    if (!uid) return;

    await completeTutorialStep(uid, TUTORIAL_HOME_OVERVIEW_STEP).catch((error) => {
      console.warn('Failed to persist home tutorial completion', error);
    });
    isHomeTutorialPendingRef.current = false;
    setIsHomeTutorialPending(false);
    homeTutorialStageRef.current = null;
    if (closeGuidance) {
      cancelGuidance();
    }
    startWishlistTutorialGuidance();
  }, [cancelGuidance, startWishlistTutorialGuidance, user?.uid]);
  const showHomeTutorialStage = useCallback((stage: HomeTutorialStage) => {
    homeTutorialStageRef.current = stage;
    scrollHomeTutorialCardIntoView(stage);
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/home',
        params: {
          homeAction: stage === 'overview'
            ? 'tutorial-overview'
            : stage === 'next-step'
            ? 'tutorial-next-step'
            : 'tutorial-todays-plan',
        },
      },
      stage === 'overview' ? 'Home' : stage === 'next-step' ? 'Next step' : "Today's plan",
      {
        onBack: stage === 'next-step'
          ? () => showHomeTutorialStageRef.current('overview')
          : stage === 'todays-plan'
            ? () => showHomeTutorialStageRef.current('next-step')
            : undefined,
        onSkipSegment: () => {
          void finishHomeTutorial(false);
        },
        onNext: stage === 'overview'
          ? () => showHomeTutorialStageRef.current('next-step')
          : stage === 'next-step'
            ? () => showHomeTutorialStageRef.current('todays-plan')
          : () => {
              void finishHomeTutorial(true);
            },
        restore: () => {
          showGuidanceTab('home');
          // Set first, so the start effect resumes here instead of at the overview.
          homeTutorialStageRef.current = stage;
          if (!isHomeTutorialPendingRef.current) {
            // Back from the Chat part: the Home part is in progress again.
            isHomeTutorialPendingRef.current = true;
            setIsHomeTutorialPending(true);
            const uid = user?.uid || '';
            if (uid) void uncompleteTutorialStep(uid, TUTORIAL_HOME_OVERVIEW_STEP);
          }
          showHomeTutorialStageRef.current(stage);
        },
      }
    );
  }, [finishHomeTutorial, scrollHomeTutorialCardIntoView, startGuidance, user?.uid]);
  showHomeTutorialStageRef.current = showHomeTutorialStage;

  useEffect(() => {
    let isActive = true;

    const refreshTutorial = async () => {
      const uid = user?.uid || '';
      if (!uid) {
        if (isActive) {
          isHomeTutorialPendingRef.current = false;
          setIsHomeTutorialPending(false);
          homeTutorialStageRef.current = null;
        }
        return;
      }

      const progress = await getTutorialProgress(uid).catch(() => null);
      const pending = isTutorialSessionActive(uid) &&
        !!progress?.hasStarted &&
        progress.completedSteps.includes(TUTORIAL_CALENDAR_EVENT_STEP) &&
        !progress.completedSteps.includes(TUTORIAL_HOME_OVERVIEW_STEP);

      if (isActive) {
        isHomeTutorialPendingRef.current = pending;
        setIsHomeTutorialPending(pending);
        if (!pending) {
          homeTutorialStageRef.current = null;
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
  }, [user?.uid]);

  useEffect(() => {
    if (!isFocused) {
      // Left Home mid-way (e.g. tutorial back to the calendar): start again from the
      // overview when the user comes back.
      homeTutorialStageRef.current = null;
      return;
    }
    if (!isHomeTutorialPending || homeTutorialStageRef.current) {
      return;
    }

    showHomeTutorialStage('overview');
  }, [isFocused, isHomeTutorialPending, showHomeTutorialStage]);

  const homeDayYear = currentTime.getFullYear();
  const homeDayMonth = currentTime.getMonth();
  const homeDayDate = currentTime.getDate();
  const homeDayKey = `${homeDayYear}-${homeDayMonth}-${homeDayDate}`;
  const homeDayRange = useMemo(() => {
    const start = new Date(homeDayYear, homeDayMonth, homeDayDate);
    const end = endOfDay(start);
    const endExclusive = new Date(homeDayYear, homeDayMonth, homeDayDate + 1);
    return { start, end, endExclusive };
  }, [homeDayDate, homeDayMonth, homeDayYear]);
  const homeSuggestionRange = useMemo(() => ({
    start: homeDayRange.start,
    endExclusive: new Date(homeDayYear, homeDayMonth, homeDayDate + 2),
  }), [homeDayDate, homeDayMonth, homeDayRange.start, homeDayYear]);
  const todayHandledScrollOffset = useSharedValue(0);
  const isAiComposerActive = isKeyboardVisible || isAiInputFocused;
  const shouldRenderHomeCanvases = isFocused && !isSettingsVisible && !isManageAccountVisible;
  // The Droplet stays mounted once shown and only pauses on other tabs: rebuilding its 3D
  // scene on every return made coming back to Home stutter. It still unmounts under the
  // Settings and Manage Account sheets, which sit over it.
  const [hasShownHomeBlob, setHasShownHomeBlob] = useState(false);
  useEffect(() => {
    if (shouldRenderHomeCanvases) setHasShownHomeBlob(true);
  }, [shouldRenderHomeCanvases]);
  const shouldMountHomeBlob = (hasShownHomeBlob || shouldRenderHomeCanvases) && !isSettingsVisible && !isManageAccountVisible;
  const aiInputKeyboardBottom = Platform.OS === 'android' && isAiComposerActive ? ANDROID_HOME_KEYBOARD_GAP : aiInputBottom;
  const todayCardHeaderHeight = 50;
  const todayHandledRowHeight = 34;
  const todayHandledScrollHandler = useAnimatedScrollHandler((event) => {
    todayHandledScrollOffset.value = event.contentOffset.y;
  });
  const todayHandledParagraphTransform = useDerivedValue(() => [{ translateY: -todayHandledScrollOffset.value }]);
  const homeSwipeBandHeight = floatingTabBarInset + aiInputHeight;
  const homeContentBottomPadding = floatingTabBarInset + aiInputHeight + 112;
  const isHomeSwipeDisabled = isAiComposerActive || isSettingsVisible || isManageAccountVisible || !!selectedTodayHandledItem;

  const [homeSnapshot, setHomeSnapshot] = useState<HomeSnapshot>(() => createEmptyHomeSnapshot());
  const [isInitialHomeLoading, setIsInitialHomeLoading] = useState(true);
  const [optimisticallyHiddenItemIds, setOptimisticallyHiddenItemIds] = useState<Set<string>>(() => new Set());
  const [persistentlyHiddenItemIds, setPersistentlyHiddenItemIds] = useState<Set<string>>(() => new Set());
  const [snoozedNextStepTodoIds, setSnoozedNextStepTodoIds] = useState<Set<string>>(() => new Set());
  const [snoozedHomeEventIds, setSnoozedHomeEventIds] = useState<Set<string>>(() => new Set());
  const [completingItemIds, setCompletingItemIds] = useState<Set<string>>(() => new Set());
  const completingItemIdsRef = useRef(new Set<string>());
  const [isRefreshingNextStepEmpty, setIsRefreshingNextStepEmpty] = useState(false);
  const [homeSuggestions, setHomeSuggestions] = useState<HomeSuggestion[]>([]);
  const [homeCalendarLoadState, setHomeCalendarLoadState] = useState({
    dayKey: '',
    ready: false,
  });
  const homeSuggestionsRequestIdRef = useRef(0);
  const homeSuggestionsResolvedRequestIdRef = useRef(0);
  const homeSuggestionsFingerprintRef = useRef('');
  const homeSuggestionsCompletedFingerprintRef = useRef('');
  const homeSuggestionsConsentDeclinedFingerprintRef = useRef('');
  const homeSuggestionsCacheScopeRef = useRef('');
  const homeSuggestionsRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeSuggestionsRetryAttemptRef = useRef(0);
  const homeSuggestionsRetryFingerprintRef = useRef('');
  const [homeSuggestionsRetryNonce, setHomeSuggestionsRetryNonce] = useState(0);
  const itemAnimationsRef = useRef<Record<string, {
    fade: Animated.Value;
    translateX: Animated.Value;
    scale: Animated.Value;
  }>>({});
  const nextStepContentOpacity = useRef(new Animated.Value(1)).current;
  const nextStepEmptyOpacity = useRef(new Animated.Value(1)).current;
  const compactMutationRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const upcomingEvents = homeSnapshot.upcomingEvents;
  const suggestionEvents = homeSnapshot.suggestionEvents;
  const upcomingTodos = homeSnapshot.upcomingTodos;
  const completedHomeEventIds = homeSnapshot.completedHomeEventIds;
  const suggestionCandidates = homeSnapshot.suggestionCandidates;
  const [completedTasksToday, setCompletedTasksToday] = useState(0);
  const [homeBlobActivityEvents, setHomeBlobActivityEvents] = useState<BlobActivityEvent[]>([]);
  const [activeFaceMoods, setActiveFaceMoods] = useState<MoodState[]>(['happy', 'mouth_1']);
  const [selectedBlobScenario, setSelectedBlobScenario] = useState('calmBalanced');
  const [blobMeaningSource, setBlobMeaningSource] = useState<'scenario' | 'live'>('live');
  const [blobBreathingOn, setBlobBreathingOn] = useState(true);
  const [showThrone, setShowThrone] = useState(false);
  const [showBlobDebugPanel, setShowBlobDebugPanel] = useState(false);
  const [blobAppearancePresetId, setBlobAppearancePresetId] = useState<BlobAppearancePresetId>('liquidGold');
  const lifeGraph = useLifeGraph(user?.uid);
  const [isLifeGraphSettingsOpen, setIsLifeGraphSettingsOpen] = useState(false);
  const scenarioMeaningState = BLOB_SCENARIOS[selectedBlobScenario] ?? BLOB_SCENARIOS.calmBalanced;
  const blobTasksForMetrics = useMemo((): BlobTask[] => (
    upcomingTodos.map(todo => ({
      id: todo.id,
      dueAt: todo.dueDate ?? null,
      completedAt: todo.completed ? todo.updatedAt : null,
      isCompleted: todo.completed,
    }))
  ), [upcomingTodos]);
  const blobCalendarEvents = useMemo((): BlobCalendarEvent[] => (
    upcomingEvents.map(event => ({
      id: event.id,
      startAt: event.startDate,
      endAt: event.endDate ?? null,
    }))
  ), [upcomingEvents]);
  const behaviorMetrics = useMemo(() => computeBehaviorMetrics({
    tasks: blobTasksForMetrics,
    calendarEvents: blobCalendarEvents,
    emailSummary: { unreadNow: 0, unread24hAgo: 0 },
    activityLog: {
      events: homeBlobActivityEvents,
      averageDailyTaskCompletions: HEART_TASK_THRESHOLD,
    },
  }), [blobCalendarEvents, blobTasksForMetrics, homeBlobActivityEvents]);
  const liveMeaningState = useMemo(
    () => blobMeaningFromBehaviorMetrics(behaviorMetrics),
    [behaviorMetrics]
  );
  const effectiveBlobMeaningState =
    blobMeaningSource === 'live' ? liveMeaningState : scenarioMeaningState;
  const blobVisualMeaning = useMemo(
    () => computeBlobVisualMeaning(effectiveBlobMeaningState),
    [effectiveBlobMeaningState]
  );
  const blobPressureSummary = useMemo(() => {
    if (blobMeaningSource === 'live') {
      return `load: ${behaviorMetrics.dueSoon.toFixed(2)}  overdue: ${behaviorMetrics.overdue.toFixed(2)}  completions: ${behaviorMetrics.completedToday.toFixed(2)}`;
    }

    const areas = effectiveBlobMeaningState.areas;
    const entries = (['health', 'relationships', 'work', 'home', 'growth'] as const)
      .map(key => [key, areas[key]] as const);
    const max = entries.reduce((best, current) => (current[1] > best[1] ? current : best), entries[0]);
    const label = max[0].charAt(0).toUpperCase() + max[0].slice(1);
    return `scenario pressure: ${label}`;
  }, [behaviorMetrics, blobMeaningSource, effectiveBlobMeaningState]);
  const recordHomeBlobTaskCompletion = useCallback((count = 1) => {
    const completionCount = Math.floor(count);
    if (!Number.isFinite(completionCount) || completionCount <= 0) return;
    const at = new Date();
    const events: BlobActivityEvent[] = Array.from({ length: completionCount }, () => ({
      type: 'task_completed',
      at,
    }));
    setCompletedTasksToday(value => value + completionCount);
    setHomeBlobActivityEvents(currentEvents => [...currentEvents, ...events]);
  }, []);
  const rollbackHomeBlobTaskCompletion = useCallback((count = 1) => {
    const completionCount = Math.floor(count);
    if (!Number.isFinite(completionCount) || completionCount <= 0) return;
    setCompletedTasksToday(value => Math.max(0, value - completionCount));
    setHomeBlobActivityEvents(currentEvents =>
      currentEvents.slice(0, Math.max(0, currentEvents.length - completionCount))
    );
  }, []);
  const clearHomeSuggestionsRetry = useCallback(() => {
    if (homeSuggestionsRetryTimerRef.current) {
      clearTimeout(homeSuggestionsRetryTimerRef.current);
      homeSuggestionsRetryTimerRef.current = null;
    }
    homeSuggestionsRetryAttemptRef.current = 0;
  }, []);
  const {
    inputValue,
    setInputValue,
    submit,
    submitVoiceText,
    wasLastRequestSpoken,
    isRunning: isAiRunning,
    notice,
    dismissNotice,
    confirmPendingAction,
    cancelPending,
    stopRequest: stopAiRequest,
    getHandoffChatParams,
  } = useCompactTabAI('home', {
    onMutationSuccess: async (info) => {
      if (info.name === 'todo_complete_many') {
        recordHomeBlobTaskCompletion(Number(info.result?.completed || 0));
      }
      await compactMutationRefreshRef.current?.();
    },
  });
  useCompactGuidanceBridge(notice, dismissNotice);

  const handleCompactNoticeAction = useCallback(() => {
    if (notice?.kind === 'confirm') {
      void confirmPendingAction();
      return;
    }

    const target = notice?.target as CompactAiNoticeTarget | undefined;
    if (target) {
      dismissNotice();
      const shortcut = getShortcutForGuidanceTarget(target as GuidanceTarget);
      router.push({ pathname: shortcut.pathname as any, params: shortcut.params });
      return;
    }

    router.push({ pathname: '/(tabs)/chat', params: getHandoffChatParams() || {} });
  }, [confirmPendingAction, dismissNotice, getHandoffChatParams, notice]);

  const glowAnim = useRef(new Animated.Value(0)).current;
  const {
    isListening,
    handleMicrophonePress,
    cancelListening,
  } = useCompactVoiceInput({
    inputValue,
    setInputValue,
    glowAnim,
    onFinalTranscript: submitVoiceText,
  });

  const handleHomeAiSendPress = useCallback(() => {
    if (isAiRunning || !inputValue.trim()) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void submit();
  }, [inputValue, isAiRunning, submit]);

  const handleHomeAiMicrophonePress = useCallback(() => {
    if (isAiRunning) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    handleMicrophonePress();
  }, [handleMicrophonePress, isAiRunning]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const updateCurrentTime = () => setCurrentTime(new Date());
    const msUntilNextMinute = 60000 - (Date.now() % 60000);

    updateCurrentTime();

    const timeoutId = setTimeout(() => {
      updateCurrentTime();
      intervalId = setInterval(updateCurrentTime, 60000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => () => {
    clearHomeSuggestionsRetry();
  }, [clearHomeSuggestionsRetry]);

  useEffect(() => subscribeAiDataSharingConsentAccepted((acceptedUserId) => {
    if (!user?.uid || acceptedUserId !== user.uid) {
      return;
    }
    const declinedFingerprint = homeSuggestionsConsentDeclinedFingerprintRef.current;
    if (!declinedFingerprint) {
      return;
    }

    homeSuggestionsConsentDeclinedFingerprintRef.current = '';
    if (homeSuggestionsFingerprintRef.current === declinedFingerprint) {
      homeSuggestionsFingerprintRef.current = '';
    }
    if (homeSuggestionsCompletedFingerprintRef.current === declinedFingerprint) {
      homeSuggestionsCompletedFingerprintRef.current = '';
    }
    clearHomeSuggestionsRetry();
    setHomeSuggestionsRetryNonce((current) => current + 1);
  }), [clearHomeSuggestionsRetry, user?.uid]);

  useEffect(() => {
    const replyNotice =
      notice?.kind === 'clarify' || notice?.kind === 'confirm' ? notice : null;

    if (!replyNotice || isAiRunning) {
      const shouldCancelReplyMic = autoReplyMicNoticeRef.current !== null;
      autoReplyMicNoticeRef.current = null;
      if (shouldCancelReplyMic && isListening) {
        void cancelListening();
      }
      return;
    }

    // A typed request gets its follow-up question without the mic switching on.
    if (autoReplyMicNoticeRef.current === replyNotice || isListening || !wasLastRequestSpoken()) {
      return;
    }

    autoReplyMicNoticeRef.current = replyNotice;
    handleMicrophonePress();
  }, [cancelListening, handleMicrophonePress, isAiRunning, isListening, notice, wasLastRequestSpoken]);

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (event: any) => {
      setIsKeyboardVisible(true);
      const keyboardHeight = event?.endCoordinates?.height || 0;
      const androidKeyboardTop = event?.endCoordinates?.screenY;
      const androidWindowHeight = Dimensions.get('window').height;
      const androidCalculatedOverlap =
        Platform.OS === 'android' && typeof androidKeyboardTop === 'number'
          ? Math.max(0, androidWindowHeight - androidKeyboardTop)
          : keyboardHeight;
      const keyboardOverlap =
        Platform.OS === 'android' && keyboardHeight > 0
          ? Math.min(androidCalculatedOverlap, keyboardHeight)
          : androidCalculatedOverlap;
      const nextOffset =
        Platform.OS === 'android'
          ? keyboardOverlap
          : Math.max(0, keyboardHeight - aiInputBottom);
      Animated.timing(keyboardOffset, {
        toValue: nextOffset,
        duration: Platform.OS === 'ios' ? (event?.duration || 250) : 250,
        useNativeDriver: true,
      }).start();
    };
    const onHide = (event: any) => {
      setIsKeyboardVisible(false);
      setIsAiInputFocused(false);
      inputRef.current?.blur();
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (event?.duration || 250) : 250,
        useNativeDriver: true,
      }).start();
    };
    const subShow = Keyboard.addListener(show, onShow);
    const subHide = Keyboard.addListener(hide, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [aiInputBottom, keyboardOffset]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'android') return;

    const parent = navigation.getParent();
    if (!parent) return;

    parent.setOptions({
      tabBarStyle: {
        position: 'absolute',
        left: 28,
        right: 28,
        bottom: Platform.OS === 'android' ? 10 : 8,
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
          bottom: Platform.OS === 'android' ? 10 : 8,
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

  const getItemAnimationValues = useCallback((itemId: string) => {
    if (!itemAnimationsRef.current[itemId]) {
      itemAnimationsRef.current[itemId] = {
        fade: new Animated.Value(1),
        translateX: new Animated.Value(0),
        scale: new Animated.Value(1),
      };
    }

    return itemAnimationsRef.current[itemId];
  }, []);

  const fetchGoogleCalendarEvents = useCallback(async (start: Date, end: Date): Promise<GoogleEvent[]> => {
    const resolvedAccessToken = accessToken ?? await getAccessToken();
    if (!resolvedAccessToken) {
      throw new Error('Google Calendar access token unavailable');
    }

    const timeMin = format(start, "yyyy-MM-dd'T'HH:mm:ssxxx");
    const timeMax = format(end, "yyyy-MM-dd'T'HH:mm:ssxxx");

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
      {
        headers: {
          Authorization: `Bearer ${resolvedAccessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Google Calendar request failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    return (data.items ?? []).map((item: any) => ({
      id: item.id,
      title: item.summary || 'Untitled event',
      startDate: parseCalendarDateValue(item.start.dateTime || item.start.date) || new Date(),
      endDate: parseCalendarDateValue(item.end.dateTime || item.end.date) || new Date(),
      isGoogleEvent: true,
      isAllDay: !!(item.start?.date && !item.start?.dateTime),
      source: 'google',
    }));
  }, [accessToken, getAccessToken]);

  const fetchHomeEventCompletionsForEvents = useCallback(async (
    events: (EventModel | GoogleEvent)[]
  ) => {
    const occurrenceStartTimes = getHomeEventCompletionOccurrenceStartTimes(events);

    if (occurrenceStartTimes.length === 0) {
      return [] as HomeEventCompletionModel[];
    }

    const completions = await database
      .get<HomeEventCompletionModel>('home_event_completions')
      .query(Q.where('occurrence_start', Q.oneOf(occurrenceStartTimes)))
      .fetch();

    return filterHomeEventCompletionsForEvents(completions, events);
  }, []);

  const loadLocalHomeSnapshot = useCallback(async () => {
    await refreshGoalGuidancePlansForToday();
    await extendEventSeries(homeSuggestionRange.endExclusive).catch(() => {});

    const [localEvents, suggestionLocalEvents, todos, goalGuidancePlans, goalTodos, taskGuides, skillGuides] = await Promise.all([
      database.collections
        .get<EventModel>('events')
        .query(
          Q.where('start_date', Q.lt(homeDayRange.endExclusive.getTime())),
          Q.where('end_date', Q.gt(homeDayRange.start.getTime()))
        )
        .fetch(),
      database.collections
        .get<EventModel>('events')
        .query(
          Q.where('start_date', Q.lt(homeSuggestionRange.endExclusive.getTime())),
          Q.where('end_date', Q.gt(homeSuggestionRange.start.getTime()))
        )
        .fetch(),
      database
        .get<TodoModel>('todos')
        .query(Q.where('completed', false))
        .fetch(),
      database.collections
        .get<GoalGuidancePlanModel>('goal_guidance_plans')
        .query()
        .fetch(),
      database
        .get<TodoModel>('todos')
        .query(Q.where('workspace', 'Goals'))
        .fetch(),
      database.collections
        .get<TaskGuideModel>('task_guides')
        .query()
        .fetch(),
      database.collections
        .get<SkillGuideModel>('skill_guides')
        .query()
        .fetch(),
    ]);
    const completions = await fetchHomeEventCompletionsForEvents(suggestionLocalEvents);
    const rootGoalIds = new Set(
      goalTodos.map((todo) => todo.id)
    );
    const hiddenGoalStepTodoIds = getHiddenHomeGoalGuidanceTodoIds(goalGuidancePlans, rootGoalIds);

    return buildLocalHomeSnapshot({
      events: localEvents,
      suggestionEvents: suggestionLocalEvents,
      todos,
      completions,
      excludedTodoIds: hiddenGoalStepTodoIds,
      suggestionCandidates: buildHomeSuggestionCandidates({
        todos,
        goalGuidancePlans,
        taskGuides,
        skillGuides,
        todayStart: homeDayRange.start,
        excludedTodoIds: hiddenGoalStepTodoIds,
      }),
    });
  }, [
    fetchHomeEventCompletionsForEvents,
    homeDayRange.endExclusive,
    homeDayRange.start,
    homeSuggestionRange.endExclusive,
    homeSuggestionRange.start,
  ]);

  const reloadLocalData = useCallback(async () => {
    const snapshot = await loadLocalHomeSnapshot();
    setHomeSnapshot((current) => keepFetchedGoogleEvents(snapshot, current));
  }, [loadLocalHomeSnapshot]);

  compactMutationRefreshRef.current = reloadLocalData;

  useEffect(() => {
    // Coming back to Home refreshes in the background: what is on screen stays (the
    // Google events already fetched, Suggestions for the same day) until fresh data
    // arrives, so the cards don't reshuffle on every visit.
    if (!isFocused) {
      return;
    }

    let cancelled = false;
    setHomeCalendarLoadState((current) =>
      current.dayKey === homeDayKey ? current : { dayKey: homeDayKey, ready: false });

    (async () => {
      const snapshot = await loadLocalHomeSnapshot();
      if (cancelled) return;
      setHomeSnapshot((current) => keepFetchedGoogleEvents(snapshot, current));
      setIsInitialHomeLoading(false);

      if (isAuthLoading || isTokenLoading) return;

      if (isHomeCalendarReadyForSuggestions(googleConnectionState, false)) {
        setHomeCalendarLoadState({ dayKey: homeDayKey, ready: true });
        return;
      }

      try {
        const googleEvents = await fetchGoogleCalendarEvents(
          homeSuggestionRange.start,
          homeSuggestionRange.endExclusive
        );
        const displayGoogleEvents = googleEvents.filter(
          (event) =>
            event.startDate.getTime() < homeDayRange.endExclusive.getTime() &&
            event.endDate.getTime() > homeDayRange.start.getTime()
        );
        const googleCompletions = await fetchHomeEventCompletionsForEvents(googleEvents);
        if (cancelled) return;
        setHomeSnapshot((current) =>
          mergeHomeEventCompletionsIntoSnapshot(
            mergeGoogleEventsIntoHomeSnapshot(current, displayGoogleEvents, googleEvents),
            googleCompletions
          )
        );
        setHomeCalendarLoadState({
          dayKey: homeDayKey,
          ready: isHomeCalendarReadyForSuggestions(googleConnectionState, true),
        });
      } catch {
      }
    })();

    return () => { cancelled = true; };
  }, [
    fetchGoogleCalendarEvents,
    fetchHomeEventCompletionsForEvents,
    googleConnectionState,
    homeDayKey,
    homeDayRange.endExclusive,
    homeDayRange.start,
    homeSuggestionRange.endExclusive,
    homeSuggestionRange.start,
    isAuthLoading,
    isFocused,
    isTokenLoading,
    loadLocalHomeSnapshot,
  ]);

  useEffect(() => {
    setOptimisticallyHiddenItemIds(new Set());
    setSnoozedNextStepTodoIds(new Set());
    setSnoozedHomeEventIds(new Set());
    setCompletingItemIds(new Set());
    setCompletedTasksToday(0);
    setHomeBlobActivityEvents([]);
    completingItemIdsRef.current.clear();
    nextStepContentOpacity.setValue(1);
    itemAnimationsRef.current = {};
  }, [homeDayKey, nextStepContentOpacity]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const storedHiddenItemIds = await AsyncStorage.getItem(HIDDEN_HOME_ITEM_IDS_STORAGE_KEY);
        const parsedHiddenItemIds = storedHiddenItemIds ? JSON.parse(storedHiddenItemIds) : [];

        if (!cancelled && Array.isArray(parsedHiddenItemIds)) {
          const loadedHiddenItemIds = parsedHiddenItemIds.filter(
            (itemId): itemId is string => typeof itemId === 'string'
          );
          setPersistentlyHiddenItemIds((currentIds) => new Set([...currentIds, ...loadedHiddenItemIds]));
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [storedSnoozedTodoIds, storedSnoozedEventItemIds] = await Promise.all([
          AsyncStorage.getItem(NEXT_STEP_SNOOZED_TODO_IDS_STORAGE_KEY),
          AsyncStorage.getItem(SNOOZED_HOME_EVENT_IDS_STORAGE_KEY),
        ]);
        const parsedSnoozedTodoIds = storedSnoozedTodoIds ? JSON.parse(storedSnoozedTodoIds) : null;
        const parsedSnoozedEventItemIds = storedSnoozedEventItemIds ? JSON.parse(storedSnoozedEventItemIds) : null;
        const storedTodoDayKey = typeof parsedSnoozedTodoIds?.dayKey === 'string'
          ? parsedSnoozedTodoIds.dayKey
          : '';
        const storedTodoIds = Array.isArray(parsedSnoozedTodoIds?.todoIds)
          ? parsedSnoozedTodoIds.todoIds.filter((todoId: unknown): todoId is string => typeof todoId === 'string')
          : [];
        const storedEventDayKey = typeof parsedSnoozedEventItemIds?.dayKey === 'string'
          ? parsedSnoozedEventItemIds.dayKey
          : '';
        const storedEventIds = Array.isArray(parsedSnoozedEventItemIds?.eventIds)
          ? parsedSnoozedEventItemIds.eventIds.filter((eventId: unknown): eventId is string => typeof eventId === 'string')
          : [];

        if (cancelled) {
          return;
        }

        if (storedTodoDayKey === homeDayKey) {
          setSnoozedNextStepTodoIds((currentIds) => new Set([...storedTodoIds, ...currentIds]));
        }

        if (storedEventDayKey === homeDayKey) {
          setSnoozedHomeEventIds((currentIds) => new Set([...storedEventIds, ...currentIds]));
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [homeDayKey, isFocused]);

  const hiddenHomeItemIds = useMemo(() => {
    if (persistentlyHiddenItemIds.size === 0) {
      return optimisticallyHiddenItemIds;
    }

    return new Set([...optimisticallyHiddenItemIds, ...persistentlyHiddenItemIds]);
  }, [optimisticallyHiddenItemIds, persistentlyHiddenItemIds]);

  const hideItemFromHome = useCallback((itemId: string) => {
    setOptimisticallyHiddenItemIds((currentIds) => {
      if (currentIds.has(itemId)) {
        return currentIds;
      }

      const nextIds = new Set(currentIds);
      nextIds.add(itemId);
      return nextIds;
    });
  }, []);

  const hideItemFromHomePermanently = useCallback((itemId: string) => {
    setPersistentlyHiddenItemIds((currentIds) => {
      if (currentIds.has(itemId)) {
        return currentIds;
      }

      const nextIds = new Set(currentIds);
      nextIds.add(itemId);
      void AsyncStorage.setItem(HIDDEN_HOME_ITEM_IDS_STORAGE_KEY, JSON.stringify([...nextIds]));
      return nextIds;
    });
  }, []);

  const restoreItemInHome = useCallback((itemId: string) => {
    const animationValues = getItemAnimationValues(itemId);
    animationValues.fade.setValue(1);
    animationValues.translateX.setValue(0);
    animationValues.scale.setValue(1);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOptimisticallyHiddenItemIds((currentIds) => {
      if (!currentIds.has(itemId)) {
        return currentIds;
      }

      const nextIds = new Set(currentIds);
      nextIds.delete(itemId);
      return nextIds;
    });
  }, [getItemAnimationValues]);

  const completeHomeItem = useCallback(async (
    item: ScheduleItem,
    persistCompletion: () => Promise<void>,
    options?: {
      applyOptimisticChanges?: () => void;
      rollbackOptimisticChanges?: () => void;
    }
  ) => {
    if (
      optimisticallyHiddenItemIds.has(item.id) ||
      persistentlyHiddenItemIds.has(item.id) ||
      completingItemIds.has(item.id) ||
      completingItemIdsRef.current.has(item.id)
    ) {
      return;
    }

    const animationValues = getItemAnimationValues(item.id);
    completingItemIdsRef.current.add(item.id);
    setCompletingItemIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(item.id);
      return nextIds;
    });

    nextStepContentOpacity.setValue(0.55);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    hideItemFromHome(item.id);
    options?.applyOptimisticChanges?.();
    Animated.timing(nextStepContentOpacity, {
      toValue: 1,
      duration: HOME_ITEM_FADE_OUT_MS,
      useNativeDriver: true,
    }).start();

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    try {
      await persistCompletion();
      completingItemIdsRef.current.delete(item.id);
      setCompletingItemIds((currentIds) => {
        if (!currentIds.has(item.id)) {
          return currentIds;
        }

        const nextIds = new Set(currentIds);
        nextIds.delete(item.id);
        return nextIds;
      });
      void reloadLocalData();
    } catch (error) {
      options?.rollbackOptimisticChanges?.();
      completingItemIdsRef.current.delete(item.id);
      nextStepContentOpacity.setValue(1);
      restoreItemInHome(item.id);
      animationValues.fade.setValue(1);
      animationValues.translateX.setValue(0);
      animationValues.scale.setValue(1);
      setCompletingItemIds((currentIds) => {
        if (!currentIds.has(item.id)) {
          return currentIds;
        }

        const nextIds = new Set(currentIds);
        nextIds.delete(item.id);
        return nextIds;
      });
      void reloadLocalData();
      console.error(`Error completing ${item.type} from home:`, error);
    }
  }, [
    completingItemIds,
    getItemAnimationValues,
    hideItemFromHome,
    nextStepContentOpacity,
    optimisticallyHiddenItemIds,
    persistentlyHiddenItemIds,
    reloadLocalData,
    restoreItemInHome,
  ]);

  const handleCompleteTodo = useCallback(async (item: ScheduleItem) => {
    const todoToRestore = upcomingTodos.find((todo) => todo.id === item.sourceId);

    await completeHomeItem(
      item,
      async () => {
        const nestedPlan = await fetchGoalGuidancePlanForGoal(item.sourceId);
        if (nestedPlan && nestedPlan.steps.length > 0 && nestedPlan.status === 'accepted') {
          await saveGoalGuidanceStepProgress(
            nestedPlan.id,
            nestedPlan.steps.map((_, index) => index)
          );
        }
        await updateTodo(item.sourceId, { completed: true }, { syncReminder: true });
        try {
          const result = await advanceGoalGuidanceForCompletedTodo(item.sourceId);
          if (result?.status === 'complete') {
            await updateTodo(result.plan.goalId, { completed: true }, { syncReminder: true });
          }
        } catch {}
      },
      {
        applyOptimisticChanges: () => {
          recordHomeBlobTaskCompletion();
          setHomeSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            upcomingTodos: currentSnapshot.upcomingTodos.filter((todo) => todo.id !== item.sourceId),
          }));
        },
        rollbackOptimisticChanges: () => {
          rollbackHomeBlobTaskCompletion();
          if (todoToRestore) {
            setHomeSnapshot((currentSnapshot) => {
              if (currentSnapshot.upcomingTodos.some((todo) => todo.id === todoToRestore.id)) {
                return currentSnapshot;
              }

              return {
                ...currentSnapshot,
                upcomingTodos: [...currentSnapshot.upcomingTodos, todoToRestore].sort(sortTodosByDueDate),
              };
            });
          }
        },
      }
    );
  }, [completeHomeItem, recordHomeBlobTaskCompletion, rollbackHomeBlobTaskCompletion, upcomingTodos]);

  const handleCompleteEvent = useCallback(async (item: ScheduleItem) => {
    if (!item.completionSource || !item.completionKey || !item.occurrenceStart) {
      return;
    }

    const completionSource = item.completionSource;
    const completionKey = item.completionKey;
    const occurrenceStart = item.occurrenceStart;
    const completionId = buildHomeEventCompletionId(
      completionSource,
      completionKey,
      occurrenceStart
    );

    await completeHomeItem(
      item,
      async () => {
        const existingRows = await database
          .get<HomeEventCompletionModel>('home_event_completions')
          .query(
            Q.where('event_source', completionSource),
            Q.where('event_key', completionKey),
            Q.where('occurrence_start', occurrenceStart.getTime())
          )
          .fetch();

        if (existingRows.length > 0) {
          return;
        }

        await database.write(async () => {
          await database.get<HomeEventCompletionModel>('home_event_completions').create((completion) => {
            completion.eventSource = completionSource;
            completion.eventKey = completionKey;
            completion.occurrenceStart = occurrenceStart;
            completion.completedAt = new Date();
          });
        });
      },
      {
        applyOptimisticChanges: () => {
          setHomeSnapshot((currentSnapshot) => {
            if (currentSnapshot.completedHomeEventIds.has(completionId)) {
              return currentSnapshot;
            }

            const nextIds = new Set(currentSnapshot.completedHomeEventIds);
            nextIds.add(completionId);
            return {
              ...currentSnapshot,
              completedHomeEventIds: nextIds,
            };
          });
        },
        rollbackOptimisticChanges: () => {
          setHomeSnapshot((currentSnapshot) => {
            if (!currentSnapshot.completedHomeEventIds.has(completionId)) {
              return currentSnapshot;
            }

            const nextIds = new Set(currentSnapshot.completedHomeEventIds);
            nextIds.delete(completionId);
            return {
              ...currentSnapshot,
              completedHomeEventIds: nextIds,
            };
          });
        },
      }
    );
  }, [completeHomeItem]);

  const handleSnoozeNextStepItem = useCallback((item: ScheduleItem) => {
    const eventSnoozeKey = getScheduleItemEventSnoozeKey(item);

    if (
      (item.type === 'todo' && snoozedNextStepTodoIds.has(item.sourceId)) ||
      (item.type === 'event' && (!eventSnoozeKey || snoozedHomeEventIds.has(eventSnoozeKey)))
    ) {
      return;
    }

    nextStepContentOpacity.setValue(0.55);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    if (item.type === 'todo') {
      const todoId = item.sourceId;
      setSnoozedNextStepTodoIds((currentIds) => {
        if (currentIds.has(todoId)) {
          return currentIds;
        }

        const nextIds = new Set(currentIds);
        nextIds.add(todoId);
        void AsyncStorage.setItem(
          NEXT_STEP_SNOOZED_TODO_IDS_STORAGE_KEY,
          JSON.stringify({ dayKey: homeDayKey, todoIds: [...nextIds] })
        );
        return nextIds;
      });
    } else {
      setSnoozedHomeEventIds((currentIds) => {
        if (currentIds.has(eventSnoozeKey)) {
          return currentIds;
        }

        const nextIds = new Set(currentIds);
        nextIds.add(eventSnoozeKey);
        void AsyncStorage.setItem(
          SNOOZED_HOME_EVENT_IDS_STORAGE_KEY,
          JSON.stringify({ dayKey: homeDayKey, eventIds: [...nextIds] })
        );
        return nextIds;
      });
    }

    Animated.timing(nextStepContentOpacity, {
      toValue: 1,
      duration: HOME_ITEM_FADE_OUT_MS,
      useNativeDriver: true,
    }).start();
  }, [homeDayKey, nextStepContentOpacity, snoozedHomeEventIds, snoozedNextStepTodoIds]);

  const visibleUpcomingTodos = useMemo(
    () => upcomingTodos.filter((todo) => !hiddenHomeItemIds.has(`todo-${todo.id}`)),
    [hiddenHomeItemIds, upcomingTodos]
  );

  const suggestionBusyRanges = useMemo<HomeSuggestionBusyRange[]>(() => {
    const horizonStart = currentTime.getTime();
    const horizonEnd = homeSuggestionRange.endExclusive.getTime();
    const eventRanges = suggestionEvents
      .filter((event) => {
        if ((event as GoogleEvent).isAllDay) {
          return false;
        }
        if (event.endDate.getTime() <= horizonStart || event.startDate.getTime() >= horizonEnd) {
          return false;
        }
        const { eventSource, eventKey } = getHomeEventCompletionIdentity(event);
        return !completedHomeEventIds.has(
          buildHomeEventCompletionId(eventSource, eventKey, event.startDate)
        );
      })
      .map((event) => ({ start: event.startDate, end: event.endDate }));
    const todoRanges = upcomingTodos.flatMap((todo) => {
      if (!todo.dueDate || !getTodoHasDueTime(todo.dueDate, todo.hasDueTime)) {
        return [];
      }

      const start = todo.dueDate;
      const end = new Date(start.getTime() + (todo.plannedDurationMinutes || 45) * 60_000);
      return end.getTime() > horizonStart && start.getTime() < horizonEnd
        ? [{ start, end }]
        : [];
    });

    return [...eventRanges, ...todoRanges];
  }, [completedHomeEventIds, currentTime, homeSuggestionRange.endExclusive, suggestionEvents, upcomingTodos]);

  const untimedTodayTaskDurations = useMemo(() => {
    const todayStart = startOfDay(currentTime).getTime();
    const horizonEnd = homeSuggestionRange.endExclusive.getTime();
    return upcomingTodos
      .filter((todo) =>
        !!todo.dueDate &&
        todo.dueDate.getTime() >= todayStart &&
        todo.dueDate.getTime() < horizonEnd &&
        !getTodoHasDueTime(todo.dueDate, todo.hasDueTime)
      )
      .map((todo) => todo.plannedDurationMinutes);
  }, [currentTime, homeSuggestionRange.endExclusive, upcomingTodos]);

  const suggestionFreeWindow = useMemo(() => findHomeSuggestionFreeWindow({
    now: currentTime,
    timedBusyRanges: suggestionBusyRanges,
    untimedTaskDurations: untimedTodayTaskDurations,
  }), [currentTime, suggestionBusyRanges, untimedTodayTaskDurations]);
  const suggestionFreeWindowEnd = suggestionFreeWindow?.end.toISOString() ?? null;

  const shouldShowSuggestions =
    !!user &&
    isHomePersonalizationLoaded &&
    homePersonalization.suggestionsEnabled &&
    homeCalendarLoadState.dayKey === homeDayKey &&
    homeCalendarLoadState.ready &&
    !!suggestionFreeWindow &&
    homeSuggestions.length > 0;

  const suggestedTodoIds = useMemo(() => {
    if (!shouldShowSuggestions) {
      return new Set<string>();
    }

    const candidatesById = new Map(suggestionCandidates.map((candidate) => [candidate.id, candidate]));
    const todoIds = new Set<string>();

    homeSuggestions.forEach((suggestion) => {
      const candidate = candidatesById.get(suggestion.candidateId);
      if (!candidate) {
        return;
      }
      if (candidate.kind === 'goal') {
        candidate.activeTodoIds?.forEach((todoId) => todoIds.add(todoId));
        return;
      }
      todoIds.add(candidate.openTodoId);
    });

    return todoIds;
  }, [homeSuggestions, shouldShowSuggestions, suggestionCandidates]);

  const homePlanTodos = useMemo(
    () => filterHomePlanTodos(visibleUpcomingTodos, endOfDay(currentTime), suggestedTodoIds),
    [currentTime, suggestedTodoIds, visibleUpcomingTodos]
  );

  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    const todayStart = startOfDay(currentTime).getTime();
    const todayEnd = endOfDay(currentTime).getTime();
    const timedEventItems: ScheduleItem[] = [];
    const allDayEventItems: ScheduleItem[] = [];
    const timedTodoItems: ScheduleItem[] = [];
    const untimedTodayTodoItems: ScheduleItem[] = [];
    const overdueTodoItems: ScheduleItem[] = [];

    upcomingEvents.forEach(event => {
      const { eventSource: completionSource, eventKey: completionKey } =
        getHomeEventCompletionIdentity(event);
      const occurrenceStart = event.startDate;
      const eventItemId = `event-${String(event.id)}`;
      const completionId = buildHomeEventCompletionId(completionSource, completionKey, occurrenceStart);
      const isTimedEvent = !(event as GoogleEvent).isAllDay;
      // Today's plan is the whole day: an event that has ended stays, faded, so the day's
      // events never seem to be missing. Next step only looks at current and later ones.
      const hasEnded = isTimedEvent && event.endDate.getTime() <= currentTime.getTime();

      if (
        hiddenHomeItemIds.has(eventItemId) ||
        completedHomeEventIds.has(completionId)
      ) {
        return;
      }

      const item: ScheduleItem = {
        id: eventItemId,
        sourceId: String(event.id),
        time: event.startDate,
        endTime: event.endDate,
        label: event.title,
        type: 'event',
        hasTime: isTimedEvent,
        completionSource,
        completionKey,
        occurrenceStart,
        ...(hasEnded ? { isPast: true } : {}),
      };

      if (item.hasTime) {
        timedEventItems.push(item);
      } else {
        allDayEventItems.push(item);
      }
    });

    homePlanTodos.forEach(todo => {
      const hasTime = getTodoHasDueTime(todo.dueDate, todo.hasDueTime);
      const todoItemId = `todo-${todo.id}`;
      const item: ScheduleItem = {
        id: todoItemId,
        sourceId: todo.id,
        label: todo.text,
        type: 'todo',
        hasTime,
        isStarred: todo.starred,
        createdAt: todo.createdAt,
        workspaceKey: todo.workspace,
        ...(hasTime && todo.dueDate ? { time: todo.dueDate } : {}),
      };

      if (!todo.dueDate) {
        return;
      }

      const dueTime = todo.dueDate.getTime();
      if (dueTime < todayStart) {
        overdueTodoItems.push({
          ...item,
          hasTime: false,
          time: undefined,
          isOverdue: true,
        });
        return;
      }

      if (dueTime > todayEnd) {
        return;
      }

      if (hasTime) {
        timedTodoItems.push(item);
        return;
      }

      untimedTodayTodoItems.push(item);
    });

    return [...timedEventItems, ...timedTodoItems]
      .sort(sortTimedScheduleItems)
      .concat(allDayEventItems, untimedTodayTodoItems, overdueTodoItems);
  }, [completedHomeEventIds, currentTime, hiddenHomeItemIds, homePlanTodos, upcomingEvents]);

  const todayHandledItems = useMemo(
    () => orderScheduleItemsWithSnoozesLast(
      scheduleItems.filter(item => !completingItemIds.has(item.id)),
      snoozedNextStepTodoIds,
      snoozedHomeEventIds,
      getScheduleItemEventSnoozeKey
    ),
    [completingItemIds, scheduleItems, snoozedHomeEventIds, snoozedNextStepTodoIds]
  );

  const planDay = useMemo(() => getHomePlanDay(currentTime, planDayOffset), [currentTime, planDayOffset]);
  const planTitle = getHomePlanTitle(planDayOffset, planDay);
  const isShowingTodayPlan = planDayOffset === 0;
  const displayedPlanItems: ScheduleItem[] = isShowingTodayPlan ? todayHandledItems : otherDayPlanItems ?? [];

  useEffect(() => {
    if (isShowingTodayPlan) {
      setOtherDayPlanItems(null);
      return;
    }
    let cancelled = false;
    setOtherDayPlanItems(null);
    void loadHomeDayPlanItems(planDay)
      .then((items) => {
        if (!cancelled) setOtherDayPlanItems(items);
      })
      .catch(() => {
        if (!cancelled) setOtherDayPlanItems([]);
      });
    return () => {
      cancelled = true;
    };
    // homeSnapshot reloads after edits, so the other day refreshes with it.
  }, [homeSnapshot, isFocused, isShowingTodayPlan, planDay]);

  // "Go to schedule" from a saved chat plan: show that plan's day, then scroll down to the card.
  useEffect(() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof planDate === 'string' ? planDate : '');
    if (!match) return;
    const offset = differenceInCalendarDays(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])), new Date());
    setPlanDayOffset(Math.min(HOME_PLAN_MAX_DAY_OFFSET, Math.max(0, offset)));
    const timer = setTimeout(() => scrollHomeTutorialCardIntoView('todays-plan'), 350);
    return () => clearTimeout(timer);
  }, [navNonce, planDate, scrollHomeTutorialCardIntoView]);

  const changePlanDay = useCallback((step: number) => {
    setPlanDayOffset((current) => {
      const next = Math.min(HOME_PLAN_MAX_DAY_OFFSET, Math.max(0, current + step));
      if (next !== current) void Haptics.selectionAsync().catch(() => {});
      return next;
    });
  }, []);

  // A horizontal swipe on the card changes the day; vertical drags still scroll.
  const planDaySwipe = useMemo(
    () => Gesture.Pan()
      .activeOffsetX([-24, 24])
      .failOffsetY([-14, 14])
      .onEnd((event) => {
        if (event.translationX <= -50) runOnJS(changePlanDay)(1);
        else if (event.translationX >= 50) runOnJS(changePlanDay)(-1);
      }),
    [changePlanDay]
  );

  const todayTodoCandidates = useMemo<ScheduleItem[]>(() => {
    const todayStart = startOfDay(currentTime).getTime();
    const todayEnd = endOfDay(currentTime).getTime();

    return homePlanTodos
      .filter(todo => {
        if (!todo.dueDate) {
          return true;
        }

        const dueTime = todo.dueDate.getTime();
        return dueTime >= todayStart && dueTime <= todayEnd;
      })
      .sort((left, right) => {
        const leftDueToday = !!left.dueDate && left.dueDate.getTime() >= todayStart && left.dueDate.getTime() <= todayEnd;
        const rightDueToday = !!right.dueDate && right.dueDate.getTime() >= todayStart && right.dueDate.getTime() <= todayEnd;

        if (leftDueToday !== rightDueToday) {
          return leftDueToday ? -1 : 1;
        }

        if (left.starred !== right.starred) {
          return left.starred ? -1 : 1;
        }

        if (left.dueDate && right.dueDate) {
          const dueTimeDifference = left.dueDate.getTime() - right.dueDate.getTime();
          if (dueTimeDifference !== 0) {
            return dueTimeDifference;
          }
        }

        return left.createdAt.getTime() - right.createdAt.getTime();
      })
      .map(todo => {
        const hasTime = getTodoHasDueTime(todo.dueDate, todo.hasDueTime);

        return {
          id: `todo-${todo.id}`,
          sourceId: todo.id,
          label: todo.text,
          type: 'todo',
          hasTime,
          isStarred: todo.starred,
          createdAt: todo.createdAt,
          workspaceKey: todo.workspace,
          ...(hasTime && todo.dueDate ? { time: todo.dueDate } : {}),
        };
      });
  }, [currentTime, homePlanTodos]);

  const overdueTodoCandidates = useMemo<ScheduleItem[]>(() => {
    const todayStart = startOfDay(currentTime).getTime();

    return homePlanTodos
      .filter(todo => !!todo.dueDate && todo.dueDate.getTime() < todayStart)
      .sort(sortTodosByDueDate)
      .map(todo => ({
        id: `todo-${todo.id}`,
        sourceId: todo.id,
        label: todo.text,
        type: 'todo',
        hasTime: false,
        isStarred: todo.starred,
        isOverdue: true,
        createdAt: todo.createdAt,
        workspaceKey: todo.workspace,
      }));
  }, [currentTime, homePlanTodos]);

  const nextStep = useMemo<NextStepState>(() => {
    const timedEventItems = scheduleItems.filter(
      (item): item is ScheduleItem & { time: Date } =>
        item.type === 'event' && item.hasTime && !!item.time
    );

    const currentEvents = timedEventItems.filter(item => (
      !!item.endTime &&
      item.time.getTime() <= currentTime.getTime() &&
      item.endTime.getTime() > currentTime.getTime() &&
      !snoozedHomeEventIds.has(getScheduleItemEventSnoozeKey(item))
    ));

    if (currentEvents.length > 0) {
      return {
        items: currentEvents,
        helperText: 'Happening now',
      };
    }

    const upcomingEventItems = timedEventItems.filter(item =>
      item.time.getTime() >= currentTime.getTime() &&
      !snoozedHomeEventIds.has(getScheduleItemEventSnoozeKey(item))
    );
    const nextUnsnoozedTodoCandidate = getNextUnsnoozedTodoCandidate(
      todayTodoCandidates,
      overdueTodoCandidates,
      snoozedNextStepTodoIds
    );
    const nextTodoCandidate = getNextStepTodoCandidate(
      todayTodoCandidates,
      overdueTodoCandidates,
      snoozedNextStepTodoIds
    );

    if (upcomingEventItems.length > 0) {
      const nextSlotKey = getMinuteKey(upcomingEventItems[0].time);
      const nextSlotItems = upcomingEventItems.filter(item => getMinuteKey(item.time) === nextSlotKey);
      const gapMinutes = Math.max(0, nextSlotItems[0].time.getTime() - currentTime.getTime()) / 60000;

      if (gapMinutes >= FREE_WINDOW_MINUTES && nextUnsnoozedTodoCandidate) {
        return {
          items: [nextUnsnoozedTodoCandidate],
          helperText: `Free until ${formatScheduleTime(nextSlotItems[0].time)}`,
        };
      }

      return {
        items: nextSlotItems,
        helperText: `Up next at ${formatScheduleTime(nextSlotItems[0].time)}`,
      };
    }

    if (nextTodoCandidate) {
      return {
        items: [nextTodoCandidate],
        helperText: nextTodoCandidate.isOverdue ? 'Overdue todo' : 'No upcoming events soon',
      };
    }

    return { items: [] };
  }, [currentTime, overdueTodoCandidates, scheduleItems, snoozedHomeEventIds, snoozedNextStepTodoIds, todayTodoCandidates]);

  const eligibleSuggestionCandidates = useMemo(() =>
    suggestionCandidates.filter((candidate) =>
      candidate.kind === 'goal'
        ? !candidate.activeTodoIds?.some((todoId) => hiddenHomeItemIds.has(`todo-${todoId}`))
        : !hiddenHomeItemIds.has(`todo-${candidate.openTodoId}`)
    ),
    [hiddenHomeItemIds, suggestionCandidates]
  );

  const homeSuggestionTodayContext = useMemo<HomeSuggestionTodayContext>(() => {
    const todayStart = startOfDay(currentTime).getTime();
    const horizonStart = currentTime.getTime();
    const horizonEnd = homeSuggestionRange.endExclusive.getTime();
    return {
      tasks: visibleUpcomingTodos
        .filter((todo) =>
          !!todo.dueDate &&
          todo.dueDate.getTime() >= todayStart &&
          todo.dueDate.getTime() < horizonEnd
        )
        .map((todo) => ({
          title: todo.text,
          details: todo.details,
          dueDate: todo.dueDate?.toISOString(),
          plannedDurationMinutes: todo.plannedDurationMinutes ?? undefined,
          starred: todo.starred,
          overdue: !!todo.dueDate && todo.dueDate.getTime() < todayStart,
        })),
      calendar: suggestionEvents
        .filter((event) =>
          !(event as GoogleEvent).isAllDay &&
          event.endDate.getTime() > horizonStart &&
          event.startDate.getTime() < horizonEnd
        )
        .map((event) => ({
          title: event.title,
          start: event.startDate.toISOString(),
          end: event.endDate.toISOString(),
        })),
    };
  }, [currentTime, homeSuggestionRange.endExclusive, suggestionEvents, visibleUpcomingTodos]);

  const homeSuggestionsFingerprint = useMemo(() => JSON.stringify({
    userId: user?.uid,
    dayKey: homeDayKey,
    candidates: eligibleSuggestionCandidates,
    busyRanges: suggestionBusyRanges.map((range) => [
      range.start.toISOString(),
      range.end.toISOString(),
    ]),
    untimedTaskDurations: untimedTodayTaskDurations,
    freeWindowEnd: suggestionFreeWindowEnd,
    today: homeSuggestionTodayContext,
  }), [
    eligibleSuggestionCandidates,
    homeDayKey,
    homeSuggestionTodayContext,
    suggestionFreeWindowEnd,
    suggestionBusyRanges,
    untimedTodayTaskDurations,
    user?.uid,
  ]);

  useEffect(() => {
    const userId = user?.uid;
    const cacheScope = userId ? `${userId}:${homeDayKey}` : '';
    const cacheScopeChanged = homeSuggestionsCacheScopeRef.current !== cacheScope;
    homeSuggestionsCacheScopeRef.current = cacheScope;

    if (!userId) {
      setHomeSuggestions([]);
      return;
    }

    let cancelled = false;
    const resolvedRequestIdAtLoad = homeSuggestionsResolvedRequestIdRef.current;
    if (cacheScopeChanged) {
      setHomeSuggestions([]);
    }
    readHomeSuggestionsCache(userId, homeDayKey).then((cachedSuggestions) => {
      if (
        !cancelled &&
        homeSuggestionsResolvedRequestIdRef.current === resolvedRequestIdAtLoad
      ) {
        const normalizedCachedSuggestions = normalizeHomeSuggestions(
          { suggestions: cachedSuggestions },
          eligibleSuggestionCandidates
        );
        setHomeSuggestions((currentSuggestions) => {
          const normalizedCurrentSuggestions = normalizeHomeSuggestions(
            { suggestions: currentSuggestions },
            eligibleSuggestionCandidates
          );
          return normalizedCurrentSuggestions.length > 0
            ? normalizedCurrentSuggestions
            : normalizedCachedSuggestions;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eligibleSuggestionCandidates, homeDayKey, user?.uid]);

  useEffect(() => {
    const userId = user?.uid;
    if (!isFocused) {
      clearHomeSuggestionsRetry();
      homeSuggestionsRetryFingerprintRef.current = '';
      homeSuggestionsRequestIdRef.current += 1;
      homeSuggestionsFingerprintRef.current =
        homeSuggestionsConsentDeclinedFingerprintRef.current ||
        homeSuggestionsCompletedFingerprintRef.current;
      return;
    }
    if (!userId || !isHomePersonalizationLoaded) {
      clearHomeSuggestionsRetry();
      homeSuggestionsRetryFingerprintRef.current = '';
      homeSuggestionsRequestIdRef.current += 1;
      homeSuggestionsFingerprintRef.current = '';
      homeSuggestionsCompletedFingerprintRef.current = '';
      homeSuggestionsConsentDeclinedFingerprintRef.current = '';
      return;
    }
    if (!homePersonalization.suggestionsEnabled) {
      clearHomeSuggestionsRetry();
      homeSuggestionsRetryFingerprintRef.current = '';
      homeSuggestionsRequestIdRef.current += 1;
      homeSuggestionsFingerprintRef.current = '';
      homeSuggestionsCompletedFingerprintRef.current = '';
      homeSuggestionsConsentDeclinedFingerprintRef.current = '';
      return;
    }
    if (!suggestionFreeWindow) {
      clearHomeSuggestionsRetry();
      homeSuggestionsRetryFingerprintRef.current = '';
      homeSuggestionsRequestIdRef.current += 1;
      homeSuggestionsFingerprintRef.current = '';
      homeSuggestionsCompletedFingerprintRef.current = '';
      homeSuggestionsConsentDeclinedFingerprintRef.current = '';
      return;
    }
    if (eligibleSuggestionCandidates.length === 0) {
      clearHomeSuggestionsRetry();
      homeSuggestionsRetryFingerprintRef.current = '';
      homeSuggestionsRequestIdRef.current += 1;
      homeSuggestionsFingerprintRef.current = '';
      homeSuggestionsCompletedFingerprintRef.current = '';
      homeSuggestionsConsentDeclinedFingerprintRef.current = '';
      return;
    }
    if (
      homeCalendarLoadState.dayKey !== homeDayKey ||
      !homeCalendarLoadState.ready
    ) {
      return;
    }
    if (homeSuggestionsFingerprintRef.current === homeSuggestionsFingerprint) {
      return;
    }

    if (homeSuggestionsRetryFingerprintRef.current !== homeSuggestionsFingerprint) {
      clearHomeSuggestionsRetry();
      homeSuggestionsRetryFingerprintRef.current = homeSuggestionsFingerprint;
    }
    homeSuggestionsFingerprintRef.current = homeSuggestionsFingerprint;
    const requestId = ++homeSuggestionsRequestIdRef.current;
    requestHomeSuggestions({
      candidates: eligibleSuggestionCandidates,
      freeWindow: suggestionFreeWindow,
      today: homeSuggestionTodayContext,
    }).then((suggestions) => {
      if (homeSuggestionsRequestIdRef.current !== requestId) {
        return;
      }
      homeSuggestionsResolvedRequestIdRef.current = requestId;
      homeSuggestionsCompletedFingerprintRef.current = homeSuggestionsFingerprint;
      if (homeSuggestionsConsentDeclinedFingerprintRef.current === homeSuggestionsFingerprint) {
        homeSuggestionsConsentDeclinedFingerprintRef.current = '';
      }
      clearHomeSuggestionsRetry();
      setHomeSuggestions(suggestions);
      void writeHomeSuggestionsCache(userId, homeDayKey, suggestions).catch(() => {});
    }).catch((error) => {
      if (homeSuggestionsRequestIdRef.current !== requestId || homeSuggestionsRetryTimerRef.current) {
        return;
      }
      if (isAiDataSharingConsentDeclinedError(error)) {
        homeSuggestionsResolvedRequestIdRef.current = requestId;
        homeSuggestionsConsentDeclinedFingerprintRef.current = homeSuggestionsFingerprint;
        clearHomeSuggestionsRetry();
        setHomeSuggestions([]);
        return;
      }

      const retryAttempt = homeSuggestionsRetryAttemptRef.current + 1;
      const retryDelay = getHomeSuggestionsRetryDelay(retryAttempt);
      if (retryDelay === null) {
        return;
      }
      homeSuggestionsRetryAttemptRef.current = retryAttempt;
      homeSuggestionsRetryTimerRef.current = setTimeout(() => {
        homeSuggestionsRetryTimerRef.current = null;
        if (homeSuggestionsRequestIdRef.current !== requestId) {
          return;
        }
        homeSuggestionsFingerprintRef.current = '';
        setHomeSuggestionsRetryNonce((current) => current + 1);
      }, retryDelay);
    });
  }, [
    clearHomeSuggestionsRetry,
    eligibleSuggestionCandidates,
    homePersonalization.suggestionsEnabled,
    homeSuggestionTodayContext,
    homeSuggestionsFingerprint,
    homeDayKey,
    homeSuggestionsRetryNonce,
    homeCalendarLoadState,
    isHomePersonalizationLoaded,
    isFocused,
    suggestionFreeWindow,
    user?.uid,
  ]);

  const widestTimeStr = useMemo(() => {
    let widest = '';
    for (const item of displayedPlanItems) {
      if (item.hasTime && item.time) {
        const str = formatCompactScheduleTime(item.time);
        if (str.length > widest.length) widest = str;
      }
    }
    return widest;
  }, [displayedPlanItems]);

  const todayCardMaxHeight = Math.min(
    Math.max(Math.round(TODAY_CARD_BASE_HEIGHT * 1.4), TODAY_CARD_BASE_HEIGHT + aiInputHeight),
    TODAY_CARD_MAX_HEIGHT
  );
  const todayCardTargetHeight =
    todayCardHeaderHeight + Math.max(displayedPlanItems.length, 3) * todayHandledRowHeight + 8;
  const todayCardHeight = Math.min(
    Math.max(todayCardTargetHeight, TODAY_CARD_BASE_HEIGHT),
    todayCardMaxHeight
  );
  const todayCardHasOverflow = todayCardTargetHeight > todayCardMaxHeight;
  const todayCardListHeight = Math.max(todayCardHeight - todayCardHeaderHeight, 132);
  const todayCardBlurHeight = todayCardHasOverflow
    ? Math.min(TODAY_CARD_BLUR_HEIGHT, todayCardListHeight)
    : 0;
  const todayCardBlurOverlap = 0;
  const todayHandledCanvasPaddingBottom = Math.max(
    todayCardBlurHeight + 10,
    todayHandledRowHeight + 10
  );
  const todayHandledRenderWidth = todayHandledCanvasWidth || Math.max(windowWidth - 52, 0);

  const todayHandledParagraphWidth = Math.max(
    todayHandledRenderWidth - TODAY_CARD_LIST_LEFT - TODAY_CARD_LIST_RIGHT,
    0
  );

  const todayHandledParagraphs = useMemo(() => {
    if (todayHandledParagraphWidth <= 0) {
      return [] as {
        id: string;
        sharpParagraph: SkParagraph;
        blurredParagraph: SkParagraph;
        y: number;
      }[];
    }

    return displayedPlanItems.map((item, index) => {
      const labelTextStyle = {
        color: Skia.Color(item.isPast ? TODAY_CARD_PAST_TEXT : TODAY_CARD_TEXT),
        fontSize: 16,
        fontFamilies: Platform.OS === 'android' ? ['sans-serif'] : ['System'],
        fontStyle: { weight: 400 as const },
        heightMultiplier: 1,
      };
      const timeTextStyle = {
        ...labelTextStyle,
        fontStyle: { weight: 400 as const },
      };

      const buildParagraph = () => {
        const builder = Skia.ParagraphBuilder.Make({
          maxLines: 1,
          ellipsis: '...',
        });

        if (item.hasTime && item.time) {
          if (ALIGN_ALL_DASHES && widestTimeStr) {
            builder.pushStyle(timeTextStyle);
            builder.addText(widestTimeStr.padEnd(Math.max(widestTimeStr.length, formatCompactScheduleTime(item.time).length), ' '));
            builder.pop();
            builder.pushStyle(labelTextStyle);
            builder.addText(' ');
            builder.pop();
          } else {
            builder.pushStyle(timeTextStyle);
            builder.addText(formatCompactScheduleTime(item.time));
            builder.pop();
          }

          builder.pushStyle(labelTextStyle);
          builder.addText(` - ${item.label}`);
          builder.pop();
        } else {
          builder.pushStyle(labelTextStyle);
          builder.addText(item.label);
          builder.pop();
        }

        const paragraph = builder.build();
        paragraph.layout(todayHandledParagraphWidth);
        return paragraph;
      };

      return {
        id: item.id,
        sharpParagraph: buildParagraph(),
        blurredParagraph: buildParagraph(),
        y: index * todayHandledRowHeight,
      };
    });
  }, [displayedPlanItems, todayHandledParagraphWidth, widestTimeStr]);

  const todayHandledContentHeight =
    todayHandledParagraphs.length * todayHandledRowHeight + todayHandledCanvasPaddingBottom;

  useEffect(() => {
    todayHandledScrollOffset.value = 0;
  }, [displayedPlanItems.length, planDayOffset, todayHandledScrollOffset]);

  const statusText = useMemo(() => {
    const dateLabel = format(currentTime, 'MMM do');

    return `I've got today handled - ${dateLabel}`;
  }, [currentTime]);

  const motivationalQuote = useMemo(() => {
    const quoteIndex = (
      Math.imul(homeDayYear, 73856093) ^
      Math.imul(homeDayMonth + 1, 19349663) ^
      Math.imul(homeDayDate, 83492791)
    ) >>> 0;

    return HOME_MOTIVATIONAL_QUOTES[quoteIndex % HOME_MOTIVATIONAL_QUOTES.length];
  }, [homeDayDate, homeDayMonth, homeDayYear]);

  const isHomeBusy = isInitialHomeLoading || isRefreshingNextStepEmpty;

  const handleRefreshEmptyNextStep = useCallback(async () => {
    if (isInitialHomeLoading || isRefreshingNextStepEmpty) {
      return;
    }

    setIsRefreshingNextStepEmpty(true);
    setHomeCalendarLoadState({ dayKey: homeDayKey, ready: false });
    setCurrentTime(new Date());
    Animated.sequence([
      Animated.timing(nextStepEmptyOpacity, {
        toValue: 0.24,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.timing(nextStepEmptyOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      await reloadLocalData();

      if (isAuthLoading || isTokenLoading) {
        return;
      }

      if (isHomeCalendarReadyForSuggestions(googleConnectionState, false)) {
        setHomeCalendarLoadState({ dayKey: homeDayKey, ready: true });
        return;
      }

      const googleEvents = await fetchGoogleCalendarEvents(
        homeSuggestionRange.start,
        homeSuggestionRange.endExclusive
      );
      const displayGoogleEvents = googleEvents.filter(
        (event) =>
          event.startDate.getTime() < homeDayRange.endExclusive.getTime() &&
          event.endDate.getTime() > homeDayRange.start.getTime()
      );
      const googleCompletions = await fetchHomeEventCompletionsForEvents(googleEvents);
      setHomeSnapshot((current) =>
        mergeHomeEventCompletionsIntoSnapshot(
          mergeGoogleEventsIntoHomeSnapshot(current, displayGoogleEvents, googleEvents),
          googleCompletions
        )
      );
      setHomeCalendarLoadState({
        dayKey: homeDayKey,
        ready: isHomeCalendarReadyForSuggestions(googleConnectionState, true),
      });
    } catch {
    } finally {
      setIsRefreshingNextStepEmpty(false);
    }
  }, [
    fetchGoogleCalendarEvents,
    fetchHomeEventCompletionsForEvents,
    homeDayRange.endExclusive,
    homeDayRange.start,
    homeSuggestionRange.endExclusive,
    homeSuggestionRange.start,
    homeDayKey,
    googleConnectionState,
    isAuthLoading,
    isInitialHomeLoading,
    isRefreshingNextStepEmpty,
    isTokenLoading,
    nextStepEmptyOpacity,
    reloadLocalData,
  ]);

  const handleOpenScheduleItem = useCallback((item: ScheduleItem) => {
    if (item.type === 'event') {
      const eventId = item.completionKey || item.sourceId;
      const eventSource = item.completionSource || 'local';

      router.push({
        pathname: '/(tabs)/calendar',
        params: {
          openEventId: String(eventId),
          openEventSource: eventSource,
          openNonce: String(Date.now()),
        },
      });
      return;
    }

    router.push({
      pathname: '/(tabs)/todo',
      params: {
        openTodoId: item.sourceId,
        openTodoNonce: String(Date.now()),
      },
    });
  }, []);

  const handleOpenSuggestion = useCallback((suggestion: HomeSuggestion) => {
    const candidate = eligibleSuggestionCandidates.find((item) => item.id === suggestion.candidateId);
    if (!candidate) {
      return;
    }
    router.push({
      pathname: '/(tabs)/todo',
      params: {
        openTodoId: candidate.openTodoId,
        openTodoNonce: String(Date.now()),
      },
    });
  }, [eligibleSuggestionCandidates]);

  const handleCloseTodayHandledOptions = useCallback(() => {
    setSelectedTodayHandledItem(null);
  }, []);

  const handleHideTodayHandledItem = useCallback(() => {
    if (!selectedTodayHandledItem) {
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    hideItemFromHomePermanently(selectedTodayHandledItem.id);
    setSelectedTodayHandledItem(null);
  }, [hideItemFromHomePermanently, selectedTodayHandledItem]);

  const renderNextStepItem = (item: ScheduleItem) => {
    const isCompleting = completingItemIds.has(item.id);
    // Scheduled events get a lighter card so they read apart from tasks.
    const isEvent = item.type === 'event';
    const isSnoozed =
      item.type === 'todo'
        ? snoozedNextStepTodoIds.has(item.sourceId)
        : snoozedHomeEventIds.has(getScheduleItemEventSnoozeKey(item));

    return (
      <View
        key={item.id}
        className="rounded-[18px]"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.5,
          shadowRadius: 18,
          elevation: 14,
        }}
      >
        <LinearGradient
          colors={isEvent ? ['#D4CFB2', '#8C8268'] : ['#9D997C', '#4D4A3B']}
          locations={[0, 0.85]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          className="h-12 flex-row items-center px-3.5 rounded-[18px] overflow-hidden border border-white/20"
        >
          <TouchableOpacity
            disabled={isCompleting}
            onPress={() => {
              if (
                item.type === 'event' &&
                (!item.completionSource || !item.completionKey || !item.occurrenceStart)
              ) {
                return;
              }

              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              if (item.type === 'todo') {
                void handleCompleteTodo(item);
                return;
              }

              void handleCompleteEvent(item);
            }}
          >
            <Image
              source={require('../../../assets/images/button-gold.png')}
              style={{ width: 30, height: 30, opacity: isCompleting ? 0.72 : 1 }}
            />
          </TouchableOpacity>
          <Pressable
            disabled={isCompleting}
            onPress={() => handleOpenScheduleItem(item)}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              marginLeft: 8,
              marginRight: 4,
              paddingLeft: 0,
              paddingRight: 4,
              borderRadius: 14,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <Text
              className={`flex-1 text-[16px] font-semibold ${isEvent ? 'text-[#3D3A2E]' : 'text-[#ffffff]'}`}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            <Text
              className={`text-[12px] font-semibold ml-2 ${isEvent ? 'text-[#5A5645]' : 'text-[#E8E0C7]'}`}
              numberOfLines={1}
            >
              {formatScheduleLabel(item)}
            </Text>
          </Pressable>
          <GuidedTarget
            targetId={getHomeControlGuidanceTargetId('tutorial-next-step-snooze')}
            highlightWhenTargetIds={[getHomeControlGuidanceTargetId('tutorial-next-step')]}
            label="Snooze"
            localHighlightShape="circle"
            localHighlightCirclePadding={2}
            localHighlightPulseScale={1.05}
            localHighlightShadowRadius={10}
            style={{
              width: 32,
              height: 32,
            }}
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={isSnoozed ? 'Already snoozed' : item.type === 'event' ? 'Snooze event' : 'Snooze next step'}
              activeOpacity={0.76}
              disabled={isCompleting || isSnoozed}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                handleSnoozeNextStepItem(item);
              }}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isCompleting || isSnoozed ? 0.48 : 1,
              }}
            >
              <MaterialCommunityIcons name="alarm-snooze" size={18} color="#E8E0C7" />
            </TouchableOpacity>
          </GuidedTarget>
        </LinearGradient>
      </View>
    );
  };

  const renderSuggestionItem = (suggestion: HomeSuggestion) => {
    return (
      <View
        key={suggestion.candidateId}
        className="rounded-[18px]"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.5,
          shadowRadius: 18,
          elevation: 14,
        }}
      >
        <LinearGradient
          colors={['#9D997C', '#4D4A3B']} // the Next step card's task rows
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          className="h-12 flex-row items-center px-3.5 rounded-[18px] overflow-hidden border border-white/20"
        >
          <Text className="flex-1 text-[16px] font-semibold text-[#ffffff] ml-1 mr-2" numberOfLines={1}>
            {suggestion.title}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Open ${suggestion.title}`}
            activeOpacity={0.76}
            onPress={() => handleOpenSuggestion(suggestion)}
            className="h-8 min-w-[54px] items-center justify-center rounded-[14px] border border-[#D6D2B9]/70 bg-white/10 px-2"
          >
            <Text className="text-[14px] font-semibold text-white">Open</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  };

  const [isCheckingFixMyLifeAccess, setIsCheckingFixMyLifeAccess] = useState(false);
  const [isFixMyLifeProDialogVisible, setIsFixMyLifeProDialogVisible] = useState(false);
  const handleFixMyLife = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    if (!user) {
      router.push({ pathname: '/home/login', params: { source: 'home' } });
      return;
    }

    // Checked at tap time, not from a cached tier, so a just-completed upgrade counts.
    setIsCheckingFixMyLifeAccess(true);
    const access = await checkAiFeatureAccess(user.uid, 'dayPlanning', user.email).finally(() => {
      setIsCheckingFixMyLifeAccess(false);
    });
    // Fix my life is Pro-only: a free user gets a short notice and stays on Home.
    if (!access.allowed) {
      setIsFixMyLifeProDialogVisible(true);
      return;
    }

    router.push({
      pathname: '/(tabs)/chat',
      params: { chatAction: 'fix-my-life', chatActionNonce: String(Date.now()) },
    });
  }, [user]);

  const handleOpenSettings = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (!user) {
      router.push({ pathname: '/home/login', params: { source: 'home' } });
      return;
    }

    setReturnToSettingsAfterManageAccount(false);
    setIsSettingsVisible(true);
  }, [user]);

  const showSheetTransitionCover = useCallback(() => {
    if (sheetTransitionTimerRef.current) {
      clearTimeout(sheetTransitionTimerRef.current);
    }

    setIsSheetTransitionCoverVisible(true);
    sheetTransitionTimerRef.current = setTimeout(() => {
      setIsSheetTransitionCoverVisible(false);
      sheetTransitionTimerRef.current = null;
    }, 320);
  }, []);

  useEffect(() => {
    return () => {
      if (sheetTransitionTimerRef.current) {
        clearTimeout(sheetTransitionTimerRef.current);
      }
      if (sheetHandoffTimerRef.current) {
        clearTimeout(sheetHandoffTimerRef.current);
      }
    };
  }, []);

  const handleCloseSettings = useCallback(() => {
    setReturnToSettingsAfterManageAccount(false);
    setIsSettingsVisible(false);

    if (settings === 'true') {
      router.replace('/(tabs)/home');
    }
  }, [settings]);

  const handleOpenManageAccountFromSettings = useCallback(() => {
    showSheetTransitionCover();
    if (sheetHandoffTimerRef.current) {
      clearTimeout(sheetHandoffTimerRef.current);
    }

    setReturnToSettingsAfterManageAccount(true);
    setIsManageAccountVisible(true);
    sheetHandoffTimerRef.current = setTimeout(() => {
      setIsSettingsVisible(false);
      sheetHandoffTimerRef.current = null;
    }, 260);
  }, [showSheetTransitionCover]);

  const handleBeforeCloseManageAccount = useCallback(() => {
    if (!returnToSettingsAfterManageAccount || manageAccount === 'true') {
      return;
    }

    showSheetTransitionCover();
    if (sheetHandoffTimerRef.current) {
      clearTimeout(sheetHandoffTimerRef.current);
      sheetHandoffTimerRef.current = null;
    }
    setIsSettingsVisible(true);
  }, [manageAccount, returnToSettingsAfterManageAccount, showSheetTransitionCover]);

  const handleCloseManageAccount = useCallback(() => {
    setIsManageAccountVisible(false);

    if (manageAccount === 'true') {
      setReturnToSettingsAfterManageAccount(false);
      router.replace('/(tabs)/home');
      return;
    }

    if (returnToSettingsAfterManageAccount) {
      setReturnToSettingsAfterManageAccount(false);
    }
  }, [manageAccount, returnToSettingsAfterManageAccount]);

  useEffect(() => {
    if (settings !== 'true' || isAuthLoading) {
      return;
    }

    if (!user) {
      router.replace({ pathname: '/home/login', params: { source: 'home' } });
      return;
    }

    setReturnToSettingsAfterManageAccount(false);
    setIsManageAccountVisible(false);
    setIsSettingsVisible(true);
  }, [isAuthLoading, settings, settingsNonce, user]);

  useEffect(() => {
    if (manageAccount !== 'true' || isAuthLoading) {
      return;
    }

    if (!user) {
      router.replace({ pathname: '/home/login', params: { source: 'home' } });
      return;
    }

    setReturnToSettingsAfterManageAccount(false);
    setIsSettingsVisible(false);
    setIsManageAccountVisible(true);
  }, [isAuthLoading, manageAccount, manageAccountNonce, user]);

  const blobScenarioKeys = useMemo(() => Object.keys(BLOB_SCENARIOS), []);
  const toggleFaceMood = useCallback((mood: MoodState) => {
    setActiveFaceMoods(prev => {
      if (prev.includes(mood)) {
        const next = prev.filter(item => item !== mood);
        return next.length > 0 ? next : ['happy'];
      }

      let next = [...prev, mood];
      if (mood === 'cap') next = next.filter(item => item !== 'hat');
      if (mood === 'hat') next = next.filter(item => item !== 'cap');
      if (
        mood === 'mouth_overlay' ||
        mood === 'mouth_1' ||
        mood === 'mouth_braces' ||
        mood === 'pout_lips'
      ) {
        next = [
          ...prev.filter(
            item =>
              item !== 'mouth_overlay' &&
              item !== 'mouth_1' &&
              item !== 'mouth_braces' &&
              item !== 'pout_lips'
          ),
          mood,
        ];
      }
      return next;
    });
  }, []);

  const settingsHeaderButton = (
    <View className="mt-2">
      <GuidedTarget
        targetId={getHomeSettingsGuidanceTargetId()}
        label="Settings"
        localHighlightRadius={999}
        style={{ width: 44, height: 44 }}
      >
        <LiquidGlassIconButton
          debugLabel="home:header:settings"
          accessibilityLabel="Open settings"
          size={44}
          tintColor="rgba(46, 45, 34, 0.25)"
          fallbackTint="light"
          fallbackBackgroundColor="rgba(46, 45, 34, 0.25)"
          fallbackBorderColor="rgba(255, 255, 255, 0.36)"
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          onPress={handleOpenSettings}
        >
          <MaterialCommunityIcons name="cog" size={25} color="rgba(0, 0, 0, 0.52)" />
        </LiquidGlassIconButton>
      </GuidedTarget>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
    <LinearGradient
      colors={['#F1ECCE', '#8C8268']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ flex: 1 }}
    >
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: -24, left: -12, right: -12, bottom: -24, opacity: 0.10, zIndex: 0 }}
      >
        <Image
          source={require('../../../assets/images/wave-bg.png')}
          style={{ width: undefined, height: undefined, flex: 1 }}
          resizeMode="cover"
        />
      </View>
      <LinearGradient
        colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.72)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260, zIndex: 1 }}
      />
      <View style={{ flex: 1, zIndex: 2, elevation: 2 }}>
        {isFocused && <StatusBar style="dark" backgroundColor="transparent" translucent />}

        <ScrollView
          showsVerticalScrollIndicator={false}
          ref={homeScrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: homeContentBottomPadding }}
          keyboardShouldPersistTaps="handled"
        >
            <ScreenHeader
              title="Home"
              titleColor="#FFFFFF"
              horizontalPadding={0}
              left={isLeftHanded ? settingsHeaderButton : undefined}
              right={isLeftHanded ? undefined : settingsHeaderButton}
            />
            <View className="mb-0.5" style={{ position: 'relative', zIndex: 200, elevation: 200 }}>
              {shouldMountHomeBlob ? (
                <HomeBlob
                  active={shouldRenderHomeCanvases}
                  faceMoods={activeFaceMoods}
                  breathingEnabled={blobBreathingOn}
                  showThrone={showThrone}
                  blobAppearancePresetId={blobAppearancePresetId}
                  blobVisualMeaning={blobVisualMeaning}
                  completedTasksToday={completedTasksToday}
                  heartTaskThreshold={HEART_TASK_THRESHOLD}
                  showDebugControls={__DEV__ && showBlobDebugPanel}
                  lobeStrengths={lifeGraph.lobeStrengths}
                  faceVisible={lifeGraph.settings.lifeGraphEnabled && lifeGraph.settings.faceVisible}
                  // Life graph on: the earlier droplet with its life-area lobes. Off: the fluid drop.
                  fluid={!lifeGraph.settings.lifeGraphEnabled}
                  onLongPress={() => setIsLifeGraphSettingsOpen(true)}
                />
              ) : null}
              <LifeGraphSettingsModal
                visible={isLifeGraphSettingsOpen}
                settings={lifeGraph.settings}
                progress={lifeGraph.progress}
                onSave={lifeGraph.saveSettings}
                onClose={() => setIsLifeGraphSettingsOpen(false)}
              />
              {__DEV__ && showBlobDebugPanel && (
                  <View className="mt-1 gap-2">
                    <View className="flex-row flex-wrap justify-center gap-1.5">
                      <TouchableOpacity
                        onPress={() => setShowBlobDebugPanel(false)}
                        className="px-2.5 py-1.5 rounded-full bg-[#5A5848]/90 border border-white/50"
                        accessibilityRole="button"
                        accessibilityLabel="Hide blob debug panel"
                      >
                        <Text className="text-[9px] text-[#FFF8E0]">Hide debug</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setBlobBreathingOn(value => !value)}
                        className="px-2.5 py-1.5 rounded-full bg-[#2E2D22]/70 border border-white/25"
                        accessibilityRole="button"
                        accessibilityLabel={blobBreathingOn ? 'Turn off blob breathing' : 'Turn on blob breathing'}
                      >
                        <Text className="text-[9px] text-white/90">
                          Breathing: {blobBreathingOn ? 'On' : 'Off'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setShowThrone(value => !value)}
                        className="px-2.5 py-1.5 rounded-full bg-[#2E2D22]/70 border border-white/25"
                        accessibilityRole="button"
                        accessibilityLabel={showThrone ? 'Hide throne behind blob' : 'Show throne behind blob'}
                      >
                        <Text className="text-[9px] text-white/90">
                          Throne: {showThrone ? 'On' : 'Off'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setBlobMeaningSource('scenario')}
                        className={`px-2.5 py-1.5 rounded-full border ${blobMeaningSource === 'scenario' ? 'bg-[#5A5848]/90 border-white/50' : 'bg-[#2E2D22]/55 border-white/20'}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: blobMeaningSource === 'scenario' }}
                      >
                        <Text className="text-[9px] text-white/90">Scenario</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setBlobMeaningSource('live')}
                        className={`px-2.5 py-1.5 rounded-full border ${blobMeaningSource === 'live' ? 'bg-[#5A5848]/90 border-white/50' : 'bg-[#2E2D22]/55 border-white/20'}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: blobMeaningSource === 'live' }}
                      >
                        <Text className="text-[9px] text-white/90">Live</Text>
                      </TouchableOpacity>
                      {HOME_BLOB_COLOR_OPTIONS.map(option => {
                        const active = option.id === blobAppearancePresetId;
                        const preset = BLOB_APPEARANCE_PRESETS[option.id];

                        return (
                          <TouchableOpacity
                            key={option.id}
                            onPress={() => setBlobAppearancePresetId(option.id)}
                            className={`px-2.5 py-1.5 rounded-full border flex-row items-center gap-1 ${active ? 'bg-[#5A5848]/90 border-white/50' : 'bg-[#2E2D22]/55 border-white/20'}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Set blob color to ${option.label}`}
                            accessibilityState={{ selected: active }}
                          >
                            <View
                              className="h-2.5 w-2.5 rounded-full border border-white/50"
                              style={{ backgroundColor: preset.material.color }}
                            />
                            <Text className="text-[9px] text-white/90">{option.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {blobMeaningSource === 'scenario' && (
                      <View className="flex-row flex-wrap justify-center gap-1.5">
                        {blobScenarioKeys.map(key => {
                          const active = key === selectedBlobScenario;
                          return (
                            <TouchableOpacity
                              key={key}
                              onPress={() => setSelectedBlobScenario(key)}
                              className={`px-2.5 py-1.5 rounded-full border ${active ? 'bg-[#5A5848]/90 border-white/50' : 'bg-[#2E2D22]/55 border-white/20'}`}
                              accessibilityRole="button"
                              accessibilityLabel={`Use ${key} blob scenario`}
                              accessibilityState={{ selected: active }}
                            >
                              <Text className="text-[9px] text-white/90">{key}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    <View className="flex-row flex-wrap justify-center gap-1.5">
                      {FACE_MOODS.map(mood => {
                        const active = activeFaceMoods.includes(mood);
                        return (
                          <TouchableOpacity
                            key={mood}
                            onPress={() => toggleFaceMood(mood)}
                            className={`px-2 py-1 rounded-full border ${active ? 'bg-[#5A5848]/90 border-white/50' : 'bg-[#2E2D22]/55 border-white/20'}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                          >
                            <Text className="text-[8px] text-white/90">
                              {moodButtonLabel(mood)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text className="text-center text-[9px] text-white/70">
                      {blobPressureSummary}
                    </Text>
                  </View>
              )}
            </View>
            <Text className="text-[18px] font-bold text-[#FFFFFF] mb-1">{statusText}</Text>
            <Text className="text-[13px] leading-[18px] font-medium italic text-[#FFFFFF]/70 mb-4" numberOfLines={2}>
              {motivationalQuote}
            </Text>
            <FixMyLifeButton onPress={() => void handleFixMyLife()} disabled={isCheckingFixMyLifeAccess} />
            <ProRequiredDialog
              visible={isFixMyLifeProDialogVisible}
              title="Fix my life is part of Eazee Pro"
              message="Fix my life plans your whole week, Mon to Sun. Upgrade to Pro to turn it on."
              onUpgrade={() => router.setParams({ settings: 'true', settingsPanel: 'paywall', settingsNonce: String(Date.now()) })}
              onClose={() => setIsFixMyLifeProDialogVisible(false)}
            />

            {homePersonalization.order.map((cardId) => {
              if (cardId === 'suggestions') {
                return shouldShowSuggestions ? (
                  <View
                    key={cardId}
                    className="rounded-[22px] pt-[14px] px-[6px] mb-4 bg-[#2E2D22]/25 pb-8"
                  >
                    <Text className="text-[18px] font-bold text-[#ffffff] ml-4 mb-3">Suggestions</Text>
                    <View className="gap-2">
                      {homeSuggestions.map(renderSuggestionItem)}
                    </View>
                  </View>
                ) : null;
              }

              if (cardId === 'nextStep') {
                return (
                  <View
                    key={cardId}
                    style={{ marginBottom: 16 }}
                    onLayout={handleHomeTutorialCardLayout('next-step')}
                  >
                  <GuidedTarget
                    targetId={getHomeControlGuidanceTargetId('tutorial-next-step')}
                    label="Next step"
                    localHighlightShape="rect"
                    localHighlightRadius={22}
                    localHighlightInset={3}
                    localHighlightPulseScale={1.02}
                  >
                    <View
                      className="rounded-[22px] pt-[14px] px-[6px] bg-[#2E2D22]/25 pb-8"
                      accessibilityState={{ busy: isHomeBusy }}
                    >
                      <Text className="text-[18px] font-bold text-[#ffffff] ml-4 mb-3">Next step</Text>
                      {isInitialHomeLoading ? (
                        <View className="items-center justify-center py-6">
                          <ActivityIndicator color="#C1BDB1" />
                        </View>
                      ) : nextStep.items.length > 0 ? (
                        <Animated.View style={{ opacity: nextStepContentOpacity }}>
                          <View className="gap-2">
                            {nextStep.items.map(renderNextStepItem)}
                          </View>
                        </Animated.View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Refresh next step"
                          disabled={isRefreshingNextStepEmpty}
                          onPress={handleRefreshEmptyNextStep}
                          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        >
                          <Animated.Text
                            className="text-[14px] leading-[20px] mb-1 text-[#C1BDB1] font-medium ml-4"
                            style={{ opacity: nextStepEmptyOpacity }}
                          >
                            You&apos;re all caught up for now. Add items to your to-do list or calendar.
                          </Animated.Text>
                        </Pressable>
                      )}
                    </View>
                  </GuidedTarget>
                  </View>
                );
              }

              return (
                <View
                  key={cardId}
                  style={{ marginBottom: 16 }}
                  onLayout={handleHomeTutorialCardLayout('todays-plan')}
                >
                <GuidedTarget
                  targetId={getHomeControlGuidanceTargetId('tutorial-todays-plan')}
                  label="Today's plan"
                  localHighlightShape="rect"
                  localHighlightRadius={TODAY_CARD_RADIUS}
                  localHighlightInset={3}
                  localHighlightPulseScale={1.02}
                >
                  <GestureDetector gesture={planDaySwipe}>
                  <View
                    className="pt-[14px] px-[6px]"
                    style={{
                      height: todayCardHeight,
                      borderRadius: TODAY_CARD_RADIUS,
                      overflow: 'hidden',
                      backgroundColor: TODAY_CARD_SURFACE,
                    }}
                    accessibilityState={{ busy: isHomeBusy }}
                  >
                    <View className="flex-row items-center mb-2.5 px-2" style={{ minHeight: 28 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Previous day"
                        accessibilityState={{ disabled: planDayOffset === 0 }}
                        disabled={planDayOffset === 0}
                        hitSlop={10}
                        onPress={() => changePlanDay(-1)}
                        style={({ pressed }) => ({ padding: 2, opacity: planDayOffset === 0 ? 0.25 : pressed ? 0.6 : 1 })}
                      >
                        <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                      </Pressable>
                      <Text
                        accessibilityRole="header"
                        numberOfLines={1}
                        className="flex-1 text-center text-[18px] font-bold text-[#ffffff]"
                      >
                        {planTitle}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Next day"
                        accessibilityState={{ disabled: planDayOffset >= HOME_PLAN_MAX_DAY_OFFSET }}
                        disabled={planDayOffset >= HOME_PLAN_MAX_DAY_OFFSET}
                        hitSlop={10}
                        onPress={() => changePlanDay(1)}
                        style={({ pressed }) => ({
                          padding: 2,
                          opacity: planDayOffset >= HOME_PLAN_MAX_DAY_OFFSET ? 0.25 : pressed ? 0.6 : 1,
                        })}
                      >
                        <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
                      </Pressable>
                    </View>
                    {isInitialHomeLoading || (!isShowingTodayPlan && otherDayPlanItems === null) ? (
                      <View className="items-center justify-center py-6">
                        <ActivityIndicator color="#C1BDB1" />
                      </View>
                    ) : displayedPlanItems.length > 0 ? (
                      <View
                        className="relative"
                        style={{ height: todayCardListHeight }}
                        onLayout={(event) => setTodayHandledCanvasWidth(event.nativeEvent.layout.width)}
                      >
                        {shouldRenderHomeCanvases && todayHandledRenderWidth > 0 ? (
                          <Canvas
                            pointerEvents="none"
                            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                          >
                            <Group
                              clip={Skia.XYWHRect(0, 0, todayHandledRenderWidth, todayCardListHeight - todayCardBlurHeight)}
                            >
                              <Group transform={todayHandledParagraphTransform}>
                                {todayHandledParagraphs.map(item => (
                                  <Paragraph
                                    key={`${item.id}-sharp`}
                                    paragraph={item.sharpParagraph}
                                    x={TODAY_CARD_LIST_LEFT}
                                    y={item.y}
                                    width={todayHandledParagraphWidth}
                                  />
                                ))}
                              </Group>
                            </Group>
                            <Group
                              clip={Skia.XYWHRect(
                                0,
                                Math.max(todayCardListHeight - todayCardBlurHeight, 0),
                                todayHandledRenderWidth,
                                todayCardBlurHeight + todayCardBlurOverlap
                              )}
                            >
                              <Group
                                layer={
                                  <Paint>
                                    <Blur blur={1.4} mode="clamp" />
                                  </Paint>
                                }
                                transform={todayHandledParagraphTransform}
                              >
                                {todayHandledParagraphs.map(item => (
                                  <Paragraph
                                    key={`${item.id}-blurred`}
                                    paragraph={item.blurredParagraph}
                                    x={TODAY_CARD_LIST_LEFT}
                                    y={item.y}
                                    width={todayHandledParagraphWidth}
                                  />
                                ))}
                              </Group>
                            </Group>
                          </Canvas>
                        ) : null}
                        <Reanimated.ScrollView
                          nestedScrollEnabled
                          scrollEnabled={todayCardHasOverflow}
                          showsVerticalScrollIndicator={false}
                          style={{ maxHeight: todayCardListHeight }}
                          onScroll={todayHandledScrollHandler}
                          scrollEventThrottle={16}
                        >
                          <View style={{ height: todayHandledContentHeight }}>
                            {displayedPlanItems.map((item) => (
                              <Pressable
                                key={item.id}
                                onPress={() => handleOpenScheduleItem(item)}
                                // Hide/complete/snooze options only apply to today's list.
                                onLongPress={isShowingTodayPlan ? () => setSelectedTodayHandledItem(item) : undefined}
                                style={{
                                  height: todayHandledRowHeight,
                                  marginLeft: TODAY_CARD_LIST_LEFT - 4,
                                  marginRight: TODAY_CARD_LIST_RIGHT - 4,
                                  justifyContent: 'flex-start',
                                }}
                              >
                                {({ pressed }) => (
                                  <View
                                    pointerEvents="none"
                                    style={{
                                      marginTop: -1,
                                      height: 20,
                                      borderRadius: 10,
                                      backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    }}
                                  />
                                )}
                              </Pressable>
                            ))}
                          </View>
                        </Reanimated.ScrollView>
                        {todayCardBlurHeight > 0 && (
                          <View
                            pointerEvents="none"
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              bottom: 0,
                              height: todayCardBlurHeight,
                              borderBottomLeftRadius: TODAY_CARD_RADIUS,
                              borderBottomRightRadius: TODAY_CARD_RADIUS,
                              overflow: 'hidden',
                            }}
                          >
                            <LinearGradient
                              colors={['rgba(46,45,34,0)', 'rgba(46,45,34,0.012)', 'rgba(46,45,34,0.032)']}
                              locations={[0, 0.78, 1]}
                              start={{ x: 0.5, y: 0 }}
                              end={{ x: 0.5, y: 1 }}
                              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                            />
                          </View>
                        )}
                      </View>
                    ) : (
                      <Text className="text-[14px] leading-[20px] mb-1 text-[#C1BDB1] font-medium ml-4">
                        {isShowingTodayPlan
                          ? 'No events or todos for today'
                          : `Nothing planned for ${planDayOffset === 1 ? 'tomorrow' : planDay.toLocaleDateString(undefined, { weekday: 'long' })} yet`}
                      </Text>
                    )}
                  </View>
                  </GestureDetector>
                </GuidedTarget>
                </View>
              );
            })}
        </ScrollView>

      </View>
    </LinearGradient>
    <Modal
      visible={!!selectedTodayHandledItem}
      transparent
      animationType="fade"
      onRequestClose={handleCloseTodayHandledOptions}
    >
      <Pressable
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          paddingHorizontal: 20,
          paddingBottom: Math.max(floatingTabBarInset + 4, insets.bottom + 20),
          backgroundColor: 'rgba(12, 11, 8, 0.42)',
        }}
        onPress={handleCloseTodayHandledOptions}
      >
        <Pressable
          style={{
            borderRadius: 22,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 18 },
            shadowOpacity: 0.35,
            shadowRadius: 24,
            elevation: 18,
          }}
          onPress={() => {}}
        >
          <LinearGradient
            colors={['rgba(65,63,47,0.96)', 'rgba(42,40,30,0.98)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.16)',
              padding: 14,
            }}
          >
            <View style={{ paddingHorizontal: 4, paddingBottom: 12 }}>
              <Text className="text-[13px] font-semibold text-[#E8E0C7]" numberOfLines={1}>
                {selectedTodayHandledItem?.label}
              </Text>
              <Text className="mt-1 text-[12px] font-medium text-[#C1BDB1]" numberOfLines={1}>
                {selectedTodayHandledItem ? formatScheduleLabel(selectedTodayHandledItem) : ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hide from today"
              onPress={handleHideTodayHandledItem}
              style={({ pressed }) => ({
                minHeight: 48,
                borderRadius: 16,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: pressed ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.08)',
              })}
            >
              <Ionicons name="eye-off-outline" size={20} color="#E8E0C7" />
              <Text className="ml-3 flex-1 text-[15px] font-semibold text-[#ffffff]">
                Hide from today
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={handleCloseTodayHandledOptions}
              style={({ pressed }) => ({
                minHeight: 46,
                marginTop: 8,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? 'rgba(193,189,177,0.14)' : 'transparent',
              })}
            >
              <Text className="text-[14px] font-semibold text-[#C1BDB1]">
                Cancel
              </Text>
            </Pressable>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
    {isAiComposerActive && (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12, 11, 8, 0.52)' }} />
        </View>
      </TouchableWithoutFeedback>
    )}
    {!isSettingsVisible && !isManageAccountVisible && (
      <CompactAiBanner
        notice={notice}
        surface="home"
        bottom={aiInputKeyboardBottom + aiInputHeight + 8}
        translateY={keyboardOffset.interpolate({
          inputRange: [0, 1000],
          outputRange: [0, -1000],
          extrapolate: 'clamp',
        })}
        onActionPress={handleCompactNoticeAction}
        onDismissPress={dismissNotice}
        onCancelPress={cancelPending}
      />
    )}
    <LowerSwipeGesture
      currentTab="home"
      disabled={isHomeSwipeDisabled}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: homeSwipeBandHeight,
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
        <AIInputBox
          textInput={inputValue}
          isListening={isListening}
          microphoneColor="#E6E0BD"
          glowAnim={glowAnim}
          placeholder={notice?.kind === 'clarify' || notice?.kind === 'confirm' ? 'Reply here' : ''}
          isProcessing={isAiRunning}
          onStopPress={stopAiRequest}
          editable={!isAiRunning}
          showSendButton
          multiline
          minInputHeight={40}
          maxInputHeight={120}
          surfaceVariant="home"
          inputRef={inputRef}
          onChangeText={setInputValue}
          onSubmitEditing={submit}
          onSendPress={handleHomeAiSendPress}
          returnKeyType="default"
          blurOnSubmit={false}
          onHeightChange={(height) => setAiInputHeight(Math.max(height, HOME_AI_INPUT_MIN_HEIGHT))}
          onFocus={() => setIsAiInputFocused(true)}
          onBlur={() => setIsAiInputFocused(false)}
          onTextInputPress={() => {}}
          onMicrophonePress={handleHomeAiMicrophonePress}
          microphoneSide={isLeftHanded ? 'left' : 'right'}
          containerStyle={{ backgroundColor: 'transparent' }}
        />
      </Animated.View>
    </LowerSwipeGesture>
    {isSheetTransitionCoverVisible && (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 116,
          elevation: 116,
        }}
      >
        <LinearGradient
          colors={['#F1ECCE', '#8C8268']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: -24, left: -12, right: -12, bottom: -24, opacity: 0.10 }}
        >
          <Image
            source={require('../../../assets/images/wave-bg.png')}
            style={{ width: undefined, height: undefined, flex: 1 }}
            resizeMode="cover"
          />
        </View>
        <LinearGradient
          colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.72)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 }}
        />
      </View>
    )}
    <HomeSettingsSheet
      bottomInset={floatingTabBarInset}
      swipeBandHeight={homeSwipeBandHeight}
      userId={user?.uid}
      visible={isSettingsVisible}
      initialFocusPanel={typeof settingsPanel === 'string' ? settingsPanel : undefined}
      initialFocusNonce={typeof settingsNonce === 'string' ? settingsNonce : undefined}
      onClose={handleCloseSettings}
      onOpenManageAccount={handleOpenManageAccountFromSettings}
    />
    <ManageAccountSheet
      bottomInset={floatingTabBarInset}
      swipeBandHeight={homeSwipeBandHeight}
      visible={isManageAccountVisible}
      initialFocusSection={typeof manageAccountSection === 'string' ? manageAccountSection : undefined}
      initialFocusNonce={typeof manageAccountNonce === 'string' ? manageAccountNonce : undefined}
      onBeforeClose={handleBeforeCloseManageAccount}
      onClose={handleCloseManageAccount}
    />
    </View>
  );
}
