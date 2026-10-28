import React, { useEffect, useMemo, useRef } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Sits on the metaball crown; scales with {@link breathScale} like cape / throne. */
const BASE_CROWN2_SCALE = 0.68;

const CAMERA_WORLD = new THREE.Vector3(0, 0, 4);

/** Band / peaks face local +Z before group rotation (same as {@link ThroneMesh}). */
const CROWN_FORWARD = new THREE.Vector3(0, 0, 1);

const CROWN2_GROUP_POSITION: [number, number, number] = [0, 0.94, 0.5];

const RB_SEG = 4;

/** Draw after marching-cubes (0); depthTest off so the organic surface cannot depth-occlude the crown. */
const CROWN_RENDER_ORDER = 50;
/** Ground shadow: must draw after blob (0) but before gold (see {@link CROWN_RENDER_ORDER}). */
const CROWN_SHADOW_RENDER_ORDER = CROWN_RENDER_ORDER - 1;

const BAND_H = 0.2;
/** Band center: chosen so band top (where peaks meet) stays fixed as {@link BAND_H} changes. */
const BAND_MESH_Y = -0.048;
const CONE_H = 0.48;
const BAND_TOP_Y = BAND_MESH_Y + BAND_H * 0.5;
const BAND_BOTTOM_Y = BAND_MESH_Y - BAND_H * 0.5;
const PEAK_GROUP_Y = BAND_TOP_Y + CONE_H * 0.5;

const HAT_GRAPHIC_VIEWBOX_H = 31;

/** Same path as HatGraphic ground shadow (BlobFace.tsx): lens under brim. */
function makeHatGroundShadowShape(): THREE.Shape {
  const fy = (svgY: number) => HAT_GRAPHIC_VIEWBOX_H - svgY;
  const s = new THREE.Shape();
  s.moveTo(5, fy(26.5));
  s.bezierCurveTo(5, fy(26.5), 23, fy(23.5), 41, fy(26.5));
  s.bezierCurveTo(41, fy(26.5), 23, fy(29.2), 5, fy(26.5));
  return s;
}

function pointInPolygon(x: number, y: number, poly: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const denom = yj - yi;
    if (Math.abs(denom) < 1e-12) continue;
    if (yi > y === yj > y) continue;
    const xInt = xi + ((y - yi) * (xj - xi)) / denom;
    if (x < xInt) inside = !inside;
  }
  return inside;
}

/** Radial gradient stops from HatGraphic shadowFill (objectBoundingBox-style on lens bbox). */
function hatShadowAlphaForRadialT(t: number): number {
  const pathOpacity = 0.85;
  let a: number;
  if (t <= 0.7) {
    a = 0.42 + (0.12 - 0.42) * (t / 0.7);
  } else {
    a = 0.12 * (1 - (t - 0.7) / 0.3);
  }
  return a * pathOpacity;
}

/**
 * Raster: exact hat lens silhouette + same radial as SvgRadialGradient shadowFill
 * (cx/cy/r 50%, stops at 0 / 70 / 100%), × Path opacity 0.85.
 */
