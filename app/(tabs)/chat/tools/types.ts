export type ToolCall = {
  callId?: string;
  name: string;
  arguments?: any;
};

export type AssistantMessage = {
  role: 'assistant' | 'tool';
  content?: string;
  card?: any;
};

export type UiAction =
  | { type: 'navigate'; route: string; params?: Record<string, any> }
  | { type: 'none' };

export type ToolMemory = {
  lastQueryItems: Array<{
    id: string;
    text: string;
    dueDate: string | null;
    hasDueTime?: boolean;
    completed: boolean;
    starred: boolean;
    workspace?: string;
    taskKind?: string | null;
    guidancePath?: string | null;
    recurrence?: string | null;
  }>;
  createdTodoItems: Array<{
    id: string;
    text: string;
    dueDate: string | null;
    hasDueTime?: boolean;
    completed: boolean;
    starred: boolean;
    workspace?: string;
    taskKind?: string | null;
    guidancePath?: string | null;
    recurrence?: string | null;
  }>;
  lastCalendarItems: Array<{
    id: string;
    title: string;
    startDate: string;
    endDate?: string;
    source: 'local' | 'google';
    details?: string;
  }>;
  createdCalendarItems: Array<{
    id: string;
    title: string;
    startDate: string;
    endDate?: string;
    source: 'local' | 'google';
    details?: string;
  }>;
  lastDayPlan: {
    draftId?: string;
    date: string;
    repeatWeekly?: boolean;
    calendarItems: Array<{
      title: string;
      start?: string;
      end?: string;
      location?: string;
      details?: string;
    }>;
    todoItems: Array<{
      text: string;
      dueDate: string;
      hasDueTime: boolean;
      details?: string;
      starred: boolean;
      priority: 'low' | 'medium' | 'high';
      durationMinutes?: number;
      existingTodoId?: string;
    }>;
    timelineItems?: Array<{
      id: string;
      kind: 'task' | 'event' | 'blocker' | 'buffer';
      source: 'draft' | 'existing';
      title: string;
      start?: string;
      end?: string;
      dueDate?: string;
      hasDueTime?: boolean;
      durationMinutes: number;
      timeSource: 'user' | 'ai' | 'none';
      userEdited?: boolean;
      hidden?: boolean;
      location?: string;
      details?: string;
      priority?: 'low' | 'medium' | 'high';
      starred?: boolean;
      existingTodoId?: string;
    }>;
    saveBlockedReason?: string;
  } | null;
};

export type ExecuteResult = {
  success: boolean;
  messages: AssistantMessage[];
  uiActions?: UiAction[];
  error?: string;
  result?: any;
};
