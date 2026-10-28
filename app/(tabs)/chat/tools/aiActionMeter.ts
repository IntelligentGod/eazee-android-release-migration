import { buildDayPlanCardValue } from '../dayPlan';
import { getLastDayPlan } from './memory';

/**
 * Which tools are AI actions, and how many: one per item Eazee creates, changes or deletes
 * (see lib/aiActions.ts). Reading, searching, planning drafts and guidance are not actions.
 */
export type AiActionCost = {
  /** Actions needed up front. */
  count: number;
  /**
   * How the request is cut down to `granted` items. Missing when it cannot be split (one item,
   * or a saved plan, which is saved whole or not at all).
   */
  trim?: (args: any, granted: number) => any;
  /** The count is only known after running (changes "everything on a day"); at least one is needed. */
  countAfter?: boolean;
};

const ITEM_TOOLS = new Set([
  'todo_create_many', 'todo.create_many',
  'todo_edit_many', 'todo.edit_many',
  'todo_complete_many', 'todo.complete_many',
  'todo_delete_many', 'todo.delete_many',
  'todo_star_toggle_many', 'todo.star_toggle_many',
]);
const SINGLE_TOOLS = new Set(['todo_create_with_steps', 'calendar_create', 'calendar_update', 'calendar_delete', 'goal_create', 'goal_create_with_guidance']);
const DAY_TOOLS = new Set(['todo_delete_by_day', 'todo_delete_by_day_except', 'todo_complete_by_day']);

const trimList = (key: 'items' | 'events') => (args: any, granted: number) => ({ ...args, [key]: args[key].slice(0, granted) });

function countSavedPlanItems() {
  const plan = getLastDayPlan();
  if (!plan) return 0;
  const value = Array.isArray(plan.timelineItems) ? buildDayPlanCardValue(plan.date, plan.timelineItems, plan.draftId) : plan;
  return (Array.isArray(value.calendarItems) ? value.calendarItems.length : 0)
    + (Array.isArray(value.todoItems) ? value.todoItems.length : 0);
}

/** null when the tool is not an AI action. */
export function getAiActionCost(name: string, args: any): AiActionCost | null {
  if (ITEM_TOOLS.has(name)) {
    const items = Array.isArray(args?.items) ? args.items : [];
    return items.length ? { count: items.length, trim: trimList('items') } : null;
  }
  if (name === 'calendar_create_many') {
    // The tool takes at most 20 events.
    const events = Array.isArray(args?.events) ? args.events.slice(0, 20) : [];
    return events.length ? { count: events.length, trim: (value, granted) => trimList('events')({ ...value, events }, granted) } : null;
  }
  if (SINGLE_TOOLS.has(name)) return { count: 1 };
  if (DAY_TOOLS.has(name)) return { count: 1, countAfter: true };
  if (name === 'save_day_plan') {
    const count = countSavedPlanItems();
    return count ? { count } : null;
  }
  return null;
}

const toCount = (value: unknown) => (typeof value === 'number' && value > 0 ? Math.floor(value) : 0);

/** How many items the tool actually created, changed or deleted. */
export function countAiActionsDone(name: string, result: any): number {
  if (!result) return 0;
  if (name === 'calendar_create_many') return Array.isArray(result.items) ? result.items.length : 0;
  if (name === 'calendar_create') return result.item || result.created ? 1 : 0;
  if (name === 'calendar_update' || name === 'calendar_delete') return 1;
  if (name === 'save_day_plan') {
    return (Array.isArray(result.calendarItems) ? result.calendarItems.length : 0)
      + (Array.isArray(result.todoItems) ? result.todoItems.length : 0)
      + (Array.isArray(result.rescheduledTodoItems) ? result.rescheduledTodoItems.length : 0);
  }
  return toCount(result.created) || toCount(result.updated) || toCount(result.completed)
    || toCount(result.deleted) || toCount(result.affected);
}
