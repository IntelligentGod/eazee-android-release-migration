/**
 * Conceptual model for the 3D blob: life balance and stress map onto
 * shape (sphericity, lobes) and motion (ripples).
 *
 * - Spherical blob = balanced life (all areas in harmony, no single area
 *   dominating or neglected).
 * - Protruding lobes = pressure in specific life areas; higher area value
 *   means more pressure / neglect / imbalance in that area.
 * - Calm = no ripples (life feels stable).
 * - Normal = slight ripples (moderate flux).
 * - Stressed = obvious ripples (agitation, visible unrest).
 */

/** All numeric values are normalized 0..1 */
export type LifeAreas = {
  /** Higher = more pressure / neglect / imbalance in health */
  health: number
  /** Higher = more pressure / neglect / imbalance in relationships */
  relationships: number
  /** Higher = more pressure / neglect / imbalance in work */
  work: number
  /** Higher = more pressure / neglect / imbalance in home */
  home: number
  /** Higher = more pressure / neglect / imbalance in growth */
  growth: number
}

export type BlobStateName = "calm" | "normal" | "stressed"

export type BlobMeaningState = {
  /** Higher = life more integrated and spherical (less lobe protrusion) */
  balance: number
  /** Higher = more agitation / visible ripples on the blob */
  stress: number
  /** Per-area pressure; drives lobe shape (protrusions) */
  areas: LifeAreas
  /** Drives ripple intensity: calm = none, normal = slight, stressed = obvious */
  state: BlobStateName
  /** When true, mesh omits lobe metaballs for a sphere (see `suppressLobes` in visual meaning). */
  suppressLobes?: boolean
}

export type BlobVisualMeaning = {
  sphericality: number
  rippleAmp: number
  rippleSpeed: number
  areaLobes: {
    health: number
    relationships: number
    work: number
    home: number
    growth: number
  }
  suppressLobes: boolean
}

/** Canonical calm-balanced preset; visual lobe outputs never exceed those from this state. */
export const CALM_BALANCED: BlobMeaningState = {
  balance: 0.95,
  stress: 0.08,
  state: "calm",
  areas: {
    health: 0.08,
    relationships: 0.1,
    work: 0.12,
    home: 0.1,
    growth: 0.14,
  },
}

/** Clamp a number to [0, 1]. */
export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function projectedAreaLobes(input: BlobMeaningState): BlobVisualMeaning["areaLobes"] {
  const w = 1.1 - input.balance * 0.45
  return {
    health: clamp01(input.areas.health * w),
    relationships: clamp01(input.areas.relationships * w),
    work: clamp01(input.areas.work * w),
    home: clamp01(input.areas.home * w),
    growth: clamp01(input.areas.growth * w),
  }
}

const AREA_LOBE_VISUAL_MAX = projectedAreaLobes(CALM_BALANCED)

/**
 * Upper bound for `effectiveLobe` in BlobMesh (metaball lobe strength) matching the
 * calm-balanced silhouette: same formula as the smoothness-above-0.92 branch there,
 * using the strongest projected area lobe from {@link CALM_BALANCED}.
 */
export const MAX_EFFECTIVE_LOBE_CALM_BALANCED = (() => {
  const p = AREA_LOBE_VISUAL_MAX
  const maxV = Math.max(p.health, p.relationships, p.work, p.home, p.growth)
  return (0.4 + 0.6 * maxV) * 0.28
})()

/**
 * Compute visual parameters for the blob from conceptual state.
 * - sphericality: from balance (mostly), decreases a bit with stress
 * - areaLobes: area pressure → protrusion, slightly suppressed by balance
 * - rippleAmp / rippleSpeed: by state (calm / normal / stressed)
 */
export function computeBlobVisualMeaning(input: BlobMeaningState): BlobVisualMeaning {
  let sphericality = clamp01(input.balance * 0.92 + (1 - input.stress) * 0.22 - 0.12)
  if (input.state === "calm" && input.balance > 0.85) {
    sphericality = Math.max(sphericality, 0.96)
  }

  const suppressLobes = input.suppressLobes === true
  const projected = projectedAreaLobes(input)
  const areaLobes = suppressLobes
    ? { health: 0, relationships: 0, work: 0, home: 0, growth: 0 }
    : {
        health: Math.min(projected.health, AREA_LOBE_VISUAL_MAX.health),
        relationships: Math.min(projected.relationships, AREA_LOBE_VISUAL_MAX.relationships),
        work: Math.min(projected.work, AREA_LOBE_VISUAL_MAX.work),
        home: Math.min(projected.home, AREA_LOBE_VISUAL_MAX.home),
        growth: Math.min(projected.growth, AREA_LOBE_VISUAL_MAX.growth),
      }

  let rippleAmp: number
  let rippleSpeed: number
  switch (input.state) {
    case "calm":
      rippleAmp = 0
      rippleSpeed = 0
      break
    case "normal":
      rippleAmp = 0.12 + input.stress * 0.08
      rippleSpeed = 0.25 + input.stress * 0.15
      break
    case "stressed":
      rippleAmp = 0.32 + input.stress * 0.18
      rippleSpeed = 0.5 + input.stress * 0.25
      break
  }

  return {
    sphericality,
    rippleAmp,
    rippleSpeed,
    areaLobes,
    suppressLobes,
  }
}
