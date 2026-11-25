/**
 * The towns along the road as lots: each a footprint ring on the ground (world x, z in units), how many storeys, what it
 * is (a shop row, a house, a public building), which wall colour, and what its shop sells. From OpenStreetMap where it
 * maps the town (lib/towns: Vythiri has most of its buildings mapped; Kalpetta's and Bathery's main roads have only a
 * few, in 2026), and filled along the road where it doesn't, in each town's own build: Kalpetta, the district
 * headquarters, a packed row of three- to five-storey concrete blocks; Sulthan Bathery two to four; Vythiri and
 * Chundale one or two among the trees (from photographs of the towns). Shops take their kind from the nearest mapped shop
 * or service. Pure and deterministic; cached per road curve. Scene units (1 = 10 m).
 */
import { CatmullRomCurve3, Vector3 } from "three";
import { SECTION, height, latLonToWorld, placesT, roadDistance, roadShapeAt } from "@/lib/terrain";
import { townData } from "@/lib/towns";
import { STREET, streetDistance, streets } from "@/lib/streets";
import { townClear } from "@/lib/townLife";

export type Lot = {
  ring: { x: number; z: number }[]; // counter-clockwise seen from above (+y), no repeated last point
  y: number; // ground level at the front
  floors: number;
  kind: "shop" | "house" | "civic";
  use: string; // what the shop sells (a sign kind: lib/towns POI uses mapped by townKit's SIGNS), "" for none
  colour: number; // wall colour index (townKit WALLS)
  toRoad: { x: number; z: number }; // unit direction to the road from the lot's centre
  centre: Vector3; radius: number;
  town: string;
  street?: boolean; // on a side street (lib/streets): its footpath is the forecourt
};

/* How each town fills its road where the map has no buildings: metres along the road before and after its place, how
 * much of the frontage is built, storeys to pick from, and the wall colours (Kalpetta mostly whites and creams). */
/* `gap`: the most space between neighbours (units; Kalpetta's and Bathery's rows share walls), `back`: how often a second
 * building stands behind the first row. */
const FILL: Record<string, { before: number; after: number; built: number; gap: number; back: number; floors: number[]; walls: number[] }> = {
  Vythiri: { before: 250, after: 300, built: 0.55, gap: 0.25, back: 0, floors: [1, 1, 2, 2, 3], walls: [0, 1, 2, 3, 4, 5, 6, 7] },
  Chundale: { before: 200, after: 200, built: 0.6, gap: 0.25, back: 0, floors: [1, 1, 2], walls: [0, 1, 2, 3, 4, 5, 6, 7] },
  Kalpetta: { before: 900, after: 0, built: 0.97, gap: 0.04, back: 0.6, floors: [2, 3, 3, 3, 4, 4, 5], walls: [0, 0, 1, 1, 6, 7, 3, 2] },
  "Sulthan Bathery": { before: 20, after: 650, built: 0.95, gap: 0.05, back: 0.45, floors: [2, 2, 3, 3, 4], walls: [0, 1, 1, 6, 7, 2, 4, 3] },
};
const FRONT = [SECTION.shoulder + 0.06, SECTION.shoulder + 0.32]; // fill lots' fronts from the centre line (footpath, forecourt)

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const area = (r: { x: number; z: number }[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.x * q.z - q.x * p.z; } return a / 2; };

const cache = new WeakMap<CatmullRomCurve3, Lot[]>();

/** The lots on this road (`road`: the drive from Adivaram, or the forest road from Bathery), with `places` its named
 * places as t on the curve (lib/terrain placesT / forestRoad().places). */
