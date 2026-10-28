import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Audio } from 'expo-av';
import { Alert } from 'react-native';
import LiveAudioStream from 'react-native-live-audio-stream';
import { createDeepgramStreamingSession, type DeepgramSessionCallbacks } from '../deepgramStreaming';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useDeepgramTranscription,
  type UseDeepgramTranscriptionResult,
} from '../useDeepgramTranscription';

jest.mock('@/firebaseConfig', () => ({
  auth: { currentUser: { uid: 'test-user' } },
}));

jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn(),
  },
}));

jest.mock('react-native-live-audio-stream', () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    on: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../deepgramStreaming', () => ({
  createDeepgramStreamingSession: jest.fn(),
}));

type MockDeepgramSession = {
  start: jest.Mock;
  sendAudio: jest.Mock;
  finalize: jest.Mock;
  waitForFinalize: jest.Mock;
  close: jest.Mock;
  isConnected: jest.Mock;
  waitUntilConnected: jest.Mock;
};

const createMockSession = (): MockDeepgramSession => ({
  start: jest.fn(),
  sendAudio: jest.fn(),
  finalize: jest.fn(),
  waitForFinalize: jest.fn(async () => true),
  close: jest.fn(),
  isConnected: jest.fn(() => false),
  waitUntilConnected: jest.fn(async () => true),
});

