import { presentGuidanceResult } from '../presenters/guidancePresenter';

describe('guidance presenter', () => {
  it('returns a todo guidance target for single goal open intent', () => {
    const result = presentGuidanceResult('goal_query', {
      openIntent: true,
      totalMatches: 1,
      items: [{ id: 'goal-1', text: 'Run a 5K', workspace: 'Goals' }],
    });

    expect(result.messages[0]?.card).toMatchObject({
      type: 'navigationShortcut',
      label: 'Run a 5K',
      route: '/(tabs)/todo',
      params: {
        workspaceKey: 'Goals',
        openTodoId: 'goal-1',
        openTodoNonce: expect.any(String),
      },
      target: {
        type: 'todo',
        todoId: 'goal-1',
        workspaceKey: 'Goals',
      },
    });
  });

  it('does not first-match guess when open intent goal results were truncated', () => {
    const result = presentGuidanceResult('goal_query', {
      openIntent: true,
      totalMatches: 2,
      items: [{ id: 'goal-1', text: 'Run a 5K', workspace: 'Goals' }],
    });

    expect(result.messages[0]?.card).toMatchObject({
      type: 'todoQuery',
      items: [expect.objectContaining({ id: 'goal-1' })],
    });
  });
});
