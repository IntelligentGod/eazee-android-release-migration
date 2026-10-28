/**
 * The Ten-Item Personality Inventory (TIPI), Gosling, Rentfrow & Swann (2003), copied
 * word for word from the official English instrument
 * (gosling.psy.utexas.edu, "Ten-Item Personality Inventory-(TIPI)"; free to use for any purpose).
 * Do not reword, shorten or reorder: the scores are only valid for this exact wording.
 * Add another language only from a reviewed translation, with its own version id.
 */
export const TIPI_INSTRUMENT_VERSION = 'TIPI-en-2003';

export const TIPI_INSTRUCTIONS =
  'Here are a number of personality traits that may or may not apply to you. Please write a number next to each statement to indicate the extent to which you agree or disagree with that statement. You should rate the extent to which the pair of traits applies to you, even if one characteristic applies more strongly than the other.';

export const TIPI_STEM = 'I see myself as:';

/** Items 1-10, in the instrument's order. */
export const TIPI_ITEMS = [
  'Extraverted, enthusiastic.',
  'Critical, quarrelsome.',
  'Dependable, self-disciplined.',
  'Anxious, easily upset.',
  'Open to new experiences, complex.',
  'Reserved, quiet.',
  'Sympathetic, warm.',
  'Disorganized, careless.',
  'Calm, emotionally stable.',
  'Conventional, uncreative.',
] as const;

/** Answer values 1-7. */
export const TIPI_SCALE = [
  { value: 1, label: 'Disagree strongly' },
  { value: 2, label: 'Disagree moderately' },
  { value: 3, label: 'Disagree a little' },
  { value: 4, label: 'Neither agree nor disagree' },
  { value: 5, label: 'Agree a little' },
  { value: 6, label: 'Agree moderately' },
  { value: 7, label: 'Agree strongly' },
] as const;

export type TipiResponse = number | null;
export type TipiTrait = 'extraversion' | 'agreeableness' | 'conscientiousness' | 'emotionalStability' | 'openness';
export type TipiScores = Record<TipiTrait, number | null>;

export const TIPI_TRAITS: { trait: TipiTrait; label: string }[] = [
  { trait: 'extraversion', label: 'Extraversion' },
  { trait: 'agreeableness', label: 'Agreeableness' },
  { trait: 'conscientiousness', label: 'Conscientiousness' },
  { trait: 'emotionalStability', label: 'Emotional stability' },
  { trait: 'openness', label: 'Openness to experiences' },
];

export const emptyTipiResponses = (): TipiResponse[] => Array.from({ length: 10 }, () => null);

const validAnswer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7 ? value : null;

/** Ten answers (null = skipped), whatever was stored. */
export function normalizeTipiResponses(value: unknown): TipiResponse[] {
  const input = Array.isArray(value) ? value : [];
  return Array.from({ length: 10 }, (_, index) => validAnswer(input[index]));
}

/**
 * Scoring: reversed = 8 - answer; each trait is the average of its two items
 * (Extraversion 1, 6R; Agreeableness 2R, 7; Conscientiousness 3, 8R; Emotional stability 4R, 9;
 * Openness 5, 10R). A trait with a missing item is null, never filled with a neutral answer.
 */
export function scoreTipi(responses: TipiResponse[]): TipiScores {
  const item = (n: number) => validAnswer(responses[n - 1]);
  const reversed = (n: number) => {
    const value = item(n);
    return value === null ? null : 8 - value;
  };
  const pair = (a: number | null, b: number | null) => (a === null || b === null ? null : (a + b) / 2);
  return {
    extraversion: pair(item(1), reversed(6)),
    agreeableness: pair(reversed(2), item(7)),
    conscientiousness: pair(item(3), reversed(8)),
    emotionalStability: pair(reversed(4), item(9)),
    openness: pair(item(5), reversed(10)),
  };
}

export const countTipiAnswers = (responses: TipiResponse[]) => responses.filter((value) => validAnswer(value) !== null).length;

export const isTipiComplete = (responses: TipiResponse[]) => responses.length === 10 && countTipiAnswers(responses) === 10;
