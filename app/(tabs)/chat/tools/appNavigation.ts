import type { ToolHandler } from './todo';

export type AppScreenDestination =
  | 'chat'
  | 'chat_history'
  | 'chat_new'
  | 'home'
  | 'home_settings'
  | 'home_guided_access_mode'
  | 'home_left_handed_mode'
  | 'home_ai_personalization'
  | 'home_ai_base_personalization'
  | 'home_ai_emoji'
  | 'home_ai_response_length'
  | 'home_personalization'
  | 'home_personalization_reorder'
  | 'home_personalization_next_step'
  | 'home_personalization_suggestions'
  | 'home_personalization_today_plan'
  | 'home_replay_tutorial'
  | 'home_legal_support'
  | 'home_privacy_policy'
  | 'home_terms'
  | 'home_support'
  | 'home_profile'
  | 'home_country'
  | 'home_google_connection'
  | 'todo'
  | 'todo_search'
  | 'todo_create'
  | 'todo_goals'
  | 'todo_personal'
  | 'todo_wishlist'
  | 'calendar'
  | 'calendar_search';

const DESTINATION_LABELS: Record<AppScreenDestination, string> = {
  chat: 'Chat',
  chat_history: 'chat history',
  chat_new: 'new chat',
  home: 'Home',
  home_settings: 'Home settings',
  home_guided_access_mode: 'Guided Access Mode',
  home_left_handed_mode: 'Left Handed Mode',
  home_ai_personalization: 'Intelligence Personalization',
  home_ai_base_personalization: 'Base personalization',
  home_ai_emoji: 'Emoji personalization',
  home_ai_response_length: 'Response length',
  home_personalization: 'Home Personalization',
  home_personalization_reorder: 'Home card reorder',
  home_personalization_next_step: 'Next step card',
  home_personalization_suggestions: 'Suggestions card',
  home_personalization_today_plan: "Today's plan card",
  home_replay_tutorial: 'Replay Tutorial',
  home_legal_support: 'Legal & Support',
  home_privacy_policy: 'Privacy Policy',
  home_terms: 'Terms',
  home_support: 'Support',
  home_profile: 'your profile',
  home_country: 'country settings',
  home_google_connection: 'Google connection settings',
  todo: 'Tasks',
  todo_search: 'todo search',
  todo_create: 'Create todo',
  todo_goals: 'Goals',
  todo_personal: 'Personal',
  todo_wishlist: 'Wishlist',
  calendar: 'Calendar',
  calendar_search: 'event search',
};

const TODO_WORKSPACE_BY_DESTINATION: Partial<Record<AppScreenDestination, string>> = {
  todo_goals: 'Goals',
  todo_personal: 'Personal',
  todo_wishlist: 'Wishlist',
};

const HOME_SECTION_BY_DESTINATION: Partial<Record<AppScreenDestination, string>> = {
  home_profile: 'profile',
  home_country: 'country',
  home_google_connection: 'google',
};

const HOME_SETTINGS_TARGET_BY_DESTINATION: Partial<Record<AppScreenDestination, {
  settingsPanel?: string;
  settingsControl: string;
}>> = {
  home_guided_access_mode: { settingsControl: 'navigationMode' },
  home_left_handed_mode: { settingsControl: 'leftHanded' },
  home_ai_personalization: { settingsPanel: 'aiPersonalization', settingsControl: 'aiPersonalization' },
  home_ai_base_personalization: { settingsPanel: 'aiPersonalization', settingsControl: 'aiBasePersonalization' },
  home_ai_emoji: { settingsPanel: 'aiPersonalization', settingsControl: 'aiEmoji' },
  home_ai_response_length: { settingsPanel: 'aiPersonalization', settingsControl: 'aiResponseLength' },
  home_personalization: { settingsPanel: 'homePersonalization', settingsControl: 'homePersonalization' },
  home_personalization_reorder: { settingsPanel: 'homePersonalization', settingsControl: 'homeReorder' },
  home_personalization_next_step: { settingsPanel: 'homePersonalization', settingsControl: 'homeNextStep' },
  home_personalization_suggestions: { settingsPanel: 'homePersonalization', settingsControl: 'homeSuggestions' },
  home_personalization_today_plan: { settingsPanel: 'homePersonalization', settingsControl: 'homeTodayPlan' },
  home_replay_tutorial: { settingsControl: 'replayTutorial' },
  home_legal_support: { settingsPanel: 'legalSupport', settingsControl: 'legalSupport' },
  home_privacy_policy: { settingsPanel: 'legalSupport', settingsControl: 'privacyPolicy' },
  home_terms: { settingsPanel: 'legalSupport', settingsControl: 'terms' },
  home_support: { settingsPanel: 'legalSupport', settingsControl: 'support' },
};

