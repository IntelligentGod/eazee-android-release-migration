import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_HOME_PERSONALIZATION_SETTINGS,
  HOME_PERSONALIZATION_GUEST_USER_ID,
  readHomePersonalizationSettings,
  subscribeHomePersonalizationSettings,
  writeHomePersonalizationSettings,
  type HomeCardId,
  type HomePersonalizationSettings,
} from '@/lib/homePersonalization';

const normalizeUserId = (userId?: string | null) => {
  const trimmed = typeof userId === 'string' ? userId.trim() : '';
  return trimmed || HOME_PERSONALIZATION_GUEST_USER_ID;
};

export function useHomePersonalization(userId?: string | null) {
  const storageUserId = useMemo(() => normalizeUserId(userId), [userId]);
  const [settings, setSettings] = useState(DEFAULT_HOME_PERSONALIZATION_SETTINGS);
  const [loadedStorageUserId, setLoadedStorageUserId] = useState('');
  const storageUserIdRef = useRef(storageUserId);
  storageUserIdRef.current = storageUserId;
  const isLoaded = loadedStorageUserId === storageUserId;
  const currentSettings = isLoaded ? settings : DEFAULT_HOME_PERSONALIZATION_SETTINGS;

  useEffect(() => {
    let isMounted = true;
    setSettings(DEFAULT_HOME_PERSONALIZATION_SETTINGS);
    setLoadedStorageUserId('');

    readHomePersonalizationSettings(storageUserId).then((storedSettings) => {
      if (isMounted) {
        setSettings(storedSettings);
        setLoadedStorageUserId(storageUserId);
      }
    });
    const unsubscribe = subscribeHomePersonalizationSettings((nextSettings, nextUserId) => {
      if (isMounted && nextUserId === storageUserId) {
        setSettings(nextSettings);
        setLoadedStorageUserId(storageUserId);
      }
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [storageUserId]);

  const updateSettings = useCallback(async (nextSettings: HomePersonalizationSettings) => {
    const previousSettings = currentSettings;
    const updateUserId = storageUserId;
    setSettings(nextSettings);
    setLoadedStorageUserId(updateUserId);
    try {
      await writeHomePersonalizationSettings(nextSettings, updateUserId);
    } catch {
      if (storageUserIdRef.current === updateUserId) {
        setSettings(previousSettings);
      }
    }
  }, [currentSettings, storageUserId]);

  const setOrder = useCallback((order: HomeCardId[]) => {
    void updateSettings({ ...currentSettings, order });
  }, [currentSettings, updateSettings]);

  const setSuggestionsEnabled = useCallback((suggestionsEnabled: boolean) => {
    void updateSettings({ ...currentSettings, suggestionsEnabled });
  }, [currentSettings, updateSettings]);

  return {
    settings: currentSettings,
    isLoaded,
    setOrder,
    setSuggestionsEnabled,
  };
}
