import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import 'react-native-reanimated';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import { TabProvider } from './context/TabContext';
import * as NavigationBar from 'expo-navigation-bar';
import { ActivityIndicator, Appearance, Platform, Text, TouchableOpacity, View } from 'react-native';
import { configureTodoNotifications, syncAllTodoReminders } from '@/lib/todoNotifications';
import { useNotificationSchedules } from '@/lib/useNotificationSchedules';
import { useStoreSubscriptionSync } from '@/lib/useStoreSubscriptionSync';
import * as WebBrowser from 'expo-web-browser';
import { auth } from '@/firebaseConfig';
import { AuthSessionProvider, useAuthSession } from './context/AuthSessionContext';
import { RoleSessionProvider } from './context/RoleSessionContext';
import { TokenProvider } from './context/TokenContext';
import { GuidanceProvider } from '@/components/guidance/GuidanceProvider';
import AppDialogHost from '@/components/AppDialogHost';
import AppUpdateGate from '@/components/AppUpdateGate';
import { finishPendingAccountDeletion, hasPendingAccountDeletion } from '@/lib/accountDeletion';
import { setOnboardingPhase } from '@/lib/onboarding';
import { configureDatabaseForAuthUser, getDatabaseNameForAuthUser, isAppleReviewDemoAccount, prepareAuthUserDatabase } from '@/lib/demoAccount';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://4cd6ed57c6c38ac087c494282c8480f3@o4511621290917888.ingest.us.sentry.io/4511621301665792',

  sendDefaultPii: false,

  // Enable Logs
  enableLogs: false,

  integrations: (integrations) =>
    integrations.map((integration) =>
      integration.name === 'Breadcrumbs'
        ? Sentry.breadcrumbsIntegration({
            console: false,
            dom: false,
            fetch: false,
            history: false,
            sentry: false,
            xhr: false,
          })
        : integration
    ),

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

SplashScreen.preventAutoHideAsync();
WebBrowser.maybeCompleteAuthSession();

function DemoAccountSetupGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const userEmail = user?.email;
  const authUser = React.useMemo(() => (userEmail ? { email: userEmail } : null), [userEmail]);
  const expectedDatabaseName = getDatabaseNameForAuthUser(authUser);
  const expectedDatabaseScopeKey = `${String(userEmail || 'signed-out').trim().toLowerCase()}:${expectedDatabaseName}`;
  const [isSettingUp, setIsSettingUp] = React.useState(true);
  const [setupFailed, setSetupFailed] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);
  const [databaseScopeKey, setDatabaseScopeKey] = React.useState(() => `signed-out:${getDatabaseNameForAuthUser(null)}`);

  const handleUseAnotherAccount = async () => {
    try {
      await signOut(auth);
      configureDatabaseForAuthUser(null);
      router.replace('/welcome');
    } catch (error) {
      console.error('Failed to sign out from demo account setup:', error);
    }
  };

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    let isActive = true;
    const isDemoAccount = isAppleReviewDemoAccount(userEmail);

    setIsSettingUp(true);
    setSetupFailed(false);

    const startedAt = Date.now();
    let didSetup = false;
    Promise.resolve()
      .then(async () => {
        const hasPendingDeletion = await hasPendingAccountDeletion();
        if (hasPendingDeletion) {
          configureDatabaseForAuthUser(authUser);
          didSetup = true;
          return;
        }
        await prepareAuthUserDatabase(authUser);
        didSetup = true;
      })
      .then(async () => {
        if (isDemoAccount) {
          const remainingDelay = Math.max(0, 600 - (Date.now() - startedAt));
          if (remainingDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, remainingDelay));
          }
        }
      })
      .catch((error) => {
        console.error('Failed to set up demo account:', error);
        if (isActive) {
          setSetupFailed(true);
        }
      })
      .finally(() => {
        if (isActive) {
          if (didSetup) {
            setDatabaseScopeKey(expectedDatabaseScopeKey);
          }
          setIsSettingUp(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [authUser, expectedDatabaseScopeKey, isAuthLoading, retryCount, userEmail]);

  if (setupFailed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#171713', padding: 28 }}>
        <Text style={{ color: '#FFFDF8', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
          Demo account setup failed
        </Text>
        <Text style={{ marginTop: 10, color: '#D8D5C9', textAlign: 'center', lineHeight: 20 }}>
          Retry setup, or use another account to log in, create an account, or use the backup review account.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 20, borderRadius: 14, backgroundColor: '#FFFDF8', paddingHorizontal: 20, paddingVertical: 12 }}
          onPress={() => setRetryCount((count) => count + 1)}
        >
          <Text style={{ color: '#171713', fontWeight: '700' }}>Retry setup</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#FFFDF8', paddingHorizontal: 20, paddingVertical: 12 }}
          onPress={() => void handleUseAnotherAccount()}
        >
          <Text style={{ color: '#FFFDF8', fontWeight: '700' }}>Use another account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isSettingUp || (!isAuthLoading && databaseScopeKey !== expectedDatabaseScopeKey)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#171713' }}>
        <ActivityIndicator color="#FFFDF8" />
        <Text style={{ marginTop: 14, color: '#FFFDF8' }}>
          {isAppleReviewDemoAccount(userEmail) ? 'Setting up demo account...' : ''}
        </Text>
      </View>
    );
  }

  return <React.Fragment key={databaseScopeKey}>{children}</React.Fragment>;
}

function AccountDeletionRecoveryGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const [isChecking, setIsChecking] = React.useState(true);
  const [areRemindersReady, setAreRemindersReady] = React.useState(false);
  useNotificationSchedules(areRemindersReady && !!user);
  useStoreSubscriptionSync(areRemindersReady ? user?.uid : null);
  const [isRecoveringDeletion, setIsRecoveringDeletion] = React.useState(false);
  const [recoveryFailed, setRecoveryFailed] = React.useState(false);
  const [shouldRouteToAccountEntry, setShouldRouteToAccountEntry] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    let isActive = true;
    setIsChecking(true);
    setIsRecoveringDeletion(false);
    setRecoveryFailed(false);
    hasPendingAccountDeletion()
      .then(async (hasPendingDeletion) => {
        if (!hasPendingDeletion) {
          return false;
        }
        if (isActive) {
          setIsRecoveringDeletion(true);
        }
        return finishPendingAccountDeletion();
      })
      .then(async (completed) => {
        if (completed) {
          await setOnboardingPhase('cta').catch((error) => {
            console.warn('Failed to persist post-deletion account entry phase', error);
          });
          setShouldRouteToAccountEntry(true);
          return;
        }
        configureTodoNotifications().catch((error) => {
          console.error('Error configuring todo notifications:', error);
        });
        syncAllTodoReminders().catch((error) => {
          console.error('Error syncing todo reminders:', error);
        });
        if (isActive) {
          setAreRemindersReady(true);
        }
      })
      .catch((error) => {
        console.error('Failed to finish pending account deletion:', error);
        if (isActive) {
          setRecoveryFailed(true);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsChecking(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [isAuthLoading, retryCount]);

  useEffect(() => {
    if (!isChecking && shouldRouteToAccountEntry) {
      requestAnimationFrame(() => router.replace('/welcome-finish'));
    }
  }, [isChecking, shouldRouteToAccountEntry]);

  if (isChecking) {
    if (!isRecoveringDeletion) {
      return null;
    }

    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#171713' }}>
        <ActivityIndicator color="#FFFDF8" />
        <Text style={{ marginTop: 14, color: '#FFFDF8' }}>Finishing account deletion...</Text>
      </View>
    );
  }

  if (recoveryFailed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#171713', padding: 28 }}>
        <Text style={{ color: '#FFFDF8', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
          Account deletion could not finish
        </Text>
        <Text style={{ marginTop: 10, color: '#D8D5C9', textAlign: 'center', lineHeight: 20 }}>
          Retry to safely confirm deletion or finish removing account data from this device.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 20, borderRadius: 14, backgroundColor: '#FFFDF8', paddingHorizontal: 20, paddingVertical: 12 }}
          onPress={() => setRetryCount((count) => count + 1)}
        >
          <Text style={{ color: '#171713', fontWeight: '700' }}>Retry cleanup</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return children;
}

export default Sentry.wrap(function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    Appearance.setColorScheme('dark');
  }, []);

  useEffect(() => {
    // Set navigation bar color for Android
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
    }
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="transparent" />
      <AuthSessionProvider>
        <RoleSessionProvider>
          <DemoAccountSetupGate>
            <AccountDeletionRecoveryGate>
              <TokenProvider>
                <BottomSheetModalProvider>
                  <TabProvider>
                    <GuidanceProvider>
                      <Stack>
                    <Stack.Screen
                      name="index"
                      options={{
                        headerShown: false
                      }}
                    />
                    <Stack.Screen
                      name="welcome"
                      options={{
                        headerShown: false
                      }}
                    />
                    <Stack.Screen
                      name="welcome-finish"
                      options={{
                        headerShown: false
                      }}
                    />
                    <Stack.Screen
                      name="account-deletion"
                      options={{
                        headerShown: false,
                        animation: 'none',
                        gestureEnabled: false
                      }}
                    />
                    <Stack.Screen
                      name="(tabs)"
                      options={{
                        headerShown: false
                      }}
                    />
                    <Stack.Screen
                      name="purchase-history"
                      options={{
                        headerShown: false
                      }}
                    />
                    <Stack.Screen
                      name="about-me"
                      options={{
                        headerShown: false
                      }}
                    />
                    <Stack.Screen
                      name="personality-card"
                      options={{
                        headerShown: false
                      }}
                    />
                    <Stack.Screen
                      name="memories"
                      options={{
                        headerShown: false
                      }}
                    />
                    <Stack.Screen
                      name="(admin)"
                      options={{
                        headerShown: false
                      }}
                    />
                      </Stack>
                      <AppDialogHost />
                      <AppUpdateGate />
                    </GuidanceProvider>
                  </TabProvider>
                </BottomSheetModalProvider>
              </TokenProvider>
            </AccountDeletionRecoveryGate>
          </DemoAccountSetupGate>
        </RoleSessionProvider>
      </AuthSessionProvider>
    </GestureHandlerRootView>
  )
});
