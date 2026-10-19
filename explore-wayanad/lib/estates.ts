/**
 * Tea estates on the plateau (Lakkidi → Vythiri → Chundale → Kalpetta): where they are, shared by the ground shader
 * (tea rows painted on the slopes), Vegetation (no forest on the estates) and TeaHedges (3D bushes beside the road).
 *
 * Generated, not mapped: estates cover the high ground north of the gateway in broad patches (an analytic noise both
 * TypeScript and GLSL evaluate identically), never in the towns. Rows follow the contours, as tea is planted: a row
 * every ROW metres of height.
 */

export const ESTATES = {
  yMin: 64, // units above Adivaram (~690 m): the plateau, not the escarpment falling west
  north: 3, // units north of the gateway before the first estate
  row: 0.035, // units of height between rows (≈ 0.35 m: 1.2 m apart on a 30 % slope)
};
const MAX_TOWNS = 6;

/** World z of the gateway and town circles [x, z, radius] (units), set once the road has loaded. */
export const estateFrame = { gateZ: Infinity, towns: [] as [number, number, number][] };

/** Uniforms for the ground shader (plain objects; three uploads Float32Array to vec4[]). */
export const estateUniforms = { uTeaGateZ: { value: 1e9 }, uTowns: { value: new Float32Array(MAX_TOWNS * 4) } };

export function setEstateFrame(gateZ: number, towns: [number, number, number][]) {
  estateFrame.gateZ = gateZ;
  estateFrame.towns = towns.slice(0, MAX_TOWNS);
  estateUniforms.uTeaGateZ.value = gateZ;
  const a = estateUniforms.uTowns.value;
  a.fill(0);
  estateFrame.towns.forEach(([x, z, r], i) => a.set([x, z, r, 1], i * 4));
}

const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

/** Broad patches of estate, 0–1 (also in ESTATE_GLSL as teaPatch). */
function patch(x: number, z: number) {
  return smooth(-0.05, 0.3, Math.sin(x * 0.021 + 1.3) * Math.sin(z * 0.017 - 0.7) + 0.5 * Math.sin(x * 0.05 + z * 0.043));
}

/** How much (x, z) at height y is tea estate, 0–1. `slope` = rise per unit (tea doesn't grow on cliffs). */
export function teaAt(x: number, z: number, y: number, slope = 0) {
  if (z > estateFrame.gateZ - ESTATES.north || y < ESTATES.yMin) return 0;
  for (const [tx, tz, r] of estateFrame.towns) if ((x - tx) ** 2 + (z - tz) ** 2 < r * r) return 0;
  return patch(x, z) * smooth(ESTATES.yMin, ESTATES.yMin + 3, y) * (1 - smooth(0.6, 1.0, slope));
}

/** Is (x, y) on a tea row? Rows are contour lines every ESTATES.row of height; 0 between rows, 1 on one. */
export function onTeaRow(y: number, width = 0.3) {
  const phase = (y / ESTATES.row) % 1;
  return phase < width ? 1 : 0;
}

/** GLSL: `float teaMask(vec3 worldPos, float flatness)` and `float teaPhase(float worldY)`. Needs estateUniforms. */
export const ESTATE_GLSL = /* glsl */ `
  uniform float uTeaGateZ;
  uniform vec4 uTowns[${MAX_TOWNS}];
  float teaPatch(vec2 p) {
    return smoothstep(-0.05, 0.3, sin(p.x * 0.021 + 1.3) * sin(p.y * 0.017 - 0.7) + 0.5 * sin(p.x * 0.05 + p.y * 0.043));
  }
  float teaMask(vec3 w, float flatness) {
    if (w.z > uTeaGateZ - ${ESTATES.north.toFixed(1)} || w.y < ${ESTATES.yMin.toFixed(1)}) return 0.0;
    for (int i = 0; i < ${MAX_TOWNS}; i++) {
      if (uTowns[i].w > 0.5 && distance(w.xz, uTowns[i].xy) < uTowns[i].z) return 0.0;
    }
    return teaPatch(w.xz) * smoothstep(${ESTATES.yMin.toFixed(1)}, ${(ESTATES.yMin + 3).toFixed(1)}, w.y) * smoothstep(0.55, 0.8, flatness);
  }
  float teaPhase(float y) { return fract(y / ${ESTATES.row.toFixed(3)}); }
`;
