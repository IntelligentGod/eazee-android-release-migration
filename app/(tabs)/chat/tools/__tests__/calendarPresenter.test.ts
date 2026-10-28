import { presentCalendarResult } from '../presenters/calendarPresenter';

describe('calendar presenter', () => {
  it('returns a guidance target for single event open intent', () => {
    const result = presentCalendarResult('calendar_search', {
      openIntent: true,
      totalMatches: 1,
      items: [{
        id: 'event-1',
        title: 'Dentist',
        startDate: '2026-06-01T10:00:00.000Z',
        source: 'google',
        googleEventId: 'google-1',
      }],
    });

    expect(result.messages[0]?.card).toMatchObject({
      type: 'navigationShortcut',
      label: 'Dentist',
      route: '/(tabs)/calendar',
      params: {
        openEventId: 'event-1',
        openEventSource: 'google',
        openNonce: expect.any(String),
      },
      target: {
        type: 'event',
        eventId: 'event-1',
        source: 'google',
        startDate: '2026-06-01T10:00:00.000Z',
        googleEventId: 'google-1',
      },
    });
  });

  it('does not first-match guess when open intent has multiple events', () => {
    const result = presentCalendarResult('calendar_search', {
      openIntent: true,
      items: [
        { id: 'event-1', title: 'Dentist', startDate: '2026-06-01T10:00:00.000Z', source: 'local' },
        { id: 'event-2', title: 'Dentist follow-up', startDate: '2026-06-02T10:00:00.000Z', source: 'local' },
      ],
    });

    expect(result.messages[0]?.card).toMatchObject({
      type: 'calendarList',
      items: expect.arrayContaining([
        expect.objectContaining({ id: 'event-1' }),
        expect.objectContaining({ id: 'event-2' }),
      ]),
    });
  });

  it('does not first-match guess when open intent results were truncated', () => {
    const result = presentCalendarResult('calendar_search', {
      openIntent: true,
      totalMatches: 2,
      items: [
        { id: 'event-1', title: 'Dentist', startDate: '2026-06-01T10:00:00.000Z', source: 'local' },
      ],
    });

    expect(result.messages[0]?.card).toMatchObject({
      type: 'calendarList',
      items: [expect.objectContaining({ id: 'event-1' })],
    });
  });
});
