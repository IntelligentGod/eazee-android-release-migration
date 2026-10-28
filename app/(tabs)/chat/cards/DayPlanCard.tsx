import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Switch, Text, TouchableOpacity, View } from 'react-native';
import TimeWheelDialog from '@/components/TimeWheelDialog';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import { FlatList } from 'react-native';
import { format } from 'date-fns';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import { CHAT_DOMAIN_COLORS, CHAT_SURFACE_RADIUS } from '../constants';
import { GuidedTarget } from '@/components/guidance/GuidanceProvider';
import { getChatSavePlanGuidanceTargetId } from '@/lib/navigationHelp';
import {
  buildDayPlanCardValue,
  deleteTimelineItem,
  formatTimelineTime,
  getDayPlanItemEnd,
  getDayPlanItemStart,
  removeTimelineItemTime,
  setTimelineItemEndTime,
  setTimelineItemTime,
  type DayPlanCardValue,
  type DayPlanTimelineItem,
} from '../dayPlan';

type CalendarItem = {
  title: string;
  start?: string;
  end?: string;
  location?: string;
  details?: string;
};

type TodoItem = {
  text: string;
  dueDate: string;
  hasDueTime: boolean;
  details?: string;
  priority: 'low' | 'medium' | 'high';
  starred?: boolean;
  durationMinutes?: number;
};

type Props = {
  draftId?: string;
  date: string;
  calendarItems: CalendarItem[];
  todoItems: TodoItem[];
  timelineItems?: DayPlanTimelineItem[];
  saveBlockedReason?: string;
  mainGoal?: string;
  repeatWeekly?: boolean;
  saved?: boolean;
  cancelled?: boolean;
  onChange?: (nextCard: DayPlanCardValue) => void;
  onSave?: () => Promise<void>;
  onCancel?: () => Promise<void>;
};

const sectionTitleStyle = {
  fontSize: 12,
  fontWeight: '700' as const,
  letterSpacing: 0.4,
  textTransform: 'uppercase' as const,
};

