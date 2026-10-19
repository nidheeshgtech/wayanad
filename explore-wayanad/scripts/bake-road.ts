/**
 * Bakes the churam road from OpenStreetMap (NH766, Overpass API).
 *
 *   npm run bake:road
 *
 * Stitches the NH766 ways into one path from Adivaram up through Lakkidi, resamples it every STEP metres,
 * finds the hairpins from heading change and writes public/terrain/churam-road.json:
 *   points  [lat, lon] every STEP m, Adivaram first
 *   bends   the nine hairpins, numbered from the bottom; `along` = metres from Adivaram. Hand-edit if a bend is off.
 *   arch    where the Lakkidi gateway stands (nearest road point to the OSM viewpoint node)
 * The Overpass response is cached in scripts/.cache; delete it to refetch.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BBOX = "11.44,75.94,11.57,76.07"; // S,W,N,E — a margin around the heightmap bounds
const ADIVARAM = { lat: 11.4849767, lon: 76.0126133 }; // OSM place node, same origin as lib/terrain.ts
const PAST_LAKKIDI = { lat: 11.545, lon: 76.039 }; // a point on NH766 towards Vythiri, used only to route past the top
const VIEWPOINT_NAME = /Lakkidi viewpoint/i;
/* The "Welcome to Wayanad" gateway. Not in OSM (as of 2026-10-19), so placed by hand: the road runs straight through it
 * in photographs, with shops just beyond, which fits the start of the straight north of the last bend, ~700 m before
 * the Lakkidi bus stop. Metres from Adivaram; verify against Google Maps / on site and adjust. */
const GATE_ALONG = 12150;
const ROAD_PAST_GATE = 900; // metres of road kept beyond the gate: the first stretch of Lakkidi's shops
const STEP = 10; // metres between resampled points
const BENDS = 9;
const OUT = path.resolve(import.meta.dirname, "../public/terrain/churam-road.json");
const CACHE = path.resolve(import.meta.dirname, ".cache/overpass-nh766.json");

type LatLon = { lat: number; lon: number };
type OsmWay = { type: "way"; id: number; nodes: number[]; geometry: LatLon[]; tags: Record<string, string> };
type OsmNode = { type: "node"; id: number; lat: number; lon: number; tags?: Record<string, string> };

