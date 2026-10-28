import type { DeepgramModel } from '../lib/deepgramStreaming';
import { SERVER_URL } from './backend';
import { auth } from '../firebaseConfig';
import { getFirebaseAppCheckHeaders } from '../lib/firebaseAppCheck';
import { checkAiFeatureAccess } from '../lib/subscriptionUsage';
import { createSubscriptionRequiredError } from '../lib/subscriptionAccess';
import { getDeviceTimeZone } from '../lib/aiRequest';

export interface DeepgramConfig {
  getAccessToken: (signal?: AbortSignal) => Promise<string>;
  model: DeepgramModel;
  language: string;
}

export async function fetchDeepgramAccessToken(signal?: AbortSignal): Promise<string> {
  const user = auth.currentUser;
  if (!user?.uid) {
    throw new Error('Sign in to use voice transcription');
  }

  const decision = await checkAiFeatureAccess(user.uid, 'voiceInput');
  if (!decision.allowed) {
    throw createSubscriptionRequiredError(decision, 'voiceInput');
  }

  const firebaseIdToken = await user.getIdToken().catch(() => null);
  if (!firebaseIdToken) {
    throw new Error('Sign in to use voice transcription');
  }

  const response = await fetch(`${SERVER_URL}/deepgram/token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${firebaseIdToken}`,
      'Content-Type': 'application/json',
      'X-Eazee-Timezone': getDeviceTimeZone(),
      ...await getFirebaseAppCheckHeaders(),
    },
    body: JSON.stringify({}),
    signal,
  });
  const body = await response.json().catch(() => null);
  const accessToken = typeof body?.accessToken === 'string' ? body.accessToken.trim() : '';

  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : 'Deepgram transcription is unavailable';
    throw new Error(message);
  }
  if (!accessToken) {
    throw new Error('Deepgram transcription is unavailable');
  }

  return accessToken;
}

/**
 * Deepgram streams straight from the phone, so the server only learns how much
 * voice a free user spent from this report. Best effort: a failed report is dropped.
 */
export async function reportVoiceUsageToServer(seconds: number) {
  const user = auth.currentUser;
  if (!user?.uid || !(seconds > 0)) return;
  try {
    const firebaseIdToken = await user.getIdToken();
    await fetch(`${SERVER_URL}/usage/voice`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${firebaseIdToken}`,
        'Content-Type': 'application/json',
        'X-Eazee-Timezone': getDeviceTimeZone(),
        ...await getFirebaseAppCheckHeaders(),
      },
      body: JSON.stringify({ seconds: Math.min(600, Math.round(seconds)) }),
    });
  } catch (error) {
    console.warn('Could not report voice usage:', error);
  }
}

export function getDeepgramConfig(): DeepgramConfig {
  return {
    getAccessToken: fetchDeepgramAccessToken,
    model: 'nova-3',
    language: 'en',
  };
}

export function isDeepgramConfigured(): boolean {
  return true;
}
