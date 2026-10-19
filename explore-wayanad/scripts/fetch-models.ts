/**
 * Fetches the scene's 3D scanned models from Poly Haven (CC0: no attribution required).
 *
 *   npm run fetch:models      (needs ImageMagick: `magick`)
 *
 * Each model's 1k glTF (geometry .bin + textures) goes to public/models/<id>/ with the textures resized to TEX px,
 * keeping their file names so the .gltf's references still resolve.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const MODELS = ["rock_07", "fern_02"]; // a mossy boulder, a fern clump: the two that fit the churam's roadside
const TEX = 512;
const ROOT = path.resolve(import.meta.dirname, "../public/models");
const UA = { "User-Agent": "explore-wayanad-bake/0.1 (model fetch script)" };

type Entry = { url: string; size: number };
for (const id of MODELS) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json();
  const gltf: Entry & { include: Record<string, Entry> } = files.gltf["1k"].gltf;
  const dir = path.join(ROOT, id);
  await mkdir(path.join(dir, "textures"), { recursive: true });
  const get = async (url: string) => Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer());
  await writeFile(path.join(dir, `${id}.gltf`), await get(gltf.url));
  let bytes = 0;
  for (const [rel, entry] of Object.entries(gltf.include)) {
    const out = path.join(dir, rel);
    await writeFile(out, await get(entry.url));
    if (/\.(jpe?g|png)$/i.test(rel)) execFileSync("magick", [out, "-resize", `${TEX}x${TEX}>`, "-quality", "82", out]);
    bytes += Number(execFileSync("stat", ["-f%z", out]).toString());
  }
  console.log(`  ${id.padEnd(10)} ${(bytes / 1024).toFixed(0)} KB`);
}
