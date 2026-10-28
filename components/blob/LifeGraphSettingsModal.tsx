import React, { useRef, useState } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {
  LIFE_GRAPH_MAX_NAME_LENGTH,
  LIFE_GRAPH_MAX_WEEKLY_TARGET,
  LIFE_GRAPH_MIN_WEEKLY_TARGET,
  parseLifeGraphKeywords,
  type LifeGraphNode,
  type LifeGraphNodeId,
  type LifeGraphNodeProgress,
  type LifeGraphSettings,
} from '@/lib/lifeGraph';

type DraftNode = Omit<LifeGraphNode, 'keywords'> & { keywordsText: string };

const SWITCH_TRACK_COLORS = { false: 'rgba(255, 255, 255, 0.22)', true: '#F6F2E3' };

function WeeklyTargetStepper({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Lower weekly target"
        disabled={disabled || value <= LIFE_GRAPH_MIN_WEEKLY_TARGET}
        hitSlop={6}
        onPress={() => onChange(value - 1)}
        style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="minus" size={16} color="#FFFFFF" />
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Raise weekly target"
        disabled={disabled || value >= LIFE_GRAPH_MAX_WEEKLY_TARGET}
        hitSlop={6}
        onPress={() => onChange(value + 1)}
        style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function NodeEditor({
  node,
  completedCount,
  onChange,
}: {
  node: DraftNode;
  completedCount: number;
  onChange: (patch: Partial<DraftNode>) => void;
}) {
  return (
    <View style={[styles.nodeCard, !node.enabled && styles.nodeCardDisabled]}>
      <View style={styles.nodeHeader}>
        <TextInput
          value={node.name}
          onChangeText={(name) => onChange({ name })}
          editable={node.enabled}
          maxLength={LIFE_GRAPH_MAX_NAME_LENGTH}
          placeholder="Node name"
          placeholderTextColor="rgba(255, 255, 255, 0.5)"
          style={styles.nameInput}
          accessibilityLabel="Node name"
        />
        {!node.enabled && <Text style={styles.offLabel}>Off</Text>}
      </View>
      <TextInput
        value={node.keywordsText}
        onChangeText={(keywordsText) => onChange({ keywordsText })}
        editable={node.enabled}
        placeholder="Keywords, comma separated"
        placeholderTextColor="rgba(255, 255, 255, 0.5)"
        autoCapitalize="none"
        style={styles.keywordsInput}
        accessibilityLabel={`${node.name} keywords`}
      />
      <View style={styles.targetRow}>
        <Text style={styles.targetLabel}>
          {`This week ${completedCount} / ${node.weeklyTarget}`}
        </Text>
        <WeeklyTargetStepper
          value={node.weeklyTarget}
          disabled={!node.enabled}
          onChange={(weeklyTarget) => onChange({ weeklyTarget })}
        />
      </View>
    </View>
  );
}

/** A round cream tick that pops when it changes. */
function NodeTick({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    scale.setValue(0.75);
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    onToggle();
  };
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`Show ${label} on the Droplet`}
      hitSlop={4}
      onPress={handlePress}
      style={styles.tickRow}
    >
      <Animated.View style={[styles.tick, checked ? styles.tickOn : styles.tickOff, { transform: [{ scale }] }]}>
        {checked && <MaterialCommunityIcons name="check-bold" size={14} color="#4D4A3B" />}
      </Animated.View>
      <Text style={[styles.tickLabel, !checked && styles.tickLabelOff]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const toDraftNodes = (settings: LifeGraphSettings): DraftNode[] =>
  settings.nodes.map(({ keywords, ...node }) => ({ ...node, keywordsText: keywords.join(', ') }));

/** Face, life graph, node on/off and weekly targets apply right away, like the Home settings; names and keywords save with Save. */
function LifeGraphSettingsForm({
  settings,
  progress,
  onSave,
}: {
  settings: LifeGraphSettings;
  progress: Record<LifeGraphNodeId, LifeGraphNodeProgress>;
  onSave: (settings: LifeGraphSettings) => void;
}) {
  const [current, setCurrent] = useState(settings);
  const [draftNodes, setDraftNodes] = useState<DraftNode[] | null>(null);

  const apply = (next: LifeGraphSettings) => {
    setCurrent(next);
    onSave(next);
  };

  const toggleNode = (id: LifeGraphNodeId) => {
    apply({ ...current, nodes: current.nodes.map((node) => (node.id === id ? { ...node, enabled: !node.enabled } : node)) });
  };

  const updateDraft = (id: LifeGraphNodeId, patch: Partial<DraftNode>) => {
    setDraftNodes((nodes) => nodes && nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)));
    // The target sets how big the node grows, so the Droplet shows it right away instead of
    // only after Save (going back or closing used to drop the change).
    if (patch.weeklyTarget !== undefined) {
      const weeklyTarget = patch.weeklyTarget;
      apply({ ...current, nodes: current.nodes.map((node) => (node.id === id ? { ...node, weeklyTarget } : node)) });
    }
  };

  const saveDraft = () => {
    if (!draftNodes) return;
    apply({
      ...current,
      nodes: draftNodes.map(({ keywordsText, ...node }, index) => ({
        ...node,
        name: node.name.trim() || current.nodes[index].name,
        keywords: parseLifeGraphKeywords(keywordsText),
      })),
    });
    setDraftNodes(null);
  };

  if (draftNodes) {
    return (
      <LinearGradient colors={PANEL_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, styles.editCard]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Droplet settings"
            hitSlop={8}
            onPress={() => setDraftNodes(null)}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={[styles.title, styles.editTitle]}>Edit nodes</Text>
          <View style={styles.closeButton} />
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>
            Each node grows as you complete tasks that mention its name or keywords. Growth resets every week.
          </Text>
          {draftNodes.map((node) => (
            <NodeEditor
              key={node.id}
              node={node}
              completedCount={progress[node.id].completedCount}
              onChange={(patch) => updateDraft(node.id, patch)}
            />
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          onPress={saveDraft}
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
        >
          <Text style={styles.saveButtonText}>Save</Text>
        </Pressable>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={PANEL_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.dropletRow}>
        <View style={styles.dropletFrame}>
          <Image source={require('@/assets/images/blob-gold-shiny.png')} style={styles.dropletImage} resizeMode="cover" />
        </View>
        <View style={styles.dropletInfo}>
          <Text style={styles.dropletTitle}>Droplet Settings</Text>
          {/* The face belongs to the life graph droplet: off (and greyed out) without it. */}
          <View style={[styles.faceRow, !current.lifeGraphEnabled && styles.lifeGraphOff]}>
            <Text style={styles.faceLabel}>Face On/Off</Text>
            <Switch
              value={current.lifeGraphEnabled && current.faceVisible}
              disabled={!current.lifeGraphEnabled}
              onValueChange={(faceVisible) => apply({ ...current, faceVisible })}
              trackColor={SWITCH_TRACK_COLORS}
              thumbColor={current.lifeGraphEnabled && current.faceVisible ? '#4D4A3B' : '#F6F2E3'}
              accessibilityLabel="Show Droplet face"
            />
          </View>
          <View style={styles.faceRow}>
            <Text style={styles.faceLabel}>Life graph</Text>
            <Switch
              value={current.lifeGraphEnabled}
              onValueChange={(lifeGraphEnabled) => apply({ ...current, lifeGraphEnabled })}
              trackColor={SWITCH_TRACK_COLORS}
              thumbColor={current.lifeGraphEnabled ? '#4D4A3B' : '#F6F2E3'}
              accessibilityLabel="Show life graph on the Droplet"
            />
          </View>
        </View>
      </View>

      {/* Centred as one block; the two columns are sized to their names, so they sit close together. */}
      <View
        style={[styles.nodesBlock, !current.lifeGraphEnabled && styles.lifeGraphOff]}
        pointerEvents={current.lifeGraphEnabled ? 'auto' : 'none'}
      >
        <Text style={styles.sectionLabel}>Nodes</Text>
        <View style={styles.tickGrid}>
          {[0, 1].map((column) => (
            <View key={column} style={styles.tickColumn}>
              {current.nodes.filter((_, index) => index % 2 === column).map((node) => (
                <NodeTick key={node.id} label={node.name} checked={node.enabled} onToggle={() => toggleNode(node.id)} />
              ))}
            </View>
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setDraftNodes(toDraftNodes(current))}
        disabled={!current.lifeGraphEnabled}
        hitSlop={6}
        style={({ pressed }) => [styles.editLink, pressed && styles.saveButtonPressed, !current.lifeGraphEnabled && styles.lifeGraphOff]}
      >
        <Text style={styles.editLinkText}>Edit nodes</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color="#F6F2E3" />
      </Pressable>
    </LinearGradient>
  );
}

export default function LifeGraphSettingsModal({
  visible,
  settings,
  progress,
  onSave,
  onClose,
}: {
  visible: boolean;
  settings: LifeGraphSettings;
  progress: Record<LifeGraphNodeId, LifeGraphNodeProgress>;
  onSave: (settings: LifeGraphSettings) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
      {/* The rest of the page stays in view, blurred; tapping it closes the panel. */}
      <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <Pressable accessibilityLabel="Close Droplet settings" onPress={onClose} style={[StyleSheet.absoluteFill, styles.dim]} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
      >
        {/* Mounted only while open, so each opening starts from the saved settings. */}
        {visible && <LifeGraphSettingsForm settings={settings} progress={progress} onSave={onSave} />}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const PANEL_COLORS = ['rgba(140, 130, 104, 0.94)', 'rgba(77, 74, 59, 0.94)'] as const;

const styles = StyleSheet.create({
  // Life graph off: its areas stay visible for reference but can't be changed.
  lifeGraphOff: {
    opacity: 0.4,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dim: {
    backgroundColor: 'rgba(46, 45, 34, 0.18)',
  },
  editCard: {
    maxHeight: '100%',
  },
  editTitle: {
    flex: 1,
    textAlign: 'center',
  },
  dropletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  dropletFrame: {
    width: 108,
    height: 108,
    borderRadius: 24,
    overflow: 'hidden',
  },
  // The picture has a wide margin around the Droplet; zooming in fills the frame with it.
  dropletImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.3 }],
  },
  dropletInfo: {
    flex: 1,
    gap: 4,
  },
  sectionLabel: {
    color: '#FFFFFF',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 10,
  },
  dropletTitle: {
    color: '#E9C766',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  nodesBlock: {
    alignSelf: 'center',
  },
  tickGrid: {
    flexDirection: 'row',
    gap: 28,
    paddingHorizontal: 4,
  },
  tickColumn: {
    gap: 10,
  },
  tickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 8,
  },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: {
    backgroundColor: '#F6F2E3',
  },
  tickOff: {
    borderWidth: 1.5,
    borderColor: 'rgba(246, 242, 227, 0.7)',
  },
  tickLabel: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  tickLabelOff: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  editLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  editLinkText: {
    color: '#F6F2E3',
    fontSize: 13,
    fontWeight: '800',
  },
  offLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '800',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.34)',
    padding: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  pressed: {
    backgroundColor: 'rgba(246, 242, 227, 0.16)',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 4,
  },
  faceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  faceLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  hint: {
    color: 'rgba(255, 255, 255, 0.76)',
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  nodeCard: {
    gap: 8,
    borderRadius: 18,
    padding: 12,
    backgroundColor: 'rgba(246, 242, 227, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  nodeCardDisabled: {
    opacity: 0.55,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nameInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    paddingVertical: 4,
  },
  keywordsInput: {
    color: '#FFFFFF',
    fontSize: 13,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  targetLabel: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 12,
    fontWeight: '700',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  stepperValue: {
    minWidth: 24,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  saveButton: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(246, 242, 227, 0.94)',
  },
  saveButtonPressed: {
    opacity: 0.8,
  },
  saveButtonText: {
    color: '#4D4A3B',
    fontSize: 15,
    fontWeight: '900',
  },
});
