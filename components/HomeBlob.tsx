import React, { Suspense, memo, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import type { BlobVisualMeaning } from '@/src/blob/blobMeaning';

import { guardExpoGlShaderLogs } from '@/lib/expoGlGuards';
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
  breatheSpeed: number;
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
    breatheSpeed: 0.6,
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
    breatheSpeed: 0.8,
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
    breatheSpeed: 1.2,
    bobAmp: 1 / 4.5,
    bobSpeed: 1 / 1.1,
    rotSpeed: 0.09,
    ambientIntensity: 1.3,
    keyIntensity: 2.2,
  },
};

type MutableMoodPreset = {
  [K in keyof MoodPreset]: number;
};

type AreaIntensities = Record<LifeArea, number>;

export type BlobMeshVisualProps = {
  rippleAmp: number;
  rippleFreq: number;
  rippleSpeed: number;
  smoothness: number;
  lobes: {
    health: number;
    relationships: number;
    work: number;
    home: number;
    growth: number;
  };
};

/** Life-area keys for the 5 lobe directions (order matches LOBE_DIRECTIONS). */
const LIFE_AREA_LOBE_KEYS = ['health', 'relationships', 'work', 'home', 'growth'] as const;
type LifeAreaLobeKey = (typeof LIFE_AREA_LOBE_KEYS)[number];

function normalizeDir(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Fixed, normalized direction vectors for the 5 life-area lobes.
 * Spread around the blob to avoid clustering. Do not randomize.
 * Coordinate convention: +Y up, +X right, +Z forward.
 */
const LOBE_DIRECTIONS: Record<LifeAreaLobeKey, [number, number, number]> = {
  health: normalizeDir([-0.97, 0.12, 0.12]),        // broad left arm
  relationships: normalizeDir([0.56, 0.82, 0.08]), // tall upper-right lobe
  work: normalizeDir([0.96, -0.16, 0.08]),         // stretched right-lower arm
  home: normalizeDir([-0.04, -1, -0.02]),          // heavy bottom belly
  growth: normalizeDir([0.02, 0.99, -0.1]),        // small top crest
};

const LOBE_SHAPE_PROFILES: Record<
  LifeAreaLobeKey,
  {
    bulb: number;
    bridge: number;
    distance: number;
    lift: number;
    shoulder: number;
    sway: number;
    tip: number;
  }
> = {
  health: { bulb: 1.22, bridge: 0.94, distance: 1.02, lift: -0.02, shoulder: 1.28, sway: 0.95, tip: 1.1 },
  relationships: { bulb: 1.2, bridge: 0.92, distance: 1.06, lift: 0.12, shoulder: 1.08, sway: 0.82, tip: 1.12 },
  work: { bulb: 1.16, bridge: 0.92, distance: 1.02, lift: -0.1, shoulder: 1.02, sway: 0.82, tip: 1.12 },
  home: { bulb: 1.26, bridge: 0.98, distance: 1.12, lift: -0.14, shoulder: 1.26, sway: 0.58, tip: 1.12 },
  growth: { bulb: 0.7, bridge: 0.88, distance: 0.62, lift: 0.14, shoulder: 0.8, sway: 0.45, tip: 0.6 },
};

const RES = 24;
const ISO = 58;
const CHILD_OFFSET = 0.93 * 1.6;
const MARGIN = 0.44 * 1.6;
const DRIFT = 0.05;
const MARGIN_GRID = 0.12;
const HONEY_SAG = 0.06;
const MOTION_SPEED = 0.3;
const MOTION_SMOOTH_STEPS = 50;
const BLOB_BASE_Y = 0.26;

function clampToGrid(px: number, py: number, pz: number): [number, number, number] {
  const m = MARGIN_GRID;
  return [
    THREE.MathUtils.clamp(px, m, 1 - m),
    THREE.MathUtils.clamp(py, m, 1 - m),
    THREE.MathUtils.clamp(pz, m, 1 - m),
  ];
}

const DROPLETS: {
  dir: [number, number, number];
  dist: number;
  size: number;
}[] = [
  { dir: [-0.42, 0.9, 0.02], dist: 1.54, size: 0.48 },
  { dir: [0.42, 0.92, 0.01], dist: 1.68, size: 0.3 },
  { dir: [-0.98, 0.08, 0.03], dist: 1.48, size: 0.6 },
  { dir: [-0.5, -0.82, 0.04], dist: 1.34, size: 0.34 },
  { dir: [0.98, 0.02, 0.02], dist: 1.5, size: 0.48 },
  { dir: [0.86, -0.34, -0.02], dist: 1.56, size: 0.32 },
  { dir: [0.2, -0.98, -0.02], dist: 1.62, size: 0.18 },
];

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
  },
};

