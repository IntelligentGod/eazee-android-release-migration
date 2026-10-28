import React, { forwardRef, useCallback } from 'react';
import type { LayoutChangeEvent, ScrollView, ScrollViewProps } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

const BAR_WIDTH = 4;
const BAR_INSET = 3;
const MIN_THUMB_HEIGHT = 36;
const DEFAULT_THUMB_COLOR = 'rgba(255, 255, 255, 0.7)';

/**
 * The app's always-visible scroll bar, the same one the To Do lists use. It sits
 * inside the scrolling content and follows the scroll offset on the UI thread,
 * so it stays pinned to the visible area. Hidden when everything fits.
 */
function ScrollBar({
  color,
  offset,
  viewport,
  content,
}: {
  color: string;
  offset: SharedValue<number>;
  viewport: SharedValue<number>;
  content: SharedValue<number>;
}) {
  const trackStyle = useAnimatedStyle(() => {
    const scrollable = viewport.value > 0 && content.value > viewport.value + 1;
    return {
      opacity: scrollable ? 1 : 0,
      height: Math.max(0, viewport.value - BAR_INSET * 2),
      transform: [{ translateY: offset.value + BAR_INSET }],
    };
  });

  const thumbStyle = useAnimatedStyle(() => {
    const track = Math.max(0, viewport.value - BAR_INSET * 2);
    const maxScroll = Math.max(1, content.value - viewport.value);
    const thumbHeight = content.value > 0
      ? Math.min(track, Math.max(MIN_THUMB_HEIGHT, (track * viewport.value) / content.value))
      : 0;
    const progress = Math.min(1, Math.max(0, offset.value / maxScroll));
    return {
      height: thumbHeight,
      transform: [{ translateY: progress * (track - thumbHeight) }],
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
          // Android draws cards with a shadow above anything without one.
          elevation: 24,
        },
        trackStyle,
      ]}
    >
      <Animated.View style={[{ width: BAR_WIDTH, borderRadius: BAR_WIDTH / 2, backgroundColor: color }, thumbStyle]} />
    </Animated.View>
  );
}

/** A vertical ScrollView that shows the app's scroll bar instead of the system one. */
const ScrollViewWithBar = forwardRef<ScrollView, ScrollViewProps & { scrollBarColor?: string }>(function ScrollViewWithBar(
  { scrollBarColor = DEFAULT_THUMB_COLOR, children, onLayout, onContentSizeChange, ...props },
  ref
) {
  const animatedRef = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollViewOffset(animatedRef);
  const viewport = useSharedValue(0);
  const content = useSharedValue(0);

  // Callers keep their own ref (scrollTo and the like) alongside the one the bar reads.
  const setRef = useCallback((node: any) => {
    animatedRef(node);
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [animatedRef, ref]);

  return (
    <Animated.ScrollView
      {...props}
      ref={setRef}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={props.scrollEventThrottle ?? 16}
      onLayout={(event: LayoutChangeEvent) => {
        viewport.value = event.nativeEvent.layout.height;
        onLayout?.(event);
      }}
      onContentSizeChange={(width: number, height: number) => {
        content.value = height;
        onContentSizeChange?.(width, height);
      }}
    >
      <ScrollBar color={scrollBarColor} offset={offset} viewport={viewport} content={content} />
      {children}
    </Animated.ScrollView>
  );
});

export default ScrollViewWithBar;
