import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, {
  Defs,
  Ellipse,
  Mask,
  RadialGradient,
  Rect as SvgRect,
  Stop,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSharedTodoWorkspaceState } from '@/components/navigation/lowerSwipeNavigation';
import { playGuidanceVoice, type GuidanceVoicePlayback } from '@/lib/guidanceVoice';
import { confirmSkipWholeTutorial } from '@/lib/tutorialEnd';
import {
  getGuidanceActiveTab,
  subscribeGuidanceActiveTab,
} from '@/lib/guidanceActiveTab';
import {
  CHAT_DAY_PLAN_SAVE_TUTORIAL_MESSAGE,
  CHAT_DAY_PLAN_TUTORIAL_MESSAGE,
  CHAT_TUTORIAL_AI_BAR_MESSAGE,
  CHAT_TUTORIAL_EAZEE_BUTTON_MESSAGE,
  CALENDAR_TUTORIAL_CREATE_EVENT_MESSAGE,
  CALENDAR_TUTORIAL_EVENT_CREATED_MESSAGE,
  GOAL_TUTORIAL_ACCEPT_PLAN_MESSAGE,
  GOAL_TUTORIAL_ACTIONS_MESSAGE,
  GOAL_TUTORIAL_AI_BAR_MESSAGE,
  GOAL_TUTORIAL_HANDOFF_MESSAGE,
  GOAL_TUTORIAL_QUESTION_MESSAGE,
  GOAL_TUTORIAL_SUMMARY_MESSAGE,
  GOAL_TUTORIAL_TIMEFRAMES_MESSAGE,
  GOAL_TO_CALENDAR_TUTORIAL_HANDOFF_MESSAGE,
  HOME_TUTORIAL_NEXT_STEP_MESSAGE,
  HOME_TUTORIAL_OVERVIEW_MESSAGE,
  HOME_TUTORIAL_TODAYS_PLAN_MESSAGE,
  TUTORIAL_COMPLETE_FOR_NOW_MESSAGE,
  TODO_TUTORIAL_ACCEPT_PLAN_MESSAGE,
  TODO_TUTORIAL_AI_GUIDANCE_MESSAGE,
  TODO_TUTORIAL_CHOOSE_GUIDANCE_MESSAGE,
  TODO_TUTORIAL_PICK_VIDEO_MESSAGE,
  TODO_TUTORIAL_VIDEO_READY_MESSAGE,
  TODO_TUTORIAL_VIDEO_GUIDANCE_MESSAGE,
  WISHLIST_TUTORIAL_CHAT_HANDOFF_MESSAGE,
  WISHLIST_TUTORIAL_MESSAGE,
  WISHLIST_TUTORIAL_PROMPT_MESSAGE,
} from '@/lib/tutorial';
import {
  getCalendarEventGuidanceTargetId,
  getCalendarControlGuidanceTargetId,
  getChatHeaderGuidanceTargetId,
  getChatAiBarGuidanceTargetId,
  getChatEazeeButtonGuidanceTargetId,
  getChatWishlistMessageGuidanceTargetId,
  getChatPlanDayComposerGuidanceTargetId,
  getChatSavePlanGuidanceTargetId,
  getGuidanceTargetLabel,
  getGuidanceTargetTab,
  getHomeControlGuidanceTargetId,
  getHomeBackGuidanceTargetId,
  getHomeAccountGuidanceTargetId,
  getHomeAccountBackGuidanceTargetId,
  getHomeSettingsControlGuidanceTargetId,
  getHomeSettingsBackGuidanceTargetId,
  getHomeSettingsPanelGuidanceTargetId,
  getHomeSettingsGuidanceTargetId,
  getTabGuidanceTargetId,
  getTodoItemGuidanceTargetId,
  getTodoBackGuidanceTargetId,
  getTodoControlGuidanceTargetId,
  getTodoWorkspaceGuidanceTargetId,
  getCalendarBackGuidanceTargetId,
  type GuidanceTab,
  type GuidanceTarget,
} from '@/lib/navigationHelp';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RegisteredTarget = {
  id: string;
  label?: string;
  highlightMode: 'overlay' | 'local';
  measure: () => void;
};

type GuidanceStep = {
  key: string;
  message: string;
  targetId?: string;
  completeAfterMs?: number;
  disableBackdrop?: boolean;
  hideActions?: boolean;
  showSwipeHint?: boolean;
  swipeDirection?: 'left' | 'right';
};

type GuidanceSession = {
  id: string;
  target: GuidanceTarget;
  label: string;
  onCancel?: () => void;
  onBack?: () => void;
  onNext?: () => void;
  onSkipSegment?: () => void;
  nextLabel?: string;
  completeAfterMs?: number;
  autoNextAfterMs?: number;
  hideCardAfterMs?: number;
  keepLocatedTargetCard?: boolean;
  useTutorialCardPlacement?: boolean;
};

type GuidanceStartOptions = {
  onCancel?: () => void;
  onBack?: () => void;
  onNext?: () => void;
  onSkipSegment?: () => void;
  /** The tutorial card's forward button text (default "next"), e.g. "skip" on a step that waits for the user. */
  nextLabel?: string;
  /**
   * Tutorial "back": puts the screen back the way this step needs it (tab, open panels,
   * choices), then shows this step again. Without it, back only re-shows the card.
   */
  restore?: () => void;
  completeAfterMs?: number;
  autoNextAfterMs?: number;
  hideCardAfterMs?: number;
  keepLocatedTargetCard?: boolean;
  useTutorialCardPlacement?: boolean;
};

const GUIDANCE_TAB_ROUTES: Record<GuidanceTab, string> = {
  chat: '/(tabs)/chat',
  home: '/(tabs)/home',
  todo: '/(tabs)/todo',
  calendar: '/(tabs)/calendar',
};

/** Switches to a tab for a tutorial step being restored. */
export function showGuidanceTab(tab: GuidanceTab) {
  if (getGuidanceActiveTab() !== tab) router.navigate(GUIDANCE_TAB_ROUTES[tab] as any);
}

type GuidanceContextValue = {
  activeTarget: GuidanceTarget | null;
  activeTargetId: string | null;
  startGuidance: (target: GuidanceTarget, label?: string, options?: GuidanceStartOptions) => void;
  cancelGuidance: () => void;
  /** Goes back to the previous tutorial step, restoring its screen. */
  goBackInTutorial: () => void;
  registerTarget: (target: RegisteredTarget) => () => void;
  updateTargetRect: (id: string, rect: Rect | null) => void;
  isMuted: boolean;
  setMuted: (muted: boolean) => void;
  replayVoice: () => void;
};

const TAB_ORDER: GuidanceTab[] = ['chat', 'home', 'todo', 'calendar'];
const LOCATED_TARGET_DISMISS_MS = 4500;

const GuidanceContext = createContext<GuidanceContextValue | null>(null);
const noopGuidanceContext: GuidanceContextValue = {
  activeTarget: null,
  activeTargetId: null,
  startGuidance: () => {},
  cancelGuidance: () => {},
  goBackInTutorial: () => {},
  registerTarget: () => () => {},
  updateTargetRect: () => {},
  isMuted: false,
  setMuted: () => {},
  replayVoice: () => {},
};

function getCurrentTab(pathname: string): GuidanceTab | null {
  const normalized = String(pathname || '').toLowerCase();
  if (normalized.includes('/chat')) return 'chat';
  if (normalized.includes('/home')) return 'home';
  if (normalized.includes('/todo')) return 'todo';
  if (normalized.includes('/calendar')) return 'calendar';
  return null;
}

function getTabDisplayLabel(tab: GuidanceTab) {
  if (tab === 'chat') return 'Chat';
  if (tab === 'home') return 'Home';
  if (tab === 'todo') return 'Todo';
  return 'Calendar';
}

