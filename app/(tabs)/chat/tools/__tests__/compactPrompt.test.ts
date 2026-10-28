// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildChatSystemMessages, buildCompactActionSystemMessages } = require('../../prompt');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getLastCalendarItems, resetToolMemory, setLastCalendarItems } = require('../memory');

const baseContext = {
  userTimezone: 'Asia/Kolkata',
  nowLocalIso: '2026-03-22T22:30:00+05:30',
  activeSessionSummary: '',
  lastResults: [],
  createdTodoItems: [],
  lastCalendarItems: [],
  createdCalendarItems: [],
  lastDayPlan: null,
};

describe('buildCompactActionSystemMessages', () => {
  it('sends only dynamic context because compact behavior is owned by the backend', () => {
    const messages = buildCompactActionSystemMessages({
      ...baseContext,
    });

    expect(messages[0]?.content).toBe('TimeContext: {"userTimezone":"Asia/Kolkata","nowLocal":"2026-03-22T22:30:00+05:30"}');
    expect(messages.some((message: any) => message.content.startsWith('LastCalendarReadable: '))).toBe(true);
    expect(messages.some((message: any) => message.content.includes('You are a compact action assistant'))).toBe(false);
    expect(messages.some((message: any) => message.content.includes('Available destinations:'))).toBe(false);
  });

  it('adds only the continuation context for follow-up routing rounds', () => {
    const messages = buildCompactActionSystemMessages({
      ...baseContext,
      continuedRequest: true,
    });

    expect(messages.at(-1)?.content).toContain('A tool already ran for this same request.');
    expect(messages.filter((message: any) => message.content.includes('A tool already ran')).length).toBe(1);
  });
});

