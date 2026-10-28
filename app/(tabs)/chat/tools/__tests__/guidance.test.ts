const callOrder: string[] = [];
const mockTodos: any[] = [];
const mockFetchGoalGuidancePlanForGoal = jest.fn<Promise<any>, any[]>(async () => null);
const mockDeleteTodos = jest.fn<Promise<any>, any[]>(async (_ids: string[]) => []);
const mockRequestGoalGuidance = jest.fn<Promise<any>, any[]>(async () => ({
  type: 'plan',
  feasibility: 'realistic',
  feasibilityNote: 'Ready.',
  steps: [{ title: 'Practice embouchure', details: 'Do one focused session.', cadence: 'daily', effort: 'medium' }],
}));
const mockSaveGoalGuidanceResponse = jest.fn<Promise<any>, any[]>(async (input: any) => ({
  id: 'plan-1',
  goalId: input.goalId,
  status: 'preview',
  steps: input.response.steps,
}));
const mockAcceptGoalGuidancePlan = jest.fn<Promise<any>, any[]>(async () => ({
  plan: {
    id: 'plan-1',
    status: 'accepted',
    steps: [{ title: 'Practice embouchure' }],
    activeActions: [{ stepIndex: 0, todoId: 'action-1', dueDate: '2026-04-27T00:00:00.000Z' }],
  },
  todo: {
    id: 'action-1',
    text: 'Practice embouchure',
    details: '',
    dueDate: new Date('2026-04-27T00:00:00.000Z'),
    hasDueTime: false,
    completed: false,
    starred: false,
    workspace: 'Personal',
    goalTimeframe: null,
    taskKind: null,
    guidancePath: null,
  },
}));
const mockDeleteGoalGuidanceForGoal = jest.fn<Promise<any>, any[]>(async () => []);
const mockRequestRecipeVideos = jest.fn<Promise<any>, any[]>(async () => ({ videos: [] }));
const mockSaveRecipeGuide = jest.fn<Promise<any>, any[]>(async (input: any) => ({
  status: input.status,
  videos: input.videos || [],
}));
const mockRequestSkillVideos = jest.fn<Promise<any>, any[]>(async () => ({
  videos: [{ videoId: 'video-1', title: 'Saxophone lesson', channelTitle: 'Teacher' }],
}));
const mockSaveSkillGuide = jest.fn<Promise<any>, any[]>(async (input: any) => ({
  status: input.status,
  videos: input.videos || [],
}));
const mockCreateTodo = jest.fn(async (input: any) => {
  callOrder.push('create');
  return {
    todo: {
      id: 'goal-1',
      text: input.text,
      details: input.details,
      dueDate: input.dueDate,
      hasDueTime: input.hasDueTime,
      completed: input.completed,
      starred: input.starred,
      workspace: input.workspace,
      goalTimeframe: input.goalTimeframe,
      taskKind: input.taskKind,
      guidancePath: input.guidancePath,
    },
  };
});
const mockRequestTodoClassification = jest.fn(async (_input?: any) => {
  callOrder.push('classify');
  return { kind: 'skill', confidence: 0.9 };
});

jest.mock('../../../../../database/database', () => ({
  database: {
    collections: {
      get: jest.fn(() => ({
        query: jest.fn(() => ({ fetch: jest.fn(async () => mockTodos) })),
        find: jest.fn(async (id: string) => {
          const todo = mockTodos.find((item) => item.id === id);
          if (!todo) throw new Error('not found');
          return todo;
        }),
      })),
    },
  },
}));

jest.mock('../../../../../lib/todoMutations', () => ({
  createTodo: (input: any) => mockCreateTodo(input),
  deleteTodos: (ids: string[]) => mockDeleteTodos(ids),
}));

jest.mock('@/lib/todoClassification', () => ({
  requestTodoClassification: (input: any) => mockRequestTodoClassification(input),
  isClassificationNotOnPlanError: (error: any) => error?.name === 'SubscriptionRequiredError',
}));

jest.mock('@/firebaseConfig', () => ({
  auth: { currentUser: null },
}));

