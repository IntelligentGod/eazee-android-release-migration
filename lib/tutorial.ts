import AsyncStorage from '@react-native-async-storage/async-storage';

export type TutorialStep = 'chat-day-plan' | 'todo-guidance' | 'goal-guidance' | 'calendar-event' | 'home-overview' | 'wishlist-shopping';

type TutorialProgress = {
  completedSteps: TutorialStep[];
  hasStarted: boolean;
  todoDemoTodoId?: string;
  goalDemoTodoId?: string;
};

export const TUTORIAL_CHAT_DAY_PLAN_STEP: TutorialStep = 'chat-day-plan';
export const TUTORIAL_TODO_GUIDANCE_STEP: TutorialStep = 'todo-guidance';
export const TUTORIAL_GOAL_GUIDANCE_STEP: TutorialStep = 'goal-guidance';
export const TUTORIAL_CALENDAR_EVENT_STEP: TutorialStep = 'calendar-event';
export const TUTORIAL_HOME_OVERVIEW_STEP: TutorialStep = 'home-overview';
export const TUTORIAL_WISHLIST_SHOPPING_STEP: TutorialStep = 'wishlist-shopping';
export const REQUIRED_TUTORIAL_STEPS: readonly TutorialStep[] = [
  TUTORIAL_CHAT_DAY_PLAN_STEP,
  TUTORIAL_TODO_GUIDANCE_STEP,
  TUTORIAL_GOAL_GUIDANCE_STEP,
  TUTORIAL_CALENDAR_EVENT_STEP,
  TUTORIAL_HOME_OVERVIEW_STEP,
  TUTORIAL_WISHLIST_SHOPPING_STEP,
];
export const TUTORIAL_PROGRESS_KEY_PREFIX = 'tutorialProgressV1';
export const TUTORIAL_DEMO_TODO_TITLE = 'Pack for a weekend trip';
export const TUTORIAL_DEMO_TODO_DETAILS =
  'Check the weather, choose outfits, and pack the essentials.';
export const TUTORIAL_DEMO_GOAL_TITLE = 'Learn basic guitar';

/**
 * The walkthrough's own demo task and goal. Guidance on these two works on the
 * Free plan, so a new user can finish the tutorial; the server applies the
 * same exception (TUTORIAL_DEMO_TITLES in eazee-server/src/usage/usageLimits.ts).
 */
export const isTutorialDemoTitle = (title: unknown) => {
  const normalized = typeof title === 'string' ? title.trim().toLowerCase() : '';
  return normalized === TUTORIAL_DEMO_TODO_TITLE.toLowerCase() || normalized === TUTORIAL_DEMO_GOAL_TITLE.toLowerCase();
};
export const TUTORIAL_DEMO_GOAL_DETAILS =
  'Build a beginner practice routine for chords, strumming, and simple songs.';
export const TUTORIAL_GOAL_GUIDANCE_REPLY =
  'I have a guitar to practice with. This is my first time playing guitar. I can practice for 1 hour each day.';
export const CHAT_TUTORIAL_EAZEE_BUTTON_MESSAGE =
  'This is the Eazee button. You can use it to start voice transcription, or hold it while speaking and release to send a voice note.';
export const CHAT_TUTORIAL_AI_BAR_MESSAGE =
  'This is where you type to Eazee. You can use either this bar or the Eazee button to send messages.';
export const CHAT_DAY_PLAN_TUTORIAL_MESSAGE =
  'Now plan your day. Type your events, tasks, and meetings, then tap send. Example: 9am standup, lunch with Sara, gym at 6.';
export const CHAT_DAY_PLAN_SAVE_TUTORIAL_MESSAGE =
  "Here's your plan. Check the times, then tap Save plan to add it to your day.";
export const TODO_TUTORIAL_HANDOFF_MESSAGE =
  "Great, your plan is saved. Next, let's head to Todo and see how Eazee can help with a task.";
export const TODO_TUTORIAL_AI_GUIDANCE_MESSAGE =
  'AI Guidance turns a task into clear steps you can work through.';
export const TODO_TUTORIAL_VIDEO_GUIDANCE_MESSAGE =
  'Video Guidance finds helpful videos for the task. Pick one, and Eazee turns it into easier steps with timestamps.';
export const TODO_TUTORIAL_CHOOSE_GUIDANCE_MESSAGE =
  'Choose AI Guidance or Video Guidance to plan this task.';
export const TODO_TUTORIAL_PICK_VIDEO_MESSAGE =
  'Pick one video. Eazee will turn it into steps with timestamps.';
export const TODO_TUTORIAL_ACCEPT_PLAN_MESSAGE =
  'Review the steps, then tap Accept plan.';
export const TODO_TUTORIAL_VIDEO_READY_MESSAGE =
  'Your video steps are ready. Review them, then we will move on.';
export const GOAL_TUTORIAL_HANDOFF_MESSAGE =
  "Great. Now let's move on to the Goals workspace.\n\nTap the back button at the top left of your screen.";
