import type { WebGLRenderer } from 'three';

type GuardedFunction = ((...args: unknown[]) => unknown) & { eazeeGuarded?: boolean };

/**
 * expo-gl returns undefined from every call once its drawing surface is gone (e.g. while
 * another screen covers the droplet), but three.js calls `.trim()` on the shader logs the
 * first time it uses a shader, which then crashes the app. An empty log is what three.js
 * expects when there is nothing to report, so the logs fall back to ''.
 */
export function guardExpoGlShaderLogs(renderer: WebGLRenderer) {
  const gl = renderer.getContext() as unknown as Record<string, GuardedFunction>;
  for (const name of ['getProgramInfoLog', 'getShaderInfoLog'] as const) {
    const original = gl[name];
    if (typeof original !== 'function' || original.eazeeGuarded) continue;
    const guarded: GuardedFunction = (...args) => original.apply(gl, args) ?? '';
    guarded.eazeeGuarded = true;
    try {
      gl[name] = guarded;
    } catch {
      // A context that refuses the override keeps three.js's own handling.
    }
  }
}
