import { Q } from '@nozbe/watermelondb';
import { database } from '../../../../database/database';
import TodoModel from '../../../../database/models/TodoModel';
import { createTodo, deleteTodos } from '@/lib/todoMutations';
import {
  acceptGoalGuidancePlan,
  deleteGoalGuidanceForGoal,
  fetchGoalGuidancePlanForActionTodo,
  fetchGoalGuidancePlanForGoal,
  requestGoalGuidance,
  saveGoalGuidanceResponse,
  type GoalGuidancePlan,
  type GoalGuidanceResponse,
  type GoalGuidanceStep,
} from '@/lib/goalGuidance';
import { fetchTaskGuideForTodo, type TaskGuide, type TaskGuidanceStep } from '@/lib/taskGuidance';
import {
  createDefaultRecipeAnswers,
  fetchRecipeGuideForTodo,
  requestRecipeAnswer,
  requestRecipeVideos,
  saveRecipeGuide,
  type RecipeGuide,
} from '@/lib/recipeGuidance';
import {
  fetchSkillGuideForTodo,
  requestSkillAnswer,
  requestSkillVideos,
  saveSkillGuide,
  type SkillGuide,
} from '@/lib/skillGuidance';
import { getGoalDefaultDueDate, inferGoalTimeframeFromDueDate, isGoalTodoTimeframe, type GoalTodoTimeframe } from '@/utils/goalTimeframes';
import { auth } from '@/firebaseConfig';
import { SERVER_URL } from '@/config/backend';
import { readAiPersonalizationSettings } from '@/lib/aiPersonalization';
import { getAiResponseErrorMessage } from '@/lib/aiAuth';
import { getAiRequestHeaders as getFirebaseHeaders } from '@/lib/aiRequest';
import { isClassificationNotOnPlanError, requestTodoClassification, type GuidancePath, type TodoClassification } from '@/lib/todoClassification';

/** A goal on Free, where automatic classification is Pro only. */
const UNCLASSIFIED_GOAL: TodoClassification = { kind: 'normal', confidence: 0, goalBehavior: null };
import { isQuotaGoalBehavior, serializeGoalBehavior } from '@/lib/goalBehavior';
import type { ToolHandler } from './todo';

type GoalGuidanceTimeframe = 'thisWeek' | 'thisMonth' | 'thisYear' | 'longTerm';
type GuidanceStepScope = 'current' | 'next' | 'all';

type GuidanceSource =
  | {
      guideType: 'goal';
      todo: TodoModel;
      plan: GoalGuidancePlan;
      activeStepIndex: number;
      steps: GoalGuidanceStep[];
      title: string;
      details?: string;
      status: string;
    }
  | {
      guideType: 'task';
      todo: TodoModel;
      guide: TaskGuide;
      activeStepIndex: number;
      steps: TaskGuidanceStep[];
      title: string;
      details?: string;
      status: string;
    }
  | {
      guideType: 'recipe';
      todo: TodoModel;
      guide: RecipeGuide;
      activeStepIndex: number;
      steps: RecipeGuide['steps'];
      title: string;
      details?: string;
      status: string;
    }
  | {
      guideType: 'skill';
      todo: TodoModel;
      guide: SkillGuide;
      activeStepIndex: number;
      steps: SkillGuide['steps'];
      title: string;
      details?: string;
      status: string;
    };

const getWeekStartsOnFromLocale = (): 0 | 1 | 2 | 3 | 4 | 5 | 6 => {
  try {
    const LocaleCtor = (Intl as any)?.Locale;
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const firstDay = LocaleCtor ? new LocaleCtor(locale).weekInfo?.firstDay : undefined;
    if (typeof firstDay === 'number') {
      return (firstDay === 7 ? 0 : firstDay) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    }
  } catch {}
  return 1;
};

const normalize = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const toLocalIso = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().replace('Z', '');
};

const truncate = (value: unknown, maxLength: number) => {
  const text = String(value || '').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
};

const normalizeSourceSteps = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((step) => ({
      title: truncate(step?.title, 200),
      details: truncate(step?.details, 1000),
    }))
    .filter((step) => step.title.length > 0)
    .slice(0, 24);

const formatGoalGuidanceResponseForConversation = (response: GoalGuidanceResponse) => {
  const steps = response.steps
    .map((step, index) => `${index + 1}. ${step.title}${step.details ? ` - ${step.details}` : ''}`)
    .join('\n');

  return [
    response.feasibilityNote || 'Steps are ready.',
    steps ? `Steps:\n${steps}` : '',
  ].filter(Boolean).join('\n');
};

