import { auth } from '@/firebaseConfig';
import { SERVER_URL } from '@/config/backend';
import { createAiAuthRequiredError, getAiResponseErrorMessage, isAiAuthRequiredError } from '@/lib/aiAuth';
import { getAiRequestHeaders as getFirebaseHeaders } from '@/lib/aiRequest';
import { isProRequiredMessage, isSubscriptionRequiredError } from '@/lib/subscriptionAccess';
import {
  createQuotaGoalBehavior,
  createStandardGoalBehavior,
  type GoalBehavior,
  type GoalQuotaUnitType,
} from '@/lib/goalBehavior';

export type TodoTaskKind = 'normal' | 'recipe' | 'skill';
export type GuidancePath = 'actions' | 'video';

/**
 * Automatic classification is Eazee Pro only. On Free the item is still created, as a normal
 * task (like adding it in To Do), instead of being skipped.
 */
export const isClassificationNotOnPlanError = (error: unknown) =>
  isSubscriptionRequiredError(error) || isProRequiredMessage((error as any)?.message);

export type TodoClassification = {
  kind: TodoTaskKind;
  confidence: number;
  goalBehavior?: GoalBehavior | null;
};

export type GoalQuotaDateResolutionIntent =
  | 'schedule_date'
  | 'open_picker'
  | 'decide_later'
  | 'needs_clarification'
  | 'none';

export type GoalQuotaDateResolution = {
  intent: GoalQuotaDateResolutionIntent;
  dateIso?: string;
  label?: string;
  message?: string;
};

export const normalizeTodoTaskKind = (value: unknown): TodoTaskKind | null =>
  value === 'normal' || value === 'recipe' || value === 'skill' ? value : null;

export const normalizeGuidancePath = (value: unknown): GuidancePath | null =>
  value === 'actions' || value === 'video' ? value : null;

const normalizeGoalQuotaUnitType = (value: unknown): GoalQuotaUnitType =>
  value === 'distinct_days' ? 'distinct_days' : 'count';

export const shouldClassifyTodoWorkspace = (workspace?: string | null) =>
  workspace === 'Personal' || workspace === 'Goals';

export const shouldUseLegacyRecipeFallback = (todo: {
  taskKind?: TodoTaskKind | null;
  workspace?: string | null;
}) => !todo.taskKind && todo.workspace === 'Personal';

const dateKeyToLocalIso = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localDate = new Date(year, month - 1, day);
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return undefined;
  }

  return localDate.toISOString();
};

export const requestTodoClassification = async (input: {
  title: string;
  details?: string;
  workspace: string;
  goalTimeframe?: string | null;
}): Promise<TodoClassification> => {
  if (!auth.currentUser?.uid) {
    throw createAiAuthRequiredError();
  }

  const response = await fetch(`${SERVER_URL}/ai/todo/classify`, {
    method: 'POST',
    headers: await getFirebaseHeaders('todoClassification'),
    body: JSON.stringify({
      title: input.title,
      details: input.details || '',
      workspace: input.workspace,
      goalTimeframe: input.goalTimeframe || '',
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getAiResponseErrorMessage(payload, response.status));
  }

  const kind = normalizeTodoTaskKind(payload?.kind);
  if (!kind) {
    throw new Error('Invalid todo classification.');
  }

  const confidence = Number(payload?.confidence);
  const targetCount = Number(payload?.quota?.targetCount ?? payload?.targetCount);
  const goalBehavior = input.workspace === 'Goals'
    ? payload?.goalBehavior === 'quota' && Number.isFinite(targetCount) && targetCount > 0
      ? createQuotaGoalBehavior({
          targetCount,
          unitLabel: payload?.quota?.unitLabel ?? payload?.unitLabel,
          unitType: normalizeGoalQuotaUnitType(payload?.quota?.unitType ?? payload?.unitType),
        })
      : createStandardGoalBehavior()
    : null;

  return {
    kind,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(confidence, 1)) : 0,
    goalBehavior,
  };
};

export const requestGoalQuotaDateResolution = async (input: {
  text: string;
  goalTitle?: string;
  userTimezone: string;
  locale?: string;
}): Promise<GoalQuotaDateResolution> => {
  const response = await fetch(`${SERVER_URL}/ai/goal-quota/resolve-date`, {
    method: 'POST',
    headers: await getFirebaseHeaders('guidance'),
    body: JSON.stringify({
      text: input.text,
      goalTitle: input.goalTitle || '',
      userTimezone: input.userTimezone,
      locale: input.locale || Intl.DateTimeFormat().resolvedOptions().locale,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getAiResponseErrorMessage(payload, response.status));
  }

  const dateIso = dateKeyToLocalIso(payload?.dateIso) ||
    (typeof payload?.dateIso === 'string' && !Number.isNaN(new Date(payload.dateIso).getTime())
      ? new Date(payload.dateIso).toISOString()
      : undefined);
  const rawIntent = typeof payload?.intent === 'string' ? payload.intent : '';
  const intent: GoalQuotaDateResolutionIntent =
    rawIntent === 'schedule_date' ||
    rawIntent === 'open_picker' ||
    rawIntent === 'decide_later' ||
    rawIntent === 'needs_clarification' ||
    rawIntent === 'none'
      ? rawIntent
      : dateIso
        ? 'schedule_date'
        : typeof payload?.message === 'string' && payload.message.trim()
          ? 'needs_clarification'
          : 'none';

  return {
    intent: intent === 'schedule_date' && !dateIso ? 'needs_clarification' : intent,
    dateIso,
    label: typeof payload?.label === 'string' ? payload.label.trim() : undefined,
    message: typeof payload?.message === 'string' ? payload.message.trim() : undefined,
  };
};

export const classifyTodoForCreate = async (input: {
  title: string;
  details?: string;
  workspace: string;
  goalTimeframe?: string | null;
}) => {
  if (!shouldClassifyTodoWorkspace(input.workspace)) {
    return null;
  }

  try {
    return await requestTodoClassification(input);
  } catch (error) {
    if (!isAiAuthRequiredError(error)) {
      console.warn('Todo classification failed:', error);
    }
    return null;
  }
};