function getTabGuidanceMessage(tab: GuidanceTab) {
  return `Tap ${getTabDisplayLabel(tab)} in the bottom bar.`;
}

function getTabFallbackRect(tab: GuidanceTab, bottomInset: number): Rect {
  const { width, height } = Dimensions.get('window');
  const index = Math.max(0, TAB_ORDER.indexOf(tab));

  if (Platform.OS === 'ios') {
    const tabWidth = width / TAB_ORDER.length;
    const centerX = tabWidth * index + tabWidth / 2;
    const centerY = height - Math.max(54, bottomInset + 28);

    return {
      x: centerX - 17,
      y: centerY - 17,
      width: 34,
      height: 34,
    };
  }

  const horizontalMargin = 48;
  const tabBarWidth = Math.max(240, width - horizontalMargin * 2);
  const tabWidth = tabBarWidth / TAB_ORDER.length;
  const centerX = horizontalMargin + tabWidth * index + tabWidth / 2;
  const centerY = height - 38;

  return {
    x: centerX - 18,
    y: centerY - 18,
    width: 36,
    height: 36,
  };
}

function getHomeSectionFromTarget(target: GuidanceTarget) {
  if (target.type !== 'screen') return '';
  const section = String(target.params?.manageAccountSection || '');
  if (section) return section;
  return target.params?.manageAccount === 'true' || target.params?.manageAccount === true
    ? 'settings'
    : '';
}

function isHomeSettingsTarget(target: GuidanceTarget) {
  return target.type === 'screen' && (target.params?.settings === 'true' || target.params?.settings === true);
}

function getHomeSettingsPanelFromTarget(target: GuidanceTarget) {
  if (target.type !== 'screen' || !isHomeSettingsTarget(target)) return '';
  return String(target.params?.settingsPanel || '');
}

function getHomeSettingsControlFromTarget(target: GuidanceTarget) {
  if (target.type !== 'screen' || !isHomeSettingsTarget(target)) return '';
  return String(target.params?.settingsControl || '');
}

function getHomeSettingsPanelRowControl(panel: string) {
  if (panel === 'aiPersonalization') return 'aiPersonalization';
  if (panel === 'homePersonalization') return 'homePersonalization';
  if (panel === 'legalSupport') return 'legalSupport';
  return '';
}

function getChatActionFromTarget(target: GuidanceTarget) {
  if (target.type !== 'screen') return '';
  return String(target.params?.chatAction || '');
}

function getScreenControlAction(target: GuidanceTarget, key: string) {
  if (target.type !== 'screen') return '';
  return String(target.params?.[key] || '');
}

function isTutorialGuidanceTarget(target: GuidanceTarget) {
  if (target.type !== 'screen') return false;
  return [
    getChatActionFromTarget(target),
    getScreenControlAction(target, 'todoAction'),
    getScreenControlAction(target, 'calendarAction'),
    getScreenControlAction(target, 'homeAction'),
  ].some((action) => action.startsWith('tutorial-'));
}

function getControlMessage(tab: GuidanceTab, action: string) {
  if (tab === 'todo') {
    if (action === 'search') return 'Tap search.';
    if (action === 'create') return 'Tap Create.';
    if (action === 'tutorial-actions') return TODO_TUTORIAL_AI_GUIDANCE_MESSAGE;
    if (action === 'tutorial-video') return TODO_TUTORIAL_VIDEO_GUIDANCE_MESSAGE;
    if (action === 'tutorial-choice') return TODO_TUTORIAL_CHOOSE_GUIDANCE_MESSAGE;
    if (action === 'tutorial-accept-plan') return TODO_TUTORIAL_ACCEPT_PLAN_MESSAGE;
    if (action === 'tutorial-pick-video') return TODO_TUTORIAL_PICK_VIDEO_MESSAGE;
    if (action === 'tutorial-video-ready') return TODO_TUTORIAL_VIDEO_READY_MESSAGE;
    if (action === 'tutorial-details-back') return GOAL_TUTORIAL_HANDOFF_MESSAGE;
    if (action === 'tutorial-goal-timeframes') return GOAL_TUTORIAL_TIMEFRAMES_MESSAGE;
    if (action === 'tutorial-goal-actions') return GOAL_TUTORIAL_ACTIONS_MESSAGE;
    if (action === 'tutorial-goal-question') return GOAL_TUTORIAL_QUESTION_MESSAGE;
    if (action === 'tutorial-goal-eazee-button') return GOAL_TUTORIAL_AI_BAR_MESSAGE;
    if (action === 'tutorial-goal-ai-bar') return GOAL_TUTORIAL_AI_BAR_MESSAGE;
    if (action === 'tutorial-goal-accept-plan') return GOAL_TUTORIAL_ACCEPT_PLAN_MESSAGE;
    if (action === 'tutorial-goal-summary') return GOAL_TUTORIAL_SUMMARY_MESSAGE;
    if (action === 'tutorial-complete') return TUTORIAL_COMPLETE_FOR_NOW_MESSAGE;
  }
  if (tab === 'calendar' && action === 'search') {
    return 'Tap event search.';
  }
  if (tab === 'calendar') {
    if (action === 'tutorial-create') return CALENDAR_TUTORIAL_CREATE_EVENT_MESSAGE;
    if (action === 'tutorial-created') return CALENDAR_TUTORIAL_EVENT_CREATED_MESSAGE;
  }
  if (tab === 'home') {
    if (action === 'tutorial-open-home') return CALENDAR_TUTORIAL_EVENT_CREATED_MESSAGE;
    if (action === 'tutorial-overview') return HOME_TUTORIAL_OVERVIEW_MESSAGE;
    if (action === 'tutorial-next-step') return HOME_TUTORIAL_NEXT_STEP_MESSAGE;
    if (action === 'tutorial-todays-plan') return HOME_TUTORIAL_TODAYS_PLAN_MESSAGE;
    if (action === 'tutorial-complete') return TUTORIAL_COMPLETE_FOR_NOW_MESSAGE;
  }
  return 'Tap here.';
}

function getBackTargetStep(
  tab: GuidanceTab,
  hasTarget: (id: string) => boolean,
  message = 'Tap back.',
  options?: { includeHomeRootBack?: boolean }
) {
  if (tab === 'home') {
    const settingsBackTargetId = getHomeSettingsBackGuidanceTargetId();
    if (hasTarget(settingsBackTargetId)) {
      return {
        key: 'home-settings-back',
        targetId: settingsBackTargetId,
        message: 'Tap back to return to Home settings.',
      };
    }

    const accountBackTargetId = getHomeAccountBackGuidanceTargetId();
    if (hasTarget(accountBackTargetId)) {
      return {
        key: 'home-account-back',
        targetId: accountBackTargetId,
        message,
      };
    }

    const homeBackTargetId = getHomeBackGuidanceTargetId();
    if (options?.includeHomeRootBack && hasTarget(homeBackTargetId)) {
      return {
        key: 'home-back',
        targetId: homeBackTargetId,
        message: 'Tap back to return to Home.',
      };
    }
  }

  if (tab === 'todo') {
    const todoBackTargetId = getTodoBackGuidanceTargetId();
    if (hasTarget(todoBackTargetId)) {
      return {
        key: 'todo-back',
        targetId: todoBackTargetId,
        message,
      };
    }
  }

  if (tab === 'calendar') {
    const calendarBackTargetId = getCalendarBackGuidanceTargetId();
    if (hasTarget(calendarBackTargetId)) {
      return {
        key: 'calendar-back',
        targetId: calendarBackTargetId,
        message,
      };
    }
  }

  return null;
}

