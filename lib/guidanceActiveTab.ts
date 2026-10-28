import type { GuidanceTab } from '@/lib/navigationHelp';

let activeGuidanceTab: GuidanceTab | null = null;
const listeners = new Set<(tab: GuidanceTab | null) => void>();

export function setGuidanceActiveTab(tab: GuidanceTab | null) {
  activeGuidanceTab = tab;
  listeners.forEach((listener) => listener(activeGuidanceTab));
}

export function getGuidanceActiveTab() {
  return activeGuidanceTab;
}

export function subscribeGuidanceActiveTab(listener: (tab: GuidanceTab | null) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
