import AsyncStorage from '@react-native-async-storage/async-storage';

export type NavigationHelpMode = 'guide' | 'shortcut';

export type GuidanceTab = 'chat' | 'home' | 'todo' | 'calendar';

export type GuidanceTarget =
  | {
      type: 'screen';
      route: string;
      params?: Record<string, any>;
    }
  | {
      type: 'todo';
      todoId: string;
      workspaceKey: string;
    }
  | {
      type: 'event';
      eventId: string;
      source: 'local' | 'google';
      startDate: string;
      googleEventId?: string;
    };

export const NAVIGATION_HELP_MODE_STORAGE_KEY = 'navigationHelpMode:v1';
export const DEFAULT_NAVIGATION_HELP_MODE: NavigationHelpMode = 'guide';

const listeners = new Set<(mode: NavigationHelpMode) => void>();
let navigationShortcutNonceCounter = 0;

const normalizeNavigationHelpMode = (value: unknown): NavigationHelpMode =>
  value === 'shortcut' ? 'shortcut' : 'guide';

export async function readNavigationHelpMode(): Promise<NavigationHelpMode> {
  try {
    const storedMode = await AsyncStorage.getItem(NAVIGATION_HELP_MODE_STORAGE_KEY);
    return normalizeNavigationHelpMode(storedMode);
  } catch {
    return DEFAULT_NAVIGATION_HELP_MODE;
  }
}

export async function writeNavigationHelpMode(mode: NavigationHelpMode) {
  const nextMode = normalizeNavigationHelpMode(mode);
  await AsyncStorage.setItem(NAVIGATION_HELP_MODE_STORAGE_KEY, nextMode);
  listeners.forEach((listener) => listener(nextMode));
}

