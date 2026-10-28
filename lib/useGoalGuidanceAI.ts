import { useCallback, useEffect, useRef, useState } from 'react';
import {
  requestGoalGuidance,
  saveGoalGuidanceConversation,
  saveGoalGuidancePreview,
  saveGoalGuidanceResponse,
  type GoalGuidanceRequestActiveMilestone,
  type GoalGuidanceRequestParentGoal,
  type GoalGuidanceMessage,
  type GoalGuidanceMode,
  type GoalGuidancePlan,
  type GoalGuidanceResponse,
  type GoalGuidanceTimeframe,
} from '@/lib/goalGuidance';

type GoalGuidanceContext = {
  goalId: string;
  goalTitle: string;
  goalDetails?: string;
  timeframe: GoalGuidanceTimeframe;
  deadline: Date;
  parentGoal?: Omit<GoalGuidanceRequestParentGoal, 'deadlineLocalIso'> & { deadline: Date };
  activeMilestone?: GoalGuidanceRequestActiveMilestone;
  quota?: {
    targetCount: number;
    completedCount?: number;
    unitLabel: string;
    unitType: 'distinct_days' | 'count';
  };
};

type GoalGuidanceNotice = {
  kind: 'toast' | 'clarify' | 'error';
  message: string;
};

type PendingGoalGuidancePlanChange = {
  response: GoalGuidanceResponse;
  conversation: GoalGuidanceMessage[];
};

type RunGoalGuidanceOptions = {
  resetConversation?: boolean;
  resetCurrentPlan?: boolean;
};

type UseGoalGuidanceAIOptions = {
  context: GoalGuidanceContext | null;
  currentPlan?: GoalGuidancePlan | null;
  onPlanSaved?: (plan: GoalGuidancePlan, response?: GoalGuidanceResponse) => void | Promise<void>;
  onClearBlockedPreview?: () => void | Promise<void>;
};

const toLocalIso = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().replace('Z', '');
};

const formatCurrentPlan = (plan?: GoalGuidancePlan | null) => {
  if (!plan) {
    return '';
  }

  const steps = plan.steps
    .map((step, index) => `${index + 1}. ${step.title}${step.details ? ` - ${step.details}` : ''}${step.effort ? ` (${step.effort})` : ''}${step.youtubeQuery ? ` [YouTube: ${step.youtubeQuery}]` : ''}`)
    .join('\n');

  return [
    `Status: ${plan.status}`,
    `Feasibility: ${plan.feasibilityStatus}`,
    plan.feasibilityNote ? `Note: ${plan.feasibilityNote}` : '',
    steps ? `Steps:\n${steps}` : '',
  ].filter(Boolean).join('\n');
};

const formatResponseForConversation = (response: GoalGuidanceResponse) => {
  const steps = response.steps
    .map((step, index) => `${index + 1}. ${step.title}${step.details ? ` - ${step.details}` : ''}${step.effort ? ` (${step.effort})` : ''}${step.youtubeQuery ? ` [YouTube: ${step.youtubeQuery}]` : ''}`)
    .join('\n');

  return [
    response.type === 'plan' && response.goalTitle ? `Goal: ${response.goalTitle}` : '',
    response.feasibilityNote || (response.type === 'not_feasible' ? 'This goal looks unrealistic for the deadline.' : 'Steps are ready.'),
    steps ? `Steps:\n${steps}` : '',
  ].filter(Boolean).join('\n');
};

const getConversationKey = (messages: GoalGuidanceMessage[]) => JSON.stringify(messages);

const getClarificationQuestions = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);
  const questions = lines.flatMap((line) => {
    const cleaned = line.replace(
      /^.*?:\s*(?=(?:what|how|when|which|who|where|why|do|does|did|are|is|can|could|would|will|should|have|has|tell)\b)/i,
      ''
    );
    const matches = cleaned.match(/[^?]+?\?/g);
    return matches?.length
      ? matches.map((question) => question.trim().replace(/^[-*\d.)\s]+/, '').trim())
      : [cleaned.trim()];
  });

  return questions.filter(Boolean);
};

const isPlanChangeConfirmation = (text: string) => {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, '');
  return /^(yes|yeah|yep|ok|okay|sure)( please)?$/.test(normalized) ||
    /^(please )?(do it|go ahead|change it|update it|apply it|make the change|looks good)$/.test(normalized);
};

const isTryAnywayRequest = (text: string) => {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, '');
  return isPlanChangeConfirmation(normalized) ||
    /\b(try anyway|do it anyway|go ahead anyway|still do it|weekly plan anyway|make (?:me )?(?:a )?weekly plan)\b/.test(normalized);
};

