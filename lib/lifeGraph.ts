import AsyncStorage from '@react-native-async-storage/async-storage';

import { MAX_EFFECTIVE_LOBE_CALM_BALANCED } from '@/src/blob/blobMeaning';

/** One slot per Droplet lobe; the order matches the lobe positions on the mesh. */
export const LIFE_GRAPH_NODE_IDS = ['health', 'relationships', 'work', 'sleep', 'home', 'growth'] as const;
export type LifeGraphNodeId = (typeof LIFE_GRAPH_NODE_IDS)[number];

export type LifeGraphNode = {
  id: LifeGraphNodeId;
  enabled: boolean;
  name: string;
  /** A completed task counts toward this node when its title or details contain one of these, or the name. */
  keywords: string[];
  /** Completed related tasks per week that grow this node to full size. */
  weeklyTarget: number;
};

export type LifeGraphSettings = {
  faceVisible: boolean;
  /** Life-area lobes on the Droplet; off shows the plain fluid drop. */
  lifeGraphEnabled: boolean;
  nodes: LifeGraphNode[];
};

export const LIFE_GRAPH_MIN_WEEKLY_TARGET = 1;
export const LIFE_GRAPH_MAX_WEEKLY_TARGET = 50;
export const LIFE_GRAPH_MAX_NAME_LENGTH = 24;

export const DEFAULT_LIFE_GRAPH_SETTINGS: LifeGraphSettings = {
  // The plain fluid droplet is the default look; the face can be turned on in its settings.
  faceVisible: false,
  lifeGraphEnabled: false,
  nodes: [
    { id: 'health', enabled: true, name: 'Health', keywords: ['gym', 'workout', 'run', 'walk', 'doctor', 'meditate'], weeklyTarget: 5 },
    { id: 'relationships', enabled: true, name: 'Relationships', keywords: ['call', 'family', 'friend', 'date', 'visit'], weeklyTarget: 5 },
    { id: 'work', enabled: true, name: 'Work', keywords: ['meeting', 'email', 'report', 'project', 'client'], weeklyTarget: 5 },
    { id: 'sleep', enabled: true, name: 'Rest', keywords: ['sleep', 'nap', 'rest', 'bedtime'], weeklyTarget: 5 },
    { id: 'home', enabled: true, name: 'Home', keywords: ['clean', 'laundry', 'groceries', 'cook', 'dishes'], weeklyTarget: 5 },
    { id: 'growth', enabled: true, name: 'Growth', keywords: ['read', 'learn', 'study', 'course', 'practice'], weeklyTarget: 5 },
  ],
};

const LIFE_GRAPH_STORAGE_KEY_PREFIX = 'lifeGraph:settings:v1:';

const clampWeeklyTarget = (value: unknown, fallback: number) => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(LIFE_GRAPH_MAX_WEEKLY_TARGET, Math.max(LIFE_GRAPH_MIN_WEEKLY_TARGET, numeric));
};

export const parseLifeGraphKeywords = (text: string) =>
  Array.from(new Set(
    text
      .split(',')
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean)
  ));

/** Fills gaps from the defaults so a partial or older stored value still yields all six slots. */
export function normalizeLifeGraphSettings(value: unknown): LifeGraphSettings {
  const stored = (value && typeof value === 'object' ? value : {}) as Partial<LifeGraphSettings>;
  const storedNodes = Array.isArray(stored.nodes) ? stored.nodes : [];

  return {
    faceVisible: typeof stored.faceVisible === 'boolean' ? stored.faceVisible : DEFAULT_LIFE_GRAPH_SETTINGS.faceVisible,
    lifeGraphEnabled: typeof stored.lifeGraphEnabled === 'boolean'
      ? stored.lifeGraphEnabled
      : DEFAULT_LIFE_GRAPH_SETTINGS.lifeGraphEnabled,
    nodes: DEFAULT_LIFE_GRAPH_SETTINGS.nodes.map((defaultNode) => {
      const storedNode = storedNodes.find((node) => node?.id === defaultNode.id);
      if (!storedNode) return defaultNode;
      const name = typeof storedNode.name === 'string' ? storedNode.name.trim().slice(0, LIFE_GRAPH_MAX_NAME_LENGTH) : '';
      return {
        id: defaultNode.id,
        enabled: typeof storedNode.enabled === 'boolean' ? storedNode.enabled : defaultNode.enabled,
        name: name || defaultNode.name,
        keywords: Array.isArray(storedNode.keywords)
          ? parseLifeGraphKeywords(storedNode.keywords.filter((keyword) => typeof keyword === 'string').join(','))
          : defaultNode.keywords,
        weeklyTarget: clampWeeklyTarget(storedNode.weeklyTarget, defaultNode.weeklyTarget),
      };
    }),
  };
}

