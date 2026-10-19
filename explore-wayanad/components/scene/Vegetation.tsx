"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, InstancedMesh, Matrix4, MeshDepthMaterial,
  MeshStandardMaterial, Quaternion, RGBADepthPacking, SRGBColorSpace, TextureLoader, Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import CARDS from "@/data/vegetation.json";
import { SECTION, archT, churamEndT, height, roadDistance } from "@/lib/terrain";
import { inTown, townPlan } from "./Town";
import { teaAt } from "@/lib/estates";
import { CLOUD_SHADOW_GLSL, cloudShadowUniforms } from "@/lib/weather";

/* Species, true scale (1 unit = 10 m). Plants are cut-out cards (public/vegetation, see its README).
 * `perUnit`: plants per unit of road; `zone`: distance band from the road's centre line where they grow;
 * `trunk`: casts shadows and stays off cut faces; `lowland`: thins out with altitude (palms). */
type Species = { name: keyof typeof CARDS; tall: [number, number]; perUnit: number; zone: [number, number]; sway: number; trunk?: boolean; lowland?: boolean };
const SPECIES: Species[] = [
  { name: "grass", tall: [0.06, 0.12], perUnit: 30, zone: [SECTION.half + 0.18, 1.6], sway: 0.05 },
  { name: "fern", tall: [0.08, 0.15], perUnit: 20, zone: [SECTION.shoulder, 3], sway: 0.03 },
  { name: "bush", tall: [0.1, 0.2], perUnit: 16, zone: [SECTION.drain, 5], sway: 0.02 },
  { name: "tree-young", tall: [0.4, 0.7], perUnit: 10, zone: [1.2, 8], sway: 0.025, trunk: true },
  { name: "bamboo", tall: [1.2, 2.0], perUnit: 0.8, zone: [1.5, 12], sway: 0.04, trunk: true },
  { name: "tree-broadleaf", tall: [1.0, 1.5], perUnit: 8, zone: [1.6, 15], sway: 0.012, trunk: true },
  { name: "palm-coconut", tall: [1.5, 2.2], perUnit: 0.6, zone: [1.5, 12], sway: 0.03, trunk: true, lowland: true },
  { name: "tree-evergreen", tall: [2.5, 4.0], perUnit: 20, zone: [2, 30], sway: 0.01, trunk: true },
  { name: "tree-fig", tall: [2.0, 3.0], perUnit: 1.6, zone: [1.8, 20], sway: 0.008, trunk: true },
  { name: "tree-emergent", tall: [3.6, 5.2], perUnit: 3, zone: [2.2, 26], sway: 0.006, trunk: true },
  { name: "banana", tall: [0.3, 0.5], perUnit: 1.5, zone: [0.95, 4], sway: 0.03, trunk: true },
  { name: "shrub", tall: [0.12, 0.24], perUnit: 14, zone: [SECTION.drain, 6], sway: 0.02 },
];
/* Natural variation, so no two plants read alike: per-plant leaf tints (lush, olive, dark, yellowing; weights), and
 * groves — a slow noise thins the trees into clumps and clearings instead of an even spread. */
const TINTS: [number, [number, number, number]][] = [[5, [0.92, 1.04, 0.86]], [3, [1.02, 1.0, 0.76]], [3, [0.74, 0.84, 0.74]], [1, [1.12, 1.05, 0.66]]];
const TINT_TOTAL = TINTS.reduce((a, [w]) => a + w, 0);
const grove = (x: number, z: number) => 0.5 + 0.3 * Math.sin(x * 0.11 + 1.7) * Math.sin(z * 0.13 - 0.4) + 0.2 * Math.sin(x * 0.29 - z * 0.23);
/* On the plateau (Act 2) the forest gives way to tea estates and towns: each species keeps this share of its density. */
const PLATEAU: Partial<Record<keyof typeof CARDS, number>> = { "tree-fig": 0.5, "tree-emergent": 0.2, banana: 0.8, shrub: 0.5, grass: 0.6, fern: 0.3, bush: 0.5, "tree-young": 0.45, bamboo: 0.5, "tree-broadleaf": 0.6, "palm-coconut": 0, "tree-evergreen": 0.3 };
const CUT_FACE = 1.4; // slope (rise per unit) beyond which trees don't stand; ferns and grass still cling on

/** Deterministic random numbers, so the forest is the same on every visit. */
function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Three vertical cards crossing at 60°, 1 × 1 with the origin at the foot. Normals point up, so a plant is lit like
 * foliage (from the sky) rather than like flat boards facing different ways. */
