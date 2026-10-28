import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_URL } from '@/config/backend';
import { auth } from '@/firebaseConfig';
import { getFirebaseAppCheckHeaders } from '@/lib/firebaseAppCheck';
import {
  AGE_RANGE_OPTIONS,
  ANSWER_STYLE_OPTIONS,
  FOCUS_AREA_OPTIONS,
  INTEREST_OPTIONS,
  MBTI_SOURCE_OPTIONS,
  MBTI_TYPES,
  ORGANISE_STYLE_OPTIONS,
  PERSONALITY_ROUTE_OPTIONS,
  STUCK_HELP_OPTIONS,
  TONE_OPTIONS,
  USE_FOR_OPTIONS,
  WORK_SITUATION_OPTIONS,
  labelFor,
  type AboutMe,
  type AssistantPreferences,
  type MbtiType,
  type Option,
  type PersonalityRoute,
} from './questions';
import {
  TIPI_INSTRUMENT_VERSION,
  countTipiAnswers,
  emptyTipiResponses,
  isTipiComplete,
  normalizeTipiResponses,
  scoreTipi,
  type TipiResponse,
  type TipiScores,
} from './tipi';

/**
 * The "Get to know me" profile. The server keeps the saved copy (so it follows the account
 * to every device); this device caches it for chat requests and keeps an unsaved draft
 * separately until the user taps Save.
 */

export type BigFiveTrait = { name: string; score: number; unit: 'percentile' | 'percent' | 'scale'; scaleMax?: number };

export type Assessment =
  | { kind: 'tipi'; instrumentVersion: string; responses: TipiResponse[]; completedAt?: number | null; scores?: TipiScores; complete?: boolean }
  | { kind: 'mbti'; type: MbtiType; identity?: 'A' | 'T'; source: '16personalities' | 'mbti' | 'other'; dateTaken?: string; selfReported?: true }
  | { kind: 'big_five'; testName: string; traits: BigFiveTrait[]; dateTaken?: string; selfReported?: true }
  | { kind: 'other'; testName: string; resultText: string; dateTaken?: string; selfReported?: true };

export type PersonalisationControls = { aboutMe: boolean; preferences: boolean; personality: boolean };
export type FieldMeta = Record<string, { source: 'questionnaire' | 'settings'; updatedAt: number }>;

/** Which joke the user saved or shared; never the image, and never sent to the AI. */
export type SavedShareCard = {
  themeId: string;
  humour: 'gentle' | 'cheeky';
  captionIndex: number;
  basis: 'tipi' | 'mbti' | 'big_five';
  savedAt?: number;
};

export type AboutMeProfile = {
  about_me: AboutMe;
  assistant_preferences: AssistantPreferences;
  personality_route?: PersonalityRoute | null;
  personality_assessments: { active: Assessment | null };
  personalisation_controls: PersonalisationControls;
  field_meta: FieldMeta;
  share_card?: SavedShareCard | null;
  updatedAt?: number;
};

export const DEFAULT_CONTROLS: PersonalisationControls = { aboutMe: true, preferences: true, personality: true };

export const EMPTY_ABOUT_ME_PROFILE: AboutMeProfile = {
  about_me: {},
  assistant_preferences: {},
  personality_route: null,
  personality_assessments: { active: null },
  personalisation_controls: DEFAULT_CONTROLS,
  field_meta: {},
};

// ---------- normalising ----------

const pick = <T extends string>(options: readonly Option<string>[], value: unknown): T | undefined =>
  typeof value === 'string' && options.some((option) => option.value === value) ? (value as T) : undefined;

const pickMany = <T extends string>(options: readonly Option<string>[], value: unknown, max: number): T[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const picked = Array.from(new Set(value.filter((item) => options.some((option) => option.value === item)))).slice(0, max);
  return picked.length ? (picked as T[]) : undefined;
};

const text = (value: unknown, max: number) => {
  const trimmed = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return trimmed || undefined;
};

const dateTaken = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(value) ? value : undefined);