describe('buildChatSystemMessages', () => {
  it('routes explicit purchase intent to Wishlist in main chat prompts', () => {
    const messages = buildChatSystemMessages(baseContext);

    expect(messages[0]?.content).toContain('If the user expresses explicit purchase intent such as buy, order, purchase, want to buy, or want to order, create a todo in the Wishlist workspace with todo_create_many.');
    expect(messages[0]?.content).toContain("'i want to buy iphone 17' -> text 'iphone 17' in Wishlist.");
    expect(messages[0]?.content).toContain("'i want to order skincare' -> text 'skincare' in Wishlist.");
    expect(messages[0]?.content).toContain("'i want to buy a phone' -> text 'phone' in Wishlist.");
  });

  it('keeps the main chat wishlist trigger scoped to explicit purchase intent', () => {
    const messages = buildChatSystemMessages(baseContext);

    expect(messages[0]?.content).not.toContain('shop for');
    expect(messages[0]?.content).not.toContain('looking for');
    expect(messages[0]?.content).not.toContain('need a new');
  });

  it('does not ask for day-plan blockers or times when tasks are provided', () => {
    const messages = buildChatSystemMessages(baseContext);

    expect(messages[0]?.content).toContain('If the user gives at least one task or event for a day plan, call plan_my_day.');
    expect(messages[0]?.content).toContain('Do not ask what fixed-time events they have, what blockers exist, or what time they want for untimed tasks/events');
    expect(messages[0]?.content).toContain('The client checks existing calendar events and timed todos as blockers.');
  });

  it('routes scheduling-only time costs to hidden day-plan buffers', () => {
    const messages = buildChatSystemMessages(baseContext);

    expect(messages[0]?.content).toContain('treat scheduling-only time costs like travel, transition, setup, cleanup, recovery, and breaks as type buffer');
    expect(messages[0]?.content).toContain('Buffers move later items but are hidden and are not saved as todos/calendar events.');
  });

  it('preserves vague dayparts as structured day-plan fields', () => {
    const messages = buildChatSystemMessages(baseContext);

    expect(messages[0]?.content).toContain("If the user gives a vague daypart for an item, set that item's daypart field");
    expect(messages[0]?.content).toContain('Never schedule a night/tonight item in the afternoon.');
  });

  it('tells main chat that image uploads are unavailable', () => {
    const messages = buildChatSystemMessages(baseContext);

    expect(messages[0]?.content).toContain('Chat does not support image uploads, photo uploads, camera uploads, or attachments.');
    expect(messages[0]?.content).toContain('Never tell the user to upload, send, attach, or share a photo or image.');
    expect(messages[0]?.content).toContain('If a photo would help, ask the user to describe it in text instead.');
  });

  it('truncates and sanitizes calendar details before prompt serialization', () => {
    const longDetails = `<b>Bring portfolio link.</b> ${'Detailed notes '.repeat(40)}private tail`;
    const messages = buildChatSystemMessages({
      ...baseContext,
      lastCalendarItems: [{
        id: 'evt-1',
        title: 'Interview',
        startDate: '2026-05-09T10:00:00+05:30',
        endDate: '2026-05-09T10:30:00+05:30',
        source: 'google',
        details: longDetails,
      }],
      createdCalendarItems: [{
        id: 'evt-2',
        title: 'Follow up',
        startDate: '2026-05-09T11:00:00+05:30',
        endDate: '2026-05-09T11:30:00+05:30',
        source: 'local',
        details: longDetails,
      }],
    });

    const lastCalendarMessage = messages.find((message: any) => message.content.startsWith('LastCalendar: '));
    const createdCalendarMessage = messages.find((message: any) => message.content.startsWith('SessionCreatedCalendar: '));
    const lastCalendar = JSON.parse(lastCalendarMessage.content.replace('LastCalendar: ', ''));
    const createdCalendar = JSON.parse(createdCalendarMessage.content.replace('SessionCreatedCalendar: ', ''));

    expect(lastCalendar[0].details).toContain('Bring portfolio link.');
    expect(lastCalendar[0].details).not.toContain('<b>');
    expect(lastCalendar[0].details).not.toContain('private tail');
    expect(lastCalendar[0].details.length).toBeLessThanOrEqual(243);
    expect(createdCalendar[0].details).toBe(lastCalendar[0].details);
  });

  it('keeps todo-tab goals separate from memory goals', () => {
    const messages = buildChatSystemMessages(baseContext);

    expect(messages[0]?.content).toContain('Todo-tab goals only come from goal tools/local todo data, not memory.');
    expect(messages[0]?.content).toContain('Use goal_query, not todo_query, when the user asks for active goals');
    expect(messages[0]?.content).toContain('If timeframe is missing, ask one short question for the timeframe.');
    expect(messages[0]?.content).toContain('Use guidance_current_step when the user asks for their current step, next steps, remaining steps, all steps, progress, status');
    expect(messages[0]?.content).toContain('Use guidance_answer for clarification, guidance history questions, resource/link requests');
  });

  it('routes quota-style goal creation into actions guidance', () => {
    const messages = buildChatSystemMessages(baseContext);

    expect(messages[0]?.content).toContain('quota-style goal with an explicit repeatable count');
    expect(messages[0]?.content).toContain('call goal_create_with_guidance with guidancePath actions');
    expect(messages[0]?.content).toContain('Do not use goal_create');
    expect(messages[0]?.content).toContain('do not use guidancePath video');
  });

  it('routes saved step lists into one guided todo', () => {
    const messages = buildChatSystemMessages(baseContext);

    expect(messages[0]?.content).toContain('call todo_create_with_steps once');
    expect(messages[0]?.content).toContain('Create one main todo with those ordered checkable steps, not one todo per step.');
    expect(messages[0]?.content).toContain('Use todo_create_many only when items are independent todos');
  });
});

describe('calendar tool memory', () => {
  beforeEach(() => {
    resetToolMemory();
  });

  afterEach(() => {
    resetToolMemory();
  });

  it('stores a bounded calendar details copy in memory', () => {
    setLastCalendarItems([{
      id: 'evt-1',
      title: 'Interview',
      startDate: '2026-05-09T10:00:00+05:30',
      endDate: '2026-05-09T10:30:00+05:30',
      source: 'google',
      details: `<p>Bring portfolio link.</p> ${'Detailed notes '.repeat(40)}private tail`,
    }]);

    const item = getLastCalendarItems()[0];
    expect(item.details).toContain('Bring portfolio link.');
    expect(item.details).not.toContain('<p>');
    expect(item.details).not.toContain('private tail');
    expect(item.details.length).toBeLessThanOrEqual(243);
  });
});
