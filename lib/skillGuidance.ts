import { Q } from '@nozbe/watermelondb';
import { auth } from '@/firebaseConfig';
import { SERVER_URL } from '@/config/backend';
import { database } from '@/database/database';
import SkillGuideModel from '@/database/models/SkillGuideModel';
import { readAiPersonalizationSettings } from '@/lib/aiPersonalization';
import { AI_AUTH_REQUIRED_MESSAGE } from '@/lib/aiAuth';
import { getAiRequestHeaders as getFirebaseHeaders } from '@/lib/aiRequest';

export type SkillGuideStatus = 'videos' | 'generating' | 'ready' | 'error';

export type SkillVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  viewCount?: number;
  transcriptStatus?: 'available' | 'missing' | 'unknown';
};

export type SkillStep = {
  title: string;
  body: string;
  timestampSeconds?: number;
  durationSeconds?: number;
  completed?: boolean;
};

export type SkillMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SkillGuide = {
  id: string;
  todoId: string;
  videos: SkillVideo[];
  selectedVideo?: SkillVideo;
  steps: SkillStep[];
  conversation: SkillMessage[];
  activeStepIndex: number;
  status: SkillGuideStatus;
  errorMessage?: string;
  transcriptLanguage?: string;
  createdAt: Date;
};

export type SkillContext = {
  todoId: string;
  title: string;
  details?: string;
};

