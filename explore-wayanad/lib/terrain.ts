import { MathUtils, Vector3, CatmullRomCurve3 } from "three";
import type { Heightmap, RoadData } from "./heightmap";

/* ---- world frame ----
 * x = east, -z = north, y = up. Origin on the ground at Adivaram (OSM place node), where the churam starts.
 * 1 unit = 10 m keeps the road, posts and hairpin spacing at the scale the scene was built for.
 */
export const GEO = {
  origin: { lat: 11.4849767, lon: 76.0126133 },
  unitsPerMetre: 0.1,
  verticalExaggeration: 1,
};

/* Real terrain, once setHeightmap() has run: the baked Copernicus GLO-30 grid placed in world units. */
type Field = { hm: Heightmap; west: number; north: number; cellX: number; cellZ: number; base: number; perLat: number; perLon: number };
let field: Field | null = null;

/* Real road, once setHeightmap() has a road: NH766 in world units, its smoothed bed, and a hash for distance queries. */
type RealRoad = { curve: CatmullRomCurve3; bends: number[]; arch: number; index: RoadIndex };
let road: RealRoad | null = null;

export function setHeightmap(hm: Heightmap, roadData?: RoadData | null) {
  const { bounds: b, size, metres } = hm, s = GEO.unitsPerMetre, { lat, lon } = GEO.origin;
  const perLon = metres.width / (b.east - b.west), perLat = metres.height / (b.north - b.south);
  const next: Field = {
    hm, perLat, perLon,
    west: (b.west - lon) * perLon * s,
    north: -(b.north - lat) * perLat * s,
    cellX: (metres.width * s) / (size - 1),
    cellZ: (metres.height * s) / (size - 1),
    base: 0,
  };
  next.base = elevation(next, 0, 0);
  field = next;
  road = roadData ? buildRealRoad(roadData) : null;
}

/** lat/lon → world x, z in the heightmap's frame. */
function toWorld(f: Field, lat: number, lon: number) {
  return { x: (lon - GEO.origin.lon) * f.perLon * GEO.unitsPerMetre, z: -(lat - GEO.origin.lat) * f.perLat * GEO.unitsPerMetre };
}

/** Bilinear elevation in metres at world (x, z); clamps to the edge outside the baked bounds. */
function elevation(f: Field, x: number, z: number) {
  const n = f.hm.size - 1, d = f.hm.data;
  const cx = MathUtils.clamp((x - f.west) / f.cellX, 0, n), cz = MathUtils.clamp((z - f.north) / f.cellZ, 0, n);
  const x0 = Math.min(Math.floor(cx), n - 1), z0 = Math.min(Math.floor(cz), n - 1), fx = cx - x0, fz = cz - z0;
  const i = z0 * f.hm.size + x0;
  const top = d[i] * (1 - fx) + d[i + 1] * fx, bottom = d[i + f.hm.size] * (1 - fx) + d[i + f.hm.size + 1] * fx;
  return top * (1 - fz) + bottom * fz;
}

/** Terrain height before the road is cut in. */
function groundHeight(f: Field, x: number, z: number) {
  return (elevation(f, x, z) - f.base) * GEO.unitsPerMetre * GEO.verticalExaggeration;
}

/** World-space rectangle covered by the heightmap and its sample spacing; null while procedural. */
export function terrainGrid() {
  if (!field) return null;
  const n = field.hm.size - 1;
  return { west: field.west, north: field.north, width: field.cellX * n, length: field.cellZ * n, size: field.hm.size, attribution: field.hm.attribution };
}

/* ---- the real road ----
 * The DSM includes canopy, so the raw profile along the road jumps by 20–30 m where it passes under trees.
 * The bed is a moving average of it, and height() blends the terrain down/up to the bed within ROAD_CUT of the centre line.
 */
const ROAD_SMOOTH = 8; // ± samples (10 m each) in the bed's moving average
const ROAD_CUT = { flat: 1.3, edge: 4 }; // units from the centre line: fully on the bed, then easing back to terrain

type RoadIndex = { cell: number; buckets: Map<string, number[]>; xs: Float32Array; zs: Float32Array; bed: Float32Array };

