export type CompactAiNoticeTarget =
  | {
      type: 'todo';
      todoId: string;
      workspaceKey: string;
    }
  | {
      type: 'event';
      eventId: string;
      source: 'local' | 'google';
      startDate: string;
      googleEventId?: string;
    }
  | {
      type: 'screen';
      route: string;
      params?: Record<string, any>;
    };

export const getCompactNoticeTargetForMutation = (name: string, result: any): CompactAiNoticeTarget | null => {
  if (/^todo_create_many$/.test(name)) {
    const createdItems = Array.isArray(result?.createdItems) ? result.createdItems : [];
    if (createdItems.length !== 1) return null;

    const item = createdItems[0];
    const todoId = String(item?.id || '').trim();
    if (!todoId) return null;

    return {
      type: 'todo',
      todoId,
      workspaceKey: String(item?.workspace || 'Personal'),
    };
  }

  if (name === 'calendar_create') {
    const item = result?.item;
    const eventId = String(item?.id || '').trim();
    const startDate = typeof item?.startDate === 'string' ? item.startDate : '';
    if (!eventId || !startDate) return null;

    const googleEventId =
      typeof item?.googleEventId === 'string' && item.googleEventId.trim()
        ? item.googleEventId.trim()
        : undefined;
    const source = item?.source === 'google' ? 'google' : 'local';

    return {
      type: 'event',
      eventId,
      source,
      startDate,
      googleEventId,
    };
  }

  return null;
};

export const getCompactNoticeTargetForAppScreen = (result: any): CompactAiNoticeTarget | null => {
  if (result?.guidanceTarget && typeof result.guidanceTarget === 'object') {
    const target = result.guidanceTarget;
    if (target.type === 'screen' && typeof target.route === 'string' && target.route.trim()) {
      return {
        type: 'screen',
        route: target.route.trim(),
        params: typeof target.params === 'object' && target.params ? target.params : {},
      };
    }
  }

  const route = String(result?.route || '').trim();
  if (!route) return null;

  return {
    type: 'screen',
    route,
    params: typeof result?.params === 'object' && result.params ? result.params : {},
  };
};
