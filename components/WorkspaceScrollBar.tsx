import React from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
// Not part of the package's public exports, but it is the only live source of the
// container's scroll offset: NestableScrollContainer keeps onScroll for itself.
import { useSafeNestableScrollContainerContext } from 'react-native-draggable-flatlist/src/context/nestableScrollContainerContext';

const BAR_WIDTH = 4;
const BAR_INSET = 3;
const MIN_THUMB_HEIGHT = 36;

/**
 * An always-visible scroll bar for a NestableScrollContainer. Render it as the
 * container's first child: it is absolutely positioned inside the scrolling
 * content and moved with the scroll offset on the UI thread, so it stays pinned
 * to the visible area. Hidden when everything fits.
 */
export default function WorkspaceScrollBar({ color }: { color: string }) {
  const { outerScrollOffset, containerSize, scrollViewSize } = useSafeNestableScrollContainerContext();

  const trackStyle = useAnimatedStyle(() => {
    const viewport = containerSize.value;
    const content = scrollViewSize.value;
    const scrollable = viewport > 0 && content > viewport + 1;
    return {
      opacity: scrollable ? 1 : 0,
      height: Math.max(0, viewport - BAR_INSET * 2),
      transform: [{ translateY: outerScrollOffset.value + BAR_INSET }],
    };
  });

  const thumbStyle = useAnimatedStyle(() => {
    const viewport = Math.max(0, containerSize.value - BAR_INSET * 2);
    const content = scrollViewSize.value;
    const maxScroll = Math.max(1, content - containerSize.value);
    const thumbHeight = content > 0 ? Math.min(viewport, Math.max(MIN_THUMB_HEIGHT, (viewport * containerSize.value) / content)) : 0;
    const progress = Math.min(1, Math.max(0, outerScrollOffset.value / maxScroll));
    return {
      height: thumbHeight,
      transform: [{ translateY: progress * (viewport - thumbHeight) }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          right: BAR_INSET,
          width: BAR_WIDTH,
          borderRadius: BAR_WIDTH / 2,
          backgroundColor: 'rgba(255, 255, 255, 0.14)',
          zIndex: 10,
        },
        trackStyle,
      ]}
    >
      <Animated.View style={[{ width: BAR_WIDTH, borderRadius: BAR_WIDTH / 2, backgroundColor: color }, thumbStyle]} />
    </Animated.View>
  );
}
