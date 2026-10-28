import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTokens } from './context/TokenContext';
import { finishPendingAccountDeletion } from '@/lib/accountDeletion';
import { setOnboardingPhase } from '@/lib/onboarding';

export default function AccountDeletionScreen() {
  const { setTokens } = useTokens();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(true);
  const [canReturnToAccount, setCanReturnToAccount] = useState(false);

  const finishDeletion = useCallback(async () => {
    setIsCleaning(true);
    setErrorMessage(null);
    setCanReturnToAccount(false);

    try {
      const completed = await finishPendingAccountDeletion(() => setTokens(null, null));
      if (!completed) {
        setErrorMessage('Remote account deletion did not complete. Your device data was preserved.');
        setCanReturnToAccount(true);
        return;
      }

      await setOnboardingPhase('cta').catch((error) => {
        console.warn('Failed to persist post-deletion account entry phase', error);
      });
      Alert.alert(
        'Account deleted',
        'Your account and Eazee data were permanently deleted.',
        [{ text: 'OK', onPress: () => router.replace('/welcome-finish') }],
        { cancelable: false }
      );
    } catch (error: any) {
      console.error('Error finishing account cleanup:', error);
      setErrorMessage(String(error?.message || 'Device cleanup did not finish. Please try again.'));
    } finally {
      setIsCleaning(false);
    }
  }, [setTokens]);

  useEffect(() => {
    void finishDeletion();
  }, [finishDeletion]);

  return (
    <View style={styles.root}>
      {isCleaning ? (
        <>
          <ActivityIndicator color="#FFFDF8" />
          <Text style={styles.title}>Finishing account deletion...</Text>
          <Text style={styles.description}>Keep Eazee open while data is removed from this device.</Text>
        </>
      ) : errorMessage ? (
        <>
          <Text style={styles.title}>Account deletion could not finish</Text>
          <Text style={styles.description}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => canReturnToAccount ? router.replace('/(tabs)/home') : void finishDeletion()}
          >
            <Text style={styles.retryText}>{canReturnToAccount ? 'Return to account' : 'Retry cleanup'}</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#171713',
    padding: 28,
  },
  title: {
    marginTop: 14,
    color: '#FFFDF8',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    marginTop: 10,
    color: '#D8D5C9',
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    borderRadius: 14,
    backgroundColor: '#FFFDF8',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryText: {
    color: '#171713',
    fontWeight: '700',
  },
});