export function subscribeNavigationHelpMode(listener: (mode: NavigationHelpMode) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getGuidanceTargetTab(target: GuidanceTarget): GuidanceTab | null {
  if (target.type === 'todo') return 'todo';
  if (target.type === 'event') return 'calendar';

  const route = String(target.route || '').toLowerCase();
  if (route.includes('/chat')) return 'chat';
  if (route.includes('/home')) return 'home';
  if (route.includes('/todo')) return 'todo';
  if (route.includes('/calendar')) return 'calendar';
  return null;
}

export function getGuidanceTargetLabel(target: GuidanceTarget, fallback = 'that screen') {
  if (target.type === 'todo') {
    return target.workspaceKey === 'Wishlist'
      ? 'Wishlist item'
      : target.workspaceKey === 'Goals'
        ? 'goal'
        : 'task';
  }

  if (target.type === 'event') {
    return 'event';
  }

  if (target.params?.settings === 'true' || target.params?.settings === true) {
    const settingsControl = String(target.params?.settingsControl || '');
    if (settingsControl === 'navigationMode') return 'Guided Access Mode';
    if (settingsControl === 'leftHanded') return 'Left Handed Mode';
    if (settingsControl === 'aiPersonalization') return 'Intelligence Personalization';
    if (settingsControl === 'aiBasePersonalization') return 'Base personalization';
    if (settingsControl === 'aiEmoji') return 'Emoji personalization';
    if (settingsControl === 'aiResponseLength') return 'Response length';
    if (settingsControl === 'homePersonalization') return 'Home Personalization';
    if (settingsControl === 'homeReorder') return 'Home card reorder';
    if (settingsControl === 'homeNextStep') return 'Next step card';
    if (settingsControl === 'homeSuggestions') return 'Suggestions card';
    if (settingsControl === 'homeTodayPlan') return "Today's plan card";
    if (settingsControl === 'replayTutorial') return 'Replay Tutorial';
    if (settingsControl === 'legalSupport') return 'Legal & Support';
    if (settingsControl === 'privacyPolicy') return 'Privacy Policy';
    if (settingsControl === 'terms') return 'Terms';
    if (settingsControl === 'support') return 'Support';
    return 'Home settings';
  }

  const section = String(target.params?.manageAccountSection || '');
  if (section === 'google') return 'Google connection settings';
  if (section === 'country') return 'country settings';
  if (section === 'profile') return 'your profile';

  const chatAction = String(target.params?.chatAction || '');
  if (chatAction === 'history') return 'chat history';
  if (chatAction === 'new') return 'new chat';
  if (chatAction === 'eazee-button') return 'Eazee button';
  if (chatAction === 'ai-bar' || chatAction === 'plan-day') return 'AI bar';
  if (chatAction === 'tutorial-open-chat') return 'Chat';
  if (chatAction === 'tutorial-wishlist') return 'Wishlist';
  if (chatAction === 'tutorial-wishlist-message') return 'AI bar';
  if (chatAction === 'tutorial-complete') return 'tutorial complete';

  const todoAction = String(target.params?.todoAction || '');
  if (todoAction === 'search') return 'todo search';
  if (todoAction === 'create') return 'Create todo';
  if (todoAction === 'tutorial-actions') return 'AI Guidance';
  if (todoAction === 'tutorial-video') return 'Video Guidance';
  if (todoAction === 'tutorial-choice') return 'guidance options';
  if (todoAction === 'tutorial-accept-plan') return 'Accept plan';
  if (todoAction === 'tutorial-pick-video') return 'video list';
  if (todoAction === 'tutorial-video-ready') return 'video steps';
  if (todoAction === 'tutorial-details-back') return 'back button';
  if (todoAction === 'tutorial-goal-timeframes') return 'Goals workspace';
  if (todoAction === 'tutorial-goal-actions') return 'Actions plan';
  if (todoAction === 'tutorial-goal-question') return 'guidance question';
  if (todoAction === 'tutorial-goal-eazee-button') return 'Eazee button';
  if (todoAction === 'tutorial-goal-ai-bar') return 'AI bar';
  if (todoAction === 'tutorial-goal-accept-plan') return 'Accept plan';
  if (todoAction === 'tutorial-goal-summary') return 'goal tasks';
  if (todoAction === 'tutorial-complete') return 'tutorial complete';

  const calendarAction = String(target.params?.calendarAction || '');
  if (calendarAction === 'search') return 'event search';
  if (calendarAction === 'tutorial-create') return 'Calendar tutorial';
  if (calendarAction === 'tutorial-created') return 'event created';

  const homeAction = String(target.params?.homeAction || '');
  if (homeAction === 'tutorial-open-home') return 'Home';
  if (homeAction === 'tutorial-overview') return 'Home';
  if (homeAction === 'tutorial-next-step') return 'Next step';
  if (homeAction === 'tutorial-todays-plan') return "Today's plan";
  if (homeAction === 'tutorial-complete') return 'tutorial complete';

  const tab = getGuidanceTargetTab(target);
  if (tab === 'chat') return 'Chat';
  if (tab === 'home') return 'Home';
  if (tab === 'todo') return 'Tasks';
  if (tab === 'calendar') return 'Calendar';

  return fallback;
}

export function getShortcutForGuidanceTarget(target: GuidanceTarget, fallback?: {
  route?: string;
  params?: Record<string, any>;
}) {
  navigationShortcutNonceCounter += 1;
  const timestamp = `${Date.now()}-${navigationShortcutNonceCounter}`;

  if (target.type === 'todo') {
    return {
      pathname: '/(tabs)/todo',
      params: {
        workspaceKey: target.workspaceKey,
        openTodoId: target.todoId,
        openTodoNonce: timestamp,
      },
    };
  }

  if (target.type === 'event') {
    return {
      pathname: '/(tabs)/calendar',
      params: {
        openEventId: target.eventId,
        openEventSource: target.source,
        openNonce: timestamp,
      },
    };
  }

  const params = { ...(fallback?.params || target.params || {}) };
  if (params.workspaceKey) {
    params.workspaceNonce = timestamp;
  }
  if ((params.manageAccount === 'true' || params.manageAccount === true) && params.manageAccountSection) {
    params.manageAccountNonce = timestamp;
  }
  if (params.settings === 'true' || params.settings === true) {
    params.settingsNonce = timestamp;
  }
  if (params.chatAction) {
    params.chatActionNonce = timestamp;
  }
  if (params.todoAction) {
    params.todoActionNonce = timestamp;
  }
  if (params.calendarAction) {
    params.calendarActionNonce = timestamp;
  }
  if (params.homeAction) {
    params.homeActionNonce = timestamp;
  }

  return {
    pathname: fallback?.route || target.route,
    params,
  };
}

export function getGuidanceTargetFromShortcut(
  route?: string,
  params?: Record<string, any>
): GuidanceTarget | null {
  const routeValue = String(route || '').trim();
  if (!routeValue) return null;

  if (routeValue.includes('/todo') && params?.openTodoId) {
    return {
      type: 'todo',
      todoId: String(params.openTodoId),
      workspaceKey: String(params.workspaceKey || 'Personal'),
    };
  }

  if (routeValue.includes('/calendar') && params?.openEventId) {
    return {
      type: 'event',
      eventId: String(params.openEventId),
      source: params.openEventSource === 'google' ? 'google' : 'local',
      startDate: String(params.startDate || new Date().toISOString()),
    };
  }

  return {
    type: 'screen',
    route: routeValue,
    params: params || {},
  };
}

export const getTabGuidanceTargetId = (tab: GuidanceTab) => `tab:${tab}`;

export const getTodoWorkspaceGuidanceTargetId = (workspaceKey: string) =>
  `todo:workspace:${workspaceKey}`;

export const getTodoItemGuidanceTargetId = (todoId: string) =>
  `todo:item:${todoId}`;

export const getCalendarEventGuidanceTargetId = (eventId: string) =>
  `calendar:event:${eventId}`;

export const getHomeSettingsGuidanceTargetId = () => 'home:settings';

export const getHomeBackGuidanceTargetId = () => 'home:back';

export const getHomeSettingsPanelGuidanceTargetId = () => 'home:settings:panel';

export const getHomeSettingsBackGuidanceTargetId = () => 'home:settings:back';

export const getHomeSettingsControlGuidanceTargetId = (control: string) =>
  `home:settings:${control}`;

export const getHomeAccountGuidanceTargetId = (section: string) =>
  `home:account:${section || 'settings'}`;

export const getHomeAccountBackGuidanceTargetId = () => 'home:account:back';

export const getChatHeaderGuidanceTargetId = (action: 'history' | 'new') =>
  `chat:header:${action}`;

export const getChatEazeeButtonGuidanceTargetId = () => 'chat:eazee-button';

export const getChatAiBarGuidanceTargetId = () => 'chat:ai-bar';

export const getChatPlanDayComposerGuidanceTargetId = () => 'chat:plan-day-composer';
/** The Save plan button on the day plan Eazee suggests in the walkthrough. */
export const getChatSavePlanGuidanceTargetId = () => 'chat:save-plan';

export const getChatWishlistMessageGuidanceTargetId = () => 'chat:wishlist-message';


export const getTodoControlGuidanceTargetId = (action: string) =>
  `todo:control:${action}`;

export const getTodoBackGuidanceTargetId = () => 'todo:back';

export const getCalendarControlGuidanceTargetId = (action: string) =>
  `calendar:control:${action}`;

export const getCalendarBackGuidanceTargetId = () => 'calendar:back';

export const getHomeControlGuidanceTargetId = (action: string) =>
  `home:control:${action}`;
