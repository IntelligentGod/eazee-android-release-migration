import { Alert, Linking } from 'react-native';
import { requestGoogleCalendarDisclosure } from '@/lib/googleCalendarDisclosure';
import { PRIVACY_POLICY_URL } from '@/lib/legalLinks';

describe('Google Calendar disclosure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('discloses the full Calendar permission before continuing', async () => {
    let continueToGoogle!: () => void;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
      expect(message).toContain('share and permanently delete calendars');
      expect(message).toContain('sent directly to OpenAI');
      expect(buttons?.map((button) => button.text)).toEqual([
        'Privacy Policy',
        'Cancel',
        'Continue to Google',
      ]);
      continueToGoogle = buttons?.[2].onPress || (() => {});
    });

    const result = requestGoogleCalendarDisclosure();
    continueToGoogle();

    await expect(result).resolves.toBe(true);
  });

  it('opens the Privacy Policy without continuing', async () => {
    let openPrivacyPolicy!: () => void;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      openPrivacyPolicy = buttons?.[0].onPress || (() => {});
    });

    const result = requestGoogleCalendarDisclosure();
    openPrivacyPolicy();

    await expect(result).resolves.toBe(false);
    expect(Linking.openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  });
});
