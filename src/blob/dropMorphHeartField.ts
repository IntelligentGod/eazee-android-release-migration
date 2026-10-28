import type { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

/**
 * Metaball heart field in the same normalized space as the blob (center ~0.5, * 0.42).
 * At full morph (locked): completely static — no time-based motion (emoji-like).
 */

const HEART_OUTLINE_SAMPLES = 56;
const HEART_INNER_SAMPLES = 12;
const HEART_XY_SCALE = 0.055;
const HEART_DEPTH_SCALE = 0.22;
/** At or above this weight, the heart is frozen (pure emoji silhouette, no wobble). */
const HEART_LOCK = 0.99;

/**
 * MC mesh +local Z aligns with world +Z; camera sits at +Z looking at origin, so larger
 * normalized pz is toward the viewer. Symmetric front/back metaballs can leave a field
 * “waist” in depth and a concave screen-facing surface — bias mass toward +pz.
 */
const Z_INTERIOR_BIAS = 0.028;
const OUTLINE_BACK_STR_MUL = 0.88;
const OUTLINE_FRONT_STR_MUL = 1.26;
const PZ_FRONT_EXTRUDE = 1.06;

function heartPoint(u: number): [number, number] {
  const hx = 16 * Math.pow(Math.sin(u), 3);
  const hy = 13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u);
  return [hx, hy];
}

/**
 * The parametric heart has a sharp inward notch at the top cleft; the implicit fill grid
 * often under-samples that ridge so the iso-surface keeps a dent. Dense balls along the
 * upper arc (especially |hx| small) plus a slight outward scale round the silhouette.
 */
function addTopCleftRidge(
  mc: MarchingCubes,
  subtract: number,
  w: number,
  clampToGrid: (px: number, py: number, pz: number) => [number, number, number],
  zCenter: number,
  zHalf: number,
  ridgeStr: number,
  xyScale: number
): void {
  const outward = 1.045;
  for (let k = 0; k < 22; k++) {
    const u = 0.95 + (k / 21) * 1.25;
    const [hx, hy] = heartPoint(u);
    if (Math.abs(hx) > 4.2) continue;
    const px = 0.5 + hx * HEART_XY_SCALE * 0.42 * xyScale * outward;
    const py = 0.5 + hy * HEART_XY_SCALE * 0.42 * xyScale * outward;
    for (const tz of [0.12, 0.42, 0.72, 1.0] as const) {
      const pz = zCenter - zHalf * 0.35 + zHalf * 1.35 * tz;
      const [gx, gy, gz] = clampToGrid(px, py, pz);
      mc.addBall(gx, gy, gz, ridgeStr, subtract);
    }
  }
}

/** Classic implicit heart; (x,y) in the usual math heart coordinates (point down for +y up if y negated). */
function implicitHeartInterior(x: number, y: number): boolean {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y < 0;
}

function addStaticEmojiHeart(
  mc: MarchingCubes,
  subtract: number,
  w: number,
  clampToGrid: (px: number, py: number, pz: number) => [number, number, number]
): void {
  const zCenter = 0.5;
  const zHalf = HEART_DEPTH_SCALE * 0.42 * 0.52;
  const outlineBase = 0.88 * w;
  const strBack = outlineBase * OUTLINE_BACK_STR_MUL;
  const strFront = outlineBase * OUTLINE_FRONT_STR_MUL;

  for (let i = 0; i < HEART_OUTLINE_SAMPLES; i++) {
    const u = (i / HEART_OUTLINE_SAMPLES) * Math.PI * 2;
    const [hx, hy] = heartPoint(u);
    const px = 0.5 + hx * HEART_XY_SCALE * 0.42;
    const py = 0.5 + hy * HEART_XY_SCALE * 0.42;
    const pz1 = zCenter - zHalf;
    const pz2 = zCenter + zHalf * PZ_FRONT_EXTRUDE;
    const [gx1, gy1, gz1] = clampToGrid(px, py, pz1);
    mc.addBall(gx1, gy1, gz1, strBack, subtract);
    const [gx2, gy2, gz2] = clampToGrid(px, py, pz2);
    mc.addBall(gx2, gy2, gz2, strFront, subtract);
  }

  const capStr = 0.36 * w;
  for (let i = 0; i < HEART_OUTLINE_SAMPLES; i += 2) {
    const u = (i / HEART_OUTLINE_SAMPLES) * Math.PI * 2;
    const [hx, hy] = heartPoint(u);
    const px = 0.5 + hx * HEART_XY_SCALE * 0.42;
    const py = 0.5 + hy * HEART_XY_SCALE * 0.42;
    const pzCap = zCenter + zHalf * 0.72;
    const [gx, gy, gz] = clampToGrid(px, py, pzCap);
    mc.addBall(gx, gy, gz, capStr, subtract);
  }

  const fillScale = HEART_XY_SCALE * 1.05;
  const fillStr = 0.22 * w;
  for (let ix = -8; ix <= 8; ix++) {
    for (let iy = -8; iy <= 8; iy++) {
      const x = ix * 0.15;
      const y = -iy * 0.15;
      if (!implicitHeartInterior(x, y)) continue;
      const px = 0.5 + x * fillScale * 0.42;
      const py = 0.5 + y * fillScale * 0.42;
      const pz = zCenter + Z_INTERIOR_BIAS;
      const [gx, gy, gz] = clampToGrid(px, py, pz);
      mc.addBall(gx, gy, gz, fillStr, subtract);
    }
  }

  // Smooth the top cleft (classic implicit heart has a V-notch); extra field on the center axis.
  const cleftStr = 0.62 * w;
  for (let sy = 0; sy <= 10; sy++) {
    const y = 0.38 + sy * 0.058;
    for (const sx of [0, -0.06, 0.06]) {
      const x = sx;
      if (!implicitHeartInterior(x, y)) continue;
      const px = 0.5 + x * fillScale * 0.42;
      const py = 0.5 + y * fillScale * 0.42;
      for (const t of [0.18, 0.68] as const) {
        const pz = zCenter + zHalf * (t - 0.32);
        const [gx, gy, gz] = clampToGrid(px, py, pz);
        mc.addBall(gx, gy, gz, cleftStr, subtract);
      }
    }
  }

  addTopCleftRidge(mc, subtract, w, clampToGrid, zCenter, zHalf, 0.58 * w, 1);

  const lobeStr = 0.95 * w;
  for (const u of [1.05, Math.PI * 2 - 1.05]) {
    const [lx, ly] = heartPoint(u);
    const px = 0.5 + lx * HEART_XY_SCALE * 0.42;
    const py = 0.5 + ly * HEART_XY_SCALE * 0.42;
    const [gx, gy, gz] = clampToGrid(px, py, zCenter + zHalf * 0.38);
    mc.addBall(gx, gy, gz, lobeStr, subtract);
  }
}

