import type { ReactNode } from 'react';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '@/components/ScreenHeader';
import LiquidGlassIconButton from '@/components/LiquidGlassIconButton';

/** Settings' sand background (same as Home → Settings). */
export const SETTINGS_BACKGROUND_COLORS: [string, string] = ['#F1ECCE', '#8C8268'];

/**
 * A full screen in the Settings look: sand background with the wave texture, a fade at the
 * bottom, the round glass back button and a white title. Used by the screens opened from
 * Settings → Intelligence Personalization (Memory, About me, Your Eazee personality).
 */
export default function SettingsScreenFrame({
  title,
  subtitle,
  right,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <LinearGradient colors={SETTINGS_BACKGROUND_COLORS} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
      <View pointerEvents="none" style={styles.waveLayer}>
        <Image source={require('../assets/images/wave-bg.png')} style={styles.waveImage} resizeMode="cover" />
      </View>
      <LinearGradient
        colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.72)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={styles.shadowLayer}
      />
      <View style={[styles.safeArea, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
        <ScreenHeader
          title={title}
          titleColor="#FFFFFF"
          horizontalPadding={0}
          titlePlacement="left"
          titleStyle={styles.title}
          left={(
            <LiquidGlassIconButton
              debugLabel={`settings-screen:${title}:back`}
              onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home')))}
              size={44}
              fallbackTint="light"
              fallbackBackgroundColor="rgba(255, 255, 255, 0.18)"
              fallbackBorderColor="rgba(255, 255, 255, 0.36)"
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            >
              <MaterialCommunityIcons name="chevron-left" size={38} color="rgba(0, 0, 0, 0.52)" />
            </LiquidGlassIconButton>
          )}
          right={right}
        />
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#8C8268' },
  waveLayer: { position: 'absolute', top: -24, left: -12, right: -12, bottom: -24, opacity: 0.1 },
  waveImage: { width: undefined, height: undefined, flex: 1 },
  shadowLayer: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 },
  safeArea: { flex: 1, paddingHorizontal: 18 },
  title: { fontSize: 24 },
  subtitle: {
    marginTop: 2,
    marginLeft: 56,
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontWeight: '800',
  },
});
