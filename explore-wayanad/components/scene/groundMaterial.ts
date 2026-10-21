import { CLOUD_SHADOW_GLSL, cloudShadowUniforms, wetUniform } from "@/lib/weather";
import { ESTATES, ESTATE_GLSL, estateUniforms } from "@/lib/estates";

const ESTATES_ROW = ESTATES.row.toFixed(3);
const CLIFF_SCALE = "1.0"; // cliff rock: one repeat per 10 m
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader } from "three";

/* Poly Haven CC0 textures, fetched by scripts/fetch-textures.ts. Scales are repeats per unit (1 unit = 10 m). */
const GROUND_SCALE = 0.6; // mossy floor: one tile per ~17 m
const ROCK_SCALE = 0.45; // wet rock: one tile per ~22 m

let shared: MeshStandardMaterial | null = null;

/**
 * The terrain's material, shared by the coarse terrain and the fine road band so they shade identically.
 * Physically based; colour and surface detail blend from moss and leaf litter on gentle ground to wet rock on steep faces
 * (cuts, embankments, the escarpment), by the surface's true slope. Rock is projected along all three axes so vertical
 * faces don't smear; a very low-frequency sample of the ground breaks up visible tiling.
 * Meshes using it need an `aRoadDist` attribute (distance to the road's centre line) for the dusty shoulders.
 * `color` stays a multiplier the Director tints per act.
 */
