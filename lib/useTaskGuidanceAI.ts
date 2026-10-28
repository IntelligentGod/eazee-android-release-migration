import { useCallback, useEffect, useRef, useState } from 'react';
import {
  requestTaskGuidanceAnswer,
  requestTaskGuidance,
  saveTaskGuide,
  type TaskGuidanceContext,
  type TaskGuidanceMessage,
  type TaskGuidanceResponse,
  type TaskGuide,
} from '@/lib/taskGuidance';
import { isAiAuthRequiredError } from '@/lib/aiAuth';

type UseTaskGuidanceAIOptions = {
  context: TaskGuidanceContext | null;
  guide: TaskGuide | null;
  onGuideSaved?: (guide: TaskGuide, response?: TaskGuidanceResponse) => void | Promise<void>;
};

type PendingTaskGuidancePlanChange = {
  kind: 'clarifying' | 'ready';
  response?: TaskGuidanceResponse;
  conversation: TaskGuidanceMessage[];
};

const getConversationKey = (messages: TaskGuidanceMessage[]) => JSON.stringify(messages);

const formatCurrentGuide = (guide?: TaskGuide | null) => {
  if (!guide) return '';

  const steps = guide.steps
    .map((step, index) => `${index + 1}. ${step.title}${step.details ? ` - ${step.details}` : ''}${step.completed ? ' [done]' : ''}`)
    .join('\n');

  return [
    `Status: ${guide.status}`,
    guide.note ? `Note: ${guide.note}` : '',
    steps ? `Steps:\n${steps}` : '',
  ].filter(Boolean).join('\n');
};

const formatResponseForConversation = (response: TaskGuidanceResponse) => {
  if (response.type === 'clarify') {
    return response.question || 'What should I know before making the steps?';
  }

  const steps = response.steps
    .map((step, index) => `${index + 1}. ${step.title}${step.details ? ` - ${step.details}` : ''}`)
    .join('\n');

  return [
    response.note || 'Steps are ready.',
    steps ? `Steps:\n${steps}` : '',
  ].filter(Boolean).join('\n');
};

const isPlanChangeConfirmation = (text: string) => {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, '');
  return /^(yes|yeah|yep|ok|okay|sure)( please)?$/.test(normalized) ||
    /^(please )?(do it|go ahead|change it|update it|apply it|make the change|looks good)$/.test(normalized);
};

const isTaskGuideChangeRequest = (text: string) => {
  const normalized = text.trim().toLowerCase();
  return /\b(add|remove|delete|drop|change|update|edit|replace|rewrite|reorder|move|swap|split|merge|shorten|simplify|make|turn)\b/.test(normalized) &&
    /\b(step|steps|plan|guide|task|checklist|easier|harder|smaller|clearer|different|instead)\b/.test(normalized);
};

