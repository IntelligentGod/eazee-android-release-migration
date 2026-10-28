// Bursts represent very recent productive action.
// They should always decay over time so they feel temporary,
// and are capped so the blob never becomes visually chaotic.
const SMALL_TASK_BURST = 0.05;
const NORMAL_TASK_BURST = 0.09;
const IMPORTANT_TASK_BURST = 0.16;
const OVERDUE_IMPORTANT_TASK_BURST = 0.22;

const MAX_BURST_FLOW = 0.5;

// burstFlow should fade slowly over time so that recent task completions
// temporarily increase droplet activity for a few minutes, then settle back
// toward the baseline productivity flow.
const BURST_DECAY_PER_SECOND = 0.025;

export type ProductivityFlowState = {
  baseFlow: number;
  burstFlow: number;
  finalFlow: number;
};

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function computeProductivityFlow(input: {
  normalizedTasksCompletedToday: number;
  normalizedImportantTasksCompletedToday: number;
  completionStreakToday: number;
  currentBurstFlow: number;
}): ProductivityFlowState {
  /**
   * baseFlow: overall productive momentum for the day.
   * It blends how many tasks you've completed, how many of them were important,
   * and how consistently you've been completing them today.
   */
  const baseFlowUnclamped =
    0.45 * input.normalizedTasksCompletedToday +
    0.30 * input.normalizedImportantTasksCompletedToday +
    0.25 * input.completionStreakToday;
  const baseFlow = clamp01(baseFlowUnclamped);

  /**
   * burstFlow: temporary short‑term energy after recent task completion.
   * This is a fast‑moving signal that can spike briefly when you finish
   * something, then decay over time.
   */
  const burstFlow = clamp01(input.currentBurstFlow);

  /**
   * finalFlow: what should drive droplets.
   *
   * Droplets should represent productive momentum, not raw busyness.
   * finalFlow combines the slow, structural baseFlow with the short‑term
   * burstFlow so that having a healthy, steady day of progress feels
   * different from a frantic burst of shallow activity.
   */
  const finalFlow = clamp01(baseFlow + burstFlow);

  return {
    baseFlow,
    burstFlow,
    finalFlow,
  };
}

export function addTaskBurst(
  currentBurstFlow: number,
  taskType: 'small' | 'normal' | 'important' | 'overdueImportant'
): number {
  /**
   * small tasks produce small bursts, while important or overdue tasks
   * produce larger bursts. This burstFlow is temporary and should later
   * decay, but while it is active it will temporarily increase droplet
   * activity to reflect a short‑term spike in productive momentum.
   */
  let burst = 0;

  if (taskType === 'small') burst = SMALL_TASK_BURST;
  if (taskType === 'normal') burst = NORMAL_TASK_BURST;
  if (taskType === 'important') burst = IMPORTANT_TASK_BURST;
  if (taskType === 'overdueImportant') burst = OVERDUE_IMPORTANT_TASK_BURST;

  const nextBurst = Math.min(MAX_BURST_FLOW, currentBurstFlow + burst);
  return nextBurst;
}

export function decayBurstFlow(
  currentBurstFlow: number,
  dtSeconds: number
): number {
  /**
   * dtSeconds is the elapsed time in seconds since the last update.
   * Decay is smooth and deterministic, and burstFlow is clamped so it
   * never dips below 0.
   */
  const nextBurst = Math.max(0, currentBurstFlow - dtSeconds * BURST_DECAY_PER_SECOND);
  return nextBurst;
}