const CHAT_ACTION_BY_DESTINATION: Partial<Record<AppScreenDestination, 'history' | 'new'>> = {
  chat_history: 'history',
  chat_new: 'new',
};

const TODO_ACTION_BY_DESTINATION: Partial<Record<AppScreenDestination, string>> = {
  todo_search: 'search',
  todo_create: 'create',
};

const CALENDAR_ACTION_BY_DESTINATION: Partial<Record<AppScreenDestination, string>> = {
  calendar_search: 'search',
};

let workspaceNavigationNonce = 0;
let homeNavigationNonce = 0;

function getChatDestinationFromText(value: string): AppScreenDestination | null {
  const normalized = value.toLowerCase();
  if (/\b(chat history|previous chats?|chat list|conversation history|conversations)\b/.test(normalized)) {
    return 'chat_history';
  }
  if (/\b(new chat|create chat|start chat|plus chat button|new conversation)\b/.test(normalized)) {
    return 'chat_new';
  }
  return null;
}

function getControlDestinationFromText(value: string): AppScreenDestination | null {
  const normalized = value.toLowerCase();
  if (/\b(todo search|search todos?|search tasks?)\b/.test(normalized)) return 'todo_search';
  if (/\b(create todo|new todo|add todo|create task|add task)\b/.test(normalized)) return 'todo_create';
  if (/\b(event search|calendar search|search events?|search calendar)\b/.test(normalized)) return 'calendar_search';
  if (/\b(guided access|guided mode|direct mode|navigation mode)\b/.test(normalized)) return 'home_guided_access_mode';
  if (/\b(left handed|left-handed)\b/.test(normalized)) return 'home_left_handed_mode';
  if (/\b(intelligence personalization|ai personalization)\b/.test(normalized)) return 'home_ai_personalization';
  if (/\b(base personalization|positive|postiive|neutral|netural|roast mode|roas mode)\b/.test(normalized)) return 'home_ai_base_personalization';
  if (/\bemoji personalization|emoji setting|emojis?\b/.test(normalized)) return 'home_ai_emoji';
  if (/\b(response length|long response|medium response|short response)\b/.test(normalized)) return 'home_ai_response_length';
  if (/\b(home personalization)\b/.test(normalized)) return 'home_personalization';
  if (/\b(reorder|rearrange).*\b(home cards?|next step|suggestions|today'?s plan)\b/.test(normalized)) return 'home_personalization_reorder';
  if (/\bnext step\b/.test(normalized)) return 'home_personalization_next_step';
  if (/\bsuggestions?\b/.test(normalized)) return 'home_personalization_suggestions';
  if (/\btoday'?s plan\b/.test(normalized)) return 'home_personalization_today_plan';
  if (/\b(replay|restart).*\btutorial\b|\btutorial replay\b/.test(normalized)) return 'home_replay_tutorial';
  if (/\bprivacy policy|privacy\b/.test(normalized)) return 'home_privacy_policy';
  if (/\bterms|t&c|conditions\b/.test(normalized)) return 'home_terms';
  if (/\bsupport email|contact support|email support\b/.test(normalized)) return 'home_support';
  if (/\blegal|support|help\b/.test(normalized)) return 'home_legal_support';
  return null;
}

function buildRoute(destination: AppScreenDestination) {
  const chatAction = CHAT_ACTION_BY_DESTINATION[destination];
  if (chatAction) {
    return {
      route: '/(tabs)/chat',
      params: {
        chatAction,
        chatActionNonce: `${Date.now()}-${chatAction}`,
      },
    };
  }

  const todoAction = TODO_ACTION_BY_DESTINATION[destination];
  if (todoAction) {
    return {
      route: '/(tabs)/todo',
      params: {
        todoAction,
        todoActionNonce: `${Date.now()}-${todoAction}`,
      },
    };
  }

  const calendarAction = CALENDAR_ACTION_BY_DESTINATION[destination];
  if (calendarAction) {
    return {
      route: '/(tabs)/calendar',
      params: {
        calendarAction,
        calendarActionNonce: `${Date.now()}-${calendarAction}`,
      },
    };
  }

  if (destination === 'home_settings') {
    homeNavigationNonce += 1;
    return {
      route: '/(tabs)/home',
      params: {
        settings: 'true',
        settingsNonce: `${Date.now()}-${homeNavigationNonce}`,
      },
    };
  }

  const homeSettingsTarget = HOME_SETTINGS_TARGET_BY_DESTINATION[destination];
  if (homeSettingsTarget) {
    homeNavigationNonce += 1;
    const params: Record<string, string> = {
      settings: 'true',
      settingsControl: homeSettingsTarget.settingsControl,
      settingsNonce: `${Date.now()}-${homeNavigationNonce}`,
    };
    if (homeSettingsTarget.settingsPanel) {
      params.settingsPanel = homeSettingsTarget.settingsPanel;
    }

    return {
      route: '/(tabs)/home',
      params,
    };
  }

  const todoWorkspace = TODO_WORKSPACE_BY_DESTINATION[destination];
  if (todoWorkspace) {
    workspaceNavigationNonce += 1;
    return {
      route: '/(tabs)/todo',
      params: {
        workspaceKey: todoWorkspace,
        workspaceNonce: `${Date.now()}-${workspaceNavigationNonce}`,
      },
    };
  }

  const homeSection = HOME_SECTION_BY_DESTINATION[destination];
  if (homeSection) {
    homeNavigationNonce += 1;
    return {
      route: '/(tabs)/home',
      params: {
        manageAccount: 'true',
        manageAccountSection: homeSection,
        manageAccountNonce: `${Date.now()}-${homeNavigationNonce}`,
      },
    };
  }

  if (destination === 'chat') {
    return { route: '/(tabs)/chat', params: {} };
  }

  if (destination === 'todo') {
    return { route: '/(tabs)/todo', params: {} };
  }

  if (destination === 'calendar') {
    return { route: '/(tabs)/calendar', params: {} };
  }

  return { route: '/(tabs)/home', params: {} };
}

const normalizeDestination = (value: unknown, requestText = ''): AppScreenDestination => {
  const rawDestination = String(value || '').trim();
  const normalizedDestination = rawDestination.toLowerCase().replace(/[\s-]+/g, '_') as AppScreenDestination;
  const combinedText = `${rawDestination} ${requestText}`;
  const textDestination = getChatDestinationFromText(combinedText) || getControlDestinationFromText(combinedText);
  if ((
    normalizedDestination === 'chat' ||
    normalizedDestination === 'home' ||
    normalizedDestination === 'home_settings' ||
    normalizedDestination === 'todo' ||
    normalizedDestination === 'calendar' ||
    !normalizedDestination
  ) && textDestination) {
    return textDestination;
  }
  const destination = normalizedDestination as AppScreenDestination;
  if (destination in DESTINATION_LABELS) {
    return destination;
  }
  return 'home';
};

export const appNavigationToolHandlers: Record<string, ToolHandler> = {
  app_open_screen: async (args: any) => {
    const destination = normalizeDestination(args?.destination, String(args?.requestText || ''));
    const target = buildRoute(destination);

    return {
      destination,
      label: DESTINATION_LABELS[destination],
      route: target.route,
      params: target.params,
      guidanceTarget: {
        type: 'screen',
        route: target.route,
        params: target.params,
      },
    };
  },
};
