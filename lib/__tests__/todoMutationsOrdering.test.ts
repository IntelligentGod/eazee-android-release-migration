let mockRows: any[] = [];
let nextCreatedId = 1;

const makeTodoRow = (overrides: any = {}) => {
  const row = {
    id: overrides.id || `row-${nextCreatedId++}`,
    text: 'Task',
    completed: false,
    details: '',
    dueDate: new Date(),
    hasDueTime: false,
    starred: false,
    workspace: 'Personal',
    amazonUrl: undefined,
    isAmazonUrlLoaded: false,
    amazonUrlLoadAttempts: 0,
    createdAt: new Date('2026-05-05T09:00:00'),
    updatedAt: new Date('2026-05-05T09:00:00'),
    sortScope: null,
    sortOrder: null,
    emailId: undefined,
    type: 'basic',
    startedAt: undefined,
    progress: 0,
    reminderEnabled: false,
    reminderMode: 'none',
    reminderMinutesBefore: null,
    notificationId: null,
    goalTimeframe: null,
    taskKind: null,
    guidancePath: null,
    recurrenceSeriesId: null,
    recurrenceOccurrenceDate: null,
    recurrenceOverride: false,
    ...overrides,
    prepareUpdate(update: (record: any) => void) {
      update(row);
      return row;
    },
    prepareDestroyPermanently() {
      mockRows = mockRows.filter((item) => item.id !== row.id);
      return row;
    },
  };
  return row;
};

const mockCollection = {
  query: jest.fn((...conditions: any[]) => ({
    fetch: jest.fn(async () => {
      const ids = conditions[0]?.value?.ids;
      return Array.isArray(ids) ? mockRows.filter((row) => ids.includes(row.id)) : mockRows;
    }),
  })),
  find: jest.fn(async (id: string) => {
    const row = mockRows.find((item) => item.id === id);
    if (!row) throw new Error(`Missing row ${id}`);
    return row;
  }),
  prepareCreate: jest.fn((write: (record: any) => void) => {
    const row = makeTodoRow({ id: `created-${nextCreatedId++}` });
    write(row);
    mockRows.push(row);
    return row;
  }),
  prepareCreateFromDirtyRaw: jest.fn((raw: any) => {
    const row = makeTodoRow({
      id: raw.id,
      text: raw.text,
      completed: raw.completed,
      dueDate: raw.due_date ? new Date(raw.due_date) : undefined,
      hasDueTime: raw.has_due_time,
      workspace: raw.workspace,
      sortScope: raw.sort_scope,
      sortOrder: raw.sort_order,
      recurrenceSeriesId: raw.recurrence_series_id,
      recurrenceOccurrenceDate: raw.recurrence_occurrence_date ? new Date(raw.recurrence_occurrence_date) : undefined,
      recurrenceOverride: !!raw.recurrence_override,
    });
    mockRows.push(row);
    return row;
  }),
};

jest.mock('@nozbe/watermelondb', () => ({
  Q: {
    where: (field: string, value: any) => ({ field, value }),
    oneOf: (ids: string[]) => ({ ids }),
  },
}));

jest.mock('@/database/database', () => ({
  database: {
    collections: {
      get: jest.fn(() => mockCollection),
    },
    write: jest.fn(async (work: () => Promise<void> | void) => work()),
    batch: jest.fn(async () => undefined),
  },
}));

jest.mock('@/database/models/TodoModel', () => class TodoModel {});

jest.mock('@/lib/todoNotifications', () => ({
  cancelTodoReminder: jest.fn(async () => ({ status: 'skipped' })),
  rescheduleTodoReminder: jest.fn(async () => ({ status: 'scheduled' })),
  scheduleTodoReminder: jest.fn(async () => ({ status: 'scheduled' })),
}));

jest.mock('@/lib/taskGuidance', () => ({
  deleteTaskGuidesForTodos: jest.fn(async () => undefined),
}));

jest.mock('@/lib/recipeGuidance', () => ({
  deleteRecipeGuidesForTodos: jest.fn(async () => undefined),
}));

jest.mock('@/lib/skillGuidance', () => ({
  deleteSkillGuidesForTodos: jest.fn(async () => undefined),
}));

const {
  createTodos,
  normalizeTodoOrdering,
  reorderTodosInSection,
  restoreTodo,
  updateTodos,
} = require('../todoMutations');