function crossCards() {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, base = k * 4;
    const n = new Vector3(0, 1, 0); // every plane of a plant lit alike, so none shows as a pale or dark half
    for (const [x, y, z, u, v] of [[-cx, 0, -cz, 0, 0], [cx, 0, cz, 1, 0], [cx, 1, cz, 1, 1], [-cx, 1, -cz, 0, 1]]) {
      pos.push(x, y, z); nor.push(n.x, n.y, n.z); uv.push(u, v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  return g;
}

const wind = { value: 0 };
/** Sway: the card's top moves, its foot doesn't; each plant has its own phase from where it stands. */
const swayShader = (sway: number) => (shader: WebGLProgramParametersWithUniforms) => {
  shader.uniforms.uWind = wind;
  Object.assign(shader.uniforms, cloudShadowUniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\nvarying vec2 vPlantXZ;\n${CLOUD_SHADOW_GLSL}`)
    .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb *= 1.0 - 0.45 * cloudShadow(vPlantXZ);");
  // both faces of a card are the same foliage: light them with the card's sky-leaning normal (never the flipped one),
  // tilted toward the viewer — seen edge-on from afar, a sky-facing card would otherwise reflect the sky like glass
  shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize(vNormal + vec3(0.0, 0.0, 0.8));");
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nuniform float uWind;\nvarying vec2 vPlantXZ;")
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      vec2 root = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
      vPlantXZ = (modelMatrix * vec4(root.x, 0.0, root.y, 1.0)).xz;
      float phase = dot(root, vec2(1.7, 2.3));
      float bend = uv.y * uv.y * ${sway.toFixed(3)};
      transformed.x += sin(uWind * 1.1 + phase) * bend * 4.0;
      transformed.z += cos(uWind * 0.8 + phase * 1.3) * bend * 3.0;`);
};

export default function Vegetation({ curve, density = 1, alphaToCoverage = true }: { curve: CatmullRomCurve3; density?: number; alphaToCoverage?: boolean }) {
  const meshes = useMemo(() => {
    const loader = new TextureLoader(), geo = crossCards(), L = curve.getLength(), random = rng(766), townFrom = archT(), plan = townPlan(curve), plateauFrom = churamEndT();
    const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), c = new Color(), side = new Vector3();
    return SPECIES.map((s) => {
      const map = loader.load(`/vegetation/${s.name}.webp`);
      map.colorSpace = SRGBColorSpace; map.anisotropy = 4;
      const material = new MeshStandardMaterial({ map, alphaTest: 0.45, side: DoubleSide, roughness: 1, alphaToCoverage });
      material.onBeforeCompile = swayShader(s.sway);
      material.customProgramCacheKey = () => `veg2-${s.sway}`;
      const share = PLATEAU[s.name] ?? 1, effective = L * (plateauFrom + (1 - plateauFrom) * share);
      const count = Math.round(s.perUnit * effective * density), mesh = new InstancedMesh(geo, material, count);
      const aspect = CARDS[s.name].aspect;
      let placed = 0;
      for (let tries = 0; placed < count && tries < count * 6; tries++) {
        const t = random();
        if (t > plateauFrom && random() > share) continue;
        const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
        side.set(tan.z, 0, -tan.x).normalize().multiplyScalar(random() < 0.5 ? -1 : 1);
        const [d0, d1] = s.zone, d = d0 + (d1 - d0) * random() ** 1.6; // denser toward the road
        const x = p.x + side.x * d + (random() - 0.5) * 0.6, z = p.z + side.z * d + (random() - 0.5) * 0.6;
        if (roadDistance(x, z) < d0) continue; // another leg of the road (hairpins), or back onto the shoulder
        if (t > townFrom && s.name !== "grass" && inTown(x, z, plan)) continue; // not on or against Lakkidi's buildings
        const y = height(x, z);
        if (t > plateauFrom && s.name !== "grass" && teaAt(x, z, y) > 0.3 && random() > 0.04) continue; // estates are tea; a few shade trees stand in them
        if (s.trunk && Math.hypot(height(x + 0.2, z) - height(x - 0.2, z), height(x, z + 0.2) - height(x, z - 0.2)) / 0.4 > CUT_FACE) continue;
        if (s.lowland && random() < clamp01((y - 5) / 40)) continue; // palms thin out above ~50 m of climb, gone by ~450 m
        const tall = s.tall[0] + (s.tall[1] - s.tall[0]) * random();
        if (s.trunk && random() > 0.25 + 0.9 * grove(x, z)) continue; // groves and clearings
        // mirrored half the time and a little wider or narrower, so repeated cards don't read as copies
        const wide = tall * aspect * (0.85 + random() * 0.35), flip = random() < 0.5 ? -1 : 1;
        m.compose(new Vector3(x, y - tall * 0.02, z), q.setFromAxisAngle(up, random() * Math.PI * 2), new Vector3(wide * flip, tall, wide));
        mesh.setMatrixAt(placed, m);
        let roll = random() * TINT_TOTAL, tint = TINTS[0][1];
        for (const [w, rgb] of TINTS) { if ((roll -= w) <= 0) { tint = rgb; break; } }
        const v = 0.9 + random() * 0.2;
        mesh.setColorAt(placed, c.setRGB(tint[0] * v, tint[1] * v, tint[2] * v));
        placed++;
      }
      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false; // spread along 12 km; per-instance culling isn't available, and fog hides the far ones
      mesh.receiveShadow = true;
      if (s.trunk) {
        mesh.castShadow = true;
        const depth = new MeshDepthMaterial({ map, alphaTest: 0.45, depthPacking: RGBADepthPacking });
        mesh.customDepthMaterial = depth; // leaf-shaped shadows, not card-shaped ones
      }
      mesh.name = `veg-${s.name}`;
      return mesh;
    });
  }, [curve, density, alphaToCoverage]);

  useFrame((_, dt) => { wind.value += dt; });
  return <>{meshes.map((mesh) => <primitive key={mesh.name} object={mesh} />)}</>;
}

function clamp01(x: number) { return Math.min(1, Math.max(0, x)); }
