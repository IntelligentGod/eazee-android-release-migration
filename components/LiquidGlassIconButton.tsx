import type { ReactNode } from 'react';
import React from 'react';
import {
  Animated,
  Platform,
  Pressable,
  type GestureResponderEvent,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect';

type LiquidGlassIconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  size?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  glassEffectStyle?: GlassStyle;
  colorScheme?: GlassColorScheme;
  tintColor?: string;
  fallbackTint?: 'light' | 'dark' | 'default';
  fallbackBackgroundColor?: string;
  fallbackBorderColor?: string;
  debugLabel?: string;
  nativeMountDelayMs?: number;
  pressScale?: number;
};

type PressAreaInsets = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

function getPressAreaInset(value: PressableProps['hitSlop'] | PressableProps['pressRetentionOffset'], edge: keyof PressAreaInsets) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return value[edge] ?? 0;
}

function getLiquidGlassRuntimeStatus() {
  if (Platform.OS !== 'ios') {
    return {
      canUseNativeLiquidGlass: false,
      isGlassEffectAPIAvailable: false,
      isLiquidGlassAvailable: false,
    };
  }

  let glassEffectAPIAvailable = false;
  let liquidGlassAvailable = false;

  try {
    glassEffectAPIAvailable = isGlassEffectAPIAvailable();
  } catch {
    glassEffectAPIAvailable = false;
  }

  try {
    liquidGlassAvailable = isLiquidGlassAvailable();
  } catch {
    liquidGlassAvailable = false;
  }

  return {
    canUseNativeLiquidGlass: glassEffectAPIAvailable && liquidGlassAvailable,
    isGlassEffectAPIAvailable: glassEffectAPIAvailable,
    isLiquidGlassAvailable: liquidGlassAvailable,
  };
}

