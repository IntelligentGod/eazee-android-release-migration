import { presentGoogleResult } from '../presenters/googlePresenter';

describe('google presenter', () => {
  it('shows Google connection settings guidance when disconnected', () => {
    const result = presentGoogleResult('google_connection_status', { active: false });

    expect(result.messages[0]?.card).toMatchObject({
      type: 'navigationShortcut',
      label: 'Google connection settings',
      route: '/(tabs)/home',
      params: {
        manageAccount: 'true',
        manageAccountSection: 'google',
        manageAccountNonce: expect.any(String),
      },
      target: {
        type: 'screen',
        route: '/(tabs)/home',
        params: {
          manageAccount: 'true',
          manageAccountSection: 'google',
          manageAccountNonce: expect.any(String),
        },
      },
    });
  });

  it('shows Google connection settings guidance when reconnect is required', () => {
    const result = presentGoogleResult('google_connection_status', { requiresReconnect: true });

    expect(result.messages[0]?.card).toMatchObject({
      type: 'navigationShortcut',
      label: 'Google connection settings',
      route: '/(tabs)/home',
      target: {
        type: 'screen',
        route: '/(tabs)/home',
        params: {
          manageAccount: 'true',
          manageAccountSection: 'google',
        },
      },
    });
  });
});
