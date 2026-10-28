import React, { type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';

type OnboardingScaffoldProps = {
  children: ReactNode;
  backgroundColors?: [string, string];
};

const defaultBackgroundColors: [string, string] = ['#AEFFE8', '#8FD9C8'];

export default function OnboardingScaffold({
  children,
  backgroundColors = defaultBackgroundColors,
}: OnboardingScaffoldProps) {
  const isFocused = useIsFocused();

  return (
    <LinearGradient
      colors={backgroundColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.screen}
    >
      <View pointerEvents="none" style={styles.logoLayer}>
        <Image
          source={require('../../assets/images/eazee-bg-screen.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <View pointerEvents="none" style={styles.tintLayer} />
      <SafeAreaView style={styles.safeArea}>
        {isFocused && <StatusBar style="dark" backgroundColor="transparent" translucent />}
        <View style={styles.content}>{children}</View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  tintLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  logoLayer: {
    position: 'absolute',
    top: 40,
    left: -30,
    right: 0,
    alignItems: 'center',
  },
  logo: {
    width: 662,
    height: 664,
    opacity: 0.92,
  },
});