function buildRealRoad(data: RoadData): RealRoad {
  const f = field!, n = data.points.length;
  const xs = new Float32Array(n), zs = new Float32Array(n), raw = new Float32Array(n), bed = new Float32Array(n);
  data.points.forEach(([lat, lon], i) => {
    const p = toWorld(f, lat, lon);
    xs[i] = p.x; zs[i] = p.z; raw[i] = groundHeight(f, p.x, p.z);
  });
  for (let i = 0; i < n; i++) {
    let sum = 0, count = 0;
    for (let k = Math.max(0, i - ROAD_SMOOTH); k <= Math.min(n - 1, i + ROAD_SMOOTH); k++) { sum += raw[k]; count++; }
    bed[i] = sum / count;
  }
  const pts = Array.from({ length: n }, (_, i) => new Vector3(xs[i], bed[i] + 0.6, zs[i]));
  const curve = new CatmullRomCurve3(pts, false, "catmullrom", 0.5);
  curve.arcLengthDivisions = n * 8;

  // t for a distance along the road: arc length over the 3D polyline, which is what getPointAt() parameterises
  const cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + pts[i].distanceTo(pts[i - 1]);
  const tAt = (along: number) => cum[Math.min(n - 1, Math.round(along / data.step))] / cum[n - 1];

  const cell = ROAD_CUT.edge, buckets = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.floor(xs[i] / cell)},${Math.floor(zs[i] / cell)}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(i);
  }
  return { curve, bends: data.bends.map((b) => tAt(b.along)), arch: tAt(data.arch.along), index: { cell, buckets, xs, zs, bed } };
}

/** Nearest road sample to (x, z) within ROAD_CUT.edge, or null. */
function nearestRoad(idx: RoadIndex, x: number, z: number) {
  const cx = Math.floor(x / idx.cell), cz = Math.floor(z / idx.cell);
  let best = -1, bestD = ROAD_CUT.edge * ROAD_CUT.edge;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    for (const i of idx.buckets.get(`${cx + dx},${cz + dz}`) ?? []) {
      const d = (idx.xs[i] - x) ** 2 + (idx.zs[i] - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return best < 0 ? null : { bed: idx.bed[best], d: Math.sqrt(bestD) };
}

/* ---- procedural stand-in for the Thamarassery ghat ----
 * Used until the heightmap loads, or if it fails to. Without the OSM road, the road stays procedural too.
 */

export const TERRAIN = { width: 220, length: 420, offsetZ: 60 };

/** Ground height along the drive's centre line (x = 0). */
export function ramp(z: number): number {
  return field ? height(0, z) : MathUtils.smoothstep(-z, 0, 200) * 95;
}

function noise(x: number, z: number) {
  return (
    3.2 * Math.sin(x * 0.09) * Math.cos(z * 0.07) +
    1.6 * Math.sin(x * 0.31 + z * 0.17) +
    0.9 * Math.cos(x * 0.53 - z * 0.41) +
    0.4 * Math.sin(x * 1.3) * Math.cos(z * 1.1)
  );
}

export function height(x: number, z: number): number {
  if (field) {
    const ground = groundHeight(field, x, z), near = road && nearestRoad(road.index, x, z);
    if (!near) return ground;
    const w = 1 - MathUtils.smoothstep(near.d, ROAD_CUT.flat, ROAD_CUT.edge);
    return ground + (near.bed - ground) * w;
  }
  const valley = Math.max(0, 1 - Math.abs(x) / 90);
  return ramp(z) + noise(x, z) * (0.6 + valley * 0.8) - valley * 2;
}

export const ROAD = { bends: 9, spanX: 20, dz: 13 };

export function buildRoadCurve() {
  if (road) return road.curve;
  const pts: Vector3[] = [];
  const { bends, spanX, dz } = ROAD;
  for (let b = 0; b <= bends; b++) {
    const z = 10 - b * dz;
    const xa = b % 2 === 0 ? -spanX : spanX;
    const xb = -xa;
    const steps = 14;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = xa + (xb - xa) * t;
      const zz = z - dz * 0.35 * Math.sin(t * Math.PI);
      pts.push(new Vector3(x, height(x, zz) + 0.6, zz));
    }
  }
  const last = pts[pts.length - 1];
  for (let k = 1; k <= 12; k++) {
    const x = last.x * (1 - k / 12);
    const zz = last.z - k * 8;
    pts.push(new Vector3(x, height(x, zz) + 0.6, zz));
  }
  return new CatmullRomCurve3(pts, false, "catmullrom", 0.5);
}

/** t along the road curve at each hairpin apex, 1 → 9. Procedural: the prototype's evenly spaced counter thresholds. */
export function bendTs(): number[] {
  return road ? road.bends : Array.from({ length: ROAD.bends }, (_, i) => (0.88 * (i + 1)) / 9.99);
}

/** t along the curve where the Lakkidi gateway stands. */
export function archT(): number {
  return road ? road.arch : 0.905;
}
