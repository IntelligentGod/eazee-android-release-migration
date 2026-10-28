import type EventModel from '@/database/models/EventModel';
import type HomeEventCompletionModel from '@/database/models/HomeEventCompletionModel';
import type TodoModel from '@/database/models/TodoModel';
import {
  buildHomeEventCompletionId,
  buildHomeSuggestionCandidates,
  buildLocalHomeSnapshot,
  createEmptyHomeSnapshot,
  filterHomeEventCompletionsForEvents,
  filterHomePlanTodos,
  filterHomeRecurringTodos,
  getHiddenHomeGoalGuidanceTodoIds,
  getHomeEventCompletionIdentity,
  getHomeEventCompletionOccurrenceStartTimes,
  getNextStepTodoCandidate,
  getNextUnsnoozedTodoCandidate,
  isHomeCalendarReadyForSuggestions,
  isStaleHomeRefresh,
  mergeGoogleEventsIntoHomeSnapshot,
  orderNextStepTodoCandidates,
  orderScheduleItemsWithSnoozesLast,
  type HomeGoogleEvent,
} from '../homeData';

const makeTodo = (overrides: Partial<TodoModel> = {}) => ({
  id: 'todo-1',
  text: 'Todo',
  dueDate: new Date('2026-03-30T09:00:00.000Z'),
  createdAt: new Date('2026-03-30T08:00:00.000Z'),
  starred: false,
  workspace: 'Personal',
  ...overrides,
}) as TodoModel;

const makeLocalEvent = (overrides: Partial<EventModel> = {}) => ({
  id: 'local-1',
  title: 'Local event',
  startDate: new Date('2026-03-30T09:00:00.000Z'),
  endDate: new Date('2026-03-30T10:00:00.000Z'),
  isGoogleEvent: false,
  googleEventId: undefined,
  ...overrides,
}) as EventModel;

const makeGoogleEvent = (overrides: Partial<HomeGoogleEvent> = {}) => ({
  id: 'google-1',
  title: 'Google event',
  startDate: new Date('2026-03-30T11:00:00.000Z'),
  endDate: new Date('2026-03-30T12:00:00.000Z'),
  isGoogleEvent: true,
  isAllDay: false,
  source: 'google' as const,
  ...overrides,
}) as HomeGoogleEvent;

const makeCompletion = (
  overrides: Partial<Pick<HomeEventCompletionModel, 'eventSource' | 'eventKey' | 'occurrenceStart'>> = {}
) => ({
  eventSource: 'local' as const,
  eventKey: 'local-1',
  occurrenceStart: new Date('2026-03-30T09:00:00.000Z'),
  ...overrides,
}) as Pick<HomeEventCompletionModel, 'eventSource' | 'eventKey' | 'occurrenceStart'>;

