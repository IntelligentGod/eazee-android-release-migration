import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { auth } from '../../../firebaseConfig';
import { useAuthSession } from '../../context/AuthSessionContext';
import { completeOnboarding } from '@/lib/onboarding';
import { PasswordInput } from './PasswordInput';
import { SocialAuthButtons } from './SocialAuthButtons';
import ScrollViewWithBar from '@/components/ScrollViewWithBar';

const HOME_BACKGROUND_COLORS: [string, string] = ['#F1ECCE', '#8C8268'];
const INPUT_BACKGROUND = '#E8E5D3';
const ACTION_COLOR = '#4F4C3B';
const ARROW_COLOR = '#CEEEFA';
const FIELD_LABEL_COLOR = '#4F4C3B';
const LINK_COLOR = '#FAF4D6';

export default function LoginScreen() {
  const isFocused = useIsFocused();
  const { source } = useLocalSearchParams<{ source?: 'home' | 'onboarding' }>();
  const { user, isLoading } = useAuthSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleForgotPassword = async () => {
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';

    if (!normalizedUsername) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, normalizedUsername);
      Alert.alert('Success', 'Password reset email sent. Please check your inbox.');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error instanceof Error ? error.message : 'An unknown error occurred');
    }
  };

  const handleLogin = async () => {
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedPassword = typeof password === 'string' ? password : '';

    try {
      await signInWithEmailAndPassword(auth, normalizedUsername, normalizedPassword);
      try {
        await completeOnboarding();
      } catch (persistError) {
        console.warn('Failed to persist onboarding completion after login', persistError);
      }
      router.replace('/home');
    } catch (error: any) {
      Alert.alert("Login Failed", error.message);
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
                    if (source === 'home') {
                      router.replace('/home');
                      return;
                    }

                    if (router.canGoBack()) {
                      router.back();
                      return;
                    }

                    router.replace('/home');
                  }}
                >
                  <MaterialIcons name="chevron-left" size={38} color="rgba(0, 0, 0, 0.4)" />
                </TouchableOpacity>
                <Text
                  className="text-2xl font-semibold text-white"
                  style={{ textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 8 }}
                >
                  Log In
                </Text>
              </View>

              <View className="mt-6">
                <Text className="mb-2 text-[15px] font-semibold" style={{ color: FIELD_LABEL_COLOR }}>Email / Username</Text>
                <View className="mb-4 flex-row items-center">
                  <TextInput
                    className="flex-1 h-12 rounded-2xl px-4 text-black"
                    style={{ backgroundColor: INPUT_BACKGROUND }}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                  />
                  <View className="w-10 h-10 ml-3" />
                </View>

                <Text className="mb-2 text-[15px] font-semibold" style={{ color: FIELD_LABEL_COLOR }}>Password</Text>
                <View className="flex-row items-center mb-2">
                  <PasswordInput
                    style={{ flex: 1 }}
                    value={password}
                    onChangeText={setPassword}
                    backgroundColor={INPUT_BACKGROUND}
                    iconColor={ACTION_COLOR}
                  />
                  <TouchableOpacity
                    className="rounded-full w-10 h-10 justify-center items-center ml-3"
                    style={{
                      backgroundColor: ACTION_COLOR,
                      shadowColor: '#000000',
                      shadowOpacity: 0.16,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 4,
                    }}
                    onPress={handleLogin}
                  >
                    <MaterialIcons name="arrow-forward" size={26} color={ARROW_COLOR} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={handleForgotPassword}>
                  <Text className="text-left mt-4 text-[16px] font-semibold" style={{ color: LINK_COLOR }}>Forgot password?</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.navigate({ pathname: '/home/signup', params: source ? { source } : {} })}>
                  <Text className="text-left text-[16px] mt-4 font-semibold" style={{ color: LINK_COLOR }}>Create new account</Text>
                </TouchableOpacity>

                <SocialAuthButtons />
              </View>
            </View>
          </ScrollViewWithBar>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
