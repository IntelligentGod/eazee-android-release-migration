import React, { useCallback, useEffect } from 'react';
import {
  type AccessibilityRole,
  type AccessibilityState,
  Alert,
  Animated,
  BackHandler,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import ScreenHeader from '@/components/ScreenHeader';
import LiquidGlassIconButton from '@/components/LiquidGlassIconButton';
import LowerSwipeGesture from '@/components/navigation/LowerSwipeGesture';
import { GuidedTarget } from '@/components/guidance/GuidanceProvider';
import PaywallPanel from './PaywallPanel';
import { useRoleSession } from '@/app/context/RoleSessionContext';
import { isStaffRole } from '@/lib/userRole';
import { useSubscriptionStatus } from '@/lib/useSubscriptionStatus';
import {
  getHomeAccountGuidanceTargetId,
  getHomeBackGuidanceTargetId,
  getHomeSettingsBackGuidanceTargetId,
  getHomeSettingsControlGuidanceTargetId,
  getHomeSettingsPanelGuidanceTargetId,
  type NavigationHelpMode,
} from '@/lib/navigationHelp';
import { useLeftHandedMode } from '@/lib/useLeftHandedMode';
import { useNavigationHelpMode } from '@/lib/useNavigationHelpMode';
import {
  AI_BASE_PERSONALIZATION_OPTIONS,
  AI_PERSONALIZATION_LEVEL_OPTIONS,
  AI_RESPONSE_LENGTH_OPTIONS,
  type AiBasePersonalization,
  type AiPersonalizationLevel,
  type AiResponseLength,
} from '@/lib/aiPersonalization';
import { useAiPersonalization } from '@/lib/useAiPersonalization';
import {
  deleteAllSavedPreferences,
  EMPTY_SAVED_PREFERENCES,
  readSavedPreferences,
  removeSavedPreference,
  SAVED_PREFERENCE_FIELDS,
  saveSavedPreference,
  setSavedPreferencesEnabled,
  subscribeSavedPreferences,
  type SavedPreferenceField,
  type SavedPreferencesStore,
} from '@/lib/aiSavedPreferences';
import { type HomeCardId } from '@/lib/homePersonalization';
import { useHomePersonalization } from '@/lib/useHomePersonalization';
import {
  isNativeLiquidGlassMenuAvailable,
  LiquidGlassMenu,
} from '@/modules/expo-liquid-glass-menu';
import { startTutorial } from '@/lib/tutorial';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/legalLinks';
import * as WebBrowser from 'expo-web-browser';
import SupportContactDialog from '@/components/SupportContactDialog';
import {
  DEFAULT_EVENT_REMINDER_SETTINGS,
  EVENT_REMINDER_MINUTE_OPTIONS,
  readEventReminderSettings,
  syncEventReminders,
  writeEventReminderSettings,
  type EventReminderMinutes,
} from '@/lib/eventNotifications';
import { ensureNotificationPermission } from '@/lib/todoNotifications';
import { cancelInactivityNudge, readInactivityNudgeEnabled, scheduleInactivityNudge, writeInactivityNudgeEnabled } from '@/lib/inactivityNudge';
import ScrollViewWithBar from '@/components/ScrollViewWithBar';

type HomeSettingsSheetProps = {
  bottomInset: number;
  swipeBandHeight: number;
  userId?: string | null;
  visible: boolean;
  initialFocusPanel?: string;
  initialFocusNonce?: string;
  onClose: () => void;
  onOpenManageAccount: () => void;
};

type HomeSettingsPanel = 'settings' | 'paywall' | 'aiPersonalization' | 'homePersonalization' | 'legalSupport';

const HOME_BACKGROUND_COLORS: [string, string] = ['#F1ECCE', '#8C8268'];
const SETTINGS_ACCENT_ICON_COLOR = '#AEFFE8';
const SETTINGS_ACCENT_ICON_SIZE = 38;

function normalizeHomeSettingsPanel(value?: string): HomeSettingsPanel {
  if (
    value === 'paywall'
    || value === 'aiPersonalization'
    || value === 'homePersonalization'
    || value === 'legalSupport'
  ) {
    return value;
  }
  return 'settings';
}

function SettingsRow({
  icon,
  label,
  targetId,
  disabled,
  onPress,
  right,
  accessibilityRole,
  accessibilityState,
}: {
  icon: React.ReactNode;
  label: string;
  targetId?: string;
  disabled?: boolean;
  onPress?: () => void;
  right?: React.ReactNode;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
}) {
  const rowContent = (
    <>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
      </View>
      {!!right && <View style={styles.rowRight}>{right}</View>}
    </>
  );

  const row = onPress ? (
    <TouchableOpacity
      activeOpacity={0.76}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, disabled && styles.rowDisabled]}
    >
      {rowContent}
    </TouchableOpacity>
  ) : (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      {rowContent}
    </View>
  );

  if (!targetId) return row;

  return (
    <GuidedTarget
      targetId={targetId}
      label={label}
      localHighlightRadius={22}
      localHighlightShape="rect"
    >
      {row}
    </GuidedTarget>
  );
}