export default function LiquidGlassIconButton({
  children,
  size = 44,
  style,
  contentStyle,
  glassEffectStyle = 'clear',
  colorScheme = 'dark',
  tintColor,
  fallbackTint = 'dark',
  fallbackBackgroundColor = 'rgba(255, 255, 255, 0.16)',
  fallbackBorderColor = 'rgba(255, 255, 255, 0.28)',
  debugLabel: _debugLabel = 'unnamed',
  nativeMountDelayMs = 0,
  pressScale = 1.12,
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  delayLongPress = 500,
  hitSlop,
  pressRetentionOffset,
  ...pressableProps
}: LiquidGlassIconButtonProps) {
  const liquidGlassStatus = getLiquidGlassRuntimeStatus();
  const hasNativeLiquidGlass = liquidGlassStatus.canUseNativeLiquidGlass;
  const [nativeMountReady, setNativeMountReady] = React.useState(!hasNativeLiquidGlass || nativeMountDelayMs <= 0);
  const shouldRenderNativeLiquidGlass = hasNativeLiquidGlass && nativeMountReady;
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const nativeLongPressTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativePressActiveRef = React.useRef(false);
  const nativePressCancelledRef = React.useRef(false);
  const nativeLongPressFiredRef = React.useRef(false);
  const radius = size / 2;
  const baseStyle = [
    styles.button,
    { width: size, height: size, borderRadius: radius },
    style,
  ];
  const longPressDelayMs = delayLongPress ?? 500;
  const retentionOffset = pressRetentionOffset ?? 20;
  void _debugLabel;

  const animatePressScale = React.useCallback((toValue: number) => {
    Animated.spring(scaleAnim, {
      toValue,
      speed: 24,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const clearNativeLongPressTimeout = React.useCallback(() => {
    if (!nativeLongPressTimeoutRef.current) return;
    clearTimeout(nativeLongPressTimeoutRef.current);
    nativeLongPressTimeoutRef.current = null;
  }, []);

  const isWithinNativePressRetention = React.useCallback((event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    return (
      locationX >= -getPressAreaInset(retentionOffset, 'left') &&
      locationX <= size + getPressAreaInset(retentionOffset, 'right') &&
      locationY >= -getPressAreaInset(retentionOffset, 'top') &&
      locationY <= size + getPressAreaInset(retentionOffset, 'bottom')
    );
  }, [retentionOffset, size]);

  React.useEffect(() => {
    if (!hasNativeLiquidGlass) {
      setNativeMountReady(false);
      return;
    }

    if (nativeMountDelayMs <= 0) {
      setNativeMountReady(true);
      return;
    }

    setNativeMountReady(false);
    const timeout = setTimeout(() => {
      setNativeMountReady(true);
    }, nativeMountDelayMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [hasNativeLiquidGlass, nativeMountDelayMs]);

  if (shouldRenderNativeLiquidGlass) {
    return (
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <View style={[baseStyle, styles.nativeLiquidGlassButton, disabled ? styles.disabled : null]}>
          <GlassView
            {...pressableProps}
            isInteractive
            glassEffectStyle={glassEffectStyle}
            colorScheme={colorScheme}
            tintColor={tintColor}
            hitSlop={hitSlop}
            style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
            onStartShouldSetResponder={() => !disabled}
            onResponderGrant={(event) => {
              if (disabled) return;
              nativePressActiveRef.current = true;
              nativePressCancelledRef.current = false;
              nativeLongPressFiredRef.current = false;
              animatePressScale(pressScale);
              onPressIn?.(event as GestureResponderEvent);
              if (onLongPress) {
                nativeLongPressTimeoutRef.current = setTimeout(() => {
                  if (!nativePressActiveRef.current || nativePressCancelledRef.current) return;
                  nativeLongPressFiredRef.current = true;
                  onLongPress(event as GestureResponderEvent);
                }, longPressDelayMs);
              }
            }}
            onResponderMove={(event) => {
              if (disabled || !nativePressActiveRef.current || nativePressCancelledRef.current) return;
              if (isWithinNativePressRetention(event as GestureResponderEvent)) return;

              nativePressCancelledRef.current = true;
              clearNativeLongPressTimeout();
              animatePressScale(1);
              onPressOut?.(event as GestureResponderEvent);
            }}
            onResponderRelease={(event) => {
              if (disabled) return;
              const shouldCallPress =
                nativePressActiveRef.current &&
                !nativePressCancelledRef.current &&
                !nativeLongPressFiredRef.current &&
                isWithinNativePressRetention(event as GestureResponderEvent);
              clearNativeLongPressTimeout();
              animatePressScale(1);
              if (!nativePressCancelledRef.current) {
                onPressOut?.(event as GestureResponderEvent);
              }
              nativePressActiveRef.current = false;
              nativePressCancelledRef.current = false;
              nativeLongPressFiredRef.current = false;
              if (shouldCallPress) {
                onPress?.(event as GestureResponderEvent);
              }
            }}
            onResponderTerminate={(event) => {
              clearNativeLongPressTimeout();
              if (!disabled) {
                animatePressScale(1);
                if (nativePressActiveRef.current && !nativePressCancelledRef.current) {
                  onPressOut?.(event as GestureResponderEvent);
                }
              }
              nativePressActiveRef.current = false;
              nativePressCancelledRef.current = false;
              nativeLongPressFiredRef.current = false;
            }}
          />
          <View pointerEvents="none" style={[styles.content, contentStyle]}>
            {children}
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        {...pressableProps}
        hitSlop={hitSlop}
        pressRetentionOffset={pressRetentionOffset}
        disabled={disabled}
        onPress={onPress}
        onPressIn={(event) => {
          animatePressScale(pressScale);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          animatePressScale(1);
          onPressOut?.(event);
        }}
        onLongPress={(event) => {
          onLongPress?.(event);
        }}
        delayLongPress={longPressDelayMs}
        style={[
          baseStyle,
          {
            backgroundColor: fallbackBackgroundColor,
            borderColor: fallbackBorderColor,
          },
          disabled ? styles.disabled : null,
        ]}
      >
        <BlurView
          pointerEvents="none"
          intensity={38}
          tint={fallbackTint}
          style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
        />
        <View pointerEvents="none" style={[styles.content, contentStyle]}>
          {children}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  nativeLiquidGlassButton: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.48,
  },
});
