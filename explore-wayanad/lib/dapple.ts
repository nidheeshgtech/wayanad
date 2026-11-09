/**
 * Sunlight through the trees: soft leaf shadows dappling the road (and the shoulders beside it), the way a forest road
 * looks on a sunny day. World-fixed, so they slide past as you drive; they sway a little with the leaves; the canopy
 * thins out in places. `uDapple` is how strong (0 at night, in rain or under cloud; Lighting sets it each frame).
 * Four value-noise lookups a pixel, cheap enough for phones. Units of 10 m.
 */
export const dappleUniforms = ((globalThis as { __wayanadDapple?: { uDapple: { value: number }; uLeafTime: { value: number } } }).__wayanadDapple ??= { uDapple: { value: 0 }, uLeafTime: { value: 0 } });

/** GLSL: `float leafShade(vec2 worldXZ)` — 1 under leaves, 0 in a fleck of sun. Use as
 * `rgb *= mix(1.0 + 0.22 * uDapple, 1.0 - 0.5 * uDapple, leafShade(xz))`: flecks of sun a little brighter, shade darker. */
export const DAPPLE_GLSL = /* glsl */ `
uniform float uDapple, uLeafTime;
// (no sin(): world positions run to thousands of units, where a sin hash loses its precision and goes flat)
float dHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float dNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x), mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float leafShade(vec2 xz) {
  xz = mod(xz, 512.0);
  vec2 sway = vec2(sin(uLeafTime * 0.9), cos(uLeafTime * 0.7)) * 0.05;
  float n = dNoise(xz * 12.0 + sway) * 0.5 + dNoise(xz * 29.0 - sway * 1.7) * 0.32 + dNoise(xz * 71.0 + sway * 2.3) * 0.18;
  float canopy = smoothstep(0.12, 0.42, dNoise(xz * 0.32 + 7.3)); // open stretches here and there
  return mix(0.35, smoothstep(0.43, 0.49, n), canopy); // leaf shadow under the canopy; open stretches in full sun
}`;

/** How strong the dappling is now: sun getting through (weather.sun), by day, not in rain. */
export function stepDapple(dt: number, sun: number, rain: number, night: number, dusk: number) {
  const want = sun * (1 - rain) * (1 - night) * (1 - 0.6 * dusk);
  dappleUniforms.uDapple.value += (want - dappleUniforms.uDapple.value) * Math.min(1, dt * 2);
  dappleUniforms.uLeafTime.value += dt;
}
