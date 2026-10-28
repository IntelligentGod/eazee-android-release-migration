// These suites cover feature behaviour, not billing: run them as an entitled
// user so the Pro gate in lib/aiRequest does not short-circuit the requests.
jest.mock('@/lib/subscriptionUsage', () => ({
  ...jest.requireActual('@/lib/subscriptionUsage'),
  checkAiFeatureAccess: jest.fn(async () => ({ allowed: true })),
  recordAiAction: jest.fn(async () => {}),
  recordVoiceUsage: jest.fn(async () => {}),
}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestTaskGuidanceAnswer, shouldShowTaskGuideShortcut } from '@/lib/taskGuidance';

jest.mock('@/config/backend', () => ({
  SERVER_URL: 'http://localhost:8787',
}));

jest.mock('@/firebaseConfig', () => ({
  auth: {
    currentUser: {
      uid: 'user-1',
      getIdToken: jest.fn(async () => 'token-1'),
    },
  },
}));

jest.mock('@/lib/aiDataSharingConsent', () => ({
  requireAiDataSharingConsent: jest.fn(async () => {}),
}));

jest.mock('@/database/database', () => ({
  database: {
    collections: {
      get: jest.fn(),
    },
    write: jest.fn(),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('task guidance shortcut detection', () => {
  it('shows for active Personal todos', () => {
    expect(shouldShowTaskGuideShortcut({
      workspace: 'Personal',
      completed: false,
    })).toBe(true);
  });

  it('hides completed and non-Personal todos', () => {
    expect(shouldShowTaskGuideShortcut({
      workspace: 'Personal',
      completed: true,
    })).toBe(false);

    expect(shouldShowTaskGuideShortcut({
      workspace: 'Goals',
      completed: false,
    })).toBe(false);

    expect(shouldShowTaskGuideShortcut({
      workspace: 'Wishlist',
      completed: false,
    })).toBe(false);
  });
});

describe('task guidance saved answers', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock | undefined) = jest.fn();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
  });

  it('calls the saved guidance answer endpoint without sending replacement steps', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: 'Use the first step as your starting point.',
        suggestedStepIndex: 0,
      }),
    });

    const result = await requestTaskGuidanceAnswer({
      context: {
        todoId: 'todo-1',
        title: 'Build portfolio site',
        details: 'Use Webflow',
      },
      guide: {
        id: 'guide-1',
        todoId: 'todo-1',
        status: 'accepted',
        activeStepIndex: 1,
        note: 'Keep it small.',
        steps: [
          { title: 'Pick projects', details: 'Choose three examples.', completed: false },
          { title: 'Write case studies', details: 'Draft the story.', completed: false },
        ],
        conversation: [
          { role: 'assistant', content: 'Steps are ready.' },
          { role: 'user', content: 'What first?' },
        ],
        createdAt: new Date('2026-05-04T00:00:00Z'),
      },
      question: 'What should I do first?',
    });

    expect(result).toEqual({
      answer: 'Use the first step as your starting point.',
      suggestedStepIndex: 0,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8787/ai/guidance/answer',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      })
    );
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({
      guideType: 'task',
      title: 'Build portfolio site',
      details: 'Use Webflow',
      status: 'accepted',
      activeStepIndex: 1,
      question: 'What should I do first?',
      aiPersonalization: {
        baseStyle: 'positive',
        warmth: 'default',
        emoji: 'default',
        responseLength: 'default',
      },
    });
    expect(body.steps).toEqual([
      { title: 'Pick projects', details: 'Choose three examples.', completed: false },
      { title: 'Write case studies', details: 'Draft the story.', completed: false },
    ]);
    expect(body.steps[0]).not.toHaveProperty('replacementSteps');
  });

  it('omits invalid suggested step indexes from the answer result', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: 'Stay on the current step.',
        suggestedStepIndex: '2',
      }),
    });

    const result = await requestTaskGuidanceAnswer({
      context: { todoId: 'todo-1', title: 'Build portfolio site' },
      guide: {
        id: 'guide-1',
        todoId: 'todo-1',
        status: 'accepted',
        activeStepIndex: 0,
        steps: [{ title: 'Pick projects' }],
        conversation: [],
        createdAt: new Date('2026-05-04T00:00:00Z'),
      },
      question: 'Which step?',
    });

    expect(result).toEqual({ answer: 'Stay on the current step.', suggestedStepIndex: undefined });
  });
});