const isGoalScopeChangeRequest = (text: string) => {
  const normalized = text.trim().toLowerCase();
  if (/\b(rename|retitle)\b/.test(normalized)) {
    return true;
  }

  const namesGoal = /\b(goal|title|outcome)\b/.test(normalized);
  const changeVerb = /\b(change|switch|replace|turn|make|update)\b/.test(normalized);
  const targetPhrase = /\b(to|into|about|instead|rather than|be)\b/.test(normalized);
  if (namesGoal && changeVerb && targetPhrase) {
    return true;
  }

  if (/\b(change|switch|turn|make)\s+(it|this)\s+(to|into|about)\b/.test(normalized)) {
    return true;
  }

  if (
    /\b(change|make|reduce|lower|decrease)\s+(it|this)\s+(?:to\s+)?(?:a\s+)?(?:smaller|lower|less|easier|more realistic|\d)/.test(normalized)
  ) {
    return true;
  }

  return /\b(instead|rather than)\b/.test(normalized) &&
    /\b(i want to|i'd like to|id like to|let's|lets|can we|could we)\b/.test(normalized) &&
    !/\b(step|task|action|todo)\b/.test(normalized);
};

const withAllowedGoalTitle = (response: GoalGuidanceResponse, allowGoalTitle: boolean) =>
  response.goalTitle && !allowGoalTitle
    ? { ...response, goalTitle: undefined }
    : response;

const isBlockedGoalGuidancePreview = (plan?: GoalGuidancePlan | null) =>
  !!plan &&
  plan.status === 'preview' &&
  plan.feasibilityStatus === 'unrealistic';

