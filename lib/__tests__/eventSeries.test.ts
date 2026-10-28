jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@/app/context/TokenContext', () => ({
  getGoogleConnectionStatusStatic: jest.fn(async () => ({ isActive: true, accessToken: 'google-token' })),
}));

const mockCreatedRows: Record<string, any[]> = { events: [], event_series: [] };
jest.mock('@/database/database', () => ({
  database: {
    write: jest.fn(async (action: () => Promise<unknown>) => action()),
    get: jest.fn((table: string) => ({
      create: jest.fn(async (build: (record: any) => void) => {
        const record: any = { id: `${table}-${mockCreatedRows[table].length + 1}` };
        build(record);
        mockCreatedRows[table].push(record);
        return record;
      }),
    })),
  },
}));

import {
  createWeeklyEventSeries,
  formatGoogleUtcStamp,
  getWeeklyOccurrenceStarts,
  toGoogleInstanceId,
} from '@/lib/eventSeries';

describe('getWeeklyOccurrenceStarts', () => {
  const first = new Date(2026, 9, 5, 9, 30);

  it('lists the same weekday and clock time each week, up to (not including) the end', () => {
    const starts = getWeeklyOccurrenceStarts(first, null, new Date(2026, 9, 26, 9, 30));
    expect(starts.map((start) => [start.getDate(), start.getDay(), start.getHours(), start.getMinutes()])).toEqual([
      [5, 1, 9, 30],
      [12, 1, 9, 30],
      [19, 1, 9, 30],
    ]);
  });

  it('only returns occurrences after the latest one already created', () => {
    const starts = getWeeklyOccurrenceStarts(first, new Date(2026, 9, 12, 9, 30), new Date(2026, 9, 27));
    expect(starts.map((start) => start.getDate())).toEqual([19, 26]);
  });
});

describe('Google ids', () => {
  it('formats instance ids the way Google names repeating event instances', () => {
    const start = new Date(Date.UTC(2026, 9, 12, 7, 0, 0));
    expect(formatGoogleUtcStamp(start)).toBe('20261012T070000Z');
    expect(toGoogleInstanceId('abc123', start)).toBe('abc123_20261012T070000Z');
  });
});

describe('createWeeklyEventSeries', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    mockCreatedRows.events = [];
    mockCreatedRows.event_series = [];
  });

  it('creates one weekly repeating Google event and links each local occurrence to its instance', async () => {
    const now = new Date(2026, 9, 5, 8);
    const start = new Date(2026, 9, 5, 9);
    const end = new Date(2026, 9, 5, 10);
    const fetchMock = jest.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST') return { ok: true, json: async () => ({ id: 'series-google-id' }) };
      return {
        ok: true,
        json: async () => ({
          items: [{ id: 'real-instance-1', originalStartTime: { dateTime: start.toISOString() } }],
        }),
      };
    });
    global.fetch = fetchMock as any;

    const result = await createWeeklyEventSeries(
      { title: 'Deep work', start: start.toISOString(), end: end.toISOString() },
      now
    );

    const postBody = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1].body);
    expect(postBody.recurrence).toEqual(['RRULE:FREQ=WEEKLY']);
    expect(postBody.start.timeZone).toBeTruthy();

    expect(result).toMatchObject({ googleEventId: 'series-google-id', occurrenceCount: 8 });
    expect(mockCreatedRows.event_series[0]).toMatchObject({ title: 'Deep work', active: true, googleEventId: 'series-google-id' });
    expect(mockCreatedRows.events).toHaveLength(8);
    expect(mockCreatedRows.events.every((row) => row.seriesId === result.seriesId && row.title === 'Deep work')).toBe(true);
    expect(mockCreatedRows.events[0].googleEventId).toBe('real-instance-1');
    expect(mockCreatedRows.events[1].googleEventId).toBe(toGoogleInstanceId('series-google-id', mockCreatedRows.events[1].startDate));
    expect(mockCreatedRows.events[1].endDate.getTime() - mockCreatedRows.events[1].startDate.getTime()).toBe(60 * 60_000);
  });
});