describe('homeData', () => {
  it('requires successful Google sync unless Google Calendar is disconnected', () => {
    expect(isHomeCalendarReadyForSuggestions('disconnected', false)).toBe(true);
    expect(isHomeCalendarReadyForSuggestions('connected', false)).toBe(false);
    expect(isHomeCalendarReadyForSuggestions('needsReconnect', false)).toBe(false);
    expect(isHomeCalendarReadyForSuggestions('connected', true)).toBe(true);
  });

  it('matches completions for overnight events using their original start time', () => {
    const overnightEvent = makeLocalEvent({
      id: 'overnight-event',
      startDate: new Date('2026-03-29T23:00:00.000Z'),
      endDate: new Date('2026-03-30T02:00:00.000Z'),
    });
    const matchingCompletion = makeCompletion({
      eventKey: 'overnight-event',
      occurrenceStart: overnightEvent.startDate,
    });
    const unrelatedCompletion = makeCompletion({
      eventKey: 'other-event',
      occurrenceStart: overnightEvent.startDate,
    });

    expect(getHomeEventCompletionOccurrenceStartTimes([overnightEvent])).toEqual([
      overnightEvent.startDate.getTime(),
    ]);
    expect(filterHomeEventCompletionsForEvents(
      [matchingCompletion, unrelatedCompletion],
      [overnightEvent]
    )).toEqual([matchingCompletion]);
  });

  it('builds a local snapshot in one pass with sorted todos and completion ids', () => {
    const tomorrowEvent = makeLocalEvent({
      id: 'local-tomorrow',
      startDate: new Date('2026-03-31T08:00:00.000Z'),
    });
    const snapshot = buildLocalHomeSnapshot({
      events: [
        makeLocalEvent({ id: 'local-2', startDate: new Date('2026-03-30T12:00:00.000Z') }),
        makeLocalEvent({ id: 'local-1', startDate: new Date('2026-03-30T08:00:00.000Z') }),
      ],
      suggestionEvents: [
        makeLocalEvent({ id: 'local-2', startDate: new Date('2026-03-30T12:00:00.000Z') }),
        tomorrowEvent,
        makeLocalEvent({ id: 'local-1', startDate: new Date('2026-03-30T08:00:00.000Z') }),
      ],
      todos: [
        makeTodo({ id: 'todo-2', dueDate: new Date('2026-03-30T17:00:00.000Z'), createdAt: new Date('2026-03-30T09:00:00.000Z') }),
        makeTodo({ id: 'todo-1', dueDate: new Date('2026-03-30T09:00:00.000Z'), createdAt: new Date('2026-03-30T07:00:00.000Z') }),
      ],
      completions: [makeCompletion()],
    });

    expect(snapshot.upcomingEvents.map((event) => event.id)).toEqual(['local-1', 'local-2']);
    expect(snapshot.suggestionEvents.map((event) => event.id)).toEqual(['local-1', 'local-2', 'local-tomorrow']);
    expect(snapshot.upcomingTodos.map((todo) => todo.id)).toEqual(['todo-1', 'todo-2']);
    expect(snapshot.completedHomeEventIds).toEqual(
      new Set([
        buildHomeEventCompletionId('local', 'local-1', new Date('2026-03-30T09:00:00.000Z')),
      ])
    );
  });

  it('excludes non-personal todos from the home snapshot', () => {
    const snapshot = buildLocalHomeSnapshot({
      events: [],
      todos: [
        makeTodo({ id: 'todo-personal', workspace: 'Personal' }),
        makeTodo({ id: 'todo-goal', workspace: 'Goals' }),
        makeTodo({ id: 'todo-wishlist', workspace: 'Wishlist' }),
        makeTodo({ id: 'todo-stale', workspace: 'School' }),
      ],
      completions: [],
    });

    expect(snapshot.upcomingTodos.map((todo) => todo.id)).toEqual(['todo-personal']);
  });

  it('excludes hidden goal guidance step todos from the home snapshot', () => {
    const snapshot = buildLocalHomeSnapshot({
      events: [],
      todos: [
        makeTodo({ id: 'todo-action', workspace: 'Personal' }),
        makeTodo({ id: 'todo-hidden-step', workspace: 'Personal' }),
      ],
      completions: [],
      excludedTodoIds: new Set(['todo-hidden-step']),
    });

    expect(snapshot.upcomingTodos.map((todo) => todo.id)).toEqual(['todo-action']);
  });

  it('collapses active goal actions into a root-goal suggestion title', () => {
    const rootGoal = makeTodo({
      id: 'root-goal',
      text: 'Learn guitar',
      workspace: 'Goals',
      dueDate: new Date('2026-06-30T00:00:00.000Z'),
    });
    const activeAction = makeTodo({
      id: 'active-action',
      text: 'Practice chord transitions',
      workspace: 'Personal',
    });

    const candidates = buildHomeSuggestionCandidates({
      todos: [rootGoal, activeAction],
      goalGuidancePlans: [{
        goalId: 'root-goal',
        activeTodoId: 'active-action',
        activeActionsJson: JSON.stringify({ activeActions: [{ todoId: 'active-action', stepIndex: 0 }] }),
        stepsJson: JSON.stringify([{ title: 'Practice chord transitions' }]),
        completedStepIndexesJson: '[]',
        status: 'accepted',
      } as any],
      taskGuides: [],
      skillGuides: [],
      todayStart: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        id: 'goal:root-goal',
        openTodoId: 'root-goal',
        title: 'Continue Learn guitar',
        activeTodoIds: ['active-action'],
      }),
    ]);
    expect(candidates[0]?.title).not.toContain('Practice chord transitions');
  });

  it('prefers incomplete guides over duplicate overdue candidates', () => {
    const guidedTodo = makeTodo({
      id: 'guided',
      text: 'Learn TypeScript',
      dueDate: new Date('2026-06-10T00:00:00.000Z'),
    });

    const candidates = buildHomeSuggestionCandidates({
      todos: [guidedTodo],
      goalGuidancePlans: [],
      taskGuides: [],
      skillGuides: [{
        todoId: 'guided',
        status: 'ready',
        stepsJson: JSON.stringify([{ completed: true }, { completed: false }]),
      } as any],
      todayStart: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        id: 'skillGuide:guided',
        progress: { completed: 1, total: 2 },
      }),
    ]);
  });

  it('dedupes recurring series across guide and overdue candidates', () => {
    const guidedOccurrence = makeTodo({
      id: 'guided-occurrence',
      text: 'Practice Spanish',
      dueDate: new Date('2026-06-10T00:00:00.000Z'),
      recurrenceSeriesId: 'spanish-daily',
    });
    const nextOverdueOccurrence = makeTodo({
      id: 'next-overdue-occurrence',
      text: 'Practice Spanish',
      dueDate: new Date('2026-06-11T00:00:00.000Z'),
      recurrenceSeriesId: 'spanish-daily',
    });

    const candidates = buildHomeSuggestionCandidates({
      todos: [guidedOccurrence, nextOverdueOccurrence],
      goalGuidancePlans: [],
      taskGuides: [{
        todoId: 'guided-occurrence',
        status: 'accepted',
        stepsJson: JSON.stringify([{ completed: false }]),
      } as any],
      skillGuides: [],
      todayStart: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'taskGuide:guided-occurrence',
    ]);
  });

  it('does not suggest a guide attached to a blocked later repeat occurrence', () => {
    const oldestOverdueOccurrence = makeTodo({
      id: 'oldest-overdue-occurrence',
      text: 'Practice Spanish',
      dueDate: new Date('2026-06-10T00:00:00.000Z'),
      recurrenceSeriesId: 'spanish-daily',
    });
    const guidedLaterOccurrence = makeTodo({
      id: 'guided-later-occurrence',
      text: 'Practice Spanish',
      dueDate: new Date('2026-06-11T00:00:00.000Z'),
      recurrenceSeriesId: 'spanish-daily',
    });

    const candidates = buildHomeSuggestionCandidates({
      todos: [oldestOverdueOccurrence, guidedLaterOccurrence],
      goalGuidancePlans: [],
      taskGuides: [{
        todoId: 'guided-later-occurrence',
        status: 'accepted',
        stepsJson: JSON.stringify([{ completed: false }]),
      } as any],
      skillGuides: [],
      todayStart: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'overdue:oldest-overdue-occurrence',
    ]);
  });

  it('dedupes recurring series across goal, guide, and overdue candidates', () => {
    const rootGoal = makeTodo({
      id: 'root-goal',
      text: 'Build a morning routine',
      workspace: 'Goals',
    });
    const activeOccurrence = makeTodo({
      id: 'active-occurrence',
      text: 'Morning stretch',
      dueDate: new Date('2026-06-10T00:00:00.000Z'),
      recurrenceSeriesId: 'morning-stretch',
    });
    const nextOverdueOccurrence = makeTodo({
      id: 'next-overdue-occurrence',
      text: 'Morning stretch',
      dueDate: new Date('2026-06-11T00:00:00.000Z'),
      recurrenceSeriesId: 'morning-stretch',
    });
    const guidedOccurrence = makeTodo({
      id: 'guided-occurrence',
      text: 'Morning stretch',
      dueDate: new Date('2026-06-12T00:00:00.000Z'),
      recurrenceSeriesId: 'morning-stretch',
    });

    const candidates = buildHomeSuggestionCandidates({
      todos: [rootGoal, activeOccurrence, nextOverdueOccurrence, guidedOccurrence],
      goalGuidancePlans: [{
        goalId: 'root-goal',
        activeTodoId: 'active-occurrence',
        status: 'accepted',
      } as any],
      taskGuides: [{
        todoId: 'guided-occurrence',
        status: 'accepted',
        stepsJson: JSON.stringify([{ completed: false }]),
      } as any],
      skillGuides: [],
      todayStart: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'goal:root-goal',
    ]);
  });

  it('does not build a goal candidate from missing active action ids', () => {
    const rootGoal = makeTodo({
      id: 'root-goal',
      text: 'Learn guitar',
      workspace: 'Goals',
    });

    expect(buildHomeSuggestionCandidates({
      todos: [rootGoal],
      goalGuidancePlans: [{
        goalId: 'root-goal',
        activeTodoId: 'deleted-action',
        status: 'accepted',
      } as any],
      taskGuides: [],
      skillGuides: [],
      todayStart: new Date('2026-06-14T00:00:00.000Z'),
    })).toEqual([]);
  });

  it('excludes nested guidance todos from all suggestion candidate types', () => {
    const rootGoal = makeTodo({
      id: 'root-goal',
      text: 'Learn guitar',
      workspace: 'Goals',
    });
    const hiddenAction = makeTodo({
      id: 'hidden-action',
      text: 'Hidden action',
      dueDate: new Date('2026-06-10T09:00:00.000Z'),
    });

    expect(buildHomeSuggestionCandidates({
      todos: [rootGoal, hiddenAction],
      goalGuidancePlans: [{
        goalId: 'root-goal',
        activeTodoId: 'hidden-action',
        status: 'accepted',
      } as any],
      taskGuides: [],
      skillGuides: [{
        todoId: 'hidden-action',
        status: 'ready',
        stepsJson: JSON.stringify([{ completed: false }]),
      } as any],
      todayStart: new Date('2026-06-14T00:00:00.000Z'),
      excludedTodoIds: new Set(['hidden-action']),
    })).toEqual([]);
  });

  it('builds only the oldest missed repeat occurrence as a suggestion candidate', () => {
    const yesterday = makeTodo({
      id: 'repeat-yesterday',
      dueDate: new Date('2026-06-12T09:00:00.000Z'),
      recurrenceSeriesId: 'daily-repeat',
    });
    const today = makeTodo({
      id: 'repeat-today',
      dueDate: new Date('2026-06-13T09:00:00.000Z'),
      recurrenceSeriesId: 'daily-repeat',
    });

    expect(buildHomeSuggestionCandidates({
      todos: [yesterday, today],
      goalGuidancePlans: [],
      taskGuides: [],
      skillGuides: [],
      todayStart: new Date('2026-06-14T00:00:00.000Z'),
    }).map((candidate) => candidate.openTodoId)).toEqual(['repeat-yesterday']);
  });

  it('shows only the oldest due occurrence from a repeat series on Home', () => {
    const yesterday = makeTodo({
      id: 'repeat-yesterday',
      dueDate: new Date('2026-06-13T09:00:00.000Z'),
      recurrenceSeriesId: 'daily-repeat',
    });
    const today = makeTodo({
      id: 'repeat-today',
      dueDate: new Date('2026-06-14T09:00:00.000Z'),
      recurrenceSeriesId: 'daily-repeat',
    });
    const tomorrow = makeTodo({
      id: 'repeat-tomorrow',
      dueDate: new Date('2026-06-15T09:00:00.000Z'),
      recurrenceSeriesId: 'daily-repeat',
    });

    expect(filterHomeRecurringTodos(
      [yesterday, today, tomorrow],
      new Date('2026-06-14T23:59:59.999Z')
    ).map((todo) => todo.id)).toEqual(['repeat-yesterday', 'repeat-tomorrow']);
  });

  it('does not promote a blocked repeat occurrence when the oldest is suggested', () => {
    const yesterday = makeTodo({
      id: 'repeat-yesterday',
      dueDate: new Date('2026-06-13T09:00:00.000Z'),
      recurrenceSeriesId: 'daily-repeat',
    });
    const today = makeTodo({
      id: 'repeat-today',
      dueDate: new Date('2026-06-14T09:00:00.000Z'),
      recurrenceSeriesId: 'daily-repeat',
    });

    expect(filterHomePlanTodos(
      [yesterday, today],
      new Date('2026-06-14T23:59:59.999Z'),
      new Set(['repeat-yesterday'])
    )).toEqual([]);
  });

  it('finds nested guidance todo ids under first-level goal actions', () => {
    const hiddenTodoIds = getHiddenHomeGoalGuidanceTodoIds([
      {
        goalId: 'root-goal',
        activeActionsJson: JSON.stringify({
          activeActions: [{ stepIndex: 0, todoId: 'first-action' }],
          todoIds: ['first-action'],
        }),
      },
      {
        goalId: 'first-action',
        activeActionsJson: JSON.stringify({
          activeActions: [{ stepIndex: 0, todoId: 'hidden-child-step' }],
          todoIds: ['hidden-child-step'],
        }),
      },
    ], new Set(['root-goal']));

    expect(Array.from(hiddenTodoIds)).toEqual(['hidden-child-step']);
  });

  it('finds nested guidance todo ids even when root goal is not in upcoming todos', () => {
    const hiddenTodoIds = getHiddenHomeGoalGuidanceTodoIds([
      {
        goalId: 'completed-root-goal',
        activeActionsJson: JSON.stringify({
          activeActions: [{ stepIndex: 0, todoId: 'first-action' }],
          todoIds: ['first-action'],
        }),
      },
      {
        goalId: 'first-action',
        activeActionsJson: JSON.stringify({
          activeActions: [{ stepIndex: 0, todoId: 'hidden-child-step' }],
          todoIds: ['hidden-child-step'],
        }),
      },
    ], new Set(['completed-root-goal']));

    expect(Array.from(hiddenTodoIds)).toEqual(['hidden-child-step']);
  });

  it('merges google events in one update, de-dupes linked locals, and preserves optimistic local state', () => {
    const previousGoogleEvent = makeGoogleEvent({ id: 'google-old', title: 'Previous Google' });
    const localLinkedEvent = makeLocalEvent({
      id: 'local-linked',
      title: 'Linked local',
      googleEventId: 'google-1',
      startDate: new Date('2026-03-30T10:00:00.000Z'),
    });
    const localUnlinkedEvent = makeLocalEvent({
      id: 'local-plain',
      title: 'Plain local',
      startDate: new Date('2026-03-30T08:30:00.000Z'),
    });
    const completionId = buildHomeEventCompletionId(
      'local',
      'local-linked',
      new Date('2026-03-30T10:00:00.000Z')
    );

    const snapshot = {
      ...createEmptyHomeSnapshot(),
      upcomingEvents: [localLinkedEvent, previousGoogleEvent, localUnlinkedEvent],
      suggestionEvents: [localLinkedEvent, previousGoogleEvent, localUnlinkedEvent],
      upcomingTodos: [makeTodo({ id: 'todo-current' })],
      completedHomeEventIds: new Set([completionId]),
    };

    const freshGoogleEvent = makeGoogleEvent({
        id: 'google-1',
        title: 'Fresh Google',
        startDate: new Date('2026-03-30T11:00:00.000Z'),
    });
    const tomorrowGoogleEvent = makeGoogleEvent({
      id: 'google-tomorrow',
      title: 'Tomorrow Google',
      startDate: new Date('2026-03-31T11:00:00.000Z'),
    });
    const merged = mergeGoogleEventsIntoHomeSnapshot(
      snapshot,
      [freshGoogleEvent],
      [freshGoogleEvent, tomorrowGoogleEvent]
    );

    expect(merged.upcomingEvents.map((event) => event.id)).toEqual(['local-plain', 'google-1']);
    expect(merged.suggestionEvents.map((event) => event.id)).toEqual(['local-plain', 'google-1', 'google-tomorrow']);
    expect(merged.upcomingTodos.map((todo) => todo.id)).toEqual(['todo-current']);
    expect(merged.completedHomeEventIds).toEqual(new Set([completionId]));
  });

  it('uses google completion ids for google-linked local events', () => {
    expect(
      getHomeEventCompletionIdentity(
        makeLocalEvent({
          id: 'local-linked',
          googleEventId: 'google-1',
          isGoogleEvent: false,
        })
      )
    ).toEqual({
      eventSource: 'google',
      eventKey: 'google-1',
    });
  });

  it('marks older refreshes as stale', () => {
    expect(isStaleHomeRefresh(5, 4)).toBe(true);
    expect(isStaleHomeRefresh(5, 5)).toBe(false);
  });

  it('sends snoozed next step todo candidates behind unsnoozed candidates', () => {
    const dueTime = new Date('2026-03-30T09:00:00.000Z');
    const candidates = [
      { sourceId: 'timed', label: 'Timed task', hasTime: true, time: dueTime },
      { sourceId: 'plain', label: 'Plain task', hasTime: false },
    ];

    const ordered = orderNextStepTodoCandidates(candidates, new Set(['timed']));

    expect(ordered.map((candidate) => candidate.sourceId)).toEqual(['plain', 'timed']);
    expect(ordered[1].time).toBe(dueTime);
  });

  it('returns the first snoozed next step todo when every candidate is snoozed', () => {
    const candidates = [
      { sourceId: 'first', label: 'First task' },
      { sourceId: 'second', label: 'Second task' },
    ];

    const ordered = orderNextStepTodoCandidates(candidates, new Set(['first', 'second']));

    expect(ordered.map((candidate) => candidate.sourceId)).toEqual(['first', 'second']);
  });

  it('uses an overdue todo when the only today next step candidate is snoozed', () => {
    const todayCandidate = { sourceId: 'today', label: 'Today task' };
    const overdueCandidate = { sourceId: 'overdue', label: 'Overdue task', isOverdue: true };

    expect(
      getNextStepTodoCandidate(
        [todayCandidate],
        [overdueCandidate],
        new Set(['today'])
      )
    ).toBe(overdueCandidate);
  });

  it('keeps an unsnoozed today todo ahead of overdue todos', () => {
    const todayCandidate = { sourceId: 'today', label: 'Today task' };
    const overdueCandidate = { sourceId: 'overdue', label: 'Overdue task', isOverdue: true };

    expect(
      getNextStepTodoCandidate(
        [todayCandidate],
        [overdueCandidate],
        new Set()
      )
    ).toBe(todayCandidate);
  });

  it('falls back to the first snoozed today todo when every next step candidate is snoozed', () => {
    const todayCandidate = { sourceId: 'today', label: 'Today task' };
    const overdueCandidate = { sourceId: 'overdue', label: 'Overdue task', isOverdue: true };

    expect(
      getNextStepTodoCandidate(
        [todayCandidate],
        [overdueCandidate],
        new Set(['today', 'overdue'])
      )
    ).toBe(todayCandidate);
  });

  it('does not use snoozed todos as free window candidates', () => {
    const todayCandidate = { sourceId: 'today', label: 'Today task' };
    const overdueCandidate = { sourceId: 'overdue', label: 'Overdue task' };

    expect(
      getNextUnsnoozedTodoCandidate(
        [todayCandidate],
        [overdueCandidate],
        new Set(['today', 'overdue'])
      )
    ).toBeUndefined();
  });

  it('sends snoozed today handled todos behind other schedule items without moving events', () => {
    const items = [
      { id: 'event-same-id', sourceId: 'same-id', type: 'event', label: 'Event with same id' },
      { id: 'todo-same-id', sourceId: 'same-id', type: 'todo', label: 'Snoozed task' },
      { id: 'todo-plain', sourceId: 'plain', type: 'todo', label: 'Plain task' },
    ];

    const ordered = orderScheduleItemsWithSnoozesLast(
      items,
      new Set(['same-id']),
      new Set(),
      (item) => item.id
    );

    expect(ordered.map((item) => item.label)).toEqual([
      'Event with same id',
      'Plain task',
      'Snoozed task',
    ]);
  });

  it('sends snoozed today handled events behind other schedule items', () => {
    const items = [
      { id: 'event-first', sourceId: 'first', type: 'event', label: 'Snoozed event' },
      { id: 'todo-first', sourceId: 'first', type: 'todo', label: 'Task with same source id' },
      { id: 'event-second', sourceId: 'second', type: 'event', label: 'Plain event' },
    ];

    const ordered = orderScheduleItemsWithSnoozesLast(
      items,
      new Set(),
      new Set(['stable-event-first']),
      (item) => item.id === 'event-first' ? 'stable-event-first' : item.id
    );

    expect(ordered.map((item) => item.label)).toEqual([
      'Task with same source id',
      'Plain event',
      'Snoozed event',
    ]);
  });
});
