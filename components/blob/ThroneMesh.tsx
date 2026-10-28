import React, { useEffect, useMemo, useRef } from 'react';
import Constants from 'expo-constants';
import type { SharedValue } from 'react-native-reanimated';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Matches mesh breath multiplier applied in BlobMesh (`mc.scale` uses `breatheForHeart`). */
const BASE_THRONE_SCALE = 2.05 * 1.3 * 1.5;

/** Same default as `PerspectiveCamera` in BlobMesh (`position={[0, 0, 4]}`). */
const CAMERA_WORLD = new THREE.Vector3(0, 0, 4);

/** Seat + arms face local +Z toward camera before rotation. */
const CHAIR_FORWARD = new THREE.Vector3(0, 0, 1);

/** Centered on blob (x=0); deep −Z behind metaball. */
const CHAIR_GROUP_POSITION: [number, number, number] = [0, -0.65, -2.35];

/** Corner segments for {@link RoundedBoxGeometry} (higher = smoother fillets, more verts). */
const RB_SEGMENTS = 5;

/**
 * Real-device heuristic via expo-constants — Android emulators always have "sdk", "emulator",
 * or "generic" in their deviceName, real phones have proper model names. Avoids expo-device
 * which doesn't have a native side bundled into this project's Expo Go.
 */
function _isRealDevice(): boolean {
  const name = (Constants.deviceName ?? '').toLowerCase();
  return !(name.includes('sdk') || name.includes('emulator') || name.includes('generic'));
}

/** Dark purple velvet: folded nap + roughness variation (same idea as HeroCapeMesh). */
function makeDarkPurpleVelvetTextures() {
  const w = 256;
  const h = 256;
  const diffuse = new Uint8Array(w * h * 4);
  const rough = new Uint8Array(w * h * 4);

  const baseR = 58;
  const baseG = 28;
  const baseB = 82;

  for (let j = 0; j < h; j++) {
    const v = j / (h - 1);
    for (let i = 0; i < w; i++) {
      const u = i / (w - 1);
      const cx = Math.abs(u - 0.5) * 2;
      const edgeDark = Math.pow(cx, 1.45) * 0.55;
      const hemDark = Math.pow(1 - v, 1.15) * 0.28;
      const fold =
        Math.sin(u * Math.PI * 8 + v * 3.2) * 0.038 +
        Math.sin(u * Math.PI * 16 + v * 5.4) * 0.022;
      const deepFold = Math.pow(Math.abs(Math.sin((u - 0.5) * Math.PI * 4)), 2.2) * 0.14;
      const napSheen = Math.sin(u * Math.PI * 22 + v * 11) * 0.018;
      const shade = edgeDark + hemDark + deepFold - fold;

      const r = THREE.MathUtils.clamp(Math.floor(baseR - shade * 42 - v * 12 + napSheen * 30), 18, 110);
      const g = THREE.MathUtils.clamp(Math.floor(baseG - shade * 22 - v * 6), 8, 48);
      const b = THREE.MathUtils.clamp(Math.floor(baseB - shade * 48 - v * 14), 35, 130);

      const idx = (j * w + i) * 4;
      diffuse[idx] = r;
      diffuse[idx + 1] = g;
      diffuse[idx + 2] = b;
      diffuse[idx + 3] = 255;

      const roughness = THREE.MathUtils.clamp(
        Math.floor(148 + shade * 62 + deepFold * 38 + (1 - v) * 22 - napSheen * 35),
        78,
        252
      );
      rough[idx] = roughness;
      rough[idx + 1] = roughness;
      rough[idx + 2] = roughness;
      rough[idx + 3] = 255;
    }
  }

  const map = new THREE.DataTexture(diffuse, w, h);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.needsUpdate = true;

  const roughMap = new THREE.DataTexture(rough, w, h);
  roughMap.wrapS = THREE.ClampToEdgeWrapping;
  roughMap.wrapT = THREE.ClampToEdgeWrapping;
  roughMap.needsUpdate = true;

  return { map, roughMap };
}

function eulerRotateForwardToward(
  groupPosition: [number, number, number],
  target: THREE.Vector3
): [number, number, number] {
  const origin = new THREE.Vector3(...groupPosition);
  const dir = new THREE.Vector3().subVectors(target, origin).normalize();
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(CHAIR_FORWARD, dir);
  const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  return [euler.x, euler.y, euler.z];
}

type RoundedBoxProps = {
  material: THREE.MeshStandardMaterial;
  w: number;
  h: number;
  d: number;
  /** Requested fillet; clamped by RoundedBoxGeometry to half the shortest edge. */
  radius: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
};

