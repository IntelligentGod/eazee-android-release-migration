import { Text, TouchableOpacity, View } from 'react-native';
import { format } from 'date-fns';
import type { Router } from 'expo-router';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import { CHAT_DOMAIN_COLORS, CHAT_SURFACE_RADIUS } from '../constants';
import { useGuidance } from '@/components/guidance/GuidanceProvider';
import { type GuidanceTarget } from '@/lib/navigationHelp';
import { useNavigationHelpMode } from '@/lib/useNavigationHelpMode';
import { handleNavigationHelpTarget } from '@/lib/handleNavigationHelpTarget';
import ScrollViewWithBar from '@/components/ScrollViewWithBar';

type CalendarItem = {
  id: string;
  title?: string;
  startDate: string;
  endDate?: string;
  isAllDay?: boolean;
  source?: string;
};

type Props = {
  items: CalendarItem[];
  router: Router;
};

function formatTimeRange(item: CalendarItem): string {
  if (item.isAllDay) {
    const start = parseCalendarDateValue(item.startDate);
    if (!start) return 'All day';
    return `${format(start, 'EEE, MMM d')} • All day`;
  }

  let startLabel = '';
  let endLabel = '';
  let startDate: Date | null = null;

  const s = parseCalendarDateValue(item.startDate);
  if (s) {
    startDate = s;
    startLabel = format(s, 'EEE, MMM d • h:mm a');
  }

  const eRaw = typeof item.endDate === 'string' ? item.endDate : item.startDate;
  if (eRaw) {
    const e = parseCalendarDateValue(eRaw);
    if (e) {
      const sameDay = startDate && startDate.toDateString() === e.toDateString();
      endLabel = format(e, sameDay ? 'h:mm a' : 'EEE, MMM d • h:mm a');
    }
  }

  if (startLabel && endLabel) return `${startLabel} → ${endLabel}`;
  return startLabel || endLabel;
}

export function CalendarListCard({ items, router }: Props) {
  const { mode } = useNavigationHelpMode();
  const { startGuidance } = useGuidance();

  return (
    <View style={{ backgroundColor: CHAT_DOMAIN_COLORS.calendar.surface, padding: 12, borderRadius: CHAT_SURFACE_RADIUS }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ color: CHAT_DOMAIN_COLORS.calendar.text, fontSize: 13, fontWeight: '700' }}>Events</Text>
        {items.length > 1 && (
          <Text style={{ color: CHAT_DOMAIN_COLORS.calendar.text, opacity: 0.85, fontSize: 12 }}>{items.length}</Text>
        )}
      </View>
      <ScrollViewWithBar
        style={{ maxHeight: 280 }}
        contentContainerStyle={{ paddingBottom: 2 }}
      >
        {items.map((it, idx) => {
          const timeText = formatTimeRange(it);
          return (
            <TouchableOpacity
              key={`cal-${it.id}-${idx}`}
              onPress={() => {
                const target: GuidanceTarget = {
                  type: 'event',
                  eventId: String(it.id ?? ''),
                  source: it.source === 'google' ? 'google' : 'local',
                  startDate: it.startDate,
                };
                handleNavigationHelpTarget({
                  target,
                  label: it.title || 'event',
                  mode,
                  startGuidance,
                  router,
                });
              }}
              style={{ marginBottom: idx === items.length - 1 ? 0 : 8 }}
            >
              <View style={{ borderRadius: CHAT_SURFACE_RADIUS, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: CHAT_DOMAIN_COLORS.calendar.card }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }} numberOfLines={2}>{it.title ?? '(No title)'}</Text>
                {timeText && <Text style={{ color: CHAT_DOMAIN_COLORS.calendar.text, marginTop: 4, fontSize: 12 }} numberOfLines={2}>{timeText}</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollViewWithBar>
    </View>
  );
}
