jest.mock('../../../../../database/database', () => ({
  database: {
    collections: {
      get: jest.fn(() => ({
        query: jest.fn(() => ({
          fetch: jest.fn(async () => []),
        })),
      })),
    },
    write: jest.fn(),
  },
}));

jest.mock('../../../../../lib/todoMutations', () => ({
  createTodos: jest.fn(async () => []),
  deleteTodos: jest.fn(async () => []),
  updateTodos: jest.fn(async () => []),
}));

jest.mock('@/app/context/TokenContext', () => ({
  getAccessTokenStatic: jest.fn(async () => null),
}));

jest.mock('@/firebaseConfig', () => ({
  auth: { currentUser: null },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(async () => undefined),
  multiGet: jest.fn(async () => []),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { executeToolCall } = require('../engine');

const openScreen = (destination: string, requestText = '') =>
  executeToolCall(
    {
      name: 'app_open_screen',
      arguments: { destination },
    },
    { serverUrl: 'http://localhost', requestText }
  );

describe('app_open_screen', () => {
  it('opens Wishlist directly from chat', async () => {
    const result = await openScreen('todo_wishlist');

    expect(result.success).toBe(true);
    expect(result.messages[0]?.content).toBe("Here's a shortcut to Wishlist.");
    expect(result.messages[0]?.card).toMatchObject({
      type: 'navigationShortcut',
      label: 'Wishlist',
      route: '/(tabs)/todo',
      params: {
        workspaceKey: 'Wishlist',
        workspaceNonce: expect.any(String),
      },
      target: {
        type: 'screen',
        route: '/(tabs)/todo',
        params: {
          workspaceKey: 'Wishlist',
          workspaceNonce: expect.any(String),
        },
      },
    });
    expect(result.uiActions).toBeUndefined();
  });

  it('opens Goals directly from chat', async () => {
    const result = await openScreen('todo_goals');

    expect(result.messages[0]?.content).toBe("Here's a shortcut to Goals.");
    expect(result.messages[0]?.card).toMatchObject({
      label: 'Goals',
      route: '/(tabs)/todo',
      params: {
        workspaceKey: 'Goals',
        workspaceNonce: expect.any(String),
      },
    });
  });

  it('opens Home settings to the settings layer', async () => {
    const result = await openScreen('home_settings');

    expect(result.messages[0]?.content).toBe("Here's a shortcut to Home settings.");
    expect(result.messages[0]?.card).toMatchObject({
      label: 'Home settings',
      route: '/(tabs)/home',
      params: {
        settings: 'true',
        settingsNonce: expect.any(String),
      },
    });
  });

  it('opens Google connection settings directly from chat', async () => {
    const result = await openScreen('home_google_connection');

    expect(result.messages[0]?.content).toBe("Here's a shortcut to Google connection settings.");
    expect(result.messages[0]?.card).toMatchObject({
      label: 'Google connection settings',
      route: '/(tabs)/home',
      params: {
        manageAccount: 'true',
        manageAccountSection: 'google',
        manageAccountNonce: expect.any(String),
      },
    });
    expect(result.uiActions).toBeUndefined();
  });

  it('opens country settings directly from chat', async () => {
    const result = await openScreen('home_country');

    expect(result.messages[0]?.content).toBe("Here's a shortcut to country settings.");
    expect(result.messages[0]?.card).toMatchObject({
      label: 'country settings',
      route: '/(tabs)/home',
      params: {
        manageAccount: 'true',
        manageAccountSection: 'country',
        manageAccountNonce: expect.any(String),
      },
    });
  });

  it('opens Home settings controls directly from chat', async () => {
    await expect(openScreen('home_ai_response_length')).resolves.toMatchObject({
      messages: [{
        content: "Here's a shortcut to Response length.",
        card: {
          label: 'Response length',
          route: '/(tabs)/home',
          params: {
            settings: 'true',
            settingsPanel: 'aiPersonalization',
            settingsControl: 'aiResponseLength',
            settingsNonce: expect.any(String),
          },
        },
      }],
    });

    await expect(openScreen('home_personalization_suggestions')).resolves.toMatchObject({
      messages: [{
        content: "Here's a shortcut to Suggestions card.",
        card: {
          label: 'Suggestions card',
          route: '/(tabs)/home',
          params: {
            settings: 'true',
            settingsPanel: 'homePersonalization',
            settingsControl: 'homeSuggestions',
            settingsNonce: expect.any(String),
          },
        },
      }],
    });

    await expect(openScreen('home_replay_tutorial')).resolves.toMatchObject({
      messages: [{
        content: "Here's a shortcut to Replay Tutorial.",
        card: {
          label: 'Replay Tutorial',
          route: '/(tabs)/home',
          params: {
            settings: 'true',
            settingsControl: 'replayTutorial',
            settingsNonce: expect.any(String),
          },
        },
      }],
    });
    const replayResult = await openScreen('home_replay_tutorial');
    expect(replayResult.messages[0]?.card?.params).not.toHaveProperty('settingsPanel');

    await expect(openScreen('home_support')).resolves.toMatchObject({
      messages: [{
        content: "Here's a shortcut to Support.",
        card: {
          label: 'Support',
          route: '/(tabs)/home',
          params: {
            settings: 'true',
            settingsPanel: 'legalSupport',
            settingsControl: 'support',
            settingsNonce: expect.any(String),
          },
        },
      }],
    });
  });

  it('refines generic Home settings destinations from request text', async () => {
    await expect(openScreen('home_settings', 'where is response length?')).resolves.toMatchObject({
      messages: [{
        content: "Here's a shortcut to Response length.",
        card: {
          label: 'Response length',
          route: '/(tabs)/home',
          params: {
            settings: 'true',
            settingsPanel: 'aiPersonalization',
            settingsControl: 'aiResponseLength',
            settingsNonce: expect.any(String),
          },
        },
      }],
    });

    await expect(openScreen('home', 'where is roas mode?')).resolves.toMatchObject({
      messages: [{
        content: "Here's a shortcut to Base personalization.",
        card: {
          label: 'Base personalization',
          route: '/(tabs)/home',
          params: {
            settings: 'true',
            settingsPanel: 'aiPersonalization',
            settingsControl: 'aiBasePersonalization',
            settingsNonce: expect.any(String),
          },
        },
      }],
    });
  });

  it('opens app tabs directly from chat', async () => {
    await expect(openScreen('chat')).resolves.toMatchObject({
      messages: [{ content: "Here's a shortcut to Chat.", card: { label: 'Chat', route: '/(tabs)/chat', params: {} } }],
    });
    await expect(openScreen('todo')).resolves.toMatchObject({
      messages: [{ content: "Here's a shortcut to Tasks.", card: { label: 'Tasks', route: '/(tabs)/todo', params: {} } }],
    });
    await expect(openScreen('calendar')).resolves.toMatchObject({
      messages: [{ content: "Here's a shortcut to Calendar.", card: { label: 'Calendar', route: '/(tabs)/calendar', params: {} } }],
    });
  });

  it('opens chat header actions directly from chat', async () => {
    await expect(openScreen('chat_history')).resolves.toMatchObject({
      messages: [{
        content: "Here's a shortcut to chat history.",
        card: {
          label: 'chat history',
          route: '/(tabs)/chat',
          params: {
            chatAction: 'history',
            chatActionNonce: expect.any(String),
          },
          target: {
            type: 'screen',
            route: '/(tabs)/chat',
            params: {
              chatAction: 'history',
              chatActionNonce: expect.any(String),
            },
          },
        },
      }],
    });

    await expect(openScreen('chat_new')).resolves.toMatchObject({
      messages: [{
        content: "Here's a shortcut to new chat.",
        card: {
          label: 'new chat',
          route: '/(tabs)/chat',
          params: {
            chatAction: 'new',
            chatActionNonce: expect.any(String),
          },
          target: {
            type: 'screen',
            route: '/(tabs)/chat',
            params: {
              chatAction: 'new',
              chatActionNonce: expect.any(String),
            },
          },
        },
      }],
    });
  });

  it('corrects generic Chat destinations when the request names a chat header action', async () => {
    await expect(openScreen('chat', 'where is my chat history')).resolves.toMatchObject({
      messages: [{
        content: "Here's a shortcut to chat history.",
        card: {
          label: 'chat history',
          params: {
            chatAction: 'history',
            chatActionNonce: expect.any(String),
          },
        },
      }],
    });

    await expect(openScreen('chat', 'show me the new chat button')).resolves.toMatchObject({
      messages: [{
        content: "Here's a shortcut to new chat.",
        card: {
          label: 'new chat',
          params: {
            chatAction: 'new',
            chatActionNonce: expect.any(String),
          },
        },
      }],
    });
  });

  it('opens toolbar control destinations with action params', async () => {
    await expect(openScreen('todo_create')).resolves.toMatchObject({
      messages: [{
        card: {
          label: 'Create todo',
          route: '/(tabs)/todo',
          params: {
            todoAction: 'create',
            todoActionNonce: expect.any(String),
          },
        },
      }],
    });

    await expect(openScreen('calendar_search')).resolves.toMatchObject({
      messages: [{
        card: {
          label: 'event search',
          route: '/(tabs)/calendar',
          params: {
            calendarAction: 'search',
            calendarActionNonce: expect.any(String),
          },
        },
      }],
    });
  });
});
