import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { Audio } from 'expo-av';
import LiveAudioStream from 'react-native-live-audio-stream';
import { PRIVACY_POLICY_URL } from './legalLinks';
import { auth } from '@/firebaseConfig';
import { recordVoiceUsage } from './subscriptionUsage';
import { reportVoiceUsageToServer } from '@/config/deepgram';
import {
  createDeepgramStreamingSession,
  DeepgramSession,
  DeepgramStreamingConfig,
} from './deepgramStreaming';

export interface UseDeepgramTranscriptionConfig {
  getAccessToken: (signal?: AbortSignal) => Promise<string | null>;
  model?: DeepgramStreamingConfig['model'];
  language?: string;
  onFinalTranscript?: (transcript: string) => void;
  onPartialTranscript?: (transcript: string) => void;
  onAudioChunk?: (chunk: Uint8Array) => void;
  onListeningStart?: () => void;
  onError?: (error: string) => void;
  autoStopOnSilence?: boolean;
  shouldAutoStopOnSilence?: () => boolean;
  shouldUseStreamingTranscription?: () => boolean;
}

export interface UseDeepgramTranscriptionResult {
  isStreaming: boolean;
  partialTranscript: string;
  finalTranscript: string;
  lastError: string | null;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  cancelListening: () => Promise<void>;
}

type AudioStreamSubscription = {
  remove: () => void;
};

const normalizeTranscript = (value: unknown) => (typeof value === 'string' ? value : '').trim();
const AUDIO_STOP_DRAIN_MS = 250;
const TOKEN_SETUP_STOP_TIMEOUT_MS = 8000;
const FINALIZE_AFTER_UTTERANCE_END_TIMEOUT_MS = 400;
const VOICE_DISCLOSURE_ACCEPTED_KEY = 'voiceDisclosureAccepted:v1';

const showVoiceDisclosure = () =>
  new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    Alert.alert(
      'Voice transcription',
      'Voice input is optional. If you continue, Eazee will capture microphone audio and send it to Deepgram for transcription.',
      [
        {
          text: 'Privacy Policy',
          onPress: () => {
            Linking.openURL(PRIVACY_POLICY_URL).catch(() => {});
            settle(false);
          },
        },
        { text: 'Not Now', onPress: () => settle(false) },
        { text: 'Continue', isPreferred: true, onPress: () => settle(true) },
      ],
      { cancelable: true, onDismiss: () => settle(false) }
    );
  });

const ensureVoiceDisclosureAccepted = async () => {
  const accepted = await AsyncStorage.getItem(VOICE_DISCLOSURE_ACCEPTED_KEY).catch(() => null);
  if (accepted === '1') {
    return true;
  }

  const shouldContinue = await showVoiceDisclosure();
  if (shouldContinue) {
    await AsyncStorage.setItem(VOICE_DISCLOSURE_ACCEPTED_KEY, '1').catch(() => {});
  }
  return shouldContinue;
};

