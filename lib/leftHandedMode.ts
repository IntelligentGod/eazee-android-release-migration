import AsyncStorage from '@react-native-async-storage/async-storage';

export const LEFT_HANDED_MODE_STORAGE_KEY = 'leftHandedMode:v1';
export const DEFAULT_LEFT_HANDED_MODE = false;

const listeners = new Set<(enabled: boolean) => void>();

const normalizeLeftHandedMode = (value: unknown) =>
  value === true || value === 'true' || value === '1';

export async function readLeftHandedMode(): Promise<boolean> {
  try {
    const storedMode = await AsyncStorage.getItem(LEFT_HANDED_MODE_STORAGE_KEY);
    return normalizeLeftHandedMode(storedMode);
  } catch {
    return DEFAULT_LEFT_HANDED_MODE;
  }
}

export async function writeLeftHandedMode(enabled: boolean) {
  const nextMode = normalizeLeftHandedMode(enabled);
  await AsyncStorage.setItem(LEFT_HANDED_MODE_STORAGE_KEY, nextMode ? 'true' : 'false');
  listeners.forEach((listener) => listener(nextMode));
}

export function subscribeLeftHandedMode(listener: (enabled: boolean) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
