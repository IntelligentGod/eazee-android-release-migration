// These suites cover feature behaviour, not billing: run them as an entitled
// user so the Pro gate in lib/aiRequest does not short-circuit the requests.
jest.mock('@/lib/subscriptionUsage', () => ({
  ...jest.requireActual('@/lib/subscriptionUsage'),
  checkAiFeatureAccess: jest.fn(async () => ({ allowed: true })),
  recordAiAction: jest.fn(async () => {}),
  recordVoiceUsage: jest.fn(async () => {}),
}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createDefaultRecipeAnswers,
  requestRecipeAnswer,
  requestRecipeGuide,
  requestRecipeVideos,
} from '@/lib/recipeGuidance';

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

describe('recipe video requests', () => {
  beforeEach(() => {
    mockedAsyncStorage.getItem.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('normalizes search text and preserves backend ordering', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => ({
        query: 'spicy c plus plus curry',
        videos: [
          {
            videoId: 'first',
            title: 'Most relevant recipe',
            channelTitle: 'Channel 1',
            viewCount: 10,
          },
          {
            videoId: 'second',
            title: 'Less relevant but bigger channel',
            channelTitle: 'Channel 2',
            viewCount: 500000,
          },
        ],
      }),
    } as never);

    const result = await requestRecipeVideos({
      context: {
        todoId: 'todo-1',
        title: 'make c++ curry',
        details: 'inspired by c# joke title',
      },
      answers: createDefaultRecipeAnswers(),
      excludeVideoIds: ['first', '', 'second'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/ai/recipe/videos'),
      expect.objectContaining({
        body: expect.stringContaining('"title":"make c plus plus curry"'),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"details":"inspired by c sharp joke title"'),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"excludeVideoIds":["first","second"]'),
      })
    );
    expect(result.videos.map((video) => video.videoId)).toEqual(['first', 'second']);
  });

  it('uses a pending recipe target title for video search', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => ({
        query: 'blueberry cake recipe tutorial step by step cooking',
        videos: [],
      }),
    } as never);

    await requestRecipeVideos({
      context: {
        todoId: 'todo-1',
        title: 'chocolate cake recipe',
        details: '',
      },
      answers: {
        ...createDefaultRecipeAnswers(),
        targetTitle: 'blueberry cake',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"title":"blueberry cake"'),
      })
    );
  });

  it('parses recipe change answers', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'This changes the main recipe. I can find new videos for blueberry cake.',
        action: 'recipe_change',
        recipeTitle: 'blueberry cake',
      }),
    } as never);

    const result = await requestRecipeAnswer({
      context: {
        todoId: 'todo-1',
        title: 'chocolate cake recipe',
        details: '',
      },
      guide: {
        id: 'guide-1',
        todoId: 'todo-1',
        answers: createDefaultRecipeAnswers(),
        videos: [],
        ingredients: [],
        equipment: [],
        steps: [],
        conversation: [],
        activeStepIndex: 0,
        status: 'ready',
        createdAt: new Date(),
      },
      question: 'i want blueberry cake instead',
    });

    expect(result).toEqual({
      answer: 'This changes the main recipe. I can find new videos for blueberry cake.',
      action: 'recipe_change',
      recipeTitle: 'blueberry cake',
      suggestedStepIndex: undefined,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/ai/recipe/answer'),
      expect.objectContaining({
        body: expect.stringContaining('"aiPersonalization":{"baseStyle":"positive","warmth":"default","emoji":"default","responseLength":"default"}'),
      })
    );
  });

  it('uses a pending recipe target title for guide generation and follow-up answers', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as never)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ingredients: [],
          equipment: [],
          steps: [{ title: 'Mix berries', body: 'Fold blueberries into the batter.' }],
        }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: 'Use fresh blueberries if you have them.',
        }),
      } as never);
    const guide = {
      id: 'guide-1',
      todoId: 'todo-1',
      answers: {
        ...createDefaultRecipeAnswers(),
        targetTitle: 'blueberry cake',
      },
      videos: [],
      selectedVideo: {
        videoId: 'video-1',
        title: 'Blueberry cake',
        channelTitle: 'Baker',
      },
      ingredients: [],
      equipment: [],
      steps: [],
      conversation: [],
      activeStepIndex: 0,
      status: 'ready' as const,
      createdAt: new Date(),
    };

    await requestRecipeGuide({
      context: {
        todoId: 'todo-1',
        title: 'chocolate cake recipe',
        details: '',
      },
      answers: guide.answers,
      selectedVideo: guide.selectedVideo,
    });
    await requestRecipeAnswer({
      context: {
        todoId: 'todo-1',
        title: 'chocolate cake recipe',
        details: '',
      },
      guide,
      question: 'fresh or frozen berries?',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/ai/recipe/generate'),
      expect.objectContaining({
        body: expect.stringContaining('"title":"blueberry cake"'),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/ai/recipe/answer'),
      expect.objectContaining({
        body: expect.stringContaining('"title":"blueberry cake"'),
      })
    );
  });
});
