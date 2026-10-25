/**
 * The four extra player cars (data/cars.ts), unbranded — the same job player-suv.mjs does for the first car:
 *  - deletes the parts that are only a badge (emblems, name letters, dealer badges);
 *  - cuts the badge out of larger chrome parts: triangles whose centre lies in a small box round the emblem or the
 *    name lettering (boxes found on the dev review page, app/dev/car, in the model file's own coordinates);
 *  - covers holes left in a body panel where an emblem sat (a flat square of that panel's paint over it, like a blank badge);
 *  - repaints every number plate, wherever its picture sits in the texture, as a white plate reading WAYANAD — the
 *    direction the text runs is worked out from how the plate's texture coordinates follow the car's left-right and
 *    up-down, so it reads the right way on front and rear plates whatever the file's layout.
 * Input: the baked model (scripts/fetch-sketchfab.mjs output) kept in .cache/sketchfab/<name>.baked.glb; output:
 * public/models/traffic/<name>.glb. Needs @gltf-transform/core, /extensions, /functions and meshoptimizer resolvable,
 * and ImageMagick.   node scripts/retouch/player-cars.mjs [name ...]
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const box = (x0, y0, z0, x1, y1, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
// front faces +z, rear −z. `erase`: [part name, box] pairs; `drop`: whole parts; `plates`: [part, box | null (whole part), "front" | "rear"]
const CARS = {
  "player-hatch": {
    drop: ["grill2_reflector.4_0", "boot_reflector.4_0", "boot_reflector.1_0"],
    erase: [],
    plates: [["seat_reflector.1_0", box(-0.3, 0.4, 2.0, 0.3, 0.56, 2.1), "front"], ["plate_reflector.1_0", null, "rear"]],
  },
  "player-sedan": {
    drop: [],
    erase: [
      ["grille_wheel_rf.1_0", box(-0.1, 0.52, 1.9, 0.1, 0.64, 2.05)], ["grille_wheel_rf.2_0", box(-0.1, 0.52, 1.9, 0.1, 0.64, 2.05)],
      ["boot_wheel_rf.1_0", box(-0.08, 0.99, -2.05, 0.08, 1.12, -1.9)], ["boot_wheel_rf.1_0", box(0.33, 0.96, -2.05, 0.64, 1.07, -1.85)],
    ],
    plates: [["grille_grille.2_0", null, "front"], ["boot_grille.2_0", null, "rear"]],
  },
  "player-4x4": {
    drop: ["int_boot_wheel_rf.0_0", "int_boot_wheel_rf.1_0", "boot_wheel_rf.3_0"],
    erase: [
      ["chassis_wheel_rf.1_0", box(-0.13, 0.91, 2.3, 0.13, 1.07, 2.45)], ["chassis_wheel_rf.2_0", box(-0.13, 0.91, 2.3, 0.13, 1.07, 2.45)],
      ["boot_wheel_rf.1_0", box(-0.11, 1.01, -2.25, 0.11, 1.15, -2.08)], ["boot_wheel_rf.1_0", box(-0.7, 1.09, -2.25, -0.3, 1.21, -2.05)],
      ["boot_wheel_rf.1_0", box(0.3, 0.69, -2.25, 0.7, 0.81, -2.05)],
      // the rear emblem pressed into the tailgate: only the faces standing proud of the panel
      ["boot_primary_0", box(-0.12, 1.03, -2.3, 0.12, 1.15, -2.1755)],
    ],
    plates: [["scorpio_n_ext_1_scorpio_n_ext_1.2_0", null, "front"], ["boot_scorpio_n_ext_1.2_0", null, "rear"]],
  },
  "player-mpv": {
    drop: ["boot_movsteer_1.0.1_0"],
    // the tailgate panel has the emblem's shape cut through it: a square of body paint over the hole, like a blank badge
    patches: [{ at: [0, 1.082, -1.9985], size: [0.15, 0.12], like: "boot_primary_0" }],
    erase: [
      ["ertiga_bodyshell_02_wheel_rf.0_0", box(-0.11, 0.67, 2.28, 0.09, 0.81, 2.45)], ["ertiga_bodyshell_03_wheel_rf.2_0", box(-0.11, 0.67, 2.28, 0.09, 0.81, 2.45)],
      ["boot_wheel_rf.0_0", box(-0.08, 1.02, -2.05, 0.08, 1.15, -1.9)], ["boot_wheel_rf.0_0", box(0.32, 0.81, -2.0, 0.63, 0.92, -1.85)],
    ],
    plates: [["chassis_chassis.1_0", null, "front"]],
  },
};
const FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf";

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const dir = mkdtempSync(join(tmpdir(), "player-cars-"));

/** World-space corners of each triangle of a node's first primitive, with its indices. */
function triangles(node) {
  const prim = node.getMesh().listPrimitives()[0], pos = prim.getAttribute("POSITION"), uv = prim.getAttribute("TEXCOORD_0");
  const idx = prim.getIndices(), m = node.getWorldMatrix(), n = idx ? idx.getCount() : pos.getCount();
  const world = (i) => { const p = pos.getElement(i, []); return [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]); };
  const tris = [];
  for (let t = 0; t < n; t += 3) {
    const ids = [0, 1, 2].map((k) => (idx ? idx.getScalar(t + k) : t + k));
    tris.push({ ids, p: ids.map(world), uv: uv ? ids.map((i) => uv.getElement(i, [])) : null });
  }
  return { prim, idx, tris };
}
const inside = (b, p) => p.every((v, i) => v >= b.min[i] && v <= b.max[i]);
const centre = (t) => [0, 1, 2].map((i) => (t.p[0][i] + t.p[1][i] + t.p[2][i]) / 3);

