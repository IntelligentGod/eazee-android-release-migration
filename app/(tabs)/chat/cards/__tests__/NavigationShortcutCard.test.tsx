import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockUseNavigationHelpMode = jest.fn();
const mockStartGuidance = jest.fn();

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text: MockText } = require('react-native');
  function MockMaterialCommunityIcon({ name }: { name: string }) {
    return <MockText>{name}</MockText>;
  }
  MockMaterialCommunityIcon.displayName = 'MockMaterialCommunityIcon';
  return MockMaterialCommunityIcon;
});

jest.mock('@/lib/useNavigationHelpMode', () => ({
  useNavigationHelpMode: () => mockUseNavigationHelpMode(),
}));

jest.mock('@/components/guidance/GuidanceProvider', () => ({
  useGuidance: () => ({ startGuidance: mockStartGuidance }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NavigationShortcutCard } = require('../NavigationShortcutCard');

describe('NavigationShortcutCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNavigationHelpMode.mockReturnValue({
      mode: 'shortcut',
      setMode: jest.fn(),
      isGuideMode: false,
      isShortcutMode: true,
    });
  });

  it('regenerates the Todo workspace nonce on every tap', async () => {
    const push = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <NavigationShortcutCard
          label="Wishlist"
          route="/(tabs)/todo"
          params={{ workspaceKey: 'Wishlist', workspaceNonce: 'stale' }}
          router={{ push } as any}
        />
      );
    });

    const button = tree!.root.findByProps({ activeOpacity: 0.82 });

    act(() => {
      button.props.onPress();
    });
    act(() => {
      button.props.onPress();
    });

    expect(push).toHaveBeenCalledTimes(2);

    const firstCall = push.mock.calls[0][0];
    const secondCall = push.mock.calls[1][0];

    expect(firstCall).toMatchObject({
      pathname: '/(tabs)/todo',
      params: {
        workspaceKey: 'Wishlist',
      },
    });
    expect(secondCall).toMatchObject({
      pathname: '/(tabs)/todo',
      params: {
        workspaceKey: 'Wishlist',
      },
    });
    expect(firstCall.params.workspaceNonce).toEqual(expect.any(String));
    expect(secondCall.params.workspaceNonce).toEqual(expect.any(String));
    expect(firstCall.params.workspaceNonce).not.toBe('stale');
    expect(secondCall.params.workspaceNonce).not.toBe(firstCall.params.workspaceNonce);
  });

  it('regenerates the Home account focus nonce on every tap', async () => {
    const push = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <NavigationShortcutCard
          label="Google connection settings"
          route="/(tabs)/home"
          params={{ manageAccount: 'true', manageAccountSection: 'google', manageAccountNonce: 'stale' }}
          router={{ push } as any}
        />
      );
    });

    const button = tree!.root.findByProps({ activeOpacity: 0.82 });

    act(() => {
      button.props.onPress();
    });
    act(() => {
      button.props.onPress();
    });

    expect(push).toHaveBeenCalledTimes(2);

    const firstCall = push.mock.calls[0][0];
    const secondCall = push.mock.calls[1][0];

    expect(firstCall).toMatchObject({
      pathname: '/(tabs)/home',
      params: {
        manageAccount: 'true',
        manageAccountSection: 'google',
      },
    });
    expect(secondCall).toMatchObject({
      pathname: '/(tabs)/home',
      params: {
        manageAccount: 'true',
        manageAccountSection: 'google',
      },
    });
    expect(firstCall.params.manageAccountNonce).toEqual(expect.any(String));
    expect(secondCall.params.manageAccountNonce).toEqual(expect.any(String));
    expect(firstCall.params.manageAccountNonce).not.toBe('stale');
    expect(secondCall.params.manageAccountNonce).not.toBe(firstCall.params.manageAccountNonce);
  });

  it('regenerates screen action nonces on every tap', async () => {
    const cases = [
      {
        route: '/(tabs)/chat',
        params: { chatAction: 'history', chatActionNonce: 'stale' },
        nonceKey: 'chatActionNonce',
      },
      {
        route: '/(tabs)/todo',
        params: { todoAction: 'create', todoActionNonce: 'stale' },
        nonceKey: 'todoActionNonce',
      },
      {
        route: '/(tabs)/calendar',
        params: { calendarAction: 'search', calendarActionNonce: 'stale' },
        nonceKey: 'calendarActionNonce',
      },
    ];

    for (const item of cases) {
      const push = jest.fn();
      let tree: renderer.ReactTestRenderer;
      await act(async () => {
        tree = renderer.create(
          <NavigationShortcutCard
            label="Action"
            route={item.route}
            params={item.params}
            router={{ push } as any}
          />
        );
      });

      const button = tree!.root.findByProps({ activeOpacity: 0.82 });

      act(() => {
        button.props.onPress();
      });
      act(() => {
        button.props.onPress();
      });

      const firstCall = push.mock.calls[0][0];
      const secondCall = push.mock.calls[1][0];

      expect(firstCall.params[item.nonceKey]).toEqual(expect.any(String));
      expect(secondCall.params[item.nonceKey]).toEqual(expect.any(String));
      expect(firstCall.params[item.nonceKey]).not.toBe('stale');
      expect(secondCall.params[item.nonceKey]).not.toBe(firstCall.params[item.nonceKey]);

      act(() => {
        tree!.unmount();
      });
    }
  });

  it('starts guidance instead of pushing when guide mode is active', async () => {
    mockUseNavigationHelpMode.mockReturnValue({
      mode: 'guide',
      setMode: jest.fn(),
      isGuideMode: true,
      isShortcutMode: false,
    });
    const push = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <NavigationShortcutCard
          label="Wishlist"
          route="/(tabs)/todo"
          params={{ workspaceKey: 'Wishlist' }}
          target={{ type: 'screen', route: '/(tabs)/todo', params: { workspaceKey: 'Wishlist' } }}
          router={{ push } as any}
        />
      );
    });

    const button = tree!.root.findByProps({ activeOpacity: 0.82 });

    act(() => {
      button.props.onPress();
    });

    expect(push).not.toHaveBeenCalled();
    expect(mockStartGuidance).toHaveBeenCalledWith(
      { type: 'screen', route: '/(tabs)/todo', params: { workspaceKey: 'Wishlist' } },
      'Wishlist'
    );
  });

  it('pushes todo targets directly even when guide mode is active', async () => {
    mockUseNavigationHelpMode.mockReturnValue({
      mode: 'guide',
      setMode: jest.fn(),
      isGuideMode: true,
      isShortcutMode: false,
    });
    const push = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <NavigationShortcutCard
          label="Stretch"
          route="/(tabs)/todo"
          params={{ workspaceKey: 'Personal', openTodoId: 'todo-1', openTodoNonce: 'stale' }}
          target={{ type: 'todo', todoId: 'todo-1', workspaceKey: 'Personal' }}
          router={{ push } as any}
        />
      );
    });

    const button = tree!.root.findByProps({ activeOpacity: 0.82 });

    act(() => {
      button.props.onPress();
    });

    expect(mockStartGuidance).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({
      pathname: '/(tabs)/todo',
      params: {
        workspaceKey: 'Personal',
        openTodoId: 'todo-1',
        openTodoNonce: expect.any(String),
        navNonce: expect.any(String),
      },
    });
  });
});