describe('todoMutations ordering', () => {
  beforeEach(() => {
    mockRows = [];
    nextCreatedId = 1;
    jest.clearAllMocks();
  });

  it('appends batched creates to the bottom of their destination scope', async () => {
    mockRows = [
      makeTodoRow({ id: 'existing', workspace: 'Wishlist', sortScope: 'Wishlist:wishlist', sortOrder: 3000 }),
    ];

    await createTodos([
      { text: 'First', workspace: 'Wishlist', dueDate: new Date(), isAmazonUrlLoaded: false, amazonUrlLoadAttempts: 0 },
      { text: 'Second', workspace: 'Wishlist', dueDate: new Date(), isAmazonUrlLoaded: false, amazonUrlLoadAttempts: 0 },
    ]);

    expect(mockRows.find((row) => row.text === 'First')).toMatchObject({
      sortScope: 'Wishlist:wishlist',
      sortOrder: 4000,
    });
    expect(mockRows.find((row) => row.text === 'Second')).toMatchObject({
      sortScope: 'Wishlist:wishlist',
      sortOrder: 5000,
    });
  });

  it('normalizes legacy rows before appending creates', async () => {
    mockRows = [
      makeTodoRow({ id: 'legacy', workspace: 'Wishlist', sortScope: null, sortOrder: null }),
    ];

    await createTodos([
      { text: 'New', workspace: 'Wishlist', dueDate: new Date(), isAmazonUrlLoaded: false, amazonUrlLoadAttempts: 0 },
    ]);

    expect(mockRows.find((row) => row.id === 'legacy')).toMatchObject({
      sortScope: 'Wishlist:wishlist',
      sortOrder: 1000,
    });
    expect(mockRows.find((row) => row.text === 'New')).toMatchObject({
      sortScope: 'Wishlist:wishlist',
      sortOrder: 2000,
    });
  });

  it('appends updates that move a todo into another section', async () => {
    mockRows = [
      makeTodoRow({ id: 'today', sortScope: 'Personal:today', sortOrder: 2000 }),
      makeTodoRow({
        id: 'move',
        dueDate: new Date('2026-05-07T00:00:00'),
        sortScope: 'Personal:upcoming',
        sortOrder: 1000,
      }),
    ];

    await updateTodos([{ id: 'move', input: { dueDate: new Date(), hasDueTime: false } }]);

    expect(mockRows.find((row) => row.id === 'move')).toMatchObject({
      sortScope: 'Personal:today',
      sortOrder: 3000,
    });
  });

  it('normalizes legacy rows before appending moved todos', async () => {
    mockRows = [
      makeTodoRow({ id: 'legacy', workspace: 'Wishlist', sortScope: null, sortOrder: null }),
      makeTodoRow({
        id: 'move',
        workspace: 'Personal',
        sortScope: 'Personal:today',
        sortOrder: 1000,
      }),
    ];

    await updateTodos([{ id: 'move', input: { workspace: 'Wishlist' } }]);

    expect(mockRows.find((row) => row.id === 'legacy')).toMatchObject({
      sortScope: 'Wishlist:wishlist',
      sortOrder: 1000,
    });
    expect(mockRows.find((row) => row.id === 'move')).toMatchObject({
      sortScope: 'Wishlist:wishlist',
      sortOrder: 2000,
    });
  });

  it('rewrites relative order for a single section', async () => {
    mockRows = [
      makeTodoRow({ id: 'a', workspace: 'Wishlist', sortScope: 'Wishlist:wishlist', sortOrder: 1000 }),
      makeTodoRow({ id: 'b', workspace: 'Wishlist', sortScope: 'Wishlist:wishlist', sortOrder: 2000 }),
      makeTodoRow({ id: 'c', workspace: 'Wishlist', sortScope: 'Wishlist:wishlist', sortOrder: 3000 }),
    ];

    await expect(reorderTodosInSection(['c', 'a', 'b'], 'Wishlist:wishlist')).resolves.toBe(true);

    expect(mockRows.map((row) => [row.id, row.sortOrder])).toEqual([
      ['a', 2000],
      ['b', 3000],
      ['c', 1000],
    ]);
  });

  it('aborts reorder when dragged ids no longer belong to the requested scope', async () => {
    mockRows = [
      makeTodoRow({ id: 'a', workspace: 'Wishlist', sortScope: 'Wishlist:wishlist', sortOrder: 1000 }),
      makeTodoRow({ id: 'b', workspace: 'Personal', sortScope: 'Personal:today', sortOrder: 2000 }),
    ];

    await expect(reorderTodosInSection(['a', 'b'], 'Wishlist:wishlist')).resolves.toBe(false);

    expect(mockRows.map((row) => [row.id, row.sortScope, row.sortOrder])).toEqual([
      ['a', 'Wishlist:wishlist', 1000],
      ['b', 'Personal:today', 2000],
    ]);
  });

  it('normalizes rows with missing or stale section order', async () => {
    mockRows = [
      makeTodoRow({ id: 'ordered', sortScope: 'Personal:today', sortOrder: 3000 }),
      makeTodoRow({ id: 'missing', sortScope: null, sortOrder: null, createdAt: new Date('2026-05-05T08:00:00') }),
      makeTodoRow({
        id: 'stale',
        dueDate: new Date(),
        sortScope: 'Personal:upcoming',
        sortOrder: 9000,
        createdAt: new Date('2026-05-05T09:00:00'),
      }),
    ];

    await expect(normalizeTodoOrdering()).resolves.toBe(true);

    expect(mockRows.find((row) => row.id === 'missing')).toMatchObject({
      sortScope: 'Personal:today',
      sortOrder: 4000,
    });
    expect(mockRows.find((row) => row.id === 'stale')).toMatchObject({
      sortScope: 'Personal:today',
      sortOrder: 5000,
    });
  });

  it('preserves upcoming relative order when rows migrate into today', async () => {
    const today = new Date();
    mockRows = [
      makeTodoRow({ id: 'today', sortScope: 'Personal:today', sortOrder: 3000 }),
      makeTodoRow({
        id: 'legacy-today',
        dueDate: today,
        sortScope: null,
        sortOrder: null,
        createdAt: new Date('2026-05-05T08:30:00'),
      }),
      makeTodoRow({
        id: 'third-upcoming',
        dueDate: today,
        sortScope: 'Personal:upcoming',
        sortOrder: 3000,
        createdAt: new Date('2026-05-05T07:00:00'),
      }),
      makeTodoRow({
        id: 'first-upcoming',
        dueDate: today,
        sortScope: 'Personal:upcoming',
        sortOrder: 1000,
        createdAt: new Date('2026-05-05T09:00:00'),
      }),
      makeTodoRow({
        id: 'second-upcoming',
        dueDate: today,
        sortScope: 'Personal:upcoming',
        sortOrder: 2000,
        createdAt: new Date('2026-05-05T08:00:00'),
      }),
    ];

    await expect(normalizeTodoOrdering()).resolves.toBe(true);

    expect(mockRows.find((row) => row.id === 'legacy-today')).toMatchObject({
      sortScope: 'Personal:today',
      sortOrder: 4000,
    });
    expect(mockRows.find((row) => row.id === 'first-upcoming')).toMatchObject({
      sortScope: 'Personal:today',
      sortOrder: 5000,
    });
    expect(mockRows.find((row) => row.id === 'second-upcoming')).toMatchObject({
      sortScope: 'Personal:today',
      sortOrder: 6000,
    });
    expect(mockRows.find((row) => row.id === 'third-upcoming')).toMatchObject({
      sortScope: 'Personal:today',
      sortOrder: 7000,
    });
  });

  it('restores deleted todos at the bottom', async () => {
    mockRows = [
      makeTodoRow({ id: 'existing', workspace: 'Wishlist', sortScope: 'Wishlist:wishlist', sortOrder: 1000 }),
    ];

    await restoreTodo({
      id: 'restored',
      text: 'Restored',
      completed: false,
      dueDate: new Date(),
      hasDueTime: false,
      starred: false,
      workspace: 'Wishlist',
      isAmazonUrlLoaded: false,
      amazonUrlLoadAttempts: 0,
      type: 'basic',
      reminderEnabled: false,
      reminderMode: 'none',
      reminderMinutesBefore: null,
      notificationId: null,
      goalTimeframe: null,
      taskKind: null,
      guidancePath: null,
    });

    expect(mockRows.find((row) => row.id === 'restored')).toMatchObject({
      sortScope: 'Wishlist:wishlist',
      sortOrder: 2000,
    });
  });

  it('normalizes legacy rows before restoring deleted todos', async () => {
    mockRows = [
      makeTodoRow({ id: 'legacy', workspace: 'Wishlist', sortScope: null, sortOrder: null }),
    ];

    await restoreTodo({
      id: 'restored',
      text: 'Restored',
      completed: false,
      dueDate: new Date(),
      hasDueTime: false,
      starred: false,
      workspace: 'Wishlist',
      isAmazonUrlLoaded: false,
      amazonUrlLoadAttempts: 0,
      type: 'basic',
      reminderEnabled: false,
      reminderMode: 'none',
      reminderMinutesBefore: null,
      notificationId: null,
      goalTimeframe: null,
      taskKind: null,
      guidancePath: null,
    });

    expect(mockRows.find((row) => row.id === 'legacy')).toMatchObject({
      sortScope: 'Wishlist:wishlist',
      sortOrder: 1000,
    });
    expect(mockRows.find((row) => row.id === 'restored')).toMatchObject({
      sortScope: 'Wishlist:wishlist',
      sortOrder: 2000,
    });
  });
});
