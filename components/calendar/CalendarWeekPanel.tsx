import React from 'react';
import {
  Alert,
  Animated,
  Easing,
  GestureResponderEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { addDays, differenceInCalendarDays, getISOWeek } from 'date-fns';
import { PanGestureHandler, PinchGestureHandler } from 'react-native-gesture-handler';

import EventModel from '@/database/models/EventModel';
import PulsatingLine from '@/app/(tabs)/todo/PulsatingRGB';
import { type CreateSlotResizeEdge } from '@/utils/calendarCreateSlotResize';
import { GuidedTarget } from '@/components/guidance/GuidanceProvider';
import { getCalendarEventGuidanceTargetId } from '@/lib/navigationHelp';
import ScrollViewWithBar from '@/components/ScrollViewWithBar';

export type CalendarEventLike = EventModel;

export type CalendarInteractionCallbacks = {
  onEventPress: (event: CalendarEventLike) => void;
  onSlotPress: (hour: number, dayIndex: number, targetWeekStart: Date) => void;
  onTimelineScrollBeginDrag: () => void;
};

type DragPreviewRect = {
  eventId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  event: CalendarEventLike;
  showTitle?: boolean;
  mode?: 'dragging' | 'committing';
};

export type CalendarCreateSlotRange = {
  startDate: Date;
  endDate: Date;
};

export type CalendarWeekLayout = {
  width: number;
  scale: number;
  hourHeight: number;
  daysOfWeek: string[];
  timeLabelWidth: number;
  dayColumnWidth: number;
  timelineBottomPadding: number;
  gridLineColor: string;
  eventColor: string;
};

export type CalendarDragState = {
  createSlotRange: CalendarCreateSlotRange | null;
  createSlotPreviewLeft: Animated.Value;
  createSlotPreviewTop: Animated.Value;
  createSlotPreviewHeight: Animated.Value;
  createSlotResizeEdge: CreateSlotResizeEdge | null;
  isCreateSlotMoving: boolean;
  draggingEvent: CalendarEventLike | null;
  dragReadyEventId: string | null;
  isPinching: boolean;
  dragPreviewRect: DragPreviewRect | null;
  openingEventId: string | null;
  revealingSlotRange: { startDate: Date; endDate: Date } | null;
  snappedDragX: Animated.Value;
  snappedDragY: Animated.Value;
};

export type CalendarScrollRefs = {
  timelineScrollViewRef: React.MutableRefObject<ScrollView | null>;
  weekPanelScrollRefs: React.MutableRefObject<Record<string, ScrollView | null>>;
  hourRefs: React.MutableRefObject<Record<string, any>>;
  quarterRefs: React.MutableRefObject<Record<string, any>>;
  scrollYRef: React.MutableRefObject<number>;
  scrollViewHeightRef: React.MutableRefObject<number>;
  scrollViewTopInWindowRef: React.MutableRefObject<number>;
};

export type CalendarGestureHandlers = {
  onPinchGestureEvent: (event: any) => void;
  onPinchHandlerStateChange: (event: any) => void;
  onScrollLayoutReady: () => void;
  onEventDrag: (...args: any[]) => void;
  onCreateSlotMoveGestureEvent: (event: any) => void;
  onCreateSlotMoveStateChange: (event: any) => void;
  createOnCreateSlotResizeGestureEvent: (edge: CreateSlotResizeEdge) => (event: any) => void;
  createOnCreateSlotResizeStateChange: (edge: CreateSlotResizeEdge) => (event: any) => void;
  createOnEventDragStateChange: (event: CalendarEventLike) => (event: any) => void;
  isDragCommitInProgress: () => boolean;
  releaseArmedEventDrag: (eventId: string) => void;
  isEventMovable: (event: CalendarEventLike) => boolean;
  getDisplayedEventRange: (event: CalendarEventLike) => { startDate: Date; endDate: Date };
  setDragReadyEventId: (eventId: string | null) => void;
  setDraggingEvent: (event: CalendarEventLike | null) => void;
  setDragPreviewRect: (rect: DragPreviewRect | null) => void;
};

export type CalendarWeekPanelProps = {
  weekStart: Date;
  scrollRefKey: string;
  events: CalendarEventLike[];
  isLoading: boolean;
  interactionsEnabled: boolean;
  layout: CalendarWeekLayout;
  dragState: CalendarDragState;
  scrollRefs: CalendarScrollRefs;
  gestures: CalendarGestureHandlers;
  interactions: CalendarInteractionCallbacks;
};

type RenderedEventSegment = {
  key: string;
  top: number;
  height: number;
  left: number;
  width: number;
  event: CalendarEventLike;
  showTitle?: boolean;
};

function CalendarEventCard({
  event,
  showTitle,
}: {
  event: CalendarEventLike;
  showTitle?: boolean;
}) {
  return (
    <View>
      {(event as any).isTodo && (
        <Icon name="checkbox-marked-circle-outline" size={12} color="white" />
      )}
      {showTitle && (
        <Text style={styles.eventTitle} numberOfLines={2}>
          {event.title}
        </Text>
      )}
    </View>
  );
}

function SlotRevealOutline({ progress }: { progress: Animated.Value }) {
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const topWidth = progress.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [0, size.width, size.width],
    extrapolate: 'clamp',
  });
  const rightHeight = progress.interpolate({
    inputRange: [0, 0.25, 0.5, 1],
    outputRange: [0, 0, size.height, size.height],
    extrapolate: 'clamp',
  });
  const bottomWidth = progress.interpolate({
    inputRange: [0, 0.5, 0.75, 1],
    outputRange: [0, 0, size.width, size.width],
    extrapolate: 'clamp',
  });
  const leftHeight = progress.interpolate({
    inputRange: [0, 0.75, 1],
    outputRange: [0, 0, size.height],
    extrapolate: 'clamp',
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.08, 0.82, 1],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => setSize(event.nativeEvent.layout)}
    >
      <Animated.View style={[styles.revealLine, styles.revealLineTop, { width: topWidth, opacity }]} />
      <Animated.View style={[styles.revealLine, styles.revealLineRight, { height: rightHeight, opacity }]} />
      <Animated.View style={[styles.revealLine, styles.revealLineBottom, { width: bottomWidth, opacity }]} />
      <Animated.View style={[styles.revealLine, styles.revealLineLeft, { height: leftHeight, opacity }]} />
    </View>
  );
}

