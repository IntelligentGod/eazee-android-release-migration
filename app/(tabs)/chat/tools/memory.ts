import type { ToolMemory } from './types';
import { normalizeCalendarDetailsText } from '@/utils/calendarDetails';

const memory: ToolMemory = {
  lastQueryItems: [],
  createdTodoItems: [],
  lastCalendarItems: [],
  createdCalendarItems: [],
  lastDayPlan: null,
};

const todoMemoryKey = (item: { id?: string; text?: string; dueDate?: string | null; workspace?: string }) =>
  item.id || `${String(item.text || '').trim().toLowerCase()}|${item.dueDate || ''}|${String(item.workspace || '').trim().toLowerCase()}`;

const calendarMemoryKey = (item: { id?: string; source?: 'local' | 'google' }) =>
  `${item.source || 'local'}|${item.id || ''}`;

const MAX_CALENDAR_MEMORY_DETAILS_LENGTH = 240;

export function normalizeCalendarMemoryDetails(value: unknown) {
  const normalized = normalizeCalendarDetailsText(value);
  if (!normalized) return undefined;
  if (normalized.length <= MAX_CALENDAR_MEMORY_DETAILS_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_CALENDAR_MEMORY_DETAILS_LENGTH).trimEnd()}...`;
}

export function normalizeCalendarMemoryItems<T extends Record<string, unknown>>(items: T[]): T[];
export function normalizeCalendarMemoryItems(items: unknown): any[];
export function normalizeCalendarMemoryItems(items: unknown): any[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const next = { ...(item as Record<string, unknown>) };
    const details = normalizeCalendarMemoryDetails(next.details);
    if (details) {
      next.details = details;
    } else {
      delete next.details;
    }
    return next;
  });
}

export function getToolMemory(): ToolMemory {
  return memory;
}

export function getLastQueryItems() {
  return memory.lastQueryItems;
}
export function setLastQueryItems(items: ToolMemory['lastQueryItems']) {
  memory.lastQueryItems = Array.isArray(items) ? items : [];
}
export function removeLastQueryItems(items: Array<{ id?: string; text?: string; dueDate?: string | null; workspace?: string }>) {
  const targets = new Set((Array.isArray(items) ? items : []).map(todoMemoryKey));
  if (!targets.size) return;
  memory.lastQueryItems = memory.lastQueryItems.filter((item) => !targets.has(todoMemoryKey(item)));
}

export function getCreatedTodoItems() {
  return memory.createdTodoItems;
}
export function appendCreatedTodoItems(items: ToolMemory['createdTodoItems']) {
  const nextItems = Array.isArray(items) ? items : [];
  if (!nextItems.length) return;
  const incomingKeys = new Set(nextItems.map(todoMemoryKey));
  memory.createdTodoItems = [
    ...memory.createdTodoItems.filter((item) => !incomingKeys.has(todoMemoryKey(item))),
    ...nextItems,
  ].slice(-100);
}
export function updateCreatedTodoItems(items: ToolMemory['createdTodoItems']) {
  const nextItems = Array.isArray(items) ? items : [];
  if (!nextItems.length) return;
  const updates = new Map(nextItems.map((item) => [todoMemoryKey(item), item]));
  memory.createdTodoItems = memory.createdTodoItems.map((item) => updates.get(todoMemoryKey(item)) || item);
}
export function removeCreatedTodoItems(items: Array<{ id?: string; text?: string; dueDate?: string | null; workspace?: string }>) {
  const targets = new Set((Array.isArray(items) ? items : []).map(todoMemoryKey));
  if (!targets.size) return;
  memory.createdTodoItems = memory.createdTodoItems.filter((item) => !targets.has(todoMemoryKey(item)));
}

export function getLastCalendarItems() {
  return memory.lastCalendarItems;
}
export function setLastCalendarItems(items: ToolMemory['lastCalendarItems']) {
  memory.lastCalendarItems = normalizeCalendarMemoryItems(items);
}
export function removeLastCalendarItems(items: Array<{ id?: string; source?: 'local' | 'google' }>) {
  const targets = new Set((Array.isArray(items) ? items : []).map(calendarMemoryKey));
  if (!targets.size) return;
  memory.lastCalendarItems = memory.lastCalendarItems.filter((item) => !targets.has(calendarMemoryKey(item)));
}
export function appendLastCalendarItems(items: ToolMemory['lastCalendarItems']) {
  const prev = Array.isArray(memory.lastCalendarItems) ? memory.lastCalendarItems : [];
  const next = normalizeCalendarMemoryItems(items);
  memory.lastCalendarItems = [...prev, ...next].slice(-200);
}

export function getCreatedCalendarItems() {
  return memory.createdCalendarItems;
}
export function appendCreatedCalendarItems(items: ToolMemory['createdCalendarItems']) {
  const nextItems = normalizeCalendarMemoryItems(items);
  if (!nextItems.length) return;
  const incomingKeys = new Set(nextItems.map(calendarMemoryKey));
  memory.createdCalendarItems = [
    ...memory.createdCalendarItems.filter((item) => !incomingKeys.has(calendarMemoryKey(item))),
    ...nextItems,
  ].slice(-100);
}
export function updateCreatedCalendarItems(items: ToolMemory['createdCalendarItems']) {
  const nextItems = normalizeCalendarMemoryItems(items);
  if (!nextItems.length) return;
  const updates = new Map(nextItems.map((item) => [calendarMemoryKey(item), item]));
  memory.createdCalendarItems = memory.createdCalendarItems.map((item) => updates.get(calendarMemoryKey(item)) || item);
}
export function removeCreatedCalendarItems(items: Array<{ id?: string; source?: 'local' | 'google' }>) {
  const targets = new Set((Array.isArray(items) ? items : []).map(calendarMemoryKey));
  if (!targets.size) return;
  memory.createdCalendarItems = memory.createdCalendarItems.filter((item) => !targets.has(calendarMemoryKey(item)));
}

export function getLastDayPlan() {
  return memory.lastDayPlan;
}
export function setLastDayPlan(plan: ToolMemory['lastDayPlan']) {
  memory.lastDayPlan = plan || null;
}

export function resetToolMemory() {
  memory.lastQueryItems = [];
  memory.createdTodoItems = [];
  memory.lastCalendarItems = [];
  memory.createdCalendarItems = [];
  memory.lastDayPlan = null;
}
