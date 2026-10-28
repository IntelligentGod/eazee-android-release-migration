import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

/**
 * The app's time picker, the same everywhere: a dark rounded box with an hour wheel and a
 * minute wheel in 15-minute steps, in 24-hour time (00–23). Drawn here on both iPhone and
 * Android, so it looks the same everywhere whatever the phone's region or 12/24-hour setting.
 * Each change goes to `onChange`; tapping outside closes it through `onClose`, keeping the time.
 */
export default function TimeWheelDialog({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
        <View style={styles.card}>
          {visible && <TimeWheels value={value} onChange={onChange} />}
        </View>
      </View>
    </Modal>
  );
}

const TEXT_COLOR = '#F5F7F8';
// A whole number of pixels, so the snapping stays lined up with the band however far it scrolls.
const ROW_HEIGHT = PixelRatio.roundToNearestPixel(34);
const VISIBLE_ROWS = 5;
/** Copies of each list, so the wheels seem to go round like the iPhone's. */
const LOOPS = 21;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = [0, 15, 30, 45];

const nearestMinuteStep = (minutes: number) => Math.round(minutes / 15) % 4;
function TimeWheels({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  // A time between the 15-minute steps rounds to the nearest one, like the iPhone wheel.
  const roundsUp = Math.round(value.getMinutes() / 15) === 4;
  const startHour = roundsUp ? (value.getHours() + 1) % 24 : value.getHours();
  const [hour, setHour] = useState(startHour);
  const [minuteIndex, setMinuteIndex] = useState(nearestMinuteStep(value.getMinutes()));

  const report = (nextHour: number, nextMinuteIndex: number) => {
    const next = new Date(value);
    next.setHours(nextHour, MINUTES[nextMinuteIndex], 0, 0);
    onChange(next);
  };

  return (
    <View style={styles.wheels}>
      <View pointerEvents="none" style={styles.selectionBand} />
      <Wheel
        labels={HOURS.map((item) => String(item).padStart(2, '0'))}
        initialIndex={startHour}
        onSelect={(index) => {
          setHour(index);
          report(index, minuteIndex);
        }}
      />
      <Wheel
        labels={MINUTES.map((item) => String(item).padStart(2, '0'))}
        initialIndex={nearestMinuteStep(value.getMinutes())}
        onSelect={(index) => {
          setMinuteIndex(index);
          report(hour, index);
        }}
      />
    </View>
  );
}

function Wheel({
  labels,
  initialIndex,
  onSelect,
}: {
  labels: string[];
  initialIndex: number;
  onSelect: (index: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const count = labels.length;
  const middleLoop = Math.floor(LOOPS / 2);
  const rows = useMemo(() => Array.from({ length: count * LOOPS }, (_, row) => labels[row % count]), [count, labels]);
  const [centerRow, setCenterRow] = useState(middleLoop * count + initialIndex);

  useEffect(() => {
    const row = middleLoop * count + initialIndex;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: row * ROW_HEIGHT, animated: false }));
    // Only when the wheel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const row = Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT);
    const index = ((row % count) + count) % count;
    // Far from the middle: jump back to the same value in the middle copy, out of sight.
    const recentred = middleLoop * count + index;
    if (Math.abs(row - recentred) > count * 3) {
      scrollRef.current?.scrollTo({ y: recentred * ROW_HEIGHT, animated: false });
      setCenterRow(recentred);
    } else {
      setCenterRow(row);
    }
    onSelect(index);
  };

  return (
    <View style={styles.wheel}>
    <ScrollView
      ref={scrollRef}
      style={StyleSheet.absoluteFill}
      contentContainerStyle={{ paddingVertical: ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2) }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ROW_HEIGHT}
      decelerationRate="fast"
      nestedScrollEnabled
      onScroll={(event) => setCenterRow(Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT))}
      scrollEventThrottle={32}
      onMomentumScrollEnd={settle}
    >
      {rows.map((label, row) => {
        const distance = Math.abs(row - centerRow);
        return (
          <View key={row} style={styles.row}>
            <Text
              style={[
                styles.rowText,
                distance === 0 && styles.rowTextSelected,
                { opacity: distance === 0 ? 1 : distance === 1 ? 0.62 : 0.3 },
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
    </View>
  );
}

// Matches the Calendar event card's picker (editPickerOverlay / editPickerCard / editPickerSpinner).
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 25, 29, 0.52)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 24,
    backgroundColor: 'rgba(41, 41, 41, 0.96)',
    paddingTop: 8,
    paddingHorizontal: 18,
    paddingBottom: 12,
    alignItems: 'center',
  },
  wheels: {
    alignSelf: 'stretch',
    height: ROW_HEIGHT * VISIBLE_ROWS,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  selectionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2),
    height: ROW_HEIGHT,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  wheel: {
    width: 56,
    height: ROW_HEIGHT * VISIBLE_ROWS,
  },
  row: {
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    color: TEXT_COLOR,
    fontSize: 20,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  rowTextSelected: {
    fontSize: 22,
    fontWeight: '600',
  },
});