const toTodoItem = (todo: TodoModel) => ({
  id: String(todo.id),
  text: String(todo.text || ''),
  dueDate: todo.dueDate ? new Date(todo.dueDate).toISOString() : null,
  hasDueTime: !!todo.hasDueTime,
  completed: !!todo.completed,
  starred: !!todo.starred,
  workspace: String(todo.workspace || 'Personal'),
  goalTimeframe: todo.goalTimeframe || null,
  taskKind: todo.taskKind || null,
  guidancePath: todo.guidancePath || null,
  goalBehaviorJson: todo.goalBehaviorJson || null,
});

const getGoalTimeframe = (todo: TodoModel): GoalGuidanceTimeframe => {
  if (todo.goalTimeframe === 'thisWeek' || todo.goalTimeframe === 'thisMonth' || todo.goalTimeframe === 'thisYear' || todo.goalTimeframe === 'longTerm') {
    return todo.goalTimeframe;
  }
  const inferred = inferGoalTimeframeFromDueDate(todo.dueDate, getWeekStartsOnFromLocale());
  return inferred === 'nextWeek' ? 'thisWeek' : inferred;
};

const goal_create: ToolHandler = async (args: any) => {
  const title = String(args?.title || '').trim();
  const details = typeof args?.details === 'string' ? args.details.trim() : '';
  const timeframe = args?.timeframe as GoalTodoTimeframe;
  if (!title || !isGoalTodoTimeframe(timeframe) || timeframe === 'nextWeek') {
    return { created: 0, createdItems: [], error: 'INVALID_GOAL_INPUT' };
  }

  let classification: TodoClassification;
  try {
    classification = await requestTodoClassification({
      title,
      details,
      workspace: 'Goals',
      goalTimeframe: timeframe,
    });
  } catch (error: any) {
    if (!isClassificationNotOnPlanError(error)) {
      return {
        created: 0,
        createdItems: [],
        error: 'CLASSIFICATION_FAILED',
        message: String(error?.message || error || 'Could not classify this goal.'),
      };
    }
    classification = UNCLASSIFIED_GOAL;
  }

  const guidancePath: GuidancePath | null =
    isQuotaGoalBehavior(classification.goalBehavior)
      ? 'actions'
      : classification.kind === 'recipe' || classification.kind === 'skill'
      ? null
      : 'actions';
  const dueDate = getGoalDefaultDueDate(timeframe, new Date(), getWeekStartsOnFromLocale());
  const result = await createTodo({
    text: title,
    details,
    completed: false,
    dueDate,
    hasDueTime: false,
    starred: false,
    workspace: 'Goals',
    type: 'basic',
    progress: 0,
    isAmazonUrlLoaded: false,
    amazonUrlLoadAttempts: 0,
    goalTimeframe: timeframe,
    taskKind: classification.kind,
    guidancePath,
    goalBehaviorJson: serializeGoalBehavior(classification.goalBehavior),
  });

  return {
    created: 1,
    createdItems: [toTodoItem(result.todo)],
  };
};