function buildGuidanceStep(params: {
  target: GuidanceTarget;
  label: string;
  pathname: string;
  currentTabOverride?: GuidanceTab | null;
  hasTarget: (id: string) => boolean;
  currentTodoWorkspaceKey?: string | null;
  todoWorkspaceKeys?: string[];
  keepLocatedTargetCard?: boolean;
}): GuidanceStep {
  const { target, label, pathname, currentTabOverride, hasTarget, currentTodoWorkspaceKey, todoWorkspaceKeys = [], keepLocatedTargetCard = false } = params;
  const currentTab = currentTabOverride || getCurrentTab(pathname);
  const targetTab = getGuidanceTargetTab(target);
  const chatAction = getChatActionFromTarget(target);
  const todoAction = getScreenControlAction(target, 'todoAction');
  const calendarAction = getScreenControlAction(target, 'calendarAction');
  const homeAction = getScreenControlAction(target, 'homeAction');
  const homeSection = getHomeSectionFromTarget(target);
  const homeSettingsPanel = getHomeSettingsPanelFromTarget(target);
  const homeSettingsControl = getHomeSettingsControlFromTarget(target);
  const homeSectionTargetId = homeSection ? getHomeAccountGuidanceTargetId(homeSection) : '';
  const isHomeSectionReachable = !!homeSection && currentTab === 'home';
  const homeAccountSettingsTargetId = getHomeAccountGuidanceTargetId('settings');
  const currentBackStep = currentTab
    ? getBackTargetStep(currentTab, hasTarget, 'Tap back.', { includeHomeRootBack: true })
    : null;
  const buildTabHandoffStep = (tab: GuidanceTab, message = getTabGuidanceMessage(tab)): GuidanceStep => {
    if (currentBackStep) return currentBackStep;

    return {
      key: `tab-${tab}`,
      targetId: getTabGuidanceTargetId(tab),
      message,
    };
  };
  const buildTodoWorkspaceMessage = (workspaceKey: string) => {
    const currentIndex = todoWorkspaceKeys.indexOf(String(currentTodoWorkspaceKey || ''));
    const targetIndex = todoWorkspaceKeys.indexOf(workspaceKey);
    if (currentIndex === -1 || targetIndex === -1 || currentIndex === targetIndex) {
      return { message: 'Swipe left.', direction: 'left' as const };
    }

    const direction = targetIndex > currentIndex ? 'left' as const : 'right' as const;
    return {
      message: `Swipe ${direction}.`,
      direction,
    };
  };

  if (chatAction === 'eazee-button' || chatAction === 'ai-bar' || chatAction === 'plan-day') {
    if (targetTab && currentTab !== targetTab) {
      return buildTabHandoffStep(targetTab);
    }

    return {
      key: `chat-${chatAction}`,
      targetId: chatAction === 'eazee-button'
          ? getChatEazeeButtonGuidanceTargetId()
          : chatAction === 'plan-day'
            ? getChatPlanDayComposerGuidanceTargetId()
          : getChatAiBarGuidanceTargetId(),
      message: chatAction === 'eazee-button'
        ? CHAT_TUTORIAL_EAZEE_BUTTON_MESSAGE
        : chatAction === 'ai-bar'
          ? CHAT_TUTORIAL_AI_BAR_MESSAGE
          : CHAT_DAY_PLAN_TUTORIAL_MESSAGE,
    };
  }

  if (chatAction === 'tutorial-save-plan') {
    if (targetTab && currentTab !== targetTab) {
      return buildTabHandoffStep(targetTab);
    }
    const savePlanTargetId = getChatSavePlanGuidanceTargetId();
    return {
      key: 'chat-tutorial-save-plan',
      targetId: hasTarget(savePlanTargetId) ? savePlanTargetId : undefined,
      message: CHAT_DAY_PLAN_SAVE_TUTORIAL_MESSAGE,
    };
  }

  if (chatAction === 'tutorial-open-chat') {
    if (targetTab && currentTab !== targetTab) {
      return buildTabHandoffStep(targetTab, WISHLIST_TUTORIAL_CHAT_HANDOFF_MESSAGE);
    }

    return {
      key: 'chat-tutorial-open-chat',
      message: WISHLIST_TUTORIAL_CHAT_HANDOFF_MESSAGE,
    };
  }

  if (chatAction === 'tutorial-wishlist') {
    if (targetTab && currentTab !== targetTab) {
      return buildTabHandoffStep(targetTab, WISHLIST_TUTORIAL_CHAT_HANDOFF_MESSAGE);
    }

    return {
      key: 'chat-tutorial-wishlist',
      message: WISHLIST_TUTORIAL_MESSAGE,
    };
  }

  if (chatAction === 'tutorial-wishlist-message') {
    if (targetTab && currentTab !== targetTab) {
      return buildTabHandoffStep(targetTab, WISHLIST_TUTORIAL_CHAT_HANDOFF_MESSAGE);
    }

    return {
      key: 'chat-tutorial-wishlist-message',
      targetId: getChatWishlistMessageGuidanceTargetId(),
      message: WISHLIST_TUTORIAL_PROMPT_MESSAGE,
      disableBackdrop: true,
    };
  }

  if (chatAction === 'tutorial-complete') {
    if (targetTab && currentTab !== targetTab) {
      return buildTabHandoffStep(targetTab);
    }

    return {
      key: 'chat-tutorial-complete',
      message: TUTORIAL_COMPLETE_FOR_NOW_MESSAGE,
    };
  }

  if (chatAction === 'history' || chatAction === 'new') {
    if (targetTab && currentTab !== targetTab) {
      return buildTabHandoffStep(targetTab);
    }

    return {
      key: `chat-header-${chatAction}`,
      targetId: getChatHeaderGuidanceTargetId(chatAction),
      message: chatAction === 'history' ? 'Tap chat history.' : 'Tap new chat.',
    };
  }

  if (todoAction) {
    if (currentTab !== 'todo') {
      return buildTabHandoffStep('todo');
    }
    const targetId = todoAction === 'tutorial-details-back'
      ? getTodoBackGuidanceTargetId()
      : getTodoControlGuidanceTargetId(todoAction);
    if (!hasTarget(targetId)) {
      if (todoAction.startsWith('tutorial-')) {
        return {
          key: `todo-control-${todoAction}`,
          message: getControlMessage('todo', todoAction),
        };
      }
      const backStep = getBackTargetStep('todo', hasTarget);
      if (backStep) return backStep;
    }
    return {
      key: `todo-control-${todoAction}`,
      targetId,
      message: getControlMessage('todo', todoAction),
    };
  }

  if (calendarAction) {
    if (currentTab !== 'calendar') {
      return buildTabHandoffStep(
        'calendar',
        calendarAction === 'tutorial-create' &&
          target.type === 'screen' &&
          target.params?.calendarTutorialHandoff === 'goal-complete'
          ? GOAL_TO_CALENDAR_TUTORIAL_HANDOFF_MESSAGE
          : getTabGuidanceMessage('calendar')
      );
    }
    const targetId = calendarAction.startsWith('tutorial-') ? undefined : getCalendarControlGuidanceTargetId(calendarAction);
    if (targetId && !hasTarget(targetId)) {
      const backStep = getBackTargetStep('calendar', hasTarget);
      if (backStep) return backStep;
    }
    return {
      key: `calendar-control-${calendarAction}`,
      targetId,
      message: getControlMessage('calendar', calendarAction),
    };
  }

  if (homeAction) {
    if (currentTab !== 'home') {
      return buildTabHandoffStep(
        'home',
        homeAction === 'tutorial-open-home'
          ? getControlMessage('home', homeAction)
          : getTabGuidanceMessage('home')
      );
    }
    const targetId = homeAction === 'tutorial-open-home' || homeAction === 'tutorial-overview' || homeAction === 'tutorial-complete'
      ? undefined
      : getHomeControlGuidanceTargetId(homeAction);
    if (targetId && !hasTarget(targetId)) {
      const backStep = getBackTargetStep('home', hasTarget);
      if (backStep) return backStep;
    }
    return {
      key: `home-control-${homeAction}`,
      targetId,
      message: getControlMessage('home', homeAction),
      disableBackdrop: homeAction === 'tutorial-overview',
    };
  }

  if (homeSettingsControl) {
    if (targetTab && currentTab !== targetTab) {
      return buildTabHandoffStep(targetTab);
    }

    const controlTargetId = getHomeSettingsControlGuidanceTargetId(homeSettingsControl);
    if (hasTarget(controlTargetId)) {
      return {
        key: `home-settings-control-${homeSettingsControl}`,
        targetId: controlTargetId,
        message: `Here is ${label}.`,
        completeAfterMs: LOCATED_TARGET_DISMISS_MS,
        hideActions: true,
      };
    }

    const backStep = getBackTargetStep('home', hasTarget);
    if (backStep) return backStep;

    const panelRowControl = getHomeSettingsPanelRowControl(homeSettingsPanel);
    if (panelRowControl) {
      const panelRowTargetId = getHomeSettingsControlGuidanceTargetId(panelRowControl);
      if (hasTarget(panelRowTargetId)) {
        return {
          key: `home-settings-open-${homeSettingsPanel}`,
          targetId: panelRowTargetId,
          message: `Tap ${getGuidanceTargetLabel({
            type: 'screen',
            route: '/(tabs)/home',
            params: {
              settings: 'true',
              settingsControl: panelRowControl,
            },
          })}.`,
        };
      }
    }

    if (currentTab === 'home') {
      return {
        key: 'home-settings',
        targetId: getHomeSettingsGuidanceTargetId(),
        message: 'Tap the settings icon.',
      };
    }
  }

  if (isHomeSettingsTarget(target)) {
    if (targetTab && currentTab !== targetTab) {
      return buildTabHandoffStep(targetTab);
    }

    const backStep = getBackTargetStep('home', hasTarget);
    if (backStep) return backStep;

    const settingsPanelTargetId = getHomeSettingsPanelGuidanceTargetId();
    if (hasTarget(settingsPanelTargetId)) {
      return {
        key: 'home-settings-panel',
        targetId: settingsPanelTargetId,
        message: `Here is ${label}.`,
        completeAfterMs: LOCATED_TARGET_DISMISS_MS,
        hideActions: true,
      };
    }

    if (currentTab === 'home') {
      return {
        key: 'home-settings',
        targetId: getHomeSettingsGuidanceTargetId(),
        message: 'Tap the settings icon.',
      };
    }
  }

  if (homeSection) {
    if (targetTab && currentTab !== targetTab) {
      return buildTabHandoffStep(targetTab);
    }

    if (homeSectionTargetId && hasTarget(homeSectionTargetId)) {
      return {
        key: `home-section-${homeSection}`,
        targetId: homeSectionTargetId,
        message: `Here is ${label}.`,
        completeAfterMs: LOCATED_TARGET_DISMISS_MS,
        hideActions: true,
      };
    }

    const backStep = getBackTargetStep('home', hasTarget, 'Tap back to return to Manage Account.');
    if (backStep) return backStep;

    if (isHomeSectionReachable && hasTarget(homeAccountSettingsTargetId)) {
      return {
        key: 'home-account-settings',
        targetId: homeAccountSettingsTargetId,
        message: 'Tap Manage Account.',
      };
    }

    if (isHomeSectionReachable) {
      return {
        key: 'home-settings',
        targetId: getHomeSettingsGuidanceTargetId(),
        message: 'Tap the settings icon.',
      };
    }
  }

  if (targetTab && currentTab !== targetTab) {
    return buildTabHandoffStep(targetTab);
  }

  if (target.type === 'todo') {
    const workspaceId = getTodoWorkspaceGuidanceTargetId(target.workspaceKey);
    const backStep = getBackTargetStep('todo', hasTarget);
    if (currentTodoWorkspaceKey && currentTodoWorkspaceKey !== target.workspaceKey) {
      if (backStep) return backStep;
      const workspaceStep = buildTodoWorkspaceMessage(target.workspaceKey);
      return {
        key: `todo-workspace-${target.workspaceKey}`,
        message: workspaceStep.message,
        showSwipeHint: true,
        swipeDirection: workspaceStep.direction,
      };
    }

    const itemId = getTodoItemGuidanceTargetId(target.todoId);
    if (hasTarget(itemId)) {
      return {
        key: `todo-item-${target.todoId}`,
        targetId: itemId,
        message: `Here is ${label}.`,
        completeAfterMs: keepLocatedTargetCard ? undefined : LOCATED_TARGET_DISMISS_MS,
        hideActions: !keepLocatedTargetCard,
      };
    }

    if (backStep) return backStep;

    return {
      key: `todo-find-${target.todoId}`,
      targetId: hasTarget(workspaceId) ? workspaceId : undefined,
      message: `Find ${label} in ${target.workspaceKey}.`,
    };
  }

  if (target.type === 'event') {
    const eventId = getCalendarEventGuidanceTargetId(target.eventId);
    if (hasTarget(eventId)) {
      return {
        key: `event-${target.eventId}`,
        targetId: eventId,
        message: `Here is ${label}.`,
        completeAfterMs: LOCATED_TARGET_DISMISS_MS,
        hideActions: true,
      };
    }

    const backStep = getBackTargetStep('calendar', hasTarget);
    if (backStep) return backStep;

    return {
      key: `event-find-${target.eventId}`,
      message: `Find ${label} on your calendar.`,
    };
  }

  if (target.type === 'screen' && targetTab === 'todo') {
    const backStep = getBackTargetStep('todo', hasTarget);
    if (backStep) return backStep;

    const workspaceKey = typeof target.params?.workspaceKey === 'string' ? target.params.workspaceKey : '';
    if (workspaceKey) {
      const workspaceId = getTodoWorkspaceGuidanceTargetId(workspaceKey);
      if (currentTodoWorkspaceKey && currentTodoWorkspaceKey !== workspaceKey) {
        const workspaceStep = buildTodoWorkspaceMessage(workspaceKey);
        return {
          key: `screen-todo-workspace-${workspaceKey}`,
          message: workspaceStep.message,
          showSwipeHint: true,
          swipeDirection: workspaceStep.direction,
        };
      }

      return {
        key: `complete-todo-workspace-${workspaceKey}`,
        message: `You are on ${label}.`,
        completeAfterMs: workspaceKey === 'Goals' ? undefined : 1300,
      };
    }
  }

  if (targetTab) {
    const backStep = getBackTargetStep(targetTab, hasTarget, 'Tap back.', {
      includeHomeRootBack: targetTab === 'home',
    });
    if (backStep) return backStep;
  }

  return {
    key: `complete-${targetTab || 'target'}`,
    message: `You are on ${label}.`,
    completeAfterMs: 1300,
  };
}

