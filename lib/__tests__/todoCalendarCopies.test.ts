const mockEvents = [
  { googleEventId: 'g-1', prepareDestroyPermanently: jest.fn(() => 'destroy-1') },
  { googleEventId: '', prepareDestroyPermanently: jest.fn(() => 'destroy-2') },
];
const mockBatch = jest.fn();
const mockQuery = jest.fn((..._args: unknown[]) => ({ fetch: jest.fn(async () => mockEvents) }));

jest.mock('@/app/context/TokenContext', () => ({ getAccessTokenStatic: jest.fn(async () => 'token-1') }));
jest.mock('@/database/models/EventModel', () => ({}));
jest.mock('@/database/database', () => ({
  database: {
    get: jest.fn(() => ({ query: mockQuery })),
    write: jest.fn(async (work: () => Promise<void>) => work()),
    batch: (...args: unknown[]) => mockBatch(...args),
  },
}));

import { collectGoogleEventIds, deleteCalendarCopiesForTodos } from '@/lib/todoCalendarCopies';

describe('deleteCalendarCopiesForTodos', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 204 })) as unknown as typeof fetch;
    mockBatch.mockClear();
  });

  it('removes the tasks\' events in the app and their Google copies', async () => {
    await deleteCalendarCopiesForTodos(['todo-1']);

    expect(mockBatch).toHaveBeenCalledWith(['destroy-1', 'destroy-2']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/events/g-1');
    expect((global.fetch as jest.Mock).mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  it('does nothing when no task ids are given', async () => {
    await deleteCalendarCopiesForTodos([]);
    expect(mockBatch).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('collects each Google id once and skips blanks', () => {
    expect(collectGoogleEventIds([{ googleEventId: 'a' }, { googleEventId: ' a ' }, { googleEventId: undefined }])).toEqual(['a']);
  });
});
