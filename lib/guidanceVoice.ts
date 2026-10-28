import { Audio } from 'expo-av';
import { SERVER_URL } from '@/config/backend';
import { getAiRequestHeaders } from '@/lib/aiRequest';

export type GuidanceVoicePlayback = {
  stop: () => void;
};

type GuidanceVoiceResponse = {
  audioBase64?: string;
  mimeType?: string;
  url?: string;
};

export async function playGuidanceVoice(
  text: string,
  options: { muted: boolean }
): Promise<GuidanceVoicePlayback | null> {
  const prompt = text.trim();
  if (options.muted || !prompt) {
    return null;
  }

  try {
    const response = await fetch(`${SERVER_URL}/ai/tts/guidance`, {
      method: 'POST',
      headers: await getAiRequestHeaders('guidance'),
      body: JSON.stringify({ text: prompt }),
    });
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null) as GuidanceVoiceResponse | null;
    const audioBase64 = typeof payload?.audioBase64 === 'string' ? payload.audioBase64.trim() : '';
    const remoteUrl = typeof payload?.url === 'string' ? payload.url.trim() : '';
    const uri = remoteUrl || (audioBase64
      ? `data:${payload?.mimeType || 'audio/mpeg'};base64,${audioBase64}`
      : '');
    if (!uri) return null;

    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
    return {
      stop: () => {
        void sound.stopAsync().catch(() => {});
        void sound.unloadAsync().catch(() => {});
      },
    };
  } catch {
    return null;
  }
}
