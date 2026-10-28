import { dedupeToolCallsByBatchKey, getToolCallBatchKey, getToolCallExecutionKey } from '../toolCallKeys';

describe('tool call keys', () => {
  it('dedupes equivalent request-scoped calls even when call ids differ', () => {
    const first = {
      callId: 'call-1',
      clientRequestId: 'req-1',
      name: 'app_open_screen',
      arguments: { destination: 'todo_wishlist' },
    };
    const second = {
      callId: 'call-2',
      clientRequestId: 'req-1',
      name: 'app_open_screen',
      arguments: { destination: 'todo_wishlist' },
    };

    expect(getToolCallBatchKey(first)).toBe(getToolCallBatchKey(second));
    expect(getToolCallExecutionKey(first)).toBe(getToolCallExecutionKey(second));
    expect(dedupeToolCallsByBatchKey([first, second])).toHaveLength(1);
  });

  it('keeps different destinations distinct within the same request', () => {
    const first = {
      callId: 'call-1',
      clientRequestId: 'req-1',
      name: 'app_open_screen',
      arguments: { destination: 'todo_wishlist' },
    };
    const second = {
      callId: 'call-2',
      clientRequestId: 'req-1',
      name: 'app_open_screen',
      arguments: { destination: 'calendar' },
    };

    expect(getToolCallBatchKey(first)).not.toBe(getToolCallBatchKey(second));
    expect(dedupeToolCallsByBatchKey([first, second])).toHaveLength(2);
  });

  it('falls back to call id for execution tracking when no request id exists', () => {
    const first = {
      callId: 'call-1',
      name: 'todo_query',
      arguments: { q: 'wishlist' },
    };
    const second = {
      callId: 'call-2',
      name: 'todo_query',
      arguments: { q: 'wishlist' },
    };

    expect(getToolCallBatchKey(first)).toBe(getToolCallBatchKey(second));
    expect(getToolCallExecutionKey(first)).not.toBe(getToolCallExecutionKey(second));
  });
});
