import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

import { buildStudioRoomEquirect } from '@/components/blob/HomeBlob';
import { getBlobAppearancePreset } from '@/src/blob/blobAppearancePresets';

import { guardExpoGlShaderLogs } from '@/lib/expoGlGuards';
/** Small grid: the droplet is only drawn at thumbnail size, so 24³ cells look smooth and stay cheap. */
const GRID_RESOLUTION = 24;
const MAX_POLYGONS = 20_000;
const FIELD_SUBTRACT = 12;
const MAX_FRAME_DELTA_SEC = 1 / 20;

/**
 * Satellite droplets orbiting the main body. Each one drifts in and out, so it merges into
 * the body and pinches off again, like splashing liquid gold.
 */
const SATELLITES = [
  { strength: 0.32, radius: 0.2, reach: 0.07, speed: 0.55, reachSpeed: 0.9, tilt: 0.4, phase: 0 },
  { strength: 0.22, radius: 0.24, reach: 0.08, speed: -0.42, reachSpeed: 1.2, tilt: -0.9, phase: 2.1 },
  { strength: 0.16, radius: 0.27, reach: 0.06, speed: 0.7, reachSpeed: 0.7, tilt: 1.3, phase: 4.0 },
  { strength: 0.42, radius: 0.12, reach: 0.05, speed: -0.3, reachSpeed: 1.0, tilt: 0.2, phase: 1.0 },
] as const;

function LiquidGoldScene({ animate }: { animate: boolean }) {
  const { gl, scene } = useThree();
  const elapsedRef = useRef(0);
  const goldPreset = getBlobAppearancePreset('liquidGold');

  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const equirect = buildStudioRoomEquirect();
    const environment = pmrem.fromEquirectangular(equirect);
    scene.environment = environment.texture;
    equirect.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      environment.dispose();
    };
  }, [gl, scene]);

  const liquid = useMemo(() => {
    const material = new THREE.MeshPhysicalMaterial(goldPreset.material);
    const cubes = new MarchingCubes(GRID_RESOLUTION, material, false, false, MAX_POLYGONS);
    cubes.isolation = 60;
    return cubes;
  }, [goldPreset]);

  useLayoutEffect(
    () => () => {
      liquid.geometry.dispose();
      (liquid.material as THREE.Material).dispose();
    },
    [liquid]
  );

  useFrame((_, delta) => {
    if (animate) elapsedRef.current += Math.min(delta, MAX_FRAME_DELTA_SEC);
    const t = elapsedRef.current;

    liquid.reset();
    // Main body: two overlapping balls that sway apart, so the outline keeps changing shape.
    liquid.addBall(0.5 + 0.05 * Math.sin(t * 0.8), 0.5 + 0.04 * Math.cos(t * 0.6), 0.5, 0.95, FIELD_SUBTRACT);
    liquid.addBall(0.5 - 0.06 * Math.sin(t * 0.7 + 1), 0.48 + 0.05 * Math.sin(t * 0.9), 0.5 + 0.04 * Math.cos(t * 0.5), 0.7, FIELD_SUBTRACT);
    for (const s of SATELLITES) {
      const angle = t * s.speed + s.phase;
      const distance = s.radius + s.reach * Math.sin(t * s.reachSpeed + s.phase);
      liquid.addBall(
        0.5 + distance * Math.cos(angle),
        0.5 + distance * Math.sin(angle) * Math.cos(s.tilt),
        0.5 + distance * Math.sin(angle) * Math.sin(s.tilt),
        s.strength,
        FIELD_SUBTRACT
      );
    }
    liquid.update();
    liquid.rotation.set(0.25 * Math.sin(t * 0.3), t * 0.25, 0.1 * Math.sin(t * 0.4));
  });

  return (
    <>
      <directionalLight position={goldPreset.keyLight.position} intensity={goldPreset.keyLight.intensityIos} />
      <primitive object={liquid} />
    </>
  );
}

/**
 * A real-time 3D liquid gold droplet: metaballs that wobble, split off small droplets and
 * swallow them again, rendered with the same gold material and studio lighting as the Home
 * blob. With Reduce Motion on, it draws one still frame.
 */
export default function GoldDroplet3D() {
  const isMotionReduced = useReducedMotion();
  return (
    <Canvas
      style={styles.canvas}
      frameloop={isMotionReduced ? 'demand' : 'always'}
      camera={{ position: [0, 0, 1.8], fov: 40 }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl }) => {
        guardExpoGlShaderLogs(gl);
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <LiquidGoldScene animate={!isMotionReduced} />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: '100%',
    height: '100%',
  },
});
