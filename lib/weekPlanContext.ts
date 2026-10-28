import { Q } from '@nozbe/watermelondb';
import { addDays, format } from 'date-fns';

import { database } from '@/database/database';
import GoalGuidancePlanModel from '@/database/models/GoalGuidancePlanModel';
import TodoModel from '@/database/models/TodoModel';
import TodoRecurrenceSeriesModel from '@/database/models/TodoRecurrenceSeriesModel';
import { fetchCalendarEventsInRange, type RangeCalendarEvent } from '@/lib/calendarRange';
import {
  DEFAULT_LIFE_GRAPH_SETTINGS,
  computeLifeGraphProgress,
  getLifeGraphWeekStart,
  readLifeGraphSettings,
  type LifeGraphNodeId,
  type LifeGraphNodeProgress,
  type LifeGraphSettings,
} from '@/lib/lifeGraph';
import { getTodoRecurrenceLabel, normalizeTodoRecurrenceRule } from '@/lib/todoRecurrence';
import { inferGoalTimeframeFromDueDate } from '@/utils/goalTimeframes';

/** Fix my life always plans a Monday to Sunday week. */
const WEEK_STARTS_ON_MONDAY = 1;
/** Keeps the context message a reasonable size for the model. */
const MAX_LISTED_TASKS = 60;
const MAX_LISTED_WISHLIST_ITEMS = 20;
const MAX_LISTED_LONGER_GOALS = 8;
const MAX_LISTED_GOAL_STEPS = 12;

export type WeekPlanTask = {
  title: string;
  dueDate?: Date;
  hasDueTime: boolean;
  isOverdue: boolean;
  starred: boolean;
  /** How it repeats, e.g. "Daily", when it is a repeating task. */
  repeats?: string;
};

export type WeekPlanGoalStep = {
  title: string;
  details?: string;
  cadence?: 'once' | 'daily';
  effort?: 'light' | 'medium' | 'heavy';
  done: boolean;
  active: boolean;
};

/** A This Week goal, with its plan steps when the user has set up guidance for it. */
export type WeekPlanGoal = {
  title: string;
  details?: string;
  deadline?: Date;
  steps?: WeekPlanGoalStep[];
};

export type WeekPlanLongerGoal = { title: string; timeframe: 'thisMonth' | 'thisYear' | 'longTerm' };

export type WeekPlanWishlistItem = { title: string; details?: string };

export type WeekPlanInput = {
  now: Date;
  weekStart: Date;
  events: RangeCalendarEvent[];
  tasks: WeekPlanTask[];
  goals: WeekPlanGoal[];
  longerGoals?: WeekPlanLongerGoal[];
  wishlist?: WeekPlanWishlistItem[];
  lifeGraph: LifeGraphSettings;
  lifeGraphProgress: Record<LifeGraphNodeId, LifeGraphNodeProgress>;
};

const toDateKey = (date: Date) => format(date, 'yyyy-MM-dd');

/** Today through Sunday; days already past are not replanned. */
export function getWeekPlanDates(now: Date, weekStart: Date) {
  const todayKey = toDateKey(now);
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(weekStart, index)))
    .filter((dateKey) => dateKey >= todayKey);
}

const describeTask = (task: WeekPlanTask) => {
  const when = task.isOverdue
    ? `overdue since ${format(task.dueDate!, 'EEE MMM d')}`
    : task.dueDate && task.hasDueTime
      ? `fixed at ${format(task.dueDate, 'EEE MMM d h:mm a')}: already on that day, do not add it`
      : task.dueDate
        ? `due ${format(task.dueDate, 'EEE MMM d')}`
        : 'no date';
  return `- "${task.title}" (${when}${task.starred ? ', starred' : ''}${task.repeats ? `, repeats ${task.repeats.toLowerCase()}: a block on each day it repeats` : ''})`;
};

const describeEvent = (event: RangeCalendarEvent) =>
  event.isAllDay
    ? `- ${format(event.startDate, 'EEE MMM d')} all day: ${event.title}`
    : `- ${format(event.startDate, 'EEE MMM d h:mm a')}${event.endDate ? `-${format(event.endDate, 'h:mm a')}` : ''}: ${event.title}`;

