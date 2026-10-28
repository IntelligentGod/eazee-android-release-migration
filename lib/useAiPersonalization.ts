import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AI_PERSONALIZATION_GUEST_USER_ID,
  DEFAULT_AI_PERSONALIZATION_SETTINGS,
  areAiPersonalizationSettingsEqual,
  readAiPersonalizationSettings,
  subscribeAiPersonalizationSettings,
  writeAiPersonalizationSettings,
  type AiPersonalizationSettings,
} from '@/lib/aiPersonalization';

const normalizeUserId = (userId?: string | null) => {
  const trimmed = typeof userId === 'string' ? userId.trim() : '';
  return trimmed || AI_PERSONALIZATION_GUEST_USER_ID;
};

export function useAiPersonalization(userId?: string | null) {
  const storageUserId = useMemo(() => normalizeUserId(userId), [userId]);
  const [settings, setSettings] = useState(DEFAULT_AI_PERSONALIZATION_SETTINGS);
  const [draft, setDraft] = useState(DEFAULT_AI_PERSONALIZATION_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const settingsRef = useRef(DEFAULT_AI_PERSONALIZATION_SETTINGS);
  const draftRef = useRef(DEFAULT_AI_PERSONALIZATION_SETTINGS);
  const changeVersionRef = useRef(0);

  const replaceSettings = useCallback((nextSettings: AiPersonalizationSettings) => {
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
  }, []);

  const replaceDraft = useCallback((nextDraft: AiPersonalizationSettings) => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, []);

  const applyPersistedSettings = useCallback((nextSettings: AiPersonalizationSettings) => {
    const canReplaceDraft = areAiPersonalizationSettingsEqual(draftRef.current, settingsRef.current);
    replaceSettings(nextSettings);
    if (canReplaceDraft) {
      replaceDraft(nextSettings);
    }
    setErrorMessage('');
  }, [replaceDraft, replaceSettings]);

  useEffect(() => {
    let isMounted = true;

    replaceSettings(DEFAULT_AI_PERSONALIZATION_SETTINGS);
    replaceDraft(DEFAULT_AI_PERSONALIZATION_SETTINGS);
    setErrorMessage('');

    const readVersion = changeVersionRef.current;
    readAiPersonalizationSettings(storageUserId).then((storedSettings) => {
      if (!isMounted || readVersion !== changeVersionRef.current) return;
      applyPersistedSettings(storedSettings);
    });

    const unsubscribe = subscribeAiPersonalizationSettings((nextSettings, nextUserId) => {
      if (!isMounted || nextUserId !== storageUserId) return;
      applyPersistedSettings(nextSettings);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [applyPersistedSettings, replaceDraft, replaceSettings, storageUserId]);

  const updateDraft = useCallback((patch: Partial<AiPersonalizationSettings>) => {
    const nextDraft = { ...draftRef.current, ...patch };
    changeVersionRef.current += 1;
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setErrorMessage('');
  }, []);

  const save = useCallback(async () => {
    const previousSettings = settingsRef.current;
    const draftToSave = draftRef.current;
    changeVersionRef.current += 1;
    replaceSettings(draftToSave);
    setIsSaving(true);
    setErrorMessage('');

    try {
      await writeAiPersonalizationSettings(draftToSave, storageUserId);
    } catch {
      const hasNewerDraft = !areAiPersonalizationSettingsEqual(draftRef.current, draftToSave);
      replaceSettings(previousSettings);
      if (!hasNewerDraft) {
        replaceDraft(previousSettings);
      }
      setErrorMessage('Could not save AI personalization.');
    } finally {
      setIsSaving(false);
    }
  }, [replaceDraft, replaceSettings, storageUserId]);

  return {
    settings,
    draft,
    updateDraft,
    save,
    isSaving,
    errorMessage,
    hasChanges: !areAiPersonalizationSettingsEqual(settings, draft),
  };
}
