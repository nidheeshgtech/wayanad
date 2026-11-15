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

/* Real terrain, once setHeightmaps() has run: baked Copernicus GLO-30 grids placed in world units — the churam tile,
 * and the plateau tile north of it. One projection for all (the churam tile's metres per degree), so tiles and road agree. */
type Field = { hm: Heightmap; west: number; north: number; cellX: number; cellZ: number; east: number; south: number };
let fields: Field[] = [];
let field: Field | null = null; // the churam tile: the origin's ground, the projection, the procedural fallback test
const proj = { perLat: 0, perLon: 0, base: 0 };

/* Real road, once there is a road: NH766 in world units, its smoothed bed, and a hash for distance queries. */
type RealRoad = { curve: CatmullRomCurve3; bends: number[]; arch: number; churamEnd: number; places: { name: string; t: number; off: number }[]; index: RoadIndex; cumT: Float32Array };
let road: RealRoad | null = null;
/* The forest road (Acts 7–8): NH766 from Sulthan Bathery to the border gate, on its own heightmap tile. */
let forest: RealRoad | null = null;

/** The first heightmap is the churam's (Adivaram is on it); any others extend the ground, e.g. onto the plateau. */
export function setHeightmaps(maps: Heightmap[], roadData?: RoadData | null, forestData?: RoadData | null) {
  const [first] = maps, s = GEO.unitsPerMetre, { lat, lon } = GEO.origin;
  proj.perLon = first.metres.width / (first.bounds.east - first.bounds.west);
  proj.perLat = first.metres.height / (first.bounds.north - first.bounds.south);
  fields = maps.map((hm) => {
    const b = hm.bounds, n = hm.size - 1;
    const west = (b.west - lon) * proj.perLon * s, east = (b.east - lon) * proj.perLon * s;
    const north = -(b.north - lat) * proj.perLat * s, south = -(b.south - lat) * proj.perLat * s;
    return { hm, west, north, east, south, cellX: (east - west) / n, cellZ: (south - north) / n };
  });
  field = fields[0];
  proj.base = elevation(field, 0, 0);
  road = roadData ? buildRealRoad(roadData) : null;
  forest = forestData ? buildRealRoad(forestData) : null;
}

/** The forest road's tile and road (Acts 7–8), added after the first screen is ready (components/scene/Scene.tsx):
 * appended last, as setHeightmaps would have placed it. */
export function addForest(hm: Heightmap, forestData: RoadData) {
  if (!fields.length) return;
  const b = hm.bounds, n = hm.size - 1, s = GEO.unitsPerMetre, { lat, lon } = GEO.origin;
  const west = (b.west - lon) * proj.perLon * s, east = (b.east - lon) * proj.perLon * s;
  const north = -(b.north - lat) * proj.perLat * s, south = -(b.south - lat) * proj.perLat * s;
  fields.push({ hm, west, north, east, south, cellX: (east - west) / n, cellZ: (south - north) / n });
  forest = buildRealRoad(forestData);
}

/** lat/lon → world x, z. */
function toWorld(_f: Field, lat: number, lon: number) {
  return { x: (lon - GEO.origin.lon) * proj.perLon * GEO.unitsPerMetre, z: -(lat - GEO.origin.lat) * proj.perLat * GEO.unitsPerMetre };
}

/** The tile under (x, z): the first that contains it, else the churam tile (clamped at its edge). */
function fieldAt(x: number, z: number) {
  for (const f of fields) if (x >= f.west && x <= f.east && z >= f.north && z <= f.south) return f;
  return field!;
}

/** Bilinear elevation in metres at world (x, z) within one tile; clamps to its edge outside it. */
function elevation(f: Field, x: number, z: number) {
  const n = f.hm.size - 1, d = f.hm.data;
  const cx = MathUtils.clamp((x - f.west) / f.cellX, 0, n), cz = MathUtils.clamp((z - f.north) / f.cellZ, 0, n);
  const x0 = Math.min(Math.floor(cx), n - 1), z0 = Math.min(Math.floor(cz), n - 1), fx = cx - x0, fz = cz - z0;
  const i = z0 * f.hm.size + x0;
  const top = d[i] * (1 - fx) + d[i + 1] * fx, bottom = d[i + f.hm.size] * (1 - fx) + d[i + f.hm.size + 1] * fx;
  return top * (1 - fz) + bottom * fz;
}

/** Terrain height before the road is cut in, from whichever tile covers (x, z). */
function groundHeight(_f: Field, x: number, z: number) {
  return (elevation(fieldAt(x, z), x, z) - proj.base) * GEO.unitsPerMetre * GEO.verticalExaggeration;
}

