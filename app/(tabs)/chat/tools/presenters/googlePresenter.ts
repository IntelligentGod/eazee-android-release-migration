import type { AssistantMessage, UiAction } from '../types';

const buildGoogleConnectionSettingsCard = () => {
  const nonce = String(Date.now());
  const params = {
    manageAccount: 'true',
    manageAccountSection: 'google',
    manageAccountNonce: nonce,
  };

  return {
    type: 'navigationShortcut',
    label: 'Google connection settings',
    route: '/(tabs)/home',
    params,
    target: {
      type: 'screen',
      route: '/(tabs)/home',
      params: {
        ...params,
      },
    },
  };
};

export function presentGoogleResult(name: string, result: any): { messages: AssistantMessage[]; uiActions?: UiAction[] } {
  if (name !== 'google_connection_status') {
    return { messages: [{ role: 'assistant', content: 'Done.' }] };
  }

  if (result?.active) {
    return {
      messages: [{ role: 'assistant', content: 'Your Google account is connected and active for Google Calendar.' }],
    };
  }

  if (result?.requiresReconnect) {
    return {
      messages: [{
        role: 'assistant',
        content: 'Your Google account exists, but it needs to be reconnected before Google Calendar sync will work.',
        card: buildGoogleConnectionSettingsCard(),
      }],
    };
  }

  return {
    messages: [{
      role: 'assistant',
      content: 'Your Google account is not connected.',
      card: buildGoogleConnectionSettingsCard(),
    }],
  };
}