for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CARS)) {
  const cfg = CARS[name], doc = await io.read(`.cache/sketchfab/${name}.baked.glb`), root = doc.getRoot();
  const byName = (n) => root.listNodes().find((x) => x.getName() === n);
  for (const n of cfg.drop) { const node = byName(n); if (node) { node.dispose(); console.log(name, "dropped", n); } else console.warn(name, "no part", n); }
  for (const [n, b] of cfg.erase) {
    const node = byName(n); if (!node) { console.warn(name, "no part", n); continue; }
    const { prim, idx, tris } = triangles(node);
    const keep = tris.filter((t) => !inside(b, centre(t)));
    if (keep.length === tris.length) { console.warn(name, "nothing in box on", n); continue; }
    idx.setArray(new (idx.getArray().constructor)(keep.flatMap((t) => t.ids)));
    console.log(name, "cut", tris.length - keep.length, "triangles from", n);
  }
  for (const { at, size, like } of cfg.patches ?? []) {
    const ref = byName(like); if (!ref) { console.warn(name, "no part", like); continue; }
    const [x, y, z] = at, [w, h] = size, buffer = root.listBuffers()[0];
    const pos = doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(new Float32Array([x - w / 2, y - h / 2, z, x + w / 2, y - h / 2, z, x + w / 2, y + h / 2, z, x - w / 2, y + h / 2, z]));
    const nor = doc.createAccessor().setType("VEC3").setBuffer(buffer).setArray(new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]));
    const ind = doc.createAccessor().setType("SCALAR").setBuffer(buffer).setArray(new Uint16Array([0, 2, 1, 0, 3, 2, 0, 1, 2, 0, 2, 3]));
    const prim = doc.createPrimitive().setAttribute("POSITION", pos).setAttribute("NORMAL", nor).setIndices(ind).setMaterial(ref.getMesh().listPrimitives()[0].getMaterial());
    root.listScenes()[0].addChild(doc.createNode("patch_primary_0").setMesh(doc.createMesh("patch_primary").addPrimitive(prim)));
    console.log(name, "patched a hole at", at.join(","));
  }
  for (const [n, b, face] of cfg.plates) {
    const node = byName(n); if (!node) { console.warn(name, "no plate", n); continue; }
    const { prim, tris } = triangles(node), sel = tris.filter((t) => t.uv && (!b || inside(b, centre(t))));
    // the plate's face: its biggest triangles (a plate part can carry its frame and edges too)
    const big = Math.max(...sel.map(area)), face_ = sel.filter((t) => area(t) > big * 0.5);
    const tex = prim.getMaterial()?.getBaseColorTexture();
    if (!sel.length || !tex) { console.warn(name, "plate", n, "has no texture/triangles"); continue; }
    // the plate's picture in the texture, and which way "right" (to the viewer) and "up" run across it
    const us = face_.flatMap((t) => t.uv.map((q) => q[0])), vs = face_.flatMap((t) => t.uv.map((q) => q[1]));
    // the picture's extent in the image: a plate spanning the whole (repeating) texture uses all of it; one sitting a
    // whole repeat over is brought back into the image
    const span = (vals) => { const lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo > 0.95) return [0, 1]; const k = Math.floor(lo + 1e-6); return [lo - k, hi - k]; };
    const [[u0, u1], [v0, v1]] = [span(us), span(vs)];
    const t = sel.reduce((a, c) => (area(c) > area(a) ? c : a)), g = gradient(t), right = face === "front" ? 1 : -1;
    const ru = g.dudx * right, rv = g.dvdx * right, uu = g.dudy, uv = g.dvdy;
    const src = join(dir, "t.img"), out = join(dir, "t.webp"), size = execFileSync("magick", ["identify", "-format", "%w %h", "-"], { input: tex.getImage() }).toString().split(" ").map(Number);
    writeFileSync(src, tex.getImage());
    const [W, H] = size, clamp = (v, n) => Math.min(n, Math.max(0, v));
    const x0 = clamp(Math.floor(u0 * W), W), x1 = clamp(Math.ceil(u1 * W), W), y0 = clamp(Math.floor(v0 * H), H), y1 = clamp(Math.ceil(v1 * H), H);
    // draw the plate upright, then turn it to how the texture holds it
    const horiz = Math.abs(ru) >= Math.abs(rv), w = horiz ? x1 - x0 : y1 - y0, h = horiz ? y1 - y0 : x1 - x0;
    const ops = horiz ? [...(ru < 0 ? ["-flop"] : []), ...(uv > 0 ? ["-flip"] : [])] : ["-rotate", rv > 0 ? "90" : "-90", ...((rv > 0 ? uu > 0 : uu < 0) ? ["-flop"] : [])];
    execFileSync("magick", [src, "(", "-size", `${Math.max(8, w)}x${Math.max(4, h)}`, "xc:#f4f4f2", "-fill", "#111", "-font", FONT, "-gravity", "center",
      "-pointsize", String(Math.max(6, Math.round(Math.min(h * 0.62, w / 6.6)))), "-annotate", "+0+0", "WAYANAD", ...ops, ")",
      "-gravity", "NorthWest", "-geometry", `+${x0}+${y0}`, "-composite", "-quality", "92", out]);
    tex.setImage(readFileSync(out)).setMimeType("image/webp");
    console.log(name, "plate", face, n, `uv ${u0.toFixed(3)}–${u1.toFixed(3)} × ${v0.toFixed(3)}–${v1.toFixed(3)}`, horiz ? "horizontal" : "turned", ops.join(" "));
  }
  await doc.transform(prune());
  await io.write(`public/models/traffic/${name}.glb`, doc);
  console.log(name, "written");
}

function area(t) { const [a, b, c] = t.p, ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]); return Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]); }
/** How u and v change with world x and y across a (flat, upright) triangle. */
function gradient(t) {
  const [a, b, c] = t.p, [ta, tb, tc] = t.uv;
  const x1 = b[0] - a[0], y1 = b[1] - a[1], x2 = c[0] - a[0], y2 = c[1] - a[1], det = x1 * y2 - x2 * y1 || 1e-9;
  const du1 = tb[0] - ta[0], du2 = tc[0] - ta[0], dv1 = tb[1] - ta[1], dv2 = tc[1] - ta[1];
  return { dudx: (du1 * y2 - du2 * y1) / det, dudy: (x1 * du2 - x2 * du1) / det, dvdx: (dv1 * y2 - dv2 * y1) / det, dvdy: (x1 * dv2 - x2 * dv1) / det };
}
