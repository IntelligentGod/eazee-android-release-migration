import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_URL } from '@/config/backend';
import { auth } from '@/firebaseConfig';
import { getFirebaseAppCheckHeaders } from '@/lib/firebaseAppCheck';

/**
 * Persistent memory: lasting facts Eazee picked up about the user in chat. The server keeps the
 * saved copy per account (so every device knows them); this device caches it so a chat request
 * never waits on the network.
 */
export type Memory = {
  id: string;
  text: string;
  source: 'chat' | 'settings';
  createdAt: number;
  updatedAt: number;
};

export type MemoryState = { enabled: boolean; memories: Memory[] };

export const EMPTY_MEMORY_STATE: MemoryState = { enabled: true, memories: [] };

const CACHE_PREFIX = 'memories:v1:';
const listeners = new Set<(state: MemoryState, userId: string) => void>();

export function normalizeMemoryState(value: unknown): MemoryState {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<MemoryState>;
  const memories = (Array.isArray(input.memories) ? input.memories : [])
    .filter((memory): memory is Memory => !!memory && typeof memory.id === 'string' && typeof memory.text === 'string')
    .map((memory) => ({
      id: memory.id,
      text: memory.text,
      source: memory.source === 'settings' ? 'settings' as const : 'chat' as const,
      createdAt: typeof memory.createdAt === 'number' ? memory.createdAt : 0,
      updatedAt: typeof memory.updatedAt === 'number' ? memory.updatedAt : 0,
    }));
  return { enabled: input.enabled !== false, memories };
}

async function request(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path = '', body?: unknown) {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (!idToken) throw new Error('Sign in to use memory.');
  const response = await fetch(`${SERVER_URL}/profile/memories${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...await getFirebaseAppCheckHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(response.status !== 404 && typeof json?.error === 'string' ? `${json.error}.` : 'Could not reach Eazee.');
  }
  return json;
}

export async function readCachedMemories(userId?: string | null): Promise<MemoryState> {
  if (!userId) return EMPTY_MEMORY_STATE;
  try {
    const stored = await AsyncStorage.getItem(`${CACHE_PREFIX}${userId}`);
    return stored ? normalizeMemoryState(JSON.parse(stored)) : EMPTY_MEMORY_STATE;
  } catch {
    return EMPTY_MEMORY_STATE;
  }
}

async function writeCache(userId: string, state: MemoryState) {
  await AsyncStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(state)).catch(() => {});
  listeners.forEach((listener) => listener(state, userId));
  return state;
}

async function apply(userId: string, json: unknown) {
  if (auth.currentUser?.uid !== userId) return normalizeMemoryState(json);
  return writeCache(userId, normalizeMemoryState(json));
}

/** Loads the saved memories (including changes from another device) into the cache. */
export async function refreshMemories(userId?: string | null) {
  if (!userId) return EMPTY_MEMORY_STATE;
  return apply(userId, await request('GET'));
}

/** Saves a memory; one about the same thing replaces the older one on the server. */
export async function addMemory(userId: string, text: string, source: Memory['source'] = 'chat') {
  return apply(userId, await request('POST', '', { text, source }));
}

export async function forgetMemory(userId: string, text: string) {
  return apply(userId, await request('POST', '/forget', { text }));
}

export async function editMemory(userId: string, id: string, text: string) {
  return apply(userId, await request('PATCH', `/${encodeURIComponent(id)}`, { text }));
}

export async function deleteMemory(userId: string, id: string) {
  return apply(userId, await request('DELETE', `/${encodeURIComponent(id)}`));
}

export async function deleteAllMemories(userId: string) {
  return apply(userId, await request('DELETE'));
}

export async function setMemoryEnabled(userId: string, enabled: boolean) {
  return apply(userId, await request('PUT', '/settings', { enabled }));
}

export function subscribeMemories(listener: (state: MemoryState, userId: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What a chat request sends: the memory texts while memory is on, nothing when off. */
export const buildChatMemories = (state: MemoryState) =>
  state.enabled ? state.memories.map((memory) => memory.text) : undefined;
