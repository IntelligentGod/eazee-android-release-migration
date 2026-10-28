import {
  DEFAULT_LIFE_GRAPH_SETTINGS,
  computeLifeGraphProgress,
  doesTaskMatchLifeGraphNode,
  getLifeGraphLobeStrengths,
  getLifeGraphWeekStart,
  normalizeLifeGraphSettings,
  parseLifeGraphKeywords,
  type LifeGraphSettings,
} from '@/lib/lifeGraph';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const healthNode = DEFAULT_LIFE_GRAPH_SETTINGS.nodes.find((node) => node.id === 'health')!;

const withHealthTarget = (weeklyTarget: number, enabled = true): LifeGraphSettings => ({
  ...DEFAULT_LIFE_GRAPH_SETTINGS,
  nodes: DEFAULT_LIFE_GRAPH_SETTINGS.nodes.map((node) =>
    node.id === 'health' ? { ...node, weeklyTarget, enabled } : node
  ),
});

describe('life graph', () => {
  it('starts the week at local midnight on the configured weekday', () => {
    // Wednesday 2026-09-30, week starting Monday
    expect(getLifeGraphWeekStart(new Date(2026, 8, 30, 15), 1)).toEqual(new Date(2026, 8, 28));
    expect(getLifeGraphWeekStart(new Date(2026, 8, 28, 0, 5), 1)).toEqual(new Date(2026, 8, 28));
    expect(getLifeGraphWeekStart(new Date(2026, 8, 27, 23), 1)).toEqual(new Date(2026, 8, 21));
    expect(getLifeGraphWeekStart(new Date(2026, 8, 30, 15), 0)).toEqual(new Date(2026, 8, 27));
  });

  it('matches keywords and the node name at word starts, ignoring case', () => {
    expect(doesTaskMatchLifeGraphNode(healthNode, 'Morning RUN in the park')).toBe(true);
    expect(doesTaskMatchLifeGraphNode(healthNode, 'running club')).toBe(true);
    expect(doesTaskMatchLifeGraphNode(healthNode, 'Book health checkup')).toBe(true);
    expect(doesTaskMatchLifeGraphNode(healthNode, 'Sunday brunch')).toBe(false);
  });

  it('grows a node by completed related tasks this week, capped at the target', () => {
    const weekStart = new Date(2026, 8, 28);
    const progress = computeLifeGraphProgress(withHealthTarget(2), [
      { text: 'Gym session', completedAt: new Date(2026, 8, 28, 8) },
      { text: 'Pay rent', details: 'then a walk', completedAt: new Date(2026, 8, 29, 8) },
      { text: 'Run 5k', completedAt: new Date(2026, 8, 30, 8) },
      { text: 'Gym last week', completedAt: new Date(2026, 8, 27, 20) },
    ], weekStart);

    expect(progress.health).toEqual({ completedCount: 3, growth: 1 });
    expect(progress.work).toEqual({ completedCount: 0, growth: 0 });
  });

  it('shows the plain fluid Droplet while the life graph is off (the default)', () => {
    const settings = withHealthTarget(4, true);
    expect(settings.lifeGraphEnabled).toBe(false);
    const progress = computeLifeGraphProgress(settings, [{ text: 'Gym', completedAt: new Date(2026, 8, 29) }], new Date(2026, 8, 28));
    expect(Object.values(getLifeGraphLobeStrengths(settings, progress)).every((strength) => strength === 0)).toBe(true);
    expect(normalizeLifeGraphSettings({ lifeGraphEnabled: true }).lifeGraphEnabled).toBe(true);
  });

  it('hides disabled nodes and keeps enabled ones visible at zero growth', () => {
    const settings = { ...withHealthTarget(4, false), lifeGraphEnabled: true };
    const progress = computeLifeGraphProgress(settings, [
      { text: 'Gym', completedAt: new Date(2026, 8, 29) },
      { text: 'Read a book', completedAt: new Date(2026, 8, 29) },
    ], new Date(2026, 8, 28));
    const strengths = getLifeGraphLobeStrengths(settings, progress);

    expect(progress.health.completedCount).toBe(0);
    expect(strengths.health).toBe(0);
    expect(strengths.work).toBeGreaterThan(0);
    expect(strengths.growth).toBeGreaterThan(strengths.work);
  });

  it('normalizes stored settings back to six valid nodes', () => {
    const settings = normalizeLifeGraphSettings({
      faceVisible: false,
      nodes: [{ id: 'work', enabled: false, name: '  ', keywords: ['Code', 7, 'code'], weeklyTarget: 900 }],
    });

    expect(settings.faceVisible).toBe(false);
    expect(settings.nodes).toHaveLength(6);
    expect(settings.nodes.find((node) => node.id === 'work')).toEqual({
      id: 'work',
      enabled: false,
      name: 'Work',
      keywords: ['code'],
      weeklyTarget: 50,
    });
    expect(normalizeLifeGraphSettings(null)).toEqual(DEFAULT_LIFE_GRAPH_SETTINGS);
  });

  it('parses comma separated keywords without blanks or duplicates', () => {
    expect(parseLifeGraphKeywords(' Yoga, ,swim,yoga ')).toEqual(['yoga', 'swim']);
  });
});