const SMOOTH_VISUAL_ALPHA_RATE = 6;
const HDR_ENV_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_02_puresky_1k.hdr';
function BlobMesh({
  mood,
  areas,
  isActive = true,
  rippleAmp = DEFAULT_VISUAL.rippleAmp,
  rippleFreq = DEFAULT_VISUAL.rippleFreq,
  rippleSpeed = DEFAULT_VISUAL.rippleSpeed,
  smoothness = DEFAULT_VISUAL.smoothness,
  lobes = DEFAULT_VISUAL.lobes,
  dropletCount = 0,
}: {
  mood: BlobMood;
  areas: AreaIntensities;
  isActive?: boolean;
  dropletCount?: number;
} & Partial<BlobMeshVisualProps>) {
  const blobGroupRef = useRef<THREE.Group>(null);
  const dropletGroupRef = useRef<THREE.Group>(null);
  const dropletRefs = useRef<(THREE.Mesh | null)[]>([]);
  const currentPresetRef = useRef<MutableMoodPreset>({ ...MOOD_PRESETS[mood] });
  const smoothTRef = useRef(0);
  const smoothedVisualRef = useRef({
    smoothness: DEFAULT_VISUAL.smoothness,
    lobes: { ...DEFAULT_VISUAL.lobes },
    rippleAmp: DEFAULT_VISUAL.rippleAmp,
    rippleSpeed: DEFAULT_VISUAL.rippleSpeed,
  });
  const { scene, gl } = useThree();

  useEffect(() => {
    let isDisposed = false;
    const pmrem = new THREE.PMREMGenerator(gl);
    let hdrRenderTarget: THREE.WebGLRenderTarget | null = null;
    let fallbackRenderTarget: THREE.WebGLRenderTarget | null = pmrem.fromScene(new RoomEnvironment(), 0.04);

    scene.environment = fallbackRenderTarget.texture;
    scene.background = null;

    const ambient = new THREE.AmbientLight(0xffecc0, 0.58);
    const hemi = new THREE.HemisphereLight(0xffe6ae, 0x4b2802, 0.32);
    scene.add(ambient);
    scene.add(hemi);

    const rgbeLoader = new RGBELoader();
    rgbeLoader.setDataType(THREE.HalfFloatType);
    rgbeLoader.load(
      HDR_ENV_URL,
      texture => {
        if (isDisposed) {
          texture.dispose();
          return;
        }

        hdrRenderTarget = pmrem.fromEquirectangular(texture);
        scene.environment = hdrRenderTarget.texture;
        fallbackRenderTarget?.dispose();
        fallbackRenderTarget = null;
        texture.dispose();
      },
      undefined,
      error => {
        console.warn('Failed to load blob HDR environment', error);
      }
    );

    return () => {
      isDisposed = true;
      scene.environment = null;
      scene.remove(ambient);
      scene.remove(hemi);
      hdrRenderTarget?.dispose();
      fallbackRenderTarget?.dispose();
      pmrem.dispose();
    };
  }, [scene, gl]);

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#d79a28',
        metalness: 0.9,
        roughness: 0.05,
        clearcoat: 0.28,
        clearcoatRoughness: 0.04,
        emissive: '#000000',
        emissiveIntensity: 0,
        envMapIntensity: 2.15,
      }),
    []
  );

  const dropletMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#d79a28',
        metalness: 0.92,
        roughness: 0.04,
        clearcoat: 0.22,
        clearcoatRoughness: 0.035,
        emissive: '#000000',
        emissiveIntensity: 0,
        envMapIntensity: 2.05,
      }),
    []
  );

  const mc = useMemo(() => {
    const m = new MarchingCubes(RES, material, false, false, 200000);
    m.isolation = ISO;
    m.enableUvs = false;
    m.enableColors = false;
    m.scale.setScalar(1);
    return m;
  }, [material]);

  useFrame(({ clock }, delta) => {
    if (!isActive) {
      return;
    }

    const dt = delta;
    const t = clock.elapsedTime;
    const blend = 1 / MOTION_SMOOTH_STEPS;
    smoothTRef.current += (t - smoothTRef.current) * blend;
    const tSmooth = smoothTRef.current;
    const tSlow = tSmooth * MOTION_SPEED;

    const sm = smoothedVisualRef.current;
    const visualAlpha = 1 - Math.exp(-dt * SMOOTH_VISUAL_ALPHA_RATE);
    sm.smoothness += (smoothness - sm.smoothness) * visualAlpha;
    sm.rippleAmp += (rippleAmp - sm.rippleAmp) * visualAlpha;
    sm.rippleSpeed += (rippleSpeed - sm.rippleSpeed) * visualAlpha;
    LIFE_AREA_LOBE_KEYS.forEach(key => {
      sm.lobes[key] += (lobes[key] - sm.lobes[key]) * visualAlpha;
    });

    const target = MOOD_PRESETS[mood];
    const current = currentPresetRef.current;
    const presetLerpAlpha = 1 - Math.exp(-dt / 0.4);
    (Object.keys(target) as (keyof MoodPreset)[]).forEach(key => {
      current[key] = THREE.MathUtils.lerp(current[key], target[key], presetLerpAlpha);
    });

    const totalLobePressure =
      (sm.lobes.health + sm.lobes.relationships + sm.lobes.work + sm.lobes.home + sm.lobes.growth) / 5;
    const strengthForVolume = 0.6;
    const lobeSmoothFactor = sm.smoothness > 0.92 ? 0.28 : sm.smoothness > 0.9 ? 0.6 : 1;
    const effectiveLobeAvg = (0.4 + 0.6 * totalLobePressure) * lobeSmoothFactor;
    const coreScaleForVolume = 1 - 0.1 * totalLobePressure;
    const coreScaleBoost = sm.smoothness > 0.9 && totalLobePressure < 0.2 ? 0.28 : 0;
    const coreStrengthCur = strengthForVolume * 9 * (coreScaleForVolume + coreScaleBoost);
    const LOBE_BALLS_PER_LOBE = 7;
    const baseLobeStr = strengthForVolume * 0.88 * 1.5;
    const lobeMassCur = 5 * baseLobeStr * 0.94 * effectiveLobeAvg * LOBE_BALLS_PER_LOBE;
    const massCur = coreStrengthCur + lobeMassCur;
    const refLobePressure = 0.5;
    const refSmoothness = 0.5;
    const refLobeFactor = refSmoothness > 0.92 ? 0.28 : refSmoothness > 0.9 ? 0.6 : 1;
    const refEffectiveLobe = (0.4 + 0.6 * refLobePressure) * refLobeFactor;
    const refCoreScale = 1 - 0.1 * refLobePressure;
    const refCoreStrength = strengthForVolume * 9 * refCoreScale;
    const refLobeMass = 5 * baseLobeStr * 0.94 * refEffectiveLobe * LOBE_BALLS_PER_LOBE;
    const massRef = refCoreStrength + refLobeMass;
    const fullCompensation = massRef > 0 && massCur > 0 ? Math.pow(massRef / massCur, 1 / 3) : 1;
    const volumeCompensation = 1 + (fullCompensation - 1) * 0.55;

    const breatheAmp = current.breatheAmp * 1.2;
    const breathe = 1 + Math.sin(tSlow * current.breatheSpeed) * breatheAmp;
    const scaleCompensate = 1 / (1 - 2 * MARGIN_GRID);
    mc.scale.setScalar(2.025 * 0.6 * breathe * scaleCompensate * volumeCompensation);
    mc.position.y = BLOB_BASE_Y + Math.sin(tSlow * current.bobSpeed) * current.bobAmp * 2.5;

    // Always rebuild the field each frame for now.
    mc.reset();

    /*
     * Blob deformation design rules (for future tuning):
     * - More spherical = more balanced life (smoothness/sphericality from balance/stress).
     * - Protrusions = pressure / neglect in specific life areas (each lobe = one area).
     * - Same total volume should be roughly preserved (core scales down when lobe pressure
     *   is high; avoid simply inflating everything).
     * - Ripples by state: calm = no ripples; normal = slight ripples; stressed = obvious ripples.
     */
    const subtract = 12;
    const strength = 0.6;
    const rawWobble = 0.16 + current.distort * 0.2;
    const wobbleAmt = rawWobble * (1 - sm.smoothness);

    let coreX = wobbleAmt * Math.sin(tSlow * 2.2);
    let coreY = wobbleAmt * Math.cos(tSlow * 2.0);
    let coreZ = wobbleAmt * Math.sin(tSlow * 2.4);
    coreX = Math.max(-MARGIN, Math.min(MARGIN, coreX));
    coreY = Math.max(-MARGIN, Math.min(MARGIN, coreY));
    coreZ = Math.max(-MARGIN, Math.min(MARGIN, coreZ));
    let coreScale = 1 - 0.1 * totalLobePressure;
    if (sm.smoothness > 0.9 && totalLobePressure < 0.2) {
      coreScale += 0.28;
    }
    const coreStrength = strength * 9 * coreScale;
    const [cpx, cpy, cpz] = clampToGrid(0.5 + coreX * 0.42, 0.5 + coreY * 0.42, 0.5 + coreZ * 0.42);
    mc.addBall(cpx, cpy, cpz, coreStrength * 0.92, subtract);
    const [lowerPx, lowerPy, lowerPz] = clampToGrid(
      0.5 + coreX * 0.12,
      0.5 + (coreY - 0.3) * 0.42,
      0.5 + coreZ * 0.1
    );
    mc.addBall(lowerPx, lowerPy, lowerPz, coreStrength * 0.42, subtract);
    const [upperPx, upperPy, upperPz] = clampToGrid(
      0.5 + coreX * 0.18,
      0.5 + (coreY + 0.08) * 0.42,
      0.5 + coreZ * 0.12
    );
    mc.addBall(upperPx, upperPy, upperPz, coreStrength * 0.34, subtract);

    const baseLobeStrength = strength * 0.88 * 1.5;

    // Ripple: driven by props (rippleAmp, rippleSpeed). Design: calm = no ripples;
    // normal = slight; stressed = obvious. Not applied to geometry (silhouette unchanged).

    // Five life-area lobes: each named area controls its matching rounded protrusion.
    // Larger prop value = larger protrusion; smaller = subtler. Redistributes shape, preserves central mass.
    LIFE_AREA_LOBE_KEYS.forEach((key, i) => {
      const dir = LOBE_DIRECTIONS[key];
      const profile = LOBE_SHAPE_PROFILES[key];
      const phase = i * 1.7;
      const driftX = DRIFT * profile.sway * Math.sin(tSlow * 0.09 + phase);
      const driftY = DRIFT * profile.sway * Math.cos(tSlow * 0.1 + phase + 1);
      const driftZ = DRIFT * profile.sway * Math.sin(tSlow * 0.08 + phase + 2);

      let x0 = dir[0] * CHILD_OFFSET + driftX;
      let y0 = dir[1] * CHILD_OFFSET + driftY - HONEY_SAG + profile.lift;
      let z0 = dir[2] * CHILD_OFFSET + driftZ;

      const dist = Math.hypot(x0, y0, z0) || 1;
      const ax = x0 / dist;
      const ay = y0 / dist;
      const az = z0 / dist;

      const clampedDist = Math.min(dist, MARGIN);
      const lobeVariation = 0.96 + 0.08 * Math.sin(phase + tSlow * 0.2);
      const neckDist = clampedDist * 0.74 * profile.distance * lobeVariation;
      const bulbDist = clampedDist * profile.distance;

      const lobeValue = sm.lobes[key];
      let effectiveLobe = 0.82 + 0.52 * lobeValue;
      if (sm.smoothness > 0.92) effectiveLobe *= 0.68;
      else if (sm.smoothness > 0.9) effectiveLobe *= 0.84;
      const sizeVariation = 0.94 + 0.12 * Math.cos(phase * 0.7);
      const bulbStrength = baseLobeStrength * sizeVariation * effectiveLobe * profile.bulb;
      const neckStrength = bulbStrength * 0.78;
      const bridgeStrength = (neckStrength + bulbStrength) * 0.42 * profile.bridge;
      const shoulderStrength = bulbStrength * 0.96 * profile.shoulder;
      const midStrength = bulbStrength * 0.98 * profile.shoulder;

      const shoulderDist = clampedDist * 0.28 * profile.shoulder * lobeVariation;
      let sx = ax * shoulderDist;
      let sy = ay * shoulderDist;
      let sz = az * shoulderDist;
      sx = Math.max(-MARGIN, Math.min(MARGIN, sx));
      sy = Math.max(-MARGIN, Math.min(MARGIN, sy));
      sz = Math.max(-MARGIN, Math.min(MARGIN, sz));
      const [spx, spy, spz] = clampToGrid(0.5 + sx * 0.42, 0.5 + sy * 0.42, 0.5 + sz * 0.42);
      mc.addBall(spx, spy, spz, shoulderStrength, subtract);

      const midDist = clampedDist * 0.48 * profile.distance * lobeVariation;
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
      mc.addBall(npx, npy, npz, neckStrength, subtract);

      const tipDist = clampedDist * 0.8 * profile.distance * profile.tip * lobeVariation;
      let tx = ax * tipDist;
      let ty = ay * tipDist;
      let tz = az * tipDist;
      tx = Math.max(-MARGIN, Math.min(MARGIN, tx));
      ty = Math.max(-MARGIN, Math.min(MARGIN, ty));
      tz = Math.max(-MARGIN, Math.min(MARGIN, tz));
      const [tpx, tpy, tpz] = clampToGrid(0.5 + tx * 0.42, 0.5 + ty * 0.42, 0.5 + tz * 0.42);
      mc.addBall(tpx, tpy, tpz, bulbStrength * 0.72, subtract);

      const innerMix = 0.42;
      const innerX = 0.5 + (nx + (bx - nx) * innerMix) * 0.42;
      const innerY = 0.5 + (ny + (by - ny) * innerMix) * 0.42;
      const innerZ = 0.5 + (nz + (bz - nz) * innerMix) * 0.42;
      const [ix, iy, iz] = clampToGrid(innerX, innerY, innerZ);
      mc.addBall(ix, iy, iz, (neckStrength + bridgeStrength) * 0.88, subtract);
      const bridgeMix = 0.62;
      const bridgeX = 0.5 + (nx + (bx - nx) * bridgeMix) * 0.42;
      const bridgeY = 0.5 + (ny + (by - ny) * bridgeMix) * 0.42;
      const bridgeZ = 0.5 + (nz + (bz - nz) * bridgeMix) * 0.42;
      const [brix, briy, briz] = clampToGrid(bridgeX, bridgeY, bridgeZ);
      mc.addBall(brix, briy, briz, bridgeStrength, subtract);

      const [bpx, bpy, bpz] = clampToGrid(0.5 + bx * 0.42, 0.5 + by * 0.42, 0.5 + bz * 0.42);
      mc.addBall(bpx, bpy, bpz, bulbStrength, subtract);
    });

    const dropletFloatSpeed = 0.08;
    const dropletDistInside = 0.56;
    const dropletDistOutside = 1.34;
    for (let i = 0; i < DROPLETS.length; i++) {
      const drop = DROPLETS[i];
      const mesh = dropletRefs.current[i];
      if (!mesh) {
        continue;
      }

      if (i >= dropletCount) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;

      const dropPhase = i * 1.9;
      const cycle = (t * dropletFloatSpeed + i * 0.137) % 1;
      let outAmount = 0;
      if (cycle < 0.28) {
        outAmount = THREE.MathUtils.smootherstep(cycle / 0.28, 0, 1);
      } else if (cycle < 0.74) {
        outAmount = 1;
      } else {
        outAmount = 1 - THREE.MathUtils.smootherstep((cycle - 0.74) / 0.26, 0, 1);
      }
      const [dx, dy, dz] = drop.dir;
      const directionalTravel =
        dx < -0.2 ? 0.84 : dx > 0.2 ? 1.02 : dy > 0.55 ? 1.08 : 1;
      const effectiveDist =
        drop.dist *
        (dropletDistInside + (dropletDistOutside - dropletDistInside) * outAmount) *
        directionalTravel;
      const len = Math.hypot(dx, dy, dz) || 1;
      let x = (dx / len) * effectiveDist;
      let y = (dy / len) * effectiveDist;
      let z = (dz / len) * effectiveDist;
      x += wobbleAmt * 0.08 * Math.sin(tSlow * 2.5 + dropPhase);
      y += wobbleAmt * 0.08 * Math.cos(tSlow * 2.8 + dropPhase);
      z += wobbleAmt * 0.08 * Math.sin(tSlow * 2.2 + dropPhase);

      const dropletScale = (0.14 + drop.size * 0.22) * (0.96 + 0.1 * outAmount);
      mesh.position.set(x * 0.96, y * 0.96, z * 0.96);
      mesh.scale.setScalar(dropletScale);
    }

    mc.update();


    if (blobGroupRef.current) {
      blobGroupRef.current.rotation.y = 0.14;
      blobGroupRef.current.rotation.x = 0.02;
      const squash = 1 + 0.035 * Math.sin(tSlow * 2.5) * (0.5 + current.distort * 0.5);
      blobGroupRef.current.scale.set(squash, 1 / squash, squash);
    }

    if (dropletGroupRef.current) {
      dropletGroupRef.current.rotation.y = 0.14;
      dropletGroupRef.current.rotation.x = 0.02;
      dropletGroupRef.current.position.y = mc.position.y;
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 4.02]} fov={75} />

      <group ref={blobGroupRef}>
        {/* react-three uses the `object` prop here even though JSX lint does not recognize it. */}
        {/* eslint-disable-next-line react/no-unknown-property */}
        <primitive object={mc} />
      </group>
      <group ref={dropletGroupRef}>
        {/* eslint-disable react/no-unknown-property */}
        {DROPLETS.map((drop, index) => (
          <mesh
            key={`${drop.dir.join(':')}-${index}`}
            ref={value => {
              dropletRefs.current[index] = value;
            }}
            material={dropletMaterial}
          >
            <sphereGeometry args={[1, 28, 28]} />
          </mesh>
        ))}
        {/* eslint-enable react/no-unknown-property */}
      </group>
    </>
  );
}

