export type GoalQuotaUnitType = 'distinct_days' | 'count';

export type GoalBehavior =
  | { kind: 'pending' }
  | { kind: 'standard' }
  | {
      kind: 'quota';
      targetCount: number;
      completedCount: number;
      unitLabel: string;
      unitType: GoalQuotaUnitType;
      initialPromptDismissed?: boolean;
      scheduledActionTodoId?: string;
      scheduledActionDate?: string;
      lastCompletedDate?: string;
      actionTemplateTitle?: string;
      actionTemplateDetails?: string;
    };

export type GoalQuotaBehavior = Extract<GoalBehavior, { kind: 'quota' }>;

const MAX_QUOTA_TARGET_COUNT = 366;

const clampQuotaCount = (value: unknown, fallback = 1) => {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count)) {
    return fallback;
  }
  return Math.max(0, Math.min(count, MAX_QUOTA_TARGET_COUNT));
};

const cleanLabel = (value: unknown, fallback: string) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 80) : fallback;
};

const cleanDetails = (value: unknown) =>
  String(value || '').trim().replace(/\s+/g, ' ');

export const createPendingGoalBehavior = (): GoalBehavior => ({ kind: 'pending' });

export const createStandardGoalBehavior = (): GoalBehavior => ({ kind: 'standard' });

export const createQuotaGoalBehavior = (input: {
  targetCount: number;
  unitLabel?: string;
  unitType?: GoalQuotaUnitType;
  completedCount?: number;
}): GoalQuotaBehavior => {
  const targetCount = Math.max(1, clampQuotaCount(input.targetCount, 1));
  return {
    kind: 'quota',
    targetCount,
    completedCount: Math.min(clampQuotaCount(input.completedCount, 0), targetCount),
    unitLabel: cleanLabel(input.unitLabel, input.unitType === 'distinct_days' ? 'days' : 'times'),
    unitType: input.unitType === 'distinct_days' ? 'distinct_days' : 'count',
  };
};

export const parseGoalBehavior = (value?: string | null): GoalBehavior | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (parsed.kind === 'pending') {
      return createPendingGoalBehavior();
    }

    if (parsed.kind === 'standard') {
      return createStandardGoalBehavior();
    }

    if (parsed.kind === 'quota') {
      const quota = createQuotaGoalBehavior({
        targetCount: parsed.targetCount,
        completedCount: parsed.completedCount,
        unitLabel: parsed.unitLabel,
        unitType: parsed.unitType,
      });
      return {
        ...quota,
        initialPromptDismissed: parsed.initialPromptDismissed === true,
        scheduledActionTodoId: typeof parsed.scheduledActionTodoId === 'string' ? parsed.scheduledActionTodoId : undefined,
        scheduledActionDate: typeof parsed.scheduledActionDate === 'string' ? parsed.scheduledActionDate : undefined,
        lastCompletedDate: typeof parsed.lastCompletedDate === 'string' ? parsed.lastCompletedDate : undefined,
        actionTemplateTitle: cleanLabel(parsed.actionTemplateTitle, ''),
        actionTemplateDetails: cleanDetails(parsed.actionTemplateDetails),
      };
    }
  } catch {}

  return null;
};

export const serializeGoalBehavior = (behavior?: GoalBehavior | null) =>
  behavior ? JSON.stringify(behavior) : null;

export const isQuotaGoalBehavior = (behavior?: GoalBehavior | null): behavior is GoalQuotaBehavior =>
  behavior?.kind === 'quota';

export const getGoalQuotaNextCount = (behavior: GoalQuotaBehavior) =>
  Math.min(behavior.completedCount + 1, behavior.targetCount);

export const isGoalQuotaComplete = (behavior: GoalQuotaBehavior) =>
  behavior.completedCount >= behavior.targetCount;

export const getGoalQuotaActionTitle = (
  behavior: GoalQuotaBehavior,
  fallbackTitle: string
) => {
  const title = cleanLabel(behavior.actionTemplateTitle, fallbackTitle || 'Action');
  const nextCount = getGoalQuotaNextCount(behavior);
  if (behavior.unitType === 'distinct_days') {
    return `${title} - Day ${nextCount} of ${behavior.targetCount}`;
  }
  return `${title} - ${nextCount} of ${behavior.targetCount}`;
};