function usePulseAnimation(enabled: boolean) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) {
      value.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [enabled, value]);

  return value;
}

function useSwipeHintAnimation(enabled: boolean) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) {
      value.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 1250,
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(180),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [enabled, value]);

  return value;
}

function useAnimatedCardTop(enabled: boolean, targetTop: number) {
  const value = useRef(new Animated.Value(targetTop)).current;
  const didInitializeRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      didInitializeRef.current = false;
      value.setValue(targetTop);
      return;
    }

    if (!didInitializeRef.current) {
      didInitializeRef.current = true;
      value.setValue(targetTop);
      return;
    }

    const animation = Animated.timing(value, {
      toValue: targetTop,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();

    return () => animation.stop();
  }, [enabled, targetTop, value]);

  return value;
}

export function GuidanceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const registryRef = useRef(new Map<string, RegisteredTarget>());
  const rectsRef = useRef(new Map<string, Rect>());
  const voicePlaybackRef = useRef<GuidanceVoicePlayback | null>(null);
  const voiceRequestIdRef = useRef(0);
  const swipeMessageRef = useRef<{
    sessionId: string;
    direction: 'left' | 'right' | null;
    workspaceKey: string | null;
    repeatCount: number;
    hasSeenSwipe: boolean;
  }>({
    sessionId: '',
    direction: null,
    workspaceKey: null,
    repeatCount: 0,
    hasSeenSwipe: false,
  });
  const [session, setSession] = useState<GuidanceSession | null>(null);
  const [hiddenCardSessionId, setHiddenCardSessionId] = useState<string | null>(null);
  const [, setRectsVersion] = useState(0);
  const [registryVersion, setRegistryVersion] = useState(0);
  const [isMuted, setMuted] = useState(false);
  const [todoWorkspaceKey, setTodoWorkspaceKey] = useState<string | null>(null);
  const [todoWorkspaceKeys, setTodoWorkspaceKeys] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<GuidanceTab | null>(() => getGuidanceActiveTab());

  useEffect(() => subscribeGuidanceActiveTab(setActiveTab), []);

  useEffect(() => {
    if (!session) return;

    const updateWorkspace = () => {
      const state = getSharedTodoWorkspaceState();
      setTodoWorkspaceKey(state.currentWorkspaceKey || null);
      setTodoWorkspaceKeys(state.workspaceKeys || []);
    };

    updateWorkspace();
    const interval = setInterval(updateWorkspace, 350);
    return () => clearInterval(interval);
  }, [session]);

  const hasTarget = useCallback((id: string) => registryRef.current.has(id), []);

  const step = useMemo(() => {
    if (!session) return null;
    return buildGuidanceStep({
      target: session.target,
      label: session.label,
      pathname,
      currentTabOverride: activeTab,
      hasTarget,
      currentTodoWorkspaceKey: todoWorkspaceKey,
      todoWorkspaceKeys,
      keepLocatedTargetCard: session.keepLocatedTargetCard,
    });
  }, [activeTab, hasTarget, pathname, registryVersion, session, todoWorkspaceKey, todoWorkspaceKeys]);

  const visibleStep = useMemo(() => {
    if (!session || !step) {
      swipeMessageRef.current = {
        sessionId: '',
        direction: null,
        workspaceKey: null,
        repeatCount: 0,
        hasSeenSwipe: false,
      };
      return step;
    }

    if (!step.showSwipeHint || !step.swipeDirection) {
      swipeMessageRef.current = {
        sessionId: session.id,
        direction: null,
        workspaceKey: todoWorkspaceKey,
        repeatCount: 0,
        hasSeenSwipe: false,
      };
      return step;
    }

    const current = swipeMessageRef.current;
    if (current.sessionId !== session.id) {
      swipeMessageRef.current = {
        sessionId: session.id,
        direction: step.swipeDirection,
        workspaceKey: todoWorkspaceKey,
        repeatCount: 0,
        hasSeenSwipe: true,
      };
      return step;
    }

    const workspaceChanged =
      current.workspaceKey !== null &&
      todoWorkspaceKey !== null &&
      current.workspaceKey !== todoWorkspaceKey;
    const directionRepeated = current.direction === step.swipeDirection;
    const repeatCount = current.hasSeenSwipe && workspaceChanged && directionRepeated
      ? current.repeatCount + 1
      : directionRepeated
        ? current.repeatCount
        : 0;

    swipeMessageRef.current = {
      sessionId: session.id,
      direction: step.swipeDirection,
      workspaceKey: todoWorkspaceKey,
      repeatCount,
      hasSeenSwipe: true,
    };

    return {
      ...step,
      message: repeatCount > 0 ? `Swipe ${step.swipeDirection} again.` : `Swipe ${step.swipeDirection}.`,
    };
  }, [session, step, todoWorkspaceKey]);

  // The tutorial steps shown so far, oldest first, so "back" works on every step:
  // a step without its own back reopens the step before it.
  const tutorialHistoryRef = useRef<{
    key: string;
    target: GuidanceTarget;
    label?: string;
    options?: GuidanceStartOptions;
    /** The tab the step was shown on (a "Tap Calendar" step is shown on To Do). */
    tab: GuidanceTab | null;
  }[]>([]);
  const startGuidanceRef = useRef<(target: GuidanceTarget, label?: string, options?: GuidanceStartOptions) => void>(() => {});
  const showPreviousTutorialStep = useCallback(() => {
    const history = tutorialHistoryRef.current;
    history.pop();
    const previous = history[history.length - 1];
    if (!previous) return;
    if (previous.options?.restore) {
      previous.options.restore();
      return;
    }
    if (previous.tab) showGuidanceTab(previous.tab);
    startGuidanceRef.current(previous.target, previous.label, previous.options);
  }, []);

  const startGuidance = useCallback((target: GuidanceTarget, label?: string, options?: GuidanceStartOptions) => {
    const resolvedLabel = label?.trim() || getGuidanceTargetLabel(target);
    let onBack = options?.onBack;
    if (options?.onSkipSegment) {
      const key = JSON.stringify(target);
      const history = tutorialHistoryRef.current;
      // Coming back to a step already shown (its own back, or a replay) drops what came after it.
      const shownAt = history.findIndex((entry) => entry.key === key);
      const tab = shownAt >= 0 ? history[shownAt].tab : getGuidanceActiveTab();
      if (shownAt >= 0) history.splice(shownAt);
      history.push({ key, target, label, options, tab });
      if (!onBack && history.length > 1) onBack = showPreviousTutorialStep;
    }
    setHiddenCardSessionId(null);
    setSession({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      target,
      label: resolvedLabel,
      onCancel: options?.onCancel,
      onBack,
      onNext: options?.onNext,
      onSkipSegment: options?.onSkipSegment,
      nextLabel: options?.nextLabel,
      completeAfterMs: options?.completeAfterMs,
      autoNextAfterMs: options?.autoNextAfterMs,
      hideCardAfterMs: options?.hideCardAfterMs,
      keepLocatedTargetCard: options?.keepLocatedTargetCard,
      useTutorialCardPlacement: options?.useTutorialCardPlacement ?? isTutorialGuidanceTarget(target),
    });
  }, [showPreviousTutorialStep]);
  startGuidanceRef.current = startGuidance;

  const cancelGuidance = useCallback(() => {
    voiceRequestIdRef.current += 1;
    voicePlaybackRef.current?.stop();
    voicePlaybackRef.current = null;
    setHiddenCardSessionId(null);
    setSession(null);
  }, []);

  const cancelGuidanceFromOverlay = useCallback(() => {
    const handleCancel = session?.onCancel;
    cancelGuidance();
    handleCancel?.();
  }, [cancelGuidance, session]);

  // "skip all" on a tutorial card ends the whole tutorial, after a confirmation.
  // "skip" on a "Tap X in the bottom bar" card (where next waits for that tap): skips this part
  // of the tutorial, which leads to the next part's card.
  const skipTabStepFromOverlay = useCallback(() => {
    const handleSkip = session?.onSkipSegment;
    cancelGuidance();
    handleSkip?.();
  }, [cancelGuidance, session]);

  const skipGuidanceSegmentFromOverlay = useCallback(() => {
    confirmSkipWholeTutorial(cancelGuidance);
  }, [cancelGuidance]);

  const registerTarget = useCallback((target: RegisteredTarget) => {
    registryRef.current.set(target.id, target);
    setRegistryVersion((value) => value + 1);
    target.measure();

    return () => {
      registryRef.current.delete(target.id);
      rectsRef.current.delete(target.id);
      setRegistryVersion((value) => value + 1);
      setRectsVersion((value) => value + 1);
    };
  }, []);

  const updateTargetRect = useCallback((id: string, rect: Rect | null) => {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      rectsRef.current.delete(id);
    } else {
      rectsRef.current.set(id, rect);
    }
    setRectsVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!visibleStep?.targetId) return;

    const measure = () => {
      registryRef.current.get(visibleStep.targetId || '')?.measure();
    };
    measure();
    const interval = setInterval(measure, 280);

    return () => clearInterval(interval);
  }, [visibleStep?.targetId]);

  const replayVoice = useCallback(() => {
    if (!visibleStep?.message) return;

    const requestId = voiceRequestIdRef.current + 1;
    voiceRequestIdRef.current = requestId;
    voicePlaybackRef.current?.stop();
    voicePlaybackRef.current = null;
    void playGuidanceVoice(visibleStep.message, { muted: isMuted }).then((playback) => {
      if (voiceRequestIdRef.current !== requestId) {
        playback?.stop();
        return;
      }
      voicePlaybackRef.current = playback;
    });
  }, [isMuted, visibleStep?.message]);

  useEffect(() => {
    replayVoice();
  }, [replayVoice]);

  useEffect(() => () => {
    voiceRequestIdRef.current += 1;
    voicePlaybackRef.current?.stop();
    voicePlaybackRef.current = null;
  }, []);

  useEffect(() => {
    if (session?.onSkipSegment) return;
    const completeAfterMs = session?.completeAfterMs ?? visibleStep?.completeAfterMs;
    if (!completeAfterMs) return;

    const timeout = setTimeout(cancelGuidance, completeAfterMs);
    return () => clearTimeout(timeout);
  }, [cancelGuidance, session?.completeAfterMs, session?.onSkipSegment, visibleStep?.completeAfterMs, visibleStep?.key]);

  useEffect(() => {
    if (!session?.autoNextAfterMs || !session.onNext) return;

    const timeout = setTimeout(session.onNext, session.autoNextAfterMs);
    return () => clearTimeout(timeout);
  }, [session?.autoNextAfterMs, session?.id, session?.onNext]);

  useEffect(() => {
    if (!session?.hideCardAfterMs) return;

    const sessionId = session.id;
    const timeout = setTimeout(() => {
      setHiddenCardSessionId(sessionId);
    }, session.hideCardAfterMs);
    return () => clearTimeout(timeout);
  }, [session?.hideCardAfterMs, session?.id]);

  const value = useMemo<GuidanceContextValue>(() => ({
    activeTarget: session?.target || null,
    activeTargetId: visibleStep?.targetId || null,
    startGuidance,
    cancelGuidance,
    goBackInTutorial: showPreviousTutorialStep,
    registerTarget,
    updateTargetRect,
    isMuted,
    setMuted,
    replayVoice,
  }), [
    cancelGuidance,
    showPreviousTutorialStep,
    isMuted,
    registerTarget,
    replayVoice,
    session?.target,
    visibleStep?.targetId,
    startGuidance,
    updateTargetRect,
  ]);

  const activeRect = visibleStep?.targetId
    ? rectsRef.current.get(visibleStep.targetId) ||
      (visibleStep.targetId.startsWith('tab:')
        ? getTabFallbackRect(visibleStep.targetId.replace('tab:', '') as GuidanceTab, insets.bottom)
        : null)
    : null;
  const activeHighlightMode = visibleStep?.targetId
    ? registryRef.current.get(visibleStep.targetId)?.highlightMode || 'overlay'
    : 'overlay';

  return (
    <GuidanceContext.Provider value={value}>
      {children}
      <GuidanceOverlay
        step={visibleStep}
        rect={activeRect}
        activeTab={activeTab}
        isTabTarget={!!visibleStep?.targetId?.startsWith('tab:')}
        usesLocalHighlight={activeHighlightMode === 'local'}
        hideInstructionCard={!!session && hiddenCardSessionId === session.id}
        onCancel={cancelGuidanceFromOverlay}
        onBack={session?.onBack}
        onNext={session?.onNext}
        onSkipSegment={session?.onSkipSegment ? skipGuidanceSegmentFromOverlay : undefined}
        nextLabel={session?.nextLabel}
        onSkipTabStep={session?.onSkipSegment ? skipTabStepFromOverlay : undefined}
        showNextButton
        useTutorialCardPlacement={!!session?.useTutorialCardPlacement}
      />
    </GuidanceContext.Provider>
  );
}

