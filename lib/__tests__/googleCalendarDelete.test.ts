import { deleteGoogleCalendarEventById } from '@/lib/googleCalendarDelete';

type Reply = { status: number; body?: unknown };
const reply = ({ status, body }: Reply) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body ?? {}),
}) as unknown as Response;

/** Answers each request in order and records what was asked. */
const google = (...replies: Reply[]) => {
  const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method || 'GET', headers: (init?.headers || {}) as Record<string, string> });
    return reply(replies.shift() || { status: 500 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

describe('deleting a Google Calendar event', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));

  it('deletes, and treats an event already gone as deleted', async () => {
    const ok = google({ status: 204 });
    await deleteGoogleCalendarEventById('abc', 'token', ok.fetchImpl);
    expect(ok.calls).toHaveLength(1);
    const gone = google({ status: 410 });
    await expect(deleteGoogleCalendarEventById('abc', 'token', gone.fetchImpl)).resolves.toBeUndefined();
  });

  it('on 412 for one week of a repeat, deletes the instance Google holds now', async () => {
    const g = google({ status: 412 }, { status: 200, body: { items: [{ id: 'series_R20261005_20261012T070000Z', status: 'confirmed' }] } }, { status: 204 });
    await deleteGoogleCalendarEventById('series_20261012T070000Z', 'token', g.fetchImpl);
    expect(g.calls[1].url).toContain('/series/instances?originalStart=2026-10-12T07%3A00%3A00Z');
    expect(g.calls[2]).toMatchObject({ method: 'DELETE' });
    expect(g.calls[2].url).toContain('series_R20261005_20261012T070000Z');
  });

  it('on 412, a week that no longer exists or is cancelled counts as deleted', async () => {
    const none = google({ status: 412 }, { status: 200, body: { items: [] } });
    await expect(deleteGoogleCalendarEventById('series_20261012T070000Z', 'token', none.fetchImpl)).resolves.toBeUndefined();
    const cancelled = google({ status: 412 }, { status: 200, body: { items: [{ id: 'x', status: 'cancelled' }] } });
    await expect(deleteGoogleCalendarEventById('series_20261012T070000Z', 'token', cancelled.fetchImpl)).resolves.toBeUndefined();
  });

  it('on 412 for a single event, deletes the version Google holds now', async () => {
    const g = google({ status: 412 }, { status: 200, body: { etag: '"v2"', status: 'confirmed' } }, { status: 204 });
    await deleteGoogleCalendarEventById('plain-event', 'token', g.fetchImpl);
    expect(g.calls[2]).toMatchObject({ method: 'DELETE', headers: expect.objectContaining({ 'If-Match': '"v2"' }) });
  });

  it('when Google keeps refusing the delete with 412, marks the event cancelled instead', async () => {
    const g = google({ status: 412 }, { status: 200, body: { etag: '"v2"' } }, { status: 412 }, { status: 200 });
    await expect(deleteGoogleCalendarEventById('plain-event', 'token', g.fetchImpl)).resolves.toBeUndefined();
    expect(g.calls[3]).toMatchObject({ method: 'PATCH' });
    expect(g.calls[3].url).toContain('/events/plain-event');
  });

  it("reports Google's reason when it still refuses", async () => {
    const g = google(
      { status: 412 },
      { status: 200, body: { etag: '"v2"' } },
      { status: 412, body: { error: { errors: [{ reason: 'conditionNotMet' }] } } },
      { status: 412 }
    );
    await expect(deleteGoogleCalendarEventById('plain-event', 'token', g.fetchImpl))
      .rejects.toMatchObject({ message: 'GOOGLE_DELETE_FAILED', status: 412, reason: 'conditionNotMet' });
    const auth = google({ status: 401 });
    await expect(deleteGoogleCalendarEventById('e', 'token', auth.fetchImpl)).rejects.toMatchObject({ message: 'GOOGLE_AUTH_REQUIRED' });
  });
});