export function useGoalGuidanceAI({
  context,
  currentPlan,
  onPlanSaved,
  onClearBlockedPreview,
}: UseGoalGuidanceAIOptions) {
  const [inputValue, setInputValueState] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [notice, setNotice] = useState<GoalGuidanceNotice | null>(null);
  const [conversation, setConversation] = useState<GoalGuidanceMessage[]>([]);
  const [answerText, setAnswerText] = useState('');
  const [pendingPlanChange, setPendingPlanChange] = useState<PendingGoalGuidancePlanChange | null>(null);
  const inputValueRef = useRef('');
  const goalIdRef = useRef<string | null>(null);
  const hydratedConversationKeyRef = useRef('');
  const queuedClarificationQuestionsRef = useRef<string[]>([]);

  const setInputValue = useCallback((value: string) => {
    inputValueRef.current = value;
    setInputValueState(value);
  }, []);

  useEffect(() => {
    const goalId = context?.goalId || null;
    const planConversation = currentPlan?.goalId === goalId ? currentPlan.conversation || [] : [];
    const planConversationKey = getConversationKey(planConversation);

    if (goalIdRef.current !== goalId) {
      goalIdRef.current = goalId;
      hydratedConversationKeyRef.current = planConversationKey;
      setInputValue('');
      setNotice(null);
      setConversation(planConversation);
      setAnswerText('');
      setPendingPlanChange(null);
      queuedClarificationQuestionsRef.current = [];
      return;
    }

    if (currentPlan?.goalId === goalId && planConversationKey !== hydratedConversationKeyRef.current && !isRunning) {
      hydratedConversationKeyRef.current = planConversationKey;
      setConversation(planConversation);
    }
  }, [context?.goalId, currentPlan?.conversation, currentPlan?.goalId, isRunning, setInputValue]);

  const runGuidance = useCallback(async (
    mode: GoalGuidanceMode,
    userText?: string,
    contextOverride?: GoalGuidanceContext,
    options?: RunGoalGuidanceOptions
  ) => {
    const guidanceContext = contextOverride || context;
    if (!guidanceContext || isRunning) {
      return;
    }

    const trimmedUserText = String(userText || '').trim();
    const baseConversation = options?.resetConversation ? [] : conversation;
    const nextConversation = trimmedUserText
      ? [...baseConversation, { role: 'user' as const, content: trimmedUserText }]
      : baseConversation;
    const isAcceptedFollowUp =
      !!currentPlan?.id &&
      (currentPlan.status === 'accepted' || currentPlan.status === 'complete') &&
      mode === 'answer_clarification' &&
      trimmedUserText.length > 0;

    setInputValue('');
    setIsRunning(true);
    setNotice(null);
    if (!isAcceptedFollowUp) {
      setAnswerText('');
    }
    setPendingPlanChange(null);

    try {
      const response = await requestGoalGuidance({
        goalTitle: guidanceContext.goalTitle,
        goalDetails: guidanceContext.goalDetails || '',
        timeframe: guidanceContext.timeframe,
        deadlineLocalIso: toLocalIso(guidanceContext.deadline),
        nowLocalIso: toLocalIso(new Date()),
        userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        currentPlan: options?.resetCurrentPlan ? '' : formatCurrentPlan(currentPlan),
        conversation: nextConversation,
        mode,
        parentGoal: guidanceContext.parentGoal
          ? {
              title: guidanceContext.parentGoal.title,
              details: guidanceContext.parentGoal.details,
              timeframe: guidanceContext.parentGoal.timeframe,
              deadlineLocalIso: toLocalIso(guidanceContext.parentGoal.deadline),
            }
          : undefined,
        activeMilestone: guidanceContext.activeMilestone,
        quota: guidanceContext.quota,
      });

      const allowGoalTitle =
        isGoalScopeChangeRequest(trimmedUserText) &&
        (mode === 'answer_clarification' || !!options?.resetCurrentPlan);
      const responseForSave = withAllowedGoalTitle(response, allowGoalTitle);

      if (response.type === 'clarify') {
        const rawAssistantMessage = response.question || 'What should I know before making the steps?';
        const clarificationQuestions = isAcceptedFollowUp
          ? [rawAssistantMessage]
          : getClarificationQuestions(rawAssistantMessage);
        const assistantMessage = clarificationQuestions[0] || rawAssistantMessage;
        queuedClarificationQuestionsRef.current = clarificationQuestions.slice(1);
        const savedConversation = [...nextConversation, { role: 'assistant' as const, content: assistantMessage }];
        hydratedConversationKeyRef.current = getConversationKey(savedConversation);
        setConversation(savedConversation);
        if (isAcceptedFollowUp) {
          setAnswerText(assistantMessage);
        } else {
          setNotice({ kind: 'clarify', message: assistantMessage });
        }

        const savedPlan = currentPlan?.id && !options?.resetCurrentPlan
          ? await saveGoalGuidanceConversation(currentPlan.id, savedConversation)
          : await saveGoalGuidancePreview({
              goalId: guidanceContext.goalId,
              timeframe: guidanceContext.timeframe,
              deadline: guidanceContext.deadline,
              response,
              conversation: savedConversation,
              cram: mode === 'cram',
            });
        await onPlanSaved?.(savedPlan);
        return;
      }

      queuedClarificationQuestionsRef.current = [];

      if (isAcceptedFollowUp && currentPlan?.id) {
        const assistantMessage = responseForSave.type === 'not_feasible'
          ? (responseForSave.feasibilityNote || responseForSave.alternativeSuggestion || 'That change does not look realistic for this deadline.')
          : 'I can change the plan for that. Do you want me to update it?';
        const savedConversation = [...nextConversation, { role: 'assistant' as const, content: assistantMessage }];
        hydratedConversationKeyRef.current = getConversationKey(savedConversation);
        setConversation(savedConversation);
        setAnswerText(assistantMessage);
        setPendingPlanChange(
          responseForSave.type === 'plan'
            ? { response: responseForSave, conversation: savedConversation }
            : null
        );

        const savedPlan = await saveGoalGuidanceConversation(currentPlan.id, savedConversation);
        await onPlanSaved?.(savedPlan);
        return;
      }

      const assistantMessage = formatResponseForConversation(responseForSave);
      const savedConversation = [...nextConversation, { role: 'assistant' as const, content: assistantMessage }];
      hydratedConversationKeyRef.current = getConversationKey(savedConversation);
      const savedPlan = await saveGoalGuidanceResponse({
        goalId: guidanceContext.goalId,
        timeframe: guidanceContext.timeframe,
        deadline: guidanceContext.deadline,
        response: responseForSave,
        conversation: savedConversation,
        cram: mode === 'cram',
      });

      setConversation(savedConversation);
      if (responseForSave.type !== 'not_feasible') {
        setNotice({
          kind: 'toast',
          message: 'Steps are ready.',
        });
      }
      await onPlanSaved?.(savedPlan, responseForSave);
    } catch (error: any) {
      const errorMessage = String(error?.message || error || 'Goal guidance failed.');
      if (isAcceptedFollowUp) {
        setAnswerText(errorMessage);
      } else {
        setNotice({
          kind: 'error',
          message: errorMessage,
        });
      }
    } finally {
      setIsRunning(false);
    }
  }, [context, conversation, currentPlan, isRunning, onPlanSaved, setInputValue]);

  const clearBlockedPreviewForReplacement = useCallback(async () => {
    queuedClarificationQuestionsRef.current = [];
    setInputValue('');
    setNotice(null);
    setAnswerText('');
    setPendingPlanChange(null);
    await onClearBlockedPreview?.();
  }, [onClearBlockedPreview, setInputValue]);

  const returnToPlan = useCallback(() => {
    setAnswerText('');
    setPendingPlanChange(null);
    setNotice(null);
  }, []);

  const applyPendingPlanChange = useCallback(async () => {
    if (!context || !pendingPlanChange || isRunning) {
      return;
    }

    setIsRunning(true);
    setNotice(null);

    try {
      const savedPlan = await saveGoalGuidanceResponse({
        goalId: context.goalId,
        timeframe: context.timeframe,
        deadline: context.deadline,
        response: pendingPlanChange.response,
        conversation: pendingPlanChange.conversation,
        cram: currentPlan?.cram || false,
      });

      hydratedConversationKeyRef.current = getConversationKey(pendingPlanChange.conversation);
      setConversation(pendingPlanChange.conversation);
      setAnswerText('');
      setPendingPlanChange(null);
      setNotice({ kind: 'toast', message: 'Plan updated.' });
      await onPlanSaved?.(savedPlan, pendingPlanChange.response);
    } catch (error: any) {
      setAnswerText(String(error?.message || error || 'Could not update the plan.'));
    } finally {
      setIsRunning(false);
    }
  }, [context, currentPlan?.cram, isRunning, onPlanSaved, pendingPlanChange]);

  const submitText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    if (pendingPlanChange && isPlanChangeConfirmation(trimmed)) {
      setInputValue('');
      await applyPendingPlanChange();
      return;
    }

    const isBlockedPreview = isBlockedGoalGuidancePreview(currentPlan);
    if (isBlockedPreview && isTryAnywayRequest(trimmed)) {
      await clearBlockedPreviewForReplacement();
      await runGuidance('cram', trimmed, undefined, {
        resetConversation: false,
        resetCurrentPlan: true,
      });
      return;
    }

    if (isBlockedPreview) {
      await clearBlockedPreviewForReplacement();
      await runGuidance('generate', trimmed, undefined, {
        resetCurrentPlan: true,
      });
      return;
    }

    const [nextQueuedQuestion, ...remainingQueuedQuestions] = queuedClarificationQuestionsRef.current;
    if (nextQueuedQuestion && currentPlan?.id) {
      setInputValue('');
      setIsRunning(true);
      setNotice(null);
      try {
        const savedConversation = [
          ...conversation,
          { role: 'user' as const, content: trimmed },
          { role: 'assistant' as const, content: nextQueuedQuestion },
        ];
        const savedPlan = await saveGoalGuidanceConversation(currentPlan.id, savedConversation);

        queuedClarificationQuestionsRef.current = remainingQueuedQuestions;
        hydratedConversationKeyRef.current = getConversationKey(savedConversation);
        setConversation(savedConversation);
        setNotice({ kind: 'clarify', message: nextQueuedQuestion });
        await onPlanSaved?.(savedPlan);
      } catch (error: any) {
        setNotice({
          kind: 'error',
          message: String(error?.message || error || 'Could not save that answer.'),
        });
      } finally {
        setIsRunning(false);
      }
      return;
    }

    await runGuidance('answer_clarification', trimmed);
  }, [
    applyPendingPlanChange,
    clearBlockedPreviewForReplacement,
    conversation,
    currentPlan,
    onPlanSaved,
    pendingPlanChange,
    runGuidance,
    setInputValue,
  ]);

  const submit = useCallback(async () => {
    await submitText(inputValueRef.current);
  }, [submitText]);

  const clearNotice = useCallback(() => setNotice(null), []);

  const requestSteps = useCallback((contextOverride?: GoalGuidanceContext) =>
    runGuidance('generate', undefined, contextOverride), [runGuidance]);

  const requestFreshSteps = useCallback((
    contextOverride?: GoalGuidanceContext,
    options?: Pick<RunGoalGuidanceOptions, 'resetConversation'> & { userText?: string }
  ) =>
    runGuidance('generate', options?.userText, contextOverride, {
      resetConversation: options?.resetConversation ?? true,
      resetCurrentPlan: true,
    }), [runGuidance]);

  const requestCram = useCallback(async () => {
    if (isBlockedGoalGuidancePreview(currentPlan)) {
      await clearBlockedPreviewForReplacement();
      await runGuidance('cram', 'try anyway', undefined, {
        resetConversation: false,
        resetCurrentPlan: true,
      });
      return;
    }

    await runGuidance('cram');
  }, [clearBlockedPreviewForReplacement, currentPlan, runGuidance]);

  return {
    inputValue,
    setInputValue,
    submit,
    submitText,
    isRunning,
    notice,
    conversation,
    answerText,
    hasPendingPlanChange: !!pendingPlanChange,
    clearNotice,
    returnToPlan,
    applyPendingPlanChange,
    requestSteps,
    requestFreshSteps,
    requestCram,
  };
}
