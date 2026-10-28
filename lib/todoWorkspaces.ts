export const TODO_WORKSPACE_ORDER = ['Personal', 'Goals', 'Wishlist'] as const;

export type TodoWorkspaceKey = (typeof TODO_WORKSPACE_ORDER)[number];

const TODO_WORKSPACE_ALIASES: Record<string, TodoWorkspaceKey> = {
  goals: 'Goals',
  goal: 'Goals',
  work: 'Goals',
  personal: 'Personal',
  wishlist: 'Wishlist',
  'wish-list': 'Wishlist',
  'wish list': 'Wishlist',
};

export const normalizeTodoWorkspaceKey = (value?: string | null) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  const normalized = trimmed.toLowerCase().replace(/\s+workspace$/i, '').trim();
  return TODO_WORKSPACE_ALIASES[normalized] || trimmed;
};

export const isSupportedTodoWorkspaceKey = (value?: string | null): value is TodoWorkspaceKey =>
  TODO_WORKSPACE_ORDER.includes(value as TodoWorkspaceKey);

export const coerceTodoWorkspaceKey = (value?: string | null): TodoWorkspaceKey => {
  const key = normalizeTodoWorkspaceKey(value);
  return isSupportedTodoWorkspaceKey(key) ? key : 'Personal';
};
