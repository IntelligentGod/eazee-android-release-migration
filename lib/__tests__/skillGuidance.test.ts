// These suites cover feature behaviour, not billing: run them as an entitled
// user so the Pro gate in lib/aiRequest does not short-circuit the requests.
jest.mock('@/lib/subscriptionUsage', () => ({
  ...jest.requireActual('@/lib/subscriptionUsage'),
  checkAiFeatureAccess: jest.fn(async () => ({ allowed: true })),
  recordAiAction: jest.fn(async () => {}),
  recordVoiceUsage: jest.fn(async () => {}),
}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestSkillVideos } from '@/lib/skillGuidance';

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

describe('skill guidance video requests', () => {
  beforeEach(() => {
    mockedAsyncStorage.getItem.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('normalizes exact language names and preserves backend video order', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        query: 'learn c plus plus tutorial',
        videos: [
          {
            videoId: 'first',
            title: 'Best C++ match',
            channelTitle: 'Channel 1',
            viewCount: 12,
          },
          {
            videoId: 'second',
            title: 'Broader programming video',
            channelTitle: 'Channel 2',
            viewCount: 999999,
          },
        ],
      }),
    } as Response);

    const result = await requestSkillVideos({
      context: {
        todoId: 'todo-1',
        title: 'learn c++',
        details: 'compare c# and c++ basics',
      },
      excludeVideoIds: ['first', '', 'second'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/ai/skill/videos'),
      expect.objectContaining({
        body: expect.stringContaining('"title":"learn c plus plus"'),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"details":"compare c sharp and c plus plus basics"'),
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
});
