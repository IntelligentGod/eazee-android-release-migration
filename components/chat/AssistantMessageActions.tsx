import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import type { AssistantMessageExtras, GoalTimeframe } from '@/lib/assistantMessageExtras';
import { getSavedPreferenceLabel, SAVED_PREFERENCE_FIELDS, type SavedPreferenceField } from '@/lib/aiSavedPreferences';

/** What a save reported. A failure keeps the proposal on screen so it can be retried. */
/** `limitReached`: nothing was saved because today's free AI actions are used up; `error` is the whole message. */
export type AssistantActionResult = { ok: true; message?: string } | { ok: false; error: string; limitReached?: boolean };

export type AssistantMessageActionHandlers = {
  onChoose: (text: string) => void;
  onAddTasks: (tasks: string[]) => Promise<AssistantActionResult>;
  onSaveGoal: (goal: { title: string; timeframe: GoalTimeframe }) => Promise<AssistantActionResult>;
  onRemember: (field: SavedPreferenceField, value: string, remember: boolean) => Promise<AssistantActionResult>;
  onShare: (text: string) => Promise<void>;
};

const GOAL_TIMEFRAME_LABELS: Record<GoalTimeframe, string> = {
  thisWeek: 'This week',
  thisMonth: 'This month',
  thisYear: 'This year',
  longTerm: 'Long term',
};

const chipStyle = (pressed: boolean, disabled?: boolean) => ({
  paddingHorizontal: 12,
  paddingVertical: 7,
  borderRadius: 999,
  borderWidth: 1.2,
  borderColor: '#32AA9D',
  backgroundColor: pressed ? 'rgba(23, 116, 112, 0.9)' : 'rgba(0, 0, 0, 0.4)',
  opacity: disabled ? 0.5 : 1,
});
const chipTextStyle = { color: '#E8FFFA', fontSize: 13, fontWeight: '700' as const };
const cardStyle = {
  marginTop: 10,
  padding: 12,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(50, 170, 157, 0.7)',
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
};
const cardTitleStyle = { color: '#C8FFFB', fontSize: 13, fontWeight: '800' as const, marginBottom: 6 };
const primaryButtonStyle = (pressed: boolean, disabled?: boolean) => ({
  marginTop: 10,
  alignSelf: 'flex-start' as const,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 6,
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: pressed ? '#2C9488' : '#32AA9D',
  opacity: disabled ? 0.55 : 1,
});

type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error' | 'limit'; message?: string };

/** Runs a save once at a time; repeated taps while it runs are ignored. */
function useSave() {
  const [state, setState] = useState<SaveState>({ status: 'idle' });
  const runningRef = useRef(false);
  const run = async (action: () => Promise<AssistantActionResult>) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState({ status: 'saving' });
    try {
      const result = await action();
      setState(result.ok
        ? { status: 'saved', message: result.message }
        : { status: result.limitReached ? 'limit' : 'error', message: result.error });
    } catch (error) {
      setState({ status: 'error', message: String((error as Error)?.message || 'That was not saved.') });
    } finally {
      runningRef.current = false;
    }
  };
  return { state, run };
}

function StatusLine({ state, savedText }: { state: SaveState; savedText: string }) {
  if (state.status === 'saved') {
    return <Text style={{ marginTop: 8, color: '#9EF5E4', fontSize: 12, fontWeight: '700' }}>{state.message || savedText}</Text>;
  }
  if (state.status === 'limit') {
    return <Text style={{ marginTop: 8, color: '#FFE7B3', fontSize: 12, fontWeight: '700' }}>{state.message}</Text>;
  }
  if (state.status === 'error') {
    return (
      <Text style={{ marginTop: 8, color: '#FFD1CC', fontSize: 12, fontWeight: '700' }}>
        {`Not saved: ${state.message || 'something went wrong'}. You can try again.`}
      </Text>
    );
  }
  return null;
}

