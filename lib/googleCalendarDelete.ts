/**
 * Deletes one event from the user's primary Google Calendar.
 *
 * Google answers 412 ("Precondition Failed") when the event it holds no longer matches the
 * id or version asked for. That happens most with one week of a repeating event: Eazee
 * keeps an id per week, built as `<event id>_<start in UTC>` when Google couldn't be asked,
 * and it stops matching once the repeat changes. On a 412 this finds what Google holds
 * now and deletes that; something already gone or cancelled counts as deleted. If Google still
 * refuses the delete (it can keep answering 412 for some events), the event is marked cancelled
 * instead, which is how Google itself removes an event or one week of a repeat.
 */
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export type GoogleDeleteError = Error & { status?: number; reason?: string };

const isGone = (status: number) => status === 404 || status === 410;

/** "20261012T070000Z" → "2026-10-12T07:00:00Z"; an all-day "20261012" → "2026-10-12". */
const toOriginalStart = (stamp: string) =>
  stamp.length === 8
    ? `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`
    : `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;

async function readGoogleErrorReason(response: Response) {
  const text = await response.text().catch(() => '');
  try {
    const body = JSON.parse(text);
    return String(body?.error?.errors?.[0]?.reason || body?.error?.status || body?.error?.message || '').slice(0, 60) || undefined;
  } catch {
    return text ? text.slice(0, 60) : undefined;
  }
}

export async function deleteGoogleCalendarEventById(
  googleEventId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
) {
  const headers = { Authorization: `Bearer ${accessToken}`, 'Cache-Control': 'no-cache' };
  const deleteById = (id: string, extraHeaders: Record<string, string> = {}) =>
    fetchImpl(`${EVENTS_URL}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { ...headers, ...extraHeaders } });
  const getJson = async (url: string) => {
    const response = await fetchImpl(url, { headers }).catch(() => null);
    const body = response?.ok ? await response.json().catch(() => null) : null;
    return { response, body };
  };

  let targetId = googleEventId;
  let response = await deleteById(targetId);

  if (response.status === 412) {
    const instance = /^(.+)_(\d{8}(?:T\d{6}Z)?)$/.exec(googleEventId);
    if (instance) {
      // One week of a repeating event: ask Google which instance starts then.
      const { response: lookup, body } = await getJson(
        `${EVENTS_URL}/${encodeURIComponent(instance[1])}/instances?originalStart=${encodeURIComponent(toOriginalStart(instance[2]))}&showDeleted=true`
      );
      const current = body?.items?.[0];
      if (lookup && (isGone(lookup.status) || (lookup.ok && (!current || current.status === 'cancelled')))) return;
      if (current?.id) {
        targetId = String(current.id);
        response = await deleteById(targetId);
      }
    }
    if (response.status === 412) {
      // Delete exactly the version Google holds now.
      const { response: current, body } = await getJson(`${EVENTS_URL}/${encodeURIComponent(targetId)}`);
      if (current && (isGone(current.status) || body?.status === 'cancelled')) return;
      response = await deleteById(targetId, { 'If-Match': body?.etag ? String(body.etag) : '*' });
    }
    if (response.status === 412) {
      const cancelled = await fetchImpl(`${EVENTS_URL}/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      }).catch(() => null);
      if (cancelled && (cancelled.ok || isGone(cancelled.status))) return;
    }
  }

  if (response.ok || isGone(response.status)) return;

  const reason = await readGoogleErrorReason(response);
  console.error('Google Calendar delete failed:', response.status, reason);
  const message = response.status === 401 ? 'GOOGLE_AUTH_REQUIRED' : response.status === 403 ? 'GOOGLE_DELETE_FORBIDDEN' : 'GOOGLE_DELETE_FAILED';
  throw Object.assign(new Error(message), { status: response.status, reason }) as GoogleDeleteError;
}
