import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_URL } from '@/config/backend';
import { getAiResponseErrorMessage } from '@/lib/aiAuth';
import { getAiRequestHeaders as getFirebaseHeaders } from '@/lib/aiRequest';

export type HomeSuggestionCandidateKind = 'goal' | 'skillGuide' | 'taskGuide' | 'overdue';

export type HomeSuggestionCandidate = {
  id: string;
  kind: HomeSuggestionCandidateKind;
  openTodoId: string;
  title: string;
  details?: string;
  dueDate?: string;
  plannedDurationMinutes?: number;
  starred?: boolean;
  progress?: { completed: number; total: number };
  activeTodoIds?: string[];
};

export type HomeSuggestion = {
  candidateId: string;
  title: string;
  reason: string;
  confidence: number;
};

export type HomeSuggestionBusyRange = {
  start: Date;
  end: Date;
};

export type HomeSuggestionFreeWindow = {
  start: Date;
  end: Date;
};

export type HomeSuggestionTodayContext = {
  tasks: {
    title: string;
    details?: string;
    dueDate?: string;
    plannedDurationMinutes?: number;
    starred?: boolean;
    overdue?: boolean;
  }[];
  calendar: {
    title: string;
    start: string;
    end: string;
  }[];
};

const REQUIRED_FREE_MINUTES = 180;
const DEFAULT_TASK_DURATION_MINUTES = 45;
const HOME_SUGGESTIONS_MAX_RETRIES = 5;
const HOME_SUGGESTIONS_CACHE_KEY_PREFIX = 'home:suggestions:v1:';

export const getHomeSuggestionsRetryDelay = (retryAttempt: number) =>
  retryAttempt >= 1 && retryAttempt <= HOME_SUGGESTIONS_MAX_RETRIES
    ? Math.min(15_000 * 2 ** (retryAttempt - 1), 120_000)
    : null;

const clampTaskDuration = (value: unknown) => {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0
    ? Math.max(15, Math.min(Math.round(duration), 480))
    : DEFAULT_TASK_DURATION_MINUTES;
};

const mergeBusyRanges = (ranges: HomeSuggestionBusyRange[]) => {
  const sortedRanges = [...ranges].sort((left, right) => left.start.getTime() - right.start.getTime());
  const merged: HomeSuggestionBusyRange[] = [];

  sortedRanges.forEach((range) => {
    const previous = merged[merged.length - 1];
    if (!previous || range.start.getTime() > previous.end.getTime()) {
      merged.push({ start: new Date(range.start), end: new Date(range.end) });
      return;
    }
    if (range.end.getTime() > previous.end.getTime()) {
      previous.end = new Date(range.end);
    }
  });

  return merged;
};

const packUntimedTasksIntoGaps = (
  gaps: HomeSuggestionFreeWindow[],
  durationsMs: number[]
) => {
  const sortedDurations = [...durationsMs].sort((left, right) => right - left);
  const initialRemaining = gaps.map((gap) => gap.end.getTime() - gap.start.getTime());
  const failedStates = new Set<string>();
  let visitedStates = 0;
  const maxVisitedStates = 50_000;

  const search = (taskIndex: number, remaining: number[]): number[] | null => {
    if (taskIndex >= sortedDurations.length) {
      return remaining.some((value) => value >= REQUIRED_FREE_MINUTES * 60_000)
        ? remaining
        : null;
    }
    if (visitedStates >= maxVisitedStates) {
      return null;
    }

    const stateKey = `${taskIndex}:${[...remaining].sort((left, right) => right - left).join(',')}`;
    if (failedStates.has(stateKey)) {
      return null;
    }
    visitedStates += 1;

    const duration = sortedDurations[taskIndex];
    const triedCapacities = new Set<number>();
    for (let gapIndex = 0; gapIndex < remaining.length; gapIndex += 1) {
      const capacity = remaining[gapIndex];
      if (capacity < duration || triedCapacities.has(capacity)) {
        continue;
      }
      triedCapacities.add(capacity);
      const nextRemaining = [...remaining];
      nextRemaining[gapIndex] -= duration;
      const result = search(taskIndex + 1, nextRemaining);
      if (result) {
        return result;
      }
    }

    failedStates.add(stateKey);
    return null;
  };

  const remaining = search(0, initialRemaining);
  if (!remaining) {
    return null;
  }

  return gaps.map((gap, index) => ({
    start: new Date(gap.end.getTime() - remaining[index]),
    end: gap.end,
  }));
};

