import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_NAVIGATION_HELP_MODE,
  readNavigationHelpMode,
  subscribeNavigationHelpMode,
  writeNavigationHelpMode,
  type NavigationHelpMode,
} from '@/lib/navigationHelp';

export function useNavigationHelpMode() {
  const [mode, setModeState] = useState<NavigationHelpMode>(DEFAULT_NAVIGATION_HELP_MODE);

  useEffect(() => {
    let isMounted = true;
    readNavigationHelpMode().then((storedMode) => {
      if (isMounted) {
        setModeState(storedMode);
      }
    });

    const unsubscribe = subscribeNavigationHelpMode((nextMode) => {
      if (isMounted) {
        setModeState(nextMode);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const setMode = useCallback(async (nextMode: NavigationHelpMode) => {
    setModeState(nextMode);
    try {
      await writeNavigationHelpMode(nextMode);
    } catch {
      setModeState(await readNavigationHelpMode());
    }
  }, []);

  return {
    mode,
    setMode,
    isGuideMode: mode === 'guide',
    isShortcutMode: mode === 'shortcut',
  };
}
