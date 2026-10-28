import { Q } from '@nozbe/watermelondb';
import { auth } from '@/firebaseConfig';
import { SERVER_URL } from '@/config/backend';
import { database } from '@/database/database';
import RecipeGuideModel from '@/database/models/RecipeGuideModel';
import { readAiPersonalizationSettings } from '@/lib/aiPersonalization';
import { AI_AUTH_REQUIRED_MESSAGE } from '@/lib/aiAuth';
import { getAiRequestHeaders as getFirebaseHeaders } from '@/lib/aiRequest';
import { shouldUseLegacyRecipeFallback, type TodoTaskKind } from '@/lib/todoClassification';

export type RecipeGuideStatus = 'questions' | 'videos' | 'generating' | 'ready' | 'error';

export type RecipeAnswers = {
  dietary: string;
  targetTitle?: string;
};

export type RecipeVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  viewCount?: number;
  transcriptStatus?: 'available' | 'missing' | 'unknown';
};

export type RecipeIngredient = {
  name: string;
  quantity?: string;
  note?: string;
  checked?: boolean;
};

export type RecipeEquipmentItem = {
  name: string;
  required?: boolean;
  note?: string;
};

export type RecipeStep = {
  title: string;
  body: string;
  timestampSeconds?: number;
  durationSeconds?: number;
  completed?: boolean;
};

export type RecipeMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type RecipeGuide = {
  id: string;
  todoId: string;
  answers: RecipeAnswers;
  videos: RecipeVideo[];
  selectedVideo?: RecipeVideo;
  ingredients: RecipeIngredient[];
  equipment: RecipeEquipmentItem[];
  steps: RecipeStep[];
  conversation: RecipeMessage[];
  activeStepIndex: number;
  status: RecipeGuideStatus;
  errorMessage?: string;
  transcriptLanguage?: string;
  createdAt: Date;
};