const describeGoal = (goal: WeekPlanGoal) => {
  const lines = [`- "${goal.title}"${goal.deadline ? ` (deadline ${format(goal.deadline, 'EEE MMM d')})` : ''}`];
  if (goal.details?.trim()) lines.push(`  Details: ${goal.details.trim()}`);
  const remaining = (goal.steps ?? []).filter((step) => !step.done);
  if (goal.steps?.length) {
    lines.push(`  Plan steps (${remaining.length} of ${goal.steps.length} left, in order):`);
    lines.push(...remaining.slice(0, MAX_LISTED_GOAL_STEPS).map((step) => {
      const tags = [step.cadence === 'daily' ? 'daily' : 'once', step.effort, step.active ? 'current step' : null].filter(Boolean);
      return `  - ${step.title} (${tags.join(', ')})${step.details?.trim() ? `: ${step.details.trim()}` : ''}`;
    }));
  } else {
    lines.push('  No plan steps yet: break it into concrete daily steps yourself.');
  }
  return lines;
};

const LONGER_GOAL_LABELS: Record<WeekPlanLongerGoal['timeframe'], string> = {
  thisMonth: 'this month',
  thisYear: 'this year',
  longTerm: 'long term',
};

/**
 * The system message that drives a Fix my life conversation. It stays attached to
 * every request in that chat, so later turns still know the week and the rules.
 * Fix my life builds a realistic weekly schedule from what the user already has
 * (To Do tasks, goals, calendar events). It is a schedule only: it never adds tasks
 * or goals, and saving a day puts its time blocks on the calendar, optionally
 * repeating every week.
 */
