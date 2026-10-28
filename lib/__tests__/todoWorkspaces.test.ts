import {
  TODO_WORKSPACE_ORDER,
  coerceTodoWorkspaceKey,
  isSupportedTodoWorkspaceKey,
  normalizeTodoWorkspaceKey,
} from '../todoWorkspaces';

describe('todoWorkspaces', () => {
  it('orders built-in workspaces for the Todo tab', () => {
    expect(TODO_WORKSPACE_ORDER).toEqual(['Personal', 'Goals', 'Wishlist']);
  });

  it('normalizes supported workspace aliases', () => {
    expect(normalizeTodoWorkspaceKey('goals')).toBe('Goals');
    expect(normalizeTodoWorkspaceKey('work')).toBe('Goals');
    expect(normalizeTodoWorkspaceKey('personal workspace')).toBe('Personal');
    expect(normalizeTodoWorkspaceKey('wish list')).toBe('Wishlist');
  });

  it('identifies only the current built-in workspaces as supported', () => {
    expect(isSupportedTodoWorkspaceKey('Goals')).toBe(true);
    expect(isSupportedTodoWorkspaceKey('Personal')).toBe(true);
    expect(isSupportedTodoWorkspaceKey('Wishlist')).toBe(true);
    expect(isSupportedTodoWorkspaceKey('School')).toBe(false);
  });

  it('coerces stale workspace names to Personal', () => {
    expect(coerceTodoWorkspaceKey('School')).toBe('Personal');
    expect(coerceTodoWorkspaceKey('')).toBe('Personal');
  });
});