const goal_create_with_guidance: ToolHandler = async (args: any) => {
  const title = String(args?.title || '').trim();
  const details = typeof args?.details === 'string' ? args.details.trim() : '';
  const timeframe = args?.timeframe as GoalTodoTimeframe;
  const guidancePath = args?.guidancePath as GuidancePath;
  const sourceSteps = normalizeSourceSteps(args?.sourceSteps);
  const sourceQuestion = truncate(args?.sourceQuestion, 8000);
  const sourceAnswer = truncate(args?.sourceAnswer, 8000);

  if (!title || !isGoalTodoTimeframe(timeframe) || timeframe === 'nextWeek' || (guidancePath !== 'actions' && guidancePath !== 'video')) {
    return { created: 0, createdItems: [], error: 'INVALID_GOAL_GUIDANCE_INPUT' };
  }

  let classification: TodoClassification;
  try {
    classification = await requestTodoClassification({
      title,
      details,
      workspace: 'Goals',
      goalTimeframe: timeframe,
    });
  } catch (error: any) {
    if (!isClassificationNotOnPlanError(error)) {
      return {
        created: 0,
        createdItems: [],
        error: 'CLASSIFICATION_FAILED',
        message: String(error?.message || error || 'Could not classify this goal.'),
      };
    }
    classification = UNCLASSIFIED_GOAL;
  }

  const effectiveGuidancePath: GuidancePath = isQuotaGoalBehavior(classification.goalBehavior) ? 'actions' : guidancePath;

  if (effectiveGuidancePath === 'video' && classification.kind !== 'recipe' && classification.kind !== 'skill') {
    return {
      created: 0,
      createdItems: [],
      error: 'VIDEO_GUIDANCE_UNSUPPORTED',
      message: 'Video guidance is only available for recipe or skill goals.',
    };
  }

  const deadline = getGoalDefaultDueDate(timeframe, new Date(), getWeekStartsOnFromLocale());
  const createGoal = async (goalTitle = title) => createTodo({
    text: goalTitle,
    details,
    completed: false,
    dueDate: deadline,
    hasDueTime: false,
    starred: false,
    workspace: 'Goals',
    type: 'basic',
    progress: 0,
    isAmazonUrlLoaded: false,
    amazonUrlLoadAttempts: 0,
    goalTimeframe: timeframe,
    taskKind: classification.kind,
    guidancePath: effectiveGuidancePath,
    goalBehaviorJson: serializeGoalBehavior(classification.goalBehavior),
  });
  const rollbackGoal = async (goalId?: string) => {
    if (!goalId) return;
    try {
      await deleteGoalGuidanceForGoal(goalId);
    } catch {}
    try {
      await deleteTodos([goalId]);
    } catch {}
  };

  if (effectiveGuidancePath === 'actions') {
    let response: GoalGuidanceResponse;
    try {
      response = await requestGoalGuidance({
        goalTitle: title,
        goalDetails: details,
        timeframe,
        deadlineLocalIso: toLocalIso(deadline),
        nowLocalIso: toLocalIso(new Date()),
        userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        currentPlan: '',
        conversation: [],
        mode: 'chat_create',
        sourceSteps,
        sourceQuestion,
        sourceAnswer,
        quota: isQuotaGoalBehavior(classification.goalBehavior)
          ? {
              targetCount: classification.goalBehavior.targetCount,
              completedCount: classification.goalBehavior.completedCount,
              unitLabel: classification.goalBehavior.unitLabel,
              unitType: classification.goalBehavior.unitType,
            }
          : undefined,
      });
    } catch (error: any) {
      return {
        created: 0,
        createdItems: [],
        error: 'GUIDANCE_FAILED',
        message: String(error?.message || error || 'Could not create an actions plan.'),
      };
    }

    if (response.type !== 'plan' || response.steps.length === 0) {
      return {
        created: 0,
        createdItems: [],
        error: 'GUIDANCE_NOT_READY',
        message: response.question || response.feasibilityNote || 'Could not create an actions plan yet.',
      };
    }

    let goalTodo: TodoModel | null = null;
    try {
      const created = await createGoal(response.goalTitle || title);
      goalTodo = created.todo;
      const conversation = [
        ...(sourceQuestion ? [{ role: 'user' as const, content: sourceQuestion }] : []),
        ...(sourceAnswer ? [{ role: 'assistant' as const, content: sourceAnswer }] : []),
        { role: 'assistant' as const, content: formatGoalGuidanceResponseForConversation(response) },
      ];
      const savedPlan = await saveGoalGuidanceResponse({
        goalId: String(goalTodo.id),
        timeframe,
        deadline,
        response,
        conversation,
        cram: false,
      });
      const accepted = await acceptGoalGuidancePlan(savedPlan.id);

      return {
        created: 1,
        createdItems: [toTodoItem(goalTodo)],
        guidancePath: 'actions',
        guide: {
          id: accepted.plan.id,
          status: accepted.plan.status,
          totalSteps: accepted.plan.steps.length,
          activeActions: accepted.plan.activeActions,
        },
        goalBehavior: classification.goalBehavior,
        actionItems: accepted.todo ? [toTodoItem(accepted.todo)] : [],
      };
    } catch (error: any) {
      await rollbackGoal(goalTodo?.id);
      return {
        created: 0,
        createdItems: [],
        error: 'GUIDANCE_SAVE_FAILED',
        message: String(error?.message || error || 'Could not save the actions plan.'),
      };
    }
  }

  let goalTodo: TodoModel | null = null;
  try {
    const created = await createGoal();
    goalTodo = created.todo;
    if (classification.kind === 'recipe') {
      const answers = createDefaultRecipeAnswers();
      try {
        const result = await requestRecipeVideos({
          context: { todoId: String(goalTodo.id), title: goalTodo.text, details: goalTodo.details || '' },
          answers,
          excludeVideoIds: [],
        });
        const guide = await saveRecipeGuide({
          todoId: String(goalTodo.id),
          answers,
          videos: result.videos,
          status: result.videos.length ? 'videos' : 'error',
          errorMessage: result.videos.length ? '' : 'No regular recipe videos were found. Try a more specific recipe name.',
        });
        return {
          created: 1,
          createdItems: [toTodoItem(goalTodo)],
          guidancePath: 'video',
          guideType: 'recipe',
          videoStatus: guide.status,
          videoCount: guide.videos.length,
        };
      } catch (error: any) {
        const message = String(error?.message || error || 'Could not find recipe videos.');
        const guide = await saveRecipeGuide({
          todoId: String(goalTodo.id),
          answers,
          videos: [],
          status: 'error',
          errorMessage: message,
        });
        return {
          created: 1,
          createdItems: [toTodoItem(goalTodo)],
          guidancePath: 'video',
          guideType: 'recipe',
          videoStatus: guide.status,
          videoCount: 0,
          message,
        };
      }
    }

    try {
      const result = await requestSkillVideos({
        context: { todoId: String(goalTodo.id), title: goalTodo.text, details: goalTodo.details || '' },
        excludeVideoIds: [],
      });
      const guide = await saveSkillGuide({
        todoId: String(goalTodo.id),
        videos: result.videos,
        status: result.videos.length ? 'videos' : 'error',
        errorMessage: result.videos.length ? '' : 'No regular videos were found. Try a more specific title.',
      });
      return {
        created: 1,
        createdItems: [toTodoItem(goalTodo)],
        guidancePath: 'video',
        guideType: 'skill',
        videoStatus: guide.status,
        videoCount: guide.videos.length,
      };
    } catch (error: any) {
      const message = String(error?.message || error || 'Could not find videos.');
      const guide = await saveSkillGuide({
        todoId: String(goalTodo.id),
        videos: [],
        status: 'error',
        errorMessage: message,
      });
      return {
        created: 1,
        createdItems: [toTodoItem(goalTodo)],
        guidancePath: 'video',
        guideType: 'skill',
        videoStatus: guide.status,
        videoCount: 0,
        message,
      };
    }
  } catch (error: any) {
    await rollbackGoal(goalTodo?.id);
    return {
      created: 0,
      createdItems: [],
      error: 'VIDEO_GUIDANCE_SAVE_FAILED',
      message: String(error?.message || error || 'Could not save video guidance.'),
    };
  }
};

