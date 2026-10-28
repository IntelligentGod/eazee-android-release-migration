import { Q } from '@nozbe/watermelondb';
import { auth } from '@/firebaseConfig';
import { SERVER_URL } from '@/config/backend';
import { database } from '@/database/database';
import TaskGuideModel from '@/database/models/TaskGuideModel';
import { readAiPersonalizationSettings } from '@/lib/aiPersonalization';
import { getAiResponseErrorMessage } from '@/lib/aiAuth';
import { getAiRequestHeaders as getFirebaseHeaders } from '@/lib/aiRequest';

export type TaskGuideStatus = 'preview' | 'accepted' | 'complete' | 'error';

export type TaskGuidanceStep = {
  title: string;
  details?: string;
  youtubeQuery?: string;
  completed?: boolean;
};

export type TaskGuidanceMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type TaskGuide = {
  id: string;
  todoId: string;
  steps: TaskGuidanceStep[];
  conversation: TaskGuidanceMessage[];
  activeStepIndex: number;
  status: TaskGuideStatus;
  note?: string;
  errorMessage?: string;
  createdAt: Date;
};

export type TaskGuidanceContext = {
  todoId: string;
  title: string;
  details?: string;
};

export type TaskGuidanceResponse = {
  type: 'clarify' | 'plan';
  question?: string;
  note?: string;
  steps: TaskGuidanceStep[];
};

export type TaskGuidanceAnswerResponse = {
  answer: string;
  suggestedStepIndex?: number;
};

export const shouldShowTaskGuideShortcut = (todo: {
  workspace?: string;
  completed?: boolean;
}) => todo.workspace === 'Personal' && !todo.completed;

const parseJson = <T,>(value: string | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeStep = (step: any): TaskGuidanceStep | null => {
  const title = String(step?.title || '').trim();
  if (!title) return null;
  return {
    title,
    details: typeof step?.details === 'string' ? step.details.trim() : undefined,
    youtubeQuery: typeof step?.youtubeQuery === 'string' ? step.youtubeQuery.trim() : undefined,
    completed: typeof step?.completed === 'boolean' ? step.completed : undefined,
  };
};

const normalizeMessages = (messages: any[]): TaskGuidanceMessage[] =>
  messages
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: String(message?.content || '').trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-30);

export const toTaskGuide = (row: TaskGuideModel): TaskGuide => ({
  id: row.id,
  todoId: row.todoId,
  steps: parseJson<any[]>(row.stepsJson, []).map(normalizeStep).filter(Boolean) as TaskGuidanceStep[],
  conversation: normalizeMessages(parseJson<any[]>(row.conversationJson, [])),
  activeStepIndex: Number.isInteger(row.activeStepIndex) ? row.activeStepIndex : 0,
  status:
    row.status === 'accepted' || row.status === 'complete' || row.status === 'error'
      ? row.status
      : 'preview',
  note: row.note || undefined,
  errorMessage: row.errorMessage || undefined,
  createdAt: row.createdAt,
});

const writeTaskGuideFields = (
  record: TaskGuideModel,
  input: {
    todoId: string;
    steps?: TaskGuidanceStep[];
    conversation?: TaskGuidanceMessage[];
    activeStepIndex?: number;
    status?: TaskGuideStatus;
    note?: string;
    errorMessage?: string;
  }
) => {
  record.todoId = input.todoId;
  if (input.steps !== undefined) record.stepsJson = JSON.stringify(input.steps);
  if (input.conversation !== undefined) record.conversationJson = JSON.stringify(normalizeMessages(input.conversation));
  if (input.activeStepIndex !== undefined) record.activeStepIndex = input.activeStepIndex;
  if (input.status !== undefined) record.status = input.status;
  if (input.note !== undefined) record.note = input.note;
  if (input.errorMessage !== undefined) record.errorMessage = input.errorMessage;
};

export const fetchTaskGuideForTodo = async (todoId: string) => {
  const rows = await database.collections
    .get<TaskGuideModel>('task_guides')
    .query(Q.where('todo_id', todoId))
    .fetch();
  return rows[0] ? toTaskGuide(rows[0]) : null;
};

