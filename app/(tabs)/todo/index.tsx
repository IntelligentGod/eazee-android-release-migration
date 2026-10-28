import React, { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  RefreshControl, Animated, Keyboard, Linking, Alert,
  ActivityIndicator, Easing, Modal, TouchableWithoutFeedback, Pressable,
  Image, Platform, Dimensions, LayoutChangeEvent, BackHandler, findNodeHandle
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import TimeWheelDialog from '@/components/TimeWheelDialog';
import {
  differenceInCalendarDays,
  endOfDay,
  format,
  isPast,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
} from 'date-fns';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import {
  NestableDraggableFlatList,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import WorkspaceScrollArea from '@/components/WorkspaceScrollArea';
import ScrollViewWithBar from '@/components/ScrollViewWithBar';
import { isProRequiredMessage } from '@/lib/subscriptionAccess';
import { syncEventReminders } from '@/lib/eventNotifications';
import { useRouter, useGlobalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import PagerView from 'react-native-pager-view';
import { withDatabase } from '@nozbe/watermelondb/DatabaseProvider';
import { withObservables } from '@nozbe/watermelondb/react';
import ActionSheet, { ActionSheetRef } from "react-native-actions-sheet";
import { database } from '../../../database/database';
import EventModel from '../../../database/models/EventModel';
import TodoModel from '../../../database/models/TodoModel';
import TodoRecurrenceSeriesModel from '../../../database/models/TodoRecurrenceSeriesModel';
import GoalGuidancePlanModel from '../../../database/models/GoalGuidancePlanModel';
import RecipeGuideModel from '../../../database/models/RecipeGuideModel';
import TaskGuideModel from '../../../database/models/TaskGuideModel';
import SkillGuideModel from '../../../database/models/SkillGuideModel';
import PulsatingRGB from './PulsatingRGB';
import { getTodoWorkspaceAppearance } from './workspaceThemes';
import debounce from 'lodash/debounce';
import { StyleSheet } from 'react-native';
import { Q } from '@nozbe/watermelondb';
// import ColorPicker, { Swatches, Preview } from 'reanimated-color-picker';
import UserPreferenceModel from '../../../database/models/UserPreferenceModel';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AIInputBox from '@/components/AIInputBox';
import CompactAiBanner from '@/components/CompactAiBanner';
import GoalWishlistSuggestionToast from '@/components/GoalWishlistSuggestionToast';
import LiquidGlassIconButton from '@/components/LiquidGlassIconButton';
import ScreenHeader from '@/components/ScreenHeader';
import { useAuthSession } from '@/app/context/AuthSessionContext';
import { buildAmazonSearchUrl } from '@/lib/amazonSearch';
import { readProfileCountryCode } from '@/lib/profileCountry';
import { TodoSearchBar, TodoSearchHeaderButton } from './TodoSearchBar';
import {
  getTodoDetailsMatchSnippet,
  renderTodoHighlightedText,
  todoDetailsAddSearchContext,
  todoMatchesSearch,
  todoSearchTextStyles,
  todoValueIncludesAnySearchTerm,
} from './todoSearch';

import { getFloatingTabBarInset } from '@/components/navigation/floatingTabBar';
import LowerSwipeGesture from '@/components/navigation/LowerSwipeGesture';
import {
  clearPendingTodoSwipeWorkspaceKey,
  peekPendingTodoSwipeWorkspaceKey,
  setSharedTodoWorkspaceState,
  subscribeTodoWorkspaceSwipe,
} from '@/components/navigation/lowerSwipeNavigation';
import { getTodoHasDueTime, parseTodoInput, removeTodoInputTime } from '@/utils/todoDates';
import { useCompactTabAI, type CompactAiNoticeTarget } from '@/lib/useCompactTabAI';
import { useCompactGuidanceBridge } from '@/lib/useCompactGuidanceBridge';
import { useCompactVoiceInput } from '@/lib/useCompactVoiceInput';
import { isAiAuthRequiredError } from '@/lib/aiAuth';
import TodoWorkspaceTabs from '@/components/todo/TodoWorkspaceTabs';
import { GuidedTarget, showGuidanceTab, useGuidance } from '@/components/guidance/GuidanceProvider';
import {
  getShortcutForGuidanceTarget,
  getTodoBackGuidanceTargetId,
  getTodoItemGuidanceTargetId,
  getTodoControlGuidanceTargetId,
  type GuidanceTarget,
} from '@/lib/navigationHelp';
import { setGuidanceActiveTab } from '@/lib/guidanceActiveTab';
import { useLeftHandedMode } from '@/lib/useLeftHandedMode';
import {
  TODO_WORKSPACE_ORDER,
  isSupportedTodoWorkspaceKey,
  normalizeTodoWorkspaceKey,
} from '@/lib/todoWorkspaces';
import { useGoalGuidanceAI } from '@/lib/useGoalGuidanceAI';
import { useRecipeGuidanceAI } from '@/lib/useRecipeGuidanceAI';
import { useTaskGuidanceAI } from '@/lib/useTaskGuidanceAI';
import { useSkillGuidanceAI } from '@/lib/useSkillGuidanceAI';
import { openNewChatAfterTutorial } from '@/lib/tutorialEnd';
import {
  acceptGoalGuidancePlan,
  advanceGoalGuidanceForCompletedTodo,
  collectGoalGuidanceManagedTodoIds,
  deleteGoalGuidanceForGoal,
  dismissGoalQuotaInitialPrompt,
  fetchGoalGuidancePlanForActionTodo,
  fetchGoalGuidancePlanForGoal,
  linkActiveGoalGuidanceTodo,
  markGoalGuidanceActionDeleted,
  recreateActiveGoalGuidanceTodo,
  refreshGoalGuidancePlansForToday,
  rewindGoalGuidanceStepProgress,
  saveGoalGuidanceStepProgress,
  scheduleGoalQuotaAction,
  toGoalGuidancePlan,
  type GoalGuidancePlan,
  type GoalGuidanceResponse,
  type GoalGuidanceStep,
  type GoalGuidanceTimeframe,
} from '@/lib/goalGuidance';
import {
  createDefaultRecipeAnswers,
  deleteRecipeGuidesForTodos,
  fetchRecipeGuideForTodo,
  requestRecipeGuide,
  requestRecipeVideos,
  saveRecipeGuide,
  shouldShowRecipeGuideShortcut,
  type RecipeAnswers,
  type RecipeContext,
  type RecipeGuide,
  type RecipeIngredient,
  type RecipeStep,
  type RecipeVideo,
} from '@/lib/recipeGuidance';
import {
  deleteSkillGuidesForTodos,
  fetchSkillGuideForTodo,
  requestSkillGuide,
  requestSkillVideos,
  saveSkillGuide,
  type SkillContext,
  type SkillGuide,
  type SkillStep,
  type SkillVideo,
} from '@/lib/skillGuidance';
import {
  deleteTaskGuidesForTodos,
  fetchTaskGuideForTodo,
  saveTaskGuide,
  shouldShowTaskGuideShortcut,
  type TaskGuidanceContext,
  type TaskGuidanceStep,
  type TaskGuide,
} from '@/lib/taskGuidance';
import {
  createTodo,
  deleteTodo,
  deleteRecurringTodoCompletedHistory,
  deleteRecurringTodoOccurrence,
  deleteRecurringTodoSeries,
  normalizeTodoOrdering,
  reorderTodosInSection,
  restoreTodo,
  setTodoRecurrence,
  syncRecurringTodos,
  updateTodo,
  updateRecurringTodo,
  type TodoSnapshot,
  type RecurringTodoEditScope,
} from '@/lib/todoMutations';
import {
  getNormalizedTodoSortOrder,
  getTodoOrderingSection,
  isTodoSectionReorderable,
  sortTodosForSectionOrder,
  type TodoOrderingSectionKey,
} from '@/lib/todoOrdering';
import {
  normalizeGuidancePath,
  normalizeTodoTaskKind,
  requestTodoClassification,
  shouldClassifyTodoWorkspace,
  type GuidancePath,
  type TodoTaskKind,
} from '@/lib/todoClassification';
import {
  createPendingGoalBehavior,
  createStandardGoalBehavior,
  getGoalQuotaActionTitle,
  getGoalQuotaNextCount,
  isGoalQuotaComplete,
  isQuotaGoalBehavior,
  parseGoalBehavior,
  serializeGoalBehavior,
  type GoalBehavior,
  type GoalQuotaBehavior,
} from '@/lib/goalBehavior';
import {
  TODO_TUTORIAL_VIDEO_READY_MESSAGE,
  TUTORIAL_DEMO_GOAL_DETAILS,
  TUTORIAL_DEMO_GOAL_TITLE,
  TUTORIAL_CALENDAR_EVENT_STEP,
  TUTORIAL_GOAL_GUIDANCE_REPLY,
  TUTORIAL_GOAL_GUIDANCE_STEP,
  TUTORIAL_HOME_OVERVIEW_STEP,
  TUTORIAL_TODO_GUIDANCE_STEP,
  TUTORIAL_WISHLIST_SHOPPING_STEP,
  uncompleteTutorialStep,
  completeTutorialStep,
  getTutorialReadingTimeMs,
  getTutorialProgress,
  isTutorialDemoTodoReusable,
  isTutorialSessionActive,
  setTutorialGoalDemoTodoId,
  subscribeTutorialProgress,
} from '@/lib/tutorial';
import {
  getTodoReminderLabel,
  normalizeTodoReminderState,
  TODO_REMINDER_PRESETS,
  type TodoReminderMode,
} from '@/utils/todoReminders';
import {
  getTodoOccurrenceDateKey,
  getTodoRecurrenceLabel,
  getTodoRecurrencePreset,
  normalizeTodoRecurrenceRule,
  startOfLocalDay,
  type TodoRecurrenceRule,
  type TodoRecurrenceUnit,
} from '@/lib/todoRecurrence';
import {
  GOAL_TIMEFRAME_OPTIONS,
  getGoalDefaultDueDate,
  getGoalGuidanceTimeframeFromTodoTimeframe,
  getGoalSectionFromTimeframe,
  getGoalTimeframeLabel,
  inferGoalTimeframeFromDueDate,
  isGoalTodoTimeframe,
  type GoalTodoTimeframe,
} from '@/utils/goalTimeframes';
import {
  normalizeWishlistItemName,
  requestWishlistPurchaseIntent,
  type WishlistPurchaseIntentSurface,
} from '@/lib/wishlistPurchaseIntent';
import {
  normalizeGoalWishlistSuggestionItemName,
  requestGoalWishlistSuggestions,
  type GoalWishlistSuggestion,
} from '@/lib/goalWishlistSuggestions';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt?: Date;
  details?: string;
  dueDate?: Date;
  hasDueTime?: boolean;
  starred?: boolean;
  workspace?: string;
  sortScope?: string | null;
  sortOrder?: number | null;
  amazonUrl?: string;
  isAmazonUrlLoaded?: boolean;
  amazonUrlLoadAttempts?: number;
  emailId?: string;
  type: 'basic' | 'progress' | 'slider';
  startedAt?: Date;
  progress?: number;
  reminderEnabled: boolean;
  reminderMode: TodoReminderMode;
  reminderMinutesBefore?: number | null;
  notificationId?: string | null;
  goalTimeframe?: GoalTodoTimeframe | null;
  taskKind?: TodoTaskKind | null;
  guidancePath?: GuidancePath | null;
  goalBehaviorJson?: string | null;
  recurrenceSeriesId?: string | null;
  recurrenceOccurrenceDate?: Date | null;
  recurrenceOverride?: boolean | null;
  recurrence?: TodoRecurrenceRule | null;
  recurrenceActive?: boolean;
  recurrenceCompletedCount?: number;
}

type TodoSectionKey = TodoOrderingSectionKey;

type GoalSectionKey = Exclude<GoalTodoTimeframe, 'nextWeek'>;
type RecipeProgress = { completed: number; total: number; ratio: number };
type SkillProgress = { completed: number; total: number; ratio: number };
type TaskProgress = { completed: number; total: number; ratio: number; status: TaskGuide['status'] };
type TodoTutorialRestoreStep =
  | 'demo-task'
  | 'choice'
  | 'pick-video'
  | 'accept-plan'
  | 'video-ready'
  | 'goal-handoff-back'
  | 'goal-workspace'
  | 'goal-timeframes'
  | 'goal-target'
  | 'goal-actions'
  | 'goal-ai-bar'
  | 'goal-summary';
type TodoGuidanceTutorialStage = 'actions' | 'video' | 'choice' | 'accept-plan' | 'pick-video' | 'video-ready';
type GoalGuidanceTutorialStage = 'handoff-back' | 'workspace' | 'timeframes' | 'goal' | 'actions' | 'question' | 'ai-bar' | 'accept-plan' | 'summary' | 'complete';

type GoalWishlistSuggestionToastState = {
  goalId: string;
  goalTitle: string;
  suggestions: GoalWishlistSuggestion[];
  selectedItemNames: Set<string>;
  isAdded: boolean;
  openDetailsOnResolve?: boolean;
};

type PendingTodoReveal = {
  todoId: string;
  workspaceKey: string;
  sectionKey: TodoSectionKey;
  attempts: number;
  showRevealGlow?: boolean;
};

const getGoalGuidancePlanActiveActions = (plan: GoalGuidancePlan): GoalGuidancePlan['activeActions'] =>
  plan.activeActions.length
    ? plan.activeActions
    : plan.activeTodoId
      ? [{
          stepIndex: plan.activeStepIndex,
          todoId: plan.activeTodoId,
          dueDate: '',
        }]
      : [];

const getOptimisticGoalGuidancePlanAfterCompletingTodo = (
  plan: GoalGuidancePlan,
  todoId: string
): GoalGuidancePlan | null => {
  const activeActions = getGoalGuidancePlanActiveActions(plan);
  const completedAction = activeActions.find((action) => action.todoId === todoId);

  if (!completedAction) {
    return null;
  }

  const completedStepIndexes = plan.completedStepIndexes.includes(completedAction.stepIndex)
    ? plan.completedStepIndexes
    : [...plan.completedStepIndexes, completedAction.stepIndex].sort((a, b) => a - b);
  const remainingActions = activeActions.filter((action) => action.todoId !== todoId);

  if (remainingActions.length > 0) {
    const firstRemainingAction = remainingActions[0];
    return {
      ...plan,
      activeActions: remainingActions,
      activeTodoId: firstRemainingAction?.todoId,
      activeStepIndex: firstRemainingAction?.stepIndex ?? plan.activeStepIndex,
      completedStepIndexes,
      pausedUntilDate: undefined,
      status: 'accepted',
    };
  }

  const nextActiveStepIndex = plan.steps.findIndex((_, index) => !completedStepIndexes.includes(index));
  const isComplete = nextActiveStepIndex < 0;

  return {
    ...plan,
    activeActions: [],
    activeTodoId: undefined,
    activeStepIndex: isComplete
      ? Math.max(0, plan.steps.length - 1)
      : nextActiveStepIndex,
    completedStepIndexes,
    pausedUntilDate: isComplete ? undefined : new Date().toISOString(),
    status: isComplete ? 'complete' : 'accepted',
  };
};

const getHistoricalGoalGuidanceTodoIdForStep = (plan: GoalGuidancePlan, stepIndex: number) => {
  const activeTodoIds = new Set(getGoalGuidancePlanActiveActions(plan).map((action) => action.todoId));

  return [...plan.actionTodoIds]
    .reverse()
    .find((todoId) =>
      plan.actionTodoStepIndexes[todoId] === stepIndex &&
      !activeTodoIds.has(todoId)
    );
};

const GUIDANCE_BUTTON_RING_STROKE_WIDTH = 2.2;

type GoalGuidanceStepCheckButtonProps = {
  checked: boolean;
  onPress: React.ComponentProps<typeof TouchableOpacity>['onPress'];
};

type GuidancePrimaryButtonProps = {
  children: React.ReactNode;
  attention?: boolean;
  disabled?: boolean;
  onPress: React.ComponentProps<typeof Pressable>['onPress'];
};

const GuidancePrimaryButton = ({ children, attention = false, disabled = false, onPress }: GuidancePrimaryButtonProps) => {
  const ringCycle = useRef(new Animated.Value(0)).current;
  const [buttonSize, setButtonSize] = useState({ width: 0, height: 0 });
  const shouldShowRing = attention && !disabled && buttonSize.width > 0 && buttonSize.height > 0;
  const ringPathWidth = Math.max(0, buttonSize.width - GUIDANCE_BUTTON_RING_STROKE_WIDTH);
  const ringPathHeight = Math.max(0, buttonSize.height - GUIDANCE_BUTTON_RING_STROKE_WIDTH);
  const ringCornerRadius = ringPathHeight / 2;
  const ringPerimeter = ringPathWidth > 0 && ringPathHeight > 0
    ? Math.max(1, 2 * Math.max(0, ringPathWidth - ringPathHeight) + Math.PI * ringPathHeight)
    : 1;
  const ringStrokeOffset = ringCycle.interpolate({
    inputRange: [0, 0.82, 1],
    outputRange: [ringPerimeter, 0, 0],
    extrapolate: 'clamp',
  });
  const ringOpacity = ringCycle.interpolate({
    inputRange: [0, 0.08, 0.82, 1],
    outputRange: [0, 0.98, 0.98, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    if (!shouldShowRing) {
      ringCycle.setValue(0);
      return;
    }

    ringCycle.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(120),
      Animated.timing(ringCycle, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [ringCycle, shouldShowRing]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setButtonSize((currentSize) => {
      if (Math.abs(currentSize.width - width) < 0.5 && Math.abs(currentSize.height - height) < 0.5) {
        return currentSize;
      }

      return { width, height };
    });
  }, []);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.goalGuidanceGetStepsButton,
        attention && !disabled && styles.goalGuidanceAttentionButton,
        pressed && !disabled && styles.goalGuidancePressedButton,
        disabled && styles.actionButtonDisabled,
      ]}
      onLayout={handleLayout}
      onPress={onPress}
      disabled={disabled}
    >
      <LinearGradient
        colors={['#0A9881', '#04473C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.goalGuidanceGetStepsButtonGradient}
      >
        <Text style={styles.goalGuidanceGetStepsButtonText}>{children}</Text>
      </LinearGradient>
      {shouldShowRing && (
        <Svg
          pointerEvents="none"
          width={buttonSize.width}
          height={buttonSize.height}
          style={styles.goalGuidanceAttentionRing}
        >
          <AnimatedRect
            x={GUIDANCE_BUTTON_RING_STROKE_WIDTH / 2}
            y={GUIDANCE_BUTTON_RING_STROKE_WIDTH / 2}
            width={ringPathWidth}
            height={ringPathHeight}
            rx={ringCornerRadius}
            ry={ringCornerRadius}
            fill="transparent"
            stroke="rgba(174, 255, 232, 0.98)"
            strokeWidth={GUIDANCE_BUTTON_RING_STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${ringPerimeter} ${ringPerimeter}`}
            strokeDashoffset={ringStrokeOffset}
            opacity={ringOpacity}
          />
        </Svg>
      )}
    </Pressable>
  );
};

const GoalGuidanceStepCheckButton = ({ checked, onPress }: GoalGuidanceStepCheckButtonProps) => {
  return (
    <TouchableOpacity
      style={styles.recipeStepCompleteButton}
      onPress={onPress}
      activeOpacity={0.82}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        style={[
          styles.goalGuidanceStepCheckShell,
          checked
            ? styles.goalGuidanceStepCheckShellChecked
            : styles.goalGuidanceStepCheckShellUnchecked,
        ]}
      >
        {checked && (
          <MaterialCommunityIcons
            name="check"
            size={16}
            color="#0E4D45"
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

const extractGuidanceLinks = (value: string) => {
  const links: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  const addLink = (label: string, url: string) => {
    const cleanUrl = url.trim().replace(/[),.]+$/g, '');
    if (!cleanUrl || seen.has(cleanUrl)) return;
    seen.add(cleanUrl);
    links.push({ label: label.trim() || cleanUrl, url: cleanUrl });
  };

  value.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
    addLink(label, url);
    return '';
  });
  value.replace(/https?:\/\/[^\s)]+/g, (url) => {
    addLink(url, url);
    return '';
  });

  return links;
};

const formatSelectableGuidanceText = (value: string) =>
  value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();

const GuidanceSelectableText = ({
  children,
  inputStyle,
}: {
  children?: string;
  inputStyle?: any;
}) => {
  const content = formatSelectableGuidanceText(String(children || ''));
  if (!content) return null;

  return (
    <View style={styles.guidanceSelectableTextBlock}>
      <TextInput
        value={content}
        multiline
        readOnly
        scrollEnabled={false}
        selectTextOnFocus={false}
        style={[styles.guidanceSelectableTextInput, inputStyle]}
      />
    </View>
  );
};

const GuidanceMarkdown = ({ children }: { children?: string }) => {
  const content = formatSelectableGuidanceText(String(children || ''));
  if (!content) return null;
  const links = extractGuidanceLinks(String(children || ''));

  return (
    <View style={styles.guidanceSelectableTextBlock}>
      <TextInput
        value={content}
        multiline
        readOnly
        scrollEnabled={false}
        selectTextOnFocus={false}
        dataDetectorTypes="link"
        style={styles.guidanceSelectableTextInput}
      />
      {links.length > 0 && (
        <View style={styles.guidanceLinkList}>
          {links.map((link) => (
            <TouchableOpacity
              key={link.url}
              style={styles.guidanceLinkButton}
              onPress={() => void Linking.openURL(link.url)}
              activeOpacity={0.78}
            >
              <Text style={styles.guidanceLinkButtonText} numberOfLines={1}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const getWeekStartsOnFromLocale = (): 0 | 1 | 2 | 3 | 4 | 5 | 6 => {
  try {
    const LocaleCtor = (Intl as any)?.Locale;
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const firstDay = LocaleCtor ? new LocaleCtor(locale).weekInfo?.firstDay : undefined;

    if (typeof firstDay === 'number') {
      return (firstDay === 7 ? 0 : firstDay) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    }
  } catch (error) {
    console.warn('Failed to resolve locale week start', error);
  }

  return 1;
};

const isMonthlyGoalGuidanceSwitchRequest = (text: string) => {
  const normalized = text.trim().toLowerCase();
  return /^(month|monthly|this month)$/.test(normalized) ||
    /\b(month|monthly|this month)\b/.test(normalized) &&
    /\b(ok|okay|yes|yeah|yep|sure|switch|change|move|use|make|turn|lets|let's)\b/.test(normalized);
};

const getGoalGuidanceTimeframe = (
  todo: Pick<TodoItem, 'workspace' | 'dueDate' | 'goalTimeframe'> | null | undefined,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  now = new Date()
): GoalGuidanceTimeframe | null => {
  if (!todo || todo.workspace !== 'Goals') {
    return null;
  }

  const persistedTimeframe = getGoalGuidanceTimeframeFromTodoTimeframe(todo.goalTimeframe);
  return persistedTimeframe || getGoalGuidanceTimeframeFromTodoTimeframe(
    inferGoalTimeframeFromDueDate(todo.dueDate, weekStartsOn, now)
  );
};

const getGoalGuidanceDayLabel = (plan: GoalGuidancePlan) => {
  const dayNumber = Math.max(differenceInCalendarDays(startOfDay(new Date()), startOfDay(plan.createdAt)) + 1, 1);
  return `Day ${dayNumber}`;
};

const isSameLocalGoalDay = (left?: string | Date | null, right = new Date()) => {
  if (!left) {
    return false;
  }
  const date = left instanceof Date ? left : new Date(left);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return startOfDay(date).getTime() === startOfDay(right).getTime();
};

const getGoalQuotaProgressLabel = (behavior: GoalQuotaBehavior) =>
  `${Math.min(behavior.completedCount, behavior.targetCount)}/${behavior.targetCount} completed`;

const getGoalQuotaScheduledLabel = (date?: Date | null) =>
  date ? `Scheduled for ${format(date, date.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, yyyy')}` : '';

const getGoalQuotaInstructionText = (behavior: GoalQuotaBehavior) => {
  const unitLabel = behavior.unitLabel || (behavior.unitType === 'distinct_days' ? 'days' : 'times');
  if (behavior.unitType === 'distinct_days') {
    return `Complete this step on ${behavior.targetCount} separate ${unitLabel}.`;
  }
  return `Complete this step ${behavior.targetCount} ${unitLabel}.`;
};

const getGoalGuidanceTodoIds = (plan: GoalGuidancePlanModel) => {
  const todoIds = new Set<string>();

  if (plan.activeTodoId) {
    todoIds.add(plan.activeTodoId);
  }

  if (!plan.activeActionsJson) {
    return todoIds;
  }

  try {
    const parsed = JSON.parse(plan.activeActionsJson);
    const activeActions = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.activeActions)
        ? parsed.activeActions
        : [];
    activeActions.forEach((action: any) => {
      if (typeof action?.todoId === 'string' && action.todoId.length > 0) {
        todoIds.add(action.todoId);
      }
    });
    if (Array.isArray(parsed?.todoIds)) {
      parsed.todoIds.forEach((todoId: unknown) => {
        if (typeof todoId === 'string' && todoId.length > 0) {
          todoIds.add(todoId);
        }
      });
    }
  } catch {
    return todoIds;
  }

  return todoIds;
};

const getGoalGuidanceSteps = (plan: GoalGuidancePlanModel): GoalGuidanceStep[] => {
  if (!plan.stepsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(plan.stepsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getGoalGuidanceActiveActionLinks = (plan: GoalGuidancePlanModel) => {
  const links: { todoId: string; stepIndex: number }[] = [];
  const seenLinks = new Set<string>();

  if (plan.activeTodoId && Number.isInteger(plan.activeStepIndex)) {
    seenLinks.add(`${plan.activeTodoId}:${plan.activeStepIndex}`);
    links.push({ todoId: plan.activeTodoId, stepIndex: plan.activeStepIndex });
  }

  if (!plan.activeActionsJson) {
    return links;
  }

  try {
    const parsed = JSON.parse(plan.activeActionsJson);
    const activeActions = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.activeActions)
        ? parsed.activeActions
        : [];
    activeActions.forEach((action: any) => {
      if (typeof action?.todoId === 'string' && Number.isInteger(action?.stepIndex)) {
        const linkKey = `${action.todoId}:${action.stepIndex}`;
        if (seenLinks.has(linkKey)) {
          return;
        }
        seenLinks.add(linkKey);
        links.push({ todoId: action.todoId, stepIndex: action.stepIndex });
      }
    });
  } catch {
    return links;
  }

  return links;
};

const getGoalGuidanceCompletedStepIndexes = (plan: GoalGuidancePlanModel) => {
  if (!plan.completedStepIndexesJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(plan.completedStepIndexesJson);
    return Array.isArray(parsed)
      ? parsed.filter((index): index is number => Number.isInteger(index))
      : [];
  } catch {
    return [];
  }
};

const GOAL_GUIDANCE_VIDEO_INTENT_PATTERN =
  /\b(tutorial|how to|demo|demonstration|walkthrough|technique|form|drill|lesson|exercise|workout|repair|install|setup|configure|build|cook|recipe|intermediate)\b/;
const GOAL_GUIDANCE_VIDEO_STEP_PATTERN =
  /\b(learn|practice|install|set up|setup|configure|build|repair|fix|cook|bake|workout|exercise|stretch|draw|paint|play|record|edit|code|debug|present|demo|film|shoot|train|write|design|make)\b/;

const normalizeGoalGuidanceYoutubeQuery = (value: string) =>
  value
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getGoalGuidanceYoutubeSearchQuery = (step?: Pick<GoalGuidanceStep, 'title' | 'details' | 'youtubeQuery'>) => {
  const query = step?.youtubeQuery?.trim();
  const title = step?.title?.trim() || '';
  const details = step?.details?.trim() || '';
  const isLikelyVideoStep =
    GOAL_GUIDANCE_VIDEO_STEP_PATTERN.test(title.toLowerCase()) ||
    GOAL_GUIDANCE_VIDEO_STEP_PATTERN.test(details.toLowerCase());

  if (query) {
    const normalized = normalizeGoalGuidanceYoutubeQuery(query);
    const words = normalized.split(/\s+/).filter(Boolean);
    const hasInstructionIntent = GOAL_GUIDANCE_VIDEO_INTENT_PATTERN.test(normalized.toLowerCase());

    if (words.length >= 3 && words.length <= 12 && (hasInstructionIntent || isLikelyVideoStep)) {
      return normalized;
    }
  }

  if (!isLikelyVideoStep || !title) {
    return undefined;
  }

  return normalizeGoalGuidanceYoutubeQuery(`${title} intermediate tutorial step by step`);
};

const getTodoSectionKey = (
  todo: Pick<TodoItem, 'completed' | 'workspace' | 'dueDate' | 'goalTimeframe'>,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  now = new Date()
): TodoSectionKey => {
  return getTodoOrderingSection(todo, weekStartsOn, now);
};

const isOverdueIncompleteTodo = (
  todo: Pick<TodoItem, 'completed' | 'dueDate'>
) => !!todo.dueDate && !todo.completed && isPast(endOfDay(todo.dueDate));

const EXACT_ALARM_PROMPT_KEY = 'todoExactAlarmPromptSeenV1';
const EXACT_ALARM_SETTINGS_ACTION = 'android.settings.REQUEST_SCHEDULE_EXACT_ALARM';
const ANDROID_TODO_KEYBOARD_GAP = 10;
const TODO_AI_BAR_HEIGHT = 61;
const TODO_DETAILS_SHELL_COLOR = 'rgba(24, 94, 82, 0.25)';
const TODO_DETAILS_CARD_GRADIENT: [string, string] = ['#92E8D9', '#298071'];
/** Text on those cards: dark over the light left side, light over the dark right side. */
const TODO_DETAILS_CARD_DARK_TEXT = '#296056';
const TODO_DETAILS_CARD_LIGHT_TEXT = '#C6FDF3';
/** The guidance-path switch keeps its own, lighter gradient. */
const TODO_GUIDANCE_SWITCH_CARD_GRADIENT: [string, string] = ['#BEFFF4', '#298071'];
const GOAL_GUIDANCE_CARD_GRADIENT: [string, string] = ['#4B9387', '#024035'];
const GOAL_GUIDANCE_ICON_COLOR = '#024035';
const RECIPE_GUIDANCE_CARD_GRADIENT: [string, string] = ['#4B9387', '#024035'];
const RECIPE_GUIDANCE_ICON_COLOR = '#024035';
const TODO_DETAILS_TITLE_COLOR = '#C1FFF4';
const TODO_COMPOSER_SHEET_COLOR = 'rgba(9, 30, 26, 0.95)';
const TODO_COMPOSER_ACCENT_COLOR = '#2C6B60';
const TODO_COMPOSER_TEXT_COLOR = '#E8FFFA';
const GOAL_TIMEFRAME_RING_STROKE_WIDTH = 1.6;
const GOAL_TIMEFRAME_RING_COLOR = 'rgba(155, 228, 215, 0.92)';
const GOAL_TIMEFRAME_RING_START_DELAY = 1250;
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const shouldOfferExactAlarmSetup = Platform.OS === 'android' && Number(Platform.Version) >= 31;

const formatRecipeVideoDuration = (seconds?: number) => {
  if (!Number.isFinite(seconds) || !seconds) {
    return '';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const formatRecipeVideoViews = (views?: number) => {
  if (!Number.isFinite(views) || views === undefined) {
    return '';
  }

  if (views >= 1_000_000_000) {
    return `${(views / 1_000_000_000).toFixed(views >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, '')}B views`;
  }
  if (views >= 1_000_000) {
    return `${(views / 1_000_000).toFixed(views >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M views`;
  }
  if (views >= 1_000) {
    return `${(views / 1_000).toFixed(views >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K views`;
  }
  return `${Math.max(0, Math.floor(views)).toLocaleString()} views`;
};

const extendSeenVideoIds = (
  current: Set<string>,
  videos: Array<{ videoId?: string }>,
  extraVideoIds: string[] = []
) => {
  const next = new Set(current);
  [...extraVideoIds, ...videos.map((video) => video.videoId || '')]
    .map((videoId) => videoId.trim())
    .filter(Boolean)
    .forEach((videoId) => next.add(videoId));
  return next;
};

const formatRecipeTimestamp = (seconds?: number) => {
  if (!Number.isFinite(seconds) || seconds === undefined) {
    return '';
  }

  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const buildRecipeTimestampUrl = (videoId?: string, seconds?: number) =>
  videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}${Number.isFinite(seconds) ? `&t=${Math.max(0, Math.floor(seconds || 0))}s` : ''}`
    : undefined;

const getRecipeIngredientLabel = (ingredient: RecipeIngredient) =>
  `${ingredient.quantity ? `${ingredient.quantity} ` : ''}${ingredient.name}${ingredient.note ? ` - ${ingredient.note}` : ''}`;

const getRecipeIngredientTodoTitle = (ingredient: RecipeIngredient) =>
  ingredient.name.trim() || getRecipeIngredientLabel(ingredient);

const getRecipeDisplayName = (name: string) =>
  name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getRecipeIngredientKey = (todoId: string, ingredient: RecipeIngredient, index: number) =>
  `${todoId}-${index}-${ingredient.name.trim().toLowerCase()}`;

const getRecipeIngredientCheckedMap = (guide: RecipeGuide | null | undefined) => {
  if (!guide) {
    return {};
  }

  return guide.ingredients.reduce<Record<string, boolean>>((checkedMap, ingredient, index) => {
    checkedMap[getRecipeIngredientKey(guide.todoId, ingredient, index)] = !!ingredient.checked;
    return checkedMap;
  }, {});
};

const getRecipeGuideSteps = (guide: { stepsJson?: string }) => {
  try {
    const steps = JSON.parse(guide.stepsJson || '[]');
    return Array.isArray(steps) ? steps as RecipeStep[] : [];
  } catch {
    return [];
  }
};

const getRecipeProgressFromSteps = (steps: RecipeStep[]): RecipeProgress | null => {
  if (!steps.length) {
    return null;
  }

  const completed = steps.filter((step) => step.completed).length;
  return {
    completed,
    total: steps.length,
    ratio: completed / steps.length,
  };
};

const getSkillGuideSteps = (guide: { stepsJson?: string }) => {
  try {
    const steps = JSON.parse(guide.stepsJson || '[]');
    return Array.isArray(steps) ? steps as SkillStep[] : [];
  } catch {
    return [];
  }
};

const getSkillProgressFromSteps = (steps: SkillStep[]): SkillProgress | null => {
  if (!steps.length) {
    return null;
  }

  const completed = steps.filter((step) => step.completed).length;
  return {
    completed,
    total: steps.length,
    ratio: completed / steps.length,
  };
};

const getTaskGuideSteps = (guide: { stepsJson?: string }) => {
  try {
    const steps = JSON.parse(guide.stepsJson || '[]');
    return Array.isArray(steps) ? steps as TaskGuidanceStep[] : [];
  } catch {
    return [];
  }
};

const getTaskProgressFromSteps = (
  steps: TaskGuidanceStep[],
  status: TaskGuide['status'] = 'accepted'
): TaskProgress | null => {
  if (!steps.length) {
    return null;
  }

  const completed = status === 'complete'
    ? steps.length
    : steps.filter((step) => step.completed).length;
  return {
    completed,
    total: steps.length,
    ratio: completed / steps.length,
    status,
  };
};

const toTodoItem = (
  todo: TodoModel,
  recurrenceSeriesById?: Map<string, TodoRecurrenceSeriesModel>
): TodoItem => {
  const reminder = normalizeTodoReminderState(todo, todo.hasDueTime);
  const recurrenceSeries = todo.recurrenceSeriesId
    ? recurrenceSeriesById?.get(todo.recurrenceSeriesId)
    : null;
  const recurrenceActive = !!recurrenceSeries?.active;
  const recurrence = recurrenceSeries && recurrenceActive
    ? normalizeTodoRecurrenceRule({
        interval: recurrenceSeries.interval,
        unit: recurrenceSeries.unit,
      })
    : null;

  return {
    id: todo.id,
    text: todo.text,
    completed: todo.completed,
    createdAt: todo.createdAt,
    details: todo.details,
    dueDate: todo.dueDate,
    hasDueTime: todo.hasDueTime,
    starred: todo.starred,
    workspace: todo.workspace,
    sortScope: todo.sortScope,
    sortOrder: todo.sortOrder,
    amazonUrl: todo.amazonUrl,
    isAmazonUrlLoaded: todo.isAmazonUrlLoaded,
    amazonUrlLoadAttempts: todo.amazonUrlLoadAttempts,
    emailId: todo.emailId,
    type: todo.type || 'basic',
    startedAt: todo.startedAt,
    progress: todo.progress,
    reminderEnabled: reminder.reminderEnabled,
    reminderMode: reminder.reminderMode,
    reminderMinutesBefore: reminder.reminderMinutesBefore,
    notificationId: reminder.notificationId,
    goalTimeframe: isGoalTodoTimeframe(todo.goalTimeframe) ? todo.goalTimeframe : null,
    taskKind: normalizeTodoTaskKind(todo.taskKind),
    guidancePath: normalizeGuidancePath(todo.guidancePath),
    goalBehaviorJson: todo.goalBehaviorJson ?? null,
    recurrenceSeriesId: todo.recurrenceSeriesId ?? null,
    recurrenceOccurrenceDate: todo.recurrenceOccurrenceDate ?? null,
    recurrenceOverride: !!todo.recurrenceOverride,
    recurrence,
    recurrenceActive,
  };
};

type TodoKind = 'basic' | 'progress' | 'slider';
type Workspace = {
  key: string; // stable identifier stored on todos (original/builtin name)
  displayName: string; // user-visible name
  originalName: string; // seed/original name
  color: string;
  todoType: TodoKind;
  builtin: boolean;
  locked: boolean; // true for Wishlist
};

interface ThemeConfig {
  overallBg: string;
  gradientColors?: [string, string];
  gradientStart?: { x: number; y: number };
  gradientEnd?: { x: number; y: number };
  sectionBg: string;
  sectionGradientColors: [string, string];
  todoCardGradientColors: [string, string];
  todoCardStrokeColor: string;
  basicDotColor: string;
  progressStarted: string;
  progressStartedInactive: string;
  progressFinished: string;
  progressFinishedInactive?: string; // Added for completeness
  sliderStarted: string;
  sliderHalfway: string;
  sliderFinished: string;
  sliderThumbDefault: string;
  workspaceDotColor: string;
  workspaceNameColor: string;
  headerTitleColor: string;
  headerMenuColor: string;
  todoTitleColor: string;
  statusBarColor: string;
  isDark: boolean; // for status bar style
}

const darkenColor = (hex: string, amount: number) => {
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16);
  const next = (value: number) => Math.round(clamp(value * (1 - amount)));

  return `#${[channel(1), channel(3), channel(5)]
    .map((value) => next(value).toString(16).padStart(2, '0'))
    .join('')}`;
};

const lightenColor = (hex: string, amount: number) => {
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16);
  const next = (value: number) => Math.round(clamp(value + (255 - value) * amount));

  return `#${[channel(1), channel(3), channel(5)]
    .map((value) => next(value).toString(16).padStart(2, '0'))
    .join('')}`;
};

const getTheme = (color: string = '#22AB93'): ThemeConfig => {
  const c = color?.toLowerCase();

  // Mint
  if (c?.startsWith('#8aedd2') || c?.startsWith('#8a3dd2') || c?.startsWith('#a2fdff')) {
    return {
      overallBg: '#A2FDFF',
      sectionBg: '#9EE9EB',
      sectionGradientColors: ['#9EE9EB', '#68cfd1'],
      todoCardGradientColors: ['#d8ffff', '#8bdfe1'],
      todoCardStrokeColor: '#95E0E2',
      basicDotColor: '#95E0E2',
      progressStarted: '#95E0E2',
      progressStartedInactive: '#C5FCFD',
      progressFinished: '#95E0E2',
      progressFinishedInactive: '#C5FCFD',
      sliderStarted: '#C5FCFD',
      sliderHalfway: '#95E0E2',
      sliderFinished: '#95E0E2',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#95E0E2',
      workspaceNameColor: '#95E0E2',
      headerTitleColor: '#FFFFFF',
      headerMenuColor: '#6dcfd0',
      todoTitleColor: '#FFFFFF',
      statusBarColor: '#A2FDFF',
      isDark: true,
    };
  }

  // High Purple
  if (c?.startsWith('#d8b3fd') || c?.startsWith('#d7afff')) {
    return {
      overallBg: '#D7AFFF',
      sectionBg: '#AD5AFF',
      sectionGradientColors: ['#AD5AFF', '#6b2aad'],
      todoCardGradientColors: ['#e2c7ff', '#9f67d8'],
      todoCardStrokeColor: '#AD5AFF',
      basicDotColor: '#7F4BB5',
      progressStarted: '#D8B3FD',
      progressStartedInactive: 'rgba(216, 179, 253, 0.66)',
      progressFinished: '#7F4BB5',
      progressFinishedInactive: 'rgba(216, 179, 253, 0.66)',
      sliderStarted: '#D8B3FD',
      sliderHalfway: '#7F4BB5',
      sliderFinished: '#7F4BB5',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#AD5AFF',
      workspaceNameColor: '#AD5AFF',
      headerTitleColor: '#F5EAFF',
      headerMenuColor: '#7F4BB5',
      todoTitleColor: '#F5EAFF',
      statusBarColor: '#D7AFFF',
      isDark: true,
    };
  }

  // Coral
  if (c?.startsWith('#ffc4c4') || c?.startsWith('#f1c9b7')) {
    return {
      overallBg: '#FFC4C4',
      sectionBg: '#DC7474',
      sectionGradientColors: ['#DC7474', '#925050'],
      todoCardGradientColors: ['#ffd8d8', '#d38f8f'],
      todoCardStrokeColor: '#DC7474',
      basicDotColor: '#DC7474',
      progressStarted: '#B1765C',
      progressStartedInactive: 'rgba(232, 181, 144, 0.66)',
      progressFinished: '#B1765C',
      progressFinishedInactive: 'rgba(232, 181, 144, 0.66)',
      sliderStarted: '#E8B590',
      sliderHalfway: '#DC7474',
      sliderFinished: '#DC7474',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#DC7474',
      workspaceNameColor: '#DC7474',
      headerTitleColor: '#FFD8D8',
      headerMenuColor: '#B1765C',
      todoTitleColor: '#FFD8D8',
      statusBarColor: '#FFC4C4',
      isDark: true,
    };
  }

  // Indigo
  if (c?.startsWith('#889afc') || c?.startsWith('#a2eefa')) {
    return {
      overallBg: '#889AFC',
      sectionBg: '#5B6ED5',
      sectionGradientColors: ['#5B6ED5', '#344690'],
      todoCardGradientColors: ['#c8d0ff', '#7c8ede'],
      todoCardStrokeColor: '#5B6ED5',
      basicDotColor: '#6F7DC5',
      progressStarted: '#6F7DC5',
      progressStartedInactive: 'rgba(180, 191, 255, 0.66)',
      progressFinished: '#6F7DC5',
      progressFinishedInactive: 'rgba(180, 191, 255, 0.66)',
      sliderStarted: '#B4BFFF',
      sliderHalfway: '#6F7DC5',
      sliderFinished: '#6F7DC5',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#5B6ED5',
      workspaceNameColor: '#5B6ED5',
      headerTitleColor: '#E2E8FF',
      headerMenuColor: '#6F7DC5',
      todoTitleColor: '#FFD8D8',
      statusBarColor: '#889AFC',
      isDark: true,
    };
  }

  // Light Gold
  if (c?.startsWith('#ffeb80') || c?.startsWith('#f8e061')) {
    return {
      overallBg: '#FFEB80',
      sectionBg: '#FFDC21',
      sectionGradientColors: ['#FFDC21', '#b29116'],
      todoCardGradientColors: ['#fff2ab', '#e2c54e'],
      todoCardStrokeColor: '#CBB43F',
      basicDotColor: '#CBB43F',
      progressStarted: '#CBB43F',
      progressStartedInactive: 'rgba(248, 224, 97, 0.66)',
      progressFinished: '#CBB43F',
      progressFinishedInactive: 'rgba(248, 224, 97, 0.66)',
      sliderStarted: '#F8E061',
      sliderHalfway: '#CBB43F',
      sliderFinished: '#CBB43F',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#FFDC21',
      workspaceNameColor: '#FFDC21',
      headerTitleColor: '#FFFCEB',
      headerMenuColor: '#CBB43F',
      todoTitleColor: '#FFFCEB',
      statusBarColor: '#FFEB80',
      isDark: false,
    };
  }

  // Pink
  if (c?.startsWith('#ffc2dc')) {
    return {
      overallBg: '#FFC2DC',
      sectionBg: '#F0B0CD',
      sectionGradientColors: ['#F0B0CD', '#b87895'],
      todoCardGradientColors: ['#ffe1ee', '#d99db8'],
      todoCardStrokeColor: '#BE88A0',
      basicDotColor: '#BE88A0',
      progressStarted: '#FFDCEC',
      progressStartedInactive: 'rgba(255, 220, 236, 0.66)',
      progressFinished: '#BE88A0',
      progressFinishedInactive: 'rgba(255, 220, 236, 0.66)',
      sliderStarted: '#FFDCEC',
      sliderHalfway: '#BE88A0',
      sliderFinished: '#BE88A0',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#F0B0CD',
      workspaceNameColor: '#F0B0CD',
      headerTitleColor: '#F9E6EF',
      headerMenuColor: '#BE88A0',
      todoTitleColor: '#F9E6EF',
      statusBarColor: '#FFC2DC',
      isDark: true,
    };
  }

  // Teal
  if (c?.startsWith('#22ab93')) {
    return {
      overallBg: '#22AB93',
      gradientColors: ['#22ab93', '#0E453B'],
      gradientStart: { x: 0, y: 0 },
      gradientEnd: { x: 1, y: 1 },
      sectionBg: '#3BCAB1',
      sectionGradientColors: ['#3BCAB1', '#1D6457'],
      todoCardGradientColors: ['#9BE4D7', '#47A090'],
      todoCardStrokeColor: '#43A5A4',
      basicDotColor: '#A7D0C9',
      progressStarted: '#469386',
      progressStartedInactive: '#99C8C0',
      progressFinished: '#469386',
      progressFinishedInactive: '#99C8C0',
      sliderStarted: '#99C8C0',
      sliderHalfway: '#5FC0AF',
      sliderFinished: '#469386',
      sliderThumbDefault: '#D4D9D9',
      workspaceDotColor: '#3BCAB1',
      workspaceNameColor: '#3BCAB1',
      headerTitleColor: '#82E2CD',
      headerMenuColor: '#297769',
      todoTitleColor: '#CFFEF5',
      statusBarColor: '#22AB93',
      isDark: true,
    };
  }

  // Default / Other
  return {
    overallBg: '#E9ECEB',
    sectionBg: color,
    sectionGradientColors: [lightenColor(color, 0.1), darkenColor(color, 0.45)],
    todoCardGradientColors: [lightenColor(color, 0.45), darkenColor(color, 0.08)],
    todoCardStrokeColor: lightenColor(color, 0.18),
    basicDotColor: '#55c2a1', // Default fallback
    progressStarted: '#469386',
    progressStartedInactive: '#99C8C0',
    progressFinished: '#469386',
    progressFinishedInactive: '#99C8C0',
    sliderStarted: '#99C8C0',
    sliderHalfway: '#5FC0AF',
    sliderFinished: '#469386',
    sliderThumbDefault: '#D4D9D9',
    workspaceDotColor: color,
    workspaceNameColor: color,
    headerTitleColor: darkenColor(color, 0.08),
    headerMenuColor: darkenColor(color, 0.22),
    todoTitleColor: '#1f2937', // gray-800
    statusBarColor: '#E9ECEB',
    isDark: false,
  };
};

const BUILTIN_DEFAULTS: Record<string, { color: string; todoType: TodoKind }> = {
  Goals: { color: '#FF9500', todoType: 'basic' },
  Personal: { color: '#22AB93', todoType: 'basic' },
  Wishlist: { color: '#FF3B30', todoType: 'basic' },
};

const BUILTIN_WORKSPACE_ORDER = TODO_WORKSPACE_ORDER;
const WORKSPACE_SHELL_HORIZONTAL_PADDING = 8;
const WORKSPACE_SHELL_TOP_PADDING = 10;
const WORKSPACE_SHELL_BOTTOM_PADDING = 8;
const TODO_DRAG_LONG_PRESS_MS = 450;
const TODO_DRAG_ACTIVATION_DISTANCE = 24;
const TODO_REVEAL_TOP_PADDING = 18;
const TODO_REVEAL_RETRY_MS = 90;
const TODO_REVEAL_MAX_ATTEMPTS = 32;
const GUIDANCE_REPLY_INSTRUCTION = 'Reply in the input box below.';

const normalizeWorkspaceKey = (value?: string) => {
  return normalizeTodoWorkspaceKey(value);
};

const TodoCardSurface = ({
  children,
  gradientColors,
  strokeColor,
}: {
  children: React.ReactNode;
  gradientColors: [string, string];
  strokeColor: string;
}) => (
  <View style={[styles.todoCardFrame, { backgroundColor: strokeColor }]}>
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.todoCardGradient}
    >
      {children}
    </LinearGradient>
  </View>
);

const DragStateHandle = () => (
  <View pointerEvents="none" style={styles.dragStateHandle}>
    <View style={styles.dragHandleDotGrid}>
      {[0, 1].map((row) => (
        <View key={`drag-row-${row}`} style={styles.dragHandleDotRow}>
          <View style={styles.dragHandleDot} />
          <View style={styles.dragHandleDot} />
        </View>
      ))}
    </View>
  </View>
);

const SliderTodoItem = ({
  todo,
  onSliderChange,
  handleTodoPress,
  themeColor,
  dragHandlers,
  isDragging,
  searchQuery,
}: {
  todo: TodoItem;
  onSliderChange: (id: string, value: number) => void;
  handleTodoPress: (todo: TodoItem) => void;
  themeColor?: string;
  dragHandlers?: {
    onLongPress: () => void;
  };
  isDragging?: boolean;
  searchQuery?: string;
}) => {
  const [width, setWidth] = useState(0);
  const progress = useRef(new Animated.Value(todo.progress || 0)).current;
  const workspaceAppearance = getTodoWorkspaceAppearance(todo.workspace);
  const theme = getTheme(workspaceAppearance?.themeColor || themeColor);
  const titleMatchesSearch = todoValueIncludesAnySearchTerm(todo.text || '', searchQuery || '');
  const details = todo.details?.trim() || '';
  const shouldShowDetailsSnippet = !!details && todoValueIncludesAnySearchTerm(details, searchQuery || '') && (
    !titleMatchesSearch || todoDetailsAddSearchContext(todo.text || '', details, searchQuery || '')
  );

  useEffect(() => {
    Animated.spring(progress, {
      toValue: todo.progress || 0,
      useNativeDriver: false,
      bounciness: 10,
    }).start();
  }, [todo.progress, progress]);

  const onGestureEvent = (event: any) => {
    const newProgress = Math.max(0, Math.min(1, event.nativeEvent.x / width));
    progress.setValue(newProgress);
  };

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      // @ts-ignore
      let newProgress = progress._value;
      if (newProgress < 0.05) newProgress = 0;
      else if (newProgress < 0.3) newProgress = 0.1; // "Started" state
      else if (newProgress < 0.75) newProgress = 0.5;
      else newProgress = 1;

      onSliderChange(todo.id, newProgress);

      Animated.spring(progress, {
        toValue: newProgress,
        useNativeDriver: false,
        bounciness: 10,
      }).start();
    }
  };

  const handleStartedPress = () => {
    const newProgress = (todo.progress || 0) > 0 ? 0 : 0.1;
    onSliderChange(todo.id, newProgress);
  };

  const animatedWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const thumbTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width > 0 ? width - 20 : 0], // 20 is thumb width
    extrapolate: 'clamp',
  });

  const getThumbColor = (p: number) => {
    if (p >= 1) return theme.sliderFinished;
    if (p >= 0.5) return theme.sliderHalfway;
    if (p > 0) return theme.sliderStarted;
    return theme.sliderThumbDefault;
  };

  const thumbColor = getThumbColor(todo.progress || 0);

  return (
    <Pressable
      key={todo.id}
      onPress={() => handleTodoPress(todo)}
      onLongPress={dragHandlers?.onLongPress}
      delayLongPress={TODO_DRAG_LONG_PRESS_MS}
      style={({ pressed }) => [
        isDragging && styles.draggingTodoItem,
        pressed && !isDragging && !dragHandlers && styles.pressedTodoItem,
      ]}
    >
      <TodoCardSurface
        gradientColors={workspaceAppearance?.todoCardGradientColors || theme.todoCardGradientColors}
        strokeColor={workspaceAppearance?.todoCardStrokeColor || theme.todoCardStrokeColor}
      >
        <Text
          className="text-[15px] text-center mb-3"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ color: '#3A6860', fontWeight: '700', width: '100%' }}
        >
          {renderTodoHighlightedText(todo.text, searchQuery || '')}
        </Text>
        {shouldShowDetailsSnippet && (
          <Text
            style={[todoSearchTextStyles.detailsSnippet, isDragging ? styles.dragFadedCardDetails : undefined]}
            numberOfLines={2}
          >
            {renderTodoHighlightedText(getTodoDetailsMatchSnippet(details, searchQuery || ''), searchQuery || '')}
          </Text>
        )}
        <View
          className="flex-row items-center justify-between px-2"
          style={isDragging ? styles.dragFadedCardDetails : undefined}
        >
          <TouchableOpacity onPress={handleStartedPress}>
            <Text
              className={`text-[11px] italic ${(todo.progress || 0) > 0 ? 'text-gray-800 font-bold' : 'text-gray-400'
                }`}
            >
              Started
            </Text>
          </TouchableOpacity>
          <Text
            className={`text-[11px] italic ${(todo.progress || 0) >= 0.5 ? 'text-gray-800 font-bold' : 'text-gray-400'
              }`}
          >
            half way
          </Text>
          <Text
            className={`text-[11px] italic ${(todo.progress || 0) >= 1 ? 'text-gray-800 font-bold' : 'text-gray-400'
              }`}
          >
            Finished
          </Text>
        </View>

        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
          minDist={0}
        >
          <Animated.View
            onLayout={e => setWidth(e.nativeEvent.layout.width)}
            className="h-5 justify-center"
            style={isDragging ? styles.dragFadedCardDetails : undefined}
          >
            <View
              className="h-2 bg-[#D9D9D9] w-full rounded-full"
            />
            <Animated.View
              className="h-2 absolute rounded-full"
              style={{
                width: animatedWidth,
                backgroundColor: thumbColor === '#D4D9D9' ? 'transparent' : thumbColor,
              }}
            />
            <Animated.View
              className="w-5 h-5 rounded-full absolute"
              style={{
                transform: [{ translateX: thumbTranslateX }],
                backgroundColor: thumbColor
              }}
            />
          </Animated.View>
        </PanGestureHandler>
        {isDragging && <DragStateHandle />}
      </TodoCardSurface>
    </Pressable>
  );
};

const getNextHalfHourTime = (baseDate?: Date) => {
  const now = new Date();
  const next = new Date(baseDate || now);
  next.setSeconds(0, 0);

  const minutes = now.getMinutes();
  if (minutes <= 30) {
    next.setHours(now.getHours(), 30, 0, 0);
  } else {
    next.setHours(now.getHours() + 1, 0, 0, 0);
  }

  return next;
};

const getNextCalendarSlot = (now = new Date()) => {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  return next;
};

const getTodoCalendarStartDate = (todo: Pick<TodoItem, 'dueDate' | 'hasDueTime'>, now = new Date()) => {
  if (todo.dueDate && getTodoHasDueTime(todo.dueDate, todo.hasDueTime)) {
    return new Date(todo.dueDate);
  }

  const slot = getNextCalendarSlot(now);
  if (!todo.dueDate) {
    return slot;
  }

  const dueDate = new Date(todo.dueDate);
  const dueDay = startOfDay(dueDate);
  const today = startOfDay(now);
  const slotDay = startOfDay(slot);
  if (dueDay.getTime() === today.getTime() && slotDay.getTime() > today.getTime()) {
    return slot;
  }

  dueDate.setHours(slot.getHours(), slot.getMinutes(), 0, 0);
  return dueDate;
};

const reminderOptions = [
  { key: 'none', label: 'None', mode: 'none' as const, minutes: null },
  { key: 'on_time', label: 'On time', mode: 'on_time' as const, minutes: 0 },
  ...TODO_REMINDER_PRESETS.map((option) => ({
    key: `preset-${option.minutes}`,
    label: option.label,
    mode: 'preset' as const,
    minutes: option.minutes,
  })),
];

const SET_TIME_FIRST_REMINDER_NOTICE = {
  title: 'Set a time first',
  message: 'Choose a time before choosing a reminder.',
};

const TODO_ALREADY_SENT_TO_CALENDAR_NOTICE = {
  title: 'Already on Calendar',
  message: 'This task has already been sent to Calendar.',
};

const getReminderSelectionKey = (todo: Pick<TodoItem, 'reminderEnabled' | 'reminderMode' | 'reminderMinutesBefore' | 'hasDueTime'>) => {
  const normalized = normalizeTodoReminderState(todo, todo.hasDueTime);
  if (normalized.reminderMode === 'none') return 'none';
  if (normalized.reminderMode === 'on_time') return 'on_time';
  const preset = TODO_REMINDER_PRESETS.find((option) => option.minutes === normalized.reminderMinutesBefore);
  return preset ? `preset-${preset.minutes}` : 'custom';
};

/** "Today", "Tomorrow", "Yesterday", then "Mon, Oct 12" (with the year when it is not this year). */
const formatTodoDateLabel = (date?: Date) => {
  if (!date) return 'None';
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, date.getFullYear() === new Date().getFullYear() ? 'EEE, MMM d' : 'EEE, MMM d, yyyy');
};

const formatTodoTimeLabel = (date?: Date, hasDueTime?: boolean) => {
  if (!date || !getTodoHasDueTime(date, hasDueTime)) {
    return 'None';
  }

  return format(date, 'h:mm a');
};

const GoalTimeframePicker = React.memo(({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: GoalTodoTimeframe;
  onSelect: (value: GoalTodoTimeframe) => void;
  onClose: () => void;
}) => (
  <Modal
    transparent
    visible={visible}
    animationType="fade"
    onRequestClose={onClose}
  >
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={styles.goalTimeframeModalOverlay}>
        <TouchableWithoutFeedback>
          <View style={styles.goalTimeframeModalCard}>
            <Text style={styles.goalTimeframeModalTitle}>Goal timeframe</Text>
            {GOAL_TIMEFRAME_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.goalTimeframeOption,
                  option.value === value && styles.goalTimeframeOptionSelected,
                ]}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
                activeOpacity={0.82}
              >
                <Text
                  style={[
                    styles.goalTimeframeOptionText,
                    option.value === value && styles.goalTimeframeOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
                {option.value === value && (
                  <Ionicons name="checkmark" size={18} color="#E8FFFA" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  </Modal>
));
GoalTimeframePicker.displayName = 'GoalTimeframePicker';

const RECURRENCE_PRESET_RULES: Record<string, TodoRecurrenceRule | null> = {
  none: null,
  daily: { interval: 1, unit: 'day' },
  weekly: { interval: 1, unit: 'week' },
  weekdays: { interval: 1, unit: 'weekday' },
  monthly: { interval: 1, unit: 'month' },
};

const RECURRENCE_NUMBER_OPTIONS = Array.from({ length: 99 }, (_, index) => index + 1);
const RECURRENCE_UNIT_OPTIONS: TodoRecurrenceUnit[] = ['day', 'week', 'month'];

const TodoRepeatPicker = React.memo(({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value?: TodoRecurrenceRule | null;
  onChange: (value: TodoRecurrenceRule | null) => void;
  onClose: () => void;
}) => {
  const [preset, setPreset] = useState(() => getTodoRecurrencePreset(value));
  const [customInterval, setCustomInterval] = useState(value?.interval || 2);
  const [customUnit, setCustomUnit] = useState<TodoRecurrenceUnit>(value?.unit && value.unit !== 'weekday' ? value.unit : 'day');

  useEffect(() => {
    if (!visible) {
      return;
    }

    const nextPreset = getTodoRecurrencePreset(value);
    setPreset(nextPreset);
    setCustomInterval(nextPreset === 'custom' ? value?.interval || 2 : 2);
    setCustomUnit(nextPreset === 'custom' ? value?.unit || 'day' : 'day');
  }, [value, visible]);

  const handleDone = () => {
    const nextValue = preset === 'custom'
      ? { interval: customInterval, unit: customUnit }
      : RECURRENCE_PRESET_RULES[preset] ?? null;
    onChange(nextValue);
    onClose();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.repeatPickerOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.repeatPickerCard}>
              <View style={styles.repeatPickerHeader}>
                <Text style={styles.repeatPickerTitle}>Repeat</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Ionicons name="close" size={20} color="#E8FFFA" />
                </TouchableOpacity>
              </View>

              {[
                { key: 'none', label: 'No repeat' },
                { key: 'daily', label: 'Daily' },
                { key: 'weekly', label: 'Weekly' },
                { key: 'weekdays', label: 'Weekdays' },
                { key: 'monthly', label: 'Monthly' },
                { key: 'custom', label: 'Custom' },
              ].map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.repeatPickerOption,
                    preset === option.key && styles.repeatPickerOptionSelected,
                  ]}
                  onPress={() => setPreset(option.key)}
                  activeOpacity={0.82}
                >
                  <Text style={styles.repeatPickerOptionText}>{option.label}</Text>
                  {preset === option.key && <Ionicons name="checkmark" size={18} color="#E8FFFA" />}
                </TouchableOpacity>
              ))}

              {preset === 'custom' && (
                <View style={styles.repeatPickerCustomRow}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.repeatPickerNumberScroller}
                  >
                    {RECURRENCE_NUMBER_OPTIONS.map((number) => {
                      const selected = customInterval === number;
                      return (
                        <TouchableOpacity
                          key={number}
                          style={[
                            styles.repeatPickerNumberOption,
                            selected && styles.repeatPickerInlineOptionSelected,
                          ]}
                          onPress={() => setCustomInterval(number)}
                          activeOpacity={0.82}
                        >
                          <Text style={[
                            styles.repeatPickerInlineOptionText,
                            selected && styles.repeatPickerInlineOptionTextSelected,
                          ]}>
                            {number}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.repeatPickerUnitRow}>
                    {RECURRENCE_UNIT_OPTIONS.map((unit) => {
                      const selected = customUnit === unit;
                      return (
                        <TouchableOpacity
                          key={unit}
                          style={[
                            styles.repeatPickerUnitOption,
                            selected && styles.repeatPickerInlineOptionSelected,
                          ]}
                          onPress={() => setCustomUnit(unit)}
                          activeOpacity={0.82}
                        >
                          <Text style={[
                            styles.repeatPickerInlineOptionText,
                            selected && styles.repeatPickerInlineOptionTextSelected,
                          ]}>
                            {`${unit.charAt(0).toUpperCase()}${unit.slice(1)}s`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {preset === 'custom' && (
                <Text style={styles.repeatPickerPreview}>
                  {getTodoRecurrenceLabel({ interval: customInterval, unit: customUnit })}
                </Text>
              )}

              <View style={styles.repeatPickerActions}>
                <TouchableOpacity style={styles.repeatPickerSecondaryButton} onPress={onClose}>
                  <Text style={styles.repeatPickerSecondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.repeatPickerPrimaryButton} onPress={handleDone}>
                  <Text style={styles.repeatPickerPrimaryButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
});
TodoRepeatPicker.displayName = 'TodoRepeatPicker';

const GoalQuotaDatePickerModal = React.memo(({
  visible,
  value,
  minimumDate,
  onChange,
  onClose,
  onConfirm,
  isConfirming,
}: {
  visible: boolean;
  value: Date;
  minimumDate: Date;
  onChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  onClose: () => void;
  onConfirm: () => void;
  isConfirming: boolean;
}) => (
  <Modal
    transparent
    visible={visible}
    animationType="fade"
    onRequestClose={onClose}
  >
    <View style={styles.goalQuotaDateModalOverlay}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={StyleSheet.absoluteFillObject} />
      </TouchableWithoutFeedback>
      <LinearGradient
        colors={['#113D36', '#001814']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.goalQuotaDateModalCard}
      >
        <View style={styles.goalQuotaDateModalHeader}>
          <Text style={styles.goalQuotaDateModalTitle}>Pick a date</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.goalQuotaDateModalCloseButton}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close date picker"
          >
            <Ionicons name="close" size={20} color="#E8FFFA" />
          </TouchableOpacity>
        </View>
        <DateTimePicker
          value={value}
          mode="date"
          display="inline"
          minimumDate={minimumDate}
          onChange={onChange}
          accentColor="#9BE4D7"
          textColor={TODO_COMPOSER_TEXT_COLOR}
          themeVariant="dark"
          style={styles.goalQuotaDatePicker}
        />
        <View style={styles.goalQuotaDateModalActions}>
          <TouchableOpacity
            style={styles.goalQuotaDateModalSecondaryButton}
            onPress={onClose}
            activeOpacity={0.82}
            disabled={isConfirming}
          >
            <Text style={styles.goalQuotaDateModalSecondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.goalQuotaDateModalPrimaryButton,
              isConfirming && styles.actionButtonDisabled,
            ]}
            onPress={onConfirm}
            activeOpacity={0.82}
            disabled={isConfirming}
          >
            <Text style={styles.goalQuotaDateModalPrimaryButtonText}>
              {isConfirming ? 'Saving...' : 'Done'}
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  </Modal>
));
GoalQuotaDatePickerModal.displayName = 'GoalQuotaDatePickerModal';

const GoalTimeframeChip = React.memo(({
  label,
  onPress,
  accentColor,
}: {
  label: string;
  onPress: () => void;
  accentColor: string;
}) => {
  const ringCycle = useRef(new Animated.Value(0)).current;
  const [chipSize, setChipSize] = useState({ width: 0, height: 0 });
  const ringWidth = chipSize.width;
  const ringHeight = chipSize.height;
  const ringPathWidth = Math.max(0, ringWidth - GOAL_TIMEFRAME_RING_STROKE_WIDTH);
  const ringPathHeight = Math.max(0, ringHeight - GOAL_TIMEFRAME_RING_STROKE_WIDTH);
  const ringCornerRadius = ringPathHeight / 2;
  const ringPerimeter = ringPathWidth > 0 && ringPathHeight > 0
    ? Math.max(1, 2 * Math.max(0, ringPathWidth - ringPathHeight) + Math.PI * ringPathHeight)
    : 1;
  const ringStrokeOffset = ringCycle.interpolate({
    inputRange: [0, 0.78, 1],
    outputRange: [ringPerimeter, 0, 0],
    extrapolate: 'clamp',
  });
  const ringOpacity = ringCycle.interpolate({
    inputRange: [0, 0.08, 0.78, 1],
    outputRange: [0, 0.95, 0.95, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    if (chipSize.width <= 0 || chipSize.height <= 0) {
      return;
    }

    const runCycle = () => Animated.sequence([
      Animated.timing(ringCycle, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(ringCycle, {
        toValue: 0,
        duration: 1,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
      Animated.delay(180),
    ]);

    ringCycle.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(GOAL_TIMEFRAME_RING_START_DELAY),
      runCycle(),
    ]);
    animation.start();
    return () => animation.stop();
  }, [chipSize.height, chipSize.width, label, ringCycle]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setChipSize((currentSize) => {
      if (Math.abs(currentSize.width - width) < 0.5 && Math.abs(currentSize.height - height) < 0.5) {
        return currentSize;
      }

      return { width, height };
    });
  }, []);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLayout={handleLayout}
      style={[styles.todoComposerChip, styles.goalTimeframeChip]}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Goal timeframe, ${label}`}
    >
      {chipSize.width > 0 && chipSize.height > 0 && (
        <Svg
          pointerEvents="none"
          width={ringWidth}
          height={ringHeight}
          style={styles.goalTimeframeChipRing}
        >
          <AnimatedRect
            x={GOAL_TIMEFRAME_RING_STROKE_WIDTH / 2}
            y={GOAL_TIMEFRAME_RING_STROKE_WIDTH / 2}
            width={ringPathWidth}
            height={ringPathHeight}
            rx={ringCornerRadius}
            ry={ringCornerRadius}
            fill="transparent"
            stroke={GOAL_TIMEFRAME_RING_COLOR}
            strokeWidth={GOAL_TIMEFRAME_RING_STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${ringPerimeter} ${ringPerimeter}`}
            strokeDashoffset={ringStrokeOffset}
            opacity={ringOpacity}
          />
        </Svg>
      )}
      <Ionicons name="calendar" size={17} color={accentColor} />
      <Text style={styles.todoComposerChipText}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={14} color={accentColor} />
    </TouchableOpacity>
  );
});
GoalTimeframeChip.displayName = 'GoalTimeframeChip';

const TodoComposerDatePicker = React.memo(({
  visible,
  value,
  accentColor,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: Date;
  accentColor: string;
  onChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  onClose: () => void;
}) => {
  if (!visible) {
    return null;
  }

  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        onChange={onChange}
      />
    );
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.goalQuotaDateModalOverlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
        <LinearGradient
          colors={['#113D36', '#001814']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.goalQuotaDateModalCard}
        >
          <View style={styles.goalQuotaDateModalHeader}>
            <Text style={styles.goalQuotaDateModalTitle}>Pick a date</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.goalQuotaDateModalCloseButton}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close date picker"
            >
              <Ionicons name="close" size={20} color="#E8FFFA" />
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={value}
            mode="date"
            display="inline"
            onChange={onChange}
            accentColor={accentColor}
            textColor={TODO_COMPOSER_TEXT_COLOR}
            themeVariant="dark"
            style={styles.goalQuotaDatePicker}
          />
        </LinearGradient>
      </View>
    </Modal>
  );
});
TodoComposerDatePicker.displayName = 'TodoComposerDatePicker';

const TodoComposer = React.memo(({
  initialTodo,
  hideDateChip = false,
  isLeftHanded,
  weekStartsOn,
  onSave,
}: {
  initialTodo: Partial<TodoItem>;
  /** Opened from the Today section: the task is for today, so there is no date to pick. */
  hideDateChip?: boolean;
  isLeftHanded: boolean;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onSave: (draft: Partial<TodoItem>) => Promise<void>;
}) => {
  const [draft, setDraft] = useState<Partial<TodoItem>>(initialTodo);
  const [inputText, setInputText] = useState(initialTodo.text || '');
  const textRef = useRef(initialTodo.text || '');
  const [committedText, setCommittedText] = useState(initialTodo.text || '');
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGoalTimeframePicker, setShowGoalTimeframePicker] = useState(false);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pendingTime, setPendingTime] = useState(() => initialTodo.dueDate || new Date());
  const initialWorkspace = initialTodo.workspace || 'Personal';
  const initialTodoType = initialWorkspace === 'Wishlist' ? 'basic' : (initialTodo.type || 'basic');
  const isGoalComposer = initialWorkspace === 'Goals';
  const canRepeatTodo = initialWorkspace === 'Personal' && initialTodoType === 'basic';
  const inputPlaceholder = initialWorkspace === 'Goals'
    ? 'Add new goal...'
    : initialWorkspace === 'Wishlist'
      ? 'Add new item...'
      : 'Add new task...';
  const composerAccentColor = TODO_COMPOSER_ACCENT_COLOR;

  const parsedTodoInput = useMemo(
    () => parseTodoInput(committedText, { fallbackDate: draft.dueDate }),
    [committedText, draft.dueDate]
  );
  const previewUsesParsedDueDate = parsedTodoInput.matchedDate || parsedTodoInput.matchedTime;
  const previewDueDate = previewUsesParsedDueDate ? parsedTodoInput.dueDate : draft.dueDate;
  const previewHasDueTime = previewUsesParsedDueDate
    ? parsedTodoInput.hasDueTime
    : getTodoHasDueTime(draft.dueDate, draft.hasDueTime);
  const previewGoalTimeframe = previewUsesParsedDueDate
    ? inferGoalTimeframeFromDueDate(parsedTodoInput.dueDate, weekStartsOn)
    : (draft.goalTimeframe || 'thisWeek');

  const formatDateChipLabel = (date?: Date) => {
    if (!date) return 'Today';
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d');
  };

  const formatTimeChipLabel = (date?: Date) => {
    if (!date) return '';
    return format(date, 'h:mm a');
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (!selectedDate) {
      return;
    }

    const newDate = new Date(selectedDate);
    setDraft((currentDraft) => {
      const nextDate = new Date(newDate);
      const hasDueTime = getTodoHasDueTime(currentDraft.dueDate, currentDraft.hasDueTime);

      if (hasDueTime && currentDraft.dueDate) {
        nextDate.setHours(
          currentDraft.dueDate.getHours(),
          currentDraft.dueDate.getMinutes(),
          0,
          0
        );
      } else {
        nextDate.setHours(0, 0, 0, 0);
      }

      return { ...currentDraft, dueDate: nextDate, hasDueTime };
    });
  };

  const handleGoalTimeframeSelect = (goalTimeframe: GoalTodoTimeframe) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      goalTimeframe,
      dueDate: getGoalDefaultDueDate(goalTimeframe, new Date(), weekStartsOn),
      hasDueTime: false,
    }));
  };

  const handleOpenTimePicker = () => {
    if (isGoalComposer) {
      return;
    }

    const parsedHasDueTime = !!parsedTodoInput.dueDate && parsedTodoInput.hasDueTime;
    const sourceDate = parsedHasDueTime ? parsedTodoInput.dueDate : draft.dueDate;
    const hasDueTime = parsedHasDueTime || getTodoHasDueTime(draft.dueDate, draft.hasDueTime);
    const nextTime = hasDueTime
      ? new Date(sourceDate || new Date())
      : getNextHalfHourTime(sourceDate);

    setPendingTime(nextTime);
    setShowTimePicker(true);
  };

  const handleTimeChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (_event.type === 'dismissed') {
      setShowTimePicker(false);
      return;
    }

    if (!selectedDate) {
      return;
    }

    setPendingTime(selectedDate);

    if (Platform.OS === 'android') {
      setDraft((currentDraft) => {
        const nextDate = currentDraft.dueDate ? new Date(currentDraft.dueDate) : startOfDay(new Date());
        nextDate.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
        return { ...currentDraft, dueDate: nextDate, hasDueTime: true };
      });
      setShowTimePicker(false);
    }
  };

  const handleClearTime = () => {
    const nextText = removeTodoInputTime(textRef.current);
    if (nextText !== textRef.current) {
      textRef.current = nextText;
      setInputText(nextText);
      setCommittedText(nextText);
    }

    setDraft((currentDraft) => {
      const nextDate = currentDraft.dueDate ? new Date(currentDraft.dueDate) : startOfDay(new Date());
      nextDate.setHours(0, 0, 0, 0);
      return { ...currentDraft, dueDate: nextDate, hasDueTime: false };
    });
    setShowTimePicker(false);
  };

  const handleConfirmTime = () => {
    setDraft((currentDraft) => {
      const nextDate = currentDraft.dueDate ? new Date(currentDraft.dueDate) : startOfDay(new Date());
      nextDate.setHours(pendingTime.getHours(), pendingTime.getMinutes(), 0, 0);
      return { ...currentDraft, dueDate: nextDate, hasDueTime: true };
    });
    setShowTimePicker(false);
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
    textRef.current = text;
    setCommittedText((currentCommittedText) => {
      if (!text) {
        return '';
      }

      if (/\s$/.test(text) || text.length < currentCommittedText.length) {
        return text;
      }

      return currentCommittedText;
    });
  };

  const handleTextBlur = () => {
    setCommittedText(textRef.current);
  };

  const handleSavePress = async () => {
    if (isSavingRef.current) {
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const hasTodoTitle = !!parseTodoInput(textRef.current, {
        now: new Date(),
        fallbackDate: draft.dueDate,
      }).cleanedText.trim();
      if (hasTodoTitle) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      await onSave({ ...draft, text: textRef.current });
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const composerActions = (
    <View style={[styles.todoComposerActions, isLeftHanded && styles.todoComposerActionsRight]}>
      <TouchableOpacity onPress={() => setShowDetails((current) => !current)}>
        <Ionicons name="list" size={21} color={composerAccentColor} />
      </TouchableOpacity>
      <View style={styles.todoComposerDateTimeGroup}>
        {isGoalComposer ? (
          <GoalTimeframeChip
            onPress={() => setShowGoalTimeframePicker(true)}
            label={getGoalTimeframeLabel(previewGoalTimeframe)}
            accentColor={composerAccentColor}
          />
        ) : hideDateChip ? null : (
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            style={styles.todoComposerChip}
          >
            <Ionicons name="calendar" size={17} color={composerAccentColor} />
            <Text style={styles.todoComposerChipText}>{formatDateChipLabel(previewDueDate)}</Text>
          </TouchableOpacity>
        )}
        {!isGoalComposer && previewHasDueTime && previewDueDate && (
          <View style={styles.todoComposerChip}>
            <Ionicons name="time" size={16} color={composerAccentColor} />
            <Text style={styles.todoComposerChipText}>{formatTimeChipLabel(previewDueDate)}</Text>
            <TouchableOpacity
              onPress={handleClearTime}
              style={styles.todoComposerChipCloseButton}
              hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
            >
              <Ionicons name="close" size={13} color="rgba(232, 255, 250, 0.72)" />
            </TouchableOpacity>
          </View>
        )}
        {canRepeatTodo && (
          <TouchableOpacity
            onPress={() => setShowRepeatPicker(true)}
            style={styles.todoComposerChip}
          >
            <Ionicons name="repeat" size={16} color={composerAccentColor} />
            <Text style={styles.todoComposerChipText}>
              {getTodoRecurrenceLabel(draft.recurrence)}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        onPress={() => setDraft((currentDraft) => ({ ...currentDraft, starred: !currentDraft.starred }))}
        style={styles.todoComposerStarButton}
      >
        <MaterialCommunityIcons
          name={draft.starred ? "hexagram" : "hexagram-outline"}
          size={20}
          color={composerAccentColor}
        />
      </TouchableOpacity>
    </View>
  );

  const saveButton = (
    <TouchableOpacity
      style={[
        styles.todoComposerSaveButton,
        isSaving && styles.todoComposerSaveButtonDisabled,
      ]}
      onPress={() => {
        void handleSavePress();
      }}
      disabled={isSaving}
    >
      <Text style={styles.todoComposerSaveButtonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <View className="p-4">
        <LinearGradient
          colors={['#9BE4D7', '#47A090']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.todoComposerInputContainer}
        >
          {!isGoalComposer && (
            <TouchableOpacity
              onPress={handleOpenTimePicker}
              style={styles.todoComposerClockButton}
              accessibilityRole="button"
              accessibilityLabel="Select due time"
            >
              <Ionicons
                name={previewHasDueTime ? "time" : "time-outline"}
                size={26}
                color="#287B6C"
              />
            </TouchableOpacity>
          )}
          <TextInput
            autoFocus={true}
            style={[
              styles.todoComposerInput,
              isGoalComposer && styles.todoComposerInputWithoutClock,
            ]}
            value={inputText}
            onChangeText={handleTextChange}
            onBlur={handleTextBlur}
            placeholder={inputPlaceholder}
            placeholderTextColor="rgba(8, 49, 43, 0.58)"
            selectionColor={composerAccentColor}
          />
        </LinearGradient>
        {showDetails && (
          <TextInput
            style={styles.todoComposerDetailsInput}
            value={draft.details}
            onChangeText={(details) => setDraft((currentDraft) => ({ ...currentDraft, details }))}
            placeholder="Add details..."
            placeholderTextColor="rgba(232, 255, 250, 0.52)"
            multiline
          />
        )}
        <View className="flex-row justify-between items-center">
          {isLeftHanded ? saveButton : composerActions}
          {isLeftHanded ? composerActions : saveButton}
        </View>
      </View>

      <TodoComposerDatePicker
        visible={showDatePicker}
        value={draft.dueDate || new Date()}
        accentColor={composerAccentColor}
        onChange={handleDateChange}
        onClose={() => setShowDatePicker(false)}
      />

      <GoalTimeframePicker
        visible={showGoalTimeframePicker}
        value={previewGoalTimeframe}
        onSelect={handleGoalTimeframeSelect}
        onClose={() => setShowGoalTimeframePicker(false)}
      />

      {canRepeatTodo && (
        <TodoRepeatPicker
          visible={showRepeatPicker}
          value={draft.recurrence}
          onChange={(recurrence) => setDraft((currentDraft) => ({ ...currentDraft, recurrence }))}
          onClose={() => setShowRepeatPicker(false)}
        />
      )}

      <TimeWheelDialog
        visible={showTimePicker}
        value={pendingTime}
        onChange={setPendingTime}
        onClose={handleConfirmTime}
      />
    </>
  );
});
TodoComposer.displayName = 'TodoComposer';

const enhanceWithTodosAndPreferences = withObservables([], () => ({
  todos: database.collections.get<TodoModel>('todos').query().observe(),
  preferences: database.collections.get<UserPreferenceModel>('user_preferences').query().observe(),
  goalGuidancePlans: database.collections.get<GoalGuidancePlanModel>('goal_guidance_plans').query().observe(),
  taskGuides: database.collections.get<TaskGuideModel>('task_guides').query().observe(),
  skillGuides: database.collections.get<SkillGuideModel>('skill_guides').query().observe(),
  recurrenceSeries: database.collections.get<TodoRecurrenceSeriesModel>('todo_recurrence_series').query().observe(),
}));

/** Completed items shown at first, and added per "Show more" tap. */
const COMPLETED_PAGE_SIZE = 20;

const TodoScreen = enhanceWithTodosAndPreferences((props: {
  todos?: TodoModel[],
  preferences?: UserPreferenceModel[],
  goalGuidancePlans?: GoalGuidancePlanModel[],
  taskGuides?: TaskGuideModel[],
  skillGuides?: SkillGuideModel[],
  recurrenceSeries?: TodoRecurrenceSeriesModel[],
} = {}) => {
  const {
    todos = [],
    preferences = [],
    goalGuidancePlans = [],
    taskGuides = [],
    skillGuides = [],
    recurrenceSeries = [],
  } = props;
  const { user } = useAuthSession();
  const isFocused = useIsFocused();
  useEffect(() => {
    if (isFocused) {
      setGuidanceActiveTab('todo');
    }
  }, [isFocused]);
  const { activeTarget, cancelGuidance, startGuidance } = useGuidance();
  const { isLeftHanded } = useLeftHandedMode();
  const [isTodoGuidanceTutorialPending, setIsTodoGuidanceTutorialPending] = useState(false);
  const isTodoGuidanceTutorialPendingRef = useRef(false);
  const [isGoalGuidanceTutorialPending, setIsGoalGuidanceTutorialPending] = useState(false);
  const isGoalGuidanceTutorialPendingRef = useRef(false);
  const [tutorialTodoId, setTutorialTodoId] = useState<string | null>(null);
  const tutorialTodoIdRef = useRef<string | null>(null);
  const [tutorialGoalTodoId, setTutorialGoalTodoId] = useState<string | null>(null);
  const tutorialGoalTodoIdRef = useRef<string | null>(null);
  const todoGuidanceTutorialStageRef = useRef<TodoGuidanceTutorialStage | null>(null);
  const goalGuidanceTutorialStageRef = useRef<GoalGuidanceTutorialStage | null>(null);
  const hasShownGoalTutorialQuestionIntroRef = useRef(false);
  const finishTodoGuidanceTutorialRef = useRef<(closeGuidance: boolean) => Promise<void>>(async () => {});
  const startGoalTutorialTargetRef = useRef<() => void>(() => {});
  /** Tutorial "back": puts the To Do screen back the way a step needs it, then shows it. */
  const restoreTodoTutorialStepRef = useRef<(step: TodoTutorialRestoreStep) => void>(() => {});
  const autoRequestedTaskGuidanceRef = useRef<string | null>(null);
  const autoRequestedGoalGuidanceRef = useRef<string | null>(null);
  const completeTodoGuidanceAction = useCallback((action: string) => {
    if (activeTarget?.type === 'screen' && activeTarget.params?.todoAction === action) {
      cancelGuidance();
    }
  }, [activeTarget, cancelGuidance]);
  const completeTodoGuidanceTutorial = useCallback(async (closeGuidance: boolean) => {
    const uid = user?.uid || '';
    if (!uid) {
      return;
    }

    await completeTutorialStep(uid, TUTORIAL_TODO_GUIDANCE_STEP).catch((error) => {
      console.warn('Failed to persist todo tutorial completion', error);
    });
    isTodoGuidanceTutorialPendingRef.current = false;
    setIsTodoGuidanceTutorialPending(false);
    todoGuidanceTutorialStageRef.current = null;
    if (closeGuidance) {
      cancelGuidance();
    }
  }, [cancelGuidance, user?.uid]);
  const showTodoGuidanceTutorialStage = useCallback((
    stage: TodoGuidanceTutorialStage,
    forwardStages: TodoGuidanceTutorialStage[] = []
  ) => {
    todoGuidanceTutorialStageRef.current = stage;
    // Steps that wait for the user (pick a video, Accept plan) keep their card until they act;
    // only the "video steps are ready" note moves on by itself.
    const hideCardAfterMs = stage === 'video-ready' ? getTutorialReadingTimeMs(TODO_TUTORIAL_VIDEO_READY_MESSAGE) : undefined;
    // These steps talk about the AI Guidance and Video Guidance buttons, which sit low in
    // the details: bring them into view above the tutorial card.
    if (stage === 'actions' || stage === 'video' || stage === 'choice') {
      const scrollToChoice = () => {
        detailsScrollRef.current?.scrollTo({ y: Math.max(0, guidancePathChoiceYRef.current - 12), animated: true });
      };
      scrollToChoice();
      setTimeout(scrollToChoice, 260);
      setTimeout(scrollToChoice, 700);
    }
    const todoAction =
      stage === 'actions'
        ? 'tutorial-actions'
        : stage === 'video'
          ? 'tutorial-video'
          : stage === 'choice'
            ? 'tutorial-choice'
            : stage === 'pick-video'
              ? 'tutorial-pick-video'
              : stage === 'video-ready'
                ? 'tutorial-video-ready'
                : 'tutorial-accept-plan';
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/todo',
        params: { todoAction },
      },
      stage === 'actions'
        ? 'AI Guidance'
        : stage === 'video'
          ? 'Video Guidance'
          : stage === 'choice'
            ? 'guidance options'
            : stage === 'pick-video'
              ? 'video list'
              : stage === 'video-ready'
                ? 'video steps'
                : 'Accept plan',
      {
        hideCardAfterMs,
        autoNextAfterMs: stage === 'video-ready' && hideCardAfterMs
          ? hideCardAfterMs + 2000
          : undefined,
        onBack: stage === 'actions'
          ? () => restoreTodoTutorialStepRef.current('demo-task')
          : stage === 'video'
          ? () => showTodoGuidanceTutorialStage('actions', [stage, ...forwardStages])
          : stage === 'choice'
            ? () => showTodoGuidanceTutorialStage('video', [stage, ...forwardStages])
            : stage === 'accept-plan' || stage === 'pick-video'
              ? () => restoreTodoTutorialStepRef.current('choice')
              : stage === 'video-ready'
                ? () => restoreTodoTutorialStepRef.current('pick-video')
                : undefined,
        // Back from the goal part lands on these, after the choice was already made.
        restore: stage === 'accept-plan' || stage === 'video-ready'
          ? () => restoreTodoTutorialStepRef.current(stage)
          : undefined,
        onSkipSegment: () => { void finishTodoGuidanceTutorialRef.current(false); },
        // Every stage can move on: a user who doesn't pick an option, or whose guidance
        // fails to load, must never be stuck on this part of the walkthrough.
        onNext: forwardStages.length > 0
          ? () => showTodoGuidanceTutorialStage(forwardStages[0], forwardStages.slice(1))
          : stage === 'actions'
            ? () => showTodoGuidanceTutorialStage('video')
            : stage === 'video'
              ? () => showTodoGuidanceTutorialStage('choice')
              : () => { void finishTodoGuidanceTutorialRef.current(false); },
        // "Choose AI Guidance or Video Guidance": without choosing, this moves on to Goals.
        nextLabel: stage === 'choice' && forwardStages.length === 0 ? 'skip' : undefined,
      }
    );
  }, [startGuidance]);

  useEffect(() => {
    // A hand-off from AI Chat's "skip" on the demo task: it never shows a card of its own.
    // Not tied to the To Do part still being pending, so a part already finished (or not yet
    // loaded on this screen) can't leave the hand-off stuck on screen.
    if (
      !isFocused ||
      activeTarget?.type !== 'screen' ||
      activeTarget.params?.todoAction !== 'tutorial-skip-personal'
    ) {
      return;
    }

    cancelGuidance();
    void finishTodoGuidanceTutorialRef.current(false);
  }, [activeTarget, cancelGuidance, isFocused]);

  useEffect(() => {
    let isActive = true;

    const refreshTutorial = async () => {
      const uid = user?.uid || '';
      if (!uid) {
        if (isActive) {
          isTodoGuidanceTutorialPendingRef.current = false;
          setIsTodoGuidanceTutorialPending(false);
          isGoalGuidanceTutorialPendingRef.current = false;
          setIsGoalGuidanceTutorialPending(false);
          tutorialTodoIdRef.current = null;
          setTutorialTodoId(null);
          tutorialGoalTodoIdRef.current = null;
          setTutorialGoalTodoId(null);
          todoGuidanceTutorialStageRef.current = null;
          goalGuidanceTutorialStageRef.current = null;
        }
        return;
      }

      const progress = await getTutorialProgress(uid).catch(() => null);
      const isActiveTutorialSession = isTutorialSessionActive(uid);
      const pending = isActiveTutorialSession &&
        !!progress?.hasStarted &&
        !progress.completedSteps.includes(TUTORIAL_TODO_GUIDANCE_STEP);
      const goalPending = isActiveTutorialSession &&
        !!progress?.hasStarted &&
        progress.completedSteps.includes(TUTORIAL_TODO_GUIDANCE_STEP) &&
        !progress.completedSteps.includes(TUTORIAL_GOAL_GUIDANCE_STEP);
      if (isActive) {
        isTodoGuidanceTutorialPendingRef.current = pending;
        setIsTodoGuidanceTutorialPending(pending);
        isGoalGuidanceTutorialPendingRef.current = goalPending;
        setIsGoalGuidanceTutorialPending(goalPending);
        tutorialTodoIdRef.current = progress?.todoDemoTodoId || null;
        setTutorialTodoId(progress?.todoDemoTodoId || null);
        tutorialGoalTodoIdRef.current = progress?.goalDemoTodoId || null;
        setTutorialGoalTodoId(progress?.goalDemoTodoId || null);
        if (!pending) {
          todoGuidanceTutorialStageRef.current = null;
        }
        if (!goalPending) {
          goalGuidanceTutorialStageRef.current = null;
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
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const floatingTabBarInset = getFloatingTabBarInset(insets.bottom);
  const aiInputBottom = floatingTabBarInset - 6;
  const aiInputSpacer = floatingTabBarInset + 74;
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const detailsScrollRef = useRef<ScrollView>(null);
  /** Where the "Guidance path" card (AI Guidance / Video Guidance) sits in the details. */
  const guidancePathChoiceYRef = useRef(0);
  const goalGuidanceSectionYRef = useRef(0);
  const recipeGuidanceSectionYRef = useRef(0);
  const skillGuidanceSectionYRef = useRef(0);
  const taskGuidanceSectionYRef = useRef(0);
  const taskAcceptPlanButtonYRef = useRef(0);
  const goalAcceptPlanButtonYRef = useRef(0);
  const useMonthlyGoalGuidanceRef = useRef<(() => Promise<void>) | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isAiInputFocused, setIsAiInputFocused] = useState(false);
  const [isAiKeyboardSessionActive, setIsAiKeyboardSessionActive] = useState(false);
  const isAiComposerActive = isAiInputFocused || isAiKeyboardSessionActive;
  const isKeyboardInteractionActive = isKeyboardVisible || isAiInputFocused || isAiKeyboardSessionActive;
  const aiInputKeyboardBottom = Platform.OS === 'android' && isAiComposerActive ? ANDROID_TODO_KEYBOARD_GAP : aiInputBottom;
  const aiInputKeyboardTranslateY = isAiComposerActive
    ? keyboardOffset.interpolate({
        inputRange: [0, 1000],
        outputRange: [0, -1000],
        extrapolate: 'clamp',
      })
    : 0;
  const todoSwipeBandHeight = floatingTabBarInset + 180;
  const todoDetailsSwipeBandHeight = floatingTabBarInset + TODO_AI_BAR_HEIGHT;

  const [currentWorkspace, setCurrentWorkspace] = useState(0);
  const currentWorkspaceRef = useRef(0);
  const pendingTodoFocusRef = useRef<{ todoId: string; attempts: number } | null>(null);
  const pendingTodoFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTodoRevealRef = useRef<PendingTodoReveal | null>(null);
  const pendingTodoRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceScrollRefs = useRef<Record<string, { current: any }>>({});
  const todoRowRefs = useRef<Record<string, View | null>>({});
  const attemptPendingTodoRevealRef = useRef<(() => void) | null>(null);
  const queuedGuidanceTodoIdRef = useRef<string | null>(null);
  const [activeRevealTodoId, setActiveRevealTodoId] = useState<string | null>(null);
  const [todoRevealLayouts, setTodoRevealLayouts] = useState<Record<string, { width: number; height: number }>>({});
  const todoRevealGlowAnim = useRef(new Animated.Value(0)).current;
  const todoRevealGlowAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const todoRevealGlowStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    currentWorkspaceRef.current = currentWorkspace;
  }, [currentWorkspace]);
  const [isOptionsMenuVisible, setIsOptionsMenuVisible] = useState(false);
  const [workspaceTodoTypes, setWorkspaceTodoTypes] = useState<Record<string, 'basic' | 'progress' | 'slider'>>({});
  const [selectedTodoType, setSelectedTodoType] = useState<'basic' | 'progress' | 'slider'>('basic');
  const workspaceNameAnim = useRef(new Animated.Value(0)).current;
  const dotPositionAnim = useRef(new Animated.Value(0)).current;
  const [fadeAnim] = useState(new Animated.Value(1));
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [composerInitialTodo, setComposerInitialTodo] = useState<Partial<TodoItem>>({ hasDueTime: false });
  const [isComposerForToday, setIsComposerForToday] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const [localTodos, setLocalTodos] = useState<TodoItem[]>([]);
  const localTodosRef = useRef<TodoItem[]>([]);
  const todoSectionOrderOverridesRef = useRef<Record<string, string[]>>({});
  const classificationRetryTodoIdsRef = useRef<Set<string>>(new Set());
  const [classifyingTodoIds, setClassifyingTodoIds] = useState<Record<string, boolean>>({});
  const [recipeProgressOverridesByTodoId, setRecipeProgressOverridesByTodoId] = useState<Record<string, RecipeProgress>>({});
  const [skillProgressOverridesByTodoId, setSkillProgressOverridesByTodoId] = useState<Record<string, SkillProgress>>({});
  const [taskProgressOverridesByTodoId, setTaskProgressOverridesByTodoId] = useState<Record<string, TaskProgress>>({});
  const [isSchedulingGoalQuotaAction, setIsSchedulingGoalQuotaAction] = useState(false);
  const [isGoalQuotaDatePickerVisible, setIsGoalQuotaDatePickerVisible] = useState(false);
  const weekStartsOn = getWeekStartsOnFromLocale();
  const recurrenceSeriesById = useMemo(
    () => new Map(recurrenceSeries.map((series) => [series.id, series])),
    [recurrenceSeries]
  );

  const goalActionMetadataByTodoId = useMemo(() => {
    const goalTitlesById = new Map(
      localTodos
        .filter((todo) => todo.workspace === 'Goals')
        .map((todo) => [todo.id, todo.text])
    );
    const metadata = new Map<string, { goalTitle: string; youtubeQuery?: string }>();
    const firstLevelGoalTitleByTodoId = new Map<string, string>();

    goalGuidancePlans.forEach((plan) => {
      const goalTitle = goalTitlesById.get(plan.goalId);
      if (!goalTitle) {
        return;
      }

      getGoalGuidanceTodoIds(plan).forEach((todoId) => {
        firstLevelGoalTitleByTodoId.set(todoId, goalTitle);
        metadata.set(todoId, { goalTitle });
      });

      const steps = getGoalGuidanceSteps(plan);
      getGoalGuidanceActiveActionLinks(plan).forEach((link) => {
        const youtubeQuery = getGoalGuidanceYoutubeSearchQuery(steps[link.stepIndex]);
        metadata.set(link.todoId, {
          goalTitle,
          ...(youtubeQuery ? { youtubeQuery } : {}),
        });
      });
    });

    goalGuidancePlans.forEach((plan) => {
      const goalTitle = firstLevelGoalTitleByTodoId.get(plan.goalId);
      if (!goalTitle) {
        return;
      }

      getGoalGuidanceTodoIds(plan).forEach((todoId) => {
        metadata.set(todoId, { goalTitle });
      });

      const steps = getGoalGuidanceSteps(plan);
      getGoalGuidanceActiveActionLinks(plan).forEach((link) => {
        const youtubeQuery = getGoalGuidanceYoutubeSearchQuery(steps[link.stepIndex]);
        metadata.set(link.todoId, {
          goalTitle,
          ...(youtubeQuery ? { youtubeQuery } : {}),
        });
      });
    });

    return metadata;
  }, [goalGuidancePlans, localTodos]);

  const rootGoalIds = useMemo(() => new Set(
    localTodos
      .filter((todo) => todo.workspace === 'Goals')
      .map((todo) => todo.id)
  ), [localTodos]);

  const goalManagedTodoIds = useMemo(
    () => collectGoalGuidanceManagedTodoIds(goalGuidancePlans, rootGoalIds),
    [goalGuidancePlans, rootGoalIds]
  );

  const observedGoalGuidancePlans = useMemo(
    () => goalGuidancePlans.map((plan) => toGoalGuidancePlan(plan)),
    [goalGuidancePlans]
  );

  const observedGoalGuidancePlanByGoalId = useMemo(() => {
    const plansByGoalId = new Map<string, GoalGuidancePlan>();

    observedGoalGuidancePlans.forEach((plan) => {
      const existing = plansByGoalId.get(plan.goalId);
      if (!existing || existing.createdAt.getTime() <= plan.createdAt.getTime()) {
        plansByGoalId.set(plan.goalId, plan);
      }
    });

    return plansByGoalId;
  }, [observedGoalGuidancePlans]);

  const observedGoalGuidanceParentPlanByActionTodoId = useMemo(() => {
    const plansByTodoId = new Map<string, GoalGuidancePlan>();

    observedGoalGuidancePlans.forEach((plan) => {
      plan.actionTodoIds.forEach((todoId) => {
        const existing = plansByTodoId.get(todoId);
        if (!existing || existing.createdAt.getTime() <= plan.createdAt.getTime()) {
          plansByTodoId.set(todoId, plan);
        }
      });
    });

    return plansByTodoId;
  }, [observedGoalGuidancePlans]);

  const goalChildPlanProgressByTodoId = useMemo(() => {
    const firstLevelActionTodoIds = new Set<string>();

    goalGuidancePlans.forEach((plan) => {
      if (rootGoalIds.has(plan.goalId)) {
        getGoalGuidanceTodoIds(plan).forEach((todoId) => firstLevelActionTodoIds.add(todoId));
      }
    });

    const progress = new Map<string, { completed: number; total: number; active: number; status: GoalGuidancePlan['status'] }>();
    goalGuidancePlans.forEach((plan) => {
      if (!firstLevelActionTodoIds.has(plan.goalId)) {
        return;
      }

      const steps = getGoalGuidanceSteps(plan);
      if (!steps.length) {
        return;
      }

      const completed = plan.status === 'complete'
        ? steps.length
        : getGoalGuidanceCompletedStepIndexes(plan).length;
      progress.set(plan.goalId, {
        completed: Math.min(completed, steps.length),
        total: steps.length,
        active: getGoalGuidanceActiveActionLinks(plan).length,
        status: plan.status,
      });
    });

    return progress;
  }, [goalGuidancePlans, rootGoalIds]);

  const goalSubtaskTodoIds = useMemo(() => {
    const firstLevelGoalActionTodoIds = new Set<string>();

    goalGuidancePlans.forEach((plan) => {
      if (rootGoalIds.has(plan.goalId)) {
        getGoalGuidanceTodoIds(plan).forEach((todoId) => firstLevelGoalActionTodoIds.add(todoId));
      }
    });

    const subtaskTodoIds = new Set(goalManagedTodoIds);
    firstLevelGoalActionTodoIds.forEach((todoId) => subtaskTodoIds.delete(todoId));
    return subtaskTodoIds;
  }, [goalGuidancePlans, goalManagedTodoIds, rootGoalIds]);

  const goalOverallProgressByTodoId = useMemo(() => {
    const progress = new Map<string, { completed: number; total: number; active: number; status: GoalGuidancePlan['status']; ratio: number }>();
    const goalTodoById = new Map(localTodos.filter((todo) => todo.workspace === 'Goals').map((todo) => [todo.id, todo]));

    goalGuidancePlans.forEach((plan) => {
      if (!rootGoalIds.has(plan.goalId)) {
        return;
      }

      const goalBehavior = parseGoalBehavior(goalTodoById.get(plan.goalId)?.goalBehaviorJson);
      if (isQuotaGoalBehavior(goalBehavior)) {
        const completed = Math.min(goalBehavior.completedCount, goalBehavior.targetCount);
        const status = completed >= goalBehavior.targetCount ? 'complete' : plan.status;
        progress.set(plan.goalId, {
          completed,
          total: goalBehavior.targetCount,
          active: getGoalGuidanceActiveActionLinks(plan).length,
          status,
          ratio: goalBehavior.targetCount ? completed / goalBehavior.targetCount : 0,
        });
        return;
      }

      const steps = getGoalGuidanceSteps(plan);
      if (!steps.length) {
        return;
      }

      const completedStepIndexes = new Set(
        plan.status === 'complete'
          ? steps.map((_, index) => index)
          : getGoalGuidanceCompletedStepIndexes(plan)
      );
      let progressUnits = Math.min(completedStepIndexes.size, steps.length);
      const activeLinks = getGoalGuidanceActiveActionLinks(plan);
      const creditedStepIndexes = new Set<number>();
      activeLinks.forEach((link) => {
        if (completedStepIndexes.has(link.stepIndex) || creditedStepIndexes.has(link.stepIndex)) {
          return;
        }

        const childProgress = goalChildPlanProgressByTodoId.get(link.todoId);
        if (childProgress) {
          progressUnits += childProgress.completed / Math.max(childProgress.total, 1);
          creditedStepIndexes.add(link.stepIndex);
        }
      });

      progress.set(plan.goalId, {
        completed: Math.min(completedStepIndexes.size, steps.length),
        total: steps.length,
        active: activeLinks.length,
        status: plan.status,
        ratio: Math.min(progressUnits / steps.length, 1),
      });
    });

    return progress;
  }, [goalChildPlanProgressByTodoId, goalGuidancePlans, localTodos, rootGoalIds]);

  const recipeProgressByTodoId = useMemo(() => {
    const progress = new Map<string, RecipeProgress>();

    Object.entries(recipeProgressOverridesByTodoId).forEach(([todoId, override]) => {
      progress.set(todoId, override);
    });

    return progress;
  }, [recipeProgressOverridesByTodoId]);

  const skillProgressByTodoId = useMemo(() => {
    const progress = new Map<string, SkillProgress>();

    skillGuides.forEach((guide) => {
      if (guide.status !== 'ready') {
        return;
      }

      const guideProgress = getSkillProgressFromSteps(getSkillGuideSteps(guide));
      if (guideProgress) {
        progress.set(guide.todoId, guideProgress);
      }
    });

    Object.entries(skillProgressOverridesByTodoId).forEach(([todoId, override]) => {
      progress.set(todoId, override);
    });

    return progress;
  }, [skillGuides, skillProgressOverridesByTodoId]);

  const taskProgressByTodoId = useMemo(() => {
    const progress = new Map<string, TaskProgress>();

    taskGuides.forEach((guide) => {
      if (guide.status !== 'preview' && guide.status !== 'accepted' && guide.status !== 'complete') {
        return;
      }

      const guideProgress = getTaskProgressFromSteps(getTaskGuideSteps(guide), guide.status);
      if (guideProgress) {
        progress.set(guide.todoId, guideProgress);
      }
    });

    Object.entries(taskProgressOverridesByTodoId).forEach(([todoId, override]) => {
      progress.set(todoId, override);
    });

    return progress;
  }, [taskGuides, taskProgressOverridesByTodoId]);

  useEffect(() => {
    if (!Object.keys(taskProgressOverridesByTodoId).length) {
      return;
    }

    const observedProgressByTodoId = new Map<string, TaskProgress>();
    taskGuides.forEach((guide) => {
      if (guide.status !== 'preview' && guide.status !== 'accepted' && guide.status !== 'complete') {
        return;
      }

      const guideProgress = getTaskProgressFromSteps(getTaskGuideSteps(guide), guide.status);
      if (guideProgress) {
        observedProgressByTodoId.set(guide.todoId, guideProgress);
      }
    });

    setTaskProgressOverridesByTodoId((current) => {
      const next = { ...current };
      let changed = false;

      Object.keys(next).forEach((todoId) => {
        const observedProgress = observedProgressByTodoId.get(todoId);
        const overrideProgress = next[todoId];
        if (
          observedProgress &&
          observedProgress.completed === overrideProgress.completed &&
          observedProgress.total === overrideProgress.total &&
          observedProgress.status === overrideProgress.status
        ) {
          delete next[todoId];
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [taskGuides, taskProgressOverridesByTodoId]);

  const refreshLocalTodos = useCallback(async () => {
    // Refreshes overlap (effects, focus, toggles); only the newest one may replace the list.
    const refreshSeq = ++refreshLocalTodosSeqRef.current;
    await syncRecurringTodos();
    const fresh = await database.collections.get<TodoModel>('todos').query().fetch();
    const freshRecurrenceSeries = await database.collections.get<TodoRecurrenceSeriesModel>('todo_recurrence_series').query().fetch();
    const freshRecurrenceSeriesById = new Map(freshRecurrenceSeries.map((series) => [series.id, series]));
    const normalized = await normalizeTodoOrdering(fresh);
    const rows = normalized
      ? await database.collections.get<TodoModel>('todos').query().fetch()
      : fresh;
    if (refreshSeq !== refreshLocalTodosSeqRef.current) return;
    const items = rows.map((row) => {
      const item = toTodoItem(row, freshRecurrenceSeriesById);
      const pendingCompleted = pendingCompletionByTodoIdRef.current.get(item.id);
      return pendingCompleted === undefined ? item : { ...item, completed: pendingCompleted };
    });
    setLocalTodos(items);
    localTodosRef.current = items;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRecipeProgress = async () => {
      try {
        const guides = await database.collections.get<RecipeGuideModel>('recipe_guides').query().fetch();
        if (cancelled) {
          return;
        }

        const nextProgress = guides.reduce<Record<string, RecipeProgress>>((progress, guide) => {
          if (guide.status !== 'ready') {
            return progress;
          }

          const guideProgress = getRecipeProgressFromSteps(getRecipeGuideSteps(guide));
          if (guideProgress) {
            progress[guide.todoId] = guideProgress;
          }

          return progress;
        }, {});

        setRecipeProgressOverridesByTodoId(nextProgress);
      } catch (error) {
        console.error('Error loading recipe progress:', error);
      }
    };

    void loadRecipeProgress();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSkillProgress = async () => {
      try {
        const guides = await database.collections.get<SkillGuideModel>('skill_guides').query().fetch();
        if (cancelled) {
          return;
        }

        const nextProgress = guides.reduce<Record<string, SkillProgress>>((progress, guide) => {
          if (guide.status !== 'ready') {
            return progress;
          }

          const guideProgress = getSkillProgressFromSteps(getSkillGuideSteps(guide));
          if (guideProgress) {
            progress[guide.todoId] = guideProgress;
          }

          return progress;
        }, {});

        setSkillProgressOverridesByTodoId(nextProgress);
      } catch (error) {
        console.error('Error loading skill progress:', error);
      }
    };

    void loadSkillProgress();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadTaskProgress = async () => {
      try {
        const guides = await database.collections.get<TaskGuideModel>('task_guides').query().fetch();
        if (cancelled) {
          return;
        }

        const nextProgress = guides.reduce<Record<string, TaskProgress>>((progress, guide) => {
          if (guide.status !== 'preview' && guide.status !== 'accepted' && guide.status !== 'complete') {
            return progress;
          }

          const guideProgress = getTaskProgressFromSteps(getTaskGuideSteps(guide), guide.status);
          if (guideProgress) {
            progress[guide.todoId] = guideProgress;
          }

          return progress;
        }, {});

        setTaskProgressOverridesByTodoId(nextProgress);
      } catch (error) {
        console.error('Error loading task progress:', error);
      }
    };

    void loadTaskProgress();
    return () => {
      cancelled = true;
    };
  }, []);

  const { scrollToEnd, workspaceKey, workspaceNonce, todoAction, todoActionNonce } = useLocalSearchParams<{
    scrollToEnd?: string;
    workspaceKey?: string;
    workspaceNonce?: string;
    todoAction?: string;
    todoActionNonce?: string;
  }>();
  const handledTodoActionRef = useRef('');
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const swipeAnimValue = useRef(new Animated.Value(0)).current;

  const [isProcessing, setIsProcessing] = useState(false);

  // Lightweight speech overlay (testing): shows interim and final recognized text
  const [speechOverlayText, setSpeechOverlayText] = useState('');
  const [showSpeechOverlay, setShowSpeechOverlay] = useState(false);

  const [isTextInputModalVisible, setIsTextInputModalVisible] = useState(false)

  const [refreshing, setRefreshing] = useState(false);
  const [buyingTodoId, setBuyingTodoId] = useState<string | null>(null);

  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [addToCartSuccess, setAddToCartSuccess] = useState(false);
  const isCreatingTodoRef = useRef(false);
  const resetDetailsModalStateRef = useRef<(shouldFlushPendingDetails?: boolean) => void>(() => {});

  const [selectedTodoForDetails, setSelectedTodoForDetails] = useState<TodoItem | null>(null);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const detailsModalAnim = useRef(new Animated.Value(0)).current;
  const detailsInputRevealAnim = useRef(new Animated.Value(0)).current;
  const [isDetailsInputExpanded, setIsDetailsInputExpanded] = useState(false);
  const [editedTodoTitle, setEditedTodoTitle] = useState('');
  const [editedTodoDetails, setEditedTodoDetails] = useState('');
  const [detailsBackStack, setDetailsBackStack] = useState<TodoItem[]>([]);
  const [goalGuidancePlan, setGoalGuidancePlan] = useState<GoalGuidancePlan | null>(null);
  const [goalGuidanceParentPlan, setGoalGuidanceParentPlan] = useState<GoalGuidancePlan | null>(null);
  const [goalGuidanceAlternative, setGoalGuidanceAlternative] = useState<{
    timeframe?: GoalGuidanceTimeframe | GoalTodoTimeframe;
  } | null>(null);
  const [pendingGoalGuidanceTitle, setPendingGoalGuidanceTitle] = useState<string | null>(null);
  const [goalGuidanceSuccessNotice, setGoalGuidanceSuccessNotice] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [detailsReminderNotice, setDetailsReminderNotice] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [isGoalGuidanceAiActive, setIsGoalGuidanceAiActive] = useState(false);
  const [isGoalGuidanceHistoryExpanded, setIsGoalGuidanceHistoryExpanded] = useState(false);
  const goalGuidanceLoadVersionRef = useRef(0);
  const pendingGoalGuidanceStepUncheckRef = useRef<{ planId: string; goalId: string } | null>(null);
  const [recipeGuide, setRecipeGuide] = useState<RecipeGuide | null>(null);
  const [recipeAnswersDraft, setRecipeAnswersDraft] = useState<RecipeAnswers>(() => createDefaultRecipeAnswers());
  const [isRecipeGuidanceAiActive, setIsRecipeGuidanceAiActive] = useState(false);
  const [isRecipeChatHistoryExpanded, setIsRecipeChatHistoryExpanded] = useState(false);
  const [isRecipeWorking, setIsRecipeWorking] = useState(false);
  const recipeGuideRef = useRef<RecipeGuide | null>(null);
  const recipeVideoSearchQueryRef = useRef('');
  const recipeSeenVideoIdsRef = useRef<Set<string>>(new Set());
  const checkedRecipeIngredientKeysRef = useRef<Record<string, boolean>>({});
  const pendingRecipeIngredientSaveRef = useRef<{ todoId: string; ingredients: RecipeIngredient[] } | null>(null);
  const isSavingRecipeIngredientChecksRef = useRef(false);
  const [skillGuide, setSkillGuide] = useState<SkillGuide | null>(null);
  const [isSkillGuidanceAiActive, setIsSkillGuidanceAiActive] = useState(false);
  const [isSkillChatHistoryExpanded, setIsSkillChatHistoryExpanded] = useState(false);
  const [isSkillWorking, setIsSkillWorking] = useState(false);
  const skillVideoSearchQueryRef = useRef('');
  const skillSeenVideoIdsRef = useRef<Set<string>>(new Set());
  const [pendingGuideScrollTarget, setPendingGuideScrollTarget] = useState<'recipe' | 'skill' | null>(null);
  const [detailsOpenVersion, setDetailsOpenVersion] = useState(0);
  const [taskGuide, setTaskGuide] = useState<TaskGuide | null>(null);
  const [loadedSkillGuideTodoId, setLoadedSkillGuideTodoId] = useState<string | null>(null);
  const [loadedTaskGuideTodoId, setLoadedTaskGuideTodoId] = useState<string | null>(null);
  const [isTaskGuidanceAiActive, setIsTaskGuidanceAiActive] = useState(false);
  const [isTaskGuidanceHistoryExpanded, setIsTaskGuidanceHistoryExpanded] = useState(false);
  const [checkedRecipeIngredientKeys, setCheckedRecipeIngredientKeys] = useState<Record<string, boolean>>({});
  const [isRecipeWishlistModalVisible, setIsRecipeWishlistModalVisible] = useState(false);
  const [recipeWishlistSelection, setRecipeWishlistSelection] = useState<Record<string, boolean>>({});
  const [isAddingRecipeWishlistItems, setIsAddingRecipeWishlistItems] = useState(false);
  const [goalWishlistSuggestionToast, setGoalWishlistSuggestionToast] = useState<GoalWishlistSuggestionToastState | null>(null);
  const [isAddingGoalWishlistSuggestions, setIsAddingGoalWishlistSuggestions] = useState(false);
  const shownGoalWishlistSuggestionTodoIdsRef = useRef(new Set<string>());
  const goalWishlistAutoOpenVersionRef = useRef(0);
  const goalWishlistAutoOpenCancelKeyRef = useRef(`${currentWorkspace}:${isFocused ? '1' : '0'}`);
  const pendingGoalWishlistAutoOpenTodoIdRef = useRef<string | null>(null);
  const [pendingOpenTodoId, setPendingOpenTodoId] = useState<string | null>(null);
  const [isCheckingWishlistPurchaseIntent, setIsCheckingWishlistPurchaseIntent] = useState(false);
  const isCheckingWishlistPurchaseIntentRef = useRef(false);
  const [isGuidancePathSwitching, setIsGuidancePathSwitching] = useState(false);
  const [lastDeletedGuidancePlanId, setLastDeletedGuidancePlanId] = useState<string | null>(null);
  const [isDetailsTimePickerVisible, setIsDetailsTimePickerVisible] = useState(false);
  const [isDetailsDatePickerVisible, setIsDetailsDatePickerVisible] = useState(false);
  const [pendingDetailsTime, setPendingDetailsTime] = useState(new Date());
  const pendingDetailsTimeRef = useRef(new Date());
  const [pendingGoalQuotaDate, setPendingGoalQuotaDate] = useState(() => startOfDay(new Date()));
  const [isReminderModalVisible, setIsReminderModalVisible] = useState(false);
  const [isDetailsRepeatPickerVisible, setIsDetailsRepeatPickerVisible] = useState(false);
  const recurringEditScopeRef = useRef<Record<string, RecurringTodoEditScope>>({});
  const [completingTodoId, setCompletingTodoId] = useState<string | null>(null);
  const [isRecreatingGoalGuidanceAction, setIsRecreatingGoalGuidanceAction] = useState(false);
  const [isGoalGuidanceActionTransitioning, setIsGoalGuidanceActionTransitioning] = useState(false);
  const [isTodoDragActive, setIsTodoDragActive] = useState(false);
  const togglingTodoIdsRef = useRef(new Set<string>());
  /** Completed value a tick has shown but not yet confirmed in the DB, so a refresh that read earlier cannot undo it. */
  const pendingCompletionByTodoIdRef = useRef(new Map<string, boolean>());
  const refreshLocalTodosSeqRef = useRef(0);
  const isTodoDetailsSwipeDisabled =
    isTodoGuidanceTutorialPending ||
    isTodoDragActive ||
    isKeyboardInteractionActive ||
    isBottomSheetVisible ||
    isOptionsMenuVisible ||
    isTextInputModalVisible ||
    isReminderModalVisible ||
    isDetailsRepeatPickerVisible ||
    isRecipeWishlistModalVisible ||
    !!goalWishlistSuggestionToast;
  const isTodoSwipeDisabled = isTodoDetailsSwipeDisabled || isDetailsModalVisible;
  useEffect(() => {
    const cancelKey = `${currentWorkspace}:${isFocused ? '1' : '0'}`;
    if (goalWishlistAutoOpenCancelKeyRef.current === cancelKey) {
      return;
    }

    goalWishlistAutoOpenCancelKeyRef.current = cancelKey;
    goalWishlistAutoOpenVersionRef.current += 1;
    setGoalWishlistSuggestionToast((current) => (
      current?.openDetailsOnResolve
        ? { ...current, openDetailsOnResolve: false }
        : current
    ));

    const pendingAutoOpenTodoId = pendingGoalWishlistAutoOpenTodoIdRef.current;
    if (!pendingAutoOpenTodoId) {
      return;
    }

    pendingGoalWishlistAutoOpenTodoIdRef.current = null;
    setPendingOpenTodoId((current) => current === pendingAutoOpenTodoId ? null : current);
    if (pendingTodoFocusRef.current?.todoId === pendingAutoOpenTodoId) {
      pendingTodoFocusRef.current = null;
      if (pendingTodoFocusTimeoutRef.current) {
        clearTimeout(pendingTodoFocusTimeoutRef.current);
        pendingTodoFocusTimeoutRef.current = null;
      }
    }
  }, [currentWorkspace, isFocused]);

  const showReminderPermissionAlert = useCallback(() => {
    Alert.alert(
      'Notifications are off',
      'Enable notifications in Settings to get todo reminders on this device.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            Linking.openSettings().catch((error) => {
              console.error('Error opening settings:', error);
            });
          },
        },
      ]
    );
  }, []);

  const openExactAlarmSettings = useCallback(() => {
    if (!shouldOfferExactAlarmSetup) {
      return;
    }

    Linking.sendIntent(EXACT_ALARM_SETTINGS_ACTION).catch((error) => {
      console.error('Error opening exact alarm settings:', error);
      Linking.openSettings().catch((settingsError) => {
        console.error('Error opening settings:', settingsError);
      });
    });
  }, []);

  const maybeShowExactAlarmPrompt = useCallback(async () => {
    if (!shouldOfferExactAlarmSetup) {
      return;
    }

    try {
      const hasShownPrompt = await AsyncStorage.getItem(EXACT_ALARM_PROMPT_KEY);
      if (hasShownPrompt === '1') {
        return;
      }

      await AsyncStorage.setItem(EXACT_ALARM_PROMPT_KEY, '1');
      Alert.alert(
        'Improve reminder accuracy',
        'On Android, reminders can arrive late while your phone is locked unless "Alarms & reminders" is allowed for this app.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: openExactAlarmSettings },
        ]
      );
    } catch (error) {
      console.error('Error handling exact alarm prompt:', error);
    }
  }, [openExactAlarmSettings]);

  const handleReminderResult = useCallback((status: string) => {
    if (status === 'permission_denied') {
      showReminderPermissionAlert();
      return;
    }

    if (status === 'scheduled') {
      void maybeShowExactAlarmPrompt();
    }
  }, [maybeShowExactAlarmPrompt, showReminderPermissionAlert]);


  const animationsRef = useRef({
    fadeAnims: {} as Record<string, Animated.Value>,
    translateXAnims: {} as Record<string, Animated.Value>,
    animationStates: {} as Record<string, any>
  });

  const buildWorkspacesFromPreferences = useCallback((): Workspace[] => {
    const base: Workspace[] = BUILTIN_WORKSPACE_ORDER.map(name => ({
      key: name,
      displayName: name,
      originalName: name,
      color: getTodoWorkspaceAppearance(name)?.themeColor || BUILTIN_DEFAULTS[name].color,
      todoType: BUILTIN_DEFAULTS[name].todoType,
      builtin: true,
      locked: name === 'Wishlist',
    }));
    const byKey = new Map<string, Workspace>(base.map(w => [w.key, w]));
    // Process legacy prefs first (no original_name), then modern (with original_name) to let modern override
    const legacyPrefs = preferences.filter(p => !(p as any).original_name);
    const modernPrefs = preferences.filter(p => !!(p as any).original_name);
    const orderedPrefs = [...legacyPrefs, ...modernPrefs];
    orderedPrefs.forEach(pref => {
      const rawKey = (pref.original_name as string) || (pref.workspace_name as string);
      const key = normalizeWorkspaceKey(rawKey);
      if (!isSupportedTodoWorkspaceKey(key)) return;
      const existing = byKey.get(key);
      if (!existing) return;
      const updated: Workspace = {
        ...existing,
        todoType: (pref.todo_type as 'basic' | 'progress' | 'slider') || existing?.todoType || 'basic',
      };
      byKey.set(key, updated);
    });
    const list = Array.from(byKey.values());
    return list.sort((a, b) => {
      const order = BUILTIN_WORKSPACE_ORDER as readonly string[];
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [preferences]);

  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => buildWorkspacesFromPreferences());
  const workspaceKeys = useMemo(() => workspaces.map((workspace) => workspace.key), [workspaces]);

  // Workspace color editing disabled.
  // const [isColorPickerVisible, setIsColorPickerVisible] = useState(false);
  // const [selectedWorkspaceIndex, setSelectedWorkspaceIndex] = useState(0);

  useEffect(() => {
    setWorkspaces(buildWorkspacesFromPreferences());
  }, [preferences, buildWorkspacesFromPreferences]);
  const workspaceColors = useMemo(() => workspaces.map(w => w.color), [workspaces]);

  // One-time normalization: fix todos whose workspace was saved using a display name or variant
  const didNormalizeRef = useRef(false);
  useEffect(() => {
    const normalize = async () => {
      if (didNormalizeRef.current || !workspaces.length) return;
      didNormalizeRef.current = true;
      try {
        const validKeys = new Set(workspaces.map(w => w.key));
        const nameToKey = new Map<string, string>();
        workspaces.forEach(w => {
          nameToKey.set(w.key.toLowerCase(), w.key);
          nameToKey.set(w.displayName.toLowerCase(), w.key);
          nameToKey.set((w.displayName + ' workspace').toLowerCase(), w.key);
          if (w.key === 'Goals') {
            nameToKey.set('work', 'Goals');
            nameToKey.set('work workspace', 'Goals');
          }
        });
        const preferencesCollection = database.collections.get<UserPreferenceModel>('user_preferences');
        const preferenceRows = await preferencesCollection.query().fetch();
        const canonicalPrefs = new Map<string, UserPreferenceModel>();
        preferenceRows.forEach((pref) => {
          const rawKey = String((pref as any).original_name || (pref as any).workspace_name || '');
          const key = normalizeWorkspaceKey(rawKey);
          if (isSupportedTodoWorkspaceKey(key) && !canonicalPrefs.has(key)) {
            canonicalPrefs.set(key, pref);
          }
        });

        await database.write(async () => {
          for (const pref of preferenceRows) {
            const rawKey = String((pref as any).original_name || (pref as any).workspace_name || '');
            const normalizedKey = normalizeWorkspaceKey(rawKey);
            const workspaceName = String(pref.workspace_name || '');
            const displayName = String((pref as any).display_name || '');
            const canonicalPref = canonicalPrefs.get(normalizedKey);
            const hasDuplicateBuiltin = rawKey === 'Work' && canonicalPref && canonicalPref.id !== pref.id;

            if (hasDuplicateBuiltin) {
              await pref.destroyPermanently();
              continue;
            }

            if (
              rawKey !== normalizedKey ||
              workspaceName === 'Work' ||
              displayName === 'Work'
            ) {
              await pref.update((record) => {
                if (record.workspace_name === 'Work') {
                  record.workspace_name = 'Goals';
                }
                // @ts-ignore
                if ((record as any).original_name === 'Work') {
                  // @ts-ignore
                  record.original_name = 'Goals';
                }
                // @ts-ignore
                if ((record as any).display_name === 'Work') {
                  // @ts-ignore
                  record.display_name = 'Goals';
                }
              });
            }
          }
        });

        const todosCol = database.collections.get<TodoModel>('todos');
        const rows = await todosCol.query().fetch();
        const toFix = rows.filter(t => !!t.workspace && !validKeys.has(String(t.workspace)));
        if (toFix.length) {
          await database.write(async () => {
            for (const row of toFix) {
              const norm = String(row.workspace).toLowerCase();
              const mapped = nameToKey.get(norm);
              if (mapped) { await row.update(r => { /* @ts-ignore */ r.workspace = mapped; }); }
            }
          });
        }
      } catch (e) { /* no-op */ }
    };
    normalize();
  }, [workspaces, database]);

  const glowAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const autoReplyMicNoticeRef = useRef<object | null>(null);

  const [showUndo, setShowUndo] = useState(false);
  const [lastDeletedTodo, setLastDeletedTodo] = useState<TodoSnapshot | null>(null);
  const undoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (preferences) {
      const newWorkspaceTodoTypes = preferences.reduce((acc, pref) => {
        if ((pref.workspace_name || pref.original_name) && pref.todo_type) {
          const key = normalizeWorkspaceKey(
            // @ts-ignore
            (pref.original_name as string) || (pref.workspace_name as string)
          );
          if (!isSupportedTodoWorkspaceKey(key)) {
            return acc;
          }
          acc[key] = pref.todo_type;
        }
        return acc;
      }, {} as Record<string, 'basic' | 'progress' | 'slider'>);
      setWorkspaceTodoTypes(newWorkspaceTodoTypes);

      const currentKey = workspaces[currentWorkspace]?.key;
      setSelectedTodoType((currentKey && newWorkspaceTodoTypes[currentKey]) || 'basic');
    }
  }, [preferences, currentWorkspace, workspaces]);

  useEffect(() => {
    localTodos.forEach(todo => {
      if (!animationsRef.current.fadeAnims[todo.id]) {
        animationsRef.current.fadeAnims[todo.id] = new Animated.Value(todo.completed ? 0.6 : 1);
        animationsRef.current.translateXAnims[todo.id] = new Animated.Value(todo.completed ? 20 : 0);
        animationsRef.current.animationStates[todo.id] = {
          isFaded: todo.completed,
          isTranslated: todo.completed
        };
      }
    });
  }, [localTodos]);

  const syncTodoAnimationState = useCallback((todoId: string, completed: boolean) => {
    if (!animationsRef.current.fadeAnims[todoId]) {
      animationsRef.current.fadeAnims[todoId] = new Animated.Value(completed ? 0.6 : 1);
      animationsRef.current.translateXAnims[todoId] = new Animated.Value(completed ? 20 : 0);
    } else {
      animationsRef.current.fadeAnims[todoId].setValue(completed ? 0.6 : 1);
      animationsRef.current.translateXAnims[todoId].setValue(completed ? 20 : 0);
    }

    animationsRef.current.animationStates[todoId] = {
      isFaded: completed,
      isTranslated: completed,
    };
  }, []);

  useEffect(() => {
    if (scrollToEnd === 'true' && pagerViewRef.current) {
      // Initial delay
      setTimeout(() => {
        // Start speaking and show swipe hint simultaneously
        setIsSpeaking(true);
        setShowSwipeHint(true);

        const animateSwipe = () => {
          swipeAnimValue.setValue(0);

          Animated.timing(swipeAnimValue, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }).start(() => {
            pagerViewRef.current?.setPage(workspaces.length - 2);

            setTimeout(() => {
              swipeAnimValue.setValue(0);
              Animated.timing(swipeAnimValue, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
                easing: Easing.inOut(Easing.ease),
              }).start(() => {
                pagerViewRef.current?.setPage(workspaces.length - 1);

                setTimeout(() => {
                  setShowSwipeHint(false);
                  setIsSpeaking(false);
                }, 500);
              });
            }, 500);
          });
        };

        animateSwipe();
      }, 1000);
    }
  }, []);

  // Navigate directly to a workspace when provided via route param
  useEffect(() => {
    try {
      if (typeof workspaceKey === 'string' && workspaceKey && workspaces.length) {
        const normalizedWorkspaceKey = normalizeWorkspaceKey(workspaceKey);
        const idx = workspaces.findIndex(w => (
          w.key === normalizedWorkspaceKey ||
          w.displayName === normalizedWorkspaceKey ||
          w.originalName === normalizedWorkspaceKey ||
          w.key === workspaceKey ||
          w.displayName === workspaceKey ||
          w.originalName === workspaceKey
        ));
        if (idx >= 0) {
          currentWorkspaceRef.current = idx;
          setCurrentWorkspace(idx);
          dotPositionAnim.setValue(idx);
          requestAnimationFrame(() => {
            const pager = pagerViewRef.current as (PagerView & {
              setPageWithoutAnimation?: (selectedPage: number) => void;
            }) | null;
            if (pager?.setPageWithoutAnimation) {
              pager.setPageWithoutAnimation(idx);
            } else {
              pager?.setPage(idx);
            }
          });
        }
      }
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceKey, workspaceNonce, workspaces.length]);

  useEffect(() => {
    if (!isFocused || !workspaceKeys.length) {
      return;
    }

    const pendingWorkspaceKey = peekPendingTodoSwipeWorkspaceKey();
    if (!pendingWorkspaceKey) {
      return;
    }

    const workspaceIndex = workspaceKeys.indexOf(pendingWorkspaceKey);
    if (workspaceIndex === -1) {
      clearPendingTodoSwipeWorkspaceKey();
      return;
    }

    requestAnimationFrame(() => {
      clearPendingTodoSwipeWorkspaceKey();
      goToWorkspaceIndex(workspaceIndex);
    });
  }, [goToWorkspaceIndex, isFocused, workspaceKeys]);

  useEffect(() => {
    setSharedTodoWorkspaceState({
      workspaceKeys,
      currentWorkspaceKey: workspaces[currentWorkspace]?.key,
    });
  }, [currentWorkspace, workspaceKeys, workspaces]);

  useEffect(() => {
    const unsubscribe = subscribeTodoWorkspaceSwipe((workspaceKey) => {
      if (!isFocused) {
        return;
      }

      clearPendingTodoSwipeWorkspaceKey();
      goToWorkspaceKey(workspaceKey);
    });

    return unsubscribe;
  }, [goToWorkspaceKey, isFocused]);


  useEffect(() => {
    refreshLocalTodos();
  }, [todos, refreshLocalTodos]);

  useFocusEffect(
    useCallback(() => {
      const refreshTodosAndGuidance = async () => {
        await refreshGoalGuidancePlansForToday();
        await refreshLocalTodos();
      };

      void refreshTodosAndGuidance();
    }, [refreshLocalTodos])
  );

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const scheduleNextDayRefresh = () => {
      const now = new Date();
      const nextLocalDay = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
      timeout = setTimeout(() => {
        void (async () => {
          await refreshGoalGuidancePlansForToday();
          await refreshLocalTodos();
          scheduleNextDayRefresh();
        })();
      }, nextLocalDay.getTime() - now.getTime() + 1000);
    };

    scheduleNextDayRefresh();
    return () => clearTimeout(timeout);
  }, [refreshLocalTodos]);

  useEffect(() => {
    localTodosRef.current = localTodos;
  }, [localTodos]);

  useEffect(() => {
    const checkOverdueStartedTodos = async () => {
      const today = startOfDay(new Date());
      const overdueIds = localTodos
        .filter(t =>
          t.type === 'progress' &&
          t.startedAt &&
          !t.completed &&
          t.dueDate &&
          isPast(endOfDay(t.dueDate))
        )
        .map(t => t.id);

      if (overdueIds.length > 0) {
        for (const id of overdueIds) {
          await updateTodo(id, { dueDate: today, hasDueTime: false }, { syncReminder: true });
        }
        await refreshLocalTodos();
      }
    };

    checkOverdueStartedTodos();
  }, [localTodos, refreshLocalTodos]);

  const UndoNotification = () => {
    useEffect(() => {
      Animated.spring(undoAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();

      return () => {
        Animated.timing(undoAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      };
    }, []);

    return (
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TouchableOpacity
          onPress={handleUndo}
          activeOpacity={0.8}
        >
          <Animated.View
            style={[{
              backgroundColor: '#333',
              borderRadius: 20,
              padding: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: {
                width: 0,
                height: 2,
              },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
              elevation: 5,
              width: 200,
              transform: [{
                translateY: undoAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-100, 30]
                })
              }]
            }]}
          >
            <Text style={{ color: 'white', fontSize: 13 }}>Item deleted</Text>
            <Text style={{ color: '#22AB93', fontWeight: 'bold', fontSize: 13 }}>UNDO</Text>
          </Animated.View>
        </TouchableOpacity>
      </View>
    );
  };

  const handleUndo = useCallback(async () => {
    if (lastDeletedTodo) {
      try {
        const result = await restoreTodo(lastDeletedTodo);
        handleReminderResult(result.reminderStatus);
        if (lastDeletedGuidancePlanId) {
          const relinkedPlan = await linkActiveGoalGuidanceTodo(lastDeletedGuidancePlanId, lastDeletedTodo.id);
          if (selectedTodoForDetails?.id === relinkedPlan.goalId) {
            setGoalGuidancePlan(relinkedPlan);
          }
        }

        await refreshLocalTodos();
        setShowUndo(false);
        setLastDeletedTodo(null);
        setLastDeletedGuidancePlanId(null);
        if (undoTimeout.current) {
          clearTimeout(undoTimeout.current);
        }
      } catch (error) {
        console.error('Error undoing delete:', error);
      }
    }
  }, [lastDeletedGuidancePlanId, lastDeletedTodo, refreshLocalTodos, handleReminderResult, selectedTodoForDetails?.id]);

  type RecurringTodoDeleteScope = 'one' | 'series' | 'completedHistory';

  const getRecurringDeleteScope = useCallback((todo?: TodoItem | null): Promise<RecurringTodoDeleteScope | null> => {
    if (!todo?.recurrenceSeriesId || !todo.recurrenceActive) {
      return Promise.resolve(todo?.completed && (todo.recurrenceCompletedCount || 0) > 1 ? 'completedHistory' : 'one');
    }

    const isCompletedHistory = todo.completed && (todo.recurrenceCompletedCount || 0) > 1;
    const repeatLabel = getTodoRecurrenceLabel(todo.recurrence).toLowerCase();
    return new Promise((resolve) => {
      Alert.alert(
        'Delete repeating task',
        isCompletedHistory
          ? `"${todo.text}" repeats ${repeatLabel}. Delete its completed history, or delete the task and stop it repeating?`
          // Deleting only this one brings the next repeat straight back, which reads as
          // "the task won't delete" unless it says so.
          : `"${todo.text}" repeats ${repeatLabel}. Delete just this one (the next repeat will still appear), or delete the task and stop it repeating?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          {
            text: isCompletedHistory ? 'Completed history' : 'Just this one',
            onPress: () => resolve(isCompletedHistory ? 'completedHistory' : 'one'),
          },
          {
            text: 'Stop repeating',
            style: 'destructive',
            onPress: () => resolve('series'),
          },
        ]
      );
    });
  }, []);

  const handleSwipeDelete = useCallback(async (todoId: string) => {
    try {
      const todoToDelete = localTodos.find((todo) => todo.id === todoId);
      const isGoalDelete = todoToDelete?.workspace === 'Goals';
      if (isGoalDelete) {
        await deleteGoalGuidanceForGoal(todoId);
      }
      const recurringDeleteScope = await getRecurringDeleteScope(todoToDelete);
      if (!recurringDeleteScope) {
        return;
      }
      const snapshot = todoToDelete?.recurrenceSeriesId
        ? recurringDeleteScope === 'series'
          ? (await deleteRecurringTodoSeries(todoId, { deleteCompletedHistory: !!todoToDelete.completed }))[0] || null
          : recurringDeleteScope === 'completedHistory'
            ? (await deleteRecurringTodoCompletedHistory(todoId))[0] || null
            : await deleteRecurringTodoOccurrence(todoId)
        : await deleteTodo(todoId);
      const affectedPlan = await markGoalGuidanceActionDeleted(todoId);
      if (affectedPlan) {
        setLastDeletedGuidancePlanId(affectedPlan.id);
        if (selectedTodoForDetails?.id === affectedPlan.goalId) {
          setGoalGuidancePlan(affectedPlan);
        }
      } else {
        setLastDeletedGuidancePlanId(null);
      }
      setLastDeletedTodo(isGoalDelete || recurringDeleteScope !== 'one' ? null : snapshot);

      await refreshLocalTodos();

      if (isGoalDelete || recurringDeleteScope === 'series') {
        setShowUndo(false);
        if (undoTimeout.current) {
          clearTimeout(undoTimeout.current);
        }
        return;
      }

      setShowUndo(true);

      // Clear any existing timeout
      if (undoTimeout.current) {
        clearTimeout(undoTimeout.current);
      }

      // Set new timeout
      undoTimeout.current = setTimeout(() => {
        setShowUndo(false);
        setLastDeletedTodo(null);
      }, 3000);

    } catch (error) {
      console.error('Error deleting todo:', error);
      Alert.alert("Couldn't delete the task", 'Please try again.');
    }
  }, [getRecurringDeleteScope, localTodos, refreshLocalTodos, selectedTodoForDetails?.id]);

  const handleBuyPress = async (todo: TodoItem) => {
    if (buyingTodoId === todo.id) {
      return;
    }

    setBuyingTodoId(todo.id);

    try {
      const countryCode = await readProfileCountryCode(user?.uid);
      const searchUrl = buildAmazonSearchUrl(todo.text, countryCode);
      if (!searchUrl) {
        Alert.alert('Error', 'Unable to search Amazon for this item.');
        return;
      }

      await openAmazonSearch(searchUrl);
    } finally {
      setBuyingTodoId((currentTodoId) => (currentTodoId === todo.id ? null : currentTodoId));
    }
  };

  // Workspace color editing and workspace creation are disabled.
  // const handleWorkspaceColorChange = (index: number) => {
  //   setSelectedWorkspaceIndex(index);
  //   setIsColorPickerVisible(true);
  // };

  // const MAX_WORKSPACES = 5;
  // const createWorkspace = async () => {
  //   if (workspaces.length >= MAX_WORKSPACES) {
  //     Alert.alert('Limit reached', `You can have at most ${MAX_WORKSPACES} workspaces.`);
  //     return;
  //   }
  //   const baseName = 'New workspace';
  //   const existingNames = new Set(workspaces.map(w => w.displayName));
  //   const existingKeys = new Set(workspaces.map(w => w.key));
  //   let name = baseName;
  //   let suffix = 1;
  //   while (existingNames.has(name)) name = `${baseName} ${suffix++}`;

  //   const uniqueKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  //   while (existingKeys.has(uniqueKey)) {
  //     name = `${baseName} ${suffix++}`;
  //   }

  //   const ws: Workspace = {
  //     key: uniqueKey,
  //     displayName: name,
  //     originalName: name,
  //     color: '#22AB93',
  //     todoType: 'basic',
  //     builtin: false,
  //     locked: false,
  //   };

  //   setWorkspaces(prev => [...prev, ws]);
  //   setCurrentWorkspace(workspaces.length);
  //   requestAnimationFrame(() => {
  //     pagerViewRef.current?.setPage(workspaces.length);
  //     animateWorkspaceChange(workspaces.length);
  //   });

  //   try {
  //     await database.write(async () => {
  //       const prefCollection = database.collections.get<UserPreferenceModel>('user_preferences');
  //       await prefCollection.create(pref => {
  //         // @ts-ignore
  //         pref.workspace_name = ws.displayName;
  //         // @ts-ignore
  //         pref.display_name = ws.displayName;
  //         // @ts-ignore
  //         pref.original_name = ws.key;
  //         // @ts-ignore
  //         pref.color = ws.color;
  //         // @ts-ignore
  //         pref.todo_type = ws.todoType;
  //       });
  //     });
  //   } catch (e) {
  //     console.error('Failed to create workspace', e);
  //   }
  // };

  // const deleteWorkspace = (index: number) => {
  //   const ws = workspaces[index];
  //   if (!ws || ws.builtin || ws.locked) return;

  //   Alert.alert(
  //     'Delete workspace',
  //     `Delete "${ws.displayName}"? Todos will be moved to Personal.`,
  //     [
  //       { text: 'Cancel', style: 'cancel' },
  //       {
  //         text: 'Delete',
  //         style: 'destructive',
  //         onPress: async () => {
  //           try {
  //             await database.write(async () => {
  //               const todosToMove = await database.collections
  //                 .get<TodoModel>('todos')
  //                 .query(Q.where('workspace', ws.key))
  //                 .fetch();
  //               for (const t of todosToMove) {
  //                 await t.update(todo => {
  //                   // @ts-ignore
  //                   todo.workspace = 'Personal';
  //                   // @ts-ignore
  //                   todo.type = 'basic';
  //                 });
  //               }
  //               const prefCollection = database.collections.get<UserPreferenceModel>('user_preferences');
  //               const existing = await prefCollection.query(Q.where('original_name', ws.key)).fetch();
  //               if (existing.length) {
  //                 await existing[0].destroyPermanently();
  //               }
  //             });
  //             const remainingCount = workspaces.length - 1;
  //             const maxIndex = Math.max(0, remainingCount - 1);
  //             const targetIndex = Math.min(index, maxIndex);

  //             setWorkspaces(prev => prev.filter((_, i) => i !== index));
  //             setCurrentWorkspace(targetIndex);
  //             requestAnimationFrame(() => {
  //               pagerViewRef.current?.setPage(targetIndex);
  //               animateWorkspaceChange(targetIndex);
  //             });
  //           } catch (e) {
  //             console.error('Failed to delete workspace', e);
  //             Alert.alert('Error', 'Failed to delete workspace.');
  //           }
  //         },
  //       },
  //     ]
  //   );
  // };

  // const [tempColor, setTempColor] = useState(workspaces[selectedWorkspaceIndex]?.color || '#22AB93');
  // const [tempName, setTempName] = useState(workspaces[selectedWorkspaceIndex]?.displayName || '');

  // useEffect(() => {
  //   if (!isColorPickerVisible) return;
  //   setTempColor(workspaces[selectedWorkspaceIndex]?.color || '#22AB93');
  //   setTempName(workspaces[selectedWorkspaceIndex]?.displayName || '');
  // }, [isColorPickerVisible, selectedWorkspaceIndex]);

  // const ColorPickerModal = useMemo(() => {
  //   const handleColorChange = ({ hex }: { hex: string }) => {
  //     setTempColor(hex);
  //   };

  //   const handleCancel = () => {
  //     setIsColorPickerVisible(false);
  //   };

  //   const handleDone = async () => {
  //     const ws = workspaces[selectedWorkspaceIndex];
  //     if (!ws) { setIsColorPickerVisible(false); return; }

  //     setWorkspaces(prev => {
  //       const next = [...prev];
  //       next[selectedWorkspaceIndex] = { ...ws, color: tempColor, displayName: tempName || ws.displayName };
  //       return next;
  //     });

  //     try {
  //       await database.write(async () => {
  //         const preferencesCollection = database.collections.get<UserPreferenceModel>('user_preferences');
  //         const existingPref = await preferencesCollection
  //           .query(Q.where('original_name', ws.key))
  //           .fetch();

  //         if (existingPref.length > 0) {
  //           for (const pref of existingPref) {
  //             await pref.update(p => {
  //               // @ts-ignore
  //               p.color = tempColor;
  //               // @ts-ignore
  //               if (tempName?.trim()) p.display_name = tempName.trim();
  //             });
  //           }
  //         } else {
  //           await preferencesCollection.create(pref => {
  //             // @ts-ignore
  //             pref.workspace_name = ws.displayName;
  //             // @ts-ignore
  //             pref.display_name = (tempName?.trim()) || ws.displayName;
  //             // @ts-ignore
  //             pref.original_name = ws.key;
  //             // @ts-ignore
  //             pref.color = tempColor;
  //             // @ts-ignore
  //             pref.todo_type = ws.todoType;
  //           });
  //         }
  //       });
  //       setIsColorPickerVisible(false);
  //     } catch (error) {
  //       console.error('Error saving workspace color:', error);
  //     }
  //   };
  //   const wsLocal = workspaces[selectedWorkspaceIndex];
  //   const canDelete = !!wsLocal && !wsLocal.builtin && !wsLocal.locked;

  //   return (
  //     <Modal
  //       visible={isColorPickerVisible}
  //       transparent={true}
  //       animationType="fade"
  //       onRequestClose={() => setIsColorPickerVisible(false)}
  //     >
  //       <TouchableWithoutFeedback onPress={() => setIsColorPickerVisible(false)}>
  //         <View style={styles.modalOverlay}>
  //           <TouchableWithoutFeedback>
  //             <View style={styles.colorPickerContainer}>
  //               {wsLocal && (
  //                 <TouchableOpacity
  //                   onPress={() => {
  //                     if (canDelete) {
  //                       setIsColorPickerVisible(false);
  //                       deleteWorkspace(selectedWorkspaceIndex);
  //                     } else {
  //                       Alert.alert('Not allowed', 'Personal and Work cannot be deleted.');
  //                     }
  //                   }}
  //                   style={{ position: 'absolute', top: 6, right: 6, padding: 6, zIndex: 2 }}
  //                   hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
  //                 >
  //                   <View style={{ width: 26, height: 26, justifyContent: 'center', alignItems: 'center' }}>
  //                     <Ionicons name="trash-outline" size={24} color={canDelete ? '#FF3B30' : (wsLocal.locked ? '#9ca3af' : '#9ca3af')} />
  //                     {!canDelete && !wsLocal.locked && (
  //                       <View
  //                         style={{
  //                           position: 'absolute',
  //                           width: 20,
  //                           height: 2,
  //                           backgroundColor: '#9ca3af',
  //                           transform: [{ rotate: '45deg' }],
  //                         }}
  //                       />
  //                     )}
  //                     {wsLocal.locked && (
  //                       <View
  //                         style={{
  //                           position: 'absolute',
  //                           width: 20,
  //                           height: 2,
  //                           backgroundColor: '#9ca3af',
  //                           transform: [{ rotate: '45deg' }],
  //                         }}
  //                       />
  //                     )}
  //                   </View>
  //                 </TouchableOpacity>
  //               )}
  //               {workspaces[selectedWorkspaceIndex] && (workspaces[selectedWorkspaceIndex].locked ? (
  //                 <View style={{ height: 0 }} />
  //               ) : (
  //                 <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, alignSelf: 'stretch', paddingRight: 34 }}>
  //                   <TextInput
  //                     value={tempName}
  //                     onChangeText={setTempName}
  //                     placeholder="Workspace name"
  //                     style={{ flex: 1, backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, color: '#175857', borderWidth: 1, borderColor: '#d1d5db' }}
  //                     returnKeyType="done"
  //                   />
  //                 </View>
  //               ))}
  //               <Text style={styles.colorPickerTitle}>
  //                 Choose color
  //               </Text>
  //               <ColorPicker
  //                 style={{ width: '100%' }}
  //                 value={tempColor}
  //                 onComplete={handleColorChange}
  //                 onChange={handleColorChange}
  //                 sliderThickness={25}
  //               >
  //                 <Preview hideInitialColor />
  //                 <View className='p-2'>
  //                   <Swatches
  //                     style={{ marginTop: 8, maxHeight: 100 }}
  //                     swatchStyle={{ width: 26, height: 26, borderRadius: 16, marginHorizontal: 4 }}
  //                     colors={[
  //                       '#22AB93',
  //                       '#A2FDFF',
  //                       '#FFC4C4',
  //                       '#889AFC',
  //                       '#FFEB80',
  //                       '#FFC2DC',
  //                       '#D7AFFF'
  //                     ]}
  //                   />
  //                 </View>
  //               </ColorPicker>
  //               <View style={styles.colorPickerButtonContainer}>
  //                 <TouchableOpacity
  //                   style={[styles.colorPickerButton, styles.colorPickerButtonCancel]}
  //                   onPress={handleCancel}
  //                 >
  //                   <Text style={styles.colorPickerButtonText}>Cancel</Text>
  //                 </TouchableOpacity>
  //                 <TouchableOpacity
  //                   style={styles.colorPickerButton}
  //                   onPress={handleDone}
  //                 >
  //                   <Text style={styles.colorPickerButtonText}>Done</Text>
  //                 </TouchableOpacity>
  //               </View>
  //             </View>
  //           </TouchableWithoutFeedback>
  //         </View>
  //       </TouchableWithoutFeedback>
  //     </Modal>
  //   );
  // }, [isColorPickerVisible, selectedWorkspaceIndex, tempColor, tempName, workspaces, database]);

  const handleSelectTodoType = useCallback(async (newType: 'basic' | 'progress' | 'slider') => {
    const ws = workspaces[currentWorkspace];
    if (!ws || ws.locked) {
      setIsOptionsMenuVisible(false);
      return;
    }
    const workspace = ws.key;
    const oldType = workspaceTodoTypes[workspace] || 'basic';

    if (newType === oldType) {
      setIsOptionsMenuVisible(false);
      return;
    }

    setSelectedTodoType(newType);
    setWorkspaceTodoTypes(prev => ({ ...prev, [workspace]: newType }));

    // Optimistically update the UI
    setLocalTodos(prevTodos =>
      prevTodos.map(todo => {
        if (todo.workspace === workspace && !todo.completed) {
          const newTodoState: TodoItem = { ...todo, type: newType };

          // Convert state between types without losing data
          if (newType === 'progress') {
            // To Progress: if slider has progress, mark as started
            if (todo.progress && todo.progress > 0 && !todo.startedAt) {
              newTodoState.startedAt = new Date();
            }
          } else if (newType === 'slider') {
            // To Slider: if marked as started in progress, set slider to "started"
            if (todo.startedAt && (!todo.progress || todo.progress < 0.1)) {
              newTodoState.progress = 0.1;
            } else if (!todo.startedAt) {
              newTodoState.progress = todo.progress || 0;
            }
          }
          // When switching to 'basic', we don't change anything to preserve state.
          return newTodoState;
        }
        return todo;
      })
    );

    setIsOptionsMenuVisible(false);

    try {
      await database.write(async () => {
        // Update preference
        const prefCollection = database.collections.get<UserPreferenceModel>('user_preferences');
        const existingPref = await prefCollection.query(Q.where('workspace_name', workspace)).fetch();

        if (existingPref.length > 0) {
          await existingPref[0].update(pref => {
            // @ts-ignore
            pref.todo_type = newType;
          });
        } else {
          await prefCollection.create(pref => {
            pref.workspace_name = workspace;
            // @ts-ignore
            pref.display_name = ws.displayName;
            // @ts-ignore
            pref.original_name = ws.originalName;
            pref.color = workspaceColors[currentWorkspace] || ws.color;
            // @ts-ignore
            pref.todo_type = newType;
          });
        }

        // Update existing todos
        const todosToUpdate = await database.collections.get<TodoModel>('todos')
          .query(
            Q.where('workspace', workspace)
          ).fetch();

        for (const todo of todosToUpdate) {
          await todo.update(t => {
            // @ts-ignore
            t.type = newType;

            // Conversion logic without destroying state
            if (newType === 'progress') {
              // To Progress: if slider has progress, mark as started
              // @ts-ignore
              if (t.progress > 0 && !t.startedAt) {
                t.startedAt = new Date();
              }
            } else if (newType === 'slider') {
              // To Slider: if marked as started in progress, set slider to "started"
              // @ts-ignore
              if (t.startedAt && (!t.progress || t.progress < 0.1)) {
                // @ts-ignore
                t.progress = 0.1;
              } else if (!t.startedAt) {
                // @ts-ignore
                t.progress = t.progress || 0;
              }
            }
            // When switching to 'basic', we don't change anything to preserve state.
          });
        }
      });
    } catch (error) {
      console.error('Error saving todo type preference and updating todos:', error);
    }
  }, [currentWorkspace, workspaceColors, workspaceTodoTypes]);

  const currentWs = workspaces[currentWorkspace];
  const canEditCurrent = !!currentWs && !currentWs.locked;

  const OptionsMenuModal = useMemo(() => {
    const theme = getTheme(workspaceColors[currentWorkspace]);
    const hexToRgba = (hex: string, opacity: number) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${opacity})` : hex;
    };
    const darkenColor = (hex: string, amount: number) => {
      let color = hex.indexOf('#') === 0 ? hex.substring(1) : hex;
      let r = parseInt(color.substring(0, 2), 16);
      let g = parseInt(color.substring(2, 4), 16);
      let b = parseInt(color.substring(4, 6), 16);
      r = Math.max(0, Math.floor(r * (1 - amount)));
      g = Math.max(0, Math.floor(g * (1 - amount)));
      b = Math.max(0, Math.floor(b * (1 - amount)));
      const rr = (r.toString(16).length === 1) ? "0" + r.toString(16) : r.toString(16);
      const gg = (g.toString(16).length === 1) ? "0" + g.toString(16) : g.toString(16);
      const bb = (b.toString(16).length === 1) ? "0" + b.toString(16) : b.toString(16);
      return "#" + rr + gg + bb;
    };

    const modalBg = hexToRgba(theme.overallBg, 0.9);
    const darkerBase = darkenColor(theme.workspaceNameColor, 0.4);
    const activeColor = darkerBase;
    // const inactiveColor = hexToRgba(darkerBase, 0.5);

    return (
      <Modal
        animationType="fade"
        transparent={true}
        visible={isOptionsMenuVisible}
        onRequestClose={() => setIsOptionsMenuVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsOptionsMenuVisible(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-start', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: modalBg,
                borderRadius: 20,
                marginTop: 50,
                width: '90%',
                padding: 20,
                height: 480,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: activeColor }}>To Do Options</Text>
                  <TouchableOpacity onPress={() => setIsOptionsMenuVisible(false)} style={{ position: 'absolute', right: 0, top: -5 }}>
                    <Text style={{ fontSize: 32, fontWeight: 'bold', color: activeColor }}>×</Text>
                  </TouchableOpacity>
                </View>

                {canEditCurrent ? (
                  <></>
                ) : (
                  <Text style={{ color: activeColor, marginBottom: 15 }}>Wishlist cannot be edited</Text>
                )}

                {/*
                <TouchableOpacity onPress={() => handleSelectTodoType('basic')} style={{ paddingLeft: 15, marginBottom: 15 }}>
                  <Text style={{ fontSize: 24, fontWeight: selectedTodoType === 'basic' ? 'bold' : 'normal', color: selectedTodoType === 'basic' ? activeColor : inactiveColor }}>Basic</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => handleSelectTodoType('progress')} style={{ paddingLeft: 15, marginBottom: 15 }}>
                  <Text style={{ fontSize: 24, fontWeight: selectedTodoType === 'progress' ? 'bold' : 'normal', color: selectedTodoType === 'progress' ? activeColor : inactiveColor }}>Progress</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => handleSelectTodoType('slider')} style={{ paddingLeft: 15, marginBottom: 15 }}>
                  <Text style={{ fontSize: 24, fontWeight: selectedTodoType === 'slider' ? 'bold' : 'normal', color: selectedTodoType === 'slider' ? activeColor : inactiveColor }}>Slider</Text>
                </TouchableOpacity>
                */}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    )
  }, [isOptionsMenuVisible, selectedTodoType, handleSelectTodoType, currentWorkspace, workspaceColors]);


  const openAmazonSearch = async (searchUrl: string) => {
    const amazonAppUrl = searchUrl.replace(/^https:\/\//, 'com.amazon.mobile.shopping://');

    try {
      await Linking.openURL(amazonAppUrl);
      return;
    } catch {
      console.log('Amazon app unavailable, opening Amazon search in browser.');
    }

    try {
      await Linking.openURL(searchUrl);
    } catch (webError) {
      console.error('Error opening Amazon search URL:', webError);
      Alert.alert('Error', 'Unable to open Amazon. Please try again.');
    }
  };


  const bottomSheetRef = useRef<ActionSheetRef>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const micWorkspaceIndexRef = useRef<number | null>(null);


  const router = useRouter();

  const [currentSnapPoint, setCurrentSnapPoint] = useState(0);

  const [expandedSections, setExpandedSections] = useState<Record<string, Partial<Record<TodoSectionKey, boolean>>>>({});
  const expandedSectionsRef = useRef<Record<string, Partial<Record<TodoSectionKey, boolean>>>>({});
  const [isTodoSearchVisible, setIsTodoSearchVisible] = useState(false);
  const [todoSearchQuery, setTodoSearchQuery] = useState('');
  const hasTodoSearchQuery = todoSearchQuery.trim().length > 0;

  const defaultExpanded: Record<TodoSectionKey, boolean> = {
    today: true,
    upcoming: false,
    past: false,
    completed: false,
    wishlist: true,
    thisWeek: true,
    thisMonth: false,
    thisYear: false,
    longTerm: false,
  };
  useEffect(() => {
    expandedSectionsRef.current = expandedSections;
  }, [expandedSections]);

  // const [showTimePicker, setShowTimePicker] = useState(false);

  const [isMovingTodoToCalendar, setIsMovingTodoToCalendar] = useState(false);
  const isMovingTodoToCalendarRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      isMovingTodoToCalendarRef.current = false;
      setIsMovingTodoToCalendar(false);
    }, [])
  );
  // const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);

  const getTodoOrderingStatePatch = useCallback((todo: Pick<TodoModel, 'sortScope' | 'sortOrder'>) => ({
    sortScope: todo.sortScope,
    sortOrder: todo.sortOrder,
  }), []);

  const updateTodoStateEverywhere = useCallback((todoId: string, patch: Partial<TodoItem>) => {
    if (typeof patch.completed === 'boolean') {
      syncTodoAnimationState(todoId, patch.completed);
    }

    setLocalTodos((prevTodos) => {
      const nextTodos = prevTodos.map((todo) => (todo.id === todoId ? { ...todo, ...patch } : todo));
      localTodosRef.current = nextTodos;
      return nextTodos;
    });
    setSelectedTodoForDetails((prevTodo) =>
      prevTodo?.id === todoId ? { ...prevTodo, ...patch } : prevTodo
    );
  }, [syncTodoAnimationState]);

  const upsertTodoStateEverywhere = useCallback((todoModel: TodoModel) => {
    const nextTodo = toTodoItem(todoModel, recurrenceSeriesById);
    syncTodoAnimationState(nextTodo.id, nextTodo.completed);

    setLocalTodos((prevTodos) => {
      const existingIndex = prevTodos.findIndex((todo) => todo.id === nextTodo.id);
      const nextTodos = existingIndex >= 0
        ? prevTodos.map((todo, index) => index === existingIndex ? nextTodo : todo)
        : [...prevTodos, nextTodo];
      localTodosRef.current = nextTodos;
      return nextTodos;
    });

    setSelectedTodoForDetails((prevTodo) =>
      prevTodo?.id === nextTodo.id ? nextTodo : prevTodo
    );
  }, [recurrenceSeriesById, syncTodoAnimationState]);

  const removeTodoIdsFromLocalState = useCallback((todoIds: string[]) => {
    if (!todoIds.length) {
      return;
    }

    const todoIdSet = new Set(todoIds);
    setLocalTodos((prevTodos) => {
      const nextTodos = prevTodos.filter((todo) => !todoIdSet.has(todo.id));
      localTodosRef.current = nextTodos;
      return nextTodos;
    });
  }, []);

  const setTodoClassificationPending = useCallback((todoId: string, isPending: boolean) => {
    setClassifyingTodoIds((current) => {
      if (isPending) {
        if (current[todoId]) {
          return current;
        }
        return { ...current, [todoId]: true };
      }

      if (!current[todoId]) {
        return current;
      }

      const next = { ...current };
      delete next[todoId];
      return next;
    });
  }, []);

  const classifyTodoInBackground = useCallback(async (input: {
    todoId: string;
    title: string;
    details?: string;
    workspace: string;
    goalTimeframe?: string | null;
    guidancePath?: GuidancePath | null;
  }) => {
    if (!shouldClassifyTodoWorkspace(input.workspace)) {
      return;
    }

    if (input.workspace === 'Personal' && goalManagedTodoIds.has(input.todoId)) {
      return;
    }

    setTodoClassificationPending(input.todoId, true);

    try {
      const result = await requestTodoClassification({
        title: input.title,
        details: input.details || '',
        workspace: input.workspace,
        goalTimeframe: input.goalTimeframe,
      });
      const isQuotaGoal = input.workspace === 'Goals' && isQuotaGoalBehavior(result.goalBehavior);
      const guidancePath =
        result.kind === 'recipe'
          ? null
          : isQuotaGoal
            ? 'actions'
            : input.guidancePath || null;
      await updateTodo(input.todoId, {
        taskKind: result.kind,
        guidancePath,
        ...(input.workspace === 'Goals'
          ? { goalBehaviorJson: serializeGoalBehavior(result.goalBehavior) }
          : {}),
      });
      updateTodoStateEverywhere(input.todoId, {
        taskKind: result.kind,
        guidancePath,
        ...(input.workspace === 'Goals'
          ? { goalBehaviorJson: serializeGoalBehavior(result.goalBehavior) }
          : {}),
      });
    } catch (error) {
      if (!isAiAuthRequiredError(error)) {
        console.warn('Todo classification failed:', error);
      }
      if (input.workspace === 'Goals') {
        const goalBehaviorJson = serializeGoalBehavior(createStandardGoalBehavior());
        await updateTodo(input.todoId, { goalBehaviorJson }).catch(() => null);
        updateTodoStateEverywhere(input.todoId, { goalBehaviorJson });
      }
    } finally {
      setTodoClassificationPending(input.todoId, false);
    }
  }, [goalManagedTodoIds, setTodoClassificationPending, updateTodoStateEverywhere]);

  const loadGoalGuidancePlan = useCallback(async (goalId: string) => {
    const loadVersion = goalGuidanceLoadVersionRef.current;
    try {
      const plan = await fetchGoalGuidancePlanForGoal(goalId);
      if (goalGuidanceLoadVersionRef.current !== loadVersion) {
        return plan;
      }
      setGoalGuidancePlan(plan);
      setGoalGuidanceParentPlan(null);
      setGoalGuidanceAlternative(null);
      setPendingGoalGuidanceTitle(null);
      if (plan?.status === 'preview') {
        setIsGoalGuidanceAiActive(true);
      }
      return plan;
    } catch (error) {
      console.error('Error loading goal guidance plan:', error);
      if (goalGuidanceLoadVersionRef.current !== loadVersion) {
        return null;
      }
      setGoalGuidancePlan(null);
      setGoalGuidanceParentPlan(null);
      setGoalGuidanceAlternative(null);
      setPendingGoalGuidanceTitle(null);
      return null;
    }
  }, []);

  const getObservedGoalGuidanceStateForTodo = useCallback((todo: TodoItem) => {
    if (todo.workspace === 'Goals') {
      return {
        goalPlan: observedGoalGuidancePlanByGoalId.get(todo.id) || null,
        parentPlan: null,
      };
    }

    const parentPlan = observedGoalGuidanceParentPlanByActionTodoId.get(todo.id) || null;
    const parentGoalTodo = parentPlan
      ? localTodosRef.current.find((item) => item.id === parentPlan.goalId)
      : null;
    const canUseParentPlan = parentGoalTodo?.workspace === 'Goals';

    return {
      goalPlan: canUseParentPlan ? observedGoalGuidancePlanByGoalId.get(todo.id) || null : null,
      parentPlan: canUseParentPlan ? parentPlan : null,
    };
  }, [observedGoalGuidanceParentPlanByActionTodoId, observedGoalGuidancePlanByGoalId]);

  const selectedGoalGuidanceTimeframe = useMemo(
    () => getGoalGuidanceTimeframe(selectedTodoForDetails, weekStartsOn),
    [selectedTodoForDetails, weekStartsOn]
  );
  const selectedGoalBehavior = useMemo(
    () => parseGoalBehavior(selectedTodoForDetails?.goalBehaviorJson),
    [selectedTodoForDetails?.goalBehaviorJson]
  );
  const selectedQuotaBehavior = isQuotaGoalBehavior(selectedGoalBehavior) ? selectedGoalBehavior : null;
  const isSelectedGoalBehaviorPending =
    selectedTodoForDetails?.workspace === 'Goals' && selectedGoalBehavior?.kind === 'pending';
  const goalGuidanceTimeframe = selectedGoalGuidanceTimeframe || goalGuidancePlan?.timeframe || goalGuidanceParentPlan?.timeframe || null;
  const goalGuidanceOwnerTodo = useMemo(
    () => goalGuidanceParentPlan
      ? localTodos.find((todo) => todo.id === goalGuidanceParentPlan.goalId)
      : null,
    [goalGuidanceParentPlan, localTodos]
  );
  const selectedGoalGuidanceAction = useMemo(() => {
    if (!selectedTodoForDetails || !goalGuidanceParentPlan || selectedTodoForDetails.id === goalGuidanceParentPlan.goalId) {
      return null;
    }

    const activeAction = goalGuidanceParentPlan.activeActions.find((action) => action.todoId === selectedTodoForDetails.id);
    if (activeAction) {
      return activeAction;
    }

    const historicalStepIndex = goalGuidanceParentPlan.actionTodoStepIndexes[selectedTodoForDetails.id];
    if (Number.isInteger(historicalStepIndex)) {
      return {
        stepIndex: historicalStepIndex,
        todoId: selectedTodoForDetails.id,
        dueDate: '',
      };
    }

    return goalGuidanceParentPlan.activeTodoId === selectedTodoForDetails.id
      ? {
          stepIndex: goalGuidanceParentPlan.activeStepIndex,
          todoId: goalGuidanceParentPlan.activeTodoId,
          dueDate: '',
        }
      : null;
  }, [goalGuidanceParentPlan, selectedTodoForDetails]);
  const canUseGoalGuidanceParentPlan = useMemo(() => {
    if (!goalGuidanceParentPlan) {
      return false;
    }

    return localTodos.some((todo) => todo.id === goalGuidanceParentPlan.goalId && todo.workspace === 'Goals');
  }, [goalGuidanceParentPlan, localTodos]);
  const isGoalGuidanceActionDetails =
    !!selectedTodoForDetails &&
    !!selectedGoalGuidanceAction &&
    selectedTodoForDetails.workspace !== 'Goals' &&
    canUseGoalGuidanceParentPlan;
  const isSelectedGoalManagedTodo =
    !!selectedTodoForDetails &&
    selectedTodoForDetails.workspace === 'Personal' &&
    goalManagedTodoIds.has(selectedTodoForDetails.id);
  // A To Do task whose classification never came back (server down, timed out) still gets
  // the guidance choice, as a normal task; a later classification replaces this.
  const selectedTaskKind: TodoTaskKind | null = isSelectedGoalManagedTodo
    ? null
    : selectedTodoForDetails?.taskKind
      || (
        selectedTodoForDetails?.workspace === 'Personal' && !classifyingTodoIds[selectedTodoForDetails.id]
          ? 'normal'
          : null
      );
  const isSelectedRecipeKind =
    !isSelectedGoalManagedTodo &&
    (
      selectedTaskKind === 'recipe' ||
      (!!selectedTodoForDetails && shouldShowRecipeGuideShortcut(selectedTodoForDetails))
    );
  const isSelectedPersonalGuidanceChoiceKind =
    !!selectedTodoForDetails &&
    !isSelectedGoalManagedTodo &&
    selectedTodoForDetails.workspace === 'Personal' &&
    !isSelectedRecipeKind &&
    (selectedTaskKind === 'normal' || selectedTaskKind === 'skill');
  const activePersonalGuidancePath: GuidancePath | null =
    isSelectedPersonalGuidanceChoiceKind
      ? selectedTodoForDetails.guidancePath || (taskGuide ? 'actions' : skillGuide ? 'video' : null)
      : null;
  const hasCheckedPersonalGuides =
    !isSelectedPersonalGuidanceChoiceKind ||
    !!selectedTodoForDetails?.guidancePath ||
    (
      loadedTaskGuideTodoId === selectedTodoForDetails?.id &&
      loadedSkillGuideTodoId === selectedTodoForDetails?.id
    );
  const isSelectedVideoGuidanceKind =
    !isSelectedGoalManagedTodo &&
    (
      isSelectedRecipeKind ||
      selectedTaskKind === 'skill' ||
      (selectedTodoForDetails?.workspace === 'Personal' && selectedTaskKind === 'normal')
    );
  const canChooseGuidancePath =
    !!selectedTodoForDetails &&
    (
      (
        selectedTodoForDetails.workspace === 'Goals' &&
        isSelectedVideoGuidanceKind
      ) ||
      isSelectedPersonalGuidanceChoiceKind
    );
  const shouldShowGuidancePathChoice =
    canChooseGuidancePath &&
    hasCheckedPersonalGuides &&
    !(selectedTodoForDetails?.workspace === 'Personal'
      ? activePersonalGuidancePath
      : selectedTodoForDetails?.guidancePath);
  const shouldShowGuidancePathSwitch =
    canChooseGuidancePath &&
    !!(selectedTodoForDetails?.workspace === 'Personal'
      ? activePersonalGuidancePath
      : selectedTodoForDetails?.guidancePath);
  const nextGuidancePath: GuidancePath =
    (selectedTodoForDetails?.workspace === 'Personal'
      ? activePersonalGuidancePath
      : selectedTodoForDetails?.guidancePath) === 'actions' ? 'video' : 'actions';
  const usesVideoGuidancePath =
    !!selectedTodoForDetails &&
    isSelectedVideoGuidanceKind &&
    (selectedTodoForDetails.workspace === 'Personal'
      ? isSelectedRecipeKind || activePersonalGuidancePath === 'video'
      : selectedTodoForDetails.workspace === 'Goals' && selectedTodoForDetails.guidancePath === 'video');
  const usesTaskGuidancePath =
    !!selectedTodoForDetails &&
    selectedTodoForDetails.workspace === 'Personal' &&
    !isSelectedRecipeKind &&
    activePersonalGuidancePath === 'actions';
  const usesGoalGuidancePath =
    !!selectedTodoForDetails &&
    (
      selectedTodoForDetails.workspace !== 'Goals' ||
      !isSelectedVideoGuidanceKind ||
      selectedTodoForDetails.guidancePath === 'actions'
    );
  const isGoalGuidanceEligible =
    !!selectedTodoForDetails &&
    (selectedTodoForDetails.workspace === 'Goals' || isGoalGuidanceActionDetails) &&
    usesGoalGuidancePath &&
    !shouldShowGuidancePathChoice &&
    !!goalGuidanceTimeframe;
  const goalGuidanceDeadline = useMemo(() => {
    if (!goalGuidanceTimeframe) {
      return null;
    }

    return goalGuidancePlan?.deadline ||
      goalGuidanceParentPlan?.deadline ||
      (selectedTodoForDetails?.workspace === 'Goals' && selectedTodoForDetails.dueDate
        ? startOfDay(selectedTodoForDetails.dueDate)
        : getGoalDefaultDueDate(goalGuidanceTimeframe, new Date(), weekStartsOn));
  }, [
    goalGuidanceParentPlan?.deadline,
    goalGuidancePlan?.deadline,
    goalGuidanceTimeframe,
    selectedTodoForDetails?.dueDate,
    selectedTodoForDetails?.workspace,
    weekStartsOn,
  ]);
  const goalGuidanceContext = useMemo(() => {
    if (!selectedTodoForDetails || !isGoalGuidanceEligible || !goalGuidanceTimeframe || !goalGuidanceDeadline) {
      return null;
    }
    if (isSelectedGoalBehaviorPending) {
      return null;
    }

    const miniGoalTitle = editedTodoTitle || selectedTodoForDetails.text;
    const miniGoalDetails = editedTodoDetails || selectedTodoForDetails.details || '';
    const goalTitle = isGoalGuidanceActionDetails
      ? miniGoalTitle
      : editedTodoTitle || selectedTodoForDetails.text;
    const goalDetails = isGoalGuidanceActionDetails
      ? miniGoalDetails
      : editedTodoDetails || selectedTodoForDetails.details || '';

    return {
      goalId: selectedTodoForDetails.id,
      goalTitle,
      goalDetails,
      timeframe: goalGuidanceTimeframe,
      deadline: goalGuidanceDeadline,
      parentGoal: isGoalGuidanceActionDetails && goalGuidanceOwnerTodo && goalGuidanceParentPlan
        ? {
            title: goalGuidanceOwnerTodo.text,
            details: goalGuidanceOwnerTodo.details,
            timeframe: goalGuidanceParentPlan.timeframe,
            deadline: goalGuidanceParentPlan.deadline,
          }
        : undefined,
      activeMilestone: isGoalGuidanceActionDetails
        ? {
            title: miniGoalTitle,
            details: miniGoalDetails,
            stepIndex: selectedGoalGuidanceAction?.stepIndex,
          }
        : undefined,
      quota: selectedTodoForDetails.workspace === 'Goals' && selectedQuotaBehavior
        ? {
            targetCount: selectedQuotaBehavior.targetCount,
            completedCount: selectedQuotaBehavior.completedCount,
            unitLabel: selectedQuotaBehavior.unitLabel,
            unitType: selectedQuotaBehavior.unitType,
          }
        : undefined,
    };
  }, [
    editedTodoDetails,
    editedTodoTitle,
    goalGuidanceDeadline,
    goalGuidanceOwnerTodo,
    goalGuidanceParentPlan,
    goalGuidanceTimeframe,
    isGoalGuidanceEligible,
    isGoalGuidanceActionDetails,
    isSelectedGoalBehaviorPending,
    selectedTodoForDetails,
    selectedGoalGuidanceAction?.stepIndex,
    selectedQuotaBehavior,
  ]);
  const recipeGuidanceContext: RecipeContext | null = useMemo(() => {
    if (
      !selectedTodoForDetails ||
      !isSelectedRecipeKind ||
      !usesVideoGuidancePath
    ) {
      return null;
    }

    return {
      todoId: selectedTodoForDetails.id,
      title: editedTodoTitle || selectedTodoForDetails.text,
      details: editedTodoDetails || selectedTodoForDetails.details || '',
    };
  }, [editedTodoDetails, editedTodoTitle, isSelectedRecipeKind, selectedTodoForDetails, usesVideoGuidancePath]);
  const skillGuidanceContext: SkillContext | null = useMemo(() => {
    if (
      !selectedTodoForDetails ||
      !(selectedTaskKind === 'normal' || selectedTaskKind === 'skill') ||
      !usesVideoGuidancePath
    ) {
      return null;
    }

    return {
      todoId: selectedTodoForDetails.id,
      title: editedTodoTitle || selectedTodoForDetails.text,
      details: editedTodoDetails || selectedTodoForDetails.details || '',
    };
  }, [editedTodoDetails, editedTodoTitle, selectedTaskKind, selectedTodoForDetails, usesVideoGuidancePath]);
  const taskGuidanceContext: TaskGuidanceContext | null = useMemo(() => {
    if (
      !selectedTodoForDetails ||
      classifyingTodoIds[selectedTodoForDetails.id] ||
      !shouldShowTaskGuideShortcut(selectedTodoForDetails) ||
      isSelectedGoalManagedTodo ||
      selectedTaskKind === 'recipe' ||
      shouldShowRecipeGuideShortcut(selectedTodoForDetails) ||
      !usesTaskGuidancePath
    ) {
      return null;
    }

    return {
      todoId: selectedTodoForDetails.id,
      title: editedTodoTitle || selectedTodoForDetails.text,
      details: editedTodoDetails || selectedTodoForDetails.details || '',
    };
  }, [classifyingTodoIds, editedTodoDetails, editedTodoTitle, isSelectedGoalManagedTodo, selectedTaskKind, selectedTodoForDetails, usesTaskGuidancePath]);

  const handleGoalGuidancePlanSaved = useCallback(async (
    plan: GoalGuidancePlan,
    response?: GoalGuidanceResponse
  ) => {
    setGoalGuidancePlan(plan);
    setIsGoalGuidanceAiActive(true);
    if (response) {
      setGoalGuidanceAlternative(
        response.alternativeTimeframe
          ? {
              timeframe: response.alternativeTimeframe,
            }
          : null
      );
    }

    const nextGoalTitle = response?.goalTitle?.trim();
    if (response?.type === 'plan') {
      await refreshLocalTodos();
    }

    if (response?.type !== 'plan' || !nextGoalTitle || selectedTodoForDetails?.id !== plan.goalId) {
      if (response?.type === 'plan') {
        setPendingGoalGuidanceTitle(null);
      }
      return;
    }

    const currentTitle = selectedTodoForDetails.text.trim();
    if (currentTitle === nextGoalTitle) {
      setPendingGoalGuidanceTitle(null);
      return;
    }

    if (plan.status === 'preview') {
      setPendingGoalGuidanceTitle(nextGoalTitle);
      return;
    }

    try {
      const result = await updateTodo(plan.goalId, { text: nextGoalTitle });
      updateTodoStateEverywhere(plan.goalId, { text: result.todo.text });
      setEditedTodoTitle(result.todo.text);
      setPendingGoalGuidanceTitle(null);
    } catch (error) {
      console.error('Error updating guidance goal title:', error);
    }
  }, [refreshLocalTodos, selectedTodoForDetails, updateTodoStateEverywhere]);

  const handleClearBlockedGoalGuidancePreview = useCallback(() => {
    setGoalGuidancePlan(null);
    setGoalGuidanceAlternative(null);
    setPendingGoalGuidanceTitle(null);
    setIsGoalGuidanceAiActive(true);
  }, []);

  const {
    inputValue: goalGuidanceInputValue,
    setInputValue: setGoalGuidanceInputValue,
    submitText: submitGoalGuidanceText,
    isRunning: isGoalGuidanceRunning,
    notice: goalGuidanceNotice,
    conversation: goalGuidanceConversation,
    answerText: goalGuidanceAnswerText,
    hasPendingPlanChange: hasPendingGoalGuidancePlanChange,
    clearNotice: clearGoalGuidanceNotice,
    returnToPlan: returnToGoalGuidancePlan,
    applyPendingPlanChange: applyPendingGoalGuidancePlanChange,
    requestSteps: requestGoalGuidanceSteps,
    requestFreshSteps: requestFreshGoalGuidanceSteps,
    requestCram: requestGoalGuidanceCram,
  } = useGoalGuidanceAI({
    context: goalGuidanceContext,
    currentPlan: goalGuidancePlan,
    onPlanSaved: handleGoalGuidancePlanSaved,
    onClearBlockedPreview: handleClearBlockedGoalGuidancePreview,
  });
  const handleRecipeGuideSaved = useCallback((guide: RecipeGuide, options?: { preserveOptimisticIngredients?: boolean }) => {
    if (options?.preserveOptimisticIngredients === false) {
      pendingRecipeIngredientSaveRef.current = null;
    }

    const currentGuide = recipeGuideRef.current;
    const shouldKeepOptimisticIngredients =
      options?.preserveOptimisticIngredients !== false &&
      currentGuide?.todoId === guide.todoId &&
      (isSavingRecipeIngredientChecksRef.current || !!pendingRecipeIngredientSaveRef.current);
    const nextGuide = shouldKeepOptimisticIngredients
      ? { ...guide, ingredients: currentGuide.ingredients }
      : guide;
    const checkedMap = getRecipeIngredientCheckedMap(nextGuide);

    recipeGuideRef.current = nextGuide;
    checkedRecipeIngredientKeysRef.current = checkedMap;
    setRecipeGuide(nextGuide);
    setRecipeAnswersDraft(nextGuide.answers);
    setCheckedRecipeIngredientKeys(checkedMap);
    const guideProgress = getRecipeProgressFromSteps(nextGuide.steps);
    if (guideProgress) {
      setRecipeProgressOverridesByTodoId((current) => ({
        ...current,
        [nextGuide.todoId]: guideProgress,
      }));
    }
    setIsRecipeGuidanceAiActive(true);
  }, []);
  const {
    inputValue: recipeInputValue,
    setInputValue: setRecipeInputValue,
    submitText: submitRecipeQuestionText,
    isRunning: isRecipeAiRunning,
    conversation: recipeConversation,
    answerText: recipeAnswerText,
    pendingRecipeChange,
    notice: recipeNotice,
    clearNotice: clearRecipeNotice,
    clearPendingRecipeChange,
    returnToSteps: returnToRecipeSteps,
  } = useRecipeGuidanceAI({
    context: recipeGuidanceContext,
    guide: recipeGuide,
    onGuideSaved: handleRecipeGuideSaved,
  });
  const handleSkillGuideSaved = useCallback((guide: SkillGuide) => {
    setSkillGuide(guide);
    const guideProgress = getSkillProgressFromSteps(guide.steps);
    if (guideProgress) {
      setSkillProgressOverridesByTodoId((current) => ({
        ...current,
        [guide.todoId]: guideProgress,
      }));
    }
    setIsSkillGuidanceAiActive(true);
  }, []);
  const {
    inputValue: skillInputValue,
    setInputValue: setSkillInputValue,
    submitText: submitSkillQuestionText,
    isRunning: isSkillAiRunning,
    conversation: skillConversation,
    answerText: skillAnswerText,
    notice: skillNotice,
    clearNotice: clearSkillNotice,
    returnToSteps: returnToSkillSteps,
  } = useSkillGuidanceAI({
    context: skillGuidanceContext,
    guide: skillGuide,
    onGuideSaved: handleSkillGuideSaved,
  });
  const handleTaskGuideSaved = useCallback((guide: TaskGuide) => {
    setTaskGuide(guide);
    const guideProgress = getTaskProgressFromSteps(guide.steps, guide.status);
    setTaskProgressOverridesByTodoId((current) => {
      if (guideProgress && (guide.status === 'preview' || guide.status === 'accepted' || guide.status === 'complete')) {
        return {
          ...current,
          [guide.todoId]: guideProgress,
        };
      }

      const { [guide.todoId]: _removed, ...rest } = current;
      return rest;
    });
    setIsTaskGuidanceAiActive(true);
  }, []);
  const {
    inputValue: taskInputValue,
    setInputValue: setTaskInputValue,
    submitText: submitTaskGuidanceText,
    isRunning: isTaskGuidanceRunning,
    notice: taskGuidanceNotice,
    conversation: taskGuidanceConversation,
    answerText: taskGuidanceAnswerText,
    hasPendingPlanChange: hasPendingTaskGuidancePlanChange,
    clearNotice: clearTaskGuidanceNotice,
    returnToPlan: returnToTaskGuidancePlan,
    applyPendingPlanChange: applyPendingTaskGuidancePlanChange,
    requestSteps: requestTaskGuidanceSteps,
  } = useTaskGuidanceAI({
    context: taskGuidanceContext,
    guide: taskGuide,
    onGuideSaved: handleTaskGuideSaved,
  });

  useEffect(() => {
    if (
      !isDetailsModalVisible ||
      shouldShowGuidancePathChoice ||
      !usesTaskGuidancePath ||
      !taskGuidanceContext ||
      taskGuide ||
      isTaskGuidanceRunning ||
      taskGuidanceNotice?.kind === 'error'
    ) {
      return;
    }

    const requestKey = `${taskGuidanceContext.todoId}:${taskGuidanceContext.title}:${taskGuidanceContext.details}`;
    if (autoRequestedTaskGuidanceRef.current === requestKey) {
      return;
    }

    autoRequestedTaskGuidanceRef.current = requestKey;
    void requestTaskGuidanceSteps();
  }, [
    isDetailsModalVisible,
    isTaskGuidanceRunning,
    requestTaskGuidanceSteps,
    shouldShowGuidancePathChoice,
    taskGuidanceContext,
    taskGuide,
    taskGuidanceNotice?.kind,
    usesTaskGuidancePath,
  ]);

  useEffect(() => {
    if (
      !isDetailsModalVisible ||
      shouldShowGuidancePathChoice ||
      !isGoalGuidanceEligible ||
      goalGuidancePlan ||
      isGoalGuidanceRunning ||
      isSelectedGoalBehaviorPending ||
      goalGuidanceNotice?.kind === 'error' ||
      !selectedTodoForDetails
    ) {
      return;
    }

    if (
      isGoalGuidanceTutorialPendingRef.current &&
      tutorialGoalTodoIdRef.current === selectedTodoForDetails.id &&
      goalGuidanceConversation.length === 0
    ) {
      return;
    }

    const deadlineKey = goalGuidanceDeadline?.toISOString?.() || '';
    const requestKey = `${selectedTodoForDetails.id}:${selectedGoalGuidanceTimeframe}:${deadlineKey}`;
    if (autoRequestedGoalGuidanceRef.current === requestKey) {
      return;
    }

    autoRequestedGoalGuidanceRef.current = requestKey;
    setIsGoalGuidanceAiActive(true);
    void requestGoalGuidanceSteps();
  }, [
    goalGuidanceDeadline,
    goalGuidanceNotice?.kind,
    goalGuidancePlan,
    isDetailsModalVisible,
    isGoalGuidanceEligible,
    isGoalGuidanceRunning,
    isSelectedGoalBehaviorPending,
    requestGoalGuidanceSteps,
    goalGuidanceConversation.length,
    selectedGoalGuidanceTimeframe,
    selectedTodoForDetails,
    shouldShowGuidancePathChoice,
  ]);

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
  } = useCompactTabAI('todo', {
    onMutationSuccess: async ({ name, result }) => {
      if (name === 'todo_create_many') {
        const createdItems = Array.isArray(result?.createdItems) ? result.createdItems : [];
        if (createdItems.length) {
          const mappedCreatedItems: TodoItem[] = createdItems.map((item: any) => ({
            id: String(item?.id || ''),
            text: String(item?.text || ''),
            completed: false,
            details: '',
            dueDate: item?.dueDate ? new Date(item.dueDate) : undefined,
            hasDueTime: typeof item?.hasDueTime === 'boolean' ? item.hasDueTime : false,
            starred: !!item?.starred,
            workspace: typeof item?.workspace === 'string' ? item.workspace : 'Personal',
            type: 'basic' as const,
            reminderEnabled: false,
            reminderMode: 'none' as TodoReminderMode,
            reminderMinutesBefore: null,
            notificationId: null,
            goalTimeframe: isGoalTodoTimeframe(item?.goalTimeframe) ? item.goalTimeframe : null,
            taskKind: normalizeTodoTaskKind(item?.taskKind),
            guidancePath: normalizeGuidancePath(item?.guidancePath),
          }));
          setLocalTodos((current) => {
            const next = [
              ...current.filter((todo) => !mappedCreatedItems.some((item) => item.id === todo.id)),
              ...mappedCreatedItems,
            ];
            localTodosRef.current = next;
            return next;
          });

          const firstCreatedTodo = mappedCreatedItems[0];
          if (firstCreatedTodo) {
            const sectionToExpand = getTodoSectionKey(firstCreatedTodo, weekStartsOn);
            setExpandedSections((current) => ({
              ...current,
              [firstCreatedTodo.workspace || 'Personal']: {
                ...(current[firstCreatedTodo.workspace || 'Personal'] || {}),
                [sectionToExpand]: true,
              },
            }));
            queueTodoReveal(firstCreatedTodo);
          }
        }
      }

      if (name === 'todo_edit_many') {
        const updatedItems = Array.isArray(result?.updatedItems) ? result.updatedItems : [];
        if (updatedItems.length) {
          setLocalTodos((current) => {
            const next = current.map((todo) => {
              const match = updatedItems.find((item: any) => String(item?.id || '') === todo.id);
              if (!match) return todo;
              return {
                ...todo,
                text: String(match?.newText || todo.text),
                dueDate: match?.dueDate ? new Date(match.dueDate) : todo.dueDate,
                hasDueTime: typeof match?.hasDueTime === 'boolean' ? match.hasDueTime : todo.hasDueTime,
                starred: typeof match?.starred === 'boolean' ? match.starred : todo.starred,
                workspace: typeof match?.workspace === 'string' ? match.workspace : todo.workspace,
                goalTimeframe: isGoalTodoTimeframe(match?.goalTimeframe) ? match.goalTimeframe : todo.goalTimeframe,
              };
            });
            localTodosRef.current = next;
            return next;
          });
        }
      }

      if (name === 'todo_delete_many' || name === 'todo_delete_by_day_except') {
        const deletedItems = Array.isArray(result?.deletedItems) ? result.deletedItems : [];
        if (deletedItems.length) {
          const deletedIds = new Set(deletedItems.map((item: any) => String(item?.id || '')).filter(Boolean));
          setLocalTodos((current) => {
            const next = current.filter((todo) => !deletedIds.has(todo.id));
            localTodosRef.current = next;
            return next;
          });
        }
      }

      if (name === 'todo_complete_many' || name === 'todo_complete_by_day') {
        await refreshLocalTodos();
        if (selectedTodoForDetails?.id) {
          if (selectedTodoForDetails.workspace === 'Goals') {
            void loadGoalGuidancePlan(selectedTodoForDetails.id);
          } else {
            void Promise.all([
              fetchGoalGuidancePlanForGoal(selectedTodoForDetails.id),
              fetchGoalGuidancePlanForActionTodo(selectedTodoForDetails.id),
            ]).then(([loadedMiniPlan, loadedParentPlan]) => {
              const parentGoalTodo = loadedParentPlan
                ? localTodosRef.current.find((todo) => todo.id === loadedParentPlan.goalId)
                : null;
              const canDrillIntoAction = parentGoalTodo?.workspace === 'Goals';
              setGoalGuidancePlan(canDrillIntoAction ? loadedMiniPlan : null);
              setGoalGuidanceParentPlan(canDrillIntoAction ? loadedParentPlan : null);
            });
          }
        }
      }
    },
  });
  useCompactGuidanceBridge(aiNotice, dismissNotice);

  const handleCompactNoticeAction = useCallback(() => {
    if (aiNotice?.kind === 'confirm') {
      void confirmPendingAction();
      return;
    }

    const target = aiNotice?.target as CompactAiNoticeTarget | undefined;
    if (target) {
      dismissNotice();
      const shortcut = getShortcutForGuidanceTarget(target as GuidanceTarget);
      router.push({ pathname: shortcut.pathname as any, params: shortcut.params });
      return;
    }

    router.push({ pathname: '/(tabs)/chat', params: getHandoffChatParams() || {} });
  }, [aiNotice, confirmPendingAction, dismissNotice, getHandoffChatParams, router]);

  const queueGoalWishlistAutoOpen = useCallback((todoId: string) => {
    pendingGoalWishlistAutoOpenTodoIdRef.current = todoId;
    setPendingOpenTodoId(todoId);
  }, []);

  const requestGoalWishlistSuggestionsForTodo = useCallback(async (todo: TodoItem, options?: { openDetailsOnResolve?: boolean }) => {
    if (todo.workspace !== 'Goals') {
      return false;
    }

    const shouldAutoOpenDetails = !!options?.openDetailsOnResolve;
    const autoOpenVersion = goalWishlistAutoOpenVersionRef.current;

    if (shownGoalWishlistSuggestionTodoIdsRef.current.has(todo.id)) {
      if (shouldAutoOpenDetails && goalWishlistAutoOpenVersionRef.current === autoOpenVersion) {
        queueGoalWishlistAutoOpen(todo.id);
      }
      return false;
    }

    try {
      const result = await requestGoalWishlistSuggestions({
        goalTitle: todo.text,
        goalDetails: todo.details,
        timeframe: todo.goalTimeframe,
        taskKind: todo.taskKind,
      });

      if (!result.suggestions.length) {
        if (shouldAutoOpenDetails && goalWishlistAutoOpenVersionRef.current === autoOpenVersion) {
          queueGoalWishlistAutoOpen(todo.id);
        }
        return false;
      }

      const openDetailsOnResolve = shouldAutoOpenDetails
        && goalWishlistAutoOpenVersionRef.current === autoOpenVersion;

      shownGoalWishlistSuggestionTodoIdsRef.current.add(todo.id);
      setGoalWishlistSuggestionToast({
        goalId: todo.id,
        goalTitle: todo.text,
        suggestions: result.suggestions,
        selectedItemNames: new Set(result.suggestions.map((suggestion) => suggestion.itemName)),
        isAdded: false,
        openDetailsOnResolve,
      });
      return true;
    } catch {
      if (shouldAutoOpenDetails && goalWishlistAutoOpenVersionRef.current === autoOpenVersion) {
        queueGoalWishlistAutoOpen(todo.id);
      }
      return false;
    }
  }, [queueGoalWishlistAutoOpen]);

  const dismissGoalWishlistSuggestionToast = useCallback(() => {
    const goalIdToOpen = goalWishlistSuggestionToast?.openDetailsOnResolve
      && selectedTodoForDetails?.id !== goalWishlistSuggestionToast.goalId
      ? goalWishlistSuggestionToast.goalId
      : null;
    setGoalWishlistSuggestionToast(null);
    if (goalIdToOpen) {
      queueGoalWishlistAutoOpen(goalIdToOpen);
    }
  }, [goalWishlistSuggestionToast, queueGoalWishlistAutoOpen, selectedTodoForDetails?.id]);

  const toggleGoalWishlistSuggestionItem = useCallback((itemName: string) => {
    setGoalWishlistSuggestionToast((current) => {
      if (!current || current.isAdded) {
        return current;
      }

      const selectedItemNames = new Set(current.selectedItemNames);
      if (selectedItemNames.has(itemName)) {
        selectedItemNames.delete(itemName);
      } else {
        selectedItemNames.add(itemName);
      }

      return {
        ...current,
        selectedItemNames,
      };
    });
  }, []);

  const handleAddGoalWishlistSuggestionsToWishlist = useCallback(async () => {
    if (!goalWishlistSuggestionToast || goalWishlistSuggestionToast.isAdded || isAddingGoalWishlistSuggestions) {
      return;
    }

    const selectedSuggestions = goalWishlistSuggestionToast.suggestions
      .filter((suggestion) => goalWishlistSuggestionToast.selectedItemNames.has(suggestion.itemName))
      .map((suggestion) => normalizeGoalWishlistSuggestionItemName(suggestion.itemName))
      .filter(Boolean);

    if (!selectedSuggestions.length) {
      return;
    }

    setIsAddingGoalWishlistSuggestions(true);

    try {
      const results = await Promise.all(selectedSuggestions.map((itemName) => createTodo({
        text: itemName,
        completed: false,
        details: undefined,
        dueDate: startOfDay(new Date()),
        hasDueTime: false,
        starred: false,
        workspace: 'Wishlist',
        goalTimeframe: null,
        type: 'basic',
        progress: 0,
        isAmazonUrlLoaded: false,
        amazonUrlLoadAttempts: 0,
      })));

      results.forEach((result) => handleReminderResult(result.reminderStatus));
      await refreshLocalTodos();
      setExpandedSections((current) => ({
        ...current,
        Wishlist: {
          ...(current.Wishlist || {}),
          wishlist: true,
        },
      }));
      const goalIdToOpen = goalWishlistSuggestionToast.openDetailsOnResolve
        && selectedTodoForDetails?.id !== goalWishlistSuggestionToast.goalId
        ? goalWishlistSuggestionToast.goalId
        : null;
      setGoalWishlistSuggestionToast((current) => current?.goalId === goalWishlistSuggestionToast.goalId ? null : current);
      if (goalIdToOpen) {
        queueGoalWishlistAutoOpen(goalIdToOpen);
      }
    } catch (error) {
      console.error('Error adding goal wishlist suggestions:', error);
      Alert.alert('Could not add items', String((error as any)?.message || error));
    } finally {
      setIsAddingGoalWishlistSuggestions(false);
    }
  }, [
    goalWishlistSuggestionToast,
    handleReminderResult,
    isAddingGoalWishlistSuggestions,
    queueGoalWishlistAutoOpen,
    refreshLocalTodos,
    selectedTodoForDetails?.id,
  ]);

  const handleAddGuidancePurchaseToWishlist = useCallback(async (rawItemName: string) => {
    const itemName = normalizeWishlistItemName(rawItemName);
    if (!itemName) {
      return;
    }

    try {
      const result = await createTodo({
        text: itemName,
        completed: false,
        details: undefined,
        dueDate: startOfDay(new Date()),
        hasDueTime: false,
        starred: false,
        workspace: 'Wishlist',
        goalTimeframe: null,
        type: 'basic',
        progress: 0,
        isAmazonUrlLoaded: false,
        amazonUrlLoadAttempts: 0,
      });
      handleReminderResult(result.reminderStatus);
      await refreshLocalTodos();
      setExpandedSections((current) => ({
        ...current,
        Wishlist: {
          ...(current.Wishlist || {}),
          wishlist: true,
        },
      }));
      Alert.alert('Added to Wishlist', `"${itemName}" is in Wishlist.`);
    } catch (error) {
      console.error('Error adding guidance purchase to wishlist:', error);
      Alert.alert('Could not add item', String((error as any)?.message || error));
    }
  }, [handleReminderResult, refreshLocalTodos]);

  const runVideoRefinement = useCallback(async (input: any) => {
    const refinementText = String(input.text || '').trim();
    if (!refinementText) {
      return;
    }

    input.seenVideoIdsRef.current = extendSeenVideoIds(
      input.seenVideoIdsRef.current,
      input.guide.videos,
      input.guide.selectedVideo?.videoId ? [input.guide.selectedVideo.videoId] : []
    );
    const previousVideoIds = Array.from(input.seenVideoIdsRef.current) as string[];
    const nextConversation = [
      ...input.guide.conversation,
      { role: 'user' as const, content: refinementText },
    ];

    input.clearInput();
    input.setWorking(true);
    input.setActive(true);
    input.clearNotice();

    try {
      const result = await input.requestVideos({
        excludeVideoIds: previousVideoIds,
        refinementText,
        previousQuery: input.searchQueryRef.current,
        previousVideos: input.guide.videos,
      });
      if (!result.videos.length) {
        throw new Error(input.emptyErrorMessage);
      }

      input.searchQueryRef.current = result.query;
      input.seenVideoIdsRef.current = extendSeenVideoIds(
        input.seenVideoIdsRef.current,
        result.videos,
        previousVideoIds
      );
      input.returnToSteps();
      input.beforeSave?.();
      const savedGuide = await input.saveGuide({
        todoId: input.todoId,
        videos: result.videos,
        selectedVideo: null,
        steps: [],
        conversation: [
          ...nextConversation,
          { role: 'assistant' as const, content: input.successMessage },
        ],
        activeStepIndex: 0,
        status: 'videos',
        errorMessage: '',
        transcriptLanguage: '',
        ...(input.savedFields || {}),
      });
      input.onGuideSaved(savedGuide);
    } catch (error) {
      console.error(input.logLabel, error);
      const savedGuide = await input.saveGuide({
        todoId: input.todoId,
        conversation: nextConversation,
        status: 'error',
        errorMessage: String((error as any)?.message || error || input.fallbackErrorMessage),
      });
      input.onGuideSaved(savedGuide);
    } finally {
      input.setWorking(false);
    }
  }, []);

  const submitRecipeVideoRefinement = useCallback(async (text: string) => {
    if (!selectedTodoForDetails || !recipeGuidanceContext || !recipeGuide || isRecipeWorking) {
      return;
    }

    await runVideoRefinement({
      text,
      todoId: selectedTodoForDetails.id,
      guide: recipeGuide,
      clearInput: () => setRecipeInputValue(''),
      setWorking: setIsRecipeWorking,
      setActive: setIsRecipeGuidanceAiActive,
      clearNotice: clearRecipeNotice,
      requestVideos: async (request: any) => requestRecipeVideos({
        context: recipeGuidanceContext,
        answers: recipeAnswersDraft,
        ...request,
        previousVideos: request.previousVideos as RecipeVideo[],
      }),
      searchQueryRef: recipeVideoSearchQueryRef,
      seenVideoIdsRef: recipeSeenVideoIdsRef,
      saveGuide: (fields: any) => saveRecipeGuide(fields as Parameters<typeof saveRecipeGuide>[0]),
      onGuideSaved: (guide: any) => handleRecipeGuideSaved(guide as RecipeGuide, { preserveOptimisticIngredients: false }),
      returnToSteps: returnToRecipeSteps,
      successMessage: 'I found new recipe videos for that request.',
      emptyErrorMessage: 'No regular recipe videos were found. Try a more specific request.',
      fallbackErrorMessage: 'Could not find better videos.',
      logLabel: 'Error refining recipe videos:',
      savedFields: {
        answers: recipeAnswersDraft,
        ingredients: [],
        equipment: [],
      },
      beforeSave: () => {
        pendingRecipeIngredientSaveRef.current = null;
      },
    });
  }, [
    clearRecipeNotice,
    handleRecipeGuideSaved,
    isRecipeWorking,
    recipeAnswersDraft,
    recipeGuide,
    recipeGuidanceContext,
    returnToRecipeSteps,
    runVideoRefinement,
    selectedTodoForDetails,
    setRecipeInputValue,
  ]);

  const submitSkillVideoRefinement = useCallback(async (text: string) => {
    if (!selectedTodoForDetails || !skillGuidanceContext || !skillGuide || isSkillWorking) {
      return;
    }

    await runVideoRefinement({
      text,
      todoId: selectedTodoForDetails.id,
      guide: skillGuide,
      clearInput: () => setSkillInputValue(''),
      setWorking: setIsSkillWorking,
      setActive: setIsSkillGuidanceAiActive,
      clearNotice: clearSkillNotice,
      requestVideos: async (request: any) => requestSkillVideos({
        context: skillGuidanceContext,
        ...request,
        previousVideos: request.previousVideos as SkillVideo[],
      }),
      searchQueryRef: skillVideoSearchQueryRef,
      seenVideoIdsRef: skillSeenVideoIdsRef,
      saveGuide: (fields: any) => saveSkillGuide(fields as Parameters<typeof saveSkillGuide>[0]),
      onGuideSaved: handleSkillGuideSaved,
      returnToSteps: returnToSkillSteps,
      successMessage: 'I found new videos for that request.',
      emptyErrorMessage: 'No regular videos were found. Try a more specific request.',
      fallbackErrorMessage: 'Could not find better videos.',
      logLabel: 'Error refining videos:',
    });
  }, [
    clearSkillNotice,
    handleSkillGuideSaved,
    isSkillWorking,
    returnToSkillSteps,
    runVideoRefinement,
    selectedTodoForDetails,
    setSkillInputValue,
    skillGuide,
    skillGuidanceContext,
  ]);

  const handleGuidanceWishlistPurchaseIntent = useCallback(async (input: {
    surface: WishlistPurchaseIntentSurface;
    message: string;
    contextTitle?: string;
    contextDetails?: string;
    recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    clearInput: () => void;
  }) => {
    const message = input.message.trim();
    if (!message) {
      return false;
    }
    if (isCheckingWishlistPurchaseIntentRef.current) {
      return true;
    }

    input.clearInput();
    Keyboard.dismiss();
    isCheckingWishlistPurchaseIntentRef.current = true;
    setIsCheckingWishlistPurchaseIntent(true);
    try {
      const result = await requestWishlistPurchaseIntent({
        message,
        surface: input.surface,
        contextTitle: input.contextTitle,
        contextDetails: input.contextDetails,
        recentMessages: input.recentMessages,
      });

      if (!result.hasPurchaseIntent || !result.itemName) {
        return false;
      }

      Alert.alert(
        'Add to Wishlist?',
        `Add "${result.itemName}" to Wishlist?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add',
            onPress: () => {
              void handleAddGuidancePurchaseToWishlist(result.itemName!);
            },
          },
        ]
      );
      return true;
    } catch (error) {
      console.warn('Wishlist purchase intent check failed:', error);
      return false;
    } finally {
      isCheckingWishlistPurchaseIntentRef.current = false;
      setIsCheckingWishlistPurchaseIntent(false);
    }
  }, [handleAddGuidancePurchaseToWishlist]);

  const runGuidanceSubmitWithWishlist = useCallback(async (input: {
    surface: WishlistPurchaseIntentSurface;
    message: string;
    contextTitle?: string;
    contextDetails?: string;
    recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    clearInput: () => void;
    fallback: () => Promise<void>;
  }) => {
    if (
      await handleGuidanceWishlistPurchaseIntent({
        surface: input.surface,
        message: input.message,
        contextTitle: input.contextTitle,
        contextDetails: input.contextDetails,
        recentMessages: input.recentMessages,
        clearInput: input.clearInput,
      })
    ) {
      return;
    }

    await input.fallback();
  }, [handleGuidanceWishlistPurchaseIntent]);

  const submitGoalGuidanceWithWishlist = useCallback(() => runGuidanceSubmitWithWishlist({
    surface: 'goal',
    message: goalGuidanceInputValue,
    contextTitle: goalGuidanceContext?.goalTitle,
    contextDetails: goalGuidanceContext?.goalDetails,
    recentMessages: goalGuidanceConversation,
    clearInput: () => setGoalGuidanceInputValue(''),
    fallback: () => submitGoalGuidanceText(goalGuidanceInputValue),
  }), [goalGuidanceContext?.goalDetails, goalGuidanceContext?.goalTitle, goalGuidanceConversation, goalGuidanceInputValue, runGuidanceSubmitWithWishlist, setGoalGuidanceInputValue, submitGoalGuidanceText]);

  const submitGoalGuidanceTextWithWishlist = useCallback((text: string) => runGuidanceSubmitWithWishlist({
    surface: 'goal',
    message: text,
    contextTitle: goalGuidanceContext?.goalTitle,
    contextDetails: goalGuidanceContext?.goalDetails,
    recentMessages: goalGuidanceConversation,
    clearInput: () => setGoalGuidanceInputValue(''),
    fallback: () => submitGoalGuidanceText(text),
  }), [goalGuidanceContext?.goalDetails, goalGuidanceContext?.goalTitle, goalGuidanceConversation, runGuidanceSubmitWithWishlist, setGoalGuidanceInputValue, submitGoalGuidanceText]);

  const shouldRefineRecipeVideosFromChat =
    !!recipeGuide &&
    (recipeGuide.status === 'videos' || (recipeGuide.status === 'error' && recipeGuide.videos.length > 0));
  const shouldRefineSkillVideosFromChat =
    !!skillGuide &&
    (skillGuide.status === 'videos' || (skillGuide.status === 'error' && skillGuide.videos.length > 0));

  const submitRecipeQuestionWithWishlist = useCallback(() => runGuidanceSubmitWithWishlist({
    surface: 'recipe',
    message: recipeInputValue,
    contextTitle: recipeGuidanceContext?.title,
    contextDetails: recipeGuidanceContext?.details,
    recentMessages: recipeConversation,
    clearInput: () => setRecipeInputValue(''),
    fallback: () => shouldRefineRecipeVideosFromChat
      ? submitRecipeVideoRefinement(recipeInputValue)
      : submitRecipeQuestionText(recipeInputValue),
  }), [recipeConversation, recipeGuidanceContext?.details, recipeGuidanceContext?.title, recipeInputValue, runGuidanceSubmitWithWishlist, setRecipeInputValue, shouldRefineRecipeVideosFromChat, submitRecipeQuestionText, submitRecipeVideoRefinement]);

  const submitRecipeQuestionTextWithWishlist = useCallback((text: string) => runGuidanceSubmitWithWishlist({
    surface: 'recipe',
    message: text,
    contextTitle: recipeGuidanceContext?.title,
    contextDetails: recipeGuidanceContext?.details,
    recentMessages: recipeConversation,
    clearInput: () => setRecipeInputValue(''),
    fallback: () => shouldRefineRecipeVideosFromChat
      ? submitRecipeVideoRefinement(text)
      : submitRecipeQuestionText(text),
  }), [recipeConversation, recipeGuidanceContext?.details, recipeGuidanceContext?.title, runGuidanceSubmitWithWishlist, setRecipeInputValue, shouldRefineRecipeVideosFromChat, submitRecipeQuestionText, submitRecipeVideoRefinement]);

  const submitSkillQuestionWithWishlist = useCallback(() => runGuidanceSubmitWithWishlist({
    surface: 'skill',
    message: skillInputValue,
    contextTitle: skillGuidanceContext?.title,
    contextDetails: skillGuidanceContext?.details,
    recentMessages: skillConversation,
    clearInput: () => setSkillInputValue(''),
    fallback: () => shouldRefineSkillVideosFromChat
      ? submitSkillVideoRefinement(skillInputValue)
      : submitSkillQuestionText(skillInputValue),
  }), [runGuidanceSubmitWithWishlist, setSkillInputValue, shouldRefineSkillVideosFromChat, skillConversation, skillGuidanceContext?.details, skillGuidanceContext?.title, skillInputValue, submitSkillQuestionText, submitSkillVideoRefinement]);

  const submitSkillQuestionTextWithWishlist = useCallback((text: string) => runGuidanceSubmitWithWishlist({
    surface: 'skill',
    message: text,
    contextTitle: skillGuidanceContext?.title,
    contextDetails: skillGuidanceContext?.details,
    recentMessages: skillConversation,
    clearInput: () => setSkillInputValue(''),
    fallback: () => shouldRefineSkillVideosFromChat
      ? submitSkillVideoRefinement(text)
      : submitSkillQuestionText(text),
  }), [runGuidanceSubmitWithWishlist, setSkillInputValue, shouldRefineSkillVideosFromChat, skillConversation, skillGuidanceContext?.details, skillGuidanceContext?.title, submitSkillQuestionText, submitSkillVideoRefinement]);

  const submitTaskGuidanceWithWishlist = useCallback(() => runGuidanceSubmitWithWishlist({
    surface: 'task',
    message: taskInputValue,
    contextTitle: taskGuidanceContext?.title,
    contextDetails: taskGuidanceContext?.details,
    recentMessages: taskGuidanceConversation,
    clearInput: () => setTaskInputValue(''),
    fallback: () => submitTaskGuidanceText(taskInputValue),
  }), [runGuidanceSubmitWithWishlist, setTaskInputValue, submitTaskGuidanceText, taskGuidanceContext?.details, taskGuidanceContext?.title, taskGuidanceConversation, taskInputValue]);

  const submitTaskGuidanceTextWithWishlist = useCallback((text: string) => runGuidanceSubmitWithWishlist({
    surface: 'task',
    message: text,
    contextTitle: taskGuidanceContext?.title,
    contextDetails: taskGuidanceContext?.details,
    recentMessages: taskGuidanceConversation,
    clearInput: () => setTaskInputValue(''),
    fallback: () => submitTaskGuidanceText(text),
  }), [runGuidanceSubmitWithWishlist, setTaskInputValue, submitTaskGuidanceText, taskGuidanceContext?.details, taskGuidanceContext?.title, taskGuidanceConversation]);

  const {
    isListening: isCompactListening,
    microphoneColor: compactMicrophoneColor,
    handleMicrophonePress: handleCompactVoiceMicrophonePress,
    cancelListening: cancelCompactVoiceListening,
  } = useCompactVoiceInput({
    inputValue,
    setInputValue,
    glowAnim,
    onFinalTranscript: submitVoiceText,
  });
  const {
    isListening: isGoalGuidanceListening,
    microphoneColor: goalGuidanceMicrophoneColor,
    handleMicrophonePress: handleGoalGuidanceVoiceMicrophonePress,
    cancelListening: cancelGoalGuidanceVoiceListening,
  } = useCompactVoiceInput({
    inputValue: goalGuidanceInputValue,
    setInputValue: setGoalGuidanceInputValue,
    glowAnim,
    onFinalTranscript: submitGoalGuidanceTextWithWishlist,
  });
  const {
    isListening: isRecipeListening,
    microphoneColor: recipeMicrophoneColor,
    handleMicrophonePress: handleRecipeVoiceMicrophonePress,
    cancelListening: cancelRecipeVoiceListening,
  } = useCompactVoiceInput({
    inputValue: recipeInputValue,
    setInputValue: setRecipeInputValue,
    glowAnim,
    onFinalTranscript: submitRecipeQuestionTextWithWishlist,
  });
  const {
    isListening: isSkillListening,
    microphoneColor: skillMicrophoneColor,
    handleMicrophonePress: handleSkillVoiceMicrophonePress,
    cancelListening: cancelSkillVoiceListening,
  } = useCompactVoiceInput({
    inputValue: skillInputValue,
    setInputValue: setSkillInputValue,
    glowAnim,
    onFinalTranscript: submitSkillQuestionTextWithWishlist,
  });
  const {
    isListening: isTaskGuidanceListening,
    microphoneColor: taskGuidanceMicrophoneColor,
    handleMicrophonePress: handleTaskGuidanceVoiceMicrophonePress,
    cancelListening: cancelTaskGuidanceVoiceListening,
  } = useCompactVoiceInput({
    inputValue: taskInputValue,
    setInputValue: setTaskInputValue,
    glowAnim,
    onFinalTranscript: submitTaskGuidanceTextWithWishlist,
  });
  const isGoalGuidanceInputActive =
    isDetailsModalVisible &&
    isGoalGuidanceEligible &&
    (isGoalGuidanceAiActive || !!goalGuidancePlan);
  const isRecipeGuidanceInputActive =
    isDetailsModalVisible &&
    !!recipeGuidanceContext &&
    (isRecipeGuidanceAiActive || !!recipeGuide);
  const isSkillGuidanceInputActive =
    isDetailsModalVisible &&
    !!skillGuidanceContext &&
    (isSkillGuidanceAiActive || !!skillGuide);
  const isTaskGuidanceInputActive =
    isDetailsModalVisible &&
    !!taskGuidanceContext &&
    !isRecipeGuidanceInputActive &&
    !isSkillGuidanceInputActive &&
    (isTaskGuidanceAiActive || !!taskGuide);
  const activeAiInputValue = isRecipeGuidanceInputActive
    ? recipeInputValue
    : isSkillGuidanceInputActive
      ? skillInputValue
      : isGoalGuidanceInputActive
        ? goalGuidanceInputValue
        : isTaskGuidanceInputActive
          ? taskInputValue
          : inputValue;
  const activeSetAiInputValue = isRecipeGuidanceInputActive
    ? setRecipeInputValue
    : isSkillGuidanceInputActive
      ? setSkillInputValue
      : isGoalGuidanceInputActive
        ? setGoalGuidanceInputValue
        : isTaskGuidanceInputActive
          ? setTaskInputValue
          : setInputValue;
  const activeSubmitAi = isRecipeGuidanceInputActive
    ? submitRecipeQuestionWithWishlist
    : isSkillGuidanceInputActive
      ? submitSkillQuestionWithWishlist
      : isGoalGuidanceInputActive
        ? submitGoalGuidanceWithWishlist
        : isTaskGuidanceInputActive
          ? submitTaskGuidanceWithWishlist
          : submit;
  const activeIsAiRunning = isCheckingWishlistPurchaseIntent || (
    isRecipeGuidanceInputActive
      ? isRecipeAiRunning || isRecipeWorking
      : isSkillGuidanceInputActive
        ? isSkillAiRunning || isSkillWorking
        : isGoalGuidanceInputActive
          ? isGoalGuidanceRunning
          : isTaskGuidanceInputActive
            ? isTaskGuidanceRunning
            : isAiRunning
  );
  const activeIsListening = isRecipeGuidanceInputActive
    ? isRecipeListening
    : isSkillGuidanceInputActive
      ? isSkillListening
      : isGoalGuidanceInputActive
        ? isGoalGuidanceListening
        : isTaskGuidanceInputActive
          ? isTaskGuidanceListening
          : isCompactListening;
  const activeMicrophoneColor = isRecipeGuidanceInputActive
    ? recipeMicrophoneColor
    : isSkillGuidanceInputActive
      ? skillMicrophoneColor
      : isGoalGuidanceInputActive
        ? goalGuidanceMicrophoneColor
        : isTaskGuidanceInputActive
          ? taskGuidanceMicrophoneColor
          : compactMicrophoneColor;
  const isGoalGuidanceAwaitingReply =
    goalGuidanceNotice?.kind === 'clarify' ||
    (
      !!goalGuidancePlan &&
      goalGuidancePlan.status === 'preview' &&
      goalGuidancePlan.steps.length === 0 &&
      goalGuidancePlan.feasibilityStatus !== 'unrealistic'
    );
  const isTaskGuidanceAwaitingReply =
    taskGuidanceNotice?.kind === 'clarify' ||
    (!!taskGuide && taskGuide.status === 'preview' && taskGuide.steps.length === 0);
  const activeAiPlaceholder = isRecipeGuidanceInputActive
    ? (recipeGuide?.status === 'ready'
        ? 'Ask about this recipe'
        : shouldRefineRecipeVideosFromChat
          ? 'Ask for different videos'
          : 'Finish the recipe guide first')
    : isSkillGuidanceInputActive
      ? (skillGuide?.status === 'ready'
          ? 'Ask about this video guide'
          : shouldRefineSkillVideosFromChat
            ? 'Ask for different videos'
            : 'Finish the video guide first')
    : isGoalGuidanceInputActive
    ? (isGoalGuidanceAwaitingReply ? 'Reply to guidance' : 'Ask guidance')
    : isTaskGuidanceInputActive
      ? (isTaskGuidanceAwaitingReply ? 'Reply to guidance' : 'Ask guidance')
      : (aiNotice?.kind === 'clarify' || aiNotice?.kind === 'confirm' ? 'Reply here' : '');

  const scrollGoalGuidanceIntoView = useCallback(() => {
    const scrollToGuidance = () => {
      detailsScrollRef.current?.scrollTo({
        y: Math.max(0, goalGuidanceSectionYRef.current - 12),
        animated: true,
      });
    };

    scrollToGuidance();
    setTimeout(scrollToGuidance, 260);
  }, []);
  const scrollRecipeGuidanceIntoView = useCallback(() => {
    const scrollToRecipe = () => {
      detailsScrollRef.current?.scrollTo({
        y: Math.max(0, recipeGuidanceSectionYRef.current - 12),
        animated: true,
      });
    };

    scrollToRecipe();
    setTimeout(scrollToRecipe, 260);
  }, []);
  const scrollSkillGuidanceIntoView = useCallback(() => {
    const scrollToSkill = () => {
      detailsScrollRef.current?.scrollTo({
        y: Math.max(0, skillGuidanceSectionYRef.current - 12),
        animated: true,
      });
    };

    scrollToSkill();
    setTimeout(scrollToSkill, 260);
  }, []);
  const scrollTaskGuidanceIntoView = useCallback(() => {
    const scrollToTaskGuidance = () => {
      detailsScrollRef.current?.scrollTo({
        y: Math.max(0, taskGuidanceSectionYRef.current - 12),
        animated: true,
      });
    };

    scrollToTaskGuidance();
    setTimeout(scrollToTaskGuidance, 260);
  }, []);

  const handleActiveAiFocus = useCallback(() => {
    setIsAiInputFocused(true);
    setIsAiKeyboardSessionActive(true);
    if (isRecipeGuidanceInputActive) {
      scrollRecipeGuidanceIntoView();
      return;
    }

    if (isSkillGuidanceInputActive) {
      scrollSkillGuidanceIntoView();
      return;
    }

    if (isGoalGuidanceInputActive) {
      scrollGoalGuidanceIntoView();
      return;
    }

    if (isTaskGuidanceInputActive) {
      scrollTaskGuidanceIntoView();
    }
  }, [isGoalGuidanceInputActive, isRecipeGuidanceInputActive, isSkillGuidanceInputActive, isTaskGuidanceInputActive, scrollGoalGuidanceIntoView, scrollRecipeGuidanceIntoView, scrollSkillGuidanceIntoView, scrollTaskGuidanceIntoView]);

  const handleActiveAiSubmit = useCallback(() => {
    Keyboard.dismiss();

    if (isRecipeGuidanceInputActive) {
      scrollRecipeGuidanceIntoView();
      void submitRecipeQuestionWithWishlist();
      return;
    }

    if (isSkillGuidanceInputActive) {
      scrollSkillGuidanceIntoView();
      void submitSkillQuestionWithWishlist();
      return;
    }

    if (isGoalGuidanceInputActive) {
      if (
        goalGuidancePlan?.status === 'preview' &&
        goalGuidancePlan.timeframe === 'thisWeek' &&
        goalGuidancePlan.feasibilityStatus === 'unrealistic' &&
        isMonthlyGoalGuidanceSwitchRequest(goalGuidanceInputValue) &&
        useMonthlyGoalGuidanceRef.current
      ) {
        setGoalGuidanceInputValue('');
        scrollGoalGuidanceIntoView();
        void useMonthlyGoalGuidanceRef.current();
        return;
      }

      scrollGoalGuidanceIntoView();
      void activeSubmitAi();
      return;
    }

    if (isTaskGuidanceInputActive) {
      scrollTaskGuidanceIntoView();
    }
    void activeSubmitAi();
  }, [
    activeSubmitAi,
    goalGuidanceInputValue,
    goalGuidancePlan,
    isGoalGuidanceInputActive,
    isRecipeGuidanceInputActive,
    isSkillGuidanceInputActive,
    isTaskGuidanceInputActive,
    scrollGoalGuidanceIntoView,
    scrollRecipeGuidanceIntoView,
    scrollSkillGuidanceIntoView,
    scrollTaskGuidanceIntoView,
    setGoalGuidanceInputValue,
    submitRecipeQuestionWithWishlist,
    submitSkillQuestionWithWishlist,
  ]);

  const handleMicrophonePress = useCallback(() => {
    micWorkspaceIndexRef.current = currentWorkspaceRef.current;
    setShowSpeechOverlay(false);
    setSpeechOverlayText('');
    if (isRecipeGuidanceInputActive) {
      handleRecipeVoiceMicrophonePress();
      return;
    }

    if (isSkillGuidanceInputActive) {
      handleSkillVoiceMicrophonePress();
      return;
    }

    if (isGoalGuidanceInputActive) {
      handleGoalGuidanceVoiceMicrophonePress();
      return;
    }

    if (isTaskGuidanceInputActive) {
      handleTaskGuidanceVoiceMicrophonePress();
      return;
    }

    handleCompactVoiceMicrophonePress();
  }, [handleCompactVoiceMicrophonePress, handleGoalGuidanceVoiceMicrophonePress, handleRecipeVoiceMicrophonePress, handleSkillVoiceMicrophonePress, handleTaskGuidanceVoiceMicrophonePress, isGoalGuidanceInputActive, isRecipeGuidanceInputActive, isSkillGuidanceInputActive, isTaskGuidanceInputActive]);

  const handleTodoAiSendPress = useCallback(() => {
    if (isAiRunning || !inputValue.trim()) {
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void submit();
  }, [inputValue, isAiRunning, submit]);

  const handleTodoDetailsAiSendPress = useCallback(() => {
    if (activeIsAiRunning || !activeAiInputValue.trim()) {
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (
      isGoalGuidanceTutorialPendingRef.current &&
      activeTarget?.type === 'screen' &&
      (
        activeTarget.params?.todoAction === 'tutorial-goal-ai-bar' ||
        activeTarget.params?.todoAction === 'tutorial-goal-eazee-button'
      )
    ) {
      cancelGuidance();
      goalGuidanceTutorialStageRef.current = null;
    }
    handleActiveAiSubmit();
  }, [activeAiInputValue, activeIsAiRunning, activeTarget, cancelGuidance, handleActiveAiSubmit]);

  const handleTodoAiMicrophonePress = useCallback(() => {
    if (isAiRunning) {
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    handleMicrophonePress();
  }, [handleMicrophonePress, isAiRunning]);

  const handleTodoDetailsAiMicrophonePress = useCallback(() => {
    if (activeIsAiRunning) {
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    handleMicrophonePress();
  }, [activeIsAiRunning, handleMicrophonePress]);

  useEffect(() => {
    const replyNotice =
      aiNotice?.kind === 'clarify' || aiNotice?.kind === 'confirm' ? aiNotice : null;

    if (!replyNotice || isAiRunning) {
      const shouldCancelReplyMic = autoReplyMicNoticeRef.current !== null;
      autoReplyMicNoticeRef.current = null;
      if (shouldCancelReplyMic && isCompactListening) {
        void cancelCompactVoiceListening();
      }
      return;
    }

    // A typed request gets its follow-up question without the mic switching on.
    if (autoReplyMicNoticeRef.current === replyNotice || isCompactListening || !wasLastRequestSpoken()) {
      return;
    }

    autoReplyMicNoticeRef.current = replyNotice;
    micWorkspaceIndexRef.current = currentWorkspaceRef.current;
    setShowSpeechOverlay(false);
    setSpeechOverlayText('');
    handleCompactVoiceMicrophonePress();
  }, [aiNotice, cancelCompactVoiceListening, handleCompactVoiceMicrophonePress, isAiRunning, isCompactListening, wasLastRequestSpoken]);

  // Auto-hide overlay after processing completes and we're no longer listening
  useEffect(() => {
    if (!isProcessing && !activeIsListening) {
      setShowSpeechOverlay(false);
      setSpeechOverlayText('');
    }
  }, [activeIsListening, isProcessing]);

  useEffect(() => {
    if (isDetailsModalVisible && isGoalGuidanceInputActive && goalGuidanceAnswerText) {
      scrollGoalGuidanceIntoView();
    }
  }, [goalGuidanceAnswerText, isDetailsModalVisible, isGoalGuidanceInputActive, scrollGoalGuidanceIntoView]);

  useEffect(() => {
    if (isDetailsModalVisible && isRecipeGuidanceInputActive && recipeAnswerText) {
      scrollRecipeGuidanceIntoView();
    }
  }, [isDetailsModalVisible, isRecipeGuidanceInputActive, recipeAnswerText, scrollRecipeGuidanceIntoView]);

  useEffect(() => {
    if (isDetailsModalVisible && isSkillGuidanceInputActive && skillAnswerText) {
      scrollSkillGuidanceIntoView();
    }
  }, [isDetailsModalVisible, isSkillGuidanceInputActive, scrollSkillGuidanceIntoView, skillAnswerText]);

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
      }).start(({ finished }) => {
        if (finished) {
          setIsAiKeyboardSessionActive(false);
        }
      });
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
    const todoTabTint = workspaces[currentWorkspace]?.key === 'Wishlist' ? '#31C5CC' : '#258876';

    parent.setOptions({
      tabBarActiveTintColor: todoTabTint,
      tabBarInactiveTintColor: todoTabTint,
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
        display: isFocused && isKeyboardInteractionActive ? 'none' : 'flex',
      },
    });

    return () => {
      parent.setOptions({
        tabBarActiveTintColor: '#258876',
        tabBarInactiveTintColor: '#258876',
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
  }, [currentWorkspace, isFocused, isKeyboardInteractionActive, navigation, workspaces]);

  const handleTodoDragLongPress = useCallback((drag?: () => void) => {
    drag?.();
  }, []);

  const handleTodoSectionDragRelease = useCallback(() => {
    setIsTodoDragActive(false);
  }, []);

  const handleMoveToCalendar = useCallback(async (todoToMove?: TodoItem) => {
    if (isMovingTodoToCalendarRef.current) {
      return;
    }

    const todoForCalendar = todoToMove || selectedTodoForDetails;
    if (!todoForCalendar) {
      return;
    }

    isMovingTodoToCalendarRef.current = true;
    setIsMovingTodoToCalendar(true);

    try {
      const eventsCollection = database.get<EventModel>('events');
      const existingCalendarEvents = await eventsCollection
        .query(Q.where('source_todo_id', todoForCalendar.id))
        .fetch();

      if (existingCalendarEvents.length > 0) {
        setTimeout(() => setDetailsReminderNotice(TODO_ALREADY_SENT_TO_CALENDAR_NOTICE), 250);
        return;
      }

      const startDate = getTodoCalendarStartDate(todoForCalendar);
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 1);

      await database.write(async () => {
        await eventsCollection.create((event) => {
          event.title = todoForCalendar.text;
          event.details = todoForCalendar.details || '';
          event.startDate = startDate;
          event.startTime = startDate.getHours();
          event.endDate = endDate;
          event.endTime = endDate.getHours();
          event.isGoogleEvent = false;
          event.isTodo = true;
          event.sourceTodoId = todoForCalendar.id;
        });
      });
      // Without its own reminder, the task's new event gets the Event Reminder.
      void syncEventReminders();

      if (selectedTodoForDetails?.id === todoForCalendar.id && isDetailsModalVisible) {
        resetDetailsModalStateRef.current();
      }
      router.push({
        pathname: '/(tabs)/calendar',
        params: {
          scrollToDateTime: startDate.toISOString(),
          scrollNonce: String(Date.now()),
        },
      });
    } catch (error) {
      console.error('Error moving todo to calendar:', error);
    } finally {
      isMovingTodoToCalendarRef.current = false;
      setIsMovingTodoToCalendar(false);
    }
  }, [isDetailsModalVisible, router, selectedTodoForDetails]);

  const handleDeleteTodo = async () => {
    const todoToDelete = selectedTodoForDetails;
    const isDeletingDetailsTodo = selectedTodoForDetails?.id === todoToDelete?.id;

    if (todoToDelete) {
      try {
        if (isDeletingDetailsTodo) {
          debouncedSaveDetails.cancel();
        }
        if (todoToDelete.workspace === 'Goals') {
          await deleteGoalGuidanceForGoal(todoToDelete.id);
        }
        const recurringDeleteScope = await getRecurringDeleteScope(todoToDelete);
        if (!recurringDeleteScope) {
          return;
        }
        if (todoToDelete.recurrenceSeriesId) {
          if (recurringDeleteScope === 'series') {
            await deleteRecurringTodoSeries(todoToDelete.id, { deleteCompletedHistory: !!todoToDelete.completed });
          } else if (recurringDeleteScope === 'completedHistory') {
            await deleteRecurringTodoCompletedHistory(todoToDelete.id);
          } else {
            await deleteRecurringTodoOccurrence(todoToDelete.id);
          }
        } else {
          await deleteTodo(todoToDelete.id);
        }
        const affectedPlan = await markGoalGuidanceActionDeleted(todoToDelete.id);
        if (affectedPlan && selectedTodoForDetails?.id === affectedPlan.goalId) {
          setGoalGuidancePlan(affectedPlan);
        }
        await refreshLocalTodos();

        if (isDeletingDetailsTodo) {
          handleCloseDetailsModal(false);
        }
      } catch (error) {
        console.error('Error deleting todo:', error);
        Alert.alert("Couldn't delete the task", 'Please try again.');
      }
    }
  };

  const handleToggleStarred = async () => {
    const todoToToggle = selectedTodoForDetails;
    if (todoToToggle) {
      try {
        const nextStarred = !todoToToggle.starred;
        updateTodoStateEverywhere(todoToToggle.id, { starred: nextStarred });
        await updateTodo(todoToToggle.id, { starred: nextStarred });
      } catch (error) {
        console.error('Error toggling starred status:', error);
        updateTodoStateEverywhere(todoToToggle.id, { starred: !!todoToToggle.starred });
      }
    }
  };


  const toggleSection = useCallback((section: TodoSectionKey, workspaceKey: string, renderedExpanded: boolean) => {
    // Read the latest state: a second quick tap can arrive before the first one re-renders the header.
    setExpandedSections(prev => ({
      ...prev,
      [workspaceKey]: {
        ...(prev[workspaceKey] || {}),
        [section]: !(prev[workspaceKey]?.[section] ?? renderedExpanded),
      }
    }));
  }, []);

  const hiddenFutureQuotaActionTodoIds = useMemo(() => {
    const goalsById = new Map(localTodos.filter((todo) => todo.workspace === 'Goals').map((todo) => [todo.id, todo]));
    const todosById = new Map(localTodos.map((todo) => [todo.id, todo]));
    const hiddenIds = new Set<string>();

    observedGoalGuidancePlans.forEach((plan) => {
      const goal = goalsById.get(plan.goalId);
      const behavior = parseGoalBehavior(goal?.goalBehaviorJson);
      if (!isQuotaGoalBehavior(behavior)) {
        return;
      }

      plan.activeActions.forEach((action) => {
        const todo = todosById.get(action.todoId);
        if (!todo?.dueDate || todo.completed) {
          return;
        }
        const daysUntilDue = differenceInCalendarDays(startOfDay(todo.dueDate), startOfDay(new Date()));
        if (daysUntilDue > 7) {
          hiddenIds.add(action.todoId);
        }
      });
    });

    return hiddenIds;
  }, [localTodos, observedGoalGuidancePlans]);

  const sortedTodos = useMemo(() => {
    const todayKey = startOfLocalDay(new Date()).getTime();
    const visibleRecurringTodoIds = new Set<string>();
    const recurringTodosBySeries = new Map<string, TodoItem[]>();
    const completedRecurringTodosBySeries = new Map<string, TodoItem & { workspace: string }>();

    localTodos.forEach((todo) => {
      if (!todo.recurrenceSeriesId) {
        return;
      }

      if (todo.completed) {
        const workspace = todo.workspace || workspaces[currentWorkspace]?.key || 'Personal';
        const current = completedRecurringTodosBySeries.get(todo.recurrenceSeriesId);
        const currentCount = current?.recurrenceCompletedCount || 0;
        const todoDateKey = getTodoOccurrenceDateKey(todo.recurrenceOccurrenceDate || todo.dueDate) || 0;
        const currentDateKey = current
          ? getTodoOccurrenceDateKey(current.recurrenceOccurrenceDate || current.dueDate) || 0
          : -1;
        const latestTodo = !current || todoDateKey >= currentDateKey ? { ...todo, workspace } : current;
        completedRecurringTodosBySeries.set(todo.recurrenceSeriesId, {
          ...latestTodo,
          recurrenceCompletedCount: currentCount + 1,
        });
        return;
      }

      const items = recurringTodosBySeries.get(todo.recurrenceSeriesId) || [];
      items.push(todo);
      recurringTodosBySeries.set(todo.recurrenceSeriesId, items);
    });

    recurringTodosBySeries.forEach((items) => {
      const ordered = [...items].sort((left, right) => {
        const leftKey = getTodoOccurrenceDateKey(left.recurrenceOccurrenceDate || left.dueDate) || 0;
        const rightKey = getTodoOccurrenceDateKey(right.recurrenceOccurrenceDate || right.dueDate) || 0;
        return leftKey - rightKey;
      });
      const dueOrMissed = ordered.filter((todo) => {
        const dateKey = getTodoOccurrenceDateKey(todo.recurrenceOccurrenceDate || todo.dueDate);
        return dateKey != null && dateKey <= todayKey;
      });
      const future = ordered.filter((todo) => {
        const dateKey = getTodoOccurrenceDateKey(todo.recurrenceOccurrenceDate || todo.dueDate);
        return dateKey != null && dateKey > todayKey;
      });

      if (dueOrMissed[0]) {
        visibleRecurringTodoIds.add(dueOrMissed[0].id);
      }
      if (future[0]) {
        visibleRecurringTodoIds.add(future[0].id);
      }
    });

    const groupedTodos = localTodos.reduce((acc, todo) => {
      if (hiddenFutureQuotaActionTodoIds.has(todo.id)) {
        return acc;
      }
      if (todo.recurrenceSeriesId && todo.completed) {
        return acc;
      }
      if (todo.recurrenceSeriesId && !visibleRecurringTodoIds.has(todo.id)) {
        return acc;
      }
      const workspace = todo.workspace || workspaces[currentWorkspace]?.key || 'Personal';
      const normalizedTodo = { ...todo, workspace };
      const category = getTodoSectionKey(normalizedTodo, weekStartsOn);

      acc[category].push(normalizedTodo);
      return acc;
    }, {
      today: [],
      upcoming: [],
      past: [],
      completed: [],
      wishlist: [],
      thisWeek: [],
      thisMonth: [],
      thisYear: [],
      longTerm: [],
    } as Record<TodoSectionKey, (TodoItem & { workspace: string })[]>);

    completedRecurringTodosBySeries.forEach((todo) => {
      groupedTodos.completed.push(todo);
    });

    return groupedTodos;
  }, [currentWorkspace, hiddenFutureQuotaActionTodoIds, localTodos, weekStartsOn, workspaces]);

  const getSectionSortScope = useCallback((workspace: string, sectionKey: TodoSectionKey) =>
    sectionKey === 'completed' ? `${workspace}:completed` : `${workspace}:${sectionKey}`,
  []);

  const sortTodosForSection = useCallback((
    items: (TodoItem & { workspace: string })[],
    workspace: string,
    sectionKey: TodoSectionKey
  ) => {
    const scope = getSectionSortScope(workspace, sectionKey);
    return sortTodosForSectionOrder(items, scope, todoSectionOrderOverridesRef.current[scope]);
  }, [getSectionSortScope]);

  const showWorkspacePage = useCallback((workspaceIndex: number) => {
    currentWorkspaceRef.current = workspaceIndex;
    setCurrentWorkspace(workspaceIndex);
    dotPositionAnim.setValue(workspaceIndex);
    const pager = pagerViewRef.current as (PagerView & {
      setPageWithoutAnimation?: (selectedPage: number) => void;
    }) | null;
    if (pager?.setPageWithoutAnimation) {
      pager.setPageWithoutAnimation(workspaceIndex);
      return;
    }
    pager?.setPage(workspaceIndex);
  }, [dotPositionAnim]);

  const clearPendingTodoReveal = useCallback(() => {
    if (pendingTodoRevealTimeoutRef.current) {
      clearTimeout(pendingTodoRevealTimeoutRef.current);
      pendingTodoRevealTimeoutRef.current = null;
    }
    pendingTodoRevealRef.current = null;
  }, []);

  const clearActiveTodoReveal = useCallback(() => {
    if (todoRevealGlowStartTimeoutRef.current) {
      clearTimeout(todoRevealGlowStartTimeoutRef.current);
      todoRevealGlowStartTimeoutRef.current = null;
    }
    todoRevealGlowAnimationRef.current?.stop();
    todoRevealGlowAnimationRef.current = null;
    todoRevealGlowAnim.stopAnimation(() => {
      todoRevealGlowAnim.setValue(0);
    });
    setActiveRevealTodoId(null);
  }, [todoRevealGlowAnim]);

  const schedulePendingTodoRevealAttempt = useCallback((delay = TODO_REVEAL_RETRY_MS) => {
    if (!pendingTodoRevealRef.current) {
      return;
    }

    if (pendingTodoRevealTimeoutRef.current) {
      clearTimeout(pendingTodoRevealTimeoutRef.current);
    }

    pendingTodoRevealTimeoutRef.current = setTimeout(() => {
      attemptPendingTodoRevealRef.current?.();
    }, delay);
  }, []);

  const startTodoRevealGlow = useCallback((todoId: string) => {
    clearActiveTodoReveal();
    setActiveRevealTodoId(todoId);
    todoRevealGlowAnim.setValue(0);

    const animation = Animated.sequence([
      Animated.timing(todoRevealGlowAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.delay(180),
      Animated.timing(todoRevealGlowAnim, {
        toValue: 0,
        duration: 1,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ]);

    todoRevealGlowAnimationRef.current = animation;
    animation.start(({ finished }) => {
      if (!finished) {
        return;
      }
      todoRevealGlowAnimationRef.current = null;
      setActiveRevealTodoId((current) => current === todoId ? null : current);
      todoRevealGlowAnim.setValue(0);
    });
  }, [clearActiveTodoReveal, todoRevealGlowAnim]);

  const attemptPendingTodoReveal = useCallback(() => {
    const pending = pendingTodoRevealRef.current;
    if (!pending) {
      return;
    }

    const todo = localTodosRef.current.find((item) => item.id === pending.todoId);
    if (!todo) {
      if (pending.attempts >= TODO_REVEAL_MAX_ATTEMPTS) {
        clearPendingTodoReveal();
      } else {
        pending.attempts += 1;
        schedulePendingTodoRevealAttempt();
      }
      return;
    }

    const workspaceIndex = workspaces.findIndex((workspace) => workspace.key === pending.workspaceKey);
    if (workspaceIndex >= 0 && currentWorkspaceRef.current !== workspaceIndex) {
      showWorkspacePage(workspaceIndex);
      pending.attempts += 1;
      schedulePendingTodoRevealAttempt(150);
      return;
    }

    const explicitExpanded = expandedSectionsRef.current[pending.workspaceKey]?.[pending.sectionKey];
    const isGoalTimeframe = pending.workspaceKey === 'Goals'
      && (pending.sectionKey === 'thisWeek' || pending.sectionKey === 'thisMonth' || pending.sectionKey === 'thisYear' || pending.sectionKey === 'longTerm');
    const isSectionExpanded = explicitExpanded !== undefined
      ? explicitExpanded
      : (isGoalTimeframe ? true : defaultExpanded[pending.sectionKey]);

    if (!isSectionExpanded) {
      setExpandedSections((current) => ({
        ...current,
        [pending.workspaceKey]: {
          ...(current[pending.workspaceKey] || {}),
          [pending.sectionKey]: true,
        },
      }));
      pending.attempts += 1;
      schedulePendingTodoRevealAttempt(150);
      return;
    }

    const rowRef = todoRowRefs.current[pending.todoId];
    const scrollRef = workspaceScrollRefs.current[pending.workspaceKey]?.current;
    const scrollNode = findNodeHandle(scrollRef);

    if (!rowRef || !scrollRef || typeof scrollRef.scrollTo !== 'function' || !scrollNode) {
      if (pending.attempts >= TODO_REVEAL_MAX_ATTEMPTS) {
        clearPendingTodoReveal();
      } else {
        pending.attempts += 1;
        schedulePendingTodoRevealAttempt();
      }
      return;
    }

    rowRef.measureLayout(
      scrollNode,
      (_x, y) => {
        const targetY = Math.max(0, y - TODO_REVEAL_TOP_PADDING);
        scrollRef.scrollTo({ y: targetY, animated: true });
        clearPendingTodoReveal();
        if (pending.showRevealGlow === false) {
          return;
        }
        if (todoRevealGlowStartTimeoutRef.current) {
          clearTimeout(todoRevealGlowStartTimeoutRef.current);
        }
        todoRevealGlowStartTimeoutRef.current = setTimeout(() => {
          todoRevealGlowStartTimeoutRef.current = null;
          startTodoRevealGlow(pending.todoId);
        }, 500);
      },
      () => {
        if (pending.attempts >= TODO_REVEAL_MAX_ATTEMPTS) {
          clearPendingTodoReveal();
        } else {
          pending.attempts += 1;
          schedulePendingTodoRevealAttempt();
        }
      }
    );
  }, [clearPendingTodoReveal, schedulePendingTodoRevealAttempt, showWorkspacePage, startTodoRevealGlow, workspaces]);

  useEffect(() => {
    attemptPendingTodoRevealRef.current = attemptPendingTodoReveal;
  }, [attemptPendingTodoReveal]);

  const queueTodoReveal = useCallback((
    todo: Pick<TodoItem, 'id' | 'workspace' | 'dueDate' | 'completed' | 'goalTimeframe'>,
    options: { showRevealGlow?: boolean } = {}
  ) => {
    const workspaceKey = todo.workspace || 'Personal';
    clearPendingTodoReveal();
    clearActiveTodoReveal();
    pendingTodoRevealRef.current = {
      todoId: todo.id,
      workspaceKey,
      sectionKey: getTodoSectionKey({
        ...todo,
        workspace: workspaceKey,
      }, weekStartsOn),
      attempts: 0,
      showRevealGlow: options.showRevealGlow,
    };
    schedulePendingTodoRevealAttempt(0);
  }, [clearActiveTodoReveal, clearPendingTodoReveal, schedulePendingTodoRevealAttempt, weekStartsOn]);

  useEffect(() => {
    if (!isFocused || activeTarget?.type !== 'todo') {
      queuedGuidanceTodoIdRef.current = null;
      return;
    }

    const targetTodo = localTodosRef.current.find((todo) => todo.id === activeTarget.todoId);
    if (targetTodo) {
      if (activeTarget.workspaceKey && workspaces[currentWorkspaceRef.current]?.key !== activeTarget.workspaceKey) {
        goToWorkspaceKey(activeTarget.workspaceKey);
      }
      if (queuedGuidanceTodoIdRef.current === activeTarget.todoId) {
        return;
      }
      queuedGuidanceTodoIdRef.current = activeTarget.todoId;
      queueTodoReveal(targetTodo);
      return;
    }

    goToWorkspaceKey(activeTarget.workspaceKey);
  }, [activeTarget, isFocused, localTodos, queueTodoReveal, workspaces]);

  const getWorkspaceScrollRef = useCallback((workspaceKey: string) => {
    if (!workspaceScrollRefs.current[workspaceKey]) {
      workspaceScrollRefs.current[workspaceKey] = { current: null };
    }
    return workspaceScrollRefs.current[workspaceKey];
  }, []);

  const handleTodoSectionDragBegin = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsTodoDragActive(true);
  }, []);

  const handleTodoSectionDragEnd = useCallback(async ({
    data,
    workspace,
    sectionKey,
  }: {
    data: (TodoItem & { workspace: string })[];
    workspace: string;
    sectionKey: TodoSectionKey;
  }) => {
    setIsTodoDragActive(false);

    if (!data.length) {
      return;
    }

    const sortScope = getSectionSortScope(workspace, sectionKey);
    const orderedIds = data.map((todo) => todo.id);
    const orderById = new Map(orderedIds.map((id, index) => [id, getNormalizedTodoSortOrder(index)]));
    todoSectionOrderOverridesRef.current = {
      ...todoSectionOrderOverridesRef.current,
      [sortScope]: orderedIds,
    };

    setLocalTodos((current) => {
      const next = current.map((todo) => {
        const sortOrder = orderById.get(todo.id);
        return sortOrder === undefined
          ? todo
          : { ...todo, sortScope, sortOrder };
      });
      localTodosRef.current = next;
      return next;
    });

    try {
      const saved = await reorderTodosInSection(orderedIds, sortScope);
      const remainingOverrides = { ...todoSectionOrderOverridesRef.current };
      delete remainingOverrides[sortScope];
      todoSectionOrderOverridesRef.current = remainingOverrides;
      if (!saved) {
        await refreshLocalTodos();
      }
    } catch (error) {
      console.error('Error reordering todos:', error);
      const remainingOverrides = { ...todoSectionOrderOverridesRef.current };
      delete remainingOverrides[sortScope];
      todoSectionOrderOverridesRef.current = remainingOverrides;
      await refreshLocalTodos();
    }
  }, [getSectionSortScope, refreshLocalTodos]);


  const addTodo = useCallback((workspace: string, sectionKey?: GoalSectionKey, options?: { forToday?: boolean }) => {
    const nextInitialTodo: Partial<TodoItem> = { workspace, hasDueTime: false };
    setIsComposerForToday(!!options?.forToday);

    if (workspace === 'Goals') {
      const goalTimeframe = sectionKey || 'thisWeek';
      nextInitialTodo.goalTimeframe = goalTimeframe;
      nextInitialTodo.dueDate = getGoalDefaultDueDate(goalTimeframe, new Date(), weekStartsOn);
    }

    setComposerInitialTodo(nextInitialTodo);
    setComposerKey((currentKey) => currentKey + 1);
    bottomSheetRef.current?.show();
    completeTodoGuidanceAction('create');
  }, [completeTodoGuidanceAction, weekStartsOn]);

  useEffect(() => {
    if (!todoAction || !todoActionNonce || handledTodoActionRef.current === todoActionNonce) {
      return;
    }

    handledTodoActionRef.current = todoActionNonce;
    router.setParams({
      todoAction: undefined,
      todoActionNonce: undefined,
    });

    if (todoAction === 'search') {
      setIsTodoSearchVisible(true);
      completeTodoGuidanceAction('search');
      return;
    }
    if (todoAction === 'create') {
      addTodo(workspaces[currentWorkspace]?.key || 'Personal');
    }
  }, [addTodo, completeTodoGuidanceAction, currentWorkspace, router, todoAction, todoActionNonce, workspaces]);

  const saveTodo = useCallback(async (draft: Partial<TodoItem>) => {
    if (isCreatingTodoRef.current) {
      return;
    }

    isCreatingTodoRef.current = true;

    try {
      const workspace = draft.workspace || workspaces[currentWorkspace]?.key || 'Personal';
      const parsedInput = parseTodoInput(draft.text || '', {
        now: new Date(),
        fallbackDate: draft.dueDate,
      });
      const todoText = parsedInput.cleanedText.trim();

      if (!todoText) {
        Alert.alert('Missing title', 'Add a task name before saving.');
        return;
      }

      const dueDate = parsedInput.dueDate
        || (draft.dueDate ? new Date(draft.dueDate) : startOfDay(new Date()));
      const savedDueDate = workspace === 'Goals' ? startOfDay(dueDate) : dueDate;
      const hasDueTime = workspace === 'Goals'
        ? false
        : (parsedInput.matchedDate || parsedInput.matchedTime)
          ? parsedInput.hasDueTime
          : getTodoHasDueTime(draft.dueDate, draft.hasDueTime);
      const goalTimeframe = workspace === 'Goals'
        ? ((parsedInput.matchedDate || parsedInput.matchedTime)
            ? inferGoalTimeframeFromDueDate(savedDueDate, weekStartsOn)
            : draft.goalTimeframe || inferGoalTimeframeFromDueDate(savedDueDate, weekStartsOn))
        : null;
      const todoType = workspace === 'Wishlist' ? 'basic' : (workspaceTodoTypes[workspace] || 'basic');
      const recurrence = workspace === 'Personal' && todoType === 'basic'
        ? normalizeTodoRecurrenceRule(draft.recurrence)
        : null;
      const result = await createTodo({
        text: todoText,
        completed: false,
        details: draft.details,
        dueDate: savedDueDate,
        hasDueTime,
        starred: draft.starred || false,
        workspace,
        goalTimeframe,
        type: todoType,
        progress: 0,
        isAmazonUrlLoaded: false,
        amazonUrlLoadAttempts: 0,
        taskKind: null,
        guidancePath: null,
        goalBehaviorJson: workspace === 'Goals'
          ? serializeGoalBehavior(createPendingGoalBehavior())
          : null,
        recurrence,
      });
      handleReminderResult(result.reminderStatus);
      const createdTodo = {
        ...toTodoItem(result.todo, recurrenceSeriesById),
        recurrence,
        recurrenceActive: !!recurrence,
      };
      setLocalTodos((prevTodos) => {
        const nextTodos = [...prevTodos.filter((todo) => todo.id !== createdTodo.id), createdTodo];
        localTodosRef.current = nextTodos;
        return nextTodos;
      });

      const workspaceKey = workspace;
      const sectionToExpand = getTodoSectionKey({
        completed: false,
        workspace,
        dueDate: savedDueDate,
        goalTimeframe,
      }, weekStartsOn);

      setExpandedSections(prev => ({
        ...prev,
        [workspaceKey]: {
          ...(prev[workspaceKey] || {}),
          [sectionToExpand]: true
        }
      }));
      queueTodoReveal(createdTodo);

      bottomSheetRef.current?.hide();
      Keyboard.dismiss();
      void refreshLocalTodos();

      if (workspace === 'Goals') {
        void requestGoalWishlistSuggestionsForTodo(createdTodo, { openDetailsOnResolve: true });
      }

      if (shouldClassifyTodoWorkspace(workspace)) {
        void classifyTodoInBackground({
          todoId: createdTodo.id,
          title: todoText,
          details: draft.details,
          workspace,
          goalTimeframe,
          guidancePath: createdTodo.guidancePath,
        });
      }

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    } catch (error) {
      console.error('Error saving todo:', error);
    } finally {
      isCreatingTodoRef.current = false;
    }
  }, [classifyTodoInBackground, currentWorkspace, fadeAnim, handleReminderResult, queueTodoReveal, recurrenceSeriesById, refreshLocalTodos, requestGoalWishlistSuggestionsForTodo, weekStartsOn, workspaceTodoTypes, workspaces]);

  const completeGoalGuidanceTutorial = useCallback(async (closeGuidance: boolean) => {
    const uid = user?.uid || '';
    if (!uid) {
      return;
    }

    await completeTutorialStep(uid, TUTORIAL_GOAL_GUIDANCE_STEP).catch((error) => {
      console.warn('Failed to persist goal tutorial completion', error);
    });
    isGoalGuidanceTutorialPendingRef.current = false;
    setIsGoalGuidanceTutorialPending(false);
    goalGuidanceTutorialStageRef.current = null;
    hasShownGoalTutorialQuestionIntroRef.current = false;
    if (closeGuidance) {
      cancelGuidance();
    }
  }, [cancelGuidance, user?.uid]);
  const startCalendarTutorialTarget = useCallback(() => {
    if (isDetailsModalVisible) {
      resetDetailsModalStateRef.current();
    }

    goalGuidanceTutorialStageRef.current = null;
    const skipHomeTutorialToChat = async () => {
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
    };
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/calendar',
        params: { calendarAction: 'tutorial-create', calendarTutorialHandoff: 'goal-complete' },
      },
      'Calendar',
      {
        onSkipSegment: () => {
          void (async () => {
            const uid = user?.uid || '';
            if (uid) {
              await completeTutorialStep(uid, TUTORIAL_CALENDAR_EVENT_STEP).catch((error) => {
                console.warn('Failed to persist skipped calendar tutorial completion', error);
              });
            }
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
          })();
        },
      }
    );
  }, [isDetailsModalVisible, startGuidance, user?.uid]);
  const skipGoalGuidanceTutorialToCalendar = useCallback(async () => {
    await completeGoalGuidanceTutorial(false);
    startCalendarTutorialTarget();
  }, [completeGoalGuidanceTutorial, startCalendarTutorialTarget]);

  const showGoalGuidanceTutorialStage = useCallback((
    stage: GoalGuidanceTutorialStage,
    forwardStages: GoalGuidanceTutorialStage[] = []
  ) => {
    goalGuidanceTutorialStageRef.current = stage;
    const todoAction =
      stage === 'handoff-back'
        ? 'tutorial-details-back'
        : stage === 'timeframes'
          ? 'tutorial-goal-timeframes'
        : stage === 'actions'
          ? 'tutorial-goal-actions'
          : stage === 'question'
            ? 'tutorial-goal-question'
            : stage === 'ai-bar'
              // "Tap send." points at the Eazee button, which sends the filled-in answer.
              ? 'tutorial-goal-eazee-button'
              : stage === 'accept-plan'
                ? 'tutorial-goal-accept-plan'
                : stage === 'summary'
                  ? 'tutorial-goal-summary'
                  : stage === 'complete'
                    ? 'tutorial-complete'
                    : '';

    if (!todoAction) {
      return;
    }

    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/todo',
        params: { todoAction },
      },
      stage === 'handoff-back'
        ? 'back button'
        : stage === 'timeframes'
            ? 'goal time horizons'
            : stage === 'actions'
              ? 'Actions plan'
              : stage === 'question'
                ? 'guidance question'
              : stage === 'ai-bar'
                ? 'Eazee button'
                : stage === 'accept-plan'
                  ? 'Accept plan'
                  : stage === 'summary'
                    ? 'goal tasks'
                    : 'tutorial complete',
      {
        onBack: stage === 'question'
            ? () => restoreTodoTutorialStepRef.current('goal-actions')
            : stage === 'ai-bar'
              ? () => showGoalGuidanceTutorialStage('question', [stage, ...forwardStages])
              : stage === 'accept-plan'
                ? () => restoreTodoTutorialStepRef.current('goal-ai-bar')
                : stage === 'summary'
                  ? () => showGoalGuidanceTutorialStage('accept-plan', [stage, ...forwardStages])
                  : undefined,
        restore: stage === 'handoff-back'
          ? () => restoreTodoTutorialStepRef.current('goal-handoff-back')
          : stage === 'timeframes'
            ? () => restoreTodoTutorialStepRef.current('goal-timeframes')
            : stage === 'actions'
              ? () => restoreTodoTutorialStepRef.current('goal-actions')
              : stage === 'summary'
                ? () => restoreTodoTutorialStepRef.current('goal-summary')
                : undefined,
        onSkipSegment: () => { void skipGoalGuidanceTutorialToCalendar(); },
        onNext: forwardStages.length > 0
          ? () => showGoalGuidanceTutorialStage(forwardStages[0], forwardStages.slice(1))
          : stage === 'timeframes'
            ? () => startGoalTutorialTargetRef.current()
            : stage === 'question'
              ? () => {
                  if (!goalGuidanceInputValue.trim()) {
                    setGoalGuidanceInputValue(TUTORIAL_GOAL_GUIDANCE_REPLY);
                  }
                  showGoalGuidanceTutorialStage('ai-bar');
                }
              : stage === 'accept-plan'
                ? () => {
                    // Back here after accepting: there is nothing to accept, so move on.
                    if (goalGuidancePlanStatusRef.current && goalGuidancePlanStatusRef.current !== 'preview') {
                      showGoalGuidanceTutorialStage('summary');
                      return;
                    }
                    cancelGuidance();
                  }
                : stage === 'summary'
                  ? () => { void skipGoalGuidanceTutorialToCalendar(); }
                  // Moving on without picking Actions plan or sending must stay possible,
                  // or a failed AI reply leaves the user stuck.
                  : stage === 'actions' || stage === 'ai-bar'
                    ? () => { void skipGoalGuidanceTutorialToCalendar(); }
                    : undefined,
      }
    );
  }, [cancelGuidance, goalGuidanceInputValue, setGoalGuidanceInputValue, skipGoalGuidanceTutorialToCalendar, startCalendarTutorialTarget, startGuidance]);

  const ensureTutorialGoalTodo = useCallback(async () => {
    const uid = user?.uid || '';
    if (!uid) {
      return null;
    }

    const existingGoal = localTodosRef.current.find((todo) => (
      isTutorialDemoTodoReusable(todo) &&
      (
        todo.id === tutorialGoalTodoIdRef.current ||
        (
          todo.workspace === 'Goals' &&
          todo.text.trim() === TUTORIAL_DEMO_GOAL_TITLE &&
          (todo.details || '').trim() === TUTORIAL_DEMO_GOAL_DETAILS &&
          todo.goalTimeframe === 'thisMonth'
        )
      )
    ));

    if (existingGoal) {
      tutorialGoalTodoIdRef.current = existingGoal.id;
      setTutorialGoalTodoId(existingGoal.id);
      await setTutorialGoalDemoTodoId(uid, existingGoal.id).catch((error) => {
        console.warn('Failed to persist tutorial goal id', error);
      });
      return existingGoal;
    }

    const dueDate = getGoalDefaultDueDate('thisMonth', new Date(), weekStartsOn);
    const result = await createTodo({
      text: TUTORIAL_DEMO_GOAL_TITLE,
      completed: false,
      details: TUTORIAL_DEMO_GOAL_DETAILS,
      dueDate,
      hasDueTime: false,
      starred: false,
      workspace: 'Goals',
      goalTimeframe: 'thisMonth',
      type: 'basic',
      progress: 0,
      isAmazonUrlLoaded: false,
      amazonUrlLoadAttempts: 0,
      taskKind: 'skill',
      guidancePath: null,
      goalBehaviorJson: serializeGoalBehavior(createStandardGoalBehavior()),
      recurrence: null,
    });
    handleReminderResult(result.reminderStatus);
    upsertTodoStateEverywhere(result.todo);
    const createdGoal = toTodoItem(result.todo, recurrenceSeriesById);
    setExpandedSections((current) => ({
      ...current,
      Goals: {
        ...(current.Goals || {}),
        thisMonth: true,
      },
    }));
    tutorialGoalTodoIdRef.current = createdGoal.id;
    setTutorialGoalTodoId(createdGoal.id);
    await setTutorialGoalDemoTodoId(uid, createdGoal.id).catch((error) => {
      console.warn('Failed to persist tutorial goal id', error);
    });
    return createdGoal;
  }, [
    handleReminderResult,
    recurrenceSeriesById,
    upsertTodoStateEverywhere,
    user?.uid,
    weekStartsOn,
  ]);

  const startGoalTutorialTarget = useCallback(() => {
    const goalId = tutorialGoalTodoIdRef.current;
    if (!goalId) {
      return;
    }

    goalGuidanceTutorialStageRef.current = 'goal';
    startGuidance(
      { type: 'todo', todoId: goalId, workspaceKey: 'Goals' },
      'the demo monthly goal. Tap it to open details',
      {
        keepLocatedTargetCard: true,
        useTutorialCardPlacement: true,
        onSkipSegment: () => { void skipGoalGuidanceTutorialToCalendar(); },
        // "skip": past the Goals part, on to Calendar.
        onNext: () => {
          cancelGuidance();
          void skipGoalGuidanceTutorialToCalendar();
        },
        nextLabel: 'skip',
        restore: () => restoreTodoTutorialStepRef.current('goal-target'),
      }
    );
  }, [cancelGuidance, skipGoalGuidanceTutorialToCalendar, startGuidance]);
  startGoalTutorialTargetRef.current = startGoalTutorialTarget;

  const showGoalWorkspaceSwipeGuidance = useCallback(() => {
    goalGuidanceTutorialStageRef.current = 'workspace';
    startGuidance(
      {
        type: 'screen',
        route: '/(tabs)/todo',
        params: { workspaceKey: 'Goals' },
      },
      'Goals workspace',
      {
        useTutorialCardPlacement: true,
        onSkipSegment: () => { void skipGoalGuidanceTutorialToCalendar(); },
        restore: () => restoreTodoTutorialStepRef.current('goal-workspace'),
      }
    );
  }, [skipGoalGuidanceTutorialToCalendar, startGuidance]);

  const finishTodoGuidanceTutorialAndStartGoal = useCallback(async (closeGuidance: boolean) => {
    await completeTodoGuidanceTutorial(closeGuidance);

    const goalTodo = await ensureTutorialGoalTodo().catch((error) => {
      console.warn('Failed to prepare tutorial goal', error);
      return null;
    });
    if (!goalTodo) {
      return;
    }

    isGoalGuidanceTutorialPendingRef.current = true;
    setIsGoalGuidanceTutorialPending(true);
    tutorialGoalTodoIdRef.current = goalTodo.id;
    setTutorialGoalTodoId(goalTodo.id);
    hasShownGoalTutorialQuestionIntroRef.current = false;

    if (isDetailsModalVisible) {
      showGoalGuidanceTutorialStage('handoff-back');
      return;
    }

    showGoalWorkspaceSwipeGuidance();
  }, [
    completeTodoGuidanceTutorial,
    ensureTutorialGoalTodo,
    isDetailsModalVisible,
    showGoalWorkspaceSwipeGuidance,
    showGoalGuidanceTutorialStage,
  ]);
  finishTodoGuidanceTutorialRef.current = finishTodoGuidanceTutorialAndStartGoal;

  const completeGuidanceGoal = useCallback(async (plan: GoalGuidancePlan) => {
    try {
      const result = await updateTodo(plan.goalId, { completed: true }, { syncReminder: true });
      handleReminderResult(result.reminderStatus);
      updateTodoStateEverywhere(plan.goalId, {
        completed: true,
        ...getTodoOrderingStatePatch(result.todo),
      });
    } catch (error) {
      console.error('Error completing goal:', error);
    }
  }, [getTodoOrderingStatePatch, handleReminderResult, updateTodoStateEverywhere]);

  const handleGoalActionCompleted = useCallback(async (todoId: string) => {
    const previousPlan =
      goalGuidancePlan && getGoalGuidancePlanActiveActions(goalGuidancePlan).some((action) => action.todoId === todoId)
        ? goalGuidancePlan
        : null;
    const previousGoalBehavior = previousPlan
      ? parseGoalBehavior(localTodosRef.current.find((todo) => todo.id === previousPlan.goalId)?.goalBehaviorJson)
      : null;

    setIsGoalGuidanceActionTransitioning(true);

    if (previousPlan && !isQuotaGoalBehavior(previousGoalBehavior)) {
      const optimisticPlan = getOptimisticGoalGuidancePlanAfterCompletingTodo(previousPlan, todoId);
      if (optimisticPlan) {
        setGoalGuidancePlan(optimisticPlan);
      }
    }

    try {
      const result = await advanceGoalGuidanceForCompletedTodo(todoId);
      if (!result) {
        if (previousPlan) {
          setGoalGuidancePlan(previousPlan);
        }
        return;
      }

      if (selectedTodoForDetails?.id === result.plan.goalId) {
        setGoalGuidancePlan(result.plan);
      }
      const resultGoalTodo = await database.collections.get<TodoModel>('todos').find(result.plan.goalId).catch(() => null);
      if (resultGoalTodo) {
        updateTodoStateEverywhere(result.plan.goalId, {
          goalBehaviorJson: resultGoalTodo.goalBehaviorJson ?? null,
        });
      }
      await refreshLocalTodos();

      if (result.status === 'complete') {
        await completeGuidanceGoal(result.plan);
        const completedGuidanceGoal = localTodosRef.current.find((todo) => todo.id === result.plan.goalId);
        if (completedGuidanceGoal?.workspace !== 'Goals') {
          const parentResult = await advanceGoalGuidanceForCompletedTodo(result.plan.goalId);
          if (parentResult?.status === 'complete') {
            await completeGuidanceGoal(parentResult.plan);
          }
        }
      }
    } catch (error) {
      console.error('Error advancing goal guidance:', error);
      if (previousPlan) {
        setGoalGuidancePlan(previousPlan);
      }
    } finally {
      setIsGoalGuidanceActionTransitioning(false);
    }
  }, [completeGuidanceGoal, goalGuidancePlan, refreshLocalTodos, selectedTodoForDetails?.id, updateTodoStateEverywhere]);

  const completeGoalGuidanceStepsForTodo = useCallback(async (todoId: string) => {
    const plan = goalGuidancePlan?.goalId === todoId
      ? goalGuidancePlan
      : await fetchGoalGuidancePlanForGoal(todoId);

    if (!plan || !plan.steps.length || (plan.status !== 'accepted' && plan.status !== 'complete')) {
      return false;
    }

    const completedStepIndexes = plan.steps.map((_, index) => index);
    const result = await saveGoalGuidanceStepProgress(plan.id, completedStepIndexes);

    if (goalGuidancePlan?.goalId === todoId) {
      setGoalGuidancePlan(result.plan);
    }

    return true;
  }, [goalGuidancePlan]);

  const completeRecipeGuideStepsForTodo = useCallback(async (todoId: string) => {
    const guide = recipeGuide?.todoId === todoId
      ? recipeGuide
      : await fetchRecipeGuideForTodo(todoId);

    if (!guide || guide.status !== 'ready' || !guide.steps.length) {
      return false;
    }

    const nextSteps = guide.steps.map((step) => ({ ...step, completed: true }));
    const nextProgress = getRecipeProgressFromSteps(nextSteps);
    const nextActiveStepIndex = Math.max(0, nextSteps.length - 1);

    const savedGuide = await saveRecipeGuide({
      todoId,
      steps: nextSteps,
      activeStepIndex: nextActiveStepIndex,
    });

    if (recipeGuide?.todoId === todoId) {
      handleRecipeGuideSaved(savedGuide);
    } else if (nextProgress) {
      setRecipeProgressOverridesByTodoId((current) => ({
        ...current,
        [todoId]: nextProgress,
      }));
    }

    return true;
  }, [handleRecipeGuideSaved, recipeGuide]);

  const completeSkillGuideStepsForTodo = useCallback(async (todoId: string) => {
    const guide = skillGuide?.todoId === todoId
      ? skillGuide
      : await fetchSkillGuideForTodo(todoId);

    if (!guide || guide.status !== 'ready' || !guide.steps.length) {
      return false;
    }

    const nextSteps = guide.steps.map((step) => ({ ...step, completed: true }));
    const nextProgress = getSkillProgressFromSteps(nextSteps);
    const nextActiveStepIndex = Math.max(0, nextSteps.length - 1);

    const savedGuide = await saveSkillGuide({
      todoId,
      steps: nextSteps,
      activeStepIndex: nextActiveStepIndex,
    });

    if (skillGuide?.todoId === todoId) {
      handleSkillGuideSaved(savedGuide);
    } else if (nextProgress) {
      setSkillProgressOverridesByTodoId((current) => ({
        ...current,
        [todoId]: nextProgress,
      }));
    }

    return true;
  }, [handleSkillGuideSaved, skillGuide]);

  const completeTaskGuideStepsForTodo = useCallback(async (todoId: string) => {
    const guide = taskGuide?.todoId === todoId
      ? taskGuide
      : await fetchTaskGuideForTodo(todoId);

    if (!guide || !guide.steps.length || (guide.status !== 'preview' && guide.status !== 'accepted' && guide.status !== 'complete')) {
      return false;
    }

    const nextSteps = guide.steps.map((step) => ({ ...step, completed: true }));
    const savedGuide = await saveTaskGuide({
      todoId,
      steps: nextSteps,
      activeStepIndex: Math.max(0, nextSteps.length - 1),
      status: 'complete',
    });

    if (taskGuide?.todoId === todoId) {
      handleTaskGuideSaved(savedGuide);
    } else {
      const nextProgress = getTaskProgressFromSteps(nextSteps, 'complete');
      if (nextProgress) {
        setTaskProgressOverridesByTodoId((current) => ({
          ...current,
          [todoId]: nextProgress,
        }));
      }
    }

    return true;
  }, [handleTaskGuideSaved, taskGuide]);

  const toggleTodo = async (id: string) => {
    if (togglingTodoIdsRef.current.has(id)) {
      return;
    }

    togglingTodoIdsRef.current.add(id);
    setCompletingTodoId(id);

    const todoToToggle = localTodosRef.current.find(t => t.id === id) || localTodos.find(t => t.id === id);
    if (!todoToToggle) {
      togglingTodoIdsRef.current.delete(id);
      setCompletingTodoId((currentId) => currentId === id ? null : currentId);
      return;
    }

    const isCompleting = !todoToToggle.completed;
    if (isCompleting && todoToToggle.recurrenceSeriesId) {
      const currentDateKey = getTodoOccurrenceDateKey(todoToToggle.recurrenceOccurrenceDate || todoToToggle.dueDate);
      const hasEarlierIncompleteOccurrence = currentDateKey != null && localTodosRef.current.some((todo) => {
        if (
          todo.id === todoToToggle.id ||
          todo.completed ||
          todo.recurrenceSeriesId !== todoToToggle.recurrenceSeriesId
        ) {
          return false;
        }

        const dateKey = getTodoOccurrenceDateKey(todo.recurrenceOccurrenceDate || todo.dueDate);
        return dateKey != null && dateKey < currentDateKey;
      });

      if (hasEarlierIncompleteOccurrence) {
        Alert.alert('Complete earlier repeat first', 'Finish older occurrences before this one.');
        togglingTodoIdsRef.current.delete(id);
        setCompletingTodoId((currentId) => currentId === id ? null : currentId);
        return;
      }
    }

    if (isCompleting) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    const newState = {
      isFaded: isCompleting,
      isTranslated: isCompleting,
    };

    // A row can be ticked before the effect that creates its values has run; a missing
    // value would throw here and leave the task stuck as "completing".
    syncTodoAnimationState(id, !isCompleting);
    // Not an "interaction": an animation that never reports finishing would otherwise hold
    // InteractionManager, and the reorderable lists wait on it to clear their drag state.
    Animated.timing(animationsRef.current.fadeAnims[id], {
      toValue: isCompleting ? 0.6 : 1,
      duration: 150,
      useNativeDriver: true,
      isInteraction: false,
    }).start();
    animationsRef.current.translateXAnims[id]?.setValue(isCompleting ? 20 : 0);

    animationsRef.current.animationStates[id] = newState;

    const isBeingUncompleted = todoToToggle.completed;
    const workspace = todoToToggle.workspace || workspaces[currentWorkspace]?.key;
    const currentWorkspaceType = workspaceTodoTypes[workspace] || 'basic';

    const nextCompleted = !todoToToggle.completed;
    pendingCompletionByTodoIdRef.current.set(id, nextCompleted);
    setLocalTodos(prevTodos => {
      const nextTodos = prevTodos.map(todo => {
        if (todo.id === id) {
          const updatedTodo = { ...todo, completed: nextCompleted };
          if (isBeingUncompleted) {
            updatedTodo.progress = 0;
            updatedTodo.startedAt = undefined;
            updatedTodo.type = currentWorkspaceType;
          }
          return updatedTodo;
        }
        return todo;
      });
      localTodosRef.current = nextTodos;
      return nextTodos;
    });

    try {
      if (isCompleting) {
        // Guide progress is a side effect; a failure here must not stop the todo from completing.
        try {
          if (todoToToggle.workspace === 'Personal') {
            await completeGoalGuidanceStepsForTodo(id);
          }
          await completeRecipeGuideStepsForTodo(id);
          await completeSkillGuideStepsForTodo(id);
          await completeTaskGuideStepsForTodo(id);
        } catch (error) {
          console.error('Error completing guide steps for todo:', error);
        }
      }

      let result: Awaited<ReturnType<typeof updateTodo>> | null = null;
      try {
        result = await updateTodo(
          id,
          {
            completed: nextCompleted,
            progress: isBeingUncompleted ? 0 : undefined,
            startedAt: isBeingUncompleted ? null : undefined,
            type: isBeingUncompleted ? currentWorkspaceType : undefined,
          },
          {
            syncReminder: true,
          }
        );
      } catch (error) {
        console.error('Error toggling todo:', error);
        // updateTodo saves before syncing the reminder, so a thrown error can still mean the tick was saved.
        const savedTodo = await database.collections.get<TodoModel>('todos').find(id).catch(() => null);
        if (savedTodo?.completed === nextCompleted) {
          result = { todo: savedTodo, reminderStatus: 'skipped' as const };
        }
      }

      if (!result) {
        pendingCompletionByTodoIdRef.current.delete(id);
        setLocalTodos(prevTodos => {
          const nextTodos = prevTodos.map(todo =>
            todo.id === id ? todoToToggle : todo
          );
          localTodosRef.current = nextTodos;
          return nextTodos;
        });
        Alert.alert('Could not update task', 'Please try again.');
        return;
      }

      pendingCompletionByTodoIdRef.current.delete(id);
      updateTodoStateEverywhere(id, { ...getTodoOrderingStatePatch(result.todo), completed: result.todo.completed });

      if (isCompleting) {
        const wsKey = todoToToggle.workspace || workspaces[currentWorkspace]?.key || 'Personal';
        setExpandedSections(prev => ({
          ...prev,
          [wsKey]: {
            ...(prev[wsKey] || {}),
            completed: true
          }
        }));
      }

      // The completion is saved: the task can be tapped again now. Follow-up work (goal
      // progress, repeats) runs on its own, so a slow or stuck step there can't leave the
      // button dead until the app restarts. Failures are logged and never revert it.
      togglingTodoIdsRef.current.delete(id);
      setCompletingTodoId((currentId) => currentId === id ? null : currentId);
      handleReminderResult(result.reminderStatus);
      void (async () => {
        try {
          if (isCompleting) {
            await handleGoalActionCompleted(id);
          }
          if (todoToToggle.recurrenceSeriesId) {
            await refreshLocalTodos();
          }
        } catch (error) {
          console.error('Error after toggling todo:', error);
        }
      })();
    } catch (error) {
      console.error('Error toggling todo:', error);
    } finally {
      togglingTodoIdsRef.current.delete(id);
      setCompletingTodoId((currentId) => currentId === id ? null : currentId);
    }
  };

  const activeTodos = localTodos.filter((todo) => !todo.completed);
  const completedTodos = localTodos.filter((todo) => todo.completed);

  const sortedActiveTodos = activeTodos.sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  const formatDueDate = (
    date?: Date,
    hasDueTime?: boolean,
    sectionKey?: TodoSectionKey
  ) => {
    if (!date) return '';
    const showTime = getTodoHasDueTime(date, hasDueTime);
    if (isToday(date)) {
      if (sectionKey === 'today') {
        return showTime ? format(date, 'h:mm a') : '';
      }
      return showTime ? format(date, 'h:mm a') : 'Today';
    }
    if (isTomorrow(date)) return showTime ? `Tomorrow ${format(date, 'h:mm a')}` : 'Tomorrow';
    if (isYesterday(date)) return showTime ? `Yesterday ${format(date, 'h:mm a')}` : 'Yesterday';
    return showTime ? format(date, 'MMM d, h:mm a') : format(date, 'MMM d');
  };

  const formatOverdueDueDate = (date?: Date) => {
    if (!date) return '';
    return format(date, date.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, yyyy');
  };

  const pagerViewRef = useRef<PagerView>(null);

  // const handleAddAllToCart = async () => {
  //   const wishlistItems = localTodos.filter(todo => todo.workspace === 'Wishlist' && todo.amazonUrl);
  //   const itemLinks = wishlistItems.map(item => item.amazonUrl).filter(Boolean) as string[];

  //   if (itemLinks.length === 0) {
  //     Alert.alert('No items', 'There are no items with Amazon links in your wishlist.');
  //     return;
  //   }

  //   setIsAddingToCart(true);
  //   setAddToCartSuccess(false);

  //   try {
  //     const response = await axios.post('https://170.64.200.117.nip.io/start_session', {
  //       identifier: '6361765068',
  //       password: 'none',
  //       item_links: itemLinks
  //     });

  //     if (response.status === 200) {
  //       setAddToCartSuccess(true);
  //       setTimeout(() => {
  //         setAddToCartSuccess(false);
  //       }, 3000);
  //     } else {
  //       Alert.alert('Error', 'Failed to add items to your Amazon cart. Please try again.');
  //     }
  //   } catch (error) {
  //     console.error('Error adding items to cart:', error);
  //     Alert.alert('Error', 'An error occurred while adding items to your Amazon cart. Please try again.');
  //   } finally {
  //     setIsAddingToCart(false);
  //   }
  // };


  // const handleGoToCart = async () => {
  //   const amazonAppUrls = [
  //     `com.amazon.mobile.shopping://www.amazon.com.au/gp/aw/c?ref_=navm_hdr_cart`
  //   ];
  //   const amazonWebUrl = 'https://www.amazon.com.au/gp/cart/view.html';

  //   for (const appUrl of amazonAppUrls) {
  //     try {
  //       const supported = await Linking.canOpenURL(appUrl);
  //       console.log(`Can open Amazon app URL (${appUrl}):`, supported);

  //       if (supported) {
  //         console.log('Attempting to open app URL:', appUrl);
  //         await Linking.openURL(appUrl);
  //         return;
  //       }
  //     } catch (error) {
  //       console.error(`Error opening Amazon app URL (${appUrl}):`, error);
  //     }
  //   }

  //   try {
  //     console.log('Attempting to open web URL:', amazonWebUrl);
  //     await Linking.openURL(amazonWebUrl);
  //   } catch (webError) {
  //     console.error('Error opening web URL:', webError);
  //     Alert.alert('Error', 'Unable to open Amazon cart. Please try manually.');
  //   }
  // };


  const getRecurringEditScope = useCallback((todo?: TodoItem | null): Promise<RecurringTodoEditScope | null> => {
    if (!todo?.recurrenceSeriesId) {
      return Promise.resolve('one');
    }

    const cachedScope = recurringEditScopeRef.current[todo.recurrenceSeriesId];
    if (cachedScope) {
      return Promise.resolve(cachedScope);
    }

    return new Promise((resolve) => {
      Alert.alert(
        'Edit repeating todo',
        'Apply this change to this occurrence or this and future repeats?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          {
            text: 'This occurrence',
            onPress: () => {
              recurringEditScopeRef.current[todo.recurrenceSeriesId!] = 'one';
              resolve('one');
            },
          },
          {
            text: 'This and future',
            onPress: () => {
              recurringEditScopeRef.current[todo.recurrenceSeriesId!] = 'future';
              resolve('future');
            },
          },
        ]
      );
    });
  }, []);

  const saveDetails = useCallback(async (todoId: string, text: string, details: string) => {
    try {
      const todo = localTodosRef.current.find((item) => item.id === todoId);
      const scope = await getRecurringEditScope(todo);
      if (!scope) {
        return;
      }

      if (todo?.recurrenceSeriesId) {
        await updateRecurringTodo(todoId, { text, details }, scope);
        await refreshLocalTodos();
        return;
      }

      await updateTodo(todoId, { text, details });
      updateTodoStateEverywhere(todoId, { text, details });
    } catch (error) {
      console.error('Error saving todo details:', error);
    }
  }, [getRecurringEditScope, refreshLocalTodos, updateTodoStateEverywhere]);


  const debouncedSaveDetails = useMemo(
    () => debounce(saveDetails, 1000),
    [saveDetails]
  );

  useEffect(() => {
    if (
      selectedTodoForDetails &&
      (editedTodoTitle !== selectedTodoForDetails.text ||
        editedTodoDetails !== (selectedTodoForDetails.details || ''))
    ) {
      debouncedSaveDetails(selectedTodoForDetails.id, editedTodoTitle, editedTodoDetails);
    }
    return () => {
      debouncedSaveDetails.cancel();
    };
  }, [selectedTodoForDetails, editedTodoTitle, editedTodoDetails, debouncedSaveDetails]);

  const saveCurrentDetailsImmediately = useCallback(() => {
    if (!selectedTodoForDetails) {
      return;
    }

    if (
      editedTodoTitle === selectedTodoForDetails.text &&
      editedTodoDetails === (selectedTodoForDetails.details || '')
    ) {
      return;
    }

    debouncedSaveDetails.cancel();
    void saveDetails(selectedTodoForDetails.id, editedTodoTitle, editedTodoDetails);
  }, [debouncedSaveDetails, editedTodoDetails, editedTodoTitle, saveDetails, selectedTodoForDetails]);

  const saveTodoTimeFromDetails = useCallback(async (nextDate: Date, nextHasDueTime: boolean) => {
    if (!selectedTodoForDetails) {
      return;
    }

    try {
      const input = {
        dueDate: nextDate,
        hasDueTime: nextHasDueTime,
        ...(!nextHasDueTime
          ? {
              reminderEnabled: false,
              reminderMode: 'none' as const,
              reminderMinutesBefore: null,
            }
          : {}),
      };
      const scope = await getRecurringEditScope(selectedTodoForDetails);
      if (!scope) {
        return;
      }
      const result = selectedTodoForDetails.recurrenceSeriesId
        ? await updateRecurringTodo(
            selectedTodoForDetails.id,
            input,
            scope,
            {
              applyDefaultReminderWhenTimingAdded: true,
              syncReminder: true,
            }
          )
        : await updateTodo(
        selectedTodoForDetails.id,
        input,
        {
          applyDefaultReminderWhenTimingAdded: true,
          syncReminder: true,
        }
      );

      updateTodoStateEverywhere(selectedTodoForDetails.id, {
        dueDate: result.todo.dueDate,
        hasDueTime: result.todo.hasDueTime,
        ...getTodoOrderingStatePatch(result.todo),
        reminderEnabled: result.todo.reminderEnabled,
        reminderMode: result.todo.reminderMode || 'none',
        reminderMinutesBefore: result.todo.reminderMinutesBefore,
        notificationId: result.todo.notificationId ?? null,
      });
      handleReminderResult(result.reminderStatus);
      if (selectedTodoForDetails.recurrenceSeriesId) {
        await refreshLocalTodos();
      }
    } catch (error) {
      console.error('Error saving todo time:', error);
    }
  }, [getRecurringEditScope, getTodoOrderingStatePatch, handleReminderResult, refreshLocalTodos, selectedTodoForDetails, updateTodoStateEverywhere]);

  /** Moves the task to another day, keeping its time of day (and so its reminder). */
  const handleDetailsDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    setIsDetailsDatePickerVisible(false);
    if (event.type === 'dismissed' || !selectedDate || !selectedTodoForDetails) {
      return;
    }

    const hasDueTime = getTodoHasDueTime(selectedTodoForDetails.dueDate, selectedTodoForDetails.hasDueTime);
    const nextDate = new Date(selectedDate);
    if (hasDueTime && selectedTodoForDetails.dueDate) {
      nextDate.setHours(selectedTodoForDetails.dueDate.getHours(), selectedTodoForDetails.dueDate.getMinutes(), 0, 0);
    } else {
      nextDate.setHours(0, 0, 0, 0);
    }
    if (selectedTodoForDetails.dueDate && startOfDay(selectedTodoForDetails.dueDate).getTime() === startOfDay(nextDate).getTime()) {
      return;
    }
    void saveTodoTimeFromDetails(nextDate, hasDueTime);
  }, [saveTodoTimeFromDetails, selectedTodoForDetails]);

  const handleOpenDetailsTimePicker = useCallback(() => {
    if (!selectedTodoForDetails || isDetailsTimePickerVisible) {
      return;
    }

    const nextTime = getTodoHasDueTime(selectedTodoForDetails.dueDate, selectedTodoForDetails.hasDueTime)
      ? new Date(selectedTodoForDetails.dueDate || new Date())
      : getNextHalfHourTime(selectedTodoForDetails.dueDate);

    pendingDetailsTimeRef.current = nextTime;
    setPendingDetailsTime(nextTime);
    setIsDetailsTimePickerVisible(true);
  }, [isDetailsTimePickerVisible, selectedTodoForDetails]);

  const confirmDetailsTimeRef = useRef<() => void>(() => {});

  const handleDetailsTimeChange = useCallback((
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) => {
    if (event.type === 'dismissed') {
      setIsDetailsTimePickerVisible(false);
      return;
    }

    if (selectedDate) {
      pendingDetailsTimeRef.current = selectedDate;
    }

    if (Platform.OS === 'android' && event.type === 'set') {
      confirmDetailsTimeRef.current();
    }
  }, []);

  const handleConfirmDetailsTime = useCallback(async () => {
    if (!selectedTodoForDetails) {
      return;
    }

    const picked = pendingDetailsTimeRef.current;
    const nextDate = selectedTodoForDetails.dueDate
      ? new Date(selectedTodoForDetails.dueDate)
      : startOfDay(new Date());
    nextDate.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    setIsDetailsTimePickerVisible(false);
    await saveTodoTimeFromDetails(nextDate, true);
  }, [saveTodoTimeFromDetails, selectedTodoForDetails]);

  confirmDetailsTimeRef.current = handleConfirmDetailsTime;

  const handleDismissDetailsTimePicker = useCallback(() => {
    void handleConfirmDetailsTime();
  }, [handleConfirmDetailsTime]);

  const handleClearDetailsTime = useCallback(async () => {
    if (!selectedTodoForDetails) {
      return;
    }

    const nextDate = selectedTodoForDetails.dueDate
      ? new Date(selectedTodoForDetails.dueDate)
      : startOfDay(new Date());
    nextDate.setHours(0, 0, 0, 0);
    setIsDetailsTimePickerVisible(false);
    await saveTodoTimeFromDetails(nextDate, false);
  }, [saveTodoTimeFromDetails, selectedTodoForDetails]);

  const saveTodoReminderFromDetails = useCallback(async (
    reminderMode: TodoReminderMode,
    reminderMinutesBefore: number | null
  ) => {
    if (!selectedTodoForDetails) {
      return;
    }

    if (reminderMode !== 'none' && !getTodoHasDueTime(selectedTodoForDetails.dueDate, selectedTodoForDetails.hasDueTime)) {
      setIsReminderModalVisible(false);
      setDetailsReminderNotice(SET_TIME_FIRST_REMINDER_NOTICE);
      return;
    }

    const normalized = normalizeTodoReminderState(
      {
        reminderEnabled: reminderMode !== 'none',
        reminderMode,
        reminderMinutesBefore,
      },
      selectedTodoForDetails.hasDueTime
    );

    try {
      const input = {
        reminderEnabled: normalized.reminderEnabled,
        reminderMode: normalized.reminderMode,
        reminderMinutesBefore: normalized.reminderMinutesBefore,
      };
      const scope = await getRecurringEditScope(selectedTodoForDetails);
      if (!scope) {
        return;
      }
      const result = selectedTodoForDetails.recurrenceSeriesId
        ? await updateRecurringTodo(
            selectedTodoForDetails.id,
            input,
            scope,
            {
              syncReminder: true,
            }
          )
        : await updateTodo(
        selectedTodoForDetails.id,
        input,
        {
          syncReminder: true,
        }
      );

      updateTodoStateEverywhere(selectedTodoForDetails.id, {
        reminderEnabled: result.todo.reminderEnabled,
        reminderMode: result.todo.reminderMode || 'none',
        reminderMinutesBefore: result.todo.reminderMinutesBefore,
        notificationId: result.todo.notificationId ?? null,
      });
      handleReminderResult(result.reminderStatus);
      if (selectedTodoForDetails.recurrenceSeriesId) {
        await refreshLocalTodos();
      }
    } catch (error) {
      console.error('Error saving todo reminder:', error);
    }
  }, [getRecurringEditScope, handleReminderResult, refreshLocalTodos, selectedTodoForDetails, updateTodoStateEverywhere]);

  const handleOpenReminderFromDetails = useCallback(() => {
    if (!selectedTodoForDetails) {
      return;
    }

    if (!getTodoHasDueTime(selectedTodoForDetails.dueDate, selectedTodoForDetails.hasDueTime)) {
      setDetailsReminderNotice(SET_TIME_FIRST_REMINDER_NOTICE);
      return;
    }

    setIsReminderModalVisible(true);
  }, [selectedTodoForDetails]);

  const handleDetailsRepeatChange = useCallback(async (recurrence: TodoRecurrenceRule | null) => {
    if (!selectedTodoForDetails) {
      return;
    }

    try {
      const result = await setTodoRecurrence(selectedTodoForDetails.id, recurrence);
      updateTodoStateEverywhere(selectedTodoForDetails.id, {
        recurrence: normalizeTodoRecurrenceRule(recurrence),
        recurrenceSeriesId: result.todo.recurrenceSeriesId ?? null,
        recurrenceOccurrenceDate: result.todo.recurrenceOccurrenceDate ?? null,
      });
      handleReminderResult(result.reminderStatus);
      await refreshLocalTodos();
    } catch (error) {
      console.error('Error saving repeat:', error);
    }
  }, [handleReminderResult, refreshLocalTodos, selectedTodoForDetails, updateTodoStateEverywhere]);

  const handleSelectReminderOption = useCallback(async (
    option: typeof reminderOptions[number]
  ) => {
    setIsReminderModalVisible(false);

    await saveTodoReminderFromDetails(option.mode, option.minutes);
  }, [saveTodoReminderFromDetails]);

  const handleRequestGoalGuidanceCram = useCallback(async () => {
    setIsGoalGuidanceAiActive(true);
    await requestGoalGuidanceCram();
  }, [requestGoalGuidanceCram]);

  const handleUseMonthlyGoalGuidance = useCallback(async () => {
    if (!selectedTodoForDetails || !goalGuidanceContext || isGoalGuidanceRunning) {
      return;
    }

    const monthlyDeadline = getGoalDefaultDueDate('thisMonth', new Date(), weekStartsOn);
    const goalTitle = editedTodoTitle || selectedTodoForDetails.text;

    try {
      setIsGoalGuidanceAiActive(true);
      setGoalGuidancePlan(null);
      setGoalGuidanceAlternative(null);
      setPendingGoalGuidanceTitle(null);
      const result = await updateTodo(
        selectedTodoForDetails.id,
        {
          dueDate: monthlyDeadline,
          hasDueTime: false,
          goalTimeframe: 'thisMonth',
        },
        {
          syncReminder: true,
        }
      );
      handleReminderResult(result.reminderStatus);
      updateTodoStateEverywhere(selectedTodoForDetails.id, {
        dueDate: result.todo.dueDate,
        hasDueTime: result.todo.hasDueTime,
        goalTimeframe: 'thisMonth',
        ...getTodoOrderingStatePatch(result.todo),
        reminderEnabled: result.todo.reminderEnabled,
        reminderMode: result.todo.reminderMode || 'none',
        reminderMinutesBefore: result.todo.reminderMinutesBefore,
        notificationId: result.todo.notificationId ?? null,
      });

      await requestFreshGoalGuidanceSteps({
        ...goalGuidanceContext,
        goalTitle,
        goalDetails: editedTodoDetails || result.todo.details || '',
        timeframe: 'thisMonth',
        deadline: monthlyDeadline,
      }, {
        resetConversation: false,
        userText: 'Change this to a monthly goal using my previous answers. Do not ask the same question again.',
      });
    } catch (error) {
      console.error('Error moving guidance goal to this month:', error);
      Alert.alert('Could not use monthly goal', String((error as any)?.message || error));
    }
  }, [
    editedTodoDetails,
    editedTodoTitle,
    goalGuidanceContext,
    getTodoOrderingStatePatch,
    handleReminderResult,
    isGoalGuidanceRunning,
    requestFreshGoalGuidanceSteps,
    selectedTodoForDetails,
    updateTodoStateEverywhere,
    weekStartsOn,
  ]);
  useMonthlyGoalGuidanceRef.current = handleUseMonthlyGoalGuidance;

  const handleAcceptGoalGuidancePlan = useCallback(async () => {
    if (!goalGuidancePlan) {
      return;
    }

    try {
      const result = await acceptGoalGuidancePlan(goalGuidancePlan.id);
      const nextGoalTitle = pendingGoalGuidanceTitle?.trim();
      if (nextGoalTitle) {
        const updatedGoal = await updateTodo(result.plan.goalId, { text: nextGoalTitle });
        updateTodoStateEverywhere(result.plan.goalId, { text: updatedGoal.todo.text });
        if (selectedTodoForDetails?.id === result.plan.goalId) {
          setEditedTodoTitle(updatedGoal.todo.text);
        }
      }

      setPendingGoalGuidanceTitle(null);
      setGoalGuidancePlan(result.plan);
      setIsGoalGuidanceAiActive(false);
      returnToGoalGuidancePlan();
      const goalTodo = await database.collections.get<TodoModel>('todos').find(result.plan.goalId).catch(() => null);
      if (goalTodo) {
        updateTodoStateEverywhere(result.plan.goalId, {
          goalBehaviorJson: goalTodo.goalBehaviorJson ?? null,
        });
      }
      await refreshLocalTodos();
      setGoalGuidanceSuccessNotice({
        title: isGoalGuidanceActionDetails ? 'Steps Added' : selectedQuotaBehavior ? 'Plan Added' : 'Action Created',
        message: isGoalGuidanceActionDetails
          ? 'Your steps are inside this action.'
          : selectedQuotaBehavior
            ? 'Choose when to do the first action.'
          : 'Your first action is in Personal for today',
      });
      if (
        isGoalGuidanceTutorialPendingRef.current &&
        tutorialGoalTodoIdRef.current === result.plan.goalId
      ) {
        await completeGoalGuidanceTutorial(false);
        showGoalGuidanceTutorialStage('summary');
      }
    } catch (error) {
      console.error('Error accepting goal guidance plan:', error);
      Alert.alert('Could not accept plan', String((error as any)?.message || error));
    }
  }, [
    completeGoalGuidanceTutorial,
    getTodoOrderingStatePatch,
    goalGuidancePlan,
    isGoalGuidanceActionDetails,
    pendingGoalGuidanceTitle,
    refreshLocalTodos,
    returnToGoalGuidancePlan,
    selectedTodoForDetails,
    selectedQuotaBehavior,
    showGoalGuidanceTutorialStage,
    updateTodoStateEverywhere,
  ]);

  const handleScheduleGoalQuotaAction = useCallback(async (date: Date) => {
    if (!goalGuidancePlan || isSchedulingGoalQuotaAction) {
      return;
    }

    setIsSchedulingGoalQuotaAction(true);
    try {
      const result = await scheduleGoalQuotaAction(goalGuidancePlan.id, date);
      setGoalGuidancePlan(result.plan);
      if (result.todo) {
        upsertTodoStateEverywhere(result.todo);
      }
      updateTodoStateEverywhere(result.plan.goalId, {
        goalBehaviorJson: serializeGoalBehavior(result.goalBehavior),
      });
    } catch (error) {
      console.error('Error scheduling quota action:', error);
      Alert.alert('Could not schedule action', String((error as any)?.message || error));
    } finally {
      setIsSchedulingGoalQuotaAction(false);
    }
  }, [goalGuidancePlan, isSchedulingGoalQuotaAction, updateTodoStateEverywhere, upsertTodoStateEverywhere]);

  const handleDismissGoalQuotaInitialPrompt = useCallback(async () => {
    if (!goalGuidancePlan || isSchedulingGoalQuotaAction) {
      return;
    }

    setIsSchedulingGoalQuotaAction(true);
    try {
      const result = await dismissGoalQuotaInitialPrompt(goalGuidancePlan.id);
      setGoalGuidancePlan(result.plan);
      updateTodoStateEverywhere(result.plan.goalId, {
        goalBehaviorJson: serializeGoalBehavior(result.goalBehavior),
      });
    } catch (error) {
      console.error('Error dismissing quota prompt:', error);
      Alert.alert('Could not update goal', String((error as any)?.message || error));
    } finally {
      setIsSchedulingGoalQuotaAction(false);
    }
  }, [goalGuidancePlan, isSchedulingGoalQuotaAction, updateTodoStateEverywhere]);

  const handleGoalQuotaDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setIsGoalQuotaDatePickerVisible(false);
      return;
    }

    if (!selectedDate) {
      return;
    }

    const nextDate = startOfDay(selectedDate);
    if (Platform.OS === 'android' && event.type === 'set') {
      setIsGoalQuotaDatePickerVisible(false);
      requestAnimationFrame(() => {
        void handleScheduleGoalQuotaAction(nextDate);
      });
      return;
    }

    setPendingGoalQuotaDate(nextDate);
  }, [handleScheduleGoalQuotaAction]);

  const handleConfirmGoalQuotaDate = useCallback(() => {
    setIsGoalQuotaDatePickerVisible(false);
    void handleScheduleGoalQuotaAction(pendingGoalQuotaDate);
  }, [handleScheduleGoalQuotaAction, pendingGoalQuotaDate]);

  const handleRecreateGoalGuidanceAction = useCallback(async () => {
    if (!goalGuidancePlan || isRecreatingGoalGuidanceAction) {
      return;
    }

    setIsRecreatingGoalGuidanceAction(true);

    try {
      const result = await recreateActiveGoalGuidanceTodo(goalGuidancePlan.id);
      setGoalGuidancePlan(result.plan);
      setIsGoalGuidanceAiActive(true);
      if (result.todo) {
        upsertTodoStateEverywhere(result.todo);
      }
    } catch (error) {
      console.error('Error recreating goal guidance action:', error);
      Alert.alert('Could not add action', String((error as any)?.message || error));
    } finally {
      setIsRecreatingGoalGuidanceAction(false);
    }
  }, [goalGuidancePlan, isRecreatingGoalGuidanceAction, upsertTodoStateEverywhere]);

  const animateDetailsModal = useCallback((toValue: number, onComplete?: () => void) => {
    Animated.parallel([
      Animated.timing(detailsModalAnim, {
        toValue,
        duration: toValue === 1 ? 260 : 200,
        easing: toValue === 1 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        onComplete?.();
      }
    });
  }, [detailsModalAnim]);

  const setDetailsInputExpandedAnimated = useCallback((expanded: boolean) => {
    if (expanded) {
      setIsDetailsInputExpanded(true);
    }

    Animated.timing(detailsInputRevealAnim, {
      toValue: expanded ? 1 : 0,
      duration: expanded ? 220 : 160,
      easing: expanded ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !expanded) {
        setIsDetailsInputExpanded(false);
      }
    });
  }, [detailsInputRevealAnim]);

  const handleTodoPress = useCallback((todo: TodoItem, options?: { preserveDetailsBack?: boolean; openRecipeGuide?: boolean; openSkillGuide?: boolean }) => {
    const isTutorialTodoPress =
      isTodoGuidanceTutorialPendingRef.current &&
      tutorialTodoIdRef.current === todo.id &&
      activeTarget?.type === 'todo' &&
      activeTarget.todoId === todo.id;
    const isTutorialGoalPress =
      isGoalGuidanceTutorialPendingRef.current &&
      tutorialGoalTodoIdRef.current === todo.id &&
      activeTarget?.type === 'todo' &&
      activeTarget.todoId === todo.id;
    const observedGoalGuidanceState = getObservedGoalGuidanceStateForTodo(todo);

    if (options?.preserveDetailsBack && selectedTodoForDetails) {
      debouncedSaveDetails.flush();
      setDetailsBackStack((currentStack) => [
        ...currentStack,
        {
          ...selectedTodoForDetails,
          text: editedTodoTitle || selectedTodoForDetails.text,
          details: editedTodoDetails,
        },
      ]);
    } else {
      setDetailsBackStack([]);
    }

    setSelectedTodoForDetails(todo);
    recurringEditScopeRef.current = {};
    setDetailsOpenVersion((current) => current + 1);
    setEditedTodoTitle(todo.text || '');
    setEditedTodoDetails(todo.details || '');
    setIsDetailsInputExpanded(false);
    detailsInputRevealAnim.setValue(todo.workspace === 'Personal' || todo.workspace === 'Goals' ? 0 : 1);
    setGoalGuidancePlan(observedGoalGuidanceState.goalPlan);
    setGoalGuidanceParentPlan(observedGoalGuidanceState.parentPlan);
    setGoalGuidanceAlternative(null);
    setIsGoalGuidanceAiActive(!!observedGoalGuidanceState.goalPlan || !!observedGoalGuidanceState.parentPlan);
    setIsGoalGuidanceHistoryExpanded(false);
    recipeGuideRef.current = null;
    recipeVideoSearchQueryRef.current = '';
    recipeSeenVideoIdsRef.current = new Set();
    checkedRecipeIngredientKeysRef.current = {};
    setRecipeGuide(null);
    setRecipeAnswersDraft(createDefaultRecipeAnswers());
    setCheckedRecipeIngredientKeys({});
    setIsRecipeGuidanceAiActive(!!options?.openRecipeGuide);
    setIsRecipeChatHistoryExpanded(false);
    setIsRecipeWorking(false);
    skillVideoSearchQueryRef.current = '';
    skillSeenVideoIdsRef.current = new Set();
    setSkillGuide(null);
    setLoadedSkillGuideTodoId(null);
    setIsSkillGuidanceAiActive(!!options?.openSkillGuide);
    setIsSkillChatHistoryExpanded(false);
    setIsSkillWorking(false);
    setTaskGuide(null);
    setLoadedTaskGuideTodoId(null);
    setIsTaskGuidanceAiActive(false);
    setIsTaskGuidanceHistoryExpanded(false);
    setIsRecipeWishlistModalVisible(false);
    setRecipeWishlistSelection({});
    setIsAddingRecipeWishlistItems(false);
    isCheckingWishlistPurchaseIntentRef.current = false;
    setIsCheckingWishlistPurchaseIntent(false);
    setDetailsReminderNotice(null);
    setPendingGuideScrollTarget(
      options?.openRecipeGuide
        ? 'recipe'
        : options?.openSkillGuide
          ? 'skill'
          : null
    );
    clearGoalGuidanceNotice();
    clearRecipeNotice();
    clearSkillNotice();
    clearTaskGuidanceNotice();
    void cancelGoalGuidanceVoiceListening();
    void cancelRecipeVoiceListening();
    void cancelSkillVoiceListening();
    void cancelTaskGuidanceVoiceListening();
    setIsReminderModalVisible(false);
    setIsDetailsTimePickerVisible(false);
    setIsDetailsModalVisible(true);
    if (isTutorialTodoPress || isTutorialGoalPress) {
      cancelGuidance();
      if (isTutorialTodoPress) {
        todoGuidanceTutorialStageRef.current = null;
      }
      if (isTutorialGoalPress) {
        goalGuidanceTutorialStageRef.current = null;
      }
    }
    detailsModalAnim.setValue(0);
    requestAnimationFrame(() => {
      animateDetailsModal(1);
    });
  }, [
    animateDetailsModal,
    activeTarget,
    cancelGoalGuidanceVoiceListening,
    cancelRecipeVoiceListening,
    cancelSkillVoiceListening,
    clearGoalGuidanceNotice,
    clearRecipeNotice,
    clearSkillNotice,
    clearTaskGuidanceNotice,
    debouncedSaveDetails,
    detailsModalAnim,
    detailsInputRevealAnim,
    editedTodoDetails,
    editedTodoTitle,
    getObservedGoalGuidanceStateForTodo,
    setPendingGuideScrollTarget,
    selectedTodoForDetails,
    cancelTaskGuidanceVoiceListening,
    cancelGuidance,
  ]);

  useEffect(() => {
    if (!isDetailsModalVisible || !pendingGuideScrollTarget) {
      return;
    }

    const timeout = setTimeout(() => {
      if (pendingGuideScrollTarget === 'recipe') {
        scrollRecipeGuidanceIntoView();
      } else {
        scrollSkillGuidanceIntoView();
      }
      setPendingGuideScrollTarget(null);
    }, 120);

    return () => clearTimeout(timeout);
  }, [isDetailsModalVisible, pendingGuideScrollTarget, scrollRecipeGuidanceIntoView, scrollSkillGuidanceIntoView]);

  useEffect(() => {
    if (!selectedTodoForDetails?.id) {
      return;
    }

    if (selectedTodoForDetails.workspace === 'Goals') {
      if (!usesGoalGuidancePath || shouldShowGuidancePathChoice) {
        setGoalGuidancePlan(null);
        setGoalGuidanceParentPlan(null);
        setGoalGuidanceAlternative(null);
        setIsGoalGuidanceAiActive(false);
        return;
      }

      const observedPlan = observedGoalGuidancePlanByGoalId.get(selectedTodoForDetails.id) || null;
      if (pendingGoalGuidanceStepUncheckRef.current?.goalId === selectedTodoForDetails.id) {
        return;
      }

      setGoalGuidancePlan(observedPlan);
      setGoalGuidanceParentPlan(null);
      setGoalGuidanceAlternative(null);
      if (observedPlan?.status === 'preview') {
        setIsGoalGuidanceAiActive(true);
      }

      void loadGoalGuidancePlan(selectedTodoForDetails.id);
      return;
    }

    const observedMiniPlan = observedGoalGuidancePlanByGoalId.get(selectedTodoForDetails.id) || null;
    const observedParentPlan = observedGoalGuidanceParentPlanByActionTodoId.get(selectedTodoForDetails.id) || null;
    const pendingGoalGuidanceStepUncheck = pendingGoalGuidanceStepUncheckRef.current;
    if (
      pendingGoalGuidanceStepUncheck &&
      (
        pendingGoalGuidanceStepUncheck.planId === observedMiniPlan?.id ||
        pendingGoalGuidanceStepUncheck.planId === observedParentPlan?.id
      )
    ) {
      return;
    }

    const observedParentGoalTodo = observedParentPlan
      ? localTodosRef.current.find((todo) => todo.id === observedParentPlan.goalId)
      : null;
    const canUseObservedParentPlan = observedParentGoalTodo?.workspace === 'Goals';

    setGoalGuidancePlan(canUseObservedParentPlan ? observedMiniPlan : null);
    setGoalGuidanceParentPlan(canUseObservedParentPlan ? observedParentPlan : null);
    setGoalGuidanceAlternative(null);
    if (canUseObservedParentPlan && (observedMiniPlan || observedParentPlan)) {
      setIsGoalGuidanceAiActive(true);
    }

    if (canUseObservedParentPlan && (observedMiniPlan || observedParentPlan)) {
      // Keep the immediate observed render, then reconcile from storage in background.
    }

    let cancelled = false;
    const loadVersion = goalGuidanceLoadVersionRef.current;

    const loadActionGuidancePlan = async () => {
      try {
        const [loadedMiniPlan, loadedParentPlan] = await Promise.all([
          fetchGoalGuidancePlanForGoal(selectedTodoForDetails.id),
          fetchGoalGuidancePlanForActionTodo(selectedTodoForDetails.id),
        ]);
        if (cancelled || goalGuidanceLoadVersionRef.current !== loadVersion) {
          return;
        }
        const parentGoalTodo = loadedParentPlan
          ? localTodosRef.current.find((todo) => todo.id === loadedParentPlan.goalId)
          : null;
        const canDrillIntoAction = parentGoalTodo?.workspace === 'Goals';
        const miniPlan = canDrillIntoAction ? loadedMiniPlan : null;
        const parentPlan = canDrillIntoAction ? loadedParentPlan : null;

        setGoalGuidancePlan(miniPlan);
        setGoalGuidanceParentPlan(parentPlan);
        setGoalGuidanceAlternative(null);
        if (miniPlan || parentPlan) {
          setIsGoalGuidanceAiActive(true);
        }
      } catch (error) {
        console.error('Error loading action guidance plan:', error);
        if (!cancelled && goalGuidanceLoadVersionRef.current === loadVersion) {
          setGoalGuidancePlan(null);
          setGoalGuidanceParentPlan(null);
          setGoalGuidanceAlternative(null);
        }
      }
    };

    void loadActionGuidancePlan();
    return () => {
      cancelled = true;
    };
  }, [
    loadGoalGuidancePlan,
    observedGoalGuidanceParentPlanByActionTodoId,
    observedGoalGuidancePlanByGoalId,
    selectedTodoForDetails?.id,
    selectedTodoForDetails?.workspace,
    shouldShowGuidancePathChoice,
    usesGoalGuidancePath,
  ]);

  useEffect(() => {
    if (!selectedTodoForDetails?.id || !isSelectedRecipeKind || !usesVideoGuidancePath) {
      recipeGuideRef.current = null;
      recipeVideoSearchQueryRef.current = '';
      recipeSeenVideoIdsRef.current = new Set();
      checkedRecipeIngredientKeysRef.current = {};
      setRecipeGuide(null);
      setRecipeAnswersDraft(createDefaultRecipeAnswers());
      setCheckedRecipeIngredientKeys({});
      return;
    }

    let cancelled = false;
    const loadRecipeGuide = async () => {
      try {
        const guide = await fetchRecipeGuideForTodo(selectedTodoForDetails.id);
        if (cancelled) {
          return;
        }
        recipeVideoSearchQueryRef.current = '';
        recipeSeenVideoIdsRef.current = extendSeenVideoIds(
          new Set(),
          guide?.videos || [],
          guide?.selectedVideo?.videoId ? [guide.selectedVideo.videoId] : []
        );
        const checkedMap = getRecipeIngredientCheckedMap(guide);
        recipeGuideRef.current = guide;
        checkedRecipeIngredientKeysRef.current = checkedMap;
        setRecipeGuide(guide);
        setRecipeAnswersDraft(guide?.answers || createDefaultRecipeAnswers());
        setCheckedRecipeIngredientKeys(checkedMap);
        if (guide) {
          setIsRecipeGuidanceAiActive(true);
        }
      } catch (error) {
        console.error('Error loading recipe guide:', error);
        if (!cancelled) {
          recipeGuideRef.current = null;
          recipeVideoSearchQueryRef.current = '';
          recipeSeenVideoIdsRef.current = new Set();
          checkedRecipeIngredientKeysRef.current = {};
          setRecipeGuide(null);
          setRecipeAnswersDraft(createDefaultRecipeAnswers());
          setCheckedRecipeIngredientKeys({});
        }
      }
    };

    void loadRecipeGuide();
    return () => {
      cancelled = true;
    };
  }, [detailsOpenVersion, isSelectedRecipeKind, selectedTodoForDetails?.id, usesVideoGuidancePath]);

  useEffect(() => {
    const canLoadVideoGuide =
      !!selectedTodoForDetails &&
      !isSelectedGoalManagedTodo &&
      (
        selectedTodoForDetails.workspace === 'Personal'
          ? !isSelectedRecipeKind && (selectedTaskKind === 'normal' || selectedTaskKind === 'skill')
          : selectedTaskKind === 'skill' && usesVideoGuidancePath
      );

    if (!selectedTodoForDetails?.id || !canLoadVideoGuide) {
      skillVideoSearchQueryRef.current = '';
      skillSeenVideoIdsRef.current = new Set();
      setSkillGuide(null);
      setLoadedSkillGuideTodoId(null);
      return;
    }

    const todoId = selectedTodoForDetails.id;
    let cancelled = false;
    const loadSkillGuide = async () => {
      try {
        const guide = await fetchSkillGuideForTodo(todoId);
        if (cancelled) {
          return;
        }
        skillVideoSearchQueryRef.current = '';
        skillSeenVideoIdsRef.current = extendSeenVideoIds(
          new Set(),
          guide?.videos || [],
          guide?.selectedVideo?.videoId ? [guide.selectedVideo.videoId] : []
        );
        setSkillGuide(guide);
        setLoadedSkillGuideTodoId(todoId);
        if (guide) {
          setIsSkillGuidanceAiActive(true);
        }
      } catch (error) {
        console.error('Error loading skill guide:', error);
        if (!cancelled) {
          skillVideoSearchQueryRef.current = '';
          skillSeenVideoIdsRef.current = new Set();
          setSkillGuide(null);
          setLoadedSkillGuideTodoId(todoId);
        }
      }
    };

    void loadSkillGuide();
    return () => {
      cancelled = true;
    };
  }, [isSelectedGoalManagedTodo, isSelectedRecipeKind, selectedTaskKind, selectedTodoForDetails, usesVideoGuidancePath]);

  useEffect(() => {
    if (
      !selectedTodoForDetails?.id ||
      selectedTodoForDetails.workspace !== 'Personal' ||
      goalManagedTodoIds.has(selectedTodoForDetails.id) ||
      isSelectedRecipeKind ||
      !(selectedTaskKind === 'normal' || selectedTaskKind === 'skill')
    ) {
      setTaskGuide(null);
      setLoadedTaskGuideTodoId(null);
      setIsTaskGuidanceAiActive(false);
      return;
    }

    const todoId = selectedTodoForDetails.id;
    let cancelled = false;
    const loadTaskGuide = async () => {
      try {
        const guide = await fetchTaskGuideForTodo(todoId);
        if (cancelled) {
          return;
        }
        setTaskGuide(guide);
        setLoadedTaskGuideTodoId(todoId);
        if (guide) {
          setIsTaskGuidanceAiActive(true);
        }
      } catch (error) {
        console.error('Error loading task guide:', error);
        if (!cancelled) {
          setTaskGuide(null);
          setLoadedTaskGuideTodoId(todoId);
        }
      }
    };

    void loadTaskGuide();
    return () => {
      cancelled = true;
    };
  }, [goalManagedTodoIds, isSelectedRecipeKind, selectedTaskKind, selectedTodoForDetails?.id, selectedTodoForDetails?.workspace]);

  useEffect(() => {
    if (
      !selectedTodoForDetails?.id ||
      selectedTodoForDetails.taskKind ||
      (selectedTodoForDetails.workspace !== 'Personal' && selectedTodoForDetails.workspace !== 'Goals') ||
      (selectedTodoForDetails.workspace === 'Personal' && goalManagedTodoIds.has(selectedTodoForDetails.id)) ||
      classifyingTodoIds[selectedTodoForDetails.id] ||
      classificationRetryTodoIdsRef.current.has(selectedTodoForDetails.id)
    ) {
      return;
    }

    classificationRetryTodoIdsRef.current.add(selectedTodoForDetails.id);

    const classifySelectedTodo = async () => {
      try {
        await classifyTodoInBackground({
          todoId: selectedTodoForDetails.id,
          title: editedTodoTitle || selectedTodoForDetails.text,
          details: editedTodoDetails || selectedTodoForDetails.details || '',
          workspace: selectedTodoForDetails.workspace || 'Personal',
          goalTimeframe: selectedTodoForDetails.goalTimeframe,
          guidancePath: selectedTodoForDetails.guidancePath || null,
        });
      } catch (error) {
        console.warn('Todo classification retry failed:', error);
      }
    };

    void classifySelectedTodo();
  }, [
    editedTodoDetails,
    editedTodoTitle,
    selectedTodoForDetails?.details,
    selectedTodoForDetails?.guidancePath,
    selectedTodoForDetails?.id,
    selectedTodoForDetails?.taskKind,
    selectedTodoForDetails?.text,
    selectedTodoForDetails?.workspace,
    classifyingTodoIds,
    classifyTodoInBackground,
    goalManagedTodoIds,
  ]);

  const { preserveDetailsModal, openTodoId, openTodoNonce, goalSuggestionNonce } = useGlobalSearchParams<{
    preserveDetailsModal?: string;
    openTodoId?: string;
    openTodoNonce?: string;
    goalSuggestionNonce?: string;
  }>();
  const openedTodoFromParamsRef = useRef<string | null>(null);
  const pendingGoalSuggestionOpenTodoIdsRef = useRef(new Set<string>());

  const resetDetailsModalState = useCallback((shouldFlushPendingDetails = true) => {
    setIsDetailsModalVisible(false);
    setSelectedTodoForDetails(null);
    setEditedTodoTitle('');
    setEditedTodoDetails('');
    setIsDetailsInputExpanded(false);
    detailsInputRevealAnim.setValue(0);
    setDetailsBackStack([]);
    setGoalGuidancePlan(null);
    setGoalGuidanceParentPlan(null);
    setGoalGuidanceAlternative(null);
    setIsGoalGuidanceAiActive(false);
    setIsGoalGuidanceHistoryExpanded(false);
    recipeGuideRef.current = null;
    checkedRecipeIngredientKeysRef.current = {};
    setRecipeGuide(null);
    setRecipeAnswersDraft(createDefaultRecipeAnswers());
    setIsRecipeGuidanceAiActive(false);
    setIsRecipeChatHistoryExpanded(false);
    setSkillGuide(null);
    setLoadedSkillGuideTodoId(null);
    setIsSkillGuidanceAiActive(false);
    setIsSkillChatHistoryExpanded(false);
    setIsSkillWorking(false);
    setIsGuidancePathSwitching(false);
    setTaskGuide(null);
    setLoadedTaskGuideTodoId(null);
    setIsTaskGuidanceAiActive(false);
    setIsTaskGuidanceHistoryExpanded(false);
    setIsRecipeWishlistModalVisible(false);
    setCheckedRecipeIngredientKeys({});
    setRecipeWishlistSelection({});
    setIsAddingRecipeWishlistItems(false);
    isCheckingWishlistPurchaseIntentRef.current = false;
    setIsCheckingWishlistPurchaseIntent(false);
    setGoalWishlistSuggestionToast(null);
    setIsAddingGoalWishlistSuggestions(false);
    setDetailsReminderNotice(null);
    setIsDetailsRepeatPickerVisible(false);
    recurringEditScopeRef.current = {};
    clearGoalGuidanceNotice();
    clearRecipeNotice();
    clearSkillNotice();
    clearTaskGuidanceNotice();
    void cancelGoalGuidanceVoiceListening();
    void cancelRecipeVoiceListening();
    void cancelSkillVoiceListening();
    void cancelTaskGuidanceVoiceListening();
    setIsReminderModalVisible(false);
    setIsDetailsTimePickerVisible(false);
    if (shouldFlushPendingDetails) {
      debouncedSaveDetails.flush();
    } else {
      debouncedSaveDetails.cancel();
    }
  }, [cancelGoalGuidanceVoiceListening, cancelRecipeVoiceListening, cancelSkillVoiceListening, cancelTaskGuidanceVoiceListening, clearGoalGuidanceNotice, clearRecipeNotice, clearSkillNotice, clearTaskGuidanceNotice, debouncedSaveDetails, detailsInputRevealAnim]);
  resetDetailsModalStateRef.current = resetDetailsModalState;

  const handleCloseDetailsModal = useCallback((shouldFlushPendingDetails = true) => {
    if (preserveDetailsModal === 'true') {
      return;
    }

    if (shouldFlushPendingDetails) {
      saveCurrentDetailsImmediately();
    }

    animateDetailsModal(0, () => resetDetailsModalState(shouldFlushPendingDetails));
  }, [animateDetailsModal, preserveDetailsModal, resetDetailsModalState, saveCurrentDetailsImmediately]);

  const handleDetailsBackPress = useCallback(() => {
    const previousTodo = detailsBackStack[detailsBackStack.length - 1];
    const isGoalTutorialBackTarget =
      isGoalGuidanceTutorialPendingRef.current &&
      activeTarget?.type === 'screen' &&
      activeTarget.params?.todoAction === 'tutorial-details-back';
    if (!previousTodo) {
      handleCloseDetailsModal();
      if (isGoalTutorialBackTarget) {
        cancelGuidance();
        setTimeout(() => {
          showGoalWorkspaceSwipeGuidance();
        }, 700);
      }
      return;
    }

    const observedGoalGuidanceState = getObservedGoalGuidanceStateForTodo(previousTodo);
    saveCurrentDetailsImmediately();
    setDetailsBackStack((currentStack) => currentStack.slice(0, -1));

    animateDetailsModal(0, () => {
      setSelectedTodoForDetails(previousTodo);
      recurringEditScopeRef.current = {};
      setEditedTodoTitle(previousTodo.text || '');
      setEditedTodoDetails(previousTodo.details || '');
      setIsDetailsInputExpanded(false);
      detailsInputRevealAnim.setValue(previousTodo.workspace === 'Personal' || previousTodo.workspace === 'Goals' ? 0 : 1);
      setGoalGuidancePlan(observedGoalGuidanceState.goalPlan);
      setGoalGuidanceParentPlan(observedGoalGuidanceState.parentPlan);
      setGoalGuidanceAlternative(null);
      setIsGoalGuidanceAiActive(!!observedGoalGuidanceState.goalPlan || !!observedGoalGuidanceState.parentPlan);
      setIsGoalGuidanceHistoryExpanded(false);
      recipeGuideRef.current = null;
      checkedRecipeIngredientKeysRef.current = {};
      setRecipeGuide(null);
      setRecipeAnswersDraft(createDefaultRecipeAnswers());
      setCheckedRecipeIngredientKeys({});
      setIsRecipeGuidanceAiActive(false);
      setIsRecipeChatHistoryExpanded(false);
      setIsRecipeWorking(false);
      setSkillGuide(null);
      setLoadedSkillGuideTodoId(null);
      setIsSkillGuidanceAiActive(false);
      setIsSkillChatHistoryExpanded(false);
      setIsSkillWorking(false);
      setIsGuidancePathSwitching(false);
      setTaskGuide(null);
      setLoadedTaskGuideTodoId(null);
      setIsTaskGuidanceAiActive(false);
      setIsTaskGuidanceHistoryExpanded(false);
      setPendingGuideScrollTarget(null);
      setIsRecipeWishlistModalVisible(false);
      setRecipeWishlistSelection({});
      setIsAddingRecipeWishlistItems(false);
      isCheckingWishlistPurchaseIntentRef.current = false;
      setIsCheckingWishlistPurchaseIntent(false);
      setDetailsReminderNotice(null);
      clearGoalGuidanceNotice();
      clearRecipeNotice();
      clearSkillNotice();
      clearTaskGuidanceNotice();
      void cancelGoalGuidanceVoiceListening();
      void cancelRecipeVoiceListening();
      void cancelSkillVoiceListening();
      void cancelTaskGuidanceVoiceListening();
      setIsReminderModalVisible(false);
      setIsDetailsTimePickerVisible(false);
      requestAnimationFrame(() => {
        animateDetailsModal(1);
      });
    });
  }, [
    animateDetailsModal,
    activeTarget,
    cancelGuidance,
    cancelGoalGuidanceVoiceListening,
    cancelRecipeVoiceListening,
    cancelSkillVoiceListening,
    cancelTaskGuidanceVoiceListening,
    clearGoalGuidanceNotice,
    clearRecipeNotice,
    clearSkillNotice,
    clearTaskGuidanceNotice,
    detailsInputRevealAnim,
    detailsBackStack,
    getObservedGoalGuidanceStateForTodo,
    handleCloseDetailsModal,
    saveCurrentDetailsImmediately,
    setPendingGuideScrollTarget,
    showGoalWorkspaceSwipeGuidance,
  ]);

  useEffect(() => {
    if (!isDetailsModalVisible || !selectedTodoForDetails) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isDetailsTimePickerVisible) {
        handleDismissDetailsTimePicker();
        return true;
      }

      handleDetailsBackPress();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [
    handleDetailsBackPress,
    handleDismissDetailsTimePicker,
    isDetailsModalVisible,
    isDetailsTimePickerVisible,
    selectedTodoForDetails,
  ]);

  useFocusEffect(
    useCallback(() => {
      const uniqueKey = `${openTodoId || ''}:${openTodoNonce || ''}`;
      if (openTodoId && openedTodoFromParamsRef.current !== uniqueKey) {
        if (goalSuggestionNonce) {
          pendingGoalSuggestionOpenTodoIdsRef.current.add(String(openTodoId));
        }
        setPendingOpenTodoId(String(openTodoId));
        openedTodoFromParamsRef.current = uniqueKey;
        router.setParams({
          openTodoId: undefined,
          openTodoNonce: undefined,
          goalSuggestionNonce: undefined,
          workspaceKey: undefined,
          workspaceNonce: undefined,
        } as any);
      }
    }, [goalSuggestionNonce, openTodoId, openTodoNonce, router])
  );

  useEffect(() => {
    if (!pendingOpenTodoId) {
      return;
    }

    if (pendingGoalWishlistAutoOpenTodoIdRef.current === pendingOpenTodoId) {
      pendingGoalWishlistAutoOpenTodoIdRef.current = null;
    }
    queueFocusedTodoOpen(pendingOpenTodoId);
    setPendingOpenTodoId(null);
  }, [pendingOpenTodoId, queueFocusedTodoOpen]);

  const handleToggleStarted = async (todoId: string) => {
    try {
      const todoToUpdate = localTodos.find(t => t.id === todoId);
      if (!todoToUpdate) return;

      const newStartedAt = todoToUpdate.startedAt ? undefined : new Date();

      setLocalTodos(prev => prev.map(t => t.id === todoId ? { ...t, startedAt: newStartedAt } : t));

      await updateTodo(todoId, { startedAt: newStartedAt ?? null });
    } catch (error) {
      console.error('Error toggling todo started state:', error);
    }
  };

  const handleFinishTodo = async (todoId: string) => {
    const todoToFinish = localTodosRef.current.find((todo) => todo.id === todoId);
    if (!todoToFinish || todoToFinish.completed) return;

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      setLocalTodos(prev => prev.map(t =>
        t.id === todoId ? { ...t, completed: true } : t
      ));
      await completeTaskGuideStepsForTodo(todoId);
      const result = await updateTodo(todoId, { completed: true }, { syncReminder: true });
      updateTodoStateEverywhere(todoId, getTodoOrderingStatePatch(result.todo));
      await handleGoalActionCompleted(todoId);
    } catch (error) {
      console.error('Error finishing todo:', error);
    }
  };

  const handleSliderChange = async (todoId: string, value: number) => {
    const todoToUpdate = localTodos.find(t => t.id === todoId);
    if (!todoToUpdate) return;

    const newStartedAt = value > 0 ? (todoToUpdate.startedAt || new Date()) : undefined;
    const wasCompleted = !!todoToUpdate.completed;
    const isNowCompleted = value >= 1;

    if (!wasCompleted && isNowCompleted) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    setLocalTodos(prevTodos =>
      prevTodos.map(t =>
        t.id === todoId ? { ...t, progress: value, startedAt: newStartedAt, completed: value >= 1 } : t
      )
    );
    try {
      const result = await updateTodo(
        todoId,
        {
          progress: value,
          startedAt: newStartedAt ?? null,
          completed: value >= 1,
        },
        {
          syncReminder: wasCompleted !== isNowCompleted,
        }
      );
      if (wasCompleted !== isNowCompleted) {
        handleReminderResult(result.reminderStatus);
        updateTodoStateEverywhere(todoId, getTodoOrderingStatePatch(result.todo));
      }
      if (!wasCompleted && isNowCompleted) {
        await completeTaskGuideStepsForTodo(todoId);
        await handleGoalActionCompleted(todoId);
      }
    } catch (error) {
      console.error('Error updating slider:', error);
    }
  };

  const handleTodoRevealLayout = useCallback((todoId: string, event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setTodoRevealLayouts((current) => {
      const previous = current[todoId];
      if (
        previous &&
        Math.abs(previous.width - width) < 0.5 &&
        Math.abs(previous.height - height) < 0.5
      ) {
        return current;
      }

      return {
        ...current,
        [todoId]: { width, height },
      };
    });

    if (pendingTodoRevealRef.current?.todoId === todoId) {
      schedulePendingTodoRevealAttempt(0);
    }
  }, [schedulePendingTodoRevealAttempt]);

  const wrapTodoWithRevealShell = useCallback((todoId: string, child: React.ReactNode) => {
    const isActive = activeRevealTodoId === todoId;
    const layout = todoRevealLayouts[todoId];
    const isGuidedTodoTarget = activeTarget?.type === 'todo' && activeTarget.todoId === todoId;
    const ringStrokeWidth = isGuidedTodoTarget ? 5 : 3.2;
    const ringWidth = layout?.width || 0;
    const ringHeight = layout?.height ? Math.max(0, layout.height - 10) : 0;
    const ringPathWidth = Math.max(0, ringWidth - ringStrokeWidth);
    const ringPathHeight = Math.max(0, ringHeight - ringStrokeWidth);
    const ringCornerRadius = 18;
    const ringPerimeter = ringPathWidth > 0 && ringPathHeight > 0
      ? Math.max(1, 2 * Math.max(0, ringPathWidth - ringPathHeight) + Math.PI * ringPathHeight)
      : 1;
    const ringStrokeOffset = todoRevealGlowAnim.interpolate({
      inputRange: [0, 0.82, 1],
      outputRange: [ringPerimeter, 0, 0],
      extrapolate: 'clamp',
    });
    const ringOpacity = todoRevealGlowAnim.interpolate({
      inputRange: [0, 0.08, 0.82, 1],
      outputRange: [0, 0.98, 0.98, 0],
      extrapolate: 'clamp',
    });
    const ringShadowOpacity = todoRevealGlowAnim.interpolate({
      inputRange: [0, 0.12, 0.82, 1],
      outputRange: [0, 0.34, 0.34, 0],
      extrapolate: 'clamp',
    });

    return (
      <GuidedTarget
        key={`todo-shell-${todoId}`}
        targetId={getTodoItemGuidanceTargetId(todoId)}
        label="Todo"
        localHighlightVisible={false}
      >
        <Animated.View
          ref={(node) => {
            todoRowRefs.current[todoId] = node as View | null;
          }}
          collapsable={false}
          onLayout={(event) => handleTodoRevealLayout(todoId, event)}
          style={[
            styles.todoRevealShell,
            isActive ? styles.todoRevealShellActive : undefined,
          ]}
        >
          {child}
          {isActive && ringWidth > 0 && ringHeight > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.todoRevealGlow,
                {
                  opacity: ringShadowOpacity,
                  transform: [{
                    scale: todoRevealGlowAnim.interpolate({
                      inputRange: [0, 0.82, 1],
                      outputRange: [0.996, 1.012, 1.012],
                    }),
                  }],
                },
              ]}
            >
              <Svg
                pointerEvents="none"
                width={ringWidth}
                height={ringHeight}
                style={styles.todoRevealGlowSvg}
              >
                <AnimatedRect
                  x={ringStrokeWidth / 2}
                  y={ringStrokeWidth / 2}
                  width={ringPathWidth}
                  height={ringPathHeight}
                  rx={ringCornerRadius}
                  ry={ringCornerRadius}
                  fill="transparent"
                  stroke="rgba(174, 255, 232, 0.98)"
                  strokeWidth={ringStrokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${ringPerimeter} ${ringPerimeter}`}
                  strokeDashoffset={ringStrokeOffset}
                  opacity={ringOpacity}
                />
              </Svg>
            </Animated.View>
          ) : null}
        </Animated.View>
      </GuidedTarget>
    );
  }, [activeRevealTodoId, activeTarget, handleTodoRevealLayout, todoRevealGlowAnim, todoRevealLayouts]);

  const renderTodoItem = useCallback((
    todo: TodoItem & { workspace: string },
    isInCompletedSection: boolean,
    sectionKey: TodoSectionKey,
    themeColor?: string,
    dragContext?: { drag?: () => void; isActive?: boolean }
  ) => {
    const workspaceAppearance = getTodoWorkspaceAppearance(todo.workspace);
    const todoType = todo.workspace === 'Wishlist' ? 'basic' : (todo.type || workspaceTodoTypes[todo.workspace] || 'basic');
    const theme = getTheme(workspaceAppearance?.themeColor || themeColor);
    const drag = dragContext?.drag;
    const activeDrag = isTodoDragActive && !!dragContext?.isActive;
    const dragHandlers = drag
      ? {
          onLongPress: () => handleTodoDragLongPress(drag),
        }
      : undefined;
    const usesManagedOverdueDate = todo.workspace === 'Personal' || todo.workspace === 'Goals';
    const isOverdue = usesManagedOverdueDate && isOverdueIncompleteTodo(todo);
    const isLegacyPastDueDate = !usesManagedOverdueDate && !!todo.dueDate && isPast(todo.dueDate) && !isToday(todo.dueDate);
    const baseDueDateLabel = isOverdue
      ? formatOverdueDueDate(todo.dueDate)
      : (todo.workspace === 'Wishlist' ? '' : formatDueDate(todo.dueDate, todo.hasDueTime, sectionKey));
    const dueDateLabel = sectionKey === 'completed' && todo.recurrenceCompletedCount && todo.recurrenceCompletedCount > 1
      ? `${baseDueDateLabel} x${todo.recurrenceCompletedCount}`
      : baseDueDateLabel;
    const titleMatchesSearch = todoValueIncludesAnySearchTerm(todo.text || '', todoSearchQuery);
    const details = todo.details?.trim() || '';
    const shouldShowDetailsSnippet = !!details && todoValueIncludesAnySearchTerm(details, todoSearchQuery) && (
      !titleMatchesSearch || todoDetailsAddSearchContext(todo.text || '', details, todoSearchQuery)
    );

    if (todo.completed) {
      // Keep completed todos basic
    } else {
      switch (todoType) {
        case 'progress':
          return wrapTodoWithRevealShell(todo.id, (
            <Pressable
              key={todo.id}
              onPress={() => handleTodoPress(todo)}
              onLongPress={dragHandlers?.onLongPress}
              delayLongPress={TODO_DRAG_LONG_PRESS_MS}
              style={({ pressed }) => [
                activeDrag && styles.draggingTodoItem,
                pressed && !activeDrag && !dragHandlers && styles.pressedTodoItem,
              ]}
            >
              <TodoCardSurface
                gradientColors={workspaceAppearance?.todoCardGradientColors || theme.todoCardGradientColors}
                strokeColor={workspaceAppearance?.todoCardStrokeColor || theme.todoCardStrokeColor}
              >
                <View className="flex-row items-center justify-between">
                  <TouchableOpacity
                    onPress={() => handleToggleStarted(todo.id)}
                    className="items-center -mt-2"
                    style={activeDrag ? styles.dragFadedCardDetails : undefined}
                  >
                    <Text className="text-[10px] text-[#A6A6A6] italic mb-1">Started</Text>
                    <View
                      className="w-5 h-5 rounded-full justify-center items-center"
                      style={{
                        backgroundColor: (todo.startedAt && !todo.completed) ? theme.progressStarted : theme.progressStartedInactive
                      }}
                    >
                    </View>
                  </TouchableOpacity>

                  <Text
                    className="text-[15px] text-center flex-1 mx-4 mt-1"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={{ color: '#3A6860', fontWeight: '700', flexShrink: 1 }}
                  >
                    {renderTodoHighlightedText(todo.text, todoSearchQuery)}
                  </Text>

                  <TouchableOpacity
                    onPress={() => todo.startedAt && handleFinishTodo(todo.id)}
                    disabled={!todo.startedAt}
                    className="items-center -mt-2"
                    style={activeDrag ? styles.dragFadedCardDetails : undefined}
                  >
                    <Text className="text-[10px] text-[#A6A6A6] italic mb-1">Finished</Text>
                    <View
                      className="w-5 h-5 rounded-full"
                      style={{
                        backgroundColor: todo.completed ? theme.progressFinished : (theme.progressFinishedInactive || theme.progressStartedInactive)
                      }}
                    />
                  </TouchableOpacity>
                </View>
                {shouldShowDetailsSnippet && (
                  <Text
                    style={[todoSearchTextStyles.detailsSnippet, activeDrag && styles.dragFadedCardDetails]}
                    numberOfLines={2}
                  >
                    {renderTodoHighlightedText(getTodoDetailsMatchSnippet(details, todoSearchQuery), todoSearchQuery)}
                  </Text>
                )}
                {activeDrag && <DragStateHandle />}
              </TodoCardSurface>
            </Pressable>
          ));
        case 'slider':
          return wrapTodoWithRevealShell(todo.id, (
            <SliderTodoItem
              key={todo.id}
              todo={todo}
              onSliderChange={handleSliderChange}
              handleTodoPress={handleTodoPress}
              themeColor={themeColor}
              dragHandlers={dragHandlers}
              isDragging={activeDrag}
              searchQuery={todoSearchQuery}
            />
          ));
      }
    }

    // Basic Todo item
    const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
      const translateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [80, 0],
        extrapolate: 'clamp',
      });

      const opacity = progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp',
      });

      return (
        <View style={{ paddingHorizontal: 10 }}>
          <TouchableOpacity
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              void handleSwipeDelete(todo.id);
            }}
            style={{ height: '100%' }}
          >
            <Animated.View
              style={[{
                backgroundColor: '#19292C',
                justifyContent: 'center',
                alignItems: 'center',
                width: 80,
                height: '85%',
                marginBottom: 10,
                borderRadius: 16,
                alignSelf: 'center',
                transform: [{ translateX }],
                opacity,
              }]}
            >
              <Ionicons name="trash-outline" size={20} color="white" />
              <Text style={styles.deleteText}>
                Delete
              </Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      );
    };

    const isWishlistBuyLoading =
      todo.workspace === 'Wishlist' &&
      buyingTodoId === todo.id;
    const goalActionMetadata =
      todo.workspace === 'Personal'
        ? goalActionMetadataByTodoId.get(todo.id)
        : undefined;
    const youtubeUrl = goalActionMetadata?.youtubeQuery
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(goalActionMetadata.youtubeQuery)}`
      : undefined;
    const isGoalSubtask = todo.workspace === 'Personal' && goalSubtaskTodoIds.has(todo.id);
    const isGoalManagedTodo = todo.workspace === 'Personal' && goalManagedTodoIds.has(todo.id);
    const showRecipeShortcut = !isGoalManagedTodo && shouldShowRecipeGuideShortcut(todo);
    const rawTaskProgress = taskProgressByTodoId.get(todo.id);
    const rawSkillProgress = skillProgressByTodoId.get(todo.id);
    const personalRowGuidancePath: GuidancePath | null =
      todo.workspace === 'Personal' && !showRecipeShortcut
        ? todo.guidancePath || (rawTaskProgress ? 'actions' : rawSkillProgress ? 'video' : null)
        : null;
    const showsVideoGuideProgress =
      todo.workspace === 'Goals'
        ? todo.guidancePath === 'video'
        : showRecipeShortcut || personalRowGuidancePath === 'video';
    const goalOverallProgress = todo.workspace === 'Goals' && todo.guidancePath !== 'video'
      ? goalOverallProgressByTodoId.get(todo.id)
      : undefined;
    const goalOverallProgressRatio = goalOverallProgress
      ? goalOverallProgress.ratio
      : 0;
    const goalChildProgress = todo.workspace === 'Goals' && todo.guidancePath === 'video'
      ? undefined
      : goalChildPlanProgressByTodoId.get(todo.id);
    const goalChildProgressRatio = goalChildProgress
      ? goalChildProgress.completed / Math.max(goalChildProgress.total, 1)
      : 0;
    const recipeProgress = showsVideoGuideProgress
      ? recipeProgressByTodoId.get(todo.id)
      : undefined;
    const recipeProgressRatio = recipeProgress?.ratio || 0;
    const skillProgress = showsVideoGuideProgress
      ? rawSkillProgress
      : undefined;
    const skillProgressRatio = skillProgress?.ratio || 0;
    const taskProgress = personalRowGuidancePath === 'video' ? undefined : rawTaskProgress;
    const taskProgressRatio = taskProgress?.ratio || 0;
    const isTodoCompleting = completingTodoId === todo.id;
    const showSkillShortcut = !isGoalManagedTodo && todo.workspace === 'Personal' && personalRowGuidancePath === 'video' && !todo.completed;
    const showClassificationSpinner = !!classifyingTodoIds[todo.id];

    return wrapTodoWithRevealShell(todo.id, (
      <View
        key={`todo-${todo.id}`}
        collapsable={false}
        style={activeDrag ? styles.draggingTodoItem : undefined}
      >
        <Swipeable
          renderRightActions={(progress) => renderRightActions(progress)}
          enabled={!isTodoDragActive}
          rightThreshold={-120}
          friction={3}
          overshootFriction={20}
          useNativeAnimations
        >
          <Pressable
            onPress={() => handleTodoPress(todo)}
            onLongPress={dragHandlers?.onLongPress}
            delayLongPress={TODO_DRAG_LONG_PRESS_MS}
            style={({ pressed }) => [
              styles.todoPressableOverflow,
              pressed && !activeDrag && !dragHandlers && styles.pressedTodoItem,
            ]}
          >
            <Animated.View
              style={{
                opacity: animationsRef.current.fadeAnims[todo.id],
              }}
            >
              <TodoCardSurface
                gradientColors={workspaceAppearance?.todoCardGradientColors || theme.todoCardGradientColors}
                strokeColor={workspaceAppearance?.todoCardStrokeColor || theme.todoCardStrokeColor}
              >
                <View className={`${todo.completed && !isInCompletedSection ? 'opacity-60' : ''}`}>
                  <View className="flex-row items-center">
                    <TouchableOpacity
                      onPress={() => toggleTodo(todo.id)}
                      disabled={isTodoCompleting}
                      className="mr-2.5"
                      style={activeDrag ? styles.dragFadedCardDetails : undefined}
                    >
                      {todo.completed ? (
                        <Ionicons name="checkmark-circle" size={24} color="#4a4a4a" style={{ opacity: isTodoCompleting ? 0.72 : 1 }} />
                      ) : (
                        <Image
                          source={require('../../../assets/images/todo-personal-button.png')}
                          style={{ width: 30, height: 30, opacity: isTodoCompleting ? 0.72 : 1 }}
                        />
                      )}
                    </TouchableOpacity>
                    <View className="flex-1 justify-center">
                      {(isGoalSubtask || !!goalActionMetadata) && (
                        <View style={[styles.goalActionMetadataRow, activeDrag && styles.dragFadedCardDetails]}>
                          {isGoalSubtask && <Text style={styles.goalActionSubtaskLabel}>Step</Text>}
                          {!!goalActionMetadata && (
                            <Text
                              style={styles.goalActionMetadataText}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              Goal - {goalActionMetadata.goalTitle}
                            </Text>
                          )}
                        </View>
                      )}
                      <View className="flex-row items-center">
                        <Text
                          className={`text-[15px] text-justify ${todo.completed ? 'line-through text-gray-500' : ''}`}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={
                            !todo.completed
                              ? { color: '#3A6860', fontWeight: '700', flexShrink: 1 }
                              : { flexShrink: 1 }
                          }
                        >
                          {renderTodoHighlightedText(todo.text, todoSearchQuery)}
                        </Text>
                        {!!youtubeUrl && (
                          <TouchableOpacity
                            onPress={(event) => {
                              event.stopPropagation();
                              void Linking.openURL(youtubeUrl);
                            }}
                            style={[styles.goalActionYoutubeButton, activeDrag && styles.dragFadedCardDetails]}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            activeOpacity={0.72}
                          >
                            <MaterialCommunityIcons name="youtube" size={18} color={GOAL_GUIDANCE_ICON_COLOR} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <View
                      className="flex-row items-center"
                      style={[
                        dueDateLabel ? { marginLeft: 12 } : undefined,
                        activeDrag && styles.dragFadedCardDetails,
                      ]}
                    >
                      {!!todo.recurrenceActive && (
                        <Ionicons
                          name="repeat"
                          size={14}
                          color="rgba(255,255,255,0.62)"
                          style={{ marginRight: dueDateLabel ? 6 : 0 }}
                        />
                      )}
                      {!!dueDateLabel && (
                        <Text
                          className="text-xs mr-2"
                          style={{ color: 'rgba(255,255,255,0.62)' }}
                        >
                          {dueDateLabel}
                        </Text>
                      )}
                      {showClassificationSpinner && (
                        <View style={styles.recipeShortcutButton}>
                          <ActivityIndicator size="small" color={RECIPE_GUIDANCE_ICON_COLOR} />
                        </View>
                      )}
                      {!showClassificationSpinner && showRecipeShortcut && (
                        <TouchableOpacity
                          onPress={(event) => {
                            event.stopPropagation();
                            handleTodoPress(todo, { openRecipeGuide: true });
                          }}
                          style={styles.recipeShortcutButton}
                          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                          activeOpacity={0.72}
                        >
                          <MaterialCommunityIcons name="chef-hat" size={18} color={RECIPE_GUIDANCE_ICON_COLOR} />
                        </TouchableOpacity>
                      )}
                      {!showClassificationSpinner && showSkillShortcut && (
                        <TouchableOpacity
                          onPress={(event) => {
                            event.stopPropagation();
                            handleTodoPress(todo, { openSkillGuide: true });
                          }}
                          style={styles.recipeShortcutButton}
                          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                          activeOpacity={0.72}
                        >
                          <MaterialCommunityIcons name="youtube" size={18} color={RECIPE_GUIDANCE_ICON_COLOR} />
                        </TouchableOpacity>
                      )}
                      {todo.workspace === 'Wishlist' && isWishlistBuyLoading && (
                        <View className="ml-2.5 px-2.5 py-1" style={{ minWidth: 44, alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={getTheme(themeColor).workspaceNameColor} />
                        </View>
                      )}
                      {todo.workspace === 'Wishlist' && !isWishlistBuyLoading && (
                        <TouchableOpacity
                          onPress={() => handleBuyPress(todo)}
                          className="px-2.5 py-1 rounded ml-2.5 shadow"
                          style={{
                            backgroundColor: getTheme(themeColor).workspaceNameColor,
                            minWidth: 44,
                            alignItems: 'center',
                          }}
                        >
                          <Text className="text-white text-xs font-bold">Buy</Text>
                        </TouchableOpacity>
                      )}
                      {todo.starred && <MaterialCommunityIcons name="hexagram" size={18} color="#FFD700" style={{ marginLeft: 8 }} />}
                    </View>
                  </View>
                  {shouldShowDetailsSnippet && (
                    <Text
                      style={[todoSearchTextStyles.detailsSnippet, activeDrag && styles.dragFadedCardDetails]}
                      numberOfLines={2}
                    >
                      {renderTodoHighlightedText(getTodoDetailsMatchSnippet(details, todoSearchQuery), todoSearchQuery)}
                    </Text>
                  )}
                  {!!goalOverallProgress && (
                    <View style={[styles.goalActionChildProgressInline, activeDrag && styles.dragFadedCardDetails]}>
                      <View style={styles.goalActionChildProgressHeader}>
                        <Text style={styles.goalActionChildProgressText}>
                          Goal progress {Math.round(goalOverallProgressRatio * 100)}%
                        </Text>
                        <Text style={styles.goalActionChildProgressPill}>
                          {goalOverallProgress.status === 'complete'
                            ? 'Complete'
                            : `${goalOverallProgress.completed}/${goalOverallProgress.total} done`}
                        </Text>
                      </View>
                      <View style={styles.goalActionChildProgressTrack}>
                        <View
                          style={[
                            styles.goalActionChildProgressFill,
                            { width: `${Math.round(goalOverallProgressRatio * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                  )}
                  {!!goalChildProgress && (
                    <View style={[styles.goalActionChildProgressInline, activeDrag && styles.dragFadedCardDetails]}>
                      <View style={styles.goalActionChildProgressHeader}>
                        <Text style={styles.goalActionChildProgressText}>
                          {goalChildProgress.completed}/{goalChildProgress.total} steps
                        </Text>
                        <Text style={styles.goalActionChildProgressPill}>
                          {goalChildProgress.status === 'complete'
                            ? 'Complete'
                            : 'In progress'}
                        </Text>
                      </View>
                      <View style={styles.goalActionChildProgressTrack}>
                        <View
                          style={[
                            styles.goalActionChildProgressFill,
                            { width: `${Math.round(goalChildProgressRatio * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                  )}
                  {!!recipeProgress && (
                    <View style={[styles.goalActionChildProgressInline, activeDrag && styles.dragFadedCardDetails]}>
                      <View style={styles.goalActionChildProgressHeader}>
                        <Text style={styles.goalActionChildProgressText}>
                          Recipe progress {Math.round(recipeProgressRatio * 100)}%
                        </Text>
                        <Text style={styles.goalActionChildProgressPill}>
                          {recipeProgress.completed === recipeProgress.total
                            ? 'Complete'
                            : `${recipeProgress.completed}/${recipeProgress.total} done`}
                        </Text>
                      </View>
                      <View style={styles.goalActionChildProgressTrack}>
                        <View
                          style={[
                            styles.goalActionChildProgressFill,
                            { width: `${Math.round(recipeProgressRatio * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                  )}
                  {!!skillProgress && (
                    <View style={[styles.goalActionChildProgressInline, activeDrag && styles.dragFadedCardDetails]}>
                      <View style={styles.goalActionChildProgressHeader}>
                        <Text style={styles.goalActionChildProgressText}>
                          Video progress {Math.round(skillProgressRatio * 100)}%
                        </Text>
                        <Text style={styles.goalActionChildProgressPill}>
                          {skillProgress.completed === skillProgress.total
                            ? 'Complete'
                            : `${skillProgress.completed}/${skillProgress.total} done`}
                        </Text>
                      </View>
                      <View style={styles.goalActionChildProgressTrack}>
                        <View
                          style={[
                            styles.goalActionChildProgressFill,
                            { width: `${Math.round(skillProgressRatio * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                  )}
                  {!!taskProgress && (
                    <View style={[styles.goalActionChildProgressInline, activeDrag && styles.dragFadedCardDetails]}>
                      <View style={styles.goalActionChildProgressHeader}>
                        <Text style={styles.goalActionChildProgressText}>
                          Task progress {Math.round(taskProgressRatio * 100)}%
                        </Text>
                        <Text style={styles.goalActionChildProgressPill}>
                          {taskProgress.status === 'complete' || taskProgress.completed === taskProgress.total
                            ? 'Complete'
                            : `${taskProgress.completed}/${taskProgress.total} done`}
                        </Text>
                      </View>
                      <View style={styles.goalActionChildProgressTrack}>
                        <View
                          style={[
                            styles.goalActionChildProgressFill,
                            { width: `${Math.round(taskProgressRatio * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                  )}
                </View>
                {activeDrag && <DragStateHandle />}
              </TodoCardSurface>
            </Animated.View>
          </Pressable>
        </Swipeable>
      </View>
    ));
  }, [activeRevealTodoId, animationsRef, buyingTodoId, classifyingTodoIds, completingTodoId, formatDueDate, goalActionMetadataByTodoId, goalChildPlanProgressByTodoId, goalManagedTodoIds, goalOverallProgressByTodoId, goalSubtaskTodoIds, handleBuyPress, handleTodoDragLongPress, handleTodoPress, handleSliderChange, isTodoDragActive, recipeProgressByTodoId, skillProgressByTodoId, taskProgressByTodoId, todoSearchQuery, toggleTodo, workspaceTodoTypes, wrapTodoWithRevealShell]);


  // How many completed items each workspace shows. Drawing hundreds at once (the section opens
  // when an item is completed) froze the screen on accounts with a long history.
  const [completedVisibleCounts, setCompletedVisibleCounts] = useState<Record<string, number>>({});

  const renderTodoSection = useCallback((title: string, todos: (TodoItem & { workspace: string })[], sectionKey: TodoSectionKey, workspace: string, themeColor?: string) => {
    const workspaceAppearance = getTodoWorkspaceAppearance(workspace);
    const workspaceTodos = sortTodosForSection(
      todos.filter((todo) =>
        todo.workspace === workspace &&
        !(workspace === 'Personal' && goalSubtaskTodoIds.has(todo.id)) &&
        (!hasTodoSearchQuery || todoMatchesSearch(todo, todoSearchQuery))
      ),
      workspace,
      sectionKey
    );
    if (hasTodoSearchQuery && workspaceTodos.length === 0) {
      return null;
    }

    const isGoalWorkspace = workspace === 'Goals';
    const goalSectionKey: GoalSectionKey | undefined = isGoalWorkspace
      && (sectionKey === 'thisWeek' || sectionKey === 'thisMonth' || sectionKey === 'thisYear' || sectionKey === 'longTerm')
      ? sectionKey
      : undefined;
    const explicitExpanded = expandedSections[workspace]?.[sectionKey];
    const isExpanded = hasTodoSearchQuery
      ? true
      : explicitExpanded !== undefined
      ? explicitExpanded
      : (goalSectionKey && workspaceTodos.length > 0
        ? true
        : defaultExpanded[sectionKey]);
    const canCreateFromEmptyState = !hasTodoSearchQuery && (
      isGoalWorkspace
        ? sectionKey === 'thisWeek' || sectionKey === 'thisMonth' || sectionKey === 'thisYear' || sectionKey === 'longTerm'
        : sectionKey !== 'completed'
    );
    const isReorderableSection = !hasTodoSearchQuery && isTodoSectionReorderable(workspace, sectionKey);
    const emptyStateText = isGoalWorkspace
      ? (sectionKey === 'completed' ? 'No completed goals' : 'Add a new goal')
      : (sectionKey === 'completed'
          ? workspace === 'Wishlist'
            ? 'No completed items'
            : 'No completed tasks'
          : sectionKey === 'wishlist'
            ? 'Add a new wishlist item'
            : 'Add a new to-do item');

    return (
      <View
        key={`section-${workspace}-${sectionKey}`}
        style={styles.section}
      >
        <LinearGradient
          colors={workspaceAppearance?.sectionGradientColors || getTheme(workspaceAppearance?.themeColor || themeColor || workspaceColors[currentWorkspace]).sectionGradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.sectionInner}
        >
          <TouchableOpacity
            onPress={() => {
              if (!hasTodoSearchQuery) {
                // A pending reveal re-opens its section until it scrolls to the todo; the tap wins over it.
                clearPendingTodoReveal();
                toggleSection(sectionKey, workspace, isExpanded);
              }
            }}
            disabled={hasTodoSearchQuery}
            style={styles.sectionHeader}
          >
            <Text style={styles.sectionTitle}>{title}</Text>
            <View style={styles.sectionHeaderRight}>
              <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={24} color="rgba(0, 0, 0, 0.4)" />
            </View>
          </TouchableOpacity>
          {isExpanded && (
            <View style={styles.sectionContent}>
              {workspaceTodos.length > 0 ? (
                isReorderableSection ? (
                  <NestableDraggableFlatList
                    data={workspaceTodos}
                    extraData={activeRevealTodoId}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item, drag, isActive }: RenderItemParams<TodoItem & { workspace: string }>) =>
                      renderTodoItem(item, false, sectionKey, themeColor, { drag, isActive })
                    }
                    onDragBegin={handleTodoSectionDragBegin}
                    onRelease={handleTodoSectionDragRelease}
                    onDragEnd={({ data }) => {
                      void handleTodoSectionDragEnd({ data, workspace, sectionKey });
                    }}
                    activationDistance={TODO_DRAG_ACTIVATION_DISTANCE}
                    autoscrollThreshold={56}
                    autoscrollSpeed={120}
                    scrollEnabled={false}
                  />
                ) : (() => {
                  const isCappedSection = sectionKey === 'completed' && !hasTodoSearchQuery;
                  const visibleCount = completedVisibleCounts[workspace] ?? COMPLETED_PAGE_SIZE;
                  const visibleTodos = isCappedSection ? workspaceTodos.slice(0, visibleCount) : workspaceTodos;
                  const hiddenCount = workspaceTodos.length - visibleTodos.length;
                  return (
                    <>
                      {visibleTodos.map(todo =>
                        renderTodoItem(todo, sectionKey === 'completed', sectionKey, themeColor)
                      )}
                      {hiddenCount > 0 && (
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => setCompletedVisibleCounts((current) => ({
                            ...current,
                            [workspace]: visibleCount + COMPLETED_PAGE_SIZE,
                          }))}
                          activeOpacity={0.7}
                          style={styles.emptyStateAddButton}
                        >
                          <Text style={styles.emptyStateAddButtonText}>
                            {`Show ${Math.min(COMPLETED_PAGE_SIZE, hiddenCount)} more (${hiddenCount} hidden)`}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </>
                  );
                })()
              ) : (
                canCreateFromEmptyState ? (
                  <TouchableOpacity
                    onPress={() => addTodo(workspace, goalSectionKey, { forToday: !isGoalWorkspace && sectionKey === 'today' })}
                    activeOpacity={0.7}
                    style={styles.emptyStateAddButton}
                  >
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                    <Text style={styles.emptyStateAddButtonText}>
                      {emptyStateText}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.emptyStateText}>
                    {emptyStateText}
                  </Text>
                )
              )}
            </View>
          )}
        </LinearGradient>
      </View>
    );
  }, [activeRevealTodoId, addTodo, clearPendingTodoReveal, completedVisibleCounts, currentWorkspace, expandedSections, goalSubtaskTodoIds, handleTodoSectionDragBegin, handleTodoSectionDragEnd, handleTodoSectionDragRelease, hasTodoSearchQuery, isLeftHanded, renderTodoItem, sortTodosForSection, todoSearchQuery, toggleSection, workspaceColors]);

  function animateWorkspaceChange(newIndex: number) {
    currentWorkspaceRef.current = newIndex;
    setCurrentWorkspace(newIndex);
    Animated.parallel([
      Animated.timing(workspaceNameAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(dotPositionAnim, {
        toValue: newIndex,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start(() => {
      workspaceNameAnim.setValue(0);
    });
  }

  function goToWorkspaceIndex(index: number) {
    if (index < 0 || index >= workspaces.length) {
      return;
    }

    pagerViewRef.current?.setPage(index);
    animateWorkspaceChange(index);
  }

  function goToWorkspaceKey(workspaceKey: string) {
    const index = workspaces.findIndex((workspace) => workspace.key === workspaceKey);
    if (index === -1) {
      return;
    }

    goToWorkspaceIndex(index);
  }

  function handleDetailsWorkspaceSwipe(workspaceKey: string) {
    handleCloseDetailsModal();
    goToWorkspaceKey(workspaceKey);
  }

  function handleDotPress(index: number) {
    goToWorkspaceIndex(index);
  }

  function attemptPendingTodoFocus() {
    const pending = pendingTodoFocusRef.current;
    if (!pending) {
      return;
    }

    const todo = localTodosRef.current.find((item) => item.id === pending.todoId);
    if (!todo) {
      if (pending.attempts >= 24) {
        pendingTodoFocusRef.current = null;
        return;
      }
      pending.attempts += 1;
      pendingTodoFocusTimeoutRef.current = setTimeout(attemptPendingTodoFocus, 90);
      return;
    }

    const workspaceKey = todo.workspace || 'Personal';
    const workspaceIndex = workspaces.findIndex((workspace) => workspace.key === workspaceKey);
    if (workspaceIndex >= 0 && currentWorkspaceRef.current !== workspaceIndex) {
      showWorkspacePage(workspaceIndex);
    }

    const targetSection = getTodoSectionKey(todo, weekStartsOn);
    const explicitExpanded = expandedSectionsRef.current[workspaceKey]?.[targetSection];
    const isGoalTimeframe = workspaceKey === 'Goals'
      && (targetSection === 'thisWeek' || targetSection === 'thisMonth' || targetSection === 'thisYear' || targetSection === 'longTerm');
    const isSectionExpanded = explicitExpanded !== undefined
      ? explicitExpanded
      : (isGoalTimeframe ? true : defaultExpanded[targetSection]);
    if (!isSectionExpanded) {
      setExpandedSections((current) => ({
        ...current,
        [workspaceKey]: {
          ...(current[workspaceKey] || {}),
          [targetSection]: true,
        },
      }));
    }

    pendingTodoFocusRef.current = null;
    pendingTodoFocusTimeoutRef.current = null;
    handleTodoPress(todo);
    if (todo.workspace === 'Goals' && pendingGoalSuggestionOpenTodoIdsRef.current.delete(todo.id)) {
      void requestGoalWishlistSuggestionsForTodo(todo);
    }
  }

  function queueFocusedTodoOpen(todoId: string) {
    if (!todoId) {
      return;
    }

    if (pendingTodoFocusTimeoutRef.current) {
      clearTimeout(pendingTodoFocusTimeoutRef.current);
      pendingTodoFocusTimeoutRef.current = null;
    }

    pendingTodoFocusRef.current = { todoId, attempts: 0 };
    pendingTodoFocusTimeoutRef.current = setTimeout(attemptPendingTodoFocus, 0);
  }

  useEffect(() => {
    return () => {
      if (pendingTodoFocusTimeoutRef.current) {
        clearTimeout(pendingTodoFocusTimeoutRef.current);
      }
      if (pendingTodoRevealTimeoutRef.current) {
        clearTimeout(pendingTodoRevealTimeoutRef.current);
      }
      if (todoRevealGlowStartTimeoutRef.current) {
        clearTimeout(todoRevealGlowStartTimeoutRef.current);
      }
      todoRevealGlowAnimationRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!pendingTodoRevealRef.current) {
      return;
    }
    schedulePendingTodoRevealAttempt(0);
  }, [expandedSections, localTodos, currentWorkspace, schedulePendingTodoRevealAttempt]);

  useEffect(() => {
    if (!activeRevealTodoId) {
      return;
    }

    const stillExists = localTodos.some((todo) => todo.id === activeRevealTodoId);
    if (!stillExists) {
      clearActiveTodoReveal();
    }
  }, [activeRevealTodoId, clearActiveTodoReveal, localTodos]);

  const renderWorkspace = (workspace: string, index: number) => {
    const workspaceAppearance = getTodoWorkspaceAppearance(workspace);
    const themeColor = workspaceAppearance?.themeColor || workspaces[index]?.color;
    const theme = getTheme(themeColor);
    const currentYearTitle = String(new Date().getFullYear());
    const sections = [
      ...(workspace === 'Goals'
        ? [
            renderTodoSection("This Week", sortedTodos.thisWeek, "thisWeek", workspace, themeColor),
            renderTodoSection("This Month", sortedTodos.thisMonth, "thisMonth", workspace, themeColor),
            renderTodoSection(currentYearTitle, sortedTodos.thisYear, "thisYear", workspace, themeColor),
            renderTodoSection("Long Term", sortedTodos.longTerm, "longTerm", workspace, themeColor),
          ]
        : []),
      ...(workspace === 'Personal'
        ? [
            renderTodoSection("Today", sortedTodos.today, "today", workspace, themeColor),
            renderTodoSection("Upcoming", sortedTodos.upcoming, "upcoming", workspace, themeColor),
          ]
        : []),
      ...(workspace !== 'Goals' && workspace !== 'Wishlist' && workspace !== 'Personal'
        ? [
            renderTodoSection("Today", sortedTodos.today, "today", workspace, themeColor),
            renderTodoSection("Upcoming", sortedTodos.upcoming, "upcoming", workspace, themeColor),
            renderTodoSection("Past", sortedTodos.past, "past", workspace, themeColor),
          ]
        : []),
      ...(workspace === 'Wishlist'
        ? [renderTodoSection("Wishlist", sortedTodos.wishlist, "wishlist", workspace, themeColor)]
        : []),
      renderTodoSection("Completed", sortedTodos.completed, "completed", workspace, themeColor),
    ].filter(Boolean);
    const createButton = (
      <TouchableOpacity
        style={[
          styles.createButton,
          { alignSelf: isLeftHanded ? 'flex-start' : 'flex-end' },
        ]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          addTodo(workspace);
        }}
      >
        <Ionicons name="add" size={18} color={theme.workspaceNameColor} />
        <Text style={[styles.createButtonText, { color: theme.workspaceNameColor }]}>Create</Text>
      </TouchableOpacity>
    );
    const isCurrentWorkspaceCreateTarget = workspace === workspaces[currentWorkspace]?.key;

    return (
      <View key={`workspace-${workspace}`} style={styles.workspaceContainer}>
        <View
          style={[
            styles.workspaceShell,
            workspaceAppearance ? { backgroundColor: workspaceAppearance.workspaceShellColor } : null,
          ]}
        >
          <WorkspaceScrollArea
            scrollRef={getWorkspaceScrollRef(workspace)}
            style={styles.listContainer}
            contentContainerStyle={styles.workspaceShellContent}
            scrollBarColor={theme.workspaceNameColor}
          >
            {sections}
            {hasTodoSearchQuery && sections.length === 0 && (
              <Text style={todoSearchTextStyles.emptyText}>
                No todos match &quot;{todoSearchQuery.trim()}&quot;
              </Text>
            )}
          </WorkspaceScrollArea>
          {isCurrentWorkspaceCreateTarget ? (
            <GuidedTarget targetId={getTodoControlGuidanceTargetId('create')} label="Create todo" localHighlightRadius={18}>
              {createButton}
            </GuidedTarget>
          ) : createButton}
        </View>
      </View>
    )
  };

  const currentWorkspaceKey = workspaces[currentWorkspace]?.key;
  const currentWorkspaceAppearance = getTodoWorkspaceAppearance(currentWorkspaceKey);
  const currentTheme = getTheme(currentWorkspaceAppearance?.themeColor || workspaceColors[currentWorkspace]);
  const screenTitle = currentWorkspaceAppearance?.screenTitle || 'To Do';
  const todoSearchHeaderButton = (
    <GuidedTarget targetId={getTodoControlGuidanceTargetId('search')} label="Search todos" localHighlightRadius={999}>
      <TodoSearchHeaderButton
        isVisible={isTodoSearchVisible}
        accentColor={currentWorkspaceAppearance?.headerTitleColor || currentTheme.headerTitleColor}
        inactiveColor={currentWorkspaceAppearance?.headerMenuColor || currentTheme.headerMenuColor}
        onToggle={() => {
          if (isTodoSearchVisible) {
            setIsTodoSearchVisible(false);
            setTodoSearchQuery('');
            return;
          }
          setIsTodoSearchVisible(true);
          completeTodoGuidanceAction('search');
        }}
      />
    </GuidedTarget>
  );
  const detailsWorkspaceAppearance = getTodoWorkspaceAppearance(selectedTodoForDetails?.workspace);
  const detailsScreenAppearance = detailsWorkspaceAppearance || currentWorkspaceAppearance;
  const detailsTheme = getTheme(
    detailsWorkspaceAppearance?.themeColor ||
    currentWorkspaceAppearance?.themeColor ||
    workspaceColors[currentWorkspace]
  );
  const detailsModalTranslateY = detailsModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });
  const detailsModalScale = detailsModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const detailsModalMaxHeight = Math.min(Dimensions.get('window').height * 0.72, 590);
  const detailsModalTopPadding = Math.max(34, insets.top + 4);
  const detailsModalAiDockBottom =
    Platform.OS === 'android'
      ? ANDROID_TODO_KEYBOARD_GAP + keyboardInset
      : Math.max(aiInputBottom, keyboardInset);
  const detailsModalBottomPadding =
    isAiComposerActive && isDetailsModalVisible
      ? detailsModalAiDockBottom + 76
      : floatingTabBarInset + 150;
  const activeGuidanceActions = goalGuidancePlan
    ? getGoalGuidancePlanActiveActions(goalGuidancePlan)
    : [];

  const isGoalDetailsSheet = selectedTodoForDetails?.workspace === 'Goals';
  const shouldRevealDetailsWithButton =
    selectedTodoForDetails?.workspace === 'Personal' ||
    selectedTodoForDetails?.workspace === 'Goals';
  const shouldRenderDetailsInput =
    !shouldRevealDetailsWithButton ||
    isDetailsInputExpanded;
  const detailsInputAnimatedStyle = {
    opacity: detailsInputRevealAnim,
    transform: [
      {
        translateY: detailsInputRevealAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 0],
        }),
      },
      {
        scale: detailsInputRevealAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.98, 1],
        }),
      },
    ],
  };
  const shouldShowGoalGuidance = isGoalGuidanceEligible || !!goalGuidancePlan;
  const shouldShowRecipeGuide =
    !!selectedTodoForDetails &&
    !!recipeGuidanceContext;
  const shouldShowSkillGuide =
    !!selectedTodoForDetails &&
    !!skillGuidanceContext;
  const shouldShowTaskGuide =
    !!selectedTodoForDetails &&
    selectedTodoForDetails.workspace === 'Personal' &&
    !isSelectedGoalManagedTodo &&
    !isSelectedRecipeKind &&
    usesTaskGuidancePath &&
    (!!taskGuidanceContext || !!taskGuide);
  const isCurrentGuidanceSaving =
    isGoalGuidanceRunning ||
    isRecipeAiRunning ||
    isRecipeWorking ||
    isSkillAiRunning ||
    isSkillWorking ||
    isTaskGuidanceRunning;
  const isGuidancePathChangeDisabled =
    isGuidancePathSwitching ||
    (shouldShowGuidancePathSwitch && isCurrentGuidanceSaving);

  useEffect(() => {
    if (
      !isFocused ||
      !isDetailsModalVisible ||
      !isTodoGuidanceTutorialPending ||
      !tutorialTodoId ||
      selectedTodoForDetails?.id !== tutorialTodoId ||
      !shouldShowGuidancePathChoice ||
      todoGuidanceTutorialStageRef.current
    ) {
      return;
    }

    showTodoGuidanceTutorialStage('actions');
  }, [
    isDetailsModalVisible,
    isFocused,
    isTodoGuidanceTutorialPending,
    selectedTodoForDetails?.id,
    shouldShowGuidancePathChoice,
    showTodoGuidanceTutorialStage,
    tutorialTodoId,
  ]);

  // The guidance-option stages point at buttons inside the demo task. If the user
  // closes it or opens another item, those buttons are gone, so point back at the
  // demo task; opening it again restarts these stages above.
  useEffect(() => {
    const stage = todoGuidanceTutorialStageRef.current;
    if (
      !isFocused ||
      !isTodoGuidanceTutorialPending ||
      !tutorialTodoId ||
      (stage !== 'actions' && stage !== 'video' && stage !== 'choice') ||
      (isDetailsModalVisible && selectedTodoForDetails?.id === tutorialTodoId)
    ) {
      return;
    }

    todoGuidanceTutorialStageRef.current = null;
    startGuidance(
      { type: 'todo', todoId: tutorialTodoId, workspaceKey: 'Personal' },
      'the demo task. Tap it to open details',
      {
        keepLocatedTargetCard: true,
        useTutorialCardPlacement: true,
        onSkipSegment: () => { void finishTodoGuidanceTutorialRef.current(false); },
        // "skip": past the To Do part, on to Goals.
        onNext: () => {
          cancelGuidance();
          void finishTodoGuidanceTutorialRef.current(false);
        },
        nextLabel: 'skip',
      }
    );
  }, [
    cancelGuidance,
    isDetailsModalVisible,
    isFocused,
    isTodoGuidanceTutorialPending,
    selectedTodoForDetails?.id,
    startGuidance,
    tutorialTodoId,
  ]);

  useEffect(() => {
    if (
      !isFocused ||
      isDetailsModalVisible ||
      !isGoalGuidanceTutorialPending ||
      !tutorialGoalTodoId ||
      currentWorkspaceKey !== 'Goals' ||
      goalGuidanceTutorialStageRef.current !== 'workspace'
    ) {
      return;
    }

    showGoalGuidanceTutorialStage('timeframes');
  }, [
    currentWorkspaceKey,
    isDetailsModalVisible,
    isFocused,
    isGoalGuidanceTutorialPending,
    showGoalGuidanceTutorialStage,
    tutorialGoalTodoId,
  ]);

  useEffect(() => {
    if (
      !isFocused ||
      !isDetailsModalVisible ||
      !isGoalGuidanceTutorialPending ||
      !tutorialGoalTodoId ||
      selectedTodoForDetails?.id !== tutorialGoalTodoId ||
      !shouldShowGuidancePathChoice ||
      goalGuidanceTutorialStageRef.current
    ) {
      return;
    }

    showGoalGuidanceTutorialStage('actions');
  }, [
    isDetailsModalVisible,
    isFocused,
    isGoalGuidanceTutorialPending,
    selectedTodoForDetails?.id,
    shouldShowGuidancePathChoice,
    showGoalGuidanceTutorialStage,
    tutorialGoalTodoId,
  ]);

  useEffect(() => {
    const shouldShowTutorialGoalQuestion =
      isFocused &&
      isDetailsModalVisible &&
      isGoalGuidanceTutorialPending &&
      !!tutorialGoalTodoId &&
      selectedTodoForDetails?.id === tutorialGoalTodoId &&
      selectedTodoForDetails?.guidancePath === 'actions' &&
      !shouldShowGuidancePathChoice &&
      isGoalGuidanceAwaitingReply &&
      !isGoalGuidanceRunning;

    if (
      !shouldShowTutorialGoalQuestion ||
      hasShownGoalTutorialQuestionIntroRef.current ||
      goalGuidanceTutorialStageRef.current === 'question' ||
      goalGuidanceTutorialStageRef.current === 'ai-bar'
    ) {
      return;
    }

    hasShownGoalTutorialQuestionIntroRef.current = true;
    showGoalGuidanceTutorialStage('question');
  }, [
    goalGuidanceNotice,
    isDetailsModalVisible,
    isFocused,
    isGoalGuidanceAwaitingReply,
    isGoalGuidanceRunning,
    isGoalGuidanceTutorialPending,
    selectedTodoForDetails?.id,
    selectedTodoForDetails?.guidancePath,
    showGoalGuidanceTutorialStage,
    shouldShowGuidancePathChoice,
    tutorialGoalTodoId,
  ]);

  useEffect(() => {
    const isTutorialGoalPreview =
      isFocused &&
      isDetailsModalVisible &&
      isGoalGuidanceTutorialPending &&
      !!tutorialGoalTodoId &&
      selectedTodoForDetails?.id === tutorialGoalTodoId &&
      goalGuidancePlan?.goalId === tutorialGoalTodoId &&
      goalGuidancePlan.status === 'preview' &&
      goalGuidancePlan.steps.length > 0 &&
      goalGuidancePlan.feasibilityStatus !== 'unrealistic';

    if (!isTutorialGoalPreview || goalGuidanceTutorialStageRef.current) {
      return;
    }

    const scrollToAcceptPlan = () => {
      detailsScrollRef.current?.scrollTo({
        y: Math.max(0, goalGuidanceSectionYRef.current + goalAcceptPlanButtonYRef.current - 280),
        animated: true,
      });
    };

    scrollToAcceptPlan();
    setTimeout(scrollToAcceptPlan, 260);
    setTimeout(scrollToAcceptPlan, 700);
    setTimeout(() => {
      showGoalGuidanceTutorialStage('accept-plan');
    }, 520);
  }, [
    goalGuidancePlan,
    isDetailsModalVisible,
    isFocused,
    isGoalGuidanceTutorialPending,
    selectedTodoForDetails?.id,
    showGoalGuidanceTutorialStage,
    tutorialGoalTodoId,
  ]);

  useEffect(() => {
    const isTutorialTaskPreview =
      isFocused &&
      isDetailsModalVisible &&
      isTodoGuidanceTutorialPending &&
      !!tutorialTodoId &&
      selectedTodoForDetails?.id === tutorialTodoId &&
      taskGuide?.todoId === tutorialTodoId &&
      taskGuide.status === 'preview' &&
      taskGuide.steps.length > 0;

    if (!isTutorialTaskPreview || todoGuidanceTutorialStageRef.current) {
      return;
    }

    const scrollToAcceptPlan = () => {
      detailsScrollRef.current?.scrollTo({
        y: Math.max(0, taskGuidanceSectionYRef.current + taskAcceptPlanButtonYRef.current - 280),
        animated: true,
      });
    };

    // The new plan lays out over a few frames; keep scrolling until Accept plan sits above the card.
    scrollToAcceptPlan();
    setTimeout(scrollToAcceptPlan, 260);
    setTimeout(scrollToAcceptPlan, 700);
    setTimeout(scrollToAcceptPlan, 1200);
    showTodoGuidanceTutorialStage('accept-plan');
  }, [
    isDetailsModalVisible,
    isFocused,
    isTodoGuidanceTutorialPending,
    selectedTodoForDetails?.id,
    showTodoGuidanceTutorialStage,
    taskGuide,
    tutorialTodoId,
  ]);

  const handleSelectGuidancePath = useCallback(async (path: GuidancePath) => {
    if (!selectedTodoForDetails || isGuidancePathChangeDisabled) {
      return;
    }

    if (selectedTodoForDetails.guidancePath === path) {
      return;
    }

    setIsGuidancePathSwitching(true);

    try {
      const completesTodoTutorial =
        isTodoGuidanceTutorialPendingRef.current &&
        tutorialTodoIdRef.current === selectedTodoForDetails.id;
      const isTutorialGoalChoice =
        isGoalGuidanceTutorialPendingRef.current &&
        tutorialGoalTodoIdRef.current === selectedTodoForDetails.id;

      if (path === 'video' && selectedTodoForDetails.workspace === 'Goals') {
        await deleteGoalGuidanceForGoal(selectedTodoForDetails.id);
        setGoalGuidancePlan(null);
        setGoalGuidanceParentPlan(null);
        setGoalGuidanceAlternative(null);
        setPendingGoalGuidanceTitle(null);
        setIsGoalGuidanceAiActive(false);
        clearGoalGuidanceNotice();
        await refreshLocalTodos();
      }

      if (path === 'actions' && selectedTodoForDetails.workspace === 'Goals') {
        if (isSelectedRecipeKind) {
          await deleteRecipeGuidesForTodos([selectedTodoForDetails.id]);
          recipeGuideRef.current = null;
          checkedRecipeIngredientKeysRef.current = {};
          setRecipeGuide(null);
          setRecipeAnswersDraft(createDefaultRecipeAnswers());
          setCheckedRecipeIngredientKeys({});
          setRecipeProgressOverridesByTodoId((current) => {
            const next = { ...current };
            delete next[selectedTodoForDetails.id];
            return next;
          });
          setRecipeWishlistSelection({});
          setIsRecipeWishlistModalVisible(false);
          setIsAddingRecipeWishlistItems(false);
          setIsRecipeGuidanceAiActive(false);
          setIsRecipeChatHistoryExpanded(false);
          setIsRecipeWorking(false);
          clearRecipeNotice();
        } else if (selectedTaskKind === 'skill') {
          await deleteSkillGuidesForTodos([selectedTodoForDetails.id]);
          setSkillGuide(null);
          setSkillProgressOverridesByTodoId((current) => {
            const next = { ...current };
            delete next[selectedTodoForDetails.id];
            return next;
          });
          setIsSkillGuidanceAiActive(false);
          setIsSkillChatHistoryExpanded(false);
          setIsSkillWorking(false);
          clearSkillNotice();
        }
      }

      await updateTodo(selectedTodoForDetails.id, { guidancePath: path });
      updateTodoStateEverywhere(selectedTodoForDetails.id, { guidancePath: path });
      if (path === 'actions') {
        setIsSkillGuidanceAiActive(false);
        if (selectedTodoForDetails.workspace === 'Goals') {
          setIsGoalGuidanceAiActive(true);
          if (isTutorialGoalChoice) {
            cancelGuidance();
            goalGuidanceTutorialStageRef.current = null;
            if (selectedGoalGuidanceTimeframe && goalGuidanceDeadline && !isSelectedGoalBehaviorPending && !goalGuidancePlan) {
              await requestGoalGuidanceSteps({
                goalId: selectedTodoForDetails.id,
                goalTitle: editedTodoTitle || selectedTodoForDetails.text,
                goalDetails: editedTodoDetails || selectedTodoForDetails.details || '',
                timeframe: selectedGoalGuidanceTimeframe,
                deadline: goalGuidanceDeadline,
                quota: selectedQuotaBehavior
                  ? {
                      targetCount: selectedQuotaBehavior.targetCount,
                      completedCount: selectedQuotaBehavior.completedCount,
                      unitLabel: selectedQuotaBehavior.unitLabel,
                      unitType: selectedQuotaBehavior.unitType,
                    }
                  : undefined,
              });
            }
            return;
          }
          if (selectedGoalGuidanceTimeframe && goalGuidanceDeadline && !isSelectedGoalBehaviorPending && !goalGuidancePlan) {
            await requestGoalGuidanceSteps({
              goalId: selectedTodoForDetails.id,
              goalTitle: editedTodoTitle || selectedTodoForDetails.text,
              goalDetails: editedTodoDetails || selectedTodoForDetails.details || '',
              timeframe: selectedGoalGuidanceTimeframe,
              deadline: goalGuidanceDeadline,
              quota: selectedQuotaBehavior
                ? {
                    targetCount: selectedQuotaBehavior.targetCount,
                    completedCount: selectedQuotaBehavior.completedCount,
                    unitLabel: selectedQuotaBehavior.unitLabel,
                    unitType: selectedQuotaBehavior.unitType,
                  }
                : undefined,
            });
          }
        } else {
          setIsTaskGuidanceAiActive(true);
        }
        if (completesTodoTutorial) {
          cancelGuidance();
          todoGuidanceTutorialStageRef.current = null;
        }
        if (isTutorialGoalChoice) {
          cancelGuidance();
          goalGuidanceTutorialStageRef.current = null;
        }
        return;
      }

      if (selectedTodoForDetails.taskKind === 'recipe') {
        setIsRecipeGuidanceAiActive(true);
      } else {
        setIsTaskGuidanceAiActive(false);
        setIsSkillGuidanceAiActive(true);
      }
      if (completesTodoTutorial) {
        showTodoGuidanceTutorialStage('pick-video');
        setTimeout(() => {
          if (selectedTodoForDetails.taskKind === 'recipe') {
            scrollRecipeGuidanceIntoView();
          } else {
            scrollSkillGuidanceIntoView();
          }
        }, 260);
      }
    } catch (error) {
      Alert.alert('Could not save choice', String((error as any)?.message || error));
    } finally {
      setIsGuidancePathSwitching(false);
    }
  }, [
    cancelGuidance,
    clearGoalGuidanceNotice,
    clearRecipeNotice,
    clearSkillNotice,
    editedTodoDetails,
    editedTodoTitle,
    goalGuidanceDeadline,
    goalGuidanceInputValue,
    goalGuidancePlan,
    isGuidancePathChangeDisabled,
    isSelectedRecipeKind,
    isSelectedGoalBehaviorPending,
    refreshLocalTodos,
    requestGoalGuidanceSteps,
    scrollRecipeGuidanceIntoView,
    scrollSkillGuidanceIntoView,
    selectedGoalGuidanceTimeframe,
    selectedQuotaBehavior,
    selectedTaskKind,
    selectedTodoForDetails,
    setGoalGuidanceInputValue,
    showGoalGuidanceTutorialStage,
    showTodoGuidanceTutorialStage,
    updateTodoStateEverywhere,
  ]);

  const isTutorialGuidanceChoiceStep =
    activeTarget?.type === 'screen'
    && ['tutorial-actions', 'tutorial-video', 'tutorial-choice'].includes(String(activeTarget.params?.todoAction || ''));
  const renderGuidancePathChoice = () => {
    if (!shouldShowGuidancePathChoice || !selectedTodoForDetails) {
      return null;
    }

    const isPersonalPathChoice = selectedTodoForDetails.workspace === 'Personal';
    const label = isPersonalPathChoice
      ? 'todo'
      : selectedTodoForDetails.taskKind === 'recipe' ? 'recipe' : 'skill';
    const actionsLabel = isPersonalPathChoice ? 'AI Guidance' : 'Actions plan';
    const videoLabel = isPersonalPathChoice ? 'Video Guidance' : 'Video lessons';
    const isTutorialGoalChoice =
      isGoalGuidanceTutorialPending &&
      tutorialGoalTodoId === selectedTodoForDetails.id;
    const actionsTargetId = getTodoControlGuidanceTargetId(
      isTutorialGoalChoice ? 'tutorial-goal-actions' : 'tutorial-actions'
    );
    const videoTargetId = getTodoControlGuidanceTargetId('tutorial-video');
    const choiceTargetId = getTodoControlGuidanceTargetId('tutorial-choice');
    const activeTodoTutorialAction =
      activeTarget?.type === 'screen' ? String(activeTarget.params?.todoAction || '') : '';
    const isPersonalTutorialExplaining =
      isTodoGuidanceTutorialPending &&
      tutorialTodoId === selectedTodoForDetails.id &&
      (activeTodoTutorialAction === 'tutorial-actions' || activeTodoTutorialAction === 'tutorial-video');
    const advancePersonalTutorialExplanation = () => {
      if (!isPersonalTutorialExplaining) {
        return false;
      }

      showTodoGuidanceTutorialStage(
        activeTodoTutorialAction === 'tutorial-actions' ? 'video' : 'choice'
      );
      return true;
    };
    const isActionsPathDisabled = isGuidancePathChangeDisabled;
    const isVideoPathDisabled = isGuidancePathChangeDisabled || isTutorialGoalChoice;
    return (
      <LinearGradient
        colors={GOAL_GUIDANCE_CARD_GRADIENT}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.detailsModalGradientCard}
        onLayout={(event) => {
          guidancePathChoiceYRef.current = event.nativeEvent.layout.y;
        }}
      >
        <View style={styles.goalGuidanceSectionHeader}>
          <View style={styles.detailsModalMetaLead}>
            <Text style={[styles.detailsModalMetaLabel, styles.goalGuidanceCardTitle]}>Guidance path</Text>
          </View>
        </View>
        <GuidanceMarkdown>{`Choose how to plan this ${label}.`}</GuidanceMarkdown>
        <GuidedTarget
          targetId={getTodoControlGuidanceTargetId('tutorial-choice')}
          label="Guidance options"
          localHighlightVisible={false}
        >
        <View style={styles.guidancePathChoiceRow}>
          <GuidedTarget
            targetId={actionsTargetId}
            label={actionsLabel}
            highlightWhenTargetIds={isTutorialGoalChoice ? [] : [choiceTargetId]}
            localHighlightShape="rect"
            localHighlightRadius={999}
            localHighlightInset={2}
            localHighlightPulseScale={1.03}
            style={{ flex: 1 }}
          >
            <TouchableOpacity
              style={[
                styles.guidancePathChoiceButton,
                (isActionsPathDisabled || isPersonalTutorialExplaining) && styles.actionButtonDisabled,
              ]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                if (advancePersonalTutorialExplanation()) {
                  return;
                }
                void handleSelectGuidancePath('actions');
              }}
              disabled={isActionsPathDisabled}
              activeOpacity={0.82}
            >
              <LinearGradient
                colors={['#0A9881', '#04473C']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.guidancePathChoiceButtonGradient}
              >
                <MaterialCommunityIcons name="format-list-checks" size={18} color="#E8FFFA" />
                <Text style={styles.goalGuidanceGetStepsButtonText}>{actionsLabel}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </GuidedTarget>
          <GuidedTarget
            targetId={videoTargetId}
            label={videoLabel}
            highlightWhenTargetIds={isTutorialGoalChoice ? [] : [choiceTargetId]}
            localHighlightShape="rect"
            localHighlightRadius={999}
            localHighlightInset={2}
            localHighlightPulseScale={1.03}
            style={{ flex: 1 }}
          >
            <TouchableOpacity
              style={[
                styles.guidancePathChoiceButton,
                (isVideoPathDisabled || isPersonalTutorialExplaining) && styles.actionButtonDisabled,
              ]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                if (advancePersonalTutorialExplanation()) {
                  return;
                }
                void handleSelectGuidancePath('video');
              }}
              disabled={isVideoPathDisabled}
              activeOpacity={0.82}
            >
              <LinearGradient
                colors={['#0A9881', '#04473C']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.guidancePathChoiceButtonGradient}
              >
                <MaterialCommunityIcons name="youtube" size={18} color="#E8FFFA" />
                <Text style={styles.goalGuidanceGetStepsButtonText}>{videoLabel}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </GuidedTarget>
        </View>
        </GuidedTarget>
      </LinearGradient>
    );
  };

  const renderGuidancePathSwitch = () => {
    if (!shouldShowGuidancePathSwitch || !selectedTodoForDetails) {
      return null;
    }

    const isPersonalPathChoice = selectedTodoForDetails.workspace === 'Personal';
    const nextPathLabel = nextGuidancePath === 'video'
      ? isPersonalPathChoice ? 'Video Guidance' : 'Video lessons'
      : isPersonalPathChoice ? 'AI Guidance' : 'Actions plan';

    return (
      <LinearGradient
        colors={TODO_GUIDANCE_SWITCH_CARD_GRADIENT}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.detailsModalGradientCard, styles.guidancePathSwitchCard]}
      >
        <TouchableOpacity
          style={[
            styles.guidancePathSwitchRow,
            isGuidancePathChangeDisabled && styles.actionButtonDisabled,
          ]}
          onPress={() => void handleSelectGuidancePath(nextGuidancePath)}
          disabled={isGuidancePathChangeDisabled}
          activeOpacity={0.82}
        >
          <View style={styles.detailsModalMetaLead}>
            <MaterialCommunityIcons
              name={nextGuidancePath === 'video' ? 'youtube' : 'format-list-checks'}
              size={18}
              color="#165C53"
            />
            <Text style={styles.guidancePathSwitchLabel}>
              Change to {nextPathLabel}
            </Text>
          </View>
          <Text style={styles.guidancePathSwitchStatus}>
            {isGuidancePathSwitching ? 'Changing...' : ''}
          </Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  };

  const handleRecipeAnswerChange = useCallback((field: keyof RecipeAnswers, value: string) => {
    setRecipeAnswersDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const handleFindRecipeVideos = useCallback(async () => {
    if (!selectedTodoForDetails || !recipeGuidanceContext || isRecipeWorking) {
      return;
    }

    setIsRecipeWorking(true);
    setIsRecipeGuidanceAiActive(true);
    clearRecipeNotice();

    try {
      const savedQuestions = await saveRecipeGuide({
        todoId: selectedTodoForDetails.id,
        answers: recipeAnswersDraft,
        status: 'questions',
        errorMessage: '',
      });
      recipeGuideRef.current = savedQuestions;
      checkedRecipeIngredientKeysRef.current = getRecipeIngredientCheckedMap(savedQuestions);
      setRecipeGuide(savedQuestions);
      recipeSeenVideoIdsRef.current = extendSeenVideoIds(
        recipeSeenVideoIdsRef.current,
        recipeGuide?.videos || [],
        recipeGuide?.selectedVideo?.videoId ? [recipeGuide.selectedVideo.videoId] : []
      );
      const result = await requestRecipeVideos({
        context: recipeGuidanceContext,
        answers: recipeAnswersDraft,
        excludeVideoIds: Array.from(recipeSeenVideoIdsRef.current),
        previousQuery: recipeVideoSearchQueryRef.current,
        previousVideos: recipeGuide?.videos || [],
      });
      recipeVideoSearchQueryRef.current = result.query;
      recipeSeenVideoIdsRef.current = extendSeenVideoIds(recipeSeenVideoIdsRef.current, result.videos);
      pendingRecipeIngredientSaveRef.current = null;
      const savedGuide = await saveRecipeGuide({
        todoId: selectedTodoForDetails.id,
        answers: recipeAnswersDraft,
        videos: result.videos,
        selectedVideo: null,
        ingredients: [],
        equipment: [],
        steps: [],
        status: result.videos.length ? 'videos' : 'error',
        errorMessage: result.videos.length ? '' : 'No regular recipe videos were found. Try a more specific recipe name.',
      });
      handleRecipeGuideSaved(savedGuide, { preserveOptimisticIngredients: false });
    } catch (error) {
      console.error('Error finding recipe videos:', error);
      const savedGuide = await saveRecipeGuide({
        todoId: selectedTodoForDetails.id,
        answers: recipeAnswersDraft,
        status: 'error',
        errorMessage: String((error as any)?.message || error || 'Could not find videos.'),
      });
      handleRecipeGuideSaved(savedGuide);
    } finally {
      setIsRecipeWorking(false);
    }
  }, [
    clearRecipeNotice,
    handleRecipeGuideSaved,
    isRecipeWorking,
    recipeGuide,
    recipeAnswersDraft,
    recipeGuidanceContext,
    selectedTodoForDetails,
  ]);

  const handleApplyPendingRecipeChange = useCallback(async () => {
    const targetTitle = pendingRecipeChange?.title.trim();
    if (!selectedTodoForDetails || !recipeGuidanceContext || !targetTitle || isRecipeWorking) {
      return;
    }

    const nextAnswers = {
      ...recipeAnswersDraft,
      targetTitle,
    };
    recipeSeenVideoIdsRef.current = extendSeenVideoIds(
      recipeSeenVideoIdsRef.current,
      recipeGuide?.videos || [],
      recipeGuide?.selectedVideo?.videoId ? [recipeGuide.selectedVideo.videoId] : []
    );

    setRecipeAnswersDraft(nextAnswers);
    setIsRecipeWorking(true);
    setIsRecipeGuidanceAiActive(true);
    clearRecipeNotice();

    try {
      const result = await requestRecipeVideos({
        context: recipeGuidanceContext,
        answers: nextAnswers,
        excludeVideoIds: Array.from(recipeSeenVideoIdsRef.current),
        previousQuery: recipeVideoSearchQueryRef.current,
        previousVideos: recipeGuide?.videos || [],
      });
      if (!result.videos.length) {
        throw new Error('No regular recipe videos were found. Try a more specific recipe name.');
      }
      recipeVideoSearchQueryRef.current = result.query;
      recipeSeenVideoIdsRef.current = extendSeenVideoIds(recipeSeenVideoIdsRef.current, result.videos);

      clearPendingRecipeChange();
      checkedRecipeIngredientKeysRef.current = {};
      setCheckedRecipeIngredientKeys({});
      returnToRecipeSteps();
      pendingRecipeIngredientSaveRef.current = null;
      const savedGuide = await saveRecipeGuide({
        todoId: selectedTodoForDetails.id,
        answers: nextAnswers,
        videos: result.videos,
        selectedVideo: null,
        ingredients: [],
        equipment: [],
        steps: [],
        conversation: [],
        activeStepIndex: 0,
        status: 'videos',
        errorMessage: '',
        transcriptLanguage: '',
      });
      handleRecipeGuideSaved(savedGuide, { preserveOptimisticIngredients: false });
    } catch (error) {
      console.error('Error changing recipe videos:', error);
      setRecipeAnswersDraft(recipeGuide?.answers || createDefaultRecipeAnswers());
      Alert.alert(
        'Could not change this recipe',
        String((error as any)?.message || error || 'Try again with a more specific recipe name.')
      );
    } finally {
      setIsRecipeWorking(false);
    }
  }, [
    clearPendingRecipeChange,
    clearRecipeNotice,
    handleRecipeGuideSaved,
    isRecipeWorking,
    pendingRecipeChange?.title,
    recipeAnswersDraft,
    recipeGuide,
    recipeGuidanceContext,
    returnToRecipeSteps,
    selectedTodoForDetails,
  ]);

  const handleSelectRecipeVideo = useCallback(async (video: RecipeVideo) => {
    if (!selectedTodoForDetails || !recipeGuidanceContext || !recipeGuide || isRecipeWorking) {
      return;
    }

    setIsRecipeWorking(true);
    setIsRecipeGuidanceAiActive(true);
    clearRecipeNotice();

    try {
      const generatingGuide = await saveRecipeGuide({
        todoId: selectedTodoForDetails.id,
        selectedVideo: video,
        status: 'generating',
        errorMessage: '',
      });
      recipeGuideRef.current = generatingGuide;
      checkedRecipeIngredientKeysRef.current = getRecipeIngredientCheckedMap(generatingGuide);
      setRecipeGuide(generatingGuide);
      const generated = await requestRecipeGuide({
        context: recipeGuidanceContext,
        answers: recipeGuide.answers,
        selectedVideo: video,
      });
      pendingRecipeIngredientSaveRef.current = null;
      const savedGuide = await saveRecipeGuide({
        todoId: selectedTodoForDetails.id,
        selectedVideo: video,
        ingredients: generated.ingredients,
        equipment: generated.equipment,
        steps: generated.steps,
        transcriptLanguage: generated.transcriptLanguage,
        activeStepIndex: 0,
        status: generated.steps.length ? 'ready' : 'error',
        errorMessage: generated.steps.length
          ? ''
          : 'The transcript did not produce clear cooking steps. Try another regular video.',
      });
      handleRecipeGuideSaved(savedGuide, { preserveOptimisticIngredients: false });
      if (
        generated.steps.length &&
        isTodoGuidanceTutorialPendingRef.current &&
        tutorialTodoIdRef.current === selectedTodoForDetails.id
      ) {
        showTodoGuidanceTutorialStage('video-ready');
      }

      const targetTitle = recipeGuide.answers.targetTitle?.trim();
      if (generated.steps.length && targetTitle && selectedTodoForDetails.text.trim() !== targetTitle) {
        try {
          const result = await updateTodo(selectedTodoForDetails.id, { text: targetTitle });
          updateTodoStateEverywhere(selectedTodoForDetails.id, { text: result.todo.text });
          setEditedTodoTitle(result.todo.text);
        } catch (error) {
          console.error('Error updating recipe title:', error);
        }
      }
    } catch (error) {
      console.error('Error generating recipe guide:', error);
      const savedGuide = await saveRecipeGuide({
        todoId: selectedTodoForDetails.id,
        selectedVideo: video,
        status: 'error',
        errorMessage: String((error as any)?.message || error || 'Could not generate this recipe guide.'),
      });
      handleRecipeGuideSaved(savedGuide);
    } finally {
      setIsRecipeWorking(false);
    }
  }, [
    clearRecipeNotice,
    handleRecipeGuideSaved,
    isRecipeWorking,
    recipeGuide,
    recipeGuidanceContext,
    selectedTodoForDetails,
    showTodoGuidanceTutorialStage,
    updateTodoStateEverywhere,
  ]);

  const toggleRecipeStepCompleted = useCallback(async (index: number) => {
    if (!recipeGuide || index < 0 || index >= recipeGuide.steps.length) {
      return;
    }

    const currentStep = recipeGuide.steps[index];
    if (!currentStep.completed) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    const nextSteps = recipeGuide.steps.map((step, stepIndex) =>
      stepIndex === index
        ? { ...step, completed: !currentStep.completed }
        : step
    );
    const nextActiveStepIndex = nextSteps.findIndex((step) => !step.completed);
    const nextGuide = {
      ...recipeGuide,
      steps: nextSteps,
      activeStepIndex: nextActiveStepIndex >= 0
        ? nextActiveStepIndex
        : Math.max(0, recipeGuide.steps.length - 1),
    };
    const nextProgress = getRecipeProgressFromSteps(nextSteps);

    recipeGuideRef.current = nextGuide;
    setRecipeGuide(nextGuide);
    if (nextProgress) {
      setRecipeProgressOverridesByTodoId((current) => ({
        ...current,
        [recipeGuide.todoId]: nextProgress,
      }));
    }

    try {
      const savedGuide = await saveRecipeGuide({
        todoId: recipeGuide.todoId,
        steps: nextSteps,
        activeStepIndex: nextGuide.activeStepIndex,
      });
      handleRecipeGuideSaved(savedGuide);

      if (nextProgress && nextProgress.completed === nextProgress.total) {
        const currentTodo = localTodosRef.current.find((todo) => todo.id === recipeGuide.todoId);
        if (!currentTodo?.completed) {
          const result = await updateTodo(recipeGuide.todoId, { completed: true }, { syncReminder: true });
          handleReminderResult(result.reminderStatus);
          updateTodoStateEverywhere(recipeGuide.todoId, {
            completed: true,
            ...getTodoOrderingStatePatch(result.todo),
          });
          setExpandedSections((current) => ({
            ...current,
            [currentTodo?.workspace || 'Personal']: {
              ...(current[currentTodo?.workspace || 'Personal'] || {}),
              completed: true,
            },
          }));
        }
      }
    } catch (error) {
      console.error('Error saving recipe step progress:', error);
      recipeGuideRef.current = recipeGuide;
      setRecipeGuide(recipeGuide);
      const previousProgress = getRecipeProgressFromSteps(recipeGuide.steps);
      if (previousProgress) {
        setRecipeProgressOverridesByTodoId((current) => ({
          ...current,
          [recipeGuide.todoId]: previousProgress,
        }));
      }
    }
  }, [getTodoOrderingStatePatch, handleRecipeGuideSaved, handleReminderResult, recipeGuide, updateTodoStateEverywhere]);

  const persistLatestRecipeIngredientChecks = useCallback(async () => {
    if (isSavingRecipeIngredientChecksRef.current) {
      return;
    }

    isSavingRecipeIngredientChecksRef.current = true;

    try {
      while (pendingRecipeIngredientSaveRef.current) {
        const pendingSave = pendingRecipeIngredientSaveRef.current;
        pendingRecipeIngredientSaveRef.current = null;

        try {
          await saveRecipeGuide({
            todoId: pendingSave.todoId,
            ingredients: pendingSave.ingredients,
          });
        } catch (error) {
          console.error('Error saving recipe ingredient check state:', error);
        }
      }
    } finally {
      isSavingRecipeIngredientChecksRef.current = false;
    }
  }, []);

  const toggleRecipeIngredientChecked = useCallback((key: string, index: number) => {
    const currentGuide = recipeGuideRef.current;
    if (!currentGuide) {
      return;
    }

    const currentCheckedKeys = checkedRecipeIngredientKeysRef.current;
    const nextChecked = !currentCheckedKeys[key];
    const nextCheckedKeys = {
      ...currentCheckedKeys,
      [key]: nextChecked,
    };
    const nextIngredients = currentGuide.ingredients.map((ingredient, ingredientIndex) =>
      ingredientIndex === index
        ? { ...ingredient, checked: nextChecked }
        : ingredient
    );
    const nextGuide = { ...currentGuide, ingredients: nextIngredients };

    checkedRecipeIngredientKeysRef.current = nextCheckedKeys;
    recipeGuideRef.current = nextGuide;
    pendingRecipeIngredientSaveRef.current = {
      todoId: nextGuide.todoId,
      ingredients: nextIngredients,
    };

    setCheckedRecipeIngredientKeys(nextCheckedKeys);
    setRecipeGuide(nextGuide);
    void persistLatestRecipeIngredientChecks();
  }, [persistLatestRecipeIngredientChecks]);

  const handleFindSkillVideos = useCallback(async () => {
    if (!selectedTodoForDetails || !skillGuidanceContext || isSkillWorking) {
      return;
    }

    setIsSkillWorking(true);
    setIsSkillGuidanceAiActive(true);
    clearSkillNotice();

    try {
      skillSeenVideoIdsRef.current = extendSeenVideoIds(
        skillSeenVideoIdsRef.current,
        skillGuide?.videos || [],
        skillGuide?.selectedVideo?.videoId ? [skillGuide.selectedVideo.videoId] : []
      );
      const result = await requestSkillVideos({
        context: skillGuidanceContext,
        excludeVideoIds: Array.from(skillSeenVideoIdsRef.current),
        previousQuery: skillVideoSearchQueryRef.current,
        previousVideos: skillGuide?.videos || [],
      });
      skillVideoSearchQueryRef.current = result.query;
      skillSeenVideoIdsRef.current = extendSeenVideoIds(skillSeenVideoIdsRef.current, result.videos);
      const savedGuide = await saveSkillGuide({
        todoId: selectedTodoForDetails.id,
        videos: result.videos,
        selectedVideo: null,
        steps: [],
        status: result.videos.length ? 'videos' : 'error',
        errorMessage: result.videos.length ? '' : 'No regular videos were found. Try a more specific title.',
      });
      handleSkillGuideSaved(savedGuide);
    } catch (error) {
      console.error('Error finding skill videos:', error);
      const savedGuide = await saveSkillGuide({
        todoId: selectedTodoForDetails.id,
        status: 'error',
        errorMessage: String((error as any)?.message || error || 'Could not find videos.'),
      });
      handleSkillGuideSaved(savedGuide);
    } finally {
      setIsSkillWorking(false);
    }
  }, [
    clearSkillNotice,
    handleSkillGuideSaved,
    isSkillWorking,
    selectedTodoForDetails,
    skillGuide,
    skillGuidanceContext,
  ]);

  useEffect(() => {
    if (
      !shouldShowSkillGuide ||
      !selectedTodoForDetails?.id ||
      loadedSkillGuideTodoId !== selectedTodoForDetails.id ||
      skillGuide ||
      isSkillWorking
    ) {
      return;
    }

    void handleFindSkillVideos();
  }, [
    handleFindSkillVideos,
    isSkillWorking,
    loadedSkillGuideTodoId,
    selectedTodoForDetails?.id,
    shouldShowSkillGuide,
    skillGuide,
  ]);

  const handleSelectSkillVideo = useCallback(async (video: SkillVideo) => {
    if (!selectedTodoForDetails || !skillGuidanceContext || !skillGuide || isSkillWorking) {
      return;
    }

    setIsSkillWorking(true);
    setIsSkillGuidanceAiActive(true);
    clearSkillNotice();

    try {
      const generatingGuide = await saveSkillGuide({
        todoId: selectedTodoForDetails.id,
        selectedVideo: video,
        status: 'generating',
        errorMessage: '',
      });
      setSkillGuide(generatingGuide);
      const generated = await requestSkillGuide({
        context: skillGuidanceContext,
        selectedVideo: video,
      });
      const savedGuide = await saveSkillGuide({
        todoId: selectedTodoForDetails.id,
        selectedVideo: video,
        steps: generated.steps,
        transcriptLanguage: generated.transcriptLanguage,
        activeStepIndex: 0,
        status: generated.steps.length ? 'ready' : 'error',
        errorMessage: generated.steps.length
          ? ''
          : 'The transcript did not produce clear steps. Try another regular video.',
      });
      handleSkillGuideSaved(savedGuide);
      if (
        generated.steps.length &&
        isTodoGuidanceTutorialPendingRef.current &&
        tutorialTodoIdRef.current === selectedTodoForDetails.id
      ) {
        showTodoGuidanceTutorialStage('video-ready');
      }
    } catch (error) {
      console.error('Error generating video guide:', error);
      const savedGuide = await saveSkillGuide({
        todoId: selectedTodoForDetails.id,
        selectedVideo: video,
        status: 'error',
        errorMessage: String((error as any)?.message || error || 'Could not generate this video guide.'),
      });
      handleSkillGuideSaved(savedGuide);
    } finally {
      setIsSkillWorking(false);
    }
  }, [
    clearSkillNotice,
    handleSkillGuideSaved,
    isSkillWorking,
    selectedTodoForDetails,
    skillGuide,
    skillGuidanceContext,
    showTodoGuidanceTutorialStage,
  ]);

  const toggleSkillStepCompleted = useCallback(async (index: number) => {
    if (!skillGuide || index < 0 || index >= skillGuide.steps.length) {
      return;
    }

    const currentStep = skillGuide.steps[index];
    if (!currentStep.completed) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    const nextSteps = skillGuide.steps.map((step, stepIndex) =>
      stepIndex === index
        ? { ...step, completed: !currentStep.completed }
        : step
    );
    const nextActiveStepIndex = nextSteps.findIndex((step) => !step.completed);
    const isComplete = nextActiveStepIndex < 0;
    const nextGuide = {
      ...skillGuide,
      steps: nextSteps,
      activeStepIndex: isComplete ? Math.max(0, skillGuide.steps.length - 1) : nextActiveStepIndex,
    };
    const nextProgress = getSkillProgressFromSteps(nextSteps);

    setSkillGuide(nextGuide);
    if (nextProgress) {
      setSkillProgressOverridesByTodoId((current) => ({
        ...current,
        [skillGuide.todoId]: nextProgress,
      }));
    }

    try {
      const savedGuide = await saveSkillGuide({
        todoId: skillGuide.todoId,
        steps: nextSteps,
        activeStepIndex: nextGuide.activeStepIndex,
      });
      handleSkillGuideSaved(savedGuide);

      if (isComplete) {
        const currentTodo = localTodosRef.current.find((todo) => todo.id === skillGuide.todoId);
        if (!currentTodo?.completed) {
          const result = await updateTodo(skillGuide.todoId, { completed: true }, { syncReminder: true });
          handleReminderResult(result.reminderStatus);
          updateTodoStateEverywhere(skillGuide.todoId, {
            completed: true,
            ...getTodoOrderingStatePatch(result.todo),
          });
          setExpandedSections((current) => ({
            ...current,
            [currentTodo?.workspace || 'Personal']: {
              ...(current[currentTodo?.workspace || 'Personal'] || {}),
              completed: true,
            },
          }));
        }
      }
    } catch (error) {
      console.error('Error saving skill step progress:', error);
      setSkillGuide(skillGuide);
      const previousProgress = getSkillProgressFromSteps(skillGuide.steps);
      if (previousProgress) {
        setSkillProgressOverridesByTodoId((current) => ({
          ...current,
          [skillGuide.todoId]: previousProgress,
        }));
      }
    }
  }, [getTodoOrderingStatePatch, handleReminderResult, handleSkillGuideSaved, skillGuide, updateTodoStateEverywhere]);

  const handleAcceptTaskGuide = useCallback(async () => {
    if (!taskGuide || !taskGuide.steps.length) {
      return;
    }

    const acceptedSteps = taskGuide.steps.map((step) => ({ ...step, completed: false }));
    const acceptedGuide = {
      ...taskGuide,
      steps: acceptedSteps,
      activeStepIndex: 0,
      status: 'accepted' as const,
      errorMessage: undefined,
    };
    const acceptedProgress = getTaskProgressFromSteps(acceptedSteps, 'accepted');
    setTaskGuide(acceptedGuide);
    if (acceptedProgress) {
      setTaskProgressOverridesByTodoId((current) => ({
        ...current,
        [taskGuide.todoId]: acceptedProgress,
      }));
    }

    try {
      const savedGuide = await saveTaskGuide({
        todoId: taskGuide.todoId,
        steps: acceptedSteps,
        activeStepIndex: 0,
        status: 'accepted',
        errorMessage: '',
      });
      handleTaskGuideSaved(savedGuide);
      if (
        isTodoGuidanceTutorialPendingRef.current &&
        tutorialTodoIdRef.current === taskGuide.todoId
      ) {
        await finishTodoGuidanceTutorialAndStartGoal(true);
      }
    } catch (error) {
      console.error('Error accepting task guide:', error);
      setTaskGuide(taskGuide);
      const previousProgress = getTaskProgressFromSteps(taskGuide.steps, taskGuide.status);
      if (previousProgress) {
        setTaskProgressOverridesByTodoId((current) => ({
          ...current,
          [taskGuide.todoId]: previousProgress,
        }));
      }
    }
  }, [finishTodoGuidanceTutorialAndStartGoal, handleTaskGuideSaved, taskGuide]);

  const toggleTaskStepCompleted = useCallback(async (index: number) => {
    if (!taskGuide || index < 0 || index >= taskGuide.steps.length) {
      return;
    }

    const currentStep = taskGuide.steps[index];
    if (!currentStep.completed) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    const nextSteps = taskGuide.steps.map((step, stepIndex) =>
      stepIndex === index
        ? { ...step, completed: !currentStep.completed }
        : step
    );
    const nextActiveStepIndex = nextSteps.findIndex((step) => !step.completed);
    const isComplete = nextActiveStepIndex < 0;
    const nextGuide = {
      ...taskGuide,
      steps: nextSteps,
      activeStepIndex: isComplete ? Math.max(0, taskGuide.steps.length - 1) : nextActiveStepIndex,
      status: isComplete ? 'complete' as const : 'accepted' as const,
    };
    const nextProgress = getTaskProgressFromSteps(nextSteps, nextGuide.status);

    setTaskGuide(nextGuide);
    if (nextProgress) {
      setTaskProgressOverridesByTodoId((current) => ({
        ...current,
        [taskGuide.todoId]: nextProgress,
      }));
    }

    try {
      const savedGuide = await saveTaskGuide({
        todoId: taskGuide.todoId,
        steps: nextSteps,
        activeStepIndex: nextGuide.activeStepIndex,
        status: nextGuide.status,
      });
      handleTaskGuideSaved(savedGuide);

      if (isComplete) {
        const currentTodo = localTodosRef.current.find((todo) => todo.id === taskGuide.todoId);
        if (!currentTodo?.completed) {
          const result = await updateTodo(taskGuide.todoId, { completed: true }, { syncReminder: true });
          handleReminderResult(result.reminderStatus);
          updateTodoStateEverywhere(taskGuide.todoId, {
            completed: true,
            ...getTodoOrderingStatePatch(result.todo),
          });
          setExpandedSections((current) => ({
            ...current,
            [currentTodo?.workspace || 'Personal']: {
              ...(current[currentTodo?.workspace || 'Personal'] || {}),
              completed: true,
            },
          }));
        }
      }
    } catch (error) {
      console.error('Error saving task step progress:', error);
      setTaskGuide(taskGuide);
      const previousProgress = getTaskProgressFromSteps(taskGuide.steps, taskGuide.status);
      setTaskProgressOverridesByTodoId((current) => {
        if (!previousProgress || (taskGuide.status !== 'accepted' && taskGuide.status !== 'complete')) {
          const { [taskGuide.todoId]: _removed, ...rest } = current;
          return rest;
        }

        return {
          ...current,
          [taskGuide.todoId]: previousProgress,
        };
      });
    }
  }, [getTodoOrderingStatePatch, handleReminderResult, handleTaskGuideSaved, taskGuide, updateTodoStateEverywhere]);

  const toggleGoalGuidanceStepCompleted = useCallback(async (index: number) => {
    if (!goalGuidancePlan || index < 0 || index >= goalGuidancePlan.steps.length) {
      return;
    }

    goalGuidanceLoadVersionRef.current += 1;
    const currentActiveActions = getGoalGuidancePlanActiveActions(goalGuidancePlan);
    const actionForStep = !isGoalGuidanceActionDetails
      ? currentActiveActions.find((action) => action.stepIndex === index)
      : null;
    const allStepIndexes = goalGuidancePlan.steps.map((_, stepIndex) => stepIndex);
    const completedStepIndexes = new Set(
      goalGuidancePlan.status === 'complete'
        ? allStepIndexes
        : goalGuidancePlan.completedStepIndexes
    );
    const isStepCompleted = completedStepIndexes.has(index);

    if (!isStepCompleted) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    const nextCompletedStepIndexes = isStepCompleted
      ? allStepIndexes.filter((stepIndex) => stepIndex !== index && completedStepIndexes.has(stepIndex))
      : Array.from(new Set([...completedStepIndexes, index])).sort((a, b) => a - b);
    const nextActiveStepIndex = goalGuidancePlan.steps.findIndex((_, stepIndex) =>
      !nextCompletedStepIndexes.includes(stepIndex)
    );
    const isComplete = nextActiveStepIndex < 0;
    const nextPlan = {
      ...goalGuidancePlan,
      completedStepIndexes: nextCompletedStepIndexes,
      activeStepIndex: isComplete ? Math.max(0, goalGuidancePlan.steps.length - 1) : nextActiveStepIndex,
      status: isComplete ? 'complete' as const : 'accepted' as const,
    };

    if (!isStepCompleted && actionForStep) {
      setCompletingTodoId(actionForStep.todoId);
      const optimisticPlan = getOptimisticGoalGuidancePlanAfterCompletingTodo(goalGuidancePlan, actionForStep.todoId);
      setGoalGuidancePlan(optimisticPlan || nextPlan);

      try {
        const actionTodo = localTodosRef.current.find((todo) => todo.id === actionForStep.todoId);
        if (actionTodo && !actionTodo.completed) {
          updateTodoStateEverywhere(actionForStep.todoId, { completed: true });
          const result = await updateTodo(actionForStep.todoId, { completed: true }, { syncReminder: true });
          handleReminderResult(result.reminderStatus);
          updateTodoStateEverywhere(actionForStep.todoId, {
            completed: true,
            ...getTodoOrderingStatePatch(result.todo),
          });
        }

        await handleGoalActionCompleted(actionForStep.todoId);
      } catch (error) {
        console.error('Error completing goal guidance action from checklist:', error);
        setGoalGuidancePlan(goalGuidancePlan);
      } finally {
        setCompletingTodoId((currentId) => currentId === actionForStep.todoId ? null : currentId);
      }
      return;
    }

    const historicalTodoId = isStepCompleted
      ? getHistoricalGoalGuidanceTodoIdForStep(goalGuidancePlan, index)
      : null;
    const optimisticPlan = isStepCompleted
      ? {
          ...nextPlan,
          activeActions: historicalTodoId
            ? [{
                stepIndex: index,
                todoId: historicalTodoId,
                dueDate: '',
              }]
            : [],
          activeTodoId: historicalTodoId || undefined,
        }
      : nextPlan;

    if (isStepCompleted) {
      pendingGoalGuidanceStepUncheckRef.current = {
        planId: goalGuidancePlan.id,
        goalId: goalGuidancePlan.goalId,
      };

      const activeActionTodoIds = currentActiveActions.map((action) => action.todoId);
      if (activeActionTodoIds.length > 0) {
        removeTodoIdsFromLocalState(activeActionTodoIds);
      }
      if (historicalTodoId) {
        updateTodoStateEverywhere(historicalTodoId, { completed: false });
      }
    }

    setGoalGuidancePlan(optimisticPlan);

    try {
      let nextSavedPlan: GoalGuidancePlan;

      if (isStepCompleted) {
        const rewindResult = await rewindGoalGuidanceStepProgress(goalGuidancePlan.id, nextCompletedStepIndexes);
        nextSavedPlan = rewindResult.plan;

        if (rewindResult.deletedTodoIds.length > 0) {
          removeTodoIdsFromLocalState(rewindResult.deletedTodoIds);
        }

        if (rewindResult.todo) {
          upsertTodoStateEverywhere(rewindResult.todo);
        }
      } else {
        const saveResult = await saveGoalGuidanceStepProgress(goalGuidancePlan.id, nextCompletedStepIndexes);
        nextSavedPlan = saveResult.plan;

        if (saveResult.deletedTodoIds.length > 0) {
          removeTodoIdsFromLocalState(saveResult.deletedTodoIds);
        }
      }

      if (!isComplete && !isStepCompleted) {
        const recreated = await recreateActiveGoalGuidanceTodo(goalGuidancePlan.id);
        nextSavedPlan = recreated.plan;
        if (recreated.todo) {
          upsertTodoStateEverywhere(recreated.todo);
        }
      }

      setGoalGuidancePlan(nextSavedPlan);

      if (isComplete) {
        const currentTodo = localTodosRef.current.find((todo) => todo.id === goalGuidancePlan.goalId);
        if (!currentTodo?.completed) {
          const result = await updateTodo(goalGuidancePlan.goalId, { completed: true }, { syncReminder: true });
          handleReminderResult(result.reminderStatus);
          updateTodoStateEverywhere(goalGuidancePlan.goalId, {
            completed: true,
            ...getTodoOrderingStatePatch(result.todo),
          });
          setExpandedSections((current) => ({
            ...current,
            [currentTodo?.workspace || 'Personal']: {
              ...(current[currentTodo?.workspace || 'Personal'] || {}),
              completed: true,
            },
          }));
          await handleGoalActionCompleted(goalGuidancePlan.goalId);
        }
      } else {
        const currentTodo = localTodosRef.current.find((todo) => todo.id === goalGuidancePlan.goalId);
        if (currentTodo?.completed) {
          const result = await updateTodo(goalGuidancePlan.goalId, { completed: false }, { syncReminder: true });
          handleReminderResult(result.reminderStatus);
          updateTodoStateEverywhere(goalGuidancePlan.goalId, {
            completed: false,
            ...getTodoOrderingStatePatch(result.todo),
          });
        }
      }
    } catch (error) {
      console.error('Error saving goal guidance step progress:', error);
      setGoalGuidancePlan(goalGuidancePlan);
    } finally {
      if (pendingGoalGuidanceStepUncheckRef.current?.planId === goalGuidancePlan.id) {
        pendingGoalGuidanceStepUncheckRef.current = null;
      }
    }
  }, [
    goalGuidancePlan,
    handleGoalActionCompleted,
    handleReminderResult,
    isGoalGuidanceActionDetails,
    removeTodoIdsFromLocalState,
    updateTodoStateEverywhere,
    upsertTodoStateEverywhere,
  ]);

  const handleOpenRecipeWishlistModal = useCallback(() => {
    if (!recipeGuide || !recipeGuide.ingredients.length) {
      return;
    }

    const nextSelection = recipeGuide.ingredients.reduce<Record<string, boolean>>((selection, ingredient, index) => {
      const key = getRecipeIngredientKey(recipeGuide.todoId, ingredient, index);
      selection[key] = !checkedRecipeIngredientKeys[key];
      return selection;
    }, {});

    setRecipeWishlistSelection(nextSelection);
    setIsRecipeWishlistModalVisible(true);
  }, [checkedRecipeIngredientKeys, recipeGuide]);

  const toggleRecipeWishlistSelection = useCallback((key: string) => {
    setRecipeWishlistSelection((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const handleAddRecipeIngredientsToWishlist = useCallback(async () => {
    if (!recipeGuide || isAddingRecipeWishlistItems) {
      return;
    }

    const selectedIngredients = recipeGuide.ingredients.filter((ingredient, index) => {
      const key = getRecipeIngredientKey(recipeGuide.todoId, ingredient, index);
      return !!recipeWishlistSelection[key];
    });

    if (!selectedIngredients.length) {
      Alert.alert('No items selected', 'Select at least one ingredient to add to Wishlist.');
      return;
    }

    setIsAddingRecipeWishlistItems(true);

    try {
      const results = await Promise.all(selectedIngredients.map((ingredient) => createTodo({
        text: getRecipeIngredientTodoTitle(ingredient),
        completed: false,
        details: undefined,
        dueDate: startOfDay(new Date()),
        hasDueTime: false,
        starred: false,
        workspace: 'Wishlist',
        goalTimeframe: null,
        type: 'basic',
        progress: 0,
        isAmazonUrlLoaded: false,
        amazonUrlLoadAttempts: 0,
      })));

      results.forEach((result) => handleReminderResult(result.reminderStatus));
      await refreshLocalTodos();
      setExpandedSections((current) => ({
        ...current,
        Wishlist: {
          ...(current.Wishlist || {}),
          wishlist: true,
        },
      }));
      setIsRecipeWishlistModalVisible(false);
    } catch (error) {
      console.error('Error adding recipe ingredients to wishlist:', error);
      Alert.alert('Could not add items', String((error as any)?.message || error));
    } finally {
      setIsAddingRecipeWishlistItems(false);
    }
  }, [
    handleReminderResult,
    isAddingRecipeWishlistItems,
    recipeGuide,
    recipeWishlistSelection,
    refreshLocalTodos,
  ]);

  const renderRecipeGuidanceSections = () => {
    if (!shouldShowRecipeGuide) {
      return null;
    }

    const guide = recipeGuide;
    const isQuestionView = !guide || guide.status === 'questions';
    const isVideoView = !!guide && (guide.status === 'videos' || (guide.status === 'error' && guide.videos.length > 0));
    const isReadyView = !!guide && guide.status === 'ready';
    const isGeneratingView = !!guide && guide.status === 'generating';
    const isEmptyErrorView = !!guide && guide.status === 'error' && guide.videos.length === 0;
    const hasRecipeAnswer = !!recipeAnswerText && isReadyView;
    const hasRecipeHistory = recipeConversation.length > 0;
    const completedRecipeSteps = guide?.steps.filter((step) => step.completed).length || 0;
    const recipeProgressRatio = guide?.steps.length ? completedRecipeSteps / guide.steps.length : 0;
    const nextRecipeStepIndex = guide?.steps.findIndex((step) => !step.completed) ?? -1;

    return (
      <>
        <LinearGradient
          colors={RECIPE_GUIDANCE_CARD_GRADIENT}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.detailsModalGradientCard}
          onLayout={(event) => {
            recipeGuidanceSectionYRef.current = event.nativeEvent.layout.y;
          }}
        >
          <View style={styles.goalGuidanceSectionHeader}>
            <View style={styles.detailsModalMetaLead}>
              <MaterialCommunityIcons name="chef-hat" size={20} color="#E8FFFA" />
              <Text style={[styles.detailsModalMetaLabel, styles.goalGuidanceCardTitle]}>Recipe guide</Text>
            </View>
            {(isRecipeWorking || isRecipeAiRunning || isGeneratingView) && (
              <ActivityIndicator size="small" color="#E8FFFA" />
            )}
            {hasRecipeAnswer && (
              <TouchableOpacity
                style={styles.goalGuidanceReturnButton}
                onPress={returnToRecipeSteps}
                activeOpacity={0.82}
              >
                <Text style={styles.goalGuidanceReturnButtonText}>Back to steps</Text>
              </TouchableOpacity>
            )}
          </View>

          {!!recipeNotice?.message && (
            <Text
              style={[
                styles.goalGuidanceNotice,
                recipeNotice.kind === 'error' && styles.goalGuidanceErrorText,
              ]}
            >
              {recipeNotice.message}
            </Text>
          )}

          {!!guide?.errorMessage && guide.status === 'error' && (
            <Text style={[styles.goalGuidanceNotice, styles.goalGuidanceErrorText]}>
              {guide.errorMessage}
            </Text>
          )}

          {isQuestionView && (
            <View style={styles.recipeQuestionStack}>
              <GuidanceMarkdown>Choose regular recipe videos. Add a dietary preference only if it matters.</GuidanceMarkdown>
              <TextInput
                style={styles.recipeAnswerInput}
                value={recipeAnswersDraft.dietary}
                onChangeText={(value) => handleRecipeAnswerChange('dietary', value)}
                placeholder="Optional: vegetarian, vegan, no nuts..."
                placeholderTextColor="rgba(232,255,250,0.62)"
              />
              <GuidancePrimaryButton
                onPress={handleFindRecipeVideos}
                disabled={isRecipeWorking}
              >
                {isRecipeWorking ? 'Finding videos...' : 'Find videos'}
              </GuidancePrimaryButton>
            </View>
          )}

          {isEmptyErrorView && (
            <View style={styles.recipeQuestionStack}>
              <GuidanceMarkdown>Try again with the same answers, or update the basics above later.</GuidanceMarkdown>
              <GuidancePrimaryButton
                onPress={handleFindRecipeVideos}
                disabled={isRecipeWorking}
              >
                {isRecipeWorking ? 'Finding videos...' : 'Find videos again'}
              </GuidancePrimaryButton>
            </View>
          )}

          {isVideoView && (
            <View style={styles.recipeVideoList}>
              <GuidanceMarkdown>Pick one regular recipe video.</GuidanceMarkdown>
              {guide.videos.map((video) => {
                const durationLabel = formatRecipeVideoDuration(video.durationSeconds);
                const viewsLabel = formatRecipeVideoViews(video.viewCount);
                return (
                  <TouchableOpacity
                    key={video.videoId}
                    style={styles.recipeVideoRow}
                    onPress={() => void handleSelectRecipeVideo(video)}
                    disabled={isRecipeWorking}
                    activeOpacity={0.82}
                  >
                    {!!video.thumbnailUrl && (
                      <Image source={{ uri: video.thumbnailUrl }} style={styles.recipeVideoThumbnail} />
                    )}
                    <View style={styles.recipeVideoTextGroup}>
                      <Text style={styles.recipeVideoTitle} numberOfLines={2}>{video.title}</Text>
                      <Text style={styles.recipeVideoMeta} numberOfLines={1}>
                        {[video.channelTitle, durationLabel, viewsLabel]
                          .filter(Boolean)
                          .join(' - ')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#E8FFFA" />
                  </TouchableOpacity>
                );
              })}
              <GuidancePrimaryButton
                onPress={handleFindRecipeVideos}
                disabled={isRecipeWorking}
              >
                Refresh videos
              </GuidancePrimaryButton>
            </View>
          )}

          {isGeneratingView && (
            <View style={styles.recipeQuestionStack}>
              <Text style={styles.goalGuidanceStepTitle}>Generating steps</Text>
              <GuidanceMarkdown>I am reading the transcript and turning it into a cooking guide.</GuidanceMarkdown>
            </View>
          )}

          {isReadyView && guide && (
            <View style={styles.recipeGuideStack}>
              {hasRecipeAnswer ? (
                <>
                  <GuidanceMarkdown>{recipeAnswerText}</GuidanceMarkdown>
                  {!!pendingRecipeChange && (
                    <View style={styles.recipeGuideBlock}>
                      <GuidanceMarkdown>{`This changes the main recipe. Find new videos for ${pendingRecipeChange.title}.`}</GuidanceMarkdown>
                      <GuidancePrimaryButton
                        onPress={handleApplyPendingRecipeChange}
                        disabled={isRecipeWorking}
                        attention
                      >
                        {isRecipeWorking ? 'Finding videos...' : 'Change this recipe'}
                      </GuidancePrimaryButton>
                    </View>
                  )}
                </>
              ) : (
                <>
                  {!!guide.selectedVideo && (
                    <TouchableOpacity
                      style={styles.recipeSelectedVideo}
                      onPress={() => {
                        const url = buildRecipeTimestampUrl(guide.selectedVideo?.videoId);
                        if (url) void Linking.openURL(url);
                      }}
                      activeOpacity={0.82}
                    >
                      <MaterialCommunityIcons name="youtube" size={18} color="#E8FFFA" />
                      <Text style={styles.recipeSelectedVideoText} numberOfLines={2}>
                        {guide.selectedVideo.title}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.recipeGuideBlock}>
                    <Text style={styles.goalGuidanceStepTitle}>Ingredients</Text>
                    {guide.ingredients.map((ingredient, index) => {
                      const ingredientKey = getRecipeIngredientKey(guide.todoId, ingredient, index);
                      const isChecked = !!checkedRecipeIngredientKeys[ingredientKey];

                      return (
                        <TouchableOpacity
                          key={ingredientKey}
                          style={styles.recipeIngredientRow}
                          onPress={() => {
                            void toggleRecipeIngredientChecked(ingredientKey, index);
                          }}
                          activeOpacity={0.82}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isChecked }}
                        >
                          <MaterialCommunityIcons
                            name={isChecked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                            size={20}
                            color="#E8FFFA"
                            style={styles.recipeIngredientCheck}
                          />
                          <Text
                            style={[
                              styles.recipeIngredientText,
                              isChecked && styles.recipeIngredientTextChecked,
                            ]}
                          >
                            {ingredient.quantity ? `${ingredient.quantity} ` : ''}
                            <Text style={styles.recipeItemNameText}>{getRecipeDisplayName(ingredient.name)}</Text>
                            {ingredient.note ? ` - ${ingredient.note}` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={[
                        styles.recipeWishlistButton,
                        isAddingRecipeWishlistItems && styles.actionButtonDisabled,
                      ]}
                      onPress={handleOpenRecipeWishlistModal}
                      disabled={isAddingRecipeWishlistItems}
                      activeOpacity={0.82}
                    >
                      <Text style={styles.recipeWishlistButtonText}>Add to Wishlist</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.recipeGuideBlock}>
                    <Text style={styles.goalGuidanceStepTitle}>Equipment</Text>
                    {guide.equipment.map((item, index) => (
                      <Text key={`equipment-${index}`} selectable style={styles.goalGuidanceBodyText}>
                        <Text style={styles.recipeItemNameText}>{getRecipeDisplayName(item.name)}</Text>
                        {item.required === false ? ' (optional)' : ''}{item.note ? ` - ${item.note}` : ''}
                      </Text>
                    ))}
                  </View>

                  <View style={styles.recipeGuideBlock}>
                    <Text style={styles.goalGuidanceStepTitle}>Steps</Text>
                    <View style={styles.recipeProgressBlock}>
                      <View style={styles.goalGuidanceOverallProgressHeader}>
                        <Text style={styles.goalGuidanceOverallProgressText}>Recipe progress</Text>
                        <Text style={styles.goalGuidanceOverallProgressText}>
                          {completedRecipeSteps}/{guide.steps.length}
                        </Text>
                      </View>
                      <View style={styles.goalGuidanceOverallProgressTrack}>
                        <View
                          style={[
                            styles.goalGuidanceOverallProgressFill,
                            { width: `${Math.round(recipeProgressRatio * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                    {guide.steps.map((step, index) => {
                      const isActiveStep = index === nextRecipeStepIndex;
                      const isStepCompleted = !!step.completed;
                      const timestampLabel = formatRecipeTimestamp(step.timestampSeconds);
                      const timestampUrl = buildRecipeTimestampUrl(guide.selectedVideo?.videoId, step.timestampSeconds);

                      return (
                        <View
                          key={`recipe-step-${index}`}
                          style={[
                            styles.recipeStepRow,
                            isActiveStep && styles.recipeStepRowActive,
                            isStepCompleted && styles.recipeStepRowCompleted,
                          ]}
                        >
                          <TouchableOpacity
                            style={styles.recipeStepCompleteButton}
                            onPress={(event) => {
                              event.stopPropagation();
                              void toggleRecipeStepCompleted(index);
                            }}
                            activeOpacity={0.82}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isStepCompleted }}
                          >
                            <MaterialCommunityIcons
                              name={isStepCompleted ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline'}
                              size={24}
                              color="#E8FFFA"
                            />
                          </TouchableOpacity>
                          <View style={styles.goalGuidanceStepTextGroup}>
                            <View style={styles.recipeStepTitleRow}>
                              <GuidanceSelectableText
                                inputStyle={[
                                  styles.goalGuidanceStepTitle,
                                  isStepCompleted && styles.recipeStepTextCompleted,
                                ]}
                              >
                                {step.title}
                              </GuidanceSelectableText>
                            </View>
                            <View style={isStepCompleted && styles.recipeStepBodyCompleted}>
                              <GuidanceMarkdown>{step.body}</GuidanceMarkdown>
                            </View>
                            {!!timestampUrl && !!timestampLabel && (
                              <TouchableOpacity
                                style={styles.recipeTimestampButton}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  void Linking.openURL(timestampUrl);
                                }}
                                activeOpacity={0.82}
                              >
                                <MaterialCommunityIcons name="youtube" size={18} color="#024035" />
                                <Text style={styles.recipeTimestampButtonText}>{timestampLabel}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          )}
        </LinearGradient>

        {hasRecipeHistory && (
          <LinearGradient
            colors={RECIPE_GUIDANCE_CARD_GRADIENT}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.detailsModalGradientCard}
          >
            <TouchableOpacity
              style={[styles.goalGuidanceSectionHeader, styles.goalGuidanceHistoryToggle]}
              onPress={() => setIsRecipeChatHistoryExpanded((isExpanded) => !isExpanded)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Toggle recipe chat history"
              accessibilityState={{ expanded: isRecipeChatHistoryExpanded }}
            >
              <View style={styles.detailsModalMetaLead}>
                <Text style={[styles.detailsModalMetaLabel, styles.goalGuidanceCardTitle]}>Recipe chat history</Text>
              </View>
              <Ionicons
                name={isRecipeChatHistoryExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#E8FFFA"
              />
            </TouchableOpacity>
            {isRecipeChatHistoryExpanded && (
              <View style={styles.goalGuidanceConversation}>
                {recipeConversation.map((message, index) => (
                  <View
                    key={`recipe-history-${index}-${message.role}`}
                    style={[
                      styles.goalGuidanceMessage,
                      message.role === 'user' && styles.goalGuidanceUserMessage,
                    ]}
                  >
                    <Text style={styles.goalGuidanceMessageLabel}>
                      {message.role === 'user' ? 'You' : 'Recipe'}
                    </Text>
                    <GuidanceMarkdown>{message.content}</GuidanceMarkdown>
                  </View>
                ))}
              </View>
            )}
          </LinearGradient>
        )}
      </>
    );
  };

  const renderSkillGuidanceSections = () => {
    if (!shouldShowSkillGuide) {
      return null;
    }

    const guide = skillGuide;
    const isVideoView = !guide || guide.status === 'videos' || (guide.status === 'error' && guide.videos.length > 0);
    const isReadyView = !!guide && guide.status === 'ready';
    const isGeneratingView = !!guide && guide.status === 'generating';
    const isEmptyErrorView = !!guide && guide.status === 'error' && guide.videos.length === 0;
    const hasSkillAnswer = !!skillAnswerText && isReadyView;
    const hasSkillHistory = skillConversation.length > 0;
    const completedSkillSteps = guide?.steps.filter((step) => step.completed).length || 0;
    const skillProgressRatio = guide?.steps.length ? completedSkillSteps / guide.steps.length : 0;
    const nextSkillStepIndex = guide?.steps.findIndex((step) => !step.completed) ?? -1;

    return (
      <>
        <LinearGradient
          colors={RECIPE_GUIDANCE_CARD_GRADIENT}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.detailsModalGradientCard}
          onLayout={(event) => {
            skillGuidanceSectionYRef.current = event.nativeEvent.layout.y;
          }}
        >
          <View style={styles.goalGuidanceSectionHeader}>
            <View style={styles.detailsModalMetaLead}>
              <MaterialCommunityIcons
                name={hasSkillAnswer ? 'message-text' : 'youtube'}
                size={20}
                color="#E8FFFA"
              />
              <Text
                style={[styles.detailsModalMetaLabel, styles.goalGuidanceCardTitle]}
                numberOfLines={1}
              >
                {hasSkillAnswer ? 'Guide response' : 'Video guide'}
              </Text>
            </View>
            {(isSkillWorking || isSkillAiRunning || isGeneratingView) && (
              <ActivityIndicator size="small" color="#E8FFFA" />
            )}
            {hasSkillAnswer && (
              <TouchableOpacity
                style={styles.goalGuidanceReturnButton}
                onPress={returnToSkillSteps}
                activeOpacity={0.82}
              >
                <Text style={styles.goalGuidanceReturnButtonText}>Back to steps</Text>
              </TouchableOpacity>
            )}
          </View>

          {!!skillNotice?.message && (
            <Text
              style={[
                styles.goalGuidanceNotice,
                skillNotice.kind === 'error' && styles.goalGuidanceErrorText,
              ]}
            >
              {skillNotice.message}
            </Text>
          )}

          {!!guide?.errorMessage && guide.status === 'error' && !isProRequiredMessage(guide.errorMessage) && (
            <Text style={[styles.goalGuidanceNotice, styles.goalGuidanceErrorText]}>
              {guide.errorMessage}
            </Text>
          )}

          {/* Free plan: say plainly that it is Pro, and offer Pro, instead of "try again". */}
          {isEmptyErrorView && isProRequiredMessage(guide?.errorMessage) && (
            <View style={styles.recipeQuestionStack}>
              <GuidanceMarkdown>Video guides are part of **Eazee Pro**. You can still plan this with an Actions plan.</GuidanceMarkdown>
              <TouchableOpacity
                style={styles.goalGuidanceButton}
                // push, not replace: replace does not switch tabs from inside To Do.
                onPress={() => router.push({
                  pathname: '/(tabs)/home',
                  params: { settings: 'true', settingsPanel: 'paywall', settingsNonce: String(Date.now()) },
                })}
                activeOpacity={0.82}
              >
                <Text style={styles.goalGuidanceButtonText}>See Eazee Pro</Text>
              </TouchableOpacity>
            </View>
          )}

          {isEmptyErrorView && !isProRequiredMessage(guide?.errorMessage) && (
            <View style={styles.recipeQuestionStack}>
              <GuidanceMarkdown>Try again with a more specific title or details.</GuidanceMarkdown>
              <TouchableOpacity
                style={[styles.goalGuidanceButton, isSkillWorking && styles.actionButtonDisabled]}
                onPress={handleFindSkillVideos}
                disabled={isSkillWorking}
                activeOpacity={0.82}
              >
                <Text style={styles.goalGuidanceButtonText}>
                  {isSkillWorking ? 'Finding videos...' : 'Find videos again'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {isVideoView && (
            <View style={styles.recipeVideoList}>
              <GuidanceMarkdown>{guide?.videos.length ? 'Pick one regular video.' : 'Finding regular videos...'}</GuidanceMarkdown>
              {guide?.videos.map((video) => {
                const durationLabel = formatRecipeVideoDuration(video.durationSeconds);
                const viewsLabel = formatRecipeVideoViews(video.viewCount);
                return (
                  <TouchableOpacity
                    key={video.videoId}
                    style={styles.recipeVideoRow}
                    onPress={() => void handleSelectSkillVideo(video)}
                    disabled={isSkillWorking}
                    activeOpacity={0.82}
                  >
                    {!!video.thumbnailUrl && (
                      <Image source={{ uri: video.thumbnailUrl }} style={styles.recipeVideoThumbnail} />
                    )}
                    <View style={styles.recipeVideoTextGroup}>
                      <Text style={styles.recipeVideoTitle} numberOfLines={2}>{video.title}</Text>
                      <Text style={styles.recipeVideoMeta} numberOfLines={1}>
                        {[video.channelTitle, durationLabel, viewsLabel]
                          .filter(Boolean)
                          .join(' - ')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#E8FFFA" />
                  </TouchableOpacity>
                );
              })}
              {!!guide?.videos.length && (
                <GuidancePrimaryButton
                  onPress={handleFindSkillVideos}
                  disabled={isSkillWorking}
                >
                  Refresh videos
                </GuidancePrimaryButton>
              )}
            </View>
          )}

          {isGeneratingView && (
            <View style={styles.recipeQuestionStack}>
              <Text style={styles.goalGuidanceStepTitle}>Generating steps</Text>
              <GuidanceMarkdown>I am reading the transcript and turning it into step-by-step guidance.</GuidanceMarkdown>
            </View>
          )}

          {isReadyView && guide && (
            <View style={styles.recipeGuideStack}>
              {hasSkillAnswer ? (
                <GuidanceMarkdown>{skillAnswerText}</GuidanceMarkdown>
              ) : (
                <>
                  {!!guide.selectedVideo && (
                    <TouchableOpacity
                      style={styles.recipeSelectedVideo}
                      onPress={() => {
                        const url = buildRecipeTimestampUrl(guide.selectedVideo?.videoId);
                        if (url) void Linking.openURL(url);
                      }}
                      activeOpacity={0.82}
                    >
                      <MaterialCommunityIcons name="youtube" size={18} color="#E8FFFA" />
                      <Text style={styles.recipeSelectedVideoText} numberOfLines={2}>
                        {guide.selectedVideo.title}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.recipeGuideBlock}>
                    <Text style={styles.goalGuidanceStepTitle}>Video steps</Text>
                    <View style={styles.recipeProgressBlock}>
                      <View style={styles.goalGuidanceOverallProgressHeader}>
                        <Text style={styles.goalGuidanceOverallProgressText}>Video progress</Text>
                        <Text style={styles.goalGuidanceOverallProgressText}>
                          {completedSkillSteps}/{guide.steps.length}
                        </Text>
                      </View>
                      <View style={styles.goalGuidanceOverallProgressTrack}>
                        <View
                          style={[
                            styles.goalGuidanceOverallProgressFill,
                            { width: `${Math.round(skillProgressRatio * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                    {guide.steps.map((step, index) => {
                      const isActiveStep = index === nextSkillStepIndex;
                      const isStepCompleted = !!step.completed;
                      const timestampLabel = formatRecipeTimestamp(step.timestampSeconds);
                      const timestampUrl = buildRecipeTimestampUrl(guide.selectedVideo?.videoId, step.timestampSeconds);

                      return (
                        <View
                          key={`skill-step-${index}`}
                          style={[
                            styles.recipeStepRow,
                            isActiveStep && styles.recipeStepRowActive,
                            isStepCompleted && styles.recipeStepRowCompleted,
                          ]}
                        >
                          <TouchableOpacity
                            style={styles.recipeStepCompleteButton}
                            onPress={(event) => {
                              event.stopPropagation();
                              void toggleSkillStepCompleted(index);
                            }}
                            activeOpacity={0.82}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isStepCompleted }}
                          >
                            <MaterialCommunityIcons
                              name={isStepCompleted ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline'}
                              size={24}
                              color="#E8FFFA"
                            />
                          </TouchableOpacity>
                          <View style={styles.goalGuidanceStepTextGroup}>
                            <View style={styles.recipeStepTitleRow}>
                              <GuidanceSelectableText
                                inputStyle={[
                                  styles.goalGuidanceStepTitle,
                                  isStepCompleted && styles.recipeStepTextCompleted,
                                ]}
                              >
                                {step.title}
                              </GuidanceSelectableText>
                            </View>
                            <View style={isStepCompleted && styles.recipeStepBodyCompleted}>
                              <GuidanceMarkdown>{step.body}</GuidanceMarkdown>
                            </View>
                            {!!timestampUrl && !!timestampLabel && (
                              <TouchableOpacity
                                style={styles.recipeTimestampButton}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  void Linking.openURL(timestampUrl);
                                }}
                                activeOpacity={0.82}
                              >
                                <MaterialCommunityIcons name="youtube" size={18} color="#024035" />
                                <Text style={styles.recipeTimestampButtonText}>{timestampLabel}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          )}
        </LinearGradient>

        {hasSkillHistory && (
          <LinearGradient
            colors={RECIPE_GUIDANCE_CARD_GRADIENT}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.detailsModalGradientCard}
          >
            <TouchableOpacity
              style={[styles.goalGuidanceSectionHeader, styles.goalGuidanceHistoryToggle]}
              onPress={() => setIsSkillChatHistoryExpanded((isExpanded) => !isExpanded)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Toggle video guide chat history"
              accessibilityState={{ expanded: isSkillChatHistoryExpanded }}
            >
              <View style={styles.detailsModalMetaLead}>
                <Text style={[styles.detailsModalMetaLabel, styles.goalGuidanceCardTitle]}>Video guide chat history</Text>
              </View>
              <Ionicons
                name={isSkillChatHistoryExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#E8FFFA"
              />
            </TouchableOpacity>
            {isSkillChatHistoryExpanded && (
              <View style={styles.goalGuidanceConversation}>
                {skillConversation.map((message, index) => (
                  <View
                    key={`skill-history-${index}-${message.role}`}
                    style={[
                      styles.goalGuidanceMessage,
                      message.role === 'user' && styles.goalGuidanceUserMessage,
                    ]}
                  >
                    <Text style={styles.goalGuidanceMessageLabel}>
                      {message.role === 'user' ? 'You' : 'Video guide'}
                    </Text>
                    <GuidanceMarkdown>{message.content}</GuidanceMarkdown>
                  </View>
                ))}
              </View>
            )}
          </LinearGradient>
        )}
      </>
    );
  };

  const renderTaskGuidanceSections = () => {
    if (!shouldShowTaskGuide) {
      return null;
    }

    const guide = taskGuide;
    const hasTaskHistory = taskGuidanceConversation.length > 0;
    const isPreview = guide?.status === 'preview' && guide.steps.length > 0;
    const isAccepted = guide?.status === 'accepted' || guide?.status === 'complete';
    const hasTaskAnswer = !!taskGuidanceAnswerText && isAccepted;
    const completedSteps = guide?.status === 'complete'
      ? guide.steps.length
      : guide?.steps.filter((step) => step.completed).length || 0;
    const taskProgressRatio = guide?.steps.length ? completedSteps / guide.steps.length : 0;
    const nextTaskStepIndex = guide?.steps.findIndex((step) => !step.completed) ?? -1;

    return (
      <>
        <LinearGradient
          colors={GOAL_GUIDANCE_CARD_GRADIENT}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.detailsModalGradientCard}
          onLayout={(event) => {
            taskGuidanceSectionYRef.current = event.nativeEvent.layout.y;
          }}
        >
          <View>
            <View style={styles.goalGuidanceSectionHeader}>
              <View style={styles.detailsModalMetaLead}>
                <Text style={[styles.detailsModalMetaLabel, styles.goalGuidanceCardTitle]}>Guidance</Text>
              </View>
              {hasTaskAnswer ? (
                <TouchableOpacity
                  style={styles.goalGuidanceReturnButton}
                  onPress={returnToTaskGuidancePlan}
                  activeOpacity={0.82}
                >
                  <Text style={styles.goalGuidanceReturnButtonText}>Return to plan</Text>
                </TouchableOpacity>
              ) : (
                isTaskGuidanceRunning && <ActivityIndicator size="small" color="#165C53" />
              )}
            </View>

            {hasTaskAnswer && (
              <>
                <GuidanceMarkdown>{taskGuidanceAnswerText}</GuidanceMarkdown>
                {hasPendingTaskGuidancePlanChange && (
                  <GuidancePrimaryButton
                    onPress={applyPendingTaskGuidancePlanChange}
                    disabled={isTaskGuidanceRunning}
                    attention
                  >
                    Change plan
                  </GuidancePrimaryButton>
                )}
              </>
            )}

            {!hasTaskAnswer && !!taskGuidanceNotice?.message && taskGuidanceNotice.kind !== 'toast' && (
              <Text
                style={[
                  styles.goalGuidanceNotice,
                  taskGuidanceNotice.kind === 'error' && styles.goalGuidanceErrorText,
                ]}
              >
                {taskGuidanceNotice.kind === 'clarify'
                  ? `${taskGuidanceNotice.message}\n\n${GUIDANCE_REPLY_INSTRUCTION}`
                  : taskGuidanceNotice.message}
              </Text>
            )}

            {!hasTaskAnswer && !!guide?.errorMessage && guide.status === 'error' && (
              <Text style={[styles.goalGuidanceNotice, styles.goalGuidanceErrorText]}>
                {guide.errorMessage}
              </Text>
            )}

            {!hasTaskAnswer && !guide && !taskGuidanceNotice && (
              <Text style={styles.goalGuidanceNotice}>
                Getting steps...
              </Text>
            )}

            {!hasTaskAnswer && guide?.status === 'error' && (
              <TouchableOpacity
                style={[styles.goalGuidanceButton, isTaskGuidanceRunning && styles.actionButtonDisabled]}
                onPress={requestTaskGuidanceSteps}
                disabled={isTaskGuidanceRunning}
                activeOpacity={0.82}
              >
                <Text style={styles.goalGuidanceButtonText}>
                  {isTaskGuidanceRunning ? 'Getting steps...' : 'Try again'}
                </Text>
              </TouchableOpacity>
            )}

            {!hasTaskAnswer && guide?.status === 'preview' && !guide.steps.length && !taskGuidanceNotice && (
              <GuidanceMarkdown>{GUIDANCE_REPLY_INSTRUCTION}</GuidanceMarkdown>
            )}

            {!hasTaskAnswer && isPreview && guide && (
              <>
                {!!guide.note && <GuidanceMarkdown>{guide.note}</GuidanceMarkdown>}
                <View style={styles.recipeProgressBlock}>
                  <View style={styles.goalGuidanceOverallProgressHeader}>
                    <Text style={styles.goalGuidanceOverallProgressText}>
                      Task progress {Math.round(taskProgressRatio * 100)}%
                    </Text>
                    <Text style={styles.goalGuidanceOverallProgressText}>
                      {completedSteps}/{guide.steps.length}
                    </Text>
                  </View>
                  <View style={styles.goalGuidanceOverallProgressTrack}>
                    <View
                      style={[
                        styles.goalGuidanceOverallProgressFill,
                        { width: `${Math.round(taskProgressRatio * 100)}%` },
                      ]}
                    />
                  </View>
                </View>
                {guide.steps.map((step, index) => (
                  <View key={`task-preview-${index}`} style={styles.goalGuidanceStepRow}>
                    <Text style={styles.goalGuidanceStepIndex}>{index + 1}</Text>
                    <View style={styles.goalGuidanceStepTextGroup}>
                      <GuidanceSelectableText inputStyle={styles.goalGuidanceStepTitle}>{step.title}</GuidanceSelectableText>
                      {!!step.details && <GuidanceMarkdown>{step.details}</GuidanceMarkdown>}
                    </View>
                  </View>
                ))}
                <View
                  style={styles.guidedAcceptPlanOuter}
                  onLayout={(event) => {
                    taskAcceptPlanButtonYRef.current = event.nativeEvent.layout.y;
                  }}
                >
                  <GuidedTarget
                    targetId={getTodoControlGuidanceTargetId('tutorial-accept-plan')}
                    label="Accept plan"
                    localHighlightShape="rect"
                    localHighlightRadius={999}
                    localHighlightInset={2}
                    localHighlightPulseScale={1.03}
                    style={styles.guidedAcceptPlanTarget}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.goalGuidanceGetStepsButton,
                        styles.tutorialAcceptPlanButton,
                        pressed && styles.goalGuidancePressedButton,
                      ]}
                      onPress={handleAcceptTaskGuide}
                    >
                      <LinearGradient
                        colors={['#0A9881', '#04473C']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.goalGuidanceGetStepsButtonGradient}
                      >
                        <Text style={styles.goalGuidanceGetStepsButtonText}>Accept plan</Text>
                      </LinearGradient>
                    </Pressable>
                  </GuidedTarget>
                </View>
              </>
            )}

            {!hasTaskAnswer && isAccepted && guide && (
              <View style={styles.recipeGuideBlock}>
                {!!guide.note && <GuidanceMarkdown>{guide.note}</GuidanceMarkdown>}
                <View style={styles.recipeProgressBlock}>
                  <View style={styles.goalGuidanceOverallProgressHeader}>
                    <Text style={styles.goalGuidanceOverallProgressText}>
                      Task progress {Math.round(taskProgressRatio * 100)}%
                    </Text>
                    <Text style={styles.goalGuidanceOverallProgressText}>
                      {completedSteps}/{guide.steps.length}
                    </Text>
                  </View>
                  <View style={styles.goalGuidanceOverallProgressTrack}>
                    <View
                      style={[
                        styles.goalGuidanceOverallProgressFill,
                        { width: `${Math.round(taskProgressRatio * 100)}%` },
                      ]}
                    />
                  </View>
                </View>
                {guide.steps.map((step, index) => {
                  const isActiveStep = index === nextTaskStepIndex;
                  const isStepCompleted = guide.status === 'complete' || !!step.completed;
                  const youtubeUrl = step.youtubeQuery
                    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(step.youtubeQuery)}`
                    : undefined;

                  return (
                    <View
                      key={`task-step-${index}`}
                      style={[
                        styles.recipeStepRow,
                        isActiveStep && styles.recipeStepRowActive,
                        isStepCompleted && styles.recipeStepRowCompleted,
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.recipeStepCompleteButton}
                        onPress={(event) => {
                          event.stopPropagation();
                          void toggleTaskStepCompleted(index);
                        }}
                        activeOpacity={0.82}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isStepCompleted }}
                      >
                        <MaterialCommunityIcons
                          name={isStepCompleted ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline'}
                          size={24}
                          color="#E8FFFA"
                        />
                      </TouchableOpacity>
                      <View style={styles.goalGuidanceStepTextGroup}>
                        <View style={styles.recipeStepTitleRow}>
                          <GuidanceSelectableText
                            inputStyle={[
                              styles.goalGuidanceStepTitle,
                              isStepCompleted && styles.recipeStepTextCompleted,
                            ]}
                          >
                            {step.title}
                          </GuidanceSelectableText>
                          {!!youtubeUrl && (
                            <TouchableOpacity
                              onPress={(event) => {
                                event.stopPropagation();
                                void Linking.openURL(youtubeUrl);
                              }}
                              style={styles.goalActionYoutubeButton}
                              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                              activeOpacity={0.72}
                            >
                              <MaterialCommunityIcons name="youtube" size={18} color={GOAL_GUIDANCE_ICON_COLOR} />
                            </TouchableOpacity>
                          )}
                        </View>
                        {!!step.details && (
                          <View style={isStepCompleted && styles.recipeStepBodyCompleted}>
                            <GuidanceMarkdown>{step.details}</GuidanceMarkdown>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </LinearGradient>

        {hasTaskHistory && (
          <LinearGradient
            colors={GOAL_GUIDANCE_CARD_GRADIENT}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.detailsModalGradientCard}
          >
            <TouchableOpacity
              style={[styles.goalGuidanceSectionHeader, styles.goalGuidanceHistoryToggle]}
              onPress={() => setIsTaskGuidanceHistoryExpanded((isExpanded) => !isExpanded)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Toggle guidance history"
              accessibilityState={{ expanded: isTaskGuidanceHistoryExpanded }}
            >
              <View style={styles.detailsModalMetaLead}>
                <Text style={[styles.detailsModalMetaLabel, styles.goalGuidanceCardTitle]}>Guidance history</Text>
              </View>
              <Ionicons
                name={isTaskGuidanceHistoryExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#E8FFFA"
              />
            </TouchableOpacity>
            {isTaskGuidanceHistoryExpanded && (
              <View style={styles.goalGuidanceConversation}>
                {taskGuidanceConversation.map((message, index) => (
                  <View
                    key={`task-guidance-history-${index}-${message.role}`}
                    style={[
                      styles.goalGuidanceMessage,
                      message.role === 'user' && styles.goalGuidanceUserMessage,
                    ]}
                  >
                    <Text style={styles.goalGuidanceMessageLabel}>
                      {message.role === 'user' ? 'You' : 'Guidance'}
                    </Text>
                    <GuidanceMarkdown>{message.content}</GuidanceMarkdown>
                  </View>
                ))}
              </View>
            )}
          </LinearGradient>
        )}
      </>
    );
  };

  const renderGoalGuidanceSections = () => {
    if (!shouldShowGoalGuidance) {
      return null;
    }

    const hasGuidanceQuestionOrError =
      goalGuidanceNotice?.kind === 'clarify' || goalGuidanceNotice?.kind === 'error';
    const hasPreviewSteps =
      !!goalGuidancePlan &&
      goalGuidancePlan.status === 'preview' &&
      goalGuidancePlan.steps.length > 0 &&
      (goalGuidancePlan.feasibilityStatus !== 'unrealistic' || goalGuidancePlan.cram) &&
      !hasGuidanceQuestionOrError;
    const isUnrealisticPreview =
      !!goalGuidancePlan &&
      goalGuidancePlan.status === 'preview' &&
      goalGuidancePlan.feasibilityStatus === 'unrealistic' &&
      !goalGuidancePlan.cram &&
      !hasGuidanceQuestionOrError;
    const isGoalGuidancePaused =
      !!goalGuidancePlan &&
      goalGuidancePlan.status === 'accepted' &&
      !!goalGuidancePlan.pausedUntilDate &&
      activeGuidanceActions.length === 0 &&
      goalGuidancePlan.completedStepIndexes.length < goalGuidancePlan.steps.length;
    const guidanceSteps = goalGuidancePlan?.steps || [];
    const isClarifyingPreview =
      !!goalGuidancePlan &&
      goalGuidancePlan.status === 'preview' &&
      goalGuidancePlan.steps.length === 0 &&
      !isUnrealisticPreview &&
      !hasGuidanceQuestionOrError;
    const lastAssistantMessage = isClarifyingPreview
      ? [...goalGuidanceConversation].reverse().find((m) => m.role === 'assistant')
      : undefined;
    const isGoalGuidanceAnswerView =
      !!goalGuidanceAnswerText &&
      !!goalGuidancePlan &&
      (goalGuidancePlan.status === 'accepted' || goalGuidancePlan.status === 'complete');
    const hasGoalGuidanceHistory = goalGuidanceConversation.length > 0;
    const overallProgress = goalGuidancePlan
      ? goalOverallProgressByTodoId.get(goalGuidancePlan.goalId)
      : undefined;
    const shouldShowGoalGuidanceOverallProgress =
      !!overallProgress &&
      !!goalGuidancePlan &&
      (goalGuidancePlan.status === 'accepted' || goalGuidancePlan.status === 'complete') &&
      guidanceSteps.length > 0;
    const goalGuidanceOverallRatio = overallProgress?.ratio ?? 0;
    const goalGuidanceCompletedSteps = goalGuidancePlan?.status === 'complete'
      ? guidanceSteps.length
      : goalGuidancePlan?.completedStepIndexes.length || 0;
    const goalGuidanceChecklistRatio = guidanceSteps.length
      ? goalGuidanceCompletedSteps / guidanceSteps.length
      : 0;
    const nextGoalGuidanceStepIndex = guidanceSteps.findIndex((_, index) =>
      !(goalGuidancePlan?.completedStepIndexes || []).includes(index)
    );
    const quotaBehavior = selectedTodoForDetails?.workspace === 'Goals' ? selectedQuotaBehavior : null;
    const isGoalQuotaPlan =
      !!quotaBehavior &&
      !!goalGuidancePlan &&
      (goalGuidancePlan.status === 'accepted' || goalGuidancePlan.status === 'complete');
    const quotaScheduledAction = isGoalQuotaPlan ? activeGuidanceActions[0] : undefined;
    const quotaScheduledTodo = quotaScheduledAction
      ? localTodos.find((todo) => todo.id === quotaScheduledAction.todoId)
      : undefined;
    const quotaScheduledDate = quotaScheduledTodo?.dueDate || (quotaScheduledAction?.dueDate ? new Date(quotaScheduledAction.dueDate) : null);
    const isQuotaScheduledForToday = !!quotaScheduledDate && isToday(quotaScheduledDate);
    const isQuotaScheduledFuture = !!quotaScheduledDate && !isQuotaScheduledForToday;
    const hasQuotaRemaining = !!quotaBehavior && !isGoalQuotaComplete(quotaBehavior);
    const isQuotaWaitingForTomorrow =
      !!quotaBehavior &&
      quotaBehavior.unitType === 'distinct_days' &&
      isSameLocalGoalDay(quotaBehavior.lastCompletedDate) &&
      !quotaScheduledAction &&
      hasQuotaRemaining;
    const quotaNextTitle = quotaBehavior
      ? getGoalQuotaActionTitle(quotaBehavior, guidanceSteps[0]?.title || selectedTodoForDetails?.text || 'Action')
      : '';
    const quotaDoTodayLabel =
      quotaBehavior?.unitType === 'count' && isSameLocalGoalDay(quotaBehavior.lastCompletedDate)
        ? 'Do another today'
        : 'Do today';
    const quotaPickDateLabel = isQuotaScheduledFuture ? 'Reschedule' : 'Pick a date';
    const activeActionsToRender =
      isGoalQuotaPlan && !isQuotaScheduledForToday
        ? []
        : activeGuidanceActions;

    return (
      <>
        {!isGoalGuidanceActionDetails && (
          <LinearGradient
            colors={GOAL_GUIDANCE_CARD_GRADIENT}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.detailsModalGradientCard}
          >
            <View style={styles.goalGuidanceSectionHeader}>
              <View style={styles.detailsModalMetaLead}>
                <Text style={[styles.detailsModalMetaLabel, styles.goalGuidanceCardTitle]}>Actions</Text>
              </View>
              {goalGuidancePlan?.status === 'accepted' && (
                <Text style={styles.goalGuidancePill}>{getGoalGuidanceDayLabel(goalGuidancePlan)}</Text>
              )}
            </View>

            {isGoalQuotaPlan && quotaBehavior && (
              <View style={styles.goalGuidanceOverallProgress}>
                <View style={styles.goalGuidanceOverallProgressHeader}>
                  <Text style={styles.goalGuidanceOverallProgressText}>Quota progress</Text>
                  <Text style={styles.goalGuidanceOverallProgressText}>
                    {getGoalQuotaProgressLabel(quotaBehavior)}
                  </Text>
                </View>
                <View style={styles.goalGuidanceOverallProgressTrack}>
                  <View
                    style={[
                      styles.goalGuidanceOverallProgressFill,
                      { width: `${Math.round((quotaBehavior.completedCount / Math.max(quotaBehavior.targetCount, 1)) * 100)}%` },
                    ]}
                  />
                </View>
              </View>
            )}

            {!isGoalQuotaPlan && shouldShowGoalGuidanceOverallProgress && (
              <View style={styles.goalGuidanceOverallProgress}>
                <View style={styles.goalGuidanceOverallProgressHeader}>
                  <Text style={styles.goalGuidanceOverallProgressText}>Overall progress</Text>
                  <Text style={styles.goalGuidanceOverallProgressText}>
                    {Math.round(goalGuidanceOverallRatio * 100)}%
                  </Text>
                </View>
                <View style={styles.goalGuidanceOverallProgressTrack}>
                  <View
                    style={[
                      styles.goalGuidanceOverallProgressFill,
                      { width: `${Math.round(goalGuidanceOverallRatio * 100)}%` },
                    ]}
                  />
                </View>
              </View>
            )}

            {!goalGuidancePlan && (
              <GuidanceMarkdown>No actions yet. Create a plan to add actions.</GuidanceMarkdown>
            )}

            {goalGuidancePlan?.status === 'preview' && goalGuidancePlan.steps.length > 0 && (
              <GuidanceMarkdown>No actions yet. Accept the plan to add actions.</GuidanceMarkdown>
            )}

            {isClarifyingPreview && (
              <GuidanceMarkdown>No actions yet.</GuidanceMarkdown>
            )}

            {goalGuidancePlan?.status === 'complete' && (
              <GuidanceMarkdown>All guidance actions are complete.</GuidanceMarkdown>
            )}

            {isGoalGuidancePaused && (
              <View>
                <Text style={styles.goalGuidanceStepTitle}>All done for today</Text>
                <GuidanceMarkdown>Your next actions will appear after midnight. You can pull them into today if you want to keep going.</GuidanceMarkdown>
                <TouchableOpacity
                  style={[styles.goalGuidanceButton, isRecreatingGoalGuidanceAction && styles.actionButtonDisabled]}
                  onPress={handleRecreateGoalGuidanceAction}
                  disabled={isRecreatingGoalGuidanceAction}
                  activeOpacity={0.82}
                >
                  <Text style={styles.goalGuidanceButtonText}>
                    {isRecreatingGoalGuidanceAction ? 'Adding...' : 'Do more today'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {isGoalQuotaPlan && quotaBehavior && goalGuidancePlan?.status === 'accepted' && hasQuotaRemaining && !isQuotaScheduledForToday && (
              <View>
                <Text style={styles.goalGuidanceStepTitle}>
                  {isQuotaScheduledFuture ? getGoalQuotaScheduledLabel(quotaScheduledDate) : quotaNextTitle}
                </Text>
                {isQuotaScheduledFuture ? (
                  <GuidanceMarkdown>{quotaNextTitle}</GuidanceMarkdown>
                ) : isQuotaWaitingForTomorrow ? (
                  <GuidanceMarkdown>Your next day will be available tomorrow.</GuidanceMarkdown>
                ) : (
                  <GuidanceMarkdown>Choose when to do the next action.</GuidanceMarkdown>
                )}
                {!isQuotaWaitingForTomorrow && (
                  <>
                    <GuidancePrimaryButton
                      onPress={() => handleScheduleGoalQuotaAction(startOfDay(new Date()))}
                      disabled={isSchedulingGoalQuotaAction}
                    >
                      {isSchedulingGoalQuotaAction ? 'Adding...' : quotaDoTodayLabel}
                    </GuidancePrimaryButton>
                    <GuidancePrimaryButton
                      onPress={() => {
                        setPendingGoalQuotaDate(startOfDay(quotaScheduledDate || new Date()));
                        setIsGoalQuotaDatePickerVisible(true);
                      }}
                      disabled={isSchedulingGoalQuotaAction}
                    >
                      {quotaPickDateLabel}
                    </GuidancePrimaryButton>
                  </>
                )}
              </View>
            )}

            {goalGuidancePlan?.status === 'accepted' && activeActionsToRender.length > 0 && (
              <View style={styles.goalGuidanceActionBlock}>
                {activeActionsToRender.map((action) => {
                const step = goalGuidancePlan.steps[action.stepIndex];
                const actionTodo = localTodos.find((todo) => todo.id === action.todoId);
                if (!step) {
                  return null;
                }
                const youtubeQuery = getGoalGuidanceYoutubeSearchQuery(step);
                const youtubeUrl = youtubeQuery
                  ? `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeQuery)}`
                  : undefined;
                const personalWorkspaceAppearance = getTodoWorkspaceAppearance('Personal');
                const personalTheme = getTheme(personalWorkspaceAppearance?.themeColor || BUILTIN_DEFAULTS.Personal.color);
                const isActionCompleting =
                  isGoalGuidanceActionTransitioning ||
                  completingTodoId === action.todoId;
                const isCurrentDetailsTodo = selectedTodoForDetails?.id === action.todoId;
                const canOpenActionDetails = !!actionTodo && !isCurrentDetailsTodo && !isActionCompleting;
                const childProgress = goalChildPlanProgressByTodoId.get(action.todoId);
                const childProgressRatio = childProgress
                  ? childProgress.completed / Math.max(childProgress.total, 1)
                  : 0;

                return (
                  <TouchableOpacity
                    key={`active-guidance-${action.todoId}`}
                    onPress={() => {
                      if (canOpenActionDetails && actionTodo) {
                        handleTodoPress(actionTodo, { preserveDetailsBack: true });
                      }
                    }}
                    disabled={!canOpenActionDetails}
                    activeOpacity={canOpenActionDetails ? 0.82 : 1}
                  >
                    <TodoCardSurface
                      gradientColors={personalWorkspaceAppearance?.todoCardGradientColors || personalTheme.todoCardGradientColors}
                      strokeColor={personalWorkspaceAppearance?.todoCardStrokeColor || personalTheme.todoCardStrokeColor}
                    >
                      <View style={styles.goalGuidanceActionTodoTitleRow}>
                        <TouchableOpacity
                          onPress={(event) => {
                            event.stopPropagation();
                            if (actionTodo) {
                              toggleTodo(action.todoId);
                            }
                          }}
                          disabled={!actionTodo || isActionCompleting}
                          style={styles.goalGuidanceActionCompleteButton}
                        >
                          <Image
                            source={require('../../../assets/images/todo-personal-button.png')}
                            style={[
                              styles.goalGuidanceActionCompleteIcon,
                              (!actionTodo || isActionCompleting) && styles.goalGuidanceActionCompleteIconDisabled,
                            ]}
                          />
                        </TouchableOpacity>
                        <Text style={styles.goalGuidanceActionTodoTitle} numberOfLines={1}>{step.title}</Text>
                        {!!youtubeUrl && (
                          <TouchableOpacity
                            onPress={(event) => {
                              event.stopPropagation();
                              void Linking.openURL(youtubeUrl);
                            }}
                            style={styles.goalActionYoutubeButton}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            activeOpacity={0.72}
                          >
                            <MaterialCommunityIcons name="youtube" size={18} color={GOAL_GUIDANCE_ICON_COLOR} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.goalGuidanceActionTodoBody,
                          !step.details && styles.goalGuidanceActionTodoBodyEmpty,
                        ]}
                        numberOfLines={2}
                      >
                        {step.details || ' '}
                      </Text>
                      <View style={styles.goalGuidanceChildProgressSlot}>
                        {!!childProgress && (
                          <View style={styles.goalGuidanceChildProgress}>
                          <View style={styles.goalGuidanceChildProgressHeader}>
                            <Text style={styles.goalGuidanceChildProgressText}>
                              {childProgress.completed}/{childProgress.total} steps
                            </Text>
                            <Text style={styles.goalGuidanceChildProgressPill}>
                              {childProgress.status === 'complete'
                                ? 'Complete'
                                : 'In progress'}
                            </Text>
                          </View>
                          <View style={styles.goalGuidanceChildProgressTrack}>
                            <View
                              style={[
                                styles.goalGuidanceChildProgressFill,
                                { width: `${Math.round(childProgressRatio * 100)}%` },
                              ]}
                            />
                          </View>
                        </View>
                        )}
                      </View>
                    </TodoCardSurface>
                  </TouchableOpacity>
                );
                })}
              </View>
            )}
          </LinearGradient>
        )}

        <GuidedTarget
          targetId={getTodoControlGuidanceTargetId('tutorial-goal-question')}
          label="Guidance question"
          localHighlightVisible={false}
        >
          <LinearGradient
            colors={GOAL_GUIDANCE_CARD_GRADIENT}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.detailsModalGradientCard}
            onLayout={(event) => {
              goalGuidanceSectionYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <View>
            <View style={styles.goalGuidanceSectionHeader}>
              <View style={styles.detailsModalMetaLead}>
                <Text style={[styles.detailsModalMetaLabel, styles.goalGuidanceCardTitle]}>Guidance</Text>
              </View>
              {isGoalGuidanceAnswerView ? (
                <TouchableOpacity
                  style={styles.goalGuidanceReturnButton}
                  onPress={returnToGoalGuidancePlan}
                  activeOpacity={0.82}
                >
                  <Text style={styles.goalGuidanceReturnButtonText}>Return to plan</Text>
                </TouchableOpacity>
              ) : (
                isGoalGuidanceRunning && <ActivityIndicator size="small" color="#165C53" />
              )}
            </View>

            {isGoalGuidanceAnswerView && (
              <>
                <GuidanceMarkdown>{goalGuidanceAnswerText}</GuidanceMarkdown>
                {hasPendingGoalGuidancePlanChange && (
                  <GuidancePrimaryButton
                    onPress={applyPendingGoalGuidancePlanChange}
                    disabled={isGoalGuidanceRunning}
                    attention
                  >
                    Change plan
                  </GuidancePrimaryButton>
                )}
              </>
            )}

            {!isGoalGuidanceAnswerView &&
              !!goalGuidanceNotice &&
              (goalGuidanceNotice.kind !== 'toast' || !goalGuidancePlan) && (
                <Text
                  style={[
                    styles.goalGuidanceNotice,
                    goalGuidanceNotice.kind === 'error' && styles.goalGuidanceErrorText,
                  ]}
                >
                  {goalGuidanceNotice.kind === 'clarify'
                    ? `${goalGuidanceNotice.message}\n\n${GUIDANCE_REPLY_INSTRUCTION}`
                    : goalGuidanceNotice.message}
                </Text>
              )}

            {!isGoalGuidanceAnswerView && isClarifyingPreview && !goalGuidanceNotice && (
              <GuidanceMarkdown>{`${lastAssistantMessage?.content || 'Guidance needs one more answer.'}\n\n${GUIDANCE_REPLY_INSTRUCTION}`}</GuidanceMarkdown>
            )}

            {!isGoalGuidanceAnswerView && isSelectedGoalBehaviorPending && !goalGuidancePlan && (
              <Text style={styles.goalGuidanceNotice}>
                Getting this goal ready...
              </Text>
            )}

            {!isGoalGuidanceAnswerView && !isSelectedGoalBehaviorPending && !goalGuidancePlan && !goalGuidanceNotice && (
              <Text style={styles.goalGuidanceNotice}>
                Getting steps...
              </Text>
            )}

            {!isGoalGuidanceAnswerView && isUnrealisticPreview && (
              <>
                <Text style={styles.goalGuidanceStepTitle}>This needs more time</Text>
                <GuidanceMarkdown>{goalGuidancePlan.feasibilityNote}</GuidanceMarkdown>
                {!!goalGuidancePlan.alternativeSuggestion && (
                  <GuidanceMarkdown>{goalGuidancePlan.alternativeSuggestion}</GuidanceMarkdown>
                )}
                {goalGuidancePlan.timeframe === 'thisWeek' &&
                  (!goalGuidanceAlternative?.timeframe || goalGuidanceAlternative.timeframe === 'thisMonth') && (
                    <TouchableOpacity
                      style={styles.goalGuidanceButton}
                      onPress={handleUseMonthlyGoalGuidance}
                      disabled={isGoalGuidanceRunning}
                      activeOpacity={0.82}
                    >
                      <Text style={styles.goalGuidanceButtonText}>Change to monthly goal</Text>
                    </TouchableOpacity>
                  )}
                <TouchableOpacity
                  style={styles.goalGuidanceButton}
                  onPress={handleRequestGoalGuidanceCram}
                  disabled={isGoalGuidanceRunning}
                  activeOpacity={0.82}
                >
                  <Text style={styles.goalGuidanceButtonText}>Try anyway</Text>
                </TouchableOpacity>
              </>
            )}

            {!isGoalGuidanceAnswerView && hasPreviewSteps && (
              <>
                <GuidanceMarkdown>{goalGuidancePlan.feasibilityNote}</GuidanceMarkdown>
                {!!selectedQuotaBehavior && (
                  <GuidanceMarkdown>{getGoalQuotaInstructionText(selectedQuotaBehavior)}</GuidanceMarkdown>
                )}
                {guidanceSteps.map((step, index) => (
                  <View key={`guidance-preview-${index}`} style={styles.goalGuidanceStepRow}>
                    <Text style={styles.goalGuidanceStepIndex}>{index + 1}</Text>
                    <View style={styles.goalGuidanceStepTextGroup}>
                      <GuidanceSelectableText inputStyle={styles.goalGuidanceStepTitle}>{step.title}</GuidanceSelectableText>
                      {!!step.details && <GuidanceMarkdown>{step.details}</GuidanceMarkdown>}
                    </View>
                  </View>
                ))}
                <View
                  style={styles.guidedAcceptPlanOuter}
                  onLayout={(event) => {
                    goalAcceptPlanButtonYRef.current = event.nativeEvent.layout.y;
                  }}
                >
                  <GuidedTarget
                    targetId={getTodoControlGuidanceTargetId('tutorial-goal-accept-plan')}
                    label="Accept plan"
                    localHighlightShape="rect"
                    localHighlightRadius={999}
                    localHighlightInset={2}
                    localHighlightPulseScale={1.03}
                    style={styles.guidedAcceptPlanTarget}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.goalGuidanceGetStepsButton,
                        styles.tutorialAcceptPlanButton,
                        pressed && styles.goalGuidancePressedButton,
                      ]}
                      onPress={handleAcceptGoalGuidancePlan}
                    >
                      <LinearGradient
                        colors={['#0A9881', '#04473C']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.goalGuidanceGetStepsButtonGradient}
                      >
                        <Text style={styles.goalGuidanceGetStepsButtonText}>Accept plan</Text>
                      </LinearGradient>
                    </Pressable>
                  </GuidedTarget>
                </View>
              </>
            )}

            {!isGoalGuidanceAnswerView && (goalGuidancePlan?.status === 'accepted' || goalGuidancePlan?.status === 'complete') && (
              isGoalGuidanceActionDetails ? (
                <View style={styles.recipeGuideBlock}>
                  {!!goalGuidancePlan.feasibilityNote && (
                    <GuidanceMarkdown>{goalGuidancePlan.feasibilityNote}</GuidanceMarkdown>
                  )}
                  <View style={styles.recipeProgressBlock}>
                    <View style={styles.goalGuidanceOverallProgressHeader}>
                      <Text style={styles.goalGuidanceOverallProgressText}>
                        Step progress {Math.round(goalGuidanceChecklistRatio * 100)}%
                      </Text>
                      <Text style={styles.goalGuidanceOverallProgressText}>
                        {goalGuidanceCompletedSteps}/{guidanceSteps.length}
                      </Text>
                    </View>
                    <View style={styles.goalGuidanceOverallProgressTrack}>
                      <View
                        style={[
                          styles.goalGuidanceOverallProgressFill,
                          { width: `${Math.round(goalGuidanceChecklistRatio * 100)}%` },
                        ]}
                      />
                    </View>
                  </View>
                  {guidanceSteps.map((step, index) => {
                    const isStepCompleted =
                      goalGuidancePlan.status === 'complete' ||
                      goalGuidancePlan.completedStepIndexes.includes(index);
                    const isActiveStep =
                      goalGuidancePlan.status === 'accepted' &&
                      index === nextGoalGuidanceStepIndex;
                    const youtubeQuery = getGoalGuidanceYoutubeSearchQuery(step);
                    const youtubeUrl = youtubeQuery
                      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeQuery)}`
                      : undefined;

                    return (
                      <View
                        key={`guidance-step-${index}`}
                        style={[
                          styles.recipeStepRow,
                          isActiveStep && styles.recipeStepRowActive,
                          isStepCompleted && styles.recipeStepRowCompleted,
                        ]}
                      >
                        <GoalGuidanceStepCheckButton
                          checked={isStepCompleted}
                          onPress={(event) => {
                            event.stopPropagation();
                            void toggleGoalGuidanceStepCompleted(index);
                          }}
                        />
                        <View style={styles.goalGuidanceStepTextGroup}>
                          <View style={styles.recipeStepTitleRow}>
                            <GuidanceSelectableText
                              inputStyle={[
                                styles.goalGuidanceStepTitle,
                                isStepCompleted && styles.recipeStepTextCompleted,
                              ]}
                            >
                              {step.title}
                            </GuidanceSelectableText>
                            {!!youtubeUrl && (
                              <TouchableOpacity
                                onPress={(event) => {
                                  event.stopPropagation();
                                  void Linking.openURL(youtubeUrl);
                                }}
                                style={styles.goalActionYoutubeButton}
                                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                activeOpacity={0.72}
                              >
                                <MaterialCommunityIcons name="youtube" size={18} color={GOAL_GUIDANCE_ICON_COLOR} />
                              </TouchableOpacity>
                            )}
                          </View>
                          {!!step.details && (
                            <View style={isStepCompleted && styles.recipeStepBodyCompleted}>
                              <GuidanceMarkdown>{step.details}</GuidanceMarkdown>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : isGoalQuotaPlan && quotaBehavior ? (
                <>
                  {!!goalGuidancePlan.feasibilityNote && (
                    <GuidanceMarkdown>{goalGuidancePlan.feasibilityNote}</GuidanceMarkdown>
                  )}
                  <GuidanceMarkdown>{getGoalQuotaInstructionText(quotaBehavior)}</GuidanceMarkdown>
                  <View style={styles.recipeProgressBlock}>
                    <View style={styles.goalGuidanceOverallProgressHeader}>
                      <Text style={styles.goalGuidanceOverallProgressText}>Quota progress</Text>
                      <Text style={styles.goalGuidanceOverallProgressText}>
                        {getGoalQuotaProgressLabel(quotaBehavior)}
                      </Text>
                    </View>
                    <View style={styles.goalGuidanceOverallProgressTrack}>
                      <View
                        style={[
                          styles.goalGuidanceOverallProgressFill,
                          { width: `${Math.round((quotaBehavior.completedCount / Math.max(quotaBehavior.targetCount, 1)) * 100)}%` },
                        ]}
                      />
                    </View>
                  </View>
                  {!!guidanceSteps[0] && (
                    <View style={styles.goalGuidanceStepRow}>
                      <Text style={styles.goalGuidanceStepIndex}>1</Text>
                      <View style={styles.goalGuidanceStepTextGroup}>
                        <GuidanceSelectableText inputStyle={styles.goalGuidanceStepTitle}>{guidanceSteps[0].title}</GuidanceSelectableText>
                        {!!guidanceSteps[0].details && <GuidanceMarkdown>{guidanceSteps[0].details}</GuidanceMarkdown>}
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <>
                {!!goalGuidancePlan.feasibilityNote && (
                  <GuidanceMarkdown>{goalGuidancePlan.feasibilityNote}</GuidanceMarkdown>
                )}
                {guidanceSteps.map((step, index) => {
                  const isStepCompleted =
                    goalGuidancePlan.status === 'complete' ||
                    goalGuidancePlan.completedStepIndexes.includes(index);
                  const isActiveStep =
                    goalGuidancePlan.status === 'accepted' &&
                    activeGuidanceActions.some((action) => action.stepIndex === index);

                  return (
                    <View
                      key={`guidance-step-${index}`}
                      style={[
                        styles.recipeStepRow,
                        isActiveStep && styles.recipeStepRowActive,
                        isStepCompleted && styles.recipeStepRowCompleted,
                      ]}
                    >
                      <GoalGuidanceStepCheckButton
                        checked={isStepCompleted}
                        onPress={(event) => {
                          event.stopPropagation();
                          void toggleGoalGuidanceStepCompleted(index);
                        }}
                      />
                      <View style={styles.goalGuidanceStepTextGroup}>
                        <GuidanceSelectableText
                          inputStyle={[
                            styles.goalGuidanceStepTitle,
                            isStepCompleted && styles.recipeStepTextCompleted,
                          ]}
                        >
                          {step.title}
                        </GuidanceSelectableText>
                        {!!step.details && (
                          <View style={isStepCompleted && styles.recipeStepBodyCompleted}>
                            <GuidanceMarkdown>{step.details}</GuidanceMarkdown>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
                </>
              )
            )}
            </View>
          </LinearGradient>
        </GuidedTarget>

        {hasGoalGuidanceHistory && (
          <LinearGradient
            colors={GOAL_GUIDANCE_CARD_GRADIENT}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.detailsModalGradientCard}
          >
            <TouchableOpacity
              style={[styles.goalGuidanceSectionHeader, styles.goalGuidanceHistoryToggle]}
              onPress={() => setIsGoalGuidanceHistoryExpanded((isExpanded) => !isExpanded)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Toggle guidance history"
              accessibilityState={{ expanded: isGoalGuidanceHistoryExpanded }}
            >
              <View style={styles.detailsModalMetaLead}>
                <Text style={[styles.detailsModalMetaLabel, styles.goalGuidanceCardTitle]}>Guidance history</Text>
              </View>
              <Ionicons
                name={isGoalGuidanceHistoryExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#E8FFFA"
              />
            </TouchableOpacity>
            {isGoalGuidanceHistoryExpanded && (
              <View style={styles.goalGuidanceConversation}>
                {goalGuidanceConversation.map((message, index) => (
                  <View
                    key={`goal-guidance-history-${index}-${message.role}`}
                    style={[
                      styles.goalGuidanceMessage,
                      message.role === 'user' && styles.goalGuidanceUserMessage,
                    ]}
                  >
                    <Text style={styles.goalGuidanceMessageLabel}>
                      {message.role === 'user' ? 'You' : 'Guidance'}
                    </Text>
                    <GuidanceMarkdown>{message.content}</GuidanceMarkdown>
                  </View>
                ))}
              </View>
            )}
          </LinearGradient>
        )}
      </>
    );
  };

  const goalGuidancePlanStatusRef = useRef<string | null>(null);
  goalGuidancePlanStatusRef.current = goalGuidancePlan?.status ?? null;

  // Tutorial "back": rebuild the screen for an earlier step (tab, open item, workspace,
  // and the demo item's guidance choice), then show that step. What the user made
  // along the way (accepted goal actions, events) is kept; those steps can move on.
  restoreTodoTutorialStepRef.current = (step) => {
    const uid = user?.uid || '';
    const demoTodoId = tutorialTodoIdRef.current;
    const goalId = tutorialGoalTodoIdRef.current;

    const ensureTodoPartActive = () => {
      if (isTodoGuidanceTutorialPendingRef.current) return;
      isTodoGuidanceTutorialPendingRef.current = true;
      setIsTodoGuidanceTutorialPending(true);
      isGoalGuidanceTutorialPendingRef.current = false;
      setIsGoalGuidanceTutorialPending(false);
      goalGuidanceTutorialStageRef.current = null;
      if (uid) void uncompleteTutorialStep(uid, TUTORIAL_TODO_GUIDANCE_STEP);
    };
    const ensureGoalPartActive = () => {
      if (isGoalGuidanceTutorialPendingRef.current) return;
      isGoalGuidanceTutorialPendingRef.current = true;
      setIsGoalGuidanceTutorialPending(true);
      if (uid) void uncompleteTutorialStep(uid, TUTORIAL_GOAL_GUIDANCE_STEP);
    };
    const closeDetails = () => {
      if (isDetailsModalVisible) resetDetailsModalStateRef.current();
    };
    // Opens the item's details (switching workspace), then shows the step once its
    // buttons are on screen.
    const openThen = (todoId: string | null, show: () => void) => {
      if (todoId && !(isDetailsModalVisible && selectedTodoForDetails?.id === todoId)) {
        closeDetails();
        queueFocusedTodoOpen(todoId);
        setTimeout(show, 450);
        return;
      }
      show();
    };
    const resetDemoTodoChoice = async (todoId: string) => {
      await Promise.all([
        deleteTaskGuidesForTodos([todoId]),
        deleteSkillGuidesForTodos([todoId]),
        deleteRecipeGuidesForTodos([todoId]),
      ]).catch((error) => console.warn('Failed to reset tutorial guidance', error));
      await updateTodo(todoId, { guidancePath: null }).catch(() => {});
      updateTodoStateEverywhere(todoId, { guidancePath: null });
      setTaskGuide(null);
      setSkillGuide(null);
      setRecipeGuide(null);
      setIsTaskGuidanceAiActive(false);
      setIsSkillGuidanceAiActive(false);
      setIsRecipeGuidanceAiActive(false);
      autoRequestedTaskGuidanceRef.current = null;
    };
    const resetGoalChoice = async (todoId: string) => {
      await deleteGoalGuidanceForGoal(todoId).catch((error) => console.warn('Failed to reset tutorial goal plan', error));
      await updateTodo(todoId, { guidancePath: null }).catch(() => {});
      updateTodoStateEverywhere(todoId, { guidancePath: null });
      setGoalGuidancePlan(null);
      setGoalGuidanceParentPlan(null);
      setGoalGuidanceAlternative(null);
      setPendingGoalGuidanceTitle(null);
      setIsGoalGuidanceAiActive(false);
      setGoalGuidanceInputValue('');
      clearGoalGuidanceNotice();
      hasShownGoalTutorialQuestionIntroRef.current = false;
      autoRequestedGoalGuidanceRef.current = null;
    };

    showGuidanceTab('todo');
    switch (step) {
      case 'demo-task':
        // The demo task's own effect points back at it once its details close.
        todoGuidanceTutorialStageRef.current = 'actions';
        closeDetails();
        return;
      case 'choice':
        if (!demoTodoId) return;
        void resetDemoTodoChoice(demoTodoId).then(() => showTodoGuidanceTutorialStage('choice'));
        return;
      case 'pick-video':
        if (!demoTodoId) return;
        void Promise.all([deleteSkillGuidesForTodos([demoTodoId]), deleteRecipeGuidesForTodos([demoTodoId])])
          .catch(() => {})
          .then(() => {
            setSkillGuide(null);
            setRecipeGuide(null);
            showTodoGuidanceTutorialStage('pick-video');
          });
        return;
      case 'accept-plan':
        ensureTodoPartActive();
        openThen(demoTodoId, () => {
          if (!demoTodoId) return;
          // Undo the accept, so the plan is a preview with its Accept button again.
          void fetchTaskGuideForTodo(demoTodoId).then(async (guide) => {
            if (guide && guide.status !== 'preview') {
              const saved = await saveTaskGuide({
                todoId: guide.todoId,
                steps: guide.steps.map((item) => ({ ...item, completed: false })),
                activeStepIndex: 0,
                status: 'preview',
                errorMessage: '',
              });
              handleTaskGuideSaved(saved);
            }
          }).catch((error) => console.warn('Failed to restore tutorial plan', error))
            .finally(() => showTodoGuidanceTutorialStage('accept-plan'));
        });
        return;
      case 'video-ready':
        ensureTodoPartActive();
        openThen(demoTodoId, () => showTodoGuidanceTutorialStage('video-ready'));
        return;
      case 'goal-handoff-back':
        ensureGoalPartActive();
        openThen(demoTodoId, () => showGoalGuidanceTutorialStage('handoff-back'));
        return;
      case 'goal-workspace':
        ensureGoalPartActive();
        closeDetails();
        goToWorkspaceKey('Personal');
        showGoalWorkspaceSwipeGuidance();
        return;
      case 'goal-timeframes':
        ensureGoalPartActive();
        closeDetails();
        goToWorkspaceKey('Goals');
        showGoalGuidanceTutorialStage('timeframes');
        return;
      case 'goal-target':
        ensureGoalPartActive();
        closeDetails();
        goToWorkspaceKey('Goals');
        startGoalTutorialTarget();
        return;
      case 'goal-actions':
        ensureGoalPartActive();
        if (!goalId) return;
        // Stage set first, so the goal's own effect doesn't show it a second time.
        goalGuidanceTutorialStageRef.current = 'actions';
        void resetGoalChoice(goalId).then(() => {
          openThen(goalId, () => showGoalGuidanceTutorialStage('actions'));
        });
        return;
      case 'goal-ai-bar':
        if (!goalGuidanceInputValue.trim()) setGoalGuidanceInputValue(TUTORIAL_GOAL_GUIDANCE_REPLY);
        showGoalGuidanceTutorialStage('ai-bar');
        return;
      case 'goal-summary':
        ensureGoalPartActive();
        openThen(goalId, () => showGoalGuidanceTutorialStage('summary'));
        return;
    }
  };

  return (
    <GestureHandlerRootView className="flex-1">
      {isFocused && (
        <StatusBar
          style={currentTheme.isDark ? 'light' : 'dark'}
          backgroundColor="transparent"
          translucent
        />
      )}
      <LinearGradient
        className="flex-1 px-4"
        style={{ paddingBottom: aiInputSpacer, minHeight: Dimensions.get('screen').height }}
        colors={currentWorkspaceAppearance?.overallGradientColors || currentTheme.gradientColors || [currentTheme.overallBg, currentTheme.overallBg]}
        start={currentWorkspaceAppearance?.overallGradientStart || currentTheme.gradientStart || { x: 0, y: 0 }}
        end={currentWorkspaceAppearance?.overallGradientEnd || currentTheme.gradientEnd || { x: 0, y: 1 }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -24,
            left: -12,
            right: -12,
            bottom: -24,
            zIndex: 11,
          }}
        >
          <Image
            source={require('../../../assets/images/todo-water.png')}
            style={{
              width: '100%',
              height: '100%',
              opacity: 0.055,
            }}
            resizeMode="cover"
          />
        </View>
        {showUndo && <UndoNotification />}
        <ScreenHeader
          title={screenTitle}
          titleColor={currentWorkspaceAppearance?.headerTitleColor || currentTheme.headerTitleColor}
          horizontalPadding={0}
          left={isLeftHanded ? todoSearchHeaderButton : undefined}
          right={isLeftHanded ? undefined : todoSearchHeaderButton}
          /*
          right={workspaces[currentWorkspace]?.key !== 'Wishlist' ? (
            <TouchableOpacity
              onPress={() => setIsOptionsMenuVisible(true)}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Ionicons name="menu" size={26} color={currentWorkspaceAppearance?.headerMenuColor || currentTheme.headerMenuColor} />
            </TouchableOpacity>
          ) : undefined}
          */
        />
        <TodoSearchBar
          isVisible={isTodoSearchVisible}
          query={todoSearchQuery}
          accentColor={currentWorkspaceAppearance?.headerTitleColor || currentTheme.headerTitleColor}
          inactiveColor={currentWorkspaceAppearance?.headerMenuColor || currentTheme.headerMenuColor}
          backgroundColor={currentWorkspaceAppearance?.workspaceShellColor || 'rgba(5, 45, 39, 0.72)'}
          style={styles.todoSearchBarFrame}
          onChangeQuery={setTodoSearchQuery}
          onToggle={() => setIsTodoSearchVisible((visible) => !visible)}
        />
        <TodoWorkspaceTabs workspaces={workspaces} activeIndex={currentWorkspace} onSelect={handleDotPress} />
        {showSwipeHint && (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: '95%', // Moved lower to be more visible
                left: '80%',
                transform: [
                  {
                    translateX: swipeAnimValue.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, -50], // Consistent left-to-right swipe
                    }),
                  },
                  {
                    translateY: -25,
                  },
                ],
                opacity: swipeAnimValue.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, 1, 0],
                }),
                zIndex: 1000,
              },
            ]}
          >
            <View
              style={{
                backgroundColor: 'rgba(34, 171, 147, 0.8)',
                borderRadius: 20,
                padding: 15,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Ionicons name="arrow-back" size={24} color="white" />
            </View>
          </Animated.View>
        )}
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
              opacity: 1.0,
            }}
            resizeMode="contain"
          />
        </View>
        <PagerView
          ref={pagerViewRef}
          className="flex-1 w-full"
          initialPage={0}
          offscreenPageLimit={1}
          onPageSelected={(e) => animateWorkspaceChange(e.nativeEvent.position)}
        >
          {workspaces.map((w, index) => (
            Math.abs(index - currentWorkspace) <= 1
              ? renderWorkspace(w.key, index)
              : <View key={`workspace-${w.key}`} style={styles.workspaceContainer} />
          ))}
        </PagerView>
        <ActionSheet
          ref={bottomSheetRef}
          keyboardHandlerEnabled={true}
          defaultOverlayOpacity={0.3}
          gestureEnabled={true}
          closeOnTouchBackdrop={true}
          snapPoints={[100]}
          containerStyle={styles.todoComposerSheet}
        >
          <TodoComposer
            key={composerKey}
            initialTodo={composerInitialTodo}
            hideDateChip={isComposerForToday}
            isLeftHanded={isLeftHanded}
            weekStartsOn={weekStartsOn}
            onSave={saveTodo}
          />
        </ActionSheet>
      </LinearGradient>
      {isAiComposerActive && !isDetailsModalVisible && (
        <TouchableWithoutFeedback
          onPress={() => {
            if (isAiComposerActive) {
              Keyboard.dismiss();
            }
          }}
        >
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 }}>
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(4, 10, 14, 0.48)' }} />
          </View>
        </TouchableWithoutFeedback>
      )}
      {!isDetailsModalVisible && (
        <LowerSwipeGesture
          currentTab="todo"
          currentWorkspaceKey={currentWorkspaceKey}
          workspaceKeys={workspaceKeys}
          onTodoWorkspaceTarget={goToWorkspaceKey}
          disabled={isTodoSwipeDisabled}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            // Tall only while a notice card or the keyboard needs it; otherwise it would
            // sit over the list's Create button and swallow its taps.
            height: aiNotice || isAiComposerActive || isKeyboardVisible
              ? todoSwipeBandHeight
              : todoDetailsSwipeBandHeight,
            zIndex: 70,
            elevation: 70,
          }}
        >
          <CompactAiBanner
            notice={aiNotice}
            surface="todo"
            bottom={aiInputKeyboardBottom + 76}
            translateY={aiInputKeyboardTranslateY}
            onActionPress={handleCompactNoticeAction}
            onDismissPress={dismissNotice}
            onCancelPress={cancelPending}
          />
          <Animated.View
            pointerEvents={goalWishlistSuggestionToast ? 'none' : 'auto'}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: aiInputKeyboardBottom,
              transform: [{
                translateY: aiInputKeyboardTranslateY,
              }],
            }}
          >
            <AIInputBox
              textInput={inputValue}
              isListening={isCompactListening}
              microphoneColor={compactMicrophoneColor}
              glowAnim={glowAnim}
              placeholder={aiNotice?.kind === 'clarify' || aiNotice?.kind === 'confirm' ? 'Reply here' : ''}
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
              onSendPress={handleTodoAiSendPress}
              returnKeyType="default"
              blurOnSubmit={false}
              onFocus={() => {
                setIsAiInputFocused(true);
                setIsAiKeyboardSessionActive(true);
              }}
              onBlur={() => setIsAiInputFocused(false)}
              onTextInputPress={() => {}}
              onMicrophonePress={handleTodoAiMicrophonePress}
              microphoneSide={isLeftHanded ? 'left' : 'right'}
              surfaceVariant="todo"
              containerStyle={{ backgroundColor: 'transparent' }}
            />
          </Animated.View>
        </LowerSwipeGesture>
      )}
      {!isDetailsModalVisible && goalWishlistSuggestionToast ? (
        <GoalWishlistSuggestionToast
          goalTitle={goalWishlistSuggestionToast.goalTitle}
          suggestions={goalWishlistSuggestionToast.suggestions}
          selectedItemNames={goalWishlistSuggestionToast.selectedItemNames}
          isAdding={isAddingGoalWishlistSuggestions}
          isAdded={goalWishlistSuggestionToast.isAdded}
          bottom={aiInputKeyboardBottom + 76}
          showBackdrop
          zIndex={90}
          onToggleItem={toggleGoalWishlistSuggestionItem}
          onAddSelected={handleAddGoalWishlistSuggestionsToWishlist}
          onDismiss={dismissGoalWishlistSuggestionToast}
        />
      ) : null}
      {selectedTodoForDetails && isDetailsModalVisible && (
          <View style={styles.detailsModalRoot}>
            <LinearGradient
              style={styles.detailsModalBackground}
              colors={
                detailsScreenAppearance?.overallGradientColors ||
                detailsTheme.gradientColors ||
                [detailsTheme.overallBg, detailsTheme.overallBg]
              }
              start={detailsScreenAppearance?.overallGradientStart || detailsTheme.gradientStart || { x: 0, y: 0 }}
              end={detailsScreenAppearance?.overallGradientEnd || detailsTheme.gradientEnd || { x: 0, y: 1 }}
            >
              <View pointerEvents="none" style={styles.detailsModalWatermarkLayer}>
                <Image
                  source={require('../../../assets/images/todo-water.png')}
                  style={styles.detailsModalWatermark}
                  resizeMode="cover"
                />
              </View>
              <View pointerEvents="none" style={styles.detailsModalLogoLayer}>
                <Image
                  source={require('../../../assets/images/eazee-bg-screen.png')}
                  style={styles.detailsModalLogo}
                  resizeMode="contain"
                />
              </View>
            </LinearGradient>
            <View style={styles.detailsModalSafeArea}>
              <Animated.View
                style={[
                  styles.detailsModalContent,
                  {
                    opacity: detailsModalAnim,
                    paddingTop: detailsModalTopPadding,
                    paddingBottom: detailsModalBottomPadding,
                  },
                ]}
              >
                <View style={styles.detailsModalFrame}>
                  <View style={styles.detailsModalActionRow}>
                    <GuidedTarget
                      targetId={getTodoBackGuidanceTargetId()}
                      label="Back"
                      highlightWhenTargetIds={[getTodoControlGuidanceTargetId('tutorial-details-back')]}
                      localHighlightShape="rect"
                      localHighlightRadius={999}
                      localHighlightInset={4}
                    >
                      <LiquidGlassIconButton
                        debugLabel="todo:details:back"
                        onPress={handleDetailsBackPress}
                        size={42}
                        style={styles.detailsModalIconButton}
                        tintColor="rgba(4, 28, 24, 0.55)"
                        fallbackTint="dark"
                        fallbackBackgroundColor="rgba(4, 28, 24, 0.55)"
                        fallbackBorderColor="rgba(232, 255, 250, 0.22)"
                        hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                      >
                        <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
                      </LiquidGlassIconButton>
                    </GuidedTarget>
                  </View>

                  <Animated.View
                    style={[
                      styles.detailsModalShell,
                      {
                        backgroundColor: TODO_DETAILS_SHELL_COLOR,
                        maxHeight: detailsModalMaxHeight,
                        transform: [
                          { translateY: detailsModalTranslateY },
                          { scale: detailsModalScale },
                        ],
                      },
                    ]}
                  >
                    <ScrollViewWithBar
                      ref={detailsScrollRef}
                      contentContainerStyle={[
                        styles.detailsModalScrollContainer,
                        // Room to lift the Guidance path card above the tutorial card.
                        isTutorialGuidanceChoiceStep && { paddingBottom: 420 },
                      ]}
                    >
                      <View style={styles.detailsModalScrollContent}>
                      <View style={styles.detailsModalTitleRow}>
                        {isLeftHanded && selectedTodoForDetails.workspace === 'Wishlist' && (
                          buyingTodoId === selectedTodoForDetails.id ? (
                            <View className="px-2.5 py-1" style={{ minWidth: 44, alignItems: 'center', marginTop: 3 }}>
                              <ActivityIndicator size="small" color={detailsTheme.workspaceNameColor} />
                            </View>
                          ) : (
                            <TouchableOpacity
                              onPress={(event) => {
                                event.stopPropagation();
                                void handleBuyPress(selectedTodoForDetails);
                              }}
                              className="px-2.5 py-1 rounded shadow"
                              style={{
                                backgroundColor: detailsTheme.workspaceNameColor,
                                minWidth: 44,
                                alignItems: 'center',
                                marginTop: 3,
                              }}
                              activeOpacity={0.82}
                              accessibilityRole="button"
                              accessibilityLabel="Buy wishlist item"
                            >
                              <Text className="text-white text-xs font-bold">Buy</Text>
                            </TouchableOpacity>
                          )
                        )}
                        {isLeftHanded && shouldRevealDetailsWithButton && (
                          <TouchableOpacity
                            onPress={(event) => {
                              event.stopPropagation();
                              setDetailsInputExpandedAnimated(!isDetailsInputExpanded);
                            }}
                            style={[
                              styles.detailsRevealButton,
                              styles.detailsRevealButtonLeft,
                              isDetailsInputExpanded && styles.detailsRevealButtonExpanded,
                            ]}
                            activeOpacity={0.84}
                            accessibilityRole="button"
                            accessibilityLabel={isDetailsInputExpanded ? 'Hide details' : 'Show details'}
                            accessibilityState={{ expanded: isDetailsInputExpanded }}
                          >
                            <MaterialCommunityIcons
                              name="text-box-outline"
                              size={15}
                              color={isDetailsInputExpanded ? '#E8FFFA' : '#165C53'}
                            />
                            <Text
                              style={[
                                styles.detailsRevealButtonText,
                                isDetailsInputExpanded && styles.detailsRevealButtonTextExpanded,
                              ]}
                            >
                              {isDetailsInputExpanded ? 'Hide' : 'Details'}
                            </Text>
                            <Ionicons
                              name={isDetailsInputExpanded ? 'chevron-up' : 'chevron-down'}
                              size={14}
                              color={isDetailsInputExpanded ? '#E8FFFA' : '#165C53'}
                            />
                          </TouchableOpacity>
                        )}
                        <TextInput
                          style={styles.detailsModalTitle}
                          value={editedTodoTitle}
                          onChangeText={setEditedTodoTitle}
                          placeholder="Todo title"
                          placeholderTextColor="rgba(248, 240, 224, 0.6)"
                          multiline
                        />
                        {!isLeftHanded && selectedTodoForDetails.workspace === 'Wishlist' && (
                          buyingTodoId === selectedTodoForDetails.id ? (
                            <View className="ml-2.5 px-2.5 py-1" style={{ minWidth: 44, alignItems: 'center', marginTop: 3 }}>
                              <ActivityIndicator size="small" color={detailsTheme.workspaceNameColor} />
                            </View>
                          ) : (
                            <TouchableOpacity
                              onPress={(event) => {
                                event.stopPropagation();
                                void handleBuyPress(selectedTodoForDetails);
                              }}
                              className="px-2.5 py-1 rounded ml-2.5 shadow"
                              style={{
                                backgroundColor: detailsTheme.workspaceNameColor,
                                minWidth: 44,
                                alignItems: 'center',
                                marginTop: 3,
                              }}
                              activeOpacity={0.82}
                              accessibilityRole="button"
                              accessibilityLabel="Buy wishlist item"
                            >
                              <Text className="text-white text-xs font-bold">Buy</Text>
                            </TouchableOpacity>
                          )
                        )}
                        {!isLeftHanded && shouldRevealDetailsWithButton && (
                          <TouchableOpacity
                            onPress={(event) => {
                              event.stopPropagation();
                              setDetailsInputExpandedAnimated(!isDetailsInputExpanded);
                            }}
                            style={[
                              styles.detailsRevealButton,
                              isDetailsInputExpanded && styles.detailsRevealButtonExpanded,
                            ]}
                            activeOpacity={0.84}
                            accessibilityRole="button"
                            accessibilityLabel={isDetailsInputExpanded ? 'Hide details' : 'Show details'}
                            accessibilityState={{ expanded: isDetailsInputExpanded }}
                          >
                            <MaterialCommunityIcons
                              name="text-box-outline"
                              size={15}
                              color={isDetailsInputExpanded ? '#E8FFFA' : '#165C53'}
                            />
                            <Text
                              style={[
                                styles.detailsRevealButtonText,
                                isDetailsInputExpanded && styles.detailsRevealButtonTextExpanded,
                              ]}
                            >
                              {isDetailsInputExpanded ? 'Hide' : 'Details'}
                            </Text>
                            <Ionicons
                              name={isDetailsInputExpanded ? 'chevron-up' : 'chevron-down'}
                              size={14}
                              color={isDetailsInputExpanded ? '#E8FFFA' : '#165C53'}
                            />
                          </TouchableOpacity>
                        )}
                      </View>

                      {shouldRenderDetailsInput && (
                        <Animated.View style={shouldRevealDetailsWithButton ? detailsInputAnimatedStyle : undefined}>
                          <LinearGradient
                            colors={TODO_DETAILS_CARD_GRADIENT}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={styles.detailsModalGradientCard}
                          >
                            <TextInput
                              style={styles.detailsModalDetailsInput}
                              multiline
                              value={editedTodoDetails}
                              onChangeText={setEditedTodoDetails}
                              placeholder="Add details..."
                              placeholderTextColor={TODO_DETAILS_CARD_DARK_TEXT}
                            />
                          </LinearGradient>
                        </Animated.View>
                      )}

                      {!isGoalDetailsSheet && (
                        <LinearGradient
                          colors={TODO_DETAILS_CARD_GRADIENT}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={styles.detailsModalGradientCard}
                        >
                          {selectedTodoForDetails.workspace !== 'Wishlist' && (
                            <>
                              <TouchableOpacity
                                style={styles.detailsModalMetaRow}
                                onPress={() => setIsDetailsDatePickerVisible(true)}
                                disabled={isDetailsDatePickerVisible}
                                activeOpacity={0.82}
                                accessibilityRole="button"
                                accessibilityLabel="Change date"
                              >
                                <View style={styles.detailsModalMetaLead}>
                                  <Ionicons name="calendar-outline" size={20} color={TODO_DETAILS_CARD_DARK_TEXT} />
                                  <Text style={[styles.detailsModalMetaLabel, styles.detailsModalCardDarkText]}>Date</Text>
                                </View>
                                <View style={styles.detailsModalMetaValueGroup}>
                                  <Text style={styles.detailsModalMetaValue}>
                                    {formatTodoDateLabel(selectedTodoForDetails.dueDate)}
                                  </Text>
                                  <Ionicons name="chevron-forward" size={22} color={TODO_DETAILS_CARD_LIGHT_TEXT} />
                                </View>
                              </TouchableOpacity>

                              <View style={styles.detailsModalMetaDivider} />
                            </>
                          )}

                          <TouchableOpacity
                            style={styles.detailsModalMetaRow}
                            onPress={handleOpenDetailsTimePicker}
                            disabled={isDetailsTimePickerVisible}
                            activeOpacity={0.82}
                          >
                            <View style={styles.detailsModalMetaLead}>
                              <Ionicons name="time-outline" size={20} color={TODO_DETAILS_CARD_DARK_TEXT} />
                              <Text style={[styles.detailsModalMetaLabel, styles.detailsModalCardDarkText]}>Time</Text>
                            </View>
                            <View style={styles.detailsModalMetaValueGroup}>
                              <Text style={styles.detailsModalMetaValue}>
                                {formatTodoTimeLabel(selectedTodoForDetails.dueDate, selectedTodoForDetails.hasDueTime)}
                              </Text>
                              {getTodoHasDueTime(selectedTodoForDetails.dueDate, selectedTodoForDetails.hasDueTime) && (
                                <TouchableOpacity
                                  style={styles.detailsModalClearButton}
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    void handleClearDetailsTime();
                                  }}
                                  hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
                                >
                                  <Ionicons name="close" size={16} color={TODO_DETAILS_CARD_LIGHT_TEXT} />
                                </TouchableOpacity>
                              )}
                              <Ionicons name="chevron-forward" size={22} color={TODO_DETAILS_CARD_LIGHT_TEXT} />
                            </View>
                          </TouchableOpacity>

                          <View style={styles.detailsModalMetaDivider} />

                          <TouchableOpacity
                            style={styles.detailsModalMetaRow}
                            onPress={handleOpenReminderFromDetails}
                            activeOpacity={0.82}
                          >
                            <View style={styles.detailsModalMetaLead}>
                              <Ionicons name="notifications-outline" size={20} color={TODO_DETAILS_CARD_DARK_TEXT} />
                              <Text style={[styles.detailsModalMetaLabel, styles.detailsModalCardDarkText]}>Reminder</Text>
                            </View>
                            <View style={styles.detailsModalMetaValueGroup}>
                              <Text style={styles.detailsModalMetaValue}>
                                {getTodoReminderLabel(selectedTodoForDetails, selectedTodoForDetails.hasDueTime)}
                              </Text>
                              <Ionicons name="chevron-forward" size={22} color={TODO_DETAILS_CARD_LIGHT_TEXT} />
                            </View>
                          </TouchableOpacity>

                          <View style={styles.detailsModalMetaDivider} />

                          {selectedTodoForDetails.workspace === 'Personal' && selectedTodoForDetails.type === 'basic' && (
                            <>
                              <TouchableOpacity
                                style={styles.detailsModalMetaRow}
                                onPress={() => setIsDetailsRepeatPickerVisible(true)}
                                activeOpacity={0.82}
                              >
                                <View style={styles.detailsModalMetaLead}>
                                  <Ionicons name="repeat" size={20} color={TODO_DETAILS_CARD_DARK_TEXT} />
                                  <Text style={[styles.detailsModalMetaLabel, styles.detailsModalCardDarkText]}>Repeat</Text>
                                </View>
                                <View style={styles.detailsModalMetaValueGroup}>
                                  <Text style={styles.detailsModalMetaValue}>
                                    {getTodoRecurrenceLabel(selectedTodoForDetails.recurrence)}
                                  </Text>
                                  <Ionicons name="chevron-forward" size={22} color={TODO_DETAILS_CARD_LIGHT_TEXT} />
                                </View>
                              </TouchableOpacity>

                              <View style={styles.detailsModalMetaDivider} />
                            </>
                          )}

                          <TouchableOpacity
                            style={[
                              styles.detailsModalMetaRow,
                              isMovingTodoToCalendar && styles.actionButtonDisabled,
                            ]}
                            onPress={() => {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                              void handleMoveToCalendar(selectedTodoForDetails);
                            }}
                            disabled={isMovingTodoToCalendar}
                            activeOpacity={0.82}
                          >
                            <View style={styles.detailsModalMetaLead}>
                              <Ionicons name="calendar" size={20} color={TODO_DETAILS_CARD_DARK_TEXT} />
                              <Text style={[styles.detailsModalMetaLabel, styles.detailsModalCardDarkText]}>Send to Calendar</Text>
                            </View>
                            <Text style={styles.detailsModalActionValue}>
                              {isMovingTodoToCalendar ? 'Sending...' : ''}
                            </Text>
                          </TouchableOpacity>

                          <View style={styles.detailsModalMetaDivider} />

                          <TouchableOpacity
                            style={styles.detailsModalMetaRow}
                            onPress={() => {
                              void handleToggleStarred();
                            }}
                            activeOpacity={0.82}
                          >
                            <View style={styles.detailsModalMetaLead}>
                              <MaterialCommunityIcons
                                name={selectedTodoForDetails.starred ? "hexagram" : "hexagram-outline"}
                                size={20}
                                color={TODO_DETAILS_CARD_DARK_TEXT}
                              />
                              <Text style={[styles.detailsModalMetaLabel, styles.detailsModalCardDarkText]}>
                                {selectedTodoForDetails.starred ? 'Unstar' : 'Star'}
                              </Text>
                            </View>
                          </TouchableOpacity>

                          <View style={styles.detailsModalMetaDivider} />

                          <TouchableOpacity
                            style={styles.detailsModalMetaRow}
                            onPress={() => {
                              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                              void handleDeleteTodo();
                            }}
                            activeOpacity={0.82}
                          >
                            <View style={styles.detailsModalMetaLead}>
                              <Ionicons name="trash" size={20} color={TODO_DETAILS_CARD_DARK_TEXT} />
                              <Text style={[styles.detailsModalMetaLabel, styles.detailsModalCardDarkText]}>Delete</Text>
                            </View>
                          </TouchableOpacity>
                        </LinearGradient>
                      )}

                      {renderGuidancePathChoice()}

                      {renderRecipeGuidanceSections()}

                      {renderSkillGuidanceSections()}

                      {renderTaskGuidanceSections()}

                      {renderGoalGuidanceSections()}

                      {renderGuidancePathSwitch()}

                      {isGoalQuotaDatePickerVisible && Platform.OS === 'android' && (
                        <DateTimePicker
                          value={pendingGoalQuotaDate}
                          mode="date"
                          display="default"
                          minimumDate={startOfDay(new Date())}
                          onChange={handleGoalQuotaDateChange}
                        />
                      )}

                      </View>
                    </ScrollViewWithBar>
                  </Animated.View>
                </View>
              </Animated.View>
            </View>
            {isAiComposerActive && (
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.detailsModalAiScrim}>
                  <View style={styles.detailsModalAiScrimFill} />
                </View>
              </TouchableWithoutFeedback>
            )}
            <View pointerEvents="box-none" style={styles.detailsModalBottomDock}>
              <LowerSwipeGesture
                currentTab="todo"
                currentWorkspaceKey={currentWorkspaceKey}
                workspaceKeys={workspaceKeys}
                onTodoWorkspaceTarget={handleDetailsWorkspaceSwipe}
                disabled={isTodoDetailsSwipeDisabled}
                style={[
                  styles.detailsModalLowerSwipeBand,
                  { height: todoDetailsSwipeBandHeight },
                ]}
              >
                <Animated.View
                  style={[
                    styles.detailsModalAiDock,
                    {
                      bottom: aiInputKeyboardBottom,
                      transform: [{
                        translateY: aiInputKeyboardTranslateY,
                      }],
                    },
                ]}
              >
                  <AIInputBox
                    textInput={activeAiInputValue}
                    isListening={activeIsListening}
                    microphoneColor={activeMicrophoneColor}
                    glowAnim={glowAnim}
                    placeholder={activeAiPlaceholder}
                    isProcessing={activeIsAiRunning}
                    onStopPress={isCheckingWishlistPurchaseIntent || isRecipeGuidanceInputActive || isSkillGuidanceInputActive || isGoalGuidanceInputActive || isTaskGuidanceInputActive ? undefined : stopAiRequest}
                    editable={!activeIsAiRunning}
                    showSendButton
                    multiline
                    minInputHeight={40}
                    maxInputHeight={120}
                    inputRef={inputRef}
                    onChangeText={activeSetAiInputValue}
                    onSubmitEditing={handleTodoDetailsAiSendPress}
                    onSendPress={handleTodoDetailsAiSendPress}
                    returnKeyType="default"
                    blurOnSubmit={false}
                    onFocus={handleActiveAiFocus}
                    onBlur={() => setIsAiInputFocused(false)}
                    onTextInputPress={() => {}}
                    onMicrophonePress={handleTodoDetailsAiMicrophonePress}
                    microphoneSide={isLeftHanded ? 'left' : 'right'}
                    inputWrapper={(node) => (
                      <GuidedTarget
                        targetId={getTodoControlGuidanceTargetId('tutorial-goal-ai-bar')}
                        label="AI bar"
                        highlightMode="local"
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
                        {node}
                      </GuidedTarget>
                    )}
                    microphoneWrapper={(node) => (
                      <GuidedTarget
                        targetId={getTodoControlGuidanceTargetId('tutorial-goal-eazee-button')}
                        label="Eazee button"
                        highlightMode="local"
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
                        </View>
                      </GuidedTarget>
                    )}
                    surfaceVariant="todo"
                    containerStyle={{ backgroundColor: 'transparent' }}
                  />
                </Animated.View>
              </LowerSwipeGesture>

            </View>
            {goalWishlistSuggestionToast?.goalId === selectedTodoForDetails.id ? (
              <GoalWishlistSuggestionToast
                goalTitle={goalWishlistSuggestionToast.goalTitle}
                suggestions={goalWishlistSuggestionToast.suggestions}
                selectedItemNames={goalWishlistSuggestionToast.selectedItemNames}
                isAdding={isAddingGoalWishlistSuggestions}
                isAdded={goalWishlistSuggestionToast.isAdded}
                bottom={Math.max(aiInputKeyboardBottom + 72, 56)}
                showBackdrop
                zIndex={140}
                onToggleItem={toggleGoalWishlistSuggestionItem}
                onAddSelected={handleAddGoalWishlistSuggestionsToWishlist}
                onDismiss={dismissGoalWishlistSuggestionToast}
              />
            ) : null}
          </View>
      )}
      {Platform.OS !== 'android' && (
        <GoalQuotaDatePickerModal
          visible={isGoalQuotaDatePickerVisible}
          value={pendingGoalQuotaDate}
          minimumDate={startOfDay(new Date())}
          onChange={handleGoalQuotaDateChange}
          onClose={() => setIsGoalQuotaDatePickerVisible(false)}
          onConfirm={handleConfirmGoalQuotaDate}
          isConfirming={isSchedulingGoalQuotaAction}
        />
      )}
      <Modal
        transparent
        visible={isRecipeWishlistModalVisible}
        animationType="fade"
        onRequestClose={() => setIsRecipeWishlistModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => {
          if (!isAddingRecipeWishlistItems) {
            setIsRecipeWishlistModalVisible(false);
          }
        }}>
          <View style={styles.recipeWishlistModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.recipeWishlistModalCard}>
                <Text style={styles.recipeWishlistModalTitle}>Add to Wishlist</Text>
                <Text style={styles.recipeWishlistModalSubtitle}>Unchecked ingredients are selected.</Text>
                <ScrollViewWithBar
                  style={styles.recipeWishlistModalList}
                >
                  {(recipeGuide?.ingredients || []).map((ingredient, index) => {
                    const ingredientKey = getRecipeIngredientKey(recipeGuide?.todoId || 'recipe', ingredient, index);
                    const isSelected = !!recipeWishlistSelection[ingredientKey];

                    return (
                      <TouchableOpacity
                        key={`wishlist-${ingredientKey}`}
                        style={styles.recipeWishlistOptionRow}
                        onPress={() => toggleRecipeWishlistSelection(ingredientKey)}
                        activeOpacity={0.82}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected }}
                      >
                        <Text style={styles.recipeWishlistOptionText}>
                          {ingredient.quantity ? `${ingredient.quantity} ` : ''}
                          <Text style={styles.recipeItemNameText}>{getRecipeDisplayName(ingredient.name)}</Text>
                          {ingredient.note ? ` - ${ingredient.note}` : ''}
                        </Text>
                        <MaterialCommunityIcons
                          name={isSelected ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                          size={22}
                          color="#C1FFF4"
                        />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollViewWithBar>
                <View style={styles.recipeWishlistModalActions}>
                  <TouchableOpacity
                    style={styles.recipeWishlistCancelButton}
                    onPress={() => setIsRecipeWishlistModalVisible(false)}
                    disabled={isAddingRecipeWishlistItems}
                    activeOpacity={0.82}
                  >
                    <Text style={styles.recipeWishlistCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.recipeWishlistAddButton,
                      isAddingRecipeWishlistItems && styles.actionButtonDisabled,
                    ]}
                    onPress={() => {
                      void handleAddRecipeIngredientsToWishlist();
                    }}
                    disabled={isAddingRecipeWishlistItems}
                    activeOpacity={0.82}
                  >
                    <Text style={styles.recipeWishlistAddButtonText}>
                      {isAddingRecipeWishlistItems ? 'Adding...' : 'Add selected'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <TodoRepeatPicker
        visible={isDetailsRepeatPickerVisible}
        value={selectedTodoForDetails?.recurrence}
        onChange={(recurrence) => {
          void handleDetailsRepeatChange(recurrence);
        }}
        onClose={() => setIsDetailsRepeatPickerVisible(false)}
      />
      <TodoComposerDatePicker
        visible={isDetailsDatePickerVisible}
        value={selectedTodoForDetails?.dueDate || new Date()}
        accentColor={TODO_COMPOSER_ACCENT_COLOR}
        onChange={handleDetailsDateChange}
        onClose={() => setIsDetailsDatePickerVisible(false)}
      />
      <TimeWheelDialog
        visible={isDetailsTimePickerVisible}
        value={pendingDetailsTime}
        onChange={(date) => {
          pendingDetailsTimeRef.current = date;
        }}
        onClose={handleDismissDetailsTimePicker}
      />
      <Modal
        transparent
        visible={isReminderModalVisible}
        animationType="fade"
        onRequestClose={() => setIsReminderModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsReminderModalVisible(false)}>
          <View style={styles.reminderModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.reminderModalCard}>
                <Text style={styles.reminderModalTitle}>Reminder</Text>
                {selectedTodoForDetails && reminderOptions.map((option) => {
                  const isSelected = getReminderSelectionKey(selectedTodoForDetails) === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={styles.reminderOptionRow}
                      onPress={() => {
                        void handleSelectReminderOption(option);
                      }}
                    >
                      <Text style={styles.reminderOptionText}>{option.label}</Text>
                      {isSelected ? (
                        <Ionicons name="checkmark" size={20} color="#F9FAFB" />
                      ) : (
                        <View style={styles.reminderOptionSpacer} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <Modal
        transparent
        visible={!!goalGuidanceSuccessNotice}
        animationType="fade"
        onRequestClose={() => setGoalGuidanceSuccessNotice(null)}
      >
        <View style={styles.goalGuidanceSuccessOverlay}>
          <LinearGradient
            colors={['#1F534A', '#001814']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.goalGuidanceSuccessCard}
          >
            <Text style={styles.goalGuidanceSuccessTitle}>{goalGuidanceSuccessNotice?.title}</Text>
            <Text style={styles.goalGuidanceSuccessMessage}>{goalGuidanceSuccessNotice?.message}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.goalGuidanceSuccessButton,
                pressed && styles.goalGuidancePressedButton,
              ]}
              onPress={() => setGoalGuidanceSuccessNotice(null)}
            >
              <Text style={styles.goalGuidanceSuccessButtonText}>OK</Text>
            </Pressable>
          </LinearGradient>
        </View>
      </Modal>
      <Modal
        transparent
        visible={!!detailsReminderNotice}
        animationType="fade"
        onRequestClose={() => setDetailsReminderNotice(null)}
      >
        <View style={styles.goalGuidanceSuccessOverlay}>
          <LinearGradient
            colors={['#1F534A', '#001814']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.goalGuidanceSuccessCard}
          >
            <Text style={styles.goalGuidanceSuccessTitle}>{detailsReminderNotice?.title}</Text>
            <Text style={styles.goalGuidanceSuccessMessage}>{detailsReminderNotice?.message}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.goalGuidanceSuccessButton,
                pressed && styles.goalGuidancePressedButton,
              ]}
              onPress={() => setDetailsReminderNotice(null)}
            >
              <Text style={styles.goalGuidanceSuccessButtonText}>OK</Text>
            </Pressable>
          </LinearGradient>
        </View>
      </Modal>
      {/* {ColorPickerModal} */}
      {OptionsMenuModal}
      {showSpeechOverlay && !!speechOverlayText && (
        <View
          style={{
            position: 'absolute',
            top: 60,
            left: 16,
            right: 16,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
          }}
        >
          <Text
            style={{ color: '#FFFFFF', fontSize: 12 }}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {speechOverlayText}
          </Text>
        </View>
      )}
      {isProcessing && <PulsatingRGB width={500} height={4} />}

    </GestureHandlerRootView>
  );
});



const styles = StyleSheet.create({
  todoSearchBarFrame: {
    marginHorizontal: 4,
  },
  // section
  section: {
    borderRadius: 20,
    marginBottom: 16,
    padding: 1.5,
    backgroundColor: '#43A5A4',
  },
  todoCardFrame: {
    borderRadius: 18,
    padding: 1.5,
    marginBottom: 10,
    opacity: 1,
  },
  todoRevealShell: {
    position: 'relative',
    overflow: 'visible',
  },
  todoRevealShellActive: {
    zIndex: 3,
    elevation: 3,
  },
  todoRevealGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 10,
    borderRadius: 18,
    zIndex: 10,
    elevation: 14,
    shadowColor: '#AEFFE8',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowRadius: 18,
  },
  todoRevealGlowSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  todoCardGradient: {
    borderRadius: 16.5,
    paddingVertical: 13,
    paddingHorizontal: 16,
    opacity: 1,
    overflow: 'hidden',
  },
  draggingTodoItem: {
    opacity: 0.92,
    transform: [{ scale: 1.01 }],
  },
  dragFadedCardDetails: {
    opacity: 0.18,
  },
  dragStateHandle: {
    position: 'absolute',
    top: 0,
    right: 8,
    bottom: 0,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  dragHandleDotGrid: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleDotRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  dragHandleDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginHorizontal: 2,
    backgroundColor: 'rgba(58, 104, 96, 0.82)',
  },
  pressedTodoItem: {
    opacity: 0.86,
  },
  todoPressableOverflow: {
    overflow: 'hidden',
  },
  sectionInner: {
    borderRadius: 18.5,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    //color: '#fff',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  sectionContent: {
    padding: 10,
  },
  sectionContentExpanded: {
    borderTopWidth: 1,
    borderTopColor: '#D0D0D0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 5,
    color: '#333',
  },
  listContainer: {
    flex: 1,
  },
  activeContainer: {
    backgroundColor: '#E3E3E2',
    borderRadius: 19,
    padding: 10,
    marginBottom: 20,
  },
  completedContainer: {
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    padding: 10,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFFCF9',
    padding: 15,
    borderRadius: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  checkbox: {
    marginRight: 10,
  },
  todoText: {
    fontSize: 16,
    color: '#333',
  },
  todoInput: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    padding: 0,
  },
  completedItem: {
    opacity: 0.6,
  },
  completedText: {
    textDecorationLine: 'line-through',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginHorizontal: WORKSPACE_SHELL_HORIZONTAL_PADDING,
    marginBottom: WORKSPACE_SHELL_BOTTOM_PADDING,
  },
  createButtonText: {
    color: '#22AB93',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  // bottom sheet
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  bottomSheetContent: {
    flex: 1,
    padding: 16,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  detailsModalGradientCard: {
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(193, 255, 244, 0.35)',
    shadowColor: '#0B3E37',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  detailsModalDetailsInput: {
    minHeight: 108,
    padding: 0,
    textAlignVertical: 'top',
    color: '#296056',
    fontSize: 15,
    lineHeight: 19,
  },
  goalGuidanceSectionHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  goalGuidanceCardTitle: {
    color: '#E8FFFA',
  },
  goalGuidanceHistoryToggle: {
    marginBottom: 0,
  },
  goalGuidanceOverallProgress: {
    marginBottom: 12,
    gap: 6,
  },
  goalGuidanceOverallProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  goalGuidanceOverallProgressText: {
    color: 'rgba(232, 255, 250, 0.86)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    flexShrink: 1,
  },
  goalGuidanceOverallProgressTrack: {
    height: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(232, 255, 250, 0.18)',
    overflow: 'hidden',
  },
  goalGuidanceOverallProgressFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#E8FFFA',
  },
  goalGuidanceBodyText: {
    color: '#E8FFFA',
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  guidanceSelectableTextBlock: {
    minWidth: 0,
    flexShrink: 1,
  },
  guidanceSelectableTextInput: {
    color: '#E8FFFA',
    fontSize: 13,
    lineHeight: 18,
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
    textAlignVertical: 'top',
    flexShrink: 1,
  },
  guidanceLinkList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  guidanceLinkButton: {
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 250, 0.52)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  guidanceLinkButtonText: {
    color: '#E8FFFA',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  goalActionMetadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
    minWidth: 0,
  },
  goalActionSubtaskLabel: {
    color: 'rgba(57, 70, 67, 0.74)',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
    borderWidth: 1,
    borderColor: 'rgba(57, 70, 67, 0.2)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  goalActionMetadataText: {
    color: 'rgba(57, 70, 67, 0.58)',
    fontSize: 11,
    lineHeight: 14,
    fontStyle: 'italic',
    flexShrink: 1,
  },
  goalActionYoutubeButton: {
    marginLeft: 8,
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  recipeShortcutButton: {
    marginLeft: 8,
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  goalActionChildProgressInline: {
    marginTop: 10,
    gap: 6,
    width: '100%',
  },
  goalActionChildProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  goalActionChildProgressText: {
    color: 'rgba(57, 70, 67, 0.68)',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
  goalActionChildProgressPill: {
    color: 'rgba(57, 70, 67, 0.72)',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: 'rgba(57, 70, 67, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  goalActionChildProgressTrack: {
    height: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(57, 70, 67, 0.14)',
    overflow: 'hidden',
  },
  goalActionChildProgressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#3A6860',
  },
  goalGuidanceNotice: {
    color: '#E8FFFA',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  goalGuidanceConversation: {
    gap: 8,
  },
  goalGuidanceMessage: {
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(232, 255, 250, 0.38)',
    paddingLeft: 10,
    gap: 2,
  },
  goalGuidanceUserMessage: {
    borderLeftColor: 'rgba(232, 255, 250, 0.78)',
  },
  goalGuidanceMessageLabel: {
    color: 'rgba(232, 255, 250, 0.78)',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  goalGuidanceErrorText: {
    color: '#FFD1CC',
  },
  goalGuidanceButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8FFFA',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
  },
  goalGuidanceButtonText: {
    color: '#024035',
    fontSize: 13,
    fontWeight: '800',
  },
  goalGuidanceGetStepsButton: {
    position: 'relative',
    alignSelf: 'flex-start',
    borderRadius: 999,
    marginTop: 12,
    overflow: 'hidden',
  },
  guidedAcceptPlanOuter: {
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  guidedAcceptPlanTarget: {
    alignSelf: 'flex-start',
    flexGrow: 0,
  },
  tutorialAcceptPlanButton: {
    marginTop: 0,
  },
  goalGuidanceAttentionButton: {
    backgroundColor: '#15BA9D',
    shadowColor: '#6DFFF0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'visible',
  },
  goalGuidanceAttentionRing: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  goalGuidanceGetStepsButtonGradient: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: '#15BA9D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  goalGuidanceGetStepsButtonText: {
    color: '#E8FFFA',
    fontSize: 12,
    fontWeight: '800',
  },
  goalGuidancePressedButton: {
    opacity: 0.72,
    transform: [{ translateY: 1 }, { scale: 0.96 }],
  },
  goalGuidanceSuccessOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(1, 14, 12, 0.28)',
    paddingHorizontal: 24,
  },
  goalGuidanceSuccessCard: {
    width: '100%',
    maxWidth: 320,
    minHeight: 132,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    borderWidth: 1.2,
    borderColor: '#32655C',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.34,
    shadowRadius: 28,
    elevation: 18,
  },
  goalGuidanceSuccessTitle: {
    color: '#F7FFFC',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
  },
  goalGuidanceSuccessMessage: {
    color: 'rgba(247, 255, 252, 0.82)',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '500',
    marginTop: 18,
    paddingRight: 8,
  },
  goalGuidanceSuccessButton: {
    alignSelf: 'flex-end',
    minWidth: 58,
    minHeight: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5EB6A9',
    marginTop: 22,
    paddingHorizontal: 14,
  },
  goalGuidanceSuccessButtonText: {
    color: '#F7FFFC',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  guidancePathChoiceRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  guidancePathChoiceButton: {
    flex: 1,
    borderRadius: 999,
    overflow: 'hidden',
  },
  guidancePathChoiceButtonGradient: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: '#15BA9D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  guidancePathSwitchCard: {
    paddingVertical: 8,
  },
  guidancePathSwitchRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  guidancePathSwitchLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    color: '#134D45',
    flexShrink: 1,
  },
  guidancePathSwitchStatus: {
    fontSize: 12,
    lineHeight: 16,
    color: '#EFFFFB',
    fontWeight: '700',
  },
  goalGuidanceReturnButton: {
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 250, 0.52)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  goalGuidanceReturnButtonText: {
    color: '#E8FFFA',
    fontSize: 12,
    fontWeight: '800',
  },
  goalGuidanceActionBlock: {
    gap: 6,
  },
  goalGuidanceActionTodoTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  goalGuidanceActionCompleteButton: {
    marginRight: 10,
    marginTop: -4,
  },
  goalGuidanceActionCompleteIcon: {
    width: 30,
    height: 30,
  },
  goalGuidanceActionCompleteIconDisabled: {
    opacity: 0.58,
  },
  goalGuidanceActionTodoTitle: {
    flex: 1,
    minWidth: 0,
    color: '#3A6860',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    minHeight: 20,
  },
  goalGuidanceActionTodoBody: {
    color: '#0E4D45',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    flexShrink: 1,
    minHeight: 36,
  },
  goalGuidanceActionTodoBodyEmpty: {
    opacity: 0,
  },
  goalGuidanceChildProgressSlot: {
    minHeight: 37,
  },
  goalGuidanceChildProgress: {
    marginTop: 10,
    gap: 6,
    width: '100%',
  },
  goalGuidanceChildProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  goalGuidanceChildProgressText: {
    color: '#0E4D45',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    flexShrink: 1,
  },
  goalGuidanceChildProgressPill: {
    color: '#0E4D45',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: 'rgba(14, 77, 69, 0.28)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  goalGuidanceChildProgressTrack: {
    height: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(14, 77, 69, 0.16)',
    overflow: 'hidden',
  },
  goalGuidanceChildProgressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#0E4D45',
  },
  goalGuidanceActionMissingRow: {
    marginLeft: 40,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  goalGuidanceActionMissingText: {
    color: '#0E4D45',
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  goalGuidanceStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
  },
  goalGuidanceStepIndex: {
    width: 22,
    height: 22,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(22, 92, 83, 0.18)',
    color: '#0E4D45',
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 12,
    fontWeight: '800',
  },
  goalGuidanceStepTextGroup: {
    flex: 1,
    gap: 2,
  },
  goalGuidanceStepTitle: {
    color: '#E8FFFA',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    flexShrink: 1,
  },
  goalGuidancePill: {
    color: '#024035',
    backgroundColor: 'rgba(232, 255, 250, 0.82)',
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800',
  },
  recipeQuestionStack: {
    gap: 10,
  },
  recipeAnswerInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 250, 0.34)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#E8FFFA',
    fontSize: 13,
    lineHeight: 18,
    backgroundColor: 'rgba(2, 64, 53, 0.16)',
  },
  recipeVideoList: {
    gap: 10,
  },
  recipeVideoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 250, 0.24)',
    borderRadius: 8,
    padding: 8,
    backgroundColor: 'rgba(2, 64, 53, 0.16)',
  },
  recipeVideoThumbnail: {
    width: 72,
    height: 42,
    borderRadius: 6,
    backgroundColor: 'rgba(232, 255, 250, 0.16)',
  },
  recipeVideoTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  recipeVideoTitle: {
    color: '#E8FFFA',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  recipeVideoMeta: {
    color: 'rgba(232, 255, 250, 0.72)',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  recipeGuideStack: {
    gap: 12,
  },
  recipeSelectedVideo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 250, 0.24)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  recipeSelectedVideoText: {
    color: '#E8FFFA',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    flex: 1,
  },
  recipeGuideBlock: {
    gap: 6,
  },
  recipeIngredientRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  recipeIngredientCheck: {
    marginTop: -1,
  },
  recipeIngredientText: {
    color: '#E8FFFA',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  recipeIngredientTextChecked: {
    opacity: 0.62,
    textDecorationLine: 'line-through',
  },
  recipeItemNameText: {
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  recipeWishlistButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 250, 0.52)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 4,
  },
  recipeWishlistButtonText: {
    color: '#E8FFFA',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  recipeProgressBlock: {
    marginTop: 4,
    marginBottom: 6,
    gap: 6,
  },
  recipeStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  recipeStepRowActive: {
    borderColor: 'rgba(232, 255, 250, 0.42)',
    backgroundColor: 'rgba(232, 255, 250, 0.1)',
  },
  recipeStepRowCompleted: {
    backgroundColor: 'rgba(232, 255, 250, 0.16)',
  },
  recipeStepCompleteButton: {
    marginTop: 1,
  },
  goalGuidanceStepCheckShell: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  goalGuidanceStepCheckShellChecked: {
    backgroundColor: '#E8FFFA',
    borderColor: '#E8FFFA',
  },
  goalGuidanceStepCheckShellUnchecked: {
    backgroundColor: 'rgba(232, 255, 250, 0.08)',
    borderColor: 'rgba(232, 255, 250, 0.72)',
  },
  recipeStepTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  recipeStepTextCompleted: {
    opacity: 0.72,
    textDecorationLine: 'line-through',
  },
  recipeStepBodyCompleted: {
    opacity: 0.66,
  },
  recipeTimestampButton: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 7,
    backgroundColor: 'rgba(232, 255, 250, 0.86)',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  recipeTimestampButtonText: {
    color: '#024035',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  detailsModalMetaRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  detailsModalMetaLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  detailsModalMetaDivider: {
    height: 1,
    backgroundColor: 'rgba(24, 94, 82, 0.22)',
    marginVertical: 2,
  },
  // Labels on the details and date/time cards (the shared label style is used elsewhere too).
  detailsModalCardDarkText: {
    color: '#296056',
  },
  detailsModalMetaLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#134D45',
  },
  detailsModalMetaValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  detailsModalMetaValue: {
    fontSize: 16,
    color: '#C6FDF3',
    fontWeight: '500',
  },
  detailsModalActionValue: {
    fontSize: 15,
    color: '#C6FDF3',
    fontWeight: '500',
  },
  detailsModalClearButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(193, 255, 244, 0.35)',
  },
  bottomSheetFooter: {
    flexDirection: 'column',
    marginBottom: 16,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  optionButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    marginTop: 4,
    fontSize: 12,
    color: '#22AB93',
  },
  dateOptionButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3E3E2',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dateText: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#22AB93',
  },
  saveButton: {
    backgroundColor: '#22AB93',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  starIcon: {
    marginLeft: 8,
  },
  // todo item
  todoTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  textWrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  dueDateText: {
    fontSize: 10,
    color: '#888',
    marginRight: 8,

  },
  overdueDateText: {
    color: 'rgba(255, 0, 0, 0.6)',
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyStateText: {
    textAlign: 'center',
    color: '#e0e0e0',
    fontStyle: 'italic',
    padding: 10,
  },
  emptyStateAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginVertical: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  emptyStateAddButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // action sheet
  actionSheetContent: {
    paddingHorizontal: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    marginLeft: 16,
    fontSize: 16,
    color: TODO_COMPOSER_TEXT_COLOR,
  },
  actionButtonDeleteText: {
    marginLeft: 16,
    fontSize: 16,
    color: '#FF7B72',
  },
  //input box
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#CBD0D2',
  },
  microphoneButton: {
    backgroundColor: '#22AB93',
    borderRadius: 8,
    width: 80,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 10,
    alignSelf: 'center',
  },
  microphoneButtonActive: {
    backgroundColor: '#22AB93',
  },
  microphoneButtonText: {
    color: '#fff',
  },
  textInputWrapper: {
    flex: 1,
    justifyContent: 'center',
    height: 35,
  },
  textInput: {
    color: '#000',
    flex: 1,
    height: 30,
    fontSize: 12,
    // borderColor: 'gray',
    // borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    marginRight: 10,
    backgroundColor: '#E3E3E2',
  },
  pagerView: {
    flex: 1,
    width: '100%',
  },
  workspaceContainer: {
    flex: 1,
    width: '100%',
  },
  workspaceShell: {
    flex: 1,
    borderRadius: 28,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  workspaceShellContent: {
    flexGrow: 1,
    paddingTop: WORKSPACE_SHELL_TOP_PADDING,
    paddingHorizontal: WORKSPACE_SHELL_HORIZONTAL_PADDING,
    paddingBottom: WORKSPACE_SHELL_BOTTOM_PADDING + 10,
  },
  // workspace
  workspaceIndicator: {
    alignItems: 'center',
    marginBottom: 20,
  },
  workspaceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#22AB93',
    marginBottom: 10,
  },
  dotContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 24,
    position: 'relative',
  },
  dotWrapper: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD0D2',
  },
  activeDotWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22AB93',
  },
  // amazon
  buyButton: {
    backgroundColor: '#000000',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginRight: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.35,
    shadowRadius: 3.84,
    elevation: 5, // for Android
  },
  buyButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // wishlist heading
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addAllToCartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 10,
  },
  addAllToCartText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  // wishlist
  loadingIndicator: {
    marginRight: 10,
  },
  goToCartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22AB93',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 10,
  },
  goToCartText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  actionSheet: {
    backgroundColor: TODO_COMPOSER_SHEET_COLOR,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingTop: 12,
  },
  detailsModalRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 90,
    elevation: 90,
    justifyContent: 'flex-start',
  },
  detailsModalBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  detailsModalFrame: {
    paddingHorizontal: 10,
  },
  detailsModalWatermarkLayer: {
    position: 'absolute',
    top: -24,
    left: -12,
    right: -12,
    bottom: -24,
  },
  detailsModalWatermark: {
    width: '100%',
    height: '100%',
    opacity: 0.055,
  },
  detailsModalLogoLayer: {
    position: 'absolute',
    top: 40,
    left: -30,
    right: 0,
    alignItems: 'center',
  },
  detailsModalLogo: {
    width: 662,
    height: 664,
    opacity: 1,
  },
  detailsModalSafeArea: {
    flex: 1,
  },
  detailsModalContent: {
    flex: 1,
    paddingTop: 34,
    paddingBottom: 132,
  },
  detailsModalActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  detailsModalIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsModalShell: {
    borderRadius: 34,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(193, 255, 244, 0.08)',
    overflow: 'hidden',
    marginHorizontal: 0,
  },
  detailsModalScrollContainer: {
    paddingTop: 22,
    paddingHorizontal: 12,
    paddingBottom: 22,
  },
  detailsModalScrollContent: {
    gap: 18,
  },
  detailsModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
    paddingRight: 8,
  },
  detailsModalTitle: {
    flex: 1,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: TODO_DETAILS_TITLE_COLOR,
    paddingLeft: 10,
    paddingRight: 0,
  },
  detailsRevealButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginLeft: 10,
    marginTop: 3,
    backgroundColor: 'rgba(193, 255, 244, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 250, 0.9)',
    shadowColor: '#0B3E37',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 4,
  },
  detailsRevealButtonLeft: {
    marginLeft: 0,
  },
  detailsRevealButtonExpanded: {
    backgroundColor: 'rgba(22, 92, 83, 0.82)',
    borderColor: 'rgba(232, 255, 250, 0.32)',
  },
  detailsRevealButtonText: {
    color: '#165C53',
    fontSize: 12,
    fontWeight: '800',
  },
  detailsRevealButtonTextExpanded: {
    color: '#E8FFFA',
  },
  detailsModalBottomDock: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 110,
    elevation: 110,
  },
  detailsModalAiDock: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  detailsModalLowerSwipeBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  detailsModalAiScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  detailsModalAiScrimFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 10, 14, 0.48)',
  },
  // TODO ANIMATION
  strikeThrough: {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: '100%',
    height: 1,
    backgroundColor: '#000',
    transformOrigin: 'left',
  },
  todoItemContainer: {
    overflow: 'hidden',
  },

  // text input
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTextContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    maxHeight: '80%',
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    maxHeight: 200,
    color: '#000',
  },
  todoComposerInputContainer: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 250, 0.12)',
    borderRadius: 24,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  todoComposerClockButton: {
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
  },
  todoComposerInput: {
    minHeight: 52,
    flex: 1,
    paddingLeft: 0,
    paddingRight: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#287B6C',
    fontWeight: '700',
  },
  todoComposerInputWithoutClock: {
    paddingLeft: 16,
  },
  todoComposerDetailsInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 250, 0.12)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: TODO_COMPOSER_TEXT_COLOR,
    textAlignVertical: 'top',
  },
  todoComposerActions: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  todoComposerActionsRight: {
    justifyContent: 'flex-end',
  },
  todoComposerDateTimeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
    minWidth: 0,
  },
  todoComposerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    gap: 5,
    flexShrink: 1,
  },
  goalTimeframeChip: {
    position: 'relative',
    overflow: 'visible',
  },
  goalTimeframeChipRing: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  todoComposerChipText: {
    fontSize: 13,
    color: TODO_COMPOSER_TEXT_COLOR,
  },
  todoComposerChipCloseButton: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoComposerStarButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoComposerSaveButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: TODO_COMPOSER_ACCENT_COLOR,
  },
  todoComposerSaveButtonDisabled: {
    opacity: 0.65,
  },
  todoComposerSaveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  todoComposerSheet: {
    backgroundColor: TODO_COMPOSER_SHEET_COLOR,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingTop: 12,
  },
  goalTimeframeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.32)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  goalTimeframeModalCard: {
    borderRadius: 24,
    backgroundColor: TODO_COMPOSER_SHEET_COLOR,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 250, 0.14)',
    overflow: 'hidden',
  },
  goalTimeframeModalTitle: {
    color: TODO_COMPOSER_TEXT_COLOR,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  goalTimeframeOption: {
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalTimeframeOptionSelected: {
    backgroundColor: 'rgba(44, 107, 96, 0.72)',
  },
  goalTimeframeOptionText: {
    color: 'rgba(232, 255, 250, 0.78)',
    fontSize: 15,
    fontWeight: '600',
  },
  goalTimeframeOptionTextSelected: {
    color: '#E8FFFA',
  },
  repeatPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.32)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  repeatPickerCard: {
    borderRadius: 24,
    backgroundColor: TODO_COMPOSER_SHEET_COLOR,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(232, 255, 250, 0.14)',
    overflow: 'hidden',
  },
  repeatPickerHeader: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  repeatPickerTitle: {
    color: TODO_COMPOSER_TEXT_COLOR,
    fontSize: 16,
    fontWeight: '700',
  },
  repeatPickerOption: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  repeatPickerOptionSelected: {
    backgroundColor: 'rgba(44, 107, 96, 0.72)',
  },
  repeatPickerOptionText: {
    color: 'rgba(232, 255, 250, 0.82)',
    fontSize: 15,
    fontWeight: '600',
  },
  repeatPickerCustomRow: {
    borderRadius: 18,
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  repeatPickerNumberScroller: {
    gap: 8,
    paddingRight: 6,
  },
  repeatPickerNumberOption: {
    minWidth: 38,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232, 255, 250, 0.08)',
  },
  repeatPickerUnitRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  repeatPickerUnitOption: {
    flex: 1,
    minHeight: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232, 255, 250, 0.08)',
  },
  repeatPickerInlineOptionSelected: {
    backgroundColor: 'rgba(44, 107, 96, 0.82)',
  },
  repeatPickerInlineOptionText: {
    color: 'rgba(232, 255, 250, 0.78)',
    fontSize: 14,
    fontWeight: '700',
  },
  repeatPickerInlineOptionTextSelected: {
    color: '#E8FFFA',
  },
  repeatPickerPreview: {
    color: 'rgba(232, 255, 250, 0.82)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  repeatPickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  repeatPickerSecondaryButton: {
    minHeight: 40,
    minWidth: 78,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232, 255, 250, 0.1)',
  },
  repeatPickerSecondaryButtonText: {
    color: 'rgba(232, 255, 250, 0.8)',
    fontSize: 14,
    fontWeight: '700',
  },
  repeatPickerPrimaryButton: {
    minHeight: 40,
    minWidth: 78,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TODO_COMPOSER_ACCENT_COLOR,
  },
  repeatPickerPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  goalQuotaDateModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(1, 14, 12, 0.66)',
    paddingHorizontal: 22,
  },
  goalQuotaDateModalCard: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(155, 228, 215, 0.24)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.34,
    shadowRadius: 28,
    elevation: 18,
  },
  goalQuotaDateModalHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  goalQuotaDateModalTitle: {
    color: '#F7FFFC',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
  },
  goalQuotaDateModalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232, 255, 250, 0.1)',
  },
  goalQuotaDatePicker: {
    alignSelf: 'stretch',
  },
  goalQuotaDateModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  goalQuotaDateModalSecondaryButton: {
    minWidth: 78,
    minHeight: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: 'rgba(232, 255, 250, 0.1)',
  },
  goalQuotaDateModalSecondaryButtonText: {
    color: 'rgba(232, 255, 250, 0.8)',
    fontSize: 14,
    fontWeight: '700',
  },
  goalQuotaDateModalPrimaryButton: {
    minWidth: 78,
    minHeight: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#5EB6A9',
  },
  goalQuotaDateModalPrimaryButtonText: {
    color: '#001814',
    fontSize: 14,
    fontWeight: '800',
  },
  reminderModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 10, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  reminderModalCard: {
    borderRadius: 24,
    backgroundColor: '#111827',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  recipeWishlistModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14, 69, 59, 0.48)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  recipeWishlistModalCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(34, 171, 147, 0.94)',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    maxHeight: '72%',
    borderWidth: 1,
    borderColor: 'rgba(193, 255, 244, 0.42)',
  },
  recipeWishlistModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#C1FFF4',
    marginBottom: 10,
  },
  recipeWishlistModalSubtitle: {
    color: 'rgba(232, 255, 250, 0.86)',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  recipeWishlistModalList: {
    maxHeight: 320,
  },
  recipeWishlistOptionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(193, 255, 244, 0.22)',
  },
  recipeWishlistOptionText: {
    color: '#E8FFFA',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    flex: 1,
  },
  recipeWishlistModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  recipeWishlistCancelButton: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recipeWishlistCancelButtonText: {
    color: '#E8FFFA',
    fontSize: 14,
    fontWeight: '700',
  },
  recipeWishlistAddButton: {
    borderRadius: 8,
    backgroundColor: '#BEFFF4',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recipeWishlistAddButtonText: {
    color: '#0E453B',
    fontSize: 14,
    fontWeight: '800',
  },
  reminderModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 10,
  },
  reminderOptionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  reminderOptionText: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '500',
  },
  reminderOptionSpacer: {
    width: 20,
    height: 20,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    backgroundColor: '#22AB93',
    borderRadius: 5,
    padding: 10,
    width: '45%',
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#EB4335',
    borderRadius: 5,
    padding: 10,
    width: '45%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  // color
  colorPickerContainer: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
    alignItems: 'center',
  },
  colorPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  colorPickerButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  colorPickerButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 5,
  },
  colorPickerButton: {
    backgroundColor: '#22AB93',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
    width: '45%',
    alignItems: 'center',
  },
  colorPickerButtonCancel: {
    backgroundColor: '#EB4335',
  },
  glowingButton: {
    shadowColor: '#22AB93',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  deleteActionContainer: {
    width: 100,
    height: '100%',
    marginBottom: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAction: {
    flex: 1,
    width: '100%',
    backgroundColor: '#19292C',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    zIndex: 999,
  },
  deleteText: {
    color: 'white',
    fontWeight: 'bold',
    marginTop: 2,
    fontSize: 12
  },
});

export default withDatabase(TodoScreen);