const goal_query: ToolHandler = async (args: any) => {
  const openIntent = args?.openIntent === true;
  const requestedLimit = Math.min(Math.max(Number(args?.limit || 50), 1), 100);
  const limit = openIntent ? Math.max(requestedLimit, 2) : requestedLimit;
  const textContains = typeof args?.textContains === 'string' ? normalize(args.textContains) : '';
  const status = args?.status === 'completed' || args?.status === 'all' ? args.status : 'active';
  const timeframe = args?.timeframe as GoalGuidanceTimeframe | undefined;
  const rows = await database.collections
    .get<TodoModel>('todos')
    .query(Q.where('workspace', 'Goals'))
    .fetch();

  const matchingItems = rows
    .filter((todo) => {
      if (status === 'active' && todo.completed) return false;
      if (status === 'completed' && !todo.completed) return false;
      if (timeframe && getGoalTimeframe(todo) !== timeframe) return false;
      if (textContains && !normalize(`${todo.text} ${todo.details || ''}`).includes(textContains)) return false;
      return true;
    })
    .sort((left, right) => {
      const leftTime = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return String(left.text || '').localeCompare(String(right.text || ''));
    });

  const items = matchingItems
    .slice(0, limit)
    .map((todo) => ({
      ...toTodoItem(todo),
      goalTimeframe: getGoalTimeframe(todo),
    }));

  return { items, openIntent, totalMatches: matchingItems.length };
};

const findTodoForGuidance = async (args: any) => {
  const todos = database.collections.get<TodoModel>('todos');
  if (args?.todoId) {
    try {
      return await todos.find(String(args.todoId));
    } catch {}
  }

  const target = normalize(args?.textContains);
  if (!target) return null;
  const rows = await todos.query().fetch();
  return rows.find((todo) =>
    (todo.workspace === 'Goals' || todo.workspace === 'Personal') &&
    normalize(`${todo.text} ${todo.details || ''}`).includes(target)
  ) || null;
};

