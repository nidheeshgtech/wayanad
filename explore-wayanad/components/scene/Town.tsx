"use client";
import { timed } from "@/lib/perf";
import { freeze } from "@/lib/freeze";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { duskness, nightness } from "@/lib/theme";
import { LAMP_COLOURS, setLights } from "@/lib/neon";
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, ConeGeometry, Float32BufferAttribute, Group, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3,
} from "three";
import { SECTION, archT, forestRoad, height, placesT, roadShapeAt } from "@/lib/terrain";
import { townLots, type Lot } from "./realTowns";
import { buildTown, townWallMaterials } from "./townKit";
import { rubble } from "./stone";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* Lakkidi after the gateway: a strip of shops and houses on both sides, as in photographs of the place — one- and
 * two-storey concrete buildings in Kerala's pastel paints, tiled hip roofs or flat roofs with parapets, shop fronts with
 * rolling shutters or open counters under painted signboards, and a line of electric poles with sagging wires.
 * Generated, not mapped: the buildings are typical, not surveyed. Scene units (1 = 10 m). */
const END_MARGIN = 0.5; // units kept clear of the road's end
const SETBACK: [number, number] = [SECTION.half + 0.3, SECTION.half + 0.55]; // building front from the centre line: a 3–5 m forecourt
const FLOOR = 0.32; // 3.2 m storeys
const WALLS = ["#efe6c8", "#e8d48a", "#bfe0c4", "#a9cfe0", "#f2f0ea", "#e9c3b5", "#d9e8a0", "#f0d9a8", "#c9c3e3"];
const BOARDS = [["#c62828", "#fff"], ["#1565c0", "#fff"], ["#2e7d32", "#fff"], ["#f9a825", "#222"], ["#6a1b9a", "#fff"], ["#ffffff", "#c62828"]];
const SHOPS = ["TEA STALL", "BAKERY", "STORES", "HOTEL", "TEXTILES", "MEDICALS", "HARDWARE", "FANCY", "MOBILES", "FRUITS", "SPICES", "HOME STAY", "TAILORS", "VEGETABLES"];

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The road-facing wall: shop front (shutters or an open counter) under a signboard, windows above, grime at the foot. */
function facade(r: () => number, wall: string, floors: number, shop: boolean) {
  const W = 256, H = 128 * floors, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = wall; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, H - 40, 0, H); g.addColorStop(0, "rgba(60,50,40,0)"); g.addColorStop(1, "rgba(60,50,40,0.35)");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const ground = H - 128;
  if (shop) {
    const [bg, fg] = BOARDS[Math.floor(r() * BOARDS.length)];
    x.fillStyle = bg; x.fillRect(10, ground + 8, W - 20, 26);
    x.fillStyle = fg; x.font = "700 18px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(SHOPS[Math.floor(r() * SHOPS.length)], W / 2, ground + 22);
    const bays = 2 + Math.floor(r() * 2), bw = (W - 20) / bays;
    for (let b = 0; b < bays; b++) {
      const bx = 10 + b * bw + 4, by = ground + 40, w = bw - 8, h = 84;
      if (r() < 0.5) { // rolling shutter
        x.fillStyle = "#8d9093"; x.fillRect(bx, by, w, h);
        x.fillStyle = "rgba(0,0,0,0.18)"; for (let y = by; y < by + h; y += 5) x.fillRect(bx, y, w, 1.5);
      } else { // open counter: dark interior, goods on shelves
        x.fillStyle = "#2a2622"; x.fillRect(bx, by, w, h);
        for (let k = 0; k < 14; k++) { x.fillStyle = `hsl(${Math.floor(r() * 360)},55%,${40 + r() * 25}%)`; x.fillRect(bx + 4 + r() * (w - 14), by + 8 + Math.floor(r() * 3) * 24, 6 + r() * 8, 10); }
      }
    }
  } else { // house: door and a window
    x.fillStyle = "#6b4a2f"; x.fillRect(W * 0.18, ground + 40, 36, 86);
    x.fillStyle = "#2c3a40"; x.fillRect(W * 0.55, ground + 46, 70, 44);
    x.strokeStyle = "#f6f4ee"; x.lineWidth = 4; x.strokeRect(W * 0.55, ground + 46, 70, 44);
  }
  for (let f = 0; f < floors - 1; f++) { // upper floors: windows with frames, a sunshade above
    const y = f * 128;
    for (const wx of [30, 150]) {
      x.fillStyle = "#33424a"; x.fillRect(wx, y + 38, 76, 50);
      x.strokeStyle = "#f4f2ec"; x.lineWidth = 4; x.strokeRect(wx, y + 38, 76, 50);
      x.fillStyle = "rgba(0,0,0,0.25)"; x.fillRect(wx - 6, y + 30, 88, 6);
    }
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t;
}

