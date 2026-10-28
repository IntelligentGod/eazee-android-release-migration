import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_LEFT_HANDED_MODE,
  readLeftHandedMode,
  subscribeLeftHandedMode,
  writeLeftHandedMode,
} from '@/lib/leftHandedMode';

export function useLeftHandedMode() {
  const [isLeftHanded, setLeftHandedState] = useState(DEFAULT_LEFT_HANDED_MODE);

  useEffect(() => {
    let isMounted = true;
    readLeftHandedMode().then((storedMode) => {
      if (isMounted) {
        setLeftHandedState(storedMode);
      }
    });

    const unsubscribe = subscribeLeftHandedMode((nextMode) => {
      if (isMounted) {
        setLeftHandedState(nextMode);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const setLeftHanded = useCallback(async (nextMode: boolean) => {
    setLeftHandedState(nextMode);
    try {
      await writeLeftHandedMode(nextMode);
    } catch {
      setLeftHandedState(await readLeftHandedMode());
    }
  }, []);

  const toggleLeftHanded = useCallback(() => setLeftHanded(!isLeftHanded), [isLeftHanded, setLeftHanded]);

  return {
    isLeftHanded,
    setLeftHanded,
    toggleLeftHanded,
  };
}
