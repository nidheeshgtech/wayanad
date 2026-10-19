"use client";
import { timed } from "@/lib/perf";
import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, DoubleSide, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { SECTION, archT, height, roadShapeAt } from "@/lib/terrain";
import { rubble } from "./stone";

/* The churam's hairpins stand on tall rubble-stone retaining walls on their valley side (drone footage of the ghat).
 * height() already drops the ground almost vertically below the road edge there; this clads that drop: a wall face from
 * just under the road's edge down to where it meets the slope, leaning back slightly (batter), in weathered stone. */
const WALL = { at: SECTION.half + 0.24, top: 0.004, footing: 0.2, batter: 0.08, max: 4, step: 0.2, tile: 0.15 }; // units (tile: one texture repeat per 1.5 m, stones ~25 cm)

export default function RetainingWalls({ curve }: { curve: CatmullRomCurve3 }) {
  const mesh = useMemo(() => timed("walls", () => {
    const L = curve.getLength(), end = archT(), pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const side = new Vector3();
    let prev = -1, prevSide = 0, along = 0;
    for (let s = 0; s < end * L; s += WALL.step) {
      const t = s / L, { widen, wall } = roadShapeAt(t);
      if (wall < 0.05) { prev = -1; continue; }
      const pt = curve.getPointAt(t), tan = curve.getTangentAt(t);
      side.set(tan.z, 0, -tan.x).normalize();
      // valley side: whichever side is lower a little way out (the same test as the barrier posts)
      const outer = height(pt.x + side.x * 2, pt.z + side.z * 2) < height(pt.x - side.x * 2, pt.z - side.z * 2) ? 1 : -1;
      if (prev >= 0 && outer !== prevSide) prev = -1; // the valley switched sides: start a new wall
      const off = WALL.at + widen, bed = pt.y - 0.6, top = bed + WALL.top;
      const out = side.clone().multiplyScalar(outer);
      const foot = pt.clone().addScaledVector(out, off + 0.3);
      const depth = Math.min(WALL.max, Math.max(0.05, top - height(foot.x, foot.z) + WALL.footing)) * wall;
      const a = pt.clone().addScaledVector(out, off), b = pt.clone().addScaledVector(out, off + depth * WALL.batter);
      const base = pos.length / 3;
      pos.push(a.x, top, a.z, b.x, top - depth, b.z);
      along += WALL.step;
      uv.push(along / WALL.tile, 0, along / WALL.tile, -depth / WALL.tile);
      if (prev >= 0) idx.push(prev, prev + 1, base, base, prev + 1, base + 1);
      prev = base; prevSide = outer;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new Mesh(geo, new MeshStandardMaterial({ map: rubble({ weathered: true, seed: 11 }), roughness: 0.82, side: DoubleSide }));
    m.castShadow = m.receiveShadow = true;
    m.name = "retaining-walls";
    return m;
  }), [curve]);
  return <primitive object={mesh} />;
}
