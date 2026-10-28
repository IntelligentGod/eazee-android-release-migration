import type { Assessment } from './profile';
import { isTipiComplete, scoreTipi } from './tipi';

/**
 * "Your Eazee personality": a playful card picked from the personality result. It is
 * entertainment, kept apart from the scores, and is never sent to the AI as a fact about
 * the user. Only openness, conscientiousness and extraversion choose the joke; agreeableness
 * and emotional stability are never part of it. Jokes tease habits affectionately and never
 * touch distress, mental health, intelligence, looks, age, work or money.
 */

export type CardLevel = 'high' | 'mid' | 'low';
export type CardLevels = { openness: CardLevel | null; conscientiousness: CardLevel | null; extraversion: CardLevel | null };
export type CardHumour = 'gentle' | 'cheeky';
export type CardBasisKind = 'tipi' | 'mbti' | 'big_five';

export type CardBasis =
  | { ok: true; kind: CardBasisKind; levels: CardLevels; label: string }
  | { ok: false; reason: 'none' | 'incomplete' | 'unclear' };

export type CardTheme = {
  id: string;
  title: string;
  captions: Record<CardHumour, string[]>;
  superpower: string;
  plotTwist: string;
  move: string;
  /** Every listed trait must be at one of these levels for the theme to fit. */
  needs: Partial<Record<keyof CardLevels, CardLevel[]>>;
};

/** In order of preference; the most specific fitting theme wins, then the earliest. */
export const CARD_THEMES: CardTheme[] = [
  {
    id: 'visionary',
    title: 'The 47-Tab Visionary',
    captions: {
      gentle: [
        'You opened Eazee to finish one task. You now have three business ideas and a plan to learn Italian.',
        'Your mind has more open tabs than your browser, and most of them are genuinely good ideas.',
      ],
      cheeky: [
        'You don’t have a to-do list. You have a to-do universe, and it’s still expanding.',
        'Ideas arrive faster than calendar invites can keep up. The calendar has stopped trying.',
      ],
    },
    superpower: 'Seeing possibilities everywhere',
    plotTwist: 'Choosing just one',
    move: 'One idea. One next step.',
    needs: { openness: ['high'], conscientiousness: ['low', 'mid'] },
  },
  {
    id: 'quiet_plot_twist',
    title: 'The Quiet Plot Twist',
    captions: {
      gentle: [
        'You said “just a quiet weekend” and somehow came back with a new hobby and a completely different life plan.',
        'Calm on the outside. On the inside, seventeen fascinating rabbit holes.',
      ],
      cheeky: [
        'Nobody saw it coming, least of all you: you’re now an expert in medieval bread.',
        'You don’t go out much. Your curiosity, however, has a passport full of stamps.',
      ],
    },
    superpower: 'Following your curiosity',
    plotTwist: 'Explaining the latest side quest',
    move: 'Space to explore, help to finish.',
    needs: { openness: ['high'], extraversion: ['low'] },
  },
  {
    id: 'ignition_switch',
    title: 'The Group Chat Ignition Switch',
    captions: {
      gentle: [
        'One message from you and suddenly everyone is planning a weekend away.',
        'You bring the spark, the ideas and, usually, the snacks.',
      ],
      cheeky: [
        'Your best and most chaotic plans all start with the words “quick idea”.',
        'You’ve started more adventures in a group chat than most people start in a year.',
      ],
    },
    superpower: 'Getting people excited',
    plotTwist: 'Remembering who actually said yes',
    move: 'Big energy, written down.',
    needs: { openness: ['high'], extraversion: ['high'] },
  },
  {
    id: 'clipboard_playlist',
    title: 'The Clipboard With a Playlist',
    captions: {
      gentle: [
        'You organise the trip, the snacks and the playlist, and somehow make it all feel fun.',
        'You’re the reason the plan happens and the reason everyone enjoys it.',
      ],
      cheeky: [
        'You have a shared spreadsheet for the party. It has a tab for vibes.',
        'Your idea of spontaneous is a plan with a fun section.',
      ],
    },
    superpower: 'Rallying people around a plan',
    plotTwist: 'Letting someone else hold the clipboard',
    move: 'Lead the plan, share the load.',
    needs: { conscientiousness: ['high'], extraversion: ['high'] },
  },
  {
    id: 'quiet_powerhouse',
    title: 'The Quiet Powerhouse',
    captions: {
      gentle: [
        'No fuss, no fanfare, and somehow the whole thing is done by Thursday.',
        'You don’t announce your progress. It just quietly appears.',
      ],
      cheeky: [
        'You said three words in the meeting, then finished the entire project before lunch.',
        'Your to-do list is scared of you, and frankly it should be.',
      ],
    },
    superpower: 'Getting it done without the fanfare',
    plotTwist: 'Telling people it’s already done',
    move: 'Steady steps, visible progress.',
    needs: { conscientiousness: ['high'], extraversion: ['low'] },
  },
  {
    id: 'spreadsheet_feelings',
    title: 'The Spreadsheet With Feelings',
    captions: {
      gentle: [
        'You don’t overplan. You simply believe spontaneity deserves a calendar invite.',
        'You turn “we should do that sometime” into an actual date, time and plan.',
      ],
      cheeky: [
        'You colour-code your colour codes, and honestly it works.',
        'Your backup plan has a backup plan, and both are beautifully formatted.',
      ],
    },
    superpower: 'Turning chaos into a plan',
    plotTwist: 'Letting the plan take a day off',
    move: 'Structure with breathing room.',
    needs: { conscientiousness: ['high'] },
  },
  {
    id: 'spontaneous_spark',
    title: 'The Spontaneous Spark',
    captions: {
      gentle: [
        'Your plans are less of a schedule and more of a vibe, and the vibe is usually great.',
        'You’re brilliant at making the most of whatever today turns out to be.',
      ],
      cheeky: [
        'You’ll get to it. Probably right after this much more interesting thing.',
        'Your calendar is a gentle suggestion, and you treat it with polite curiosity.',
      ],
    },
    superpower: 'Making the most of the moment',
    plotTwist: 'Remembering what Tuesday was for',
    move: 'Keep the fun, add one reminder.',
    needs: { extraversion: ['high'], conscientiousness: ['low', 'mid'] },
  },
  {
    id: 'routine_whisperer',
    title: 'The Trusty Routine Whisperer',
    captions: {
      gentle: [
        'You found the best way to do it years ago, and it still works beautifully.',
        'Reliable, steady and always there when the plan needs to actually happen.',
      ],
      cheeky: [
        'You’ve had the same favourite order since forever, and you’re not wrong.',
        'New and improved? Your routine has heard that one before.',
      ],
    },
    superpower: 'Making things reliable',
    plotTwist: 'Trying the new thing just once',
    move: 'Proven routine, small experiment.',
    needs: { openness: ['low'], conscientiousness: ['mid', 'high'] },
  },
  {
    id: 'all_rounder',
    title: 'The Adaptable All-Rounder',
    captions: {
      gentle: [
        'Plans or spontaneity? You’ll have whichever the day needs, thanks.',
        'You can switch from big picture to small details without missing a beat.',
      ],
      cheeky: [
        'Ask you for a plan and you’ll say “depends”, and annoyingly you’ll be right.',
        'You’re a little bit of everything, like a very well-organised surprise.',
      ],
    },
    superpower: 'Adjusting to whatever comes up',
    plotTwist: 'Picking what you want, not just what fits',
    move: 'Flexible plan, clear priority.',
    needs: {},
  },
];