const getGoalActionStepIndex = (plan: GoalGuidancePlan, todoId: string) => {
  const activeAction = plan.activeActions.find((action) => action.todoId === todoId);
  if (activeAction) return activeAction.stepIndex;
  const historicalStepIndex = plan.actionTodoStepIndexes[todoId];
  return Number.isInteger(historicalStepIndex) ? historicalStepIndex : plan.activeStepIndex;
};

const getFirstIncompleteStepIndex = (steps: Array<{ completed?: boolean }>, fallback: number) => {
  const index = steps.findIndex((step) => !step.completed);
  if (index >= 0) return index;
  return Math.min(Math.max(fallback, 0), Math.max(steps.length - 1, 0));
};

const withGoalStepCompletion = (plan: GoalGuidancePlan) => {
  const completedIndexes = new Set(plan.completedStepIndexes || []);
  return plan.steps.map((step, index) => ({
    ...step,
    completed: !!(step as any).completed || completedIndexes.has(index),
  }));
};

const resolveGuidanceSource = async (args: any): Promise<GuidanceSource | null> => {
  const todo = await findTodoForGuidance(args);
  if (!todo) return null;

  if (todo.workspace === 'Goals') {
    const plan = await fetchGoalGuidancePlanForGoal(todo.id);
    if (plan && plan.status !== 'preview' && plan.steps.length > 0) {
      const steps = withGoalStepCompletion(plan);
      return {
        guideType: 'goal',
        todo,
        plan,
        activeStepIndex: Math.min(Math.max(plan.activeStepIndex, 0), plan.steps.length - 1),
        steps,
        title: todo.text,
        details: todo.details,
        status: plan.status,
      };
    }
  }

  const parentPlan = await fetchGoalGuidancePlanForActionTodo(todo.id);
  if (parentPlan && parentPlan.status !== 'preview' && parentPlan.steps.length > 0) {
    const steps = withGoalStepCompletion(parentPlan);
    const activeStepIndex = Math.min(Math.max(getGoalActionStepIndex(parentPlan, todo.id), 0), parentPlan.steps.length - 1);
    return {
      guideType: 'goal',
      todo,
      plan: parentPlan,
      activeStepIndex,
      steps,
      title: todo.text,
      details: todo.details,
      status: parentPlan.status,
    };
  }

  const recipeGuide = await fetchRecipeGuideForTodo(todo.id);
  if (recipeGuide?.status === 'ready' && recipeGuide.steps.length > 0) {
    return {
      guideType: 'recipe',
      todo,
      guide: recipeGuide,
      activeStepIndex: getFirstIncompleteStepIndex(recipeGuide.steps, recipeGuide.activeStepIndex),
      steps: recipeGuide.steps,
      title: todo.text,
      details: todo.details,
      status: recipeGuide.status,
    };
  }

  const skillGuide = await fetchSkillGuideForTodo(todo.id);
  if (skillGuide?.status === 'ready' && skillGuide.steps.length > 0) {
    return {
      guideType: 'skill',
      todo,
      guide: skillGuide,
      activeStepIndex: getFirstIncompleteStepIndex(skillGuide.steps, skillGuide.activeStepIndex),
      steps: skillGuide.steps,
      title: todo.text,
      details: todo.details,
      status: skillGuide.status,
    };
  }

  const taskGuide = await fetchTaskGuideForTodo(todo.id);
  if (taskGuide && (taskGuide.status === 'accepted' || taskGuide.status === 'complete') && taskGuide.steps.length > 0) {
    return {
      guideType: 'task',
      todo,
      guide: taskGuide,
      activeStepIndex: getFirstIncompleteStepIndex(taskGuide.steps, taskGuide.activeStepIndex),
      steps: taskGuide.steps,
      title: todo.text,
      details: todo.details,
      status: taskGuide.status,
    };
  }

  return null;
};

const stepBody = (step: any) => String(step?.body || step?.details || '').trim();

const getGuidanceStepScope = (value: unknown): GuidanceStepScope => {
  if (value === 'next' || value === 'all') return value;
  return 'current';
};