/** Drops empty and unknown values, so what is saved is exactly what the server accepts. */
export function cleanAboutMe(value: unknown): AboutMe {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const result: AboutMe = {
    ageRange: pick(AGE_RANGE_OPTIONS, input.ageRange),
    workSituations: pickMany(WORK_SITUATION_OPTIONS, input.workSituations, 3),
    workText: text(input.workText, 120),
    interests: pickMany(INTEREST_OPTIONS, input.interests, 5),
    customInterests: text(input.customInterests, 120),
    useFor: pickMany(USE_FOR_OPTIONS, input.useFor, USE_FOR_OPTIONS.length),
    focusAreas: pickMany(FOCUS_AREA_OPTIONS, input.focusAreas, 2),
    goalText: text(input.goalText, 200),
  };
  return Object.fromEntries(Object.entries(result).filter(([, item]) => item !== undefined)) as AboutMe;
}

export function cleanAssistantPreferences(value: unknown): AssistantPreferences {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const result: AssistantPreferences = {
    answerStyle: pick(ANSWER_STYLE_OPTIONS, input.answerStyle),
    tone: pick(TONE_OPTIONS, input.tone),
    organiseStyle: pick(ORGANISE_STYLE_OPTIONS, input.organiseStyle),
    stuckHelp: pick(STUCK_HELP_OPTIONS, input.stuckHelp),
  };
  return Object.fromEntries(Object.entries(result).filter(([, item]) => item !== undefined)) as AssistantPreferences;
}

export function cleanBigFiveTraits(value: unknown): BigFiveTrait[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const trait = (item || {}) as Partial<BigFiveTrait>;
      const name = text(trait.name, 40);
      const score = typeof trait.score === 'number' && Number.isFinite(trait.score) && trait.score >= 0 && trait.score <= 1000 ? trait.score : null;
      const unit = trait.unit === 'percentile' || trait.unit === 'percent' || trait.unit === 'scale' ? trait.unit : null;
      if (!name || score === null || !unit) return null;
      const scaleMax = unit === 'scale' && typeof trait.scaleMax === 'number' && trait.scaleMax > 0 && trait.scaleMax <= 1000
        ? trait.scaleMax
        : undefined;
      return { name, score, unit, ...(scaleMax ? { scaleMax } : {}) };
    })
    .filter((item): item is BigFiveTrait => !!item)
    .slice(0, 10);
}

export function normalizeAssessment(value: unknown): Assessment | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, any>;
  if (input.kind === 'tipi') {
    const responses = normalizeTipiResponses(input.responses);
    return {
      kind: 'tipi',
      instrumentVersion: TIPI_INSTRUMENT_VERSION,
      responses,
      completedAt: typeof input.completedAt === 'number' ? input.completedAt : null,
      scores: scoreTipi(responses),
      complete: isTipiComplete(responses),
    };
  }
  if (input.kind === 'mbti' && MBTI_TYPES.includes(input.type)) {
    return {
      kind: 'mbti',
      type: input.type,
      ...(input.identity === 'A' || input.identity === 'T' ? { identity: input.identity } : {}),
      source: pick(MBTI_SOURCE_OPTIONS, input.source) ?? 'other',
      ...(dateTaken(input.dateTaken) ? { dateTaken: input.dateTaken } : {}),
      selfReported: true,
    };
  }
  if (input.kind === 'big_five') {
    const testName = text(input.testName, 80);
    const traits = cleanBigFiveTraits(input.traits);
    if (!testName || !traits.length) return null;
    return { kind: 'big_five', testName, traits, ...(dateTaken(input.dateTaken) ? { dateTaken: input.dateTaken } : {}), selfReported: true };
  }
  if (input.kind === 'other') {
    const testName = text(input.testName, 80);
    const resultText = text(input.resultText, 400);
    if (!testName || !resultText) return null;
    return { kind: 'other', testName, resultText, ...(dateTaken(input.dateTaken) ? { dateTaken: input.dateTaken } : {}), selfReported: true };
  }
  return null;
}

