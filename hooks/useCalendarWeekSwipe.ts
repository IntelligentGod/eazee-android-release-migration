import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { Animated, Easing, PanResponder } from 'react-native';
import * as Haptics from 'expo-haptics';
import { addDays } from 'date-fns';

import { normalizeCalendarWeekStart } from '@/utils/calendarWeeks';

const WEEK_SWIPE_COMMIT_RATIO = 0.18;
const WEEK_SWIPE_VELOCITY = 420;
const WEEK_SWIPE_DURATION = 140;
const MAX_COALESCED_WEEK_SWIPES = 12;

type UseCalendarWeekSwipeOptions = {
  calendarPanelWidth: number;
  weekStart: Date;
  weekStartRef: MutableRefObject<Date>;
  isSwipeDisabled: boolean;
  setWeekStart: (date: Date) => void;
  setPagerWeekStart: (date: Date) => void;
  setPagerResetWeekStart: (date: Date | null) => void;
  setProgrammaticWeekStarts: (dates: Date[] | null) => void;
  syncWeekPanelScrollViews: () => void;
};

export function useCalendarWeekSwipe({
  calendarPanelWidth,
  weekStart,
  weekStartRef,
  isSwipeDisabled,
  setWeekStart,
  setPagerWeekStart,
  setPagerResetWeekStart,
  setProgrammaticWeekStarts,
  syncWeekPanelScrollViews,
}: UseCalendarWeekSwipeOptions) {
  const weekSwipeX = useRef(new Animated.Value(-calendarPanelWidth)).current;
  const weekSwipeWidthRef = useRef(calendarPanelWidth);
  const isWeekSwipeAnimatingRef = useRef(false);
  const queuedWeekSwipeOffsetRef = useRef(0);

  useEffect(() => {
    weekSwipeWidthRef.current = calendarPanelWidth;
    weekSwipeX.setValue(-calendarPanelWidth);
  }, [calendarPanelWidth, weekSwipeX]);

  useEffect(() => {
    if (isWeekSwipeAnimatingRef.current) return;
    setPagerWeekStart(weekStart);
    setPagerResetWeekStart(null);
    setProgrammaticWeekStarts(null);
    weekSwipeX.setValue(-weekSwipeWidthRef.current);
  }, [setPagerResetWeekStart, setPagerWeekStart, setProgrammaticWeekStarts, weekStart, weekSwipeX]);

  const settleWeekSwipe = useCallback((targetValue: number, onComplete?: () => void) => {
    Animated.timing(weekSwipeX, {
      toValue: targetValue,
      duration: WEEK_SWIPE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onComplete?.();
      }
    });
  }, [weekSwipeX]);

  const isSwipeDisabledRef = useRef(isSwipeDisabled);
  isSwipeDisabledRef.current = isSwipeDisabled;
  const settleWeekSwipeRef = useRef(settleWeekSwipe);
  settleWeekSwipeRef.current = settleWeekSwipe;
  const syncWeekPanelScrollViewsRef = useRef(syncWeekPanelScrollViews);
  syncWeekPanelScrollViewsRef.current = syncWeekPanelScrollViews;

  const queueWeekSwipe = useCallback((direction: 1 | -1) => {
    const nextOffset = queuedWeekSwipeOffsetRef.current + direction;
    queuedWeekSwipeOffsetRef.current = Math.max(
      -MAX_COALESCED_WEEK_SWIPES,
      Math.min(MAX_COALESCED_WEEK_SWIPES, nextOffset)
    );
  }, []);

  const cancelWeekSwipe = useCallback(() => {
    queuedWeekSwipeOffsetRef.current = 0;
    isWeekSwipeAnimatingRef.current = false;
    weekSwipeX.stopAnimation();
    weekSwipeX.setValue(-weekSwipeWidthRef.current);
    setPagerResetWeekStart(null);
    setProgrammaticWeekStarts(null);
  }, [setPagerResetWeekStart, setProgrammaticWeekStarts, weekSwipeX]);

  const startWeekSwipeRef = useRef<(direction: 1 | -1) => void>(() => {});
  const startWeekSwipe = useCallback((direction: 1 | -1) => {
    if (isSwipeDisabledRef.current) return;

    if (isWeekSwipeAnimatingRef.current) {
      queueWeekSwipe(direction);
      return;
    }

    const width = weekSwipeWidthRef.current;
    const targetValue = direction > 0 ? -2 * width : 0;

    isWeekSwipeAnimatingRef.current = true;
    syncWeekPanelScrollViewsRef.current();

    try { Haptics.selectionAsync(); } catch {}

    settleWeekSwipeRef.current(targetValue, () => {
      const queuedWeekOffset = queuedWeekSwipeOffsetRef.current;
      queuedWeekSwipeOffsetRef.current = 0;

      const nextWeekStart = addDays(weekStartRef.current, (direction + queuedWeekOffset) * 7);
      const normalizedNextWeekStart = normalizeCalendarWeekStart(nextWeekStart);
      const recenterWeekStarts = direction > 0
        ? [addDays(normalizedNextWeekStart, -7), normalizedNextWeekStart, normalizedNextWeekStart]
        : [normalizedNextWeekStart, normalizedNextWeekStart, addDays(normalizedNextWeekStart, 7)];

      weekStartRef.current = normalizedNextWeekStart;
      setPagerResetWeekStart(null);
      setProgrammaticWeekStarts(recenterWeekStarts);
      setWeekStart(normalizedNextWeekStart);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          weekSwipeX.setValue(-width);
          setPagerWeekStart(normalizedNextWeekStart);
          requestAnimationFrame(() => {
            setProgrammaticWeekStarts(null);
            const trailingWeekOffset = queuedWeekSwipeOffsetRef.current;
            queuedWeekSwipeOffsetRef.current = 0;
            isWeekSwipeAnimatingRef.current = false;

            if (trailingWeekOffset !== 0) {
              const nextDirection = trailingWeekOffset > 0 ? 1 : -1;
              queuedWeekSwipeOffsetRef.current = trailingWeekOffset - nextDirection;
              requestAnimationFrame(() => {
                startWeekSwipeRef.current(nextDirection);
              });
            }
          });
        });
      });
    });
  }, [
    queueWeekSwipe,
    setPagerResetWeekStart,
    setPagerWeekStart,
    setProgrammaticWeekStarts,
    setWeekStart,
    weekStartRef,
    weekSwipeX,
  ]);
  startWeekSwipeRef.current = startWeekSwipe;

  const weekSwipePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isSwipeDisabledRef.current) return false;
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dy) < 18;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        if (isSwipeDisabledRef.current) return false;
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dy) < 18;
      },
      onPanResponderGrant: () => {
        if (!isWeekSwipeAnimatingRef.current) {
          syncWeekPanelScrollViewsRef.current();
        }
      },
      onPanResponderMove: (_, gestureState) => {
        if (isWeekSwipeAnimatingRef.current) return;
        const width = weekSwipeWidthRef.current;
        const nextValue = Math.min(0, Math.max(-2 * width, -width + gestureState.dx));
        weekSwipeX.setValue(nextValue);
      },
      onPanResponderRelease: (_, gestureState) => {
        const width = weekSwipeWidthRef.current;
        const { dx, vx } = gestureState;
        const shouldGoNext = dx <= -(width * WEEK_SWIPE_COMMIT_RATIO) || vx <= -(WEEK_SWIPE_VELOCITY / 1000);
        const shouldGoPrevious = dx >= width * WEEK_SWIPE_COMMIT_RATIO || vx >= WEEK_SWIPE_VELOCITY / 1000;

        if (!shouldGoNext && !shouldGoPrevious) {
          if (!isWeekSwipeAnimatingRef.current) {
            settleWeekSwipeRef.current(-width);
          }
          return;
        }

        const direction = shouldGoNext ? 1 : -1;
        startWeekSwipeRef.current(direction);
      },
      onPanResponderTerminate: () => {
        if (!isWeekSwipeAnimatingRef.current) {
          settleWeekSwipeRef.current(-weekSwipeWidthRef.current);
        }
      },
      onShouldBlockNativeResponder: () => false,
    })
  ).current;

  return {
    weekSwipeX,
    weekSwipeWidthRef,
    isWeekSwipeAnimatingRef,
    settleWeekSwipeRef,
    cancelWeekSwipe,
    weekSwipePanHandlers: weekSwipePanResponder.panHandlers,
  };
}