function TaskReviewCard({ tasks, onAddTasks }: { tasks: string[]; onAddTasks: AssistantMessageActionHandlers['onAddTasks'] }) {
  const [selected, setSelected] = useState(() => new Set(tasks));
  const { state, run } = useSave();
  const chosen = tasks.filter((task) => selected.has(task));
  const isDone = state.status === 'saved';

  return (
    <View style={cardStyle}>
      <Text style={cardTitleStyle}>Add these tasks to To Do?</Text>
      {tasks.map((task) => {
        const isChecked = selected.has(task);
        return (
          <Pressable
            key={task}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isChecked, disabled: isDone }}
            disabled={isDone || state.status === 'saving'}
            onPress={() => setSelected((current) => {
              const next = new Set(current);
              if (next.has(task)) next.delete(task); else next.add(task);
              return next;
            })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
          >
            <MIcon name={isChecked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'} size={20} color="#C8FFFB" />
            <Text style={{ flex: 1, color: '#E8FFFA', fontSize: 14 }}>{task}</Text>
          </Pressable>
        );
      })}
      {!isDone && (
        <Pressable
          accessibilityRole="button"
          disabled={!chosen.length || state.status === 'saving'}
          onPress={() => void run(() => onAddTasks(chosen))}
          style={({ pressed }) => primaryButtonStyle(pressed, !chosen.length || state.status === 'saving')}
        >
          {state.status === 'saving' ? <ActivityIndicator size="small" color="#00262A" /> : <MIcon name="plus" size={16} color="#00262A" />}
          <Text style={{ color: '#00262A', fontSize: 13, fontWeight: '800' }}>
            {chosen.length === 1 ? 'Add 1 task' : `Add ${chosen.length} tasks`}
          </Text>
        </Pressable>
      )}
      <StatusLine state={state} savedText="Added to To Do." />
    </View>
  );
}

function GoalReviewCard({
  goal,
  onSaveGoal,
}: {
  goal: { title: string; timeframe: GoalTimeframe };
  onSaveGoal: AssistantMessageActionHandlers['onSaveGoal'];
}) {
  const { state, run } = useSave();
  return (
    <View style={cardStyle}>
      <Text style={cardTitleStyle}>Save this goal?</Text>
      <Text style={{ color: '#E8FFFA', fontSize: 15, fontWeight: '700' }}>{goal.title}</Text>
      <Text style={{ color: 'rgba(232, 255, 250, 0.72)', fontSize: 12, marginTop: 2 }}>
        {GOAL_TIMEFRAME_LABELS[goal.timeframe]}
      </Text>
      {state.status !== 'saved' && (
        <Pressable
          accessibilityRole="button"
          disabled={state.status === 'saving'}
          onPress={() => void run(() => onSaveGoal(goal))}
          style={({ pressed }) => primaryButtonStyle(pressed, state.status === 'saving')}
        >
          {state.status === 'saving' ? <ActivityIndicator size="small" color="#00262A" /> : <MIcon name="flag-outline" size={16} color="#00262A" />}
          <Text style={{ color: '#00262A', fontSize: 13, fontWeight: '800' }}>Save goal</Text>
        </Pressable>
      )}
      <StatusLine state={state} savedText="Saved to Goals." />
    </View>
  );
}

