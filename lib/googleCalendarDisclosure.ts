import { Alert, Linking } from 'react-native';
import { presentDisclosure } from '@/lib/appDisclosure';
import { PRIVACY_POLICY_URL } from '@/lib/legalLinks';

const GOOGLE_CALENDAR_DISCLOSURE_COPY = {
  title: 'Google Calendar access',
  message:
    'Eazee requests access to see and edit calendars and events you choose to manage in the app. This Google permission also allows Eazee to share and permanently delete calendars you can access. If you separately allow AI features, relevant Calendar content may be sent directly to OpenAI to provide those features.',
};

/** Shown in the app's own dialog when it is mounted, otherwise as a system alert. */
export const requestGoogleCalendarDisclosure = () =>
  presentDisclosure({ ...GOOGLE_CALENDAR_DISCLOSURE_COPY, confirmLabel: 'Continue to Google', cancelLabel: 'Cancel' })
  ?? showSystemGoogleCalendarDisclosure();

const showSystemGoogleCalendarDisclosure = () =>
  new Promise<boolean>((resolve) => {
    Alert.alert(
      GOOGLE_CALENDAR_DISCLOSURE_COPY.title,
      GOOGLE_CALENDAR_DISCLOSURE_COPY.message,
      [
        {
          text: 'Privacy Policy',
          onPress: () => {
            void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {});
            resolve(false);
          },
        },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue to Google', isPreferred: true, onPress: () => resolve(true) },
      ],
      { cancelable: false }
    );
  });