export function useGuidance() {
  const context = useContext(GuidanceContext);
  return context || noopGuidanceContext;
}

export function GuidedTarget({
  targetId,
  label,
  children,
  style,
  highlightMode = 'local',
  highlightWhenTargetId,
  highlightWhenTargetIds,
  localHighlightColor = '#AEFFE8',
  localHighlightBackgroundColor = 'rgba(174, 255, 232, 0.08)',
  localHighlightInset = 5,
  localHighlightLeftInset,
  localHighlightRightInset,
  localHighlightTopInset,
  localHighlightBottomInset,
  localHighlightRadius = 18,
  localHighlightShape = 'circle',
  localHighlightVisible = true,
  localHighlightPulseScale = 1.08,
  localHighlightShadowRadius = 14,
  localHighlightShadowOpacity = 0.75,
  localHighlightCirclePadding = 5,
}: {
  targetId: string;
  label?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  highlightMode?: 'overlay' | 'local';
  highlightWhenTargetId?: string;
  highlightWhenTargetIds?: string[];
  localHighlightColor?: string;
  localHighlightBackgroundColor?: string;
  localHighlightInset?: number;
  localHighlightLeftInset?: number;
  localHighlightRightInset?: number;
  localHighlightTopInset?: number;
  localHighlightBottomInset?: number;
  localHighlightRadius?: number;
  localHighlightShape?: 'circle' | 'rect';
  localHighlightVisible?: boolean;
  localHighlightPulseScale?: number;
  localHighlightShadowRadius?: number;
  localHighlightShadowOpacity?: number;
  localHighlightCirclePadding?: number;
}) {
  const ref = useRef<View | null>(null);
  const { activeTargetId, registerTarget, updateTargetRect } = useGuidance();
  const highlightedTargetIds = useMemo(
    () => [targetId, highlightWhenTargetId, ...(highlightWhenTargetIds || [])].filter(Boolean),
    [highlightWhenTargetId, highlightWhenTargetIds, targetId]
  );
  const isLocallyHighlighted = highlightMode === 'local' && !!activeTargetId && highlightedTargetIds.includes(activeTargetId);
  const [localSize, setLocalSize] = useState<{ width: number; height: number } | null>(null);
  const pulse = usePulseAnimation(isLocallyHighlighted);

  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      const node = ref.current as any;
      if (!node?.measureInWindow) return;

      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        updateTargetRect(targetId, { x, y, width, height });
      });
    });
  }, [targetId, updateTargetRect]);

  useEffect(() => registerTarget({ id: targetId, label, highlightMode, measure }), [highlightMode, label, measure, registerTarget, targetId]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLocalSize({ width, height });
    measure();
  }, [measure]);
  const circleGlowSize = localSize ? Math.max(localSize.width, localSize.height) + localHighlightCirclePadding * 2 : 0;
  const leftInset = localHighlightLeftInset ?? localHighlightInset;
  const rightInset = localHighlightRightInset ?? localHighlightInset;
  const topInset = localHighlightTopInset ?? localHighlightInset;
  const bottomInset = localHighlightBottomInset ?? localHighlightInset;
  const localGlowFrame = localSize && localHighlightShape === 'circle'
    ? {
        left: (localSize.width - circleGlowSize) / 2,
        top: (localSize.height - circleGlowSize) / 2,
        width: circleGlowSize,
        height: circleGlowSize,
        borderRadius: circleGlowSize / 2,
      }
    : localSize
      ? {
          left: -leftInset,
          top: -topInset,
          width: localSize.width + leftInset + rightInset,
          height: localSize.height + topInset + bottomInset,
          borderRadius: localHighlightRadius,
        }
    : {
        top: -topInset,
        right: -rightInset,
        bottom: -bottomInset,
        left: -leftInset,
        borderRadius: localHighlightRadius,
      };

  return (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="box-none"
      onLayout={handleLayout}
      style={[highlightMode === 'local' && styles.localHighlightRoot, style]}
    >
      {isLocallyHighlighted && localHighlightVisible ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.localHighlightRing,
            {
              ...localGlowFrame,
              borderColor: localHighlightColor,
              backgroundColor: localHighlightBackgroundColor,
              shadowColor: localHighlightColor,
              shadowRadius: localHighlightShadowRadius,
              shadowOpacity: localHighlightShadowOpacity,
              opacity: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.92, 0.34],
              }),
              transform: [{
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, localHighlightPulseScale],
                }),
              }],
            },
          ]}
        />
      ) : null}
      {children}
    </View>
  );
}

