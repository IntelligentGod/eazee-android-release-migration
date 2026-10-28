import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated } from 'react-native';
import { getDeepgramConfig } from '@/config/deepgram';
import { useDeepgramTranscription } from '@/lib/useDeepgramTranscription';

type UseCompactVoiceInputOptions = {
  inputValue: string;
  setInputValue: (value: string) => void;
  glowAnim: Animated.Value;
  onFinalTranscript?: (value: string) => Promise<void> | void;
};

const buildInputValue = (baseValue: string, transcript: string) => {
  const normalizedBaseValue = typeof baseValue === 'string' ? baseValue : '';
  const trimmedTranscript = typeof transcript === 'string' ? transcript.trim() : '';
  if (!trimmedTranscript) {
    return normalizedBaseValue;
  }
  return normalizedBaseValue ? `${normalizedBaseValue} ${trimmedTranscript}` : trimmedTranscript;
};

export function useCompactVoiceInput({
  inputValue,
  setInputValue,
  glowAnim,
  onFinalTranscript,
}: UseCompactVoiceInputOptions) {
  const [microphoneColor, setMicrophoneColor] = useState('#FFFFFF');
  const inputBaseRef = useRef('');
  const latestInputValueRef = useRef(inputValue);
  latestInputValueRef.current = inputValue;
  const deepgramConfig = getDeepgramConfig();

  const { isStreaming, startListening, stopListening, cancelListening } = useDeepgramTranscription({
    getAccessToken: deepgramConfig.getAccessToken,
    model: deepgramConfig.model,
    language: deepgramConfig.language,
    onListeningStart: () => {
      inputBaseRef.current = typeof latestInputValueRef.current === 'string'
        ? latestInputValueRef.current.trim()
        : '';
    },
    onPartialTranscript: (transcript) => {
      const nextValue = buildInputValue(inputBaseRef.current, transcript);
      latestInputValueRef.current = nextValue;
      setInputValue(nextValue);
    },
    onFinalTranscript: (transcript) => {
      const nextValue = buildInputValue(inputBaseRef.current, transcript);
      latestInputValueRef.current = nextValue;
      setInputValue(nextValue);
      void onFinalTranscript?.(nextValue);
    },
    onError: (error) => {
      Alert.alert('Transcription Error', error);
    },
  });

  useEffect(() => {
    setMicrophoneColor(isStreaming ? '#12F61A' : '#FFFFFF');

    if (isStreaming) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();

      return () => {
        animation.stop();
      };
    }

    Animated.timing(glowAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [glowAnim, isStreaming]);

  const beginListening = useCallback(async () => {
    await startListening();
  }, [startListening]);

  const handleMicrophonePress = useCallback(() => {
    if (isStreaming) {
      void stopListening();
      return;
    }
    void beginListening();
  }, [beginListening, isStreaming, stopListening]);

  return {
    isListening: isStreaming,
    microphoneColor,
    handleMicrophonePress,
    startListening: beginListening,
    stopListening,
    cancelListening,
  };
}
