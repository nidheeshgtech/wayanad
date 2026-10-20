// Download a Sketchfab model (CC licence, downloadable) and make it web-ready for traffic:
//   node scripts/fetch-sketchfab.mjs <uid> <name> [--size 1024] [--ratio 1]
// - needs SKETCHFAB_TOKEN (free account → Settings → Password & API) in the environment or .env.local
// - raw download goes to .cache/sketchfab/<name>.src.glb (not committed)
// - output: public/models/traffic/<name>.glb — meshopt-compressed geometry, WebP textures at most --size px,
//   optionally simplified to --ratio of its triangles (gltf-transform CLI, run via npx at bake time only)
// - prints the credit line for ATTRIBUTION.md (CC BY requires: title, author, source link, licence)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

const [uid, name, ...rest] = process.argv.slice(2);
if (!uid || !name) { console.error("usage: node scripts/fetch-sketchfab.mjs <uid> <name> [--size 1024] [--ratio 1]"); process.exit(1); }
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
const size = +opt("size", 1024), ratio = +opt("ratio", 1);

let token = process.env.SKETCHFAB_TOKEN;
if (!token && existsSync(".env.local")) token = /^SKETCHFAB_TOKEN=(.+)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim();
if (!token) { console.error("SKETCHFAB_TOKEN missing (env or .env.local)"); process.exit(1); }

const api = (path, auth) => fetch(`https://api.sketchfab.com/v3/${path}`, auth ? { headers: { Authorization: `Token ${token}` } } : {}).then(async (r) => {
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`); return r.json();
});

const info = await api(`models/${uid}`);
const licence = info.license?.label ?? "unknown";
if (!/^CC Attribution$|^CC0|Public Domain/i.test(licence)) { console.error(`licence "${licence}" is not CC BY / CC0 — not importing`); process.exit(1); }
const dl = await api(`models/${uid}/download`, true);
if (!dl.glb?.url) throw new Error("no GLB archive offered for this model");

mkdirSync(".cache/sketchfab", { recursive: true });
const src = `.cache/sketchfab/${name}.src.glb`, out = `public/models/traffic/${name}.glb`;
writeFileSync(src, Buffer.from(await (await fetch(dl.glb.url)).arrayBuffer()));

const gt = (...a) => execFileSync("npx", ["--yes", "@gltf-transform/cli@4.1.1", ...a], { stdio: "inherit" });
const steps = ["optimize", src, out, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", String(size)];
if (ratio < 1) steps.push("--simplify", "true", "--simplify-ratio", String(ratio), "--simplify-error", "0.002");
else steps.push("--simplify", "false");
gt(...steps);

const mb = (f) => (statSync(f).size / 1e6).toFixed(2) + " MB";
console.log(`\n${name}: ${mb(src)} → ${mb(out)} (${info.faceCount} faces in source)`);
console.log(`credit: - \`${name}.glb\`: **${info.name}** by ${info.user.displayName} (${info.user.profileUrl}), ${licence}. ${info.viewerUrl}`);