function building(r: () => number, width: number, shop: boolean, storeys?: number) {
  const g = new Group(), floors = storeys ?? (r() < 0.6 ? 1 : 2), depth = 0.7 + r() * 0.35, h = floors * FLOOR, below = 1.5;
  const wall = WALLS[Math.floor(r() * WALLS.length)];
  const plain = new MeshStandardMaterial({ color: wall, roughness: 0.92 });
  const front = new MeshStandardMaterial({ map: facade(r, wall, floors, shop), roughness: 0.85 });
  // box faces: +x, -x, +y, -y, +z (front, toward the road), -z; runs `below` into the ground for slopes
  const body = new Mesh(new BoxGeometry(width, h + below, depth), [plain, plain, plain, plain, front, plain]);
  body.position.set(0, (h - below) / 2, -depth / 2);
  // the facade texture covers only the part above ground
  front.map!.repeat.set(1, (h + below) / h); front.map!.offset.set(0, -below / h);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  if (r() < 0.55) { // tiled hip roof with eaves
    const geo = new ConeGeometry(Math.SQRT1_2, 1, 4); geo.rotateY(Math.PI / 4); geo.translate(0, 0.5, 0);
    const roof = new Mesh(geo, new MeshStandardMaterial({ color: r() < 0.7 ? 0xb5563a : 0x8a3f2c, roughness: 0.8 }));
    roof.scale.set(width * 1.12, 0.13 + r() * 0.06, depth * 1.15); roof.position.set(0, h, -depth / 2);
    roof.castShadow = true; g.add(roof);
  } else { // flat concrete roof: parapet, and now and then a blue sheet over it
    const parapet = new Mesh(new BoxGeometry(width, 0.08, depth), new MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.95 }));
    parapet.position.set(0, h + 0.04, -depth / 2); g.add(parapet);
    if (r() < 0.35) {
      const sheet = new Mesh(new BoxGeometry(width * 0.7, 0.01, depth * 0.7), new MeshStandardMaterial({ color: 0x2f6fb5, roughness: 0.6 }));
      sheet.position.set(0, h + 0.12, -depth / 2); sheet.rotation.z = 0.08; g.add(sheet);
    }
  }
  if (shop && r() < 0.5) { // a sunshade over the shop front
    const shade = new Mesh(new BoxGeometry(width * 0.95, 0.012, 0.16), new MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.8 }));
    shade.position.set(0, 0.24, 0.08); shade.rotation.x = 0.18; shade.castShadow = true; g.add(shade);
  }
  return g;
}

/* What stands past the gateway, in order, from photographs of Lakkidi: on the left a grey stone shed, a teal building,
 * then the small temple (white compound wall with red pillars, a tiled pavilion, the shrine behind); a few shops further
 * on, with forest between. The right side is mostly forest. `at` is metres past the gate (×0.1 → units), `w` the frontage. */
type Kind = "shed" | "teal" | "temple" | "shop" | "house";
const PLAN: { side: 1 | -1; at: number; w: number; kind: Kind }[] = [
  { side: 1, at: 6, w: 7, kind: "shed" },
  { side: 1, at: 15, w: 6, kind: "teal" },
  { side: 1, at: 24, w: 28, kind: "temple" },
  { side: 1, at: 95, w: 8, kind: "shop" },
  { side: 1, at: 106, w: 7, kind: "shop" },
  { side: 1, at: 190, w: 9, kind: "house" },
  { side: -1, at: 70, w: 8, kind: "shop" },
  { side: -1, at: 230, w: 9, kind: "house" },
  { side: 1, at: 330, w: 8, kind: "shop" },
  { side: -1, at: 345, w: 10, kind: "shop" },
  { side: 1, at: 345, w: 7, kind: "shop" },
];

