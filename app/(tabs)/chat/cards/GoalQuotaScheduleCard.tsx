import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { Router } from 'expo-router';
import { CHAT_DOMAIN_COLORS, CHAT_SURFACE_RADIUS } from '../constants';

type GoalQuotaScheduleInput = {
  planId: string;
  goalId?: string;
  goalTitle: string;
};

type GoalQuotaScheduleCardProps = {
  goal?: {
    id?: string;
    text?: string;
    workspace?: string;
  };
  planId?: string;
  router: Router;
  isResolved?: boolean;
  onDoToday: (input: GoalQuotaScheduleInput) => Promise<boolean>;
  onPickDate: (input: GoalQuotaScheduleInput) => void;
  onDecideLater: (input: GoalQuotaScheduleInput) => Promise<boolean>;
  onClearPendingDate: (planId?: string) => void;
};

export function GoalQuotaScheduleCard({
  goal,
  planId,
  router,
  isResolved,
  onDoToday,
  onPickDate,
  onDecideLater,
  onClearPendingDate,
}: GoalQuotaScheduleCardProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const goalTitle = String(goal?.text || 'Goal');

  const input = planId ? { planId, goalId: goal?.id, goalTitle } : null;

  const runAction = async (action: (value: GoalQuotaScheduleInput) => Promise<boolean>) => {
    if (!input || isWorking || hasFinished || isResolved) {
      return;
    }
    setIsWorking(true);
    try {
      onClearPendingDate(input.planId);
      const didFinish = await action(input);
      if (didFinish) {
        setHasFinished(true);
      }
    } finally {
      setIsWorking(false);
    }
  };

  if (hasFinished || isResolved) {
    return null;
  }

  return (
    <View style={{ backgroundColor: CHAT_DOMAIN_COLORS.tasks.card, padding: 14, borderRadius: CHAT_SURFACE_RADIUS }}>
      <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
        {goalTitle}
      </Text>
      <Text style={{ color: CHAT_DOMAIN_COLORS.tasks.text, marginTop: 2 }}>
        Choose when to do the first action.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <TouchableOpacity
          onPress={() => void runAction(onDoToday)}
          disabled={isWorking || !planId}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.24)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }}
          activeOpacity={0.82}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Do today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (!input || isWorking) return;
            onPickDate(input);
          }}
          disabled={isWorking || !planId}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.24)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }}
          activeOpacity={0.82}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Pick a date</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void runAction(onDecideLater)}
          disabled={isWorking || !planId}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.14)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }}
          activeOpacity={0.82}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Decide later</Text>
        </TouchableOpacity>
      </View>
      {!!goal?.id && (
        <TouchableOpacity
          onPress={() => {
            router.push({
              pathname: '/(tabs)/todo',
              params: {
                workspaceKey: 'Goals',
                openTodoId: String(goal.id),
                openTodoNonce: String(Date.now()),
              },
            });
            onClearPendingDate(planId);
          }}
          style={{ marginTop: 10 }}
          activeOpacity={0.72}
        >
          <Text style={{ color: CHAT_DOMAIN_COLORS.tasks.text, fontWeight: '700' }}>Open goal</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
