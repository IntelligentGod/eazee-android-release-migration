import { Text, View } from 'react-native';
import { CHAT_DOMAIN_COLORS, CHAT_SURFACE_RADIUS } from '../constants';

export type PlanLegendKind = 'event' | 'task' | 'blocker';

/** Every swatch is outlined so it stands out from the key's background. */
const SWATCH_OUTLINE = 'rgba(232, 255, 250, 0.7)';

/** Same colours as the rows in DayPlanCard, as they appear on the plan card. */
const LEGEND_ROWS: Record<PlanLegendKind, { color: string; borderColor?: string; label: string; hint: string }> = {
  event: {
    color: CHAT_DOMAIN_COLORS.calendar.card,
    borderColor: SWATCH_OUTLINE,
    label: 'New calendar event',
    hint: 'Added to your calendar when you save',
  },
  task: {
    color: CHAT_DOMAIN_COLORS.tasks.card,
    borderColor: SWATCH_OUTLINE,
    label: 'Task',
    hint: 'From your To Do, given a time',
  },
  blocker: {
    // Solid: these rows are see-through on the plan's dark card, so they read as this dark teal.
    color: '#2A4849',
    borderColor: SWATCH_OUTLINE,
    label: 'Already in your calendar',
    hint: 'Shown so you see the whole day; nothing changes',
  },
};

const ORDER: PlanLegendKind[] = ['event', 'task', 'blocker'];

/** The colour key shown once above a suggested day or week plan. */
export function PlanLegendCard({ kinds }: { kinds: PlanLegendKind[] }) {
  const shown = ORDER.filter((kind) => kinds.includes(kind));
  if (!shown.length) return null;
  return (
    <View
      style={{
        borderRadius: CHAT_SURFACE_RADIUS,
        backgroundColor: 'rgba(0, 0, 0, 0.22)',
        borderWidth: 1,
        borderColor: 'rgba(173, 255, 240, 0.22)',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
      }}
    >
      <Text style={{ color: 'rgba(232, 255, 250, 0.75)', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 }}>
        COLOUR KEY
      </Text>
      {shown.map((kind) => {
        const row = LEGEND_ROWS[kind];
        return (
          <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 22,
                height: 14,
                borderRadius: 5,
                backgroundColor: row.color,
                borderWidth: row.borderColor ? 1.5 : 0,
                borderColor: row.borderColor,
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#E8FFFA', fontSize: 14, fontWeight: '700' }}>{row.label}</Text>
              <Text style={{ color: 'rgba(232, 255, 250, 0.65)', fontSize: 12 }}>{row.hint}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Which kinds of rows a set of plan timelines has, for the key. */
export function getPlanLegendKinds(timelines: unknown[][]): PlanLegendKind[] {
  const kinds = new Set<PlanLegendKind>();
  for (const items of timelines) {
    for (const item of Array.isArray(items) ? items : []) {
      const { kind, source, hidden } = (item || {}) as { kind?: string; source?: string; hidden?: boolean };
      if (kind === 'blocker') kinds.add('blocker');
      else if (source === 'draft' && hidden !== true && (kind === 'event' || kind === 'task')) kinds.add(kind);
    }
  }
  return ORDER.filter((kind) => kinds.has(kind));
}
