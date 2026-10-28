import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, Text, View } from 'react-native';

/**
 * A full-screen wait for the AI's first reply. It sits in a Modal so it also
 * covers the tab bar, and it swallows every touch, so nothing can be changed while
 * the request is being prepared. With `onCancel`, a Cancel button (and the Android
 * back button) stops the wait.
 */
export default function AiReplyLoadingOverlay({
  visible,
  title,
  subtitle,
  onCancel,
  cancelLabel = 'Cancel',
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  // A looping animation has to be started and stopped with the overlay.
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => onCancel?.()}>
      <View
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: 'rgba(0, 20, 18, 0.55)' }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 320,
            alignItems: 'center',
            paddingVertical: 28,
            paddingHorizontal: 24,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: 'rgba(200, 255, 251, 0.25)',
            backgroundColor: '#10403C',
          }}
        >
          <Animated.Image
            source={require('../assets/images/eazee-logo-big.png')}
            resizeMode="contain"
            style={{
              width: 56,
              height: 56,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
              transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [4, -4] }) }],
            }}
          />
          <ActivityIndicator color="#C8FFFB" style={{ marginTop: 16 }} />
          <Text style={{ marginTop: 14, color: '#FFFFFF', fontSize: 17, fontWeight: '800', textAlign: 'center' }}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={{ marginTop: 6, color: 'rgba(200, 255, 251, 0.85)', fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
              {subtitle}
            </Text>
          )}
          {!!onCancel && (
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              hitSlop={8}
              style={({ pressed }) => ({
                marginTop: 20,
                minHeight: 42,
                paddingHorizontal: 24,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(200, 255, 251, 0.35)',
                backgroundColor: 'rgba(200, 255, 251, 0.1)',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>{cancelLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}
