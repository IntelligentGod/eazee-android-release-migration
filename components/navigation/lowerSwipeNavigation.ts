export const LOWER_SWIPE_TAB_ORDER = ['chat', 'home', 'todo', 'calendar'] as const;
export const LOWER_SWIPE_ENABLED = true;

export type LowerSwipeTab = (typeof LOWER_SWIPE_TAB_ORDER)[number];
export type LowerSwipeDirection = 'left' | 'right';

export type LowerSwipeSequenceItem =
  | { tab: Exclude<LowerSwipeTab, 'todo'> }
  | { tab: 'todo'; workspaceKey?: string };

export type ResolveLowerSwipeTargetParams = {
  currentTab: LowerSwipeTab;
  currentWorkspaceKey?: string | null;
  direction: LowerSwipeDirection;
  workspaceKeys: string[];
};

let pendingTodoSwipeWorkspaceKey: string | null = null;
let sharedTodoWorkspaceKeys: string[] = [];
let sharedCurrentTodoWorkspaceKey: string | null = null;
const todoWorkspaceListeners = new Set<(workspaceKey: string) => void>();

export function buildLowerSwipeSequence(workspaceKeys: string[]): LowerSwipeSequenceItem[] {
  const todoItems: LowerSwipeSequenceItem[] = workspaceKeys.length
    ? workspaceKeys.map((workspaceKey) => ({ tab: 'todo' as const, workspaceKey }))
    : [{ tab: 'todo' as const, workspaceKey: undefined }];

  return LOWER_SWIPE_TAB_ORDER.flatMap((tab): LowerSwipeSequenceItem[] =>
    tab === 'todo' ? todoItems : [{ tab }]
  );
}

export function resolveLowerSwipeTarget({
  currentTab,
  currentWorkspaceKey,
  direction,
  workspaceKeys,
}: ResolveLowerSwipeTargetParams): LowerSwipeSequenceItem | null {
  const sequence = buildLowerSwipeSequence(workspaceKeys);
  const currentIndex = sequence.findIndex((item) => {
    if (item.tab !== currentTab) {
      return false;
    }

    if (item.tab !== 'todo') {
      return true;
    }

    if (!workspaceKeys.length) {
      return true;
    }

    return item.workspaceKey === currentWorkspaceKey;
  });

  if (currentIndex === -1) {
    return null;
  }

  const targetIndex = direction === 'left' ? currentIndex + 1 : currentIndex - 1;
  if (targetIndex < 0 || targetIndex >= sequence.length) {
    return null;
  }

  return sequence[targetIndex];
}

export function setPendingTodoSwipeWorkspaceKey(workspaceKey: string | null) {
  pendingTodoSwipeWorkspaceKey = workspaceKey;
}

export function peekPendingTodoSwipeWorkspaceKey() {
  return pendingTodoSwipeWorkspaceKey;
}

export function clearPendingTodoSwipeWorkspaceKey() {
  pendingTodoSwipeWorkspaceKey = null;
}

export function setSharedTodoWorkspaceState(params: {
  workspaceKeys: string[];
  currentWorkspaceKey?: string | null;
}) {
  sharedTodoWorkspaceKeys = params.workspaceKeys;
  sharedCurrentTodoWorkspaceKey = params.currentWorkspaceKey ?? null;
}

export function getSharedTodoWorkspaceState() {
  return {
    workspaceKeys: sharedTodoWorkspaceKeys,
    currentWorkspaceKey: sharedCurrentTodoWorkspaceKey,
  };
}

export function requestTodoWorkspaceSwipe(workspaceKey: string) {
  pendingTodoSwipeWorkspaceKey = workspaceKey;
  todoWorkspaceListeners.forEach((listener) => listener(workspaceKey));
}

export function subscribeTodoWorkspaceSwipe(listener: (workspaceKey: string) => void) {
  todoWorkspaceListeners.add(listener);

  return () => {
    todoWorkspaceListeners.delete(listener);
  };
}

export function resetLowerSwipeState() {
  pendingTodoSwipeWorkspaceKey = null;
  sharedTodoWorkspaceKeys = [];
  sharedCurrentTodoWorkspaceKey = null;
  todoWorkspaceListeners.clear();
}
