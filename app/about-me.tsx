import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ABOUT_ME_COLORS as C } from '@/lib/aboutMe/theme';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Q } from '@nozbe/watermelondb';
import SettingsScreenFrame from '@/components/SettingsScreenFrame';
import { useAuthSession } from './context/AuthSessionContext';
import { database } from '../database/database';
import TodoModel from '../database/models/TodoModel';
import { readSavedPreferences, saveSavedPreference } from '@/lib/aiSavedPreferences';
import {
  BIG_FIVE_UNIT_OPTIONS,
  MBTI_SOURCE_OPTIONS,
  MBTI_TYPES,
  PERSONALITY_ROUTE_OPTIONS,
  PROFILE_QUESTIONS,
  labelFor,
  type AboutMe,
  type AssistantPreferences,
  type ChoiceQuestion,
  type Option,
  type PersonalityRoute,
} from '@/lib/aboutMe/questions';
import { getCardBasis } from '@/lib/aboutMe/personalityCard';
import {
  TIPI_INSTRUCTIONS,
  TIPI_ITEMS,
  TIPI_SCALE,
  TIPI_STEM,
  TIPI_TRAITS,
  countTipiAnswers,
  isTipiComplete,
  scoreTipi,
} from '@/lib/aboutMe/tipi';
import {
  DEFAULT_CONTROLS,
  buildProfileFromDraft,
  clearAboutMeDraft,
  createAboutMeDraft,
  deleteAboutMeProfile,
  describeAboutMeChanges,
  fromSavedPreferenceValues,
  getDraftAssessment,
  hasAboutMeContent,
  parseBigFiveText,
  readAboutMeDraft,
  readAboutMeInviteState,
  readCachedAboutMeProfile,
  refreshAboutMeProfile,
  saveAboutMeProfile,
  toSavedPreferenceValues,
  trackAboutMeEvent,
  writeAboutMeDraft,
  writeAboutMeInviteState,
  type AboutMeDraft,
  type AboutMeProfile,
  type Assessment,
  type BigFiveTrait,
  type PersonalisationControls,
} from '@/lib/aboutMe/profile';

const INTRO_COPY =
  'Your answers help Eazee tailor explanations, plans, and suggestions. Skip anything you like. You can edit or delete your answers in Settings.';
const REVIEW_COPY = 'This is a starting point, not a fixed label. Your instructions always matter more than a personality result.';


type Mode = 'loading' | 'intro' | 'flow' | 'done' | 'manage';

const QUESTION_STEPS = ['q1', ...PROFILE_QUESTIONS.map((question) => question.id)];
const TIPI_STEPS = ['tipi_intro', ...TIPI_ITEMS.map((_, index) => `tipi_${index + 1}`)];

/** Whether the profile question on `step` (q1-q10) has an answer in the draft. */
function isQuestionAnswered(draft: AboutMeDraft, step: string) {
  if (step === 'q1') return !!draft.personality_route;
  const question = PROFILE_QUESTIONS.find((item) => item.id === step);
  if (!question) return true;
  const section = (draft[question.section] ?? {}) as Record<string, unknown>;
  const hasValue = (value: unknown) => (Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? !!value.trim() : value != null);
  return hasValue(section[question.field]) || (!!question.text && hasValue(section[question.text.field]));
}

/** The personality statements (1-based) with no answer yet. */
const getMissedTipiStatements = (responses: (number | null)[]) =>
  responses.map((value, index) => (value === null ? index + 1 : 0)).filter(Boolean);

const describeMissedStatements = (missed: number[]) =>
  missed.length === 1
    ? `You missed statement ${missed[0]}`
    : `You missed statements ${missed.slice(0, -1).join(', ')} and ${missed[missed.length - 1]}`;

function getSteps(route?: PersonalityRoute) {
  return [...QUESTION_STEPS, ...(route === 'test' ? TIPI_STEPS : []), 'review'];
}

const formatScore = (value: number | null) => (value === null ? 'Not available' : value.toFixed(1));