export function contributeHeartMorphField(
  mc: MarchingCubes,
  subtract: number,
  heartMorph: number,
  t: number,
  tSmooth: number,
  clampToGrid: (px: number, py: number, pz: number) => [number, number, number]
): void {
  if (heartMorph <= 0.0005) return;

  const w = heartMorph;

  if (w >= HEART_LOCK) {
    addStaticEmojiHeart(mc, subtract, w, clampToGrid);
    return;
  }

  const hold = w * w;
  const motionScale = Math.max(0.04, 1 - 0.96 * hold);
  const living = 1 + 0.045 * Math.sin(tSmooth * 1.35) * motionScale;
  const sway = 0.024 * Math.sin(tSmooth * 0.85) * motionScale;
  const pulse = 1 + 0.035 * Math.sin(tSmooth * 2.1 + 0.4) * motionScale;
  const depthBreath = 0.06 * Math.sin(tSmooth * 1.6) * motionScale;
  const zCenter = 0.5 + depthBreath * 0.42;
  const zHalf = HEART_DEPTH_SCALE * 0.42 * 0.55;

  for (let i = 0; i < HEART_OUTLINE_SAMPLES; i++) {
    const u = (i / HEART_OUTLINE_SAMPLES) * Math.PI * 2;
    const [hx, hy] = heartPoint(u);
    const px =
      0.5 +
      (hx * HEART_XY_SCALE * living * pulse + sway * Math.cos(u)) * 0.42;
    const py = 0.5 + hy * HEART_XY_SCALE * living * pulse * 0.42;
    const pz1 = zCenter - zHalf;
    const pz2 = zCenter + zHalf * PZ_FRONT_EXTRUDE;
    const outlineW = 0.92 + 0.08 * Math.sin(u * 2 + tSmooth * 0.9) * motionScale;
    const strBase = 0.72 * w * outlineW;
    const [gx1, gy1, gz1] = clampToGrid(px, py, pz1);
    mc.addBall(gx1, gy1, gz1, strBase * OUTLINE_BACK_STR_MUL, subtract);
    const [gx2, gy2, gz2] = clampToGrid(px, py, pz2);
    mc.addBall(gx2, gy2, gz2, strBase * OUTLINE_FRONT_STR_MUL, subtract);
  }

  addTopCleftRidge(mc, subtract, w, clampToGrid, zCenter, zHalf, 0.48 * w, living * pulse);

  const capStrMorph = 0.3 * w;
  for (let i = 0; i < HEART_OUTLINE_SAMPLES; i += 2) {
    const u = (i / HEART_OUTLINE_SAMPLES) * Math.PI * 2;
    const [hx, hy] = heartPoint(u);
    const px =
      0.5 +
      (hx * HEART_XY_SCALE * living * pulse + sway * Math.cos(u)) * 0.42;
    const py = 0.5 + hy * HEART_XY_SCALE * living * pulse * 0.42;
    const pzCap = zCenter + zHalf * 0.72;
    const [gx, gy, gz] = clampToGrid(px, py, pzCap);
    mc.addBall(gx, gy, gz, capStrMorph, subtract);
  }

  for (let j = 0; j < HEART_INNER_SAMPLES; j++) {
    const a = (j / HEART_INNER_SAMPLES) * Math.PI * 2;
    const ix = 0.5 + Math.cos(a) * 0.18 * 0.42 * living;
    const iy = 0.5 + (Math.sin(a) * 0.13 - 0.085) * 0.42 * living;
    const iz =
      zCenter +
      zHalf * 0.3 +
      (0.09 * Math.sin(a * 2 + t * 0.8) * motionScale + depthBreath * 0.2) * 0.42;
    const innerStr = 0.26 * w * (0.95 + 0.05 * Math.cos(a + tSmooth) * motionScale);
    const [gx, gy, gz] = clampToGrid(ix, iy, iz);
    mc.addBall(gx, gy, gz, innerStr, subtract);
  }

  const lobeBoost = 0.82 * w;
  const bump = 1 + 0.06 * Math.sin(tSmooth * 1.9) * motionScale;
  const uBump = 1.08;
  for (const u of [uBump, Math.PI * 2 - uBump]) {
    const [lx, ly] = heartPoint(u);
    const px = 0.5 + lx * HEART_XY_SCALE * 0.95 * bump * 0.42;
    const py = 0.5 + ly * HEART_XY_SCALE * 0.95 * bump * 0.42;
    const pz = zCenter + zHalf * 0.38;
    const [gx, gy, gz] = clampToGrid(px, py, pz);
    mc.addBall(gx, gy, gz, lobeBoost, subtract);
  }
}
