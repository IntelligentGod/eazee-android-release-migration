import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import type { Router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CHAT_DOMAIN_COLORS, CHAT_SURFACE_RADIUS } from '../constants';
import { useGuidance } from '@/components/guidance/GuidanceProvider';
import { type GuidanceTarget } from '@/lib/navigationHelp';
import { useNavigationHelpMode } from '@/lib/useNavigationHelpMode';
import { handleNavigationHelpTarget } from '@/lib/handleNavigationHelpTarget';

type TodoItem = {
  id?: string;
  text: string;
  dueDate?: string | null;
  hasDueTime?: boolean;
  completed?: boolean;
  workspace?: string;
  recurrence?: string | null;
};

type Props = {
  items: TodoItem[];
  router: Router;
  showGoalSuggestionsOnOpen?: boolean;
  buyingTodoId?: string | null;
  onBuyWishlistItem?: (item: TodoItem) => void | Promise<void>;
};

export function TodoCard({
  items,
  router,
  showGoalSuggestionsOnOpen = false,
  buyingTodoId = null,
  onBuyWishlistItem,
}: Props) {
  const { mode } = useNavigationHelpMode();
  const { startGuidance } = useGuidance();

  return (
    <>
      {items.map((it, idx) => {
        const dueDate = it.dueDate ? new Date(it.dueDate) : null;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const isOverdue = !!dueDate && !isNaN(dueDate.getTime()) && !it.completed && dueDate.getTime() < todayStart.getTime();
        const dateLabel = dueDate && !isNaN(dueDate.getTime())
          ? dueDate.toLocaleString('en-GB', it.hasDueTime
            ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
            : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
          : null;
        const ws = typeof it.workspace === 'string' ? it.workspace : undefined;
        const recurrenceLabel = typeof it.recurrence === 'string' && it.recurrence.trim()
          ? it.recurrence.trim()
          : null;
        const canBuy = ws === 'Wishlist' && typeof onBuyWishlistItem === 'function';
        const isBuyLoading = !!it.id && buyingTodoId === it.id;
        const target: GuidanceTarget | null = it.id
          ? {
              type: 'todo',
              todoId: String(it.id),
              workspaceKey: String(ws ?? 'Personal'),
            }
          : null;
        return (
          <View
            key={`${it.id ?? it.text}-${idx}`}
            style={{ backgroundColor: CHAT_DOMAIN_COLORS.tasks.card, padding: 12, borderRadius: CHAT_SURFACE_RADIUS, marginBottom: 8, position: 'relative' }}
          >
            {recurrenceLabel && (
              <View
                accessibilityLabel="Repeating todo"
                style={{ position: 'absolute', top: 10, right: 10 }}
              >
                <Ionicons name="repeat" size={14} color={CHAT_DOMAIN_COLORS.tasks.text} />
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  if (target) {
                    handleNavigationHelpTarget({
                      target,
                      label: it.text || 'task',
                      mode,
                      startGuidance,
                      router,
                      extraParams: showGoalSuggestionsOnOpen && ws === 'Goals'
                        ? { goalSuggestionNonce: String(Date.now()) }
                        : undefined,
                    });
                    return;
                  }

                  router.push({
                    pathname: '/(tabs)/todo',
                    params: {
                      workspaceKey: String(ws ?? 'Personal'),
                      ...(showGoalSuggestionsOnOpen && ws === 'Goals' ? { goalSuggestionNonce: String(Date.now()) } : {}),
                    },
                  });
                }}
                style={{ flex: 1, minWidth: 0, paddingRight: recurrenceLabel ? 22 : 0 }}
                activeOpacity={0.82}
              >
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ color: 'white', fontSize: 14, fontWeight: '600' }}
                >
                  {it.text}
                  {isOverdue ? (
                    <Text style={{ color: '#C9B9A0', fontSize: 11, fontWeight: '500' }}>{' (Overdue)'}</Text>
                  ) : null}
                  {it.completed ? (
                    <Text style={{ color: '#B8B8B8', fontSize: 11, fontWeight: '500' }}>{' (Completed)'}</Text>
                  ) : null}
                </Text>
                {dateLabel && (
                  <Text style={{ color: CHAT_DOMAIN_COLORS.tasks.text, marginTop: 2 }}>
                    {`${dateLabel}${ws ? ` (${ws})` : ''}`}
                  </Text>
                )}
                {!dateLabel && ws && (
                  <Text style={{ color: CHAT_DOMAIN_COLORS.tasks.text, marginTop: 2 }}>{`Workspace: ${ws}`}</Text>
                )}
              </TouchableOpacity>
              {canBuy && (
                isBuyLoading ? (
                  <View style={{ minWidth: 44, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={CHAT_DOMAIN_COLORS.tasks.text} />
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => void onBuyWishlistItem?.(it)}
                    style={{
                      backgroundColor: CHAT_DOMAIN_COLORS.tasks.text,
                      minWidth: 44,
                      alignItems: 'center',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityLabel="Buy wishlist item"
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Buy</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>
        );
      })}
    </>
  );
}
