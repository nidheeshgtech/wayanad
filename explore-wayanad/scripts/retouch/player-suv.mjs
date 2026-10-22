/**
 * The car you drive, unbranded: from the fetched model (brezza-player.glb, CC BY — public/models/traffic/ATTRIBUTION.md)
 * to public/models/traffic/player-suv.glb.
 *  - removes the maker's badges: the "S" emblem and chrome name letters on the tailgate, the hybrid badge, the logo on
 *    the steering wheel
 *  - repaints the decal sheet (stored upside down; used by the number plates): every plate reads WAYANAD, the hybrid
 *    script blank (pixel boxes in the 512² sheet)
 * Needs @gltf-transform/core, /extensions, /functions and meshoptimizer resolvable (e.g. a node_modules link to an npx
 * cache of @gltf-transform/cli) and ImageMagick:  node scripts/retouch/player-suv.mjs <in.glb> <out.glb>
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [input, output] = process.argv.slice(2);
const BADGES = ["boot_alu_sensors_rear.0_0", "boot_alu_badge_sensors_rear.0_0", "smart hybrid_cons_ac_alu.0_0", "boot_decals_bg_boot_decals_bg.0_0", "steer_logo_cons_ac_alu.0_0"];
const SHEETS = ["plate_bg.0", "headsup_display_decal.0"]; // materials whose base colour is the decal sheet
const FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf";

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

for (const node of root.listNodes()) if (BADGES.includes(node.getName())) { console.log("removed", node.getName()); node.dispose(); }

const dir = mkdtempSync(join(tmpdir(), "player-suv-"));
const done = new Set();
for (const material of root.listMaterials()) {
  if (!SHEETS.includes(material.getName())) continue;
  const texture = material.getBaseColorTexture();
  if (!texture || done.has(texture)) continue;
  done.add(texture);
  const src = join(dir, "sheet.webp"), out = join(dir, "sheet-new.webp");
  writeFileSync(src, texture.getImage());
  // the sheet is stored upside down (as the original lettering shows): each name is drawn centred in its box, flipped
  const label = (w, h, size, color, text, x, y) => ["(", "-size", `${w}x${h}`, "xc:none", "-font", FONT, "-pointsize", String(size), "-fill", color,
    "-gravity", "center", "-annotate", "+0+0", text, "-flip", ")", "-gravity", "NorthWest", "-geometry", `+${x}+${y}`, "-composite"];
  execFileSync("magick", [src,
    "-fill", "srgb(40,39,41)", "-draw", "rectangle 183,9 396,37",   // plate (bevelled): its text
    "-fill", "srgb(37,34,37)", "-draw", "rectangle 191,50 388,75",  // plate (plain): its text
    "-fill", "white", "-draw", "rectangle 343,205 506,224", "-draw", "rectangle 404,230 509,247", // rear plate lettering, hybrid script
    ...label(214, 29, 22, "#f2f2f2", "WAYANAD", 183, 9), ...label(198, 26, 20, "#f2f2f2", "WAYANAD", 191, 50),
    ...label(164, 20, 16, "#111111", "WAYANAD", 343, 205),
    "-quality", "92", out]);
  texture.setImage(readFileSync(out)).setMimeType("image/webp");
  console.log("repainted", material.getName());
}

await doc.transform(prune());
await io.write(output, doc);
console.log("wrote", output);
