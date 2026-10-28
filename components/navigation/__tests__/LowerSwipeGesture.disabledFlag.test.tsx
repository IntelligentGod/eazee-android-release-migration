import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Keyboard, View } from 'react-native';

import LowerSwipeGesture from '@/components/navigation/LowerSwipeGesture';

function mockPanGestureHandler({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    getParent: () => null,
  }),
}));

jest.mock('@/components/navigation/lowerSwipeNavigation', () => ({
  ...jest.requireActual('@/components/navigation/lowerSwipeNavigation'),
  LOWER_SWIPE_ENABLED: false,
}));

jest.mock('react-native-gesture-handler', () => ({
  PanGestureHandler: mockPanGestureHandler,
  State: {
    ACTIVE: 4,
  },
}));

it('dismisses the keyboard when swipe navigation is globally disabled', () => {
  const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  let tree: renderer.ReactTestRenderer;

  act(() => {
    tree = renderer.create(
      <LowerSwipeGesture currentTab="home">
        <View />
      </LowerSwipeGesture>
    );
  });

  expect(tree!.root.findAllByType(mockPanGestureHandler)).toHaveLength(0);

  act(() => {
    tree!.root.find((node) => node.props.accessible === false && node.props.onPress).props.onPress();
  });

  expect(dismissKeyboard).toHaveBeenCalledTimes(1);
  dismissKeyboard.mockRestore();
});
