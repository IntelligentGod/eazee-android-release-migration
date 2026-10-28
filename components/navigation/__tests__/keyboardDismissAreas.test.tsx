import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import ScreenHeader from '@/components/ScreenHeader';
import LowerSwipeGesture from '@/components/navigation/LowerSwipeGesture';
import SwipeableTabBar from '@/components/navigation/SwipeableTabBar';

function mockPanGestureHandler({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}

function mockBottomTabBar() {
  return <View />;
}

const mockNavigate = jest.fn();
const mockChildPress = jest.fn();
const mockHeaderPress = jest.fn();

jest.mock('@react-navigation/bottom-tabs', () => ({
  BottomTabBar: mockBottomTabBar,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    getParent: () => ({
      navigate: mockNavigate,
    }),
  }),
}));

jest.mock('react-native-gesture-handler', () => ({
  PanGestureHandler: mockPanGestureHandler,
  State: {
    ACTIVE: 4,
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('keyboard dismissal areas', () => {
  const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

  beforeEach(() => {
    dismissKeyboard.mockClear();
    mockNavigate.mockClear();
    mockChildPress.mockClear();
    mockHeaderPress.mockClear();
  });

  afterAll(() => {
    dismissKeyboard.mockRestore();
  });

  it('dismisses the keyboard when the empty lower swipe area is pressed', () => {
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <LowerSwipeGesture currentTab="home">
          <View />
        </LowerSwipeGesture>
      );
    });

    act(() => {
      tree!.root.find((node) => node.props.accessible === false && node.props.onPress).props.onPress();
    });

    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
  });

  it('still dismisses the keyboard when swipe navigation is temporarily disabled', () => {
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <LowerSwipeGesture currentTab="home" disabled>
          <View />
        </LowerSwipeGesture>
      );
    });

    act(() => {
      tree!.root.find((node) => node.props.accessible === false && node.props.onPress).props.onPress();
    });

    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
  });

  it('keeps horizontal swipe navigation working', () => {
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <LowerSwipeGesture currentTab="home">
          <View />
        </LowerSwipeGesture>
      );
    });

    act(() => {
      tree!.root.findByType(mockPanGestureHandler).props.onHandlerStateChange({
        nativeEvent: {
          oldState: 4,
          translationX: -24,
          velocityX: -160,
        },
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith('todo');
    expect(dismissKeyboard).not.toHaveBeenCalled();
  });

  it('does not dismiss the keyboard when a child control is pressed', () => {
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <LowerSwipeGesture currentTab="home">
          <Pressable onPress={mockChildPress} />
        </LowerSwipeGesture>
      );
    });

    const childControl = tree!.root.findAll((node) => node.props.onPress === mockChildPress);

    expect(childControl).toHaveLength(1);

    act(() => {
      childControl[0].props.onPress();
    });

    expect(mockChildPress).toHaveBeenCalledTimes(1);
    expect(dismissKeyboard).not.toHaveBeenCalled();
  });

  it('dismisses the keyboard when the bottom tab bar is touched', () => {
    const props = {
      state: {
        index: 0,
        routes: [{ key: 'home-key', name: 'home' }],
      },
      descriptors: {
        'home-key': {
          options: {},
        },
      },
      navigation: {
        navigate: jest.fn(),
      },
    } as unknown as BottomTabBarProps;
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(<SwipeableTabBar {...props} />);
    });

    act(() => {
      tree!.root.find((node) => node.props.onTouchStart === dismissKeyboard).props.onTouchStart();
    });

    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
  });

  it('dismisses the keyboard when the screen header is touched', () => {
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(<ScreenHeader title="Home" />);
    });

    act(() => {
      tree!.root.findAllByType(View)[0].props.onTouchStart();
    });

    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
  });

  it('includes the space below the header in its touch target', () => {
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(<ScreenHeader title="Home" />);
    });

    const headerStyle = StyleSheet.flatten(tree!.root.findAllByType(View)[0].props.style);

    expect(headerStyle.paddingBottom).toBe(12);
    expect(headerStyle.marginBottom).toBeUndefined();
  });

  it('dismisses the keyboard without blocking header controls', () => {
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <ScreenHeader
          title="Home"
          right={<Pressable onPress={mockHeaderPress} />}
        />
      );
    });

    const header = tree!.root.findAllByType(View)[0];
    const headerControl = tree!.root.find((node) => node.props.onPress === mockHeaderPress);

    act(() => {
      header.props.onTouchStart();
      headerControl.props.onPress();
    });

    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
    expect(mockHeaderPress).toHaveBeenCalledTimes(1);
  });

});
