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
 * The DSM includes canopy, so the raw profile along the road jumps by 20–30 m where it passes under trees; the bed is a
 * moving average of it. Around the bed, height() builds the road's cross-section at true scale (1 unit = 10 m):
 * asphalt, a gravel shoulder, a drain on the uphill side, then a steep cut up into the hillside or an embankment down
 * to it, blending back into the natural ground by SECTION.reach. The terrain mesh is too coarse for this (21 m cells);
 * a fine band along the road (RoadBand) shows it, and the coarse terrain sinks out of the way underneath.
 */
const ROAD_SMOOTH = 8; // ± samples (10 m each) in the bed's moving average
export const SECTION = {
  half: 0.4, // asphalt half-width: an 8 m two-lane ghat road
  shoulder: 0.72, // gravel shoulder out to here, a few cm below the asphalt
  drain: 0.92, // uphill side: a shallow drain out to here
  cut: 2.2, // rise per unit across a cut face (≈ 65°, rock)
  fill: 1.1, // fall per unit down an embankment (≈ 48°)
  reach: 9, // the profile has blended back into the natural ground by here
};

type RoadIndex = { cell: number; buckets: Map<number, number[]>; xs: Float32Array; zs: Float32Array; bed: Float32Array };

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

  const cell = SECTION.reach, buckets = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const key = bucketKey(Math.floor(xs[i] / cell), Math.floor(zs[i] / cell));
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(i);
  }
  return { curve, bends: data.bends.map((b) => tAt(b.along)), arch: tAt(data.arch.along), index: { cell, buckets, xs, zs, bed } };
}

const bucketKey = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

/** Distance from (x, z) to the road's centre line (nearest polyline segment) within SECTION.reach, and the bed height there. */
function nearestRoad(idx: RoadIndex, x: number, z: number) {
  const cx = Math.floor(x / idx.cell), cz = Math.floor(z / idx.cell), n = idx.xs.length;
  let best = Infinity, bed = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const list = idx.buckets.get(bucketKey(cx + dx, cz + dz));
    if (!list) continue;
    for (const i of list) {
      if (i + 1 >= n) continue;
      const ax = idx.xs[i], az = idx.zs[i], bx = idx.xs[i + 1] - ax, bz = idx.zs[i + 1] - az;
      const u = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz)));
      const d = (x - ax - bx * u) ** 2 + (z - az - bz * u) ** 2;
      if (d < best) { best = d; bed = idx.bed[i] + (idx.bed[i + 1] - idx.bed[i]) * u; }
    }
  }
  return best <= SECTION.reach * SECTION.reach ? { bed, d: Math.sqrt(best) } : null;
}

/** Distance to the road's centre line, or Infinity beyond SECTION.reach (for the terrain mesh to step aside, and for placement). */
export function roadDistance(x: number, z: number) {
  const near = road && nearestRoad(road.index, x, z);
  return near ? near.d : Infinity;
}

/** Natural ground under the road corridor, lightly smoothed (the DSM's canopy bumps would otherwise ripple the cut faces). */
function natural(f: Field, x: number, z: number) {
  return (groundHeight(f, x, z) * 2 + groundHeight(f, x + 1.2, z) + groundHeight(f, x - 1.2, z) + groundHeight(f, x, z + 1.2) + groundHeight(f, x, z - 1.2)) / 6;
}

/** The road's cross-section at distance d from the centre line, given the bed and the natural ground there. */
function crossSection(d: number, bed: number, ground: number) {
  let y: number;
  if (d <= SECTION.half) y = bed;
  else if (d <= SECTION.shoulder) y = bed - 0.025 * MathUtils.smoothstep(d, SECTION.half, SECTION.shoulder);
  else if (ground >= bed) {
    // uphill: a shallow drain, then the cut face rising until it meets the hillside
    y = d <= SECTION.drain
      ? bed - 0.025 - 0.06 * Math.sin((Math.PI * (d - SECTION.shoulder)) / (SECTION.drain - SECTION.shoulder))
      : Math.min(ground, bed - 0.025 + (d - SECTION.drain) * SECTION.cut);
  } else {
    // downhill: the embankment falls away until it meets the slope
    y = Math.max(ground, bed - 0.025 - (d - SECTION.shoulder) * SECTION.fill);
  }
  return y + (ground - y) * MathUtils.smoothstep(d, SECTION.reach - 2, SECTION.reach);
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
    const near = road && nearestRoad(road.index, x, z);
    return near ? crossSection(near.d, near.bed, natural(field, x, z)) : groundHeight(field, x, z);
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
