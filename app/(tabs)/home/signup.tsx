import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { auth } from '../../../firebaseConfig';
import { useAuthSession } from '../../context/AuthSessionContext';
import { completeOnboarding } from '@/lib/onboarding';
import { startTutorial } from '@/lib/tutorial';
import { PasswordInput } from './PasswordInput';
import { SocialAuthButtons } from './SocialAuthButtons';
import { AuthLegalNotice } from './AuthLegalNotice';
import { requestAiDataSharingConsent } from '@/lib/aiDataSharingConsent';
import ScrollViewWithBar from '@/components/ScrollViewWithBar';

const HOME_BACKGROUND_COLORS: [string, string] = ['#F1ECCE', '#8C8268'];
const INPUT_BACKGROUND = '#E8E5D3';
const ACTION_COLOR = '#4F4C3B';
const FIELD_LABEL_COLOR = '#4F4C3B';
const SUBMIT_BUTTON_BORDER = '#8AE0D1';

export default function SignUpScreen() {
  const isFocused = useIsFocused();
  const { source } = useLocalSearchParams<{ source?: 'home' | 'onboarding' }>();
  const { user, isLoading } = useAuthSession();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');

  const handleSignUp = async () => {
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';

    if (password !== retypePassword) {
      Alert.alert('Passwords do not match');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      if (!userCredential.user) {
        Alert.alert('Error', 'Unable to create your account right now.');
        return;
      }

      await updateProfile(userCredential.user, { displayName: normalizedUsername });
      try {
        await completeOnboarding();
        await requestAiDataSharingConsent(userCredential.user.uid);
        await startTutorial(userCredential.user.uid);
      } catch (persistError) {
        console.warn('Failed to persist onboarding state after sign up', persistError);
      }
      router.replace('/(tabs)/chat');
    } catch (error: any) {
      if (error.code === 'auth/invalid-email') {
        Alert.alert('Invalid email');
      } else if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Email already in use');
      } else if (error.code === 'auth/weak-password') {
        Alert.alert('Password should be at least 6 characters');
      } else {
        Alert.alert('Error', error.message);
        console.error(error);
      }
    }
  };

  if (isLoading) {
    return (
      <LinearGradient
        colors={HOME_BACKGROUND_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ flex: 1, paddingTop: 10 }}
      >
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: -24, left: -12, right: -12, bottom: -24, opacity: 0.10 }}
        >
          <Image
            source={require('../../../assets/images/wave-bg.png')}
            style={{ width: undefined, height: undefined, flex: 1 }}
            resizeMode="cover"
          />
        </View>
        <LinearGradient
          colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.72)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 }}
        />
        <SafeAreaView className="flex-1">
          {isFocused && <StatusBar style="dark" backgroundColor="transparent" translucent />}
          <View className="flex-1 items-center justify-center px-6">
            <ActivityIndicator size="small" color={ACTION_COLOR} />
            <Text className="mt-3 text-[#FAF4D6]">Loading account...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (user) {
    return <Redirect href="/home" />;
  }

  return (
    <LinearGradient
      colors={HOME_BACKGROUND_COLORS}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ flex: 1, paddingTop: 10 }}
    >
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: -24, left: -12, right: -12, bottom: -24, opacity: 0.10 }}
      >
        <Image
          source={require('../../../assets/images/wave-bg.png')}
          style={{ width: undefined, height: undefined, flex: 1 }}
          resizeMode="cover"
        />
      </View>
      <LinearGradient
        colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.72)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 }}
      />
      <SafeAreaView className="flex-1">
        {isFocused && <StatusBar style="dark" backgroundColor="transparent" translucent />}
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollViewWithBar
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="flex-1 px-5 pb-8">
              <View className="flex-row items-center h-9">
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.82}
                  className="-ml-2 mr-1"
                  onPress={() => {
                    if (router.canGoBack()) {
                      router.back();
                      return;
                    }

                    router.replace({ pathname: '/home/login', params: source ? { source } : {} });
                  }}
                >
                  <MaterialIcons name="chevron-left" size={38} color="rgba(0, 0, 0, 0.4)" />
                </TouchableOpacity>
                <Text
                  className="text-2xl font-semibold text-white"
                  style={{ textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 8 }}
                >
                  Sign Up
                </Text>
              </View>

              <View className="mt-6">
                <Text className="mb-2 text-[15px] font-semibold" style={{ color: FIELD_LABEL_COLOR }}>Email</Text>
                <TextInput
                  className="h-12 rounded-2xl px-4 mb-4 text-black"
                  style={{ backgroundColor: INPUT_BACKGROUND }}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <Text className="mb-2 text-[15px] font-semibold" style={{ color: FIELD_LABEL_COLOR }}>Username</Text>
                <TextInput
                  className="h-12 rounded-2xl px-4 mb-4 text-black"
                  style={{ backgroundColor: INPUT_BACKGROUND }}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />

                <Text className="mb-2 text-[15px] font-semibold" style={{ color: FIELD_LABEL_COLOR }}>Password</Text>
                <PasswordInput
                  style={{ marginBottom: 16 }}
                  value={password}
                  onChangeText={setPassword}
                  backgroundColor={INPUT_BACKGROUND}
                  iconColor={ACTION_COLOR}
                />

                <Text className="mb-2 text-[15px] font-semibold" style={{ color: FIELD_LABEL_COLOR }}>Retype Password</Text>
                <PasswordInput
                  style={{ marginBottom: 22 }}
                  value={retypePassword}
                  onChangeText={setRetypePassword}
                  backgroundColor={INPUT_BACKGROUND}
                  iconColor={ACTION_COLOR}
                />

                <AuthLegalNotice actionText="signing up or continuing" />

                <TouchableOpacity
                  className="rounded-2xl mt-4"
                  activeOpacity={0.9}
                  onPress={handleSignUp}
                >
                  <LinearGradient
                    colors={['#23AB93', '#2FB69E']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    className="h-14 rounded-2xl items-center justify-center"
                    style={{
                      borderColor: SUBMIT_BUTTON_BORDER,
                      borderWidth: 1,
                    }}
                  >
                    <Text className="text-[18px] font-semibold text-white">Sign Up</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <SocialAuthButtons showLegalNotice={false} />
              </View>
            </View>
          </ScrollViewWithBar>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
