/**
 * The car you drive, unbranded: from the fetched model (brezza-player.glb, CC BY — public/models/traffic/ATTRIBUTION.md)
 * to public/models/traffic/player-suv.glb.
 *  - removes the maker's badges: the "S" emblem and chrome name letters on the tailgate, the hybrid badge, the logo on
 *    the steering wheel, and cuts the "S" out of the chrome bar across the grille (triangles whose centre is in a box
 *    round it, model coordinates, front +z: found on the dev review page, app/dev/car) and covers the S-shaped recess
 *    behind it with a plain dark square (a blank badge) in the grille's own material
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
const ERASE = [["bumpf_sensors_rear.0_0", { min: [-0.075, 0.95, 2.33], max: [0.075, 1.09, 2.4] }]];
const PATCHES = [{ at: [0, 1.02, 2.352], size: [0.15, 0.13], like: "frnt_grille_parttt_chassis.0_0" }];
const SHEETS = ["plate_bg.0", "headsup_display_decal.0"]; // materials whose base colour is the decal sheet
const FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf";

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

for (const node of root.listNodes()) if (BADGES.includes(node.getName())) { console.log("removed", node.getName()); node.dispose(); }
for (const [name, box] of ERASE) {
  const node = root.listNodes().find((n) => n.getName() === name);
  if (!node) { console.warn("no part", name); continue; }
  const prim = node.getMesh().listPrimitives()[0], pos = prim.getAttribute("POSITION"), idx = prim.getIndices(), m = node.getWorldMatrix();
  const world = (i) => { const p = pos.getElement(i, []); return [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]); };
  const keep = [];
  for (let t = 0; t < idx.getCount(); t += 3) {
    const ids = [0, 1, 2].map((k) => idx.getScalar(t + k)), c = [0, 1, 2].map((a) => ids.reduce((sum, i) => sum + world(i)[a], 0) / 3);
    if (!c.every((v, a) => v >= box.min[a] && v <= box.max[a])) keep.push(...ids);
  }
  console.log("cut", (idx.getCount() - keep.length) / 3, "triangles from", name);
  idx.setArray(new (idx.getArray().constructor)(keep));
}

for (const { at: [x, y, z], size: [w, h], like } of PATCHES) {
  const ref = root.listNodes().find((n) => n.getName() === like), buffer = root.listBuffers()[0];
  if (!ref) { console.warn("no part", like); continue; }
  const accessor = (type, array) => doc.createAccessor().setType(type).setBuffer(buffer).setArray(array);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", accessor("VEC3", new Float32Array([x - w / 2, y - h / 2, z, x + w / 2, y - h / 2, z, x + w / 2, y + h / 2, z, x - w / 2, y + h / 2, z])))
    .setAttribute("NORMAL", accessor("VEC3", new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])))
    .setIndices(accessor("SCALAR", new Uint16Array([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2])))
    .setMaterial(ref.getMesh().listPrimitives()[0].getMaterial());
  root.listScenes()[0].addChild(doc.createNode("patch_badge_0").setMesh(doc.createMesh("patch_badge").addPrimitive(prim)));
  console.log("covered", [x, y, z].join(","));
}

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