export const saveTaskGuide = async (input: {
  todoId: string;
  steps?: TaskGuidanceStep[];
  conversation?: TaskGuidanceMessage[];
  activeStepIndex?: number;
  status?: TaskGuideStatus;
  note?: string;
  errorMessage?: string;
}) => {
  const collection = database.collections.get<TaskGuideModel>('task_guides');
  const rows = await collection.query(Q.where('todo_id', input.todoId)).fetch();
  const existing = rows[0];
  let saved!: TaskGuideModel;

  await database.write(async () => {
    if (existing) {
      saved = await existing.update((record) => writeTaskGuideFields(record, input));
      return;
    }

    saved = await collection.create((record) => {
      writeTaskGuideFields(record, {
        steps: [],
        conversation: [],
        activeStepIndex: 0,
        status: 'preview',
        note: '',
        errorMessage: '',
        ...input,
      });
    });
  });

  return toTaskGuide(saved);
};

export const deleteTaskGuidesForTodos = async (todoIds: string[]) => {
  if (!todoIds.length) return [];

  const rows = await database.collections
    .get<TaskGuideModel>('task_guides')
    .query(Q.where('todo_id', Q.oneOf(todoIds)))
    .fetch();

  if (!rows.length) return [];

  await database.write(async () => {
    await database.batch(rows.map((row) => row.prepareDestroyPermanently()));
  });

  return rows.map((row) => row.todoId);
};

export const deleteTaskGuideForTodo = async (todoId: string) => {
  const [deletedTodoId] = await deleteTaskGuidesForTodos([todoId]);
  return deletedTodoId || null;
};

export const requestTaskGuidance = async (input: {
  context: TaskGuidanceContext;
  currentGuide?: string;
  conversation: TaskGuidanceMessage[];
  mode: 'generate' | 'answer_clarification';
}) => {
  const response = await fetch(`${SERVER_URL}/ai/task-guidance`, {
    method: 'POST',
    headers: await getFirebaseHeaders('guidance', { guidanceTitle: input.context.title }),
    body: JSON.stringify({
      title: input.context.title,
      details: input.context.details || '',
      currentGuide: input.currentGuide || '',
      conversation: normalizeMessages(input.conversation),
      mode: input.mode,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getAiResponseErrorMessage(payload, response.status));
  }

  return {
    type: payload?.type === 'clarify' ? 'clarify' as const : 'plan' as const,
    question: typeof payload?.question === 'string' ? payload.question.trim() : undefined,
    note: typeof payload?.note === 'string' ? payload.note.trim() : undefined,
    steps: Array.isArray(payload?.steps)
      ? payload.steps.map(normalizeStep).filter(Boolean) as TaskGuidanceStep[]
      : [],
  } satisfies TaskGuidanceResponse;
};

export const requestTaskGuidanceAnswer = async (input: {
  context: TaskGuidanceContext;
  guide: TaskGuide;
  question: string;
}) => {
  const aiPersonalization = await readAiPersonalizationSettings(auth.currentUser?.uid);
  const response = await fetch(`${SERVER_URL}/ai/guidance/answer`, {
    method: 'POST',
    headers: await getFirebaseHeaders('guidance', { guidanceTitle: input.context.title }),
    body: JSON.stringify({
      guideType: 'task',
      title: input.context.title,
      details: input.context.details || '',
      status: input.guide.status,
      steps: input.guide.steps.map((step) => ({
        title: step.title,
        details: step.details || '',
        completed: !!step.completed,
      })),
      activeStepIndex: input.guide.activeStepIndex,
      conversation: normalizeMessages(input.guide.conversation).slice(-12),
      question: input.question,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      aiPersonalization,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getAiResponseErrorMessage(payload, response.status));
  }

  return {
    answer: String(payload?.answer || '').trim() || 'I could not answer that yet.',
    suggestedStepIndex: Number.isInteger(payload?.suggestedStepIndex)
      ? Number(payload.suggestedStepIndex)
      : undefined,
  } satisfies TaskGuidanceAnswerResponse;
};
