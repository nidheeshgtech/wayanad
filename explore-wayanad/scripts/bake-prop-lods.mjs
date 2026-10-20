// Lighter versions of the roadside scans (Poly Haven rock_07 and fern_02), for everything but the stretch of road you're
// on: the same shapes simplified with meshoptimizer (gltf-transform), geometry only — Props.tsx draws them with the full
// scan's own material and textures, so nothing else is downloaded or uploaded twice.
//   node scripts/bake-prop-lods.mjs   →   public/models/<name>/<name>_lod.gltf + .bin
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

const MODELS = { rock_07: 0.1, fern_02: 0.35 }; // share of the triangles kept
const gt = (...a) => execFileSync("npx", ["--yes", "@gltf-transform/cli@4.1.1", ...a], { stdio: ["ignore", "ignore", "inherit"] });

for (const [name, ratio] of Object.entries(MODELS)) {
  const dir = `public/models/${name}`, tmp = `.cache/lod/${name}`;
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  gt("weld", `${dir}/${name}.gltf`, `${tmp}/welded.glb`);
  gt("simplify", `${tmp}/welded.glb`, `${tmp}/simple.glb`, "--ratio", String(ratio), "--error", "0.01");
  gt("copy", `${tmp}/simple.glb`, `${tmp}/${name}_lod.gltf`);
  // geometry only: drop the images (the full scan's material is reused at runtime)
  const doc = JSON.parse(readFileSync(`${tmp}/${name}_lod.gltf`, "utf8"));
  delete doc.images; delete doc.textures; delete doc.samplers;
  for (const m of doc.materials ?? []) { delete m.pbrMetallicRoughness; delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture; }
  doc.buffers[0].uri = `${name}_lod.bin`;
  renameSync(`${tmp}/${name}_lod.bin`, `${dir}/${name}_lod.bin`);
  writeFileSync(`${dir}/${name}_lod.gltf`, JSON.stringify(doc));
  const tris = doc.meshes.flatMap((m) => m.primitives).reduce((a, p) => a + doc.accessors[p.indices].count / 3, 0);
  console.log(`${name}: ${tris} triangles in the light version`);
}