const guidance_current_step: ToolHandler = async (args: any) => {
  const source = await resolveGuidanceSource(args);
  if (!source) {
    const todo = await findTodoForGuidance(args);
    return {
      found: false,
      message: 'No saved guidance is ready for this item. Open it in the Todo tab to create or update guidance.',
      todo: todo ? toTodoItem(todo) : null,
    };
  }

  const scope = getGuidanceStepScope(args?.scope);
  const completedSteps = source.steps.filter((step: any) => !!step.completed).length;
  const currentStep = source.steps[source.activeStepIndex];
  const selectedSteps = (
    scope === 'all'
      ? source.steps
      : scope === 'next'
        ? source.steps.slice(source.activeStepIndex + 1)
        : source.steps.slice(source.activeStepIndex, source.activeStepIndex + 1)
  ).map((step, index) => {
    const stepIndex = scope === 'all'
      ? index
      : scope === 'next'
        ? source.activeStepIndex + index + 1
        : source.activeStepIndex;
    return {
      title: String(step?.title || ''),
      details: stepBody(step),
      completed: !!(step as any).completed,
      stepIndex,
      stepNumber: stepIndex + 1,
      isCurrent: stepIndex === source.activeStepIndex,
    };
  });

  return {
    found: true,
    scope,
    guideType: source.guideType,
    title: source.title,
    status: source.status,
    activeStepIndex: source.activeStepIndex,
    currentStep: currentStep ? {
      title: String(currentStep.title || ''),
      details: stepBody(currentStep),
      completed: !!(currentStep as any).completed,
      stepIndex: source.activeStepIndex,
      stepNumber: source.activeStepIndex + 1,
      isCurrent: true,
    } : null,
    steps: selectedSteps,
    totalSteps: source.steps.length,
    completedSteps,
    progressRatio: source.steps.length ? completedSteps / source.steps.length : 0,
    todo: toTodoItem(source.todo),
  };
};

const requestSavedGuidanceAnswer = async (source: Extract<GuidanceSource, { guideType: 'goal' | 'task' }>, question: string) => {
  const aiPersonalization = await readAiPersonalizationSettings(auth.currentUser?.uid);
  const response = await fetch(`${SERVER_URL}/ai/guidance/answer`, {
    method: 'POST',
    headers: await getFirebaseHeaders('guidance'),
    body: JSON.stringify({
      guideType: source.guideType,
      title: source.title,
      details: source.details || '',
      status: source.status,
      steps: source.steps.map((step) => ({
        title: step.title,
        details: (step as any).details || '',
        completed: (step as any).completed,
      })),
      activeStepIndex: source.activeStepIndex,
      conversation: source.guideType === 'goal' ? source.plan.conversation.slice(-12) : source.guide.conversation.slice(-12),
      question,
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
  };
};

const guidance_answer: ToolHandler = async (args: any) => {
  const question = String(args?.question || '').trim();
  if (!question) {
    return { found: false, message: 'Ask a question about a saved guidance step.' };
  }

  const source = await resolveGuidanceSource(args);
  if (!source) {
    const todo = await findTodoForGuidance(args);
    return {
      found: false,
      message: 'No saved guidance is ready for this item. Open it in the Todo tab to create or update guidance.',
      todo: todo ? toTodoItem(todo) : null,
    };
  }

  const response = source.guideType === 'recipe'
    ? await requestRecipeAnswer({
        context: { todoId: source.todo.id, title: source.title, details: source.details || '' },
        guide: source.guide,
        question,
      })
    : source.guideType === 'skill'
      ? await requestSkillAnswer({
          context: { todoId: source.todo.id, title: source.title, details: source.details || '' },
          guide: source.guide,
          question,
        })
      : await requestSavedGuidanceAnswer(source, question);

  const stepIndex =
    Number.isInteger(response.suggestedStepIndex) &&
    response.suggestedStepIndex! >= 0 &&
    response.suggestedStepIndex! < source.steps.length
      ? response.suggestedStepIndex!
      : source.activeStepIndex;
  const step = source.steps[stepIndex];

  return {
    found: true,
    guideType: source.guideType,
    title: source.title,
    answer: response.answer,
    suggestedStepIndex: stepIndex,
    currentStep: step ? {
      title: String(step.title || ''),
      details: stepBody(step),
      completed: !!(step as any).completed,
    } : null,
    todo: toTodoItem(source.todo),
  };
};

export const guidanceToolHandlers: Record<string, ToolHandler> = {
  goal_create,
  goal_create_with_guidance,
  goal_query,
  guidance_current_step,
  guidance_answer,
};