function GuidanceBlurBackdrop({
  width,
  height,
  cardRect,
  targetRect,
  swipeRect,
}: {
  width: number;
  height: number;
  cardRect: Rect;
  targetRect: Rect | null;
  swipeRect: Rect | null;
}) {
  const cardCx = cardRect.x + cardRect.width / 2;
  const cardCy = cardRect.y + cardRect.height / 2;
  const cardRx = Math.max(80, cardRect.width / 2 + 28);
  const cardRy = Math.max(68, cardRect.height / 2 + 28);
  const targetCx = targetRect ? targetRect.x + targetRect.width / 2 : -200;
  const targetCy = targetRect ? targetRect.y + targetRect.height / 2 : -200;
  const targetRx = targetRect ? Math.max(40, targetRect.width / 2 + 24) : 1;
  const targetRy = targetRect ? Math.max(40, targetRect.height / 2 + 24) : 1;
  const swipeCx = swipeRect ? swipeRect.x + swipeRect.width / 2 : -200;
  const swipeCy = swipeRect ? swipeRect.y + swipeRect.height / 2 : -200;
  const swipeRx = swipeRect ? swipeRect.width / 2 : 1;
  const swipeRy = swipeRect ? swipeRect.height / 2 : 1;

  // A plain View owns the "no touches" rule: on Android the native MaskedView and
  // BlurView ignore pointerEvents, and would swallow taps meant for the highlighted
  // target (e.g. "Tap Home in the bottom bar").
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <MaskedView
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      maskElement={(
        <Svg width={width} height={height}>
          <Defs>
            <RadialGradient id="guidanceCardHole" cx={cardCx} cy={cardCy} rx={cardRx} ry={cardRy} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#000000" stopOpacity="1" />
              <Stop offset="0.58" stopColor="#000000" stopOpacity="1" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
            </RadialGradient>
            <RadialGradient id="guidanceTargetHole" cx={targetCx} cy={targetCy} rx={targetRx} ry={targetRy} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#000000" stopOpacity="1" />
              <Stop offset="0.52" stopColor="#000000" stopOpacity="1" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
            </RadialGradient>
            <RadialGradient id="guidanceSwipeHole" cx={swipeCx} cy={swipeCy} rx={swipeRx} ry={swipeRy} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#000000" stopOpacity="1" />
              <Stop offset="0.72" stopColor="#000000" stopOpacity="1" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
            </RadialGradient>
            <Mask id="guidanceBackdropMask" x="0" y="0" width={width} height={height} maskUnits="userSpaceOnUse">
              <SvgRect x="0" y="0" width={width} height={height} fill="#FFFFFF" />
              <Ellipse cx={cardCx} cy={cardCy} rx={cardRx} ry={cardRy} fill="url(#guidanceCardHole)" />
              {targetRect ? <Ellipse cx={targetCx} cy={targetCy} rx={targetRx} ry={targetRy} fill="url(#guidanceTargetHole)" /> : null}
              {swipeRect ? <Ellipse cx={swipeCx} cy={swipeCy} rx={swipeRx} ry={swipeRy} fill="url(#guidanceSwipeHole)" /> : null}
            </Mask>
          </Defs>
          <SvgRect x="0" y="0" width={width} height={height} fill="#FFFFFF" mask="url(#guidanceBackdropMask)" />
        </Svg>
      )}
    >
      <BlurView pointerEvents="none" intensity={8.64} tint="dark" style={StyleSheet.absoluteFill}>
        <View pointerEvents="none" style={styles.backdropDim} />
      </BlurView>
    </MaskedView>
    </View>
  );
}

