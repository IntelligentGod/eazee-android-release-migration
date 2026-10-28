import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '@/components/ScreenHeader';
import LiquidGlassIconButton from '@/components/LiquidGlassIconButton';
import { useAuthSession } from './context/AuthSessionContext';
import {
  addMemory,
  deleteAllMemories,
  deleteMemory,
  editMemory,
  readCachedMemories,
  refreshMemories,
  setMemoryEnabled,
  subscribeMemories,
  type Memory,
  type MemoryState,
} from '@/lib/memories';

/** The same sand look as Settings → Intelligence Personalization, which opens this screen. */
const BACKGROUND_COLORS: [string, string] = ['#F1ECCE', '#8C8268'];
const CREAM = 'rgba(246, 242, 227, 0.94)';
const CREAM_TEXT = '#4D4A3B';

function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <View style={[styles.toggle, enabled && styles.toggleOn]}>
      <View style={[styles.toggleKnob, enabled && styles.toggleKnobOn]} />
    </View>
  );
}

/** Settings → Intelligence Personalization → Memory: what Eazee remembers about the user. */
export default function MemoriesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<MemoryState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newMemory, setNewMemory] = useState('');

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void readCachedMemories(uid).then((cached) => {
      if (!cancelled) setState(cached);
    });
    void refreshMemories(uid)
      .then((latest) => {
        if (!cancelled) setState(latest);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Couldn’t reach Eazee right now. Showing what’s saved on this phone.');
      });
    const unsubscribe = subscribeMemories((value, changedUserId) => {
      if (changedUserId === uid) setState(value);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid]);

  const run = (action: () => Promise<unknown>) => {
    void action().catch((error) => Alert.alert('Not saved', (error as Error)?.message || 'Please try again.'));
  };

  const saveEdit = (memory: Memory) => {
    const text = draft.trim();
    setEditingId(null);
    if (!uid || !text || text === memory.text) return;
    run(() => editMemory(uid, memory.id, text));
  };

  const addNew = () => {
    const text = newMemory.trim();
    if (!uid || text.length < 2) return;
    setNewMemory('');
    run(() => addMemory(uid, text, 'settings'));
  };

  const sorted = state ? [...state.memories].sort((a, b) => b.updatedAt - a.updatedAt) : [];
  const enabled = state?.enabled ?? true;

  return (
    <View style={styles.root}>
      <LinearGradient colors={BACKGROUND_COLORS} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
      <View pointerEvents="none" style={styles.waveLayer}>
        <Image source={require('../assets/images/wave-bg.png')} style={styles.waveImage} resizeMode="cover" />
      </View>
      <LinearGradient
        colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.72)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={styles.shadowLayer}
      />

      <View style={[styles.safeArea, { paddingTop: insets.top + 8 }]}>
        <ScreenHeader
          title="Memory"
          titleColor="#FFFFFF"
          horizontalPadding={0}
          titlePlacement="left"
          left={(
            <LiquidGlassIconButton
              debugLabel="memories:back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
              size={44}
              fallbackTint="light"
              fallbackBackgroundColor="rgba(255, 255, 255, 0.18)"
              fallbackBorderColor="rgba(255, 255, 255, 0.36)"
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            >
              <MaterialCommunityIcons name="chevron-left" size={38} color="rgba(0, 0, 0, 0.52)" />
            </LiquidGlassIconButton>
          )}
        />

        {!uid || !state ? (
          <View style={styles.center}>
            {uid ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.body}>Sign in to use memory.</Text>}
          </View>
        ) : (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* On/off */}
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: enabled }}
                onPress={() => run(() => setMemoryEnabled(uid, !enabled))}
                style={styles.heroCard}
              >
                <View style={styles.heroTop}>
                  <Text style={styles.heroEmoji}>💭</Text>
                  <Text style={[styles.title, { flex: 1 }]}>Remember things about me</Text>
                  <Toggle enabled={enabled} />
                </View>
                <Text style={styles.body}>
                  {enabled
                    ? 'Eazee notes lasting things you tell it (your work, the people in your life, your routines) and uses them in future chats. It never saves sensitive details unless you ask.'
                    : 'Memory is off. Eazee won’t remember anything new or use what’s saved. Your memories are kept until you delete them.'}
                </Text>
              </Pressable>

              {!!loadError && (
                <View style={styles.notice}>
                  <MaterialCommunityIcons name="cloud-off-outline" size={18} color="#FFFFFF" />
                  <Text style={[styles.meta, { flex: 1, color: '#FFFFFF' }]}>{loadError}</Text>
                </View>
              )}

              {/* Saved memories */}
              <View style={[styles.section, !enabled && styles.dimmed]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionEmoji}>🧠</Text>
                  <Text style={styles.sectionTitle}>Saved memories</Text>
                  {sorted.length > 0 && (
                    <View style={styles.countBadge}>
                      <Text style={styles.countText}>{sorted.length}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.card}>
                  {sorted.length === 0 ? (
                    <View style={styles.empty}>
                      <Text style={styles.emptyEmoji}>🌱</Text>
                      <Text style={styles.label}>Nothing remembered yet</Text>
                      <Text style={[styles.meta, { textAlign: 'center' }]}>
                        Tell Eazee about yourself in a chat, like “I’m a nursing student”, or add something below.
                      </Text>
                    </View>
                  ) : (
                    sorted.map((memory, index) => (
                      <View key={memory.id}>
                        {index > 0 && <View style={styles.divider} />}
                        <View style={styles.memoryRow}>
                          <View style={styles.bullet} />
                          {editingId === memory.id ? (
                            <TextInput
                              value={draft}
                              onChangeText={setDraft}
                              onSubmitEditing={() => saveEdit(memory)}
                              onBlur={() => saveEdit(memory)}
                              autoFocus
                              maxLength={200}
                              returnKeyType="done"
                              style={[styles.input, { flex: 1 }]}
                            />
                          ) : (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Edit memory: ${memory.text}`}
                              style={{ flex: 1 }}
                              onPress={() => {
                                setEditingId(memory.id);
                                setDraft(memory.text);
                              }}
                            >
                              <Text style={styles.memoryText}>{memory.text}</Text>
                              <Text style={styles.meta}>
                                {`${memory.source === 'settings' ? 'Added by you' : 'From chat'} · ${new Date(memory.updatedAt).toLocaleDateString()}`}
                              </Text>
                            </Pressable>
                          )}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Delete memory: ${memory.text}`}
                            hitSlop={10}
                            onPress={() => run(() => deleteMemory(uid, memory.id))}
                            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#FFFFFF" />
                          </Pressable>
                        </View>
                      </View>
                    ))
                  )}
                </View>
                {sorted.length > 0 && <Text style={styles.footnote}>Tap a memory to edit it.</Text>}
              </View>

              {/* Add */}
              <View style={[styles.section, !enabled && styles.dimmed]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionEmoji}>✏️</Text>
                  <Text style={styles.sectionTitle}>Add a memory</Text>
                </View>
                <View style={styles.addRow}>
                  <TextInput
                    value={newMemory}
                    onChangeText={setNewMemory}
                    onSubmitEditing={addNew}
                    placeholder="e.g. Works night shifts on weekends"
                    placeholderTextColor="rgba(255, 255, 255, 0.55)"
                    maxLength={200}
                    editable={enabled}
                    returnKeyType="done"
                    style={[styles.input, { flex: 1 }]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add memory"
                    disabled={!enabled || newMemory.trim().length < 2}
                    onPress={addNew}
                    style={[styles.addButton, (!enabled || newMemory.trim().length < 2) && { opacity: 0.45 }]}
                  >
                    <MaterialCommunityIcons name="plus" size={26} color={CREAM_TEXT} />
                  </Pressable>
                </View>
              </View>

              {sorted.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => Alert.alert(
                    'Delete all memories?',
                    'Eazee will forget everything it remembered about you, on every device. This cannot be undone.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete all', style: 'destructive', onPress: () => run(() => deleteAllMemories(uid)) },
                    ]
                  )}
                  style={styles.deleteAll}
                >
                  <Text style={styles.deleteAllText}>Delete all memories</Text>
                </Pressable>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#8C8268' },
  waveLayer: { position: 'absolute', top: -24, left: -12, right: -12, bottom: -24, opacity: 0.1 },
  waveImage: { width: undefined, height: undefined, flex: 1 },
  shadowLayer: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 },
  safeArea: { flex: 1, paddingHorizontal: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 18, gap: 22 },
  heroCard: {
    borderRadius: 24,
    padding: 18,
    gap: 10,
    backgroundColor: 'rgba(46, 45, 34, 0.36)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroEmoji: { fontSize: 30 },
  title: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '900' },
  label: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  body: { color: 'rgba(255, 255, 255, 0.82)', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  meta: { marginTop: 2, color: 'rgba(255, 255, 255, 0.62)', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(46, 45, 34, 0.45)',
  },
  section: { gap: 10 },
  dimmed: { opacity: 0.5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  sectionEmoji: { fontSize: 20 },
  sectionTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  countBadge: { minWidth: 24, height: 22, borderRadius: 11, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: CREAM },
  countText: { color: CREAM_TEXT, fontSize: 12, fontWeight: '900' },
  card: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'rgba(46, 45, 34, 0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.14)' },
  memoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  bullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: CREAM },
  memoryText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21, fontWeight: '800' },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 22, paddingHorizontal: 8 },
  emptyEmoji: { fontSize: 34 },
  footnote: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 12, fontWeight: '700', paddingHorizontal: 6 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    backgroundColor: 'rgba(46, 45, 34, 0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  addButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: CREAM },
  deleteAll: { alignSelf: 'center', paddingVertical: 8 },
  deleteAllText: { color: '#FFD9CF', fontSize: 14, fontWeight: '900' },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: 'rgba(46, 45, 34, 0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  toggleOn: { backgroundColor: CREAM },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(246, 242, 227, 0.72)' },
  toggleKnobOn: { backgroundColor: CREAM_TEXT, transform: [{ translateX: 20 }] },
});
