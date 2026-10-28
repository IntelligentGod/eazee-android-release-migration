const mockHandler = jest.fn();
let mockGranted = 0;
let mockAllowance: { used: number; limit: number | null; day: string } | null = null;
const mockReserve = jest.fn(async (count: number) => {
  const limit = mockAllowance?.limit ?? null;
  const used = mockAllowance?.used ?? 0;
  const granted = limit === null ? count : Math.max(0, Math.min(count, limit - used));
  mockGranted = granted;
  if (mockAllowance) mockAllowance = { ...mockAllowance, used: used + granted };
  return granted;
});
const mockRelease = jest.fn(async (count: number) => {
  if (mockAllowance) mockAllowance = { ...mockAllowance, used: Math.max(0, mockAllowance.used - count) };
});

jest.mock('..', () => ({ getToolHandler: () => mockHandler }));
jest.mock('@/lib/aiActions', () => ({
  AI_ACTIONS_LIMIT_ERROR: 'AI_ACTIONS_LIMIT_REACHED',
  AI_ACTIONS_LOW_THRESHOLD: 2,
  getAiActionsAllowance: () => mockAllowance,
  getRemainingAiActions: (allowance = mockAllowance) =>
    !allowance || allowance.limit === null ? null : Math.max(0, allowance.limit - allowance.used),
  reserveAiActions: (count: number) => mockReserve(count),
  releaseAiActions: (count: number) => mockRelease(count),
}));

import { executeToolCall } from '../engine';
import { countAiActionsDone, getAiActionCost } from '../aiActionMeter';

const items = (count: number) => Array.from({ length: count }, (_, index) => ({ text: `Task ${index + 1}` }));
const run = (name: string, args: any) => executeToolCall({ name, arguments: args }, { serverUrl: '' });
const cardTypes = (result: any) => result.messages.map((message: any) => message.card?.type).filter(Boolean);

describe('AI action costs', () => {
  it('counts one action per item, and nothing for reading or planning', () => {
    expect(getAiActionCost('todo_create_many', { items: items(5) })?.count).toBe(5);
    expect(getAiActionCost('calendar_create_many', { events: items(25) })?.count).toBe(20);
    expect(getAiActionCost('calendar_delete', { id: 'x' })?.count).toBe(1);
    expect(getAiActionCost('todo_delete_by_day', { date: '2026-10-20' })).toMatchObject({ count: 1, countAfter: true });
    for (const name of ['todo_query', 'calendar_search', 'plan_my_day', 'daily_overview', 'guidance_answer', 'app_open_screen']) {
      expect(getAiActionCost(name, {})).toBeNull();
    }
    expect(countAiActionsDone('todo_create_many', { created: 3 })).toBe(3);
    expect(countAiActionsDone('calendar_create_many', { items: [{}, {}], failed: ['x'] })).toBe(2);
  });
});

describe('executeToolCall with AI actions', () => {
  beforeEach(() => {
    mockHandler.mockReset();
    mockReserve.mockClear();
    mockRelease.mockClear();
    mockAllowance = { used: 0, limit: 8, day: 'today' };
  });

  it('does what fits, gives back failures, and shows the limit card', async () => {
    mockAllowance = { used: 5, limit: 8, day: 'today' };
    mockHandler.mockImplementation(async (args: any) => ({ created: args.items.length - 1, createdItems: [] }));
    const result = await run('todo_create_many', { items: items(5) });

    expect(mockHandler.mock.calls[0][0].items).toHaveLength(3);
    expect(mockRelease).toHaveBeenCalledWith(1);
    expect(mockAllowance?.used).toBe(7);
    expect(result.result.aiActionsLimit).toMatchObject({ notDone: 2 });
    expect(cardTypes(result)).toContain('aiActionsLimit');
  });

  it('refuses when none are left, without running the tool', async () => {
    mockAllowance = { used: 8, limit: 8, day: 'today' };
    const result = await run('calendar_create', { title: 'Gym' });
    expect(mockHandler).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toBe('AI_ACTIONS_LIMIT_REACHED');
    expect(cardTypes(result)).toEqual(['aiActionsLimit']);
  });

  it('shows the quiet notice when only two are left', async () => {
    mockAllowance = { used: 4, limit: 8, day: 'today' };
    mockHandler.mockResolvedValue({ updated: 2 });
    const result = await run('todo_edit_many', { items: items(2) });
    expect(cardTypes(result)).toEqual(['aiActionsNotice']);
  });

  it('counts a whole-day change once it is known, and never meters Pro', async () => {
    mockHandler.mockResolvedValue({ deleted: 4, deletedItems: [] });
    await run('todo_delete_by_day', { date: '2026-10-20' });
    expect(mockAllowance?.used).toBe(4);

    mockAllowance = { used: 0, limit: null, day: 'today' };
    mockHandler.mockResolvedValue({ created: 30 });
    const result = await run('todo_create_many', { items: items(30) });
    expect(mockHandler.mock.calls.at(-1)?.[0].items).toHaveLength(30);
    expect(cardTypes(result)).toEqual([]);
  });

  it('gives back everything when the tool fails', async () => {
    mockHandler.mockRejectedValue(new Error('CREATE_FAILED'));
    await run('calendar_create_many', { events: items(3) });
    expect(mockAllowance?.used).toBe(0);
    expect(mockGranted).toBe(3);
  });
});