export function groundMaterial() {
  if (shared) return shared;
  const loader = new TextureLoader();
  const load = (name: string, srgb: boolean) => {
    const t = loader.load(`/textures/${name}.webp`);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = SRGBColorSpace;
    return t;
  };
  const uniforms = {
    tGround: { value: load("ground-color", true) }, tGroundN: { value: load("ground-normal", false) },
    tRock: { value: load("rock-color", true) }, tRockN: { value: load("rock-normal", false) },
    tCliff: { value: load("cliff-color", true) }, tCliffN: { value: load("cliff-normal", false) }, tCliffR: { value: load("cliff-rough", false) },
    uGroundScale: { value: GROUND_SCALE }, uRockScale: { value: ROCK_SCALE }, uWet: wetUniform,
  };
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.customProgramCacheKey = () => "explore-wayanad-ground-7";
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, estateUniforms, cloudShadowUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aRoadDist;\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\nvarying float vRoadDist;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        vRoadDist = aRoadDist;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying float vRoadDist;
        uniform sampler2D tGround, tGroundN, tRock, tRockN, tCliff, tCliffN, tCliffR;
        // triplanar sample of a texture at scale k, weighted by bw (computed from the world normal)
        vec3 tri(sampler2D t, vec3 p, vec3 bw, float k) {
          return texture2D(t, p.zy * k).rgb * bw.x + texture2D(t, p.xz * k).rgb * bw.y + texture2D(t, p.xy * k).rgb * bw.z;
        }
        uniform float uGroundScale, uRockScale, uWet;
        #define CLIFF_SCALE ${CLIFF_SCALE}
        ${ESTATE_GLSL}
        ${CLOUD_SHADOW_GLSL}`)
      .replace("#include <map_fragment>", `
        vec3 wN = normalize(vWorldNormal);
        float flatness = smoothstep(0.62, 0.86, wN.y);
        vec3 bw = pow(abs(wN), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
        vec2 gUv = vWorldPos.xz * uGroundScale;
        vec3 ground = mix(texture2D(tGround, gUv).rgb, texture2D(tGround, gUv * 0.27 + 0.31).rgb, 0.5);
        // rock, after the churam's real cuts: seamed dark cliff rock at metre scale over lichen rock at a larger one,
        // in patches; weathered darker; dark rain streaks running down; moss in the cracks and on small ledges
        vec3 lichen = tri(tRock, vWorldPos, bw, uRockScale * 0.6), cliff = tri(tCliff, vWorldPos, bw, CLIFF_SCALE);
        float rockPatch = smoothstep(0.35, 0.7, texture2D(tGround, vWorldPos.xz * 0.021 + 0.17).g);
        vec3 rock = mix(cliff, lichen, rockPatch * 0.55) * vec3(0.8, 0.82, 0.78);
        float cliffLum = dot(cliff, vec3(0.299, 0.587, 0.114));
        float crevice = 1.0 - smoothstep(0.05, 0.16, cliffLum);
        vec2 across = normalize(vec2(-wN.z, wN.x) + 1e-4);
        float streak = smoothstep(0.42, 0.62, texture2D(tCliff, vec2(dot(vWorldPos.xz, across) * 1.7, vWorldPos.y * 0.09)).r) * (1.0 - flatness);
        rock *= 1.0 - 0.45 * streak;
        float ledge = smoothstep(0.3, 0.55, wN.y) * (1.0 - smoothstep(0.62, 0.86, wN.y));
        float mossy = clamp(max(crevice * 0.7, ledge) * (0.5 + texture2D(tGround, vWorldPos.zx * 0.09).g), 0.0, 1.0);
        rock = mix(rock, vec3(0.16, 0.25, 0.07) * (0.6 + 1.4 * dot(lichen, vec3(0.33))), mossy * 0.65);
        float macro = texture2D(tGround, vWorldPos.xz * 0.013).g, patches = texture2D(tGround, vWorldPos.zx * 0.031 + 0.5).g;
        // monsoon-green: keep the litter's light and shade, take most of the colour from moss and low growth;
        // a little of the ground stays drier and browner, in patches
        float lum = dot(ground, vec3(0.299, 0.587, 0.114));
        vec3 lush = lum * vec3(0.48, 1.05, 0.36) * 1.5;
        ground = mix(ground * vec3(0.88, 0.86, 0.7), lush, 0.58 + 0.4 * smoothstep(0.2, 0.55, patches)); // mostly green, some bare litter
        // the Muthanga forest: a deciduous floor of fallen teak leaves, browner, with green only in patches
        float deciduous = smoothstep(uForestX - 20.0, uForestX, vWorldPos.x);
        ground = mix(ground, mix(lum * vec3(1.15, 0.9, 0.55) * 1.25, lush, 0.2 * smoothstep(0.4, 0.75, patches)), deciduous * 0.9);
        rock *= mix(vec3(1.0), vec3(0.75, 0.95, 0.7), 0.5 * smoothstep(0.3, 0.7, patches)); // lichen and moss on the cuts
        vec3 albedo = mix(rock, ground, flatness) * (0.75 + 0.5 * macro);
        // packed earth and grit on the shoulders and drains, fading into the verge
        albedo = mix(albedo, albedo * vec3(0.78, 0.66, 0.54) + vec3(0.05, 0.04, 0.03), (1.0 - smoothstep(0.7, 1.15, vRoadDist)) * 0.8);
        // tea estates (lib/estates): bright tea green in contour rows of rounded bushes, a dark path between rows,
        // leafy detail from the litter texture; the road's verge stays as it is
        float tea = teaMask(vWorldPos, flatness) * smoothstep(1.2, 2.0, vRoadDist);
        float teaRow = teaPhase(vWorldPos.y);
        // rows show only on real slopes (on the flat they'd spread into rings) and fade before they'd shimmer far away
        float rows = smoothstep(0.08, 0.25, length(wN.xz) / max(wN.y, 0.1)) * (1.0 - smoothstep(0.2, 0.45, fwidth(vWorldPos.y) / ${ESTATES_ROW}));
        vec3 teaGreen = vec3(0.14, 0.31, 0.035) * (0.75 + 0.6 * lum) * mix(0.85, 0.7 + 0.3 * sin(teaRow * 3.14159), rows);
        albedo = mix(albedo, mix(teaGreen, vec3(0.09, 0.07, 0.05), smoothstep(0.82, 0.92, teaRow) * rows), tea);
        diffuseColor.rgb *= albedo * mix(1.0, mix(0.85, 0.7, 1.0 - flatness), uWet) // damp: darker, rock most
          * (1.0 - 0.45 * cloudShadow(vWorldPos.xz)); // a passing cloud's shadow`)
      .replace("#include <roughnessmap_fragment>", `float rockRough = mix(texture2D(tCliffR, vWorldPos.xz * CLIFF_SCALE).r * 0.4 + 0.55, 0.45, streak * 0.6) * mix(1.0, 0.55, uWet);
        float roughnessFactor = mix(mix(rockRough, 0.9, mossy * 0.6), mix(0.95, 0.85, uWet), flatness); // rock: damp streaks glossier, moss matte`)
      .replace("#include <normal_fragment_maps>", `
        // whiteout-blended triplanar normal mapping (rock), planar for the ground; built in world space, then to view
        vec3 tnx = texture2D(tRockN, vWorldPos.zy * uRockScale).xyz * 2.0 - 1.0;
        vec3 tny = texture2D(tRockN, vWorldPos.xz * uRockScale).xyz * 2.0 - 1.0;
        vec3 tnz = texture2D(tRockN, vWorldPos.xy * uRockScale).xyz * 2.0 - 1.0;
        tnx = vec3(tnx.xy + wN.zy, abs(tnx.z) * wN.x);
        tny = vec3(tny.xy + wN.xz, abs(tny.z) * wN.y);
        tnz = vec3(tnz.xy + wN.xy, abs(tnz.z) * wN.z);
        vec3 rockN = normalize(tnx.zyx * bw.x + tny.xzy * bw.y + tnz.xyz * bw.z);
        // the cliff rock's own normals (its seams and cracks), the same whiteout blend at its scale
        vec3 cnx = texture2D(tCliffN, vWorldPos.zy * CLIFF_SCALE).xyz * 2.0 - 1.0;
        vec3 cny = texture2D(tCliffN, vWorldPos.xz * CLIFF_SCALE).xyz * 2.0 - 1.0;
        vec3 cnz = texture2D(tCliffN, vWorldPos.xy * CLIFF_SCALE).xyz * 2.0 - 1.0;
        cnx = vec3(cnx.xy + wN.zy, abs(cnx.z) * wN.x); cny = vec3(cny.xy + wN.xz, abs(cny.z) * wN.y); cnz = vec3(cnz.xy + wN.xy, abs(cnz.z) * wN.z);
        rockN = normalize(mix(rockN, normalize(cnx.zyx * bw.x + cny.xzy * bw.y + cnz.xyz * bw.z), 0.7 - 0.4 * rockPatch));
        vec3 tg = texture2D(tGroundN, gUv).xyz * 2.0 - 1.0;
        vec3 groundN = normalize(vec3(tg.x + wN.x, abs(tg.z) * wN.y, tg.y + wN.z));
        vec3 worldN = normalize(mix(rockN, groundN, flatness));
        // tea rows: the surface rises and falls across each row (rounded bushes), along the slope's direction
        vec2 downhill = wN.xz / max(length(wN.xz), 1e-3);
        worldN = normalize(worldN + vec3(downhill.x, 0.0, downhill.y) * cos(teaRow * 6.2832) * 0.45 * tea * rows);
        normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);`);
  };
  shared = m;
  return m;
}
