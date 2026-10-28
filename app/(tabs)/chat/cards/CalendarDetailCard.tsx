import { Text, TouchableOpacity, View } from 'react-native';
import { format } from 'date-fns';
import type { Router } from 'expo-router';
import { parseCalendarDateValue } from '@/utils/calendarDates';
import { normalizeCalendarDetailsText } from '@/utils/calendarDetails';
import { CHAT_DOMAIN_COLORS, CHAT_SURFACE_RADIUS } from '../constants';
import { useGuidance } from '@/components/guidance/GuidanceProvider';
import { type GuidanceTarget } from '@/lib/navigationHelp';
import { useNavigationHelpMode } from '@/lib/useNavigationHelpMode';
import { handleNavigationHelpTarget } from '@/lib/handleNavigationHelpTarget';

type CalendarItem = {
  id: string;
  title?: string;
  startDate: string;
  endDate?: string;
  isAllDay?: boolean;
  location?: string;
  details?: string;
  attendees?: unknown[];
  source?: string;
};

type Props = {
  items: CalendarItem[];
  router: Router;
};

function formatDateRange(startDate: string, endDate?: string, isAllDay?: boolean): string {
  const s = parseCalendarDateValue(startDate);
  const e = endDate ? parseCalendarDateValue(endDate) : null;
  if (!s) return '';
  if (isAllDay) {
    if (!e) return `${format(s, 'EEE, MMM d')} • All day`;
    const inclusiveEnd = new Date(e.getTime() - 24 * 60 * 60 * 1000);
    if (inclusiveEnd.toDateString() === s.toDateString()) {
      return `${format(s, 'EEE, MMM d')} • All day`;
    }
    return `${format(s, 'EEE, MMM d')} - ${format(inclusiveEnd, 'EEE, MMM d')} • All day`;
  }
  if (!e) return format(s, 'EEE, MMM d • h:mm a');
  return `${format(s, 'EEE, MMM d • h:mm a')} - ${format(e, 'h:mm a')}`;
}

export function CalendarDetailCard({ items, router }: Props) {
  const { mode } = useNavigationHelpMode();
  const { startGuidance } = useGuidance();

  return (
    <>
      {items.map((it, idx) => {
        const dateRange = formatDateRange(it.startDate, it.endDate, it.isAllDay);
        const details = normalizeCalendarDetailsText(it.details);
        return (
          <View key={`cald-${it.id}-${idx}`} style={{ backgroundColor: CHAT_DOMAIN_COLORS.calendar.card, padding: 14, borderRadius: CHAT_SURFACE_RADIUS, marginBottom: 12 }}>
            <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>{it.title ?? '(No title)'}</Text>
            {dateRange && <Text style={{ color: CHAT_DOMAIN_COLORS.calendar.text, marginTop: 2 }}>{dateRange}</Text>}
            {details && <Text style={{ color: CHAT_DOMAIN_COLORS.calendar.text, marginTop: 8, lineHeight: 19 }}>{details}</Text>}
            {it.location && <Text style={{ color: CHAT_DOMAIN_COLORS.calendar.text, marginTop: 6 }}>Location: {String(it.location)}</Text>}
            {Array.isArray(it.attendees) && it.attendees.length > 0 && (
              <Text style={{ color: CHAT_DOMAIN_COLORS.calendar.text, marginTop: 4 }}>Guests: {it.attendees.length}</Text>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
              <TouchableOpacity
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
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.22)', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10 }}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </>
  );
}
