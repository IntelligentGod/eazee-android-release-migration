import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Animated, Dimensions, TextInput, Modal, TouchableWithoutFeedback, Platform, Image, Keyboard, Easing, Linking, Alert, InteractionManager, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { State } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetBackdrop, BottomSheetModal, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { database } from '../../../database/database';
import EventModel from '../../../database/models/EventModel';
import { stopEventSeriesFrom } from '@/lib/eventSeries';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { format, startOfWeek, addDays, differenceInCalendarDays, isSameDay } from 'date-fns';
import { runOnJS } from 'react-native-reanimated';
import { useRouter, useGlobalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import TimeWheelDialog from '@/components/TimeWheelDialog';
import { FullWindowOverlay } from 'react-native-screens';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useTokens } from '../../../app/context/TokenContext';
import { useAuthSession } from '@/app/context/AuthSessionContext';
import * as NavigationBar from 'expo-navigation-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AIInputBox from '../../../components/AIInputBox';
import CompactAiBanner from '@/components/CompactAiBanner';
import ScreenHeader from '@/components/ScreenHeader';
import { getFloatingTabBarInset } from '@/components/navigation/floatingTabBar';
import LowerSwipeGesture from '@/components/navigation/LowerSwipeGesture';
import LiquidGlassIconButton from '@/components/LiquidGlassIconButton';
import CalendarWeekPager from '@/components/calendar/CalendarWeekPager';
import CalendarWeekPanel from '@/components/calendar/CalendarWeekPanel';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import {
  CALENDAR_WEEK_STARTS_ON,
  getCalendarWeekKey,
  normalizeCalendarWeekStart,
} from '@/utils/calendarWeeks';
import {
  CALENDAR_DAY_MINUTES,
  getDateAtDayMinute,
  getMinutesSinceStartOfDay,
  getMovedCreateSlotMinutes,
  getResizedCreateSlotMinutes,
  type CreateSlotResizeEdge,
} from '@/utils/calendarCreateSlotResize';
import { normalizeCalendarDetailsText, WAVE_EVENT_DESCRIPTION_SENTINEL } from '@/utils/calendarDetails';
import { useCalendarWeekState } from '@/hooks/useCalendarWeekState';
import { useCalendarWeekSwipe } from '@/hooks/useCalendarWeekSwipe';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useCompactTabAI, type CompactAiNotice, type CompactAiNoticeTarget } from '@/lib/useCompactTabAI';
import { useCompactGuidanceBridge } from '@/lib/useCompactGuidanceBridge';
import { useCompactVoiceInput } from '@/lib/useCompactVoiceInput';
import { GuidedTarget } from '@/components/guidance/GuidanceProvider';
import { getCalendarBackGuidanceTargetId, getCalendarControlGuidanceTargetId } from '@/lib/navigationHelp';
import { showGuidanceTab, useGuidance } from '@/components/guidance/GuidanceProvider';
import { deleteGoogleCalendarEventById } from '@/lib/googleCalendarDelete';
import { getShortcutForGuidanceTarget, type GuidanceTarget } from '@/lib/navigationHelp';
import { setGuidanceActiveTab } from '@/lib/guidanceActiveTab';
import { useLeftHandedMode } from '@/lib/useLeftHandedMode';
import {
  TUTORIAL_CALENDAR_EVENT_STEP,
  TUTORIAL_GOAL_GUIDANCE_STEP,
  TUTORIAL_HOME_OVERVIEW_STEP,
  TUTORIAL_WISHLIST_SHOPPING_STEP,
  uncompleteTutorialStep,
  completeTutorialStep,
  getTutorialProgress,
  isTutorialSessionActive,
  subscribeTutorialProgress,
} from '@/lib/tutorial';
import ScrollViewWithBar from '@/components/ScrollViewWithBar';
import { confirmSkipWholeTutorial, openNewChatAfterTutorial } from '@/lib/tutorialEnd';

const HOUR_HEIGHT = 60;
/** How long after the finger lifts to wait for a drag to start before releasing a long-press lock. */
const ARMED_DRAG_RELEASE_DELAY_MS = 250;
const INITIAL_SCALE = 1;
const ANDROID_CALENDAR_KEYBOARD_GAP = 10;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_LABEL_WIDTH = 50;
const CALENDAR_GRID_INSET = 18;
const TIME_LABEL_COLOR = '#96CDD6';
const CALENDAR_GRID_LINE_COLOR = '#96CDD6';
const INACTIVE_QUARTER_COLOR = '#888';
const EAZEE_EVENT_COLOR = '#032D32';
const ACTIVE_DRAG_COLOR = EAZEE_EVENT_COLOR;
const CREATE_SHEET_BACKGROUND = 'rgba(41, 41, 41, 0.7)';
const CREATE_SHEET_TEXT_COLOR = '#F5F7F8';
const CREATE_SHEET_MUTED_TEXT_COLOR = 'rgba(245, 247, 248, 0.72)';
const CREATE_SHEET_SEPARATOR_COLOR = 'rgba(245, 247, 248, 0.14)';
const EVENT_DETAILS_DIVIDER_COLOR = '#508087';
const EVENT_DETAILS_MEET_COLOR = '#AEE0E7';
const GOOGLE_DISCONNECTED_NOTICE_MESSAGE = 'Google account is not connected. Calendar sync will not work.\nTap to open Google connection settings.';
const CREATE_SHEET_COMPACT_INDEX = 0;
const CREATE_SHEET_FORM_INDEX = 1;
const CREATE_SHEET_EXPANDED_INDEX = 2;
const CREATE_SHEET_COMPACT_SNAP_POINT = '15%';
const CREATE_SHEET_FORM_SNAP_POINT = '45%';
const CREATE_SHEET_EXPANDED_SNAP_POINT = '95%';
const SAVE_BUTTON_FEEDBACK_MS = 180;
const EVENT_REVEAL_MAX_TOP_HOUR = 17;
const EVENT_REVEAL_BOTTOM_PADDING = 24;
const CALENDAR_TUTORIAL_EVENT_REVEAL_DELAY_MS = 2200;
const PENDING_GOOGLE_CREATE_SYNCS_STORAGE_KEY = 'calendar.pendingGoogleCreateSyncs.v1';
let hasShownGoogleDisconnectedToastThisLaunch = false;
let pendingGoogleCreateSyncStorageOperation: Promise<void> = Promise.resolve();

const GOOGLE_DISCONNECTED_NOTICE: CompactAiNotice = {
  kind: 'toast',
  message: GOOGLE_DISCONNECTED_NOTICE_MESSAGE,
  target: {
    type: 'screen',
    route: '/(tabs)/home',
    params: {
      manageAccount: 'true',
      manageAccountSection: 'google',
    },
  },
};

type ComposerCalendarEventDraft = {
  title: string;
  details: string;
  location: string;
  guests: string[];
  startDate: Date;
  endDate: Date;
  googleEventId?: string;
};

type PendingGoogleCreateSync = ComposerCalendarEventDraft & {
  localEventId: string;
  queuedAt: number;
};

type StoredPendingGoogleCreateSync = Omit<PendingGoogleCreateSync, 'startDate' | 'endDate'> & {
  startDateMs: number;
  endDateMs: number;
};

type CalendarTutorialStage = 'create' | 'waiting-event' | 'saving' | 'created';

const isGuestEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** The guest list plus any valid email still in the input, without duplicates. */
const withPendingGuest = (guests: string[], pendingText: string) => {
  const pending = pendingText.split(/[\s,]+/).map((email) => email.trim()).filter(isGuestEmail);
  return [...new Set([...guests, ...pending])];
};

const getGoogleEventIdForLocalEvent = (localEventId: string) => {
  let hash = 2166136261;
  for (let index = 0; index < localEventId.length; index += 1) {
    hash = Math.imul(hash ^ localEventId.charCodeAt(index), 16777619);
  }
  const hashText = (hash >>> 0).toString(32).padStart(7, '0');
  const idText = localEventId.toLowerCase().replace(/[^0-9a-v]/g, '');
  return `ev${hashText}${idText}`.slice(0, 1024);
};