/** Every tile's world rectangle and sample count (for one terrain mesh each); empty while procedural. */
export function terrainGrids() {
  return fields.map((f, i) => ({
    index: i, region: f.hm.region ?? "", west: f.west, north: f.north, width: f.east - f.west, length: f.south - f.north, size: f.hm.size, attribution: f.hm.attribution,
  }));
}

/** The churam tile's world rectangle; null while procedural. */
export function terrainGrid() {
  return terrainGrids()[0] ?? null;
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

/** The road's polyline for fast nearest-segment lookups: a flat grid of small cells (CSR: `start` offsets into `items`,
 * segment indices by the cell of their first point), the cell offsets to visit in order of how near they could be
 * (`order` dx,dz pairs, `bound` their lower bound on distance), and per segment 1 / length². */
type RoadIndex = { cell: number; x0: number; z0: number; nx: number; nz: number; start: Int32Array; items: Int32Array; order: Int32Array; bound: Float32Array; ring: Uint16Array;
  maxSeg: number; inv: Float32Array; xs: Float32Array; zs: Float32Array; bed: Float32Array; widen: Float32Array; wall: Float32Array };

/* Hairpins, as in drone footage of the churam: the road widens round each one (to ~13 m at the apex), and on the valley
 * side it stands on a tall stone retaining wall rather than a soft embankment. `widen` adds to the half-width; `wall` is
 * 0–1, and where it is set the ground falls away almost vertically below the road edge (RetainingWalls clads that drop). */
export const HAIRPIN = { widen: 0.25, widenSpan: 70, wallSpan: 110, wallFill: 9 }; // units; spans are metres either side of the apex


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

  const grid = roadGrid(xs, zs);
  const widen = new Float32Array(n), wall = new Float32Array(n);
  for (let i = 0; i < n; i++) for (const b of data.bends ?? []) {
    const m = Math.abs(i * data.step - b.along);
    widen[i] = Math.max(widen[i], HAIRPIN.widen * (1 - MathUtils.smoothstep(m, HAIRPIN.widenSpan * 0.4, HAIRPIN.widenSpan)));
    wall[i] = Math.max(wall[i], 1 - MathUtils.smoothstep(m, HAIRPIN.wallSpan * 0.75, HAIRPIN.wallSpan));
  }
  const cumT = Float32Array.from(cum, (c) => c / cum[n - 1]);
  return {
    curve, bends: (data.bends ?? []).map((b) => tAt(b.along)), arch: data.arch ? tAt(data.arch.along) : 0,
    churamEnd: tAt(data.churamEnd ?? data.muthanga ?? data.length),
    places: (data.places ?? []).map((p) => ({ name: p.name, t: tAt(p.along), off: p.off })),
    index: { ...grid, xs, zs, bed, widen, wall }, cumT,
  };
}

/** Build the road's lookup grid (RoadIndex). Cells of ROAD_CELL units, small next to SECTION.reach, so a lookup tests a
 * few dozen segments, not hundreds: they were nine reach-sized buckets of ~90 points each, and nearestRoad ran for
 * every height sample (terrain, plants, the road band, streams…) — 60% of the loading time, ten times that on a phone. */
