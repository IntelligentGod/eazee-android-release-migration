import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GuidedTarget } from '@/components/guidance/GuidanceProvider';
import { getTodoWorkspaceGuidanceTargetId } from '@/lib/navigationHelp';

/** The tab names; the lists keep their own keys (Personal, Goals, Wishlist). */
const TAB_LABELS: Record<string, string> = {
  Personal: 'To Do',
  Goals: 'Goals',
  Wishlist: 'Wishlist',
};

/**
 * Tabs across the top of the To Do screen, one per list. Tapping a tab opens
 * that list; swiping between lists still works and moves the selection. Each
 * tab keeps the list's tutorial target, so the guided tour can point at it.
 */
export default function TodoWorkspaceTabs({
  workspaces,
  activeIndex,
  onSelect,
}: {
  workspaces: { key: string; displayName?: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.bar}>
      {workspaces.map((workspace, index) => {
        const selected = index === activeIndex;
        const label = TAB_LABELS[workspace.key] ?? workspace.displayName ?? workspace.key;
        return (
          <GuidedTarget
            key={workspace.key}
            targetId={getTodoWorkspaceGuidanceTargetId(workspace.key)}
            label={label}
            localHighlightRadius={999}
            style={styles.tabSlot}
          >
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              activeOpacity={0.8}
              onPress={() => onSelect(index)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
            </TouchableOpacity>
          </GuidedTarget>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  tabSlot: {
    flex: 1,
  },
  tab: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 8,
  },
  tabSelected: {
    backgroundColor: 'rgba(190, 240, 226, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontSize: 15,
    fontWeight: '700',
  },
  labelSelected: {
    color: '#0F5A4D',
  },
});