export function useDeepgramTranscription(
  config: UseDeepgramTranscriptionConfig
): UseDeepgramTranscriptionResult {
  const [isStreaming, setIsStreaming] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);

  const configRef = useRef(config);
  configRef.current = config;
  const sessionRef = useRef<DeepgramSession | null>(null);
  const sessionSetupPromiseRef = useRef<Promise<DeepgramSession | null> | null>(null);
  const tokenSetupAbortControllerRef = useRef<AbortController | null>(null);
  const finishListeningPromiseRef = useRef<Promise<void> | null>(null);
  const cancelRequestedRef = useRef(false);
  const accumulatedTranscriptRef = useRef<string>('');
  const stopListeningRef = useRef<(() => Promise<void>) | null>(null);
  const isStartingRef = useRef(false);
  const isStreamingRef = useRef(false);
  const audioBufferRef = useRef<Uint8Array[]>([]);
  const audioSubscriptionRef = useRef<AudioStreamSubscription | null>(null);
  const isConnectedRef = useRef(false);
  const displayedTranscriptRef = useRef('');
  const hasDeliveredFinalTranscriptRef = useRef(false);
  const hasCompletedUtteranceRef = useRef(false);
  const listeningRunRef = useRef(0);
  const listeningStartedAtRef = useRef<number | null>(null);

  const requestMicrophonePermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  };

  const createSession = useCallback((accessToken: string) => {
    const session = createDeepgramStreamingSession(
      {
        accessToken,
        model: configRef.current.model || 'nova-3',
        language: configRef.current.language || 'en',
        punctuate: true,
        smartFormat: true,
        interimResults: true,
        endpointing: 150,
        utteranceEndMs: 1000,
      },
      {
        onOpen: () => {
          if (sessionRef.current !== session) {
            return;
          }
          isConnectedRef.current = true;
          for (const chunk of audioBufferRef.current) {
            session.sendAudio(chunk);
          }
          audioBufferRef.current = [];
        },
        onTranscriptPartial: (transcript) => {
          if (sessionRef.current !== session) {
            return;
          }
          hasCompletedUtteranceRef.current = false;
          const normalizedTranscript = normalizeTranscript(transcript);
          const nextTranscript = accumulatedTranscriptRef.current
            ? `${accumulatedTranscriptRef.current} ${normalizedTranscript}`.trim()
            : normalizedTranscript;
          displayedTranscriptRef.current = nextTranscript;
          setPartialTranscript(nextTranscript);
          configRef.current.onPartialTranscript?.(nextTranscript);
        },
        onTranscriptFinal: (transcript) => {
          if (sessionRef.current !== session) {
            return;
          }
          const normalizedTranscript = normalizeTranscript(transcript);
          accumulatedTranscriptRef.current = accumulatedTranscriptRef.current
            ? `${accumulatedTranscriptRef.current} ${normalizedTranscript}`.trim()
            : normalizedTranscript;
          displayedTranscriptRef.current = accumulatedTranscriptRef.current;
          setFinalTranscript(accumulatedTranscriptRef.current);
          setPartialTranscript(accumulatedTranscriptRef.current);
        },
        onUtteranceEnd: () => {
          if (sessionRef.current !== session) {
            return;
          }
          hasCompletedUtteranceRef.current = true;
          const shouldAutoStop = configRef.current.shouldAutoStopOnSilence
            ? configRef.current.shouldAutoStopOnSilence()
            : configRef.current.autoStopOnSilence !== false;
          if (shouldAutoStop && normalizeTranscript(displayedTranscriptRef.current)) {
            stopListeningRef.current?.();
          }
        },
        onSpeechStarted: () => {
          if (sessionRef.current === session) {
            hasCompletedUtteranceRef.current = false;
          }
        },
        onError: (error) => {
          if (sessionRef.current !== session) {
            return;
          }
          audioSubscriptionRef.current?.remove();
          audioSubscriptionRef.current = null;
          LiveAudioStream.stop();
          audioBufferRef.current = [];
          isConnectedRef.current = false;
          if (sessionRef.current === session) {
            session.close();
            sessionRef.current = null;
          }
          if (isStreamingRef.current) {
            setIsStreaming(false);
            isStreamingRef.current = false;
          }
          setLastError(error);
          configRef.current.onError?.(error);
        },
        onClose: () => {
          const isCurrentSession = sessionRef.current === session;
          if (isCurrentSession) {
            audioSubscriptionRef.current?.remove();
            audioSubscriptionRef.current = null;
            LiveAudioStream.stop();
            audioBufferRef.current = [];
            sessionRef.current = null;
            isConnectedRef.current = false;
          }
          if (isStreamingRef.current && isCurrentSession) {
            setIsStreaming(false);
            isStreamingRef.current = false;
          }
        },
      }
    );

    sessionRef.current = session;
    return session;
  }, []);

  const stopAudioStream = useCallback(() => {
    audioSubscriptionRef.current?.remove();
    audioSubscriptionRef.current = null;
    LiveAudioStream.stop();
  }, []);

  const stopAudioStreamAfterDrain = useCallback(async () => {
    const subscription = audioSubscriptionRef.current;
    LiveAudioStream.stop();
    await new Promise((resolve) => setTimeout(resolve, AUDIO_STOP_DRAIN_MS));
    if (audioSubscriptionRef.current === subscription) {
      subscription?.remove();
      audioSubscriptionRef.current = null;
    }
  }, []);

  const startListening = useCallback(async () => {
    if (isStreamingRef.current || isStartingRef.current) return;

    isStartingRef.current = true;
    let isStartReserved = true;
    try {
      const activeFinishPromise = finishListeningPromiseRef.current;
      if (activeFinishPromise) {
        const queuedStartRun = listeningRunRef.current;
        await activeFinishPromise;
        if (listeningRunRef.current !== queuedStartRun) return;
        if (finishListeningPromiseRef.current === activeFinishPromise) {
          finishListeningPromiseRef.current = null;
        }
        if (isStreamingRef.current || finishListeningPromiseRef.current) return;
      }

      const listeningRun = listeningRunRef.current + 1;
      listeningRunRef.current = listeningRun;

      const disclosureAccepted = await ensureVoiceDisclosureAccepted();
      if (listeningRunRef.current !== listeningRun) {
        return;
      }
      if (!disclosureAccepted) {
        return;
      }
      if (isStreamingRef.current || finishListeningPromiseRef.current) return;

      setIsStreaming(true);
      isStreamingRef.current = true;
      listeningStartedAtRef.current = Date.now();
      setLastError(null);
      setPartialTranscript('');
      setFinalTranscript('');
      accumulatedTranscriptRef.current = '';
      displayedTranscriptRef.current = '';
      hasDeliveredFinalTranscriptRef.current = false;
      hasCompletedUtteranceRef.current = false;
      cancelRequestedRef.current = false;
      isStartReserved = false;
      isStartingRef.current = false;

      const hasPermission = await requestMicrophonePermission();
      if (listeningRunRef.current !== listeningRun || !isStreamingRef.current) {
        return;
      }
      if (!hasPermission) {
        const error = 'Microphone permission denied';
        setLastError(error);
        configRef.current.onError?.(error);
        setIsStreaming(false);
        isStreamingRef.current = false;
        return;
      }

      configRef.current.onListeningStart?.();
      audioBufferRef.current = [];
      isConnectedRef.current = false;
      LiveAudioStream.init({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6,
        bufferSize: 2048,
      });

      audioSubscriptionRef.current?.remove();
      audioSubscriptionRef.current = LiveAudioStream.on('data', (base64: string) => {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        configRef.current.onAudioChunk?.(bytes);

        if (configRef.current.shouldUseStreamingTranscription?.() === false) {
          return;
        }
        if (isConnectedRef.current && sessionRef.current?.isConnected()) {
          sessionRef.current.sendAudio(bytes);
        } else {
          audioBufferRef.current.push(bytes);
        }
      });

      LiveAudioStream.start();

      if (configRef.current.shouldUseStreamingTranscription?.() === false) {
        return;
      }

      tokenSetupAbortControllerRef.current?.abort();
      const tokenSetupAbortController = new AbortController();
      tokenSetupAbortControllerRef.current = tokenSetupAbortController;
      const setupPromise = (async (): Promise<DeepgramSession | null> => {
        let accessToken = '';
        try {
          accessToken = (await configRef.current.getAccessToken(tokenSetupAbortController.signal))?.trim() || '';
        } catch (error: any) {
          if (listeningRunRef.current !== listeningRun) {
            return null;
          }
          stopAudioStream();
          audioBufferRef.current = [];
          isConnectedRef.current = false;
          if (!isStreamingRef.current) {
            return null;
          }
          const message = String(error?.message || error || 'Deepgram transcription is unavailable');
          setLastError(message);
          configRef.current.onError?.(message);
          setIsStreaming(false);
          isStreamingRef.current = false;
          return null;
        }
        if (listeningRunRef.current !== listeningRun) {
          return null;
        }
        if (!isStreamingRef.current && !audioBufferRef.current.length) {
          return null;
        }
        if (!accessToken) {
          stopAudioStream();
          audioBufferRef.current = [];
          isConnectedRef.current = false;
          if (isStreamingRef.current) {
            const error = 'Deepgram transcription is unavailable';
            setLastError(error);
            configRef.current.onError?.(error);
            setIsStreaming(false);
            isStreamingRef.current = false;
          }
          return null;
        }

        const session = sessionRef.current ?? createSession(accessToken);
        isConnectedRef.current = session.isConnected();
        session.start();
        return session;
      })();
      sessionSetupPromiseRef.current = setupPromise;
      await setupPromise;
      if (tokenSetupAbortControllerRef.current === tokenSetupAbortController) {
        tokenSetupAbortControllerRef.current = null;
      }
      if (sessionSetupPromiseRef.current === setupPromise) {
        sessionSetupPromiseRef.current = null;
      }
    } finally {
      if (isStartReserved) {
        isStartingRef.current = false;
      }
    }
  }, [createSession, stopAudioStream]);

  const finishListening = useCallback(async (deliverFinalTranscript: boolean) => {
    if (isStartingRef.current) {
      listeningRunRef.current += 1;
      isStartingRef.current = false;
    }
    if (!deliverFinalTranscript) {
      cancelRequestedRef.current = true;
      listeningRunRef.current += 1;
      tokenSetupAbortControllerRef.current?.abort();
      sessionRef.current?.close();
    }
    if (finishListeningPromiseRef.current) {
      await finishListeningPromiseRef.current;
      return;
    }

    const finishPromise = (async () => {
      const setupPromise = sessionSetupPromiseRef.current;
      if (!isStreamingRef.current && !sessionRef.current && !setupPromise) return;

      if (isStreamingRef.current) {
        setIsStreaming(false);
        isStreamingRef.current = false;
      }

      // Voice is metered by how long the stream was actually open, charged here
      // on the single exit path shared by stop and cancel.
      const startedAt = listeningStartedAtRef.current;
      listeningStartedAtRef.current = null;
      const voiceUid = auth.currentUser?.uid;
      if (startedAt && voiceUid) {
        const voiceSeconds = (Date.now() - startedAt) / 1000;
        void recordVoiceUsage(voiceUid, voiceSeconds);
        void reportVoiceUsageToServer(voiceSeconds);
      }

      if (deliverFinalTranscript) {
        await stopAudioStreamAfterDrain();
      } else {
        stopAudioStream();
      }

      let session = sessionRef.current;
      if (
        !session &&
        deliverFinalTranscript &&
        !cancelRequestedRef.current &&
        setupPromise &&
        audioBufferRef.current.length
      ) {
        let setupWaitTimeout: ReturnType<typeof setTimeout> | null = null;
        let setupTimedOut = false;
        session = await Promise.race([
          setupPromise,
          new Promise<null>((resolve) => {
            setupWaitTimeout = setTimeout(() => {
              setupTimedOut = true;
              listeningRunRef.current += 1;
              tokenSetupAbortControllerRef.current?.abort();
              resolve(null);
            }, TOKEN_SETUP_STOP_TIMEOUT_MS);
          }),
        ]);
        if (setupWaitTimeout) {
          clearTimeout(setupWaitTimeout);
        }
        if (setupTimedOut) {
          tokenSetupAbortControllerRef.current = null;
        }
      }
      if (
        session &&
        deliverFinalTranscript &&
        !cancelRequestedRef.current &&
        !session.isConnected() &&
        audioBufferRef.current.length
      ) {
        await session.waitUntilConnected(1500);
      }
      if (session && deliverFinalTranscript && !cancelRequestedRef.current && audioBufferRef.current.length) {
        const bufferedChunks = audioBufferRef.current;
        audioBufferRef.current = [];
        for (const chunk of bufferedChunks) {
          session.sendAudio(chunk);
        }
      }

      if (session && deliverFinalTranscript && !cancelRequestedRef.current) {
        const finalizeTimeoutMs =
          hasCompletedUtteranceRef.current && normalizeTranscript(accumulatedTranscriptRef.current)
            ? FINALIZE_AFTER_UTTERANCE_END_TIMEOUT_MS
            : 2500;
        const finalizePromise = session.waitForFinalize(finalizeTimeoutMs);
        session.finalize();
        await finalizePromise;
      }

      audioBufferRef.current = [];
      isConnectedRef.current = false;
      session?.close();
      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
      if (sessionSetupPromiseRef.current === setupPromise) {
        sessionSetupPromiseRef.current = null;
      }

      if (deliverFinalTranscript && !cancelRequestedRef.current) {
        const finalText =
          normalizeTranscript(accumulatedTranscriptRef.current) ||
          normalizeTranscript(displayedTranscriptRef.current);
        if (finalText && !hasDeliveredFinalTranscriptRef.current) {
          hasDeliveredFinalTranscriptRef.current = true;
          setFinalTranscript(finalText);
          setPartialTranscript(finalText);
          configRef.current.onFinalTranscript?.(finalText);
        }
      } else {
        accumulatedTranscriptRef.current = '';
        displayedTranscriptRef.current = '';
        hasDeliveredFinalTranscriptRef.current = false;
        setFinalTranscript('');
        setPartialTranscript('');
      }
    })();

    finishListeningPromiseRef.current = finishPromise;
    try {
      await finishPromise;
    } finally {
      if (finishListeningPromiseRef.current === finishPromise) {
        finishListeningPromiseRef.current = null;
      }
    }
  }, [stopAudioStream, stopAudioStreamAfterDrain]);

  const stopListening = useCallback(async () => {
    await finishListening(true);
  }, [finishListening]);

  const cancelListening = useCallback(async () => {
    await finishListening(false);
  }, [finishListening]);

  useEffect(() => {
    return () => {
      listeningRunRef.current += 1;
      tokenSetupAbortControllerRef.current?.abort();
      tokenSetupAbortControllerRef.current = null;
      cancelRequestedRef.current = true;
      audioBufferRef.current = [];
      isConnectedRef.current = false;
      stopAudioStream();
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, [stopAudioStream]);

  stopListeningRef.current = stopListening;

  return {
    isStreaming,
    partialTranscript,
    finalTranscript,
    lastError,
    startListening,
    stopListening,
    cancelListening,
  };
}
