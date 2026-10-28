/**
 * State machine for the home Drop (marching-cubes blob) morph targets.
 * Phases are heart-specific today; future targets can mirror this pattern
 * (e.g. morphingToStar / starActive) or share a generic morphingToTarget/targetActive.
 */

export type DropMorphPhase = 'normal' | 'morphingToHeart' | 'heartActive' | 'morphingToBlob';

export type DropMorphState = {
  phase: DropMorphPhase;
  /** Smoothed blend 0 = full blob field, 1 = full heart field contribution */
  heartMorph: number;
  /** Previous completed count (null until first tick; avoids a spurious threshold cross on mount) */
  prevCompletedTasks: number | null;
  /** Clock time (s) when heartActive should end; only set in heartActive */
  heartExitAt: number | null;
};

export const DEFAULT_DROP_MORPH_STATE: DropMorphState = {
  phase: 'normal',
  heartMorph: 0,
  prevCompletedTasks: null,
  heartExitAt: null,
};

export type DropMorphConfig = {
  morphToHeartSeconds: number;
  heartActiveSeconds: number;
  morphToBlobSeconds: number;
};

export const DEFAULT_DROP_MORPH_CONFIG: DropMorphConfig = {
  morphToHeartSeconds: 1.25,
  heartActiveSeconds: 5,
  morphToBlobSeconds: 1.4,
};

const MORPH_EPS = 0.018;

/**
 * Advances morph state from task counts and elapsed clock. Idempotent when inputs are stable.
 */
export function tickDropMorphState(
  prev: DropMorphState,
  input: {
    completedTasksToday: number;
    heartTaskThreshold: number;
    clockElapsed: number;
    delta: number;
  },
  config: DropMorphConfig
): DropMorphState {
  const { completedTasksToday, heartTaskThreshold, clockElapsed, delta } = input;
  const threshold = heartTaskThreshold;

  let { phase, heartMorph, prevCompletedTasks, heartExitAt } = prev;

  const crossedUp =
    prevCompletedTasks != null &&
    prevCompletedTasks < threshold &&
    completedTasksToday >= threshold;

  if (phase === 'normal' && crossedUp) {
    phase = 'morphingToHeart';
  }

  const morphToHeartRate = 1 / Math.max(config.morphToHeartSeconds, 0.05);
  const morphToBlobRate = 1 / Math.max(config.morphToBlobSeconds, 0.05);

  if (phase === 'morphingToHeart') {
    heartMorph = Math.min(1, heartMorph + delta * morphToHeartRate);
    if (heartMorph >= 1 - MORPH_EPS) {
      heartMorph = 1;
      phase = 'heartActive';
      heartExitAt = clockElapsed + config.heartActiveSeconds;
    }
  } else if (phase === 'heartActive') {
    heartMorph = 1;
    if (heartExitAt != null && clockElapsed >= heartExitAt) {
      phase = 'morphingToBlob';
      heartExitAt = null;
    }
  } else if (phase === 'morphingToBlob') {
    heartMorph = Math.max(0, heartMorph - delta * morphToBlobRate);
    if (heartMorph <= MORPH_EPS) {
      heartMorph = 0;
      phase = 'normal';
    }
  } else {
    heartMorph = 0;
  }

  return {
    phase,
    heartMorph,
    prevCompletedTasks: completedTasksToday,
    heartExitAt,
  };
}
