import { collectGoalGuidanceManagedTodoIds } from '@/lib/goalGuidance';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('@/firebaseConfig', () => ({
  auth: {
    currentUser: null,
  },
}));

jest.mock('@/database/database', () => ({
  database: {
    collections: {
      get: jest.fn(),
    },
    write: jest.fn(),
    batch: jest.fn(),
  },
}));

describe('collectGoalGuidanceManagedTodoIds', () => {
  it('collects direct and nested Personal todos under root goals', () => {
    const managedTodoIds = collectGoalGuidanceManagedTodoIds([
      {
        goalId: 'root-goal',
        activeTodoId: 'first-action',
        activeStepIndex: 0,
        activeActionsJson: JSON.stringify({
          activeActions: [{ stepIndex: 0, todoId: 'first-action', dueDate: '2026-04-21' }],
          todoIds: ['first-action'],
        }),
      },
      {
        goalId: 'first-action',
        activeTodoId: 'nested-action',
        activeStepIndex: 0,
        activeActionsJson: JSON.stringify({
          activeActions: [{ stepIndex: 0, todoId: 'nested-action', dueDate: '2026-04-22' }],
          todoIds: ['nested-action'],
        }),
      },
      {
        goalId: 'nested-action',
        activeTodoId: 'deep-action',
        activeStepIndex: 0,
        activeActionsJson: JSON.stringify({
          activeActions: [{ stepIndex: 0, todoId: 'deep-action', dueDate: '2026-04-23' }],
          todoIds: ['deep-action'],
        }),
      },
      {
        goalId: 'other-root',
        activeTodoId: 'other-action',
        activeStepIndex: 0,
        activeActionsJson: JSON.stringify({
          activeActions: [{ stepIndex: 0, todoId: 'other-action', dueDate: '2026-04-24' }],
          todoIds: ['other-action'],
        }),
      },
    ], ['root-goal']);

    expect(Array.from(managedTodoIds)).toEqual(['first-action', 'nested-action', 'deep-action']);
  });
});