function CalendarWeekHeader({
  weekStart,
  daysOfWeek,
  timeLabelWidth,
}: {
  weekStart: Date;
  daysOfWeek: string[];
  timeLabelWidth: number;
}) {
  const today = new Date();
  // Weeks start on Monday, so the week number is the ISO one.
  const weekNumber = getISOWeek(weekStart);

  return (
    <View style={styles.weekHeader}>
      <View style={[styles.weekNumberContainer, { width: timeLabelWidth }]}>
        <Text style={styles.weekNumberText}>W{weekNumber}</Text>
      </View>
      {daysOfWeek.map((day, index) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + index);
        const isToday = date.toDateString() === today.toDateString();
        return (
          <View key={index} style={styles.dayHeader}>
            <Text style={styles.dayText} numberOfLines={1}>
              {day}
            </Text>
            <View style={[styles.dateCircle, isToday && styles.todayCircle]}>
              <Text style={[styles.dateText, isToday && styles.todayText]}>{date.getDate()}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function CalendarAllDayEvents({
  weekStart,
  events,
  daysOfWeek,
  interactionsEnabled,
  eventColor,
  timeLabelWidth,
  gridLineColor,
  getDisplayedEventRange,
  onEventPress,
}: {
  weekStart: Date;
  events: CalendarEventLike[];
  daysOfWeek: string[];
  interactionsEnabled: boolean;
  eventColor: string;
  timeLabelWidth: number;
  gridLineColor: string;
  getDisplayedEventRange: CalendarGestureHandlers['getDisplayedEventRange'];
  onEventPress: (event: CalendarEventLike) => void;
}) {
  const allDayEventsByDay = React.useMemo(() => (
    daysOfWeek.map((_, dayIndex) => {
      const dayStart = addDays(weekStart, dayIndex);
      dayStart.setHours(0, 0, 0, 0);
      const nextDay = addDays(dayStart, 1);

      return events.filter((event) => {
        if (!(event as any).isAllDay) return false;
        const { startDate: start, endDate: end } = getDisplayedEventRange(event);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
        return start < nextDay && end > dayStart;
      });
    })
  ), [daysOfWeek, events, getDisplayedEventRange, weekStart]);
  const maxEvents = allDayEventsByDay.reduce((highest, items) => Math.max(highest, items.length), 0);

  if (maxEvents === 0) {
    return <View style={[styles.allDayDividerOnly, { borderBottomColor: gridLineColor }]} />;
  }

  return (
    <View style={[styles.allDayRow, { borderBottomColor: gridLineColor }]}>
      <View style={[styles.allDayLabelColumn, { width: timeLabelWidth }]}>
        <Text style={styles.allDayLabel}>All day</Text>
      </View>
      {allDayEventsByDay.map((dayEvents, dayIndex) => (
        <View key={`all-day-${dayIndex}`} style={styles.allDayDayColumn}>
          {dayEvents.map((event) => (
            <GuidedTarget
              key={`all-day-chip-${dayIndex}-${event.id}`}
              targetId={getCalendarEventGuidanceTargetId(String(event.id))}
              label={event.title || 'Event'}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={!interactionsEnabled}
                onPress={() => onEventPress(event)}
                style={[
                  styles.allDayChip,
                  { backgroundColor: event.isGoogleEvent ? '#4285F4' : eventColor },
                ]}
              >
                <Text style={styles.allDayChipText} numberOfLines={1}>
                  {event.title || '(No title)'}
                </Text>
              </TouchableOpacity>
            </GuidedTarget>
          ))}
        </View>
      ))}
    </View>
  );
}

function CalendarTimeGrid(props: CalendarWeekPanelProps) {
  const {
    weekStart,
    events,
    interactionsEnabled,
    layout,
    dragState,
    scrollRefs,
    gestures,
    interactions,
  } = props;
  const {
    scale,
    hourHeight,
    daysOfWeek,
    timeLabelWidth,
    dayColumnWidth,
    gridLineColor,
    eventColor,
  } = layout;
  const {
    createSlotRange,
    createSlotPreviewLeft,
    createSlotPreviewTop,
    createSlotPreviewHeight,
    createSlotResizeEdge,
    isCreateSlotMoving,
    draggingEvent,
    dragReadyEventId,
    dragPreviewRect,
    openingEventId,
    revealingSlotRange,
    snappedDragX,
    snappedDragY,
  } = dragState;
  const revealProgress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!revealingSlotRange) {
      revealProgress.setValue(0);
      return;
    }

    revealProgress.setValue(0);
    const animation = Animated.timing(revealProgress, {
      toValue: 1,
      duration: 1400,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start();

    return () => animation.stop();
  }, [revealingSlotRange, revealProgress]);
  const {
    timelineScrollViewRef,
    hourRefs,
    quarterRefs,
  } = scrollRefs;
  const {
    onEventDrag,
    onCreateSlotMoveGestureEvent,
    onCreateSlotMoveStateChange,
    createOnCreateSlotResizeGestureEvent,
    createOnCreateSlotResizeStateChange,
    createOnEventDragStateChange,
    isDragCommitInProgress,
    releaseArmedEventDrag,
    isEventMovable,
    getDisplayedEventRange,
    setDragReadyEventId,
    setDraggingEvent,
    setDragPreviewRect,
  } = gestures;

  const slots = [];
  const renderedEvents: RenderedEventSegment[] = [];
  const segmentsByDay = daysOfWeek.map(() => [] as {
    key: string;
    dayIndex: number;
    startMinutes: number;
    endMinutes: number;
    height: number;
    event: CalendarEventLike;
    showTitle?: boolean;
  }[]);

  events.forEach(event => {
    if ((event as any).isAllDay) return;
    const { startDate: evStart, endDate: evEnd } = getDisplayedEventRange(event);
    const weekEnd = addDays(weekStart, 7);

    const start = evStart < weekStart ? new Date(weekStart) : new Date(evStart);
    const end = evEnd > weekEnd ? new Date(weekEnd) : new Date(evEnd);
    if (end <= start) return;

    let dayCursor = new Date(start);
    dayCursor.setHours(0, 0, 0, 0);
    if (dayCursor < weekStart) {
      dayCursor = new Date(weekStart);
      dayCursor.setHours(0, 0, 0, 0);
    }

    while (dayCursor < end) {
      const nextDay = new Date(dayCursor);
      nextDay.setDate(nextDay.getDate() + 1);
      const segmentStart = new Date(Math.max(dayCursor.getTime(), start.getTime()));
      const segmentEnd = new Date(Math.min(nextDay.getTime(), end.getTime()));

      if (segmentEnd > segmentStart) {
        const dayIndex = differenceInCalendarDays(segmentStart, weekStart);
        const startMinutes = segmentStart.getHours() * 60 + segmentStart.getMinutes();
        const durationMinutes = (segmentEnd.getTime() - segmentStart.getTime()) / 60000;
        const endMinutes = startMinutes + durationMinutes;
        const height = Math.max(1, (durationMinutes / 60) * hourHeight * scale - 1);
        const isFirstOverallSegment = segmentStart.getTime() === start.getTime();
        const showTitle = isFirstOverallSegment || segmentStart.getHours() === 0;

        segmentsByDay[dayIndex].push({
          key: `${event.id}-${dayIndex}-${startMinutes}`,
          dayIndex,
          startMinutes,
          endMinutes,
          height,
          event,
          showTitle,
        });
      }

      dayCursor = nextDay;
    }
  });

  segmentsByDay.forEach((daySegments) => {
    if (daySegments.length === 0) return;

    daySegments.sort((a, b) =>
      a.startMinutes - b.startMinutes ||
      b.endMinutes - a.endMinutes ||
      String(a.event.id).localeCompare(String(b.event.id))
    );

    const cluster: { segment: typeof daySegments[number]; column: number }[] = [];
    const active: { endMinutes: number; column: number }[] = [];
    let clusterColumnCount = 0;

    const flushCluster = () => {
      if (cluster.length === 0) return;

      const columnWidth = dayColumnWidth / Math.max(1, clusterColumnCount);
      cluster.forEach(({ segment, column }) => {
        renderedEvents.push({
          key: segment.key,
          top: (segment.startMinutes / 60) * hourHeight * scale,
          height: segment.height,
          left: timeLabelWidth + segment.dayIndex * dayColumnWidth + column * columnWidth + 1,
          width: Math.max(8, columnWidth - 2),
          event: segment.event,
          showTitle: segment.showTitle,
        });
      });

      cluster.length = 0;
      clusterColumnCount = 0;
    };

    daySegments.forEach((segment) => {
      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index].endMinutes <= segment.startMinutes) {
          active.splice(index, 1);
        }
      }

      if (active.length === 0) {
        flushCluster();
      }

      let column = 0;
      while (active.some((item) => item.column === column)) {
        column += 1;
      }

      active.push({ endMinutes: segment.endMinutes, column });
      cluster.push({ segment, column });
      clusterColumnCount = Math.max(clusterColumnCount, active.length);
    });

    flushCluster();
  });

  for (let hour = 0; hour < 24; hour += 1) {
    slots.push(
      <Animated.View key={hour} style={[styles.timeSlotRow, { height: hourHeight * scale }]}>
        <View style={[styles.timeLabel, { width: timeLabelWidth }]}>
          <Text
            ref={(ref) => {
              if (interactionsEnabled) hourRefs.current[`${hour}`] = ref;
            }}
            style={styles.timeText}
          >{`${hour.toString().padStart(2, '0')}:00`}</Text>
          {interactionsEnabled && (draggingEvent || dragReadyEventId || isCreateSlotMoving || createSlotResizeEdge) && (
            <View style={styles.quarterOverlay} pointerEvents="none">
              <View style={[styles.quarterItem, { top: '25%' }]}>
                <Text
                  ref={(ref) => { quarterRefs.current[`${hour}-15`] = ref; }}
                  style={styles.quarterText}
                >{`${hour.toString().padStart(2, '0')}:15`}</Text>
              </View>
              <View style={[styles.quarterItem, { top: '50%' }]}>
                <Text
                  ref={(ref) => { quarterRefs.current[`${hour}-30`] = ref; }}
                  style={styles.quarterText}
                >{`${hour.toString().padStart(2, '0')}:30`}</Text>
              </View>
              <View style={[styles.quarterItem, { top: '75%' }]}>
                <Text
                  ref={(ref) => { quarterRefs.current[`${hour}-45`] = ref; }}
                  style={styles.quarterText}
                >{`${hour.toString().padStart(2, '0')}:45`}</Text>
              </View>
            </View>
          )}
        </View>
        <View style={styles.timeSlotFill} />
      </Animated.View>
    );
  }

  const handleGridPress = (event: GestureResponderEvent) => {
    if (
      !interactionsEnabled ||
      draggingEvent ||
      dragReadyEventId ||
      createSlotResizeEdge ||
      isCreateSlotMoving
    ) return;
    const x = event.nativeEvent.locationX;
    const y = event.nativeEvent.locationY;
    const dayIndex = Math.max(0, Math.min(daysOfWeek.length - 1, Math.floor(x / dayColumnWidth)));
    const hour = Math.max(0, Math.min(23, Math.floor(y / (hourHeight * scale))));
    interactions.onSlotPress(hour, dayIndex, weekStart);
  };

  const selectedSlotOverlay = (() => {
    if (!interactionsEnabled || !createSlotRange) return null;

    const startDate = new Date(createSlotRange.startDate);
    const endDate = new Date(createSlotRange.endDate);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      return null;
    }

    const dayIndex = differenceInCalendarDays(startDate, weekStart);
    if (dayIndex < 0 || dayIndex >= daysOfWeek.length) return null;

    const dayStart = new Date(startDate);
    dayStart.setHours(0, 0, 0, 0);
    const nextDay = addDays(dayStart, 1);
    const visibleStart = startDate < dayStart ? new Date(dayStart) : startDate;
    const visibleEnd = endDate > nextDay ? new Date(nextDay) : endDate;
    if (visibleEnd <= visibleStart) return null;
    const createSlotGestureKey = `${startDate.getTime()}-${endDate.getTime()}`;

    return (
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.selectedTimeSlotOverlay,
          {
            top: createSlotPreviewTop,
            left: createSlotPreviewLeft,
            width: dayColumnWidth,
            height: createSlotPreviewHeight,
            borderColor: eventColor,
          },
        ]}
      >
        <PanGestureHandler
          key={`move-${createSlotGestureKey}`}
          onGestureEvent={onCreateSlotMoveGestureEvent}
          onHandlerStateChange={onCreateSlotMoveStateChange}
          minDist={4}
          simultaneousHandlers={timelineScrollViewRef}
        >
          <Animated.View collapsable={false} style={styles.createSlotMoveSurface} />
        </PanGestureHandler>
        <PanGestureHandler
          key={`resize-start-${createSlotGestureKey}`}
          onGestureEvent={createOnCreateSlotResizeGestureEvent('start')}
          onHandlerStateChange={createOnCreateSlotResizeStateChange('start')}
          onEnded={createOnCreateSlotResizeStateChange('start')}
          onCancelled={createOnCreateSlotResizeStateChange('start')}
          onFailed={createOnCreateSlotResizeStateChange('start')}
          minDist={2}
          shouldCancelWhenOutside={false}
          hitSlop={{ top: 14, bottom: 14, left: 6, right: 6 }}
          simultaneousHandlers={timelineScrollViewRef}
        >
          <Animated.View
            style={[
              styles.createSlotResizeHandle,
              styles.createSlotTopResizeHandle,
              createSlotResizeEdge === 'start' && styles.activeCreateSlotResizeHandle,
            ]}
          >
            <View style={styles.createSlotResizeHandleBar} />
          </Animated.View>
        </PanGestureHandler>
        <PanGestureHandler
          key={`resize-end-${createSlotGestureKey}`}
          onGestureEvent={createOnCreateSlotResizeGestureEvent('end')}
          onHandlerStateChange={createOnCreateSlotResizeStateChange('end')}
          onEnded={createOnCreateSlotResizeStateChange('end')}
          onCancelled={createOnCreateSlotResizeStateChange('end')}
          onFailed={createOnCreateSlotResizeStateChange('end')}
          minDist={2}
          shouldCancelWhenOutside={false}
          hitSlop={{ top: 14, bottom: 14, left: 6, right: 6 }}
          simultaneousHandlers={timelineScrollViewRef}
        >
          <Animated.View
            style={[
              styles.createSlotResizeHandle,
              styles.createSlotBottomResizeHandle,
              createSlotResizeEdge === 'end' && styles.activeCreateSlotResizeHandle,
            ]}
          >
            <View style={styles.createSlotResizeHandleBar} />
          </Animated.View>
        </PanGestureHandler>
      </Animated.View>
    );
  })();

  // A new event that ends after midnight: its part on each following day, from 00:00 (all day
  // for the days in between, up to the end time on the last one).
  const selectedSlotNextDayOverlay = (() => {
    if (!interactionsEnabled || !createSlotRange) return null;

    const startDate = new Date(createSlotRange.startDate);
    const endDate = new Date(createSlotRange.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) return null;

    const parts: React.ReactNode[] = [];
    let day = addDays(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()), 1);
    while (day < endDate) {
      const dayAfter = addDays(day, 1);
      const dayIndex = differenceInCalendarDays(day, weekStart);
      if (dayIndex >= daysOfWeek.length) break;
      if (dayIndex >= 0) {
        const visibleEnd = endDate > dayAfter ? dayAfter : endDate;
        const durationMinutes = (visibleEnd.getTime() - day.getTime()) / 60000;
        parts.push(
          <View
            key={day.getTime()}
            pointerEvents="none"
            style={[
              styles.selectedTimeSlotOverlay,
              {
                top: 0,
                left: timeLabelWidth + dayIndex * dayColumnWidth,
                width: dayColumnWidth,
                height: Math.max(1, (durationMinutes / 60) * hourHeight * scale),
                borderColor: eventColor,
                borderTopWidth: 0,
                // A day in the middle carries on below.
                borderBottomWidth: endDate > dayAfter ? 0 : 3,
              },
            ]}
          />
        );
      }
      day = dayAfter;
    }
    return parts.length ? parts : null;
  })();

  const revealingSlotOverlay = (() => {
    if (!interactionsEnabled || !revealingSlotRange) return null;

    const startDate = new Date(revealingSlotRange.startDate);
    const endDate = new Date(revealingSlotRange.endDate);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      return null;
    }

    const dayIndex = differenceInCalendarDays(startDate, weekStart);
    if (dayIndex < 0 || dayIndex >= daysOfWeek.length) return null;

    const dayStart = new Date(startDate);
    dayStart.setHours(0, 0, 0, 0);
    const nextDay = addDays(dayStart, 1);
    const visibleStart = startDate < dayStart ? new Date(dayStart) : startDate;
    const visibleEnd = endDate > nextDay ? new Date(nextDay) : endDate;
    if (visibleEnd <= visibleStart) return null;

    const startMinutes = visibleStart.getHours() * 60 + visibleStart.getMinutes();
    const durationMinutes = Math.max(15, (visibleEnd.getTime() - visibleStart.getTime()) / 60000);

    return (
      <View
        pointerEvents="none"
        style={[
          styles.revealingSlotOverlay,
          {
            top: (startMinutes / 60) * hourHeight * scale,
            left: timeLabelWidth + dayIndex * dayColumnWidth,
            width: dayColumnWidth,
            height: (durationMinutes / 60) * hourHeight * scale,
          },
        ]}
      >
        <SlotRevealOutline progress={revealProgress} />
      </View>
    );
  })();

  const gridHorizontal = [] as React.ReactNode[];
  for (let hour = 0; hour < 24; hour += 1) {
    gridHorizontal.push(
      <Animated.View
        key={`h-${hour}`}
        style={[
          {
            marginLeft: timeLabelWidth,
            borderBottomWidth: 1,
            borderBottomColor: gridLineColor,
          },
          { height: hourHeight * scale },
        ]}
      />
    );
  }

  const gridVertical = daysOfWeek.map((_, dayIndex) => (
    <View
      key={`v-${dayIndex}`}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: gridLineColor,
        left: timeLabelWidth + dayIndex * dayColumnWidth,
      }}
      pointerEvents="none"
    />
  ));

  return (
    <View style={{ position: 'relative' }}>
      <View style={styles.gridLayer} pointerEvents="none">
        {gridHorizontal}
        {gridVertical}
      </View>
      {slots}
      {interactionsEnabled && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleGridPress}
          style={[
            styles.slotPressLayer,
            {
              left: timeLabelWidth,
              width: dayColumnWidth * daysOfWeek.length,
              height: 24 * hourHeight * scale,
            },
          ]}
        />
      )}
      {selectedSlotOverlay}
      {selectedSlotNextDayOverlay}
      {revealingSlotOverlay}
      {renderedEvents.map((eventForSlot) => {
        const hasActivePreview = interactionsEnabled && dragPreviewRect?.eventId === String(eventForSlot.event.id);

        if (!interactionsEnabled) {
          return (
            <View
              key={eventForSlot.key}
              style={[
                styles.eventItem,
                { backgroundColor: eventColor },
                eventForSlot.event.isGoogleEvent && styles.googleEventItem,
                {
                  top: eventForSlot.top,
                  height: Math.max(1, eventForSlot.height - 4),
                  left: eventForSlot.left,
                  width: eventForSlot.width,
                },
              ]}
            >
              <CalendarEventCard event={eventForSlot.event} showTitle={eventForSlot.showTitle} />
            </View>
          );
        }

        return (
          <PanGestureHandler
            key={eventForSlot.key}
            onGestureEvent={onEventDrag}
            onHandlerStateChange={createOnEventDragStateChange(eventForSlot.event)}
            minDist={8}
            simultaneousHandlers={timelineScrollViewRef}
            enabled={isEventMovable(eventForSlot.event)}
          >
            <Animated.View
              style={[
                styles.eventItem,
                { backgroundColor: eventColor },
                eventForSlot.event.isGoogleEvent && styles.googleEventItem,
                {
                  top: eventForSlot.top,
                  height: Math.max(1, eventForSlot.height - 4),
                  left: eventForSlot.left,
                  width: eventForSlot.width,
                  transform: draggingEvent?.id === eventForSlot.event.id
                    ? [{ translateX: 0 }, { translateY: 0 }]
                    : openingEventId === String(eventForSlot.event.id)
                      ? [{ scale: 0.985 }]
                      : [{ translateX: 0 }, { translateY: 0 }],
                  zIndex: hasActivePreview ? 4 : 3,
                  elevation: hasActivePreview ? 4 : 2,
                  opacity: hasActivePreview ? 0 : openingEventId === String(eventForSlot.event.id) ? 0.68 : 1,
                },
              ]}
            >
              <GuidedTarget
                targetId={getCalendarEventGuidanceTargetId(String(eventForSlot.event.id))}
                label={eventForSlot.event.title || 'Event'}
                style={{ flex: 1 }}
              >
                <TouchableOpacity
                  activeOpacity={0.9}
                  delayLongPress={300}
                  onLongPress={async () => {
                    if (isDragCommitInProgress()) {
                      return;
                    }

                    if (!isEventMovable(eventForSlot.event)) {
                      if (eventForSlot.event.isGoogleEvent || eventForSlot.event.googleEventId) {
                        Alert.alert('Read-only event', "This Google Calendar event can't be moved.");
                      }
                      return;
                    }

                    setDragReadyEventId(String(eventForSlot.event.id));
                    setDraggingEvent(eventForSlot.event);
                    setDragPreviewRect({
                      eventId: String(eventForSlot.event.id),
                      left: eventForSlot.left,
                      top: eventForSlot.top,
                      width: eventForSlot.width,
                      height: Math.max(1, eventForSlot.height - 4),
                      event: eventForSlot.event,
                      showTitle: eventForSlot.showTitle,
                      mode: 'dragging',
                    });
                    try {
                      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
                    } catch {}
                  }}
                  onPressOut={() => releaseArmedEventDrag(String(eventForSlot.event.id))}
                  onPress={() => {
                    if (draggingEvent) return;
                    interactions.onEventPress(eventForSlot.event);
                  }}
                  style={{ flex: 1 }}
                >
                  <CalendarEventCard event={eventForSlot.event} showTitle={eventForSlot.showTitle} />
                </TouchableOpacity>
              </GuidedTarget>
            </Animated.View>
          </PanGestureHandler>
        );
      })}
      {interactionsEnabled && dragPreviewRect && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.eventItem,
            { backgroundColor: eventColor },
            dragPreviewRect.event.isGoogleEvent && styles.googleEventItem,
            styles.dragPreviewItem,
            {
              top: dragPreviewRect.top,
              left: dragPreviewRect.left,
              width: dragPreviewRect.width,
              height: dragPreviewRect.height,
              transform: dragPreviewRect.mode === 'committing'
                ? [{ translateX: 0 }, { translateY: 0 }]
                : [
                    { translateX: snappedDragX },
                    { translateY: snappedDragY },
                  ],
            },
          ]}
        >
          <CalendarEventCard event={dragPreviewRect.event} showTitle={dragPreviewRect.showTitle} />
        </Animated.View>
      )}
    </View>
  );
}

