import type { RoadData } from "./heightmap";

/** Hairpin and arch positions as fractions of the road, from the baked road alone (no three.js, no heightmap).
 * The 3D view replaces these with exact arc-length values once its curve is built; the difference is < 0.5 %. */
export async function loadRouteMarks(url = "/terrain/churam-road.json") {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  const road: RoadData = await r.json();
  return { bends: road.bends.map((b) => b.along / road.length), arch: road.arch.along / road.length };
}
