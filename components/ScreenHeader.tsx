import type { ReactNode } from 'react';
import React from 'react';
import { Keyboard, type StyleProp, StyleSheet, Text, type TextStyle, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SCREEN_HEADER_BOTTOM_SPACING,
  SCREEN_HEADER_MIN_HEIGHT,
  SCREEN_HEADER_TOP_PADDING,
} from '@/constants/screenLayout';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  titleColor?: string;
  subtitleColor?: string;
  horizontalPadding?: number;
  titlePlacement?: 'center' | 'left';
  titleStyle?: StyleProp<TextStyle>;
};

export default function ScreenHeader({
  title,
  subtitle,
  left,
  right,
  titleColor = '#FFFFFF',
  subtitleColor = 'rgba(255,255,255,0.92)',
  horizontalPadding = 16,
  titlePlacement = 'center',
  titleStyle,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const isLeftTitle = titlePlacement === 'left';

  return (
    <View
      onTouchStart={Keyboard.dismiss}
      style={[
        styles.container,
        {
          paddingTop: insets.top + SCREEN_HEADER_TOP_PADDING,
          paddingHorizontal: horizontalPadding,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={isLeftTitle ? styles.leftSideCompact : styles.side}>{left}</View>
        <View style={[styles.titleWrap, isLeftTitle && styles.titleWrapLeft]}>
          <Text numberOfLines={1} style={[styles.title, isLeftTitle && styles.titleLeft, { color: titleColor }, titleStyle]}>
            {title}
          </Text>
          {!!subtitle && (
            <Text numberOfLines={1} style={[styles.subtitle, isLeftTitle && styles.subtitleLeft, { color: subtitleColor }]}>
              {subtitle}
            </Text>
          )}
        </View>
        <View style={[isLeftTitle ? styles.rightSideCompact : styles.side, styles.right]}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: SCREEN_HEADER_BOTTOM_SPACING,
  },
  row: {
    minHeight: SCREEN_HEADER_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flex: 1,
    minHeight: SCREEN_HEADER_MIN_HEIGHT,
    justifyContent: 'center',
  },
  leftSideCompact: {
    minHeight: SCREEN_HEADER_MIN_HEIGHT,
    justifyContent: 'center',
  },
  rightSideCompact: {
    minHeight: SCREEN_HEADER_MIN_HEIGHT,
    justifyContent: 'center',
  },
  right: {
    alignItems: 'flex-end',
  },
  titleWrap: {
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  titleWrapLeft: {
    flex: 1,
    alignItems: 'flex-start',
    paddingLeft: 0,
    paddingRight: 12,
    marginLeft: 10,
    transform: [{ translateY: -2 }],
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  titleLeft: {
    textAlign: 'left',
  },
  subtitle: {
    marginTop: -1,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '500',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  subtitleLeft: {
    textAlign: 'left',
  },
});