/** "Get to know me": the ten profile questions, the optional TIPI test, review and save. */
export default function AboutMeScreen() {
  // start: "test" opens a fresh test, "finish" the unfinished one (from the card screen).
  const params = useLocalSearchParams<{ entry?: string; start?: string }>();
  const entry: 'chat' | 'settings' = params.entry === 'chat' ? 'chat' : 'settings';
  const { user } = useAuthSession();
  const uid = user?.uid ?? null;

  const [mode, setMode] = useState<Mode>('loading');
  const [profile, setProfile] = useState<AboutMeProfile | null>(null);
  const [draft, setDraft] = useState<AboutMeDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<AboutMeDraft | null>(null);
  const [controls, setControls] = useState<PersonalisationControls>(DEFAULT_CONTROLS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  /** Edit from the review screen: Next goes straight back to review. */
  const [returnToReview, setReturnToReview] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [startRequest, setStartRequest] = useState<'test' | 'finish' | null>(null);
  /** Shown under a question or statement when Next is tapped without an answer. */
  const [stepNotice, setStepNotice] = useState<string | null>(null);
  /** Answering missed statements from the review: Next goes to the next missed one, then back. */
  const [isAnsweringMissed, setIsAnsweringMissed] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      const [cached, storedDraft] = await Promise.all([readCachedAboutMeProfile(uid), readAboutMeDraft(uid)]);
      if (cancelled) return;
      setProfile(cached);
      setSavedDraft(storedDraft);
      let latest = cached;
      try {
        latest = await refreshAboutMeProfile(uid);
      } catch {
        if (!cached) setLoadError('Couldn’t load your saved answers right now. You can still start.');
      }
      if (cancelled) return;
      setProfile(latest);
      setControls(latest?.personalisation_controls ?? DEFAULT_CONTROLS);
      setMode(hasAboutMeContent(latest) && entry === 'settings' && !storedDraft ? 'manage' : 'intro');
      setStartRequest(params.start === 'test' || params.start === 'finish' ? params.start : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [entry, uid]);

  const steps = useMemo(() => getSteps(draft?.personality_route), [draft?.personality_route]);
  const stepIndex = draft ? Math.max(0, steps.indexOf(draft.step)) : 0;

  const updateDraft = useCallback((change: (current: AboutMeDraft) => AboutMeDraft) => {
    setDraft((current) => {
      if (!current) return current;
      const next = change(current);
      if (uid) void writeAboutMeDraft(uid, next);
      return next;
    });
  }, [uid]);

  const goTo = useCallback((step: string) => {
    setStepNotice(null);
    updateDraft((current) => ({ ...current, step }));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [updateDraft]);

  const markAnswered = (current: AboutMeDraft, ...fields: string[]) => ({
    ...current,
    answered: Array.from(new Set([...current.answered, ...fields])),
  });

  const startDraft = useCallback(async (options: { step?: string; resume?: boolean; retake?: boolean; editFromSettings?: boolean } = {}) => {
    if (!uid) return;
    if (options.resume && savedDraft) {
      setDraft(savedDraft);
      setMode('flow');
      return;
    }
    const [saved, goals] = await Promise.all([
      readSavedPreferences(uid),
      database.get<TodoModel>('todos')
        .query(Q.where('completed', false), Q.where('workspace', 'Goals'), Q.sortBy('created_at', Q.desc), Q.take(1))
        .fetch()
        .catch(() => [] as TodoModel[]),
    ]);
    const next = createAboutMeDraft(profile, {
      entry,
      savedGoalTitle: String(goals[0]?.text || '').trim() || null,
      savedPreferences: fromSavedPreferenceValues(saved.preferences),
    });
    if (options.retake) {
      next.personality_route = 'test';
      next.tipi = Array.from({ length: 10 }, () => null);
    }
    if (options.step?.startsWith('tipi')) next.personality_route = 'test';
    next.step = options.step ?? 'q1';
    setDraft(next);
    setReturnToReview(!!options.editFromSettings);
    void writeAboutMeDraft(uid, next);
    setMode('flow');
    if (!startedRef.current) {
      startedRef.current = true;
      trackAboutMeEvent('flow_started', { entry });
    }
  }, [entry, profile, savedDraft, uid]);

  useEffect(() => {
    if (!startRequest) return;
    setStartRequest(null);
    void startDraft(startRequest === 'test' ? { step: 'tipi_intro', retake: true } : { step: 'tipi_1' });
  }, [startDraft, startRequest]);

  const next = useCallback((options: { skipped?: boolean } = {}) => {
    if (!draft) return;
    // A statement needs an answer to go on; Skip leaves it out on purpose.
    const tipiIndex = draft.step.startsWith('tipi_') && draft.step !== 'tipi_intro' ? Number(draft.step.slice(5)) - 1 : -1;
    const isUnanswered = tipiIndex >= 0 ? draft.tipi[tipiIndex] == null : !isQuestionAnswered(draft, draft.step);
    if (!options.skipped && draft.step !== 'tipi_intro' && draft.step !== 'review' && isUnanswered) {
      setStepNotice('Pick an answer to continue, or tap Skip to leave this one out.');
      return;
    }
    setStepNotice(null);
    if (isAnsweringMissed && tipiIndex >= 0) {
      const nextMissed = getMissedTipiStatements(draft.tipi).find((statement) => statement > tipiIndex + 1);
      if (nextMissed) return goTo(`tipi_${nextMissed}`);
      setIsAnsweringMissed(false);
      return goTo('review');
    }
    const nextStep = steps[stepIndex + 1];
    if (nextStep) goTo(nextStep);
  }, [draft, goTo, isAnsweringMissed, stepIndex, steps]);
  // The warning goes away as soon as the question gets an answer.
  useEffect(() => {
    if (stepNotice && draft && !draft.step.startsWith('tipi') && isQuestionAnswered(draft, draft.step)) setStepNotice(null);
  }, [draft, stepNotice]);

  const back = useCallback(() => {
    if (mode !== 'flow' || !draft) return false;
    const previous = steps[stepIndex - 1];
    if (previous) {
      goTo(previous);
      return true;
    }
    setMode(hasAboutMeContent(profile) && entry === 'settings' ? 'manage' : 'intro');
    return true;
  }, [draft, entry, goTo, mode, profile, stepIndex, steps]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', back);
    return () => subscription.remove();
  }, [back]);

  /** Skip leaves the saved answer as it was. */
  const skip = useCallback(() => {
    if (!draft) return;
    const question = PROFILE_QUESTIONS.find((item) => item.id === draft.step);
    if (question) {
      updateDraft((current) => {
        const section = { ...(current[question.section] as Record<string, unknown>) };
        const saved = (profile?.[question.section] ?? {}) as Record<string, unknown>;
        for (const field of [question.field, question.text?.field].filter(Boolean) as string[]) {
          if (saved[field] === undefined) delete section[field];
          else section[field] = saved[field];
        }
        return { ...current, [question.section]: section, answered: current.answered.filter((field) => field !== question.field && field !== question.text?.field) };
      });
      trackAboutMeEvent('question_skipped', { question: question.id });
    } else if (draft.step.startsWith('tipi_') && draft.step !== 'tipi_intro') {
      const index = Number(draft.step.slice(5)) - 1;
      updateDraft((current) => ({ ...current, tipi: current.tipi.map((value, i) => (i === index ? null : value)) }));
      trackAboutMeEvent('question_skipped', { question: 'tipi' });
    } else if (draft.step === 'q1') {
      trackAboutMeEvent('question_skipped', { question: 'q1' });
      updateDraft((current) => ({ ...current, personality_route: profile?.personality_route ?? undefined }));
    }
    next({ skipped: true });
  }, [draft, next, profile, updateDraft]);

  const saveAndExit = useCallback(() => {
    if (draft && uid) void writeAboutMeDraft(uid, draft);
    router.canGoBack() ? router.back() : router.replace('/(tabs)/chat');
  }, [draft, uid]);

  const discard = useCallback(() => {
    Alert.alert('Discard your answers?', 'Nothing you’ve already saved will change.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          if (uid) void clearAboutMeDraft(uid);
          trackAboutMeEvent('profile_discarded', { entry });
          setDraft(null);
          setSavedDraft(null);
          if (hasAboutMeContent(profile)) setMode('manage');
          else router.canGoBack() ? router.back() : router.replace('/(tabs)/chat');
        },
      },
    ]);
  }, [entry, profile, uid]);

  const save = useCallback(async (options: { confirmedIncomplete?: boolean } = {}) => {
    if (!uid || !draft || isSaving) return;
    const missed = draft.personality_route === 'test' ? getMissedTipiStatements(draft.tipi) : [];
    if (missed.length && missed.length < draft.tipi.length && !options.confirmedIncomplete) {
      Alert.alert(
        `${describeMissedStatements(missed)}`,
        'Answer every statement to see your Eazee personality.',
        [
          { text: 'Save anyway', style: 'cancel', onPress: () => void save({ confirmedIncomplete: true }) },
          {
            text: missed.length === 1 ? 'Answer it' : 'Answer them',
            onPress: () => {
              setReturnToReview(false);
              setIsAnsweringMissed(true);
              goTo(`tipi_${missed[0]}`);
            },
          },
        ]
      );
      return;
    }
    setIsSaving(true);
    try {
      const nextProfile = buildProfileFromDraft(profile, draft, controls);
      const saved = await saveAboutMeProfile(uid, nextProfile);
      // Keep the existing saved preferences in step with the answers given here.
      const answeredPrefs: AssistantPreferences = {};
      if (draft.answered.includes('answerStyle')) answeredPrefs.answerStyle = draft.assistant_preferences.answerStyle;
      if (draft.answered.includes('organiseStyle')) answeredPrefs.organiseStyle = draft.assistant_preferences.organiseStyle;
      for (const item of toSavedPreferenceValues(answeredPrefs)) {
        await saveSavedPreference(uid, item.field, item.value, 'settings').catch(() => {});
      }
      await clearAboutMeDraft(uid);
      const invite = await readAboutMeInviteState(uid);
      await writeAboutMeInviteState(uid, { ...invite, status: 'accepted' });
      const active = saved.personality_assessments.active;
      if (draft.personality_route === 'test' && active?.kind === 'tipi') {
        trackAboutMeEvent(isTipiComplete(active.responses) ? 'test_completed' : 'test_incomplete', { entry });
      }
      trackAboutMeEvent('profile_saved', { entry, route: draft.personality_route });
      setProfile(saved);
      setControls(saved.personalisation_controls);
      setDraft(null);
      setSavedDraft(null);
      setSavedMessage(describeAboutMeChanges(saved));
      // A finished test goes straight to its result.
      if (draft.personality_route === 'test' && getCardBasis(saved.personality_assessments.active).ok) {
        router.dismissTo('/personality-card');
        return;
      }
      setMode('done');
    } catch (error) {
      Alert.alert('Not saved', `${(error as Error)?.message || 'Your profile could not be saved.'} Your answers are kept on this phone; try again in a moment.`);
    } finally {
      setIsSaving(false);
    }
  }, [controls, draft, entry, goTo, isSaving, profile, uid]);

  /** Settings changes that apply straight away (switches, deleting the result). */
  const saveProfileChange = useCallback(async (change: (current: AboutMeProfile) => AboutMeProfile) => {
    if (!uid || !profile) return;
    const updated = change(profile);
    setProfile(updated);
    setControls(updated.personalisation_controls);
    try {
      const saved = await saveAboutMeProfile(uid, updated);
      setProfile(saved);
      setControls(saved.personalisation_controls);
    } catch (error) {
      setProfile(profile);
      setControls(profile.personalisation_controls);
      Alert.alert('Not saved', (error as Error)?.message || 'Please try again.');
    }
  }, [profile, uid]);

  const deleteResult = () => {
    Alert.alert('Delete your personality result?', 'Eazee will stop using it. Your other answers stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void saveProfileChange((current) => ({
          ...current,
          personality_route: null,
          personality_assessments: { active: null },
        })),
      },
    ]);
  };

  const deleteProfile = () => {
    if (!uid) return;
    Alert.alert('Delete your whole profile?', 'This removes your answers and personality result from every device. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteAboutMeProfile(uid)
            .then(() => {
              trackAboutMeEvent('profile_deleted', { entry });
              setProfile(null);
              setControls(DEFAULT_CONTROLS);
              setMode('intro');
            })
            .catch((error) => Alert.alert('Not deleted', (error as Error)?.message || 'Please try again.'));
        },
      },
    ]);
  };

  const retake = () => {
    Alert.alert('Retake the test?', 'Your new answers will replace your current result when you save.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Retake', onPress: () => void startDraft({ step: 'tipi_intro', retake: true }) },
    ]);
  };

  if (!uid) {
    return (
      <SettingsScreenFrame title="About me">
        <View style={styles.center}><Text style={styles.body}>Sign in to tell Eazee about yourself.</Text></View>
      </SettingsScreenFrame>
    );
  }

  if (mode === 'loading') {
    return (
      <SettingsScreenFrame title="About me">
        <View style={styles.center}><ActivityIndicator color="#FFFFFF" /></View>
      </SettingsScreenFrame>
    );
  }

  if (mode === 'manage' && profile) {
    return (
      <SettingsScreenFrame title="About me" subtitle="What Eazee knows about you">
        <ScrollView contentContainerStyle={styles.content}>
          <ProfileSummary
            profile={profile}
            draftOrProfile={profile}
            onEdit={(step) => void startDraft({ step, editFromSettings: true })}
          />
          <PersonalitySnapshot
            assessment={profile.personality_assessments.active}
            onFinish={() => void startDraft({ step: 'tipi_1' })}
          />
          <Section emoji="✨" title="Your Eazee personality">
            <LinkRow
              label="See my personality card"
              detail="A playful, shareable card made from your result"
              onPress={() => router.push('/personality-card')}
            />
          </Section>
          <Section emoji="🧪" title="Personality result">
            <LinkRow label="Retake the test" onPress={retake} />
            {profile.personality_assessments.active?.kind === 'tipi' && (
              <LinkRow divider label="Review my test answers" onPress={() => void startDraft({ step: 'tipi_1' })} />
            )}
            <LinkRow divider label="Add or correct a result I already have" onPress={() => void startDraft({ step: 'q1', editFromSettings: true })} />
            {!!profile.personality_assessments.active && <LinkRow divider destructive label="Delete my result" onPress={deleteResult} />}
          </Section>
          <ControlsCard
            controls={controls}
            onChange={(nextControls) => void saveProfileChange((current) => ({ ...current, personalisation_controls: nextControls }))}
          />
          <Section emoji="🗂️" title="Manage">
            <LinkRow label="Go through all the questions again" onPress={() => void startDraft({ step: 'q1' })} />
            <LinkRow divider destructive label="Delete my whole profile" onPress={deleteProfile} />
          </Section>
        </ScrollView>
      </SettingsScreenFrame>
    );
  }

  if (mode === 'done') {
    return (
      <SettingsScreenFrame title="About me" onBack={() => setMode('manage')}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.title}>Saved ✨</Text>
            <Text style={styles.body}>{savedMessage}</Text>
          </View>
          {(() => {
            const active = profile?.personality_assessments.active;
            if (active?.kind !== 'tipi' || isTipiComplete(active.responses)) return null;
            const missed = getMissedTipiStatements(active.responses as (number | null)[]);
            return (
              <View style={styles.card}>
                <Text style={styles.body}>
                  {`${describeMissedStatements(missed)} (${countTipiAnswers(active.responses)} of 10 answered), so Eazee won’t use your test yet. Answer ${missed.length === 1 ? 'it' : 'them'} to see your Eazee personality.`}
                </Text>
                <ActionButton label="Finish the test" onPress={() => { setIsAnsweringMissed(true); void startDraft({ step: `tipi_${missed[0] ?? 1}` }); }} />
              </View>
            );
          })()}
          {getCardBasis(profile?.personality_assessments.active).ok && (
            <PrimaryButton label="See your Eazee personality ✨" onPress={() => router.push('/personality-card')} />
          )}
          <PrimaryButton label="Back to Eazee" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chat'))} />
          <ActionButton label="See what I saved" onPress={() => setMode('manage')} />
        </ScrollView>
      </SettingsScreenFrame>
    );
  }

  if (mode === 'intro' || !draft) {
    return (
      <SettingsScreenFrame title="Get to know me">
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.title}>Tell Eazee about yourself</Text>
            <Text style={styles.body}>{INTRO_COPY}</Text>
            <Text style={styles.hint}>10 short questions, plus an optional 10-statement personality test.</Text>
          </View>
          {!!loadError && <Text style={styles.error}>{loadError}</Text>}
          {savedDraft ? (
            <>
              <PrimaryButton label="Continue where I left off" onPress={() => void startDraft({ resume: true })} />
              <ActionButton label="Start again" onPress={() => void startDraft()} />
            </>
          ) : (
            <PrimaryButton label="Get started" onPress={() => void startDraft()} />
          )}
          {hasAboutMeContent(profile) && <ActionButton label="See what I saved" onPress={() => setMode('manage')} />}
        </ScrollView>
      </SettingsScreenFrame>
    );
  }

  const step = draft.step;
  const question = PROFILE_QUESTIONS.find((item) => item.id === step);
  const tipiIndex = step.startsWith('tipi_') && step !== 'tipi_intro' ? Number(step.slice(5)) - 1 : -1;
  const progressLabel = step === 'review'
    ? 'Review'
    : tipiIndex >= 0
      ? `Personality statement ${tipiIndex + 1} of 10`
      : step === 'tipi_intro'
        ? 'Personality test'
        : `Question ${QUESTION_STEPS.indexOf(step) + 1} of 10`;

  return (
    <SettingsScreenFrame
      title={step === 'review' ? 'Review' : 'Get to know me'}
      subtitle={step === 'review' ? undefined : progressLabel}
      onBack={back}
      right={step === 'review' ? undefined : (
        <Pressable accessibilityRole="button" onPress={saveAndExit} hitSlop={8} style={{ paddingHorizontal: 10 }}>
          <Text style={styles.link}>Save & exit</Text>
        </Pressable>
      )}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 'q1' && (
            <PersonalityRouteStep draft={draft} updateDraft={updateDraft} markAnswered={markAnswered} />
          )}
          {!!question && (
            <ChoiceStep question={question} draft={draft} updateDraft={updateDraft} markAnswered={markAnswered} />
          )}
          {step === 'tipi_intro' && (
            <View style={styles.card}>
              <Text style={styles.title}>Ten-Item Personality Inventory</Text>
              <Text style={styles.body}>{TIPI_INSTRUCTIONS}</Text>
              <Text style={styles.hint}>In this app, tap an answer instead of writing a number. You can skip any statement.</Text>
              <Text style={styles.hint}>TIPI by Gosling, Rentfrow & Swann (2003).</Text>
            </View>
          )}
          {tipiIndex >= 0 && (
            <TipiStep
              index={tipiIndex}
              value={draft.tipi[tipiIndex]}
              onChange={(value) => {
                setStepNotice(null);
                updateDraft((current) => ({ ...current, tipi: current.tipi.map((item, i) => (i === tipiIndex ? value : item)) }));
              }}
            />
          )}
          {!!stepNotice && (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>{stepNotice}</Text>
          )}
          {step === 'review' && (
            <ReviewStep
              draft={draft}
              profile={profile}
              controls={controls}
              onControlsChange={setControls}
              onEdit={(target) => {
                setReturnToReview(true);
                goTo(target);
              }}
              onFinishTest={() => {
                setReturnToReview(false);
                setIsAnsweringMissed(true);
                goTo(`tipi_${getMissedTipiStatements(draft.tipi)[0] ?? 1}`);
              }}
            />
          )}

          {step === 'review' ? (
            <View style={{ gap: 10 }}>
              <PrimaryButton label={isSaving ? 'Saving…' : 'Save and personalise Eazee'} disabled={isSaving} onPress={() => void save()} />
              <ActionButton label="Edit" onPress={() => { setReturnToReview(false); goTo('q1'); }} />
              <ActionButton label="Discard" destructive onPress={discard} />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={styles.footerRow}>
                {step !== 'tipi_intro' && (
                  <Pressable accessibilityRole="button" onPress={skip} style={styles.skipButton}>
                    <Text style={styles.skipText}>Skip</Text>
                  </Pressable>
                )}
                <View style={{ flex: 1 }}>
                  <PrimaryButton label={step === 'tipi_intro' ? 'Start' : 'Next'} onPress={() => next()} />
                </View>
              </View>
              {/* Editing an answer from Review: Next carries on through the questions, Done goes back. */}
              {returnToReview && !step.startsWith('tipi') && (
                <ActionButton
                  label="Done, back to review"
                  onPress={() => {
                    setReturnToReview(false);
                    goTo('review');
                  }}
                />
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SettingsScreenFrame>
  );
}

// ---------- steps ----------

type StepProps = {
  draft: AboutMeDraft;
  updateDraft: (change: (current: AboutMeDraft) => AboutMeDraft) => void;
  markAnswered: (current: AboutMeDraft, ...fields: string[]) => AboutMeDraft;
};

function ChoiceStep({ question, draft, updateDraft, markAnswered }: StepProps & { question: ChoiceQuestion }) {
  const section = draft[question.section] as Record<string, unknown>;
  const value = section[question.field];
  const selected = Array.isArray(value) ? (value as string[]) : typeof value === 'string' ? [value] : [];
  const multi = !!question.maxSelected;

  const toggle = (optionValue: string) => {
    updateDraft((current) => {
      const currentSection = { ...(current[question.section] as Record<string, unknown>) };
      if (multi) {
        const list = Array.isArray(currentSection[question.field]) ? [...(currentSection[question.field] as string[])] : [];
        const index = list.indexOf(optionValue);
        if (index >= 0) list.splice(index, 1);
        else if (list.length < (question.maxSelected ?? 99)) list.push(optionValue);
        else return current;
        currentSection[question.field] = list;
      } else {
        currentSection[question.field] = optionValue;
      }
      return markAnswered({ ...current, [question.section]: currentSection }, question.field);
    });
  };

  const textField = question.text;
  const textValue = textField ? String((draft.about_me as Record<string, unknown>)[textField.field] ?? '') : '';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{question.title}</Text>
      {multi && question.maxSelected! < 9 && <Text style={styles.hint}>{`Choose up to ${question.maxSelected}.`}</Text>}
      {multi && question.maxSelected! >= 9 && <Text style={styles.hint}>Choose any.</Text>}
      {!!question.note && <Text style={styles.hint}>{question.note}</Text>}
      <View style={styles.options}>
        {question.options.map((option) => (
          <Chip key={option.value} option={option} selected={selected.includes(option.value)} onPress={() => toggle(option.value)} />
        ))}
      </View>
      {!!textField && (
        <View style={{ gap: 6, marginTop: 6 }}>
          <Text style={styles.label}>{textField.label}</Text>
          {question.id === 'q6' && !!textValue && (
            <Text style={styles.hint}>Is this still your goal? Edit it or clear it.</Text>
          )}
          <TextInput
            value={textValue}
            onChangeText={(input) => updateDraft((current) =>
              markAnswered({ ...current, about_me: { ...current.about_me, [textField.field]: input } as AboutMe }, textField.field))}
            placeholder={textField.placeholder}
            placeholderTextColor={C.placeholder}
            maxLength={textField.maxLength}
            style={styles.input}
          />
        </View>
      )}
    </View>
  );
}

function PersonalityRouteStep({ draft, updateDraft, markAnswered }: StepProps) {
  const route = draft.personality_route;
  const imported = draft.imported;
  const setImported = (change: Partial<AboutMeDraft['imported']>) =>
    updateDraft((current) => markAnswered({ ...current, imported: { ...current.imported, ...change } }, 'personality'));

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.title}>How would you like to add your personality?</Text>
        <View style={styles.options}>
          {PERSONALITY_ROUTE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              option={option}
              selected={route === option.value}
              onPress={() => updateDraft((current) => markAnswered({ ...current, personality_route: option.value }, 'personality_route'))}
            />
          ))}
        </View>
        {route === 'test' && <Text style={styles.hint}>The 10 test statements come after the other questions.</Text>}
      </View>

      {route === 'mbti' && (
        <View style={styles.card}>
          <Text style={styles.label}>Your type</Text>
          <View style={styles.typeGrid}>
            {MBTI_TYPES.map((type) => (
              <Chip key={type} compact option={{ value: type, label: type }} selected={imported.mbtiType === type} onPress={() => setImported({ mbtiType: type })} />
            ))}
          </View>
          <Text style={styles.label}>Where did you get it?</Text>
          <View style={styles.options}>
            {MBTI_SOURCE_OPTIONS.map((option) => (
              <Chip key={option.value} compact option={option} selected={imported.mbtiSource === option.value} onPress={() => setImported({ mbtiSource: option.value })} />
            ))}
          </View>
          <Text style={styles.label}>Ending -A or -T (optional)</Text>
          <View style={styles.options}>
            {(['A', 'T'] as const).map((identity) => (
              <Chip
                key={identity}
                compact
                option={{ value: identity, label: identity === 'A' ? '-A (Assertive)' : '-T (Turbulent)' }}
                selected={imported.mbtiIdentity === identity}
                onPress={() => setImported({ mbtiIdentity: imported.mbtiIdentity === identity ? undefined : identity })}
              />
            ))}
          </View>
          <DateTakenInput value={imported.dateTaken} onChange={(dateTaken) => setImported({ dateTaken })} />
          <Text style={styles.hint}>Saved as self-reported. Eazee won’t turn it into other scores.</Text>
        </View>
      )}

      {route === 'big_five' && (
        <View style={styles.card}>
          <Text style={styles.label}>Test name</Text>
          <TextInput
            value={imported.testName ?? ''}
            onChangeText={(testName) => setImported({ testName })}
            placeholder="e.g. IPIP-NEO, Truity Big Five"
            placeholderTextColor={C.placeholder}
            maxLength={80}
            style={styles.input}
          />
          <Text style={styles.label}>Paste your results (optional)</Text>
          <TextInput
            value={imported.pastedText ?? ''}
            onChangeText={(pastedText) => setImported({ pastedText })}
            placeholder={'Openness: 72 percentile\nConscientiousness: 40 percentile'}
            placeholderTextColor={C.placeholder}
            multiline
            maxLength={2000}
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
          />
          <ActionButton
            label="Read the values from what I pasted"
            onPress={() => {
              const traits = parseBigFiveText(imported.pastedText ?? '');
              if (!traits.length) Alert.alert('Nothing found', 'Add each trait below instead.');
              else setImported({ traits });
            }}
          />
          <Text style={styles.label}>Check each trait</Text>
          <BigFiveTraitsEditor traits={imported.traits ?? []} onChange={(traits) => setImported({ traits })} />
          <DateTakenInput value={imported.dateTaken} onChange={(dateTaken) => setImported({ dateTaken })} />
          <Text style={styles.hint}>Only the values you check here are saved, as self-reported.</Text>
        </View>
      )}

      {route === 'other' && (
        <View style={styles.card}>
          <Text style={styles.label}>Test name</Text>
          <TextInput
            value={imported.testName ?? ''}
            onChangeText={(testName) => setImported({ testName })}
            placeholder="e.g. Enneagram, DISC, CliftonStrengths"
            placeholderTextColor={C.placeholder}
            maxLength={80}
            style={styles.input}
          />
          <Text style={styles.label}>Your result</Text>
          <TextInput
            value={imported.resultText ?? ''}
            onChangeText={(resultText) => setImported({ resultText })}
            placeholder="e.g. Type 7 with a 6 wing"
            placeholderTextColor={C.placeholder}
            multiline
            maxLength={400}
            style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
          />
          <DateTakenInput value={imported.dateTaken} onChange={(dateTaken) => setImported({ dateTaken })} />
          <Text style={styles.hint}>Saved as self-reported text.</Text>
        </View>
      )}
    </>
  );
}

