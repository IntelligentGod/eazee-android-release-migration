import AsyncStorage from '@react-native-async-storage/async-storage';

const mockSetActiveDatabaseName = jest.fn((dbName: string) => dbName);
const mockFetchCountByTable = new Map<string, number>();
const createdRows: Record<string, any[]> = {
  todos: [],
  events: [],
  chat_sessions: [],
  chat_messages: [],
};

jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      storage.delete(key);
    }),
    clear: jest.fn(async () => {
      storage.clear();
    }),
    __storage: storage,
  };
});

jest.mock('@/database/database', () => ({
  DEFAULT_DATABASE_NAME: 'NotesApp',
  setActiveDatabaseName: mockSetActiveDatabaseName,
  database: {
    write: jest.fn(async (work: () => Promise<void>) => work()),
    collections: {
      get: jest.fn((table: string) => ({
        query: jest.fn(() => ({
          fetchCount: jest.fn(async () => mockFetchCountByTable.get(table) ?? createdRows[table]?.length ?? 0),
          fetch: jest.fn(async () => createdRows[table] || []),
        })),
        create: jest.fn(async (writer: (record: any) => void) => {
          const record = { id: `${table}-${createdRows[table].length + 1}`, _raw: {} };
          writer(record);
          createdRows[table].push(record);
          return record;
        }),
      })),
    },
  },
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & {
  __storage: Map<string, string>;
};
const { prepareAuthUserDatabase } = require('../demoAccount');

describe('demo account setup', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 5, 19, 12));
    mockSetActiveDatabaseName.mockClear();
    mockFetchCountByTable.clear();
    mockedAsyncStorage.__storage.clear();
    for (const rows of Object.values(createdRows)) {
      rows.splice(0);
    }
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the normal database and does not seed non-demo users', async () => {
    await expect(prepareAuthUserDatabase({ email: 'user@example.com' } as any)).resolves.toEqual({
      isDemoAccount: false,
    });

    expect(mockSetActiveDatabaseName).toHaveBeenCalledWith('NotesApp');
    expect(createdRows.todos).toHaveLength(0);
    expect(mockedAsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('seeds current-date local demo data once for the primary review account', async () => {
    await prepareAuthUserDatabase({ email: 'apple-review-1@eazee.app' } as any);

    expect(mockSetActiveDatabaseName).toHaveBeenCalledWith('EazeeAppleReviewPrimary');
    expect(createdRows.todos).toHaveLength(6);
    expect(createdRows.events).toHaveLength(3);
    expect(createdRows.chat_sessions).toHaveLength(1);
    expect(createdRows.chat_messages).toHaveLength(4);
    expect(createdRows.chat_messages.map((message) => message.content)).toEqual([
      'What does my schedule look like tomorrow?',
      'Tomorrow you have Coffee with Maya from 10:30 to 11:00 AM, plus Book dentist appointment on your task list.',
      'What tasks should I focus on today?',
      'Start with Review launch checklist this morning, then use the afternoon to Prepare weekly priorities before your Focus block ends.',
    ]);
    expect(createdRows.todos[0].text).toBe('Review launch checklist');
    expect(createdRows.todos[0].dueDate).toEqual(new Date(2026, 5, 19, 9, 30));
    expect(createdRows.events[2].startDate).toEqual(new Date(2026, 5, 20, 10, 30));
    expect(createdRows.todos.find((todo) => todo.workspace === 'Goals')?.dueDate).toEqual(new Date(2026, 5, 30));
    expect([...mockedAsyncStorage.__storage.keys()]).toEqual(['appleReviewDemoSeed:v1:primary']);

    jest.setSystemTime(new Date(2026, 5, 21, 12));
    await prepareAuthUserDatabase({ email: 'apple-review-1@eazee.app' } as any);

    expect(createdRows.todos).toHaveLength(6);
    expect(createdRows.events).toHaveLength(3);
    expect(createdRows.todos[0].dueDate).toEqual(new Date(2026, 5, 19, 9, 30));
  });

  it('marks an existing demo database seeded without recreating deleted content', async () => {
    mockFetchCountByTable.set('todos', 1);

    await prepareAuthUserDatabase({ email: 'apple-review-2@eazee.app' } as any);

    expect(mockSetActiveDatabaseName).toHaveBeenCalledWith('EazeeAppleReviewBackup');
    expect(createdRows.todos).toHaveLength(0);
    expect(mockedAsyncStorage.__storage.has('appleReviewDemoSeed:v1:backup')).toBe(true);
  });
});
