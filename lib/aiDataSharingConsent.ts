import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';
import { presentDisclosure } from '@/lib/appDisclosure';
import { PRIVACY_POLICY_URL } from '@/lib/legalLinks';

const AI_DATA_SHARING_CONSENT_KEY_PREFIX = 'aiDataSharingConsent:v2:';

let pendingConsentRequest: { userId: string; promise: Promise<boolean> } | null = null;
const acceptedListeners = new Set<(userId: string) => void>();

export class AiDataSharingConsentDeclinedError extends Error {
  constructor() {
    super('Allow AI Features to continue.');
    this.name = 'AiDataSharingConsentDeclinedError';
  }
}

export const getAiDataSharingConsentKey = (userId: string) =>
  `${AI_DATA_SHARING_CONSENT_KEY_PREFIX}${userId}`;

export const subscribeAiDataSharingConsentAccepted = (listener: (userId: string) => void) => {
  acceptedListeners.add(listener);
  return () => {
    acceptedListeners.delete(listener);
  };
};

const notifyAiDataSharingConsentAccepted = (userId: string) => {
  acceptedListeners.forEach((listener) => {
    listener(userId);
  });
};

export const AI_DATA_SHARING_CONSENT_COPY = {
  title: 'AI data sharing',
  message:
    'Eazee sends the text you enter and relevant chat, task, goal, calendar, note, and voice transcript content directly to OpenAI to provide AI features, including web search. OpenAI does not use API data to train its models unless Eazee explicitly opts in. Google Calendar content is sent only after you connect Google and allow AI features.',
};

const showSystemAiDataSharingConsent = () =>
  new Promise<boolean>((resolve) => {
    Alert.alert(
      AI_DATA_SHARING_CONSENT_COPY.title,
      AI_DATA_SHARING_CONSENT_COPY.message,
      [
        {
          text: 'Privacy Policy',
          onPress: () => {
            void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {});
            resolve(false);
          },
        },
        { text: 'Not Now', onPress: () => resolve(false) },
        { text: 'Allow AI Features', isPreferred: true, onPress: () => resolve(true) },
      ],
      { cancelable: false }
    );
  });

const showAiDataSharingConsent = () =>
  presentDisclosure({ ...AI_DATA_SHARING_CONSENT_COPY, confirmLabel: 'Allow AI features', cancelLabel: 'Not now' })
  ?? showSystemAiDataSharingConsent();

export async function requestAiDataSharingConsent(userId: string) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return false;
  }

  const storageKey = getAiDataSharingConsentKey(normalizedUserId);
  const accepted = await AsyncStorage.getItem(storageKey).catch(() => null);
  if (accepted === '1') {
    return true;
  }

  if (pendingConsentRequest) {
    if (pendingConsentRequest.userId === normalizedUserId) {
      return pendingConsentRequest.promise;
    }
    await pendingConsentRequest.promise;
    return requestAiDataSharingConsent(normalizedUserId);
  }

  const promise = showAiDataSharingConsent()
    .then(async (shouldAllow) => {
      if (shouldAllow) {
        await AsyncStorage.setItem(storageKey, '1').catch(() => {});
        notifyAiDataSharingConsentAccepted(normalizedUserId);
      }
      return shouldAllow;
    })
    .finally(() => {
      if (pendingConsentRequest?.promise === promise) {
        pendingConsentRequest = null;
      }
    });

  pendingConsentRequest = { userId: normalizedUserId, promise };
  return promise;
}

export async function requireAiDataSharingConsent(userId: string) {
  if (!(await requestAiDataSharingConsent(userId))) {
    throw new AiDataSharingConsentDeclinedError();
  }
}

export const isAiDataSharingConsentDeclinedError = (error: unknown) =>
  error instanceof AiDataSharingConsentDeclinedError ||
  (error as any)?.name === 'AiDataSharingConsentDeclinedError';