/** Velvet block with soft edges (no sharp box corners). */
function VelvetRoundedBox({ material, w, h, d, radius, position, rotation }: RoundedBoxProps) {
  const geom = useMemo(() => {
    const r = Math.min(radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    return new RoundedBoxGeometry(w, h, d, RB_SEGMENTS, r);
  }, [w, h, d, radius]);

  useEffect(() => {
    return () => geom.dispose();
  }, [geom]);

  return (
    <mesh
      material={material}
      position={position}
      rotation={rotation}
      castShadow={false}
      receiveShadow={false}
      renderOrder={-3}
    >
      <primitive object={geom} attach="geometry" />
    </mesh>
  );
}

/**
 * Velvet armchair behind the blob; dark purple fabric. Scale follows blob breath when
 * {@link breathScale} is passed.
 */
export default function ThroneMesh({ breathScale }: { breathScale?: SharedValue<number> }) {
  const groupRef = useRef<THREE.Group>(null);

  const velvet = useMemo(() => {
    const { map, roughMap } = makeDarkPurpleVelvetTextures();
    const material = new THREE.MeshStandardMaterial({
      map,
      roughnessMap: roughMap,
      roughness: 0.94,
      metalness: 0.06,
      // Real phone falls back to a simpler env map; without a brighter emissive the velvet
      // reads as near-black on it. Emulator (rich env) keeps the original subtle glow.
      // Mirrors the same detection in HomeBlob (Constants.deviceName heuristic).
      emissive: new THREE.Color(_isRealDevice() ? 0x2a1438 : 0x140818),
      emissiveIntensity: _isRealDevice() ? 0.45 : 0.22,
      side: THREE.FrontSide,
    });
    const dispose = () => {
      material.dispose();
      map.dispose();
      roughMap.dispose();
    };
    return { material, dispose };
  }, []);

  useEffect(() => {
    return () => velvet.dispose();
  }, [velvet]);

  const rotation = useMemo(
    () => eulerRotateForwardToward(CHAIR_GROUP_POSITION, CAMERA_WORLD),
    []
  );

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const b = breathScale?.value ?? 1;
    g.scale.setScalar(BASE_THRONE_SCALE * b);
  });

  const mat = velvet.material;

  return (
    <group ref={groupRef} position={CHAIR_GROUP_POSITION} rotation={rotation} renderOrder={-3}>
      {/* Skirt / enclosed base */}
      <VelvetRoundedBox material={mat} w={1.02} h={0.24} d={0.68} radius={0.055} position={[0, -0.16, 0.02]} />

      {/* Seat cushion */}
      <VelvetRoundedBox material={mat} w={0.82} h={0.13} d={0.5} radius={0.056} position={[0, 0.06, 0.05]} />

      {/* Front seat roll — ellipsoid (no cylinder rim edges). */}
      <mesh
        material={mat}
        position={[0, 0.03, 0.33]}
        rotation={[0.45, 0, 0]}
        scale={[0.4, 0.065, 0.4]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={-3}
      >
        <sphereGeometry args={[1, 36, 28]} />
      </mesh>

      {/* Back cushion — slight recline */}
      <group position={[0, 0.26, -0.14]} rotation={[-0.2, 0, 0]}>
        <VelvetRoundedBox
          material={mat}
          w={0.78}
          h={0.52}
          d={0.12}
          radius={0.052}
          position={[0, 0.28, -0.06]}
        />
        {/* Head roll — ellipsoid */}
        <mesh
          material={mat}
          position={[0, 0.54, -0.02]}
          rotation={[0.35, 0, 0]}
          scale={[0.35, 0.055, 0.35]}
          castShadow={false}
          receiveShadow={false}
          renderOrder={-3}
        >
          <sphereGeometry args={[1, 32, 24]} />
        </mesh>
      </group>

      {/* Left arm — vertical panel + rolled front */}
      <group position={[-0.44, 0.1, 0.04]}>
        <VelvetRoundedBox material={mat} w={0.12} h={0.34} d={0.46} radius={0.048} />
        <mesh
          material={mat}
          position={[0.02, 0.12, 0.18]}
          rotation={[0, 0, 0.15]}
          castShadow={false}
          receiveShadow={false}
          renderOrder={-3}
        >
          <sphereGeometry args={[0.1, 22, 20]} />
        </mesh>
        {/* Capsule along local Y — rounded ends vs flat cylinder caps. */}
        <mesh
          material={mat}
          position={[0, -0.05, 0.22]}
          rotation={[1.2, 0, 0]}
          castShadow={false}
          receiveShadow={false}
          renderOrder={-3}
        >
          <capsuleGeometry args={[0.075, 0.07, 10, 18]} />
        </mesh>
      </group>

      {/* Right arm — mirror */}
      <group position={[0.44, 0.1, 0.04]}>
        <VelvetRoundedBox material={mat} w={0.12} h={0.34} d={0.46} radius={0.048} />
        <mesh
          material={mat}
          position={[-0.02, 0.12, 0.18]}
          rotation={[0, 0, -0.15]}
          castShadow={false}
          receiveShadow={false}
          renderOrder={-3}
        >
          <sphereGeometry args={[0.1, 22, 20]} />
        </mesh>
        <mesh
          material={mat}
          position={[0, -0.05, 0.22]}
          rotation={[1.2, 0, 0]}
          castShadow={false}
          receiveShadow={false}
          renderOrder={-3}
        >
          <capsuleGeometry args={[0.075, 0.07, 10, 18]} />
        </mesh>
      </group>

      {/* Short feet */}
      {(
        [
          [-0.38, -0.3, 0.22],
          [0.38, -0.3, 0.22],
          [-0.38, -0.3, -0.2],
          [0.38, -0.3, -0.2],
        ] as const
      ).map(([x, y, z], i) => (
        <VelvetRoundedBox
          key={i}
          material={mat}
          w={0.1}
          h={0.08}
          d={0.1}
          radius={0.042}
          position={[x, y, z]}
        />
      ))}
    </group>
  );
}
