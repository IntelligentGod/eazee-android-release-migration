import React from 'react';
import { Animated, type GestureResponderHandlers, View } from 'react-native';

type CalendarWeekPagerProps = {
  styles: any;
  calendarPanelWidth: number;
  activeVisibleWeekStarts: Date[];
  pagerResetWeekStart: Date | null;
  weekSwipeX: Animated.Value;
  panHandlers: GestureResponderHandlers;
  renderWeekPanel: (weekStart: Date, index: number) => React.ReactNode;
};

export default function CalendarWeekPager({
  styles,
  calendarPanelWidth,
  activeVisibleWeekStarts,
  pagerResetWeekStart,
  weekSwipeX,
  panHandlers,
  renderWeekPanel,
}: CalendarWeekPagerProps) {
  return (
    <View style={styles.weekPagerViewport} {...panHandlers}>
      {pagerResetWeekStart ? (
        renderWeekPanel(pagerResetWeekStart, 1)
      ) : (
        <Animated.View
          style={[
            styles.weekPagerTrack,
            {
              width: calendarPanelWidth * 3,
              transform: [{ translateX: weekSwipeX }],
            },
          ]}
        >
          {activeVisibleWeekStarts.map(renderWeekPanel)}
        </Animated.View>
      )}
    </View>
  );
}