/** The assessment as the server accepts it: without the scores and labels the server adds. */
export function toAssessmentInput(assessment: Assessment): Assessment {
  if (assessment.kind === 'tipi') {
    return {
      kind: 'tipi',
      instrumentVersion: TIPI_INSTRUMENT_VERSION,
      responses: normalizeTipiResponses(assessment.responses),
      ...(typeof assessment.completedAt === 'number' ? { completedAt: assessment.completedAt } : {}),
    };
  }
  const { selfReported: _selfReported, ...rest } = assessment;
  return rest as Assessment;
}

export function normalizeAboutMeProfile(value: unknown): AboutMeProfile {
  if (!value || typeof value !== 'object') return EMPTY_ABOUT_ME_PROFILE;
  const input = value as Record<string, any>;
  const controls = input.personalisation_controls || {};
  const meta: FieldMeta = {};
  for (const [key, item] of Object.entries(input.field_meta || {})) {
    const entry = item as FieldMeta[string];
    if (entry && (entry.source === 'questionnaire' || entry.source === 'settings') && typeof entry.updatedAt === 'number') meta[key] = entry;
  }
  return {
    about_me: cleanAboutMe(input.about_me),
    assistant_preferences: cleanAssistantPreferences(input.assistant_preferences),
    personality_route: pick<PersonalityRoute>(PERSONALITY_ROUTE_OPTIONS, input.personality_route) ?? null,
    personality_assessments: { active: normalizeAssessment(input.personality_assessments?.active) },
    personalisation_controls: {
      aboutMe: controls.aboutMe !== false,
      preferences: controls.preferences !== false,
      personality: controls.personality !== false,
    },
    field_meta: meta,
    share_card: normalizeShareCard(input.share_card),
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : undefined,
  };
}

function normalizeShareCard(value: unknown): SavedShareCard | null {
  const card = (value && typeof value === 'object' ? value : null) as Partial<SavedShareCard> | null;
  if (!card || typeof card.themeId !== 'string' || !/^[a-z0-9_]{1,40}$/.test(card.themeId)) return null;
  if (card.humour !== 'gentle' && card.humour !== 'cheeky') return null;
  if (card.basis !== 'tipi' && card.basis !== 'mbti' && card.basis !== 'big_five') return null;
  const captionIndex = typeof card.captionIndex === 'number' && Number.isInteger(card.captionIndex) ? Math.min(20, Math.max(0, card.captionIndex)) : 0;
  return { themeId: card.themeId, humour: card.humour, captionIndex, basis: card.basis, savedAt: typeof card.savedAt === 'number' ? card.savedAt : undefined };
}

export const hasAboutMeContent = (profile: AboutMeProfile | null | undefined) =>
  !!profile && (
    Object.keys(profile.about_me).length > 0
    || Object.keys(profile.assistant_preferences).length > 0
    || !!profile.personality_assessments.active
  );

// ---------- server + cache ----------

const CACHE_PREFIX = 'aboutMeProfile:v1:';
const listeners = new Set<(profile: AboutMeProfile | null, userId: string) => void>();
const notify = (profile: AboutMeProfile | null, userId: string) => listeners.forEach((listener) => listener(profile, userId));