export function townLots(curve: CatmullRomCurve3, road: "churam" | "forest", places: { name: string; t: number }[]): Lot[] {
  const hit = cache.get(curve); if (hit) return hit;
  const data = townData(), lots: Lot[] = [], L = curve.getLength(), r = rng(road === "churam" ? 1966 : 1799), up = new Vector3(0, 1, 0);
  const grid = new Map<number, Lot[]>(), key = (x: number, z: number) => Math.floor(x / 2) * 100003 + Math.floor(z / 2);
  // (only mapped buildings are checked: the filled plots follow each other along the road and never overlap)
  const mapped = new Set<Lot>();
  const clash = (c: Vector3, rad: number) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const o of grid.get(key(c.x + dx * 2, c.z + dz * 2)) ?? [])
      if (mapped.has(o) && Math.hypot(o.centre.x - c.x, o.centre.z - c.z) < (o.radius + rad) * 0.75) return true;
    return false;
  };
  // kept clear: the side streets (lib/streets) and the town's places (lib/townLife: the pumps, the bus stand…)
  const keep = road === "churam" ? townClear(curve) : [];
  const blocked = (c: Vector3, rad: number) => road === "churam" && (streetDistance(curve, c.x, c.z) < STREET.path + rad * 0.85 + 0.05 || keep.some((k) => Math.hypot(k.at.x - c.x, k.at.z - c.z) < k.radius + rad * 0.7));
  const add = (lot: Lot) => { if (blocked(lot.centre, lot.radius)) return; lots.push(lot); const k = key(lot.centre.x, lot.centre.z); (grid.get(k) ?? grid.set(k, []).get(k)!).push(lot); };
  const pois: { x: number; z: number; use: string }[] = [];
  const finish = (ring: { x: number; z: number }[], floors: number, kind: Lot["kind"], use: string, colour: number, town: string) => {
    if (area(ring) < 0) ring.reverse();
    const c = new Vector3(ring.reduce((a, p) => a + p.x, 0) / ring.length, 0, ring.reduce((a, p) => a + p.z, 0) / ring.length);
    const radius = Math.max(...ring.map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
    // toward the road: the way the distance to it falls fastest
    const e = 0.05, d0 = roadDistance(c.x, c.z), gx = roadDistance(c.x + e, c.z) - d0, gz = roadDistance(c.x, c.z + e) - d0, gl = Math.hypot(gx, gz) || 1;
    // the ground at the front (the side nearest the road), never above the road's own level there
    const front = ring.reduce((a, p) => (roadDistance(p.x, p.z) < roadDistance(a.x, a.z) ? p : a), ring[0]);
    c.y = height(front.x, front.z);
    return { ring, y: c.y, floors, kind, use, colour, toRoad: { x: -gx / gl, z: -gz / gl }, centre: c, radius, town } satisfies Lot;
  };

  // 1 mapped buildings (never on the road or its shoulder; the map and the game's road differ by a metre or two)
  for (const town of data?.towns ?? []) {
    if (town.road !== road) continue;
    const f = FILL[town.name];
    for (const p of town.pois) { const w = latLonToWorld(p.lat, p.lon); pois.push({ x: w.x, z: w.z, use: p.use }); }
    for (const b of town.buildings) {
      const ring = b.fp.map(([lat, lon]) => latLonToWorld(lat, lon));
      const near = Math.min(...ring.map((p) => roadDistance(p.x, p.z)));
      if (near < SECTION.shoulder + 0.02 || near > 7) continue;
      const shopish = !!b.use || ["commercial", "retail", "shop", "hotel", "office"].includes(b.kind) || (b.kind === "yes" && near < 2.2);
      const civic = ["school", "hospital", "college", "church", "mosque", "temple", "public", "government", "civic", "bus_station"].includes(b.kind);
      const floors = b.levels ?? (civic ? 2 + Math.floor(r() * 2) : b.kind === "house" ? 1 + (r() < 0.4 ? 1 : 0) : f ? f.floors[Math.floor(r() * f.floors.length)] : 1 + Math.floor(r() * 2));
      const lot = finish(ring, Math.min(floors, 8), civic ? "civic" : shopish ? "shop" : "house", b.use ?? "", f ? f.walls[Math.floor(r() * f.walls.length)] : Math.floor(r() * 8), town.name);
      if (!clash(lot.centre, lot.radius) && !blocked(lot.centre, lot.radius)) { add(lot); mapped.add(lot); }
    }
  }
  // 2 the frontage where the map has none: plots along both sides, in the town's build
  for (const pl of places) {
    const f = FILL[pl.name]; if (!f) continue;
    const centre = pl.t * L;
    for (const side of [1, -1] as const) {
      for (let s = Math.max(1, centre - f.before * 0.1); s < Math.min(L - 1, centre + f.after * 0.1);) {
        const w = 0.55 + r() * 0.55, depth = 0.9 + r() * 0.6, off = FRONT[0] + r() * (FRONT[1] - FRONT[0]), built = r() < f.built;
        const t = Math.min(0.999, (s + w / 2) / L), p = curve.getPointAt(t), tan = curve.getTangentAt(t).setY(0).normalize(), left = new Vector3().crossVectors(up, tan).normalize();
        s += w + 0.01 + r() * f.gap;
        if (!built) continue;
        const front = p.clone().addScaledVector(left, side * (off + roadShapeAt(t).widen));
        const fwd = left.clone().multiplyScalar(side); // away from the road
        const a = front.clone().addScaledVector(tan, -w / 2), b = front.clone().addScaledVector(tan, w / 2);
        const ring = [a, b, b.clone().addScaledVector(fwd, depth), a.clone().addScaledVector(fwd, depth)].map((v) => ({ x: v.x, z: v.z }));
        if (Math.min(...ring.map((q) => roadDistance(q.x, q.z))) < SECTION.shoulder) continue; // (another stretch of road: a bend behind)
        const c = new Vector3((a.x + b.x) / 2 + fwd.x * depth / 2, 0, (a.z + b.z) / 2 + fwd.z * depth / 2);
        if (clash(c, Math.hypot(w, depth) / 2)) continue;
        let use = "", bestD = 0.7;
        for (const q of pois) { const d = Math.hypot(q.x - c.x, q.z - c.z); if (d < bestD) { bestD = d; use = q.use; } }
        const floors = f.floors[Math.floor(r() * f.floors.length)];
        add(finish(ring, floors, floors === 1 && r() < 0.35 ? "house" : "shop", use, f.walls[Math.floor(r() * f.walls.length)], pl.name));
        if (r() < f.back) { // a second building behind, a little taller or lower, its front hidden by the first
          const d2 = 0.8 + r() * 0.6, o = depth + 0.08, rr = [a, b].map((v) => v.clone().addScaledVector(fwd, o));
          const ring2 = [rr[0], rr[1], rr[1].clone().addScaledVector(fwd, d2), rr[0].clone().addScaledVector(fwd, d2)].map((v) => ({ x: v.x, z: v.z }));
          const c2 = new Vector3((rr[0].x + rr[1].x) / 2 + fwd.x * d2 / 2, 0, (rr[0].z + rr[1].z) / 2 + fwd.z * d2 / 2);
          if (!clash(c2, Math.hypot(w, d2) / 2)) add(finish(ring2, Math.max(1, floors + (r() < 0.5 ? 1 : -1)), "house", "", f.walls[Math.floor(r() * f.walls.length)], pl.name));
        }
      }
    }
  }
  cache.set(curve, lots);
  return lots;
}

