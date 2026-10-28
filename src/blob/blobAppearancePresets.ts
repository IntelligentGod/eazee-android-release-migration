/**
 * Central definitions for blob surface + companion key-light tuning.
 * Add new options here, then pass {@link BlobAppearancePresetId} from UI (e.g. via HomeBlob).
 */

/** Values applied to `THREE.MeshPhysicalMaterial` for the marching-cubes blob. */
export type BlobMaterialAppearance = {
  /** Hex or CSS color string */
  color: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
};

/**
 * Key light aimed at the blob (when a directional key exists on the scene).
 * Intensity is split by platform because expo-gl / drivers differ per OS.
 */
export type BlobKeyLightAppearance = {
  position: [number, number, number];
  intensityIos: number;
  intensityAndroid: number;
};

export type BlobAppearancePreset = {
  /** Stable id for storage / analytics (kebab-case recommended). */
  id: string;
  /** User-facing name in pickers / settings. */
  title: string;
  /** Optional longer copy for settings screens or tooltips. */
  description?: string;
  material: BlobMaterialAppearance;
  keyLight: BlobKeyLightAppearance;
};

const liquidGold: BlobAppearancePreset = {
  id: 'liquid-gold',
  title: 'Liquid gold',
  description: 'Warm metallic gold tuned for HDR studio reflections.',
  material: {
    color: '#E0B743',
    metalness: 1.0,
    roughness: 0.3,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.2,
  },
  keyLight: {
    position: [8, 8, 4],
    intensityIos: 1.4,
    intensityAndroid: 2.4,
  },
};

const roseGold: BlobAppearancePreset = {
  id: 'rose-gold',
  title: 'Rose gold',
  description: 'Softer pink-gold with slightly lower metalness so diffuse reads on mobile.',
  material: {
    color: '#D4A08C',
    metalness: 0.88,
    roughness: 0.28,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.35,
  },
  keyLight: {
    position: [7.5, 8.5, 4.2],
    intensityIos: 1.45,
    intensityAndroid: 2.45,
  },
};

const chromeSilver: BlobAppearancePreset = {
  id: 'chrome-silver',
  title: 'Chrome silver',
  description: 'Cool neutral metal; higher env response for mirror-like highlights.',
  material: {
    color: '#C8CCD4',
    metalness: 1.0,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.45,
  },
  keyLight: {
    position: [8.5, 7, 5],
    intensityIos: 1.5,
    intensityAndroid: 2.55,
  },
};

/** Saturated blue metallic — reads clearly as blue under metal + HDR (not teal). */
const sapphireChrome: BlobAppearancePreset = {
  id: 'sapphire-chrome',
  title: 'Sapphire chrome',
  description: 'Deep sapphire blue with chrome-like env response.',
  material: {
    color: '#2d62b8',
    metalness: 0.94,
    roughness: 0.22,
    clearcoat: 0.96,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.4,
  },
  keyLight: {
    position: [8.2, 7.8, 4.6],
    intensityIos: 1.52,
    intensityAndroid: 2.52,
  },
};

/** Deep crimson metallic: saturated red with chrome-like spec (not flat plastic). */
const crimsonMetal: BlobAppearancePreset = {
  id: 'crimson-metal',
  title: 'Crimson metal',
  description: 'Rich crimson metallic between lacquer and satin; nudged toward a brighter metal read.',
  material: {
    color: '#ae1012',
    metalness: 0.935,
    roughness: 0.34,
    clearcoat: 0.74,
    clearcoatRoughness: 0.19,
    envMapIntensity: 1.24,
  },
  keyLight: {
    position: [8.0, 7.6, 4.5],
    intensityIos: 1.54,
    intensityAndroid: 2.58,
  },
};

/** Cool mint green metal: fresh specular read without drifting aqua under HDR. */
const mintChrome: BlobAppearancePreset = {
  id: 'mint-chrome',
  title: 'Mint chrome',
  description: 'Soft mint metallic — slightly green-leaning albedo with chrome-like env response.',
  material: {
    color: '#c2f8c5',
    metalness: 0.93,
    roughness: 0.25,
    clearcoat: 0.96,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.36,
  },
  keyLight: {
    position: [8.2, 8, 4.4],
    intensityIos: 1.46,
    intensityAndroid: 2.48,
  },
};

