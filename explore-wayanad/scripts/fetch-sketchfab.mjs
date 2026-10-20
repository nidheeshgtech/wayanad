// Download a Sketchfab model (CC licence, downloadable) and make it web-ready for traffic:
//   node scripts/fetch-sketchfab.mjs <uid> <name> [--size 1024] [--ratio 1] [--error 0.002] [--no-normal-maps] [--turn] [--keep-parts] [--out dir] [--reuse]
// - needs SKETCHFAB_TOKEN (free account → Settings → Password & API) in the environment or .env.local
// - raw download goes to .cache/sketchfab/<name>.src.glb (not committed)
// - output: public/models/traffic/<name>.glb — meshopt-compressed geometry, WebP textures at most --size px,
//   optionally simplified to --ratio of its triangles (gltf-transform CLI, run via npx at bake time only)
// - prints the credit line for ATTRIBUTION.md (CC BY requires: title, author, source link, licence)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [uid, name, ...rest] = process.argv.slice(2);
const reuse = process.argv.includes("--reuse"); // skip the download, re-bake from .cache
if (!uid || !name) { console.error("usage: node scripts/fetch-sketchfab.mjs <uid> <name> [--size 1024] [--ratio 1]"); process.exit(1); }
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
const size = +opt("size", 1024), ratio = +opt("ratio", 1), error = +opt("error", 0.002);
const turn = rest.includes("--turn"); // the model faces −Z: turn it round so its front faces +Z like the traffic expects
const flat = rest.includes("--no-normal-maps");
const keepParts = rest.includes("--keep-parts"); // named parts (wheels, doors) stay separate objects, for animating // drop normal maps (and tangents): fine detail nobody sees at traffic distance

let token = process.env.SKETCHFAB_TOKEN;
if (!token && existsSync(".env.local")) token = /^SKETCHFAB_TOKEN=(.+)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim();
if (!token) { console.error("SKETCHFAB_TOKEN missing (env or .env.local)"); process.exit(1); }

const api = (path, auth) => fetch(`https://api.sketchfab.com/v3/${path}`, auth ? { headers: { Authorization: `Token ${token}` } } : {}).then(async (r) => {
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`); return r.json();
});

const info = await api(`models/${uid}`);
const licence = info.license?.label ?? "unknown";
if (!/^CC Attribution$|^CC0|Public Domain/i.test(licence)) { console.error(`licence "${licence}" is not CC BY / CC0 — not importing`); process.exit(1); }
mkdirSync(".cache/sketchfab", { recursive: true });
const src = `.cache/sketchfab/${name}.src.glb`, out = `${opt("out", "public/models/traffic")}/${name}.glb`; // --out <dir>: somewhere else (wildlife)
if (!reuse || !existsSync(src)) {
  const dl = await api(`models/${uid}/download`, true);
  if (!dl.glb?.url) throw new Error("no GLB archive offered for this model");
  writeFileSync(src, Buffer.from(await (await fetch(dl.glb.url)).arrayBuffer()));
}

const gt = (...a) => execFileSync("npx", ["--yes", "@gltf-transform/cli@4.1.1", ...a], { stdio: "inherit" });
// older Sketchfab exports use spec-gloss materials, which three.js no longer reads: convert to metal-rough, unpacked
// (textures as PNG files) so they can be retouched
const dir = `.cache/sketchfab/${name}`, gltf = `${dir}/${name}.gltf`;
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
gt("metalrough", src, `${dir}/mr.glb`);
gt("copy", `${dir}/mr.glb`, gltf);
// the conversion leaves ior 1000 and a specular colour map on every material: that makes paint a tinted mirror at
// glancing angles (roofs went pink). Plain metal-rough is what the models were painted for.
const doc = JSON.parse(readFileSync(gltf, "utf8"));
for (const m of doc.materials ?? []) { if (m.extensions) { delete m.extensions.KHR_materials_ior; delete m.extensions.KHR_materials_specular; } }
for (const k of ["extensionsUsed", "extensionsRequired"]) if (doc[k]) doc[k] = doc[k].filter((e) => !/KHR_materials_(ior|specular)$/.test(e));
if (turn) for (const scene of doc.scenes ?? []) {
  doc.nodes.push({ name: "face-forward", rotation: [0, 1, 0, 0], children: scene.nodes });
  scene.nodes = [doc.nodes.length - 1];
}
if (flat) {
  for (const m of doc.materials ?? []) delete m.normalTexture;
  for (const mesh of doc.meshes ?? []) for (const p of mesh.primitives) delete p.attributes.TANGENT;
}
// extra UV sets no texture reads (exports often carry lightmap UVs): dead weight in every vertex
const usedUV = new Set([0]);
JSON.stringify(doc.materials ?? [], (k, v) => { if (k === "texCoord") usedUV.add(v); return v; });
for (const mesh of doc.meshes ?? []) for (const p of mesh.primitives) for (const a of Object.keys(p.attributes)) {
  const uv = /^TEXCOORD_(\d+)$/.exec(a); if (uv && !usedUV.has(+uv[1])) delete p.attributes[a];
}
writeFileSync(gltf, JSON.stringify(doc));
// per-model retouch (repaint, plates, badges): scripts/retouch/<name>.sh runs in the unpacked folder, on its PNGs
const retouch = `scripts/retouch/${name}.sh`;
if (existsSync(retouch)) execFileSync("bash", [resolve(retouch)], { cwd: dir, stdio: "inherit" });
const steps = ["optimize", gltf, out, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", String(size)];
if (ratio < 1) steps.push("--simplify", "true", "--simplify-ratio", String(ratio), "--simplify-error", String(error));
else steps.push("--simplify", "false");
if (keepParts) steps.push("--join-named", "false", "--flatten", "false");
gt(...steps);

const mb = (f) => (statSync(f).size / 1e6).toFixed(2) + " MB";
console.log(`\n${name}: ${mb(src)} → ${mb(out)} (${info.faceCount} faces in source)`);
console.log(`credit: - \`${name}.glb\`: **${info.name}** by ${info.user.displayName} (${info.user.profileUrl}), ${licence}. ${info.viewerUrl}`);
