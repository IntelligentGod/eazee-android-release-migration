import type { Router } from 'expo-router';
import {
  getShortcutForGuidanceTarget,
  type GuidanceTarget,
  type NavigationHelpMode,
} from '@/lib/navigationHelp';

export function handleNavigationHelpTarget(params: {
  target: GuidanceTarget;
  label: string;
  mode: NavigationHelpMode;
  startGuidance: (target: GuidanceTarget, label?: string) => void;
  router: Router;
  fallback?: {
    route?: string;
    params?: Record<string, any>;
  };
  extraParams?: Record<string, any>;
}) {
  if (params.mode === 'guide' && params.target.type === 'screen') {
    params.startGuidance(params.target, params.label);
    return 'guide' as const;
  }

  const shortcut = getShortcutForGuidanceTarget(params.target, params.fallback);
  params.router.push({
    pathname: shortcut.pathname as any,
    params: {
      ...(shortcut.params || {}),
      ...(params.extraParams || {}),
    },
  });
  return 'shortcut' as const;
}