const normalizeVideoSearchText = (value: string) =>
  value
    .replace(/c\+\+/gi, 'c plus plus')
    .replace(/c#/gi, 'c sharp')
    .replace(/\s+/g, ' ')
    .trim();

const parseJson = <T,>(value: string | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeVideo = (video: any): SkillVideo | null => {
  const videoId = String(video?.videoId || '').trim();
  if (!videoId) return null;

  return {
    videoId,
    title: String(video?.title || 'Untitled video').trim(),
    channelTitle: String(video?.channelTitle || '').trim(),
    thumbnailUrl: typeof video?.thumbnailUrl === 'string' ? video.thumbnailUrl : undefined,
    durationSeconds: Number.isFinite(Number(video?.durationSeconds)) ? Number(video.durationSeconds) : undefined,
    publishedAt: typeof video?.publishedAt === 'string' ? video.publishedAt : undefined,
    viewCount: Number.isFinite(Number(video?.viewCount)) ? Number(video.viewCount) : undefined,
    transcriptStatus:
      video?.transcriptStatus === 'available' || video?.transcriptStatus === 'missing'
        ? video.transcriptStatus
        : 'unknown',
  };
};

const normalizeStep = (step: any): SkillStep | null => {
  const title = String(step?.title || '').trim();
  const body = String(step?.body || '').trim();
  if (!title && !body) return null;
  return {
    title: title || 'Practice step',
    body,
    timestampSeconds: Number.isFinite(Number(step?.timestampSeconds)) ? Number(step.timestampSeconds) : undefined,
    durationSeconds: Number.isFinite(Number(step?.durationSeconds)) ? Number(step.durationSeconds) : undefined,
    completed: typeof step?.completed === 'boolean' ? step.completed : undefined,
  };
};

const normalizeMessages = (messages: any[]): SkillMessage[] =>
  messages
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: String(message?.content || '').trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-30);

const formatSkillRequestError = (payload: any, status: number, fallback?: string) => {
  if (status === 404 && fallback) return fallback;
  return String(payload?.error || payload?.message || fallback || `HTTP ${status}`);
};

export const toSkillGuide = (row: SkillGuideModel): SkillGuide => ({
  id: row.id,
  todoId: row.todoId,
  videos: parseJson<any[]>(row.videosJson, []).map(normalizeVideo).filter(Boolean) as SkillVideo[],
  selectedVideo: normalizeVideo(parseJson<any>(row.selectedVideoJson, null)) || undefined,
  steps: parseJson<any[]>(row.stepsJson, []).map(normalizeStep).filter(Boolean) as SkillStep[],
  conversation: normalizeMessages(parseJson<any[]>(row.conversationJson, [])),
  activeStepIndex: Number.isInteger(row.activeStepIndex) ? row.activeStepIndex : 0,
  status:
    row.status === 'generating' || row.status === 'ready' || row.status === 'error'
      ? row.status
      : 'videos',
  errorMessage: row.errorMessage || undefined,
  transcriptLanguage: row.transcriptLanguage || undefined,
  createdAt: row.createdAt,
});

const writeSkillGuideFields = (
  record: SkillGuideModel,
  input: {
    todoId: string;
    videos?: SkillVideo[];
    selectedVideo?: SkillVideo | null;
    steps?: SkillStep[];
    conversation?: SkillMessage[];
    activeStepIndex?: number;
    status?: SkillGuideStatus;
    errorMessage?: string;
    transcriptLanguage?: string;
  }
) => {
  record.todoId = input.todoId;
  if (input.videos !== undefined) record.videosJson = JSON.stringify(input.videos);
  if (input.selectedVideo !== undefined) record.selectedVideoJson = JSON.stringify(input.selectedVideo || null);
  if (input.steps !== undefined) record.stepsJson = JSON.stringify(input.steps);
  if (input.conversation !== undefined) record.conversationJson = JSON.stringify(normalizeMessages(input.conversation));
  if (input.activeStepIndex !== undefined) record.activeStepIndex = input.activeStepIndex;
  if (input.status !== undefined) record.status = input.status;
  if (input.errorMessage !== undefined) record.errorMessage = input.errorMessage;
  if (input.transcriptLanguage !== undefined) record.transcriptLanguage = input.transcriptLanguage;
};

export const fetchSkillGuideForTodo = async (todoId: string) => {
  const rows = await database.collections
    .get<SkillGuideModel>('skill_guides')
    .query(Q.where('todo_id', todoId))
    .fetch();
  return rows[0] ? toSkillGuide(rows[0]) : null;
};

export const saveSkillGuide = async (input: {
  todoId: string;
  videos?: SkillVideo[];
  selectedVideo?: SkillVideo | null;
  steps?: SkillStep[];
  conversation?: SkillMessage[];
  activeStepIndex?: number;
  status?: SkillGuideStatus;
  errorMessage?: string;
  transcriptLanguage?: string;
}) => {
  const collection = database.collections.get<SkillGuideModel>('skill_guides');
  const rows = await collection.query(Q.where('todo_id', input.todoId)).fetch();
  const existing = rows[0];
  let saved!: SkillGuideModel;

  await database.write(async () => {
    if (existing) {
      saved = await existing.update((record) => writeSkillGuideFields(record, input));
      return;
    }

    saved = await collection.create((record) => {
      writeSkillGuideFields(record, {
        videos: [],
        selectedVideo: null,
        steps: [],
        conversation: [],
        activeStepIndex: 0,
        status: 'videos',
        errorMessage: '',
        transcriptLanguage: '',
        ...input,
      });
    });
  });

  return toSkillGuide(saved);
};

export const deleteSkillGuidesForTodos = async (todoIds: string[]) => {
  if (!todoIds.length) return [];

  const rows = await database.collections
    .get<SkillGuideModel>('skill_guides')
    .query(Q.where('todo_id', Q.oneOf(todoIds)))
    .fetch();

  if (!rows.length) return [];

  await database.write(async () => {
    await database.batch(rows.map((row) => row.prepareDestroyPermanently()));
  });

  return rows.map((row) => row.todoId);
};

export const requestSkillVideos = async (input: {
  context: SkillContext;
  excludeVideoIds?: string[];
  refinementText?: string;
  previousQuery?: string;
  previousVideos?: SkillVideo[];
}) => {
  const response = await fetch(`${SERVER_URL}/ai/skill/videos`, {
    method: 'POST',
    headers: await getFirebaseHeaders('recipeAndSkill', { guidanceTitle: input.context.title }),
    body: JSON.stringify({
      title: normalizeVideoSearchText(input.context.title),
      details: normalizeVideoSearchText(input.context.details || ''),
      excludeVideoIds: Array.isArray(input.excludeVideoIds)
        ? input.excludeVideoIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
        : [],
      refinementText: String(input.refinementText || '').trim(),
      previousQuery: String(input.previousQuery || '').trim(),
      previousVideos: Array.isArray(input.previousVideos) ? input.previousVideos.slice(0, 10) : [],
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(response.status === 401
      ? AI_AUTH_REQUIRED_MESSAGE
      : formatSkillRequestError(
          payload,
          response.status,
          'Video search is not available on the backend yet. Add POST /ai/skill/videos.'
        ));
  }

  return {
    query: String(payload?.query || ''),
    videos: Array.isArray(payload?.videos)
      ? payload.videos
          .map(normalizeVideo)
          .filter(Boolean)
          .slice(0, 5) as SkillVideo[]
      : [],
  };
};

export const requestSkillGuide = async (input: {
  context: SkillContext;
  selectedVideo: SkillVideo;
}) => {
  const response = await fetch(`${SERVER_URL}/ai/skill/generate`, {
    method: 'POST',
    headers: await getFirebaseHeaders('recipeAndSkill', { guidanceTitle: input.context.title }),
    body: JSON.stringify({
      title: input.context.title,
      details: input.context.details || '',
      selectedVideo: input.selectedVideo,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(response.status === 401
      ? AI_AUTH_REQUIRED_MESSAGE
      : formatSkillRequestError(
          payload,
          response.status,
          'Video guide generation is not available on the backend yet. Add POST /ai/skill/generate.'
        ));
  }

  return {
    steps: Array.isArray(payload?.steps)
      ? payload.steps.map(normalizeStep).filter(Boolean) as SkillStep[]
      : [],
    transcriptLanguage: typeof payload?.transcriptLanguage === 'string' ? payload.transcriptLanguage : '',
  };
};

export const requestSkillAnswer = async (input: {
  context: SkillContext;
  guide: SkillGuide;
  question: string;
}) => {
  const aiPersonalization = await readAiPersonalizationSettings(auth.currentUser?.uid);
  const response = await fetch(`${SERVER_URL}/ai/skill/answer`, {
    method: 'POST',
    headers: await getFirebaseHeaders('recipeAndSkill', { guidanceTitle: input.context.title }),
    body: JSON.stringify({
      title: input.context.title,
      details: input.context.details || '',
      selectedVideo: input.guide.selectedVideo,
      steps: input.guide.steps,
      activeStepIndex: input.guide.activeStepIndex,
      conversation: input.guide.conversation.slice(-12),
      question: input.question,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      aiPersonalization,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(response.status === 401
      ? AI_AUTH_REQUIRED_MESSAGE
      : formatSkillRequestError(
          payload,
          response.status,
          'Video guide chat is not available on the backend yet. Add POST /ai/skill/answer.'
        ));
  }

  return {
    answer: String(payload?.answer || '').trim() || 'I could not answer that yet.',
    suggestedStepIndex: Number.isInteger(payload?.suggestedStepIndex)
      ? Number(payload.suggestedStepIndex)
      : undefined,
  };
};
