/**
 * Bakes the forest road from OpenStreetMap: NH766 from Sulthan Bathery east through the Muthanga range of the Wayanad
 * Wildlife Sanctuary to the Kerala–Karnataka border gate (Acts 7 and 8).
 *
 *   npm run bake:forest-road
 *
 * Writes public/terrain/forest-road.json in the same shape as churam-road.json (points every STEP m from the start,
 * `along` in metres), with `places` along it and `muthanga` (where Act 7 hands over to Act 8).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NH766, overpass, projection, type OsmNode, type OsmWay } from "./osm.ts";

const BBOX = "11.60,76.20,11.75,76.46";
const STEP = 10;
const OUT = path.resolve(import.meta.dirname, "../public/terrain/forest-road.json");
const CACHE = path.resolve(import.meta.dirname, ".cache/overpass-nh766-forest.json");
/* From OSM (Overpass, 2026-10-19). The night-ban gate is tagged access:conditional "no @ (21:00-06:00)". */
const BORDER_GATE = { name: "Kerala-Karnataka Border Gate", lat: 11.70534, lon: 76.40964 };
const NAMED = [
  { name: "Muthanga", lat: 11.67145, lon: 76.36191 },
  { name: "Muthanga sanctuary entrance", lat: 11.67201, lon: 76.36868 },
  { name: "Ponkuzhi", lat: 11.678625, lon: 76.3986282 },
  BORDER_GATE,
];

const query = `[out:json][timeout:90];
  ${NH766(BBOX)}
  node["place"~"town|city"]["name"~"Bathery|Sultan|Sulthan"](${BBOX});out;`;

console.log("OpenStreetMap NH766 → Sulthan Bathery to the border gate");
const elements = await overpass(query, CACHE);
const ways = elements.filter((e): e is OsmWay => e.type === "way");
const town = elements.find((e): e is OsmNode => e.type === "node" && /bathery|sultan/i.test(e.tags?.name ?? ""));
if (!town) throw new Error("Sulthan Bathery town node not found in OSM");
console.log(`  ${ways.length} NH766 ways; start at "${town.tags!.name}" (${town.lat.toFixed(5)}, ${town.lon.toFixed(5)})`);

const { toLatLon, toXY, shortestPath, resample } = projection(town);
const road = resample(shortestPath(ways, town, BORDER_GATE), STEP);
const nearestAlong = (p: { lat: number; lon: number }) => road.points.reduce((b, q) => {
  const xy = toXY(p), d = Math.hypot(q.x - xy.x, q.y - xy.y);
  return d < b.d ? { along: q.along, d } : b;
}, { along: 0, d: Infinity });

const round = (v: number) => Math.round(v * 1e6) / 1e6;
const places = [{ name: "Sulthan Bathery", lat: town.lat, lon: town.lon }, ...NAMED].map((p) => {
  const a = nearestAlong(p);
  return { name: p.name, lat: round(p.lat), lon: round(p.lon), along: Math.round(a.along), off: Math.round(a.d) };
});
const out = {
  source: "OpenStreetMap NH766 (Overpass API)",
  attribution: "© OpenStreetMap contributors, ODbL",
  baked: new Date().toISOString().slice(0, 10),
  step: STEP,
  length: Math.round(road.length),
  points: road.points.map((p) => { const q = toLatLon(p.x, p.y); return [round(q.lat), round(q.lon)]; }),
  places,
  muthanga: places.find((p) => p.name === "Muthanga sanctuary entrance")!.along,
};
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out) + "\n");
console.log(`  road ${(road.length / 1000).toFixed(2)} km`);
for (const p of places) console.log(`  ${p.name.padEnd(30)} ${(p.along / 1000).toFixed(2)} km along, ${p.off} m off the road`);
console.log(`  wrote ${path.relative(process.cwd(), OUT)} · ${out.points.length} points`);
