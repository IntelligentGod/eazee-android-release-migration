import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import OnboardingButton from '@/components/onboarding/OnboardingButton';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';

export default function WelcomeFinishScreen() {
  return (
    <OnboardingScaffold>
      <View style={styles.container}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>You&apos;re ready for Eazee.</Text>
          <Text style={styles.subtitle}>Create an account or log in to continue.</Text>
        </View>

        <View style={styles.footer}>
          <OnboardingButton
            label="Sign Up"
            onPress={() => router.push({ pathname: '/home/signup', params: { source: 'onboarding' } })}
          />
          <OnboardingButton
            label="Log In"
            variant="secondary"
            onPress={() => router.push({ pathname: '/home/login', params: { source: 'onboarding' } })}
          />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  titleBlock: {
    paddingTop: 120,
    gap: 14,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
    color: '#0B7A69',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    color: 'rgba(11, 122, 105, 0.82)',
  },
  footer: {
    gap: 14,
    paddingBottom: 8,
  },
});