export default function CalendarWeekPanel(props: CalendarWeekPanelProps) {
  const {
    weekStart,
    events,
    isLoading,
    interactionsEnabled,
    layout,
    dragState,
    scrollRefs,
    gestures,
    interactions,
    scrollRefKey,
  } = props;
  const {
    width,
    daysOfWeek,
    eventColor,
    timelineBottomPadding,
    timeLabelWidth,
    gridLineColor,
  } = layout;
  const {
    draggingEvent,
    isPinching,
    createSlotResizeEdge,
    isCreateSlotMoving,
  } = dragState;
  const {
    timelineScrollViewRef,
    weekPanelScrollRefs,
    scrollYRef,
    scrollViewHeightRef,
    scrollViewTopInWindowRef,
  } = scrollRefs;
  const {
    onPinchGestureEvent,
    onPinchHandlerStateChange,
    onScrollLayoutReady,
    getDisplayedEventRange,
  } = gestures;

  return (
    <View style={[styles.weekPanel, { width }]}>
      <CalendarWeekHeader weekStart={weekStart} daysOfWeek={daysOfWeek} timeLabelWidth={timeLabelWidth} />
      <CalendarAllDayEvents
        weekStart={weekStart}
        events={events}
        daysOfWeek={daysOfWeek}
        interactionsEnabled={interactionsEnabled}
        eventColor={eventColor}
        timeLabelWidth={timeLabelWidth}
        gridLineColor={gridLineColor}
        getDisplayedEventRange={getDisplayedEventRange}
        onEventPress={interactions.onEventPress}
      />
      {isLoading && <PulsatingLine width={500} height={4} />}
      <PinchGestureHandler
        enabled={interactionsEnabled && !createSlotResizeEdge && !isCreateSlotMoving}
        onGestureEvent={onPinchGestureEvent}
        onHandlerStateChange={onPinchHandlerStateChange}
      >
        <ScrollViewWithBar
          ref={(node) => {
            if (interactionsEnabled) {
              timelineScrollViewRef.current = node;
            }
            if (node) {
              weekPanelScrollRefs.current[scrollRefKey] = node;
            } else {
              delete weekPanelScrollRefs.current[scrollRefKey];
            }
          }}
          style={[styles.timelineContainer, { borderBottomColor: gridLineColor }]}
          scrollEnabled={
            interactionsEnabled &&
            !draggingEvent &&
            !isPinching &&
            !createSlotResizeEdge &&
            !isCreateSlotMoving
          }
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          contentContainerStyle={timelineBottomPadding > 0 ? { paddingBottom: timelineBottomPadding } : undefined}
          contentOffset={{ x: 0, y: scrollYRef.current || 0 }}
          onScroll={interactionsEnabled ? (event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
          } : undefined}
          onScrollBeginDrag={interactionsEnabled ? interactions.onTimelineScrollBeginDrag : undefined}
          scrollEventThrottle={16}
          onLayout={interactionsEnabled ? (event) => {
            scrollViewHeightRef.current = event.nativeEvent.layout.height;
            onScrollLayoutReady();
            setTimeout(() => {
              try {
                const node = timelineScrollViewRef.current as any;
                if (node && node.measureInWindow) {
                  node.measureInWindow((_x: number, y: number) => {
                    scrollViewTopInWindowRef.current = y;
                  });
                }
                const scrollView = timelineScrollViewRef.current as any;
                if (scrollView && typeof scrollYRef.current === 'number') {
                  scrollView.scrollTo({ y: scrollYRef.current, animated: false });
                }
              } catch {}
            }, 0);
          } : undefined}
        >
          <CalendarTimeGrid {...props} />
        </ScrollViewWithBar>
      </PinchGestureHandler>
    </View>
  );
}

