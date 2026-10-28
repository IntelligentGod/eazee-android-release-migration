import type { ReactNode } from 'react';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The app's mint background, a shade deeper than onboarding so white cards stand out. */
export const APP_BACKGROUND_COLORS: [string, string] = ['#8EE9D3', '#5FBFAA'];
/** The dark tone's background: the app's teal, deepening toward the bottom. */
export const DARK_BACKGROUND_COLORS: [string, string] = ['#1BB8AF', '#0A4B46'];

/** A screen on the app's mint background with a back button, for account and admin pages. */
export default function SimpleScreen({
  title,
  subtitle,
  right,
  onBack,
  tone = 'light',
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
  /** "dark": the app's dark teal look (used by the personality screens). */
  tone?: 'light' | 'dark';
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const isDark = tone === 'dark';

  return (
    <LinearGradient colors={isDark ? DARK_BACKGROUND_COLORS : APP_BACKGROUND_COLORS} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1, paddingTop: insets.top }}>
      <View
        className="flex-row items-center px-2 py-2"
        style={isDark
          ? { backgroundColor: 'rgba(0, 0, 0, 0.18)', borderBottomWidth: 1, borderBottomColor: 'rgba(174, 255, 232, 0.18)' }
          : { backgroundColor: 'rgba(255, 255, 255, 0.35)', borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.55)' }}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="h-10 w-10 items-center justify-center"
        >
          <MaterialCommunityIcons name="chevron-left" size={30} color={isDark ? '#AEFFE8' : '#0F5A4D'} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold" style={{ color: isDark ? '#F2FFFC' : '#0F5A4D' }} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text className="text-xs" style={{ color: isDark ? 'rgba(174, 255, 232, 0.8)' : '#0B7A69' }} numberOfLines={1}>{subtitle}</Text>}
        </View>
        {right}
      </View>
      <View className="flex-1" style={{ paddingBottom: insets.bottom }}>{children}</View>
    </LinearGradient>
  );
}

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center p-6" style={{ gap: 12 }}>
      <ActivityIndicator color="#0F5A4D" />
      <Text className="text-sm text-gray-500">{label}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center p-6" style={{ gap: 12 }}>
      <Text className="text-center text-sm text-gray-700">{error.message}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onRetry} className="rounded-full bg-[#0F5A4D] px-5 py-2">
        <Text className="font-semibold text-white">Try again</Text>
      </TouchableOpacity>
    </View>
  );
}