export async function readLifeGraphSettings(userId: string): Promise<LifeGraphSettings> {
  try {
    const stored = await AsyncStorage.getItem(`${LIFE_GRAPH_STORAGE_KEY_PREFIX}${userId}`);
    return stored ? normalizeLifeGraphSettings(JSON.parse(stored)) : DEFAULT_LIFE_GRAPH_SETTINGS;
  } catch {
    return DEFAULT_LIFE_GRAPH_SETTINGS;
  }
}

export async function writeLifeGraphSettings(userId: string, settings: LifeGraphSettings) {
  try {
    await AsyncStorage.setItem(`${LIFE_GRAPH_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save life graph settings', error);
  }
}

/** Local midnight at the start of the week containing `now`. */
export function getLifeGraphWeekStart(now: Date, weekStartsOn: number) {
  const daysSinceWeekStart = (now.getDay() - weekStartsOn + 7) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceWeekStart);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches at a word start, so "run" also counts "running" but not "brunch". */
export function doesTaskMatchLifeGraphNode(node: LifeGraphNode, taskText: string) {
  return [node.name, ...node.keywords]
    .map((term) => term.trim())
    .filter(Boolean)
    .some((term) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}`, 'i').test(taskText));
}

export type LifeGraphCompletedTask = {
  text: string;
  details?: string | null;
  completedAt: Date;
};

export type LifeGraphNodeProgress = {
  completedCount: number;
  /** 0..1 share of the weekly target; 0 for a disabled node. */
  growth: number;
};

/** A task can count toward several nodes when it matches more than one. */
export function computeLifeGraphProgress(
  settings: LifeGraphSettings,
  completedTasks: LifeGraphCompletedTask[],
  weekStart: Date
): Record<LifeGraphNodeId, LifeGraphNodeProgress> {
  const tasksThisWeek = completedTasks.filter((task) => task.completedAt >= weekStart);

  return Object.fromEntries(
    settings.nodes.map((node) => {
      const completedCount = node.enabled
        ? tasksThisWeek.filter((task) => doesTaskMatchLifeGraphNode(node, `${task.text} ${task.details || ''}`)).length
        : 0;
      return [node.id, { completedCount, growth: node.enabled ? Math.min(1, completedCount / node.weeklyTarget) : 0 }];
    })
  ) as Record<LifeGraphNodeId, LifeGraphNodeProgress>;
}

/** Zero growth keeps the calm Droplet's small bump, so an enabled node is still visible. */
const LIFE_GRAPH_LOBE_STRENGTH_MIN = MAX_EFFECTIVE_LOBE_CALM_BALANCED;
/** Strength once the weekly target is reached: a clearly grown lobe, about six times the bump. */
const LIFE_GRAPH_LOBE_STRENGTH_MAX = 0.75;

/** Metaball strength for each Droplet lobe; 0 hides a disabled node. */
export function getLifeGraphLobeStrengths(
  settings: LifeGraphSettings,
  progress: Record<LifeGraphNodeId, LifeGraphNodeProgress>
): Record<LifeGraphNodeId, number> {
  return Object.fromEntries(
    settings.nodes.map((node) => [
      node.id,
      settings.lifeGraphEnabled && node.enabled
        ? LIFE_GRAPH_LOBE_STRENGTH_MIN + (LIFE_GRAPH_LOBE_STRENGTH_MAX - LIFE_GRAPH_LOBE_STRENGTH_MIN) * progress[node.id].growth
        : 0,
    ])
  ) as Record<LifeGraphNodeId, number>;
}