const tipiLevel = (score: number | null): CardLevel | null =>
  score === null ? null : score >= 5 ? 'high' : score <= 3 ? 'low' : 'mid';

const percentLevel = (value: number): CardLevel => (value >= 60 ? 'high' : value <= 40 ? 'low' : 'mid');

/** What the card can be based on. Unclear or unfinished results never produce a card. */
export function getCardBasis(assessment: Assessment | null | undefined): CardBasis {
  if (!assessment) return { ok: false, reason: 'none' };
  if (assessment.kind === 'tipi') {
    if (!isTipiComplete(assessment.responses)) return { ok: false, reason: 'incomplete' };
    const scores = scoreTipi(assessment.responses);
    return {
      ok: true,
      kind: 'tipi',
      label: 'Based on your 10-statement personality quiz',
      levels: {
        openness: tipiLevel(scores.openness),
        conscientiousness: tipiLevel(scores.conscientiousness),
        extraversion: tipiLevel(scores.extraversion),
      },
    };
  }
  if (assessment.kind === 'mbti') {
    // Only picks the joke; the type is never turned into scores.
    const [ei, sn, , jp] = assessment.type.split('');
    return {
      ok: true,
      kind: 'mbti',
      label: `Playful take on your self-reported ${assessment.type}`,
      levels: {
        extraversion: ei === 'E' ? 'high' : 'low',
        openness: sn === 'N' ? 'high' : 'mid',
        conscientiousness: jp === 'J' ? 'high' : 'low',
      },
    };
  }
  if (assessment.kind === 'big_five') {
    const levels: CardLevels = { openness: null, conscientiousness: null, extraversion: null };
    for (const trait of assessment.traits) {
      const name = trait.name.toLowerCase();
      const key: keyof CardLevels | null = /open|intellect/.test(name)
        ? 'openness'
        : /conscien/.test(name)
          ? 'conscientiousness'
          : /extra|extro/.test(name)
            ? 'extraversion'
            : null;
      if (!key) continue;
      const value = trait.unit === 'scale'
        ? (trait.scaleMax ? (trait.score / trait.scaleMax) * 100 : null)
        : trait.score;
      if (value !== null && Number.isFinite(value)) levels[key] = percentLevel(value);
    }
    if (!levels.openness && !levels.conscientiousness && !levels.extraversion) return { ok: false, reason: 'unclear' };
    return { ok: true, kind: 'big_five', label: 'Playful take on your self-reported Big Five results', levels };
  }
  // Other tests stay as text: no card until the result is clear.
  return { ok: false, reason: 'unclear' };
}

/** The best-fitting theme for these levels; always the same for the same result. */
export function pickCardTheme(levels: CardLevels): CardTheme {
  let best = CARD_THEMES[CARD_THEMES.length - 1];
  let bestSpecificity = -1;
  for (const theme of CARD_THEMES) {
    const needs = Object.entries(theme.needs) as [keyof CardLevels, CardLevel[]][];
    const fits = needs.every(([trait, allowed]) => {
      const level = levels[trait];
      return !!level && allowed.includes(level);
    });
    if (fits && needs.length > bestSpecificity) {
      best = theme;
      bestSpecificity = needs.length;
    }
  }
  return best;
}

export const getCardTheme = (id: string | null | undefined) => CARD_THEMES.find((theme) => theme.id === id) ?? null;

export const getCardCaption = (theme: CardTheme, humour: CardHumour, index: number) => {
  const captions = theme.captions[humour];
  return captions[((index % captions.length) + captions.length) % captions.length];
};
