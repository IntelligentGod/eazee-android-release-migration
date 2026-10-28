let mockTodos: any[] = [];
let mockPreferences: any[] = [];
const mockCreateTodos = jest.fn(async (inputs: any[]) => inputs.map((input, index) => ({
  todo: {
    id: `created-${index + 1}`,
    text: input.text,
    dueDate: input.dueDate,
    hasDueTime: input.hasDueTime,
    workspace: input.workspace,
    starred: input.starred,
    taskKind: input.taskKind,
    guidancePath: input.guidancePath,
    recurrenceSeriesId: input.recurrence ? `series-${index + 1}` : null,
  },
})));
const mockDeleteTodos = jest.fn(async (_ids?: string[]) => []);
const mockDeleteRecurringTodoOccurrence = jest.fn(async (_id?: string) => null);
const mockSetTodoRecurrence = jest.fn(async (_id?: string, recurrence?: any) => ({
  todo: {
    id: _id,
    recurrenceSeriesId: recurrence ? 'series-1' : null,
    recurrenceOccurrenceDate: recurrence ? new Date('2026-03-30T00:00:00.000Z') : null,
  },
  reminderStatus: 'skipped',
}));
const mockSyncRecurringTodos = jest.fn(async () => false);
const mockUpdateRecurringTodo = jest.fn(async (id?: string, input?: any, _scope?: any, _options?: any) => ({
  todo: {
    id,
    ...input,
  },
  reminderStatus: 'skipped',
}));
const mockUpdateTodos = jest.fn(async (_updates?: any[]) => []);
const mockRequestTodoClassification = jest.fn(async (_input?: any) => ({ kind: 'normal', confidence: 0.9 }));
const mockSaveTaskGuide = jest.fn(async (input: any) => ({
  id: 'guide-1',
  todoId: input.todoId,
  steps: input.steps,
  conversation: input.conversation || [],
  activeStepIndex: input.activeStepIndex,
  status: input.status,
  note: input.note,
}));

jest.mock('../../../../../database/database', () => ({
  database: {
    collections: {
      get: jest.fn((name: string) => ({
        query: jest.fn(() => ({
          fetch: jest.fn(async () => {
            if (name === 'todos') return mockTodos;
            if (name === 'user_preferences') return mockPreferences;
            return [];
          }),
        })),
      })),
    },
    write: jest.fn(),
  },
}));

jest.mock('../../../../../lib/todoMutations', () => ({
  createTodos: (inputs: any[]) => mockCreateTodos(inputs),
  deleteRecurringTodoOccurrence: (id: string) => mockDeleteRecurringTodoOccurrence(id),
  deleteTodos: (ids: string[]) => mockDeleteTodos(ids),
  setTodoRecurrence: (id: string, recurrence: any) => mockSetTodoRecurrence(id, recurrence),
  syncRecurringTodos: () => mockSyncRecurringTodos(),
  updateRecurringTodo: (id: string, input: any, scope: string, options: any) => mockUpdateRecurringTodo(id, input, scope, options),
  updateTodos: (updates: any[]) => mockUpdateTodos(updates),
}));

jest.mock('@/lib/goalGuidance', () => ({
  advanceGoalGuidanceForCompletedTodo: jest.fn(),
  deleteGoalGuidanceForGoal: jest.fn(),
  fetchGoalGuidancePlanForActionTodo: jest.fn(async () => null),
  markGoalGuidanceActionDeleted: jest.fn(),
}));

jest.mock('@/lib/taskGuidance', () => ({
  fetchTaskGuideForTodo: jest.fn(),
  saveTaskGuide: (input: any) => mockSaveTaskGuide(input),
}));

jest.mock('@/lib/recipeGuidance', () => ({
  fetchRecipeGuideForTodo: jest.fn(async () => null),
}));

jest.mock('@/lib/skillGuidance', () => ({
  fetchSkillGuideForTodo: jest.fn(async () => null),
}));