describe('useDeepgramTranscription', () => {
  const sessions: { session: MockDeepgramSession; callbacks: DeepgramSessionCallbacks }[] = [];
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  let hook: UseDeepgramTranscriptionResult;
  let getAccessToken: jest.Mock<Promise<string>, [signal?: AbortSignal]>;
  let shouldUseStreamingTranscription: jest.Mock<boolean, []>;
  let onFinalTranscript: jest.Mock<void, [transcript: string]>;
  let onListeningStart: jest.Mock<void, []>;
  let audioDataHandler: ((base64: string) => void) | null;

  const renderHook = async () => {
    const Harness = () => {
      hook = useDeepgramTranscription({
        getAccessToken,
        shouldUseStreamingTranscription,
        onFinalTranscript,
        onListeningStart,
      });
      return null;
    };

    await act(async () => {
      renderer = TestRenderer.create(<Harness />);
    });

    return hook;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    sessions.length = 0;
    renderer = null;
    audioDataHandler = null;
    getAccessToken = jest.fn(async () => 'deepgram-token');
    shouldUseStreamingTranscription = jest.fn(() => true);
    onFinalTranscript = jest.fn();
    onListeningStart = jest.fn();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('1');
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (Audio.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (LiveAudioStream.on as jest.Mock).mockImplementation((_event, handler) => {
      audioDataHandler = handler;
      return { remove: jest.fn() };
    });
    (createDeepgramStreamingSession as jest.Mock).mockImplementation(
      (_config, callbacks: DeepgramSessionCallbacks) => {
        const session = createMockSession();
        sessions.push({ session, callbacks });
        return session;
      }
    );
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('does not start a Deepgram websocket on mount', async () => {
    await renderHook();

    expect(createDeepgramStreamingSession).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(LiveAudioStream.start).not.toHaveBeenCalled();
  });

  it('captures audio without opening Deepgram when streaming transcription is disabled', async () => {
    shouldUseStreamingTranscription = jest.fn(() => false);
    await renderHook();

    await act(async () => {
      await hook.startListening();
    });
    act(() => {
      audioDataHandler?.('AQID');
    });

    expect(LiveAudioStream.start).toHaveBeenCalledTimes(1);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(createDeepgramStreamingSession).not.toHaveBeenCalled();

    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = hook.stopListening();
    });
    await act(async () => {
      jest.advanceTimersByTime(250);
      await stopPromise;
    });

    expect(LiveAudioStream.stop).toHaveBeenCalledTimes(1);
  });

  it('stops native capture when the active Deepgram socket closes', async () => {
    await renderHook();
    await act(async () => {
      await hook.startListening();
    });

    act(() => {
      sessions[0].callbacks.onClose?.();
    });

    expect(hook.isStreaming).toBe(false);
    expect(LiveAudioStream.stop).toHaveBeenCalledTimes(1);
  });

  it('does not create a warm Deepgram websocket after stopping', async () => {
    await renderHook();

    await act(async () => {
      await hook.startListening();
    });

    expect(createDeepgramStreamingSession).toHaveBeenCalledTimes(1);
    expect(createDeepgramStreamingSession).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'deepgram-token' }),
      expect.any(Object)
    );
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(sessions[0].session.start).toHaveBeenCalledTimes(1);
    expect(LiveAudioStream.start).toHaveBeenCalledTimes(1);

    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = hook.stopListening();
    });

    expect(hook.isStreaming).toBe(false);
    expect(LiveAudioStream.stop).toHaveBeenCalledTimes(1);
    expect(sessions[0].session.close).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(700);
      await stopPromise;
    });

    expect(sessions[0].session.finalize).toHaveBeenCalledTimes(1);
    expect(sessions[0].session.close).toHaveBeenCalledTimes(1);
    expect(createDeepgramStreamingSession).toHaveBeenCalledTimes(1);
  });

  it('deduplicates rapid starts while disclosure state is pending', async () => {
    let resolveDisclosureCheck!: (value: string | null) => void;
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(
      () => new Promise<string | null>((resolve) => {
        resolveDisclosureCheck = resolve;
      })
    );
    await renderHook();

    let firstStartPromise!: Promise<void>;
    let secondStartPromise!: Promise<void>;
    act(() => {
      firstStartPromise = hook.startListening();
      secondStartPromise = hook.startListening();
    });

    expect(LiveAudioStream.start).not.toHaveBeenCalled();

    await act(async () => {
      resolveDisclosureCheck('1');
      await firstStartPromise;
      await secondStartPromise;
    });

    expect(LiveAudioStream.start).toHaveBeenCalledTimes(1);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(createDeepgramStreamingSession).toHaveBeenCalledTimes(1);
  });

  it('does not start capture after unmounting while disclosure is pending', async () => {
    let continueDisclosure!: () => void;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      continueDisclosure = buttons?.find((button) => button.text === 'Continue')?.onPress || (() => {});
    });
    await renderHook();

    let startPromise!: Promise<void>;
    act(() => {
      startPromise = hook.startListening();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.unmount();
      renderer = null;
    });
    await act(async () => {
      continueDisclosure();
      await startPromise;
    });

    expect(Audio.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(LiveAudioStream.start).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(createDeepgramStreamingSession).not.toHaveBeenCalled();
  });

  it('does not start capture after stopping while disclosure is pending', async () => {
    let continueDisclosure!: () => void;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      continueDisclosure = buttons?.find((button) => button.text === 'Continue')?.onPress || (() => {});
    });
    await renderHook();

    let startPromise!: Promise<void>;
    act(() => {
      startPromise = hook.startListening();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);

    await act(async () => {
      await hook.stopListening();
    });
    await act(async () => {
      continueDisclosure();
      await startPromise;
    });

    expect(Audio.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(LiveAudioStream.start).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(createDeepgramStreamingSession).not.toHaveBeenCalled();
  });

  it('queues one restart until the previous session finishes finalizing', async () => {
    let resolveFinalize!: (isFinalized: boolean) => void;
    (createDeepgramStreamingSession as jest.Mock).mockImplementationOnce(
      (_config, callbacks: DeepgramSessionCallbacks) => {
        const session = createMockSession();
        session.waitForFinalize.mockImplementation(
          () => new Promise<boolean>((resolve) => {
            resolveFinalize = resolve;
          })
        );
        sessions.push({ session, callbacks });
        return session;
      }
    );
    await renderHook();

    await act(async () => {
      await hook.startListening();
    });

    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = hook.stopListening();
    });

    expect(hook.isStreaming).toBe(false);
    let restartPromise!: Promise<void>;
    act(() => {
      restartPromise = hook.startListening();
    });

    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(LiveAudioStream.start).toHaveBeenCalledTimes(1);
    expect(createDeepgramStreamingSession).toHaveBeenCalledTimes(1);
    expect(onListeningStart).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(250);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      resolveFinalize(true);
      await stopPromise;
      await restartPromise;
    });

    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(LiveAudioStream.start).toHaveBeenCalledTimes(2);
    expect(createDeepgramStreamingSession).toHaveBeenCalledTimes(2);
    expect(onListeningStart).toHaveBeenCalledTimes(2);
  });

  it('suppresses final delivery when cancellation arrives during finalization', async () => {
    let resolveFinalize!: (isFinalized: boolean) => void;
    (createDeepgramStreamingSession as jest.Mock).mockImplementationOnce(
      (_config, callbacks: DeepgramSessionCallbacks) => {
        const session = createMockSession();
        session.waitForFinalize.mockImplementation(
          () => new Promise<boolean>((resolve) => {
            resolveFinalize = resolve;
          })
        );
        session.close.mockImplementation(() => resolveFinalize?.(false));
        sessions.push({ session, callbacks });
        return session;
      }
    );
    await renderHook();

    await act(async () => {
      await hook.startListening();
    });
    act(() => {
      sessions[0].callbacks.onTranscriptFinal?.('cancel me');
    });

    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = hook.stopListening();
    });
    act(() => {
      jest.advanceTimersByTime(250);
    });
    await act(async () => {
      await Promise.resolve();
    });

    let restartPromise!: Promise<void>;
    act(() => {
      restartPromise = hook.startListening();
    });
    await act(async () => {
      await hook.cancelListening();
      await stopPromise;
      await restartPromise;
    });

    expect(sessions[0].session.close).toHaveBeenCalled();
    expect(onFinalTranscript).not.toHaveBeenCalled();
    expect(LiveAudioStream.start).toHaveBeenCalledTimes(1);
  });

  it('uses a short finalize fallback after a completed utterance', async () => {
    (createDeepgramStreamingSession as jest.Mock).mockImplementationOnce(
      (_config, callbacks: DeepgramSessionCallbacks) => {
        const session = createMockSession();
        session.waitForFinalize.mockImplementation(
          (timeoutMs: number) => new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), timeoutMs);
          })
        );
        sessions.push({ session, callbacks });
        return session;
      }
    );
    await renderHook();

    await act(async () => {
      await hook.startListening();
    });
    act(() => {
      sessions[0].callbacks.onTranscriptFinal?.('already final');
      sessions[0].callbacks.onUtteranceEnd?.();
    });
    act(() => {
      jest.advanceTimersByTime(250);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(sessions[0].session.waitForFinalize).toHaveBeenCalledWith(400);
    expect(onFinalTranscript).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(onFinalTranscript).toHaveBeenCalledWith('already final');
  });

  it('buffers audio while waiting for a Deepgram token', async () => {
    let resolveToken!: (token: string) => void;
    getAccessToken = jest.fn(() => new Promise<string>((resolve) => {
      resolveToken = resolve;
    }));
    await renderHook();

    let startPromise!: Promise<void>;
    act(() => {
      startPromise = hook.startListening();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(LiveAudioStream.start).toHaveBeenCalledTimes(1);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(createDeepgramStreamingSession).not.toHaveBeenCalled();

    act(() => {
      audioDataHandler?.('AQID');
    });

    await act(async () => {
      resolveToken('deepgram-token');
      await startPromise;
    });
    expect(createDeepgramStreamingSession).toHaveBeenCalledTimes(1);
    expect(sessions[0].session.sendAudio).not.toHaveBeenCalled();

    act(() => {
      sessions[0].callbacks.onOpen?.();
    });

    expect(sessions[0].session.sendAudio).toHaveBeenCalledTimes(1);
    const sentChunk = sessions[0].session.sendAudio.mock.calls[0][0] as Uint8Array;
    expect(Array.from(sentChunk)).toEqual([1, 2, 3]);
  });

  it('finishes buffered audio when released before the Deepgram token resolves', async () => {
    let resolveToken!: (token: string) => void;
    let resolveConnection!: (isConnected: boolean) => void;
    getAccessToken = jest.fn(() => new Promise<string>((resolve) => {
      resolveToken = resolve;
    }));
    (createDeepgramStreamingSession as jest.Mock).mockImplementationOnce(
      (_config, callbacks: DeepgramSessionCallbacks) => {
        const session = createMockSession();
        session.waitUntilConnected.mockImplementation(
          () => new Promise<boolean>((resolve) => {
            resolveConnection = resolve;
          })
        );
        sessions.push({ session, callbacks });
        return session;
      }
    );
    await renderHook();

    let startPromise!: Promise<void>;
    act(() => {
      startPromise = hook.startListening();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      audioDataHandler?.('AQID');
    });

    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = hook.stopListening();
    });

    expect(hook.isStreaming).toBe(false);
    expect(LiveAudioStream.stop).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveToken('deepgram-token');
      await startPromise;
    });
    expect(createDeepgramStreamingSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });

    act(() => {
      sessions[0].callbacks.onOpen?.();
      resolveConnection(true);
    });
    expect(sessions[0].session.sendAudio).toHaveBeenCalledTimes(1);

    await act(async () => {
      await stopPromise;
    });

    expect(sessions[0].session.finalize).toHaveBeenCalledTimes(1);
    expect(sessions[0].session.close).toHaveBeenCalledTimes(1);
  });

  it('bounds finalization when token setup stalls', async () => {
    getAccessToken = jest.fn((signal?: AbortSignal) => new Promise<string>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    await renderHook();

    let startPromise!: Promise<void>;
    act(() => {
      startPromise = hook.startListening();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      audioDataHandler?.('AQID');
    });

    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = hook.stopListening();
    });

    expect(hook.isStreaming).toBe(false);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(8000);
    });
    await act(async () => {
      await stopPromise;
      await startPromise;
    });

    expect(createDeepgramStreamingSession).not.toHaveBeenCalled();
    expect(LiveAudioStream.stop).toHaveBeenCalled();
  });

  it('does not let stale token setup stop a restarted stream', async () => {
    let rejectFirstToken!: (error: Error) => void;
    getAccessToken = jest.fn()
      .mockImplementationOnce(() => new Promise<string>((_resolve, reject) => {
        rejectFirstToken = reject;
      }))
      .mockResolvedValue('deepgram-token');
    await renderHook();

    let firstStartPromise!: Promise<void>;
    act(() => {
      firstStartPromise = hook.startListening();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      audioDataHandler?.('AQID');
    });

    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = hook.stopListening();
    });
    act(() => {
      jest.advanceTimersByTime(250);
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(8000);
    });
    await act(async () => {
      await stopPromise;
    });

    await act(async () => {
      await hook.startListening();
    });
    expect(LiveAudioStream.start).toHaveBeenCalledTimes(2);
    expect(LiveAudioStream.stop).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectFirstToken(new Error('late token failure'));
      await firstStartPromise;
    });

    expect(LiveAudioStream.stop).toHaveBeenCalledTimes(1);
    expect(createDeepgramStreamingSession).toHaveBeenCalledTimes(1);
  });

});