function formatDateLabel(value: string) {
  const parsed = parseCalendarDateValue(value) || new Date(value);
  if (isNaN(parsed.getTime())) return value;

  const today = new Date();
  if (parsed.toDateString() === today.toDateString()) return 'Today';

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (parsed.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  return format(parsed, 'EEE, MMM d');
}

function legacyTimelineItems(calendarItems: CalendarItem[], todoItems: TodoItem[]) {
  const events: DayPlanTimelineItem[] = calendarItems.map((item, index) => ({
    id: `legacy-event-${index}`,
    kind: 'event',
    source: 'draft',
    title: item.title,
    start: item.start,
    end: item.end,
    location: item.location,
    details: item.details,
    durationMinutes: 60,
    timeSource: item.start ? 'user' : 'none',
  }));
  const tasks: DayPlanTimelineItem[] = todoItems.map((item, index) => ({
    id: `legacy-task-${index}`,
    kind: 'task',
    source: 'draft',
    title: item.text,
    dueDate: item.dueDate,
    hasDueTime: item.hasDueTime,
    details: item.details,
    priority: item.priority,
    starred: item.starred,
    durationMinutes: item.durationMinutes || 45,
    timeSource: item.hasDueTime ? 'user' : 'none',
  }));
  return [...events, ...tasks].sort((a, b) => {
    const aStart = getDayPlanItemStart(a);
    const bStart = getDayPlanItemStart(b);
    if (aStart && bStart) return aStart.getTime() - bStart.getTime();
    if (aStart) return -1;
    if (bStart) return 1;
    return 0;
  });
}

export function DayPlanCard({
  draftId,
  date,
  calendarItems,
  todoItems,
  timelineItems,
  saveBlockedReason,
  mainGoal,
  repeatWeekly,
  saved,
  cancelled,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const [pickerTarget, setPickerTarget] = useState<{ itemId: string; field: 'start' | 'end' } | null>(null);
  const [pickerValue, setPickerValue] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const items = useMemo(
    () => (Array.isArray(timelineItems) && timelineItems.length ? timelineItems : legacyTimelineItems(calendarItems, todoItems)),
    [calendarItems, timelineItems, todoItems]
  );
  const selectedPickerItem = pickerTarget ? items.find((item) => item.id === pickerTarget.itemId) : null;
  // A week plan day also shows what is already fixed that day (events, timed tasks),
  // so the card reflects the whole day, not just the new items.
  const visibleItems = items.filter((item) => (
    (item.source === 'draft' && item.hidden !== true) || (!!mainGoal && item.kind === 'blocker')
  ));
  const saveableDraftCount = items.filter((item) => item.source === 'draft' && (item.kind === 'event' || item.kind === 'task')).length;
  const eventCount = calendarItems.length;
  const taskCount = todoItems.length;
  const canEdit = !!onChange && !saved && !cancelled;
  const canSave = !!onSave && !isSaving && !isCancelling && !saveBlockedReason && !saved && !cancelled && saveableDraftCount > 0;
  const canCancel = !!onCancel && !isSaving && !isCancelling && !saved && !cancelled;

  const emitTimeline = (nextItems: DayPlanTimelineItem[]) => {
    onChange?.({ ...buildDayPlanCardValue(date, nextItems, draftId), mainGoal, repeatWeekly });
  };

  const closePicker = () => {
    setPickerTarget(null);
    setPickerValue(null);
  };

  const openPicker = (item: DayPlanTimelineItem, field: 'start' | 'end') => {
    setPickerTarget({ itemId: item.id, field });
    setPickerValue((field === 'end' ? getDayPlanItemEnd(item) : getDayPlanItemStart(item)) || new Date());
  };

  const commitPickerValue = (selectedDate: Date) => {
    if (!selectedDate || !selectedPickerItem || !pickerTarget) return;
    emitTimeline(
      pickerTarget.field === 'end'
        ? setTimelineItemEndTime(items, selectedPickerItem.id, date, selectedDate)
        : setTimelineItemTime(items, selectedPickerItem.id, date, selectedDate)
    );
  };

  const handleSave = async () => {
    if (!canSave || !onSave) return;
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!canCancel || !onCancel) return;
    setIsCancelling(true);
    try {
      await onCancel();
    } finally {
      setIsCancelling(false);
    }
  };

  const renderItem = ({ item }: { item: DayPlanTimelineItem }) => {
    const isBlocker = item.kind === 'blocker';
    const isTask = item.kind === 'task';
    const accent = isBlocker
      ? '#8CA1A1'
      : isTask
        ? CHAT_DOMAIN_COLORS.tasks.text
        : CHAT_DOMAIN_COLORS.calendar.text;
    const cardColor = isBlocker
      ? 'rgba(255, 255, 255, 0.08)'
      : isTask
        ? CHAT_DOMAIN_COLORS.tasks.card
        : CHAT_DOMAIN_COLORS.calendar.card;
    const canRemoveTime = canEdit && !isBlocker && (isTask || item.timeSource === 'ai');
    const canPickTime = canEdit && !isBlocker;
    const start = getDayPlanItemStart(item);
    const end = getDayPlanItemEnd(item);
    const startLabel = start ? format(start, 'h:mm a') : 'Set start';
    const endLabel = end ? format(end, 'h:mm a') : 'Set end';

    return (
      <View
        style={{
          backgroundColor: cardColor,
          borderRadius: CHAT_SURFACE_RADIUS,
          paddingHorizontal: 12,
          paddingVertical: 11,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {item.kind === 'event' || item.kind === 'blocker' ? (
                <>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={!canPickTime}
                    onPress={() => openPicker(item, 'start')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      borderRadius: 999,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      backgroundColor: 'rgba(0, 0, 0, 0.18)',
                    }}
                  >
                    <MIcon name="clock-outline" size={13} color={accent} />
                    <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>{startLabel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={!canPickTime || !start}
                    onPress={() => openPicker(item, 'end')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      borderRadius: 999,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      backgroundColor: 'rgba(0, 0, 0, 0.18)',
                      opacity: !canPickTime || !start ? 0.65 : 1,
                    }}
                  >
                    <MIcon name="clock-outline" size={13} color={accent} />
                    <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>{endLabel}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={!canPickTime}
                  onPress={() => openPicker(item, 'start')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    borderRadius: 999,
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    backgroundColor: 'rgba(0, 0, 0, 0.18)',
                  }}
                >
                  <MIcon name="clock-outline" size={13} color={accent} />
                  <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>{formatTimelineTime(item)}</Text>
                </TouchableOpacity>
              )}
              {canRemoveTime ? (
                <TouchableOpacity
                  onPress={() => emitTimeline(removeTimelineItemTime(items, item.id, date))}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <MIcon name="close" size={15} color="#DDE7E7" />
                </TouchableOpacity>
              ) : null}
              {isBlocker ? (
                <Text style={{ color: '#AFAFAF', fontSize: 11 }}>Existing</Text>
              ) : null}
            </View>
            {item.location ? (
              <Text style={{ color: accent, fontSize: 12, marginTop: 5 }} numberOfLines={1}>
                {item.location}
              </Text>
            ) : null}
            {item.details ? (
              <Text style={{ color: '#AFAFAF', fontSize: 12, marginTop: 5 }} numberOfLines={2}>
                {item.details}
              </Text>
            ) : null}
          </View>
          <View style={{ width: 32, alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
            {canEdit && !isBlocker ? (
              <TouchableOpacity
                onPress={() => emitTimeline(deleteTimelineItem(items, item.id, date))}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                }}
              >
                <MIcon name="trash-can-outline" size={15} color="#DDE7E7" />
              </TouchableOpacity>
            ) : <View style={{ height: 26 }} />}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: CHAT_SURFACE_RADIUS,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingVertical: 12, paddingHorizontal: 12, gap: 10 }}>
        <View style={{ paddingHorizontal: 2, paddingTop: 2 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Plan for {formatDateLabel(date)}</Text>
          {!mainGoal && (
            <Text style={{ color: '#037A7A', fontSize: 12, marginTop: 2 }}>
              {eventCount} events • {taskCount} tasks
            </Text>
          )}
        </View>

        {!!mainGoal && (
          <View
            style={{
              backgroundColor: 'rgba(43, 165, 145, 0.85)',
              borderRadius: CHAT_SURFACE_RADIUS,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
          >
            <Text style={[sectionTitleStyle, { color: 'rgba(255, 255, 255, 0.75)' }]}>Main goal</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 4 }}>{mainGoal}</Text>
          </View>
        )}

        {mainGoal && visibleItems.length <= 1 && visibleItems[0]?.title === mainGoal ? null : visibleItems.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={[sectionTitleStyle, { color: '#A3CFCF' }]}>Timeline</Text>
            <FlatList
              data={visibleItems}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 7 }} />}
            />
          </View>
        ) : (
          <View
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: CHAT_SURFACE_RADIUS,
              paddingHorizontal: 14,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#AFAFAF', fontSize: 13 }}>Nothing in this plan yet.</Text>
          </View>
        )}

        {mainGoal ? (
          <RepeatWeeklyRow
            date={date}
            value={repeatWeekly === true}
            disabled={!canEdit}
            onChange={(nextValue) => onChange?.({ ...buildDayPlanCardValue(date, items, draftId), mainGoal, repeatWeekly: nextValue })}
          />
        ) : null}

        {saveBlockedReason ? (
          <View style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: 'rgba(130, 57, 57, 0.3)' }}>
            <Text style={{ color: '#F2C4C4', fontSize: 12, fontWeight: '700' }}>{saveBlockedReason}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
          <TouchableOpacity
            activeOpacity={0.86}
            disabled={!canCancel}
            onPress={handleCancel}
            style={{
              flex: 1,
              minHeight: 42,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              opacity: !canCancel ? 0.7 : 1,
            }}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <MIcon name="close" size={17} color="#FFFFFF" />
            )}
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>
              {isCancelling ? 'Cancelling...' : cancelled ? 'Cancelled' : 'Cancel'}
            </Text>
          </TouchableOpacity>
          {saveableDraftCount > 0 || saved ? (
            <GuidedTarget
              targetId={getChatSavePlanGuidanceTargetId()}
              label="Save plan"
              style={{ flex: 1 }}
            >
            <TouchableOpacity
              activeOpacity={0.86}
              disabled={!canSave}
              onPress={handleSave}
              style={{
                flex: 1,
                minHeight: 42,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                backgroundColor: canSave ? '#0F766E' : 'rgba(255, 255, 255, 0.08)',
                opacity: !canSave ? 0.7 : 1,
              }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MIcon name="check" size={17} color="#FFFFFF" />
              )}
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>
                {isSaving ? 'Saving...' : saved ? 'Saved' : 'Save plan'}
              </Text>
            </TouchableOpacity>
            </GuidedTarget>
          ) : null}
        </View>

        <TimeWheelDialog
          visible={!!selectedPickerItem}
          value={pickerValue || new Date()}
          onChange={setPickerValue}
          onClose={() => {
            if (pickerValue) commitPickerValue(pickerValue);
            closePicker();
          }}
        />
      </View>
    </View>
  );
}

/** A week plan day can be saved as calendar events that repeat every week. */
function RepeatWeeklyRow({
  date,
  value,
  disabled,
  onChange,
}: {
  date: string;
  value: boolean;
  disabled: boolean;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: CHAT_SURFACE_RADIUS,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
      }}
    >
      <MIcon name="repeat" size={18} color="#A3CFCF" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>Repeat weekly</Text>
        <Text style={{ color: '#AFAFAF', fontSize: 12, marginTop: 1 }}>Every week, same times</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={`Repeat this schedule every week`}
        trackColor={{ false: 'rgba(255, 255, 255, 0.22)', true: '#0F766E' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
