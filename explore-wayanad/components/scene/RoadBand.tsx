"use client";
import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Mesh } from "three";
import { SECTION, height, roadDistance } from "@/lib/terrain";
import { groundMaterial } from "./groundMaterial";

/**
 * A fine terrain mesh in a band along the road, so the road's cross-section (shoulders, drain, rock cuts, embankments)
 * actually shows — the main terrain's 21 m cells can't. It's a regular grid (no folding on the inside of hairpins),
 * keeping only cells within SECTION.reach of the road; the coarse terrain sinks out of the way underneath.
 */
export default function RoadBand({ curve, spacing = 0.3 }: { curve: CatmullRomCurve3; spacing?: number }) {
  const mesh = useMemo(() => {
    const h = spacing, reach = SECTION.reach, r = Math.ceil(reach / h), key = (i: number, j: number) => (i + 65536) * 131072 + (j + 65536);
    // cells near the road: sweep a square around each road sample, then keep those whose centre is within reach
    const candidates = new Set<number>();
    const n = Math.ceil(curve.getLength());
    for (let s = 0; s <= n; s++) {
      const p = curve.getPointAt(s / n), ci = Math.floor(p.x / h), cj = Math.floor(p.z / h);
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) candidates.add(key(ci + di, cj + dj));
    }
    const cells: [number, number][] = [];
    for (const k of candidates) {
      const i = Math.floor(k / 131072) - 65536, j = (k % 131072) - 65536;
      if (roadDistance((i + 0.5) * h, (j + 0.5) * h) < reach) cells.push([i, j]);
    }
    // shared vertices on the grid
    const index = new Map<number, number>(), pos: number[] = [], tris: number[] = [];
    const vertex = (i: number, j: number) => {
      const k = key(i, j);
      let v = index.get(k);
      if (v === undefined) { v = pos.length / 3; index.set(k, v); const x = i * h, z = j * h; pos.push(x, height(x, z), z); }
      return v;
    };
    for (const [i, j] of cells) {
      const a = vertex(i, j), b = vertex(i + 1, j), c = vertex(i, j + 1), d = vertex(i + 1, j + 1);
      tris.push(a, c, b, b, c, d); // counter-clockwise seen from above (+y)
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("aRoadDist", new BufferAttribute(Float32Array.from({ length: pos.length / 3 }, (_, v) => roadDistance(pos[v * 3], pos[v * 3 + 2])), 1));
    geo.setIndex(tris);
    geo.computeVertexNormals();
    const m = new Mesh(geo, groundMaterial());
    m.receiveShadow = true;
    m.name = "road-band";
    return m;
  }, [curve, spacing]);
  return <primitive object={mesh} />;
}
