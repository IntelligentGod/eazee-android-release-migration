import {
  compareTodosForSectionOrder,
  getMaxTodoSortOrderForScope,
  getNextTodoSortOrder,
  getNormalizedTodoSortOrder,
  getTodoOrderingSection,
  getTodoSortScope,
  isTodoSectionReorderable,
  sortTodosForSectionOrder,
} from '../todoOrdering';

describe('todoOrdering', () => {
  const now = new Date('2026-05-05T10:00:00');
  const weekStartsOn = 1 as const;

  it('calculates section-local scopes for supported workspaces', () => {
    expect(getTodoSortScope({
      completed: false,
      workspace: 'Personal',
      dueDate: new Date('2026-05-05T00:00:00'),
    }, weekStartsOn, now)).toBe('Personal:today');

    expect(getTodoSortScope({
      completed: false,
      workspace: 'Personal',
      dueDate: new Date('2026-05-08T00:00:00'),
    }, weekStartsOn, now)).toBe('Personal:upcoming');

    expect(getTodoSortScope({
      completed: false,
      workspace: 'Wishlist',
      dueDate: new Date('2026-05-05T00:00:00'),
    }, weekStartsOn, now)).toBe('Wishlist:wishlist');

    expect(getTodoSortScope({
      completed: true,
      workspace: 'Goals',
      goalTimeframe: 'thisMonth',
    }, weekStartsOn, now)).toBe('Goals:completed');
  });

  it('keeps overdue Personal tasks in Today while custom workspaces use Past', () => {
    const dueDate = new Date('2026-05-02T00:00:00');

    expect(getTodoOrderingSection({
      completed: false,
      workspace: 'Personal',
      dueDate,
    }, weekStartsOn, now)).toBe('today');

    expect(getTodoOrderingSection({
      completed: false,
      workspace: 'Errands',
      dueDate,
    }, weekStartsOn, now)).toBe('past');
  });

  it('allows drag only in active built-in sections', () => {
    expect(isTodoSectionReorderable('Personal', 'today')).toBe(true);
    expect(isTodoSectionReorderable('Personal', 'upcoming')).toBe(true);
    expect(isTodoSectionReorderable('Goals', 'thisYear')).toBe(true);
    expect(isTodoSectionReorderable('Wishlist', 'wishlist')).toBe(true);

    expect(isTodoSectionReorderable('Personal', 'completed')).toBe(false);
    expect(isTodoSectionReorderable('Goals', 'completed')).toBe(false);
    expect(isTodoSectionReorderable('Errands', 'upcoming')).toBe(false);
  });

  it('sorts by persisted order and falls back to creation time for unnormalized rows', () => {
    const scope = 'Personal:today';
    const ordered = {
      id: 'ordered',
      sortScope: scope,
      sortOrder: 2000,
      createdAt: new Date('2026-05-05T12:00:00'),
    };
    const missingEarly = {
      id: 'missing-early',
      sortScope: null,
      sortOrder: null,
      createdAt: new Date('2026-05-05T08:00:00'),
    };
    const missingLate = {
      id: 'missing-late',
      sortScope: null,
      sortOrder: null,
      createdAt: new Date('2026-05-05T09:00:00'),
    };

    expect([missingLate, ordered, missingEarly].sort((left, right) =>
      compareTodosForSectionOrder(left, right, scope)
    ).map((todo) => todo.id)).toEqual(['ordered', 'missing-early', 'missing-late']);
  });

  it('lets a section-local drag order override stale persisted order', () => {
    const scope = 'Personal:upcoming';
    const first = {
      id: 'first',
      sortScope: scope,
      sortOrder: 1000,
      createdAt: new Date('2026-05-05T08:00:00'),
    };
    const second = {
      id: 'second',
      sortScope: scope,
      sortOrder: 2000,
      createdAt: new Date('2026-05-05T09:00:00'),
    };
    const newItem = {
      id: 'new',
      sortScope: null,
      sortOrder: null,
      createdAt: new Date('2026-05-05T10:00:00'),
    };

    expect(sortTodosForSectionOrder([first, second, newItem], scope, ['second', 'first'])
      .map((todo) => todo.id)).toEqual(['second', 'first', 'new']);
  });

  it('allocates bottom order values with gaps', () => {
    const scope = 'Wishlist:wishlist';
    const rows = [
      { sortScope: scope, sortOrder: 1000 },
      { sortScope: scope, sortOrder: 3000 },
      { sortScope: 'Personal:today', sortOrder: 5000 },
    ];

    expect(getMaxTodoSortOrderForScope(rows, scope)).toBe(3000);
    expect(getNextTodoSortOrder(rows, scope)).toBe(4000);
    expect(getNormalizedTodoSortOrder(2)).toBe(3000);
  });
});
