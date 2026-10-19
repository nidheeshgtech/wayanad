/**
 * OpenStreetMap helpers shared by the road bakes (bake-road.ts, bake-forest-road.ts): a cached, retrying Overpass
 * fetch; Dijkstra routing over NH766's ways; resampling a line to even steps. Distances in local flat metres around
 * an origin (plenty accurate over 30 km).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export type LatLon = { lat: number; lon: number };
export type OsmWay = { type: "way"; id: number; nodes: number[]; geometry: LatLon[]; tags: Record<string, string> };
export type OsmNode = { type: "node"; id: number; lat: number; lon: number; tags?: Record<string, string> };

/** Overpass query, cached at `cache` (delete it to refetch). The public servers are often at capacity: retry with
 * backoff, alternating between two of them. */
export async function overpass(query: string, cache: string): Promise<(OsmWay | OsmNode)[]> {
  if (existsSync(cache)) return JSON.parse(await readFile(cache, "utf8")).elements;
  const servers = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  let json: { elements: (OsmWay | OsmNode)[] } | null = null, last = "";
  for (let attempt = 0; attempt < 8 && !json; attempt++) {
    if (attempt) { const wait = Math.min(60, 5 * 2 ** (attempt - 1)); console.log(`  Overpass busy (${last}), retrying in ${wait} s`); await new Promise((r) => setTimeout(r, wait * 1000)); }
    try {
      const res = await fetch(servers[attempt % servers.length], {
        method: "POST",
        headers: { "User-Agent": "explore-wayanad-bake/0.1", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
      });
      const text = await res.text();
      if (res.ok && text.startsWith("{")) json = JSON.parse(text); else last = `HTTP ${res.status}`;
    } catch (err) { last = String(err); }
  }
  if (!json) throw new Error(`Overpass unavailable after retries (${last})`);
  await mkdir(path.dirname(cache), { recursive: true });
  await writeFile(cache, JSON.stringify(json));
  return json.elements;
}

/** The NH766 ways query used by both bakes. */
export const NH766 = (bbox: string) => `way["highway"]["ref"~"(^|;)\\s*NH\\s*766\\s*($|;)"](${bbox});out geom;`;

/** Local flat-metre projection around `origin`, and the helpers built on it. */
export function projection(origin: LatLon) {
  const R = 6371008.8, rad = Math.PI / 180, cosLat = Math.cos(origin.lat * rad);
  const toXY = (p: LatLon) => ({ x: (p.lon - origin.lon) * rad * R * cosLat, y: (p.lat - origin.lat) * rad * R });
  const toLatLon = (x: number, y: number): LatLon => ({ lat: origin.lat + y / (R * rad), lon: origin.lon + x / (R * rad * cosLat) });
  const dist = (a: LatLon, b: LatLon) => { const p = toXY(a), q = toXY(b); return Math.hypot(p.x - q.x, p.y - q.y); };

  /** Undirected graph over OSM node ids; Dijkstra on metres. NH766 is single-carriageway, two-way. */
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
    console.log(`  start node ${start.id} is ${start.d.toFixed(0)} m from the start; goal node ${goal.id} is ${goal.d.toFixed(0)} m from the target`);
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
    if (!prev.has(goal.id)) throw new Error("NH766 ways do not connect the start to the target; check the Overpass result");
    const ids = [goal.id];
    while (ids[0] !== start.id) ids.unshift(prev.get(ids[0])!);
    return ids.map((id) => pos.get(id)!);
  }

  /** Points every `step` metres along the line, each with its distance along it. */
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

  return { toXY, toLatLon, dist, shortestPath, resample };
}