export const GOAL_TUTORIAL_TIMEFRAMES_MESSAGE =
  'Goals use time horizons: this week, this month, this year, or long term. Eazee uses that horizon to build a plan you can actually follow.';
export const GOAL_TUTORIAL_ACTIONS_MESSAGE =
  'For goals, Eazee can build an actions plan or turn video lessons into steps.\n\nFor this walkthrough, tap Actions plan.';
export const GOAL_TUTORIAL_QUESTION_MESSAGE =
  'Eazee will ask a few questions so the plan is personalized for you.';
export const GOAL_TUTORIAL_AI_BAR_MESSAGE =
  'Use the input box below to reply to the questions. The answer is filled in for this goal.\n\nTap send.';
export const GOAL_TUTORIAL_ACCEPT_PLAN_MESSAGE =
  'Review the goal plan, then tap Accept plan.';
export const GOAL_TUTORIAL_SUMMARY_MESSAGE =
  'Eazee turns your goal into personal tasks. As you finish them, more tasks appear over the timeframe you selected so you can keep moving.';
export const GOAL_TO_CALENDAR_TUTORIAL_HANDOFF_MESSAGE =
  "Great! Now you know how to create goals and get guidance. Let's move on to the Calendar tab.\n\nTap Calendar in the bottom bar.";
export const CALENDAR_TUTORIAL_CREATE_EVENT_MESSAGE =
  'This is the Calendar screen.\n\nYou can use the input bar or Eazee button to create events, or tap a time slot and create an event manually.\n\nCreate an event to finish this step.';
export const CALENDAR_TUTORIAL_EVENT_CREATED_MESSAGE =
  "Great! Let's move on to the next step, which will be the Home screen.\n\nTap Home in the bottom bar.";
export const HOME_TUTORIAL_OVERVIEW_MESSAGE =
  "This is Home. It gives you a quick view of your next step, suggestions from Eazee, and your schedule for the day.";
export const HOME_TUTORIAL_NEXT_STEP_MESSAGE =
  'Based on your schedule, this is where your next task or event will show up. You can tap Snooze to do it later.';
export const HOME_TUTORIAL_TODAYS_PLAN_MESSAGE =
  "Your entire day's schedule will be shown here, with overdue tasks at the bottom.";
export const WISHLIST_TUTORIAL_CHAT_HANDOFF_MESSAGE =
  "Great! Let's go back to Chat for the final step.";
export const WISHLIST_TUTORIAL_MESSAGE =
  "You can ask Eazee to remember things you want to buy. It saves them to Wishlist, and the Buy button opens Amazon when you're ready.";
export const WISHLIST_TUTORIAL_PROMPT_MESSAGE =
  'Ask Eazee to remember something you want to buy. You can type it here or use the Eazee button.\n\nExample: Add a travel backpack to my Wishlist.';
export const TUTORIAL_COMPLETE_FOR_NOW_MESSAGE =
  "Great, that's the end of the tutorial. From here, Eazee can help you turn thoughts into plans, tasks, goals, calendar events, and reminders so your day feels easier to manage.";

export const getTutorialReadingTimeMs = (message: string) => {
  const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(10000, Math.max(2800, wordCount * 230 + 900));
};

const validTutorialSteps = new Set<TutorialStep>(REQUIRED_TUTORIAL_STEPS);
const listeners = new Set<() => void>();
const activeTutorialSessionUserIds = new Set<string>();
const activeTutorialCompletedSteps = new Map<string, Set<TutorialStep>>();

const getTutorialProgressKey = (userId: string) =>
  `${TUTORIAL_PROGRESS_KEY_PREFIX}:${userId}`;

const normalizeTutorialProgress = (value: string | null | undefined): TutorialProgress => {
  if (!value) {
    return { completedSteps: [], hasStarted: false };
  }

  try {
    const parsed = JSON.parse(value);
    const completedSteps = Array.isArray(parsed?.completedSteps)
      ? parsed.completedSteps.filter((step: unknown): step is TutorialStep => validTutorialSteps.has(step as TutorialStep))
      : [];
    const todoDemoTodoId = typeof parsed?.todoDemoTodoId === 'string' ? parsed.todoDemoTodoId.trim() : '';
    const goalDemoTodoId = typeof parsed?.goalDemoTodoId === 'string' ? parsed.goalDemoTodoId.trim() : '';
    return {
      completedSteps: Array.from(new Set(completedSteps)),
      hasStarted: true,
      ...(todoDemoTodoId ? { todoDemoTodoId } : {}),
      ...(goalDemoTodoId ? { goalDemoTodoId } : {}),
    };
  } catch {
    return { completedSteps: [], hasStarted: false };
  }
};

const serializeTutorialProgress = (
  progress: Pick<TutorialProgress, 'completedSteps' | 'todoDemoTodoId' | 'goalDemoTodoId'>
) =>
  JSON.stringify({
    completedSteps: progress.completedSteps,
    ...(progress.todoDemoTodoId ? { todoDemoTodoId: progress.todoDemoTodoId } : {}),
    ...(progress.goalDemoTodoId ? { goalDemoTodoId: progress.goalDemoTodoId } : {}),
  });

