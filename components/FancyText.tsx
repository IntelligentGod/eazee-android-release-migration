import React from 'react';
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  WithSpringConfig,
} from 'react-native-reanimated';
import { ThemedText, ThemedTextProps } from './ThemedText';

export const SPRING_CONFIG = {
  damping: 50,
  stiffness: 400,
  mass: 1,
  overshootClamping: true,
  restDisplacementThreshold: 0.0001,
  restSpeedThreshold: 0.0001,
};

type FancyTextProps = {
  words: string[];
  currentIndex?: SharedValue<number>;
  bounce?: boolean;
  style?: StyleProp<ViewStyle>;
  textProps?: ThemedTextProps;
  springConfig?: WithSpringConfig;
};

const AnimatedThemedText = Animated.createAnimatedComponent(ThemedText);

export default function FancyText({
  words,
  currentIndex: currentIndexProp,
  bounce,
  style,
  textProps,
  springConfig = SPRING_CONFIG,
}: FancyTextProps) {
  const fallbackCurrentIndex = useSharedValue(0);
  const currentIndex = currentIndexProp || fallbackCurrentIndex;

  return (
    <View style={[styles.container, style]}>
      {words.map((word, wordIndex) => (
        <View key={`word-${wordIndex}-${word}`} style={styles.word}>
          {word.split('').map((char, charIndex) => (
            <Character
              key={`char-${wordIndex}-${charIndex}-${char}`}
              char={char}
              currentIndex={currentIndex}
              textProps={textProps}
              charIndex={charIndex}
              wordIndex={wordIndex}
              words={words}
              bounce={bounce}
              springConfig={springConfig}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function Character({
  char,
  currentIndex,
  wordIndex,
  charIndex,
  words,
  bounce = true,
  textProps,
  springConfig,
}: {
  char: string;
  currentIndex: SharedValue<number>;
  wordIndex: number;
  charIndex: number;
  words: string[];
  bounce?: boolean;
  textProps?: ThemedTextProps;
  springConfig?: WithSpringConfig;
}) {
  const prevIndex = useSharedValue(0);
  const mounted = useSharedValue(false);
  const flattenedTextStyle = StyleSheet.flatten(textProps?.style) as TextStyle | undefined;
  const targetOpacity = typeof flattenedTextStyle?.opacity === 'number' ? flattenedTextStyle.opacity : 1;

  const applySpring = (value: number) => {
    'worklet';
    return withSpring(value, springConfig);
  };

  useDerivedValue(() => {
    mounted.value = true;
  });

  useAnimatedReaction(
    () => currentIndex.value,
    (value, prev) => {
      if (typeof prev === 'number') {
        prevIndex.value = prev;
      }
    },
  );

  const animatedStyle = useAnimatedStyle(() => {
    const isActive = currentIndex.value === wordIndex && mounted.value;
    const previousWord = words[prevIndex.value] || '';
    const totalDelay = previousWord.length * 15;
    const delay = (isActive ? totalDelay : 0) + 20 * charIndex;

    return {
      opacity: withDelay(
        Math.max(0, delay - 20),
        applySpring(isActive ? targetOpacity : 0),
      ),
      transform: bounce
        ? [
            {
              translateY: withDelay(delay, applySpring(isActive ? 0 : 10)),
            },
            {
              scale: withDelay(
                delay,
                applySpring(isActive ? 1 : 0.7),
              ),
            },
          ]
        : [],
    };
  });

  return (
    <AnimatedThemedText
      {...textProps}
      style={[styles.text, textProps?.style, animatedStyle]}
    >
      {char === ' ' ? '\u00A0' : char}
    </AnimatedThemedText>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 40,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  word: {
    flexDirection: 'row',
    position: 'absolute',
  },
  text: {
    fontSize: 28,
  },
});