/** Where each building stands: position, rotation (front, +z, toward the road), and a footprint radius that keeps
 * trees and rocks off it (Vegetation and Props call this too). Pure: no DOM, deterministic. */
export type Placed = { side: 1 | -1; w: number; kind: Kind; at: Vector3; y: number; rotation: number; radius: number; floors?: number };

/** Which road a curve is, and its named places (as t), for the towns on it (realTowns). */
const roadOf = (curve: CatmullRomCurve3) => { const f = forestRoad(); return f && f.curve === curve ? { road: "forest" as const, places: f.places } : { road: "churam" as const, places: placesT() }; };

/** Everything built along the road: Lakkidi's hand-placed few past the gateway (drive from Adivaram only), then the
 * towns' lots (realTowns). Each with its position and a footprint radius that keeps trees and rocks off it (Vegetation
 * and Props call this too); Lakkidi's with the rotation that faces it to the road. Pure, deterministic, cached. */
const plans = new WeakMap<CatmullRomCurve3, Placed[]>();
export function townPlan(curve: CatmullRomCurve3) {
  const hit = plans.get(curve); if (hit) return hit;
  const L = curve.getLength(), gate = archT() * L, up = new Vector3(0, 1, 0), out: Placed[] = [], { road, places } = roadOf(curve);
  const place = (s: number, side: 1 | -1, w: number, kind: Kind, offset: number, floors?: number) => {
    const t = Math.min(0.999, Math.min(s, L - END_MARGIN) / L);
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t).setY(0).normalize(), left = new Vector3().crossVectors(up, tan).normalize();
    const at = p.clone().addScaledVector(left, side * (offset + roadShapeAt(t).widen)), facing = left.clone().multiplyScalar(-side);
    out.push({ side, w, kind, at, y: Math.min(height(at.x, at.z), p.y - 0.6), rotation: Math.atan2(facing.x, facing.z), radius: w * 0.75 + (kind === "temple" ? 0.6 : 0.4), floors });
  };
  if (road === "churam") PLAN.forEach((b, i) => {
    const w = b.w * 0.1;
    place(gate + b.at * 0.1 + w / 2, b.side, w, b.kind, b.kind === "temple" ? SECTION.half + 0.45 : SETBACK[0] + ((i * 0.37) % 1) * (SETBACK[1] - SETBACK[0]));
  });
  for (const lot of townLots(curve, road, places)) out.push({ side: 1, w: lot.radius * 2, kind: lot.kind === "house" ? "house" : "shop", at: lot.centre, y: lot.y, rotation: 0, radius: lot.radius + 0.25, floors: lot.floors });
  plans.set(curve, out);
  return out;
}

/* How far each town spreads along the road (metres before and after its place), for the tea estates' town circles. */
const SPREAD: Record<string, [number, number]> = { Vythiri: [250, 300], Chundale: [200, 200], Kalpetta: [900, 0] };

/** Town circles [x, z, radius] in units for lib/estates (no tea in town): Lakkidi, and each Act 2 town. */
export function townCircles(curve: CatmullRomCurve3): [number, number, number][] {
  const L = curve.getLength(), at = (t: number) => curve.getPointAt(Math.min(0.999, t));
  const lakkidi = at(archT() + 30 / L);
  return [[lakkidi.x, lakkidi.z, 45], ...placesT().filter((p) => SPREAD[p.name]).map((p): [number, number, number] => {
    const [before, after] = SPREAD[p.name], c = at(p.t - ((before - after) / 2) * 0.1 / L);
    return [c.x, c.z, ((before + after) / 2) * 0.1 + 15];
  })];
}

