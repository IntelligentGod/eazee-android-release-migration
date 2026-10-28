import { useState } from 'react';
import { Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { format } from 'date-fns';
import type { Router } from 'expo-router';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import { CHAT_DOMAIN_COLORS, CHAT_SURFACE_RADIUS } from '../constants';

type TodoItem = {
  id: string;
  text: string;
  dueDate?: string | null;
  completed?: boolean;
  starred?: boolean;
  workspace?: string;
};

type CalendarItem = {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  source?: 'local' | 'google';
  location?: string;
  isAllDay?: boolean;
};

type Props = {
  date: string;
  todos: TodoItem[];
  calendar: CalendarItem[];
  router: Router;
};

function formatTimeRange(item: CalendarItem): string {
  const s = parseCalendarDateValue(item.startDate);
  if (!s) return '';
  if (item.isAllDay) return 'All day';
  const startLabel = format(s, 'h:mm a');
  const eRaw = item.endDate || item.startDate;
  const e = parseCalendarDateValue(eRaw);
  if (!e) return startLabel;
  const endLabel = format(e, 'h:mm a');
  return `${startLabel} - ${endLabel}`;
}

export function DailyOverviewCard({ date, todos, calendar, router }: Props) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'calendar'>('tasks');

  const dateLabel = (() => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return format(d, 'EEE, MMM d');
  })();

  const tabs = [
    { key: 'tasks' as const, label: 'Tasks', count: todos.length },
    { key: 'calendar' as const, label: 'Calendar', count: calendar.length },
  ];

  return (
    <View style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', borderRadius: CHAT_SURFACE_RADIUS, overflow: 'hidden', maxHeight: 336 }}>
      <View style={{ paddingTop: 15, paddingHorizontal: 17 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>{`${dateLabel}'s Overview`}</Text>
      </View>

      <View style={{ flexDirection: 'row', paddingTop: 11, paddingHorizontal: 13 }}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              paddingVertical: 8,
              paddingHorizontal: 6,
              borderRadius: CHAT_SURFACE_RADIUS,
              backgroundColor: activeTab === tab.key
                ? tab.key === 'calendar'
                  ? CHAT_DOMAIN_COLORS.calendar.card
                  : CHAT_DOMAIN_COLORS.tasks.card
                : 'transparent',
              marginHorizontal: 2,
            }}
          >
            <Text
              style={{
                color: activeTab === tab.key
                  ? '#FFFFFF'
                  : tab.key === 'calendar'
                    ? CHAT_DOMAIN_COLORS.calendar.text
                    : CHAT_DOMAIN_COLORS.tasks.text,
                fontSize: 10,
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              {tab.label} ({tab.count})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ maxHeight: 232 }}
        contentContainerStyle={{ paddingHorizontal: 15, paddingTop: 13, paddingBottom: 15 }}
        nestedScrollEnabled
      >
        {activeTab === 'tasks' && (
          <>
            {todos.length === 0 && (
              <Text style={{ color: '#888', textAlign: 'center', paddingVertical: 20 }}>No tasks for this day</Text>
            )}
            {todos.map((it, idx) => (
              <TouchableOpacity
                key={`todo-${it.id}-${idx}`}
                onPress={() => router.push({ pathname: '/(tabs)/todo', params: { workspaceKey: it.workspace || 'Personal' } })}
                style={{ backgroundColor: CHAT_DOMAIN_COLORS.tasks.card, padding: 12, borderRadius: CHAT_SURFACE_RADIUS, marginBottom: 8 }}
              >
                <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>{it.text}</Text>
                {it.workspace && (
                  <Text style={{ color: CHAT_DOMAIN_COLORS.tasks.text, fontSize: 12, marginTop: 2 }}>{it.workspace}</Text>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}

        {activeTab === 'calendar' && (
          <>
            {calendar.length === 0 && (
              <Text style={{ color: '#888', textAlign: 'center', paddingVertical: 20 }}>No events for this day</Text>
            )}
            {calendar.map((it, idx) => {
              const timeText = formatTimeRange(it);
              return (
                <TouchableOpacity
                  key={`cal-${it.id}-${idx}`}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/calendar',
                      params: { openEventId: it.id, openEventSource: it.source || 'local', openNonce: String(Date.now()) },
                    })
                  }
                  style={{ backgroundColor: CHAT_DOMAIN_COLORS.calendar.card, padding: 12, borderRadius: CHAT_SURFACE_RADIUS, marginBottom: 8 }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }} numberOfLines={2}>
                    {it.title || '(No title)'}
                  </Text>
                  {timeText && (
                    <Text style={{ color: CHAT_DOMAIN_COLORS.calendar.text, marginTop: 2, fontSize: 12 }}>{timeText}</Text>
                  )}
                  {it.location && (
                    <Text style={{ color: CHAT_DOMAIN_COLORS.calendar.text, marginTop: 2, fontSize: 11 }} numberOfLines={1}>
                      {it.location}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}
