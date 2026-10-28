import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ABOUT_ME_COLORS as C } from '@/lib/aboutMe/theme';
import {
  ActivityIndicator,
  Alert,
  NativeModules,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TurboModuleRegistry,
  View,
  useWindowDimensions,
} from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { router, useFocusEffect } from 'expo-router';
import SettingsScreenFrame from '@/components/SettingsScreenFrame';
import PersonalityCardView from '@/components/aboutMe/PersonalityCardView';
import { useAuthSession } from './context/AuthSessionContext';
import {
  readCachedAboutMeProfile,
  refreshAboutMeProfile,
  saveShareCard,
  trackAboutMeEvent,
  type AboutMeProfile,
} from '@/lib/aboutMe/profile';
import { getCardBasis, getCardCaption, pickCardTheme, type CardHumour } from '@/lib/aboutMe/personalityCard';

const IMAGE_SIZE = { width: 1080, height: 1350 };

/**
 * The card's native helpers are loaded only when used, so a build made before they were
 * added says "update the app" instead of crashing.
 */
function loadCardNativeModules() {
  const hasNative = !!(TurboModuleRegistry.get('RNViewShot') ?? NativeModules.RNViewShot)
    && !!requireOptionalNativeModule('ExpoSharing')
    && !!requireOptionalNativeModule('ExpoMediaLibrary');
  if (!hasNative) return null;
  try {
    return {
      captureRef: require('react-native-view-shot').captureRef as typeof import('react-native-view-shot').captureRef,
      Sharing: require('expo-sharing') as typeof import('expo-sharing'),
      MediaLibrary: require('expo-media-library') as typeof import('expo-media-library'),
    };
  } catch {
    return null;
  }
}

