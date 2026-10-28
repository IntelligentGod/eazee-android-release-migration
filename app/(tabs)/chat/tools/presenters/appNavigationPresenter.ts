import type { AssistantMessage, UiAction } from '../types';

export function presentAppNavigationResult(name: string, result: any): { messages: AssistantMessage[]; uiActions?: UiAction[] } {
  if (name !== 'app_open_screen') {
    return { messages: [{ role: 'assistant', content: 'Done.' }] };
  }

  const label = String(result?.label || 'that screen');
  const route = String(result?.route || '');
  const params = typeof result?.params === 'object' && result.params ? result.params : {};

  if (!route) {
    return { messages: [{ role: 'assistant', content: "I couldn't open that screen." }] };
  }

  return {
    messages: [{
      role: 'assistant',
      content: `Here's a shortcut to ${label}.`,
      card: {
        type: 'navigationShortcut',
        label,
        route,
        params,
        target: result?.guidanceTarget,
      },
    }],
  };
}