const ROAD_CELL = 1.5;
function roadGrid(xs: Float32Array, zs: Float32Array) {
  const n = xs.length, cell = ROAD_CELL;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, maxSeg = 0;
  const inv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); z0 = Math.min(z0, zs[i]); z1 = Math.max(z1, zs[i]);
    if (i + 1 < n) { const bx = xs[i + 1] - xs[i], bz = zs[i + 1] - zs[i], l2 = bx * bx + bz * bz; inv[i] = l2 > 0 ? 1 / l2 : 0; maxSeg = Math.max(maxSeg, Math.sqrt(l2)); }
  }
  const nx = Math.floor((x1 - x0) / cell) + 1, nz = Math.floor((z1 - z0) / cell) + 1;
  // each segment filed under every cell its bounding box touches, so a cell's own bound is exact (no slack for a
  // segment reaching in from a neighbour) and the search stops sooner
  const cellsOf = (i: number, visit: (c: number) => void) => {
    const ax = Math.floor((Math.min(xs[i], xs[i + 1]) - x0) / cell), bx = Math.floor((Math.max(xs[i], xs[i + 1]) - x0) / cell);
    const az = Math.floor((Math.min(zs[i], zs[i + 1]) - z0) / cell), bz = Math.floor((Math.max(zs[i], zs[i + 1]) - z0) / cell);
    for (let cz = az; cz <= bz; cz++) for (let cx = ax; cx <= bx; cx++) visit(cz * nx + cx);
  };
  const start = new Int32Array(nx * nz + 1);
  for (let i = 0; i + 1 < n; i++) cellsOf(i, (c) => { start[c + 1]++; });
  for (let c = 0; c < nx * nz; c++) start[c + 1] += start[c];
  const items = new Int32Array(start[nx * nz]), fill = start.slice(0, nx * nz);
  for (let i = 0; i + 1 < n; i++) cellsOf(i, (c) => { items[fill[c]++] = i; });
  // the neighbouring cells within reach, nearest-possible first
  const R = Math.ceil(SECTION.reach / cell) + 1, offs: [number, number, number][] = [];
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) offs.push([dx, dz, cell * Math.hypot(Math.max(0, Math.abs(dx) - 1), Math.max(0, Math.abs(dz) - 1))]);
  offs.sort((a, b) => a[2] - b[2]);
  const order = new Int32Array(offs.length * 2), bound = new Float32Array(offs.length);
  offs.forEach(([dx, dz, b], k) => { order[k * 2] = dx; order[k * 2 + 1] = dz; bound[k] = b; });
  // how many cells away the nearest road cell is (Chebyshev, capped): a point whose cell is well beyond reach answers
  // "no road" at once — most of the plants, bushes and spray samples asked are far from it
  const ring = new Uint16Array(nx * nz).fill(65535), queue = new Int32Array(nx * nz);
  let head = 0, tail = 0;
  for (let c = 0; c < nx * nz; c++) if (start[c + 1] > start[c]) { ring[c] = 0; queue[tail++] = c; }
  while (head < tail) {
    const c = queue[head++], r = ring[c], ix = c % nx, iz = (c - ix) / nx;
    if (r >= R) continue;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
      const j = jz * nx + jx; if (ring[j] > r + 1) { ring[j] = r + 1; queue[tail++] = j; }
    }
  }
  return { cell, x0, z0, nx, nz, start, items, order, bound, ring, maxSeg, inv };
}

/** Distance from (x, z) to the road's centre line (nearest polyline segment) within SECTION.reach, and the bed height there. */
function nearestRoad(idx: RoadIndex, x: number, z: number) {
  const { cell, nx, nz, start, items, order, bound, inv, xs, zs } = idx, reach2 = SECTION.reach * SECTION.reach;
  const cx = Math.floor((x - idx.x0) / cell), cz = Math.floor((z - idx.z0) / cell);
  // far from the road: its grid's edge, or a cell whose nearest road cell is out of reach (ring r: at least (r − 1)
  // cells between, less a segment's length)
  const ox = cx < 0 ? -cx : cx >= nx ? cx - nx + 1 : 0, oz = cz < 0 ? -cz : cz >= nz ? cz - nz + 1 : 0;
  if (ox || oz) { if ((Math.max(ox, oz) - 1) * cell > SECTION.reach) return null; }
  else { const r = idx.ring[cz * nx + cx]; if ((r - 1) * cell > SECTION.reach) return null; }
  let best = Infinity, bi = -1, bu = 0;
  for (let k = 0; k < bound.length; k++) {
    // no cell from here on can hold anything nearer
    const lb = bound[k];
    if (lb > 0 && lb * lb > Math.min(best, reach2)) break;
    const ix = cx + order[k * 2], iz = cz + order[k * 2 + 1];
    if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
    const c = iz * nx + ix;
    for (let j = start[c], e = start[c + 1]; j < e; j++) {
      const i = items[j], ax = xs[i], az = zs[i], bx = xs[i + 1] - ax, bz = zs[i + 1] - az;
      const u = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) * inv[i]));
      const dx = x - ax - bx * u, dz = z - az - bz * u, d = dx * dx + dz * dz;
      if (d < best) { best = d; bi = i; bu = u; }
    }
  }
  if (bi < 0 || best > reach2) return null;
  const bed = idx.bed[bi] + (idx.bed[bi + 1] - idx.bed[bi]) * bu, widen = idx.widen[bi] + (idx.widen[bi + 1] - idx.widen[bi]) * bu;
  const wall = idx.wall[bi] + (idx.wall[bi + 1] - idx.wall[bi]) * bu;
  // d is measured from a standard-width road: past a hairpin's widened edge counts as past the normal edge
  return { bed, d: Math.max(0, Math.sqrt(best) - widen), wall };
}

/** Road shape at t along the curve: extra half-width and retaining-wall weight (both 0 away from hairpins). */
export function roadShapeAt(t: number) {
  if (!road) return { widen: 0, wall: 0 };
  const c = road.cumT, n = c.length;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= t) lo = mid; else hi = mid; }
  const u = c[hi] > c[lo] ? (t - c[lo]) / (c[hi] - c[lo]) : 0, { widen, wall } = road.index;
  return { widen: widen[lo] + (widen[hi] - widen[lo]) * u, wall: wall[lo] + (wall[hi] - wall[lo]) * u };
}

