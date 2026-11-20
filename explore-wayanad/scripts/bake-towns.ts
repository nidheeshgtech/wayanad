/**
 * Bakes the towns on the road from OpenStreetMap: the real building outlines and the shops and services along NH766 at
 * Vythiri and Kalpetta (the drive from Adivaram) and Sulthan Bathery (the start of the forest road).
 *
 *   npm run bake:towns
 *
 * Reads each town's map with the OSM editing API's map call (Overpass is often at capacity; these boxes are small),
 * cached in scripts/.cache/osm-town-<name>.json (delete to refetch). Keeps buildings whose centre is within KEEP m of
 * the road, and shops/amenities within POI m. Writes public/terrain/towns.json: outlines as [lat, lon] rings, OSM's
 * building:levels where mapped, the building tag, and each shop's kind (no names: they're real businesses).
 * Where OSM has few buildings by the road (Kalpetta, Bathery in 2026), components/scene/Town fills the frontage.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { projection } from "./osm.ts";

const OUT = path.resolve(import.meta.dirname, "../public/terrain/towns.json");
const CACHE = path.resolve(import.meta.dirname, ".cache");
const KEEP = 90, POI = 70; // m from the road's centre line
const TOWNS = [
  { name: "Vythiri", road: "churam", bbox: [76.032, 11.548, 76.046, 11.564] },
  { name: "Kalpetta", road: "churam", bbox: [76.070, 11.596, 76.095, 11.622] },
  { name: "Sulthan Bathery", road: "forest", bbox: [76.245, 11.655, 76.272, 11.672] },
] as const;

type El = { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; nodes?: number[]; tags?: Record<string, string> };

async function map(name: string, bbox: readonly number[]): Promise<El[]> {
  const file = path.join(CACHE, `osm-town-${name.toLowerCase().replace(/\W+/g, "-")}.json`);
  if (!existsSync(file)) {
    const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox.join(",")}`;
    const res = await fetch(url, { headers: { "User-Agent": "explore-wayanad-bake/0.1" } });
    if (!res.ok) throw new Error(`${name}: OSM API ${res.status}`);
    await mkdir(CACHE, { recursive: true });
    await writeFile(file, await res.text());
  }
  return JSON.parse(await readFile(file, "utf8")).elements;
}

const roads = {
  churam: JSON.parse(await readFile(path.resolve(import.meta.dirname, "../public/terrain/churam-road.json"), "utf8")).points as [number, number][],
  forest: JSON.parse(await readFile(path.resolve(import.meta.dirname, "../public/terrain/forest-road.json"), "utf8")).points as [number, number][],
};
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const out = [];
for (const town of TOWNS) {
  const els = await map(town.name, town.bbox), nodes = new Map(els.filter((e) => e.type === "node").map((e) => [e.id, e]));
  const [w, s, e, n] = town.bbox, { toXY } = projection({ lat: (s + n) / 2, lon: (w + e) / 2 });
  const line = roads[town.road].filter(([la, lo]) => la > s - 0.002 && la < n + 0.002 && lo > w - 0.002 && lo < e + 0.002).map(([lat, lon]) => toXY({ lat, lon }));
  const dist = (p: { x: number; y: number }) => {
    let best = Infinity;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], dx = b.x - a.x, dy = b.y - a.y, k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy));
    }
    return best;
  };
  const buildings = [];
  for (const el of els) {
    if (el.type !== "way" || !el.tags?.building || !el.nodes) continue;
    const ring = el.nodes.map((id) => nodes.get(id)).filter((p): p is El => !!p).map((p) => [r6(p.lat!), r6(p.lon!)] as [number, number]);
    if (ring.length < 4) continue;
    const xy = ring.map(([lat, lon]) => toXY({ lat, lon })), c = { x: xy.reduce((a, p) => a + p.x, 0) / xy.length, y: xy.reduce((a, p) => a + p.y, 0) / xy.length };
    if (dist(c) > KEEP) continue;
    const levels = Number(el.tags["building:levels"]);
    buildings.push({ fp: ring.slice(0, -1), kind: el.tags.building, ...(levels > 0 && levels < 20 ? { levels } : {}), ...(el.tags.amenity || el.tags.shop ? { use: el.tags.shop ?? el.tags.amenity } : {}) });
  }
  const pois = [];
  for (const el of els) {
    const use = el.tags?.shop ?? el.tags?.amenity;
    if (el.type !== "node" || !use || ["bench", "waste_basket", "parking", "toilets", "drinking_water"].includes(use)) continue;
    if (dist(toXY({ lat: el.lat!, lon: el.lon! })) > POI) continue;
    pois.push({ lat: r6(el.lat!), lon: r6(el.lon!), use });
  }
  console.log(`${town.name}: ${buildings.length} buildings, ${pois.length} shops/services by the road`);
  out.push({ name: town.name, road: town.road, buildings, pois });
}
await writeFile(OUT, JSON.stringify({ source: "OpenStreetMap (API 0.6 map)", attribution: "© OpenStreetMap contributors (ODbL)", baked: new Date().toISOString().slice(0, 10), towns: out }));
console.log("wrote", path.relative(process.cwd(), OUT));
