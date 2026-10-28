import { useCallback, useEffect, useRef, useState } from 'react';
import {
  requestRecipeAnswer,
  saveRecipeGuide,
  type RecipeContext,
  type RecipeGuide,
  type RecipeMessage,
} from '@/lib/recipeGuidance';

type UseRecipeGuidanceAIOptions = {
  context: RecipeContext | null;
  guide: RecipeGuide | null;
  onGuideSaved?: (guide: RecipeGuide) => void | Promise<void>;
};

const getConversationKey = (messages: RecipeMessage[]) => JSON.stringify(messages);

export function useRecipeGuidanceAI({
  context,
  guide,
  onGuideSaved,
}: UseRecipeGuidanceAIOptions) {
  const [inputValue, setInputValueState] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [conversation, setConversation] = useState<RecipeMessage[]>([]);
  const [answerText, setAnswerText] = useState('');
  const [pendingRecipeChange, setPendingRecipeChange] = useState<{ title: string } | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'toast'; message: string } | null>(null);
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
      setConversation(guideConversation);
      setAnswerText('');
      setPendingRecipeChange(null);
      setNotice(null);
      return;
    }

    if (conversationKey !== hydratedConversationKeyRef.current && !isRunning) {
      hydratedConversationKeyRef.current = conversationKey;
      setConversation(guideConversation);
    }
  }, [context?.todoId, guide?.conversation, guide?.todoId, isRunning, setInputValue]);

  const submitText = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || !context || !guide || isRunning) {
      return;
    }

    if (guide.status !== 'ready') {
      setNotice({ kind: 'error', message: 'Finish the recipe guide first.' });
      setInputValue('');
      return;
    }

    const nextConversation = [
      ...conversation,
      { role: 'user' as const, content: question },
    ];

    setInputValue('');
    setIsRunning(true);
    setNotice(null);
    setAnswerText('');

    try {
      const response = await requestRecipeAnswer({
        context,
        guide: {
          ...guide,
          conversation: nextConversation,
        },
        question,
      });
      const savedConversation = [
        ...nextConversation,
        { role: 'assistant' as const, content: response.answer },
      ];
      const recipeChangeTitle = response.action === 'recipe_change'
        ? response.recipeTitle?.trim()
        : '';
      const nextActiveStepIndex =
        Number.isInteger(response.suggestedStepIndex) &&
        response.suggestedStepIndex! >= 0 &&
        response.suggestedStepIndex! < guide.steps.length
          ? response.suggestedStepIndex!
          : guide.activeStepIndex;
      const savedGuide = await saveRecipeGuide({
        todoId: guide.todoId,
        conversation: savedConversation,
        activeStepIndex: nextActiveStepIndex,
        status: 'ready',
        errorMessage: '',
      });

      hydratedConversationKeyRef.current = getConversationKey(savedConversation);
      setConversation(savedConversation);
      setAnswerText(response.answer);
      setPendingRecipeChange(recipeChangeTitle
        ? { title: recipeChangeTitle }
        : null);
      await onGuideSaved?.(savedGuide);
    } catch (error: any) {
      const message = String(error?.message || error || 'Could not answer that.');
      setAnswerText(message);
      setNotice({ kind: 'error', message });
    } finally {
      setIsRunning(false);
    }
  }, [context, conversation, guide, isRunning, onGuideSaved, setInputValue]);

  const submit = useCallback(async () => {
    await submitText(inputValueRef.current);
  }, [submitText]);

  const returnToSteps = useCallback(() => {
    setAnswerText('');
    setPendingRecipeChange(null);
    setNotice(null);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);
  const clearPendingRecipeChange = useCallback(() => setPendingRecipeChange(null), []);

  return {
    inputValue,
    setInputValue,
    submit,
    submitText,
    isRunning,
    conversation,
    answerText,
    pendingRecipeChange,
    notice,
    clearNotice,
    clearPendingRecipeChange,
    returnToSteps,
  };
}