async function profileRequest(method: 'GET' | 'PUT' | 'DELETE', body?: unknown, path = '') {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (!idToken) throw new Error('Sign in to use your profile.');
  const response = await fetch(`${SERVER_URL}/profile/about-me${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...await getFirebaseAppCheckHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  // A 404 means a server without this feature; its "Not Found" text means nothing to the user.
  if (!response.ok) {
    throw new Error(response.status !== 404 && typeof json?.error === 'string' ? `${json.error}.` : 'Could not reach Eazee.');
  }
  return json;
}

/** The copy on this device; used for chat requests so a reply never waits on the network. */
export async function readCachedAboutMeProfile(userId?: string | null): Promise<AboutMeProfile | null> {
  if (!userId) return null;
  try {
    const stored = await AsyncStorage.getItem(`${CACHE_PREFIX}${userId}`);
    return stored ? normalizeAboutMeProfile(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

async function writeCache(userId: string, profile: AboutMeProfile | null) {
  if (profile) await AsyncStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(profile));
  else await AsyncStorage.removeItem(`${CACHE_PREFIX}${userId}`);
  notify(profile, userId);
}

/** Loads the saved profile from the server (changes made on another device) into the cache. */
export async function refreshAboutMeProfile(userId?: string | null): Promise<AboutMeProfile | null> {
  if (!userId) return null;
  const json = await profileRequest('GET');
  if (auth.currentUser?.uid !== userId) return null;
  const profile = json?.profile ? normalizeAboutMeProfile(json.profile) : null;
  await writeCache(userId, profile);
  return profile;
}

export async function saveAboutMeProfile(userId: string, profile: AboutMeProfile): Promise<AboutMeProfile> {
  const active = profile.personality_assessments.active;
  const json = await profileRequest('PUT', {
    about_me: cleanAboutMe(profile.about_me),
    assistant_preferences: cleanAssistantPreferences(profile.assistant_preferences),
    ...(profile.personality_route ? { personality_route: profile.personality_route } : {}),
    personality_assessments: { active: active ? toAssessmentInput(active) : null },
    personalisation_controls: profile.personalisation_controls,
    field_meta: profile.field_meta,
  });
  const saved = normalizeAboutMeProfile(json?.profile);
  await writeCache(userId, saved);
  return saved;
}

/** Saves which card the user kept; a failure here never affects the profile or chat. */
export async function saveShareCard(userId: string, card: Omit<SavedShareCard, 'savedAt'>) {
  const json = await profileRequest('PUT', card, '/share-card');
  const saved = normalizeShareCard(json?.share_card);
  const cached = await readCachedAboutMeProfile(userId);
  if (cached) await writeCache(userId, { ...cached, share_card: saved });
  return saved;
}

export async function deleteShareCard(userId: string) {
  await profileRequest('DELETE', undefined, '/share-card');
  const cached = await readCachedAboutMeProfile(userId);
  if (cached) await writeCache(userId, { ...cached, share_card: null });
}

/** Deletes the whole profile everywhere. */
export async function deleteAboutMeProfile(userId: string) {
  await profileRequest('DELETE');
  await writeCache(userId, null);
  await AsyncStorage.removeItem(`${DRAFT_PREFIX}${userId}`).catch(() => {});
}

export function subscribeAboutMeProfile(listener: (profile: AboutMeProfile | null, userId: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------- chat ----------

/** The enabled, filled-in parts of the profile for a chat request (the server writes the prompt). */
export function buildAboutMeChatContext(profile: AboutMeProfile | null | undefined) {
  if (!profile) return undefined;
  const controls = profile.personalisation_controls;
  const aboutMe = controls.aboutMe ? cleanAboutMe(profile.about_me) : {};
  const preferences = controls.preferences ? cleanAssistantPreferences(profile.assistant_preferences) : {};
  const active = controls.personality ? profile.personality_assessments.active : null;
  // An unfinished test is never used as a result.
  const personality = active && !(active.kind === 'tipi' && !isTipiComplete(active.responses)) ? toAssessmentInput(active) : null;
  const context = {
    ...(Object.keys(aboutMe).length ? { about_me: aboutMe } : {}),
    ...(Object.keys(preferences).length ? { assistant_preferences: preferences } : {}),
    ...(personality ? { personality } : {}),
  };
  return Object.keys(context).length ? context : undefined;
}

// ---------- drafts ----------

const DRAFT_PREFIX = 'aboutMeDraft:v1:';

export type ImportedResultDraft = {
  mbtiType?: MbtiType;
  mbtiIdentity?: 'A' | 'T';
  mbtiSource?: '16personalities' | 'mbti' | 'other';
  testName?: string;
  pastedText?: string;
  traits?: BigFiveTrait[];
  resultText?: string;
  dateTaken?: string;
};

export type AboutMeDraft = {
  about_me: AboutMe;
  assistant_preferences: AssistantPreferences;
  personality_route?: PersonalityRoute;
  imported: ImportedResultDraft;
  tipi: TipiResponse[];
  /** Fields answered in this draft (not skipped); they get new timestamps on save. */
  answered: string[];
  step: string;
  entry: 'chat' | 'settings';
  updatedAt: number;
};

/** A new draft, prefilled with what is already saved so nothing is lost by skipping. */
export function createAboutMeDraft(
  existing: AboutMeProfile | null,
  options: { entry: 'chat' | 'settings'; savedGoalTitle?: string | null; savedPreferences?: AssistantPreferences }
): AboutMeDraft {
  const about = { ...(existing?.about_me ?? {}) };
  // A goal saved in the first chat is offered for confirmation instead of asking from scratch.
  if (!about.goalText && options.savedGoalTitle) about.goalText = options.savedGoalTitle.slice(0, 200);
  const active = existing?.personality_assessments.active ?? null;
  return {
    about_me: about,
    assistant_preferences: { ...(options.savedPreferences ?? {}), ...(existing?.assistant_preferences ?? {}) },
    personality_route: existing?.personality_route ?? undefined,
    imported: active?.kind === 'mbti'
      ? { mbtiType: active.type, mbtiIdentity: active.identity, mbtiSource: active.source, dateTaken: active.dateTaken }
      : active?.kind === 'big_five'
        ? { testName: active.testName, traits: active.traits, dateTaken: active.dateTaken }
        : active?.kind === 'other'
          ? { testName: active.testName, resultText: active.resultText, dateTaken: active.dateTaken }
          : {},
    tipi: active?.kind === 'tipi' ? normalizeTipiResponses(active.responses) : emptyTipiResponses(),
    answered: [],
    step: 'intro',
    entry: options.entry,
    updatedAt: Date.now(),
  };
}

export async function readAboutMeDraft(userId?: string | null): Promise<AboutMeDraft | null> {
  if (!userId) return null;
  try {
    const stored = await AsyncStorage.getItem(`${DRAFT_PREFIX}${userId}`);
    if (!stored) return null;
    const draft = JSON.parse(stored) as AboutMeDraft;
    return { ...draft, tipi: normalizeTipiResponses(draft.tipi), answered: Array.isArray(draft.answered) ? draft.answered : [] };
  } catch {
    return null;
  }
}

export async function writeAboutMeDraft(userId: string, draft: AboutMeDraft) {
  await AsyncStorage.setItem(`${DRAFT_PREFIX}${userId}`, JSON.stringify({ ...draft, updatedAt: Date.now() })).catch(() => {});
}

export async function clearAboutMeDraft(userId: string) {
  await AsyncStorage.removeItem(`${DRAFT_PREFIX}${userId}`).catch(() => {});
}

/** The personality result the draft describes, or the saved one when that part was skipped. */
export function getDraftAssessment(draft: AboutMeDraft, existing: Assessment | null, now = Date.now()): Assessment | null {
  const imported = draft.imported;
  switch (draft.personality_route) {
    case 'test':
      if (!countTipiAnswers(draft.tipi)) return existing;
      return {
        kind: 'tipi',
        instrumentVersion: TIPI_INSTRUMENT_VERSION,
        responses: draft.tipi,
        completedAt: isTipiComplete(draft.tipi) ? now : null,
        scores: scoreTipi(draft.tipi),
        complete: isTipiComplete(draft.tipi),
      };
    case 'mbti':
      return imported.mbtiType
        ? normalizeAssessment({ kind: 'mbti', type: imported.mbtiType, identity: imported.mbtiIdentity, source: imported.mbtiSource, dateTaken: imported.dateTaken })
        : existing;
    case 'big_five':
      return normalizeAssessment({ kind: 'big_five', testName: imported.testName, traits: imported.traits, dateTaken: imported.dateTaken }) ?? existing;
    case 'other':
      return normalizeAssessment({ kind: 'other', testName: imported.testName, resultText: imported.resultText, dateTaken: imported.dateTaken }) ?? existing;
    default:
      return existing;
  }
}

/** The profile to save from a reviewed draft. Skipped questions keep what was saved before. */
export function buildProfileFromDraft(
  existing: AboutMeProfile | null,
  draft: AboutMeDraft,
  controls: PersonalisationControls,
  now = Date.now()
): AboutMeProfile {
  const meta: FieldMeta = { ...(existing?.field_meta ?? {}) };
  for (const field of draft.answered) meta[field] = { source: draft.entry === 'settings' && existing ? 'settings' : 'questionnaire', updatedAt: now };
  return {
    about_me: cleanAboutMe(draft.about_me),
    assistant_preferences: cleanAssistantPreferences(draft.assistant_preferences),
    personality_route: draft.personality_route ?? existing?.personality_route ?? null,
    personality_assessments: { active: getDraftAssessment(draft, existing?.personality_assessments.active ?? null, now) },
    personalisation_controls: controls,
    field_meta: meta,
  };
}

// ---------- Big Five paste ----------

const BIG_FIVE_NAMES = /(openness|intellect|conscientiousness|extraversion|extroversion|agreeableness|neuroticism|emotional stability)/i;

/**
 * Reads lines like "Openness: 72%" or "Neuroticism 3.1 / 5" from a pasted result. The values are
 * shown for review before anything is saved; nothing is converted between scales.
 */
export function parseBigFiveText(pasted: string): BigFiveTrait[] {
  const traits: BigFiveTrait[] = [];
  for (const line of pasted.split(/\r?\n|;/)) {
    const nameMatch = line.match(BIG_FIVE_NAMES);
    if (!nameMatch) continue;
    const rest = line.slice((nameMatch.index ?? 0) + nameMatch[0].length);
    const numberMatch = rest.match(/(\d+(?:\.\d+)?)\s*(%|(?:st|nd|rd|th)?\s*percentile|\/\s*(\d+(?:\.\d+)?)|out of\s*(\d+(?:\.\d+)?))?/i);
    if (!numberMatch) continue;
    const score = Number(numberMatch[1]);
    const suffix = (numberMatch[2] || '').toLowerCase();
    const scaleMax = Number(numberMatch[3] || numberMatch[4]);
    const unit: BigFiveTrait['unit'] = suffix.includes('percentile') ? 'percentile' : suffix === '%' ? 'percent' : 'scale';
    const name = nameMatch[0].charAt(0).toUpperCase() + nameMatch[0].slice(1).toLowerCase();
    if (traits.some((trait) => trait.name === name)) continue;
    traits.push({ name, score, unit, ...(unit === 'scale' && scaleMax > 0 ? { scaleMax } : {}) });
  }
  return cleanBigFiveTraits(traits);
}

// ---------- what changes ----------

const joinList = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** "I'll keep answers short, suggest flexible priority lists and …", from what was actually saved. */
export function describeAboutMeChanges(profile: AboutMeProfile): string {
  const changes: string[] = [];
  const prefs = profile.personalisation_controls.preferences ? profile.assistant_preferences : {};
  const about = profile.personalisation_controls.aboutMe ? profile.about_me : {};
  const answer = { short: 'keep answers short', step_by_step: 'show you things step by step', detailed: 'explain the reasoning in more detail' };
  const tone = { warm: 'keep things warm and encouraging', direct: 'be direct and straightforward', calm: 'keep a calm, professional tone', playful: 'keep it playful' };
  const organise = { schedule: 'suggest plans as a clear schedule', priority_list: 'suggest flexible priority lists', one_step: 'give you one next step at a time' };
  const stuck = {
    smaller_step: 'make the next step smaller when you’re stuck',
    talk_through: 'help you talk things through when you’re stuck',
    recommendation: 'give you a clear recommendation when you’re stuck',
    options: 'show you a few options when you’re stuck',
    remind_why: 'remind you why the goal matters when you’re stuck',
  };
  if (prefs.answerStyle && prefs.answerStyle in answer) changes.push(answer[prefs.answerStyle as keyof typeof answer]);
  if (prefs.tone && prefs.tone in tone) changes.push(tone[prefs.tone as keyof typeof tone]);
  if (prefs.organiseStyle && prefs.organiseStyle in organise) changes.push(organise[prefs.organiseStyle as keyof typeof organise]);
  if (prefs.stuckHelp) changes.push(stuck[prefs.stuckHelp]);
  if (about.workText) changes.push(`use examples relevant to your work or study (“${about.workText.replace(/[.!?]+$/, '')}”) when helpful`);
  else if (about.interests?.length) {
    const interest = labelFor(INTEREST_OPTIONS, about.interests.find((item) => item !== 'other'))?.toLowerCase();
    if (interest) changes.push(`use examples from ${interest} when they fit`);
  }
  if (about.goalText) changes.push('keep your goal in mind when it’s relevant');
  if (!changes.length) return 'Saved. I’ll use this when it’s relevant, and you can change it any time in Settings.';
  const sentence = `I’ll ${joinList(changes.slice(0, 4))}.`;
  return `${sentence} You can change this any time in Settings.`;
}

// ---------- invitation ----------

const INVITE_PREFIX = 'aboutMeInvite:v1:';
/** The invitation appears in at most this many chats, and never again after "Maybe later". */
export const ABOUT_ME_INVITE_MAX_CHATS = 3;

export type AboutMeInviteState = { status: 'new' | 'dismissed' | 'accepted'; sessionIds: string[] };

export async function readAboutMeInviteState(userId?: string | null): Promise<AboutMeInviteState> {
  if (!userId) return { status: 'dismissed', sessionIds: [] };
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(`${INVITE_PREFIX}${userId}`)) || 'null');
    return {
      status: stored?.status === 'dismissed' || stored?.status === 'accepted' ? stored.status : 'new',
      sessionIds: Array.isArray(stored?.sessionIds) ? stored.sessionIds.filter((id: unknown) => typeof id === 'string') : [],
    };
  } catch {
    return { status: 'new', sessionIds: [] };
  }
}

export async function writeAboutMeInviteState(userId: string, state: AboutMeInviteState) {
  await AsyncStorage.setItem(`${INVITE_PREFIX}${userId}`, JSON.stringify(state)).catch(() => {});
}

export const canShowAboutMeInvite = (state: AboutMeInviteState, sessionId: string | null | undefined) =>
  state.status === 'new'
  && !!sessionId
  && (state.sessionIds.includes(sessionId) || state.sessionIds.length < ABOUT_ME_INVITE_MAX_CHATS);

// ---------- saved preferences ----------

/** The existing saved preferences these answers correspond to, kept in step on save. */
export function toSavedPreferenceValues(prefs: AssistantPreferences) {
  const values: { field: 'responseLength' | 'planStyle' | 'detail'; value: string }[] = [];
  if (prefs.answerStyle === 'short' || prefs.answerStyle === 'detailed') values.push({ field: 'responseLength', value: prefs.answerStyle });
  if (prefs.organiseStyle === 'schedule') values.push({ field: 'planStyle', value: 'timed' });
  if (prefs.organiseStyle === 'priority_list') values.push({ field: 'planStyle', value: 'flexible' });
  if (prefs.organiseStyle === 'one_step') values.push({ field: 'detail', value: 'one_step' });
  return values;
}

/** Prefills Q7/Q9 from saved preferences the user already has. */
export function fromSavedPreferenceValues(saved: { field: string; value: string }[]): AssistantPreferences {
  const prefs: AssistantPreferences = {};
  for (const item of saved) {
    if (item.field === 'responseLength' && (item.value === 'short' || item.value === 'detailed')) prefs.answerStyle = item.value;
    if (item.field === 'planStyle') prefs.organiseStyle = item.value === 'timed' ? 'schedule' : 'priority_list';
    if (item.field === 'detail' && item.value === 'one_step' && !prefs.organiseStyle) prefs.organiseStyle = 'one_step';
  }
  return prefs;
}

// ---------- analytics (counts only) ----------

export type AboutMeAnalyticsEvent =
  | 'invite_shown' | 'invite_accepted' | 'invite_dismissed' | 'flow_started' | 'question_skipped'
  | 'test_completed' | 'test_incomplete' | 'profile_saved' | 'profile_discarded' | 'profile_deleted'
  | 'card_saved' | 'share_sheet_opened';

export function trackAboutMeEvent(
  event: AboutMeAnalyticsEvent,
  props: { entry?: 'chat' | 'settings'; route?: PersonalityRoute; question?: string } = {}
) {
  void (async () => {
    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    if (!idToken) return;
    await fetch(`${SERVER_URL}/analytics/about-me`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        'X-Eazee-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        ...await getFirebaseAppCheckHeaders(),
      },
      body: JSON.stringify({ event, props: Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined)) }),
    });
  })().catch(() => {});
}
