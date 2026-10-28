import { useEffect, useRef } from 'react';
import { useGuidance } from '@/components/guidance/GuidanceProvider';
import { getGuidanceTargetLabel, type GuidanceTarget } from '@/lib/navigationHelp';
import { useNavigationHelpMode } from '@/lib/useNavigationHelpMode';
import type { CompactAiNotice } from '@/lib/useCompactTabAI';

const getNoticeGuidanceLabel = (notice: CompactAiNotice, target: GuidanceTarget) => {
  const actionLabel = String(notice.actionLabel || '').replace(/^Open\s+/i, '').trim();
  if (actionLabel) return actionLabel;

  const quoted = String(notice.message || '').match(/[“"]([^”"]+)[”"]/);
  if (quoted?.[1]) return quoted[1];

  return getGuidanceTargetLabel(target);
};

export function useCompactGuidanceBridge(
  notice: CompactAiNotice | null,
  dismissNotice: () => void
) {
  const { mode } = useNavigationHelpMode();
  const { startGuidance } = useGuidance();
  const handledKeyRef = useRef('');

  useEffect(() => {
    if (!notice) {
      handledKeyRef.current = '';
      return;
    }

    if (mode !== 'guide' || !notice?.target || notice.kind !== 'toast') {
      return;
    }

    const target = notice.target as GuidanceTarget;
    if (target.type !== 'screen') {
      return;
    }

    const key = `${notice.message}|${JSON.stringify(target)}`;
    if (handledKeyRef.current === key) {
      return;
    }

    handledKeyRef.current = key;
    startGuidance(target, getNoticeGuidanceLabel(notice, target));
    dismissNotice();
  }, [dismissNotice, mode, notice, startGuidance]);
}