/** The one preference question the app asks in a user's first chats, under a useful reply. */
function PreferenceQuestionPrompt({
  question,
  onChoose,
}: {
  question: { question: string; options: string[] };
  onChoose: AssistantMessageActionHandlers['onChoose'];
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <View style={cardStyle}>
      <Text style={{ color: '#E8FFFA', fontSize: 14, lineHeight: 19 }}>{question.question}</Text>
      {chosen ? (
        <Text style={{ marginTop: 8, color: 'rgba(232, 255, 250, 0.72)', fontSize: 12 }}>{chosen}</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {question.options.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              onPress={() => {
                setChosen(option);
                onChoose(option);
              }}
              style={({ pressed }) => chipStyle(pressed)}
            >
              <Text style={chipTextStyle}>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function RememberPrompt({
  remember,
  onRemember,
}: {
  remember: NonNullable<AssistantMessageExtras['remember']>;
  onRemember: AssistantMessageActionHandlers['onRemember'];
}) {
  const { state, run } = useSave();
  const [declined, setDeclined] = useState(false);
  if (declined) {
    return <Text style={{ marginTop: 8, color: 'rgba(232, 255, 250, 0.72)', fontSize: 12 }}>Okay, just this time.</Text>;
  }
  return (
    <View style={cardStyle}>
      <Text style={{ color: '#E8FFFA', fontSize: 14, lineHeight: 19 }}>{remember.question}</Text>
      {state.status !== 'saved' && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pressable
            accessibilityRole="button"
            disabled={state.status === 'saving'}
            onPress={() => void run(() => onRemember(remember.field, remember.value, true))}
            style={({ pressed }) => chipStyle(pressed, state.status === 'saving')}
          >
            <Text style={chipTextStyle}>Remember this</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={state.status === 'saving'}
            onPress={() => {
              setDeclined(true);
              void onRemember(remember.field, remember.value, false);
            }}
            style={({ pressed }) => chipStyle(pressed, state.status === 'saving')}
          >
            <Text style={chipTextStyle}>Just this time</Text>
          </Pressable>
        </View>
      )}
      <StatusLine
        state={state}
        savedText={`Saved: ${SAVED_PREFERENCE_FIELDS[remember.field].label} - ${getSavedPreferenceLabel(remember.field, remember.value)}. Change it any time in Settings.`}
      />
    </View>
  );
}

/** Follow-ups for a result the AI delivered without any, so a result is never a dead end. */
export function getDefaultFollowUps(extras: AssistantMessageExtras): string[] {
  const isResult = !!(extras.result || extras.copyable || extras.tasks.length || extras.goal);
  if (!isResult) return [];
  if (extras.copyable || extras.result === 'draft') return ['Make it shorter', 'Adjust the tone'];
  if (extras.result === 'comparison') return ['Explain the trade-offs', 'Help me decide'];
  return ['Make it simpler', 'Adjust the plan'];
}

/** Buttons and review cards under one of Eazee's replies, built from its markers. */
export default function AssistantMessageActions({
  extras,
  isLatest,
  isStreaming,
  showRememberPrompt,
  savedPreferenceNotice,
  rememberSuggestion,
  preferenceQuestion,
  handlers,
}: {
  extras: AssistantMessageExtras;
  /** Quick replies only make sense on the newest reply. */
  isLatest: boolean;
  isStreaming?: boolean;
  /** The preference prompt is shown at most once during onboarding. */
  showRememberPrompt: boolean;
  savedPreferenceNotice?: string | null;
  /** A "remember this?" prompt the app adds after the user picked a preference answer. */
  rememberSuggestion?: AssistantMessageExtras['remember'];
  /** A preference question the app adds under this reply (first chats only). */
  preferenceQuestion?: { question: string; options: string[] } | null;
  handlers: AssistantMessageActionHandlers;
}) {
  const [chosenOption, setChosenOption] = useState<string | null>(null);
  if (isStreaming) return null;

  const options = extras.options.length ? extras.options : getDefaultFollowUps(extras);
  const showOptions = isLatest && options.length > 0 && !chosenOption;
  const remember = extras.remember ?? rememberSuggestion ?? null;
  const showCopy = extras.copyable && !!extras.text;
  if (!showOptions && !showCopy && !extras.tasks.length && !extras.goal && !(remember && showRememberPrompt) && !savedPreferenceNotice && !preferenceQuestion) {
    return null;
  }

  return (
    <View style={{ marginTop: 4 }}>
      {!!savedPreferenceNotice && (
        <Text style={{ marginTop: 6, color: '#9EF5E4', fontSize: 12, fontWeight: '700' }}>{savedPreferenceNotice}</Text>
      )}
      {extras.tasks.length > 0 && <TaskReviewCard tasks={extras.tasks} onAddTasks={handlers.onAddTasks} />}
      {!!extras.goal && <GoalReviewCard goal={extras.goal} onSaveGoal={handlers.onSaveGoal} />}
      {!!remember && showRememberPrompt && <RememberPrompt remember={remember} onRemember={handlers.onRemember} />}
      {!!preferenceQuestion && <PreferenceQuestionPrompt question={preferenceQuestion} onChoose={handlers.onChoose} />}
      {(showOptions || showCopy) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {showCopy && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy or share this draft"
              onPress={() => void handlers.onShare(extras.text)}
              style={({ pressed }) => [chipStyle(pressed), { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
            >
              <MIcon name="content-copy" size={14} color="#E8FFFA" />
              <Text style={chipTextStyle}>Copy</Text>
            </Pressable>
          )}
          {showOptions && options.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              onPress={() => {
                // One tap per set of options, so a double tap cannot send twice.
                setChosenOption(option);
                handlers.onChoose(option);
              }}
              style={({ pressed }) => chipStyle(pressed)}
            >
              <Text style={chipTextStyle}>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
