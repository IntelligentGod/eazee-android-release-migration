import { CALM_BALANCED, type BlobMeaningState } from "./blobMeaning"

/**
 * Preset BlobMeaningStates for demos and tests.
 * Keys are scenario names; values drive sphericality, area lobes, and ripples.
 */
export const BLOB_SCENARIOS: Record<string, BlobMeaningState> = {
  /** Ideal day: balanced areas; sphere only (no lobe metaballs). */
  perfect: {
    balance: 1,
    stress: 0.02,
    state: "calm",
    areas: {
      health: 0.06,
      relationships: 0.06,
      work: 0.06,
      home: 0.06,
      growth: 0.06,
    },
    suppressLobes: true,
  },

  /** Nearly spherical, no ripples; defines max visual lobe size (see `computeBlobVisualMeaning`). */
  calmBalanced: CALM_BALANCED,

  /** Work lobe sticks out; blob is stressed with obvious ripples and less spherical. */
  workOverload: {
    balance: 0.45,
    stress: 0.72,
    state: "stressed",
    areas: {
      health: 0.25,
      relationships: 0.2,
      work: 0.95,
      home: 0.35,
      growth: 0.3,
    },
  },

  /** Health lobe prominent; moderate ripples, normal state. */
  neglectedHealth: {
    balance: 0.52,
    stress: 0.48,
    state: "normal",
    areas: {
      health: 0.95,
      relationships: 0.22,
      work: 0.28,
      home: 0.25,
      growth: 0.3,
    },
  },

  /** Relationships lobe prominent; moderate ripples, normal state. */
  neglectedRelationships: {
    balance: 0.5,
    stress: 0.46,
    state: "normal",
    areas: {
      health: 0.2,
      relationships: 0.95,
      work: 0.34,
      home: 0.24,
      growth: 0.32,
    },
  },

  /** Many lobes (all areas high), very stressed with strong ripples; blob looks uneven and agitated. */
  messyLife: {
    balance: 0.22,
    stress: 0.86,
    state: "stressed",
    areas: {
      health: 0.78,
      relationships: 0.76,
      work: 0.82,
      home: 0.74,
      growth: 0.7,
    },
  },
}