async function overpass(): Promise<(OsmWay | OsmNode)[]> {
  if (existsSync(CACHE)) return JSON.parse(await readFile(CACHE, "utf8")).elements;
  const query = `[out:json][timeout:90];
    way["highway"]["ref"~"(^|;)\\s*NH\\s*766\\s*($|;)"](${BBOX});out geom;
    node["name"](${BBOX})["tourism"="viewpoint"];out;
    node["name"~"[Hh]air ?pin"](${BBOX});out;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": "explore-wayanad-bake/0.1", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  const json = await res.json();
  await mkdir(path.dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(json));
  return json.elements;
}

/* local flat metres around Adivaram; plenty accurate over 15 km */
const R = 6371008.8, rad = Math.PI / 180, cosLat = Math.cos(ADIVARAM.lat * rad);
const toXY = (p: LatLon) => ({ x: (p.lon - ADIVARAM.lon) * rad * R * cosLat, y: (p.lat - ADIVARAM.lat) * rad * R });
const toLatLon = (x: number, y: number): LatLon => ({ lat: ADIVARAM.lat + y / (R * rad), lon: ADIVARAM.lon + x / (R * rad * cosLat) });
const dist = (a: LatLon, b: LatLon) => { const p = toXY(a), q = toXY(b); return Math.hypot(p.x - q.x, p.y - q.y); };

/** Undirected graph over OSM node ids; Dijkstra on metres. NH766 here is single-carriageway, two-way. */
function shortestPath(ways: OsmWay[], from: LatLon, to: LatLon) {
  const pos = new Map<number, LatLon>(), adj = new Map<number, { id: number; w: number }[]>();
  for (const way of ways) way.nodes.forEach((id, i) => {
    pos.set(id, way.geometry[i]);
    if (i === 0) return;
    const prev = way.nodes[i - 1], w = dist(way.geometry[i - 1], way.geometry[i]);
    (adj.get(prev) ?? adj.set(prev, []).get(prev)!).push({ id, w });
    (adj.get(id) ?? adj.set(id, []).get(id)!).push({ id: prev, w });
  });
  const nearest = (p: LatLon) => [...pos].reduce((best, [id, q]) => (dist(p, q) < best.d ? { id, d: dist(p, q) } : best), { id: -1, d: Infinity });
  const start = nearest(from), goal = nearest(to);
  console.log(`  start node ${start.id} is ${start.d.toFixed(0)} m from Adivaram; goal node ${goal.id} is ${goal.d.toFixed(0)} m from the target`);
  const best = new Map([[start.id, 0]]), prev = new Map<number, number>(), open = new Set([start.id]);
  while (open.size) {
    const u = [...open].reduce((a, b) => (best.get(a)! <= best.get(b)! ? a : b));
    open.delete(u);
    if (u === goal.id) break;
    for (const { id, w } of adj.get(u) ?? []) {
      const d = best.get(u)! + w;
      if (d < (best.get(id) ?? Infinity)) { best.set(id, d); prev.set(id, u); open.add(id); }
    }
  }
  if (!prev.has(goal.id)) throw new Error("NH766 ways do not connect Adivaram to the target; check the Overpass result");
  const ids = [goal.id];
  while (ids[0] !== start.id) ids.unshift(prev.get(ids[0])!);
  return ids.map((id) => pos.get(id)!);
}

function resample(line: LatLon[], step: number) {
  const xy = line.map(toXY), out: { x: number; y: number; along: number }[] = [{ ...xy[0], along: 0 }];
  let along = 0, carry = 0;
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1], b = xy[i], seg = Math.hypot(b.x - a.x, b.y - a.y);
    let s = step - carry;
    while (s <= seg) { out.push({ x: a.x + ((b.x - a.x) * s) / seg, y: a.y + ((b.y - a.y) * s) / seg, along: along + s }); s += step; }
    carry = seg - (s - step);
    along += seg;
  }
  return { points: out, length: along };
}

/** Hairpins: runs where the heading turns more than `threshold` within ±window samples; the bend is the run's peak. */
function findHairpins(pts: { x: number; y: number }[], window: number, threshold: number) {
  const heading = pts.slice(1).map((p, i) => Math.atan2(p.y - pts[i].y, p.x - pts[i].x));
  const turn = heading.map((_, i) => {
    let sum = 0;
    for (let k = Math.max(1, i - window); k <= Math.min(heading.length - 1, i + window); k++) {
      let d = heading[k] - heading[k - 1];
      d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      sum += d;
    }
    return (sum * 180) / Math.PI;
  });
  const bends: { index: number; turn: number }[] = [];
  for (let i = 0; i < turn.length; i++) {
    if (Math.abs(turn[i]) < threshold) continue;
    let j = i, peak = i;
    while (j < turn.length && Math.abs(turn[j]) >= threshold && Math.sign(turn[j]) === Math.sign(turn[i])) { if (Math.abs(turn[j]) > Math.abs(turn[peak])) peak = j; j++; }
    bends.push({ index: peak + 1, turn: turn[peak] });
    i = j;
  }
  return bends;
}

const ll0 = (p: { x: number; y: number }) => { const q = toLatLon(p.x, p.y); return [q.lat, q.lon]; };

/* ---- bake ---- */

console.log("OpenStreetMap NH766 → churam road");
const elements = await overpass();
const ways = elements.filter((e): e is OsmWay => e.type === "way");
const named = elements.filter((e): e is OsmNode => e.type === "node" && !!e.tags?.name);
const viewpoint = named.find((n) => VIEWPOINT_NAME.test(n.tags!.name));
if (!viewpoint) throw new Error("Lakkidi viewpoint node not found in OSM");
console.log(`  ${ways.length} NH766 ways, viewpoint "${viewpoint.tags!.name}"`);

const full = resample(shortestPath(ways, ADIVARAM, PAST_LAKKIDI), STEP);
const nearestAlong = (p: LatLon) => full.points.reduce((b, q) => { const d = Math.hypot(q.x - toXY(p).x, q.y - toXY(p).y); return d < b.d ? { along: q.along, d } : b; }, { along: 0, d: Infinity });
const arch = { along: GATE_ALONG, d: 0 };
const length = Math.min(full.length, GATE_ALONG + ROAD_PAST_GATE);
const points = full.points.filter((p) => p.along <= length);
console.log(`  road ${(full.length / 1000).toFixed(2)} km routed, kept ${(length / 1000).toFixed(2)} km; gate at ${(arch.along / 1000).toFixed(2)} km (viewpoint at ${(nearestAlong(viewpoint).along / 1000).toFixed(2)} km)`);

// Candidates: the heading turns more than 140° within ±70 m. The detector finds 12 below the arch; HAIRPINS_KM picks the nine.
const candidates = findHairpins(points, 7, 140).filter((b) => points[b.index].along < arch.along);
const gap = (i: number, k = 15) => { const a = points[Math.max(0, i - k)], b = points[Math.min(points.length - 1, i + k)]; return Math.hypot(a.x - b.x, a.y - b.y); };
console.log(`  ${candidates.length} sharp turns below the arch:`);
for (const b of candidates) console.log(`    ${(points[b.index].along / 1000).toFixed(2)} km, turn ${b.turn.toFixed(0)}°, legs ±150 m apart by ${gap(b.index).toFixed(0)} m`);
await writeFile(path.join(path.dirname(CACHE), "road-debug.json"), JSON.stringify({ points: points.map(ll0), candidates: candidates.map((b) => ({ ...b, along: points[b.index].along, latlon: ll0(points[b.index]) })) }));

/* Hand-marked, km from Adivaram, snapped to the nearest detected apex.
 * 7 and 8 are pinned by OSM bus stops named for them; 9 is the last switchback below the Lakkidi viewpoint.
 * 3–6 are the clear switchbacks (≥184°, legs ≤ 90 m apart). 1 is the tight U at 1.83 km.
 * 2 is the least certain: the strongest of the wider turns (158°). Verify 1–2 on site or against a local map. */
const HAIRPINS_KM = [1.83, 2.18, 4.94, 5.08, 5.2, 6.04, 7.23, 7.53, 10.73];
const found = HAIRPINS_KM.map((km) => {
  const hit = candidates.reduce((b, c) => (Math.abs(points[c.index].along - km * 1000) < Math.abs(points[b.index].along - km * 1000) ? c : b));
  if (Math.abs(points[hit.index].along - km * 1000) > 100) throw new Error(`no detected turn within 100 m of ${km} km; re-check HAIRPINS_KM`);
  return hit;
});
if (found.length !== BENDS) throw new Error(`expected ${BENDS} hairpins in HAIRPINS_KM`);

// cross-check against OSM nodes that name a hairpin ("7Th Hair pin bend", ...)
for (const n of named.filter((n) => /hair ?pin/i.test(n.tags!.name))) {
  const label = Number(n.tags!.name.match(/\d+/)?.[0]);
  const at = nearestAlong(n);
  const closest = found.reduce((b, f, i) => { const d = Math.abs(points[f.index].along - at.along); return d < b.d ? { n: i + 1, d } : b; }, { n: 0, d: Infinity });
  const ok = closest.n === label ? "ok" : "MISMATCH";
  console.log(`  check: OSM "${n.tags!.name}" is ${at.d.toFixed(0)} m off the road, ${closest.d.toFixed(0)} m along from bend ${closest.n} → ${ok}`);
  if (closest.n !== label) throw new Error(`bend numbering disagrees with OSM node "${n.tags!.name}"`);
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;
const ll = (p: { x: number; y: number }) => { const q = toLatLon(p.x, p.y); return [round(q.lat), round(q.lon)]; };
const out = {
  source: "OpenStreetMap NH766 (Overpass API)",
  attribution: "© OpenStreetMap contributors, ODbL",
  baked: new Date().toISOString().slice(0, 10),
  step: STEP,
  length: Math.round(length),
  points: points.map(ll),
  bends: found.map((b, i) => { const [lat, lon] = ll(points[b.index]); return { n: i + 1, lat, lon, along: Math.round(points[b.index].along) }; }),
  arch: (() => { const g = points[Math.round(GATE_ALONG / STEP)]; const [lat, lon] = ll(g); return { lat, lon, along: GATE_ALONG, note: "Placed by hand on the straight north of the last bend; not in OSM. Verify." }; })(),
  viewpoint: { lat: round(viewpoint.lat), lon: round(viewpoint.lon), along: Math.round(nearestAlong(viewpoint).along) },
};
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out) + "\n");
console.log(`  wrote ${path.relative(process.cwd(), OUT)} · ${out.points.length} points · ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