function BigFiveTraitsEditor({ traits, onChange }: { traits: BigFiveTrait[]; onChange: (traits: BigFiveTrait[]) => void }) {
  const update = (index: number, change: Partial<BigFiveTrait>) =>
    onChange(traits.map((trait, i) => (i === index ? { ...trait, ...change } : trait)));
  return (
    <View style={{ gap: 10 }}>
      {traits.map((trait, index) => (
        <View key={index} style={styles.traitRow}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={trait.name}
              onChangeText={(name) => update(index, { name })}
              placeholder="Trait"
              placeholderTextColor={C.placeholder}
              maxLength={40}
              style={[styles.input, { flex: 1 }]}
            />
            <TextInput
              value={Number.isFinite(trait.score) ? String(trait.score) : ''}
              onChangeText={(input) => update(index, { score: Number(input.replace(',', '.')) })}
              keyboardType="decimal-pad"
              placeholder="Score"
              placeholderTextColor={C.placeholder}
              style={[styles.input, { width: 80 }]}
            />
          </View>
          <View style={styles.options}>
            {BIG_FIVE_UNIT_OPTIONS.map((option) => (
              <Chip key={option.value} compact option={option} selected={trait.unit === option.value} onPress={() => update(index, { unit: option.value })} />
            ))}
            {trait.unit === 'scale' && (
              <TextInput
                value={trait.scaleMax ? String(trait.scaleMax) : ''}
                onChangeText={(input) => update(index, { scaleMax: Number(input) || undefined })}
                keyboardType="decimal-pad"
                placeholder="Out of"
                placeholderTextColor={C.placeholder}
                style={[styles.input, { width: 80 }]}
              />
            )}
            <Pressable accessibilityRole="button" onPress={() => onChange(traits.filter((_, i) => i !== index))} hitSlop={6}>
              <Text style={[styles.link, { color: C.danger }]}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {traits.length < 10 && (
        <ActionButton label="Add a trait" onPress={() => onChange([...traits, { name: '', score: Number.NaN, unit: 'percentile' }])} />
      )}
    </View>
  );
}

function DateTakenInput({ value, onChange }: { value?: string; onChange: (value: string | undefined) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>When did you take it? (optional)</Text>
      <TextInput
        value={value ?? ''}
        onChangeText={(input) => onChange(input.trim() || undefined)}
        placeholder="YYYY-MM"
        placeholderTextColor={C.placeholder}
        maxLength={10}
        style={[styles.input, { width: 140 }]}
      />
    </View>
  );
}

function TipiStep({ index, value, onChange }: { index: number; value: number | null; onChange: (value: number) => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.hint}>{TIPI_STEM}</Text>
      <Text style={styles.title}>{TIPI_ITEMS[index]}</Text>
      <View style={{ gap: 8 }}>
        {TIPI_SCALE.map((option) => (
          <Chip
            key={option.value}
            option={{ value: String(option.value), label: `${option.value}  ${option.label}` }}
            selected={value === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

function ReviewStep({
  draft,
  profile,
  controls,
  onControlsChange,
  onEdit,
  onFinishTest,
}: {
  draft: AboutMeDraft;
  profile: AboutMeProfile | null;
  controls: PersonalisationControls;
  onControlsChange: (controls: PersonalisationControls) => void;
  onEdit: (step: string) => void;
  onFinishTest: () => void;
}) {
  const assessment = getDraftAssessment(draft, profile?.personality_assessments.active ?? null);
  const preview: AboutMeProfile = {
    about_me: draft.about_me,
    assistant_preferences: draft.assistant_preferences,
    personality_route: draft.personality_route ?? null,
    personality_assessments: { active: assessment },
    personalisation_controls: controls,
    field_meta: {},
  };
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.body}>{REVIEW_COPY}</Text>
      </View>
      <ProfileSummary profile={profile} draftOrProfile={preview} onEdit={onEdit} />
      <PersonalitySnapshot assessment={assessment} onEdit={() => onEdit('q1')} onFinish={onFinishTest} />
      <ControlsCard controls={controls} onChange={onControlsChange} />
    </>
  );
}

// ---------- shared pieces ----------

function ProfileSummary({
  draftOrProfile,
  onEdit,
}: {
  profile: AboutMeProfile | null;
  draftOrProfile: AboutMeProfile;
  onEdit: (step: string) => void;
}) {
  const about = draftOrProfile.about_me as Record<string, unknown>;
  const prefs = draftOrProfile.assistant_preferences as Record<string, unknown>;
  const describe = (question: ChoiceQuestion) => {
    const source = question.section === 'about_me' ? about : prefs;
    const value = source[question.field];
    const labels = (Array.isArray(value) ? value : value ? [value] : []).map((item) => labelFor(question.options, String(item)) ?? String(item));
    const extra = question.text ? String(about[question.text.field] ?? '').trim() : '';
    return [...labels, ...(extra ? [`“${extra}”`] : [])].join(', ') || 'Skipped';
  };
  const rows = (section: 'about_me' | 'assistant_preferences') => PROFILE_QUESTIONS.filter((question) => question.section === section);
  return (
    <>
      {([
        ['About you', 'about_me'],
        ['How Eazee should help', 'assistant_preferences'],
      ] as const).map(([title, section]) => (
        <Section key={section} emoji={section === 'about_me' ? '🙋' : '💬'} title={title}>
          {rows(section).map((question, index) => (
            <View key={question.id}>
              {index > 0 && <View style={styles.divider} />}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit: ${question.title}`}
                onPress={() => onEdit(question.id)}
                style={({ pressed }) => [styles.summaryRow, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryLabel}>{question.title}</Text>
                  <Text style={[styles.summaryValue, describe(question) === 'Skipped' && styles.skippedValue]}>{describe(question)}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color="rgba(255, 255, 255, 0.8)" />
              </Pressable>
            </View>
          ))}
        </Section>
      ))}
    </>
  );
}

function PersonalitySnapshot({
  assessment,
  onEdit,
  onFinish,
}: {
  assessment: Assessment | null;
  onEdit?: () => void;
  onFinish: () => void;
}) {
  return (
    <Section
      emoji="🧭"
      title="Personality snapshot"
      right={onEdit ? (
        <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={8}><Text style={styles.link}>Edit</Text></Pressable>
      ) : undefined}
    >
      <View style={{ paddingVertical: 10, gap: 10 }}>
      {!assessment && <Text style={styles.summaryValue}>No personality result yet.</Text>}
      {assessment?.kind === 'tipi' && (() => {
        const scores = scoreTipi(assessment.responses);
        const complete = isTipiComplete(assessment.responses);
        return (
          <View style={{ gap: 10 }}>
            {!complete && (
              <>
                <Text style={styles.body}>
                  {`${describeMissedStatements(getMissedTipiStatements(assessment.responses as (number | null)[]))}. Answer every statement to see your Eazee personality.`}
                </Text>
                <ActionButton label="Finish the test" onPress={onFinish} />
              </>
            )}
            <Text style={styles.hint}>Broad tendencies on a 1–7 scale (4 is the middle). Ten-Item Personality Inventory.</Text>
            {TIPI_TRAITS.map(({ trait, label }) => (
              <View key={trait} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row' }}>
                  <Text style={[styles.summaryLabel, { flex: 1 }]}>{label}</Text>
                  <Text style={styles.summaryValue}>{formatScore(scores[trait])}</Text>
                </View>
                <View style={styles.barTrack}>
                  {scores[trait] !== null && <View style={[styles.barFill, { width: `${((scores[trait]! - 1) / 6) * 100}%` }]} />}
                </View>
              </View>
            ))}
          </View>
        );
      })()}
      {assessment?.kind === 'mbti' && (
        <Text style={styles.body}>
          {`Self-reported: ${assessment.type}${assessment.identity ? `-${assessment.identity}` : ''} (${labelFor(MBTI_SOURCE_OPTIONS, assessment.source)})${assessment.dateTaken ? `, taken ${assessment.dateTaken}` : ''}`}
        </Text>
      )}
      {assessment?.kind === 'big_five' && (
        <View style={{ gap: 4 }}>
          <Text style={styles.body}>{`Self-reported, from ${assessment.testName}${assessment.dateTaken ? ` (${assessment.dateTaken})` : ''}:`}</Text>
          {assessment.traits.map((trait) => (
            <Text key={trait.name} style={styles.summaryValue}>
              {`${trait.name}: ${trait.score}${trait.unit === 'percentile' ? ' percentile' : trait.unit === 'percent' ? '%' : trait.scaleMax ? ` / ${trait.scaleMax}` : ''}`}
            </Text>
          ))}
        </View>
      )}
      {assessment?.kind === 'other' && (
        <Text style={styles.body}>{`Self-reported, from ${assessment.testName}: ${assessment.resultText}`}</Text>
      )}
      </View>
    </Section>
  );
}

function ControlsCard({ controls, onChange }: { controls: PersonalisationControls; onChange: (controls: PersonalisationControls) => void }) {
  const rows: { key: keyof PersonalisationControls; label: string }[] = [
    { key: 'aboutMe', label: 'Use my about-me answers' },
    { key: 'preferences', label: 'Use my communication and planning preferences' },
    { key: 'personality', label: 'Use my personality result' },
  ];
  return (
    <Section emoji="🎛️" title="What Eazee uses">
      {rows.map((row, index) => (
        <View key={row.key}>
          {index > 0 && <View style={styles.divider} />}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: controls[row.key] }}
            onPress={() => onChange({ ...controls, [row.key]: !controls[row.key] })}
            style={styles.switchRow}
          >
            <Text style={[styles.body, { flex: 1 }]}>{row.label}</Text>
            <Toggle enabled={controls[row.key]} />
          </Pressable>
        </View>
      ))}
    </Section>
  );
}

/** A titled group: an emoji and small heading above a glass card, like Settings. */
function Section({ emoji, title, right, children }: { emoji: string; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEmoji}>{emoji}</Text>
        <Text style={[styles.sectionTitle, { flex: 1 }]}>{title}</Text>
        {right}
      </View>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

/** A tappable row with an arrow, inside a Section. */
function LinkRow({ label, detail, onPress, destructive, divider }: { label: string; detail?: string; onPress: () => void; destructive?: boolean; divider?: boolean }) {
  return (
    <View>
      {divider && <View style={styles.divider} />}
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.linkLabel, destructive && { color: C.danger }]}>{label}</Text>
          {!!detail && <Text style={styles.hint}>{detail}</Text>}
        </View>
        {!destructive && <MaterialCommunityIcons name="chevron-right" size={24} color="rgba(255, 255, 255, 0.8)" />}
      </Pressable>
    </View>
  );
}

/** The Settings on/off switch. */
function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <View style={[styles.toggle, enabled && styles.toggleOn]}>
      <View style={[styles.toggleKnob, enabled && styles.toggleKnobOn]} />
    </View>
  );
}

function Chip({ option, selected, onPress, compact }: { option: Option; selected: boolean; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, compact && styles.chipCompact, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primary, disabled && { opacity: 0.5 }]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, onPress, destructive }: { label: string; onPress: () => void; destructive?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondary}>
      <Text style={[styles.secondaryText, destructive && { color: C.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { paddingTop: 18, gap: 18, paddingBottom: 40 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  sectionEmoji: { fontSize: 20 },
  sectionTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  groupCard: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  divider: { height: 1, backgroundColor: C.divider },
  linkRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  linkLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  skippedValue: { color: C.hint, fontStyle: 'italic' },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: C.switchOff,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  toggleOn: { backgroundColor: C.accent },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(246, 242, 227, 0.72)' },
  toggleKnobOn: { backgroundColor: C.onAccent, transform: [{ translateX: 20 }] },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 16,
    gap: 10,
  },
  title: { fontSize: 20, fontWeight: '900', color: C.title },
  cardTitle: { fontSize: 16, fontWeight: '900', color: C.title },
  body: { fontSize: 15, lineHeight: 21, color: C.body, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 18, color: C.hint, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '900', color: C.title, marginTop: 4 },
  error: { fontSize: 13, color: C.danger, textAlign: 'center' },
  notice: { fontSize: 14, lineHeight: 20, color: C.danger, fontWeight: '800', textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '900', color: '#FFFFFF', textDecorationLine: 'underline' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.chipBorder,
    backgroundColor: C.chip,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  chipCompact: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  chipSelected: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontSize: 15, color: '#FFFFFF', fontWeight: '800' },
  chipTextSelected: { color: C.onAccent },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.chipBorder,
    backgroundColor: C.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: C.title,
  },
  traitRow: { gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skipButton: { paddingHorizontal: 18, paddingVertical: 14 },
  skipText: { fontSize: 16, fontWeight: '700', color: C.accent },
  primary: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: C.onAccent, fontSize: 16, fontWeight: '900' },
  secondary: { borderRadius: 999, paddingVertical: 12, alignItems: 'center', backgroundColor: C.secondary, borderWidth: 1, borderColor: C.cardBorder },
  secondaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  summaryLabel: { fontSize: 12, color: C.hint, fontWeight: '800' },
  summaryValue: { marginTop: 3, fontSize: 15, color: '#FFFFFF', fontWeight: '800' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: C.divider, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: C.accent },
});
