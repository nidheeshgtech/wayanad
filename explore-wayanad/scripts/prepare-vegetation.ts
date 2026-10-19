/**
 * Prepares the vegetation cut-outs used as instanced "cards" in the churam scene.
 *
 *   npm run prepare:vegetation      (needs ImageMagick: `magick`)
 *
 * Source: AI-generated images (Higgsfield, gpt_image_2_5, transparent background), 2026-10-19 — generic plants of the
 * Western Ghats, not photographs of real places; the owner allows generated images for this. Each is downloaded,
 * trimmed to its visible pixels, resized to SIZE px tall and saved as WebP with alpha to public/vegetation/<name>.webp.
 * data/vegetation.json records each card's aspect (width / height) so the scene sizes the quads correctly.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const BASE = "https://d8j0ntlcm91z4.cloudfront.net/user_3HpGzGV7UqFphYoUoTuds9yuacm";
/** name → [Higgsfield result file, height in px after resizing]. Prompts are summarised in public/vegetation/README.md. */
const SOURCES: Record<string, [string, number]> = {
  "tree-evergreen": ["hf_20261019_110612_6db50c2e-932a-45e8-969c-489751973e92.png", 512],
  "tree-broadleaf": ["hf_20261019_110613_175c5b84-3972-4a02-b54b-ef774a03b195.png", 512],
  "tree-young": ["hf_20261019_110612_f3abc865-49f9-4e2e-b7de-0f9dfa29a376.png", 384],
  "palm-coconut": ["hf_20261019_110611_93078b19-c8fe-4383-bcc5-99be0dc8358e.png", 512],
  bamboo: ["hf_20261019_110611_c46699cb-0e92-424a-b80f-ae2101864ab9.png", 512],
  fern: ["hf_20261019_110610_28cbc2c4-6cb5-47ac-a561-b07163ff3e5f.png", 256],
  grass: ["hf_20261019_110610_fbc08655-d7d8-4f9e-82cd-41c6c3db8348.png", 256],
  bush: ["hf_20261019_110611_0eb6f6ed-4989-4f37-af25-384471db54dc.png", 256],
  "tree-fig": ["hf_20261019_182154_ea6e156d-aff1-462a-bf84-e9eba7592ee0.png", 512],
  "tree-emergent": ["hf_20261019_182156_ad54c2b1-9151-4ab5-989f-ff64e140e94e.png", 512],
  banana: ["hf_20261019_182155_0dfc7657-c852-4f98-ac7b-85cb46a048d7.png", 384],
  shrub: ["hf_20261019_182155_2b9fae5d-ef7d-4e37-8664-7703db5b7c4c.png", 256],
  creeper: ["hf_20261019_182155_85c05b88-b3ad-4a9d-99be-1b2146b2a267.png", 384],
  teak: ["hf_20261019_142353_d4940634-3d65-40c3-b524-f0f62e2f5a9e.png", 512],
  elephant: ["hf_20261019_142353_00268537-3a1d-4345-b1b4-3c3fea99f8cb.png", 384],
};
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/vegetation");

await mkdir(OUT, { recursive: true });
const meta: Record<string, { aspect: number }> = {};
for (const [name, [file, px]] of Object.entries(SOURCES)) {
  const src = path.join(OUT, `${name}.src.png`), dst = path.join(OUT, `${name}.webp`);
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  await writeFile(src, Buffer.from(await res.arrayBuffer()));
  // the generator leaves a faint, whitish semi-transparent glow round each plant, and its transparent pixels are white;
  // in the GPU's smaller mip levels both bleed into the leaves as a pale halo. So: make alpha hard (leaf or nothing),
  // trim the 1 px fringe, and give every transparent pixel a dark leaf colour.
  execFileSync("magick", [
    src, "-channel", "A", "-threshold", "55%", "+channel", "-trim", "+repage",
    "-channel", "A", "-morphology", "Erode", "Disk:1", "+channel",
    "-background", "#24301c", "-alpha", "background",
    "-resize", `x${px}`, "-quality", "82", "-define", "webp:alpha-quality=90", "-define", "webp:exact=true", dst,
  ]);
  await rm(src);
  const [w, h] = execFileSync("magick", ["identify", "-format", "%w %h", dst]).toString().split(" ").map(Number);
  meta[name] = { aspect: +(w / h).toFixed(3) };
  console.log(`  ${name.padEnd(15)} ${w}×${h}  ${((await readFile(dst)).length / 1024).toFixed(0)} KB`);
}
await writeFile(path.join(ROOT, "data/vegetation.json"), JSON.stringify(meta, null, 2) + "\n");
console.log(`wrote ${Object.keys(meta).length} cut-outs to public/vegetation and data/vegetation.json`);