/** Distance to the road's centre line, or Infinity beyond SECTION.reach (for the terrain mesh to step aside, and for placement). */
/** The nearer of the two roads' cross-sections at (x, z), if either is within reach. */
function nearestAny(x: number, z: number) {
  const a = road && nearestRoad(road.index, x, z), b = forest && nearestRoad(forest.index, x, z);
  return a && b ? (a.d <= b.d ? a : b) : a ?? b;
}

/** The forest road's curve, where Act 7 hands over to Act 8 (the sanctuary entrance), and its places; null without it. */
export function forestRoad() {
  return forest ? { curve: forest.curve, muthanga: forest.churamEnd, places: forest.places } : null;
}

export function roadDistance(x: number, z: number) {
  const near = nearestAny(x, z);
  return near ? near.d : Infinity;
}

/** Natural ground under the road corridor, lightly smoothed (the DSM's canopy bumps would otherwise ripple the cut faces). */
function natural(f: Field, x: number, z: number) {
  return (groundHeight(f, x, z) * 2 + groundHeight(f, x + 1.2, z) + groundHeight(f, x - 1.2, z) + groundHeight(f, x, z + 1.2) + groundHeight(f, x, z - 1.2)) / 6;
}

/** The road's cross-section at distance d from the centre line, given the bed and the natural ground there. */
/* Relief on the cut faces, like the churam's real cuts: blocky ledges and bulges a metre or so deep, a hint of
 * near-horizontal bedding. Only where the cut face stands (not the road, shoulder or drain), and at wavelengths the
 * 3 m road band can resolve; finer cracks and seams are the rock shader's job. Units of 10 m. */
const RELIEF = { depth: 0.09, scale: 1.1, strata: 0.025 };
const hash2 = (x: number, z: number) => { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); };
function valueNoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), e = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
}
function rockRelief(x: number, z: number, y: number) {
  const n = valueNoise(x * RELIEF.scale, z * RELIEF.scale), m = valueNoise(x * RELIEF.scale * 2.3 + 7.1, z * RELIEF.scale * 2.3 - 3.4);
  const blocky = Math.abs(n - 0.5) * 2; // ridged: sharp-edged ledges rather than soft bumps
  return RELIEF.depth * (0.65 * blocky + 0.35 * m - 0.5) + RELIEF.strata * Math.sin(y * 7 + n * 3);
}

/** How far the gravel shoulder lies below the asphalt, `d` from the centre of a standard-width road (units). */
export const shoulderDrop = (d: number) => 0.025 * MathUtils.smoothstep(d, SECTION.half, SECTION.shoulder);

function crossSection(d: number, bed: number, ground: number, wall = 0, x = 0, z = 0) {
  let y: number;
  if (d <= SECTION.half) y = bed;
  else if (d <= SECTION.shoulder) y = bed - shoulderDrop(d);
  else if (ground >= bed) {
    // uphill: a shallow drain, then the cut face rising until it meets the hillside
    if (d <= SECTION.drain) y = bed - 0.025 - 0.06 * Math.sin((Math.PI * (d - SECTION.shoulder)) / (SECTION.drain - SECTION.shoulder));
    else {
      const face = bed - 0.025 + (d - SECTION.drain) * SECTION.cut;
      y = Math.min(ground, face);
      // relief on the face itself: none at its foot (the drain stays clean), none where it meets the hillside
      const onFace = MathUtils.smoothstep(d, SECTION.drain + 0.05, SECTION.drain + 0.35) * (1 - MathUtils.smoothstep(face, ground - 0.4, ground));
      y += rockRelief(x, z, y) * onFace;
    }
  } else {
    // downhill: the embankment falls away until it meets the slope
    // at hairpins the retaining wall: the ground drops almost straight down from just past the posts
    const fill = SECTION.fill + (HAIRPIN.wallFill - SECTION.fill) * wall, from = SECTION.shoulder - 0.1 * wall;
    y = Math.max(ground, bed - 0.025 - Math.max(0, d - from) * fill);
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
    const near = nearestAny(x, z);
    return near ? crossSection(near.d, near.bed, natural(field, x, z), near.wall, x, z) : groundHeight(field, x, z);
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

/** t where Act 1 (the churam) hands over to Act 2 (Lakkidi → Kalpetta); 0.98 on the procedural road (no Act 2 road). */
export function churamEndT(): number {
  return road ? road.churamEnd : 0.98;
}

/** Named places along Act 2 (Pookode Lake, Vythiri, Chundale, Kalpetta) as t on the curve, and metres off the road. */
export function placesT() {
  return road ? road.places : [];
}

/** t along the curve where the Lakkidi gateway stands. */
export function archT(): number {
  return road ? road.arch : 0.905;
}
