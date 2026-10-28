import { presentCalendarResult } from '../calendarPresenter';

const shift = (day: number) => ({
  id: `e${day}`, title: 'Work shift', startDate: `2026-10-${day}T16:00:00+13:00`, endDate: `2026-10-${day}T20:00:00+13:00`, source: 'local',
});

describe('adding a list of events', () => {
  it('says how many were added, that they repeat, and shows them all', () => {
    const { messages } = presentCalendarResult('calendar_create_many', {
      items: [shift(19), shift(21), shift(23), shift(24)],
      repeatingCount: 4,
      failed: [],
      syncTarget: 'google',
    });
    expect(messages[0].content).toBe('I added 4 events to your calendar and Google Calendar, repeating every week.');
    expect((messages[0] as any).card.items).toHaveLength(4);
  });

  it('names any event it could not add', () => {
    const { messages } = presentCalendarResult('calendar_create_many', {
      items: [shift(19)], repeatingCount: 0, failed: ['Saturday shift'], syncTarget: 'local',
    });
    expect(messages[0].content).toBe("I added 1 event to your calendar. I couldn't add: Saturday shift.");
  });
});