const emitTutorialProgressChanged = () => {
  listeners.forEach((listener) => listener());
};

export function subscribeTutorialProgress(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export async function getTutorialProgress(userId: string): Promise<TutorialProgress> {
  const storedProgress = await AsyncStorage.getItem(getTutorialProgressKey(userId));
  return normalizeTutorialProgress(storedProgress);
}

export async function startTutorial(userId: string) {
  await AsyncStorage.setItem(getTutorialProgressKey(userId), serializeTutorialProgress({ completedSteps: [] }));
  activeTutorialSessionUserIds.add(userId);
  activeTutorialCompletedSteps.set(userId, new Set());
  emitTutorialProgressChanged();
}

export function isTutorialSessionActive(userId: string) {
  return activeTutorialSessionUserIds.has(userId);
}

export function isActiveTutorialStepPending(userId: string, step: TutorialStep) {
  if (!isTutorialSessionActive(userId)) {
    return false;
  }
  return !activeTutorialCompletedSteps.get(userId)?.has(step);
}

export async function completeTutorialStep(userId: string, step: TutorialStep) {
  const progress = await getTutorialProgress(userId);
  const completedSteps = new Set(progress.completedSteps);
  completedSteps.add(step);
  await AsyncStorage.setItem(
    getTutorialProgressKey(userId),
    serializeTutorialProgress({
      completedSteps: Array.from(completedSteps),
      todoDemoTodoId: progress.todoDemoTodoId,
      goalDemoTodoId: progress.goalDemoTodoId,
    })
  );
  if (isTutorialSessionActive(userId)) {
    activeTutorialCompletedSteps.set(userId, completedSteps);
  }
  emitTutorialProgressChanged();
}

/**
 * "skip all": the whole tutorial is over. Every part counts as done and the session ends, so
 * no screen starts its part. Replay Tutorial in Settings starts it again.
 */
export async function skipWholeTutorial(userId: string) {
  const progress = await getTutorialProgress(userId);
  await AsyncStorage.setItem(
    getTutorialProgressKey(userId),
    serializeTutorialProgress({
      completedSteps: Array.from(new Set([...progress.completedSteps, ...REQUIRED_TUTORIAL_STEPS])),
      todoDemoTodoId: progress.todoDemoTodoId,
      goalDemoTodoId: progress.goalDemoTodoId,
    })
  );
  activeTutorialSessionUserIds.delete(userId);
  activeTutorialCompletedSteps.delete(userId);
  emitTutorialProgressChanged();
}

/** Tutorial "back" into a finished part: that part is in progress again. */
export async function uncompleteTutorialStep(userId: string, step: TutorialStep) {
  const progress = await getTutorialProgress(userId);
  if (!progress.completedSteps.includes(step)) return;
  const completedSteps = new Set(progress.completedSteps);
  completedSteps.delete(step);
  await AsyncStorage.setItem(
    getTutorialProgressKey(userId),
    serializeTutorialProgress({
      completedSteps: Array.from(completedSteps),
      todoDemoTodoId: progress.todoDemoTodoId,
      goalDemoTodoId: progress.goalDemoTodoId,
    })
  );
  if (isTutorialSessionActive(userId)) {
    activeTutorialCompletedSteps.set(userId, completedSteps);
  }
  emitTutorialProgressChanged();
}

export async function setTutorialTodoDemoTodoId(userId: string, todoId: string) {
  const progress = await getTutorialProgress(userId);
  await AsyncStorage.setItem(
    getTutorialProgressKey(userId),
    serializeTutorialProgress({
      completedSteps: progress.completedSteps,
      todoDemoTodoId: todoId.trim(),
      goalDemoTodoId: progress.goalDemoTodoId,
    })
  );
  emitTutorialProgressChanged();
}

export async function setTutorialGoalDemoTodoId(userId: string, todoId: string) {
  const progress = await getTutorialProgress(userId);
  await AsyncStorage.setItem(
    getTutorialProgressKey(userId),
    serializeTutorialProgress({
      completedSteps: progress.completedSteps,
      todoDemoTodoId: progress.todoDemoTodoId,
      goalDemoTodoId: todoId.trim(),
    })
  );
  emitTutorialProgressChanged();
}

export function isTutorialDemoTodoReusable(todo: { completed?: boolean; guidancePath?: string | null | undefined }) {
  return !todo.completed && !todo.guidancePath;
}

export async function isTutorialStepComplete(userId: string, step: TutorialStep) {
  const progress = await getTutorialProgress(userId);
  if (!progress.hasStarted) {
    return true;
  }
  return progress.completedSteps.includes(step);
}

export async function isTutorialComplete(userId: string) {
  const progress = await getTutorialProgress(userId);
  if (!progress.hasStarted) {
    return true;
  }
  return REQUIRED_TUTORIAL_STEPS.every((step) => progress.completedSteps.includes(step));
}
