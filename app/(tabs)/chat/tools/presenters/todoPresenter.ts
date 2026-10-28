import type { AssistantMessage } from '../types';
import { appendCreatedTodoItems, removeCreatedTodoItems, removeLastQueryItems, setLastQueryItems, updateCreatedTodoItems } from '../memory';

const appendSkippedMutationMessage = (messages: AssistantMessage[], result: any) => {
  const skippedItems = Array.isArray(result?.skippedItems) ? result.skippedItems : [];
  if (!skippedItems.length) return;
  const names = skippedItems.slice(0, 5).map((item: any) => `“${String(item.text || 'item')}”`).join(', ');
  const suffix = skippedItems.length > 5 ? ` and ${skippedItems.length - 5} more` : '';
  messages.push({
    role: 'assistant',
    content: `Skipped items that chat cannot change or could not prepare: ${names}${suffix}. Open Todo for goals, plans, guide steps, or retry after classification is available.`,
  });
};

const getCreatedTodoIntro = (count: number, createdItems: any[]) => {
  const allWishlistItems = createdItems.length > 0 && createdItems.every((it: any) => it?.workspace === 'Wishlist');
  if (allWishlistItems) {
    return count === 1 ? 'Your item has been added.' : 'Your items have been added.';
  }
  return count === 1 ? 'Your task has been added.' : 'Your tasks have been added.';
};

