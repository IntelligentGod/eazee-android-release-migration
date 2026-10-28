import React, { ReactNode } from 'react';
import { ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { NestableScrollContainer } from 'react-native-draggable-flatlist';
import WorkspaceScrollBar from '@/components/WorkspaceScrollBar';

/**
 * A todo list page. Its scroll bar shows when more of the list sits below the
 * visible area; scroll state stays in the scroll bar so scrolling never
 * re-renders the whole Todo screen.
 */
export default function WorkspaceScrollArea({
  scrollRef,
  style,
  contentContainerStyle,
  scrollBarColor,
  children,
}: {
  scrollRef: { current: ScrollView | null };
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollBarColor: string;
  children: ReactNode;
}) {
  return (
    <View style={{ flex: 1 }}>
      <NestableScrollContainer
        ref={scrollRef as React.Ref<any>}
        style={style}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        overScrollMode="always"
        contentContainerStyle={contentContainerStyle}
      >
        <WorkspaceScrollBar color={scrollBarColor} />
        {children}
      </NestableScrollContainer>
    </View>
  );
}
