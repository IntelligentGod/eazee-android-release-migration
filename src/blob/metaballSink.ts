import * as THREE from 'three';

/** Must match GLSL `MAXB` / texture width in `blobRaymarchMaterial.ts`. */
export const MAX_METABALLS = 896;

export type MetaballReceiver = {
  addBall(ballx: number, bally: number, ballz: number, strength: number, subtract: number): void;
};

let overflowWarned = false;

/** CPU-side buffer of metaballs; uploaded to a float RGBA texture for the GPU raymarcher. */
export class MetaballSink implements MetaballReceiver {
  readonly data = new Float32Array(MAX_METABALLS * 4);
  count = 0;

  reset(): void {
    this.count = 0;
  }

  addBall(ballx: number, bally: number, ballz: number, strength: number, _subtract: number): void {
    if (this.count >= MAX_METABALLS) {
      if (!overflowWarned && __DEV__) {
        overflowWarned = true;
        console.warn('[blob] MetaballSink overflow — increase MAX_METABALLS or reduce heart density.');
      }
      return;
    }
    const o = this.count * 4;
    this.data[o] = ballx;
    this.data[o + 1] = bally;
    this.data[o + 2] = ballz;
    this.data[o + 3] = strength;
    this.count++;
  }
}

const _inv = new THREE.Matrix4();
const _ro = new THREE.Vector3();
const _rd = new THREE.Vector3();
const _pf = new THREE.Vector3();

export function sampleMetaballField(
  pf: THREE.Vector3,
  ballData: Float32Array,
  ballCount: number,
  subtract: number
): number {
  let sum = 0;
  for (let i = 0; i < ballCount; i++) {
    const o = i * 4;
    const dx = pf.x - ballData[o];
    const dy = pf.y - ballData[o + 1];
    const dz = pf.z - ballData[o + 2];
    const r2 = dx * dx + dy * dy + dz * dz + 1e-6;
    const s = ballData[o + 3];
    const v = s / r2 - subtract;
    if (v > 0) sum += v;
  }
  return sum;
}

/**
 * Ray vs blob in mesh local space ([-1,1]³ box, field in 0–1 via `p * 0.5 + 0.5`).
 * Returns true if a hit on the iso surface was found.
 */
export function rayMarchWorldHitOnBlob(
  worldRay: THREE.Ray,
  blobMeshMatrixWorld: THREE.Matrix4,
  ballData: Float32Array,
  ballCount: number,
  iso: number,
  subtract: number,
  outWorld: THREE.Vector3
): boolean {
  _inv.copy(blobMeshMatrixWorld).invert();
  _ro.copy(worldRay.origin).applyMatrix4(_inv);
  _rd.copy(worldRay.direction).transformDirection(_inv).normalize();

  const tHit = hitUnitBox(_ro, _rd);
  if (tHit === null) return false;
  let [tNear, tFar] = tHit;
  if (tFar < 0) return false;
  if (tNear < 0) tNear = 0;

  const step = 0.03;
  let t = tNear;
  let prevF = sampleFieldAlongRay(_ro, _rd, t, ballData, ballCount, subtract) - iso;
  let hitT = -1;
  for (let i = 0; i < 140 && t <= tFar; i++) {
    t += step;
    const f = sampleFieldAlongRay(_ro, _rd, t, ballData, ballCount, subtract) - iso;
    if (f >= 0 && prevF < 0) {
      let lo = t - step;
      let hi = t;
      for (let b = 0; b < 10; b++) {
        const mid = (lo + hi) * 0.5;
        const fm = sampleFieldAlongRay(_ro, _rd, mid, ballData, ballCount, subtract) - iso;
        if (fm >= 0) hi = mid;
        else lo = mid;
      }
      hitT = (lo + hi) * 0.5;
      break;
    }
    prevF = f;
  }
  if (hitT < 0) return false;

  outWorld.copy(_ro).addScaledVector(_rd, hitT).applyMatrix4(blobMeshMatrixWorld);
  return true;
}

function sampleFieldAlongRay(
  ro: THREE.Vector3,
  rd: THREE.Vector3,
  t: number,
  ballData: Float32Array,
  ballCount: number,
  subtract: number
): number {
  const x = ro.x + rd.x * t;
  const y = ro.y + rd.y * t;
  const z = ro.z + rd.z * t;
  _pf.set(x * 0.5 + 0.5, y * 0.5 + 0.5, z * 0.5 + 0.5);
  return sampleMetaballField(_pf, ballData, ballCount, subtract);
}

function hitUnitBox(ro: THREE.Vector3, rd: THREE.Vector3): [number, number] | null {
  const invX = rd.x !== 0 ? 1 / rd.x : 1e30;
  const invY = rd.y !== 0 ? 1 / rd.y : 1e30;
  const invZ = rd.z !== 0 ? 1 / rd.z : 1e30;
  let t1 = (-1 - ro.x) * invX;
  let t2 = (1 - ro.x) * invX;
  let tmin = Math.min(t1, t2);
  let tmax = Math.max(t1, t2);
  t1 = (-1 - ro.y) * invY;
  t2 = (1 - ro.y) * invY;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (-1 - ro.z) * invZ;
  t2 = (1 - ro.z) * invZ;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax < tmin || tmax < 0) return null;
  return [tmin, tmax];
}
