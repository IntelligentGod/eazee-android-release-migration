jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('@/config/backend', () => ({ SERVER_URL: 'https://server.test' }));
jest.mock('@/firebaseConfig', () => ({ auth: { currentUser: null } }));
jest.mock('@/lib/firebaseAppCheck', () => ({ getFirebaseAppCheckHeaders: async () => ({}) }));

import { CARD_THEMES, getCardBasis, getCardCaption, pickCardTheme } from '@/lib/aboutMe/personalityCard';
import { TIPI_INSTRUMENT_VERSION } from '@/lib/aboutMe/tipi';

const tipi = (responses: (number | null)[]) => ({ kind: 'tipi' as const, instrumentVersion: TIPI_INSTRUMENT_VERSION, responses });

describe('Eazee personality card', () => {
  it('picks the theme from the result, not at random', () => {
    // Openness high (5, 10R), conscientiousness low (3, 8R), extraversion mid.
    const basis = getCardBasis(tipi([4, 4, 2, 4, 7, 4, 4, 6, 4, 1]));
    expect(basis.ok && basis.levels).toEqual({ openness: 'high', conscientiousness: 'low', extraversion: 'mid' });
    expect(basis.ok && pickCardTheme(basis.levels).id).toBe('visionary');
    expect(basis.ok && pickCardTheme(basis.levels).id).toBe('visionary');
  });

  it('ignores agreeableness and emotional stability', () => {
    const calm = getCardBasis(tipi([4, 1, 4, 1, 4, 4, 7, 4, 7, 4]));
    const tense = getCardBasis(tipi([4, 7, 4, 7, 4, 4, 1, 4, 1, 4]));
    expect(calm.ok && tense.ok && calm.levels).toEqual(tense.ok && tense.levels);
    expect(calm.ok && pickCardTheme(calm.levels).id).toBe('all_rounder');
  });

  it('makes no card from an unfinished test, an unclear result or no result', () => {
    expect(getCardBasis(tipi([4, 4, 4, 4, 4, 4, 4, 4, 4, null]))).toEqual({ ok: false, reason: 'incomplete' });
    expect(getCardBasis({ kind: 'other', testName: 'Enneagram', resultText: '7w6' })).toEqual({ ok: false, reason: 'unclear' });
    expect(getCardBasis({ kind: 'big_five', testName: 'Test', traits: [{ name: 'Agreeableness', score: 80, unit: 'percentile' }] }))
      .toEqual({ ok: false, reason: 'unclear' });
    expect(getCardBasis(null)).toEqual({ ok: false, reason: 'none' });
  });

  it('labels an imported type as self-reported', () => {
    const basis = getCardBasis({ kind: 'mbti', type: 'ENFP', source: '16personalities' });
    expect(basis.ok && basis.label).toBe('Playful take on your self-reported ENFP');
    expect(basis.ok && pickCardTheme(basis.levels).id).toBe('visionary');
    const esfj = getCardBasis({ kind: 'mbti', type: 'ESFJ', source: 'mbti' });
    expect(esfj.ok && pickCardTheme(esfj.levels).id).toBe('clipboard_playlist');
  });

  it('cycles captions within the same theme', () => {
    const theme = CARD_THEMES[0];
    expect(getCardCaption(theme, 'gentle', 0)).toBe(theme.captions.gentle[0]);
    expect(getCardCaption(theme, 'gentle', theme.captions.gentle.length)).toBe(theme.captions.gentle[0]);
    expect(getCardCaption(theme, 'cheeky', 1)).toBe(theme.captions.cheeky[1]);
  });

  it('every theme has gentle and cheeky captions and is reachable', () => {
    const levels = ['high', 'mid', 'low'] as const;
    const reached = new Set<string>();
    for (const openness of levels) for (const conscientiousness of levels) for (const extraversion of levels) {
      reached.add(pickCardTheme({ openness, conscientiousness, extraversion }).id);
    }
    for (const theme of CARD_THEMES) {
      expect(theme.captions.gentle.length).toBeGreaterThan(0);
      expect(theme.captions.cheeky.length).toBeGreaterThan(0);
      expect(reached.has(theme.id)).toBe(true);
    }
  });
});
