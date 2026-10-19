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
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NH766, overpass, projection, type LatLon, type OsmNode, type OsmWay } from "./osm.ts";

const BBOX = "11.44,75.94,11.66,76.16"; // S,W,N,E — a margin around both heightmaps (churam and plateau)
const ADIVARAM = { lat: 11.4849767, lon: 76.0126133 }; // OSM place node, same origin as lib/terrain.ts
const KALPETTA = { lat: 11.610278, lon: 76.08281 }; // OSM place node: the drive ends in the town centre
const VIEWPOINT_NAME = /Lakkidi viewpoint/i;
/* The "Welcome to Wayanad" gateway. Not in OSM (as of 2026-10-19), so placed by hand: the road runs straight through it
 * in photographs, with shops just beyond, which fits the start of the straight north of the last bend, ~700 m before
 * the Lakkidi bus stop. Metres from Adivaram; verify against Google Maps / on site and adjust. */
const GATE_ALONG = 12150;
const CHURAM_PAST_GATE = 900; // metres past the gate where Act 1 ends and Act 2 (Lakkidi → Kalpetta) takes over
/* Places along Act 2, by OSM place/water node (Nominatim, 2026-10-19). Pookode Lake lies ~1.5 km off the road: its
 * `along` is the nearest point of the road, where you'd glimpse it. */
const PLACES = [
  { name: "Pookode Lake", lat: 11.5423338, lon: 76.0273064 },
  { name: "Vythiri", lat: 11.5560885, lon: 76.038922 },
  { name: "Chundale", lat: 11.5740364, lon: 76.0591416 },
  { name: "Kalpetta", lat: 11.610278, lon: 76.08281 },
];
const STEP = 10; // metres between resampled points
const BENDS = 9;
const OUT = path.resolve(import.meta.dirname, "../public/terrain/churam-road.json");
const CACHE = path.resolve(import.meta.dirname, ".cache/overpass-nh766-kalpetta.json");

const elementsQuery = `[out:json][timeout:90];
    ${NH766(BBOX)}
    node["name"](${BBOX})["tourism"="viewpoint"];out;
    node["name"~"[Hh]air ?pin"](${BBOX});out;
    node["name"~"[Cc]hain ?[Tt]ree"](${BBOX});out;`;
const { toXY, toLatLon, shortestPath, resample } = projection(ADIVARAM);

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

console.log("OpenStreetMap NH766 → Adivaram to Kalpetta");
const elements = await overpass(elementsQuery, CACHE);
const ways = elements.filter((e): e is OsmWay => e.type === "way");
const named = elements.filter((e): e is OsmNode => e.type === "node" && !!e.tags?.name);
const viewpoint = named.find((n) => VIEWPOINT_NAME.test(n.tags!.name));
if (!viewpoint) throw new Error("Lakkidi viewpoint node not found in OSM");
console.log(`  ${ways.length} NH766 ways, viewpoint "${viewpoint.tags!.name}"`);

const full = resample(shortestPath(ways, ADIVARAM, KALPETTA), STEP);
const nearestAlong = (p: LatLon) => full.points.reduce((b, q) => { const d = Math.hypot(q.x - toXY(p).x, q.y - toXY(p).y); return d < b.d ? { along: q.along, d } : b; }, { along: 0, d: Infinity });
const arch = { along: GATE_ALONG, d: 0 };
const length = full.length;
const points = full.points.filter((p) => p.along <= length);
console.log(`  road ${(full.length / 1000).toFixed(2)} km to Kalpetta; gate at ${(arch.along / 1000).toFixed(2)} km (viewpoint at ${(nearestAlong(viewpoint).along / 1000).toFixed(2)} km)`);

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
  churamEnd: GATE_ALONG + CHURAM_PAST_GATE,
  places: [
    ...PLACES.map((pl) => { const a = nearestAlong(pl); return { name: pl.name, lat: pl.lat, lon: pl.lon, along: Math.round(a.along), off: Math.round(a.d) }; }),
    ...named.filter((n) => /chain ?tree/i.test(n.tags!.name)).map((n) => { const a = nearestAlong(n); return { name: "Chain Tree", lat: round(n.lat), lon: round(n.lon), along: Math.round(a.along), off: Math.round(a.d) }; }),
  ],
};
for (const pl of out.places) console.log(`  ${pl.name.padEnd(13)} ${(pl.along / 1000).toFixed(2)} km along, ${pl.off} m off the road`);
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out) + "\n");
console.log(`  wrote ${path.relative(process.cwd(), OUT)} · ${out.points.length} points · ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
