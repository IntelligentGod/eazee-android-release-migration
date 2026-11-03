import { useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as ExpoInAppUpdates from 'expo-in-app-updates';

import {
  checkAppUpdate,
  rememberAvailableUpdatePrompt,
  shouldPromptForAvailableUpdate,
} from '@/lib/appUpdate';

/** Checks for a newer version when the app opens and when it comes back to the front. */
export default function AppUpdateGate() {
  const isCheckingRef = useRef(false);
  const isShowingRef = useRef(false);

  useEffect(() => {
    // Development builds run newer code than the store, so they would always be "out of date".
    if (__DEV__) return;

    const showRequired = (status: { storeUrl: string }) => {
      isShowingRef.current = true;
      Alert.alert(
        'Update required',
        'This version of Eazee is no longer supported. Please update to keep using the app.',
        [{
          text: 'Update',
          onPress: () => {
            isShowingRef.current = false;
            void Linking.openURL(status.storeUrl).catch(() => {});
          },
        }],
        { cancelable: false }
      );
    };

    const check = async () => {
      if (isCheckingRef.current || isShowingRef.current) return;
      isCheckingRef.current = true;
      try {
        const status = await checkAppUpdate();
        if (status.kind === 'required') {
          // Google Play's full-screen update installs it in place; the alert is the fallback.
          const startedPlayUpdate = Platform.OS === 'android' && await ExpoInAppUpdates.startUpdate(true).catch(() => false);
          if (!startedPlayUpdate) showRequired(status);
          return;
        }
        // On Android every build shares the version name, so Google Play (which compares
        // version codes) says whether there is a newer one, and downloads it in the background.
        const playUpdate = Platform.OS === 'android' ? await ExpoInAppUpdates.checkForUpdate().catch(() => null) : null;
        if (playUpdate) {
          if (!playUpdate.updateAvailable || playUpdate.updateInProgress || !(await shouldPromptForAvailableUpdate(playUpdate.storeVersion))) return;
          await rememberAvailableUpdatePrompt(playUpdate.storeVersion);
          await ExpoInAppUpdates.startUpdate(false).catch(() => false);
          return;
        }
        if (status.kind !== 'available' || !(await shouldPromptForAvailableUpdate(status.latestVersion))) return;
        await rememberAvailableUpdatePrompt(status.latestVersion);
        isShowingRef.current = true;
        Alert.alert(
          'Update available',
          `A new version of Eazee${status.latestVersion ? ` (${status.latestVersion})` : ''} is available with the latest improvements.`,
          [
            { text: 'Later', style: 'cancel', onPress: () => { isShowingRef.current = false; } },
            {
              text: 'Update',
              onPress: () => {
                isShowingRef.current = false;
                void Linking.openURL(status.storeUrl).catch(() => {});
              },
            },
          ]
        );
      } finally {
        isCheckingRef.current = false;
      }
    };

    void check();
    // Coming back from the store (or from the background) checks again; a required
    // update keeps asking until the app is updated.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, []);

  return null;
}
