import {
  AI_AUTH_REQUIRED_MESSAGE,
} from '@/lib/aiAuth';
import { getAiRequestHeaders } from '@/lib/aiRequest';

let mockCurrentUser: { uid: string; getIdToken: jest.Mock } | null = null;
const mockRequireAiDataSharingConsent = jest.fn();

jest.mock('@/firebaseConfig', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
}));

jest.mock('@/lib/aiDataSharingConsent', () => ({
  requireAiDataSharingConsent: (...args: unknown[]) => mockRequireAiDataSharingConsent(...args),
}));

describe('AI request headers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = null;
    mockRequireAiDataSharingConsent.mockResolvedValue(undefined);
  });

  it('requires sign-in before requesting consent', async () => {
    await expect(getAiRequestHeaders()).rejects.toThrow(AI_AUTH_REQUIRED_MESSAGE);
    expect(mockRequireAiDataSharingConsent).not.toHaveBeenCalled();
  });

  it('requires consent before creating authenticated headers', async () => {
    const getIdToken = jest.fn(async () => 'token-1');
    mockCurrentUser = { uid: 'user-1', getIdToken };

    await expect(getAiRequestHeaders()).resolves.toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-1',
      'X-Eazee-Ai-Feature': 'aiChat',
      'X-Eazee-Timezone': expect.any(String),
    });

    expect(mockRequireAiDataSharingConsent).toHaveBeenCalledWith('user-1');
    expect(mockRequireAiDataSharingConsent.mock.invocationCallOrder[0]).toBeLessThan(
      getIdToken.mock.invocationCallOrder[0]
    );
  });

  it('does not request a token when consent is declined', async () => {
    const getIdToken = jest.fn(async () => 'token-1');
    mockCurrentUser = { uid: 'user-1', getIdToken };
    mockRequireAiDataSharingConsent.mockRejectedValue(
      Object.assign(new Error('Allow AI Features to continue.'), {
        name: 'AiDataSharingConsentDeclinedError',
      })
    );

    await expect(getAiRequestHeaders()).rejects.toMatchObject({
      name: 'AiDataSharingConsentDeclinedError',
    });
    expect(getIdToken).not.toHaveBeenCalled();
  });
});