/** "Your Eazee personality": the playful card, kept apart from the actual results. */
export default function PersonalityCardScreen() {
  const { user } = useAuthSession();
  const uid = user?.uid ?? null;
  const { width: windowWidth } = useWindowDimensions();
  // The screen frame leaves 18 on each side (SettingsScreenFrame); wider gets clipped at the edges.
  const cardWidth = Math.min(windowWidth - 36, 420);
  const cardRef = useRef<View>(null);

  const [profile, setProfile] = useState<AboutMeProfile | null | undefined>(undefined);
  const [humour, setHumour] = useState<CardHumour>('gentle');
  const [captionIndex, setCaptionIndex] = useState(0);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);

  // Read again whenever the screen is shown, so a retaken test shows its new result.
  useFocusEffect(useCallback(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      const cached = await readCachedAboutMeProfile(uid);
      if (!cancelled) setProfile(cached);
      const latest = await refreshAboutMeProfile(uid).catch(() => cached);
      if (!cancelled) setProfile(latest);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]));

  const basis = useMemo(() => getCardBasis(profile?.personality_assessments.active), [profile]);
  const theme = basis.ok ? pickCardTheme(basis.levels) : null;
  const savedCard = profile?.share_card ?? null;

  // Start from the card the user saved, unless their result now points to another theme.
  const restoredForTheme = useRef<string | null>(null);
  useEffect(() => {
    if (!theme || restoredForTheme.current === theme.id) return;
    restoredForTheme.current = theme.id;
    if (savedCard && savedCard.themeId === theme.id) {
      setHumour(savedCard.humour);
      setCaptionIndex(savedCard.captionIndex);
    } else {
      setCaptionIndex(0);
    }
  }, [savedCard, theme]);

  const content = theme && basis.ok
    ? {
        title: theme.title,
        caption: getCardCaption(theme, humour, captionIndex),
        superpower: theme.superpower,
        plotTwist: theme.plotTwist,
        move: theme.move,
        basisLabel: basis.label,
      }
    : null;

  const rememberCard = useCallback(() => {
    if (!uid || !theme || !basis.ok) return;
    const captionCount = theme.captions[humour].length;
    // Saving the choice is optional: a failure never blocks the image or the profile.
    void saveShareCard(uid, { themeId: theme.id, humour, captionIndex: captionIndex % captionCount, basis: basis.kind })
      .then((card) => setProfile((current) => (current ? { ...current, share_card: card } : current)))
      .catch(() => {});
  }, [basis, captionIndex, humour, theme, uid]);

  const capture = useCallback(async () => {
    const modules = loadCardNativeModules();
    if (!modules) {
      Alert.alert('Update Eazee', 'Update the app to save or share your card.');
      return null;
    }
    if (!cardRef.current) return null;
    const uri = await modules.captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile', ...IMAGE_SIZE });
    return { uri, modules };
  }, []);

  const handleSave = useCallback(async () => {
    if (busy) return;
    setBusy('save');
    try {
      const captured = await capture();
      if (!captured) return;
      const permission = await captured.modules.MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (!permission.granted) {
        Alert.alert('Can’t save yet', 'Allow Eazee to add photos in your phone’s Settings, or use Share instead.');
        return;
      }
      await captured.modules.MediaLibrary.saveToLibraryAsync(captured.uri);
      rememberCard();
      trackAboutMeEvent('card_saved');
      Alert.alert('Saved', 'Your card is in your photos.');
    } catch {
      Alert.alert('Not saved', 'Your card could not be saved. Please try again.');
    } finally {
      setBusy(null);
    }
  }, [busy, capture, rememberCard]);

  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy('share');
    try {
      const captured = await capture();
      if (!captured) return;
      if (!(await captured.modules.Sharing.isAvailableAsync())) {
        Alert.alert('Sharing isn’t available', 'Use Save image instead.');
        return;
      }
      rememberCard();
      // Counts the share sheet opening, not a confirmed post.
      trackAboutMeEvent('share_sheet_opened');
      await captured.modules.Sharing.shareAsync(captured.uri, { mimeType: 'image/png', dialogTitle: 'Share your Eazee personality', UTI: 'public.png' });
    } catch {
      Alert.alert('Can’t share', 'Your card could not be shared. Please try again.');
    } finally {
      setBusy(null);
    }
  }, [busy, capture, rememberCard]);

  const openAboutMe = (start?: 'test' | 'finish') =>
    router.push({ pathname: '/about-me', params: { entry: 'settings', ...(start ? { start } : {}) } });

  if (!uid || profile === undefined) {
    return (
      <SettingsScreenFrame title="Your Eazee personality">
        <View style={styles.center}>{uid ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.body}>Sign in to see your card.</Text>}</View>
      </SettingsScreenFrame>
    );
  }

  if (!basis.ok || !content) {
    const reason = basis.ok ? 'none' : basis.reason;
    return (
      <SettingsScreenFrame title="Your Eazee personality">
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.body}>
              {reason === 'incomplete'
                ? 'Finish your personality test to see your Eazee personality.'
                : reason === 'unclear'
                  ? 'We can’t make a card from your saved result. Add your MBTI type or Big Five results, or take the quick test.'
                  : 'Your card is based on a personality result. Take the quick test or add a result you already have.'}
            </Text>
          </View>
          {reason === 'incomplete'
            ? <PrimaryButton label="Finish the test" onPress={() => openAboutMe('finish')} />
            : <PrimaryButton label="Take the quick test" onPress={() => openAboutMe('test')} />}
          {reason !== 'incomplete' && <SecondaryButton label="Add a result I already have" onPress={() => openAboutMe()} />}
        </ScrollView>
      </SettingsScreenFrame>
    );
  }

  return (
    <SettingsScreenFrame title="Your Eazee personality" subtitle="Just for fun">
      <ScrollView contentContainerStyle={[styles.content, { alignItems: 'center' }]}>
        <PersonalityCardView ref={cardRef} content={content} width={cardWidth} />

        <View style={[styles.segment, { width: cardWidth }]}>
          {(['gentle', 'cheeky'] as const).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: humour === option }}
              onPress={() => {
                setHumour(option);
                setCaptionIndex(0);
              }}
              style={[styles.segmentItem, humour === option && styles.segmentItemSelected]}
            >
              <Text style={[styles.segmentText, humour === option && styles.segmentTextSelected]}>
                {option === 'gentle' ? 'Gentle' : 'Cheeky'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ width: cardWidth, gap: 10 }}>
          <SecondaryButton label="Try another caption" onPress={() => setCaptionIndex((index) => index + 1)} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton label={busy === 'save' ? 'Saving…' : 'Save image'} disabled={!!busy} onPress={() => void handleSave()} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton label={busy === 'share' ? 'Opening…' : 'Share'} disabled={!!busy} onPress={() => void handleShare()} />
            </View>
          </View>
          <Text style={styles.hint}>
            A playful take, not your test result. Changing the joke doesn’t change your results or how Eazee talks to you. Nothing is shared unless you choose to.
          </Text>
        </View>
      </ScrollView>
    </SettingsScreenFrame>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primary, disabled && { opacity: 0.5 }]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondary}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { paddingTop: 18, gap: 14, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, padding: 16, gap: 10 },
  body: { fontSize: 15, lineHeight: 21, color: C.body },
  hint: { fontSize: 13, lineHeight: 18, color: C.hint, fontWeight: '700', textAlign: 'center' },
  segment: { flexDirection: 'row', backgroundColor: C.secondary, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 999, padding: 4 },
  segmentItem: { flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  segmentItemSelected: { backgroundColor: C.accent },
  segmentText: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
  segmentTextSelected: { color: C.onAccent },
  primary: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: C.onAccent, fontSize: 16, fontWeight: '800' },
  secondary: { borderRadius: 999, paddingVertical: 12, alignItems: 'center', backgroundColor: C.secondary, borderWidth: 1, borderColor: C.cardBorder },
  secondaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