type HomeBlobProps = {
  blobMood?: BlobMood;
  blobVisualMeaning?: BlobVisualMeaning;
  dropletCount?: number;
  showDebugControls?: boolean;
  isActive?: boolean;
};

function HomeBlob({
  blobMood,
  blobVisualMeaning,
  dropletCount = 0,
  showDebugControls = false,
  isActive = true,
}: HomeBlobProps = {}) {
  const [debugMood, setDebugMood] = useState<BlobMood>('calm');
  const [areaIntensities] = useState<AreaIntensities>(() => {
    const initial: Partial<AreaIntensities> = {};
    LIFE_AREAS.forEach((area, index) => {
      // simple spread 0.3..0.9 for now
      initial[area.key] = 0.3 + (index / Math.max(LIFE_AREAS.length - 1, 1)) * 0.6;
    });
    return initial as AreaIntensities;
  });
  const mood = blobMood ?? debugMood;

  const cycleMood = () => {
    setDebugMood(prev => (prev === 'calm' ? 'normal' : prev === 'normal' ? 'stressed' : 'calm'));
  };

  return (
    <View className="h-[178px] mb-0">
      {isActive ? (
        <Canvas
          gl={{ alpha: true }}
          onCreated={({ gl }) => {
            guardExpoGlShaderLogs(gl);
            gl.setClearColor(0x000000, 0);
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.1;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <Suspense fallback={null}>
            {/* eslint-disable react/no-unknown-property */}
            <ambientLight color={0xffd684} intensity={0.24} />
            <directionalLight color={0xfff3cf} intensity={2.3} position={[5, 7, 5]} />
            <directionalLight color={0xffac33} intensity={1.02} position={[-4, 3, -3]} />
            {/* eslint-enable react/no-unknown-property */}
            <BlobMesh
              mood={mood}
              areas={areaIntensities}
              isActive={isActive}
              dropletCount={dropletCount}
              {...(blobVisualMeaning && {
                rippleAmp: blobVisualMeaning.rippleAmp,
                rippleSpeed: blobVisualMeaning.rippleSpeed,
                smoothness: blobVisualMeaning.sphericality,
                lobes: {
                  health: blobVisualMeaning.areaLobes.health,
                  relationships: blobVisualMeaning.areaLobes.relationships,
                  work: blobVisualMeaning.areaLobes.work,
                  home: blobVisualMeaning.areaLobes.home,
                  growth: blobVisualMeaning.areaLobes.growth,
                },
              })}
            />
          </Suspense>
        </Canvas>
      ) : null}
      {showDebugControls && isActive ? (
        <>
          <Pressable
            onPress={cycleMood}
            style={{
              position: 'absolute',
              right: 12,
              bottom: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.35)',
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 12 }}>{`Mood: ${mood}`}</Text>
          </Pressable>
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
        </>
      ) : null}
    </View>
  );
}

export default memo(HomeBlob);
