/**
 * Fetches the scene's surface textures from Poly Haven (CC0: no attribution required).
 *
 *   npm run fetch:textures
 *
 * For each texture: colour (diffuse) and OpenGL normal map at 1k, resized to SIZE px with macOS `sips` when available
 * (keeps the page light; the 1k original is kept otherwise), written to public/textures/<name>-{color,normal}.jpg.
 */
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

/** scene role → Poly Haven asset id. Chosen 2026-10-19 for the Western Ghats in the monsoon. */
const TEXTURES = {
  ground: "forest_leaves_02", // mossy floor and leaf litter on the verges and slopes
  rock: "lichen_rock", // dark wet rock on the road cuts
  asphalt: "asphalt_02", // worn, cracked road surface
};
const SIZE = 512;
const OUT = path.resolve(import.meta.dirname, "../public/textures");
const UA = { "User-Agent": "explore-wayanad-bake/0.1 (texture fetch script)" };

type Files = Record<string, Record<string, Record<string, { url: string }>>>;

await mkdir(OUT, { recursive: true });
let sips = true;
try { execFileSync("sips", ["--help"], { stdio: "ignore" }); } catch { sips = false; }
for (const [name, id] of Object.entries(TEXTURES)) {
  const files: Files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json();
  for (const [map, key] of [["color", "Diffuse"], ["normal", "nor_gl"]] as const) {
    const url = files[key]?.["1k"]?.jpg?.url;
    if (!url) throw new Error(`${id}: no 1k ${key} jpg`);
    const file = path.join(OUT, `${name}-${map}.jpg`), tmp = `${file}.1k.jpg`;
    await writeFile(tmp, Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer()));
    if (sips) {
      execFileSync("sips", ["-Z", String(SIZE), "-s", "format", "jpeg", "-s", "formatOptions", "80", tmp, "--out", file], { stdio: "ignore" });
      await rm(tmp);
    } else {
      await rename(tmp, file);
    }
  }
  console.log(`  ${name.padEnd(8)} ← ${id}`);
}
console.log(`wrote ${Object.keys(TEXTURES).length} textures to public/textures (${sips ? `${SIZE}px` : "1k, sips unavailable"})`);