export function presentTodoResult(name: string, result: any): { messages: AssistantMessage[] } {
  const messages: AssistantMessage[] = [];

  if (name === 'todo_query') {
    const items = Array.isArray(result?.items) ? result.items : [];
    setLastQueryItems(items);
    const itemsForCard = items.slice(0, 20).map((it: any) => ({
      id: String(it.id || ''),
      text: String(it.text || ''),
      dueDate: typeof it.dueDate === 'string' ? it.dueDate : null,
      hasDueTime: typeof it.hasDueTime === 'boolean' ? it.hasDueTime : undefined,
      completed: typeof it.completed === 'boolean' ? it.completed : undefined,
      workspace: typeof it.workspace === 'string' ? it.workspace : undefined,
      starred: typeof it.starred === 'boolean' ? it.starred : undefined,
      taskKind: typeof it.taskKind === 'string' ? it.taskKind : undefined,
      guidancePath: typeof it.guidancePath === 'string' ? it.guidancePath : undefined,
      recurrence: typeof it.recurrence === 'string' ? it.recurrence : undefined,
    }));
    const count = itemsForCard.length;
    const totalMatches = Number.isFinite(Number(result?.totalMatches))
      ? Number(result.totalMatches)
      : count;
    if (count > 0) {
      if (result?.openIntent === true && totalMatches === 1 && count === 1) {
        const item = itemsForCard[0];
        const workspaceKey = item.workspace || 'Personal';
        const label = item.text || (workspaceKey === 'Wishlist' ? 'Wishlist item' : workspaceKey === 'Goals' ? 'goal' : 'task');
        messages.push({
          role: 'assistant',
          content: `I found “${label}”.`,
          card: {
            type: 'navigationShortcut',
            label,
            route: '/(tabs)/todo',
            params: {
              workspaceKey,
              openTodoId: item.id,
              openTodoNonce: String(Date.now()),
            },
            target: {
              type: 'todo',
              todoId: item.id,
              workspaceKey,
            },
          },
        });
      } else {
        const intro = count === 1 ? 'I found 1 task.' : `I found ${count} tasks.`;
        messages.push({ role: 'assistant', content: intro, card: { type: 'todoQuery', items: itemsForCard } });
      }
    } else {
      messages.push({ role: 'assistant', content: "I couldn't find any matching tasks." });
    }
  } else if (name === 'todo_create_with_steps') {
    const createdItems = Array.isArray(result?.createdItems) ? result.createdItems : [];
    const steps = Array.isArray(result?.guide?.steps) ? result.guide.steps : [];
    if (createdItems.length) {
      const trackedItems = createdItems.map((it: any) => ({
        id: String(it.id || ''),
        text: String(it.text || ''),
        dueDate: typeof it.dueDate === 'string' ? it.dueDate : null,
        hasDueTime: typeof it.hasDueTime === 'boolean' ? it.hasDueTime : undefined,
        completed: false,
        starred: typeof it.starred === 'boolean' ? it.starred : false,
        workspace: typeof it.workspace === 'string' ? it.workspace : undefined,
        taskKind: typeof it.taskKind === 'string' ? it.taskKind : undefined,
        guidancePath: typeof it.guidancePath === 'string' ? it.guidancePath : undefined,
        recurrence: typeof it.recurrence === 'string' ? it.recurrence : undefined,
      }));
      setLastQueryItems(trackedItems);
      appendCreatedTodoItems(trackedItems);
      const count = steps.length;
      const intro = count === 1 ? 'Your task has been added with 1 step.' : `Your task has been added with ${count} steps.`;
      messages.push({ role: 'assistant', content: intro, card: { type: 'todoCreated', items: createdItems } });
    } else {
      messages.push({ role: 'assistant', content: 'I could not create that task.' });
    }
    appendSkippedMutationMessage(messages, result);
  } else if (/create_many$/.test(name)) {
    const createdItems = Array.isArray(result?.createdItems) ? result.createdItems : [];
    const count = Number(result?.created ?? createdItems.length ?? 0);
    const intro = getCreatedTodoIntro(count, createdItems);
    if (createdItems.length) {
      const trackedItems = createdItems.map((it: any) => ({
        id: String(it.id || ''),
        text: String(it.text || ''),
        dueDate: typeof it.dueDate === 'string' ? it.dueDate : null,
        hasDueTime: typeof it.hasDueTime === 'boolean' ? it.hasDueTime : undefined,
        completed: false,
        starred: typeof it.starred === 'boolean' ? it.starred : false,
        workspace: typeof it.workspace === 'string' ? it.workspace : undefined,
        taskKind: typeof it.taskKind === 'string' ? it.taskKind : undefined,
        guidancePath: typeof it.guidancePath === 'string' ? it.guidancePath : undefined,
        recurrence: typeof it.recurrence === 'string' ? it.recurrence : undefined,
      }));
      setLastQueryItems(trackedItems);
      appendCreatedTodoItems(trackedItems);
      messages.push({ role: 'assistant', content: intro, card: { type: 'todoCreated', items: createdItems } });
    } else {
      messages.push({ role: 'assistant', content: intro });
    }
    appendSkippedMutationMessage(messages, result);
  } else if (/delete/.test(name)) {
    const deletedItems = Array.isArray(result?.deletedItems) ? result.deletedItems : [];
    if (deletedItems.length) {
      removeLastQueryItems(deletedItems);
      removeCreatedTodoItems(deletedItems);
      const names = deletedItems.map((it: any) => `“${it.text}”`).join(', ');
      messages.push({ role: 'assistant', content: `Deleted ${deletedItems.length === 1 ? '1 todo' : `${deletedItems.length} todos`}: ${names}.` });
    } else {
      messages.push({ role: 'assistant', content: `Deleted ${result?.deleted ?? 0} todo${(result?.deleted ?? 0) === 1 ? '' : 's'}.` });
    }
    appendSkippedMutationMessage(messages, result);
  } else if (/complete/.test(name)) {
    const completedItems = Array.isArray(result?.completedItems) ? result.completedItems : [];
    if (completedItems.length) {
      const names = completedItems.map((it: any) => `“${it.text}”`).join(', ');
      messages.push({ role: 'assistant', content: `Completed ${completedItems.length === 1 ? '1 todo' : `${completedItems.length} todos`}: ${names}.` });
    } else {
      messages.push({ role: 'assistant', content: `Completed ${result?.completed ?? 0} todo${(result?.completed ?? 0) === 1 ? '' : 's'}.` });
    }
    appendSkippedMutationMessage(messages, result);
  } else if (/edit/.test(name)) {
    const updatedItems = Array.isArray(result?.updatedItems) ? result.updatedItems : [];
    if (updatedItems.length) {
      const itemsForCard = updatedItems.map((it: any) => ({
        id: it.id,
        text: it.newText || it.oldText || '',
        dueDate: typeof it.dueDate === 'string' ? it.dueDate : null,
        hasDueTime: typeof it.hasDueTime === 'boolean' ? it.hasDueTime : undefined,
        workspace: typeof it.workspace === 'string' ? it.workspace : undefined,
        starred: typeof it.starred === 'boolean' ? it.starred : undefined,
        recurrence: typeof it.recurrence === 'string' ? it.recurrence : undefined,
      }));
      updateCreatedTodoItems(itemsForCard.map((it: any) => ({
        id: String(it.id || ''),
        text: String(it.text || ''),
        dueDate: typeof it.dueDate === 'string' ? it.dueDate : null,
        hasDueTime: typeof it.hasDueTime === 'boolean' ? it.hasDueTime : undefined,
        completed: false,
        starred: typeof it.starred === 'boolean' ? it.starred : false,
        workspace: typeof it.workspace === 'string' ? it.workspace : undefined,
        recurrence: typeof it.recurrence === 'string' ? it.recurrence : undefined,
      })));
      const intro = updatedItems.length === 1 ? 'Your task has been updated.' : 'Your tasks have been updated.';
      messages.push({ role: 'assistant', content: intro, card: { type: 'todoUpdated', items: itemsForCard } });
    } else {
      messages.push({ role: 'assistant', content: `Updated ${result?.updated ?? 0} todo${(result?.updated ?? 0) === 1 ? '' : 's'}.` });
    }
    appendSkippedMutationMessage(messages, result);
  } else if (/star_toggle/.test(name)) {
    const affectedItems = Array.isArray(result?.affectedItems) ? result.affectedItems : [];
    if (affectedItems.length) {
      const itemsForCard = affectedItems.map((it: any) => ({
        text: it.text || '',
        starred: typeof it.starred === 'boolean' ? it.starred : undefined,
      }));
      const intro = 'I updated the starred tasks.';
      messages.push({ role: 'assistant', content: intro, card: { type: 'todoUpdated', items: itemsForCard } });
    } else {
      messages.push({ role: 'assistant', content: `Updated ${result?.affected ?? 0} todo${(result?.affected ?? 0) === 1 ? '' : 's'}.` });
    }
    appendSkippedMutationMessage(messages, result);
  }

  return { messages };
}
