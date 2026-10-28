import React, { useEffect, useMemo, useRef } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';

/** World scale; cape reads behind / around the metaball. */
const BASE_CAPE_SCALE = 2.05;

const CAMERA_WORLD = new THREE.Vector3(0, 0, 4);

/** Fabric outward normal trends toward local +Z before group rotation. */
const CAPE_FORWARD = new THREE.Vector3(0, 0, 1);

/** Lower Y = whole cape sits further down on the blob. */
const CAPE_GROUP_POSITION: [number, number, number] = [0, 0.13, -0.46];

function eulerRotateForwardToward(
  groupPosition: [number, number, number],
  target: THREE.Vector3
): [number, number, number] {
  const origin = new THREE.Vector3(...groupPosition);
  const dir = new THREE.Vector3().subVectors(target, origin).normalize();
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(CAPE_FORWARD, dir);
  const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  return [euler.x, euler.y, euler.z];
}

/**
 * Single continuous fabric sheet: narrow at neck, wide at hem, no straight span — curves in x/y/z
 * (scalloped hem, shoulder arc, wind billow toward +Z / camera).
 */
function buildCapeFabricGeometry(): THREE.BufferGeometry {
  const segU = 44;
  const segV = 40;
  const neckHalf = 0.152;
  const hemHalf = 0.92;
  const topY = 0.54;
  const vertSpan = 1.38;

  const halfWidth = (v: number) => {
    const t = Math.pow(THREE.MathUtils.clamp(v, 0, 1), 0.74);
    return neckHalf + (hemHalf - neckHalf) * t;
  };

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const vid = (i: number, j: number) => j * (segU + 1) + i;

  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const s = u * 2 - 1;

      const hw = halfWidth(v);
      const shoulderEase = 1 - Math.pow(v, 1.25);
      const edgeRound = Math.pow(Math.abs(s), 1.85);
      const sideSweep = shoulderEase * 0.14 * (1 - 0.45 * edgeRound);
      let x = s * hw + Math.sin(s * Math.PI) * sideSweep;
      x += 0.026 * (1 - v) * Math.sin(s * Math.PI * 2.2);
      x += 0.018 * v * Math.sin(s * Math.PI * 5 + v * 3);

      const vEase = Math.pow(v, 0.9);
      let y = topY - vertSpan * vEase;
      y += 0.024 * v * Math.sin(s * Math.PI * 3.5);
      const hemBlend = THREE.MathUtils.smoothstep(v, 0.68, 1);
      y += 0.052 * hemBlend * Math.sin(s * Math.PI * 5.2 + v * 2.4);
      y -= (1 - v) * 0.048 * (1 - s * s);

      let z =
        0.19 * v * v * Math.cos(s * Math.PI * 0.38) +
        0.055 * v * Math.sin(s * Math.PI * 5.5 + v * 4.2) +
        0.034 * v * Math.sin(s * Math.PI * 8 + v * 5.5) +
        0.042 * v * v * s * Math.sin(v * 10.2);
      z += 0.028 * (1 - v) * Math.sin(s * Math.PI * 2.5);
      z += 0.022 * hemBlend * Math.sin(s * Math.PI * 6.5);

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = vid(i, j);
      const b = vid(i + 1, j);
      const c = vid(i, j + 1);
      const d = vid(i + 1, j + 1);
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Matte hero-red velvet (procedural). */
function makeCapeVelvetTextures() {
  const w = 256;
  const h = 256;
  const diffuse = new Uint8Array(w * h * 4);
  const rough = new Uint8Array(w * h * 4);
  const baseR = 168;
  const baseG = 14;
  const baseB = 26;

  for (let j = 0; j < h; j++) {
    const v = j / (h - 1);
    for (let i = 0; i < w; i++) {
      const u = i / (w - 1);
      const cx = Math.abs(u - 0.5) * 2;
      const edgeDark = Math.pow(cx, 1.5) * 0.62;
      const hemDark = Math.pow(1 - v, 1.12) * 0.32;
      const fold =
        Math.sin(u * Math.PI * 8 + v * 3.1) * 0.04 +
        Math.sin(u * Math.PI * 16 + v * 5.2) * 0.022;
      const deepFold = Math.pow(Math.abs(Math.sin((u - 0.5) * Math.PI * 3.5)), 2.4) * 0.13;
      const hemWave = v > 0.68 ? Math.sin(u * Math.PI * 10) * 0.06 * Math.pow((v - 0.68) / 0.32, 1.35) : 0;
      const shade = edgeDark + hemDark + deepFold - fold + hemWave;

      const r = THREE.MathUtils.clamp(Math.floor(baseR - shade * 48 - v * 28), 42, 198);
      const g = THREE.MathUtils.clamp(Math.floor(baseG - shade * 10 - v * 6), 4, 52);
      const b = THREE.MathUtils.clamp(Math.floor(baseB - shade * 14 - v * 8), 6, 58);

      const idx = (j * w + i) * 4;
      diffuse[idx] = r;
      diffuse[idx + 1] = g;
      diffuse[idx + 2] = b;
      diffuse[idx + 3] = 255;

      const roughness = THREE.MathUtils.clamp(
        Math.floor(188 + shade * 48 + deepFold * 32 + (1 - v) * 36),
        155,
        255
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

/**
 * Hero cape: one curved parametric sheet (trapezoid flare, wavy hem, wind billow).
 * Faces the camera like {@link ThroneMesh}.
 */
export default function HeroCapeMesh({ breathScale }: { breathScale?: SharedValue<number> }) {
  const groupRef = useRef<THREE.Group>(null);

  const { fabricGeometry, capeMaterials } = useMemo(() => {
    const fabricGeometry = buildCapeFabricGeometry();
    const { map, roughMap } = makeCapeVelvetTextures();
    const velvet = new THREE.MeshStandardMaterial({
      map,
      roughnessMap: roughMap,
      roughness: 0.98,
      metalness: 0,
      emissive: new THREE.Color(0x120206),
      emissiveIntensity: 0.06,
      side: THREE.DoubleSide,
    });

    const dispose = () => {
      fabricGeometry.dispose();
      velvet.dispose();
      map.dispose();
      roughMap.dispose();
    };

    return { fabricGeometry, capeMaterials: { velvet, dispose } };
  }, []);

  useEffect(() => {
    return () => capeMaterials.dispose();
  }, [capeMaterials]);

  const rotation = useMemo(() => eulerRotateForwardToward(CAPE_GROUP_POSITION, CAMERA_WORLD), []);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const b = breathScale?.value ?? 1;
    g.scale.setScalar(BASE_CAPE_SCALE * b);
  });

  const mat = capeMaterials.velvet;

  return (
    <group ref={groupRef} position={CAPE_GROUP_POSITION} rotation={rotation} renderOrder={-2}>
      <group rotation={[0.12, 0, 0]}>
        <mesh
          geometry={fabricGeometry}
          material={mat}
          castShadow={false}
          receiveShadow={false}
          renderOrder={-2}
        />
      </group>
    </group>
  );
}