const styles = StyleSheet.create({
  weekPanel: {
    flex: 1,
  },
  weekHeader: {
    flexDirection: 'row',
  },
  weekNumberContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekNumberText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#DFFBFF',
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 10,
  },
  dayText: {
    fontWeight: 'bold',
    fontSize: 9,
    color: '#DFFBFF',
    textAlign: 'center',
  },
  dateCircle: {
    width: 24,
    height: 24,
    borderRadius: 999,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
  },
  todayCircle: {
    backgroundColor: '#DFFBFF',
  },
  dateText: {
    fontSize: 12,
    color: '#DFFBFF',
  },
  todayText: {
    color: '#0E4048',
    fontWeight: 'bold',
  },
  allDayDividerOnly: {
    borderBottomWidth: 1,
  },
  allDayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 3,
    paddingBottom: 5,
    borderBottomWidth: 1,
  },
  allDayLabelColumn: {
    paddingTop: 4,
    paddingRight: 8,
    alignItems: 'flex-end',
  },
  allDayLabel: {
    color: '#DFFBFF',
    fontSize: 9,
    opacity: 0.8,
  },
  allDayDayColumn: {
    flex: 1,
    minHeight: 24,
    paddingHorizontal: 1,
  },
  allDayChip: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    marginBottom: 2,
  },
  allDayChipText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
  },
  timelineContainer: {
    flex: 1,
    borderBottomWidth: 1,
  },
  timeSlotRow: {
    flexDirection: 'row',
  },
  timeLabel: {
    height: '100%',
    justifyContent: 'flex-start',
    paddingRight: 8,
  },
  timeText: {
    width: '100%',
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
    color: '#96CDD6',
  },
  quarterOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingRight: 8,
    zIndex: 5,
  },
  quarterItem: {
    position: 'absolute',
    width: '100%',
    marginTop: 2,
  },
  quarterText: {
    textAlign: 'right',
    fontSize: 10,
    lineHeight: 12,
    fontVariant: ['tabular-nums'],
    color: '#888',
    opacity: 0,
  },
  timeSlotFill: {
    flex: 1,
    position: 'relative',
  },
  slotPressLayer: {
    position: 'absolute',
    top: 0,
    zIndex: 2,
  },
  selectedTimeSlotOverlay: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderRadius: 0,
    overflow: 'visible',
    zIndex: 4,
  },
  selectedTimeSlot: {
    borderWidth: 1,
  },
  createSlotMoveSurface: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: '100%',
    zIndex: 5,
  },
  createSlotResizeHandle: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(35, 48, 56, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  createSlotTopResizeHandle: {
    top: -8,
    left: -8,
  },
  createSlotBottomResizeHandle: {
    right: -8,
    bottom: -8,
  },
  activeCreateSlotResizeHandle: {
    opacity: 1,
  },
  createSlotResizeHandleBar: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DFFBFF',
  },
  gridLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  eventItem: {
    borderRadius: 4,
    padding: 2,
    margin: 1,
    overflow: 'hidden',
    zIndex: 1,
    position: 'absolute',
    left: 1,
    right: 1,
  },
  googleEventItem: {
    backgroundColor: '#4285F4',
  },
  revealingSlotOverlay: {
    position: 'absolute',
    zIndex: 6,
    elevation: 6,
  },
  revealLine: {
    position: 'absolute',
    backgroundColor: 'rgba(174, 255, 232, 0.98)',
    shadowColor: '#AEFFE8',
    shadowOpacity: 0.9,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  revealLineTop: {
    top: 0,
    left: 0,
    height: 2,
  },
  revealLineRight: {
    top: 0,
    right: 0,
    width: 2,
  },
  revealLineBottom: {
    right: 0,
    bottom: 0,
    height: 2,
  },
  revealLineLeft: {
    bottom: 0,
    left: 0,
    width: 2,
  },
  dragPreviewItem: {
    zIndex: 12,
    elevation: 12,
    shadowColor: '#031114',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  eventTitle: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
