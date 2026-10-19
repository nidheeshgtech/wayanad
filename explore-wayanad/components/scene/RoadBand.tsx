"use client";
import { timed } from "@/lib/perf";
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
  const mesh = useMemo(() => timed("road band", () => {
    const h = spacing, reach = SECTION.reach, key = (i: number, j: number) => (i + 65536) * 131072 + (j + 65536);
    // cells near the road: a flood fill from the cells under the centre line, growing to neighbours while their centre
    // is within reach. Each band cell is tested once (a square sweep around every road sample tested each ~60 times),
    // and the band can't have holes, even round the outside of a hairpin.
    const seen = new Set<number>(), cells: [number, number][] = [], queue: number[] = [];
    const within = (i: number, j: number) => roadDistance((i + 0.5) * h, (j + 0.5) * h) < reach;
    const visit = (i: number, j: number) => {
      const k = key(i, j);
      if (seen.has(k)) return;
      seen.add(k);
      if (within(i, j)) { cells.push([i, j]); queue.push(i, j); }
    };
    const n = Math.ceil(curve.getLength() / h);
    for (let s = 0; s <= n; s++) { const p = curve.getPointAt(s / n); visit(Math.floor(p.x / h), Math.floor(p.z / h)); }
    for (let q = 0; q < queue.length; q += 2) {
      const i = queue[q], j = queue[q + 1];
      visit(i + 1, j); visit(i - 1, j); visit(i, j + 1); visit(i, j - 1);
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
  }), [curve, spacing]);
  return <primitive object={mesh} />;
}