/* Buildings bucketed on a grid (per plan, built on first use): placement asks inTown for every plant and rock, and a
 * scan of all ~300 buildings each time was most of the vegetation's build time. */
const TOWN_CELL = 3; // units; at least the largest footprint radius (the temple, ~2.7)
const townGrids = new WeakMap<ReturnType<typeof townPlan>, Map<number, Placed[]>>();
const cellKey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

/** True where a tree or rock would stand on or against a building. */
export function inTown(x: number, z: number, plan: ReturnType<typeof townPlan>) {
  let grid = townGrids.get(plan);
  if (!grid) {
    grid = new Map();
    for (const b of plan) {
      const k = cellKey(Math.floor(b.at.x / TOWN_CELL), Math.floor(b.at.z / TOWN_CELL));
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(b);
    }
    townGrids.set(plan, grid);
  }
  const cx = Math.floor(x / TOWN_CELL), cz = Math.floor(z / TOWN_CELL);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    for (const b of grid.get(cellKey(cx + dx, cz + dz)) ?? []) if ((b.at.x - x) ** 2 + (b.at.z - z) ** 2 < b.radius ** 2) return true;
  }
  return false;
}

/* Lakkidi's small roadside temple: low white compound wall on red pillars along the road, an entrance with a tiled
 * pavilion, the shrine behind under a two-tier tiled roof. Local x along the road, +z toward it. Units. */
function temple(w: number) {
  const g = new Group(), white = new MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.9 });
  const red = new MeshStandardMaterial({ color: 0xb4432a, roughness: 0.8 }), tiles = new MeshStandardMaterial({ color: 0xa9502f, roughness: 0.85 });
  const add = (m: Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const gap = 0.45;
  for (const [from, to] of [[-w / 2, -gap / 2], [gap / 2, w / 2]]) {
    add(new Mesh(new BoxGeometry(to - from, 0.1 + 1, 0.04), white), (from + to) / 2, 0.05 - 0.5, 0);
    for (let x = from; x <= to + 1e-6; x += 0.3) add(new Mesh(new BoxGeometry(0.05, 0.16 + 1, 0.05), red), x, 0.08 - 0.5, 0);
  }
  // entrance pavilion: four red pillars under a tiled hip roof
  for (const [x, z] of [[-0.2, -0.05], [0.2, -0.05], [-0.2, -0.45], [0.2, -0.45]]) add(new Mesh(new BoxGeometry(0.035, 0.24, 0.035), red), x, 0.12, z);
  const hip = (sx: number, sz: number, h: number) => { const geo = new ConeGeometry(Math.SQRT1_2, 1, 4); geo.rotateY(Math.PI / 4); geo.translate(0, 0.5, 0); const m = new Mesh(geo, tiles); m.scale.set(sx, h, sz); return m; };
  add(hip(0.62, 0.62, 0.16), 0, 0.24, -0.25);
  // the shrine
  add(new Mesh(new BoxGeometry(0.5, 0.28 + 1, 0.5), white), 0, 0.14 - 0.5, -1.0);
  add(new Mesh(new BoxGeometry(0.52, 0.05, 0.52), red), 0, 0.02, -1.0);
  add(hip(0.72, 0.72, 0.16), 0, 0.28, -1.0);
  add(hip(0.42, 0.42, 0.14), 0, 0.4, -1.0);
  add(new Mesh(new ConeGeometry(0.02, 0.08, 8), new MeshStandardMaterial({ color: 0xc9a23a, metalness: 0.8, roughness: 0.35 })), 0, 0.57, -1.0);
  return g;
}