export const findHomeSuggestionFreeWindow = ({
  now,
  timedBusyRanges,
  untimedTaskDurations,
}: {
  now: Date;
  timedBusyRanges: HomeSuggestionBusyRange[];
  untimedTaskDurations: (number | null | undefined)[];
}): HomeSuggestionFreeWindow | null => {
  const availableStart = new Date(now);
  const horizonEnd = new Date(now);
  horizonEnd.setHours(0, 0, 0, 0);
  horizonEnd.setDate(horizonEnd.getDate() + 2);

  if (availableStart.getTime() >= horizonEnd.getTime()) {
    return null;
  }

  const busyRanges = mergeBusyRanges(
    timedBusyRanges
      .map((range) => ({
        start: new Date(Math.max(range.start.getTime(), availableStart.getTime())),
        end: new Date(Math.min(range.end.getTime(), horizonEnd.getTime())),
      }))
      .filter((range) => range.end.getTime() > range.start.getTime())
  );

  const gaps: HomeSuggestionFreeWindow[] = [];
  let cursor = availableStart.getTime();
  for (const range of busyRanges) {
    if (range.start.getTime() > cursor) {
      gaps.push({ start: new Date(cursor), end: new Date(range.start) });
    }
    cursor = Math.max(cursor, range.end.getTime());
  }
  if (horizonEnd.getTime() > cursor) {
    gaps.push({ start: new Date(cursor), end: horizonEnd });
  }

  const packedGaps = packUntimedTasksIntoGaps(
    gaps,
    untimedTaskDurations.map((durationValue) => clampTaskDuration(durationValue) * 60_000)
  );
  return packedGaps?.find((gap) =>
    gap.end.getTime() - gap.start.getTime() >= REQUIRED_FREE_MINUTES * 60_000
  ) ?? null;
};

const clampConfidence = (value: unknown) => {
  const confidence = Number(value);
  return Number.isFinite(confidence) ? Math.max(0, Math.min(confidence, 1)) : 0;
};

const normalizeText = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';

export const normalizeHomeSuggestions = (
  value: unknown,
  candidates: HomeSuggestionCandidate[]
): HomeSuggestion[] => {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const rawSuggestions = Array.isArray((value as any)?.suggestions) ? (value as any).suggestions : [];
  const suggestions: HomeSuggestion[] = [];
  const seen = new Set<string>();

  for (const rawSuggestion of rawSuggestions) {
    const candidateId = normalizeText(rawSuggestion?.candidateId, 200);
    const candidate = candidatesById.get(candidateId);
    if (!candidate || seen.has(candidateId)) {
      continue;
    }

    const generatedTitle = normalizeText(rawSuggestion?.title, 120);
    const reason = normalizeText(rawSuggestion?.reason, 160);
    if (!reason) {
      continue;
    }

    seen.add(candidateId);
    suggestions.push({
      candidateId,
      title: candidate.kind === 'goal' ? candidate.title : generatedTitle || candidate.title,
      reason,
      confidence: clampConfidence(rawSuggestion?.confidence),
    });

    if (suggestions.length >= 3) {
      break;
    }
  }

  return suggestions;
};

export const requestHomeSuggestions = async (input: {
  candidates: HomeSuggestionCandidate[];
  freeWindow: HomeSuggestionFreeWindow;
  today: HomeSuggestionTodayContext;
}): Promise<HomeSuggestion[]> => {
  const candidates = input.candidates.slice(0, 40).map((candidate) => ({
    ...candidate,
    title: candidate.title.trim().slice(0, 300),
    details: candidate.details?.trim().slice(0, 2000) || undefined,
    plannedDurationMinutes:
      candidate.plannedDurationMinutes && candidate.plannedDurationMinutes > 0
        ? Math.min(candidate.plannedDurationMinutes, 480)
        : undefined,
    activeTodoIds: candidate.activeTodoIds?.slice(0, 12),
  }));
  const response = await fetch(`${SERVER_URL}/ai/home-suggestions`, {
    method: 'POST',
    headers: await getFirebaseHeaders('homeSuggestions'),
    body: JSON.stringify({
      candidates,
      freeWindow: {
        start: input.freeWindow.start.toISOString(),
        end: input.freeWindow.end.toISOString(),
      },
      today: {
        tasks: input.today.tasks.slice(0, 80).map((task) => ({
          ...task,
          title: task.title.trim().slice(0, 300),
          details: task.details?.trim().slice(0, 2000) || undefined,
          plannedDurationMinutes:
            task.plannedDurationMinutes && task.plannedDurationMinutes > 0
              ? Math.min(task.plannedDurationMinutes, 480)
              : undefined,
        })),
        calendar: input.today.calendar.slice(0, 80).map((event) => ({
          ...event,
          title: event.title.trim().slice(0, 300),
        })),
      },
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getAiResponseErrorMessage(payload, response.status));
  }
  return normalizeHomeSuggestions(payload, input.candidates);
};

export const getHomeSuggestionsCacheKey = (userId: string, dayKey: string) =>
  `${HOME_SUGGESTIONS_CACHE_KEY_PREFIX}${userId}:${dayKey}`;

export async function readHomeSuggestionsCache(userId: string, dayKey: string) {
  try {
    const storedValue = await AsyncStorage.getItem(getHomeSuggestionsCacheKey(userId, dayKey));
    const parsed = storedValue ? JSON.parse(storedValue) : null;
    return Array.isArray(parsed?.suggestions) ? parsed.suggestions as HomeSuggestion[] : [];
  } catch {
    return [];
  }
}

export async function writeHomeSuggestionsCache(
  userId: string,
  dayKey: string,
  suggestions: HomeSuggestion[]
) {
  await AsyncStorage.setItem(
    getHomeSuggestionsCacheKey(userId, dayKey),
    JSON.stringify({ suggestions })
  );
}
