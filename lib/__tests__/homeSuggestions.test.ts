import {
  findHomeSuggestionFreeWindow,
  getHomeSuggestionsRetryDelay,
  normalizeHomeSuggestions,
  type HomeSuggestionCandidate,
} from '@/lib/homeSuggestions';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('@/firebaseConfig', () => ({
  auth: {
    currentUser: null,
  },
}));

const at = (hour: number, minute = 0) => new Date(2026, 5, 14, hour, minute, 0, 0);

const candidates: HomeSuggestionCandidate[] = [
  {
    id: 'goal-1',
    kind: 'goal',
    openTodoId: 'root-goal',
    title: 'Continue Learn guitar',
  },
  {
    id: 'overdue-1',
    kind: 'overdue',
    openTodoId: 'todo-1',
    title: 'File taxes',
  },
];

describe('home suggestions', () => {
  it('caps failed-request retries after five attempts', () => {
    expect(getHomeSuggestionsRetryDelay(1)).toBe(15_000);
    expect(getHomeSuggestionsRetryDelay(5)).toBe(120_000);
    expect(getHomeSuggestionsRetryDelay(6)).toBeNull();
  });

  it('checks free time from now through tomorrow', () => {
    expect(findHomeSuggestionFreeWindow({
      now: at(1),
      timedBusyRanges: [{ start: at(4), end: at(21) }],
      untimedTaskDurations: [],
    })).toEqual({ start: at(1), end: at(4) });
  });

  it('still finds free time after 9 PM', () => {
    expect(findHomeSuggestionFreeWindow({
      now: at(22),
      timedBusyRanges: [],
      untimedTaskDurations: [],
    })).toEqual({ start: at(22), end: at(48) });
  });

  it('keeps the empty-tail end stable across minute ticks', () => {
    const firstWindow = findHomeSuggestionFreeWindow({
      now: at(22),
      timedBusyRanges: [],
      untimedTaskDurations: [],
    });
    const nextWindow = findHomeSuggestionFreeWindow({
      now: at(22, 1),
      timedBusyRanges: [],
      untimedTaskDurations: [],
    });

    expect(firstWindow?.end).toEqual(nextWindow?.end);
  });

  it('packs untimed tasks into earliest gaps without changing source data', () => {
    const durations = [45, 60];
    const window = findHomeSuggestionFreeWindow({
      now: at(9),
      timedBusyRanges: [
        { start: at(11), end: at(12) },
        { start: at(16), end: at(18) },
      ],
      untimedTaskDurations: durations,
    });

    expect(durations).toEqual([45, 60]);
    expect(window).toEqual({ start: at(12), end: at(16) });
  });

  it('packs untimed tasks independently of their input order', () => {
    const input = {
      now: at(0),
      timedBusyRanges: [
        { start: at(4), end: at(5) },
        { start: at(8), end: at(9) },
        { start: at(12), end: at(21) },
      ],
    };

    expect(findHomeSuggestionFreeWindow({
      ...input,
      untimedTaskDurations: [180, 240],
    })).toEqual({ start: at(9), end: at(12) });
    expect(findHomeSuggestionFreeWindow({
      ...input,
      untimedTaskDurations: [240, 180],
    })).toEqual({ start: at(9), end: at(12) });
  });

  it('requires one continuous 180-minute block', () => {
    expect(findHomeSuggestionFreeWindow({
      now: at(9),
      timedBusyRanges: [
        { start: at(11), end: at(12) },
        { start: at(14), end: at(15) },
        { start: at(17), end: at(18) },
        { start: at(20), end: at(21) },
        { start: at(23), end: at(24) },
        { start: at(26), end: at(27) },
        { start: at(29), end: at(30) },
        { start: at(32), end: at(33) },
        { start: at(35), end: at(36) },
        { start: at(38), end: at(39) },
        { start: at(41), end: at(42) },
        { start: at(44), end: at(45) },
        { start: at(47), end: at(48) },
      ],
      untimedTaskDurations: [],
    })).toBeNull();
  });

  it('uses 45 minutes for unknown untimed task durations', () => {
    expect(findHomeSuggestionFreeWindow({
      now: at(17),
      timedBusyRanges: [],
      untimedTaskDurations: [undefined],
    })).toEqual({ start: at(17, 45), end: at(48) });
  });

  it('returns no free block when untimed tasks cannot be packed', () => {
    expect(findHomeSuggestionFreeWindow({
      now: at(17),
      timedBusyRanges: [{ start: at(20), end: at(48) }],
      untimedTaskDurations: [300],
    })).toBeNull();
  });

  it('rejects invented ids, dedupes, caps, and fixes goal titles', () => {
    expect(normalizeHomeSuggestions({
      suggestions: [
        { candidateId: 'goal-1', title: 'Do hidden action', reason: 'Build momentum', confidence: 0.8 },
        { candidateId: 'goal-1', title: 'Duplicate', reason: 'Duplicate', confidence: 0.7 },
        { candidateId: 'invented', title: 'Invented', reason: 'Bad', confidence: 1 },
        { candidateId: 'overdue-1', title: 'Finish filing taxes', reason: 'It is overdue', confidence: 2 },
      ],
    }, candidates)).toEqual([
      {
        candidateId: 'goal-1',
        title: 'Continue Learn guitar',
        reason: 'Build momentum',
        confidence: 0.8,
      },
      {
        candidateId: 'overdue-1',
        title: 'Finish filing taxes',
        reason: 'It is overdue',
        confidence: 1,
      },
    ]);
  });
});
