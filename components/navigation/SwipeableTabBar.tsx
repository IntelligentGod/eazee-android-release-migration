import React, { useCallback } from 'react';
import {
  BottomTabBar,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { Keyboard, StyleSheet, View } from 'react-native';
import {
  LOWER_SWIPE_ENABLED,
  LOWER_SWIPE_TAB_ORDER,
  clearPendingTodoSwipeWorkspaceKey,
  getSharedTodoWorkspaceState,
  requestTodoWorkspaceSwipe,
  resolveLowerSwipeTarget,
  setPendingTodoSwipeWorkspaceKey,
  type LowerSwipeTab,
} from './lowerSwipeNavigation';

const SWIPE_DISTANCE = 18;
const SWIPE_VELOCITY = 140;

function isLowerSwipeTab(value: string): value is LowerSwipeTab {
  return LOWER_SWIPE_TAB_ORDER.includes(value as LowerSwipeTab);
}

type SwipeableTabBarProps = BottomTabBarProps & {
  disabled?: boolean;
};

export default function SwipeableTabBar(props: SwipeableTabBarProps) {
  const activeRoute = props.state.routes[props.state.index];
  const activeRouteName = activeRoute?.name ?? '';
  const activeOptions = activeRoute ? props.descriptors[activeRoute.key]?.options : undefined;
  const tabBarStyle = StyleSheet.flatten(activeOptions?.tabBarStyle) as Record<string, unknown> | undefined;
  const isHidden = tabBarStyle?.display === 'none';

  const handleStateChange = useCallback((event: PanGestureHandlerStateChangeEvent) => {
    if (props.disabled || isHidden || !isLowerSwipeTab(activeRouteName)) {
      return;
    }

    const { oldState, translationX, velocityX } = event.nativeEvent;
    if (oldState !== State.ACTIVE) {
      return;
    }

    const direction =
      translationX <= -SWIPE_DISTANCE || velocityX <= -SWIPE_VELOCITY
        ? 'left'
        : translationX >= SWIPE_DISTANCE || velocityX >= SWIPE_VELOCITY
          ? 'right'
          : null;

    if (!direction) {
      return;
    }

    const { workspaceKeys, currentWorkspaceKey } = getSharedTodoWorkspaceState();
    const target = resolveLowerSwipeTarget({
      currentTab: activeRouteName,
      currentWorkspaceKey,
      direction,
      workspaceKeys,
    });

    if (!target) {
      return;
    }

    if (target.tab === 'todo' && target.workspaceKey) {
      if (activeRouteName === 'todo') {
        requestTodoWorkspaceSwipe(target.workspaceKey);
        return;
      }

      setPendingTodoSwipeWorkspaceKey(target.workspaceKey);
    } else {
      clearPendingTodoSwipeWorkspaceKey();
    }

    props.navigation.navigate(target.tab);
  }, [activeRouteName, isHidden, props.disabled, props.navigation]);

  const tabBar = (
    <View onTouchStart={Keyboard.dismiss}>
      <BottomTabBar {...props} />
    </View>
  );

  if (!LOWER_SWIPE_ENABLED) {
    return tabBar;
  }

  return (
    <PanGestureHandler
      enabled={!props.disabled && !isHidden && isLowerSwipeTab(activeRouteName)}
      activeOffsetX={[-6, 6]}
      failOffsetY={[-24, 24]}
      onHandlerStateChange={handleStateChange}
    >
      {tabBar}
    </PanGestureHandler>
  );
}
