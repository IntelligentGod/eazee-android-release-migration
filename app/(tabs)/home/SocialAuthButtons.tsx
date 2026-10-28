import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { completeOnboarding } from '@/lib/onboarding';
import { startTutorial } from '@/lib/tutorial';
import { getSocialAuthErrorMessage } from './socialAuthErrors';
import { isAppleSignInAvailable, isNewAuthUserCredential, signInWithAppleAccount, signInWithGoogleAccount } from './socialAuth';
import { AuthLegalNotice } from './AuthLegalNotice';
import { requestAiDataSharingConsent } from '@/lib/aiDataSharingConsent';

type SocialProvider = 'google' | 'apple';

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: 'Google',
  apple: 'Apple',
};

export function SocialAuthButtons({ showLegalNotice = true }: { showLegalNotice?: boolean }) {
  const [loadingProvider, setLoadingProvider] = useState<SocialProvider | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);

  useEffect(() => {
    let isActive = true;

    isAppleSignInAvailable()
      .then((available) => {
        if (isActive) {
          setIsAppleAvailable(available);
        }
      })
      .catch(() => {
        if (isActive) {
          setIsAppleAvailable(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleSocialSignIn = async (provider: SocialProvider) => {
    if (loadingProvider) {
      return;
    }

    setLoadingProvider(provider);

    try {
      const userCredential = provider === 'google'
        ? await signInWithGoogleAccount()
        : await signInWithAppleAccount();
      const isNewUser = isNewAuthUserCredential(userCredential);

      await completeOnboarding().catch((error) => {
        console.warn('Failed to persist onboarding completion after social sign-in', error);
      });
      if (isNewUser) {
        await requestAiDataSharingConsent(userCredential.user.uid);
        await startTutorial(userCredential.user.uid).catch((error) => {
          console.warn('Failed to persist tutorial start after social sign-in', error);
        });
      }
      router.replace(isNewUser ? '/(tabs)/chat' : '/home');
    } catch (error) {
      // The alert is generic; the code (e.g. Google's DEVELOPER_ERROR) is what explains a failure.
      console.warn(`${PROVIDER_LABELS[provider]} sign-in failed`, (error as { code?: unknown })?.code, error);
      const message = getSocialAuthErrorMessage(error, PROVIDER_LABELS[provider]);
      if (message) {
        const code = (error as { code?: unknown })?.code;
        Alert.alert('Sign in failed', __DEV__ && code ? `${message}\n\n(${String(code)})` : message);
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.divider} />
      </View>

      <SocialButton
        label="Continue with Google"
        loading={loadingProvider === 'google'}
        disabled={!!loadingProvider}
        onPress={() => handleSocialSignIn('google')}
      />

      {Platform.OS === 'ios' && isAppleAvailable && (
        <AppleSignInButton
          loading={loadingProvider === 'apple'}
          disabled={!!loadingProvider}
          onPress={() => handleSocialSignIn('apple')}
        />
      )}

      {showLegalNotice && <AuthLegalNotice />}
    </View>
  );
}

function SocialButton({
  label,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabledButton]}
    >
      <View style={styles.iconWrap}>
        <Image source={require('../../../assets/google-logo.png')} style={styles.googleIcon} resizeMode="contain" />
      </View>
      <Text style={styles.buttonText}>{label}</Text>
      <View style={styles.trailing}>
        {loading && <ActivityIndicator size="small" color="#4F4C3B" />}
      </View>
    </TouchableOpacity>
  );
}

function AppleSignInButton({
  loading,
  disabled,
  onPress,
}: {
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <View style={[styles.appleButtonWrap, disabled && styles.disabledButton]} pointerEvents={disabled ? 'none' : 'auto'}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={14}
        onPress={onPress}
        style={styles.appleButton}
      />
      {loading && (
        <View style={styles.appleLoading}>
          <ActivityIndicator size="small" color="#4F4C3B" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 28,
    gap: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(250, 244, 214, 0.48)',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#FAF4D6',
    fontSize: 14,
    fontWeight: '700',
  },
  button: {
    height: 52,
    borderRadius: 13,
    backgroundColor: '#F7F3DE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  appleButtonWrap: {
    height: 52,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  appleButton: {
    width: '100%',
    height: 52,
  },
  appleLoading: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.72,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: 1 }],
  },
  googleIcon: {
    width: 17,
    height: 17,
  },
  buttonText: {
    color: '#3D392C',
    fontSize: 18.5,
    lineHeight: 24,
    fontWeight: '600',
    transform: [{ translateY: 1 }],
  },
  trailing: {
    position: 'absolute',
    right: 14,
    alignItems: 'center',
  },
});