const readPendingGoogleCreateSyncs = async (): Promise<PendingGoogleCreateSync[]> => {
  try {
    const raw = await AsyncStorage.getItem(PENDING_GOOGLE_CREATE_SYNCS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((sync: StoredPendingGoogleCreateSync) => {
      if (
        !sync ||
        typeof sync.localEventId !== 'string' ||
        !Number.isFinite(sync.startDateMs) ||
        !Number.isFinite(sync.endDateMs)
      ) {
        return [];
      }
      return [{
        ...sync,
        guests: Array.isArray(sync.guests) ? sync.guests : [],
        startDate: new Date(sync.startDateMs),
        endDate: new Date(sync.endDateMs),
      }];
    });
  } catch (error) {
    console.error('Error reading pending Google calendar syncs:', error);
    return [];
  }
};

const writePendingGoogleCreateSyncs = async (syncs: PendingGoogleCreateSync[]) => {
  const stored: StoredPendingGoogleCreateSync[] = syncs.map(({ startDate, endDate, ...sync }) => ({
    ...sync,
    startDateMs: startDate.getTime(),
    endDateMs: endDate.getTime(),
  }));
  await AsyncStorage.setItem(PENDING_GOOGLE_CREATE_SYNCS_STORAGE_KEY, JSON.stringify(stored));
};

const mutatePendingGoogleCreateSyncs = async (
  mutator: (syncs: PendingGoogleCreateSync[]) => PendingGoogleCreateSync[]
) => {
  const operation = pendingGoogleCreateSyncStorageOperation
    .catch(() => undefined)
    .then(async () => {
      const syncs = await readPendingGoogleCreateSyncs();
      await writePendingGoogleCreateSyncs(mutator(syncs));
    });
  pendingGoogleCreateSyncStorageOperation = operation.catch(() => undefined);
  await operation;
};

const queuePendingGoogleCreateSync = async (sync: PendingGoogleCreateSync) => {
  await mutatePendingGoogleCreateSyncs((syncs) => [
    ...syncs.filter((item) => item.localEventId !== sync.localEventId),
    sync,
  ]);
};

/** How far back app events are copied to Google Calendar when it is (re)connected. */
const GOOGLE_BACKFILL_LOOKBACK_MS = 30 * 24 * 60 * 60_000;

/**
 * App events that have no Google copy yet (made before Google was connected, or
 * a task sent to the calendar) join the pending queue, so the sync below copies
 * them to Google Calendar. Each gets a fixed Google id, so this never duplicates.
 */
const queueUnsyncedLocalEvents = async (now = Date.now()) => {
  const rows = await database
    .get<EventModel>('events')
    .query(
      Q.where('is_google_event', Q.notEq(true)),
      Q.or(Q.where('google_event_id', null), Q.where('google_event_id', '')),
      Q.where('end_date', Q.gte(now - GOOGLE_BACKFILL_LOOKBACK_MS))
    )
    .fetch();
  if (!rows.length) return;
  const queued = new Set((await readPendingGoogleCreateSyncs()).map((sync) => sync.localEventId));
  for (const row of rows) {
    if (queued.has(row.id) || !row.startDate || !row.endDate) continue;
    await queuePendingGoogleCreateSync({
      localEventId: row.id,
      queuedAt: now,
      title: String(row.title || ''),
      details: String(row.details || ''),
      location: String(row.location || ''),
      guests: [],
      startDate: new Date(row.startDate),
      endDate: new Date(row.endDate),
    });
  }
};

const removePendingGoogleCreateSync = async (localEventId: string) => {
  await mutatePendingGoogleCreateSyncs((syncs) => syncs.filter((sync) => sync.localEventId !== localEventId));
};

const IosCreateSheetContainer: React.FC<React.PropsWithChildren> = ({ children }) => (
  <FullWindowOverlay>{children}</FullWindowOverlay>
);

const GuestChip: React.FC<{ email: string; onRemove: () => void }> = ({ email, onRemove }) => (
  <View style={styles.guestChip}>
    <Text style={styles.guestChipText}>{email}</Text>
    <TouchableOpacity onPress={onRemove}>
      <Icon name="close" size={16} color="#666" />
    </TouchableOpacity>
  </View>
);

/**
 * The time wheels only pick a time of day. The new time goes on the day that keeps it nearest
 * the old one, so scrolling past midnight moves the day: 23 → 00 is the next day, 00 → 23 the
 * day before.
 */
const withWheelTime = (current: Date, picked: Date) => {
  const next = new Date(current);
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  const halfDay = 12 * 60 * 60 * 1000;
  const delta = next.getTime() - current.getTime();
  if (delta < -halfDay) next.setDate(next.getDate() + 1);
  else if (delta > halfDay) next.setDate(next.getDate() - 1);
  return next;
};

const CalendarScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  useEffect(() => {
    if (isFocused) {
      setGuidanceActiveTab('calendar');
    }
  }, [isFocused]);
  const navigation = useNavigation();
  const floatingTabBarInset = getFloatingTabBarInset(insets.bottom);
  const aiInputBottom = floatingTabBarInset - 6;
  const contentBottomPadding = floatingTabBarInset + 74;
  const calendarBackdropScrimHeight = Math.max(220, floatingTabBarInset + 156);
  const snackbarBottomOffset = (insets?.bottom || 0) + (Platform.OS === 'ios' ? 108 : 84);
  const createSheetContainerComponent = Platform.OS === 'ios' ? IosCreateSheetContainer : undefined;
  const tabBarBottomOffset = Platform.OS === 'android' ? 10 : 8;
  const tabBarHeight = 56;
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const createTitleInputRef = useRef<any>(null);
  const shouldFocusCreateTitleOnSheetExpandRef = useRef(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isAiInputFocused, setIsAiInputFocused] = useState(false);
  const isAiComposerActive = isKeyboardVisible || isAiInputFocused;
  const aiInputKeyboardBottom = Platform.OS === 'android' && isAiComposerActive ? ANDROID_CALENDAR_KEYBOARD_GAP : aiInputBottom;
  const activeContentBottomPadding =
    Platform.OS === 'android' && isAiComposerActive
      ? keyboardInset + 74 + ANDROID_CALENDAR_KEYBOARD_GAP
      : contentBottomPadding;

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const eventDetailsVisibility = useRef(new Animated.Value(0)).current;
  const createSheetVisibility = useRef(new Animated.Value(0)).current;
  const createSheetExpanded = useRef(new Animated.Value(0)).current;


  const router = useRouter();
  const { activeTarget, cancelGuidance, startGuidance } = useGuidance();
  const { user } = useAuthSession();
  const { isLeftHanded } = useLeftHandedMode();
  const [isCalendarTutorialPending, setIsCalendarTutorialPending] = useState(false);
  const isCalendarTutorialPendingRef = useRef(false);
  const calendarTutorialStageRef = useRef<CalendarTutorialStage | null>(null);
  // Mirrors the ref so the screen can show the walkthrough's instructions while an event is made.
  const [calendarTutorialStage, setCalendarTutorialStageState] = useState<CalendarTutorialStage | null>(null);
  const setCalendarTutorialStage = useCallback((stage: CalendarTutorialStage | null) => {
    calendarTutorialStageRef.current = stage;
    setCalendarTutorialStageState(stage);
  }, []);
  const calendarTutorialEventCreatedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** An event was made in this walkthrough, so going back to "create" can move on without another. */
  const hasMadeCalendarTutorialEventRef = useRef(false);
  const completeCalendarGuidanceAction = useCallback((action: string) => {
    if (activeTarget?.type === 'screen' && activeTarget.params?.calendarAction === action) {
      cancelGuidance();
    }
  }, [activeTarget, cancelGuidance]);
  const {
    openEventId,
    openEventSource,
    openNonce,
    scrollToDateTime,
    scrollNonce,
    calendarAction,
    calendarActionNonce,
  } = useGlobalSearchParams<{
    openEventId?: string;
    openEventSource?: string;
    openNonce?: string;
    scrollToDateTime?: string;
    scrollNonce?: string;
    calendarAction?: string;
    calendarActionNonce?: string;
  }>();
  const skipHomeTutorialToChat = useCallback(async () => {
    const uid = user?.uid || '';
    if (!uid) return;

    await completeTutorialStep(uid, TUTORIAL_HOME_OVERVIEW_STEP).catch((error) => {
      console.warn('Failed to persist skipped home tutorial completion', error);
    });
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/chat',
        params: { chatAction: 'tutorial-open-chat' },
      },
      'Chat',
      {
        onSkipSegment: () => {
          void completeTutorialStep(uid, TUTORIAL_WISHLIST_SHOPPING_STEP).catch((error) => {
            console.warn('Failed to persist skipped wishlist tutorial completion', error);
          });
          openNewChatAfterTutorial();
        },
      }
    );
  }, [startGuidance, user?.uid]);
  const startHomeTutorialGuidance = useCallback(() => {
    setCalendarTutorialStage(null);
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/home',
        params: { homeAction: 'tutorial-open-home' },
      },
      'Home',
      {
        onSkipSegment: () => {
          void skipHomeTutorialToChat();
        },
      }
    );
  }, [skipHomeTutorialToChat, startGuidance, setCalendarTutorialStage]);
  const completeCalendarTutorial = useCallback(async () => {
    const uid = user?.uid || '';
    if (!uid) return;

    await completeTutorialStep(uid, TUTORIAL_CALENDAR_EVENT_STEP).catch((error) => {
      console.warn('Failed to persist calendar tutorial completion', error);
    });
    isCalendarTutorialPendingRef.current = false;
    setIsCalendarTutorialPending(false);
  }, [user?.uid]);
  const completeCalendarTutorialAndStartHome = useCallback(async () => {
    await completeCalendarTutorial();
    startHomeTutorialGuidance();
  }, [completeCalendarTutorial, startHomeTutorialGuidance]);
  const showCalendarTutorialEventCreated = useCallback(async () => {
    if (!isCalendarTutorialPendingRef.current || calendarTutorialStageRef.current === 'created') {
      return;
    }

    if (calendarTutorialEventCreatedTimeoutRef.current) {
      clearTimeout(calendarTutorialEventCreatedTimeoutRef.current);
      calendarTutorialEventCreatedTimeoutRef.current = null;
    }
    setCalendarTutorialStage('created');
    await completeCalendarTutorial();
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/home',
        params: { homeAction: 'tutorial-open-home' },
      },
      'event created',
      {
        onSkipSegment: () => {
          void skipHomeTutorialToChat();
        },
      }
    );
  }, [completeCalendarTutorial, skipHomeTutorialToChat, startGuidance, setCalendarTutorialStage]);
  const scheduleCalendarTutorialEventCreated = useCallback(() => {
    if (!isCalendarTutorialPendingRef.current || calendarTutorialStageRef.current === 'created') {
      return;
    }

    if (calendarTutorialEventCreatedTimeoutRef.current) {
      clearTimeout(calendarTutorialEventCreatedTimeoutRef.current);
    }
    hasMadeCalendarTutorialEventRef.current = true;
    setCalendarTutorialStage('saving');
    calendarTutorialEventCreatedTimeoutRef.current = setTimeout(() => {
      calendarTutorialEventCreatedTimeoutRef.current = null;
      void showCalendarTutorialEventCreated();
    }, CALENDAR_TUTORIAL_EVENT_REVEAL_DELAY_MS);
  }, [showCalendarTutorialEventCreated, setCalendarTutorialStage]);
  const hideCalendarTutorialCreateCard = useCallback(() => {
    if (
      !isCalendarTutorialPendingRef.current ||
      calendarTutorialStageRef.current !== 'create'
    ) {
      return;
    }

    setCalendarTutorialStage('waiting-event');
    cancelGuidance();
  }, [cancelGuidance, setCalendarTutorialStage]);
  const openedFromParamsRef = useRef<string | null>(null);
  const scrollFromParamsRef = useRef<string | null>(null);
  const actionFromParamsRef = useRef<string | null>(null);
  const isOpeningFromParamsRef = useRef(false);
  const autoReplyMicNoticeRef = useRef<object | null>(null);
  const [pendingOpen, setPendingOpen] = useState<{ id: string; source: 'google' | 'local' } | null>(null);
  const [pendingScrollDate, setPendingScrollDate] = useState<Date | null>(null);
  const pendingScrollAnimatedRef = useRef(false);

  const { getAccessToken, isLoading: isTokenLoading, googleConnectionState } = useTokens();
  const isGoogleConnected = googleConnectionState === 'connected';

  useEffect(() => {
    let isActive = true;

    const refreshTutorial = async () => {
      const uid = user?.uid || '';
      if (!uid) {
        if (isActive) {
          isCalendarTutorialPendingRef.current = false;
          setIsCalendarTutorialPending(false);
          setCalendarTutorialStage(null);
        }
        return;
      }

      const progress = await getTutorialProgress(uid).catch(() => null);
      const pending = isTutorialSessionActive(uid) &&
        !!progress?.hasStarted &&
        progress.completedSteps.includes(TUTORIAL_GOAL_GUIDANCE_STEP) &&
        !progress.completedSteps.includes(TUTORIAL_CALENDAR_EVENT_STEP);

      if (isActive) {
        isCalendarTutorialPendingRef.current = pending;
        setIsCalendarTutorialPending(pending);
        if (!pending) {
          setCalendarTutorialStage(null);
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
  }, [user?.uid, setCalendarTutorialStage]);

  useEffect(() => () => {
    if (calendarTutorialEventCreatedTimeoutRef.current) {
      clearTimeout(calendarTutorialEventCreatedTimeoutRef.current);
      calendarTutorialEventCreatedTimeoutRef.current = null;
    }
  }, []);

  const showCalendarTutorialCreate = useCallback(() => {
    if (!isCalendarTutorialPendingRef.current) {
      return;
    }

    setCalendarTutorialStage('create');
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/calendar',
        params: { calendarAction: 'tutorial-create' },
      },
      'Calendar',
      {
        onSkipSegment: () => {
          void completeCalendarTutorialAndStartHome();
        },
        // "Create an event to finish this step": next only works once an event exists. Using
        // the input bar, the Eazee button or a time slot hides this card while they make one.
        onNext: hasMadeCalendarTutorialEventRef.current
          ? () => { void showCalendarTutorialEventCreated(); }
          : undefined,
        restore: () => restoreCalendarTutorialCreateRef.current(),
      }
    );
  }, [completeCalendarTutorialAndStartHome, showCalendarTutorialEventCreated, startGuidance, setCalendarTutorialStage]);

  // Back from the Home handoff: the calendar part is in progress again, at "create".
  const restoreCalendarTutorialCreateRef = useRef(() => {});
  restoreCalendarTutorialCreateRef.current = () => {
    showGuidanceTab('calendar');
    if (!isCalendarTutorialPendingRef.current) {
      isCalendarTutorialPendingRef.current = true;
      setIsCalendarTutorialPending(true);
      const uid = user?.uid || '';
      if (uid) void uncompleteTutorialStep(uid, TUTORIAL_CALENDAR_EVENT_STEP);
    }
    showCalendarTutorialCreate();
  };

  useEffect(() => {
    if (!isFocused) {
      // Left during "create" (e.g. tutorial back to To Do): show it again on return.
      if (calendarTutorialStageRef.current === 'create') setCalendarTutorialStage(null);
      return;
    }
    if (!isCalendarTutorialPending || calendarTutorialStageRef.current) {
      return;
    }

    showCalendarTutorialCreate();
  }, [isCalendarTutorialPending, isFocused, setCalendarTutorialStage, showCalendarTutorialCreate]);


  //location google maps places
  const [location, setLocation] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);

  // edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventModel | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editGuests, setEditGuests] = useState<string[]>([]);
  const [editStart, setEditStart] = useState<Date | null>(null);
  const [editEnd, setEditEnd] = useState<Date | null>(null);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);
  const [activeEditPicker, setActiveEditPicker] = useState<'date' | 'start' | 'end' | null>(null);
  const [pendingEditPickerValue, setPendingEditPickerValue] = useState<Date | null>(null);
  const [activeCreatePicker, setActiveCreatePicker] = useState<'date' | 'start' | 'end' | null>(null);
  const [pendingCreatePickerValue, setPendingCreatePickerValue] = useState<Date | null>(null);
  const [isEditPickerClosing, setIsEditPickerClosing] = useState(false);
  const editPickerDismissUntilRef = useRef(0);
  const editPickerDismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  type SearchItem = { id: string; title: string; startDate: Date; endDate?: Date; isGoogleEvent?: boolean; isAllDay?: boolean; source: 'local' | 'google'; googleEventId?: string };
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<any>(null);

  const glowAnim = useRef(new Animated.Value(0)).current;
  const compactMutationRefreshRef = useRef<((info: { name: string; result: any }) => Promise<void>) | null>(null);
  const compactResyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredOverlayCleanupRef = useRef<{ cancel?: () => void } | null>(null);
  const deferredPrefetchRef = useRef<{ cancel?: () => void } | null>(null);
  const {
    inputValue,
    setInputValue,
    submit,
    submitVoiceText,
    wasLastRequestSpoken,
    isRunning: isAiRunning,
    notice: aiNotice,
    dismissNotice,
    confirmPendingAction,
    cancelPending,
    stopRequest: stopAiRequest,
    getHandoffChatParams,
  } = useCompactTabAI('calendar', {
    onMutationSuccess: async (info) => {
      await compactMutationRefreshRef.current?.(info);
    },
  });
  useCompactGuidanceBridge(aiNotice, dismissNotice);
  const {
    isListening,
    microphoneColor,
    handleMicrophonePress,
    cancelListening,
  } = useCompactVoiceInput({
    inputValue,
    setInputValue,
    glowAnim,
    onFinalTranscript: submitVoiceText,
  });

  const handleCalendarAiSendPress = useCallback(() => {
    if (isAiRunning || !inputValue.trim()) return;
    hideCalendarTutorialCreateCard();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void submit();
  }, [hideCalendarTutorialCreateCard, inputValue, isAiRunning, submit]);

  const handleCalendarAiMicrophonePress = useCallback(() => {
    if (isAiRunning) return;
    hideCalendarTutorialCreateCard();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    handleMicrophonePress();
  }, [handleMicrophonePress, hideCalendarTutorialCreateCard, isAiRunning]);

  useEffect(() => {
    const replyNotice =
      aiNotice?.kind === 'clarify' || aiNotice?.kind === 'confirm' ? aiNotice : null;

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
  }, [aiNotice, cancelListening, handleMicrophonePress, isAiRunning, isListening, wasLastRequestSpoken]);

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
      setKeyboardInset(Platform.OS === 'android' ? keyboardOverlap : keyboardHeight);
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
      setKeyboardInset(0);
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

  useEffect(() => {
    return () => {
      if (editPickerDismissTimeoutRef.current) {
        clearTimeout(editPickerDismissTimeoutRef.current);
      }
    };
  }, []);

  // Group search results by date (YYYY-MM-DD)
  const groupedSearchResults = useMemo(() => {
    if (!searchResults || searchResults.length === 0) return [] as { dateKey: string; date: Date; items: SearchItem[] }[];
    const groups = new Map<string, { dateKey: string; date: Date; items: SearchItem[] }>();
    for (const item of searchResults) {
      const d = new Date(item.startDate);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!groups.has(dateKey)) {
        const dateOnly = new Date(d);
        dateOnly.setHours(0, 0, 0, 0);
        groups.set(dateKey, { dateKey, date: dateOnly, items: [] });
      }
      groups.get(dateKey)!.items.push(item);
    }
    const arr = Array.from(groups.values());
    arr.sort((a, b) => a.date.getTime() - b.date.getTime());
    // within each date, sort by start time
    arr.forEach(g => g.items.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()));
    return arr;
  }, [searchResults]);

  // time slot
  const timelineScrollViewRef = useRef<ScrollView>(null);
  const weekPanelScrollRefs = useRef<Record<string, ScrollView | null>>({});

  // const [request, response, promptAsync] = Google.useAuthRequest({
  //   clientId: '596516635657-3h7laa63ptimmc57bo71tqpsj71540f0.apps.googleusercontent.com',
  //   scopes: ['https://www.googleapis.com/auth/calendar'],
  //   redirectUri: makeRedirectUri({
  //     scheme: 'com.eazee.ai',
  //     path: '/(tabs)/calendar',
  //   }),
  // });

  // useEffect(() => {
  //   WebBrowser.maybeCompleteAuthSession();
  //   GoogleSignin.configure({
  //     scopes: ['https://www.googleapis.com/auth/calendar'],
  //     webClientId: '596516635657-3h7laa63ptimmc57bo71tqpsj71540f0.apps.googleusercontent.com',
  //     offlineAccess: true,
  //   });
  // }, []);

  // event details
  const [selectedEvent, setSelectedEvent] = useState<EventModel | null>(null);
  const [eventDetails, setEventDetails] = useState<any>(null);
  const [openingEventId, setOpeningEventId] = useState<string | null>(null);
  const [revealingSlotRange, setRevealingSlotRange] = useState<{ startDate: Date; endDate: Date } | null>(null);
  const eventDetailsBottomSheetRef = useRef<BottomSheet>(null);
  const [isEventDetailsOpen, setIsEventDetailsOpen] = useState(false);
  const [pendingEventScrollDate, setPendingEventScrollDate] = useState<Date | null>(null);
  const shouldForcePendingEventScrollRef = useRef(false);
  const [timelineLayoutReady, setTimelineLayoutReady] = useState(0);
  const autoScrolledWeekKeyRef = useRef<string | null>(null);
  const scrollIntentSequenceRef = useRef(0);
  const revealEventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealSlotRange = useCallback((startDate: Date, endDate: Date) => {
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;
    if (revealEventTimeoutRef.current) {
      clearTimeout(revealEventTimeoutRef.current);
    }
    setRevealingSlotRange(null);
    requestAnimationFrame(() => {
      setRevealingSlotRange({ startDate, endDate });
      revealEventTimeoutRef.current = setTimeout(() => {
        setRevealingSlotRange(null);
        revealEventTimeoutRef.current = null;
      }, 2200);
    });
  }, []);
  const getAutoScrollWeekKey = useCallback((targetWeekStart: Date) => {
    const today = new Date();
    return `${targetWeekStart.getTime()}:${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  }, []);
  const resetAutoScrolledWeek = useCallback(() => {
    autoScrolledWeekKeyRef.current = null;
  }, []);
  const {
    weekStart,
    setWeekStart,
    weekStartRef,
    currentWeekKey,
    pagerResetWeekStart,
    setPagerResetWeekStart,
    setPagerWeekStart,
    setProgrammaticWeekStarts,
    activeVisibleWeekStarts,
  } = useCalendarWeekState(resetAutoScrolledWeek);

  const {
    isLoading,
    events,
    weekEventsByKey,
    weekEventsByKeyRef,
    weekLoadingByKey,
    optimisticOverrides,
    applyOptimisticEventMove,
    confirmOptimisticEventMove,
    revertOptimisticEventMove,
    updateCurrentWeekEvents,
    fetchEventsForWeek,
    prefetchWeeksAround,
    cancelCalendarEventRequests,
  } = useCalendarEvents({
    currentWeekKey,
    weekStartRef,
    getAccessToken,
    isGoogleConnected,
    isTokenLoading,
  });

  // optimistic overrides for transient UI updates (by id)
  const dropInProgressRef = useRef(false);
  const dragCommitSequenceRef = useRef(0);
  const deletedLocalEventIdsRef = useRef(new Set<string>());

  // bottom toast/snackbar state
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    undo?: (() => void) | null;
    position?: 'top' | 'bottom';
  }>({ visible: false, message: '', undo: null, position: 'bottom' });
  const [isGoogleDisconnectedNoticeVisible, setIsGoogleDisconnectedNoticeVisible] = useState(false);
  const snackbarTimeoutRef = useRef<any>(null);
  const googleDisconnectedNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideSnackbar = useCallback(() => {
    if (snackbarTimeoutRef.current) {
      clearTimeout(snackbarTimeoutRef.current);
      snackbarTimeoutRef.current = null;
    }
    setSnackbar((s) => ({ ...s, visible: false }));
  }, []);

  const showSnackbar = useCallback((message: string, undo?: () => void, position: 'top' | 'bottom' = 'bottom') => {
    if (snackbarTimeoutRef.current) {
      clearTimeout(snackbarTimeoutRef.current);
      snackbarTimeoutRef.current = null;
    }
    setSnackbar({ visible: true, message, undo: undo || null, position });
    snackbarTimeoutRef.current = setTimeout(() => {
      hideSnackbar();
    }, 3500);
  }, [hideSnackbar]);

  const hideGoogleDisconnectedNotice = useCallback(() => {
    if (googleDisconnectedNoticeTimeoutRef.current) {
      clearTimeout(googleDisconnectedNoticeTimeoutRef.current);
      googleDisconnectedNoticeTimeoutRef.current = null;
    }
    setIsGoogleDisconnectedNoticeVisible(false);
  }, []);

  const handleGoogleDisconnectedNoticePress = useCallback(() => {
    hideGoogleDisconnectedNotice();
    router.push({
      pathname: '/(tabs)/home',
      params: {
        manageAccount: 'true',
        manageAccountSection: 'google',
        manageAccountNonce: String(Date.now()),
      },
    });
  }, [hideGoogleDisconnectedNotice, router]);

  const formatRelativeTarget = useCallback((date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const diffDays = differenceInCalendarDays(d, today);
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 0) return 'Today';
    return format(date, 'EEE, MMM d');
  }, []);

  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);

  // time slot scale
  const [scale, setScale] = useState(INITIAL_SCALE);
  const scaleRef = useRef(INITIAL_SCALE); // callback latest value
  const pinchStartScaleRef = useRef(INITIAL_SCALE); 
  const [isPinching, setIsPinching] = useState(false); // disable normal scroll to not mess with zoom in or out

  // drag-to-move state
  const [draggingEvent, setDraggingEvent] = useState<EventModel | null>(null);
  const draggingEventRef = useRef<EventModel | null>(null);
  draggingEventRef.current = draggingEvent;
  const [dragPreviewRect, setDragPreviewRect] = useState<{
    eventId: string;
    left: number;
    top: number;
    width: number;
    height: number;
    event: EventModel;
    showTitle?: boolean;
    mode?: 'dragging' | 'committing';
  } | null>(null);
  const dragPreviewRectRef = useRef<any>(null);
  const dragX = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const snappedDragX = useRef(new Animated.Value(0)).current;
  const snappedDragY = useRef(new Animated.Value(0)).current;
  const createSlotPreviewLeft = useRef(new Animated.Value(0)).current;
  const createSlotPreviewTop = useRef(new Animated.Value(0)).current;
  const createSlotPreviewHeight = useRef(new Animated.Value(0)).current;
  const [dragReadyEventId, setDragReadyEventId] = useState<string | null>(null);
  const dragReadyEventIdRef = useRef<string | null>(null);
  dragReadyEventIdRef.current = dragReadyEventId;
  const eventPanActiveRef = useRef(false);

  // Active quarter highlight during drag: updates only when snapped quarter changes
  const dragHighlightRef = useRef<{ hour: number; minute: number } | null>(null);
  // Native refs for label nodes to avoid re-renders on drag
  const quarterRefs = useRef<Record<string, any>>({});
  const hourRefs = useRef<Record<string, any>>({});

  const calendarPanelWidth = Dimensions.get('window').width - CALENDAR_GRID_INSET * 2;
  const dayColumnWidth = (calendarPanelWidth - TIME_LABEL_WIDTH) / DAYS_OF_WEEK.length;

  // Auto-scroll while dragging
  const scrollYRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const scrollViewTopInWindowRef = useRef(0);
  const autoScrollIntervalRef = useRef<any>(null);
  const autoScrollAccumYRef = useRef(0);
  const autoScrollOffsetY = useRef(new Animated.Value(0)).current;
  const autoScrollTickRef = useRef<(() => void) | null>(null);

  const syncWeekPanelScrollViews = useCallback(() => {
    const targetY = scrollYRef.current || 0;
    const currentKey = getCalendarWeekKey(weekStartRef.current);
    Object.entries(weekPanelScrollRefs.current).forEach(([key, scrollView]) => {
      if (!scrollView || key === currentKey) return;
      try {
        (scrollView as any).scrollTo({ y: targetY, animated: false });
      } catch {}
    });
  }, [weekStartRef]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback((direction: 1 | -1) => {
    if (autoScrollIntervalRef.current) return;
    autoScrollIntervalRef.current = setInterval(() => {
      const scrollView = timelineScrollViewRef.current;
      if (!scrollView) return;

      const currentScale = scaleRef.current;
      const step = Math.max(4, Math.floor(6 * currentScale));
      const totalContentHeight = 24 * HOUR_HEIGHT * currentScale;
      const viewH = scrollViewHeightRef.current || 0;
      const maxY = Math.max(0, totalContentHeight - viewH);
      const currentY = scrollYRef.current || 0;

      const nextY = Math.min(maxY, Math.max(0, currentY + direction * step));
      if (nextY !== currentY) {
        scrollYRef.current = nextY;
        (scrollView as any).scrollTo({ y: nextY, animated: false });
        // keep the dragged card under the finger by offsetting translateY
        autoScrollAccumYRef.current += direction * step;
        autoScrollOffsetY.setValue(autoScrollAccumYRef.current);
        autoScrollTickRef.current?.();
      } else {
        // hit bounds, stop
        stopAutoScroll();
      }
    }, 16);
  }, [autoScrollOffsetY, stopAutoScroll]);

  const lastDragSnapRef = useRef<string | null>(null);
  const clearDragHighlight = useCallback(() => {
    dragHighlightRef.current = null;
    try {
      Object.keys(quarterRefs.current).forEach((k) => {
        const node = quarterRefs.current[k];
        if (node && node.setNativeProps) node.setNativeProps({ style: { color: INACTIVE_QUARTER_COLOR, opacity: 0 } });
      });
      Object.keys(hourRefs.current).forEach((k) => {
        const node = hourRefs.current[k];
        if (node && node.setNativeProps) node.setNativeProps({ style: { color: TIME_LABEL_COLOR } });
      });
    } catch {}
  }, []);

  const highlightDragTime = useCallback((date: Date) => {
    const next = { hour: date.getHours(), minute: date.getMinutes() };
    const prev = dragHighlightRef.current;
    if (prev && prev.hour === next.hour && prev.minute === next.minute) {
      return;
    }

    try {
      if (prev) {
        const prevKey = `${prev.hour}-${prev.minute}`;
        const prevNode = quarterRefs.current[prevKey];
        if (prevNode && prevNode.setNativeProps) {
          prevNode.setNativeProps({ style: { color: INACTIVE_QUARTER_COLOR, opacity: 0 } });
        }
      }

      const nextKey = `${next.hour}-${next.minute}`;
      const nextNode = quarterRefs.current[nextKey];
      if (nextNode && nextNode.setNativeProps) {
        nextNode.setNativeProps({ style: { color: ACTIVE_DRAG_COLOR, opacity: 1 } });
      }

      const prevHour = prev ? `${prev.hour}` : null;
      if (prevHour) {
        const prevHourNode = hourRefs.current[prevHour];
        if (prevHourNode && prevHourNode.setNativeProps) {
          prevHourNode.setNativeProps({ style: { color: TIME_LABEL_COLOR } });
        }
      }

      const hourNode = hourRefs.current[`${next.hour}`];
      if (hourNode && hourNode.setNativeProps) {
        hourNode.setNativeProps({
          style: { color: next.minute === 0 ? ACTIVE_DRAG_COLOR : TIME_LABEL_COLOR },
        });
      }
    } catch {}

    dragHighlightRef.current = next;
  }, []);

  const resetDrag = useCallback(() => {
    lastDragSnapRef.current = null;
    setDraggingEvent(null);
    dragPreviewRectRef.current = null;
    setDragPreviewRect(null);
    setDragReadyEventId(null);
    autoScrollAccumYRef.current = 0;
    autoScrollOffsetY.setValue(0);
    autoScrollTickRef.current = null;
    stopAutoScroll();
    clearDragHighlight();
    requestAnimationFrame(() => {
      snappedDragX.setValue(0);
      snappedDragY.setValue(0);
    });
  }, [autoScrollOffsetY, clearDragHighlight, snappedDragX, snappedDragY, stopAutoScroll]);

  /**
   * A long press arms an event for dragging, which locks scrolling and taps. If the finger
   * lifts without the drag ever starting, the drag handler can miss it (its release may
   * arrive before the long press), leaving the calendar locked. This releases it.
   */
  const releaseArmedEventDrag = useCallback((eventId: string) => {
    setTimeout(() => {
      if (eventPanActiveRef.current || dropInProgressRef.current) return;
      if (dragReadyEventIdRef.current !== eventId && String(draggingEventRef.current?.id || '') !== eventId) return;
      resetDrag();
    }, ARMED_DRAG_RELEASE_DELAY_MS);
  }, [resetDrag]);

  const commitDragPreviewAtTarget = useCallback((daysDelta: number, minutesDelta: number) => {
    const currentPreview = dragPreviewRectRef.current || dragPreviewRect;
    if (!currentPreview) return;

    const committedPreview = {
      ...currentPreview,
      left: currentPreview.left + daysDelta * dayColumnWidth,
      top: currentPreview.top + (minutesDelta / 60) * HOUR_HEIGHT * scaleRef.current,
      mode: 'committing',
    };
    dragPreviewRectRef.current = committedPreview;
    setDragPreviewRect(committedPreview);
    setDraggingEvent(null);
    setDragReadyEventId(null);
    lastDragSnapRef.current = null;
    autoScrollAccumYRef.current = 0;
    autoScrollOffsetY.setValue(0);
    autoScrollTickRef.current = null;
    stopAutoScroll();
    clearDragHighlight();
  }, [autoScrollOffsetY, clearDragHighlight, dayColumnWidth, dragPreviewRect, stopAutoScroll]);

  const clearCommittedDragPreview = useCallback(() => {
    requestAnimationFrame(() => {
      dragPreviewRectRef.current = null;
      setDragPreviewRect(null);
      requestAnimationFrame(() => {
        snappedDragX.setValue(0);
        snappedDragY.setValue(0);
      });
    });
  }, [snappedDragX, snappedDragY]);

  const setDragPreviewRectFromPanel = useCallback((rect: any) => {
    dragPreviewRectRef.current = rect;
    setDragPreviewRect(rect);
  }, []);

  const getDisplayedEventRange = useCallback((event: EventModel) => {
    const override = optimisticOverrides[String(event.id)];
    return {
      startDate: new Date(override ? override.startDate : event.startDate),
      endDate: new Date(override ? override.endDate : event.endDate),
    };
  }, [optimisticOverrides]);

  const isEventMovable = useCallback((event: EventModel) => {
    if (event.isGoogleEvent || event.googleEventId) {
      return (event as any).editable !== false;
    }
    return true;
  }, []);

  const getBoundedDrag = (event: EventModel, tx: number, ty: number, extraY = 0) => {
    const { startDate: baseStart, endDate: baseEnd } = getDisplayedEventRange(event);
    const visibleStart = baseStart < weekStart ? new Date(weekStart) : new Date(baseStart);
    const startMinutes = visibleStart.getHours() * 60 + visibleStart.getMinutes();
    const durationMinutes = Math.max(15, Math.round((baseEnd.getTime() - baseStart.getTime()) / 60000));
    const maxStartMinutes = Math.max(0, 24 * 60 - Math.min(durationMinutes, 24 * 60));
    const pxPerMinute = (HOUR_HEIGHT * scaleRef.current) / 60;
    const rawMinutesDelta = Math.round(((ty + extraY) / pxPerMinute) / 15) * 15;
    const nextStartMinutes = Math.min(maxStartMinutes, Math.max(0, startMinutes + rawMinutesDelta));
    const minutesDelta = nextStartMinutes - startMinutes;
    const visibleDayIndex = Math.min(
      DAYS_OF_WEEK.length - 1,
      Math.max(0, differenceInCalendarDays(visibleStart, weekStart))
    );
    const rawDaysDelta = Math.round(tx / dayColumnWidth);
    const daysDelta = Math.min(
      DAYS_OF_WEEK.length - 1 - visibleDayIndex,
      Math.max(-visibleDayIndex, rawDaysDelta)
    );

    return {
      daysDelta,
      minutesDelta,
      snappedX: daysDelta * dayColumnWidth,
      snappedY: minutesDelta * pxPerMinute,
    };
  };

  const onEventDrag = Animated.event(
    [{ nativeEvent: { translationX: dragX, translationY: dragY } }],
    {
      useNativeDriver: false,
      listener: (evt: any) => {
        if (!draggingEvent) return;

        const tx = evt && evt.nativeEvent ? evt.nativeEvent.translationX || 0 : 0;
        const ty = evt && evt.nativeEvent ? evt.nativeEvent.translationY || 0 : 0;
        const { daysDelta, minutesDelta, snappedX, snappedY } = getBoundedDrag(
          draggingEvent,
          tx,
          ty,
          autoScrollAccumYRef.current || 0
        );
        const snapKey = `${daysDelta}:${minutesDelta}`;

        if (lastDragSnapRef.current !== snapKey) {
          lastDragSnapRef.current = snapKey;
          // store snapped deltas; compose auto-scroll only in transform
          snappedDragX.setValue(snappedX);
          snappedDragY.setValue(snappedY);
        }

        // Auto-scroll near edges during drag
        const absY = evt?.nativeEvent?.absoluteY || 0;
        const top = scrollViewTopInWindowRef.current || 0;
        const viewH = scrollViewHeightRef.current || 0;
        const edge = 40; // px threshold
        const topEdge = top + edge;
        const bottomEdge = top + viewH - edge;

        if (absY > 0 && viewH > 0) {
          if (absY < topEdge) {
            startAutoScroll(-1);
          } else if (absY > bottomEdge) {
            startAutoScroll(1);
          } else {
            stopAutoScroll();
          }
        }

        const { startDate: base } = getDisplayedEventRange(draggingEvent);
        const newDate = new Date(base);
        newDate.setDate(newDate.getDate() + daysDelta);
        newDate.setMinutes(newDate.getMinutes() + minutesDelta);
        const next = { hour: newDate.getHours(), minute: newDate.getMinutes() };
        const prev = dragHighlightRef.current;
        if (!prev || prev.hour !== next.hour || prev.minute !== next.minute) {
          // update highlight purely via native props
          try {
            // reset previous quarter to hidden
            if (prev) {
              const prevKey = `${prev.hour}-${prev.minute}`;
              const prevNode = quarterRefs.current[prevKey];
              if (prevNode && prevNode.setNativeProps) prevNode.setNativeProps({ style: { color: INACTIVE_QUARTER_COLOR, opacity: 0 } });
            }
            // set current quarter visible
            const nextKey = `${next.hour}-${next.minute}`;
            const nextNode = quarterRefs.current[nextKey];
            if (nextNode && nextNode.setNativeProps) nextNode.setNativeProps({ style: { color: ACTIVE_DRAG_COLOR, opacity: 1 } });

            // hour label highlighting: only highlight at minute 0
            const prevHour = prev ? `${prev.hour}` : null;
            if (prevHour) {
              const prevHourNode = hourRefs.current[prevHour];
              if (prevHourNode && prevHourNode.setNativeProps) prevHourNode.setNativeProps({ style: { color: TIME_LABEL_COLOR } });
            }
            const hourNode = hourRefs.current[`${next.hour}`];
            if (hourNode && hourNode.setNativeProps) {
              if (next.minute === 0) {
                hourNode.setNativeProps({ style: { color: ACTIVE_DRAG_COLOR } });
              } else {
                hourNode.setNativeProps({ style: { color: TIME_LABEL_COLOR } });
              }
            }
          } catch {}
          dragHighlightRef.current = next;
        }

        // Remove per-move logging to avoid lag
      }
    }
  );

  const [selectedSlot, setSelectedSlot] = useState<{ date: Date; hour: number } | null>(null);
  const [newEventStart, setNewEventStart] = useState<Date | null>(null);
  const [newEventEnd, setNewEventEnd] = useState<Date | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDetailsText, setEventDetailsText] = useState('');
  const [isEventDetailsInputFocused, setIsEventDetailsInputFocused] = useState(false);
  const [createSlotResizeEdge, setCreateSlotResizeEdge] = useState<CreateSlotResizeEdge | null>(null);
  const createSlotResizeEdgeRef = useRef<CreateSlotResizeEdge | null>(null);
  const createSlotResizeTranslationYRef = useRef(0);
  const [isCreateSlotMoving, setIsCreateSlotMoving] = useState(false);
  const createSlotResizeBaseRef = useRef<{
    edge: CreateSlotResizeEdge;
    day: Date;
    startMinutes: number;
    endMinutes: number;
    snapKey: string | null;
  } | null>(null);
  const createSlotMoveBaseRef = useRef<{
    dayIndex: number;
    startMinutes: number;
    endMinutes: number;
    snapKey: string | null;
  } | null>(null);
  const createSlotMoveCancellationFallbackRef = useRef<{ startDate: Date; endDate: Date } | null>(null);
  const createSlotMoveTranslationRef = useRef({ x: 0, y: 0 });
  const createSlotLiveRangeRef = useRef<{ startDate: Date; endDate: Date } | null>(null);
  const isCreateSlotGestureActiveRef = useRef(false);

  const getCreateSlotPreviewMetrics = useCallback((startDate: Date, endDate: Date, targetWeekStart = weekStartRef.current) => {
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      return null;
    }

    const dayIndex = differenceInCalendarDays(startDate, targetWeekStart);
    if (dayIndex < 0 || dayIndex >= DAYS_OF_WEEK.length) {
      return null;
    }

    const dayStart = new Date(startDate);
    dayStart.setHours(0, 0, 0, 0);
    const nextDay = addDays(dayStart, 1);
    const visibleStart = startDate < dayStart ? dayStart : startDate;
    const visibleEnd = endDate > nextDay ? nextDay : endDate;
    if (visibleEnd <= visibleStart) {
      return null;
    }

    const startMinutes = getMinutesSinceStartOfDay(visibleStart);
    const endMinutes = visibleEnd.getTime() === nextDay.getTime()
      ? CALENDAR_DAY_MINUTES
      : getMinutesSinceStartOfDay(visibleEnd);
    const pxPerMinute = (HOUR_HEIGHT * scaleRef.current) / 60;

    return {
      dayIndex,
      left: TIME_LABEL_WIDTH + dayIndex * dayColumnWidth,
      top: startMinutes * pxPerMinute,
      height: Math.max(1, (endMinutes - startMinutes) * pxPerMinute),
    };
  }, [dayColumnWidth, weekStartRef]);

  const setCreateSlotPreviewValues = useCallback((startDate: Date, endDate: Date, targetWeekStart = weekStartRef.current) => {
    const metrics = getCreateSlotPreviewMetrics(startDate, endDate, targetWeekStart);
    if (!metrics) {
      return null;
    }

    createSlotPreviewLeft.setValue(metrics.left);
    createSlotPreviewTop.setValue(metrics.top);
    createSlotPreviewHeight.setValue(metrics.height);
    createSlotLiveRangeRef.current = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    };
    return metrics;
  }, [
    createSlotPreviewHeight,
    createSlotPreviewLeft,
    createSlotPreviewTop,
    getCreateSlotPreviewMetrics,
    weekStartRef,
  ]);

  const commitCreateSlotRange = useCallback((startDate: Date, endDate: Date) => {
    const metrics = setCreateSlotPreviewValues(startDate, endDate);
    if (!metrics) {
      return;
    }

    setSelectedSlot({ date: startDate, hour: startDate.getHours() });
    setSelectedSlotKey(`${metrics.dayIndex}-${startDate.getHours()}`);
    setNewEventStart(startDate);
    setNewEventEnd(endDate);
  }, [setCreateSlotPreviewValues]);

  useLayoutEffect(() => {
    if (!newEventStart || !newEventEnd || isCreateSlotGestureActiveRef.current) {
      return;
    }

    setCreateSlotPreviewValues(newEventStart, newEventEnd);
  }, [newEventEnd, newEventStart, scale, setCreateSlotPreviewValues]);

  //bottom sheet
  const [createSheetIndex, setCreateSheetIndex] = useState(-1);
  const [createSheetTargetIndex, setCreateSheetTargetIndex] = useState(CREATE_SHEET_FORM_INDEX);
  const [isBottomSheetExpanded, setIsBottomSheetExpanded] = useState(false);
  const [guests, setGuests] = useState<string[]>([]);
  const [newGuest, setNewGuest] = useState('');

  const [isAnyBottomSheetOpen, setIsAnyBottomSheetOpen] = useState(false);
  const overlayVisible = isAnyBottomSheetOpen || isEventDetailsOpen || isSearchOpen;
  // The grid hides behind an open details sheet. Only while it shows an event: if the sheet's
  // "closed" report is missed (e.g. closed from code under an alert), the grid still comes back.
  const isFullScreenCalendarOverlayVisible = (isEventDetailsOpen && !!selectedEvent) || isBottomSheetExpanded;
  const shouldRenderAiComposer = !overlayVisible && !selectedSlot && !selectedSlotKey;
  const isCalendarSwipeDisabled = overlayVisible || isAiComposerActive || !shouldRenderAiComposer;
  const isWeekPagerSwipeDisabled =
    isCalendarSwipeDisabled ||
    draggingEvent !== null ||
    isPinching ||
    createSlotResizeEdge !== null ||
    isCreateSlotMoving;
  const {
    weekSwipeX,
    cancelWeekSwipe,
    weekSwipePanHandlers,
  } = useCalendarWeekSwipe({
    calendarPanelWidth,
    weekStart,
    weekStartRef,
    isSwipeDisabled: isWeekPagerSwipeDisabled,
    setWeekStart,
    setPagerWeekStart,
    setPagerResetWeekStart,
    setProgrammaticWeekStarts,
    syncWeekPanelScrollViews,
  });
  const hasCleanupWorkRef = useRef(false);
  hasCleanupWorkRef.current =
    overlayVisible ||
    snackbar.visible ||
    isGoogleDisconnectedNoticeVisible ||
    isBottomSheetExpanded ||
    selectedSlot !== null ||
    selectedSlotKey !== null ||
    newEventStart !== null ||
    newEventEnd !== null ||
    createSlotResizeEdge !== null ||
    isCreateSlotMoving ||
    eventTitle !== '' ||
    eventDetailsText !== '' ||
    guests.length > 0 ||
    newGuest !== '' ||
    location !== '' ||
    selectedLocation !== null ||
    isEditMode ||
    editingEvent !== null ||
    editDetails !== '' ||
    selectedEvent !== null ||
    eventDetails !== null ||
    pendingEventScrollDate !== null ||
    pendingScrollDate !== null ||
    pendingOpen !== null;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: overlayVisible ? 0 : 1,
      duration: overlayVisible ? 0 : 100,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, overlayVisible]);

  useEffect(() => {
    Animated.timing(eventDetailsVisibility, {
      toValue: isEventDetailsOpen ? 1 : 0,
      duration: isEventDetailsOpen ? 220 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [eventDetailsVisibility, isEventDetailsOpen]);

  useEffect(() => {
    Animated.timing(createSheetVisibility, {
      toValue: isAnyBottomSheetOpen ? 1 : 0,
      duration: isAnyBottomSheetOpen ? 220 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [createSheetVisibility, isAnyBottomSheetOpen]);

  useEffect(() => {
    Animated.timing(createSheetExpanded, {
      toValue: isBottomSheetExpanded ? 1 : 0,
      duration: isBottomSheetExpanded ? 220 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [createSheetExpanded, isBottomSheetExpanded]);

  useEffect(() => {
    if (!overlayVisible) return;
    setIsAiInputFocused(false);
    inputRef.current?.blur();
  }, [overlayVisible]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'android') return;

    const parent = navigation.getParent();
    if (!parent) return;

    parent.setOptions({
      tabBarStyle: {
        position: 'absolute',
        left: 28,
        right: 28,
        bottom: tabBarBottomOffset,
        height: tabBarHeight,
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
        display: isFocused && (overlayVisible || isAiComposerActive) ? 'none' : 'flex',
      },
    });

    return () => {
      parent.setOptions({
        tabBarStyle: {
          position: 'absolute',
          left: 28,
          right: 28,
          bottom: tabBarBottomOffset,
          height: tabBarHeight,
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
  }, [isAiComposerActive, isFocused, navigation, overlayVisible, tabBarBottomOffset, tabBarHeight]);

  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const createSheetDismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createSheetDismissSequenceRef = useRef(0);
  const isCreateSheetDismissingRef = useRef(false);
  const compactCreateSheetTouchStartYRef = useRef(0);
  const compactCreateSheetDidMoveRef = useRef(false);
  const requestedCreateSheetIndexRef = useRef<number | null>(null);
  const pendingGoogleCreateSyncInFlightRef = useRef(false);
  // The walkthrough hides its card once a time slot or the AI bar is tapped. If the user
  // then closes the form or leaves the AI bar without creating an event, bring it back.
  useEffect(() => {
    if (
      !isFocused ||
      !isCalendarTutorialPending ||
      calendarTutorialStageRef.current !== 'waiting-event' ||
      createSheetIndex !== -1 ||
      isAiInputFocused ||
      isAiRunning ||
      !!aiNotice
    ) {
      return;
    }
    const timeout = setTimeout(() => {
      if (isCalendarTutorialPendingRef.current && calendarTutorialStageRef.current === 'waiting-event') {
        showCalendarTutorialCreate();
      }
    }, 900);
    return () => clearTimeout(timeout);
  }, [aiNotice, createSheetIndex, isAiInputFocused, isAiRunning, isCalendarTutorialPending, isFocused, showCalendarTutorialCreate]);

  const openCreateSheet = useCallback((index = CREATE_SHEET_FORM_INDEX) => {
    createSheetDismissSequenceRef.current += 1;
    isCreateSheetDismissingRef.current = false;
    requestedCreateSheetIndexRef.current = index;
    if (createSheetDismissTimeoutRef.current) {
      clearTimeout(createSheetDismissTimeoutRef.current);
      createSheetDismissTimeoutRef.current = null;
    }
    setCreateSheetTargetIndex(index);
    setCreateSheetIndex(index);
    setIsAnyBottomSheetOpen(true);
    setIsBottomSheetExpanded(index === CREATE_SHEET_EXPANDED_INDEX);
    bottomSheetRef.current?.present();
    requestAnimationFrame(() => {
      bottomSheetRef.current?.snapToIndex(index);
    });
  }, []);
  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setVisibilityAsync('hidden');
        NavigationBar.setBehaviorAsync('overlay-swipe');
      } catch {}
    }
  }, []);
  const resetEditState = useCallback(() => {
    if (editPickerDismissTimeoutRef.current) {
      clearTimeout(editPickerDismissTimeoutRef.current);
      editPickerDismissTimeoutRef.current = null;
    }
    setIsEditMode(false);
    setEditingEvent(null);
    setEditTitle('');
    setEditDetails('');
    setEditGuests([]);
    setEditStart(null);
    setEditEnd(null);
    setIsSubmittingEvent(false);
    setActiveEditPicker(null);
    setPendingEditPickerValue(null);
    setActiveCreatePicker(null);
    setPendingCreatePickerValue(null);
    setIsEditPickerClosing(false);
    setIsEventDetailsInputFocused(false);
    editPickerDismissUntilRef.current = 0;
  }, []);

  const closeEditPicker = () => {
    editPickerDismissUntilRef.current = Date.now() + 600;
    setIsEditPickerClosing(true);
    if (editPickerDismissTimeoutRef.current) {
      clearTimeout(editPickerDismissTimeoutRef.current);
    }
    editPickerDismissTimeoutRef.current = setTimeout(() => {
      setIsEditPickerClosing(false);
      editPickerDismissTimeoutRef.current = null;
    }, 600);
    setActiveEditPicker(null);
    setPendingEditPickerValue(null);
    setActiveCreatePicker(null);
    setPendingCreatePickerValue(null);
  };

  const resetCreateEventState = useCallback(() => {
    shouldFocusCreateTitleOnSheetExpandRef.current = false;
    setSelectedSlot(null);
    setSelectedSlotKey(null);
    setNewEventStart(null);
    setNewEventEnd(null);
    setEventTitle('');
    setEventDetailsText('');
    setIsEventDetailsInputFocused(false);
    setGuests([]);
    setNewGuest('');
    setLocation('');
    setSelectedLocation(null);
    setActiveCreatePicker(null);
    setPendingCreatePickerValue(null);
    createSlotResizeEdgeRef.current = null;
    createSlotResizeTranslationYRef.current = 0;
    setCreateSlotResizeEdge(null);
    setIsCreateSlotMoving(false);
    createSlotResizeBaseRef.current = null;
    createSlotMoveBaseRef.current = null;
    createSlotMoveCancellationFallbackRef.current = null;
    createSlotMoveTranslationRef.current = { x: 0, y: 0 };
    createSlotLiveRangeRef.current = null;
    isCreateSlotGestureActiveRef.current = false;
    createSlotPreviewLeft.setValue(0);
    createSlotPreviewTop.setValue(0);
    createSlotPreviewHeight.setValue(0);
    autoScrollTickRef.current = null;
    setCreateSheetIndex(-1);
  }, [createSlotPreviewHeight, createSlotPreviewLeft, createSlotPreviewTop]);

  const finishCreateSheetDismissal = useCallback((sequence?: number) => {
    if (sequence !== undefined && sequence !== createSheetDismissSequenceRef.current) {
      return;
    }
    if (sequence === undefined && !isCreateSheetDismissingRef.current) {
      return;
    }
    if (createSheetDismissTimeoutRef.current) {
      clearTimeout(createSheetDismissTimeoutRef.current);
      createSheetDismissTimeoutRef.current = null;
    }
    isCreateSheetDismissingRef.current = false;
    requestedCreateSheetIndexRef.current = null;
    setCreateSheetTargetIndex(-1);
    setCreateSheetIndex(-1);
    setIsAnyBottomSheetOpen(false);
    setIsBottomSheetExpanded(false);
    resetCreateEventState();
    resetEditState();
  }, [resetCreateEventState, resetEditState]);

  const closeCreateSheet = useCallback((options?: { finishImmediately?: boolean }) => {
    Keyboard.dismiss();
    shouldFocusCreateTitleOnSheetExpandRef.current = false;
    requestedCreateSheetIndexRef.current = -1;
    const dismissSequence = createSheetDismissSequenceRef.current + 1;
    createSheetDismissSequenceRef.current = dismissSequence;
    isCreateSheetDismissingRef.current = true;
    if (createSheetDismissTimeoutRef.current) {
      clearTimeout(createSheetDismissTimeoutRef.current);
    }
    setCreateSheetTargetIndex(-1);
    setCreateSheetIndex(-1);
    setIsBottomSheetExpanded(false);
    bottomSheetRef.current?.forceClose();
    if (options?.finishImmediately) {
      finishCreateSheetDismissal(dismissSequence);
      return;
    }
    createSheetDismissTimeoutRef.current = setTimeout(() => {
      finishCreateSheetDismissal(dismissSequence);
    }, 500);
  }, [finishCreateSheetDismissal]);

  useEffect(() => {
    return () => {
      if (createSheetDismissTimeoutRef.current) {
        clearTimeout(createSheetDismissTimeoutRef.current);
        createSheetDismissTimeoutRef.current = null;
      }
    };
  }, []);

  const openEditPicker = (mode: 'date' | 'start' | 'end') => {
    if (isEditPickerClosing || Date.now() < editPickerDismissUntilRef.current) {
      return;
    }

    if (mode === 'end') {
      if (!editEnd) return;
      setPendingEditPickerValue(new Date(editEnd));
    } else {
      if (!editStart) return;
      setPendingEditPickerValue(new Date(editStart));
    }
    setActiveEditPicker(mode);
  };

  const openCreatePicker = (mode: 'date' | 'start' | 'end') => {
    if (isEditPickerClosing || Date.now() < editPickerDismissUntilRef.current) {
      return;
    }

    if (mode === 'end') {
      if (!newEventEnd) return;
      setPendingCreatePickerValue(new Date(newEventEnd));
    } else {
      if (!newEventStart) return;
      setPendingCreatePickerValue(new Date(newEventStart));
    }
    setActiveCreatePicker(mode);
  };

  const updateEditPickerValue = (mode: 'date' | 'start' | 'end', nextValue: Date) => {
    if (!editStart || !editEnd) {
      return;
    }

    if (mode === 'date') {
      const duration = editEnd.getTime() - editStart.getTime();
      const nextStart = new Date(editStart);
      nextStart.setFullYear(
        nextValue.getFullYear(),
        nextValue.getMonth(),
        nextValue.getDate()
      );
      const nextEnd = new Date(nextStart.getTime() + (duration > 0 ? duration : 15 * 60 * 1000));
      setEditStart(nextStart);
      setEditEnd(nextEnd);
      return;
    }

    if (mode === 'start') {
      const duration = editEnd.getTime() - editStart.getTime();
      const nextStart = withWheelTime(editStart, nextValue);
      const nextEnd = new Date(nextStart.getTime() + (duration > 0 ? duration : 15 * 60 * 1000));
      setEditStart(nextStart);
      setEditEnd(nextEnd);
      return;
    }

    const nextEnd = withWheelTime(editEnd, nextValue);
    if (nextEnd <= editStart) {
      nextEnd.setDate(nextEnd.getDate() + 1);
    }
    setEditEnd(nextEnd);
  };

  const updateCreatePickerValue = (mode: 'date' | 'start' | 'end', nextValue: Date) => {
    if (!newEventStart || !newEventEnd) {
      return;
    }

    if (mode === 'date') {
      const duration = newEventEnd.getTime() - newEventStart.getTime();
      const nextStart = new Date(newEventStart);
      nextStart.setFullYear(
        nextValue.getFullYear(),
        nextValue.getMonth(),
        nextValue.getDate()
      );
      const nextEnd = new Date(nextStart.getTime() + (duration > 0 ? duration : 15 * 60 * 1000));
      setCreateSlotPreviewValues(nextStart, nextEnd);
      setNewEventStart(nextStart);
      setNewEventEnd(nextEnd);
      return;
    }

    if (mode === 'start') {
      const duration = newEventEnd.getTime() - newEventStart.getTime();
      const nextStart = withWheelTime(newEventStart, nextValue);
      const nextEnd = new Date(nextStart.getTime() + (duration > 0 ? duration : 15 * 60 * 1000));
      setCreateSlotPreviewValues(nextStart, nextEnd);
      setNewEventStart(nextStart);
      setNewEventEnd(nextEnd);
      return;
    }

    const nextEnd = withWheelTime(newEventEnd, nextValue);
    if (nextEnd <= newEventStart) {
      nextEnd.setDate(nextEnd.getDate() + 1);
    }
    setCreateSlotPreviewValues(newEventStart, nextEnd);
    setNewEventEnd(nextEnd);
  };

  const handleAndroidEditPickerChange = (
    event: { type: string },
    selectedDate?: Date
  ) => {
    const mode = activeEditPicker || activeCreatePicker;

    if (!mode) {
      return;
    }

    if (event.type === 'dismissed') {
      closeEditPicker();
      return;
    }

    if (!selectedDate) {
      return;
    }

    if (activeCreatePicker) {
      updateCreatePickerValue(mode, selectedDate);
    } else {
      updateEditPickerValue(mode, selectedDate);
    }
    closeEditPicker();
  };
  const closeCalendarOverlays = useCallback(() => {
    if (!hasCleanupWorkRef.current) return;
    Keyboard.dismiss();
    closeSearch();
    hideSnackbar();
    hideGoogleDisconnectedNotice();
    closeCreateSheet();
    eventDetailsBottomSheetRef.current?.close();
    setSelectedEvent(null);
    setEventDetails(null);
    shouldForcePendingEventScrollRef.current = false;
    setPendingEventScrollDate(null);
    setPendingScrollDate(null);
    setPendingOpen(null);
    setIsBottomSheetExpanded(false);
    setIsEventDetailsOpen(false);
    isOpeningFromParamsRef.current = false;
  }, [closeCreateSheet, closeSearch, hideGoogleDisconnectedNotice, hideSnackbar]);
  const scheduleOverlayCleanup = useCallback(() => {
    deferredOverlayCleanupRef.current?.cancel?.();
    deferredOverlayCleanupRef.current = InteractionManager.runAfterInteractions(() => {
      closeCalendarOverlays();
      deferredOverlayCleanupRef.current = null;
    });
  }, [closeCalendarOverlays]);

  useEffect(() => {
    if (!isFocused || (!isEventDetailsOpen && !isAnyBottomSheetOpen)) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isEventDetailsOpen) {
        eventDetailsBottomSheetRef.current?.close();
        return true;
      }

      closeCreateSheet();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [closeCreateSheet, isAnyBottomSheetOpen, isEventDetailsOpen, isFocused]);

  const renderBottomSheetBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={CREATE_SHEET_FORM_INDEX}
        disappearsOnIndex={CREATE_SHEET_COMPACT_INDEX}
        enableTouchThrough
        opacity={0.4}
        pointerEvents="none"
        pressBehavior="none"
        accessible={false}
      />
    ),
    []
  );
  const renderEventDetailsBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.86}
        pressBehavior="close"
      />
    ),
    []
  );

  const onPinchGestureEvent = useCallback((event: any) => {
    const nextScale = Math.min(
      Math.max(pinchStartScaleRef.current * (event.nativeEvent.scale || 1), MIN_SCALE),
      MAX_SCALE
    );
    if (Math.abs(nextScale - scaleRef.current) > 0.001) {
      scaleRef.current = nextScale;
      setScale(nextScale);
    }

    const scrollView = timelineScrollViewRef.current as any;
    if (!scrollView) return;

    const viewH = scrollViewHeightRef.current || 0;
    const maxY = Math.max(0, 24 * HOUR_HEIGHT * nextScale - viewH);
    if (scrollYRef.current > maxY) {
      scrollYRef.current = maxY;
      scrollView.scrollTo({ y: maxY, animated: false });
    }
  }, []);

  const onPinchHandlerStateChange = useCallback((event: any) => {
    const { state, oldState, scale: gestureScale } = event.nativeEvent;

    if (state === State.BEGAN) {
      pinchStartScaleRef.current = scaleRef.current;
      return;
    }

    if (state === State.ACTIVE) {
      setIsPinching(true);
      return;
    }

    if (
      oldState === State.ACTIVE ||
      state === State.END ||
      state === State.CANCELLED ||
      state === State.FAILED
    ) {
      setIsPinching(false);

      if (oldState !== State.ACTIVE) return;

      const nextScale = Math.min(
        Math.max(pinchStartScaleRef.current * (gestureScale || 1), MIN_SCALE),
        MAX_SCALE
      );
      if (Math.abs(nextScale - scaleRef.current) > 0.001) {
        scaleRef.current = nextScale;
        setScale(nextScale);
      }
    }
  }, []);

  useEffect(() => {
    const scrollView = timelineScrollViewRef.current as any;
    if (!scrollView) return;

    const viewH = scrollViewHeightRef.current || 0;
    const maxY = Math.max(0, 24 * HOUR_HEIGHT * scale - viewH);

    if (scrollYRef.current > maxY) {
      scrollYRef.current = maxY;
      scrollView.scrollTo({ y: maxY, animated: false });
    }
  }, [scale]);

  const handleTimeSlotPress = (hour: number, dayIndex: number, targetWeekStart = weekStart) => {
    hideCalendarTutorialCreateCard();
    setIsAiInputFocused(false);
    inputRef.current?.blur();
    Keyboard.dismiss();
    const date = new Date(targetWeekStart);
    date.setDate(targetWeekStart.getDate() + dayIndex);
    date.setHours(hour, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(hour + 1, 0, 0, 0);
    setCreateSlotPreviewValues(date, endDate, targetWeekStart);
    setSelectedSlot({ date, hour });
    setNewEventStart(date);
    setNewEventEnd(endDate);
    setSelectedSlotKey(`${dayIndex}-${hour}`);
    eventDetailsBottomSheetRef.current?.close();
    openCreateSheet(CREATE_SHEET_FORM_INDEX);

    setTimeout(() => {
      const scrollView = timelineScrollViewRef.current;
      if (scrollView) {
        const screenHeight = Dimensions.get('window').height;
        const sheetTop = screenHeight * (1 - Number.parseFloat(CREATE_SHEET_FORM_SNAP_POINT) / 100);
        const scrollViewTop = scrollViewTopInWindowRef.current || 0;
        const visibleTimelineHeight = Math.max(140, sheetTop - scrollViewTop - 24);
        const totalContentHeight = 24 * HOUR_HEIGHT * scale;
        const yOffset = hour * HOUR_HEIGHT * scale;
        const slotHeight = HOUR_HEIGHT * scale;
        const targetSlotTop = Math.max(24, visibleTimelineHeight - slotHeight - 24);
        const maxScrollY = Math.max(0, totalContentHeight - visibleTimelineHeight);
        const scrollToY = Math.min(maxScrollY, Math.max(0, yOffset - targetSlotTop));

        scrollView.scrollTo({ y: scrollToY, animated: true });
      }
    }, 100);
  };

  const applyCreateSlotMove = useCallback((translationX: number, translationY: number) => {
    const base = createSlotMoveBaseRef.current;
    if (!base) {
      return;
    }

    const next = getMovedCreateSlotMinutes({
      dayIndex: base.dayIndex,
      startMinutes: base.startMinutes,
      endMinutes: base.endMinutes,
      translationX,
      translationY: translationY + (autoScrollAccumYRef.current || 0),
      dayColumnWidth,
      dayCount: DAYS_OF_WEEK.length,
      pxPerMinute: (HOUR_HEIGHT * scaleRef.current) / 60,
    });
    const snapKey = `${next.dayIndex}:${next.startMinutes}:${next.endMinutes}`;
    if (base.snapKey === snapKey) {
      return;
    }

    base.snapKey = snapKey;
    const day = addDays(weekStartRef.current, next.dayIndex);
    day.setHours(0, 0, 0, 0);
    const nextStart = getDateAtDayMinute(day, next.startMinutes);
    const nextEnd = getDateAtDayMinute(day, next.endMinutes);
    setCreateSlotPreviewValues(nextStart, nextEnd);
    highlightDragTime(nextStart);
  }, [dayColumnWidth, highlightDragTime, setCreateSlotPreviewValues, weekStartRef]);

  const clearStaleCreateSlotResizeForMove = useCallback(() => {
    if (!createSlotResizeBaseRef.current && !createSlotResizeEdgeRef.current) {
      return null;
    }

    const liveRange = createSlotLiveRangeRef.current
      ? {
          startDate: new Date(createSlotLiveRangeRef.current.startDate),
          endDate: new Date(createSlotLiveRangeRef.current.endDate),
        }
      : null;

    createSlotResizeBaseRef.current = null;
    createSlotResizeEdgeRef.current = null;
    createSlotResizeTranslationYRef.current = 0;
    isCreateSlotGestureActiveRef.current = false;
    setCreateSlotResizeEdge(null);
    clearDragHighlight();
    return liveRange;
  }, [clearDragHighlight]);

  const beginCreateSlotMove = useCallback(() => {
    const staleResizeRange = clearStaleCreateSlotResizeForMove();
    const moveStart = staleResizeRange?.startDate ?? newEventStart;
    const moveEnd = staleResizeRange?.endDate ?? newEventEnd;

    if (!selectedSlot || !moveStart || !moveEnd) {
      if (staleResizeRange) {
        commitCreateSlotRange(staleResizeRange.startDate, staleResizeRange.endDate);
      }
      return false;
    }

    const day = new Date(moveStart);
    day.setHours(0, 0, 0, 0);
    const dayIndex = differenceInCalendarDays(day, weekStartRef.current);
    if (dayIndex < 0 || dayIndex >= DAYS_OF_WEEK.length) {
      if (staleResizeRange) {
        commitCreateSlotRange(staleResizeRange.startDate, staleResizeRange.endDate);
      }
      return false;
    }

    const nextDay = addDays(day, 1);
    const startMinutes = getMinutesSinceStartOfDay(moveStart);
    const endMinutes = moveEnd.getTime() >= nextDay.getTime()
      ? CALENDAR_DAY_MINUTES
      : getMinutesSinceStartOfDay(moveEnd);

    createSlotMoveBaseRef.current = {
      dayIndex,
      startMinutes,
      endMinutes,
      snapKey: `${dayIndex}:${startMinutes}:${endMinutes}`,
    };
    createSlotMoveCancellationFallbackRef.current = staleResizeRange;
    createSlotMoveTranslationRef.current = { x: 0, y: 0 };
    isCreateSlotGestureActiveRef.current = true;
    setCreateSlotPreviewValues(moveStart, moveEnd);
    autoScrollAccumYRef.current = 0;
    autoScrollOffsetY.setValue(0);
    autoScrollTickRef.current = () => {
      const { x, y } = createSlotMoveTranslationRef.current;
      applyCreateSlotMove(x, y);
    };
    setIsCreateSlotMoving(true);
    highlightDragTime(moveStart);
    return true;
  }, [
    applyCreateSlotMove,
    autoScrollOffsetY,
    clearStaleCreateSlotResizeForMove,
    commitCreateSlotRange,
    highlightDragTime,
    newEventEnd,
    newEventStart,
    selectedSlot,
    setCreateSlotPreviewValues,
    weekStartRef,
  ]);

  const finishCreateSlotMove = useCallback((translationX?: number, translationY?: number) => {
    const hadActiveMove = !!createSlotMoveBaseRef.current;
    const shouldCommit = hadActiveMove && translationX != null && translationY != null;
    if (shouldCommit) {
      applyCreateSlotMove(translationX, translationY);
    }

    const liveRange = shouldCommit ? createSlotLiveRangeRef.current : null;
    const cancellationFallback = shouldCommit ? null : createSlotMoveCancellationFallbackRef.current;
    createSlotMoveBaseRef.current = null;
    createSlotMoveCancellationFallbackRef.current = null;
    createSlotMoveTranslationRef.current = { x: 0, y: 0 };
    autoScrollAccumYRef.current = 0;
    autoScrollOffsetY.setValue(0);
    autoScrollTickRef.current = null;
    isCreateSlotGestureActiveRef.current = false;
    setIsCreateSlotMoving(false);
    stopAutoScroll();
    clearDragHighlight();
    if (liveRange) {
      commitCreateSlotRange(liveRange.startDate, liveRange.endDate);
    } else if (cancellationFallback) {
      commitCreateSlotRange(cancellationFallback.startDate, cancellationFallback.endDate);
    } else if (newEventStart && newEventEnd) {
      setCreateSlotPreviewValues(newEventStart, newEventEnd);
    }
  }, [
    applyCreateSlotMove,
    autoScrollOffsetY,
    clearDragHighlight,
    commitCreateSlotRange,
    newEventEnd,
    newEventStart,
    setCreateSlotPreviewValues,
    stopAutoScroll,
  ]);

  const updateCreateSlotAutoScroll = useCallback((event: any) => {
    const absY = event?.nativeEvent?.absoluteY || 0;
    const top = scrollViewTopInWindowRef.current || 0;
    const viewH = scrollViewHeightRef.current || 0;
    const edge = 40;
    const topEdge = top + edge;
    const bottomEdge = top + viewH - edge;

    if (absY > 0 && viewH > 0) {
      if (absY < topEdge) {
        startAutoScroll(-1);
      } else if (absY > bottomEdge) {
        startAutoScroll(1);
      } else {
        stopAutoScroll();
      }
    }
  }, [startAutoScroll, stopAutoScroll]);

  const onCreateSlotMoveGestureEvent = useCallback((event: any) => {
    const translationX = event?.nativeEvent?.translationX || 0;
    const translationY = event?.nativeEvent?.translationY || 0;
    createSlotMoveTranslationRef.current = { x: translationX, y: translationY };

    if (!createSlotMoveBaseRef.current) {
      return;
    }

    applyCreateSlotMove(translationX, translationY);
    updateCreateSlotAutoScroll(event);
  }, [applyCreateSlotMove, updateCreateSlotAutoScroll]);

  const onCreateSlotMoveStateChange = useCallback((event: any) => {
    const state = event?.nativeEvent?.state;

    if (state === State.BEGAN) {
      if (beginCreateSlotMove()) {
        try {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        } catch {}
      }
      return;
    }

    if (state === State.ACTIVE && !createSlotMoveBaseRef.current) {
      if (beginCreateSlotMove()) {
        const translationX = event?.nativeEvent?.translationX || 0;
        const translationY = event?.nativeEvent?.translationY || 0;
        createSlotMoveTranslationRef.current = { x: translationX, y: translationY };
        applyCreateSlotMove(translationX, translationY);
      }
      return;
    }

    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      const translationX = event?.nativeEvent?.translationX || 0;
      const translationY = event?.nativeEvent?.translationY || 0;
      finishCreateSlotMove(
        state === State.END ? translationX : undefined,
        state === State.END ? translationY : undefined
      );
    }
  }, [applyCreateSlotMove, beginCreateSlotMove, finishCreateSlotMove]);

  const beginCreateSlotResize = useCallback((edge: CreateSlotResizeEdge) => {
    if (!selectedSlot || !newEventStart || !newEventEnd) {
      return false;
    }

    const day = new Date(newEventStart);
    day.setHours(0, 0, 0, 0);
    const nextDay = addDays(day, 1);
    const startMinutes = getMinutesSinceStartOfDay(newEventStart);
    const endMinutes = newEventEnd.getTime() >= nextDay.getTime()
      ? CALENDAR_DAY_MINUTES
      : getMinutesSinceStartOfDay(newEventEnd);

    createSlotResizeBaseRef.current = {
      edge,
      day,
      startMinutes,
      endMinutes,
      snapKey: `${startMinutes}:${endMinutes}`,
    };
    isCreateSlotGestureActiveRef.current = true;
    createSlotResizeTranslationYRef.current = 0;
    setCreateSlotPreviewValues(newEventStart, newEventEnd);
    createSlotResizeEdgeRef.current = edge;
    setCreateSlotResizeEdge(edge);
    return true;
  }, [newEventEnd, newEventStart, selectedSlot, setCreateSlotPreviewValues]);

  const applyCreateSlotResize = useCallback((edge: CreateSlotResizeEdge, translationY: number) => {
    const base = createSlotResizeBaseRef.current;
    if (!base || base.edge !== edge) {
      return;
    }

    const next = getResizedCreateSlotMinutes({
      edge,
      startMinutes: base.startMinutes,
      endMinutes: base.endMinutes,
      translationY,
      pxPerMinute: (HOUR_HEIGHT * scaleRef.current) / 60,
    });
    const snapKey = `${next.startMinutes}:${next.endMinutes}`;
    if (base.snapKey === snapKey) {
      return;
    }

    base.snapKey = snapKey;
    const nextStart = getDateAtDayMinute(base.day, next.startMinutes);
    const nextEnd = getDateAtDayMinute(base.day, next.endMinutes);
    setCreateSlotPreviewValues(nextStart, nextEnd);
    highlightDragTime(edge === 'start' ? nextStart : nextEnd);
  }, [highlightDragTime, setCreateSlotPreviewValues]);

  const finishCreateSlotResize = useCallback((edge: CreateSlotResizeEdge, translationY?: number) => {
    const activeEdge = createSlotResizeBaseRef.current?.edge ?? createSlotResizeEdgeRef.current;
    if (activeEdge !== edge) {
      return;
    }

    const hadActiveResize = createSlotResizeBaseRef.current?.edge === edge;
    const shouldCommit = hadActiveResize && translationY != null;
    if (shouldCommit) {
      applyCreateSlotResize(edge, translationY);
    }
    const liveRange = shouldCommit ? createSlotLiveRangeRef.current : null;
    if (createSlotResizeBaseRef.current?.edge === edge) {
      createSlotResizeBaseRef.current = null;
    }
    createSlotResizeEdgeRef.current = null;
    createSlotResizeTranslationYRef.current = 0;
    isCreateSlotGestureActiveRef.current = false;
    setCreateSlotResizeEdge(null);
    if (liveRange) {
      commitCreateSlotRange(liveRange.startDate, liveRange.endDate);
    } else if (newEventStart && newEventEnd) {
      setCreateSlotPreviewValues(newEventStart, newEventEnd);
    }
  }, [
    applyCreateSlotResize,
    commitCreateSlotRange,
    newEventEnd,
    newEventStart,
    setCreateSlotPreviewValues,
  ]);

  const createOnCreateSlotResizeGestureEvent = useCallback((edge: CreateSlotResizeEdge) => (event: any) => {
    const translationY = event?.nativeEvent?.translationY || 0;
    createSlotResizeTranslationYRef.current = translationY;
    applyCreateSlotResize(edge, translationY);
  }, [applyCreateSlotResize]);

  const createOnCreateSlotResizeStateChange = useCallback((edge: CreateSlotResizeEdge) => (event: any) => {
    const state = event?.nativeEvent?.state;
    const oldState = event?.nativeEvent?.oldState;

    if (state === State.BEGAN) {
      if (beginCreateSlotResize(edge)) {
        try {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        } catch {}
      }
      return;
    }

    if (state === State.ACTIVE && !createSlotResizeBaseRef.current) {
      if (beginCreateSlotResize(edge)) {
        const translationY = event?.nativeEvent?.translationY || 0;
        createSlotResizeTranslationYRef.current = translationY;
        applyCreateSlotResize(edge, translationY);
      }
      return;
    }

    if (
      state === State.END ||
      state === State.CANCELLED ||
      state === State.FAILED ||
      (
        oldState === State.ACTIVE &&
        state !== State.ACTIVE &&
        state !== State.BEGAN
      )
    ) {
      const translationY = event?.nativeEvent?.translationY ?? createSlotResizeTranslationYRef.current;
      finishCreateSlotResize(
        edge,
        state === State.END ? translationY : undefined
      );
    }
  }, [applyCreateSlotResize, beginCreateSlotResize, finishCreateSlotResize]);

  const scrollToEventTime = useCallback((date: Date, animated: boolean) => {
    const scrollView = timelineScrollViewRef.current as any;
    if (!scrollView) return false;

    const viewH = scrollViewHeightRef.current || 0;
    const totalContentHeight = 24 * HOUR_HEIGHT * scale;
    const minutesFromStartOfDay = (date.getHours() * 60) + date.getMinutes();
    const yOffset = (minutesFromStartOfDay / 60) * HOUR_HEIGHT * scale;
    const maxRevealedTopY = EVENT_REVEAL_MAX_TOP_HOUR * HOUR_HEIGHT * scale;
    const maxY = Math.max(0, totalContentHeight - viewH);
    const preferredY = Math.min(maxRevealedTopY, yOffset);
    const minYForVisibleSlot = Math.max(0, yOffset - viewH + (HOUR_HEIGHT * scale) + EVENT_REVEAL_BOTTOM_PADDING);
    const targetY = Math.max(0, Math.min(maxY, yOffset, Math.max(preferredY, minYForVisibleSlot)));

    scrollYRef.current = targetY;
    scrollView.scrollTo({ y: targetY, animated });
    return true;
  }, [scale]);

  const initialAutoScrollDate = useMemo(() => {
    const today = new Date();
    const weekEnd = addDays(weekStart, 7);

    if (today < weekStart || today >= weekEnd) {
      return null;
    }

    const firstVisibleEventByDay = new Map<number, Date>();

    events.forEach((event) => {
      if ((event as any).isAllDay) return;

      const { startDate: eventStart, endDate: eventEnd } = getDisplayedEventRange(event);

      if (
        Number.isNaN(eventStart.getTime()) ||
        Number.isNaN(eventEnd.getTime()) ||
        eventEnd <= eventStart
      ) {
        return;
      }

      const visibleStart = eventStart < weekStart ? new Date(weekStart) : new Date(eventStart);
      const visibleEnd = eventEnd > weekEnd ? new Date(weekEnd) : new Date(eventEnd);
      if (visibleEnd <= visibleStart) return;

      let dayCursor = new Date(visibleStart);
      dayCursor.setHours(0, 0, 0, 0);

      while (dayCursor < visibleEnd) {
        const nextDay = addDays(dayCursor, 1);
        const segmentStart = new Date(Math.max(dayCursor.getTime(), visibleStart.getTime()));
        const segmentEnd = new Date(Math.min(nextDay.getTime(), visibleEnd.getTime()));

        if (segmentEnd > segmentStart) {
          const dayIndex = differenceInCalendarDays(dayCursor, weekStart);
          const existing = firstVisibleEventByDay.get(dayIndex);

          if (!existing || segmentStart < existing) {
            firstVisibleEventByDay.set(dayIndex, segmentStart);
          }
        }

        dayCursor = nextDay;
      }
    });

    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    for (let offset = 0; offset < 7; offset += 1) {
      const targetDay = addDays(todayStart, -offset);
      if (targetDay < weekStart) {
        break;
      }

      const dayIndex = differenceInCalendarDays(targetDay, weekStart);
      const firstVisibleEvent = firstVisibleEventByDay.get(dayIndex);

      if (firstVisibleEvent) {
        return firstVisibleEvent;
      }
    }

    return null;
  }, [events, getDisplayedEventRange, weekStart]);

  const getFirstTimedEventDateOnDay = useCallback((date: Date, targetEvents: EventModel[]) => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const nextDay = addDays(dayStart, 1);
    let firstEventDate: Date | null = null;

    targetEvents.forEach((event) => {
      if ((event as any).isAllDay) return;

      const { startDate: eventStart, endDate: eventEnd } = getDisplayedEventRange(event);
      if (
        Number.isNaN(eventStart.getTime()) ||
        Number.isNaN(eventEnd.getTime()) ||
        eventEnd <= eventStart
      ) {
        return;
      }

      const visibleStart = eventStart < dayStart ? new Date(dayStart) : new Date(eventStart);
      const visibleEnd = eventEnd > nextDay ? new Date(nextDay) : new Date(eventEnd);
      if (visibleEnd <= visibleStart) return;

      if (!firstEventDate || visibleStart < firstEventDate) {
        firstEventDate = visibleStart;
      }
    });

    return firstEventDate;
  }, [getDisplayedEventRange]);

  const renderCalendarWeekPanel = (targetWeekStart: Date, index: number) => {
    const weekKey = getCalendarWeekKey(targetWeekStart);
    const isCurrentPanel = index === 1;
    const hasDuplicateWeekPanel = activeVisibleWeekStarts.some((visibleWeekStart, visibleIndex) =>
      visibleIndex !== index && getCalendarWeekKey(visibleWeekStart) === weekKey
    );
    const panelInstanceKey = hasDuplicateWeekPanel && !isCurrentPanel ? `${weekKey}-${index}` : weekKey;
    const targetEvents = weekEventsByKey[weekKey] ?? [];
    const hasTargetCache = Object.prototype.hasOwnProperty.call(weekEventsByKey, weekKey);
    const hasLoadedAnyWeek = Object.keys(weekEventsByKey).length > 0;
    const targetLoading = isCurrentPanel && !hasLoadedAnyWeek && !hasTargetCache && (!!weekLoadingByKey[weekKey] || isLoading);

    return (
      <CalendarWeekPanel
        key={`week-panel-${panelInstanceKey}`}
        weekStart={targetWeekStart}
        events={targetEvents}
        isLoading={targetLoading}
        interactionsEnabled={isCurrentPanel}
        scrollRefKey={panelInstanceKey}
        layout={{
          width: calendarPanelWidth,
          scale,
          hourHeight: HOUR_HEIGHT,
          daysOfWeek: DAYS_OF_WEEK,
          timeLabelWidth: TIME_LABEL_WIDTH,
          dayColumnWidth,
          timelineBottomPadding: isCurrentPanel && selectedSlot
            ? Math.round(
                Dimensions.get('window').height *
                  (createSheetIndex === CREATE_SHEET_COMPACT_INDEX
                    ? Number.parseFloat(CREATE_SHEET_COMPACT_SNAP_POINT)
                    : Number.parseFloat(CREATE_SHEET_FORM_SNAP_POINT)) /
                  100
              )
            : 0,
          gridLineColor: CALENDAR_GRID_LINE_COLOR,
          eventColor: EAZEE_EVENT_COLOR,
        }}
        dragState={{
          createSlotRange: selectedSlot && newEventStart && newEventEnd
            ? { startDate: newEventStart, endDate: newEventEnd }
            : null,
          createSlotPreviewLeft,
          createSlotPreviewTop,
          createSlotPreviewHeight,
          createSlotResizeEdge,
          isCreateSlotMoving,
          draggingEvent,
          dragReadyEventId,
          isPinching,
          dragPreviewRect,
          openingEventId,
          revealingSlotRange,
          snappedDragX,
          snappedDragY,
        }}
        scrollRefs={{
          timelineScrollViewRef,
          weekPanelScrollRefs,
          hourRefs,
          quarterRefs,
          scrollYRef,
          scrollViewHeightRef,
          scrollViewTopInWindowRef,
        }}
        gestures={{
          onPinchGestureEvent,
          onPinchHandlerStateChange,
          onScrollLayoutReady: () => setTimelineLayoutReady((value) => value + 1),
          onEventDrag,
          onCreateSlotMoveGestureEvent,
          onCreateSlotMoveStateChange,
          createOnCreateSlotResizeGestureEvent,
          createOnCreateSlotResizeStateChange,
          createOnEventDragStateChange,
          isDragCommitInProgress: () => dropInProgressRef.current,
          releaseArmedEventDrag,
          isEventMovable,
          getDisplayedEventRange,
          setDragReadyEventId,
          setDraggingEvent,
          setDragPreviewRect: setDragPreviewRectFromPanel,
        }}
        interactions={{
          onEventPress: handleEventPress,
          onSlotPress: handleTimeSlotPress,
          onTimelineScrollBeginDrag: () => {
            scrollIntentSequenceRef.current += 1;
            autoScrolledWeekKeyRef.current = getAutoScrollWeekKey(weekStartRef.current);
            pendingScrollAnimatedRef.current = false;
            setPendingScrollDate(null);
          },
        }}
      />
    );
  };

  const fetchGoogleCalendarSearch = useCallback(async (q: string, from: Date) => {
    try {
      if (!q.trim()) return [];
      const accessToken = await getAccessToken();
      if (!accessToken) return [];
  
      const timeMin = format(from, "yyyy-MM-dd'T'HH:mm:ssxxx");
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime&maxResults=50&q=${encodeURIComponent(q)}`;
  
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) return [];
  
      const data = await res.json();
      const items = (data.items || []).filter((item: any) => item.description !== WAVE_EVENT_DESCRIPTION_SENTINEL);
      return items.map((item: any) => ({
        id: item.id,
        title: item.summary,
        startDate: parseCalendarDateValue(item.start.dateTime || item.start.date) || new Date(),
        endDate: parseCalendarDateValue(item.end.dateTime || item.end.date) || new Date(),
        isGoogleEvent: true,
        isAllDay: !!(item.start?.date && !item.start?.dateTime),
        source: 'google' as const,
      })) as SearchItem[];
    } catch {
      return [];
    }
  }, [getAccessToken]);

  const searchEvents = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    const now = new Date();
    const from = new Date(now);
    from.setMonth(from.getMonth() - 6);
  
    // escape special LIKE chars for SQLite
    const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
  
    let local: SearchItem[] = [];
    try {
      const rows = await database.collections
        .get<EventModel>('events')
        .query(
          Q.where('start_date', Q.gte(from.getTime())),
          Q.or(
            Q.where('title', Q.like(like)),
            Q.where('location', Q.like(like)),
            Q.where('details', Q.like(like))
          ),
          Q.sortBy('start_date', Q.asc)
        )
        .fetch() as EventModel[];
  
      local = rows.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        googleEventId: e.googleEventId,
        source: 'local' as const,
      }));
    } catch {}
  
    const linkedGoogleIds = new Set(local.map((item) => item.googleEventId).filter(Boolean));
    const google: SearchItem[] = (isGoogleConnected ? await fetchGoogleCalendarSearch(q, from) : []) as SearchItem[];
    const googleWithoutLinkedLocals = google.filter((item) => !linkedGoogleIds.has(item.id));
  
    const combined = [...local, ...googleWithoutLinkedLocals].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    setSearchResults(combined);
    setIsSearching(false);
  }, [fetchGoogleCalendarSearch, isGoogleConnected]);

  
  
  useEffect(() => {
    if (!isSearchOpen) {
      if (Platform.OS === 'android') {
        try {
          NavigationBar.setVisibilityAsync('hidden');
          NavigationBar.setBehaviorAsync('overlay-swipe');
        } catch {}
      }
      return;
    }
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setBackgroundColorAsync('#219BAE');
        NavigationBar.setButtonStyleAsync('light');
        NavigationBar.setBehaviorAsync('overlay-swipe');
        NavigationBar.setVisibilityAsync('visible');
      } catch {}
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchEvents(searchQuery);
    }, 250);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (Platform.OS === 'android') {
        try {
          NavigationBar.setVisibilityAsync('hidden');
          NavigationBar.setBehaviorAsync('overlay-swipe');
        } catch {}
      }
    };
  }, [searchQuery, isSearchOpen, searchEvents]);

  compactMutationRefreshRef.current = async ({ name, result }) => {
    const visibleRangeStart = new Date(weekStart);
    visibleRangeStart.setHours(0, 0, 0, 0);
    const visibleRangeEnd = addDays(visibleRangeStart, 7);
    const inVisibleWeek = (value?: string) => {
      const date = parseCalendarDateValue(value);
      return !!date && date >= visibleRangeStart && date < visibleRangeEnd;
    };
    const sortEvents = (items: any[]) =>
      [...items].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const matchesCalendarItem = (event: any, item: any) => {
      const eventId = String(event?.id || '');
      const eventGoogleId = String(event?.googleEventId || '');
      const itemId = String(item?.id || '');
      const itemGoogleId = String(item?.googleEventId || '');
      if (itemId && (eventId === itemId || eventGoogleId === itemId)) return true;
      if (itemGoogleId && (eventId === itemGoogleId || eventGoogleId === itemGoogleId)) return true;
      return false;
    };

    if (name === 'calendar_create') {
      const item = result?.item;
      const itemId = String(item?.id || '').trim();
      let targetDate = parseCalendarDateValue(item?.startDate);
      let targetEndDate = parseCalendarDateValue(item?.endDate);
      if (itemId) {
        try {
          const savedEvent = await database.get<EventModel>('events').find(itemId);
          targetDate = new Date(savedEvent.startDate);
          targetEndDate = new Date(savedEvent.endDate);
        } catch {}
      }
      if (item && targetDate) {
        const targetWeekStart = normalizeCalendarWeekStart(targetDate);
        const targetWeekKey = getCalendarWeekKey(targetWeekStart);
        const visibleWeekKey = getCalendarWeekKey(weekStartRef.current);
        const hasTargetWeekCache = Object.prototype.hasOwnProperty.call(
          weekEventsByKeyRef.current,
          targetWeekKey
        );

        autoScrolledWeekKeyRef.current = null;
        pendingScrollAnimatedRef.current = true;
        setPendingScrollDate(targetDate);

        if (targetWeekKey !== visibleWeekKey) {
          cancelWeekSwipe();
          weekStartRef.current = targetWeekStart;
          setPagerResetWeekStart(null);
          setProgrammaticWeekStarts(null);
          setPagerWeekStart(targetWeekStart);
          setWeekStart(targetWeekStart);
          void fetchEventsForWeek(targetWeekStart, { silent: hasTargetWeekCache });
        }

        const endDate = targetEndDate || new Date(targetDate.getTime() + 60 * 60000);
        if (endDate > targetDate) {
          revealSlotRange(targetDate, endDate);
        }
      }

      if (item && targetDate && inVisibleWeek(targetDate.toISOString())) {
        const nextEvent = {
          id: String(item.id || item.googleEventId || `calendar-${Date.now()}`),
          title: String(item.title || ''),
          startDate: targetDate,
          endDate: targetEndDate || new Date(targetDate.getTime() + 60 * 60000),
          isGoogleEvent: false,
          googleEventId: typeof item.googleEventId === 'string' ? item.googleEventId : undefined,
          location: typeof item.location === 'string' ? item.location : undefined,
          details: typeof item.details === 'string' ? item.details : undefined,
          isAllDay: false,
        };
        updateCurrentWeekEvents((current) =>
          sortEvents([
            ...current.filter((event) => !matchesCalendarItem(event, item)),
            nextEvent as any,
          ]) as any
        );
      }
      if (item && targetDate) {
        scheduleCalendarTutorialEventCreated();
      }
    }

    if (name === 'calendar_update') {
      const item = result?.item;
      if (item) {
        updateCurrentWeekEvents((current) => {
          const nextItems = current.filter((event) => !matchesCalendarItem(event, item));
          if (inVisibleWeek(item.startDate)) {
            nextItems.push({
              ...(current.find((event) => matchesCalendarItem(event, item)) || {}),
              id: String(item.id || item.googleEventId || ''),
              title: String(item.title || ''),
              startDate: parseCalendarDateValue(item.startDate) || new Date(),
              endDate: parseCalendarDateValue(item.endDate) || new Date(),
              isGoogleEvent: item.source === 'google',
              googleEventId:
                item.source === 'google'
                  ? String(item.id || '')
                  : typeof item.googleEventId === 'string'
                    ? item.googleEventId
                    : undefined,
              location: typeof item.location === 'string' ? item.location : undefined,
              details: typeof item.details === 'string' ? item.details : undefined,
              isAllDay: !!item.isAllDay,
            } as any);
          }
          return sortEvents(nextItems) as any;
        });
      }
    }

    if (name === 'calendar_delete') {
      updateCurrentWeekEvents((current) => current.filter((event) => !matchesCalendarItem(event, result)) as any);
    }

    if (compactResyncTimeoutRef.current) {
      clearTimeout(compactResyncTimeoutRef.current);
    }
    compactResyncTimeoutRef.current = setTimeout(() => {
      void (async () => {
        try {
          await fetchEventsForWeek(weekStart, { silent: true });
        } catch {}
      })();
    }, 800);
  };

  const getGoogleCalendarEvent = useCallback(async (eventId: string) => {
    let currentAccessToken = await getAccessToken();
    if (!currentAccessToken) {
      return null;
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${currentAccessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const eventData = await response.json();
        return eventData;
      } else {
        console.error('Failed to fetch event from Google Calendar');
        return null;
      }
    } catch (error) {
      console.error('Error fetching event from Google Calendar:', error);
      return null;
    }
  }, [getAccessToken]);

  // drag move helpers placed after dependencies are declared
  const updateEventTime = useCallback(async (event: EventModel, newStart: Date, newEnd: Date) => {
    let linkedGoogleEventId = event.googleEventId ? String(event.googleEventId) : null;
    let isGoogleEvent = !!event.isGoogleEvent;

    try {
      if (!isGoogleEvent && !linkedGoogleEventId) {
        try {
          const localRecord = await database.get<EventModel>('events').find(event.id);
          linkedGoogleEventId = localRecord.googleEventId ? String(localRecord.googleEventId) : null;
          isGoogleEvent = !!localRecord.isGoogleEvent;
        } catch {}
      }

      // Update Google if linked
      if (isGoogleEvent || linkedGoogleEventId) {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('No access token');

        const eventId = isGoogleEvent ? event.id : linkedGoogleEventId;

        // fetch details to detect all-day and permissions
        const details: any = await getGoogleCalendarEvent(eventId!);
        if (!details) throw new Error('Could not fetch Google event details');

        const isAllDay = !!(details.start?.date && !details.start?.dateTime);
        const canModify = !!(details.organizer?.self || details.guestsCanModify);
        if (!canModify) {
          throw new Error('403 Forbidden - read only');
        }

        const tz = details.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const body = isAllDay
          ? {
              start: { date: format(newStart, 'yyyy-MM-dd') },
              end: { date: format(newEnd, 'yyyy-MM-dd') },
            }
          : {
              start: { dateTime: newStart.toISOString(), timeZone: tz },
              end: { dateTime: newEnd.toISOString(), timeZone: tz },
            };

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const txt = await response.text().catch(() => '');
          throw new Error(`Google update failed: ${response.status} ${txt}`);
        }

        // Verify (background check)
        try {
          const verify = await getGoogleCalendarEvent(eventId!);
          if (!verify) throw new Error('Verify failed: no event');

          const ok = isAllDay
            ? (verify.start?.date === format(newStart, 'yyyy-MM-dd') &&
               verify.end?.date === format(newEnd, 'yyyy-MM-dd'))
            : (
                new Date(verify.start?.dateTime || verify.start?.date).getTime() === newStart.getTime() &&
                new Date(verify.end?.dateTime || verify.end?.date).getTime() === newEnd.getTime()
              );

          if (!ok) throw new Error('Verify failed: mismatch');
        } catch {
          throw new Error('Verify failed: mismatch');
        }
      }

      // Update local DB if record exists
      try {
        await database.write(async () => {
          const record = await database.get<EventModel>('events').find(event.id);
          await record.update((r) => {
            r.startDate = newStart;
            r.endDate = newEnd;
            r.startTime = newStart.getHours();
            r.endTime = newEnd.getHours();
          });
        });
      } catch {
        // Ignore if this is a pure Google event not stored locally
      }

      // Refresh silently to replace with updated records/models, then clear optimistic override
      try {
        await fetchEventsForWeek(weekStart, { silent: true });
      } catch {}
      return true;
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
        Alert.alert('Read-only event', "This Google Calendar event can't be moved.");
      } else if (msg.includes('Verify failed')) {
        Alert.alert('Update failed', 'Could not confirm the change on Google. Reverted.');
      } else if (msg.includes('400') || msg.toLowerCase().includes('badrequest')) {
        Alert.alert('Cannot move event', 'All-day events must be moved by whole days, and some events are read-only.');
      } else {
        Alert.alert('Error', 'Failed to move event. Reverted.');
      }
      return false;
    }
  }, [fetchEventsForWeek, getAccessToken, getGoogleCalendarEvent, weekStart]);

  const createOnEventDragStateChange = (event: EventModel) => async (e: any) => {
    if (e.nativeEvent.state === State.ACTIVE) eventPanActiveRef.current = true;
    if (e.nativeEvent.oldState === State.ACTIVE) eventPanActiveRef.current = false;

    if (e.nativeEvent.state === State.BEGAN) {
      // Only start dragging if user held long enough
      if (dragReadyEventId === event.id) {
        setDraggingEvent(event);
      }
      return;
    }

    if (
      (e.nativeEvent.state === State.END ||
        e.nativeEvent.state === State.CANCELLED ||
        e.nativeEvent.state === State.FAILED) &&
      e.nativeEvent.oldState !== State.ACTIVE
    ) {
      if (dragReadyEventId === event.id || draggingEvent?.id === event.id) {
        resetDrag();
      }
      return;
    }

    if (e.nativeEvent.oldState === State.ACTIVE) {
      // Require that a long-press drag was actually armed for THIS event
      if (!dragReadyEventId || dragReadyEventId !== event.id || !draggingEvent || draggingEvent.id !== event.id) {
        stopAutoScroll();
        resetDrag();
        return;
      }

      if (dropInProgressRef.current) {
        stopAutoScroll();
        resetDrag();
        return;
      }
      dropInProgressRef.current = true;

      // Capture values synchronously before any awaits to avoid SyntheticEvent pooling
      const native = e && e.nativeEvent ? e.nativeEvent : { translationX: 0, translationY: 0 } as any;
      const tX = native.translationX || 0;
      const tY = native.translationY || 0;
      const releasedAutoScrollY = autoScrollAccumYRef.current || 0;
      stopAutoScroll();

      // Fire drop haptic immediately without awaiting to avoid delaying and losing event
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      try {

        const { daysDelta, minutesDelta: boundedMinutesDelta } = getBoundedDrag(
          event,
          tX,
          tY,
          releasedAutoScrollY
        );
        let minutesDelta = boundedMinutesDelta;

        // If all-day, ignore minute moves entirely; require whole-day moves
        const isAllDay = (event as any).isAllDay === true;
        if (isAllDay) {
          minutesDelta = 0;
        }

        if (minutesDelta !== 0 || daysDelta !== 0) {
          const { startDate: currentStart, endDate: currentEnd } = getDisplayedEventRange(event);
          const newStart = new Date(currentStart);
          const newEnd = new Date(currentEnd);

          // preserve duration exactly
          const durationMs = newEnd.getTime() - newStart.getTime();

          newStart.setDate(newStart.getDate() + daysDelta);
          newStart.setMinutes(newStart.getMinutes() + minutesDelta);

          newEnd.setTime(newStart.getTime() + durationMs);

          const prevStart = new Date(currentStart);
          const prevEnd = new Date(currentEnd);
          const commitSequence = dragCommitSequenceRef.current + 1;
          dragCommitSequenceRef.current = commitSequence;

          applyOptimisticEventMove(event, newStart, newEnd);
          commitDragPreviewAtTarget(daysDelta, minutesDelta);
          const updatePromise = updateEventTime(event, newStart, newEnd);
          clearCommittedDragPreview();

          const relative = formatRelativeTarget(newStart);
          const timeStr = `${format(newStart, 'h:mm a')} - ${format(newEnd, 'h:mm a')}`;
          showSnackbar(`Moved to ${relative} • ${timeStr}`, async () => {
            try {
              const updateSucceeded = await updatePromise;
              if (!updateSucceeded) return;

              const movedEvent = {
                id: event.id,
                title: event.title,
                details: event.details,
                startDate: newStart,
                startTime: newStart.getHours(),
                endDate: newEnd,
                endTime: newEnd.getHours(),
                createdAt: event.createdAt,
                updatedAt: event.updatedAt,
                googleEventId: event.googleEventId,
                sourceTodoId: event.sourceTodoId,
                isGoogleEvent: event.isGoogleEvent,
                isTodo: event.isTodo,
                location: event.location,
                latitude: event.latitude,
                longitude: event.longitude,
                attendees: event.attendees,
                isAllDay: (event as any).isAllDay,
                editable: (event as any).editable,
                description: (event as any).description,
                hangoutLink: (event as any).hangoutLink,
              } as unknown as EventModel;
              applyOptimisticEventMove(movedEvent, prevStart, prevEnd);
              const undoSucceeded = await updateEventTime(event, prevStart, prevEnd);
              if (undoSucceeded) {
                confirmOptimisticEventMove(String(event.id));
              } else {
                revertOptimisticEventMove(String(event.id));
              }
            } catch {}
          });

          const updateSucceeded = await updatePromise;

          if (!updateSucceeded) {
            if (dragCommitSequenceRef.current === commitSequence) hideSnackbar();
            revertOptimisticEventMove(String(event.id));
            return;
          }

          confirmOptimisticEventMove(String(event.id));
        } else {
          resetDrag();
        }
      } catch (err) {
        console.error('Drag update failed:', err);
        resetDrag();
      } finally {
        dropInProgressRef.current = false;
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      deferredOverlayCleanupRef.current?.cancel?.();
      deferredOverlayCleanupRef.current = null;
      autoScrolledWeekKeyRef.current = null;

      return () => {
        autoScrolledWeekKeyRef.current = null;
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (!isTokenLoading) {
        const hasCached = Object.prototype.hasOwnProperty.call(
          weekEventsByKeyRef.current,
          getCalendarWeekKey(weekStart)
        );
        void fetchEventsForWeek(weekStart, { silent: hasCached });
        const prefetchTimeoutId = setTimeout(() => {
          const task = InteractionManager.runAfterInteractions(() => {
            prefetchWeeksAround(weekStart);
          });
          deferredPrefetchRef.current = task;
        }, 900);

        return () => {
          clearTimeout(prefetchTimeoutId);
          deferredPrefetchRef.current?.cancel?.();
          deferredPrefetchRef.current = null;
        };
      }
    }, [isTokenLoading, fetchEventsForWeek, prefetchWeeksAround, weekEventsByKeyRef, weekStart])
  );

  useFocusEffect(
    useCallback(() => {
      if (isTokenLoading || isGoogleConnected || hasShownGoogleDisconnectedToastThisLaunch) {
        return;
      }

      hasShownGoogleDisconnectedToastThisLaunch = true;
      setIsGoogleDisconnectedNoticeVisible(true);
      if (googleDisconnectedNoticeTimeoutRef.current) {
        clearTimeout(googleDisconnectedNoticeTimeoutRef.current);
      }
      googleDisconnectedNoticeTimeoutRef.current = setTimeout(() => {
        googleDisconnectedNoticeTimeoutRef.current = null;
        setIsGoogleDisconnectedNoticeVisible(false);
      }, 3500);
    }, [isGoogleConnected, isTokenLoading])
  );

  // Periodic background refresh while this screen is focused
  useFocusEffect(
    useCallback(() => {
      const intervalId = setInterval(() => {
        try {
          void fetchEventsForWeek(weekStartRef.current, { silent: true });
        } catch {}
      }, 60000);
      return () => clearInterval(intervalId);
    }, [fetchEventsForWeek, weekStartRef])
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        cancelCalendarEventRequests();
        stopAutoScroll();
        resetDrag();
        dropInProgressRef.current = false;
        if (compactResyncTimeoutRef.current) {
          clearTimeout(compactResyncTimeoutRef.current);
          compactResyncTimeoutRef.current = null;
        }
        if (searchDebounceRef.current) {
          clearTimeout(searchDebounceRef.current);
          searchDebounceRef.current = null;
        }
        scheduleOverlayCleanup();
      };
    }, [cancelCalendarEventRequests, resetDrag, scheduleOverlayCleanup, stopAutoScroll])
  );

  useEffect(() => {
    return () => {
      deferredOverlayCleanupRef.current?.cancel?.();
      deferredPrefetchRef.current?.cancel?.();
      if (compactResyncTimeoutRef.current) {
        clearTimeout(compactResyncTimeoutRef.current);
      }
      if (revealEventTimeoutRef.current) {
        clearTimeout(revealEventTimeoutRef.current);
      }
      if (googleDisconnectedNoticeTimeoutRef.current) {
        clearTimeout(googleDisconnectedNoticeTimeoutRef.current);
        googleDisconnectedNoticeTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingEventScrollDate || !selectedEvent || !eventDetails) return;
    if (!timelineLayoutReady) return;

    const targetWeekStart = startOfWeek(pendingEventScrollDate, { weekStartsOn: CALENDAR_WEEK_STARTS_ON });
    if (targetWeekStart.getTime() !== weekStart.getTime()) return;
    const weekKey = getAutoScrollWeekKey(weekStart);

    const timer = setTimeout(() => {
      if (shouldForcePendingEventScrollRef.current || autoScrolledWeekKeyRef.current !== weekKey) {
        const didScroll = scrollToEventTime(pendingEventScrollDate, false);
        if (didScroll) {
          autoScrolledWeekKeyRef.current = weekKey;
        }
      }
      eventDetailsBottomSheetRef.current?.expand();
      shouldForcePendingEventScrollRef.current = false;
      setPendingEventScrollDate(null);
    }, 0);

    return () => clearTimeout(timer);
  }, [getAutoScrollWeekKey, pendingEventScrollDate, selectedEvent, eventDetails, timelineLayoutReady, weekStart, scrollToEventTime]);

  useEffect(() => {
    if (!isFocused || !timelineLayoutReady) return;
    if (!pendingScrollDate) return;
    if (pendingEventScrollDate || selectedEvent || eventDetails || pendingOpen) return;

    const targetWeekStart = startOfWeek(pendingScrollDate, { weekStartsOn: CALENDAR_WEEK_STARTS_ON });
    if (targetWeekStart.getTime() !== weekStart.getTime()) return;
    const weekKey = getAutoScrollWeekKey(weekStart);
    const scrollDate = new Date(pendingScrollDate);

    const timer = setTimeout(() => {
      const didScroll = scrollToEventTime(scrollDate, pendingScrollAnimatedRef.current);
      if (!didScroll) return;
      requestAnimationFrame(() => {
        scrollToEventTime(scrollDate, false);
      });
      pendingScrollAnimatedRef.current = false;
      autoScrolledWeekKeyRef.current = weekKey;
      setPendingScrollDate(null);
    }, 0);

    return () => clearTimeout(timer);
  }, [
    eventDetails,
    isFocused,
    getAutoScrollWeekKey,
    pendingEventScrollDate,
    pendingOpen,
    pendingScrollDate,
    scrollToEventTime,
    selectedEvent,
    timelineLayoutReady,
    weekStart,
  ]);

  useEffect(() => {
    if (!isFocused || isLoading || !timelineLayoutReady) return;
    if (pendingEventScrollDate || pendingScrollDate || selectedEvent || eventDetails || pendingOpen) return;
    if (!initialAutoScrollDate) return;

    const weekKey = getAutoScrollWeekKey(weekStart);
    if (autoScrolledWeekKeyRef.current === weekKey) return;

    const timer = setTimeout(() => {
      if (autoScrolledWeekKeyRef.current === weekKey) return;
      const didScroll = scrollToEventTime(initialAutoScrollDate, false);
      if (didScroll) {
        autoScrolledWeekKeyRef.current = weekKey;
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [
    eventDetails,
    getAutoScrollWeekKey,
    initialAutoScrollDate,
    isFocused,
    isLoading,
    pendingEventScrollDate,
    pendingOpen,
    scrollToEventTime,
    selectedEvent,
    timelineLayoutReady,
    weekStart,
    pendingScrollDate,
  ]);

  const createGoogleCalendarEvent = useCallback(async (draft: ComposerCalendarEventDraft): Promise<string | null> => {
    let currentAccessToken = await getAccessToken();
    if (!currentAccessToken) {
      return null;
    }
    const draftTitle = draft.title.trim();
    const draftDetails = draft.details;
    const draftLocation = draft.location;
    const draftGuests = draft.guests;
    const draftStart = draft.startDate;
    const draftEnd = draft.endDate;
    if (!draftTitle || !draftStart || !draftEnd) {
      console.error('Missing required data for creating event');
      return null;
    }

    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startDateTime = new Date(draftStart);
    let endDateTime = new Date(draftEnd);
    if (endDateTime <= startDateTime) {
      endDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60000);
    }

    const formatToRFC3339 = (date: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return date.getFullYear() + '-' +
        pad(date.getMonth() + 1) + '-' +
        pad(date.getDate()) + 'T' +
        pad(date.getHours()) + ':' +
        pad(date.getMinutes()) + ':' +
        pad(date.getSeconds()) +
        (userTimeZone === 'UTC' ? 'Z' : '');
    };

    const event = {
      ...(draft.googleEventId ? { id: draft.googleEventId } : null),
      summary: draftTitle,
      description: draftDetails.trim() || WAVE_EVENT_DESCRIPTION_SENTINEL,
      location: draftLocation,
      start: {
        dateTime: formatToRFC3339(startDateTime),
        timeZone: userTimeZone,
      },
      end: {
        dateTime: formatToRFC3339(endDateTime),
        timeZone: userTimeZone,
      },
      conferenceData: {
        createRequest: {
          requestId: Math.random().toString(36).substring(2),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      attendees: draftGuests.map(email => ({ email })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 }
        ]
      }
    };

    try {
      // console.log('Sending request to Google Calendar API');
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        }
      );

      if (response.ok) {
        const responseData = await response.json();
        return responseData.id;
      } else if (response.status === 409 && draft.googleEventId) {
        return draft.googleEventId;
      } else {
        console.error('Failed to create event on Google Calendar');
        return null;
      }
    } catch (error) {
      console.error('Error creating event on Google Calendar:', error);
      return null;
    }
  }, [getAccessToken]);

  const deleteGoogleCalendarEvent = useCallback(async (eventId?: string | null) => {
    const googleEventId = String(eventId || '').trim();
    if (!googleEventId) {
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('GOOGLE_AUTH_REQUIRED');
    }

    try {
      await deleteGoogleCalendarEventById(googleEventId, accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (
        message === 'GOOGLE_AUTH_REQUIRED' ||
        message === 'GOOGLE_DELETE_FORBIDDEN' ||
        message === 'GOOGLE_DELETE_FAILED'
      ) {
        throw error;
      }
      console.error('Error deleting event from Google Calendar:', error);
      throw new Error('GOOGLE_DELETE_FAILED');
    }
  }, [getAccessToken]);

  const syncPendingGoogleCalendarCreates = useCallback(async () => {
    if (pendingGoogleCreateSyncInFlightRef.current || !isGoogleConnected || isTokenLoading) {
      return;
    }
    pendingGoogleCreateSyncInFlightRef.current = true;
    try {
      await queueUnsyncedLocalEvents().catch((error) => console.error('Error finding app events to copy to Google:', error));
      const pendingSyncs = await readPendingGoogleCreateSyncs();
      let shouldRefreshVisibleWeek = false;

      for (const pendingSync of pendingSyncs) {
        const googleEventId = pendingSync.googleEventId || getGoogleEventIdForLocalEvent(pendingSync.localEventId);
        try {
          if (deletedLocalEventIdsRef.current.has(pendingSync.localEventId)) {
            if (googleEventId) {
              try {
                await deleteGoogleCalendarEvent(googleEventId);
                shouldRefreshVisibleWeek = true;
              } catch (error) {
                console.error('Error cleaning up deleted pending Google calendar event:', error);
                continue;
              }
            }
            await removePendingGoogleCreateSync(pendingSync.localEventId);
            continue;
          }

          let localEvent: EventModel;
          try {
            localEvent = await database.get<EventModel>('events').find(pendingSync.localEventId);
          } catch {
            if (googleEventId) {
              try {
                await deleteGoogleCalendarEvent(googleEventId);
                shouldRefreshVisibleWeek = true;
              } catch (error) {
                console.error('Error cleaning up orphaned pending Google calendar event:', error);
                continue;
              }
            }
            await removePendingGoogleCreateSync(pendingSync.localEventId);
            continue;
          }

          if (localEvent.googleEventId) {
            await removePendingGoogleCreateSync(pendingSync.localEventId);
            continue;
          }

          const draft: ComposerCalendarEventDraft = {
            title: String(localEvent.title || pendingSync.title || '').trim(),
            details: String(localEvent.details ?? pendingSync.details ?? '').trim(),
            location: String(localEvent.location ?? pendingSync.location ?? ''),
            guests: pendingSync.guests,
            startDate: new Date(localEvent.startDate || pendingSync.startDate),
            endDate: new Date(localEvent.endDate || pendingSync.endDate),
            googleEventId,
          };

          const syncedGoogleEventId = await createGoogleCalendarEvent(draft);
          if (!syncedGoogleEventId) {
            continue;
          }
          const pendingSyncWithGoogleId = { ...pendingSync, googleEventId: syncedGoogleEventId };
          await queuePendingGoogleCreateSync(pendingSyncWithGoogleId);
          if (deletedLocalEventIdsRef.current.has(pendingSync.localEventId)) {
            try {
              await deleteGoogleCalendarEvent(syncedGoogleEventId);
            } catch (error) {
              console.error('Error deleting Google calendar event after local delete:', error);
              continue;
            }
            await removePendingGoogleCreateSync(pendingSync.localEventId);
            shouldRefreshVisibleWeek = true;
            continue;
          }

          let linkedLocalEvent = false;
          await database.write(async () => {
            let latestLocalEvent: EventModel;
            try {
              latestLocalEvent = await database.get<EventModel>('events').find(pendingSync.localEventId);
            } catch {
              return;
            }
            if (deletedLocalEventIdsRef.current.has(pendingSync.localEventId)) {
              return;
            }
            if (latestLocalEvent.googleEventId) {
              linkedLocalEvent = true;
              return;
            }
            await latestLocalEvent.update((event) => {
              event.googleEventId = syncedGoogleEventId;
            });
            linkedLocalEvent = true;
          });
          if (!linkedLocalEvent) {
            try {
              await deleteGoogleCalendarEvent(syncedGoogleEventId);
            } catch (error) {
              console.error('Error deleting Google calendar event after skipped local link:', error);
              continue;
            }
            await removePendingGoogleCreateSync(pendingSync.localEventId);
            shouldRefreshVisibleWeek = true;
            continue;
          }
          await removePendingGoogleCreateSync(pendingSync.localEventId);
          shouldRefreshVisibleWeek = true;
        } catch (error) {
          console.error('Error syncing pending Google calendar event:', error);
        }
      }

      if (shouldRefreshVisibleWeek) {
        await fetchEventsForWeek(weekStartRef.current, { silent: true });
      }
    } finally {
      pendingGoogleCreateSyncInFlightRef.current = false;
    }
  }, [createGoogleCalendarEvent, deleteGoogleCalendarEvent, fetchEventsForWeek, isGoogleConnected, isTokenLoading, weekStartRef]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    void syncPendingGoogleCalendarCreates();
  }, [isFocused, syncPendingGoogleCalendarCreates]);

  // delete event
  const deleteEvent = useCallback(async (event: EventModel) => {
    // Closes the details sheet and its state together, so the calendar never stays hidden.
    const closeEventDetails = () => {
      eventDetailsBottomSheetRef.current?.close();
      setSelectedEvent(null);
      setEventDetails(null);
      setIsEventDetailsOpen(false);
    };
    const deleteFromLocal = async () => {
      const recordId = String((event as any)?.id || (event as any)?._raw?.id || '');
      if (!recordId) {
        return false;
      }

      deletedLocalEventIdsRef.current.add(recordId);

      try {
        await database.write(async () => {
          // Already gone (deleted twice, or with its repeat or task): nothing left to delete.
          const record = await database.get<EventModel>('events').find(recordId).catch(() => null);
          await record?.destroyPermanently();
        });
        return true;
      } catch (error) {
        deletedLocalEventIdsRef.current.delete(recordId);
        console.error('Error deleting event from local database:', error);
        console.error('Event details:', event);
        return false;
      }
    };
    const deleteThisEvent = async () => {
      try {
        // Close the event details sheet immediately for instant UI feedback
        closeEventDetails();

        let linkedGoogleEventId = event.isGoogleEvent ? String(event.id || '') : String(event.googleEventId || '');
        if (!event.isGoogleEvent) {
          const recordId = String((event as any)?.id || (event as any)?._raw?.id || '');
          if (recordId) {
            try {
              const latestLocalEvent = await database.get<EventModel>('events').find(recordId);
              linkedGoogleEventId = String(latestLocalEvent.googleEventId || linkedGoogleEventId);
            } catch {}
          }
        }

        let googleDeleteError: unknown = null;
        if (linkedGoogleEventId) {
          try {
            await deleteGoogleCalendarEvent(linkedGoogleEventId);
          } catch (error) {
            // An event that only lives on Google can't be removed without it. One that is
            // also in Eazee is still removed here, so the user is never stuck with it.
            const message = error instanceof Error ? error.message : '';
            if (event.isGoogleEvent || message === 'GOOGLE_AUTH_REQUIRED') throw error;
            googleDeleteError = error;
          }
        }

        if (!event.isGoogleEvent) {
          const success = await deleteFromLocal();
          if (!success) {
            throw new Error('LOCAL_DELETE_FAILED');
          }
        }
        if (googleDeleteError) {
          Alert.alert('Deleted from Eazee', "Google Calendar didn't accept the delete, so it may still be in Google Calendar.");
        }

        // If we get here, the deletion was successful
        closeEventDetails();
        await fetchEventsForWeek(weekStart);
      } catch (error) {
        console.error('Error during deletion:', error);
        const message = error instanceof Error ? error.message : '';
        showDeleteError(error);
      }
    };

    function showDeleteError(error: unknown) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'GOOGLE_AUTH_REQUIRED') {
        Alert.alert('Google account required', 'Reconnect Google Calendar, then try deleting this event again.');
      } else if (message === 'GOOGLE_DELETE_FORBIDDEN') {
        Alert.alert('Read-only event', "This Google Calendar event can't be deleted from Eazee.");
      } else if (message === 'GOOGLE_DELETE_FAILED') {
        // Say which part failed, so a report shows whether it was Google or this phone.
        const { status, reason } = error as { status?: number; reason?: string };
        Alert.alert(
          "Couldn't delete the event",
          status
            // Google's own reason makes a report from the field diagnosable.
            ? `Google Calendar didn't accept the delete (error ${status}${reason ? `: ${reason}` : ''}). Please try again.`
            : "Google Calendar couldn't be reached. Check your connection and try again."
        );
      } else if (message === 'LOCAL_DELETE_FAILED') {
        Alert.alert("Couldn't delete the event", "It couldn't be removed on this phone. Please try again.");
      } else {
        Alert.alert('Error', 'Failed to delete the event. Please try again.');
      }
    }

    const localRecordId = event.isGoogleEvent ? '' : String((event as any)?.id || (event as any)?._raw?.id || '');
    let seriesId = '';
    if (localRecordId) {
      try {
        seriesId = String((await database.get<EventModel>('events').find(localRecordId)).seriesId || '');
      } catch {}
    }

    if (seriesId) {
      Alert.alert(
        "Delete repeating event",
        "This event repeats every week.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "This event only", onPress: () => void deleteThisEvent() },
          {
            text: "This and following",
            style: "destructive",
            onPress: async () => {
              try {
                closeEventDetails();
                deletedLocalEventIdsRef.current.add(localRecordId);
                await stopEventSeriesFrom(seriesId, new Date(event.startDate));
                await fetchEventsForWeek(weekStart);
              } catch (error) {
                deletedLocalEventIdsRef.current.delete(localRecordId);
                console.error('Error deleting repeating event:', error);
                showDeleteError(error);
              }
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      "Delete Event",
      "Are you sure you want to delete this event?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteThisEvent(),
        }
      ]
    );
  }, [deleteGoogleCalendarEvent, fetchEventsForWeek, weekStart]);


  const handleEventPress = useCallback(async (event: EventModel, options?: { forceScroll?: boolean }) => {
    const eventId = String(event.id || '');
    if (eventId) {
      setOpeningEventId(eventId);
    }
    try {
      Haptics.selectionAsync();
    } catch {}

    try {
      const fetchEventDetails = async () => {
        if (event.isGoogleEvent) {
          return await getGoogleCalendarEvent(event.id);
        } else if (event.googleEventId) {
          const googleEventDetails = await getGoogleCalendarEvent(event.googleEventId);
          if (!googleEventDetails) {
            return {
              id: event.id,
              summary: event.title,
              start: { dateTime: event.startDate.toISOString() },
              end: { dateTime: event.endDate.toISOString() },
              description: normalizeCalendarDetailsText(event.details),
              location: event.location,
              latitude: event.latitude,
              longitude: event.longitude,
            };
          }
          return {
            ...googleEventDetails,
            description: normalizeCalendarDetailsText(googleEventDetails.description),
            location: event.location || googleEventDetails.location,
            latitude: event.latitude,
            longitude: event.longitude,
          };
        } else {
          return {
            id: event.id,
            summary: event.title,
            start: { dateTime: event.startDate.toISOString() },
            end: { dateTime: event.endDate.toISOString() },
            description: normalizeCalendarDetailsText(event.details),
            location: event.location,
            latitude: event.latitude,
            longitude: event.longitude,
          };
        }
      };
      const details = await fetchEventDetails();
      if (details) {
        let normalizedSelected: EventModel = event;
        if (event.isGoogleEvent) {
          const startIso = details?.start?.dateTime || details?.start?.date;
          const endIso = details?.end?.dateTime || details?.end?.date;
          normalizedSelected = {
            ...event,
            title: event.title || details?.summary || '',
            details: normalizeCalendarDetailsText(details?.description),
            startDate: parseCalendarDateValue(startIso) || event.startDate,
            endDate: parseCalendarDateValue(endIso) || event.endDate,
          } as EventModel;
        }
        setSelectedEvent(normalizedSelected);
        setEventDetails(details);
        const eventStart = new Date(normalizedSelected.startDate);
        const targetWeekStart = startOfWeek(eventStart, { weekStartsOn: CALENDAR_WEEK_STARTS_ON });
        if (targetWeekStart.getTime() !== weekStart.getTime()) {
          setWeekStart(targetWeekStart);
        }
        shouldForcePendingEventScrollRef.current = !!options?.forceScroll;
        setPendingEventScrollDate(eventStart);
        setIsEventDetailsOpen(true);
      } else {
        Alert.alert('Error', 'Could not load event details.');
      }
    } finally {
      setOpeningEventId((current) => (current === eventId ? null : current));
    }
  }, [getGoogleCalendarEvent, setWeekStart, weekStart]);

  const handleSearchResultPress = useCallback(async (item: SearchItem) => {
    try {
      closeSearch();
      if (item.source === 'local') {
        const localEvent = await database.get<EventModel>('events').find(item.id);
        await handleEventPress(localEvent, { forceScroll: true });
      } else {
        const pseudoEvent: any = {
          id: item.id,
          title: item.title,
          startDate: item.startDate,
          endDate: item.endDate,
          isGoogleEvent: true,
          isAllDay: item.isAllDay,
        };
        await handleEventPress(pseudoEvent, { forceScroll: true });
      }
    } catch {
      // noop
    }
  }, [closeSearch, handleEventPress]);

  const handleCompactNoticeAction = useCallback(() => {
    if (aiNotice?.kind === 'confirm') {
      void confirmPendingAction();
      return;
    }

    const target = aiNotice?.target as CompactAiNoticeTarget | undefined;
    if (target) {
      dismissNotice();
      if (target.type === 'event') {
        setPendingOpen({ id: target.eventId, source: target.source });
        return;
      }

      const shortcut = getShortcutForGuidanceTarget(target as GuidanceTarget);
      router.push({ pathname: shortcut.pathname as any, params: shortcut.params });
      return;
    }

    router.push({ pathname: '/(tabs)/chat', params: getHandoffChatParams() || {} });
  }, [aiNotice, confirmPendingAction, dismissNotice, getHandoffChatParams, router]);

  // Queue opening from params on focus, avoid duplicate opens for same id
  useFocusEffect(
    useCallback(() => {
      const uniqueKey = `${openEventId || ''}:${openNonce || ''}`;
      if (openEventId && openedFromParamsRef.current !== uniqueKey) {
        setPendingOpen({ id: String(openEventId), source: openEventSource === 'google' ? 'google' : 'local' });
        openedFromParamsRef.current = uniqueKey;
        router.setParams({
          openEventId: undefined,
          openEventSource: undefined,
          openNonce: undefined,
        } as any);
      }
    }, [openEventId, openEventSource, openNonce, router])
  );

  useFocusEffect(
    useCallback(() => {
      const uniqueKey = `${calendarAction || ''}:${calendarActionNonce || ''}`;
      if (calendarAction && calendarActionNonce && actionFromParamsRef.current !== uniqueKey) {
        actionFromParamsRef.current = uniqueKey;
        router.setParams({
          calendarAction: undefined,
          calendarActionNonce: undefined,
        } as any);
        if (calendarAction === 'search') {
          setIsSearchOpen(true);
          completeCalendarGuidanceAction('search');
        }
      }
    }, [calendarAction, calendarActionNonce, completeCalendarGuidanceAction, router])
  );

  useFocusEffect(
    useCallback(() => {
      const uniqueKey = `${scrollToDateTime || ''}:${scrollNonce || ''}`;
      if (!scrollToDateTime || scrollFromParamsRef.current === uniqueKey) {
        return;
      }

      const targetDate = new Date(scrollToDateTime);
      if (Number.isNaN(targetDate.getTime())) {
        router.setParams({
          scrollToDateTime: undefined,
          scrollNonce: undefined,
        } as any);
        return;
      }

      const targetWeekStart = startOfWeek(targetDate, { weekStartsOn: CALENDAR_WEEK_STARTS_ON });
      if (targetWeekStart.getTime() !== weekStart.getTime()) {
        setWeekStart(targetWeekStart);
      }

      setPendingScrollDate(targetDate);
      scrollFromParamsRef.current = uniqueKey;
      router.setParams({
        scrollToDateTime: undefined,
        scrollNonce: undefined,
      } as any);
    }, [router, scrollNonce, scrollToDateTime, setWeekStart, weekStart])
  );

  useEffect(() => {
    if (!isFocused || activeTarget?.type !== 'event') {
      return;
    }

    const targetDate = parseCalendarDateValue(activeTarget.startDate);
    if (!targetDate) {
      return;
    }

    const targetWeekStart = startOfWeek(targetDate, { weekStartsOn: CALENDAR_WEEK_STARTS_ON });
    if (targetWeekStart.getTime() !== weekStart.getTime()) {
      setWeekStart(targetWeekStart);
    }
    setPendingScrollDate(targetDate);
  }, [activeTarget, isFocused, setWeekStart, weekStart]);

  // Attempt to open when prerequisites are ready (e.g., tokens fetched on first app launch)
  useEffect(() => {
    if (!pendingOpen) return;
    const attempt = async () => {
      if (isOpeningFromParamsRef.current) return;
      isOpeningFromParamsRef.current = true;
      try {
        if (pendingOpen.source === 'google') {
          if (isTokenLoading || !isGoogleConnected) return; // wait for an active Google connection
          const pseudoEvent: any = {
            id: pendingOpen.id,
            title: '',
            startDate: new Date(),
            endDate: new Date(),
            isGoogleEvent: true,
          };
          await handleEventPress(pseudoEvent, { forceScroll: true });
          setPendingOpen(null);
        } else {
          const local = await database.get<EventModel>('events').find(pendingOpen.id);
          await handleEventPress(local, { forceScroll: true });
          setPendingOpen(null);
        }
      } catch {
        // keep pending if it fails; will retry on next relevant state change
      } finally {
        isOpeningFromParamsRef.current = false;
      }
    };
    attempt();
  }, [pendingOpen, isGoogleConnected, isTokenLoading, handleEventPress]);


  // note create in event details
  const renderEventDetailsBottomSheetContent = () => {
    const selectedEventUsesGoogleDetails = !!(selectedEvent?.isGoogleEvent || selectedEvent?.googleEventId);
    const visibleEventDetails = selectedEventUsesGoogleDetails
      ? normalizeCalendarDetailsText(eventDetails?.description)
      : normalizeCalendarDetailsText(eventDetails?.description) || normalizeCalendarDetailsText(selectedEvent?.details);
    const eventDetailsRawCloseButton = (
      <LiquidGlassIconButton
        debugLabel="calendar:event-details:x"
        onPress={() => eventDetailsBottomSheetRef.current?.close()}
        size={38}
        fallbackTint="dark"
        fallbackBackgroundColor="rgba(223, 251, 255, 0.16)"
        fallbackBorderColor="rgba(223, 251, 255, 0.28)"
        style={styles.eventDetailsCloseButton}
      >
        <Text style={styles.eventDetailsCloseButtonText}>✕</Text>
      </LiquidGlassIconButton>
    );
    const eventDetailsCloseButton = isEventDetailsOpen ? (
      <GuidedTarget
        targetId={getCalendarBackGuidanceTargetId()}
        label="Back"
        localHighlightRadius={999}
        localHighlightInset={4}
      >
        {eventDetailsRawCloseButton}
      </GuidedTarget>
    ) : eventDetailsRawCloseButton;
    const eventDetailsActionButtons = selectedEvent ? (
      <>
        <TouchableOpacity
          onPress={() => {
            if (!selectedEvent || !eventDetails) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setIsEditMode(true);
            setEditingEvent(selectedEvent);
            setEditTitle(selectedEvent.title || '');
            setEditDetails(visibleEventDetails);
            try {
              const startIso = eventDetails?.start?.dateTime || eventDetails?.start?.date;
              const endIso = eventDetails?.end?.dateTime || eventDetails?.end?.date;
              const start = parseCalendarDateValue(startIso) || new Date(selectedEvent.startDate);
              const end = parseCalendarDateValue(endIso) || new Date(selectedEvent.endDate);
              setEditStart(start);
              setEditEnd(end);
            } catch {
              setEditStart(new Date(selectedEvent.startDate));
              setEditEnd(new Date(selectedEvent.endDate));
            }
            try {
              const emails = (eventDetails?.attendees || []).map((a: any) => a?.email).filter((e: any) => !!e);
              setEditGuests(emails);
            } catch {
              setEditGuests([]);
            }
            eventDetailsBottomSheetRef.current?.close();
            openCreateSheet(CREATE_SHEET_EXPANDED_INDEX);
          }}
          style={[styles.detailEditButton, styles.detailActionButton]}
        >
          <Text style={styles.detailActionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            void deleteEvent(selectedEvent);
          }}
          style={[styles.detailDeleteButton, styles.detailActionButton]}
        >
          <Text style={styles.detailActionButtonText}>Delete</Text>
        </TouchableOpacity>
      </>
    ) : null;

    return (
    <View style={styles.eventBottomSheetContent}>
      <View
        style={[
          styles.bottomSheetHeader,
          styles.eventDetailsHeader,
          isLeftHanded ? styles.eventDetailsHeaderLeft : styles.eventDetailsHeaderRight,
        ]}
      >
        <View style={styles.eventDetailsHeaderActions}>
          {isLeftHanded ? (
            <>
              {eventDetailsCloseButton}
              {eventDetailsActionButtons}
            </>
          ) : (
            <>
              {eventDetailsActionButtons}
              {eventDetailsCloseButton}
            </>
          )}
        </View>
      </View>
      {selectedEvent && eventDetails ? (
        <ScrollViewWithBar
          bounces={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.eventDetailsScrollContent}
        >
          <View style={styles.eventHeader}>
            <View style={[styles.eventColorIndicator, { backgroundColor: selectedEvent.isGoogleEvent ? '#4285F4' : EAZEE_EVENT_COLOR }]} />
            <Text style={styles.eventDetailTitle}>{selectedEvent.title}</Text>
          </View>
          <Text style={styles.eventDetailDateTime}>
            {(() => {
              const startIso = eventDetails?.start?.dateTime || eventDetails?.start?.date;
              const endIso = eventDetails?.end?.dateTime || eventDetails?.end?.date;
              if (!startIso || !endIso) return '';
              const start = parseCalendarDateValue(startIso);
              const end = parseCalendarDateValue(endIso);
              if (!start || !end) return '';
              const isAllDay = !eventDetails?.start?.dateTime || !eventDetails?.end?.dateTime;
              return isAllDay
                ? `${format(start, 'EEE, MMM d')} • All day`
                : `${format(start, 'EEE, MMM d • h:mm a')} - ${format(end, 'h:mm a')}`;
            })()}
          </Text>
          <View style={styles.eventDetailsDivider} />
          {eventDetails.hangoutLink && (
            <>
              <TouchableOpacity onPress={() => Linking.openURL(eventDetails.hangoutLink)} style={styles.eventContainer}>
                <View style={styles.iconContainer}>
                  <Icon name="video" size={20} color={EVENT_DETAILS_MEET_COLOR} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.meetJoinText}>Join with Google Meet</Text>
                  <Text style={styles.meetUrlText}>{eventDetails.hangoutLink}</Text>
                </View>
              </TouchableOpacity>
            </>
          )}
          {!!visibleEventDetails && (
            <View style={[styles.eventContainer, styles.eventDetailsTextRow]}>
              <View style={styles.iconContainer}>
                <Icon name="text-box-outline" size={20} color={EVENT_DETAILS_MEET_COLOR} />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.eventDetailsNoteText}>{visibleEventDetails}</Text>
              </View>
            </View>
          )}
          {eventDetails.location && (
            <>
              <View style={styles.eventContainer}>
                <View style={styles.iconContainer}>
                  <Icon name="map-marker" size={20} color={CREATE_SHEET_MUTED_TEXT_COLOR} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.locationText}>{eventDetails.location}</Text>
                </View>
              </View>
            </>
          )}
          {eventDetails.attendees && eventDetails.attendees.length > 0 && (
            <View style={styles.eventContainer}>
              <View style={styles.iconContainer}>
                <Icon name="account-multiple" size={20} color={CREATE_SHEET_MUTED_TEXT_COLOR} />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.guestText}>{eventDetails.attendees.length} guests</Text>
                <Text style={styles.linkText}>
                  {eventDetails.attendees.filter((attendee: any) => attendee.responseStatus === 'accepted').length} yes
                </Text>
              </View>
            </View>
          )}
        </ScrollViewWithBar>
      ) : (
        <Text style={styles.eventDetailsLoadingText}>Loading event details...</Text>
      )}
    </View>
    );
  };

  const handleSave = async () => {
    if (isSubmittingEvent) return;
    if (selectedSlot && eventTitle && newEventStart && newEventEnd) {
      setIsSubmittingEvent(true);
      Keyboard.dismiss();
      const saveFeedbackStartedAt = Date.now();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const startDate = new Date(newEventStart);
      let endDate = new Date(newEventEnd);
      if (endDate <= startDate) {
        endDate = new Date(endDate.getTime() + 24 * 60 * 60000);
      }
      const draft: ComposerCalendarEventDraft = {
        title: eventTitle,
        details: eventDetailsText.trim(),
        location,
        guests: withPendingGuest(guests, newGuest),
        startDate,
        endDate,
      };
      const selectedLocationSnapshot = selectedLocation;
      const weekStartSnapshot = new Date(weekStart);

      try {
        let localEventId = '';
        let createdEvent: EventModel | null = null;
        let pendingGoogleSync: PendingGoogleCreateSync | null = null;
        await database.write(async () => {
          const eventsCollection = database.get<EventModel>('events');
          const row = await eventsCollection.create((event) => {
            if (event) {
              event.title = draft.title;
              event.details = draft.details;
              event.startDate = startDate;
              event.startTime = startDate.getHours();
              event.endDate = endDate;
              event.endTime = endDate.getHours();
              event.isGoogleEvent = false;
              event.location = draft.location;
              if (selectedLocationSnapshot) {
                event.latitude = selectedLocationSnapshot.lat;
                event.longitude = selectedLocationSnapshot.lng;
              }
            } else {
              console.error('Event object is undefined in create function');
            }
          });
          localEventId = String((row as any).id || '');
          createdEvent = row as EventModel;
        });

        if (isGoogleConnected && localEventId) {
          pendingGoogleSync = {
            ...draft,
            localEventId,
            googleEventId: getGoogleEventIdForLocalEvent(localEventId),
            queuedAt: Date.now(),
          };
        }

        if (createdEvent && localEventId) {
          const visibleRangeStart = new Date(weekStartSnapshot);
          visibleRangeStart.setHours(0, 0, 0, 0);
          const visibleRangeEnd = addDays(visibleRangeStart, 7);
          if (startDate < visibleRangeEnd && endDate > visibleRangeStart) {
            updateCurrentWeekEvents((current) =>
              [...current.filter((event) => String(event.id) !== localEventId), createdEvent as EventModel].sort(
                (a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
              ) as EventModel[]
            );
          }
        }

        const feedbackRemainingMs = SAVE_BUTTON_FEEDBACK_MS - (Date.now() - saveFeedbackStartedAt);
        if (feedbackRemainingMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, feedbackRemainingMs));
        }
        closeCreateSheet({ finishImmediately: true });
        if (createdEvent && localEventId) {
          const targetWeekStart = normalizeCalendarWeekStart(startDate);
          const targetWeekKey = getCalendarWeekKey(targetWeekStart);
          const visibleWeekKey = getCalendarWeekKey(weekStartRef.current);

          autoScrolledWeekKeyRef.current = null;
          pendingScrollAnimatedRef.current = true;
          setPendingScrollDate(startDate);
          revealSlotRange(startDate, endDate);

          if (targetWeekKey !== visibleWeekKey) {
            const hasTargetWeekCache = Object.prototype.hasOwnProperty.call(
              weekEventsByKeyRef.current,
              targetWeekKey
            );

            cancelWeekSwipe();
            weekStartRef.current = targetWeekStart;
            setPagerResetWeekStart(null);
            setProgrammaticWeekStarts(null);
            setPagerWeekStart(targetWeekStart);
            setWeekStart(targetWeekStart);
            void fetchEventsForWeek(targetWeekStart, { silent: hasTargetWeekCache });
          }
          scheduleCalendarTutorialEventCreated();
        }
        if (pendingGoogleSync) {
          void (async () => {
            try {
              await queuePendingGoogleCreateSync(pendingGoogleSync);
              await syncPendingGoogleCalendarCreates();
            } catch (error) {
              console.error('Error queueing Google calendar sync:', error);
            }
          })();
        } else {
          void syncPendingGoogleCalendarCreates();
        }
      } catch (error) {
        console.error('Error in handleSave:', error);
      } finally {
        setIsSubmittingEvent(false);
      }
    } else {
      // console.log('Missing selectedSlot or eventTitle');
    }
    // console.log('Finished handleSave');
  };

  const handleUpdate = async () => {
    if (isSubmittingEvent) return;
    if (!editingEvent) return;

    try {
      setIsSubmittingEvent(true);
      Keyboard.dismiss();
      const currentStart = editStart ? new Date(editStart) : new Date(editingEvent.startDate);
      let currentEnd = editEnd ? new Date(editEnd) : new Date(editingEvent.endDate);
      // If same-clock time rolls end before start (e.g., 11 PM -> 12 AM), move end to next day
      if (currentEnd <= currentStart) {
        currentEnd = new Date(currentEnd.getTime() + 24 * 60 * 60000);
      }

      // Update Google Calendar if it's a Google event
      if (editingEvent.isGoogleEvent || editingEvent.googleEventId) {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        const eventId = editingEvent.isGoogleEvent ? editingEvent.id : editingEvent.googleEventId;
        // Try to include time changes too
        const details: any = await getGoogleCalendarEvent(eventId!);
        const isAllDay = !!(details?.start?.date && !details?.start?.dateTime);
        const tz = details?.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const timeBody = isAllDay
          ? {
              start: { date: format(currentStart, 'yyyy-MM-dd') },
              end: { date: format(currentEnd, 'yyyy-MM-dd') },
            }
          : {
              start: { dateTime: currentStart.toISOString(), timeZone: tz },
              end: { dateTime: currentEnd.toISOString(), timeZone: tz },
            };
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: editTitle,
              description: editDetails.trim(),
              attendees: withPendingGuest(editGuests, newGuest).map(email => ({ email })),
              ...timeBody,
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to update Google Calendar event');
        }
      }

      // Update local database
      try {
        await database.write(async () => {
          const event = await database.get<EventModel>('events').find(editingEvent.id);
          await event.update((record: EventModel) => {
            record.title = editTitle;
            record.details = editDetails.trim();
            try {
              if (editStart && editEnd) {
                record.startDate = currentStart;
                record.endDate = currentEnd;
                record.startTime = currentStart.getHours();
                record.endTime = currentEnd.getHours();
              }
            } catch {}
          });
        });
      } catch (error) {
        if (!editingEvent.isGoogleEvent) {
          throw error;
        }
      }

      // Close bottom sheet and reset states
      closeCreateSheet();
      await fetchEventsForWeek(weekStart);

    } catch (error) {
      console.error('Error updating event:', error);
      Alert.alert('Error', 'Failed to update event. Please try again.');
    } finally {
      setIsSubmittingEvent(false);
    }
  };


  const handleBottomSheetChange = (index: number) => {
    if (index === CREATE_SHEET_FORM_INDEX) {
      shouldFocusCreateTitleOnSheetExpandRef.current = false;
      Keyboard.dismiss();
    }
    if (index === -1) {
      Keyboard.dismiss();
      shouldFocusCreateTitleOnSheetExpandRef.current = false;
      requestedCreateSheetIndexRef.current = null;
      setCreateSheetTargetIndex(-1);
      isCreateSheetDismissingRef.current = true;
      finishCreateSheetDismissal();
      return;
    }
    if (isCreateSheetDismissingRef.current) {
      return;
    }
    const requestedIndex = requestedCreateSheetIndexRef.current;
    if (requestedIndex !== null && index !== requestedIndex) {
      return;
    }
    if (requestedIndex === index) {
      requestedCreateSheetIndexRef.current = null;
    }
    isCreateSheetDismissingRef.current = false;
    setCreateSheetTargetIndex(index);
    setCreateSheetIndex(index);
    setIsAnyBottomSheetOpen(true);
    setIsBottomSheetExpanded(index === CREATE_SHEET_EXPANDED_INDEX);
    if (index === CREATE_SHEET_EXPANDED_INDEX && shouldFocusCreateTitleOnSheetExpandRef.current) {
      shouldFocusCreateTitleOnSheetExpandRef.current = false;
      requestAnimationFrame(() => {
        createTitleInputRef.current?.focus();
      });
    }
  };

  const expandCreateSheetAndFocusTitle = useCallback(() => {
    if (isCreateSheetDismissingRef.current) {
      return;
    }
    shouldFocusCreateTitleOnSheetExpandRef.current = true;
    requestedCreateSheetIndexRef.current = CREATE_SHEET_EXPANDED_INDEX;
    setCreateSheetTargetIndex(CREATE_SHEET_EXPANDED_INDEX);
    setCreateSheetIndex(CREATE_SHEET_EXPANDED_INDEX);
    setIsBottomSheetExpanded(true);
    bottomSheetRef.current?.snapToIndex(CREATE_SHEET_EXPANDED_INDEX);
  }, []);

  const handleCreateTitleFocus = useCallback(() => {
    shouldFocusCreateTitleOnSheetExpandRef.current = false;
    if (isCreateSheetDismissingRef.current || createSheetIndex === CREATE_SHEET_EXPANDED_INDEX) {
      return;
    }
    requestedCreateSheetIndexRef.current = CREATE_SHEET_EXPANDED_INDEX;
    setCreateSheetTargetIndex(CREATE_SHEET_EXPANDED_INDEX);
    setCreateSheetIndex(CREATE_SHEET_EXPANDED_INDEX);
    setIsBottomSheetExpanded(true);
    bottomSheetRef.current?.snapToIndex(CREATE_SHEET_EXPANDED_INDEX);
  }, [createSheetIndex]);

  const handleEventDetailsFocus = useCallback(() => {
    setIsEventDetailsInputFocused(true);
    if (isCreateSheetDismissingRef.current || createSheetIndex === CREATE_SHEET_EXPANDED_INDEX) {
      return;
    }
    requestedCreateSheetIndexRef.current = CREATE_SHEET_EXPANDED_INDEX;
    setCreateSheetTargetIndex(CREATE_SHEET_EXPANDED_INDEX);
    setCreateSheetIndex(CREATE_SHEET_EXPANDED_INDEX);
    setIsBottomSheetExpanded(true);
    bottomSheetRef.current?.snapToIndex(CREATE_SHEET_EXPANDED_INDEX);
  }, [createSheetIndex]);


  const isEditPickerBlocking = activeEditPicker !== null || activeCreatePicker !== null || isEditPickerClosing;
  const isCreateSheetCompact =
    createSheetIndex === CREATE_SHEET_COMPACT_INDEX &&
    (
      (isEditMode && !!editingEvent) ||
      (!!selectedSlot && !!newEventStart && !!newEventEnd)
    );
  const compactSheetTitle = isEditMode
    ? editTitle.trim() || editingEvent?.title?.trim() || '(No title)'
    : eventTitle.trim() || '(No title)';
  const shouldShowEventDetailsInput =
    createSheetIndex === CREATE_SHEET_EXPANDED_INDEX ||
    createSheetTargetIndex === CREATE_SHEET_EXPANDED_INDEX ||
    isEventDetailsInputFocused;

  const renderBottomSheetContent = () => {
    if (isCreateSheetCompact) {
      return (
        <Pressable
          onTouchStart={(event) => {
            compactCreateSheetTouchStartYRef.current = event.nativeEvent.pageY;
            compactCreateSheetDidMoveRef.current = false;
          }}
          onTouchMove={(event) => {
            if (Math.abs(event.nativeEvent.pageY - compactCreateSheetTouchStartYRef.current) > 6) {
              compactCreateSheetDidMoveRef.current = true;
            }
          }}
          onPress={() => {
            if (compactCreateSheetDidMoveRef.current) {
              return;
            }
            expandCreateSheetAndFocusTitle();
          }}
          style={[styles.bottomSheetContent, styles.compactCreateSheetContent]}
        >
          <Text style={styles.compactCreateSheetTitle} numberOfLines={1}>
            {compactSheetTitle}
          </Text>
        </Pressable>
      );
    }

    const closeCreateSheetButton = (
      <TouchableOpacity
        onPress={() => {
          closeCreateSheet();
        }}
        style={styles.closeButtonContainer}
      >
        <Text style={styles.closeButton}>✕</Text>
      </TouchableOpacity>
    );
    const saveCreateSheetButton = (
      <Pressable
        onPress={() => {
          const canSubmit = isEditMode
            ? !!editingEvent
            : !!(selectedSlot && eventTitle && newEventStart && newEventEnd);
          if (canSubmit) {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }
          void (isEditMode ? handleUpdate() : handleSave());
        }}
        style={({ pressed }) => [
          styles.saveButton,
          isEditMode ? styles.primaryWideButton : null,
          pressed ? styles.saveButtonPressed : null,
          isSubmittingEvent ? styles.saveButtonSaving : null,
        ]}
        disabled={isSubmittingEvent}
      >
        <Text style={styles.saveButtonText}>
          {isSubmittingEvent ? (isEditMode ? 'Updating...' : 'Saving...') : (isEditMode ? 'Update' : 'Save')}
        </Text>
      </Pressable>
    );

    return (
      <View style={styles.bottomSheetContent} pointerEvents={isEditPickerBlocking ? 'none' : 'auto'}>
      <View style={styles.bottomSheetHeader}>
        {isLeftHanded ? saveCreateSheetButton : closeCreateSheetButton}
        {isLeftHanded ? closeCreateSheetButton : saveCreateSheetButton}
      </View>
      {isCalendarTutorialCreating && !isEditMode && (
        // The walkthrough's card is hidden behind this form, so its instruction moves in here.
        <View style={styles.tutorialHint} accessibilityRole="text">
          <Text style={styles.tutorialHintLabel}>Walkthrough</Text>
          <Text style={styles.tutorialHintText}>Add a title, then tap Save to create your event and finish this step.</Text>
          {calendarTutorialHintActions}
        </View>
      )}
      <BottomSheetTextInput
        ref={createTitleInputRef}
        style={styles.titleInput}
        placeholder="Add title"
        placeholderTextColor={CREATE_SHEET_MUTED_TEXT_COLOR}
        value={isEditMode ? editTitle : eventTitle}
        onChangeText={isEditMode ? setEditTitle : setEventTitle}
        onFocus={handleCreateTitleFocus}
      />
      {selectedSlot && !isEditMode && newEventStart && newEventEnd && (
        <>
          <View style={styles.inputSeparator} />
          <View style={[styles.inputContainer, { height: undefined, paddingVertical: 8 }]}>
            <TouchableOpacity
              onPress={() => openCreatePicker('date')}
              disabled={activeCreatePicker !== null || isEditPickerClosing}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="calendar" size={24} color={CREATE_SHEET_MUTED_TEXT_COLOR} style={styles.inputIcon} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => openCreatePicker('date')}
              style={styles.editValueButton}
              disabled={activeCreatePicker !== null || isEditPickerClosing}
            >
              <Text style={styles.editValueText}>{format(newEventStart, 'EEE, MMM d')}</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.inputContainer, { height: undefined, paddingVertical: 8 }]}>
            <TouchableOpacity
              onPress={() => openCreatePicker('start')}
              disabled={activeCreatePicker !== null || isEditPickerClosing}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="clock-outline" size={24} color={CREATE_SHEET_MUTED_TEXT_COLOR} style={styles.inputIcon} />
            </TouchableOpacity>
            <View style={styles.editTimeRow}>
              <TouchableOpacity
                onPress={() => openCreatePicker('start')}
                style={[styles.editValueButton, styles.editTimeButton]}
                disabled={activeCreatePicker !== null || isEditPickerClosing}
              >
                <Text style={styles.editValueText}>Start: {format(newEventStart, 'h:mm a')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => openCreatePicker('end')}
                style={[styles.editValueButton, styles.editTimeButton]}
                disabled={activeCreatePicker !== null || isEditPickerClosing}
              >
                <Text style={styles.editValueText}>End: {format(newEventEnd, isSameDay(newEventStart, newEventEnd) ? 'h:mm a' : 'EEE h:mm a')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
      {isEditMode && editStart && editEnd && (
        <>
          <View style={styles.inputSeparator} />
          <View style={[styles.inputContainer, { height: undefined, paddingVertical: 8 }]}> 
            <TouchableOpacity
              onPress={() => openEditPicker('date')}
              disabled={activeEditPicker !== null || isEditPickerClosing}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="calendar" size={24} color={CREATE_SHEET_MUTED_TEXT_COLOR} style={styles.inputIcon} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => openEditPicker('date')}
              style={styles.editValueButton}
              disabled={activeEditPicker !== null || isEditPickerClosing}
            >
              <Text style={styles.editValueText}>{format(editStart, 'EEE, MMM d')}</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.inputContainer, { height: undefined, paddingVertical: 8 }]}> 
            <TouchableOpacity
              onPress={() => openEditPicker('start')}
              disabled={activeEditPicker !== null || isEditPickerClosing}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="clock-outline" size={24} color={CREATE_SHEET_MUTED_TEXT_COLOR} style={styles.inputIcon} />
            </TouchableOpacity>
            <View style={styles.editTimeRow}>
              <TouchableOpacity
                onPress={() => openEditPicker('start')}
                style={[styles.editValueButton, styles.editTimeButton]}
                disabled={activeEditPicker !== null || isEditPickerClosing}
              >
                <Text style={styles.editValueText}>Start: {format(editStart, 'h:mm a')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => openEditPicker('end')}
                style={[styles.editValueButton, styles.editTimeButton]}
                disabled={activeEditPicker !== null || isEditPickerClosing}
              >
                <Text style={styles.editValueText}>End: {format(editEnd, isSameDay(editStart, editEnd) ? 'h:mm a' : 'EEE h:mm a')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
      <View>
        <View style={styles.inputContainer}>
          <Icon name="account-multiple" size={24} color={CREATE_SHEET_MUTED_TEXT_COLOR} style={styles.guestIcon} />
          <View style={styles.guestInputWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.guestChipsContainer}>
              {(isEditMode ? editGuests : guests).map((guest, index) => (
                <GuestChip
                  key={index}
                  email={guest}
                  onRemove={() => {
                    if (isEditMode) {
                      setEditGuests(editGuests.filter((_, i) => i !== index));
                    } else {
                      setGuests(guests.filter((_, i) => i !== index));
                    }
                  }}
                />
              ))}
            </ScrollView>
            <BottomSheetTextInput
              style={styles.guestInput}
              placeholder={(isEditMode ? editGuests : guests).length === 0 ? "Add the user's email here" : ""}
              placeholderTextColor={CREATE_SHEET_MUTED_TEXT_COLOR}
              value={newGuest}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="done"
              onChangeText={(text) => {
                setNewGuest(text);
                if (text.includes(' ') || text.includes(',')) {
                  const newGuests = text.split(/[\s,]+/).filter(email => email.includes('@'));
                  if (newGuests.length > 0) {
                    if (isEditMode) {
                      setEditGuests([...editGuests, ...newGuests]);
                    } else {
                      setGuests([...guests, ...newGuests]);
                    }
                    setNewGuest('');
                  }
                }
              }}
              onSubmitEditing={() => {
                if (newGuest) {
                  const newGuests = newGuest.split(/[\s,]+/).filter(email => email.includes('@'));
                  if (newGuests.length > 0) {
                    if (isEditMode) {
                      setEditGuests([...editGuests, ...newGuests]);
                    } else {
                      setGuests([...guests, ...newGuests]);
                    }
                    setNewGuest('');
                  }
                }
              }}
            />
          </View>
        </View>
        {shouldShowEventDetailsInput && (
          <View style={[styles.inputContainer, styles.eventDetailsInputContainer]}>
            <Icon name="text-box-outline" size={24} color={CREATE_SHEET_MUTED_TEXT_COLOR} style={styles.inputIcon} />
            <TextInput
              key={`event-details-${isEditMode ? editingEvent?.id || 'edit' : 'create'}`}
              style={styles.eventDetailsInput}
              defaultValue={isEditMode ? editDetails : eventDetailsText}
              onChangeText={isEditMode ? setEditDetails : setEventDetailsText}
              onFocus={handleEventDetailsFocus}
              onBlur={() => setIsEventDetailsInputFocused(false)}
              placeholder="Add details"
              placeholderTextColor={CREATE_SHEET_MUTED_TEXT_COLOR}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
            />
          </View>
        )}
      </View>
      </View>
    );
  };

  const renderEditPickerModal = () => {
    const activePicker = activeEditPicker || activeCreatePicker;
    const pendingPickerValue = pendingEditPickerValue || pendingCreatePickerValue;

    if (!activePicker && !isEditPickerClosing) {
      return null;
    }

    // Times: Eazee's own 24-hour wheel on both iPhone and Android, so they look the same.
    if (activePicker && activePicker !== 'date' && pendingPickerValue) {
      return (
        <TimeWheelDialog
          visible
          value={pendingPickerValue}
          onChange={(nextValue) => {
            if (activeCreatePicker) {
              updateCreatePickerValue(activePicker, nextValue);
            } else {
              updateEditPickerValue(activePicker, nextValue);
            }
          }}
          onClose={closeEditPicker}
        />
      );
    }

    if (Platform.OS === 'android') {
      if (!activePicker || !pendingPickerValue) {
        return null;
      }

      if (activePicker === 'date') {
        return (
          <DateTimePicker
            value={pendingPickerValue}
            mode="date"
            display="default"
            onChange={handleAndroidEditPickerChange}
          />
        );
      }

      return null;
    }

    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal>
        <View style={styles.editPickerOverlay}>
          <TouchableWithoutFeedback onPress={closeEditPicker}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          {activePicker && pendingPickerValue ? (
            <View style={styles.editPickerCard}>
              <DateTimePicker
                value={pendingPickerValue}
                mode="date"
                display="spinner"
                onChange={(_, nextValue) => {
                  if (!nextValue) return;
                  if (activeCreatePicker) {
                    setPendingCreatePickerValue(nextValue);
                    updateCreatePickerValue(activePicker, nextValue);
                  } else {
                    setPendingEditPickerValue(nextValue);
                    updateEditPickerValue(activePicker, nextValue);
                  }
                }}
                accentColor="#9EE8DB"
                textColor={CREATE_SHEET_TEXT_COLOR}
                style={styles.editPickerSpinner}
              />
            </View>
          ) : (
            <View style={styles.editPickerTouchBlocker} />
          )}
        </View>
      </FullWindowOverlay>
    );
  };

  const handleCurrentDatePress = useCallback(() => {
    const today = new Date();
    const todayWeekStart = normalizeCalendarWeekStart(today);
    const todayWeekKey = getCalendarWeekKey(todayWeekStart);
    const currentWeekKey = getCalendarWeekKey(weekStartRef.current);
    const hasTodayWeekCache = Object.prototype.hasOwnProperty.call(
      weekEventsByKeyRef.current,
      todayWeekKey
    );
    const todayWeekEvents = weekEventsByKeyRef.current[todayWeekKey] ?? (
      currentWeekKey === todayWeekKey ? events : []
    );
    const fallbackDate = new Date(today);
    fallbackDate.setHours(8, 0, 0, 0);
    const scrollTargetDate = getFirstTimedEventDateOnDay(today, todayWeekEvents) ?? fallbackDate;

    closeCalendarOverlays();
    setPendingScrollDate(scrollTargetDate);
    const scrollIntent = scrollIntentSequenceRef.current + 1;
    scrollIntentSequenceRef.current = scrollIntent;

    cancelWeekSwipe();
    weekStartRef.current = todayWeekStart;
    setPagerResetWeekStart(null);
    setProgrammaticWeekStarts(null);
    setPagerWeekStart(todayWeekStart);
    setWeekStart(todayWeekStart);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollIntentSequenceRef.current !== scrollIntent) {
          return;
        }

        if (scrollToEventTime(scrollTargetDate, true)) {
          setPendingScrollDate(null);
        }
      });
    });
    void fetchEventsForWeek(todayWeekStart, { silent: hasTodayWeekCache });
  }, [
    cancelWeekSwipe,
    closeCalendarOverlays,
    events,
    fetchEventsForWeek,
    getFirstTimedEventDateOnDay,
    scrollToEventTime,
    setPagerResetWeekStart,
    setPagerWeekStart,
    setProgrammaticWeekStarts,
    setWeekStart,
    weekEventsByKeyRef,
    weekStartRef,
  ]);

  const CalendarHeader: React.FC = () => {
    const currentMonth = format(weekStart, 'MMMM');
    const currentDate = format(new Date(), 'd');
    const monthControl = (
      <View style={styles.monthSection}>
        <Text style={styles.monthText}>{currentMonth}</Text>
      </View>
    );
    const searchButton = (
      <GuidedTarget targetId={getCalendarControlGuidanceTargetId('search')} label="Event search" localHighlightRadius={999}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setIsSearchOpen(true);
            completeCalendarGuidanceAction('search');
          }}
        >
          <Icon name="magnify" size={24} color="#DFFBFF" />
        </TouchableOpacity>
      </GuidedTarget>
    );
    const dateButton = (
      <TouchableOpacity
        style={[styles.dateButton, isLeftHanded ? styles.dateButtonLeftHanded : null]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          handleCurrentDatePress();
        }}
      >
        <Text style={styles.dateButtonText}>{currentDate}</Text>
      </TouchableOpacity>
    );

    return (
      <View style={styles.calendarHeader}>
        <ScreenHeader
          title="Calendar"
          titleColor="#B3E7F0"
          horizontalPadding={16}
        />

        <View style={styles.calendarControlsRow}>
          {isLeftHanded ? (
            <>
              <View style={styles.headerLeftIcons}>
                {dateButton}
                {searchButton}
              </View>
              {monthControl}
            </>
          ) : (
            <>
              {monthControl}
              <View style={styles.headerRightIcons}>
                {searchButton}
                {dateButton}
              </View>
            </>
          )}
        </View>
      </View>
    );
  };


  const isCalendarTutorialCreating = isCalendarTutorialPending && calendarTutorialStage === 'waiting-event';
  // The walkthrough banners shown while the event is being made have the same back / next /
  // skip all as the walkthrough card. Next only moves on once an event is made.
  const leaveCalendarTutorialHint = () => {
    Keyboard.dismiss();
    if (createSheetIndex !== -1) closeCreateSheet();
  };
  const calendarTutorialHintActions = (
    // Same layout as the walkthrough card: back on the left, skip all and next on the right.
    <View style={styles.tutorialHintActions}>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => {
          leaveCalendarTutorialHint();
          showCalendarTutorialCreate();
        }}
        style={styles.tutorialHintAction}
      >
        <Text style={styles.tutorialHintActionText}>back</Text>
      </Pressable>
      <View style={styles.tutorialHintActionGroup}>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => confirmSkipWholeTutorial(leaveCalendarTutorialHint)}
          style={styles.tutorialHintAction}
        >
          <Text style={styles.tutorialHintActionText}>skip all</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          disabled={!hasMadeCalendarTutorialEventRef.current}
          onPress={() => {
            leaveCalendarTutorialHint();
            void showCalendarTutorialEventCreated();
          }}
          style={[
            styles.tutorialHintAction,
            styles.tutorialHintActionPrimary,
            !hasMadeCalendarTutorialEventRef.current && styles.tutorialHintActionDisabled,
          ]}
        >
          <Text style={[styles.tutorialHintActionText, styles.tutorialHintActionPrimaryText]}>next</Text>
        </Pressable>
      </View>
    </View>
  );
  // While the AI bar is used for the walkthrough's event, say what to type (the AI's own
  // questions show in their own card, so this steps aside for them).
  // It also stays up while nothing is open (keyboard closed, form closed without saving), so
  // the user is never left on this step without knowing what to do.
  const calendarTutorialAiHint = isCalendarTutorialCreating && createSheetIndex === -1 && !aiNotice
    ? (isAiRunning
        ? 'Creating your event...'
        : isAiInputFocused
          ? 'Type an event, like "Lunch with Sam tomorrow at 1pm", then tap send to finish this step.'
          : 'Create an event to finish this step: type it in the bar below, use the Eazee button, or tap a time slot.')
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#0E4048' }}>
    <LinearGradient colors={['#219BAE', '#0E4048']} locations={[0, 1]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 1 }} style={[styles.container, { minHeight: Dimensions.get('screen').height }]}>
      {Platform.OS === 'ios' && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(3, 96, 108, 0)', 'rgba(4, 57, 64, 0.26)', 'rgba(2, 25, 29, 0.5)']}
          locations={[0, 0.58, 1]}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: calendarBackdropScrimHeight,
          }}
        />
      )}
      <Animated.View
        style={{
          position: 'absolute',
          top: -24,
          left: -12,
          right: -12,
          bottom: -24,
          zIndex: 11,
          opacity: Animated.multiply(
            eventDetailsVisibility.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
            createSheetVisibility.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
          ),
        }}
        pointerEvents="none"
      >
        <Image
          source={require('../../../assets/images/calendar-bg.png')}
          style={{
            width: '100%',
            height: '100%',
            opacity: 0.11,
          }}
          resizeMode="stretch"
        />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          top: 40,
          left: -30,
          right: 0,
          alignItems: 'center',
          zIndex: 50,
          opacity: Animated.multiply(
            eventDetailsVisibility.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.35],
            }),
            createSheetVisibility.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.5],
            }),
          ),
        }}
        pointerEvents="none"
      >
        <Image
          source={require('../../../assets/images/eazee-bg-screen.png')}
          style={{
            width: 662,
            height: 664,
          }}
          resizeMode="contain"
        />
      </Animated.View>
      {isFocused && <StatusBar style="light" />}
      <View style={{ flex: 1, paddingBottom: activeContentBottomPadding }}>
      <CalendarHeader />
      <Modal
        visible={isSearchOpen}
        transparent={false}
        animationType="fade"
        statusBarTranslucent={true}
        presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : 'overFullScreen'}
        onRequestClose={() => {
          closeSearch();
        }}
        onShow={async () => {
          if (Platform.OS === 'android') {
            try {
              await NavigationBar.setBackgroundColorAsync('#219BAE');
              await NavigationBar.setButtonStyleAsync('light');
              await NavigationBar.setBehaviorAsync('inset-swipe');
              await NavigationBar.setVisibilityAsync('visible');
            } catch {}
          }
        }}
      >
        <TouchableWithoutFeedback onPress={() => {}}>
          <LinearGradient colors={['#219BAE', '#0E4048']} locations={[0, 1]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 1 }} style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
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
                  source={require('../../../assets/images/calendar-bg.png')}
                  style={{
                    width: '100%',
                  height: '100%',
                  opacity: 0.11,
                }}
                resizeMode="stretch"
                />
              </View>
            <View
              style={{
                position: 'absolute',
                top: 40,
                left: -30,
                right: 0,
                alignItems: 'center',
                zIndex: 0,
              }}
              pointerEvents="none"
            >
              <Image
                source={require('../../../assets/images/eazee-bg-screen.png')}
                style={{
                  width: 662,
                  height: 664,
                  opacity: 1,
                }}
                resizeMode="contain"
              />
            </View>
            {isFocused && <StatusBar style="light" />}
            <View className="flex-row items-center px-4 pt-2 pb-2 border-b" style={{ borderBottomColor: 'rgba(223, 251, 255, 0.3)' }}>
              <GuidedTarget
                targetId={getCalendarBackGuidanceTargetId()}
                label="Back"
                localHighlightRadius={999}
                localHighlightInset={4}
              >
                <TouchableOpacity className="p-1 mr-2" onPress={() => {
                  closeSearch();
                }}>
                  <Icon name="arrow-left" size={24} color="#DFFBFF" />
                </TouchableOpacity>
              </GuidedTarget>
              <TextInput
                className="flex-1 h-10 text-base"
                placeholder="Search"
                placeholderTextColor="#DFFBFF"
                style={{ color: '#DFFBFF' }}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={true}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 16 }}>
              {isSearching ? (
                <View className="py-4">
                  <Text style={{ color: '#DFFBFF' }}>Searching…</Text>
                </View>
              ) : (
                <>
                  {groupedSearchResults.map((group) => {
                    const first = group.items[0];
                    const rest = group.items.slice(1);
                    return (
                      <View key={`group-${group.dateKey}`} style={{ paddingTop: 6, paddingBottom: 4 }}>
                        {first && (
                          <TouchableOpacity key={`${first.source}-${first.id}`} className="flex-row items-start py-1" activeOpacity={0.7} onPress={() => handleSearchResultPress(first)}>
                            <View style={{ width: 80 }}>
                              <Text style={{ color: '#DFFBFF', fontSize: 12 }}>{format(group.date, 'EEE')}</Text>
                              <Text style={{ color: '#DFFBFF', fontSize: 14, fontWeight: '600' }}>{format(group.date, 'MMM d')}</Text>
                            </View>
                            <View
                              style={{
                                flex: 1,
                                borderRadius: 8,
                                padding: 10,
                                backgroundColor: '#155A64',
                              }}
                            >
                              <Text style={{ color: '#DFFBFF', fontWeight: '700' }} numberOfLines={2}>{first.title || '(No title)'}</Text>
                              <Text style={{ color: '#DFFBFF', opacity: 0.9, marginTop: 2, fontSize: 12 }}>
                                {first.isAllDay ? 'All day' : format(first.startDate, 'p')}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        )}
                        {rest.map((item) => (
                          <TouchableOpacity key={`${item.source}-${item.id}`} className="flex-row items-start py-1" activeOpacity={0.7} onPress={() => handleSearchResultPress(item)}>
                            <View style={{ width: 80 }} />
                            <View
                              style={{
                                flex: 1,
                                borderRadius: 8,
                                padding: 10,
                                backgroundColor: '#155A64',
                              }}
                            >
                              <Text style={{ color: '#DFFBFF', fontWeight: '700' }} numberOfLines={2}>{item.title || '(No title)'}</Text>
                              <Text style={{ color: '#DFFBFF', opacity: 0.9, marginTop: 2, fontSize: 12 }}>
                                {item.isAllDay ? 'All day' : format(item.startDate, 'p')}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  })}
                  {!isSearching && searchQuery.trim() !== '' && searchResults.length === 0 && (
                    <View className="py-6">
                      <Text style={{ color: '#DFFBFF' }}>No events found</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </LinearGradient>
        </TouchableWithoutFeedback>
      </Modal>
      <Animated.View
        style={[
          styles.calendarGridWrapper,
          {
            opacity: isFullScreenCalendarOverlayVisible ? 0 : 1,
          },
        ]}
      >
        <CalendarWeekPager
          styles={styles}
          calendarPanelWidth={calendarPanelWidth}
          activeVisibleWeekStarts={activeVisibleWeekStarts}
          pagerResetWeekStart={pagerResetWeekStart}
          weekSwipeX={weekSwipeX}
          panHandlers={weekSwipePanHandlers}
          renderWeekPanel={renderCalendarWeekPanel}
        />
      </Animated.View>
      </View>
      <BottomSheetModal
        ref={bottomSheetRef}
        index={createSheetTargetIndex}
        snapPoints={[
          CREATE_SHEET_COMPACT_SNAP_POINT,
          CREATE_SHEET_FORM_SNAP_POINT,
          CREATE_SHEET_EXPANDED_SNAP_POINT,
        ]}
        backdropComponent={renderBottomSheetBackdrop}
        backgroundStyle={styles.createBottomSheetBackground}
        handleIndicatorStyle={styles.createBottomSheetHandle}
        containerComponent={createSheetContainerComponent}
        keyboardBehavior="extend"
        enablePanDownToClose={true}
        onChange={handleBottomSheetChange}
        onDismiss={() => {
          finishCreateSheetDismissal();
        }}
        onAnimate={(_fromIndex, toIndex) => {
          if (toIndex === CREATE_SHEET_FORM_INDEX) {
            shouldFocusCreateTitleOnSheetExpandRef.current = false;
            Keyboard.dismiss();
          }
          if (toIndex === -1) {
            setIsBottomSheetExpanded(false);
          }
        }}
      >
        {renderBottomSheetContent()}
      </BottomSheetModal>
      {renderEditPickerModal()}
      {snackbar.visible && (
        <View
          style={[
            styles.snackbarContainer,
            snackbar.position === 'top'
              ? { top: (insets?.top || 0) + 76 }
              : { bottom: snackbarBottomOffset },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.snackbar}>
            <Text style={styles.snackbarText} numberOfLines={2}>{snackbar.message}</Text>
            {snackbar.undo && (
              <TouchableOpacity onPress={() => { const fn = snackbar.undo; hideSnackbar(); fn && fn(); }}>
                <Text style={styles.snackbarAction}>Undo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {!!calendarTutorialAiHint && (
        <View pointerEvents="box-none" style={[styles.tutorialHintFloating, { top: (insets?.top || 0) + 76 }]}>
          <View style={styles.tutorialHint}>
            <Text style={styles.tutorialHintLabel}>Walkthrough</Text>
            <Text style={styles.tutorialHintText}>{calendarTutorialAiHint}</Text>
            {calendarTutorialHintActions}
          </View>
        </View>
      )}
      <CompactAiBanner
        notice={isGoogleDisconnectedNoticeVisible ? GOOGLE_DISCONNECTED_NOTICE : null}
        surface="calendar"
        top={(insets?.top || 0) + 76}
        size="small"
        translucent
        onActionPress={handleGoogleDisconnectedNoticePress}
        onDismissPress={hideGoogleDisconnectedNotice}
      />
      <BottomSheet
        ref={eventDetailsBottomSheetRef}
        index={-1}
        snapPoints={[CREATE_SHEET_EXPANDED_SNAP_POINT]}
        backdropComponent={renderEventDetailsBackdrop}
        backgroundStyle={styles.eventDetailsBottomSheetBackground}
        handleIndicatorStyle={styles.eventDetailsBottomSheetHandle}
        enablePanDownToClose={true}
        animateOnMount={false}
        onChange={(index) => {
          'worklet';
          const isOpen = index !== -1;
          if (index === -1) {
            runOnJS(setSelectedEvent)(null);
            runOnJS(setEventDetails)(null);
          }
          runOnJS(setIsEventDetailsOpen)(isOpen);
          if (!isOpen) {
            runOnJS(() => {
              isOpeningFromParamsRef.current = false;
            })();
          }
        }}
        onAnimate={(_fromIndex, toIndex) => {
          if (toIndex !== -1) {
            setIsEventDetailsOpen(true);
          }
        }}
      >
        {renderEventDetailsBottomSheetContent()}
      </BottomSheet>
    </LinearGradient>
    {shouldRenderAiComposer && isAiComposerActive && (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3, 11, 14, 0.46)' }} />
        </View>
      </TouchableWithoutFeedback>
    )}
    {shouldRenderAiComposer && (
      <CompactAiBanner
        notice={aiNotice}
        surface="calendar"
        bottom={aiInputKeyboardBottom + 76}
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
    {shouldRenderAiComposer && (
      <LowerSwipeGesture
        currentTab="calendar"
        disabled={isCalendarSwipeDisabled}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: aiInputKeyboardBottom,
          zIndex: 70,
          elevation: 70,
        }}
      >
        <Animated.View
          style={[
            { opacity: fadeAnim },
            {
              transform: [
                {
                  translateY: keyboardOffset.interpolate({
                    inputRange: [0, 1000],
                    outputRange: [0, -1000],
                    extrapolate: 'clamp',
                  }),
                },
                {
                  translateY: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0],
                  })
                },
              ]
            }
          ]}
        >
          <AIInputBox
            textInput={inputValue}
            isListening={isListening}
            microphoneColor={microphoneColor}
            glowAnim={glowAnim}
            placeholder={
              aiNotice?.kind === 'clarify' || aiNotice?.kind === 'confirm'
                ? 'Reply here'
                : isCalendarTutorialPending
                  ? 'Create an event'
                  : ''
            }
            isProcessing={isAiRunning}
            onStopPress={stopAiRequest}
            editable={!isAiRunning}
            showSendButton
            multiline
            minInputHeight={40}
            maxInputHeight={120}
            inputRef={inputRef}
            onChangeText={setInputValue}
            onSubmitEditing={submit}
            onSendPress={handleCalendarAiSendPress}
            returnKeyType="default"
            blurOnSubmit={false}
            onFocus={() => {
              hideCalendarTutorialCreateCard();
              setIsAiInputFocused(true);
            }}
            onBlur={() => setIsAiInputFocused(false)}
            onTextInputPress={hideCalendarTutorialCreateCard}
            onMicrophonePress={handleCalendarAiMicrophonePress}
            microphoneSide={isLeftHanded ? 'left' : 'right'}
            surfaceVariant="chat"
            containerStyle={{ backgroundColor: 'transparent' }}
          />
        </Animated.View>
      </LowerSwipeGesture>
    )}
    </View>
  );
};

const styles = StyleSheet.create({
  tutorialHint: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(4, 32, 34, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(174, 255, 232, 0.35)',
  },
  tutorialHintLabel: {
    color: '#9EF5E4',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
  },
  tutorialHintText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  tutorialHintActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  tutorialHintActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tutorialHintAction: {
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(174, 255, 232, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tutorialHintActionPrimary: {
    minWidth: 76,
    backgroundColor: '#AEFFE8',
    borderColor: '#AEFFE8',
  },
  tutorialHintActionText: {
    color: '#AEFFE8',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
  },
  tutorialHintActionPrimaryText: {
    color: '#04403A',
  },
  tutorialHintActionDisabled: {
    opacity: 0.35,
  },
  tutorialHintFloating: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 200,
    elevation: 200,
  },
  container: {
    flex: 1,
    backgroundColor: '#0E4048',
  },
  weekHeader: {
    flexDirection: 'row',
  },
  calendarGridWrapper: {
    flex: 1,
    paddingHorizontal: CALENDAR_GRID_INSET,
    paddingTop: 8,
    paddingBottom: 8,
  },
  weekPagerViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  weekPagerTrack: {
    flex: 1,
    flexDirection: 'row',
  },
  weekPanel: {
    flex: 1,
  },
  allDayDividerOnly: {
    borderBottomWidth: 1,
    borderBottomColor: CALENDAR_GRID_LINE_COLOR,
  },
  allDayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 3,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: CALENDAR_GRID_LINE_COLOR,
  },
  allDayLabelColumn: {
    width: TIME_LABEL_WIDTH,
    paddingTop: 4,
    paddingRight: 8,
    alignItems: 'flex-end',
  },
  allDayLabel: {
    color: '#DFFBFF',
    fontSize: 9,
    opacity: 0.8,
  },
  allDayDayColumn: {
    flex: 1,
    minHeight: 24,
    paddingHorizontal: 1,
  },
  allDayChip: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    marginBottom: 2,
  },
  allDayChipText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
  },
  weekNumberContainer: {
    width: TIME_LABEL_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekNumberText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#DFFBFF',
  },
  timeLabel: {
    width: TIME_LABEL_WIDTH,
    height: '100%',
    justifyContent: 'flex-start',
    paddingRight: 8,
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 10,
  },
  dayText: {
    fontWeight: 'bold',
    fontSize: 9,
    color: '#DFFBFF',
    textAlign: 'center',
  },
  dateCircle: {
    width: 24,
    height: 24,
    borderRadius: 999,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
  },
  todayCircle: {
    backgroundColor: '#DFFBFF',
  },
  dateText: {
    fontSize: 12,
    color: '#DFFBFF',
  },
  todayText: {
    color: '#0E4048',
    fontWeight: 'bold',
  },
  timelineContainer: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: CALENDAR_GRID_LINE_COLOR,
  },
  timeSlotRow: {
    flexDirection: 'row',
  },
  timeText: {
    width: '100%',
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
    color: TIME_LABEL_COLOR,
  },
  quarterOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingRight: 8,
    zIndex: 5,
  },
  quarterItem: {
    position: 'absolute',
    width: '100%',
    marginTop: 2,
  },
  quarterText: {
    textAlign: 'right',
    fontSize: 10,
    lineHeight: 12,
    fontVariant: ['tabular-nums'],
    color: '#888',
    opacity: 0,
  },
  quarterTextActive: {
    color: EAZEE_EVENT_COLOR,
    opacity: 1,
  },
  timeSlotCell: {
    flex: 1,
    position: 'relative',
  },
  gridLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  gridRowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: CALENDAR_GRID_LINE_COLOR,
    zIndex: 0,
  },
  gridColLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: CALENDAR_GRID_LINE_COLOR,
    zIndex: 0,
  },
  // bottom sheet
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 0,
  },
  compactCreateSheetContent: {
    flex: 0,
    height: 58,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 0,
    paddingBottom: 0,
  },
  compactCreateSheetTitle: {
    color: CREATE_SHEET_TEXT_COLOR,
    fontSize: 17,
    textAlign: 'center',
    width: '100%',
    transform: [{ translateY: -4 }],
  },
  createBottomSheetBackground: {
    backgroundColor: CREATE_SHEET_BACKGROUND,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  createBottomSheetHandle: {
    backgroundColor: 'rgba(245, 247, 248, 0.32)',
  },
  // event bottom sheet
  eventDetailsBottomSheetBackground: {
    backgroundColor: 'rgba(41, 41, 41, 0.7)',
    borderTopLeftRadius: 52,
    borderTopRightRadius: 52,
  },
  eventDetailsBottomSheetHandle: {
    backgroundColor: 'rgba(245, 247, 248, 0.32)',
  },
  eventBottomSheetContent: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingVertical: 0,
    overflow: 'hidden',
  },
  eventDetailsScrollContent: {
    paddingBottom: 22,
  },
  inputSeparator: {
    height: 1,
    backgroundColor: CREATE_SHEET_SEPARATOR_COLOR,
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    height: 48,
  },
  editValueButton: {
    flex: 1,
    paddingVertical: 6,
  },
  editValueText: {
    fontSize: 16,
    color: CREATE_SHEET_TEXT_COLOR,
  },
  editTimeRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  editTimeButton: {
    flex: 1,
  },
  editPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 25, 29, 0.52)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  editPickerCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(41, 41, 41, 0.96)',
    paddingTop: 8,
    paddingHorizontal: 18,
    paddingBottom: 12,
    alignItems: 'center',
  },
  editPickerTouchBlocker: {
    width: 1,
    height: 1,
  },
  editPickerSpinner: {
    height: 180,
    alignSelf: 'stretch',
  },
  inputIcon: {
    marginRight: 14,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginBottom: 16,
  },
  eventDetailsHeader: {
    paddingHorizontal: 6,
  },
  eventDetailsHeaderLeft: {
    justifyContent: 'flex-start',
  },
  eventDetailsHeaderRight: {
    justifyContent: 'flex-end',
  },
  eventDetailsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventDetailsCloseButton: {
    shadowColor: '#DFFBFF',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  eventDetailsCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  closeButtonContainer: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    fontSize: 20,
    color: CREATE_SHEET_MUTED_TEXT_COLOR,
  },
  saveButton: {
    backgroundColor: '#3D878F',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 20,
    minWidth: 70,
  },
  saveButtonPressed: {
    backgroundColor: '#2F6E75',
    transform: [{ scale: 0.96 }],
  },
  saveButtonSaving: {
    backgroundColor: '#2F6E75',
    opacity: 0.82,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  titleInput: {
    fontSize: 24,
    marginLeft: 6,
    marginBottom: 4,
    paddingBottom: 8,
    color: CREATE_SHEET_TEXT_COLOR,
  },
  eventDetailsInput: {
    flex: 1,
    minHeight: 24,
    maxHeight: 120,
    color: CREATE_SHEET_TEXT_COLOR,
    fontSize: 16,
    lineHeight: 22,
    padding: 0,
  },
  eventDetailsInputContainer: {
    height: undefined,
    alignItems: 'flex-start',
  },
  // event in time slot
  eventItem: {
    backgroundColor: EAZEE_EVENT_COLOR,
    borderRadius: 4,
    padding: 2,
    margin: 1,
    overflow: 'hidden',
    zIndex: 1,
    position: 'absolute',
    left: 1,
    right: 1,
  },
  dragPreviewItem: {
    zIndex: 12,
    elevation: 12,
    shadowColor: '#031114',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  eventTitle: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  selectedTimeSlot: {
    borderWidth: 1,
    borderColor: EAZEE_EVENT_COLOR,
  },
  // google sign in
  signInButton: {
    backgroundColor: '#4285F4',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  signInButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  // event details
  eventDetailTitle: {
    fontSize: 24,
    fontWeight: 'semibold',
    marginTop: 0,
    marginBottom: 0,
    color: CREATE_SHEET_TEXT_COLOR,
  },
  eventDetailDateTime: {
    fontSize: 14,
    color: '#ADEEF8',
    marginLeft: 30,
    marginBottom: 10,
  },
  eventDetailsDivider: {
    height: 1,
    width: '100%',
    backgroundColor: EVENT_DETAILS_DIVIDER_COLOR,
    marginBottom: 12,
  },
  eventDetailDescription: {
    fontSize: 14,
    marginBottom: 10,
  },
  eventDetailsTextRow: {
    marginTop: 14,
  },
  eventDetailsNoteText: {
    color: EVENT_DETAILS_MEET_COLOR,
    fontSize: 12,
    lineHeight: 17,
  },
  meetLinkButton: {
    backgroundColor: '#4285F4',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  meetLinkButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  eventColorIndicator: {
    width: 14,
    height: 14,
    borderRadius: 2,
    marginRight: 14,
    marginLeft: 2,
  },
  meetLink: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  guestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  guestCount: {
    marginLeft: 5,
    fontSize: 14,
    color: '#666',
  },
  guestName: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  // expanded bottom sheet
  guestInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 20,
    marginTop: 15,
    marginBottom: 15,
  },
  guestIcon: {
    marginRight: 14,
  },
  guestInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  guestChipsContainer: {
    flexGrow: 0,
  },
  guestInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
    color: CREATE_SHEET_TEXT_COLOR,
  },
  guestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 247, 248, 0.12)',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 4,
  },
  guestChipText: {
    fontSize: 14,
    marginRight: 4,
    color: CREATE_SHEET_TEXT_COLOR,
  },
  // google event
  googleEventItem: {
    backgroundColor: '#4285F4',
  },
  // event reusable components
  eventContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 5,
    marginTop: 10,
  },
  iconContainer: {
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  joinText: {
    color: '#4285F4',
    fontWeight: 'bold',
  },
  meetJoinText: {
    color: EVENT_DETAILS_MEET_COLOR,
    fontWeight: 'bold',
  },
  meetUrlText: {
    fontSize: 12,
    marginTop: 2,
    color: EVENT_DETAILS_MEET_COLOR,
  },
  guestText: {
    fontWeight: 'bold',
    color: CREATE_SHEET_TEXT_COLOR,
  },
  linkText: {
    fontSize: 12,
    marginTop: 2,
    color: CREATE_SHEET_MUTED_TEXT_COLOR,
  },
  // delete button
  deleteButton: {
    backgroundColor: '#FF3B30',
    padding: 10,
    borderRadius: 20,
    width: 84,
  },
  actionButton: {
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailActionButton: {
    height: 36,
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  detailEditButton: {
    backgroundColor: EAZEE_EVENT_COLOR,
  },
  detailDeleteButton: {
    backgroundColor: '#FF3B30',
  },
  detailActionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 16,
  },
  primaryWideButton: {
    minWidth: 92,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // event details - create note
  createNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: EAZEE_EVENT_COLOR,
    padding: 10,
    borderRadius: 5,
    marginTop: 15,
    justifyContent: 'center',
  },
  createNoteButtonText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 10,
  },
  // location
  locationInputContainer: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    borderBottomWidth: 0,
  },
  locationIcon: {
    marginRight: 5,
  },
  autocompleteContainer: {
    flex: 1,
  },
  locationInput: {
    fontSize: 16,
    backgroundColor: 'transparent',
    paddingLeft: 6,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    height: '100%',
  },
  locationSuggestionsList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  locationText: {
    fontSize: 14,
    color: CREATE_SHEET_TEXT_COLOR,
  },
  eventDetailsLoadingText: {
    color: CREATE_SHEET_TEXT_COLOR,
  },
  // note preview
  notePreviewContainer: {
    marginTop: 8,
    height: 100,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  notePreview: {
    fontSize: 12,
    color: '#333',
    padding: 8,
  },
  // header
  calendarHeader: {
    paddingBottom: 8,
  },
  calendarControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  monthSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#DFFBFF',
  },
  headerRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeftIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
  },
  dateButton: {
    backgroundColor: '#62AEBA',
    borderRadius: 17,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  dateButtonLeftHanded: {
    marginLeft: 0,
    marginRight: 4,
  },
  dateButtonText: {
    color: '#B7F5FF',
    fontWeight: 'bold',
  },
  snackbarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    paddingHorizontal: 12,
    zIndex: 999,
    elevation: 8,
  },
  snackbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  snackbarText: {
    color: 'white',
    fontSize: 13,
    flex: 1,
    marginRight: 12,
  },
  snackbarAction: {
    color: '#9EE8DB',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

export default CalendarScreen;