function GuidanceOverlay({
  step,
  rect,
  activeTab,
  isTabTarget,
  onCancel,
  onBack,
  onNext,
  onSkipSegment,
  nextLabel = 'next',
  onSkipTabStep,
  usesLocalHighlight,
  hideInstructionCard,
  showNextButton,
  useTutorialCardPlacement,
}: {
  step: GuidanceStep | null;
  rect: Rect | null;
  activeTab: GuidanceTab | null;
  isTabTarget: boolean;
  usesLocalHighlight: boolean;
  hideInstructionCard: boolean;
  onCancel: () => void;
  onBack?: () => void;
  onNext?: () => void;
  onSkipSegment?: () => void;
  nextLabel?: string;
  onSkipTabStep?: () => void;
  showNextButton: boolean;
  useTutorialCardPlacement: boolean;
}) {
  const pulse = usePulseAnimation(!!step);
  const swipeProgress = useSwipeHintAnimation(!!step?.showSwipeHint);
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
  const minCardHeight = 152;
  // Longer messages (and the button row) make the card taller: place it by its real height
  // so it never runs into the input bar or covers its target.
  const [measuredCardHeight, setMeasuredCardHeight] = useState(minCardHeight);
  const cardHeight = Math.max(minCardHeight, measuredCardHeight);
  const isTodoTab = activeTab === 'todo';
  const isTodoMainCardTarget = !!step?.targetId?.startsWith('todo:item:');
  const isGoalTutorialCardTarget = [
    'tutorial-video-ready',
    'tutorial-details-back',
    'tutorial-goal-timeframes',
    'tutorial-goal-actions',
    'tutorial-goal-question',
    'tutorial-goal-eazee-button',
    'tutorial-goal-ai-bar',
    'tutorial-goal-accept-plan',
    'tutorial-goal-summary',
    'tutorial-complete',
  ].some((action) => step?.targetId === getTodoControlGuidanceTargetId(action)) || step?.targetId === getTodoBackGuidanceTargetId();
  const isTodoAcceptPlanTutorialCardTarget = step?.targetId === getTodoControlGuidanceTargetId('tutorial-accept-plan');
  const usesFixedBottomCard =
    !useTutorialCardPlacement ||
    activeTab === 'chat' ||
    activeTab === 'home' ||
    activeTab === 'calendar' ||
    isTabTarget ||
    isTodoMainCardTarget ||
    isGoalTutorialCardTarget ||
    isTodoAcceptPlanTutorialCardTarget;
  const fixedCardBottom = 160;
  // The card's bottom edge stays where a short card's always was, so taller cards grow upward.
  const defaultCardTop = Math.max(58, windowHeight - (usesFixedBottomCard ? fixedCardBottom : isTodoTab ? 250 : 202) - cardHeight);
  // The card must never cover what it asks the user to tap: when it would, it
  // moves above the target, or below it when there is no room above.
  const cardTop = (() => {
    if (!rect) return defaultCardTop;
    const gap = 16;
    const targetTop = rect.y - gap;
    const targetBottom = rect.y + rect.height + gap;
    const overlaps = defaultCardTop < targetBottom && defaultCardTop + cardHeight > targetTop;
    if (!overlaps) return defaultCardTop;
    const above = targetTop - cardHeight;
    if (above >= 58) return above;
    return Math.min(targetBottom, windowHeight - cardHeight - 24);
  })();
  const movedAwayFromTarget = cardTop !== defaultCardTop;
  const cardRadius = isTodoTab && !isTabTarget && !isTodoMainCardTarget && !isGoalTutorialCardTarget ? 20 : 30;
  const animatedCardTop = useAnimatedCardTop(!!step, cardTop);

  if (!step) return null;
  const stepNext = isTabTarget ? onSkipTabStep : onNext;
  const stepNextLabel = isTabTarget ? 'skip' : nextLabel;
  const isSmallIconTarget =
    isTabTarget ||
    step.targetId === getHomeSettingsGuidanceTargetId() ||
    step.targetId === getChatHeaderGuidanceTargetId('history') ||
    step.targetId === getChatHeaderGuidanceTargetId('new');
  const ringPadding = isSmallIconTarget ? 3 : 8;
  const baseRingRect = rect
    ? (() => {
        if (!isSmallIconTarget) return rect;
        const size = isTabTarget ? 36 : 34;
        return {
          x: rect.x + rect.width / 2 - size / 2,
          y: rect.y + rect.height / 2 - size / 2,
          width: size,
          height: size,
        };
      })()
    : null;
  const ringSize = baseRingRect
    ? {
        left: Math.max(4, baseRingRect.x - ringPadding),
        top: Math.max(4, baseRingRect.y - ringPadding),
        width: baseRingRect.width + ringPadding * 2,
        height: baseRingRect.height + ringPadding * 2,
      }
    : null;

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, isSmallIconTarget ? 1.05 : 1.1],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 0.38],
  });
  const cardRect = {
    x: 18,
    y: cardTop,
    width: Math.max(0, windowWidth - 36),
    height: cardHeight,
  };
  const targetClearRect = baseRingRect
    ? (() => {
        const targetClearPadding = step.targetId === getHomeControlGuidanceTargetId('tutorial-todays-plan') ? 28 : 16;
        return {
          x: Math.max(0, baseRingRect.x - targetClearPadding),
          y: Math.max(0, baseRingRect.y - targetClearPadding),
          width: Math.min(windowWidth, baseRingRect.width + targetClearPadding * 2),
          height: Math.min(windowHeight, baseRingRect.height + targetClearPadding * 2),
        };
      })()
    : null;
  const swipeRect = step.showSwipeHint
    ? (() => {
        const width = 332;
        const height = 82;
        const y = windowHeight - 144 - 46 - 18;
        return step.swipeDirection === 'right'
          ? { x: 16, y, width, height }
          : { x: Math.max(0, windowWidth - width - 16), y, width, height };
      })()
    : null;

  return (
    <View pointerEvents="box-none" style={styles.overlayRoot}>
      {!hideInstructionCard && !step.disableBackdrop && (
        <GuidanceBlurBackdrop
          width={windowWidth}
          height={windowHeight}
          cardRect={cardRect}
          targetRect={targetClearRect}
          swipeRect={swipeRect}
        />
      )}
      {rect && ringSize && !usesLocalHighlight ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.highlightRing,
            {
              left: ringSize.left,
              top: ringSize.top,
              width: ringSize.width,
              height: ringSize.height,
              borderRadius: isSmallIconTarget ? 999 : Math.min(28, Math.max(18, ringSize.height / 2)),
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      ) : null}
      {step.showSwipeHint ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeHint,
            step.swipeDirection === 'right' ? styles.swipeHintFromLeft : styles.swipeHintFromRight,
            {
              opacity: swipeProgress.interpolate({
                inputRange: [0, 0.08, 0.82, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateX: swipeProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: step.swipeDirection === 'right' ? [0, 260] : [0, -260],
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons name={step.swipeDirection === 'right' ? 'arrow-forward' : 'arrow-back'} size={23} color="#FFFFFF" />
        </Animated.View>
      ) : null}
      {!hideInstructionCard && (
        <Animated.View
          pointerEvents="auto"
          style={[
            styles.instructionCard,
            usesFixedBottomCard && !movedAwayFromTarget
              ? { bottom: fixedCardBottom, minHeight: minCardHeight, borderRadius: cardRadius }
              : { top: animatedCardTop, minHeight: minCardHeight, borderRadius: cardRadius },
          ]}
          onLayout={(event) => {
            const height = Math.round(event.nativeEvent.layout.height);
            setMeasuredCardHeight((current) => (Math.abs(current - height) > 1 ? height : current));
          }}
        >
          <Text style={[styles.instructionText, onSkipSegment && styles.instructionTextWithPills]}>{step.message}</Text>
          {!step.hideActions || onSkipSegment ? (
            <View style={[styles.instructionActions, onSkipSegment && styles.tutorialActions]}>
              {onSkipSegment ? (
                <>
                  {/* back on the left; skip all and next on the right, as separate pills. */}
                  <Pressable
                    disabled={!onBack}
                    onPress={onBack}
                    style={[styles.tutorialPill, !onBack && styles.instructionButtonDisabled]}
                    hitSlop={8}
                  >
                    <Text style={styles.tutorialPillText}>back</Text>
                  </Pressable>
                  <View style={styles.tutorialPillGroup}>
                    <Pressable onPress={onSkipSegment} style={styles.tutorialPill} hitSlop={8}>
                      <Text style={styles.tutorialPillText}>skip all</Text>
                    </Pressable>
                    {/* "Tap X in the bottom bar" waits for that tap: next is greyed out there,
                        even when the step it leads to has its own next or skip. */}
                    <Pressable
                      disabled={!stepNext}
                      onPress={stepNext}
                      style={[styles.tutorialPill, styles.tutorialPillPrimary, !stepNext && styles.instructionButtonDisabled]}
                      hitSlop={8}
                    >
                      <Text style={[styles.tutorialPillText, styles.tutorialPillPrimaryText]}>{stepNext ? stepNextLabel : 'next'}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Pressable onPress={onCancel} style={styles.skipButton} hitSlop={12}>
                    <Text style={styles.skipButtonText}>skip</Text>
                  </Pressable>
                  {onNext && showNextButton ? (
                    <Pressable onPress={onNext} style={styles.nextButton} hitSlop={12}>
                      <Text style={styles.nextButtonText}>next</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  backdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.036)',
  },
  highlightRing: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#AEFFE8',
    backgroundColor: 'rgba(174, 255, 232, 0.08)',
    shadowColor: '#AEFFE8',
    shadowOpacity: 0.7,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  localHighlightRoot: {
    position: 'relative',
  },
  localHighlightRing: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#AEFFE8',
    backgroundColor: 'rgba(174, 255, 232, 0.08)',
    shadowColor: '#AEFFE8',
    shadowOpacity: 0.75,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  instructionCard: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 20,
    backgroundColor: 'rgba(8, 15, 18, 0.93)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  instructionActions: {
    position: 'absolute',
    right: 18,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    zIndex: 20,
    elevation: 20,
  },
  nextButton: {
    minWidth: 34,
    minHeight: 30,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  nextButtonText: {
    color: '#AEFFE8',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  skipButton: {
    minHeight: 30,
    justifyContent: 'center',
  },
  skipButtonText: {
    color: '#AEFFE8',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  tutorialActions: {
    left: 18,
    bottom: 16,
    justifyContent: 'space-between',
  },
  tutorialPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tutorialPill: {
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(174, 255, 232, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tutorialPillPrimary: {
    minWidth: 76,
    backgroundColor: '#AEFFE8',
    borderColor: '#AEFFE8',
  },
  tutorialPillText: {
    color: '#AEFFE8',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
  },
  tutorialPillPrimaryText: {
    color: '#04403A',
  },
  instructionTextWithPills: {
    paddingBottom: 58,
  },
  instructionButtonDisabled: {
    opacity: 0.35,
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
    paddingBottom: 28,
  },
  swipeHint: {
    position: 'absolute',
    bottom: 144,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 94, 82, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  swipeHintFromRight: {
    right: 34,
  },
  swipeHintFromLeft: {
    left: 34,
  },
});
