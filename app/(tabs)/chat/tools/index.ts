import { todoToolHandlers, ToolHandler } from './todo';
import { calendarToolHandlers } from './calendar';
import { overviewToolHandlers } from './overview';
import { googleToolHandlers } from './google';
import { guidanceToolHandlers } from './guidance';
import { appNavigationToolHandlers } from './appNavigation';

const handlers: Record<string, ToolHandler> = {
  ...appNavigationToolHandlers,
  ...todoToolHandlers,
  ...guidanceToolHandlers,
  ...calendarToolHandlers,
  ...overviewToolHandlers,
  ...googleToolHandlers,
};

export const getToolHandler = (name: string): ToolHandler | undefined => handlers[name];

export const KNOWN_TOOL_NAMES = Object.keys(handlers);
