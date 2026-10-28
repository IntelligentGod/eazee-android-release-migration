jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('@/config/backend', () => ({ SERVER_URL: 'https://server.test' }));
jest.mock('@/firebaseConfig', () => ({ auth: { currentUser: null } }));
jest.mock('@/lib/firebaseAppCheck', () => ({ getFirebaseAppCheckHeaders: async () => ({}) }));

import {
  buildAboutMeChatContext,
  buildProfileFromDraft,
  canShowAboutMeInvite,
  createAboutMeDraft,
  describeAboutMeChanges,
  EMPTY_ABOUT_ME_PROFILE,
  DEFAULT_CONTROLS,
  normalizeAboutMeProfile,
  parseBigFiveText,
  type AboutMeProfile,
} from '@/lib/aboutMe/profile';
import { TIPI_INSTRUMENT_VERSION, TIPI_ITEMS, TIPI_SCALE, isTipiComplete, scoreTipi } from '@/lib/aboutMe/tipi';

describe('TIPI', () => {
  it('keeps the official items, order and seven-point scale', () => {
    expect(TIPI_ITEMS).toHaveLength(10);
    expect(TIPI_ITEMS[0]).toBe('Extraverted, enthusiastic.');
    expect(TIPI_ITEMS[5]).toBe('Reserved, quiet.');
    expect(TIPI_ITEMS[9]).toBe('Conventional, uncreative.');
    expect(TIPI_SCALE.map((item) => item.value)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(TIPI_SCALE[3].label).toBe('Neither agree nor disagree');
  });

  it('reverse-scores items 2, 4, 6, 8 and 10 and averages each pair', () => {
    expect(scoreTipi([7, 1, 6, 2, 5, 3, 4, 2, 6, 1])).toEqual({
      extraversion: 6, // (7 + (8 - 3)) / 2
      agreeableness: 5.5, // ((8 - 1) + 4) / 2
      conscientiousness: 6, // (6 + (8 - 2)) / 2
      emotionalStability: 6, // ((8 - 2) + 6) / 2
      openness: 6, // (5 + (8 - 1)) / 2
    });
  });

  it('never invents a score for a trait with a skipped item', () => {
    const responses = [7, null, 6, 2, 5, null, 4, 2, 6, 1];
    const scores = scoreTipi(responses);
    expect(scores.extraversion).toBeNull();
    expect(scores.agreeableness).toBeNull();
    expect(scores.conscientiousness).toBe(6);
    expect(isTipiComplete(responses)).toBe(false);
  });
});

const savedProfile: AboutMeProfile = {
  ...EMPTY_ABOUT_ME_PROFILE,
  about_me: { ageRange: '25_34', workText: 'Designer' },
  assistant_preferences: { tone: 'direct' },
  personality_route: 'mbti',
  personality_assessments: { active: { kind: 'mbti', type: 'ENFP', source: '16personalities', selfReported: true } },
};

describe('saving a reviewed draft', () => {
  it('keeps saved answers for questions that were skipped', () => {
    const draft = createAboutMeDraft(savedProfile, { entry: 'settings' });
    draft.assistant_preferences.answerStyle = 'short';
    draft.answered = ['answerStyle'];
    const profile = buildProfileFromDraft(savedProfile, draft, DEFAULT_CONTROLS, 1000);
    expect(profile.about_me).toEqual({ ageRange: '25_34', workText: 'Designer' });
    expect(profile.assistant_preferences).toEqual({ tone: 'direct', answerStyle: 'short' });
    expect(profile.personality_assessments.active).toMatchObject({ kind: 'mbti', type: 'ENFP' });
    expect(profile.field_meta.answerStyle).toEqual({ source: 'settings', updatedAt: 1000 });
  });

  it('keeps the saved result when the personality test is chosen but not answered', () => {
    const draft = createAboutMeDraft(savedProfile, { entry: 'chat' });
    draft.personality_route = 'test';
    expect(buildProfileFromDraft(savedProfile, draft, DEFAULT_CONTROLS).personality_assessments.active?.kind).toBe('mbti');
    draft.tipi = [4, 4, 4, null, null, null, null, null, null, null];
    const partial = buildProfileFromDraft(savedProfile, draft, DEFAULT_CONTROLS).personality_assessments.active;
    expect(partial).toMatchObject({ kind: 'tipi', complete: false, completedAt: null });
  });

  it('offers a goal saved in the first chat for confirmation', () => {
    expect(createAboutMeDraft(null, { entry: 'chat', savedGoalTitle: 'Run 5 km' }).about_me.goalText).toBe('Run 5 km');
    expect(createAboutMeDraft(savedProfile, { entry: 'chat' }).about_me.goalText).toBeUndefined();
  });
});

describe('chat context', () => {
  it('sends only enabled sections, without the server-computed fields', () => {
    expect(buildAboutMeChatContext(savedProfile)).toEqual({
      about_me: { ageRange: '25_34', workText: 'Designer' },
      assistant_preferences: { tone: 'direct' },
      personality: { kind: 'mbti', type: 'ENFP', source: '16personalities' },
    });
    expect(buildAboutMeChatContext({ ...savedProfile, personalisation_controls: { aboutMe: false, preferences: true, personality: false } }))
      .toEqual({ assistant_preferences: { tone: 'direct' } });
    expect(buildAboutMeChatContext(null)).toBeUndefined();
  });

  it('leaves out an unfinished test', () => {
    const profile = normalizeAboutMeProfile({
      personality_assessments: { active: { kind: 'tipi', instrumentVersion: TIPI_INSTRUMENT_VERSION, responses: [4, 4, null, 4, 4, 4, 4, 4, 4, 4] } },
    });
    expect(buildAboutMeChatContext(profile)).toBeUndefined();
  });
});

describe('pasted Big Five results', () => {
  it('reads each trait with its unit and converts nothing', () => {
    expect(parseBigFiveText('Openness: 72nd percentile\nConscientiousness - 40%\nNeuroticism 3.1 / 5\nHello')).toEqual([
      { name: 'Openness', score: 72, unit: 'percentile' },
      { name: 'Conscientiousness', score: 40, unit: 'percent' },
      { name: 'Neuroticism', score: 3.1, unit: 'scale', scaleMax: 5 },
    ]);
  });
});

describe('after saving', () => {
  it('describes changes from the saved answers only', () => {
    const message = describeAboutMeChanges({
      ...EMPTY_ABOUT_ME_PROFILE,
      about_me: { workText: 'design work' },
      assistant_preferences: { answerStyle: 'short', organiseStyle: 'priority_list' },
    });
    expect(message).toBe('I’ll keep answers short, suggest flexible priority lists and use examples relevant to your work or study (“design work”) when helpful. You can change this any time in Settings.');
    expect(describeAboutMeChanges(EMPTY_ABOUT_ME_PROFILE)).toMatch(/^Saved\./);
  });
});

describe('invitation', () => {
  it('stops after "Maybe later" and after three chats', () => {
    expect(canShowAboutMeInvite({ status: 'new', sessionIds: [] }, 's1')).toBe(true);
    expect(canShowAboutMeInvite({ status: 'dismissed', sessionIds: [] }, 's1')).toBe(false);
    expect(canShowAboutMeInvite({ status: 'new', sessionIds: ['a', 'b', 'c'] }, 's1')).toBe(false);
    expect(canShowAboutMeInvite({ status: 'new', sessionIds: ['a', 'b', 'c'] }, 'b')).toBe(true);
  });
});
