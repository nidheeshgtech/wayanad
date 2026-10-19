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
    const t = loader.load(`/textures/${name}.jpg`);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = SRGBColorSpace;
    return t;
  };
  const uniforms = {
    tGround: { value: load("ground-color", true) }, tGroundN: { value: load("ground-normal", false) },
    tRock: { value: load("rock-color", true) }, tRockN: { value: load("rock-normal", false) },
    uGroundScale: { value: GROUND_SCALE }, uRockScale: { value: ROCK_SCALE },
  };
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.customProgramCacheKey = () => "explore-wayanad-ground-1";
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
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
        uniform sampler2D tGround, tGroundN, tRock, tRockN;
        uniform float uGroundScale, uRockScale;`)
      .replace("#include <map_fragment>", `
        vec3 wN = normalize(vWorldNormal);
        float flatness = smoothstep(0.62, 0.86, wN.y);
        vec3 bw = pow(abs(wN), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
        vec2 gUv = vWorldPos.xz * uGroundScale;
        vec3 ground = mix(texture2D(tGround, gUv).rgb, texture2D(tGround, gUv * 0.27 + 0.31).rgb, 0.5);
        vec3 rock = texture2D(tRock, vWorldPos.zy * uRockScale).rgb * bw.x
                  + texture2D(tRock, vWorldPos.xz * uRockScale).rgb * bw.y
                  + texture2D(tRock, vWorldPos.xy * uRockScale).rgb * bw.z;
        float macro = texture2D(tGround, vWorldPos.xz * 0.013).g, patches = texture2D(tGround, vWorldPos.zx * 0.031 + 0.5).g;
        // monsoon-green: keep the litter's light and shade, take most of the colour from moss and low growth;
        // a quarter of the ground stays drier and browner, in patches
        float lum = dot(ground, vec3(0.299, 0.587, 0.114));
        vec3 lush = lum * vec3(0.55, 1.05, 0.42) * 1.35;
        ground = mix(ground * vec3(0.95, 0.88, 0.72), lush, 0.35 + 0.6 * smoothstep(0.2, 0.55, patches));
        rock *= mix(vec3(1.0), vec3(0.75, 0.95, 0.7), 0.5 * smoothstep(0.3, 0.7, patches)); // lichen and moss on the cuts
        vec3 albedo = mix(rock, ground, flatness) * (0.75 + 0.5 * macro);
        // packed earth and grit on the shoulders and drains, fading into the verge
        albedo = mix(albedo, albedo * vec3(0.78, 0.66, 0.54) + vec3(0.05, 0.04, 0.03), (1.0 - smoothstep(0.7, 1.15, vRoadDist)) * 0.8);
        diffuseColor.rgb *= albedo;`)
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix(0.8, 0.95, flatness);")
      .replace("#include <normal_fragment_maps>", `
        // whiteout-blended triplanar normal mapping (rock), planar for the ground; built in world space, then to view
        vec3 tnx = texture2D(tRockN, vWorldPos.zy * uRockScale).xyz * 2.0 - 1.0;
        vec3 tny = texture2D(tRockN, vWorldPos.xz * uRockScale).xyz * 2.0 - 1.0;
        vec3 tnz = texture2D(tRockN, vWorldPos.xy * uRockScale).xyz * 2.0 - 1.0;
        tnx = vec3(tnx.xy + wN.zy, abs(tnx.z) * wN.x);
        tny = vec3(tny.xy + wN.xz, abs(tny.z) * wN.y);
        tnz = vec3(tnz.xy + wN.xy, abs(tnz.z) * wN.z);
        vec3 rockN = normalize(tnx.zyx * bw.x + tny.xzy * bw.y + tnz.xyz * bw.z);
        vec3 tg = texture2D(tGroundN, gUv).xyz * 2.0 - 1.0;
        vec3 groundN = normalize(vec3(tg.x + wN.x, abs(tg.z) * wN.y, tg.y + wN.z));
        normal = normalize((viewMatrix * vec4(normalize(mix(rockN, groundN, flatness)), 0.0)).xyz);`);
  };
  shared = m;
  return m;
}