function NavigationModeToggle() {
  const { mode, setMode } = useNavigationHelpMode();
  const options: { value: NavigationHelpMode; label: string }[] = [
    { value: 'guide', label: 'Guided' },
    { value: 'shortcut', label: 'Direct' },
  ];

  return (
    <View style={styles.modeToggle}>
      {options.map((option) => {
        const selected = mode === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!selected) {
                void setMode(option.value);
              }
            }}
            style={[styles.modeOption, selected && styles.modeOptionSelected]}
          >
            <Text style={[styles.modeOptionText, selected && styles.modeOptionTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const EVENT_REMINDER_TIME_OPTIONS = EVENT_REMINDER_MINUTE_OPTIONS.map((minutes) => ({
  value: String(minutes),
  label: `${minutes} minutes before`,
}));

/** An on/off switch, and when on, how long before each event to remind. */
function EventRemindersSetting() {
  const [minutesBefore, setMinutesBefore] = React.useState<EventReminderMinutes | null>(
    DEFAULT_EVENT_REMINDER_SETTINGS.minutesBefore
  );
  // Turning reminders back on keeps the time the user chose before.
  const [lastMinutesBefore, setLastMinutesBefore] = React.useState<EventReminderMinutes>(
    DEFAULT_EVENT_REMINDER_SETTINGS.minutesBefore ?? 10
  );

  useEffect(() => {
    let cancelled = false;
    void readEventReminderSettings().then((settings) => {
      if (cancelled) return;
      setMinutesBefore(settings.minutesBefore);
      if (settings.minutesBefore !== null) setLastMinutesBefore(settings.minutesBefore);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = async (value: EventReminderMinutes | null) => {
    if (value !== null) {
      const permission = await ensureNotificationPermission();
      if (!permission.granted) {
        Alert.alert('Notifications are off', 'Allow notifications for Eazee in your phone settings to get event reminders.');
        return;
      }
      setLastMinutesBefore(value);
    }
    setMinutesBefore(value);
    await writeEventReminderSettings({ minutesBefore: value });
    void syncEventReminders();
  };

  const isEnabled = minutesBefore !== null;

  return (
    <View>
      <SettingsRow
        icon={<Text allowFontScaling={false} style={styles.rowEmoji}>🔔</Text>}
        label="Event Reminders"
        onPress={() => void handleSelect(isEnabled ? null : lastMinutesBefore)}
        accessibilityRole="switch"
        accessibilityState={{ checked: isEnabled }}
        right={<LeftHandedToggle enabled={isEnabled} />}
      />
      {isEnabled && (
        <View style={styles.eventReminderTiming}>
          <PersonalizationMenuPicker
            label="Remind me"
            value={String(minutesBefore)}
            options={EVENT_REMINDER_TIME_OPTIONS}
            onChange={(value) => void handleSelect(Number(value) as EventReminderMinutes)}
          />
        </View>
      )}
    </View>
  );
}

/** The 2-day "come back" notification; turning it on asks for notification permission if needed. */
function CheckInReminderRow() {
  const [enabled, setEnabled] = React.useState(true);

  useEffect(() => {
    let cancelled = false;
    void readInactivityNudgeEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async () => {
    const next = !enabled;
    if (next) {
      const permission = await ensureNotificationPermission();
      if (!permission.granted) {
        Alert.alert('Notifications are off', 'Allow notifications for Eazee in your phone settings to get check-in reminders.');
        return;
      }
    }
    setEnabled(next);
    await writeInactivityNudgeEnabled(next);
    void (next ? scheduleInactivityNudge() : cancelInactivityNudge()).catch(() => {});
  };

  return (
    <SettingsRow
      icon={<Text allowFontScaling={false} style={styles.rowEmoji}>👋</Text>}
      label="Check-in Reminders"
      onPress={() => void handleToggle()}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      right={<LeftHandedToggle enabled={enabled} />}
    />
  );
}

function LeftHandedToggle({ enabled }: { enabled: boolean }) {
  return (
    <View style={[styles.binaryToggle, enabled && styles.binaryToggleActive]}>
      <View style={[styles.binaryToggleKnob, enabled && styles.binaryToggleKnobActive]} />
    </View>
  );
}

type PersonalizationMenuValue = AiBasePersonalization | AiPersonalizationLevel | AiResponseLength | string;

function PersonalizationMenuPicker<T extends PersonalizationMenuValue>({
  label,
  targetId,
  value,
  options,
  onChange,
}: {
  label: string;
  targetId?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label || 'Default';
  const usesNativeMenu = isNativeLiquidGlassMenuAvailable();

  const content = (
    <View style={styles.baseStyleSetting}>
      <View style={styles.baseStyleRow}>
        <Text style={styles.settingLabel}>{label}</Text>
        {usesNativeMenu ? (
          <LiquidGlassMenu
            accessibilityLabel={`${label}, ${selectedLabel}`}
            onOptionSelected={({ nativeEvent }) => {
              const nextValue = options.find(
                (option) => option.value === nativeEvent.value
              )?.value;
              if (nextValue) {
                onChange(nextValue);
              }
            }}
            options={options}
            selectedValue={value}
            style={styles.baseStyleNativeMenu}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
            onPress={() => setIsOpen(true)}
            style={({ pressed }) => [styles.baseStyleBubble, pressed && styles.baseStyleBubblePressed]}
          >
            <Text style={styles.baseStyleBubbleText}>{selectedLabel}</Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color="#4D4A3B" />
          </Pressable>
        )}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
        transparent
        visible={!usesNativeMenu && isOpen}
      >
        <View style={styles.baseStyleModalOverlay}>
          <TouchableWithoutFeedback onPress={() => setIsOpen(false)}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>

          <LinearGradient
            colors={['#8C8268', '#4D4A3B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.baseStyleModalCard}
          >
            <View style={styles.baseStyleModalHeader}>
              <Text style={styles.baseStyleModalTitle}>{label}</Text>
              <Pressable
                accessibilityLabel={`Close ${label.toLowerCase()} picker`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setIsOpen(false)}
                style={({ pressed }) => [
                  styles.baseStyleModalCloseButton,
                  pressed && styles.baseStyleModalCloseButtonPressed,
                ]}
              >
                <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={styles.baseStyleModalOptions}>
              {options.map((option) => {
                const selected = value === option.value;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.baseStyleModalOption,
                      selected && styles.baseStyleModalOptionSelected,
                      pressed && styles.baseStyleModalOptionPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.baseStyleModalOptionText,
                        selected && styles.baseStyleModalOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {selected && (
                      <MaterialCommunityIcons name="check-circle" size={20} color="#4D4A3B" />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </View>
  );

  if (!targetId) return content;

  return (
    <GuidedTarget targetId={targetId} label={label} localHighlightRadius={22} localHighlightShape="rect">
      {content}
    </GuidedTarget>
  );
}

const NOT_SET = 'not_set';
const SAVED_PREFERENCE_SOURCE_LABELS = { onboarding: 'from your first chat', chat: 'from chat', settings: 'set here' } as const;

/** Preferences saved from chat ("Remember this"); each can be changed or removed, or all turned off. */
function SavedPreferencesSection({ userId }: { userId?: string | null }) {
  const [store, setStore] = React.useState<SavedPreferencesStore>(EMPTY_SAVED_PREFERENCES);

  useEffect(() => {
    let cancelled = false;
    void readSavedPreferences(userId).then((value) => {
      if (!cancelled) setStore(value);
    });
    const unsubscribe = subscribeSavedPreferences((value, changedUserId) => {
      if (changedUserId === userId) setStore(value);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  if (!userId) return null;

  const handleChange = (field: SavedPreferenceField, value: string) => {
    void (value === NOT_SET
      ? removeSavedPreference(userId, field)
      : saveSavedPreference(userId, field, value, 'settings')
    ).catch(() => Alert.alert('Not saved', 'That preference could not be saved. Please try again.'));
  };

  const handleDeleteAll = () => {
    Alert.alert(
      'Delete saved preferences?',
      'Eazee will stop using everything it saved about how you like answers. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteAllSavedPreferences(userId) },
      ]
    );
  };

  return (
    <PersonalizationSection emoji="⭐" title="Saved preferences">
      <Text style={styles.aiSectionHint}>
        Things you asked Eazee to remember. Your request in a chat always comes first.
      </Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: store.enabled }}
        onPress={() => void setSavedPreferencesEnabled(userId, !store.enabled)}
        style={styles.baseStyleRow}
      >
        <Text style={styles.settingLabel}>Use saved preferences</Text>
        <LeftHandedToggle enabled={store.enabled} />
      </Pressable>
      {(Object.keys(SAVED_PREFERENCE_FIELDS) as SavedPreferenceField[]).map((field) => {
        const saved = store.preferences.find((item) => item.field === field);
        return (
          <View key={field} style={!store.enabled && styles.aiDimmed}>
            <View style={styles.aiDivider} />
            <PersonalizationMenuPicker
              label={SAVED_PREFERENCE_FIELDS[field].label}
              value={saved?.value || NOT_SET}
              options={[
                { value: NOT_SET, label: 'Not set' },
                ...SAVED_PREFERENCE_FIELDS[field].options.map((option) => ({ value: option.value, label: option.label })),
              ]}
              onChange={(value) => handleChange(field, value)}
            />
            {!!saved && (
              <Text style={styles.aiRowMeta}>
                {`Saved ${SAVED_PREFERENCE_SOURCE_LABELS[saved.source]}, ${new Date(saved.updatedAt).toLocaleDateString()}`}
              </Text>
            )}
          </View>
        );
      })}
      {store.preferences.length > 0 && (
        <Pressable accessibilityRole="button" onPress={handleDeleteAll} style={styles.aiDeleteLink} hitSlop={8}>
          <Text style={styles.aiDeleteText}>Delete saved preferences</Text>
        </Pressable>
      )}
    </PersonalizationSection>
  );
}

/** A titled group on the Intelligence Personalization screen. */
function PersonalizationSection({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.aiSection}>
      <View style={styles.aiSectionHeader}>
        <Text style={styles.aiSectionEmoji}>{emoji}</Text>
        <Text style={styles.aiSectionTitle}>{title}</Text>
      </View>
      <View style={styles.aiCard}>{children}</View>
    </View>
  );
}

/** A row that opens another screen, like the rows on the main Settings page. */
function PersonalizationLinkRow({
  emoji,
  label,
  detail,
  onPress,
}: {
  emoji: string;
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.aiLinkRow, pressed && styles.baseStyleBubblePressed]}
    >
      <Text style={styles.aiLinkEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.aiLinkDetail}>{detail}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={26} color="rgba(255, 255, 255, 0.85)" />
    </Pressable>
  );
}

function AiPersonalizationPanel({
  bottomInset,
  userId,
  onBack,
}: {
  bottomInset: number;
  userId?: string | null;
  onBack: () => void;
}) {
  const {
    draft,
    updateDraft,
    save,
    isSaving,
    errorMessage,
    hasChanges,
  } = useAiPersonalization(userId);

  const handleSave = useCallback(() => {
    void save();
  }, [save]);

  return (
    <View style={[styles.safeArea, { paddingBottom: bottomInset + 18 }]}>
      <ScreenHeader
        title="Intelligence Personalization"
        titleColor="#FFFFFF"
        horizontalPadding={0}
        titlePlacement="left"
        titleStyle={styles.personalizationHeaderTitle}
        left={(
          <GuidedTarget
            targetId={getHomeSettingsBackGuidanceTargetId()}
            label="Back"
            localHighlightRadius={999}
            localHighlightInset={4}
          >
            <LiquidGlassIconButton
              debugLabel="home:settings:ai-personalization:back"
              onPress={onBack}
              size={44}
              style={styles.headerButton}
              fallbackTint="light"
              fallbackBackgroundColor="rgba(255, 255, 255, 0.18)"
              fallbackBorderColor="rgba(255, 255, 255, 0.36)"
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            >
              <MaterialCommunityIcons name="chevron-left" size={38} color="rgba(0, 0, 0, 0.52)" />
            </LiquidGlassIconButton>
          </GuidedTarget>
        )}
      />

      <ScrollViewWithBar
        style={styles.personalizationScroll}
        contentContainerStyle={styles.personalizationContent}
      >
        <Text style={styles.aiIntro}>How Eazee talks to you, and what it knows about you.</Text>

        <PersonalizationSection emoji="💬" title="How Eazee talks">
          <PersonalizationMenuPicker
            label="Personality"
            targetId={getHomeSettingsControlGuidanceTargetId('aiBasePersonalization')}
            value={draft.baseStyle}
            options={AI_BASE_PERSONALIZATION_OPTIONS}
            onChange={(baseStyle) => updateDraft({ baseStyle })}
          />
          <View style={styles.aiDivider} />
          <PersonalizationMenuPicker
            label="Emoji"
            targetId={getHomeSettingsControlGuidanceTargetId('aiEmoji')}
            value={draft.emoji}
            options={AI_PERSONALIZATION_LEVEL_OPTIONS}
            onChange={(emoji) => updateDraft({ emoji })}
          />
          <View style={styles.aiDivider} />
          <PersonalizationMenuPicker
            label="Response length"
            targetId={getHomeSettingsControlGuidanceTargetId('aiResponseLength')}
            value={draft.responseLength}
            options={AI_RESPONSE_LENGTH_OPTIONS}
            onChange={(responseLength) => updateDraft({ responseLength })}
          />
          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
          {/* Only while there is something to save, so a settled screen stays calm. */}
          {(hasChanges || isSaving) && (
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={handleSave}
              style={[styles.saveButton, styles.aiSaveButton]}
            >
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving…' : 'Save changes'}</Text>
            </Pressable>
          )}
        </PersonalizationSection>

        {!!userId && (
          <PersonalizationSection emoji="🧠" title="What Eazee knows about you">
            <PersonalizationLinkRow
              emoji="💭"
              label="Memory"
              detail="Things Eazee remembers from your chats"
              onPress={() => router.push('/memories')}
            />
            <View style={styles.aiDivider} />
            <PersonalizationLinkRow
              emoji="🙋"
              label="About me"
              detail="Your answers and personality result"
              onPress={() => router.push({ pathname: '/about-me', params: { entry: 'settings' } })}
            />
          </PersonalizationSection>
        )}

        <SavedPreferencesSection userId={userId} />
      </ScrollViewWithBar>
    </View>
  );
}

const HOME_CARD_LABELS: Record<HomeCardId, string> = {
  nextStep: 'Next step',
  suggestions: 'Suggestions',
  todayPlan: "Today's plan",
};

function HomePersonalizationPanel({
  bottomInset,
  onBack,
  userId,
}: {
  bottomInset: number;
  onBack: () => void;
  userId?: string | null;
}) {
  const { settings, setOrder, setSuggestionsEnabled } = useHomePersonalization(userId);

  const moveCard = useCallback((item: HomeCardId, direction: -1 | 1) => {
    const currentIndex = settings.order.indexOf(item);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= settings.order.length) {
      return;
    }

    const nextOrder = [...settings.order];
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
    setOrder(nextOrder);
  }, [setOrder, settings.order]);

  const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<HomeCardId>) => {
    const itemIndex = settings.order.indexOf(item);
    const isFirst = itemIndex === 0;
    const isLast = itemIndex === settings.order.length - 1;
    // Picked up from the handle (straight away) or by pressing and holding anywhere on the row.
    const startDrag = () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      drag();
    };

    return (
      <GuidedTarget
        targetId={getHomeSettingsControlGuidanceTargetId(
          item === 'nextStep' ? 'homeNextStep' : item === 'suggestions' ? 'homeSuggestions' : 'homeTodayPlan'
        )}
        label={HOME_CARD_LABELS[item]}
        localHighlightRadius={22}
        localHighlightShape="rect"
      >
        <TouchableOpacity
          accessible={false}
          activeOpacity={0.9}
          delayLongPress={220}
          disabled={isActive}
          onLongPress={startDrag}
          style={[styles.homeCardOrderRow, isActive && styles.homeCardOrderRowActive]}
        >
          <TouchableOpacity
            accessibilityActions={[
              ...(itemIndex > 0 ? [{ label: 'Move up', name: 'decrement' as const }] : []),
              ...(itemIndex < settings.order.length - 1 ? [{ label: 'Move down', name: 'increment' as const }] : []),
            ]}
            accessibilityLabel={`${HOME_CARD_LABELS[item]}, position ${itemIndex + 1} of ${settings.order.length}`}
            accessibilityRole="adjustable"
            activeOpacity={0.72}
            disabled={isActive}
            hitSlop={8}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'decrement') {
                moveCard(item, -1);
              } else if (nativeEvent.actionName === 'increment') {
                moveCard(item, 1);
              }
            }}
            onPressIn={startDrag}
            style={styles.homeCardDragHandle}
          >
            <MaterialCommunityIcons name="drag" size={26} color="rgba(255, 255, 255, 0.82)" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.homeCardOrderLabel}>{HOME_CARD_LABELS[item]}</Text>
            {item === 'suggestions' && (
              <Text style={styles.homeCardOrderNote}>Shows on Home when you have free time</Text>
            )}
          </View>
          {/* Tap to move, for when dragging is awkward. */}
          <View style={styles.homeCardMoveButtons}>
            <TouchableOpacity
              accessibilityLabel={`Move ${HOME_CARD_LABELS[item]} up`}
              accessibilityRole="button"
              accessibilityState={{ disabled: isFirst }}
              activeOpacity={0.72}
              disabled={isFirst || isActive}
              hitSlop={6}
              onPress={() => moveCard(item, -1)}
              style={[styles.homeCardMoveButton, isFirst && styles.homeCardMoveButtonDisabled]}
            >
              <MaterialCommunityIcons name="chevron-up" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={`Move ${HOME_CARD_LABELS[item]} down`}
              accessibilityRole="button"
              accessibilityState={{ disabled: isLast }}
              activeOpacity={0.72}
              disabled={isLast || isActive}
              hitSlop={6}
              onPress={() => moveCard(item, 1)}
              style={[styles.homeCardMoveButton, isLast && styles.homeCardMoveButtonDisabled]}
            >
              <MaterialCommunityIcons name="chevron-down" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {item === 'suggestions' && (
            <TouchableOpacity
              accessibilityLabel="Show Suggestions on Home"
              accessibilityRole="switch"
              accessibilityState={{ checked: settings.suggestionsEnabled }}
              activeOpacity={0.72}
              hitSlop={8}
              onPress={() => setSuggestionsEnabled(!settings.suggestionsEnabled)}
            >
              <LeftHandedToggle enabled={settings.suggestionsEnabled} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </GuidedTarget>
    );
  }, [moveCard, setSuggestionsEnabled, settings.order, settings.suggestionsEnabled]);

  return (
    <View style={[styles.safeArea, { paddingBottom: bottomInset + 18 }]}>
      <ScreenHeader
        title="Home Personalization"
        titleColor="#FFFFFF"
        horizontalPadding={0}
        titlePlacement="left"
        titleStyle={styles.personalizationHeaderTitle}
        left={(
          <GuidedTarget
            targetId={getHomeSettingsBackGuidanceTargetId()}
            label="Back"
            localHighlightRadius={999}
            localHighlightInset={4}
          >
            <LiquidGlassIconButton
              debugLabel="home:settings:home-personalization:back"
              onPress={onBack}
              size={44}
              style={styles.headerButton}
              fallbackTint="light"
              fallbackBackgroundColor="rgba(255, 255, 255, 0.18)"
              fallbackBorderColor="rgba(255, 255, 255, 0.36)"
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            >
              <MaterialCommunityIcons name="chevron-left" size={38} color="rgba(0, 0, 0, 0.52)" />
            </LiquidGlassIconButton>
          </GuidedTarget>
        )}
      />

      <Text style={styles.homePersonalizationHint}>
        Press and hold a card and drag it, or use the arrows, to change the order of your Home cards.
      </Text>
      <GuidedTarget
        targetId={getHomeSettingsControlGuidanceTargetId('homeReorder')}
        label="Home card reorder"
        localHighlightRadius={22}
        localHighlightShape="rect"
      >
        <DraggableFlatList
          activationDistance={0}
          contentContainerStyle={styles.homeCardOrderList}
          data={settings.order}
          keyExtractor={(item) => item}
          onDragEnd={({ data }) => setOrder(data)}
          renderItem={renderItem}
          scrollEnabled={false}
        />
      </GuidedTarget>
    </View>
  );
}

function LegalSupportPanel({
  bottomInset,
  onBack,
  onOpenLink,
  onOpenSupport,
}: {
  bottomInset: number;
  onBack: () => void;
  onOpenLink: (url: string) => void;
  onOpenSupport: () => void;
}) {
  return (
    <View style={[styles.safeArea, { paddingBottom: bottomInset + 18 }]}>
      <ScreenHeader
        title="Legal & Support"
        titleColor="#FFFFFF"
        horizontalPadding={0}
        titlePlacement="left"
        titleStyle={styles.personalizationHeaderTitle}
        left={(
          <GuidedTarget
            targetId={getHomeSettingsBackGuidanceTargetId()}
            label="Back"
            localHighlightRadius={999}
            localHighlightInset={4}
          >
            <LiquidGlassIconButton
              debugLabel="home:settings:legal-support:back"
              onPress={onBack}
              size={44}
              style={styles.headerButton}
              fallbackTint="light"
              fallbackBackgroundColor="rgba(255, 255, 255, 0.18)"
              fallbackBorderColor="rgba(255, 255, 255, 0.36)"
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            >
              <MaterialCommunityIcons name="chevron-left" size={38} color="rgba(0, 0, 0, 0.52)" />
            </LiquidGlassIconButton>
          </GuidedTarget>
        )}
      />

      <View style={styles.list}>
        <SettingsRow
          icon={<Text allowFontScaling={false} style={styles.rowEmoji}>🔒</Text>}
          label="Privacy Policy"
          targetId={getHomeSettingsControlGuidanceTargetId('privacyPolicy')}
          onPress={() => onOpenLink(PRIVACY_POLICY_URL)}
          right={<MaterialCommunityIcons name="open-in-new" size={24} color="rgba(255, 255, 255, 0.72)" />}
        />
        <SettingsRow
          icon={<Text allowFontScaling={false} style={styles.rowEmoji}>📜</Text>}
          label="Terms"
          targetId={getHomeSettingsControlGuidanceTargetId('terms')}
          onPress={() => onOpenLink(TERMS_URL)}
          right={<MaterialCommunityIcons name="open-in-new" size={24} color="rgba(255, 255, 255, 0.72)" />}
        />
        <SettingsRow
          icon={<Text allowFontScaling={false} style={styles.rowEmoji}>💬</Text>}
          label="Support"
          targetId={getHomeSettingsControlGuidanceTargetId('support')}
          onPress={onOpenSupport}
          right={<MaterialCommunityIcons name="chevron-right" size={28} color="rgba(255, 255, 255, 0.72)" />}
        />
      </View>
    </View>
  );
}

export default function HomeSettingsSheet({
  bottomInset,
  swipeBandHeight,
  userId,
  visible,
  initialFocusPanel,
  initialFocusNonce,
  onClose,
  onOpenManageAccount,
}: HomeSettingsSheetProps) {
  const isClosingRef = React.useRef(false);
  const screenAnim = React.useRef(new Animated.Value(0)).current;
  const { isLeftHanded, toggleLeftHanded } = useLeftHandedMode();
  const [activePanel, setActivePanel] = React.useState<HomeSettingsPanel>('settings');

  const animateSheet = useCallback((toValue: number, onComplete?: () => void) => {
    Animated.timing(screenAnim, {
      toValue,
      duration: toValue === 1 ? 260 : 200,
      easing: toValue === 1 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onComplete?.();
      }
    });
  }, [screenAnim]);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    animateSheet(0, onClose);
  }, [animateSheet, onClose]);

  const handleOpenManageAccount = useCallback(() => {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    onOpenManageAccount();
    animateSheet(0);
  }, [animateSheet, onOpenManageAccount]);

  const handleToggleLeftHanded = useCallback(() => {
    void toggleLeftHanded();
  }, [toggleLeftHanded]);

  const { tier: subscriptionTier, status: subscriptionStatus } = useSubscriptionStatus(userId);
  // Pro shows its plan; complimentary Pro with no recorded plan just says Pro.
  const subscriptionBadgeLabel = subscriptionTier !== 'pro'
    ? 'Free'
    : subscriptionStatus.planId === 'yearly' ? 'Yearly' : subscriptionStatus.planId === 'monthly' ? 'Monthly' : 'Pro';
  const { role } = useRoleSession();

  // Admins and the super admin can return to the admin panel from the user app without signing out.
  // Settings stays open underneath, so going back from Admin lands straight on it.
  const handleOpenAdminPanel = useCallback(() => {
    router.push('/admin');
  }, []);

  const handleOpenPaywall = useCallback(() => {
    setActivePanel('paywall');
  }, []);

  const handleClosePaywall = useCallback(() => {
    setActivePanel('settings');
  }, []);

  const handleOpenAiPersonalization = useCallback(() => {
    setActivePanel('aiPersonalization');
  }, []);

  const handleCloseAiPersonalization = useCallback(() => {
    setActivePanel('settings');
  }, []);

  const handleOpenHomePersonalization = useCallback(() => {
    setActivePanel('homePersonalization');
  }, []);

  const handleOpenLegalSupport = useCallback(() => {
    setActivePanel('legalSupport');
  }, []);

  const handleReplayTutorial = useCallback(() => {
    if (!userId) {
      return;
    }

    void startTutorial(userId).catch((error) => {
      console.warn('Failed to restart tutorial', error);
    });
    handleClose();
    requestAnimationFrame(() => {
      router.push('/(tabs)/chat');
    });
  }, [handleClose, userId]);

  // Privacy Policy and Terms open inside Eazee, in a browser sheet with a Done button.
  const handleOpenExternalLink = useCallback((url: string) => {
    void WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET })
      .catch(() => Linking.openURL(url))
      .catch((error) => {
        console.warn('Failed to open settings link', error);
      });
  }, []);
  const [isSupportVisible, setIsSupportVisible] = React.useState(false);

  const handleCloseHomePersonalization = useCallback(() => {
    setActivePanel('settings');
  }, []);

  const handleCloseLegalSupport = useCallback(() => {
    setActivePanel('settings');
  }, []);

  const handleHardwareBackPress = useCallback(() => {
    if (activePanel === 'paywall') {
      handleClosePaywall();
      return true;
    }
    if (activePanel === 'aiPersonalization') {
      handleCloseAiPersonalization();
      return true;
    }
    if (activePanel === 'homePersonalization') {
      handleCloseHomePersonalization();
      return true;
    }
    if (activePanel === 'legalSupport') {
      handleCloseLegalSupport();
      return true;
    }

    handleClose();
    return true;
  }, [activePanel, handleClose, handleCloseAiPersonalization, handleCloseHomePersonalization, handleCloseLegalSupport, handleClosePaywall]);

  useEffect(() => {
    if (!visible) {
      isClosingRef.current = false;
      setActivePanel('settings');
      screenAnim.setValue(0);
      return;
    }

    isClosingRef.current = false;
    screenAnim.setValue(0);
    const frame = requestAnimationFrame(() => {
      animateSheet(1);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [animateSheet, screenAnim, visible]);

  useEffect(() => {
    if (!visible) return;
    setActivePanel(normalizeHomeSettingsPanel(initialFocusPanel));
  }, [initialFocusNonce, initialFocusPanel, visible]);

  useEffect(() => {
    if (!visible) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleHardwareBackPress);

    return () => {
      subscription.remove();
    };
  }, [handleHardwareBackPress, visible]);

  const content = (
    <View style={[styles.safeArea, { paddingBottom: bottomInset + 18 }]}>
      <ScreenHeader
        title="Settings"
        titleColor="#FFFFFF"
        horizontalPadding={0}
        titlePlacement="left"
        left={(
          <GuidedTarget
            targetId={getHomeBackGuidanceTargetId()}
            label="Back"
            localHighlightRadius={999}
            localHighlightInset={4}
          >
            <LiquidGlassIconButton
              debugLabel="home:settings:back"
              onPress={handleClose}
              size={44}
              style={styles.headerButton}
              fallbackTint="light"
              fallbackBackgroundColor="rgba(255, 255, 255, 0.18)"
              fallbackBorderColor="rgba(255, 255, 255, 0.36)"
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            >
              <MaterialCommunityIcons name="chevron-left" size={38} color="rgba(0, 0, 0, 0.52)" />
            </LiquidGlassIconButton>
          </GuidedTarget>
        )}
      />

      <View style={styles.list}>
        {isStaffRole(role) && (
          <SettingsRow
            icon={<MaterialCommunityIcons name="shield-crown-outline" size={SETTINGS_ACCENT_ICON_SIZE} color={SETTINGS_ACCENT_ICON_COLOR} />}
            label="Admin"
            accessibilityRole="button"
            onPress={handleOpenAdminPanel}
            right={<MaterialCommunityIcons name="chevron-right" size={28} color="rgba(255, 255, 255, 0.78)" />}
          />
        )}
        <SettingsRow
          icon={<Text allowFontScaling={false} style={styles.rowEmoji}>🫆</Text>}
          label="Manage Account"
          targetId={getHomeAccountGuidanceTargetId('settings')}
          onPress={handleOpenManageAccount}
        />
        <SettingsRow
          icon={<Text allowFontScaling={false} style={styles.rowEmoji}>👑</Text>}
          label="Eazee Pro"
          targetId={getHomeSettingsControlGuidanceTargetId('eazeePro')}
          onPress={handleOpenPaywall}
          right={(
            <View style={styles.rowRightGroup}>
              <View style={[styles.tierBadge, subscriptionTier === 'pro' && styles.tierBadgePro]}>
                <Text style={[styles.tierBadgeText, subscriptionTier === 'pro' && styles.tierBadgeTextPro]}>
                  {subscriptionBadgeLabel}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={28} color="rgba(255, 255, 255, 0.78)" />
            </View>
          )}
        />
        <EventRemindersSetting />
        <CheckInReminderRow />
        <SettingsRow
          icon={<Text allowFontScaling={false} style={styles.rowEmoji}>🙈</Text>}
          label="Guided Access Mode"
          targetId={getHomeSettingsControlGuidanceTargetId('navigationMode')}
          right={<NavigationModeToggle />}
        />
        <SettingsRow
          icon={(
            <Text
              allowFontScaling={false}
              style={[styles.rowEmoji, isLeftHanded && styles.leftHandedRowEmoji]}
            >
              {'🙋‍♂️'}
            </Text>
          )}
          label="Left Handed Mode"
          targetId={getHomeSettingsControlGuidanceTargetId('leftHanded')}
          onPress={handleToggleLeftHanded}
          accessibilityRole="switch"
          accessibilityState={{ checked: isLeftHanded }}
          right={<LeftHandedToggle enabled={isLeftHanded} />}
        />
        <SettingsRow
          icon={<Text allowFontScaling={false} style={styles.rowEmoji}>✨</Text>}
          label="Intelligence Personalization"
          targetId={getHomeSettingsControlGuidanceTargetId('aiPersonalization')}
          onPress={handleOpenAiPersonalization}
          right={<MaterialCommunityIcons name="chevron-right" size={28} color="rgba(255, 255, 255, 0.78)" />}
        />
        <SettingsRow
          icon={<Text allowFontScaling={false} style={styles.rowEmoji}>🏠</Text>}
          label="Home Personalization"
          targetId={getHomeSettingsControlGuidanceTargetId('homePersonalization')}
          onPress={handleOpenHomePersonalization}
          right={<MaterialCommunityIcons name="chevron-right" size={28} color="rgba(255, 255, 255, 0.78)" />}
        />
        <SettingsRow
          disabled={!userId}
          icon={<Text allowFontScaling={false} style={styles.rowEmoji}>👀</Text>}
          label="Replay Tutorial"
          targetId={getHomeSettingsControlGuidanceTargetId('replayTutorial')}
          onPress={handleReplayTutorial}
          right={<MaterialCommunityIcons name="chevron-right" size={28} color="rgba(255, 255, 255, 0.78)" />}
        />
        <SettingsRow
          icon={<Text allowFontScaling={false} style={styles.rowEmoji}>{'🧑‍💻'}</Text>}
          label="Legal & Support"
          targetId={getHomeSettingsControlGuidanceTargetId('legalSupport')}
          onPress={handleOpenLegalSupport}
          right={<MaterialCommunityIcons name="chevron-right" size={28} color="rgba(255, 255, 255, 0.78)" />}
        />
      </View>
    </View>
  );

  const activeContent = activePanel === 'paywall'
    ? (
        <PaywallPanel
          bottomInset={bottomInset}
          userId={userId}
          onBack={handleClosePaywall}
        />
      )
    : activePanel === 'aiPersonalization'
    ? (
        <AiPersonalizationPanel
          bottomInset={bottomInset}
          userId={userId}
          onBack={handleCloseAiPersonalization}
        />
      )
    : activePanel === 'homePersonalization'
      ? (
          <HomePersonalizationPanel
            bottomInset={bottomInset}
            onBack={handleCloseHomePersonalization}
            userId={userId}
          />
        )
      : activePanel === 'legalSupport'
        ? (
            <LegalSupportPanel
              bottomInset={bottomInset}
              onBack={handleCloseLegalSupport}
              onOpenLink={handleOpenExternalLink}
              onOpenSupport={() => setIsSupportVisible(true)}
            />
          )
      : content;

  const sheetTranslateY = screenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });

  const sheetScale = screenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.root, !visible && styles.rootHidden]}
    >
      <Animated.View style={[styles.background, { opacity: screenAnim }]}>
        <LinearGradient
          colors={HOME_BACKGROUND_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={styles.waveLayer}>
          <Image
            source={require('../../../assets/images/wave-bg.png')}
            style={styles.waveImage}
            resizeMode="cover"
          />
        </View>
        <LinearGradient
          colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.72)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
          style={styles.shadowLayer}
        />
      </Animated.View>
      {visible && (
        <Animated.View
          style={[
            styles.content,
            {
              opacity: screenAnim,
              transform: [{ translateY: sheetTranslateY }, { scale: sheetScale }],
            },
          ]}
        >
          <GuidedTarget
            targetId={getHomeSettingsPanelGuidanceTargetId()}
            label="Settings"
            highlightMode="overlay"
            style={StyleSheet.absoluteFillObject}
          >
            {activeContent}
          </GuidedTarget>
        </Animated.View>
      )}
      <SupportContactDialog visible={isSupportVisible} onClose={() => setIsSupportVisible(false)} />
      {visible && activePanel === 'settings' && (
        <LowerSwipeGesture
          currentTab="home"
          style={[
            styles.lowerSwipeBand,
            { height: swipeBandHeight },
          ]}
        >
          <View />
        </LowerSwipeGesture>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 120,
    elevation: 120,
  },
  rootHidden: {
    opacity: 0,
    zIndex: -1,
    elevation: 0,
  },
  background: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  waveLayer: {
    position: 'absolute',
    top: -24,
    left: -12,
    right: -12,
    bottom: -24,
    opacity: 0.1,
  },
  waveImage: {
    width: undefined,
    height: undefined,
    flex: 1,
  },
  shadowLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 260,
  },
  content: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 14,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 0,
    marginRight: 0,
  },
  list: {
    marginTop: 20,
    gap: 18,
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowDisabled: {
    opacity: 0.46,
  },
  rowIcon: {
    width: 50,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Free uses the same dark track and border as the unselected options in the pickers (e.g. "Off").
  tierBadge: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(46, 45, 34, 0.30)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  // Same cream as the selected option in the Guided / Direct and reminder pickers.
  tierBadgePro: { backgroundColor: 'rgba(246, 242, 227, 0.94)', borderColor: 'rgba(246, 242, 227, 0.94)' },
  tierBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  tierBadgeTextPro: { color: '#4D4A3B' },
  rowEmoji: {
    fontSize: 40,
    lineHeight: 44,
  },
  leftHandedRowEmoji: {
    transform: [{ scaleX: -1 }],
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  rowRight: {
    marginLeft: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rowLabel: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
  },
  modeToggle: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 14,
    backgroundColor: 'rgba(46, 45, 34, 0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  modeOption: {
    minWidth: 50,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 7,
  },
  modeOptionSelected: {
    backgroundColor: 'rgba(246, 242, 227, 0.94)',
  },
  eventReminderTiming: {
    // Lines "Remind me" up with the row label, past the bell.
    paddingLeft: 50,
  },
  modeOptionText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  modeOptionTextSelected: {
    color: '#4D4A3B',
  },
  binaryToggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: 'rgba(46, 45, 34, 0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  binaryToggleActive: {
    backgroundColor: 'rgba(246, 242, 227, 0.94)',
  },
  binaryToggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(246, 242, 227, 0.72)',
  },
  binaryToggleKnobActive: {
    backgroundColor: '#4D4A3B',
    transform: [{ translateX: 20 }],
  },
  personalizationScroll: {
    flex: 1,
    marginTop: 18,
  },
  personalizationHeaderTitle: {
    fontSize: 19,
  },
  personalizationContent: {
    paddingBottom: 30,
    gap: 22,
  },
  aiIntro: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  aiSection: {
    gap: 10,
  },
  aiSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  aiSectionEmoji: {
    fontSize: 20,
  },
  aiSectionTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  aiCard: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(46, 45, 34, 0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  aiDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  aiSaveButton: {
    minHeight: 48,
    marginTop: 6,
    marginBottom: 8,
  },
  aiSectionHint: {
    color: 'rgba(255, 255, 255, 0.76)',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    paddingTop: 8,
    paddingBottom: 4,
  },
  aiRowMeta: {
    marginTop: -4,
    marginBottom: 8,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '700',
  },
  aiDimmed: {
    opacity: 0.45,
  },
  aiDeleteLink: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
  aiDeleteText: {
    color: '#FFD9CF',
    fontSize: 14,
    fontWeight: '900',
  },
  aiLinkRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  aiLinkEmoji: {
    fontSize: 26,
    width: 34,
    textAlign: 'center',
  },
  aiLinkDetail: {
    marginTop: 2,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '700',
  },
  baseStyleSetting: {
    gap: 8,
  },
  baseStyleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  baseStyleBubble: {
    minHeight: 34,
    maxWidth: '56%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 17,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(246, 242, 227, 0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.70)',
  },
  baseStyleBubbleText: {
    flexShrink: 1,
    color: '#4D4A3B',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  baseStyleBubblePressed: {
    opacity: 0.76,
  },
  baseStyleNativeMenu: {
    width: 132,
    height: 38,
  },
  baseStyleModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(46, 45, 34, 0.62)',
    padding: 20,
  },
  baseStyleModalCard: {
    width: '100%',
    maxWidth: 380,
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
  baseStyleModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  baseStyleModalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  baseStyleModalCloseButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  baseStyleModalCloseButtonPressed: {
    backgroundColor: 'rgba(246, 242, 227, 0.16)',
  },
  baseStyleModalOptions: {
    gap: 2,
  },
  baseStyleModalOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  baseStyleModalOptionSelected: {
    backgroundColor: 'rgba(246, 242, 227, 0.94)',
  },
  baseStyleModalOptionPressed: {
    backgroundColor: 'rgba(246, 242, 227, 0.18)',
  },
  baseStyleModalOptionText: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  baseStyleModalOptionTextSelected: {
    color: '#4D4A3B',
    fontWeight: '900',
  },
  settingLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  homePersonalizationHint: {
    marginTop: 18,
    color: 'rgba(255, 255, 255, 0.76)',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  homeCardOrderList: {
    paddingTop: 18,
    gap: 10,
  },
  homeCardOrderRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(46, 45, 34, 0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  homeCardOrderRowActive: {
    opacity: 0.86,
    transform: [{ scale: 1.01 }],
  },
  homeCardDragHandle: {
    width: 34,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeCardOrderLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  homeCardOrderNote: {
    marginTop: 2,
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  homeCardMoveButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  homeCardMoveButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  homeCardMoveButtonDisabled: {
    opacity: 0.3,
  },
  errorText: {
    color: '#FFE2E2',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  saveButton: {
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(246, 242, 227, 0.94)',
  },
  saveButtonDisabled: {
    backgroundColor: 'rgba(46, 45, 34, 0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  saveButtonText: {
    color: '#4D4A3B',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  saveButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.70)',
  },
  lowerSwipeBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
  },
});
