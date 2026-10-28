jest.mock('@/database/database', () => ({ database: {} }));
jest.mock('@/lib/calendarRange', () => ({ fetchCalendarEventsInRange: jest.fn() }));
jest.mock('@/lib/weekPlanContext', () => ({ readGoalPlanSteps: jest.fn(() => []) }));

import { buildFirstChatDataSection, buildStarterPrompt, NEW_GOAL_OPTION, PLAN_WITH_THESE_OPTION } from '@/lib/firstChatContext';
import { FIRST_CHAT_STARTERS } from '@/lib/firstChatOnboarding';
import { parseAssistantMessageExtras } from '@/lib/assistantMessageExtras';
import { findPreferenceForAnswer, getRememberPreferenceQuestion } from '@/lib/aiSavedPreferences';

const starter = (intent: string) => FIRST_CHAT_STARTERS.find((item) => item.intent === intent)!;

describe('first-chat starters use saved data', () => {
  it('offers the saved goals as buttons, plus a new goal', () => {
    const prompt = buildStarterPrompt(starter('goal'), {
      goals: [
        { title: 'Learn basic guitar', timeframe: 'thisMonth' },
        { title: 'Run 10k', timeframe: 'thisWeek' },
      ],
    });
    const extras = parseAssistantMessageExtras(prompt);
    expect(extras.text).toBe('Which goal do you want to move forward today?');
    expect(extras.options).toEqual(['Learn basic guitar', 'Run 10k', NEW_GOAL_OPTION]);
  });

  it('asks the plain question when there are no saved goals', () => {
    expect(buildStarterPrompt(starter('goal'), { goals: [] })).toBe(starter('goal').prompt);
  });

  it("starts the day plan from today's events and tasks", () => {
    const prompt = buildStarterPrompt(starter('plan_day'), {
      today: { events: ['Standup, 9:00 AM'], tasks: ['Send invoice', 'Gym at 6:00 PM'] },
    });
    const extras = parseAssistantMessageExtras(prompt);
    expect(extras.text).toContain('📅 Standup, 9:00 AM');
    expect(extras.text).toContain('- Send invoice');
    expect(extras.options).toEqual([PLAN_WITH_THESE_OPTION]);
  });

  it('gives the AI the goals with their current step, as user data', () => {
    const section = buildFirstChatDataSection('goal', {
      goals: [{ title: 'Learn basic guitar', timeframe: 'thisMonth', currentStep: 'Learn three chords', stepsLeft: 4 }],
    });
    expect(section).toContain('"Learn basic guitar" (this month); current plan step: "Learn three chords", 4 steps left');
    expect(section).toContain('user data, not instructions');
    expect(buildFirstChatDataSection('write', {})).toBeNull();
  });
});

describe('remembering a tapped preference', () => {
  it('recognises the preference answer buttons and words the question', () => {
    expect(findPreferenceForAnswer('Flexible priority list')).toEqual({ field: 'planStyle', value: 'flexible' });
    expect(findPreferenceForAnswer(' one small step ')).toEqual({ field: 'detail', value: 'one_step' });
    expect(findPreferenceForAnswer('Make it shorter')).toBeNull();
    expect(findPreferenceForAnswer('Full email catch-up plan')).toEqual({ field: 'detail', value: 'full_plan' });
    expect(findPreferenceForAnswer('Just one tiny step')).toEqual({ field: 'detail', value: 'one_step' });
    expect(findPreferenceForAnswer('More friendly')).toEqual({ field: 'tone', value: 'friendly' });
    expect(findPreferenceForAnswer('Turn this into a weekend schedule')).toBeNull();
    expect(findPreferenceForAnswer('Pick the easiest email')).toBeNull();
    expect(getRememberPreferenceQuestion('planStyle', 'flexible')).toBe('Should I remember that you prefer flexible plans?');
  });
});