export function buildWeekPlanContext(input: WeekPlanInput) {
  const weekEnd = addDays(input.weekStart, 6);
  const planDates = getWeekPlanDates(input.now, input.weekStart);
  const enabledNodes = input.lifeGraph.nodes.filter((node) => node.enabled);
  const longerGoals = (input.longerGoals ?? []).slice(0, MAX_LISTED_LONGER_GOALS);
  const wishlist = (input.wishlist ?? []).slice(0, MAX_LISTED_WISHLIST_ITEMS);
  const hasWeekGoal = input.goals.length > 0;

  const sections = [
    'FIX MY LIFE WEEK PLAN MODE.',
    `The user tapped "Fix my life" to get a realistic schedule for their week of ${format(input.weekStart, 'EEE MMM d')} to ${format(weekEnd, 'EEE MMM d')}. Today is ${format(input.now, 'EEEE MMM d')}.`,
    'Build the schedule only from what the user already has: their To Do tasks, their goals and their calendar events below. This is a calendar schedule, not new work: never create, edit or complete tasks or goals (no todo_create, goal_create or similar tools), and never invent tasks the user does not have.',
    '',
    'Follow these steps across the conversation:',
    '1. FIRST reply: plan the whole week right away with plan_my_week. Do not ask questions first. In one or two sentences, say what the week is built around (how many tasks, which goal, the busiest days, anything overdue), that each day can be saved to the calendar and set to repeat weekly, and that the user can ask for changes.',
    `2. Call plan_my_week exactly once, with one entry in days for EACH of these dates, in order: ${planDates.join(', ')}. Today is included. Never plan only one day, and never use plan_my_day for this.`,
    `   - weekGoal: the week's focus in a few words${hasWeekGoal ? ': the This Week goal below' : ": the most important goal or theme in the user's tasks"}. It is only shown to the user; nothing is saved from it.`,
    "   - Give EVERY To Do task below a time block, except the ones marked fixed (they already have their time and appear on that day). A task due on a given day goes on that day. A repeating task gets a block on each day it repeats. Overdue and undated tasks are spread over the coming days, starred and overdue ones first, on lighter days. Use each task's exact title. The user's tasks come first: never leave one out to make room for a goal block.",
    "   - Then, in the slots left, add one block a day for the week's goal step, when there is a This Week goal. Follow the goal's plan steps in order (one-off steps once, daily steps can repeat). If the goal has no steps, use small daily steps toward it.",
    "   - items: at most 5 per day, each type event with a start time (ISO, the user's timezone), durationMinutes and timeSource ai, at realistic times: leave breaks, keep evenings light, never stack the day full. Short titles only; never details. If a day has more than fits, move the least urgent undated tasks to a lighter day.",
    "   - mainGoal: the day's main focus in a few words: the goal step, or the most important task that day.",
    '   - Calendar events and timed tasks already on that day are fixed: the app shows them on the card and plans around them. Do not include them as items, and do not schedule over them.',
    "   - A wishlist item becomes a \"Buy <item>\" block only if it supports the week's goal or the user asks for it.",
    "3. The app shows one card per day (its main focus, the fixed items and the new time blocks). Each card has a Repeat weekly switch and a Save button that adds that day's blocks to the calendar (every week when Repeat weekly is on). When the user replies after that, point out anything left unscheduled if they ask, and remind them to tap Save on the days they want.",
    'If the user asks for changes to one day, call plan_my_week again with only that date, its main focus and its updated items. If they ask to replan the week, call plan_my_week again with every remaining date.',
    '',
    `This Week goals (${input.goals.length}):`,
    ...(hasWeekGoal ? input.goals.flatMap(describeGoal) : ["- none: build the week around the user's tasks"]),
    '',
    `Longer-term goals (${longerGoals.length}; context for suggestions, not planned directly):`,
    ...(longerGoals.length ? longerGoals.map((goal) => `- "${goal.title}" (${LONGER_GOAL_LABELS[goal.timeframe]})`) : ['- none']),
    '',
    `Calendar events this week (${input.events.length}):`,
    ...(input.events.length ? input.events.map(describeEvent) : ['- none']),
    '',
    `Open To Do tasks for this week, overdue or undated (${input.tasks.length}):`,
    ...(input.tasks.length ? input.tasks.slice(0, MAX_LISTED_TASKS).map(describeTask) : ['- none']),
    '',
    `Wishlist (${wishlist.length}; things the user wants to buy):`,
    ...(wishlist.length ? wishlist.map((item) => `- "${item.title}"${item.details?.trim() ? `: ${item.details.trim()}` : ''}`) : ['- none']),
    '',
    'Life areas (the user\'s Life Graph; completed related tasks this week vs weekly target):',
    ...(enabledNodes.length
      ? enabledNodes.map((node) => {
        const { completedCount } = input.lifeGraphProgress[node.id];
        const status = completedCount >= node.weeklyTarget ? 'on track' : 'behind';
        return `- ${node.name}: ${completedCount}/${node.weeklyTarget} (${status}); related words: ${node.keywords.join(', ') || 'none'}`;
      })
      : ['- none set up']),
  ];

  return sections.join('\n');
}

const EFFORTS = ['light', 'medium', 'heavy'] as const;

const parseJsonArray =<T,>(value: string | null | undefined): T[] => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** A goal's plan steps from its guidance plan, with which are done and which is current. */
export function readGoalPlanSteps(plan: Pick<GoalGuidancePlanModel, 'stepsJson' | 'completedStepIndexesJson' | 'activeStepIndex'>): WeekPlanGoalStep[] {
  const completed = new Set(parseJsonArray<number>(plan.completedStepIndexesJson));
  return parseJsonArray<Record<string, unknown>>(plan.stepsJson)
    .map((step, index): WeekPlanGoalStep => ({
      title: typeof step?.title === 'string' ? step.title.trim() : '',
      details: typeof step?.details === 'string' ? step.details : undefined,
      cadence: step?.cadence === 'daily' ? 'daily' as const : 'once' as const,
      effort: EFFORTS.find((effort) => effort === step?.effort),
      done: completed.has(index),
      active: index === plan.activeStepIndex && !completed.has(index),
    }))
    .filter((step) => step.title);
}

