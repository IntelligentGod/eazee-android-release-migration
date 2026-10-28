import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';
import {
  getAiDataSharingConsentKey,
  requestAiDataSharingConsent,
  requireAiDataSharingConsent,
  subscribeAiDataSharingConsentAccepted,
} from '@/lib/aiDataSharingConsent';
import { PRIVACY_POLICY_URL } from '@/lib/legalLinks';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('AI data-sharing consent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue(undefined);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores approval for the signed-in user', async () => {
    let allow!: () => void;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      allow = buttons?.find((button) => button.text === 'Allow AI Features')?.onPress || (() => {});
    });

    const consentPromise = requestAiDataSharingConsent('user-1');
    await flushPromises();
    allow();

    await expect(consentPromise).resolves.toBe(true);
    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
      getAiDataSharingConsentKey('user-1'),
      '1'
    );
  });

  it('keeps Allow AI Features last and preferred', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const consentPromise = requestAiDataSharingConsent('user-1');
    await flushPromises();

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toContain('directly to OpenAI');
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).not.toContain('OpenRouter');
    expect(buttons.map((button: { text?: string }) => button.text)).toEqual([
      'Privacy Policy',
      'Not Now',
      'Allow AI Features',
    ]);
    expect(buttons[2]).toMatchObject({ isPreferred: true });
    buttons[2].onPress();
    await expect(consentPromise).resolves.toBe(true);
  });

  it('uses the second consent version', () => {
    expect(getAiDataSharingConsentKey('user-1')).toBe('aiDataSharingConsent:v2:user-1');
  });

  it('does not prompt when the current consent version is already accepted', async () => {
    mockedAsyncStorage.getItem.mockResolvedValue('1');
    const alertSpy = jest.spyOn(Alert, 'alert');

    await expect(requestAiDataSharingConsent('user-1')).resolves.toBe(true);

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('prompts again after Not Now', async () => {
    const notNowActions: (() => void)[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      notNowActions.push(buttons?.find((button) => button.text === 'Not Now')?.onPress || (() => {}));
    });

    const firstRequest = requestAiDataSharingConsent('user-1');
    await flushPromises();
    notNowActions[0]();
    await expect(firstRequest).resolves.toBe(false);

    const secondRequest = requestAiDataSharingConsent('user-1');
    await flushPromises();
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    notNowActions[1]();
    await expect(secondRequest).resolves.toBe(false);
    expect(mockedAsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('opens the Privacy Policy without granting consent', async () => {
    let openPrivacyPolicy!: () => void;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      openPrivacyPolicy = buttons?.find((button) => button.text === 'Privacy Policy')?.onPress || (() => {});
    });

    const consentPromise = requestAiDataSharingConsent('user-1');
    await flushPromises();
    openPrivacyPolicy();

    await expect(consentPromise).resolves.toBe(false);
    expect(Linking.openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
    expect(mockedAsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('shares one prompt across concurrent AI requests', async () => {
    let allow!: () => void;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      allow = buttons?.find((button) => button.text === 'Allow AI Features')?.onPress || (() => {});
    });

    const firstRequest = requestAiDataSharingConsent('user-1');
    const secondRequest = requestAiDataSharingConsent('user-1');
    await flushPromises();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    allow();

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([true, true]);
  });

  it('blocks an AI request when consent is declined', async () => {
    let notNow!: () => void;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      notNow = buttons?.find((button) => button.text === 'Not Now')?.onPress || (() => {});
    });

    const consentPromise = requireAiDataSharingConsent('user-1');
    await flushPromises();
    notNow();

    await expect(consentPromise).rejects.toMatchObject({
      name: 'AiDataSharingConsentDeclinedError',
    });
  });

  it('notifies subscribers only when consent is accepted', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAiDataSharingConsentAccepted(listener);
    const actions: Record<string, () => void> = {};
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.forEach((button) => {
        if (button.text && button.onPress) {
          actions[button.text] = button.onPress;
        }
      });
    });

    const declinedRequest = requestAiDataSharingConsent('user-1');
    await flushPromises();
    actions['Not Now']();
    await expect(declinedRequest).resolves.toBe(false);
    expect(listener).not.toHaveBeenCalled();

    const acceptedRequest = requestAiDataSharingConsent('user-1');
    await flushPromises();
    actions['Allow AI Features']();
    await expect(acceptedRequest).resolves.toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('user-1');

    unsubscribe();
    const nextRequest = requestAiDataSharingConsent('user-2');
    await flushPromises();
    actions['Allow AI Features']();
    await expect(nextRequest).resolves.toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
