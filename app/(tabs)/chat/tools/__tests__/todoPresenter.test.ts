import { presentTodoResult } from '../presenters/todoPresenter';

describe('todo presenter', () => {
  it('uses item wording when chat adds one wishlist item', () => {
    const result = presentTodoResult('todo_create_many', {
      created: 1,
      createdItems: [{ id: 'todo-1', text: 'Headphones', workspace: 'Wishlist' }],
    });

    expect(result.messages[0]?.content).toBe('Your item has been added.');
  });

  it('keeps task wording for normal todos', () => {
    const result = presentTodoResult('todo_create_many', {
      created: 1,
      createdItems: [{ id: 'todo-1', text: 'Call Sam', workspace: 'Personal' }],
    });

    expect(result.messages[0]?.content).toBe('Your task has been added.');
  });

  it('keeps recurrence on todo cards', () => {
    const result = presentTodoResult('todo_query', {
      items: [{ id: 'todo-1', text: 'Stretch', workspace: 'Personal', recurrence: 'Recurring' }],
    });

    expect(result.messages[0]?.card?.items[0]).toMatchObject({
      id: 'todo-1',
      recurrence: 'Recurring',
    });
  });

  it('returns a guidance target for single todo open intent', () => {
    const result = presentTodoResult('todo_query', {
      openIntent: true,
      totalMatches: 1,
      items: [{ id: 'todo-1', text: 'Stretch', workspace: 'Personal' }],
    });

    expect(result.messages[0]?.card).toMatchObject({
      type: 'navigationShortcut',
      label: 'Stretch',
      route: '/(tabs)/todo',
      params: {
        workspaceKey: 'Personal',
        openTodoId: 'todo-1',
        openTodoNonce: expect.any(String),
      },
      target: {
        type: 'todo',
        todoId: 'todo-1',
        workspaceKey: 'Personal',
      },
    });
  });

  it('does not first-match guess when open intent has multiple todos', () => {
    const result = presentTodoResult('todo_query', {
      openIntent: true,
      items: [
        { id: 'todo-1', text: 'Stretch', workspace: 'Personal' },
        { id: 'todo-2', text: 'Stretch again', workspace: 'Personal' },
      ],
    });

    expect(result.messages[0]?.card).toMatchObject({
      type: 'todoQuery',
      items: expect.arrayContaining([
        expect.objectContaining({ id: 'todo-1' }),
        expect.objectContaining({ id: 'todo-2' }),
      ]),
    });
  });

  it('does not first-match guess when open intent results were truncated', () => {
    const result = presentTodoResult('todo_query', {
      openIntent: true,
      totalMatches: 2,
      items: [
        { id: 'todo-1', text: 'Stretch', workspace: 'Personal' },
      ],
    });

    expect(result.messages[0]?.card).toMatchObject({
      type: 'todoQuery',
      items: [expect.objectContaining({ id: 'todo-1' })],
    });
  });
});
