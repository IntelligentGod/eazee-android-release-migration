import { Alert } from 'react-native';
import { router } from 'expo-router';
import { auth } from '@/firebaseConfig';
import { skipWholeTutorial } from '@/lib/tutorial';

/** The tutorial is over: start the user on a fresh chat with the starter buttons. */
export function openNewChatAfterTutorial() {
  router.push({
    pathname: '/(tabs)/chat',
    params: { chatAction: 'new', chatActionNonce: `tutorial-end-${Date.now()}` },
  });
}

/**
 * The tutorial's "skip all": after a confirmation, ends the whole tutorial (not just the part
 * on screen) and opens a fresh chat. `onSkip` closes the tutorial card that asked.
 */
export function confirmSkipWholeTutorial(onSkip: () => void) {
  Alert.alert(
    'Skip the whole tutorial?',
    'You can replay it any time from Settings → Replay Tutorial.',
    [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Skip tutorial',
        style: 'destructive',
        onPress: () => {
          onSkip();
          const uid = auth.currentUser?.uid;
          void (uid ? skipWholeTutorial(uid) : Promise.resolve())
            .catch((error) => console.warn('Could not skip the tutorial:', error))
            .finally(openNewChatAfterTutorial);
        },
      },
    ]
  );
}