/** Albedo matched to the Eazee wordmark mint (~#A7EBD5); softer metal than mint-chrome for logo parity. */
const eazeeLogoMint: BlobAppearancePreset = {
  id: 'eazee-logo-mint',
  title: 'Eazee logo mint',
  description: 'Seafoam mint from the brand mark; slightly lower metalness so the base color reads clearly under HDR.',
  material: {
    color: '#A7EBD5',
    metalness: 0.86,
    roughness: 0.3,
    clearcoat: 0.92,
    clearcoatRoughness: 0.09,
    envMapIntensity: 1.2,
  },
  keyLight: {
    position: [8, 8.2, 4.3],
    intensityIos: 1.44,
    intensityAndroid: 2.4,
  },
};

const deepBronze: BlobAppearancePreset = {
  id: 'deep-bronze',
  title: 'Deep bronze',
  description: 'Darker, warmer base with a touch more roughness for a cast-metal read.',
  material: {
    color: '#8B6239',
    metalness: 0.92,
    roughness: 0.38,
    clearcoat: 0.92,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.05,
  },
  keyLight: {
    position: [7, 9, 4],
    intensityIos: 1.55,
    intensityAndroid: 2.65,
  },
};

/** Warm peach–cherry blossom pink: soft, low-chrome metal (home uses this preset). */
const bubblegumPink: BlobAppearancePreset = {
  id: 'peach-blossom',
  title: 'Peach blossom',
  description: 'Warm blush pink (red-leaning albedo so it stays pink, not violet, under metal + HDR).',
  material: {
    color: '#F0B8BE',
    metalness: 0.78,
    roughness: 0.35,
    clearcoat: 0.95,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.14,
  },
  keyLight: {
    position: [7.8, 8.2, 4.2],
    intensityIos: 1.42,
    intensityAndroid: 2.38,
  },
};

/**
 * Near-black metal: not pure #000 so PBR still picks up env/spec hits on phone.
 * Raise `envMapIntensity` if it reads too flat in your scene.
 */
const obsidianBlack: BlobAppearancePreset = {
  id: 'obsidian-black',
  title: 'Obsidian black',
  description: 'Dark metallic black — high metalness and env response with controlled roughness so it reads as metal, not plastic.',
  material: {
    color: '#0f0f12',
    metalness: 0.96,
    roughness: 0.28,
    clearcoat: 0.92,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.48,
  },
  keyLight: {
    position: [8.5, 8, 4.5],
    intensityIos: 1.6,
    intensityAndroid: 2.75,
  },
};

/**
 * All built-in blob looks. Keys are the public ids used in React props.
 */
export const BLOB_APPEARANCE_PRESETS = {
  liquidGold,
  roseGold,
  bubblegumPink,
  obsidianBlack,
  chromeSilver,
  sapphireChrome,
  crimsonMetal,
  mintChrome,
  eazeeLogoMint,
  deepBronze,
} as const satisfies Record<string, BlobAppearancePreset>;

export type BlobAppearancePresetId = keyof typeof BLOB_APPEARANCE_PRESETS;

export const DEFAULT_BLOB_APPEARANCE_ID: BlobAppearancePresetId = 'liquidGold';

export function getBlobAppearancePreset(
  id: BlobAppearancePresetId | string | undefined
): BlobAppearancePreset {
  if (id != null && id in BLOB_APPEARANCE_PRESETS) {
    return BLOB_APPEARANCE_PRESETS[id as BlobAppearancePresetId];
  }
  return BLOB_APPEARANCE_PRESETS[DEFAULT_BLOB_APPEARANCE_ID];
}

export const BLOB_APPEARANCE_PRESET_LIST: readonly BlobAppearancePreset[] = [
  liquidGold,
  roseGold,
  bubblegumPink,
  obsidianBlack,
  chromeSilver,
  sapphireChrome,
  crimsonMetal,
  mintChrome,
  eazeeLogoMint,
  deepBronze,
];