/** The buildings along the side streets (lib/streets): shop rows both sides, two to four storeys, in Kalpetta's whites
 * and creams, their fronts to the street. Clear of the main road's own lots and of the places. Cached per road. */
const streetCache = new WeakMap<CatmullRomCurve3, Lot[]>();
export function streetLots(main: CatmullRomCurve3): Lot[] {
  const hit = streetCache.get(main); if (hit) return hit;
  const out: Lot[] = [], r = rng(2024), f = FILL.Kalpetta, others = townLots(main, "churam", placesOf(main)), keep = townClear(main);
  const free = (c: Vector3, rad: number) => roadDistance(c.x, c.z) > SECTION.shoulder + rad * 0.9 + 0.1
    && !others.some((o) => Math.hypot(o.centre.x - c.x, o.centre.z - c.z) < (o.radius + rad) * 0.8)
    && !out.some((o) => Math.hypot(o.centre.x - c.x, o.centre.z - c.z) < (o.radius + rad) * 0.75)
    && !keep.some((k) => Math.hypot(k.at.x - c.x, k.at.z - c.z) < k.radius + rad * 0.7);
  for (const st of streets(main)) {
    const L = st.length;
    for (const side of [1, -1] as const) {
      for (let s = 1.2; s < L - 1.2;) {
        const w = 0.5 + r() * 0.5, depth = 0.8 + r() * 0.5, t = Math.min(0.999, (s + w / 2) / L);
        s += w + 0.01 + r() * 0.05;
        if (r() > 0.93) continue; // now and then a gap: a lane, a gate
        const p = st.curve.getPointAt(t), tan = st.curve.getTangentAt(t).setY(0).normalize(), left = new Vector3().crossVectors(new Vector3(0, 1, 0), tan).normalize();
        const fwd = left.clone().multiplyScalar(side), front = p.clone().addScaledVector(fwd, STREET.path + 0.02);
        const a = front.clone().addScaledVector(tan, -w / 2), b = front.clone().addScaledVector(tan, w / 2);
        const ring = [a, b, b.clone().addScaledVector(fwd, depth), a.clone().addScaledVector(fwd, depth)].map((v) => ({ x: v.x, z: v.z }));
        const c = new Vector3((a.x + b.x) / 2 + fwd.x * depth / 2, 0, (a.z + b.z) / 2 + fwd.z * depth / 2), radius = Math.hypot(w, depth) / 2;
        if (!free(c, radius)) continue;
        if (area(ring) < 0) ring.reverse();
        const floors = [2, 2, 3, 3, 3, 4][Math.floor(r() * 6)];
        c.y = Math.min(height(front.x, front.z), p.y - 0.588);
        out.push({ ring, y: c.y, floors, kind: floors === 2 && r() < 0.2 ? "house" : "shop", use: "", colour: f.walls[Math.floor(r() * f.walls.length)], toRoad: { x: -fwd.x, z: -fwd.z }, centre: c, radius, town: "Kalpetta", street: true });
      }
    }
  }
  streetCache.set(main, out);
  return out;
}
const placesOf = (main: CatmullRomCurve3) => { void main; return placesT(); };