jest.mock('@/app/context/TokenContext', () => ({
  getAccessTokenStatic: jest.fn(async () => null),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(async () => undefined),
  multiGet: jest.fn(async () => []),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('@/lib/goalGuidance', () => ({
  acceptGoalGuidancePlan: (...args: any[]) => mockAcceptGoalGuidancePlan(...args),
  deleteGoalGuidanceForGoal: (...args: any[]) => mockDeleteGoalGuidanceForGoal(...args),
  fetchGoalGuidancePlanForActionTodo: jest.fn(async () => null),
  fetchGoalGuidancePlanForGoal: (...args: any[]) => mockFetchGoalGuidancePlanForGoal(...args),
  requestGoalGuidance: (...args: any[]) => mockRequestGoalGuidance(...args),
  saveGoalGuidanceResponse: (...args: any[]) => mockSaveGoalGuidanceResponse(...args),
}));

jest.mock('@/lib/taskGuidance', () => ({
  fetchTaskGuideForTodo: jest.fn(async () => null),
}));

jest.mock('@/lib/recipeGuidance', () => ({
  createDefaultRecipeAnswers: () => ({ dietary: '' }),
  fetchRecipeGuideForTodo: jest.fn(async () => null),
  requestRecipeAnswer: jest.fn(),
  requestRecipeVideos: (...args: any[]) => mockRequestRecipeVideos(...args),
  saveRecipeGuide: (...args: any[]) => mockSaveRecipeGuide(...args),
}));

jest.mock('@/lib/skillGuidance', () => ({
  fetchSkillGuideForTodo: jest.fn(async () => null),
  requestSkillAnswer: jest.fn(),
  requestSkillVideos: (...args: any[]) => mockRequestSkillVideos(...args),
  saveSkillGuide: (...args: any[]) => mockSaveSkillGuide(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { guidanceToolHandlers } = require('../guidance');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { executeToolCall } = require('../engine');

describe('guidance tools', () => {
  beforeEach(() => {
    callOrder.length = 0;
    mockTodos.length = 0;
    mockCreateTodo.mockClear();
    mockDeleteTodos.mockClear();
    mockRequestTodoClassification.mockClear();
    mockFetchGoalGuidancePlanForGoal.mockClear();
    mockRequestGoalGuidance.mockClear();
    mockSaveGoalGuidanceResponse.mockClear();
    mockAcceptGoalGuidancePlan.mockClear();
    mockDeleteGoalGuidanceForGoal.mockClear();
    mockRequestRecipeVideos.mockClear();
    mockSaveRecipeGuide.mockClear();
    mockRequestSkillVideos.mockClear();
    mockSaveSkillGuide.mockClear();
    mockFetchGoalGuidancePlanForGoal.mockImplementation(async () => null);
    mockRequestGoalGuidance.mockImplementation(async () => ({
      type: 'plan',
      feasibility: 'realistic',
      feasibilityNote: 'Ready.',
      steps: [{ title: 'Practice embouchure', details: 'Do one focused session.', cadence: 'daily', effort: 'medium' }],
    }));
    mockSaveGoalGuidanceResponse.mockImplementation(async (input: any) => ({
      id: 'plan-1',
      goalId: input.goalId,
      status: 'preview',
      steps: input.response.steps,
    }));
    mockAcceptGoalGuidancePlan.mockImplementation(async () => ({
      plan: {
        id: 'plan-1',
        status: 'accepted',
        steps: [{ title: 'Practice embouchure' }],
        activeActions: [{ stepIndex: 0, todoId: 'action-1', dueDate: '2026-04-27T00:00:00.000Z' }],
      },
      todo: {
        id: 'action-1',
        text: 'Practice embouchure',
        details: '',
        dueDate: new Date('2026-04-27T00:00:00.000Z'),
        hasDueTime: false,
        completed: false,
        starred: false,
        workspace: 'Personal',
        goalTimeframe: null,
        taskKind: null,
        guidancePath: null,
      },
    }));
    mockDeleteGoalGuidanceForGoal.mockImplementation(async () => []);
    mockDeleteTodos.mockImplementation(async () => []);
    mockRequestSkillVideos.mockImplementation(async () => ({
      videos: [{ videoId: 'video-1', title: 'Saxophone lesson', channelTitle: 'Teacher' }],
    }));
    mockSaveSkillGuide.mockImplementation(async (input: any) => ({
      status: input.status,
      videos: input.videos || [],
    }));
    mockRequestRecipeVideos.mockImplementation(async () => ({ videos: [] }));
    mockSaveRecipeGuide.mockImplementation(async (input: any) => ({
      status: input.status,
      videos: input.videos || [],
    }));
    mockRequestTodoClassification.mockImplementation(async () => {
      callOrder.push('classify');
      return { kind: 'skill', confidence: 0.9 };
    });
  });

  it('classifies a chat-created goal before creating or returning it', async () => {
    const result = await guidanceToolHandlers.goal_create({
      title: 'Learn guitar',
      timeframe: 'thisMonth',
    });

    expect(callOrder).toEqual(['classify', 'create']);
    expect(mockCreateTodo).toHaveBeenCalledWith(expect.objectContaining({
      workspace: 'Goals',
      goalTimeframe: 'thisMonth',
      taskKind: 'skill',
      guidancePath: null,
    }));
    expect(result.createdItems[0]).toMatchObject({
      workspace: 'Goals',
      taskKind: 'skill',
      guidancePath: null,
    });
  });

  it('does not create a visible goal if classification fails', async () => {
    mockRequestTodoClassification.mockImplementationOnce(async () => {
      callOrder.push('classify');
      throw new Error('classifier down');
    });

    const result = await guidanceToolHandlers.goal_create({
      title: 'Learn guitar',
      timeframe: 'thisMonth',
    });

    expect(callOrder).toEqual(['classify']);
    expect(mockCreateTodo).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      created: 0,
      createdItems: [],
      error: 'CLASSIFICATION_FAILED',
    });
  });

  it('creates a goal with an accepted actions plan from chat', async () => {
    const result = await guidanceToolHandlers.goal_create_with_guidance({
      title: 'Learn saxophone',
      timeframe: 'thisWeek',
      guidancePath: 'actions',
      sourceSteps: [{ title: 'Practice embouchure', details: 'Five minutes.' }],
      sourceQuestion: 'How do I learn saxophone?',
      sourceAnswer: 'Practice embouchure first.',
    });

    expect(mockRequestGoalGuidance).toHaveBeenCalledWith(expect.objectContaining({
      goalTitle: 'Learn saxophone',
      timeframe: 'thisWeek',
      mode: 'chat_create',
      sourceSteps: [{ title: 'Practice embouchure', details: 'Five minutes.' }],
      sourceQuestion: 'How do I learn saxophone?',
      sourceAnswer: 'Practice embouchure first.',
    }));
    expect(mockCreateTodo).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Learn saxophone',
      workspace: 'Goals',
      goalTimeframe: 'thisWeek',
      taskKind: 'skill',
      guidancePath: 'actions',
    }));
    expect(mockSaveGoalGuidanceResponse).toHaveBeenCalledWith(expect.objectContaining({
      goalId: 'goal-1',
      timeframe: 'thisWeek',
      response: expect.objectContaining({ type: 'plan' }),
    }));
    expect(mockAcceptGoalGuidancePlan).toHaveBeenCalledWith('plan-1');
    expect(result).toMatchObject({
      created: 1,
      guidancePath: 'actions',
      createdItems: [expect.objectContaining({ workspace: 'Goals', guidancePath: 'actions' })],
      actionItems: [expect.objectContaining({ id: 'action-1', workspace: 'Personal' })],
    });
  });

  it('routes quota goals through actions guidance and presents the schedule card', async () => {
    mockRequestTodoClassification.mockImplementationOnce(async () => ({
      kind: 'normal',
      confidence: 0.92,
      goalBehavior: {
        kind: 'quota',
        targetCount: 3,
        completedCount: 0,
        unitLabel: 'days',
        unitType: 'distinct_days',
      },
    }));

    const result = await executeToolCall(
      {
        name: 'goal_create_with_guidance',
        arguments: { title: 'Fast 3 days', timeframe: 'thisMonth', guidancePath: 'actions' },
      },
      { serverUrl: 'http://localhost' }
    );

    expect(mockRequestGoalGuidance).toHaveBeenCalledWith(expect.objectContaining({
      goalTitle: 'Fast 3 days',
      timeframe: 'thisMonth',
      quota: {
        targetCount: 3,
        completedCount: 0,
        unitLabel: 'days',
        unitType: 'distinct_days',
      },
    }));
    expect(mockCreateTodo).toHaveBeenCalledWith(expect.objectContaining({
      workspace: 'Goals',
      guidancePath: 'actions',
    }));
    expect(result.messages[0]).toMatchObject({
      content: expect.stringContaining('When do you want to do the first one?'),
      card: {
        type: 'goalQuotaSchedule',
        planId: 'plan-1',
        goalBehavior: expect.objectContaining({ kind: 'quota' }),
      },
    });
  });

  it('marks every chat-created goal card to show wishlist suggestions when opened', async () => {
    const plain = await executeToolCall(
      {
        name: 'goal_create',
        arguments: { title: 'Learn guitar', timeframe: 'thisMonth' },
      },
      { serverUrl: 'http://localhost' }
    );
    expect(plain.messages[0]?.card).toMatchObject({
      type: 'todoCreated',
      showGoalSuggestionsOnOpen: true,
      items: [expect.objectContaining({ workspace: 'Goals' })],
    });

    const actions = await executeToolCall(
      {
        name: 'goal_create_with_guidance',
        arguments: { title: 'Learn saxophone', timeframe: 'thisWeek', guidancePath: 'actions' },
      },
      { serverUrl: 'http://localhost' }
    );
    expect(actions.messages[0]?.card).toMatchObject({
      type: 'todoCreated',
      showGoalSuggestionsOnOpen: true,
      items: [expect.objectContaining({ workspace: 'Goals' })],
    });

    const video = await executeToolCall(
      {
        name: 'goal_create_with_guidance',
        arguments: { title: 'Learn saxophone', timeframe: 'thisMonth', guidancePath: 'video' },
      },
      { serverUrl: 'http://localhost' }
    );
    expect(video.messages[0]?.card).toMatchObject({
      type: 'todoCreated',
      showGoalSuggestionsOnOpen: true,
      items: [expect.objectContaining({ workspace: 'Goals' })],
    });
  });

  it('sends easy monthly source steps through goal guidance instead of saving them directly', async () => {
    mockRequestGoalGuidance.mockImplementationOnce(async () => ({
      type: 'plan',
      feasibility: 'realistic',
      feasibilityNote: 'Monthly plan ready.',
      steps: [
        { title: 'Complete four saxophone tone sessions', details: 'Do four focused sessions.', cadence: 'daily', effort: 'medium' },
        { title: 'Record one simple saxophone phrase', details: 'Play and record the phrase.', cadence: 'once', effort: 'medium' },
      ],
    }));

    await guidanceToolHandlers.goal_create_with_guidance({
      title: 'Learn saxophone',
      timeframe: 'thisMonth',
      guidancePath: 'actions',
      sourceSteps: [{ title: 'Watch one intro video' }],
    });

    expect(mockRequestGoalGuidance).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'chat_create',
      timeframe: 'thisMonth',
      sourceSteps: [{ title: 'Watch one intro video', details: '' }],
    }));
    expect(mockSaveGoalGuidanceResponse.mock.calls[0][0].response.steps).toEqual([
      expect.objectContaining({ title: 'Complete four saxophone tone sessions' }),
      expect.objectContaining({ title: 'Record one simple saxophone phrase' }),
    ]);
  });

  it('does not create a goal when chat-created actions guidance is not a plan', async () => {
    mockRequestGoalGuidance.mockImplementationOnce(async () => ({
      type: 'clarify',
      question: 'How much time do you have?',
      feasibility: 'realistic',
      feasibilityNote: '',
      steps: [],
    }));

    const result = await guidanceToolHandlers.goal_create_with_guidance({
      title: 'Learn saxophone',
      timeframe: 'thisWeek',
      guidancePath: 'actions',
    });

    expect(mockCreateTodo).not.toHaveBeenCalled();
    expect(mockSaveGoalGuidanceResponse).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      created: 0,
      error: 'GUIDANCE_NOT_READY',
    });
  });

  it('rolls back the created goal when actions plan saving fails', async () => {
    mockSaveGoalGuidanceResponse.mockRejectedValueOnce(new Error('plan write failed'));

    const result = await guidanceToolHandlers.goal_create_with_guidance({
      title: 'Learn saxophone',
      timeframe: 'thisWeek',
      guidancePath: 'actions',
    });

    expect(mockCreateTodo).toHaveBeenCalled();
    expect(mockDeleteGoalGuidanceForGoal).toHaveBeenCalledWith('goal-1');
    expect(mockDeleteTodos).toHaveBeenCalledWith(['goal-1']);
    expect(result).toMatchObject({
      created: 0,
      error: 'GUIDANCE_SAVE_FAILED',
    });
  });

  it('creates a video skill goal and saves skill video candidates', async () => {
    const result = await guidanceToolHandlers.goal_create_with_guidance({
      title: 'Learn saxophone',
      timeframe: 'thisMonth',
      guidancePath: 'video',
    });

    expect(mockCreateTodo).toHaveBeenCalledWith(expect.objectContaining({
      workspace: 'Goals',
      taskKind: 'skill',
      guidancePath: 'video',
    }));
    expect(mockRequestSkillVideos).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ todoId: 'goal-1', title: 'Learn saxophone' }),
    }));
    expect(mockSaveSkillGuide).toHaveBeenCalledWith(expect.objectContaining({
      todoId: 'goal-1',
      videos: [expect.objectContaining({ videoId: 'video-1' })],
      status: 'videos',
    }));
    expect(result).toMatchObject({
      created: 1,
      guidancePath: 'video',
      guideType: 'skill',
      videoCount: 1,
    });
  });

  it('rejects video guidance for normal goals before creating', async () => {
    mockRequestTodoClassification.mockImplementationOnce(async () => {
      callOrder.push('classify');
      return { kind: 'normal', confidence: 0.9 };
    });

    const result = await guidanceToolHandlers.goal_create_with_guidance({
      title: 'Clean the garage',
      timeframe: 'thisMonth',
      guidancePath: 'video',
    });

    expect(mockCreateTodo).not.toHaveBeenCalled();
    expect(mockRequestSkillVideos).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      created: 0,
      error: 'VIDEO_GUIDANCE_UNSUPPORTED',
    });
  });

  it('returns later guidance steps when scope is next', async () => {
    mockTodos.push({
      id: 'goal-1',
      text: 'Learn guitar',
      details: 'Fingerstyle',
      workspace: 'Goals',
      completed: false,
      starred: false,
      dueDate: null,
      hasDueTime: false,
      goalTimeframe: 'thisMonth',
      taskKind: 'normal',
      guidancePath: 'actions',
    });
    mockFetchGoalGuidancePlanForGoal.mockImplementationOnce(async () => ({
      status: 'accepted',
      activeStepIndex: 0,
      steps: [
        { title: 'Tune guitar', details: 'Use tuner app', completed: false },
        { title: 'Practice scales', details: '10 minutes', completed: false },
        { title: 'Learn chord changes', details: 'G to C', completed: false },
      ],
      activeActions: [],
      actionTodoStepIndexes: {},
    }));

    const result = await guidanceToolHandlers.guidance_current_step({
      todoId: 'goal-1',
      scope: 'next',
    });

    expect(result).toMatchObject({
      found: true,
      scope: 'next',
      totalSteps: 3,
      currentStep: expect.objectContaining({ stepNumber: 1, title: 'Tune guitar', isCurrent: true }),
    });
    expect(result.steps).toEqual([
      expect.objectContaining({ stepNumber: 2, title: 'Practice scales', isCurrent: false }),
      expect.objectContaining({ stepNumber: 3, title: 'Learn chord changes', isCurrent: false }),
    ]);
  });

  it('returns full guidance steps when scope is all', async () => {
    mockTodos.push({
      id: 'goal-2',
      text: 'Learn piano',
      details: '',
      workspace: 'Goals',
      completed: false,
      starred: false,
      dueDate: null,
      hasDueTime: false,
      goalTimeframe: 'thisYear',
      taskKind: 'normal',
      guidancePath: 'actions',
    });
    mockFetchGoalGuidancePlanForGoal.mockImplementationOnce(async () => ({
      status: 'accepted',
      activeStepIndex: 1,
      steps: [
        { title: 'Buy keyboard', details: '', completed: true },
        { title: 'Practice scales', details: '15 minutes', completed: false },
      ],
      activeActions: [],
      actionTodoStepIndexes: {},
    }));

    const result = await guidanceToolHandlers.guidance_current_step({
      todoId: 'goal-2',
      scope: 'all',
    });

    expect(result).toMatchObject({
      found: true,
      scope: 'all',
      totalSteps: 2,
    });
    expect(result.steps).toEqual([
      expect.objectContaining({ stepNumber: 1, title: 'Buy keyboard', completed: true, isCurrent: false }),
      expect.objectContaining({ stepNumber: 2, title: 'Practice scales', completed: false, isCurrent: true }),
    ]);
  });

  it('presents next steps through executeToolCall', async () => {
    mockTodos.push({
      id: 'goal-3',
      text: 'Learn drums',
      details: '',
      workspace: 'Goals',
      completed: false,
      starred: false,
      dueDate: null,
      hasDueTime: false,
      goalTimeframe: 'thisMonth',
      taskKind: 'normal',
      guidancePath: 'actions',
    });
    mockFetchGoalGuidancePlanForGoal.mockImplementationOnce(async () => ({
      status: 'accepted',
      activeStepIndex: 0,
      steps: [
        { title: 'Set up sticks', details: '', completed: false },
        { title: 'Practice rudiments', details: '5 minutes', completed: false },
      ],
      activeActions: [],
      actionTodoStepIndexes: {},
    }));

    const result = await executeToolCall(
      {
        name: 'guidance_current_step',
        arguments: { todoId: 'goal-3', scope: 'next' },
      },
      { serverUrl: 'http://localhost' }
    );

    expect(result.success).toBe(true);
    expect(result.messages[0]?.content).toBe('Next goal plan steps (0/2 done):\n2. Practice rudiments\n   5 minutes');
    expect(result.messages[0]?.card).toMatchObject({
      type: 'todoQuery',
      items: [expect.objectContaining({ id: 'goal-3', text: 'Learn drums' })],
    });
  });

  it('presents all steps through executeToolCall', async () => {
    mockTodos.push({
      id: 'goal-4',
      text: 'Learn bass',
      details: '',
      workspace: 'Goals',
      completed: false,
      starred: false,
      dueDate: null,
      hasDueTime: false,
      goalTimeframe: 'thisYear',
      taskKind: 'normal',
      guidancePath: 'actions',
    });
    mockFetchGoalGuidancePlanForGoal.mockImplementationOnce(async () => ({
      status: 'accepted',
      activeStepIndex: 1,
      steps: [
        { title: 'Buy tuner', details: '', completed: true },
        { title: 'Learn scales', details: '15 minutes', completed: false },
      ],
      activeActions: [],
      actionTodoStepIndexes: {},
    }));

    const result = await executeToolCall(
      {
        name: 'guidance_current_step',
        arguments: { todoId: 'goal-4', scope: 'all' },
      },
      { serverUrl: 'http://localhost' }
    );

    expect(result.success).toBe(true);
    expect(result.messages[0]?.content).toBe('All goal plan steps (1/2 done):\n1. Buy tuner (done)\n2. Learn scales (current)\n   15 minutes');
    expect(result.messages[0]?.card).toMatchObject({
      type: 'todoQuery',
      items: [expect.objectContaining({ id: 'goal-4', text: 'Learn bass' })],
    });
  });
});
