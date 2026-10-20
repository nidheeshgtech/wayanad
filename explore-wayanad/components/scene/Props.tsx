"use client";
import { timed } from "@/lib/perf";
import { use, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, CatmullRomCurve3, Color, InstancedMesh, Material, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SECTION, archT, height, roadDistance } from "@/lib/terrain";
import { inTown, townPlan } from "./Town";
import { weather } from "@/lib/weather";

/* Real 3D scans from Poly Haven (CC0, scripts/fetch-models.ts), placed along the road at true scale (models are in metres,
 * the scene in 10 m units). Too detailed to draw all 12 km at once, so instances are grouped into chunks of road and only
 * chunks within `view` of the camera are drawn — and only the chunk you're in with the full scan: the rest use a light
 * version of the same shape (scripts/bake-prop-lods.mjs, ~10 % of the rock's triangles) with the scan's own material.
 * The full rock everywhere was 6.6 M of the 7.6 M triangles a frame at the hairpins (drawn and again for shadows). */
type Kind = { model: string; size: [number, number]; perUnit: number; zone: [number, number]; sink: number; view: number; shadow: boolean };
const KINDS: Kind[] = [
  { model: "rock_07", size: [0.2, 0.8], perUnit: 0.9, zone: [SECTION.half + 0.15, 4], sink: 0.04, view: 30, shadow: true }, // 0.6–2.4 m stones, part buried
  { model: "fern_02", size: [0.08, 0.16], perUnit: 5, zone: [SECTION.half + 0.2, 1.4], sink: 0.005, view: 12, shadow: false }, // 0.8–1.6 m clumps
];
const CHUNK = 16; // units of road per chunk
const FULL = 1.5; // units: chunks whose nearest instance could be this close get the full scan

const loaded = new Map<string, Promise<{ geometry: BufferGeometry; material: Material; light: BufferGeometry }[]>>();
function load(model: string) {
  if (!loaded.has(model)) loaded.set(model, Promise.all([new GLTFLoader().loadAsync(`/models/${model}/${model}.gltf`), new GLTFLoader().loadAsync(`/models/${model}/${model}_lod.gltf`).catch(() => null)]).then(([gltf, lod]) => {
    const light: BufferGeometry[] = [];
    lod?.scene.traverse((o) => { if ((o as Mesh).isMesh) light.push((o as Mesh).geometry); });
    const parts: { geometry: BufferGeometry; material: Material }[] = [];
    gltf.scene.traverse((o) => { if ((o as Mesh).isMesh) { const m = o as Mesh; parts.push({ geometry: m.geometry.clone(), material: m.material as Material }); } });
    // the light version's parts, matched by order; any missing part keeps its full geometry
    return parts.map((p, i) => ({ ...p, light: light[i] ?? p.geometry }));
  }));
  return loaded.get(model)!;
}

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export default function Props({ curve, density = 1, towns = true }: { curve: CatmullRomCurve3; density?: number; towns?: boolean }) {
  const models = use(useMemo(() => Promise.all(KINDS.map((k) => load(k.model))), []));
  const chunks = useMemo(() => timed("props", () => {
    const L = curve.getLength(), townFrom = archT(), plan = townPlan(curve), out: { centre: Vector3; radius: number; view: number; meshes: InstancedMesh[]; light: InstancedMesh[] }[] = [];
    const m = new Matrix4(), q = new Quaternion(), side = new Vector3(), tint = new Color();
    KINDS.forEach((k, ki) => {
      const parts = models[ki], random = rng(1000 + ki);
      for (let c0 = 0; c0 < L; c0 += CHUNK) {
        const count = Math.round(k.perUnit * CHUNK * density), spots: Matrix4[] = [];
        for (let tries = 0; spots.length < count && tries < count * 4; tries++) {
          const t = Math.min(0.999, (c0 + random() * CHUNK) / L), p = curve.getPointAt(t), tan = curve.getTangentAt(t);
          side.set(tan.z, 0, -tan.x).normalize().multiplyScalar(random() < 0.5 ? -1 : 1);
          const d = k.zone[0] + (k.zone[1] - k.zone[0]) * random() ** 1.5;
          const x = p.x + side.x * d, z = p.z + side.z * d;
          if (roadDistance(x, z) < k.zone[0]) continue;
          if (towns && t > townFrom && inTown(x, z, plan)) continue; // no boulders on Lakkidi's buildings
          // `size` is the scale applied to the scan (in metres), in scene units: e.g. 0.2 → the 30 cm stone becomes 60 cm
          const s = k.size[0] + (k.size[1] - k.size[0]) * random() ** 2;
          q.setFromAxisAngle(new Vector3(0, 1, 0), random() * Math.PI * 2);
          spots.push(new Matrix4().compose(new Vector3(x, height(x, z) - k.sink * s, z), q.clone(), new Vector3(s, s * (0.8 + random() * 0.4), s)));
        }
        if (!spots.length) continue;
        const centre = spots.reduce((a, b) => a.add(new Vector3().setFromMatrixPosition(b)), new Vector3()).divideScalar(spots.length);
        const radius = Math.max(...spots.map((b) => new Vector3().setFromMatrixPosition(b).distanceTo(centre))) + 1;
        // each fern part (the scan holds four clumps) takes its own share of the spots, so the clumps vary
        const make = (geometry: BufferGeometry, part: { material: Material }, mine: Matrix4[], tints: number[]) => {
          const mesh = new InstancedMesh(geometry, part.material, mine.length);
          mine.forEach((mat, i) => { mesh.setMatrixAt(i, mat); mesh.setColorAt(i, tint.setScalar(tints[i])); });
          mesh.instanceMatrix.needsUpdate = true;
          mesh.castShadow = k.shadow; mesh.receiveShadow = true;
          mesh.frustumCulled = false; mesh.visible = false;
          return mesh;
        };
        const meshes: InstancedMesh[] = [], light: InstancedMesh[] = [];
        parts.forEach((part, pi) => {
          const mine = parts.length > 1 ? spots.filter((_, i) => i % parts.length === pi) : spots, tints = mine.map(() => 0.85 + random() * 0.3);
          meshes.push(make(part.geometry, part, mine, tints));
          light.push(part.light === part.geometry ? meshes[meshes.length - 1] : make(part.light, part, mine, tints));
        });
        out.push({ centre, radius, view: k.view, meshes, light });
      }
    });
    return out;
  }), [curve, density, models, towns]);

  // wet rock: darker and glossier as the rain soaks it (the same wetness the road and ground use), drying slowly
  const rockMaterials = useMemo(() => [...new Set(models[0].map((p) => p.material as MeshStandardMaterial))], [models]);
  useFrame(({ camera }) => {
    for (const m of rockMaterials) {
      m.userData.dry ??= { color: m.color.clone(), roughness: m.roughness };
      const dry = m.userData.dry as { color: Color; roughness: number };
      m.color.copy(dry.color).multiplyScalar(1 - 0.38 * weather.wet); m.roughness = dry.roughness * (1 - 0.55 * weather.wet);
    }
    for (const c of chunks) {
      const d = camera.position.distanceTo(c.centre) - c.radius, shown = d < c.view, full = d < FULL;
      c.meshes.forEach((mesh, i) => {
        const light = c.light[i];
        if (light === mesh) { mesh.visible = shown; return; } // no light version of this part
        mesh.visible = shown && full; light.visible = shown && !full;
      });
    }
  });
  return <>{chunks.flatMap((c, i) => [...new Set([...c.meshes, ...c.light])].map((mesh, j) => <primitive key={`${i}-${j}`} object={mesh} />))}</>;
}
