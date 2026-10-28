import React, { useCallback, useMemo } from 'react';
import { Keyboard, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { TODO_WORKSPACE_ORDER } from '@/lib/todoWorkspaces';
import {
  LOWER_SWIPE_ENABLED,
  clearPendingTodoSwipeWorkspaceKey,
  resolveLowerSwipeTarget,
  setPendingTodoSwipeWorkspaceKey,
  type LowerSwipeTab,
} from './lowerSwipeNavigation';

const SWIPE_DISTANCE = 18;
const SWIPE_VELOCITY = 140;

type LowerSwipeGestureProps = {
  children: React.ReactNode;
  currentTab: LowerSwipeTab;
  currentWorkspaceKey?: string | null;
  disabled?: boolean;
  onTodoWorkspaceTarget?: (workspaceKey: string) => void;
  style?: StyleProp<ViewStyle>;
  workspaceKeys?: string[];
};

export default function LowerSwipeGesture({
  children,
  currentTab,
  currentWorkspaceKey,
  disabled = false,
  onTodoWorkspaceTarget,
  style,
  workspaceKeys = [],
}: LowerSwipeGestureProps) {
  const navigation = useNavigation();
  const resolvedWorkspaceKeys = useMemo(
    () => workspaceKeys.length ? workspaceKeys : [...TODO_WORKSPACE_ORDER],
    [workspaceKeys]
  );

  const handleStateChange = useCallback((event: PanGestureHandlerStateChangeEvent) => {
    const { oldState, translationX, velocityX } = event.nativeEvent;
    if (disabled || oldState !== State.ACTIVE) {
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

    const target = resolveLowerSwipeTarget({
      currentTab,
      currentWorkspaceKey,
      direction,
      workspaceKeys: resolvedWorkspaceKeys,
    });

    if (!target) {
      return;
    }

    if (target.tab === 'todo' && target.workspaceKey) {
      if (currentTab === 'todo') {
        onTodoWorkspaceTarget?.(target.workspaceKey);
        return;
      }

      setPendingTodoSwipeWorkspaceKey(target.workspaceKey);
    } else {
      clearPendingTodoSwipeWorkspaceKey();
    }

    const parent = navigation.getParent();
    if (!parent) {
      return;
    }

    parent.navigate(target.tab as never);
  }, [currentTab, currentWorkspaceKey, disabled, navigation, onTodoWorkspaceTarget, resolvedWorkspaceKeys]);

  const swipeArea = (
    <View style={style}>
      <Pressable
        accessible={false}
        onPress={Keyboard.dismiss}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );

  if (!LOWER_SWIPE_ENABLED) {
    return swipeArea;
  }

  return (
    <PanGestureHandler
      enabled={!disabled}
      activeOffsetX={[-6, 6]}
      failOffsetY={[-24, 24]}
      onHandlerStateChange={handleStateChange}
    >
      {swipeArea}
    </PanGestureHandler>
  );
}
