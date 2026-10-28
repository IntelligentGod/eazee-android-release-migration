import type { BehaviorMetrics } from '@/core/blob/BehaviorMetrics';
import type { BlobMeaningState } from './blobMeaning';
import { clamp01 } from './blobMeaning';

/**
 * Turns task and event pressure into blob shape.
 *
 * The app does not have real health/relationship/work/home/growth signals yet. Until
 * it does, the area fields are treated as unnamed geometric lobe slots: todos/events
 * increase overall pressure, and task completions pull the blob back toward calm.
 */
export function blobMeaningFromBehaviorMetrics(m: BehaviorMetrics): BlobMeaningState {
  const recovery = clamp01(m.completedToday);
  const loadPressure = clamp01(
    0.55 * m.dueSoon +
      0.7 * m.overdue +
      0.35 * m.missedToday
  );

  const balance = clamp01(
    0.9 +
      0.24 * recovery -
      0.46 * loadPressure -
      0.18 * m.missedToday
  );

  const stress = clamp01(
    0.08 +
      0.45 * m.overdue +
      0.34 * m.dueSoon +
      0.32 * m.missedToday -
      0.34 * recovery
  );

  let state: BlobMeaningState['state'];
  if (stress >= 0.62 || m.overdue >= 0.45) {
    state = 'stressed';
  } else if (stress <= 0.28 && balance >= 0.78) {
    state = 'calm';
  } else {
    state = 'normal';
  }

  const lobePressure = clamp01(loadPressure * (1 - recovery * 0.25));
  const areas: BlobMeaningState['areas'] = {
    health: clamp01(lobePressure * 0.76),
    relationships: clamp01(lobePressure * 0.82),
    work: clamp01(lobePressure),
    home: clamp01(lobePressure * 0.9),
    growth: clamp01(lobePressure * 0.7),
  };

  return {
    balance,
    stress,
    state,
    areas,
  };
}
