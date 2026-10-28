import * as THREE from 'three';
import { MAX_METABALLS, MetaballSink } from '@/src/blob/metaballSink';
import { BLOB_METABALL_ISO, BLOB_METABALL_SUBTRACT } from '@/src/blob/blobMetaballConstants';

const MAXI = MAX_METABALLS;

/** Small LDR equirect for PMREM until `scene.environment` is ready (matches warm-gold bias). */
function makeBlobFallbackEquirect(): THREE.DataTexture {
  const w = 32;
  const h = 16;
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    const v = j / (h - 1);
    const sky = 220 + v * 25;
    const mid = 180 + (1 - Math.abs(v - 0.5) * 2) * 40;
    for (let i = 0; i < w; i++) {
      const u = i / (w - 1);
      const sun = Math.exp(-Math.pow((u - 0.55) * 6, 2)) * Math.exp(-Math.pow((v - 0.2) * 5, 2)) * 90;
      const idx = (j * w + i) * 4;
      data[idx] = Math.min(255, Math.floor(mid + sun * 0.9));
      data[idx + 1] = Math.min(255, Math.floor(sky * 0.88 + sun * 0.7));
      data[idx + 2] = Math.min(255, Math.floor(120 + sun * 0.35));
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.needsUpdate = true;
  return tex;
}

const vertexShader = /* glsl */ `
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

attribute vec3 position;

varying vec3 vWorldPos;
varying vec3 vObjPos;

void main() {
  vObjPos = position;
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
precision highp int;

#define MAXB ${MAX_METABALLS}.0
#define MAXI ${MAXI}

varying vec3 vWorldPos;
varying vec3 vObjPos;

uniform sampler2D uBalls;
uniform float uBallCount;
uniform float uSubtract;
uniform float uIso;

uniform samplerCube uEnvMap;
uniform float uEnvMapIntensity;
uniform vec3 uBaseColor;
uniform float uMetalness;
uniform float uRoughness;

uniform float uRippleTime;
uniform float uRippleAmp;
uniform float uRippleFreq;

uniform vec3 uTapOrigin;
uniform float uTapAge;

uniform mat4 modelMatrix;
uniform mat4 modelMatrixInverse;
uniform vec3 cameraPosition;

vec2 ballUv(int i) {
  return vec2((float(i) + 0.5) / MAXB, 0.5);
}

vec4 fetchBall(int i) {
  return texture2D(uBalls, ballUv(i));
}

void fieldAndGrad(vec3 pf, out float fs, out vec3 grad) {
  fs = 0.0;
  grad = vec3(0.0);
  int bc = int(floor(uBallCount + 0.5));
  for (int i = 0; i < MAXI; i++) {
    if (i >= bc) break;
    vec4 b = fetchBall(i);
    vec3 d = pf - b.xyz;
    float r2 = dot(d, d) + 1e-6;
    float s = b.w;
    float v = s / r2 - uSubtract;
    if (v > 0.0) {
      fs += v;
      grad += -2.0 * s * d / (r2 * r2);
    }
  }
}

vec2 hitBox(vec3 ro, vec3 rd) {
  vec3 inv = 1.0 / (abs(rd) > vec3(1e-8) ? rd : sign(rd) * vec3(1e-8));
  vec3 t0 = (-1.0 - ro) * inv;
  vec3 t1 = (1.0 - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z);
  float tf = min(min(tmax.x, tmax.y), tmax.z);
  return vec2(tn, tf);
}

void main() {
  vec3 ro = (modelMatrixInverse * vec4(cameraPosition, 1.0)).xyz;
  vec3 rd = normalize(vObjPos - ro);

  vec2 tb = hitBox(ro, rd);
  float tNear = tb.x;
  float tFar = tb.y;
  if (tFar < 0.0 || tFar < tNear) discard;
  if (tNear < 0.0) tNear = 0.0;

  const float stepK = 0.032;
  float t = tNear;
  float tPrev = tNear;
  float fPrev;
  vec3 gTmp;
  {
    vec3 p0 = ro + rd * tNear;
    vec3 pf0 = p0 * 0.5 + 0.5;
    fieldAndGrad(pf0, fPrev, gTmp);
    fPrev -= uIso;
  }

  bool found = false;
  float hitT = tNear;

  for (int s = 0; s < 160; s++) {
    t += stepK;
    if (t > tFar) break;
    vec3 p = ro + rd * t;
    if (any(greaterThan(abs(p), vec3(1.02)))) break;
    vec3 pf = p * 0.5 + 0.5;
    float f;
    vec3 g;
    fieldAndGrad(pf, f, g);
    float diff = f - uIso;
    if (diff >= 0.0 && fPrev < 0.0) {
      float lo = tPrev;
      float hi = t;
      for (int b = 0; b < 10; b++) {
        float mid = (lo + hi) * 0.5;
        vec3 pm = ro + rd * mid;
        vec3 pfm = pm * 0.5 + 0.5;
        float fm;
        vec3 gm;
        fieldAndGrad(pfm, fm, gm);
        if (fm - uIso >= 0.0) hi = mid;
        else lo = mid;
      }
      hitT = (lo + hi) * 0.5;
      found = true;
      break;
    }
    fPrev = diff;
    tPrev = t;
  }

  if (!found) discard;

  vec3 hitObj = ro + rd * hitT;
  vec3 pfHit = hitObj * 0.5 + 0.5;
  float fh;
  vec3 grad;
  fieldAndGrad(pfHit, fh, grad);
  vec3 Nobj = normalize(-grad);
  vec3 Nw = normalize(mat3(modelMatrix) * Nobj);

  vec3 hitW = (modelMatrix * vec4(hitObj, 1.0)).xyz;
  vec3 V = normalize(cameraPosition - hitW);

  vec3 rp = hitW * uRippleFreq;
  float ph =
    sin(rp.x + uRippleTime) * cos(rp.y - uRippleTime * 0.73)
    + sin(rp.z * 0.87 + uRippleTime * 0.61) * 0.65;
  float ph2 =
    sin(rp.x * 2.31 + uRippleTime * 1.07) * cos(rp.y * 2.08 - uRippleTime * 0.94)
    + sin(rp.z * 2.18 + uRippleTime * 0.71) * 0.55;
  float sum = (ph + ph2 * 0.42) * uRippleAmp;
  vec3 tng = cross(Nw, vec3(0.0, 1.0, 0.0));
  if (dot(tng, tng) < 1e-8) tng = cross(Nw, vec3(1.0, 0.0, 0.0));
  tng = normalize(tng);
  vec3 btn = normalize(cross(Nw, tng));
  Nw = normalize(Nw + tng * (sum * 0.72) + btn * (sum * 0.62));

  float tapShimmer = 0.0;
  if (uTapAge > 0.001 && uTapAge < 4.0) {
    float dTap = distance(hitW, uTapOrigin);
    float wave = sin(dTap * 28.5 - uTapAge * 15.5);
    float envelope = exp(-dTap * 0.72) * exp(-uTapAge * 0.55) * (1.0 - smoothstep(2.75, 3.55, uTapAge));
    tapShimmer = wave * envelope;
  }
  float crawl =
    sin(dot(hitW, vec3(3.1, 2.7, 2.3)) + uRippleTime)
    * cos(dot(hitW, vec3(-2.2, 3.4, 1.9)) - uRippleTime * 0.85);
  float shimmer = crawl * uRippleAmp * 0.055;

  vec3 R = reflect(-V, Nw);
  vec3 envCol = textureCube(uEnvMap, R).rgb;
  float ndotv = max(dot(Nw, V), 0.0);
  float fres = pow(1.0 - ndotv, 3.0);
  float specPow = mix(8.0, 256.0, 1.0 - uRoughness);
  vec3 H = normalize(V + normalize(vec3(0.35, 0.85, 0.45)));
  float spec = pow(max(dot(Nw, H), 0.0), specPow) * (0.35 + 0.65 * uMetalness);

  vec3 base = uBaseColor * (0.22 + 0.55 * max(dot(Nw, normalize(vec3(0.4, 0.95, 0.35))), 0.0));
  vec3 refl = envCol * uEnvMapIntensity * (0.12 + (0.55 + 0.33 * fres) * uMetalness) * mix(vec3(1.0), uBaseColor, 0.35);
  vec3 col = base + refl + vec3(spec) * mix(vec3(1.0, 0.95, 0.75), uBaseColor, 0.4);
  col *= 1.0 + shimmer + tapShimmer * 0.054;

  gl_FragColor = vec4(col, 1.0);
}
`;

export type BlobRaymarchUniforms = {
  uBalls: { value: THREE.DataTexture };
  uBallCount: { value: number };
  uSubtract: { value: number };
  uIso: { value: number };
  uEnvMap: { value: THREE.Texture };
  uEnvMapIntensity: { value: number };
  uBaseColor: { value: THREE.Color };
  uMetalness: { value: number };
  uRoughness: { value: number };
  uRippleTime: { value: number };
  uRippleAmp: { value: number };
  uRippleFreq: { value: number };
  uTapOrigin: { value: THREE.Vector3 };
  uTapAge: { value: number };
  modelMatrix: { value: THREE.Matrix4 };
  modelMatrixInverse: { value: THREE.Matrix4 };
  modelViewMatrix: { value: THREE.Matrix4 };
  projectionMatrix: { value: THREE.Matrix4 };
  cameraPosition: { value: THREE.Vector3 };
};

export function createBlobRaymarchMaterial(
  sink: MetaballSink,
  gl: THREE.WebGLRenderer
): {
  material: THREE.ShaderMaterial;
  uniforms: BlobRaymarchUniforms;
  ballTexture: THREE.DataTexture;
  dispose: () => void;
} {
  const ballTexture = new THREE.DataTexture(
    sink.data,
    MAX_METABALLS,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  ballTexture.minFilter = THREE.NearestFilter;
  ballTexture.magFilter = THREE.NearestFilter;
  ballTexture.wrapS = THREE.ClampToEdgeWrapping;
  ballTexture.wrapT = THREE.ClampToEdgeWrapping;
  ballTexture.needsUpdate = true;

  const pmremGen = new THREE.PMREMGenerator(gl);
  const eq = makeBlobFallbackEquirect();
  const fallbackRT = pmremGen.fromEquirectangular(eq);
  eq.dispose();
  pmremGen.dispose();

  const uniforms: BlobRaymarchUniforms = {
    uBalls: { value: ballTexture },
    uBallCount: { value: 0 },
    uSubtract: { value: BLOB_METABALL_SUBTRACT },
    uIso: { value: BLOB_METABALL_ISO },
    uEnvMap: { value: fallbackRT.texture },
    uEnvMapIntensity: { value: 1.2 },
    uBaseColor: { value: new THREE.Color(0xe0b743) },
    uMetalness: { value: 1.0 },
    uRoughness: { value: 0.3 },
    uRippleTime: { value: 0 },
    uRippleAmp: { value: 0.04 },
    uRippleFreq: { value: 1.6 },
    uTapOrigin: { value: new THREE.Vector3(0, -9999, 0) },
    uTapAge: { value: 0 },
    modelMatrix: { value: new THREE.Matrix4() },
    modelMatrixInverse: { value: new THREE.Matrix4() },
    modelViewMatrix: { value: new THREE.Matrix4() },
    projectionMatrix: { value: new THREE.Matrix4() },
    cameraPosition: { value: new THREE.Vector3() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as { [key: string]: THREE.IUniform },
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });

  let envSwapDone = false;
  material.onBeforeRender = (_renderer, scene) => {
    const env = scene.environment;
    if (env && uniforms.uEnvMap.value !== env) {
      uniforms.uEnvMap.value = env;
      if (!envSwapDone) {
        envSwapDone = true;
        fallbackRT.dispose();
      }
    }
  };

  const dispose = () => {
    material.dispose();
    ballTexture.dispose();
    if (!envSwapDone) fallbackRT.dispose();
  };

  return { material, uniforms, ballTexture, dispose };
}
