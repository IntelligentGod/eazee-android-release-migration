import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import OnboardingScaffold from '@/components/onboarding/OnboardingScaffold';
import { completeOnboarding, getOnboardingPhase, resolveOnboardingRoute, type OnboardingRoute } from '@/lib/onboarding';
import { useAuthSession } from './context/AuthSessionContext';

export default function AppEntryScreen() {
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const [targetRoute, setTargetRoute] = useState<OnboardingRoute | null>(null);

  useEffect(() => {
    let isActive = true;

    const resolveEntryRoute = async () => {
      if (isAuthLoading) {
        return;
      }

      if (user) {
        try {
          await completeOnboarding();
        } catch (error) {
          console.warn('Failed to persist onboarding completion', error);
        } finally {
          if (isActive) {
            setTargetRoute('/(tabs)/chat');
          }
        }
        return;
      }

      try {
        const phase = await getOnboardingPhase();

        if (isActive) {
          setTargetRoute(resolveOnboardingRoute(phase));
        }
      } catch (error) {
        console.warn('Failed to resolve onboarding phase', error);
        if (isActive) {
          setTargetRoute('/welcome');
        }
      }
    };

    void resolveEntryRoute();

    return () => {
      isActive = false;
    };
  }, [isAuthLoading, user]);

  if (targetRoute) {
    return <Redirect href={targetRoute} />;
  }

  return (
    <OnboardingScaffold>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="small" color="#0F5A4D" />
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#0F5A4D' }}>Loading Eazee...</Text>
      </View>
    </OnboardingScaffold>
  );
}