export type RecipeContext = {
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

const RECIPE_TERMS = /\b(recipe|cook|cooking|bake|baking|make|prepare|meal|dinner|lunch|breakfast|dessert|dish|soup|stew|curry|pasta|rice|bread|cake|cookie|chicken|fish|beef|pork|tofu|paneer|vegetable|salad|sauce|noodle|roast|grill|fry|saute|air fry|oven|stovetop)\b/i;
const NON_RECIPE_TERMS = /\b(reservation|book|buy|order|grocery|groceries|restaurant|takeout|delivery|clean|email|call|meeting|appointment)\b/i;

export const shouldShowRecipeGuideShortcut = (todo: {
  workspace?: string;
  text?: string;
  details?: string;
  completed?: boolean;
  taskKind?: TodoTaskKind | null;
}) => {
  if (todo.workspace !== 'Personal' || todo.completed || todo.taskKind === 'skill' || todo.taskKind === 'normal') {
    return false;
  }

  if (todo.taskKind === 'recipe') {
    return true;
  }

  if (!shouldUseLegacyRecipeFallback(todo)) {
    return false;
  }

  const text = `${todo.text || ''} ${todo.details || ''}`.trim();
  if (!text || NON_RECIPE_TERMS.test(text)) {
    return false;
  }

  return RECIPE_TERMS.test(text);
};

export const createDefaultRecipeAnswers = (): RecipeAnswers => ({
  dietary: '',
});

const getRecipeRequestTitle = (context: RecipeContext, answers: RecipeAnswers) =>
  (answers.targetTitle || context.title).trim() || context.title;

const parseJson = <T,>(value: string | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeAnswers = (answers?: Partial<RecipeAnswers>): RecipeAnswers => ({
  dietary: String(answers?.dietary || '').trim(),
  targetTitle: String(answers?.targetTitle || '').trim() || undefined,
});

const normalizeVideo = (video: any): RecipeVideo | null => {
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

const normalizeIngredient = (item: any): RecipeIngredient | null => {
  const name = String(item?.name || '').trim();
  if (!name) return null;
  return {
    name,
    quantity: typeof item?.quantity === 'string' ? item.quantity.trim() : undefined,
    note: typeof item?.note === 'string' ? item.note.trim() : undefined,
    checked: typeof item?.checked === 'boolean' ? item.checked : undefined,
  };
};

const normalizeEquipmentItem = (item: any): RecipeEquipmentItem | null => {
  const name = String(item?.name || '').trim();
  if (!name) return null;
  return {
    name,
    required: typeof item?.required === 'boolean' ? item.required : undefined,
    note: typeof item?.note === 'string' ? item.note.trim() : undefined,
  };
};

const normalizeStep = (step: any): RecipeStep | null => {
  const title = String(step?.title || '').trim();
  const body = String(step?.body || '').trim();
  if (!title && !body) return null;
  return {
    title: title || 'Step',
    body,
    timestampSeconds: Number.isFinite(Number(step?.timestampSeconds)) ? Number(step.timestampSeconds) : undefined,
    durationSeconds: Number.isFinite(Number(step?.durationSeconds)) ? Number(step.durationSeconds) : undefined,
    completed: typeof step?.completed === 'boolean' ? step.completed : undefined,
  };
};

const normalizeMessages = (messages: any[]): RecipeMessage[] =>
  messages
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: String(message?.content || '').trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-30);

const formatRecipeRequestError = (payload: any, status: number, fallback?: string) => {
  if (status === 404 && fallback) {
    return fallback;
  }

  return String(payload?.error || payload?.message || fallback || `HTTP ${status}`);
};

const toRecipeGuide = (row: RecipeGuideModel): RecipeGuide => ({
  id: row.id,
  todoId: row.todoId,
  answers: normalizeAnswers(parseJson<Partial<RecipeAnswers>>(row.answersJson, {})),
  videos: parseJson<any[]>(row.videosJson, []).map(normalizeVideo).filter(Boolean) as RecipeVideo[],
  selectedVideo: normalizeVideo(parseJson<any>(row.selectedVideoJson, null)) || undefined,
  ingredients: parseJson<any[]>(row.ingredientsJson, []).map(normalizeIngredient).filter(Boolean) as RecipeIngredient[],
  equipment: parseJson<any[]>(row.equipmentJson, []).map(normalizeEquipmentItem).filter(Boolean) as RecipeEquipmentItem[],
  steps: parseJson<any[]>(row.stepsJson, []).map(normalizeStep).filter(Boolean) as RecipeStep[],
  conversation: normalizeMessages(parseJson<any[]>(row.conversationJson, [])),
  activeStepIndex: Number.isInteger(row.activeStepIndex) ? row.activeStepIndex : 0,
  status:
    row.status === 'videos' || row.status === 'generating' || row.status === 'ready' || row.status === 'error'
      ? row.status
      : 'questions',
  errorMessage: row.errorMessage || undefined,
  transcriptLanguage: row.transcriptLanguage || undefined,
  createdAt: row.createdAt,
});

const writeRecipeGuideFields = (
  record: RecipeGuideModel,
  input: {
    todoId: string;
    answers?: RecipeAnswers;
    videos?: RecipeVideo[];
    selectedVideo?: RecipeVideo | null;
    ingredients?: RecipeIngredient[];
    equipment?: RecipeEquipmentItem[];
    steps?: RecipeStep[];
    conversation?: RecipeMessage[];
    activeStepIndex?: number;
    status?: RecipeGuideStatus;
    errorMessage?: string;
    transcriptLanguage?: string;
  }
) => {
  record.todoId = input.todoId;
  if (input.answers !== undefined) record.answersJson = JSON.stringify(normalizeAnswers(input.answers));
  if (input.videos !== undefined) record.videosJson = JSON.stringify(input.videos);
  if (input.selectedVideo !== undefined) record.selectedVideoJson = JSON.stringify(input.selectedVideo || null);
  if (input.ingredients !== undefined) record.ingredientsJson = JSON.stringify(input.ingredients);
  if (input.equipment !== undefined) record.equipmentJson = JSON.stringify(input.equipment);
  if (input.steps !== undefined) record.stepsJson = JSON.stringify(input.steps);
  if (input.conversation !== undefined) record.conversationJson = JSON.stringify(normalizeMessages(input.conversation));
  if (input.activeStepIndex !== undefined) record.activeStepIndex = input.activeStepIndex;
  if (input.status !== undefined) record.status = input.status;
  if (input.errorMessage !== undefined) record.errorMessage = input.errorMessage;
  if (input.transcriptLanguage !== undefined) record.transcriptLanguage = input.transcriptLanguage;
};

export const fetchRecipeGuideForTodo = async (todoId: string) => {
  const rows = await database.collections
    .get<RecipeGuideModel>('recipe_guides')
    .query(Q.where('todo_id', todoId))
    .fetch();
  return rows[0] ? toRecipeGuide(rows[0]) : null;
};

export const saveRecipeGuide = async (input: {
  todoId: string;
  answers?: RecipeAnswers;
  videos?: RecipeVideo[];
  selectedVideo?: RecipeVideo | null;
  ingredients?: RecipeIngredient[];
  equipment?: RecipeEquipmentItem[];
  steps?: RecipeStep[];
  conversation?: RecipeMessage[];
  activeStepIndex?: number;
  status?: RecipeGuideStatus;
  errorMessage?: string;
  transcriptLanguage?: string;
}) => {
  const collection = database.collections.get<RecipeGuideModel>('recipe_guides');
  const rows = await collection.query(Q.where('todo_id', input.todoId)).fetch();
  const existing = rows[0];
  let saved!: RecipeGuideModel;

  await database.write(async () => {
    if (existing) {
      saved = await existing.update((record) => writeRecipeGuideFields(record, input));
      return;
    }

    saved = await collection.create((record) => {
      writeRecipeGuideFields(record, {
        answers: createDefaultRecipeAnswers(),
        videos: [],
        selectedVideo: null,
        ingredients: [],
        equipment: [],
        steps: [],
        conversation: [],
        activeStepIndex: 0,
        status: 'questions',
        errorMessage: '',
        transcriptLanguage: '',
        ...input,
      });
    });
  });

  return toRecipeGuide(saved);
};

export const deleteRecipeGuidesForTodos = async (todoIds: string[]) => {
  if (!todoIds.length) return [];

  const rows = await database.collections
    .get<RecipeGuideModel>('recipe_guides')
    .query(Q.where('todo_id', Q.oneOf(todoIds)))
    .fetch();

  if (!rows.length) return [];

  await database.write(async () => {
    await database.batch(rows.map((row) => row.prepareDestroyPermanently()));
  });

  return rows.map((row) => row.todoId);
};

export const requestRecipeVideos = async (input: {
  context: RecipeContext;
  answers: RecipeAnswers;
  excludeVideoIds?: string[];
  refinementText?: string;
  previousQuery?: string;
  previousVideos?: RecipeVideo[];
}) => {
  const response = await fetch(`${SERVER_URL}/ai/recipe/videos`, {
    method: 'POST',
    headers: await getFirebaseHeaders('recipeAndSkill'),
    body: JSON.stringify({
      title: normalizeVideoSearchText(getRecipeRequestTitle(input.context, normalizeAnswers(input.answers))),
      details: normalizeVideoSearchText(input.context.details || ''),
      answers: normalizeAnswers(input.answers),
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
      : formatRecipeRequestError(
          payload,
          response.status,
          'Recipe video search is not available on the backend yet. Add POST /ai/recipe/videos to return 5 regular YouTube videos.'
        ));
  }

  return {
    query: String(payload?.query || ''),
    videos: Array.isArray(payload?.videos)
      ? payload.videos
          .map(normalizeVideo)
          .filter(Boolean)
          .slice(0, 5) as RecipeVideo[]
      : [],
  };
};

export const requestRecipeGuide = async (input: {
  context: RecipeContext;
  answers: RecipeAnswers;
  selectedVideo: RecipeVideo;
}) => {
  const response = await fetch(`${SERVER_URL}/ai/recipe/generate`, {
    method: 'POST',
    headers: await getFirebaseHeaders('recipeAndSkill'),
    body: JSON.stringify({
      title: getRecipeRequestTitle(input.context, normalizeAnswers(input.answers)),
      details: input.context.details || '',
      answers: normalizeAnswers(input.answers),
      selectedVideo: input.selectedVideo,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(response.status === 401
      ? AI_AUTH_REQUIRED_MESSAGE
      : formatRecipeRequestError(
          payload,
          response.status,
          'Recipe generation is not available on the backend yet. Add POST /ai/recipe/generate to fetch transcripts and return ingredients, equipment, and steps.'
        ));
  }

  return {
    ingredients: Array.isArray(payload?.ingredients)
      ? payload.ingredients.map(normalizeIngredient).filter(Boolean) as RecipeIngredient[]
      : [],
    equipment: Array.isArray(payload?.equipment)
      ? payload.equipment.map(normalizeEquipmentItem).filter(Boolean) as RecipeEquipmentItem[]
      : [],
    steps: Array.isArray(payload?.steps)
      ? payload.steps.map(normalizeStep).filter(Boolean) as RecipeStep[]
      : [],
    transcriptLanguage: typeof payload?.transcriptLanguage === 'string' ? payload.transcriptLanguage : '',
  };
};

export const requestRecipeAnswer = async (input: {
  context: RecipeContext;
  guide: RecipeGuide;
  question: string;
}) => {
  const aiPersonalization = await readAiPersonalizationSettings(auth.currentUser?.uid);
  const response = await fetch(`${SERVER_URL}/ai/recipe/answer`, {
    method: 'POST',
    headers: await getFirebaseHeaders('recipeAndSkill'),
    body: JSON.stringify({
      title: getRecipeRequestTitle(input.context, normalizeAnswers(input.guide.answers)),
      details: input.context.details || '',
      answers: input.guide.answers,
      selectedVideo: input.guide.selectedVideo,
      ingredients: input.guide.ingredients,
      equipment: input.guide.equipment,
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
      : formatRecipeRequestError(
          payload,
          response.status,
          'Recipe chat is not available on the backend yet. Add POST /ai/recipe/answer to answer questions about the selected recipe.'
        ));
  }

  return {
    answer: String(payload?.answer || '').trim() || 'I could not answer that yet.',
    action: payload?.action === 'recipe_change' ? 'recipe_change' as const : 'answer' as const,
    recipeTitle: String(payload?.recipeTitle || '').trim() || undefined,
    suggestedStepIndex: Number.isInteger(payload?.suggestedStepIndex)
      ? Number(payload.suggestedStepIndex)
      : undefined,
  };
};
