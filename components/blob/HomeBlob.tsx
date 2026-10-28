import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Constants from 'expo-constants';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import {
  MAX_EFFECTIVE_LOBE_CALM_BALANCED,
  type BlobVisualMeaning,
} from '@/src/blob/blobMeaning';
import {
  DEFAULT_DROP_MORPH_CONFIG,
  DEFAULT_DROP_MORPH_STATE,
  type DropMorphConfig,
  type DropMorphPhase,
  type DropMorphState,
  tickDropMorphState,
} from '@/src/blob/dropMorphState';
import { contributeHeartMorphField } from '@/src/blob/dropMorphHeartField';
import {
  DEFAULT_BLOB_APPEARANCE_ID,
  getBlobAppearancePreset,
  type BlobAppearancePresetId,
} from '@/src/blob/blobAppearancePresets';
import BlobFace, { type MoodState } from '@/components/blob/BlobFace';
import Crown2Mesh from '@/components/blob/Crown2Mesh';
import HeroCapeMesh from '@/components/blob/HeroCapeMesh';
import ThroneMesh from '@/components/blob/ThroneMesh';

import { guardExpoGlShaderLogs } from '@/lib/expoGlGuards';
type BlobCanvasProps = React.ComponentProps<typeof Canvas> & {
  dpr?: number | readonly [number, number];
};

const BlobCanvas = Canvas as React.ComponentType<BlobCanvasProps>;
const BASE64_ENCODING = 'base64' as const;

export type BlobMood = 'calm' | 'normal' | 'stressed';

export type LifeArea =
  | 'sleep'
  | 'work'
  | 'relationships'
  | 'health'
  | 'money'
  | 'growth'
  | 'home';

export const LIFE_AREAS: { key: LifeArea; label: string; dir: [number, number, number] }[] = [
  { key: 'sleep', label: 'Sleep', dir: [0, 1, 0] },
  { key: 'work', label: 'Work', dir: [1, 0, 0] },
  { key: 'relationships', label: 'Relationships', dir: [-1, 0, 0] },
  { key: 'health', label: 'Health', dir: [0, -1, 0] },
  { key: 'money', label: 'Money', dir: [0, 0, 1] },
  { key: 'growth', label: 'Growth', dir: [0, 0, -1] },
  { key: 'home', label: 'Home', dir: [Math.SQRT1_2, 0, Math.SQRT1_2] },
];

type MoodPreset = {
  distort: number;
  speed: number;
  roughness: number;
  metalness: number;
  clearcoat: number;
  emissiveIntensity: number;
  breatheAmp: number;
  bobAmp: number;
  bobSpeed: number;
  rotSpeed: number;
  ambientIntensity: number;
  keyIntensity: number;
};

const MOOD_PRESETS: Record<BlobMood, MoodPreset> = {
  calm: {
    distort: 0.25,
    speed: 1.0,
    roughness: 0.18,
    metalness: 0.05,
    clearcoat: 0.9,
    emissiveIntensity: 0.08,
    breatheAmp: 0.03,
    bobAmp: 1 / 10,
    bobSpeed: 1 / 2,
    rotSpeed: 0.03,
    ambientIntensity: 1.1,
    keyIntensity: 1.4,
  },
  normal: {
    distort: 0.4,
    speed: 2.0,
    roughness: 0.1,
    metalness: 0.1,
    clearcoat: 1,
    emissiveIntensity: 0.15,
    breatheAmp: 0.04,
    bobAmp: 1 / 6,
    bobSpeed: 1 / 1.5,
    rotSpeed: 0.05,
    ambientIntensity: 1.2,
    keyIntensity: 1.8,
  },
  stressed: {
    distort: 0.6,
    speed: 3.0,
    roughness: 0.06,
    metalness: 0.18,
    clearcoat: 1,
    emissiveIntensity: 0.22,
    breatheAmp: 0.06,
    bobAmp: 1 / 4.5,
    bobSpeed: 1 / 1.1,
    rotSpeed: 0.09,
    ambientIntensity: 1.3,
    keyIntensity: 2.2,
  },
};

/**
 * Scales `MOOD_PRESETS.breatheAmp` into the mesh/face scale pulse (`breathe = 1 + sin * …`).
 * Was 1.65; ~2× stronger breathing motion.
 */
const BREATHE_VISUAL_AMP_MUL = 3.3;

/**
 * Wall-clock seconds from minimum scale (1 − amp) to maximum (1 + amp) for `breathe = 1 + sin·amp`.
 * Uses `clock.elapsedTime` so timing is stable across frame rate and mood.
 * Full in–out–in cycle = 2 × this value.
 */
const BREATHE_MIN_TO_MAX_SEC = 5;
const BREATHE_RAD_PER_SEC = Math.PI / BREATHE_MIN_TO_MAX_SEC;

type MutableMoodPreset = {
  [K in keyof MoodPreset]: number;
};

type AreaIntensities = Record<LifeArea, number>;

export type BlobMeshVisualProps = {
  rippleAmp: number;
  rippleFreq: number;
  rippleSpeed: number;
  smoothness: number;
  /** Smoothly lerped in mesh; at 1 all lobe-field contributions are off. */
  suppressLobes?: boolean;
  lobes: {
    health: number;
    relationships: number;
    work: number;
    home: number;
    growth: number;
    sleep: number;
  };
};

/** Life-area keys for the 6 lobe directions (order matches LOBE_DIRECTIONS). */
const LIFE_AREA_LOBE_KEYS = ['health', 'relationships', 'work', 'home', 'growth', 'sleep'] as const;
type LifeAreaLobeKey = (typeof LIFE_AREA_LOBE_KEYS)[number];