function buildHatGroundShadowLensTexture(): {
  texture: THREE.DataTexture;
  planeW: number;
  planeH: number;
} {
  const shape = makeHatGroundShadowShape();
  const outline = shape.getPoints(96);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = 0.06 * Math.max(maxX - minX, maxY - minY);
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const bw = maxX - minX;
  const bh = maxY - minY;

  const texW = 256;
  const texH = Math.max(28, Math.min(256, Math.round(texW * (bh / bw))));
  const data = new Uint8Array(4 * texW * texH);

  for (let row = 0; row < texH; row++) {
    const y = minY + ((row + 0.5) / texH) * bh;
    for (let col = 0; col < texW; col++) {
      const x = minX + ((col + 0.5) / texW) * bw;
      const k = (row * texW + col) * 4;
      data[k] = 0;
      data[k + 1] = 0;
      data[k + 2] = 0;
      if (!pointInPolygon(x, y, outline)) {
        data[k + 3] = 0;
        continue;
      }
      const u = (x - minX) / bw;
      const v = (y - minY) / bh;
      const t = THREE.MathUtils.clamp(Math.hypot(u - 0.5, v - 0.5) / 0.5, 0, 1);
      data[k + 3] = Math.round(hatShadowAlphaForRadialT(t) * 255);
    }
  }

  const tex = new THREE.DataTexture(data, texW, texH, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;

  const worldPerHatUnit = 0.92 / 36;
  const planeW = bw * worldPerHatUnit;
  const planeH = bh * worldPerHatUnit;
  return { texture: tex, planeW, planeH };
}

function eulerRotateForwardToward(
  groupPosition: [number, number, number],
  target: THREE.Vector3
): [number, number, number] {
  const origin = new THREE.Vector3(...groupPosition);
  const dir = new THREE.Vector3().subVectors(target, origin).normalize();
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(CROWN_FORWARD, dir);
  const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  return [euler.x, euler.y, euler.z];
}

type PeakDef = { x: number; z: number; ry: number; scale: number };

const PEAKS: PeakDef[] = [
  { x: -0.33, z: 0.04, ry: 0.26, scale: 1.02 },
  { x: -0.165, z: 0.095, ry: 0.11, scale: 0.95 },
  { x: 0, z: 0.125, ry: 0, scale: 1 },
  { x: 0.165, z: 0.095, ry: -0.11, scale: 0.95 },
  { x: 0.33, z: 0.04, ry: -0.26, scale: 1.02 },
];

const BAND_D = 0.56;

function CrownGroundShadowMesh() {
  const { geometry, material, dispose } = useMemo(() => {
    const { texture, planeW, planeH } = buildHatGroundShadowLensTexture();
    const geometry = new THREE.PlaneGeometry(planeW, planeH);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const dispose = () => {
      geometry.dispose();
      texture.dispose();
      material.dispose();
    };
    return { geometry, material, dispose };
  }, []);

  useEffect(() => {
    return dispose;
  }, [dispose]);

  /**
   * Same silhouette + radial as HatGraphic: plane in XY (crown +Z faces camera), no circular stand-in.
   */
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, BAND_BOTTOM_Y - 0.026, 0.09]}
      castShadow={false}
      receiveShadow={false}
      renderOrder={CROWN_SHADOW_RENDER_ORDER}
    />
  );
}