export function useTaskGuidanceAI({
  context,
  guide,
  onGuideSaved,
}: UseTaskGuidanceAIOptions) {
  const [inputValue, setInputValueState] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'toast' | 'clarify' | 'error'; message: string } | null>(null);
  const [conversation, setConversation] = useState<TaskGuidanceMessage[]>([]);
  const [answerText, setAnswerText] = useState('');
  const [pendingPlanChange, setPendingPlanChange] = useState<PendingTaskGuidancePlanChange | null>(null);
  const inputValueRef = useRef('');
  const todoIdRef = useRef<string | null>(null);
  const hydratedConversationKeyRef = useRef('');

  const setInputValue = useCallback((value: string) => {
    inputValueRef.current = value;
    setInputValueState(value);
  }, []);

  useEffect(() => {
    const todoId = context?.todoId || null;
    const guideConversation = guide?.todoId === todoId ? guide.conversation || [] : [];
    const conversationKey = getConversationKey(guideConversation);

    if (todoIdRef.current !== todoId) {
      todoIdRef.current = todoId;
      hydratedConversationKeyRef.current = conversationKey;
      setInputValue('');
      setNotice(null);
      setConversation(guideConversation);
      setAnswerText('');
      setPendingPlanChange(null);
      return;
    }

    if (conversationKey !== hydratedConversationKeyRef.current && !isRunning) {
      hydratedConversationKeyRef.current = conversationKey;
      setConversation(guideConversation);
    }
  }, [context?.todoId, guide?.conversation, guide?.todoId, isRunning, setInputValue]);

  const runGuidance = useCallback(async (
    mode: 'generate' | 'answer_clarification',
    userText?: string,
    resetConversation = false
  ) => {
    if (!context || isRunning) {
      return;
    }

    const trimmedUserText = String(userText || '').trim();
    const baseConversation = resetConversation ? [] : conversation;
    const nextConversation = trimmedUserText
      ? [...baseConversation, { role: 'user' as const, content: trimmedUserText }]
      : baseConversation;
    const isAcceptedFollowUp =
      !!guide &&
      (guide.status === 'accepted' || guide.status === 'complete') &&
      mode === 'answer_clarification' &&
      trimmedUserText.length > 0;
    const isPlanChangeClarification = isAcceptedFollowUp && pendingPlanChange?.kind === 'clarifying';
    const isExplicitPlanChange = isAcceptedFollowUp && (
      isPlanChangeClarification || isTaskGuideChangeRequest(trimmedUserText)
    );

    setInputValue('');
    setIsRunning(true);
    setNotice(null);
    setPendingPlanChange(null);
    if (!isAcceptedFollowUp) {
      setAnswerText('');
    }

    try {
      if (isAcceptedFollowUp && !isExplicitPlanChange && guide) {
        const response = await requestTaskGuidanceAnswer({
          context,
          guide: {
            ...guide,
            conversation: nextConversation,
          },
          question: trimmedUserText,
        });
        const savedConversation = [...nextConversation, { role: 'assistant' as const, content: response.answer }];
        const nextActiveStepIndex =
          Number.isInteger(response.suggestedStepIndex) &&
          response.suggestedStepIndex! >= 0 &&
          response.suggestedStepIndex! < guide.steps.length
            ? response.suggestedStepIndex!
            : guide.activeStepIndex;
        const savedGuide = await saveTaskGuide({
          todoId: context.todoId,
          conversation: savedConversation,
          activeStepIndex: nextActiveStepIndex,
          status: guide.status,
          errorMessage: '',
        });

        hydratedConversationKeyRef.current = getConversationKey(savedConversation);
        setConversation(savedConversation);
        setAnswerText(response.answer);
        await onGuideSaved?.(savedGuide);
        return;
      }

      const response = await requestTaskGuidance({
        context,
        currentGuide: formatCurrentGuide(guide),
        conversation: nextConversation,
        mode,
      });
      const assistantMessage = formatResponseForConversation(response);
      const savedConversation = [...nextConversation, { role: 'assistant' as const, content: assistantMessage }];

      if (isAcceptedFollowUp && isExplicitPlanChange && guide) {
        const planChangeMessage = response.type === 'plan'
          ? 'I can change the plan for that. Do you want me to update it?'
          : assistantMessage;
        const planChangeConversation = [...nextConversation, { role: 'assistant' as const, content: planChangeMessage }];
        const savedGuide = await saveTaskGuide({
          todoId: context.todoId,
          conversation: planChangeConversation,
          status: guide.status,
          errorMessage: '',
        });

        hydratedConversationKeyRef.current = getConversationKey(planChangeConversation);
        setConversation(planChangeConversation);
        setAnswerText(planChangeMessage);
        setPendingPlanChange(
          response.type === 'plan'
            ? { kind: 'ready', response, conversation: planChangeConversation }
            : { kind: 'clarifying', conversation: planChangeConversation }
        );
        await onGuideSaved?.(savedGuide);
        return;
      }

      const savedGuide = await saveTaskGuide({
        todoId: context.todoId,
        conversation: savedConversation,
        steps: response.type === 'plan'
          ? response.steps.map((step) => ({ ...step, completed: false }))
          : guide?.steps || [],
        activeStepIndex: response.type === 'plan' ? 0 : guide?.activeStepIndex || 0,
        status: response.type === 'plan' ? 'preview' : guide?.status || 'preview',
        note: response.type === 'plan' ? response.note || '' : guide?.note || '',
        errorMessage: '',
      });

      hydratedConversationKeyRef.current = getConversationKey(savedConversation);
      setConversation(savedConversation);
      setNotice(
        response.type === 'clarify'
          ? { kind: 'clarify', message: assistantMessage }
          : { kind: 'toast', message: 'Steps are ready.' }
      );
      await onGuideSaved?.(savedGuide, response);
    } catch (error: any) {
      const message = String(error?.message || error || 'Task guidance failed.');
      if (isAcceptedFollowUp) {
        setAnswerText(message);
        return;
      } else {
        setNotice({ kind: 'error', message });
      }
      if (isAiAuthRequiredError(error)) {
        return;
      }
      if (context) {
        const savedGuide = await saveTaskGuide({
          todoId: context.todoId,
          status: 'error',
          errorMessage: message,
        });
        await onGuideSaved?.(savedGuide);
      }
    } finally {
      setIsRunning(false);
    }
  }, [context, conversation, guide, isRunning, onGuideSaved, pendingPlanChange, setInputValue]);

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
      if (!pendingPlanChange.response) {
        return;
      }

      const savedGuide = await saveTaskGuide({
        todoId: context.todoId,
        conversation: pendingPlanChange.conversation,
        steps: pendingPlanChange.response.steps.map((step) => ({ ...step, completed: false })),
        activeStepIndex: 0,
        status: 'accepted',
        note: pendingPlanChange.response.note || '',
        errorMessage: '',
      });

      hydratedConversationKeyRef.current = getConversationKey(pendingPlanChange.conversation);
      setConversation(pendingPlanChange.conversation);
      setAnswerText('');
      setPendingPlanChange(null);
      setNotice({ kind: 'toast', message: 'Plan updated.' });
      await onGuideSaved?.(savedGuide, pendingPlanChange.response);
    } catch (error: any) {
      setAnswerText(String(error?.message || error || 'Could not update the plan.'));
    } finally {
      setIsRunning(false);
    }
  }, [context, isRunning, onGuideSaved, pendingPlanChange]);

  const submitText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (pendingPlanChange?.kind === 'ready' && isPlanChangeConfirmation(trimmed)) {
      setInputValue('');
      await applyPendingPlanChange();
      return;
    }
    await runGuidance('answer_clarification', trimmed);
  }, [applyPendingPlanChange, pendingPlanChange, runGuidance, setInputValue]);

  const submit = useCallback(async () => {
    await submitText(inputValueRef.current);
  }, [submitText]);

  const requestSteps = useCallback(() => runGuidance('generate', undefined, true), [runGuidance]);
  const clearNotice = useCallback(() => setNotice(null), []);

  return {
    inputValue,
    setInputValue,
    submit,
    submitText,
    isRunning,
    notice,
    conversation,
    answerText,
    hasPendingPlanChange: pendingPlanChange?.kind === 'ready',
    clearNotice,
    returnToPlan,
    applyPendingPlanChange,
    requestSteps,
  };
}