function normalizeDir(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Fixed, normalized direction vectors for the 6 life-area lobes.
 * Spread around the blob to avoid clustering. Do not randomize.
 * Coordinate convention: +Y up, +X right, +Z forward.
 */
/** Raw Y bump for arm rays: pure XZ reads as mid-body; ears already have high Y from dir. */
const ARM_LOBE_Y = 0.14;

const LOBE_DIRECTIONS: Record<LifeAreaLobeKey, [number, number, number]> = {
  health:        normalizeDir([-0.5,  0.85,  0.5]),  // upper-left-front (ear)
  relationships: normalizeDir([ 0.5,  0.85,  0.5]),  // upper-right-front (ear)
  work:          normalizeDir([ 0.92, ARM_LOBE_Y, 0.38]), // right arm (slight +Y: sag + equator read “too low”)
  sleep:         normalizeDir([-0.92, ARM_LOBE_Y, 0.38]), // left arm
  home:          normalizeDir([-0.45,-0.80,  0.30]), // lower-left-forward (left leg)
  growth:        normalizeDir([ 0.45,-0.80,  0.30]), // lower-right-forward (right leg)
};

function _detectEmulatorEarly(): boolean {
  const name = (Constants.deviceName ?? '').toLowerCase();
  return name.includes('sdk') || name.includes('emulator') || name.includes('generic');
}
const _IS_EMULATOR = _detectEmulatorEarly();

/** Android and iOS should match the Android emulator reference look. */
const BLOB_REFERENCE_LOOK = Platform.OS === 'android' || Platform.OS === 'ios';
const BLOB_ANDROID_RUNTIME_ROOM_ENVIRONMENT = Platform.OS === 'android' && _IS_EMULATOR;
// The emulator loads the same baked reflection as phones: building it live needs float render
// targets, which some emulator GPU translators (e.g. Intel UHD) can't do, leaving the gold black.
const BLOB_BAKED_ROOM_ENVIRONMENT = Platform.OS === 'android' || Platform.OS === 'ios';
/** Kept for non-reference mobile paths. Android and iOS now use the reference look instead. */
const BLOB_ANDROID_DEVICE_CONTRAST = Platform.OS === 'android' && !BLOB_REFERENCE_LOOK;

/**
 * Marching-cubes grid edge length. Cost scales roughly with RES³ (field + polygonize).
 * Keep mobile under 30³; 34³ looked good but made Home visibly laggy on-device.
 */
const RES = BLOB_REFERENCE_LOOK ? 22 : 20;
/** Iso level (tuned for 34³; 28–30³ left on same value — tweak if the iso-surface thins). */
const ISO = 56.75;
/** Upper bound on generated triangles. Lower caps avoid needless allocation on mobile. */
const MC_MAX_POLYS = BLOB_REFERENCE_LOOK ? 48_000 : 36_000;
const BLOB_FIELD_TARGET_FPS = 8;
const BLOB_FIELD_UPDATE_INTERVAL_SEC = 1 / BLOB_FIELD_TARGET_FPS;
const BLOB_PERF_LOGS = false;
const BLOB_CANVAS_DPR = [1, 1] as const;
const BLOB_MAX_ANIMATION_DELTA_SEC = 1 / 20;
/**
 * Where GL is drawn on the CPU (the iOS simulator), a frame takes far longer than frames are
 * queued, so a backlog grows and the screen only ever shows stale frames without the droplet.
 * Each frame first waits for the previous one; after the probe frames this stops if GL keeps up.
 */
const GL_BACKPRESSURE_PROBE_FRAMES = 30;
const GL_BACKPRESSURE_SLOW_FRAME_MS = 8;
const CORE_STRENGTH = 1.15;
const CHILD_COUNT = 8;
/** Slightly farther from centre → less field overlap with core (clearer lobes). */
const CHILD_OFFSET = 1.02 * 1.6;
const MARGIN = 0.44 * 1.6;
/** Metaball strength scale for all six lobes (size / prominence vs core). */
const LOBE_FIELD_SCALE = 1.3;
/**
 * Each lobe’s metaball chain scales by an irregular pulse (multi-sine); magnitudes are
 * normalized each frame so the six lobes average ~1 — silhouette shifts without global inflate.
 * Peak swing is two thirds of the original 0.52 tuning (between “half” and full).
 */
const LOBE_PULSE_AMP = (0.52 * 2) / 3;
/** Max Euler component (rad) for slow irregular lobe-ray “orbit”; scaled by blobWeight. ~0.1 ≈ 6°. */
const LOBE_ROT_AMP_RAD = 0.1;
/** Lobe chain length in MC space (not in volume mass estimate; avoids compensation hiding it). */
const LOBE_RADIAL_SCALE = 1.08;
/**
 * Extends lobe placement along each ray (tips stick out farther). Kept separate from
 * volume bookkeeping so MC scale compensation does not shrink the mesh when lobes get stronger.
 */
const LOBE_REACH_MUL = 1 + (LOBE_FIELD_SCALE - 1) * 0.42;
/** Outer core ball — still scales with lobe pressure (defines blend into lobes). */
const CORE_METABALL_MUL = 9;
/** Extra fixed center ball — fuller middle only; does not shrink when lobes extend. */
const CORE_INNER_BUMP_MUL = 3.35;
const DRIFT = 0.05;
const MARGIN_GRID = 0.12;
const HONEY_SAG = 0.06;
const MOTION_SPEED = 3.3;
const MOTION_SMOOTH_STEPS = 50;

/**
 * Live-tweakable marching-cubes / field values (surface tint lives in `blobAppearancePresets.ts`).
 */
// Blob surface tint + key-light: `@/src/blob/blobAppearancePresets` (`appearancePresetId` on BlobMesh).

/**
 * Tiny equirectangular gradient used to seed PMREM as the scene env map.
 * Replaces RoomEnvironment, which renders an internal scene and falls over on
 * expo-gl Android. DataTexture → PMREM.fromEquirectangular is RGBA8 in, so the
 * only float work is PMREM's blur — reliable across drivers.
 *
 * Palette: warm sky at the top (off-white → soft gold), darker warm-grey floor.
 * Tuned to make `MeshPhysicalMaterial` reads as liquid gold under direct lights.
 */
/**
 * Procedural HDR "studio room" equirect — half-float texture so softbox values can go well
 * above 1.0 (key softbox ~8.0, fills ~4.5). That dynamic range is what makes metallic
 * reflections read as real lit gold instead of painted clay: the bright highlights must
 * actually be much brighter than the surrounding surface, which 8-bit LDR can't do.
 * RoomEnvironment on the emulator works for the same reason — its emissive boxes are HDR.
 */
export function buildStudioRoomEquirect(): THREE.DataTexture {
  const w = 256;
  const h = 128;
  const data = new Uint16Array(w * h * 4);

  // Linear-space base — subtly warm cream so broad reflections on the gold carry a hint of
  // warm color (not saturated; just a cream-tinted neutral). RoomEnvironment does this same
  // thing through indirect bouncing of its slightly warm emissive boxes onto its gray walls.
  const ceilingBase = [0.92, 0.88, 0.82];
  const wallBase = [0.80, 0.76, 0.70];
  const floorBase = [0.32, 0.28, 0.24];

  // HDR softboxes — brightness in linear units, intentionally well above 1.0.
  type Box = { u: number; v: number; w: number; h: number; r: number; g: number; b: number };
  const boxes: Box[] = [
    { u: 0.50, v: 0.10, w: 0.14, h: 0.05, r: 9.0, g: 9.0, b: 8.4 }, // key softbox — top center, bright
    { u: 0.20, v: 0.24, w: 0.10, h: 0.07, r: 5.5, g: 5.4, b: 5.0 }, // left fill
    { u: 0.80, v: 0.24, w: 0.10, h: 0.07, r: 5.5, g: 5.4, b: 5.0 }, // right fill
    { u: 0.05, v: 0.42, w: 0.06, h: 0.05, r: 4.2, g: 3.2, b: 1.9 }, // back warm rim
    { u: 0.95, v: 0.42, w: 0.06, h: 0.05, r: 2.4, g: 2.6, b: 3.8 }, // far cool rim
    { u: 0.35, v: 0.46, w: 0.05, h: 0.03, r: 3.0, g: 2.9, b: 2.6 }, // small accent
    { u: 0.65, v: 0.46, w: 0.05, h: 0.03, r: 3.0, g: 2.9, b: 2.6 }, // small accent
  ];

  const lerp3 = (a: number[], b: number[], t: number) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const toHalf = THREE.DataUtils.toHalfFloat;

  for (let j = 0; j < h; j++) {
    const v = j / (h - 1);
    let base: number[];
    if (v < 0.45) {
      base = lerp3(ceilingBase, wallBase, v / 0.45);
    } else if (v < 0.7) {
      base = wallBase;
    } else {
      base = lerp3(wallBase, floorBase, (v - 0.7) / 0.3);
    }
    for (let i = 0; i < w; i++) {
      const u = i / (w - 1);
      let addR = 0, addG = 0, addB = 0;
      for (const box of boxes) {
        let du = u - box.u;
        if (du > 0.5) du -= 1;
        if (du < -0.5) du += 1;
        const dv = v - box.v;
        const fall = Math.exp(-Math.pow(du / box.w, 2)) * Math.exp(-Math.pow(dv / box.h, 2));
        addR += (box.r - base[0]) * fall;
        addG += (box.g - base[1]) * fall;
        addB += (box.b - base[2]) * fall;
      }
      const idx = (j * w + i) * 4;
      data[idx] = toHalf(base[0] + addR);
      data[idx + 1] = toHalf(base[1] + addG);
      data[idx + 2] = toHalf(base[2] + addB);
      data[idx + 3] = toHalf(1);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  // HDR textures are linear-space, not sRGB.
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

function buildWarmGradientEquirect(): THREE.DataTexture {
  const w = 256;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  // Symmetric "lit from above and below": bright gold sky at top, bright gold underglow at
  // bottom, darker amber equator in between. The blob's top hemisphere reflects the sky and
  // the bottom hemisphere reflects the underglow — both read as gold. The mid band gives the
  // equator a touch of darker contrast so the surface still reads as a mirror, not a flat tint.
  const poleBright = [255, 235, 195];  // pale warm cream — both poles
  const poleHigh = [255, 215, 130];    // saturated warm gold near both poles
  const equatorMid = [180, 135, 55];   // warm amber band around the equator
  const equatorDark = [120, 85, 32];   // darker amber right at the equator

  const lerp3 = (a: number[], b: number[], t: number) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];

  for (let j = 0; j < h; j++) {
    const v = j / (h - 1);
    // Distance from the nearest pole (0 = at a pole, 0.5 = equator).
    const fromPole = Math.min(v, 1 - v);
    let col: number[];
    if (fromPole < 0.15) {
      col = lerp3(poleBright, poleHigh, fromPole / 0.15);
    } else if (fromPole < 0.4) {
      col = lerp3(poleHigh, equatorMid, (fromPole - 0.15) / 0.25);
    } else {
      col = lerp3(equatorMid, equatorDark, (fromPole - 0.4) / 0.1);
    }
    for (let i = 0; i < w; i++) {
      const u = i / (w - 1);
      // Upper sun — strong specular hotspot, top-right of the sky.
      const sunTop =
        Math.exp(-Math.pow((u - 0.58) * 9, 2)) * Math.exp(-Math.pow((v - 0.16) * 9, 2));
      // Lower sun — mirror highlight in the underglow so reflections come from both directions.
      const sunBot =
        Math.exp(-Math.pow((u - 0.32) * 9, 2)) * Math.exp(-Math.pow((v - 0.84) * 9, 2));
      // Soft fill on the opposite side of each sun, wider/dimmer, prevents single-hotspot look.
      const fillUpper =
        Math.exp(-Math.pow((u - 0.2) * 3.2, 2)) * Math.exp(-Math.pow((v - 0.3) * 4, 2));
      const fillLower =
        Math.exp(-Math.pow((u - 0.72) * 3.2, 2)) * Math.exp(-Math.pow((v - 0.7) * 4, 2));
      const r = col[0] + (sunTop + sunBot) * 90 + (fillUpper + fillLower) * 28;
      const g = col[1] + (sunTop + sunBot) * 70 + (fillUpper + fillLower) * 22;
      const b = col[2] + (sunTop + sunBot) * 30 + (fillUpper + fillLower) * 8;
      const idx = (j * w + i) * 4;
      data[idx] = Math.min(255, Math.round(r));
      data[idx + 1] = Math.min(255, Math.round(g));
      data[idx + 2] = Math.min(255, Math.round(b));
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  // DataTexture defaults to flipY=false, which puts row 0 of our pixel array (the bright sky)
  // at the BOTTOM of the sphere. Flip it so j=0 lands on the +Y pole as intended.
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const btoaFn: (s: string) => string =
    (globalThis as { btoa?: (s: string) => string }).btoa ??
    (global as { btoa?: (s: string) => string }).btoa!;
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoaFn(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const atobFn: (s: string) => string =
    (globalThis as { atob?: (s: string) => string }).atob ??
    (global as { atob?: (s: string) => string }).atob!;
  const binary = atobFn(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type BakedRoomEnvironmentPmremMetadata = {
  ready?: boolean;
  width: number;
  height: number;
  type: number;
  format: number;
  mapping: number;
  colorSpace: string;
  byteLength: number;
};

function isBlankHalfFloatRgba(bytes: Uint8Array): boolean {
  const values = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const stride = Math.max(4, Math.floor(values.length / 4096) * 4);
  for (let i = 0; i < values.length; i += stride) {
    if (values[i] !== 0 || values[i + 1] !== 0 || values[i + 2] !== 0) {
      return false;
    }
  }
  return true;
}

async function loadBakedRoomEnvironmentPmremTexture(): Promise<THREE.DataTexture | null> {
  const metadata =
    require('../../assets/room-env-pmrem-android-emulator-rgba16f.json') as BakedRoomEnvironmentPmremMetadata;
  if (metadata.ready === false || !metadata.width || !metadata.height || !metadata.byteLength) {
    console.log('[blob][baked-env] emulator-baked PMREM asset not ready; keeping fallback environment');
    return null;
  }
  const asset = Asset.fromModule(require('../../assets/room-env-pmrem-android-emulator-rgba16f.bin'));
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) return null;

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: BASE64_ENCODING,
  });
  const bytes = base64ToUint8Array(base64);
  if (metadata.byteLength !== bytes.byteLength) {
    console.log('[blob][baked-env] baked PMREM byteLength mismatch', {
      expected: metadata.byteLength,
      actual: bytes.byteLength,
    });
    return null;
  }
  if (isBlankHalfFloatRgba(bytes)) {
    console.log('[blob][baked-env] baked PMREM is blank; keeping fallback environment');
    return null;
  }

  const texture = new THREE.DataTexture(
    new Uint16Array(bytes.buffer),
    metadata.width,
    metadata.height,
    metadata.format as THREE.PixelFormat,
    metadata.type as THREE.TextureDataType
  );
  texture.mapping = metadata.mapping as THREE.Mapping;
  texture.colorSpace = metadata.colorSpace as THREE.ColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  console.log('[blob][baked-env] loaded baked RoomEnvironment PMREM', {
    width: metadata.width,
    height: metadata.height,
    byteLength: bytes.byteLength,
    mapping: texture.mapping,
    type: texture.type,
  });
  return texture;
}

async function bakeRoomEnvironmentPmrem(gl: THREE.WebGLRenderer) {
  if (!BLOB_ANDROID_RUNTIME_ROOM_ENVIRONMENT) {
    console.log('[pmrem bake] skipped: bake from the Android emulator/simulator, not a physical device');
    return;
  }

  const pmrem = new THREE.PMREMGenerator(gl);
  const roomEnvironment = new RoomEnvironment();
  let rt: THREE.WebGLRenderTarget | null = null;

  try {
    rt = pmrem.fromScene(roomEnvironment, 0.02);
    const pixels = new Uint16Array(rt.width * rt.height * 4);
    gl.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, pixels);
    const bytes = new Uint8Array(pixels.buffer);
    if (isBlankHalfFloatRgba(bytes)) {
      console.log('[pmrem bake] failed: generated PMREM is blank');
      return;
    }
    const base64 = uint8ArrayToBase64(bytes);
    const binUri = `${FileSystem.documentDirectory}room-env-pmrem-android-emulator-rgba16f.bin`;
    const metaUri = `${FileSystem.documentDirectory}room-env-pmrem-android-emulator-rgba16f.json`;
    const metadata = {
      width: rt.width,
      height: rt.height,
      type: rt.texture.type,
      format: rt.texture.format,
      mapping: rt.texture.mapping,
      colorSpace: rt.texture.colorSpace,
      byteLength: bytes.byteLength,
      arrayType: 'Uint16Array',
      textureTypeName: 'HalfFloatType',
      generatedAt: new Date().toISOString(),
    };

    await FileSystem.writeAsStringAsync(binUri, base64, {
      encoding: BASE64_ENCODING,
    });
    await FileSystem.writeAsStringAsync(metaUri, JSON.stringify(metadata, null, 2));

    console.log('[pmrem bake] saved RoomEnvironment PMREM', {
      binUri,
      metaUri,
      ...metadata,
    });
  } catch (err) {
    console.log('[pmrem bake] failed', err);
  } finally {
    rt?.dispose();
    roomEnvironment.dispose();
    pmrem.dispose();
  }
}

function clampToGrid(px: number, py: number, pz: number): [number, number, number] {
  const m = MARGIN_GRID;
  return [
    THREE.MathUtils.clamp(px, m, 1 - m),
    THREE.MathUtils.clamp(py, m, 1 - m),
    THREE.MathUtils.clamp(pz, m, 1 - m),
  ];
}

/** Irregular swell/shrink factor for one lobe index (mean of six factors ~ 1 after normalize). */
function lobePulseRawFactor(index: number, t: number, amp: number): number {
  const p =
    0.52 * Math.sin(t * (0.34 + index * 0.079) + index * 2.17) +
    0.33 * Math.sin(t * (0.69 + index * 0.12) + index * 1.53 + 2.08) +
    0.15 * Math.sin(t * (1.01 + index * 0.058) + 0.91);
  return 1 + amp * THREE.MathUtils.clamp(p, -1, 1);
}

function normalizedLobePulseMultipliers(t: number, amp: number): number[] {
  const raw = LIFE_AREA_LOBE_KEYS.map((_, i) => lobePulseRawFactor(i, t, amp));
  const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
  const inv = mean > 1e-8 ? 1 / mean : 1;
  return raw.map(v => v * inv);
}

/** Irregular small Euler angles per lobe (multi-sine), radians. */
function lobeRotEulerRad(index: number, t: number, amp: number): [number, number, number] {
  const px =
    0.48 * Math.sin(t * (0.27 + index * 0.061) + index * 1.73) +
    0.32 * Math.sin(t * (0.51 + index * 0.095) + index * 2.31 + 1.4) +
    0.2 * Math.sin(t * (0.88 + index * 0.044) + 0.62);
  const py =
    0.45 * Math.sin(t * (0.29 + index * 0.073) + index * 2.1 + 0.8) +
    0.35 * Math.sin(t * (0.62 + index * 0.088) + 1.9) +
    0.2 * Math.sin(t * (0.95 + index * 0.051) + index * 0.7);
  const pz =
    0.42 * Math.sin(t * (0.24 + index * 0.069) + index * 1.55 + 2.2) +
    0.38 * Math.sin(t * (0.58 + index * 0.102) + 0.35) +
    0.2 * Math.sin(t * (0.91 + index * 0.048) + index * 2.8);
  return [
    amp * THREE.MathUtils.clamp(px, -1, 1),
    amp * THREE.MathUtils.clamp(py, -1, 1),
    amp * THREE.MathUtils.clamp(pz, -1, 1),
  ];
}

/** Same composition as typical XYZ Euler on a vector: R = Rz * Ry * Rx. */
function rotateVecEulerXYZ(
  vx: number,
  vy: number,
  vz: number,
  rx: number,
  ry: number,
  rz: number
): [number, number, number] {
  const cx = Math.cos(rx),
    sx = Math.sin(rx);
  const y1 = vy * cx - vz * sx;
  const z1 = vy * sx + vz * cx;
  const x1 = vx;
  const cy = Math.cos(ry),
    sy = Math.sin(ry);
  const x2 = x1 * cy + z1 * sy;
  const z2 = -x1 * sy + z1 * cy;
  const y2 = y1;
  const cz = Math.cos(rz),
    sz = Math.sin(rz);
  const x3 = x2 * cz - y2 * sz;
  const y3 = x2 * sz + y2 * cz;
  const z3 = z2;
  return [x3, y3, z3];
}

const CHILD_DIRS: [number, number, number][] = [
  [0.9, 0.2, 0.3],
  [-0.3, 0.85, -0.4],
  [-0.4, -0.5, 0.75],
  [0.6, -0.5, -0.6],
  [0.2, 0.7, 0.65],
  [-0.65, -0.3, -0.65],
  [0.5, -0.7, 0.4],
  [-0.5, 0.3, -0.8],
];

const LOBE_SIZE_SCALE = [1.1, 0.85, 0.95, 1.0, 0.75, 0.9, 0.7, 0.8];

const DEFAULT_VISUAL: BlobMeshVisualProps = {
  rippleAmp: 0,
  rippleFreq: 18,
  rippleSpeed: 1,
  smoothness: 0.5,
  lobes: {
    health: 1,
    relationships: 1,
    work: 1,
    home: 1,
    growth: 1,
    sleep: 1,
  },
};

/**
 * Scales `uRippleTime` / tap clock into the surface shader: same ripple math, slower phase = thicker liquid.
 * (Does not change marching-cubes metaball timing.)
 */
const RIPPLE_PHASE_TIME_SCALE = 0.28;
const RIPPLE_TAP_TIME_SCALE = 0.35;
/** Wall-clock seconds before tap ripple is cleared (tap uses scaled age in shader). */
const RIPPLE_TAP_REAL_SEC = 6.2;

const SMOOTH_VISUAL_ALPHA_RATE = 6;

const BLOB_VIEW_HEIGHT = 200;
/**
 * Fluid Droplet: a free-form blob of liquid whose outline keeps turning into new shapes
 * (lumpy, pointed, flat, knobbly). A small solid centre keeps it in one piece; several blobs of
 * liquid roam inside on their own slow, never-repeating paths. Its size is held steady: the
 * drop's size measure is kept at the amount it settled at (see the size hold before mc.update).
 */
const FLUID_CORE_SHARE = 0.28;
/** The liquid is kept small enough to fit the drawing grid (else the drop is cut open at the
 * front) and enlarged on screen by this much. */
const FLUID_DISPLAY_SCALE = 1.12;
/** The held size, as a share of the settled one: leaves room around the drop in its grid. */
const FLUID_VOLUME_SHARE = 0.8;
const FLUID_BLOB_WEIGHT = 0.8;
const FLUID_DEPTH_REACH = 0.35;
const FLUID_SPEED = 1.1;
/** Each blob: how far it roams on each axis (grid units), its weight, and its own speeds/phases. */
const FLUID_BLOBS = [
  { reach: [0.21, 0.23, 0.11], weight: 0.5, speed: [0.31, 0.23, 0.27], phase: [0, 1.7, 0.6] },
  { reach: [0.22, 0.19, 0.12], weight: 0.42, speed: [0.19, 0.37, 0.29], phase: [2.4, 0.3, 3.1] },
  { reach: [0.18, 0.24, 0.1], weight: 0.38, speed: [0.41, 0.17, 0.33], phase: [4.2, 2.9, 1.4] },
  { reach: [0.23, 0.17, 0.12], weight: 0.34, speed: [0.26, 0.29, 0.21], phase: [1.1, 4.6, 5.0] },
  { reach: [0.16, 0.21, 0.12], weight: 0.3, speed: [0.35, 0.31, 0.39], phase: [5.5, 3.8, 2.2] },
] as const;
/** Updates averaged, as the drop forms, to fix the size it holds. */
const FLUID_SIZE_SETTLE_UPDATES = 40;
const BLOB_VIEW_HEIGHT_MAX = BLOB_VIEW_HEIGHT * 2;
/**
 * Base `top` % for the face overlay (aligned to normal blob height). In max-size mode,
 * {@link FACE_OVERLAY_TOP_EXTRA_PCT_WHEN_MAX} is added so the face sits lower on the doubled canvas.
 */
const FACE_OVERLAY_TOP_PCT = (52 / BLOB_VIEW_HEIGHT) * 100;
/** Added to `top` % only when max-size canvas is active — pushes the face down on the taller stack. */
const FACE_OVERLAY_TOP_EXTRA_PCT_WHEN_MAX = 10;

/** Pointer drag: radians of tilt per logical pixel (yaw about Y, pitch about X). */
const BLOB_DRAG_RAD_PER_PX = 0.008;
const BLOB_LONG_PRESS_MS = 500;
/** A hold that drifts further than this is a drag, not a long press. */
const BLOB_LONG_PRESS_MAX_MOVE_PX = 10;
const BLOB_MAX_PITCH_RAD = Math.PI / 2 - 0.15;

/** Tap hit → gelatin-like settle: translation + squash only (no extra rotation). */
const JELLO_DECAY = 2.35;
const JELLO_ACTIVE_SEC = 2.35;
const JELLO_SCALE_MUL = 0.052;
const JELLO_POS_XZ = 0.017;
const JELLO_POS_Y = 0.026;

/** Slow drift + sway so the blob feels like a living mass (world units / rad). */
const ALIVE_POS_X = 0.036;
const ALIVE_POS_Y = 0.03;
const ALIVE_POS_Z = 0.022;
const ALIVE_ROT_X = 0.042;
const ALIVE_ROT_Y = 0.038;
const ALIVE_ROT_Z = 0.024;
/** When breathing is disabled, keep a hint of motion so it still feels organic. */
const ALIVE_BREATHING_OFF_MUL = 0.4;

export type BlobDragRotationRef = MutableRefObject<{ x: number; y: number }>;

/** Local overlay coords + size for raycasting a tap onto the marching-cubes mesh. */
export type PendingBlobTap = { x: number; y: number; w: number; h: number };

/** 1 - smoothstep(0,1,x): fades blob field as heartMorph rises */
function blobFieldWeightFromHeartMorph(heartMorph: number): number {
  const x = THREE.MathUtils.clamp(heartMorph, 0, 1);
  return 1 - x * x * (3 - 2 * x);
}

/** Apply preset to an existing MeshPhysicalMaterial (shared Android contrast rules). */
function applyBlobAppearanceToMaterial(
  target: THREE.MeshPhysicalMaterial,
  appearancePresetId: BlobAppearancePresetId | undefined,
) {
  const preset = getBlobAppearancePreset(appearancePresetId);
  const mat = preset.material;
  target.color.set(mat.color);
  target.metalness = mat.metalness;
  const rough = BLOB_ANDROID_DEVICE_CONTRAST ? Math.max(0.05, mat.roughness * 0.86) : mat.roughness;
  target.roughness = rough;
  target.clearcoat = mat.clearcoat;
  target.clearcoatRoughness = mat.clearcoatRoughness;
  target.envMapIntensity = BLOB_ANDROID_DEVICE_CONTRAST
    ? Math.min(2.45, mat.envMapIntensity * 1.12)
    : mat.envMapIntensity;
  target.needsUpdate = true;
}

/**
 * What the Droplet keeps across a rebuild of its 3D scene. On Android the drawing surface is
 * destroyed while Home is hidden, so the scene is rebuilt when Home comes back; restoring this
 * lets the Droplet carry on where it was instead of restarting its animation and growth.
 */
export type BlobPersistedState = {
  animationTime: number;
  smoothT: number;
  visual: {
    smoothness: number;
    lobes: Record<string, number>;
    lobeStrengths: Record<LifeAreaLobeKey, number>;
    rippleAmp: number;
    rippleSpeed: number;
    suppressLobes: number;
  };
  morph: DropMorphState;
  fluidSizeAvg: number;
  fluidSizeSamples: number;
  /** The drop's surface level; without it a rebuilt scene starts at the default and visibly snaps into shape. */
  isolation: number;
};

export function BlobMesh({
  mood,
  areas,
  rippleAmp = DEFAULT_VISUAL.rippleAmp,
  rippleFreq = DEFAULT_VISUAL.rippleFreq,
  rippleSpeed = DEFAULT_VISUAL.rippleSpeed,
  smoothness = DEFAULT_VISUAL.smoothness,
  suppressLobes = false,
  lobes = DEFAULT_VISUAL.lobes,
  lobeStrengths,
  breathingEnabled = true,
  completedTasksToday,
  heartTaskThreshold = 3,
  dropMorphConfig: dropMorphConfigPartial,
  debugHeartTriggerNonce,
  debugHeartResetNonce,
  debugBakeRoomPmremNonce,
  onMorphDebugFrame,
  breathScaleOut,
  showHeroCape = false,
  showCrown2 = false,
  showThrone = false,
  dragRotationRef: dragRotationRefProp,
  pendingTapRef,
  onFps,
  onFirstVisualReady,
  visualVisible = true,
  persistRef,
  appearancePresetId = DEFAULT_BLOB_APPEARANCE_ID,
  fluid = true,
}: {
  /**
   * The fluid Droplet (default): a taller, egg-like liquid drop whose inside drifts slowly,
   * so the surface swells and settles like liquid.
   */
  fluid?: boolean;
  mood: BlobMood;
  areas: AreaIntensities;
  /**
   * Direct metaball strength per lobe, replacing the mood-based strength and its calm cap
   * (0 = hidden, about 0.13 matches the calm look). Used by the life graph.
   */
  lobeStrengths?: Record<LifeAreaLobeKey, number>;
  /** When false, uniform scale only (no sinusoidal body breathing). Default true. */
  breathingEnabled?: boolean;
  completedTasksToday?: number;
  /** When today's completed count reaches this value (from below), morph to heart once per cycle */
  heartTaskThreshold?: number;
  dropMorphConfig?: Partial<DropMorphConfig>;
  /** TEMP DEV: increment on home screen to start morphingToHeart from 0 (real mesh morph) */
  debugHeartTriggerNonce?: number;
  /** TEMP DEV: increment to reset morph state to normal */
  debugHeartResetNonce?: number;
  /** TEMP DEV: increment on Android to bake RoomEnvironment PMREM into app documents. */
  debugBakeRoomPmremNonce?: number;
  /** TEMP DEV: throttled morph snapshot for UI (~4/s) */
  onMorphDebugFrame?: (s: { phase: DropMorphPhase; heartMorph: number }) => void;
  /** Same multipliers as `breatheForHeart` on the marching-cubes scale — drive 2D face in sync. */
  breathScaleOut?: SharedValue<number>;
  /** Red cape mesh behind the metaball (must live in WebGL; 2D views sit under the GL layer on RN). */
  showHeroCape?: boolean;
  /** Gold five-point crown on the blob (WebGL; replaces 2D crown2 overlay). */
  showCrown2?: boolean;
  /** Decorative throne mesh behind the blob (same GL constraint as cape). */
  showThrone?: boolean;
  /** Euler pitch (x) / yaw (y) in radians; updated by pan gesture when wired from parent. */
  dragRotationRef?: BlobDragRotationRef;
  /** Set by parent on tap; consumed to seed a surface ripple at the hit point. */
  pendingTapRef?: MutableRefObject<PendingBlobTap | null>;
  /** Throttled (~2/s): average frames per second over the blob GL `useFrame` loop. */
  onFps?: (fps: number) => void;
  /** Fires once the first mesh update and final startup environment decision are ready. */
  onFirstVisualReady?: () => void;
  /** Keeps WebGL meshes hidden until the RN face/body reveal is allowed. */
  visualVisible?: boolean;
  /** Survives rebuilds of the 3D scene; see {@link BlobPersistedState}. */
  persistRef?: React.MutableRefObject<BlobPersistedState | null>;
  /** Surface + key-light preset from `@/src/blob/blobAppearancePresets`. */
  appearancePresetId?: BlobAppearancePresetId;
} & Partial<BlobMeshVisualProps>) {
  const internalDragRotationRef = useRef({ x: 0, y: 0 });
  const dragRotationRef = dragRotationRefProp ?? internalDragRotationRef;
  const morphRef = useRef<DropMorphState>(DEFAULT_DROP_MORPH_STATE);
  const lastDebugTriggerNonce = useRef(0);
  const lastDebugResetNonce = useRef(0);
  const lastDebugBakeRoomPmremNonce = useRef(0);
  const morphDebugLastReport = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  const currentPresetRef = useRef<MutableMoodPreset>({ ...MOOD_PRESETS[mood] });
  const animationTimeRef = useRef(0);
  const smoothTRef = useRef(0);
  const blobUpdateRef = useRef(0);
  const lastFieldBuildAtRef = useRef(-Infinity);
  // Fluid Droplet size hold: the size it settled at, and how many updates went into it.
  const fluidSizeAvgRef = useRef(0);
  const fluidSizeSamplesRef = useRef(0);
  const restoredRef = useRef(false);
  const smoothedVisualRef = useRef({
    smoothness: DEFAULT_VISUAL.smoothness,
    lobes: { ...DEFAULT_VISUAL.lobes },
    lobeStrengths: Object.fromEntries(
      LIFE_AREA_LOBE_KEYS.map(key => [key, MAX_EFFECTIVE_LOBE_CALM_BALANCED])
    ) as Record<LifeAreaLobeKey, number>,
    rippleAmp: DEFAULT_VISUAL.rippleAmp,
    rippleSpeed: DEFAULT_VISUAL.rippleSpeed,
    suppressLobes: 0,
  });
  if (!restoredRef.current) {
    restoredRef.current = true;
    const saved = persistRef?.current;
    if (saved) {
      animationTimeRef.current = saved.animationTime;
      smoothTRef.current = saved.smoothT;
      smoothedVisualRef.current = {
        ...saved.visual,
        lobes: { ...saved.visual.lobes } as typeof smoothedVisualRef.current.lobes,
        lobeStrengths: { ...saved.visual.lobeStrengths },
      };
      morphRef.current = saved.morph;
      fluidSizeAvgRef.current = saved.fluidSizeAvg;
      fluidSizeSamplesRef.current = saved.fluidSizeSamples;
    }
  }
  /** Uniform refs filled in MeshPhysicalMaterial.onBeforeCompile — lighting-only ripple (no geometry move). */
  const blobRippleUniformsRef = useRef<{
    uRippleTime?: { value: number };
    uRippleAmp?: { value: number };
    uRippleFreq?: { value: number };
    uTapOrigin?: { value: THREE.Vector3 };
    uTapAge?: { value: number };
  }>({});
  const breathingEnabledRef = useRef(breathingEnabled);
  breathingEnabledRef.current = breathingEnabled;
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerNdcRef = useRef(new THREE.Vector2());
  const tapRippleStartRef = useRef<number | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const perfAccumRef = useRef({ field: 0, blur: 0, update: 0, frames: 0 });
  const fpsSampleRef = useRef({ frames: 0, elapsed: 0 });
  const onFpsRef = useRef(onFps);
  onFpsRef.current = onFps;
  const onFirstVisualReadyRef = useRef(onFirstVisualReady);
  onFirstVisualReadyRef.current = onFirstVisualReady;
  const environmentReadyRef = useRef(false);
  const firstMeshUpdateReadyRef = useRef(false);
  // The Droplet stays hidden until its reflection and first shape exist, so a rebuilt scene
  // never shows a black (unlit) drop for a moment.
  const [sceneReady, setSceneReady] = useState(false);
  const firstVisualReadyReportedRef = useRef(false);
  const { scene, gl, camera } = useThree();

  useEffect(() => {
    if (
      debugBakeRoomPmremNonce === undefined ||
      debugBakeRoomPmremNonce === lastDebugBakeRoomPmremNonce.current
    ) {
      return;
    }
    lastDebugBakeRoomPmremNonce.current = debugBakeRoomPmremNonce;
    bakeRoomEnvironmentPmrem(gl);
  }, [debugBakeRoomPmremNonce, gl]);

  useEffect(() => {
    // Initial env: render or build something synchronously so the blob isn't dark on first frame.
    // Then asynchronously load assets/studio.hdr (a real Radiance HDR equirect) and swap it in
    // once decoded. Same HDR is used on both emulator and phone for identical "real gold" look —
    // the file at `assets/studio.hdr` can be replaced with any equirectangular HDR (e.g. a free
    // studio HDRI from PolyHaven) for higher visual quality without code changes.
    environmentReadyRef.current = false;
    const pmrem = new THREE.PMREMGenerator(gl);
    let envRT: THREE.WebGLRenderTarget | null = null;
    let equiTex: THREE.DataTexture | null = null;
    if (!BLOB_ANDROID_RUNTIME_ROOM_ENVIRONMENT) {
      equiTex = buildStudioRoomEquirect();
      envRT = pmrem.fromEquirectangular(equiTex);
    }
    // On the emulator the baked reflection below is the only one; the Droplet stays hidden
    // until it loads, so a failed live build never shows as a black blob.
    scene.environment = envRT?.texture ?? null;
    scene.background = null;
    equiTex?.dispose();

    let cancelled = false;
    let bakedEnvTexture: THREE.Texture | null = null;
    let pendingEnvironmentLoads =
      (BLOB_BAKED_ROOM_ENVIRONMENT ? 1 : 0) + (!BLOB_REFERENCE_LOOK ? 1 : 0);
    const markEnvironmentReady = () => {
      if (cancelled) return;
      pendingEnvironmentLoads = Math.max(0, pendingEnvironmentLoads - 1);
      if (pendingEnvironmentLoads > 0 || environmentReadyRef.current) return;
      environmentReadyRef.current = true;
      if (firstMeshUpdateReadyRef.current && !firstVisualReadyReportedRef.current) {
        firstVisualReadyReportedRef.current = true;
        onFirstVisualReadyRef.current?.();
          setSceneReady(true);
      }
    };
    if (pendingEnvironmentLoads === 0) {
      environmentReadyRef.current = true;
      if (firstMeshUpdateReadyRef.current && !firstVisualReadyReportedRef.current) {
        firstVisualReadyReportedRef.current = true;
        onFirstVisualReadyRef.current?.();
          setSceneReady(true);
      }
    }
    if (BLOB_BAKED_ROOM_ENVIRONMENT) (async () => {
      try {
        const texture = await loadBakedRoomEnvironmentPmremTexture();
        if (!texture) {
          markEnvironmentReady();
          return;
        }
        if (cancelled) {
          texture.dispose();
          return;
        }
        bakedEnvTexture = texture;
        scene.environment = texture;
        markEnvironmentReady();
      } catch (err) {
        console.log('[blob][baked-env] baked RoomEnvironment PMREM load failed', err);
        markEnvironmentReady();
      }
    })();

    // Android keeps the original RoomEnvironment "real gold" look — don't overwrite it
    // with the studio HDR. The HDR upgrade remains for non-Android paths.
    if (!BLOB_REFERENCE_LOOK) (async () => {
      try {
        console.log('[blob] HDR load: starting...');
        const asset = Asset.fromModule(require('../../assets/studio.hdr'));
        await asset.downloadAsync();
        if (cancelled) return;
        const uri = asset.localUri ?? asset.uri;
        console.log('[blob] HDR load: asset uri =', uri);
        if (!uri) {
          console.log('[blob] HDR load: no uri, bailing');
          markEnvironmentReady();
          return;
        }
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: BASE64_ENCODING,
        });
        if (cancelled) return;
        console.log('[blob] HDR load: read', base64.length, 'b64 chars');
        // atob is a top-level global in Hermes (RN >= 0.71); accessing via globalThis avoids
        // RN/TS quirks where `global.atob` is sometimes typed/resolved as undefined.
        const atobFn: (s: string) => string =
          (globalThis as { atob?: (s: string) => string }).atob ??
          (global as { atob?: (s: string) => string }).atob!;
        const binary = atobFn(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        console.log('[blob] HDR load: decoded', bytes.length, 'bytes');
        const loader = new RGBELoader();
        loader.setDataType(THREE.HalfFloatType);
        // RGBELoader.parse() returns raw data { width, height, data, type }, NOT a DataTexture.
        // We have to wrap it ourselves.
        const parsed = loader.parse(bytes.buffer) as unknown as {
          width: number;
          height: number;
          data: Uint16Array;
          type: THREE.TextureDataType;
        };
        console.log('[blob] HDR load: parsed', parsed.width, 'x', parsed.height, 'type', parsed.type);
        if (cancelled) return;

        // Downsample the HDR before PMREM. The 1024×512 PolyHaven HDR is 16× more pixels than
        // the procedural env we used before — bigger PMREM cubemap, more GPU memory, slower
        // per-fragment env sampling on mobile. PMREM blurs aggressively anyway, so 256×128 is
        // visually indistinguishable but much cheaper to sample every frame.
        let envW = parsed.width;
        let envH = parsed.height;
        let envData = parsed.data;
        {
          const TARGET_W = 256;
          const TARGET_H = 128;
          if (envW > TARGET_W) {
            const stepX = Math.floor(envW / TARGET_W);
            const stepY = Math.floor(envH / TARGET_H);
            const down = new Uint16Array(TARGET_W * TARGET_H * 4);
            for (let dj = 0; dj < TARGET_H; dj++) {
              const sj = dj * stepY;
              for (let di = 0; di < TARGET_W; di++) {
                const si = di * stepX;
                const sIdx = (sj * envW + si) * 4;
                const dIdx = (dj * TARGET_W + di) * 4;
                down[dIdx] = envData[sIdx];
                down[dIdx + 1] = envData[sIdx + 1];
                down[dIdx + 2] = envData[sIdx + 2];
                down[dIdx + 3] = envData[sIdx + 3];
              }
            }
            envData = down;
            envW = TARGET_W;
            envH = TARGET_H;
            console.log('[blob] HDR load: downsampled to', envW, 'x', envH);
          }
        }

        // The PolyHaven studio has a dark wood floor. On a metal sphere, the bottom hemisphere
        // reflects that floor, producing a dark/brown patch. Replace the floor region of the
        // equirect with a neutral cream "sweep" — same trick product photographers use under
        // gold/silver jewelry. Keeps all the bright softbox highlights from the upper half.
        // Memory layout: radiance HDR rows are top-to-bottom (row 0 = ceiling). With flipY=true
        // below, row h−1 lands on the BOTTOM of the sphere — so we modify rows from ~58% to h−1.
        {
          const data = envData;
          const w = envW, h = envH;
          const SWEEP_R = 0.85, SWEEP_G = 0.82, SWEEP_B = 0.78;
          const sweepR = THREE.DataUtils.toHalfFloat(SWEEP_R);
          const sweepG = THREE.DataUtils.toHalfFloat(SWEEP_G);
          const sweepB = THREE.DataUtils.toHalfFloat(SWEEP_B);
          const blendStartRow = Math.floor(h * 0.58); // start blending here
          const sweepStartRow = Math.floor(h * 0.70); // fully cream from here to h-1
          for (let j = blendStartRow; j < h; j++) {
            const blend = j >= sweepStartRow ? 1 : (j - blendStartRow) / (sweepStartRow - blendStartRow);
            for (let i = 0; i < w; i++) {
              const idx = (j * w + i) * 4;
              if (blend >= 0.999) {
                data[idx] = sweepR;
                data[idx + 1] = sweepG;
                data[idx + 2] = sweepB;
              } else {
                const origR = THREE.DataUtils.fromHalfFloat(data[idx]);
                const origG = THREE.DataUtils.fromHalfFloat(data[idx + 1]);
                const origB = THREE.DataUtils.fromHalfFloat(data[idx + 2]);
                data[idx] = THREE.DataUtils.toHalfFloat(origR * (1 - blend) + SWEEP_R * blend);
                data[idx + 1] = THREE.DataUtils.toHalfFloat(origG * (1 - blend) + SWEEP_G * blend);
                data[idx + 2] = THREE.DataUtils.toHalfFloat(origB * (1 - blend) + SWEEP_B * blend);
              }
            }
          }
        }

        const hdrTex = new THREE.DataTexture(
          envData,
          envW,
          envH,
          THREE.RGBAFormat,
          parsed.type,
        );
        hdrTex.mapping = THREE.EquirectangularReflectionMapping;
        hdrTex.colorSpace = THREE.LinearSRGBColorSpace;
        hdrTex.minFilter = THREE.LinearFilter;
        hdrTex.magFilter = THREE.LinearFilter;
        hdrTex.generateMipmaps = false;
        // RGBELoader stores rows top-to-bottom; DataTexture needs flipY=true to land +Y up.
        hdrTex.flipY = true;
        hdrTex.needsUpdate = true;
        const hdrRT = pmrem.fromEquirectangular(hdrTex);
        hdrTex.dispose();
        const oldRT = envRT;
        envRT = hdrRT;
        scene.environment = hdrRT.texture;
        oldRT?.dispose();
        console.log('[blob] HDR studio env loaded and applied.');
        markEnvironmentReady();
      } catch (err) {
        console.log('[blob] HDR env load failed, keeping fallback:', err);
        markEnvironmentReady();
      }
    })();

    // Unified lighting — env carries the directionality. Android uses the emulator fill values.
    const ambient = new THREE.AmbientLight(0xffffff, BLOB_ANDROID_DEVICE_CONTRAST ? 1.05 : 1.4);
    const hemi = new THREE.HemisphereLight(
      0xfff4d6,
      BLOB_ANDROID_DEVICE_CONTRAST ? 0xc8a050 : 0xd6b878,
      BLOB_ANDROID_DEVICE_CONTRAST ? 0.66 : 0.9,
    );
    keyLightRef.current = null;
    scene.add(ambient);
    scene.add(hemi);

    return () => {
      cancelled = true;
      environmentReadyRef.current = false;
      scene.environment = null;
      envRT?.dispose();
      bakedEnvTexture?.dispose();
      pmrem.dispose();
      scene.remove(ambient);
      scene.remove(hemi);
      keyLightRef.current = null;
    };
  }, [scene, gl]);

  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 1,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.2,
      flatShading: false,
    });
    // Android uses the emulator/simulator surface-ripple shader for the same metallic look.
    if (BLOB_REFERENCE_LOOK) {
    // Avoid sharing a compiled program when onBeforeCompile collides with defaults.
    // onBeforeCompile.toString() would collide; force a dedicated program for this mesh.
    m.customProgramCacheKey = () => 'eazee_blob_mc_surface_ripple_v6a_viscous';
    m.onBeforeCompile = (parameters) => {
      parameters.uniforms.uRippleTime = { value: 0 };
      parameters.uniforms.uRippleAmp = { value: 0.04 };
      parameters.uniforms.uRippleFreq = { value: 1.6 };
      parameters.uniforms.uTapOrigin = { value: new THREE.Vector3(0, -9999, 0) };
      parameters.uniforms.uTapAge = { value: 0 };
      blobRippleUniformsRef.current.uRippleTime = parameters.uniforms.uRippleTime;
      blobRippleUniformsRef.current.uRippleAmp = parameters.uniforms.uRippleAmp;
      blobRippleUniformsRef.current.uRippleFreq = parameters.uniforms.uRippleFreq;
      blobRippleUniformsRef.current.uTapOrigin = parameters.uniforms.uTapOrigin;
      blobRippleUniformsRef.current.uTapAge = parameters.uniforms.uTapAge;

      parameters.vertexShader = parameters.vertexShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vRippleWorldPos;`
      );
      parameters.vertexShader = parameters.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vRippleWorldPos = worldPosition.xyz;
#else
	vRippleWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
#endif`
      );

      parameters.fragmentShader = parameters.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vRippleWorldPos;
uniform float uRippleTime;
uniform float uRippleAmp;
uniform float uRippleFreq;
uniform vec3 uTapOrigin;
uniform float uTapAge;`
      );
      // Clearcoat lighting uses `clearcoatNormal`, not `normal` — perturb both. Also modulate final `outgoingLight`
      // so crawl reads on metal + env + mobile (normal-only can look flat).
      const rippleBody = /* glsl */ `
{
	vec3 rp = vRippleWorldPos * uRippleFreq;
	float ph =
		sin( rp.x + uRippleTime ) * cos( rp.y - uRippleTime * 0.73 )
		+ sin( rp.z * 0.87 + uRippleTime * 0.61 ) * 0.65;
	float ph2 =
		sin( rp.x * 2.31 + uRippleTime * 1.07 ) * cos( rp.y * 2.08 - uRippleTime * 0.94 )
		+ sin( rp.z * 2.18 + uRippleTime * 0.71 ) * 0.55;
	float sum = ( ph + ph2 * 0.42 ) * uRippleAmp;
	float tapRings = 0.0;
	if ( uTapAge > 0.001 && uTapAge < 4.0 ) {
		float dTap = distance( vRippleWorldPos, uTapOrigin );
		float wave = sin( dTap * 28.5 - uTapAge * 15.5 );
		float envelope = exp( -dTap * 0.72 ) * exp( -uTapAge * 0.55 ) * ( 1.0 - smoothstep( 2.75, 3.55, uTapAge ) );
		tapRings = wave * envelope;
	}
	sum += tapRings * 0.168;
	vec3 n0 = __N__;
	vec3 tng = cross( n0, vec3( 0.0, 1.0, 0.0 ) );
	if ( dot( tng, tng ) < 0.0000001 ) tng = cross( n0, vec3( 1.0, 0.0, 0.0 ) );
	tng = normalize( tng );
	vec3 btn = normalize( cross( n0, tng ) );
	__OUT__ = normalize( n0 + tng * ( sum * 0.72 ) + btn * ( sum * 0.62 ) );
}`;
      parameters.fragmentShader = parameters.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
${rippleBody.replace('__N__', 'normal').replace('__OUT__', 'normal')}`
      );
      parameters.fragmentShader = parameters.fragmentShader.replace(
        '#include <clearcoat_normal_fragment_maps>',
        `#include <clearcoat_normal_fragment_maps>
#ifdef USE_CLEARCOAT
${rippleBody.replace('__N__', 'clearcoatNormal').replace('__OUT__', 'clearcoatNormal')}
#endif`
      );
      parameters.fragmentShader = parameters.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
{
	float tapShimmer = 0.0;
	if ( uTapAge > 0.001 && uTapAge < 4.0 ) {
		float dTap = distance( vRippleWorldPos, uTapOrigin );
		float wave = sin( dTap * 28.5 - uTapAge * 15.5 );
		float envelope = exp( -dTap * 0.68 ) * exp( -uTapAge * 0.58 ) * ( 1.0 - smoothstep( 2.75, 3.55, uTapAge ) );
		tapShimmer = wave * envelope;
	}
	float crawl =
		sin( dot( vRippleWorldPos, vec3( 3.1, 2.7, 2.3 ) ) + uRippleTime )
		* cos( dot( vRippleWorldPos, vec3( -2.2, 3.4, 1.9 ) ) - uRippleTime * 0.85 );
	float shimmer = crawl * uRippleAmp * 0.055;
	gl_FragColor.rgb *= 1.0 + shimmer + tapShimmer * 0.054;
}`
      );
    };
    } // end if (BLOB_REFERENCE_LOOK)
    applyBlobAppearanceToMaterial(m, appearancePresetId);
    return m;
  }, [appearancePresetId]);

  const mc = useMemo(() => {
    const m = new MarchingCubes(RES, material, false, false, MC_MAX_POLYS);
    m.isolation = persistRef?.current?.isolation ?? ISO;
    m.enableUvs = false;
    m.enableColors = false;
    m.scale.setScalar(1);
    m.renderOrder = 0;
    return m;
  }, [material]);

  const glBackpressureRef = useRef({ waitsMs: [] as number[], enabled: true });
  useFrame(({ gl: renderer }) => {
    const backpressure = glBackpressureRef.current;
    if (!backpressure.enabled) return;
    const startedAt = Date.now();
    (renderer.getContext() as WebGL2RenderingContext & { flushEXP?: () => void }).flushEXP?.();
    const { waitsMs } = backpressure;
    if (waitsMs.length >= GL_BACKPRESSURE_PROBE_FRAMES) return;
    waitsMs.push(Date.now() - startedAt);
    if (waitsMs.length === GL_BACKPRESSURE_PROBE_FRAMES) {
      // The median, so one slow frame (e.g. the shader compiling) does not keep this on.
      const medianWaitMs = [...waitsMs].sort((a, b) => a - b)[Math.floor(waitsMs.length / 2)];
      backpressure.enabled = medianWaitMs >= GL_BACKPRESSURE_SLOW_FRAME_MS;
    }
  });

  useFrame((_, delta) => {
    const dt = THREE.MathUtils.clamp(delta, 0, BLOB_MAX_ANIMATION_DELTA_SEC);
    animationTimeRef.current += dt;
    const t = animationTimeRef.current;

    const ruTap = blobRippleUniformsRef.current;
    const pending = pendingTapRef?.current;
    if (pending && pending.w > 8 && pending.h > 8 && ruTap.uTapOrigin && ruTap.uTapAge) {
      pendingTapRef.current = null;
      pointerNdcRef.current.set(
        (pending.x / pending.w) * 2 - 1,
        -(pending.y / pending.h) * 2 + 1
      );
      mc.updateMatrixWorld(true);
      raycasterRef.current.setFromCamera(pointerNdcRef.current, camera);
      const hits = raycasterRef.current.intersectObject(mc, false);
      if (hits.length > 0) {
        ruTap.uTapOrigin.value.copy(hits[0].point);
        tapRippleStartRef.current = t;
      }
    }
    if (tapRippleStartRef.current != null && ruTap.uTapAge) {
      const tapElapsed = t - tapRippleStartRef.current;
      ruTap.uTapAge.value = tapElapsed * RIPPLE_TAP_TIME_SCALE;
      if (tapElapsed > RIPPLE_TAP_REAL_SEC) {
        tapRippleStartRef.current = null;
        ruTap.uTapAge.value = 0;
      }
    } else if (ruTap.uTapAge && tapRippleStartRef.current === null) {
      ruTap.uTapAge.value = 0;
    }

    const blend = 1 / MOTION_SMOOTH_STEPS;
    smoothTRef.current += (t - smoothTRef.current) * blend;
    const tSmooth = smoothTRef.current;
    const tSlow = tSmooth * MOTION_SPEED;
    if (persistRef) {
      persistRef.current = {
        animationTime: t,
        smoothT: tSmooth,
        visual: smoothedVisualRef.current,
        morph: morphRef.current,
        fluidSizeAvg: fluidSizeAvgRef.current,
        fluidSizeSamples: fluidSizeSamplesRef.current,
        isolation: mc.isolation,
      };
    }

    if (
      debugHeartResetNonce !== undefined &&
      debugHeartResetNonce !== lastDebugResetNonce.current
    ) {
      lastDebugResetNonce.current = debugHeartResetNonce;
      morphRef.current = { ...DEFAULT_DROP_MORPH_STATE };
      console.log('[BlobMesh DEBUG] Reset Heart applied -> normal, heartMorph 0, timers cleared');
    }
    if (
      debugHeartTriggerNonce !== undefined &&
      debugHeartTriggerNonce !== lastDebugTriggerNonce.current
    ) {
      lastDebugTriggerNonce.current = debugHeartTriggerNonce;
      morphRef.current = {
        phase: 'heartActive',
        heartMorph: 1,
        prevCompletedTasks: morphRef.current.prevCompletedTasks,
        heartExitAt: null,
      };
      console.log('[BlobMesh DEBUG] Trigger Heart applied -> heartActive, heartMorph 1 (immediate)');
    }

    const morphCfg: DropMorphConfig = { ...DEFAULT_DROP_MORPH_CONFIG, ...dropMorphConfigPartial };
    if (completedTasksToday !== undefined) {
      morphRef.current = tickDropMorphState(
        morphRef.current,
        {
          completedTasksToday,
          heartTaskThreshold,
          clockElapsed: t,
          delta: dt,
        },
        morphCfg
      );
    }
    const heartMorph = completedTasksToday !== undefined ? morphRef.current.heartMorph : 0;

    if (onMorphDebugFrame && t - morphDebugLastReport.current > 0.2) {
      morphDebugLastReport.current = t;
      const m = morphRef.current;
      onMorphDebugFrame({ phase: m.phase, heartMorph: m.heartMorph });
    }
    const blobWeight = blobFieldWeightFromHeartMorph(heartMorph);

    const sm = smoothedVisualRef.current;
    const visualAlpha = 1 - Math.exp(-dt * SMOOTH_VISUAL_ALPHA_RATE);
    sm.smoothness += (smoothness - sm.smoothness) * visualAlpha;
    sm.rippleAmp += (rippleAmp - sm.rippleAmp) * visualAlpha;
    sm.rippleSpeed += (rippleSpeed - sm.rippleSpeed) * visualAlpha;
    LIFE_AREA_LOBE_KEYS.forEach(key => {
      sm.lobes[key] += (lobes[key] - sm.lobes[key]) * visualAlpha;
      const targetLobeStrength = lobeStrengths?.[key] ?? MAX_EFFECTIVE_LOBE_CALM_BALANCED;
      sm.lobeStrengths[key] += (targetLobeStrength - sm.lobeStrengths[key]) * visualAlpha;
    });
    const suppressTarget = suppressLobes ? 1 : 0;
    sm.suppressLobes += (suppressTarget - sm.suppressLobes) * visualAlpha;

    const ru = blobRippleUniformsRef.current;
    if (ru.uRippleTime && ru.uRippleAmp && ru.uRippleFreq) {
      ru.uRippleTime.value = tSlow * (0.26 + sm.rippleSpeed * 0.62) * RIPPLE_PHASE_TIME_SCALE;
      // Must read on metallic + clearcoat: amp large enough for env highlights to crawl (field unchanged).
      ru.uRippleAmp.value = THREE.MathUtils.clamp(
        0.09 + sm.rippleAmp * 0.22,
        0.07,
        0.55
      );
      ru.uRippleFreq.value = rippleFreq * 0.1;
    }

    const target = MOOD_PRESETS[mood];
    const current = currentPresetRef.current;
    const presetLerpAlpha = 1 - Math.exp(-dt / 0.4);
    (Object.keys(target) as (keyof MoodPreset)[]).forEach(key => {
      current[key] = THREE.MathUtils.lerp(current[key], target[key], presetLerpAlpha);
    });

    const totalLobePressure =
      (sm.lobes.health + sm.lobes.relationships + sm.lobes.work + sm.lobes.home + sm.lobes.growth + sm.lobes.sleep) / 6;
    const strengthForVolume = 0.6;
    const effectiveLobeAvg = lobeStrengths
      ? LIFE_AREA_LOBE_KEYS.reduce((sum, key) => sum + sm.lobeStrengths[key], 0) / 6
      : 0.4 + 0.6 * totalLobePressure;
    const coreScaleForVolume = 1 - 0.1 * totalLobePressure;
    const coreScaleBoost = totalLobePressure < 0.2 ? 0.28 : 0;
    const coreStrengthCur =
      strengthForVolume * CORE_METABALL_MUL * (coreScaleForVolume + coreScaleBoost) +
      strengthForVolume * CORE_INNER_BUMP_MUL;
    const LOBE_BALLS_PER_LOBE = 7;
    const baseLobeStrForVolume = strengthForVolume * 0.88 * 1.5;
    const lobeMassCur =
      6 * baseLobeStrForVolume * 0.94 * effectiveLobeAvg * LOBE_BALLS_PER_LOBE;
    const massCur = coreStrengthCur + lobeMassCur;
    const refLobePressure = 0.5;
    const refEffectiveLobe = 0.4 + 0.6 * refLobePressure;
    const refCoreScale = 1 - 0.1 * refLobePressure;
    const refCoreStrength =
      strengthForVolume * CORE_METABALL_MUL * refCoreScale + strengthForVolume * CORE_INNER_BUMP_MUL;
    const refLobeMass =
      6 * baseLobeStrForVolume * 0.94 * refEffectiveLobe * LOBE_BALLS_PER_LOBE;
    const massRef = refCoreStrength + refLobeMass;
    const fullCompensation = massRef > 0 && massCur > 0 ? Math.pow(massRef / massCur, 1 / 3) : 1;
    const volumeCompensation = 1 + (fullCompensation - 1) * 0.55;

    const HEART_LOCK = 0.99;
    const heartLocked = heartMorph >= HEART_LOCK;
    const heartHold = heartMorph * heartMorph;
    const breatheAmp = current.breatheAmp * BREATHE_VISUAL_AMP_MUL;
    // The fluid drop keeps one size (only its shape moves), so it doesn't breathe.
    const breatheOsc = breathingEnabledRef.current && !fluid
      ? Math.sin(t * BREATHE_RAD_PER_SEC) * breatheAmp
      : 0;
    const breathe = 1 + breatheOsc;
    const breatheForHeart = heartLocked
      ? 1
      : THREE.MathUtils.lerp(breathe, 1, heartHold * 0.94);

    if (breathScaleOut) {
      breathScaleOut.value = breatheForHeart;
    }

    const scaleCompensate = 1 / (1 - 2 * MARGIN_GRID);
    const bodyScale = 2.025 * 0.6 * breatheForHeart * scaleCompensate * volumeCompensation;
    // The fluid drop keeps one size: its shape comes from the liquid blobs moving inside it.
    mc.scale.setScalar(fluid
      ? bodyScale * THREE.MathUtils.lerp(FLUID_DISPLAY_SCALE, 1, heartMorph)
      : bodyScale);
    mc.position.y = 0;

    const shouldRebuildField = t - lastFieldBuildAtRef.current >= BLOB_FIELD_UPDATE_INTERVAL_SEC;
    if (shouldRebuildField) {
      lastFieldBuildAtRef.current = t;
      blobUpdateRef.current += 1;
      // PERF: measure field-build cost. Includes mc.reset + all addBall calls + heart morph contrib.
      const perfFieldStart = (globalThis.performance ?? Date).now();
      mc.reset();

      /*
       * Blob deformation design rules (for future tuning):
       * - More spherical = more balanced life (smoothness/sphericality from balance/stress).
       * - Protrusions = pressure / neglect in specific life areas (each lobe = one area).
       * - Same total volume should be roughly preserved (core scales down when lobe pressure
       *   is high; avoid simply inflating everything).
       * - Ripples by state: calm = no ripples; normal = slight ripples; stressed = obvious ripples.
       */
      const subtract = 11;
      const strength = 0.6;
      const coreX = 0;
      const coreY = 0;
      const coreZ = 0;
      let coreScale = 1 - 0.1 * totalLobePressure;
      if (totalLobePressure < 0.2) {
        coreScale += 0.28;
      }
      const coreStrength = strength * CORE_METABALL_MUL * coreScale * blobWeight;
      const coreWobbleScale = 0.27;
      const [cpx, cpy, cpz] = clampToGrid(
        0.5 + coreX * coreWobbleScale,
        0.5 + coreY * coreWobbleScale,
        0.5 + coreZ * coreWobbleScale
      );
      // The fluid drop keeps only part of the round core, so its blobs shape the outline.
      const coreShare = fluid ? FLUID_CORE_SHARE : 1;
      mc.addBall(cpx, cpy, cpz, coreStrength * coreShare, subtract);
      const [ccx, ccy, ccz] = clampToGrid(0.5, 0.5, 0.5);
      // The small centre ball stays full strength, so the middle never thins into a hole.
      mc.addBall(ccx, ccy, ccz, strength * CORE_INNER_BUMP_MUL * blobWeight * (fluid ? 1.2 : 1), subtract);

      if (fluid) {
        const fluidWeight = coreStrength * blobWeight;
        const ft = tSmooth * FLUID_SPEED;
        for (const blob of FLUID_BLOBS) {
          const [bx, by, bz] = clampToGrid(
            0.5 + blob.reach[0] * Math.sin(ft * blob.speed[0] + blob.phase[0]),
            0.5 + blob.reach[1] * Math.sin(ft * blob.speed[1] + blob.phase[1]),
            0.5 + blob.reach[2] * FLUID_DEPTH_REACH * Math.sin(ft * blob.speed[2] + blob.phase[2])
          );
          mc.addBall(bx, by, bz, fluidWeight * blob.weight * FLUID_BLOB_WEIGHT, subtract);
        }
      }

    const baseLobeStrength = strength * 0.88 * 1.5 * blobWeight * LOBE_FIELD_SCALE;
    const lobeAnchorReach = CHILD_OFFSET * LOBE_REACH_MUL;
    const lobeFieldMul = 1 - sm.suppressLobes;

    const lobePulseMul = normalizedLobePulseMultipliers(tSmooth, LOBE_PULSE_AMP * blobWeight);

    // Five life-area lobes: each named area controls its matching rounded protrusion.
    // Larger prop value = larger protrusion; smaller = subtler. Redistributes shape, preserves central mass.
    LIFE_AREA_LOBE_KEYS.forEach((key, i) => {
      const dir = LOBE_DIRECTIONS[key];
      const [wrx, wry, wrz] = lobeRotEulerRad(i, tSmooth, LOBE_ROT_AMP_RAD * blobWeight);
      const [rx, ry, rz] = rotateVecEulerXYZ(dir[0], dir[1], dir[2], wrx, wry, wrz);
      const rlen = Math.hypot(rx, ry, rz) || 1;
      const dirX = rx / rlen;
      const dirY = ry / rlen;
      const dirZ = rz / rlen;

      const phase = i * 1.7;
      const driftX = DRIFT * Math.sin(tSlow * 0.09 + phase);
      const driftY = DRIFT * Math.cos(tSlow * 0.1 + phase + 1);
      const driftZ = DRIFT * Math.sin(tSlow * 0.08 + phase + 2);

      let x0 = dirX * lobeAnchorReach + driftX;
      let y0 = dirY * lobeAnchorReach + driftY - HONEY_SAG;
      let z0 = dirZ * lobeAnchorReach + driftZ;

      const dist = Math.hypot(x0, y0, z0) || 1;
      const ax = x0 / dist;
      const ay = y0 / dist;
      const az = z0 / dist;

      const clampedDist = Math.min(dist, MARGIN) * LOBE_RADIAL_SCALE;

      const lobeValue = sm.lobes[key];
      let effectiveLobe = 0.4 + 0.6 * lobeValue;
      if (sm.smoothness > 0.92) effectiveLobe *= 0.28;
      else if (sm.smoothness > 0.9) effectiveLobe *= 0.6;
      effectiveLobe = Math.min(effectiveLobe, MAX_EFFECTIVE_LOBE_CALM_BALANCED);
      if (lobeStrengths) effectiveLobe = sm.lobeStrengths[key];

      const lobeMassMul = 1;


      const filament = 0;
      const merged = 0;
      const receiving = 0;
      const pinch = 0;
      const tipStretch = 0;
      const neckStretch = 0;
      const bulbFat = 0;

      const neckDist = clampedDist * 0.78 * (1 + neckStretch + bulbFat * 0.22);
      const bulbDist = clampedDist * (1 + filament * 0.05 + bulbFat * 0.08);

      const bulbStrength = baseLobeStrength * effectiveLobe * lobeFieldMul * lobePulseMul[i];
      const bridgeStrength = (bulbStrength + bulbStrength) * 0.99 * 0.32;
      const shoulderStrMul = 1 - pinch + bulbFat * 0.2;
      const tipStrMul = 1 + filament * 0.16 + bulbFat * 0.14;
      const shoulderStrength = bulbStrength * shoulderStrMul * 0.38;
      const midStrength = bulbStrength * (1 + filament * 0.1 + bulbFat * 0.06) * 0.38;
      const neckBallStrength = bulbStrength * (1 + filament * 0.08) * 0.48;
      const tipBulbStrength = bulbStrength * tipStrMul * 1.22;

      const shoulderDist = clampedDist * 0.4 * (1 - pinch * 0.32);
      let sx = ax * shoulderDist;
      let sy = ay * shoulderDist;
      let sz = az * shoulderDist;
      sx = Math.max(-MARGIN, Math.min(MARGIN, sx));
      sy = Math.max(-MARGIN, Math.min(MARGIN, sy));
      sz = Math.max(-MARGIN, Math.min(MARGIN, sz));
      const [spx, spy, spz] = clampToGrid(0.5 + sx * 0.42, 0.5 + sy * 0.42, 0.5 + sz * 0.42);
      mc.addBall(spx, spy, spz, shoulderStrength, subtract);

      const midDist = clampedDist * 0.58 * (1 + filament * 0.12 + bulbFat * 0.07);
      let mx = ax * midDist;
      let my = ay * midDist;
      let mz = az * midDist;
      mx = Math.max(-MARGIN, Math.min(MARGIN, mx));
      my = Math.max(-MARGIN, Math.min(MARGIN, my));
      mz = Math.max(-MARGIN, Math.min(MARGIN, mz));
      const [mpx, mpy, mpz] = clampToGrid(0.5 + mx * 0.42, 0.5 + my * 0.42, 0.5 + mz * 0.42);
      mc.addBall(mpx, mpy, mpz, midStrength, subtract);

      let nx = ax * neckDist;
      let ny = ay * neckDist;
      let nz = az * neckDist;
      nx = Math.max(-MARGIN, Math.min(MARGIN, nx));
      ny = Math.max(-MARGIN, Math.min(MARGIN, ny));
      nz = Math.max(-MARGIN, Math.min(MARGIN, nz));

      let bx = ax * bulbDist;
      let by = ay * bulbDist;
      let bz = az * bulbDist;
      bx = Math.max(-MARGIN, Math.min(MARGIN, bx));
      by = Math.max(-MARGIN, Math.min(MARGIN, by));
      bz = Math.max(-MARGIN, Math.min(MARGIN, bz));

      const [npx, npy, npz] = clampToGrid(0.5 + nx * 0.42, 0.5 + ny * 0.42, 0.5 + nz * 0.42);
      mc.addBall(npx, npy, npz, neckBallStrength, subtract);

      const tipDist = clampedDist * 0.9 * (1 + tipStretch);
      let tx = ax * tipDist;
      let ty = ay * tipDist;
      let tz = az * tipDist;
      tx = Math.max(-MARGIN, Math.min(MARGIN, tx));
      ty = Math.max(-MARGIN, Math.min(MARGIN, ty));
      tz = Math.max(-MARGIN, Math.min(MARGIN, tz));
      const [tpx, tpy, tpz] = clampToGrid(0.5 + tx * 0.42, 0.5 + ty * 0.42, 0.5 + tz * 0.42);
      mc.addBall(tpx, tpy, tpz, tipBulbStrength * lobeMassMul, subtract);

      const innerMix = 0.32;
      const innerX = 0.5 + (nx + (bx - nx) * innerMix) * 0.42;
      const innerY = 0.5 + (ny + (by - ny) * innerMix) * 0.42;
      const innerZ = 0.5 + (nz + (bz - nz) * innerMix) * 0.42;
      const [ix, iy, iz] = clampToGrid(innerX, innerY, innerZ);
      mc.addBall(
        ix,
        iy,
        iz,
        (neckBallStrength + bridgeStrength) * 0.22 * (1 + filament * 0.1 + bulbFat * 0.07),
        subtract
      );
      const bridgeMix = 0.52;
      const bridgeX = 0.5 + (nx + (bx - nx) * bridgeMix) * 0.42;
      const bridgeY = 0.5 + (ny + (by - ny) * bridgeMix) * 0.42;
      const bridgeZ = 0.5 + (nz + (bz - nz) * bridgeMix) * 0.42;
      const [brix, briy, briz] = clampToGrid(bridgeX, bridgeY, bridgeZ);
      mc.addBall(
        brix,
        briy,
        briz,
        bridgeStrength * (1 + filament * 0.12 + bulbFat * 0.06) * 0.36,
        subtract
      );

      const [bpx, bpy, bpz] = clampToGrid(0.5 + bx * 0.42, 0.5 + by * 0.42, 0.5 + bz * 0.42);
      mc.addBall(bpx, bpy, bpz, tipBulbStrength * lobeMassMul, subtract);
    });

    // Future morph targets: add another contributor here with its own 0–1 weight (same pattern as heart).
    contributeHeartMorphField(mc, subtract, heartMorph, t, tSmooth, clampToGrid);

      const perfFieldEnd = (globalThis.performance ?? Date).now();

      // Field blur removed on all targets: on emulator it allocated `field.slice()` and ran a
      // second O(RES³) pass — often slower than the rest of the frame combined.
      const perfBlurEnd = perfFieldEnd;

      if (fluid) {
        // Hold the drop's size by moving the surface threshold, so only the shape changes. The
        // held measure mixes the space its liquid fills with the area of its outline facing the
        // camera: volume alone lets a drop flattened toward the viewer look bigger, and outline
        // area alone lets it grow deep enough to be cut open. The first updates set the amount.
        const field = (mc as any).field as Float32Array | undefined;
        const gridSize = (mc as any).size as number | undefined;
        if (field && gridSize && heartMorph < 0.01) {
          const layer = gridSize * gridSize;
          const columnMax = new Float32Array(layer);
          for (let i = 0; i < field.length; i += 1) {
            const column = i % layer;
            if (field[i] > columnMax[column]) columnMax[column] = field[i];
          }
          const countAbove = (iso: number) => {
            let volume = 0;
            for (let i = 0; i < field.length; i += 1) if (field[i] > iso) volume += 1;
            let outline = 0;
            for (let i = 0; i < layer; i += 1) if (columnMax[i] > iso) outline += 1;
            return Math.sqrt(Math.pow(volume, 2 / 3) * outline);
          };
          // The first updates measure the drop at the usual surface to set its size; the held
          // size applies from the very first frame, so the drop never visibly shrinks into it.
          const isFirstUpdate = fluidSizeSamplesRef.current === 0;
          if (fluidSizeSamplesRef.current < FLUID_SIZE_SETTLE_UPDATES) {
            fluidSizeSamplesRef.current += 1;
            fluidSizeAvgRef.current += (countAbove(ISO) - fluidSizeAvgRef.current) / fluidSizeSamplesRef.current;
          }
          const target = fluidSizeAvgRef.current * FLUID_VOLUME_SHARE;
          let low = ISO * 0.5;
          let high = ISO * 2;
          for (let step = 0; step < 12; step += 1) {
            const mid = (low + high) / 2;
            if (countAbove(mid) > target) low = mid;
            else high = mid;
          }
          // Eased, so the surface never jumps between updates.
          const solved = (low + high) / 2;
          mc.isolation = isFirstUpdate ? solved : mc.isolation + (solved - mc.isolation) * 0.4;
        } else {
          mc.isolation += (ISO - mc.isolation) * 0.4;
        }
      } else if (mc.isolation !== ISO) {
        // Back from the fluid drop (Life graph turned on): the usual surface, and a fresh size
        // hold for the next time the fluid drop shows.
        mc.isolation = ISO;
        fluidSizeSamplesRef.current = 0;
        fluidSizeAvgRef.current = 0;
      }
      mc.update();
      if (!firstMeshUpdateReadyRef.current) {
        firstMeshUpdateReadyRef.current = true;
        if (environmentReadyRef.current && !firstVisualReadyReportedRef.current) {
          firstVisualReadyReportedRef.current = true;
          onFirstVisualReadyRef.current?.();
          setSceneReady(true);
        }
      }
      const perfUpdateEnd = (globalThis.performance ?? Date).now();

      if (BLOB_PERF_LOGS) {
        perfAccumRef.current.field += perfFieldEnd - perfFieldStart;
        perfAccumRef.current.blur += 0;
        perfAccumRef.current.update += perfUpdateEnd - perfBlurEnd;
        perfAccumRef.current.frames += 1;
        if (perfAccumRef.current.frames >= 60) {
          const f = perfAccumRef.current;
          console.log(
            `[blob perf] avg over ${f.frames}f — field ${(f.field / f.frames).toFixed(2)}ms` +
            ` | blur ${(f.blur / f.frames).toFixed(2)}ms` +
            ` | update ${(f.update / f.frames).toFixed(2)}ms` +
            ` | total ${((f.field + f.blur + f.update) / f.frames).toFixed(2)}ms` +
            ` (budget for 60fps = 16.67ms)`
          );
          f.field = 0; f.blur = 0; f.update = 0; f.frames = 0;
        }
      }
    }

    if (groupRef.current) {
      const r = dragRotationRef.current;
      let jScale = 1;
      let jpx = 0;
      let jpy = 0;
      let jpz = 0;
      if (tapRippleStartRef.current !== null) {
        const ja = t - tapRippleStartRef.current;
        if (ja >= 0 && ja < JELLO_ACTIVE_SEC) {
          const env = Math.exp(-ja * JELLO_DECAY);
          jpx =
            JELLO_POS_XZ *
            env *
            (0.58 * Math.sin(ja * 14.5 + 0.2) + 0.42 * Math.sin(ja * 19.3 + 1.0));
          jpy = JELLO_POS_Y * env * Math.sin(ja * 16.8 + 0.35);
          jpz =
            JELLO_POS_XZ *
            env *
            (0.52 * Math.sin(ja * 13.2 + 1.45) + 0.48 * Math.sin(ja * 20.6 + 2.1));
          jScale =
            1 +
            JELLO_SCALE_MUL * env * Math.sin(ja * 18.5) +
            JELLO_SCALE_MUL * 0.48 * env * Math.sin(ja * 26.2 + 0.5);
        }
      }
      const aliveMul = breathingEnabledRef.current ? 1 : ALIVE_BREATHING_OFF_MUL;
      const ts = tSmooth;
      const aliveX =
        aliveMul *
        ALIVE_POS_X *
        (0.58 * Math.sin(ts * 0.52 + 0.15) + 0.42 * Math.sin(ts * 0.31 + 1.4));
      const aliveY =
        aliveMul *
        ALIVE_POS_Y *
        (0.52 * Math.sin(ts * 0.47 + 0.9) + 0.48 * Math.sin(ts * 0.68 + 2.2));
      const aliveZ =
        aliveMul *
        ALIVE_POS_Z *
        (0.55 * Math.sin(ts * 0.39 + 2.0) + 0.45 * Math.sin(ts * 0.57 + 0.6));
      const swayRx =
        aliveMul *
        ALIVE_ROT_X *
        (0.6 * Math.sin(ts * 0.41 + 0.3) + 0.4 * Math.sin(ts * 0.55 + 1.8));
      const swayRy =
        aliveMul *
        ALIVE_ROT_Y *
        (0.55 * Math.sin(ts * 0.44 + 1.2) + 0.45 * Math.sin(ts * 0.36 + 2.5));
      const swayRz = aliveMul * ALIVE_ROT_Z * Math.sin(ts * 0.33 + 0.7);

      groupRef.current.rotation.set(r.x + swayRx, r.y + swayRy, swayRz);
      groupRef.current.scale.setScalar(jScale);
      groupRef.current.position.set(jpx + aliveX, jpy + aliveY, jpz + aliveZ);
    }

    const reportFps = onFpsRef.current;
    if (reportFps) {
      const s = fpsSampleRef.current;
      s.frames += 1;
      s.elapsed += delta;
      if (s.elapsed >= 0.5) {
        reportFps(s.frames / s.elapsed);
        s.frames = 0;
        s.elapsed = 0;
      }
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 4]} fov={75} />

      <group visible={visualVisible && sceneReady}>
        {showHeroCape && <HeroCapeMesh breathScale={breathScaleOut} />}
        {showThrone && <ThroneMesh breathScale={breathScaleOut} />}

        <group ref={groupRef}>
          <primitive object={mc} />
        </group>

        {/* Crown after marching-cubes so it paints on top; z toward camera clears the blob shell. */}
        {showCrown2 && <Crown2Mesh breathScale={breathScaleOut} />}
      </group>
    </>
  );
}

type HomeBlobProps = {
  /** Multiple face layers can be on at once (hat + sunglasses, etc.). */
  faceMoods?: MoodState[];
  breathingEnabled?: boolean;
  /** Show gold / wood throne mesh behind the blob in WebGL. */
  showThrone?: boolean;
  /** TEMP DEBUG: when provided, overrides visual from scenario-based meaning for validation */
  blobVisualMeaning?: BlobVisualMeaning;
  /** Tasks completed today (used for heart morph threshold). Omit to disable morph ticking. */
  completedTasksToday?: number;
  heartTaskThreshold?: number;
  dropMorphConfig?: Partial<DropMorphConfig>;
  /** TEMP DEV: Drop heart morph test hooks (home screen __DEV__ only) */
  debugHeartTriggerNonce?: number;
  debugHeartResetNonce?: number;
  onMorphDebugFrame?: (s: { phase: DropMorphPhase; heartMorph: number }) => void;
  /** When true, shows average FPS over the blob GL view. Disabled by default to avoid React state churn. */
  showFpsCounter?: boolean;
  /** Debug-only controls/overlays for tuning the blob. */
  showDebugControls?: boolean;
  /** Gold / rose / silver / etc. — see `@/src/blob/blobAppearancePresets`. */
  blobAppearancePresetId?: BlobAppearancePresetId;
  /** Direct metaball strength per lobe (0 = hidden); see `BlobMesh`. */
  lobeStrengths?: Record<LifeAreaLobeKey, number>;
  faceVisible?: boolean;
  /** The fluid Droplet look (default). */
  fluid?: boolean;
  /** Fires when the Droplet is held without dragging. */
  onLongPress?: () => void;
  /**
   * False pauses the render loop but keeps the scene, so coming back to Home resumes at
   * once instead of rebuilding the GL context, shaders and lighting.
   */
  active?: boolean;
};

export default function HomeBlob({
  faceMoods: faceMoodsProp,
  breathingEnabled = true,
  showThrone = false,
  blobVisualMeaning,
  completedTasksToday,
  heartTaskThreshold,
  dropMorphConfig,
  debugHeartTriggerNonce,
  debugHeartResetNonce,
  onMorphDebugFrame,
  showFpsCounter = false,
  showDebugControls = false,
  blobAppearancePresetId = DEFAULT_BLOB_APPEARANCE_ID,
  lobeStrengths,
  faceVisible: faceVisibleProp = true,
  onLongPress,
  active = true,
  fluid = true,
}: HomeBlobProps = {}) {
  const faceMoods = faceMoodsProp ?? ['happy', 'mouth_1'];

  const [mood] = useState<BlobMood>('calm');
  const [areaIntensities] = useState<AreaIntensities>(() => {
    const initial: Partial<AreaIntensities> = {};
    LIFE_AREAS.forEach((area, index) => {
      // simple spread 0.3..0.9 for now
      initial[area.key] = 0.3 + (index / Math.max(LIFE_AREAS.length - 1, 1)) * 0.6;
    });
    return initial as AreaIntensities;
  });

  const [debugFaceVisible, setDebugFaceVisible] = useState(true);
  const faceVisible = faceVisibleProp && debugFaceVisible;
  const [blobVisualReady, setBlobVisualReady] = useState(false);
  const [blobMaxSize, setBlobMaxSize] = useState(false);
  const [bakeRoomPmremNonce, setBakeRoomPmremNonce] = useState(0);
  const handleBlobFirstVisualReady = useCallback(() => {
    setBlobVisualReady(true);
  }, []);

  const breathScaleSV = useSharedValue(1);
  /** Must be a SharedValue — reading React `blobMaxSize` inside `useAnimatedStyle` thrashes the worklet when max toggles. */
  const faceLayoutMulSV = useSharedValue(1);
  useEffect(() => {
    faceLayoutMulSV.value = blobMaxSize ? 2 : 1;
  }, [blobMaxSize]);

  const faceBreathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathScaleSV.value * faceLayoutMulSV.value }],
  }));

  const dragRotationRef = useRef({ x: 0, y: 0 });
  const lastGestureDx = useRef(0);
  const lastGestureDy = useRef(0);
  const pendingBlobTapRef = useRef<PendingBlobTap | null>(null);
  const gestureLayoutRef = useRef({ w: 220, h: 200 });
  const tapDownRef = useRef({ t: 0, x: 0, y: 0 });
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  const [fpsDisplay, setFpsDisplay] = useState<number | null>(null);
  const reportFps = useCallback((fps: number) => {
    setFpsDisplay(Math.round(fps));
  }, []);

  const blobPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: evt => {
          tapDownRef.current = {
            t: Date.now(),
            x: evt.nativeEvent.locationX,
            y: evt.nativeEvent.locationY,
          };
          lastGestureDx.current = 0;
          lastGestureDy.current = 0;
          didLongPressRef.current = false;
          clearLongPressTimer();
          longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null;
            if (!onLongPressRef.current) return;
            didLongPressRef.current = true;
            onLongPressRef.current();
          }, BLOB_LONG_PRESS_MS);
        },
        onPanResponderMove: (_, gestureState) => {
          if (Math.hypot(gestureState.dx, gestureState.dy) > BLOB_LONG_PRESS_MAX_MOVE_PX) {
            clearLongPressTimer();
          }
          const dx = gestureState.dx - lastGestureDx.current;
          const dy = gestureState.dy - lastGestureDy.current;
          lastGestureDx.current = gestureState.dx;
          lastGestureDy.current = gestureState.dy;
          const r = dragRotationRef.current;
          r.y += dx * BLOB_DRAG_RAD_PER_PX;
          r.x += dy * BLOB_DRAG_RAD_PER_PX;
          r.x = Math.min(BLOB_MAX_PITCH_RAD, Math.max(-BLOB_MAX_PITCH_RAD, r.x));
        },
        onPanResponderRelease: evt => {
          clearLongPressTimer();
          if (didLongPressRef.current) return;
          const { w, h } = gestureLayoutRef.current;
          if (w < 8 || h < 8) return;
          const lx = evt.nativeEvent.locationX;
          const ly = evt.nativeEvent.locationY;
          const dt = Date.now() - tapDownRef.current.t;
          const moved = Math.hypot(lx - tapDownRef.current.x, ly - tapDownRef.current.y);
          if (moved < 16 && dt < 480) {
            pendingBlobTapRef.current = { x: lx, y: ly, w, h };
          }
        },
        onPanResponderTerminate: clearLongPressTimer,
      }),
    [clearLongPressTimer]
  );

  // Keeps the Droplet's state while Android rebuilds its 3D scene (see BlobPersistedState).
  const blobPersistRef = useRef<BlobPersistedState | null>(null);

  const blobViewHeight = blobMaxSize ? BLOB_VIEW_HEIGHT_MAX : BLOB_VIEW_HEIGHT;

  return (
    <View className="mb-0.5" style={styles.blobRoot}>
      <View
        pointerEvents={blobVisualReady ? 'auto' : 'none'}
        style={[styles.blobStack, { height: blobViewHeight }, !blobVisualReady && styles.blobStackPending]}
      >
      <View
        style={styles.blobGestureSurface}
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          gestureLayoutRef.current = { w: width, h: height };
        }}
      >
        <BlobCanvas
          pointerEvents="none"
          style={styles.blobCanvas}
          dpr={BLOB_CANVAS_DPR}
          frameloop={active ? 'always' : 'never'}
          gl={{
            alpha: true,
            antialias: false,
            powerPreference: 'high-performance',
          }}
          onCreated={({ gl }) => {
            guardExpoGlShaderLogs(gl);
            gl.setClearColor(0x000000, 0);
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = BLOB_ANDROID_DEVICE_CONTRAST ? 1.14 : 1.0;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <Suspense fallback={null}>
            <BlobMesh
              key={blobAppearancePresetId}
              mood={mood}
              areas={areaIntensities}
              lobeStrengths={lobeStrengths}
              breathingEnabled={breathingEnabled}
              breathScaleOut={breathScaleSV}
              dragRotationRef={dragRotationRef}
              pendingTapRef={pendingBlobTapRef}
              completedTasksToday={completedTasksToday}
              heartTaskThreshold={heartTaskThreshold}
              dropMorphConfig={dropMorphConfig}
              debugHeartTriggerNonce={debugHeartTriggerNonce}
              debugHeartResetNonce={debugHeartResetNonce}
              debugBakeRoomPmremNonce={bakeRoomPmremNonce}
              onMorphDebugFrame={onMorphDebugFrame}
              onFirstVisualReady={handleBlobFirstVisualReady}
              visualVisible={blobVisualReady}
              persistRef={blobPersistRef}
              showHeroCape={faceMoods.includes('cape')}
              showCrown2={faceMoods.includes('crown2')}
              showThrone={showThrone}
              fluid={fluid}
              appearancePresetId={blobAppearancePresetId}
              onFps={showFpsCounter ? reportFps : undefined}
              {...(blobVisualMeaning && {
                rippleAmp: blobVisualMeaning.rippleAmp,
                rippleSpeed: blobVisualMeaning.rippleSpeed,
                smoothness: blobVisualMeaning.sphericality,
                suppressLobes: blobVisualMeaning.suppressLobes,
                lobes: {
                  health: blobVisualMeaning.areaLobes.health,
                  relationships: blobVisualMeaning.areaLobes.relationships,
                  work: blobVisualMeaning.areaLobes.work,
                  home: blobVisualMeaning.areaLobes.home,
                  growth: blobVisualMeaning.areaLobes.growth,
                  sleep: blobVisualMeaning.areaLobes.growth,
                },
              })}
            />
          </Suspense>
        </BlobCanvas>
        <View style={styles.blobTouchOverlay} {...blobPanResponder.panHandlers} />
        {showFpsCounter && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 6,
              left: 8,
              zIndex: 10,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: 'rgba(0,0,0,0.55)',
            }}
          >
            <Text style={{ color: '#9f9', fontSize: 12, fontVariant: ['tabular-nums'] }}>
              {fpsDisplay == null ? 'FPS …' : `${fpsDisplay} FPS`}
            </Text>
          </View>
        )}
      </View>
      {faceVisible && (
        <Animated.View
          collapsable={false}
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: `${FACE_OVERLAY_TOP_PCT + (blobMaxSize ? FACE_OVERLAY_TOP_EXTRA_PCT_WHEN_MAX : 0)}%`,
              left: 0,
              right: 0,
              alignItems: 'center',
              zIndex: 2,
            },
            faceBreathStyle,
          ]}
        >
          <BlobFace activeMoods={faceMoods} />
        </Animated.View>
      )}
      {showDebugControls && (
        <View
          style={{
            position: 'absolute',
            left: 12,
            bottom: 8,
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
        >
          {Object.entries(areaIntensities)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([key, value]) => (
              <Text key={key} style={{ color: '#ffffff', fontSize: 10 }}>
                {`${key}: ${value.toFixed(2)}`}
              </Text>
            ))}
        </View>
      )}
    </View>
    {showDebugControls && (
      <View className="mt-0.5 items-center gap-0.5">
        <TouchableOpacity
          onPress={() => setDebugFaceVisible(v => !v)}
          className="self-center px-2.5 py-1.5 rounded-full bg-[#2E2D22]/70 border border-white/25"
          accessibilityRole="button"
          accessibilityLabel={faceVisible ? 'Hide blob face' : 'Show blob face'}
        >
          <Text className="text-[9px] text-white/90">{faceVisible ? 'Face off' : 'Face on'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setBlobMaxSize(v => !v)}
          className="self-center px-2.5 py-1.5 rounded-full bg-[#2E2D22]/70 border border-white/25"
          accessibilityRole="button"
          accessibilityLabel={blobMaxSize ? 'Use normal blob size' : 'Use maximum blob size'}
        >
          <Text className="text-[9px] text-white/90">{blobMaxSize ? 'Normal size' : 'Max size'}</Text>
        </TouchableOpacity>
        {__DEV__ && BLOB_ANDROID_RUNTIME_ROOM_ENVIRONMENT && (
          <TouchableOpacity
            onPress={() => setBakeRoomPmremNonce(v => v + 1)}
            className="self-center px-2.5 py-1.5 rounded-full bg-[#2E2D22]/70 border border-white/25"
            accessibilityRole="button"
            accessibilityLabel="Bake RoomEnvironment PMREM"
          >
            <Text className="text-[9px] text-white/90">Bake PMREM</Text>
          </TouchableOpacity>
        )}
      </View>
    )}
  </View>
  );
}

const styles = StyleSheet.create({
  blobStack: {
    position: 'relative',
    zIndex: 200,
    elevation: 200,
  },
  blobStackPending: {
    opacity: 0,
  },
  blobRoot: {
    position: 'relative',
    zIndex: 200,
    elevation: 200,
  },
  blobGestureSurface: {
    flex: 1,
    zIndex: 1,
  },
  blobCanvas: {
    flex: 1,
  },
  blobTouchOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    backgroundColor: 'transparent',
  },
});

export { BlobMesh as Drop };
export type { BlobAppearancePresetId, BlobAppearancePreset } from '@/src/blob/blobAppearancePresets';
export {
  BLOB_APPEARANCE_PRESETS,
  BLOB_APPEARANCE_PRESET_LIST,
  DEFAULT_BLOB_APPEARANCE_ID,
  getBlobAppearancePreset,
} from '@/src/blob/blobAppearancePresets';
export type { DropMorphPhase, DropMorphConfig } from '@/src/blob/dropMorphState';