jest.mock('@/lib/todoClassification', () => ({
  requestTodoClassification: (input: any) => mockRequestTodoClassification(input),
  shouldClassifyTodoWorkspace: (workspace?: string | null) => workspace === 'Personal' || workspace === 'Goals',
  isClassificationNotOnPlanError: (error: any) => error?.name === 'SubscriptionRequiredError',
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { todoToolHandlers } = require('../todo');

describe('todo tools', () => {
  beforeEach(() => {
    mockTodos = [];
    mockPreferences = [];
    mockCreateTodos.mockClear();
    mockDeleteTodos.mockClear();
    mockDeleteRecurringTodoOccurrence.mockClear();
    mockSetTodoRecurrence.mockClear();
    mockSyncRecurringTodos.mockClear();
    mockUpdateRecurringTodo.mockClear();
    mockUpdateTodos.mockClear();
    mockRequestTodoClassification.mockClear();
    mockSaveTaskGuide.mockClear();
    mockRequestTodoClassification.mockImplementation(async () => ({ kind: 'normal', confidence: 0.9 }));
  });

  it('does not return todos from stale custom workspaces', async () => {
    mockTodos = [
      makeTodo({ id: 'personal', workspace: 'Personal', text: 'Visible task' }),
      makeTodo({ id: 'stale', workspace: 'School', text: 'Hidden task' }),
    ];

    const result = await todoToolHandlers.todo_query({});

    expect(result.items.map((todo: any) => todo.id)).toEqual(['personal']);
  });

  it('coerces stale workspace filters to Personal', async () => {
    mockPreferences = [
      { workspace_name: 'School', display_name: 'School', original_name: 'School' },
    ];
    mockTodos = [
      makeTodo({ id: 'personal', workspace: 'Personal', text: 'Visible task' }),
      makeTodo({ id: 'stale', workspace: 'School', text: 'Hidden task' }),
    ];

    const result = await todoToolHandlers.todo_query({ workspace: 'School' });

    expect(result.items.map((todo: any) => todo.id)).toEqual(['personal']);
  });

  it('returns at least two matches for open-intent queries so chat does not first-match guess', async () => {
    mockTodos = [
      makeTodo({ id: 'stretch-1', text: 'Stretch', dueDate: localDay(1) }),
      makeTodo({ id: 'stretch-2', text: 'Stretch again', dueDate: localDay(2) }),
      makeTodo({ id: 'stretch-3', text: 'Stretch later', dueDate: localDay(3) }),
    ];

    const result = await todoToolHandlers.todo_query({
      textContains: 'stretch',
      openIntent: true,
      limit: 1,
    });

    expect(result.totalMatches).toBe(3);
    expect(result.items.map((todo: any) => todo.id)).toEqual(['stretch-1', 'stretch-2']);
  });

  it('only returns one visible generated recurring todo per series', async () => {
    mockTodos = [
      makeTodo({ id: 'oldest-missed', text: 'Stretch', dueDate: localDay(-2), recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: localDay(-2) }),
      makeTodo({ id: 'newer-missed', text: 'Stretch', dueDate: localDay(-1), recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: localDay(-1) }),
      makeTodo({ id: 'next-future', text: 'Stretch', dueDate: localDay(1), recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: localDay(1) }),
      makeTodo({ id: 'later-future', text: 'Stretch', dueDate: localDay(2), recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: localDay(2) }),
    ];

    const result = await todoToolHandlers.todo_query({});

    expect(result.items.map((todo: any) => todo.id)).toEqual(['oldest-missed']);
  });

  it('filters recurring queries to one Personal row per recurring series', async () => {
    mockTodos = [
      makeTodo({ id: 'wishlist', text: 'Buy milk', workspace: 'Wishlist', dueDate: localDay(0) }),
      makeTodo({ id: 'overdue', text: 'Old task', dueDate: localDay(-3) }),
      makeTodo({ id: 'oldest-missed', text: 'Stretch', dueDate: localDay(-2), recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: localDay(-2) }),
      makeTodo({ id: 'next-future', text: 'Stretch', dueDate: localDay(1), recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: localDay(1) }),
    ];

    const result = await todoToolHandlers.todo_query({ recurringOnly: true });

    expect(result.items.map((todo: any) => todo.id)).toEqual(['oldest-missed']);
    expect(result.items[0]).toMatchObject({ recurrence: 'Recurring', workspace: 'Personal' });
  });

  it('shows the upcoming recurrence when current recurrence is completed', async () => {
    mockTodos = [
      makeTodo({ id: 'today-completed', text: 'Stretch', completed: true, dueDate: localDay(0), recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: localDay(0) }),
      makeTodo({ id: 'next-future', text: 'Stretch', dueDate: localDay(1), recurrenceSeriesId: 'series-1', recurrenceOccurrenceDate: localDay(1) }),
    ];

    const result = await todoToolHandlers.todo_query({ recurringOnly: true });

    expect(result.items.map((todo: any) => todo.id)).toEqual(['next-future']);
  });

  it('classifies Personal chat-created todos before creating them', async () => {
    const result = await todoToolHandlers.todo_create_many({
      items: [{ text: 'Practice scales', workspace: 'Personal' }],
    });

    expect(mockRequestTodoClassification).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Practice scales',
      workspace: 'Personal',
    }));
    expect(mockCreateTodos).toHaveBeenCalledWith([expect.objectContaining({
      text: 'Practice scales',
      workspace: 'Personal',
      taskKind: 'normal',
    })]);
    expect(result.created).toBe(1);
    expect(result.skippedItems).toEqual([]);
  });

  it('passes recurrence for Personal chat-created todos', async () => {
    const result = await todoToolHandlers.todo_create_many({
      items: [{ text: 'Stretch', workspace: 'Personal', recurrence: { interval: 2, unit: 'day' } }],
    });

    expect(mockCreateTodos).toHaveBeenCalledWith([expect.objectContaining({
      text: 'Stretch',
      workspace: 'Personal',
      recurrence: { interval: 2, unit: 'day' },
    })]);
    expect(result.createdItems[0]).toMatchObject({
      recurrence: 'Recurring',
    });
  });

  it('ignores recurrence for non-Personal chat-created todos', async () => {
    await todoToolHandlers.todo_create_many({
      items: [{ text: 'Buy notebook', workspace: 'Wishlist', recurrence: { interval: 1, unit: 'week' } }],
    });

    expect(mockCreateTodos).toHaveBeenCalledWith([expect.objectContaining({
      text: 'Buy notebook',
      workspace: 'Wishlist',
      recurrence: null,
    })]);
  });

  it('leaves Personal skill todos without an automatic guidance path', async () => {
    mockRequestTodoClassification.mockImplementationOnce(async () => ({ kind: 'skill', confidence: 0.9 }));

    const result = await todoToolHandlers.todo_create_many({
      items: [{ text: 'Learn guitar', workspace: 'Personal' }],
    });

    expect(mockCreateTodos).toHaveBeenCalledWith([expect.objectContaining({
      text: 'Learn guitar',
      workspace: 'Personal',
      taskKind: 'skill',
      guidancePath: null,
    })]);
    expect(result.createdItems[0]).toMatchObject({
      taskKind: 'skill',
      guidancePath: null,
    });
  });

  it('creates one Personal todo with an accepted task guide from steps', async () => {
    const result = await todoToolHandlers.todo_create_with_steps({
      title: 'Build portfolio site',
      details: 'For job applications',
      sourceQuestion: 'How do I build a portfolio site?',
      sourceAnswer: 'Steps:\n1. Pick projects\n2. Write case studies',
      steps: [
        { title: 'Pick projects', details: 'Choose three strong examples.' },
        { title: 'Write case studies', details: 'Explain problem, process, and result.' },
      ],
    });

    expect(mockRequestTodoClassification).not.toHaveBeenCalled();
    expect(mockCreateTodos).toHaveBeenCalledWith([expect.objectContaining({
      text: 'Build portfolio site',
      workspace: 'Personal',
      taskKind: 'normal',
      guidancePath: null,
    })]);
    expect(mockSaveTaskGuide).toHaveBeenCalledWith(expect.objectContaining({
      todoId: 'created-1',
      activeStepIndex: 0,
      status: 'accepted',
      steps: [
        { title: 'Pick projects', details: 'Choose three strong examples.', completed: false },
        { title: 'Write case studies', details: 'Explain problem, process, and result.', completed: false },
      ],
      conversation: [
        { role: 'user', content: 'How do I build a portfolio site?' },
        { role: 'assistant', content: 'Steps:\n1. Pick projects\n2. Write case studies' },
      ],
    }));
    expect(result).toMatchObject({
      created: 1,
      createdItems: [expect.objectContaining({
        id: 'created-1',
        text: 'Build portfolio site',
        workspace: 'Personal',
        taskKind: 'normal',
      })],
      guide: expect.objectContaining({
        status: 'accepted',
        activeStepIndex: 0,
      }),
      skippedItems: [],
    });
  });

  it('rolls back the created todo when task guide saving fails', async () => {
    mockSaveTaskGuide.mockRejectedValueOnce(new Error('guide write failed'));

    const result = await todoToolHandlers.todo_create_with_steps({
      title: 'Build portfolio site',
      steps: [{ title: 'Pick projects' }],
    });

    expect(mockCreateTodos).toHaveBeenCalledWith([expect.objectContaining({
      text: 'Build portfolio site',
    })]);
    expect(mockDeleteTodos).toHaveBeenCalledWith(['created-1']);
    expect(result.created).toBe(0);
    expect(result.createdItems).toEqual([]);
    expect(result.skippedItems).toEqual([expect.objectContaining({
      text: 'Build portfolio site',
      reason: expect.stringContaining('guidance save failed'),
    })]);
  });

  it('does not create visible Personal todos when classification fails', async () => {
    mockRequestTodoClassification.mockRejectedValueOnce(new Error('classifier down'));

    const result = await todoToolHandlers.todo_create_many({
      items: [{ text: 'Practice scales', workspace: 'Personal' }],
    });

    expect(mockCreateTodos).not.toHaveBeenCalled();
    expect(result.created).toBe(0);
    expect(result.createdItems).toEqual([]);
    expect(result.skippedItems).toEqual([expect.objectContaining({
      text: 'Practice scales',
    })]);
  });

  it('still creates the todo on Free, where automatic classification is Pro only', async () => {
    mockRequestTodoClassification.mockRejectedValueOnce(Object.assign(new Error('Pro only'), { name: 'SubscriptionRequiredError' }));

    const result = await todoToolHandlers.todo_create_many({
      items: [{ text: 'Practice scales', workspace: 'Personal' }],
    });

    expect(mockCreateTodos.mock.calls[0][0]).toEqual([expect.objectContaining({ text: 'Practice scales', taskKind: null })]);
    expect(result.skippedItems).toEqual([]);
  });

  it('skips unsupported recurrence edits instead of turning repeat off', async () => {
    mockTodos = [
      makeTodo({ id: 'todo-1', text: 'Stretch', recurrenceSeriesId: 'series-1' }),
    ];

    const result = await todoToolHandlers.todo_edit_many({
      items: [{ oldText: 'Stretch', recurrence: 'yearly' }],
    });

    expect(mockSetTodoRecurrence).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
    expect(result.skippedItems).toEqual([{
      id: 'todo-1',
      text: 'Stretch',
      reason: 'unsupported recurrence',
    }]);
  });

  it('allows explicit no-repeat edits to turn repeat off', async () => {
    mockTodos = [
      makeTodo({ id: 'todo-1', text: 'Stretch', recurrenceSeriesId: 'series-1' }),
    ];

    const result = await todoToolHandlers.todo_edit_many({
      items: [{ oldText: 'Stretch', recurrence: 'no repeat' }],
    });

    expect(mockSetTodoRecurrence).toHaveBeenCalledWith('todo-1', null);
    expect(result.updated).toBe(1);
    expect(result.skippedItems).toEqual([]);
  });

  it('skips Goals rows during chat delete mutations', async () => {
    mockTodos = [
      makeTodo({ id: 'goal-1', workspace: 'Goals', text: 'Learn guitar' }),
    ];

    const result = await todoToolHandlers.todo_delete_many({
      items: [{ text: 'Learn guitar' }],
    });

    expect(mockDeleteTodos).not.toHaveBeenCalled();
    expect(result.deleted).toBe(0);
    expect(result.deletedItems).toEqual([]);
    expect(result.skippedItems).toEqual([expect.objectContaining({
      id: 'goal-1',
      text: 'Learn guitar',
      reason: 'goal',
    })]);
  });
});

const makeTodo = (overrides: any = {}) => ({
  id: 'todo-1',
  text: 'Task',
  dueDate: new Date('2026-03-30T09:00:00.000Z'),
  hasDueTime: false,
  completed: false,
  starred: false,
  workspace: 'Personal',
  recurrenceSeriesId: null,
  recurrenceOccurrenceDate: null,
  recurrenceOverride: false,
  ...overrides,
});

const localDay = (offsetDays: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
};