export async function loadWeekPlanContext(userId: string | null | undefined, now = new Date()) {
  const weekStart = getLifeGraphWeekStart(now, WEEK_STARTS_ON_MONDAY);
  const weekEndExclusive = addDays(weekStart, 7);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [events, openTodos, lifeGraph, completedThisWeek] = await Promise.all([
    fetchCalendarEventsInRange(weekStart, weekEndExclusive),
    database.get<TodoModel>('todos').query(Q.where('completed', false)).fetch(),
    userId ? readLifeGraphSettings(userId) : Promise.resolve(null),
    database.get<TodoModel>('todos')
      .query(Q.where('completed', true), Q.where('updated_at', Q.gte(weekStart.getTime())))
      .fetch(),
  ]);

  const goalTodos = openTodos.filter((todo) => todo.workspace === 'Goals');
  const timeframeOf = (todo: TodoModel) =>
    todo.goalTimeframe || inferGoalTimeframeFromDueDate(todo.dueDate, WEEK_STARTS_ON_MONDAY, now);
  const weekGoalTodos = goalTodos.filter((todo) => timeframeOf(todo) === 'thisWeek');

  // The latest plan per goal; an accepted plan wins over a preview the user never confirmed.
  const plans = weekGoalTodos.length
    ? await database.get<GoalGuidancePlanModel>('goal_guidance_plans')
      .query(Q.where('goal_id', Q.oneOf(weekGoalTodos.map((todo) => todo.id))))
      .fetch()
    : [];
  const planByGoalId = new Map<string, GoalGuidancePlanModel>();
  for (const plan of plans) {
    const current = planByGoalId.get(plan.goalId);
    const rank = (candidate: GoalGuidancePlanModel) => (candidate.status === 'preview' ? 0 : 1);
    if (!current || rank(plan) > rank(current) || (rank(plan) === rank(current) && plan.updatedAt > current.updatedAt)) {
      planByGoalId.set(plan.goalId, plan);
    }
  }

  const goals: WeekPlanGoal[] = weekGoalTodos.map((todo) => {
    const plan = planByGoalId.get(todo.id);
    return {
      title: todo.text,
      details: todo.details,
      deadline: plan?.deadline ?? todo.dueDate,
      steps: plan ? readGoalPlanSteps(plan) : undefined,
    };
  });

  const longerGoals = goalTodos
    .map((todo) => ({ title: todo.text, timeframe: timeframeOf(todo) }))
    .filter((goal): goal is WeekPlanLongerGoal =>
      goal.timeframe === 'thisMonth' || goal.timeframe === 'thisYear' || goal.timeframe === 'longTerm');

  const wishlist = openTodos
    .filter((todo) => todo.workspace === 'Wishlist')
    .map((todo) => ({ title: todo.text, details: todo.details }));

  const repeatLabelBySeriesId = new Map(
    (await database.get<TodoRecurrenceSeriesModel>('todo_recurrence_series').query().fetch().catch(() => []))
      .filter((series) => series.active)
      .map((series) => [series.id, getTodoRecurrenceLabel(normalizeTodoRecurrenceRule({ interval: series.interval, unit: series.unit }))])
  );
  const tasks = openTodos
    .filter((todo) => todo.workspace !== 'Goals' && todo.workspace !== 'Wishlist')
    .filter((todo) => !todo.dueDate || todo.dueDate.getTime() < weekEndExclusive.getTime())
    .map((todo) => ({
      title: todo.text,
      dueDate: todo.dueDate,
      hasDueTime: !!todo.hasDueTime,
      isOverdue: !!todo.dueDate && todo.dueDate.getTime() < todayStart.getTime(),
      starred: !!todo.starred,
      repeats: todo.recurrenceSeriesId ? repeatLabelBySeriesId.get(todo.recurrenceSeriesId) : undefined,
    }))
    .sort((left, right) => Number(right.isOverdue) - Number(left.isOverdue) || Number(right.starred) - Number(left.starred));

  const settings = lifeGraph ?? DEFAULT_LIFE_GRAPH_SETTINGS;
  const lifeGraphProgress = computeLifeGraphProgress(
    settings,
    completedThisWeek.map((todo) => ({ text: todo.text, details: todo.details, completedAt: todo.updatedAt })),
    weekStart
  );

  return buildWeekPlanContext({ now, weekStart, events, tasks, goals, longerGoals, wishlist, lifeGraph: settings, lifeGraphProgress });
}