/** Small buildings by the gate: the grey rubble shed (lean-to roof) and the teal one, as in the photo. */
function shed(w: number) {
  const g = new Group(), stone = new MeshStandardMaterial({ map: rubble({ seed: 3 }), roughness: 0.95 });
  stone.map!.repeat.set(2, 1);
  const body = new Mesh(new BoxGeometry(w, 0.3 + 1, 0.6), stone); body.position.set(0, 0.15 - 0.5, -0.3);
  const roof = new Mesh(new BoxGeometry(w * 1.05, 0.015, 0.7), new MeshStandardMaterial({ color: 0x5d5a52, roughness: 0.8 }));
  roof.position.set(0, 0.32, -0.3); roof.rotation.x = -0.18;
  for (const m of [body, roof]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  return g;
}
function teal(w: number) {
  const g = new Group(), wall = new MeshStandardMaterial({ color: 0x2f8f86, roughness: 0.85 });
  const body = new Mesh(new BoxGeometry(w, 0.34 + 1, 0.7), wall); body.position.set(0, 0.17 - 0.5, -0.35);
  const door = new Mesh(new BoxGeometry(0.12, 0.22, 0.01), new MeshStandardMaterial({ color: 0x3b2c22 })); door.position.set(w * 0.2, 0.11, 0.001);
  const parapet = new Mesh(new BoxGeometry(w, 0.05, 0.7), new MeshStandardMaterial({ color: 0xe9e6dd, roughness: 0.9 })); parapet.position.set(0, 0.36, -0.35);
  for (const m of [body, door, parapet]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  return g;
}

export default function Town({ curve }: { curve: CatmullRomCurve3 }) {
  const group = useMemo(() => timed("town", () => {
    const g = new Group(), L = curve.getLength(), r = rng(1966), gate = archT() * L, up = new Vector3(0, 1, 0);
    const frame = (s: number) => {
      const t = Math.min(0.999, s / L), p = curve.getPointAt(t), tan = curve.getTangentAt(t).setY(0).normalize();
      return { p, tan, left: new Vector3().crossVectors(up, tan).normalize() }; // driver's left
    };
    const { road, places } = roadOf(curve), lots = townLots(curve, road, places);
    // the towns: per town, walls and the rest as two merged meshes (townKit)
    const byTown = new Map<string, Lot[]>(); for (const lot of lots) (byTown.get(lot.town) ?? byTown.set(lot.town, []).get(lot.town)!).push(lot);
    let seed = 17; for (const [, list] of byTown) for (const m of buildTown(list, seed++ * 7919, height)) g.add(m);
    for (const b of townPlan(curve).slice(0, road === "churam" ? PLAN.length : 0)) { // Lakkidi's few, each its own
      const obj = b.kind === "temple" ? temple(b.w) : b.kind === "shed" ? shed(b.w) : b.kind === "teal" ? teal(b.w) : building(r, b.w, b.kind === "shop", b.floors);
      obj.position.set(b.at.x, b.y, b.at.z);
      obj.rotation.y = b.rotation;
      g.add(obj);
    }
    // electric poles on the left with three sagging wires
    // (all in one mesh: as one mesh each, the ~460 poles and their arms were ~920 draw calls)
    const poleMat = new MeshStandardMaterial({ color: 0x9a9890, roughness: 0.9 }), tops: Vector3[][] = [], parts: BufferGeometry[] = [];
    // and on every other pole a street lamp over the road: a sodium-orange head on an arm, lit after dark, with the
    // pool of light it throws on the road (one mesh of soft additive quads, shown only at dusk and night)
    const heads: BufferGeometry[] = [], pools: BufferGeometry[] = [], lit: { x: number; y: number; z: number; color: Color; power: number }[] = [];
    let n = 0;
    for (let s = gate - 1; road === "churam" && s < L - END_MARGIN; s += 3.5) { // (the drive from Adivaram: past the gate)
      const { p, tan, left } = frame(s), at = p.clone().addScaledVector(left, SECTION.half + 0.22), y = height(at.x, at.z);
      const yaw = Math.atan2(tan.x, tan.z);
      parts.push(new BoxGeometry(0.02, 0.9, 0.02).translate(at.x, y + 0.45, at.z));
      parts.push(new BoxGeometry(0.12, 0.012, 0.012).rotateY(yaw + Math.PI / 2).translate(at.x, y + 0.85, at.z));
      tops.push([-0.05, 0, 0.05].map((k) => at.clone().addScaledVector(left, k).setY(y + 0.86)));
      if (n++ % 2) continue;
      const arm = at.clone().addScaledVector(left, -0.16);
      parts.push(new BoxGeometry(0.18, 0.008, 0.008).rotateY(yaw + Math.PI / 2).translate(at.x - left.x * 0.09, y + 0.78, at.z - left.z * 0.09));
      // neon at night (lib/neon): each lamp its own colour, in turn along the road, on its head and its pool of light
      const colour = LAMP_COLOURS[(n >> 1) % LAMP_COLOURS.length];
      heads.push(tint(new BoxGeometry(0.06, 0.012, 0.028).rotateY(yaw + Math.PI / 2).translate(arm.x, y + 0.772, arm.z), colour));
      const pool = p.clone().addScaledVector(left, SECTION.half * 0.35);
      pools.push(tint(new PlaneGeometry(1.1, 1.3).rotateX(-Math.PI / 2).rotateY(yaw).translate(pool.x, p.y + 0.012, pool.z), colour));
      lit.push({ x: arm.x, y: y + 0.772, z: arm.z, color: colour, power: 1 });
    }
    if (parts.length) { const poles = new Mesh(mergeGeometries(parts, false), poleMat); poles.castShadow = true; g.add(poles); parts.forEach((x) => x.dispose()); }
    if (heads.length) {
      const lamps = new Mesh(mergeGeometries(heads, false), LAMP.head); lamps.name = "street-lamps"; g.add(lamps);
      const light = new Mesh(mergeGeometries(pools, false), LAMP.pool); light.name = "street-light"; light.renderOrder = 2; light.visible = false; g.add(light);
      heads.forEach((x) => x.dispose()); pools.forEach((x) => x.dispose());
      setLights("street-lamps-" + road, lit); // mirrored in the wet road (lib/neon)
    }
    const wires: number[] = [];
    for (let i = 1; i < tops.length; i++) for (let w = 0; w < 3; w++) {
      const a = tops[i - 1][w], b = tops[i][w];
      for (let k = 0; k < 8; k++) {
        const u0 = k / 8, u1 = (k + 1) / 8, sag = (u: number) => 0.06 * 4 * u * (1 - u);
        wires.push(a.x + (b.x - a.x) * u0, a.y + (b.y - a.y) * u0 - sag(u0), a.z + (b.z - a.z) * u0, a.x + (b.x - a.x) * u1, a.y + (b.y - a.y) * u1 - sag(u1), a.z + (b.z - a.z) * u1);
      }
    }
    const wg = new BufferGeometry(); wg.setAttribute("position", new Float32BufferAttribute(wires, 3));
    g.add(new LineSegments(wg, new LineBasicMaterial({ color: 0x2a2a2a })));
    g.name = "town";
    freeze(g, true); // (2000 buildings, wires and poles that never move: no matrix work per frame)
    return g;
  }), [curve]);
  // after dark: the shops' signs and windows lit, the street lamps on and their light on the road
  useFrame(() => {
    const k = Math.max(nightness(), 0.45 * duskness());
    for (const m of townWallMaterials) m.emissiveIntensity = 1.6 * k;
    LAMP.head.emissiveIntensity = 0.2 + 7 * k;
    LAMP.pool.opacity = 0.55 * k;
    const pool = group.getObjectByName("street-light"); if (pool) pool.visible = k > 0.02;
  });
  return <primitive object={group} />;
}

/** A geometry in one colour (vertex colours), for merging with others in theirs. */
function tint<T extends BufferGeometry>(g: T, c: Color): T {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new Float32BufferAttribute(a, 3)); return g;
}

/** The street lamps' heads and the light they throw (shared by both roads' towns). */
const LAMP = (() => {
  // each head carries its neon colour as vertex colours: the glow takes it (the dark body takes a little)
  const head = new MeshStandardMaterial({ color: 0x3a342c, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.6, vertexColors: true });
  head.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;"); };
  head.customProgramCacheKey = () => "street-lamp-neon";
  let pool: MeshBasicMaterial;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d")!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.45, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
    pool = new MeshBasicMaterial({ map: t, color: 0xffffff, vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  } else pool = new MeshBasicMaterial();
  return { head, pool };
})();
