jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@/app/context/TokenContext', () => ({ getAccessTokenStatic: jest.fn() }));
jest.mock('@/database/database', () => ({ database: {} }));

import { DEFAULT_LIFE_GRAPH_SETTINGS, computeLifeGraphProgress } from '@/lib/lifeGraph';
import { buildWeekPlanContext, getWeekPlanDates, readGoalPlanSteps } from '@/lib/weekPlanContext';

// Wednesday; the week runs Mon Sep 28 to Sun Oct 4
const now = new Date(2026, 8, 30, 10);
const weekStart = new Date(2026, 8, 28);

describe('getWeekPlanDates', () => {
  it('plans from today through Sunday, skipping days already past', () => {
    expect(getWeekPlanDates(now, weekStart)).toEqual([
      '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
    expect(getWeekPlanDates(new Date(2026, 8, 28, 8), weekStart)).toHaveLength(7);
  });
});

describe('buildWeekPlanContext', () => {
  const context = buildWeekPlanContext({
    now,
    weekStart,
    events: [{ id: 'e1', title: 'Team sync', startDate: new Date(2026, 9, 1, 14), endDate: new Date(2026, 9, 1, 15), isAllDay: false }],
    tasks: [
      { title: 'Pay rent', dueDate: new Date(2026, 8, 25), hasDueTime: false, isOverdue: true, starred: false },
      { title: 'Call mom', hasDueTime: false, isOverdue: false, starred: true },
    ],
    goals: [{ title: 'Run 10k' }],
    lifeGraph: DEFAULT_LIFE_GRAPH_SETTINGS,
    lifeGraphProgress: computeLifeGraphProgress(
      DEFAULT_LIFE_GRAPH_SETTINGS,
      [{ text: 'Gym', completedAt: new Date(2026, 8, 29) }],
      weekStart
    ),
  });

  it('plans every remaining day right away as calendar blocks, then points out gaps', () => {
    expect(context).toContain('plan the whole week right away with plan_my_week. Do not ask questions first.');
    expect(context).toContain('Call plan_my_week exactly once, with one entry in days for EACH of these dates, in order: 2026-09-30, 2026-10-01, 2026-10-02, 2026-10-03, 2026-10-04');
    expect(context).toContain('point out anything left unscheduled');
    expect(context).toContain('Give EVERY To Do task below a time block');
    expect(context).toContain('each type event with a start time');
    expect(context).toContain('Repeat weekly switch');
  });

  it('marks timed tasks as already fixed so they are not scheduled twice', () => {
    const timed = buildWeekPlanContext({
      now,
      weekStart,
      events: [],
      tasks: [{ title: 'Guitar practice', dueDate: new Date(2026, 9, 1, 20), hasDueTime: true, isOverdue: false, starred: false }],
      goals: [],
      lifeGraph: DEFAULT_LIFE_GRAPH_SETTINGS,
      lifeGraphProgress: computeLifeGraphProgress(DEFAULT_LIFE_GRAPH_SETTINGS, [], weekStart),
    });
    expect(timed).toContain('"Guitar practice" (fixed at Thu Oct 1 8:00 PM: already on that day, do not add it)');
    expect(timed).toContain('except the ones marked fixed');
  });

  it('never creates tasks or goals', () => {
    expect(context).toContain('never create, edit or complete tasks or goals');
    expect(context).toContain('nothing is saved from it');
    expect(context).not.toContain('goal_create:');
  });

  it('includes events, tasks with their exact titles, goals, and life areas', () => {
    expect(context).toContain('Thu Oct 1 2:00 PM-3:00 PM: Team sync');
    expect(context).toContain('"Pay rent" (overdue since Fri Sep 25)');
    expect(context).toContain('"Call mom" (no date, starred)');
    expect(context).toContain('- "Run 10k"');
    expect(context).toContain('- Health: 1/5 (behind)');
  });
});

describe('buildWeekPlanContext around the week goal', () => {
  const base = {
    now,
    weekStart,
    events: [],
    tasks: [],
    lifeGraph: DEFAULT_LIFE_GRAPH_SETTINGS,
    lifeGraphProgress: computeLifeGraphProgress(DEFAULT_LIFE_GRAPH_SETTINGS, [], weekStart),
  };

  it('plans around an existing This Week goal and lists its remaining plan steps in order', () => {
    const context = buildWeekPlanContext({
      ...base,
      goals: [{
        title: 'Run 10k',
        details: 'Race on Sunday',
        deadline: new Date(2026, 9, 4),
        steps: [
          { title: 'Buy running shoes', cadence: 'once', done: true, active: false },
          { title: 'Easy 3k run', cadence: 'daily', effort: 'light', done: false, active: true },
          { title: 'Long 8k run', cadence: 'once', effort: 'heavy', done: false, active: false },
        ],
      }],
    });
    expect(context).toContain("weekGoal: the week's focus in a few words: the This Week goal below");
    expect(context).toContain('- "Run 10k" (deadline Sun Oct 4)');
    expect(context).toContain('Details: Race on Sunday');
    expect(context).toContain('Plan steps (2 of 3 left, in order):');
    expect(context).toContain('- Easy 3k run (daily, light, current step)');
    expect(context).toContain('- Long 8k run (once, heavy)');
    expect(context).not.toContain('Buy running shoes (');
    expect(context).toContain("mainGoal: the day's main focus");
    expect(context).toContain('items: at most 5 per day');
    expect(context).toContain('Short titles only; never details');
  });

  it("builds the week around the user's tasks when there is no week goal, without asking for one", () => {
    const context = buildWeekPlanContext({
      ...base,
      goals: [],
      longerGoals: [{ title: 'Learn Spanish', timeframe: 'thisYear' }],
    });
    expect(context).toContain("the most important goal or theme in the user's tasks");
    expect(context).toContain("- none: build the week around the user's tasks");
    expect(context).not.toContain('ask what they want to achieve');
    expect(context).toContain('- "Learn Spanish" (this year)');
  });

  it('lists wishlist items and only plans the ones that support the goal', () => {
    const context = buildWeekPlanContext({
      ...base,
      goals: [{ title: 'Run 10k' }],
      wishlist: [{ title: 'Running watch', details: 'GPS' }],
    });
    expect(context).toContain('Wishlist (1; things the user wants to buy):');
    expect(context).toContain('- "Running watch": GPS');
    expect(context).toContain("only if it supports the week's goal or the user asks for it");
  });
});

describe('readGoalPlanSteps', () => {
  it('marks done and current steps and tolerates bad JSON', () => {
    expect(readGoalPlanSteps({
      stepsJson: JSON.stringify([{ title: 'A', cadence: 'daily', effort: 'huge' }, { title: 'B' }, { title: ' ' }]),
      completedStepIndexesJson: '[0]',
      activeStepIndex: 1,
    })).toEqual([
      { title: 'A', details: undefined, cadence: 'daily', effort: undefined, done: true, active: false },
      { title: 'B', details: undefined, cadence: 'once', effort: undefined, done: false, active: true },
    ]);
    expect(readGoalPlanSteps({ stepsJson: 'oops', completedStepIndexesJson: '', activeStepIndex: 0 })).toEqual([]);
  });
});
