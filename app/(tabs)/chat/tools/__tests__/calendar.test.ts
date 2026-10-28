const mockRows = new Map<string, any>();
const mockOrder: string[] = [];

const mockCreate = jest.fn(async (builder: (row: any) => void) => {
  mockOrder.push('create');
  const row: any = {
    id: `local-${mockRows.size + 1}`,
    update: jest.fn(async (mutator: (record: any) => void) => {
      mockOrder.push('update');
      mutator(row);
    }),
  };
  builder(row);
  mockRows.set(row.id, row);
  return row;
});

const mockFind = jest.fn(async (id: string) => {
  const row = mockRows.get(id);
  if (!row) throw new Error('NOT_FOUND');
  return row;
});

jest.mock('../../../../../database/database', () => ({
  database: {
    collections: {
      get: jest.fn(() => ({
        create: mockCreate,
      })),
    },
    get: jest.fn(() => ({
      find: mockFind,
    })),
    write: jest.fn(async (callback: () => Promise<void>) => callback()),
  },
}));

jest.mock('@/app/context/TokenContext', () => ({
  getAccessTokenStatic: jest.fn(async () => null),
  getGoogleConnectionStatusStatic: jest.fn(async () => ({ isActive: false, accessToken: null })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { database } = require('../../../../../database/database');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getAccessTokenStatic } = require('@/app/context/TokenContext');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getGoogleConnectionStatusStatic } = require('@/app/context/TokenContext');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { calendarToolHandlers, createCalendarEvent } = require('../calendar');

describe('calendar_create', () => {
  beforeEach(() => {
    mockRows.clear();
    mockOrder.length = 0;
    mockCreate.mockClear();
    mockFind.mockClear();
    database.write.mockClear();
    getAccessTokenStatic.mockReset();
    getAccessTokenStatic.mockResolvedValue(null);
    getGoogleConnectionStatusStatic.mockReset();
    getGoogleConnectionStatusStatic.mockResolvedValue({ isActive: false, accessToken: null });
    global.fetch = jest.fn();
  });

  it('creates the local event before attempting Google sync', async () => {
    getGoogleConnectionStatusStatic.mockResolvedValue({ isActive: true, accessToken: 'token-123' });
    (global.fetch as jest.Mock).mockImplementation(async () => {
      mockOrder.push('fetch');
      throw new Error('network');
    });

    const result = await createCalendarEvent({
      title: 'Design review',
      start: '2026-04-03T09:00:00+05:30',
      end: '2026-04-03T10:00:00+05:30',
      details: 'Review launch checklist.',
      location: 'Room 2',
    });

    expect(mockOrder).toEqual(['create', 'fetch']);
    expect(mockRows.get('local-1')).toMatchObject({
      id: 'local-1',
      title: 'Design review',
      details: 'Review launch checklist.',
      location: 'Room 2',
      isGoogleEvent: false,
    });
    expect(result).toMatchObject({
      created: true,
      syncTarget: 'local',
      item: {
        id: 'local-1',
        title: 'Design review',
        details: 'Review launch checklist.',
        source: 'local',
      },
    });
    expect(result.item.googleEventId).toBeUndefined();
  });

  it('patches the local event with the linked Google id after sync succeeds', async () => {
    getGoogleConnectionStatusStatic.mockResolvedValue({ isActive: true, accessToken: 'token-123' });
    (global.fetch as jest.Mock).mockImplementation(async () => {
      mockOrder.push('fetch');
      return {
        ok: true,
        json: async () => ({ id: 'google-1' }),
      };
    });

    const result = await createCalendarEvent({
      title: 'Team sync',
      start: '2026-04-03T11:00:00+05:30',
      end: '2026-04-03T12:00:00+05:30',
      details: 'Weekly priorities and blockers.',
      attendees: ['a@example.com'],
    });

    expect(mockOrder).toEqual(['create', 'fetch', 'update']);
    expect(mockFind).toHaveBeenCalledWith('local-1');
    expect(mockRows.get('local-1')).toMatchObject({
      id: 'local-1',
      title: 'Team sync',
      details: 'Weekly priorities and blockers.',
      googleEventId: 'google-1',
      isGoogleEvent: false,
    });
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
      description: 'Weekly priorities and blockers.',
    });
    expect(result).toMatchObject({
      created: true,
      syncTarget: 'google',
      item: {
        id: 'local-1',
        googleEventId: 'google-1',
        title: 'Team sync',
        source: 'local',
      },
    });
  });

  it('falls back to local details when linked Google details cannot be fetched', async () => {
    mockRows.set('local-1', {
      id: 'local-1',
      title: 'Fallback event',
      details: 'Bring the notes.',
      startDate: new Date('2026-04-03T13:00:00+05:30'),
      endDate: new Date('2026-04-03T14:00:00+05:30'),
      location: 'Cafe',
      googleEventId: 'google-1',
    });
    getAccessTokenStatic.mockResolvedValue('token-123');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      text: async () => '',
    });

    const result = await calendarToolHandlers.calendar_get_details({
      id: 'local-1',
      source: 'local',
    });

    expect(result).toMatchObject({
      item: {
        id: 'local-1',
        title: 'Fallback event',
        details: 'Bring the notes.',
        location: 'Cafe',
        source: 'local',
        googleEventId: 'google-1',
      },
    });
    expect(result.item.startDate).toContain('2026-04-03T07:30:00.000Z');
    expect(result.item.endDate).toContain('2026-04-03T08:30:00.000Z');
  });

  it('preserves raw angle-bracket text in local details', async () => {
    mockRows.set('local-1', {
      id: 'local-1',
      title: 'Token prep',
      details: 'Bring <token> to interview.',
      startDate: new Date('2026-04-03T13:00:00+05:30'),
      endDate: new Date('2026-04-03T14:00:00+05:30'),
      location: 'Cafe',
    });

    const result = await calendarToolHandlers.calendar_get_details({
      id: 'local-1',
      source: 'local',
    });

    expect(result.item.details).toBe('Bring <token> to interview.');
  });

  it('uses Google description over stale local details for linked events', async () => {
    mockRows.set('local-1', {
      id: 'local-1',
      title: 'Local event',
      details: 'Old local notes.',
      startDate: new Date('2026-04-03T13:00:00+05:30'),
      endDate: new Date('2026-04-03T14:00:00+05:30'),
      location: 'Cafe',
      googleEventId: 'google-1',
    });
    getAccessTokenStatic.mockResolvedValue('token-123');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'google-1',
        summary: 'Google event',
        description: '<b>Updated in Google.</b><br>Review &amp; decide.',
        start: { dateTime: '2026-04-03T13:00:00+05:30' },
        end: { dateTime: '2026-04-03T14:00:00+05:30' },
        location: 'Cafe',
      }),
    });

    const result = await calendarToolHandlers.calendar_get_details({
      id: 'local-1',
      source: 'local',
    });

    expect(result.item).toMatchObject({
      id: 'local-1',
      title: 'Google event',
      details: 'Updated in Google. Review & decide.',
      location: 'Cafe',
      source: 'local',
      googleEventId: 'google-1',
    });
  });

  it('preserves escaped angle-bracket text while stripping real HTML tags', async () => {
    mockRows.set('local-1', {
      id: 'local-1',
      title: 'Token review',
      details: 'Old local notes.',
      startDate: new Date('2026-04-03T13:00:00+05:30'),
      endDate: new Date('2026-04-03T14:00:00+05:30'),
      googleEventId: 'google-1',
    });
    getAccessTokenStatic.mockResolvedValue('token-123');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'google-1',
        summary: 'Token review',
        description: '<b>Agenda</b> Use &lt;token&gt; &amp; retry.',
        start: { dateTime: '2026-04-03T13:00:00+05:30' },
        end: { dateTime: '2026-04-03T14:00:00+05:30' },
      }),
    });

    const result = await calendarToolHandlers.calendar_get_details({
      id: 'local-1',
      source: 'local',
    });

    expect(result.item.details).toBe('Agenda Use <token> & retry.');
  });

  it('updates Google description and local details when editing a linked event', async () => {
    const row: any = {
      id: 'local-1',
      title: 'Team sync',
      details: 'Old notes.',
      startDate: new Date('2026-04-03T13:00:00+05:30'),
      endDate: new Date('2026-04-03T14:00:00+05:30'),
      googleEventId: 'google-1',
    };
    row.update = jest.fn(async (mutator: (record: any) => void) => {
      mockOrder.push('update');
      mutator(row);
    });
    mockRows.set('local-1', row);
    getAccessTokenStatic.mockResolvedValue('token-123');
    (global.fetch as jest.Mock).mockImplementation(async (_url: string, options: any = {}) => {
      if (options.method === 'PATCH') {
        mockOrder.push('patch');
        expect(JSON.parse(options.body)).toMatchObject({ description: 'New notes.' });
        return { ok: true, json: async () => ({}) };
      }
      mockOrder.push('get');
      return {
        ok: true,
        json: async () => ({
          id: 'google-1',
          summary: 'Team sync',
          description: 'Old notes.',
          start: { dateTime: '2026-04-03T13:00:00+05:30' },
          end: { dateTime: '2026-04-03T14:00:00+05:30' },
        }),
      };
    });

    const result = await calendarToolHandlers.calendar_update({
      id: 'local-1',
      source: 'local',
      details: 'New notes.',
    });

    expect(mockOrder).toEqual(['get', 'patch', 'update']);
    expect(row.details).toBe('New notes.');
    expect(result.item).toMatchObject({
      id: 'local-1',
      details: 'New notes.',
    });
  });

  it('finds short Google titles by scanning the range when indexed search misses', async () => {
    getAccessTokenStatic.mockResolvedValue('token-123');
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (String(url).includes('q=T1')) {
        return {
          ok: true,
          json: async () => ({ items: [] }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          items: [{
            id: 'google-t1',
            summary: 'T1',
            start: { dateTime: '2026-05-09T18:00:00+05:30' },
            end: { dateTime: '2026-05-09T19:00:00+05:30' },
          }],
        }),
      };
    });

    const result = await calendarToolHandlers.calendar_search({
      query: 'T1',
      from: '2026-02-09T13:13:37.946Z',
      to: '2026-08-09T13:13:37.946Z',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'google-t1',
      title: 'T1',
      source: 'google',
    });
  });

  it('reports calendar search matches before applying the returned item limit', async () => {
    getAccessTokenStatic.mockResolvedValue('token-123');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'google-dentist-1',
            summary: 'Dentist',
            start: { dateTime: '2026-05-09T18:00:00+05:30' },
            end: { dateTime: '2026-05-09T19:00:00+05:30' },
          },
          {
            id: 'google-dentist-2',
            summary: 'Dentist follow-up',
            start: { dateTime: '2026-05-10T18:00:00+05:30' },
            end: { dateTime: '2026-05-10T19:00:00+05:30' },
          },
          {
            id: 'google-dentist-3',
            summary: 'Dentist reminder',
            start: { dateTime: '2026-05-11T18:00:00+05:30' },
            end: { dateTime: '2026-05-11T19:00:00+05:30' },
          },
        ],
      }),
    });

    const result = await calendarToolHandlers.calendar_search({
      query: 'Dentist',
      from: '2026-02-09T13:13:37.946Z',
      to: '2026-08-09T13:13:37.946Z',
      openIntent: true,
      limit: 1,
    });

    expect(result.items).toHaveLength(2);
    expect(result.totalMatches).toBe(3);
  });

  it('throws event not found when a requested local event no longer exists', async () => {
    await expect(
      calendarToolHandlers.calendar_get_details({
        id: 'missing-local',
        source: 'local',
      })
    ).rejects.toThrow('EVENT_NOT_FOUND');
  });

  it('throws event not found when Google says the event no longer exists', async () => {
    getAccessTokenStatic.mockResolvedValue('token-123');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    });

    await expect(
      calendarToolHandlers.calendar_get_details({
        id: 'google-missing',
        source: 'google',
      })
    ).rejects.toThrow('EVENT_NOT_FOUND');
  });
});
