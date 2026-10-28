import { useCallback, useEffect, useRef, useState } from 'react';
import {
  requestSkillAnswer,
  saveSkillGuide,
  type SkillContext,
  type SkillGuide,
  type SkillMessage,
} from '@/lib/skillGuidance';

type UseSkillGuidanceAIOptions = {
  context: SkillContext | null;
  guide: SkillGuide | null;
  onGuideSaved?: (guide: SkillGuide) => void | Promise<void>;
};

const getConversationKey = (messages: SkillMessage[]) => JSON.stringify(messages);

export function useSkillGuidanceAI({
  context,
  guide,
  onGuideSaved,
}: UseSkillGuidanceAIOptions) {
  const [inputValue, setInputValueState] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'toast' | 'error'; message: string } | null>(null);
  const [conversation, setConversation] = useState<SkillMessage[]>([]);
  const [answerText, setAnswerText] = useState('');
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
      return;
    }

    if (conversationKey !== hydratedConversationKeyRef.current && !isRunning) {
      hydratedConversationKeyRef.current = conversationKey;
      setConversation(guideConversation);
    }
  }, [context?.todoId, guide?.conversation, guide?.todoId, isRunning, setInputValue]);

  const submitText = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || !context || !guide || guide.status !== 'ready' || isRunning) {
      if (!guide || guide.status !== 'ready') {
        setNotice({ kind: 'error', message: 'Finish the video guide first.' });
      }
      return;
    }

    const nextConversation = [...conversation, { role: 'user' as const, content: question }];
    setInputValue('');
    setIsRunning(true);
    setNotice(null);

    try {
      const response = await requestSkillAnswer({ context, guide, question });
      const savedConversation = [
        ...nextConversation,
        { role: 'assistant' as const, content: response.answer },
      ];
      const savedGuide = await saveSkillGuide({
        todoId: guide.todoId,
        conversation: savedConversation,
        activeStepIndex: response.suggestedStepIndex ?? guide.activeStepIndex,
      });
      hydratedConversationKeyRef.current = getConversationKey(savedConversation);
      setConversation(savedConversation);
      setAnswerText(response.answer);
      await onGuideSaved?.(savedGuide);
    } catch (error: any) {
      setNotice({ kind: 'error', message: String(error?.message || error || 'Video guide chat failed.') });
    } finally {
      setIsRunning(false);
    }
  }, [context, conversation, guide, isRunning, onGuideSaved, setInputValue]);

  const submit = useCallback(async () => {
    await submitText(inputValueRef.current);
  }, [submitText]);

  const clearNotice = useCallback(() => setNotice(null), []);
  const returnToSteps = useCallback(() => setAnswerText(''), []);

  return {
    inputValue,
    setInputValue,
    submit,
    submitText,
    isRunning,
    notice,
    conversation,
    answerText,
    clearNotice,
    returnToSteps,
  };
}