function CrownBandMesh({
  gold,
  goldInner,
}: {
  gold: THREE.MeshPhysicalMaterial;
  goldInner: THREE.MeshPhysicalMaterial;
}) {
  const outerGeom = useMemo(
    () => new RoundedBoxGeometry(0.92, BAND_H, BAND_D, RB_SEG, 0.062),
    []
  );
  const innerGeom = useMemo(
    () => new RoundedBoxGeometry(0.82, BAND_H * 0.9, BAND_D * 0.72, RB_SEG, 0.048),
    []
  );

  useEffect(() => {
    return () => {
      outerGeom.dispose();
      innerGeom.dispose();
    };
  }, [outerGeom, innerGeom]);

  return (
    <>
      <mesh
        geometry={outerGeom}
        material={gold}
        position={[0, BAND_MESH_Y, 0]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={CROWN_RENDER_ORDER}
      />
      <mesh
        geometry={innerGeom}
        material={goldInner}
        position={[0, BAND_MESH_Y + 0.008, -0.072]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={CROWN_RENDER_ORDER}
      />
    </>
  );
}

function CrownBandRimMeshes({ gold }: { gold: THREE.MeshPhysicalMaterial }) {
  const topRim = useMemo(() => new THREE.TorusGeometry(0.31, 0.016, 10, 48), []);
  const bottomRim = useMemo(() => new THREE.TorusGeometry(0.33, 0.014, 8, 40), []);

  useEffect(() => {
    return () => {
      topRim.dispose();
      bottomRim.dispose();
    };
  }, [topRim, bottomRim]);

  return (
    <>
      <mesh
        geometry={topRim}
        material={gold}
        position={[0, BAND_TOP_Y - 0.01, 0.02]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1.38, 1, 0.68]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={CROWN_RENDER_ORDER + 1}
      />
      <mesh
        geometry={bottomRim}
        material={gold}
        position={[0, BAND_BOTTOM_Y + 0.022, 0.015]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1.32, 1, 0.66]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={CROWN_RENDER_ORDER + 1}
      />
    </>
  );
}

function CrownPeakMesh({
  gold,
  jewel,
  def,
}: {
  gold: THREE.MeshPhysicalMaterial;
  jewel: THREE.MeshPhysicalMaterial;
  def: PeakDef;
}) {
  const coneGeom = useMemo(() => new THREE.ConeGeometry(0.128 * def.scale, CONE_H, 12, 1), [def.scale]);
  const socketGeom = useMemo(
    () =>
      new THREE.CylinderGeometry(0.128 * def.scale * 0.92, 0.128 * def.scale * 1.02, 0.045, 14, 1),
    [def.scale]
  );
  const jewelGeom = useMemo(() => new THREE.SphereGeometry(0.052, 20, 16), []);
  const bezelGeom = useMemo(() => new THREE.TorusGeometry(0.056, 0.008, 8, 24), []);

  useEffect(() => {
    return () => {
      coneGeom.dispose();
      socketGeom.dispose();
      jewelGeom.dispose();
      bezelGeom.dispose();
    };
  }, [bezelGeom, coneGeom, jewelGeom, socketGeom]);

  const socketCenterY = -CONE_H * 0.5 - 0.0225;

  return (
    <group position={[def.x, PEAK_GROUP_Y, def.z]} rotation={[0.06, def.ry, 0]}>
      <mesh
        geometry={socketGeom}
        material={gold}
        position={[0, socketCenterY, 0]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={CROWN_RENDER_ORDER}
      />
      <mesh geometry={coneGeom} material={gold} castShadow={false} receiveShadow={false} renderOrder={CROWN_RENDER_ORDER} />
      <mesh
        geometry={bezelGeom}
        material={gold}
        position={[0, CONE_H * 0.5, 0]}
        rotation={[Math.PI / 2, 0.12, 0]}
        scale={[1, 1, 0.85]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={CROWN_RENDER_ORDER + 1}
      />
      <mesh
        geometry={jewelGeom}
        material={jewel}
        position={[0, CONE_H * 0.48, 0]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={CROWN_RENDER_ORDER + 2}
      />
    </group>
  );
}

/**
 * Five-point gold coronet in WebGL (same stack as throne / cape). Uses scene HDR from {@link BlobMesh}
 * for reflections — bright gold, high metalness, low roughness, strong clearcoat.
 */
export default function Crown2Mesh({ breathScale }: { breathScale?: SharedValue<number> }) {
  const groupRef = useRef<THREE.Group>(null);

  const { gold, goldInner, jewel, dispose } = useMemo(() => {
    const gold = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffd24a),
      emissive: new THREE.Color(0x4a2406),
      emissiveIntensity: 0.22,
      metalness: 1,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.018,
      envMapIntensity: 2.35,
      depthTest: false,
      depthWrite: true,
    });
    const goldInner = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xb8923a),
      emissive: new THREE.Color(0x2a1804),
      emissiveIntensity: 0.14,
      metalness: 0.82,
      roughness: 0.38,
      clearcoat: 0.45,
      clearcoatRoughness: 0.28,
      envMapIntensity: 1.15,
      depthTest: false,
      depthWrite: true,
    });
    const jewel = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xfff0c8),
      emissive: new THREE.Color(0x5c3010),
      emissiveIntensity: 0.12,
      metalness: 0.55,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      envMapIntensity: 2.05,
      depthTest: false,
      depthWrite: true,
    });
    const disposeFn = () => {
      gold.dispose();
      goldInner.dispose();
      jewel.dispose();
    };
    return { gold, goldInner, jewel, dispose: disposeFn };
  }, []);

  useEffect(() => {
    return dispose;
  }, [dispose]);

  const rotation = useMemo(() => eulerRotateForwardToward(CROWN2_GROUP_POSITION, CAMERA_WORLD), []);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const b = breathScale?.value ?? 1;
    const s = BASE_CROWN2_SCALE * b;
    g.scale.set(s * 0.985, s * 1.06, s * 0.985);
    const dy = 0.14 * (b - 1);
    g.position.set(0, dy, 0);
  });

  return (
    <group position={CROWN2_GROUP_POSITION} rotation={rotation} renderOrder={CROWN_RENDER_ORDER}>
      <group ref={groupRef}>
        <group rotation={[-0.06, 0, 0]}>
          <CrownGroundShadowMesh />
          <CrownBandMesh gold={gold} goldInner={goldInner} />
          <CrownBandRimMeshes gold={gold} />
          {PEAKS.map((p, i) => (
            <CrownPeakMesh key={i} gold={gold} jewel={jewel} def={p} />
          ))}
        </group>
      </group>
    </group>
  );
}
