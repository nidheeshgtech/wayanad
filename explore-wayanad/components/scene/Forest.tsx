"use client";
import { useMemo } from "react";
import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, IcosahedronGeometry,
  InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { height } from "@/lib/terrain";

/* Rainforest silhouettes, not conifers: flat-shaded crowns of a few blobs on a thin trunk.
 * Trunks carry a darker vertex tint; each instance gets its own green so the layers read through the fog. */
type Part = { geo: BufferGeometry; tint: number };
const part = (geo: BufferGeometry, tint: number, [x, y, z]: number[], [sx, sy, sz] = [1, 1, 1]): Part => {
  geo.scale(sx, sy, sz);
  geo.translate(x, y, z);
  return { geo: geo.index ? geo.toNonIndexed() : geo, tint };
};
const build = (parts: Part[]) => {
  const merged = mergeGeometries(parts.map(({ geo, tint }) => {
    geo.deleteAttribute("uv");
    geo.setAttribute("color", new BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(tint), 3));
    return geo;
  }));
  merged.computeVertexNormals();
  return merged;
};
const crown = (r: number) => new IcosahedronGeometry(r, 0);
const trunk = (r: number, h: number) => new CylinderGeometry(r * 0.7, r, h, 5);

const SHAPES = [
  { share: 0.62, geo: () => build([ // broad canopy: a dense rounded mass on a short trunk
    part(trunk(0.15, 1.3), 0.45, [0, 0.65, 0]),
    part(crown(1.05), 1, [0, 2.0, 0], [1, 0.9, 1]),
    part(crown(0.85), 0.9, [0.7, 1.7, 0.35], [1, 0.85, 1]),
    part(crown(0.8), 1.08, [-0.65, 1.8, -0.3], [1, 0.85, 1]),
    part(crown(0.7), 0.96, [0.1, 2.6, -0.45], [1, 0.8, 1]),
  ]) },
  { share: 0.26, geo: () => build([ // emergent: stands above the canopy with a wider, flatter crown
    part(trunk(0.13, 2.6), 0.45, [0, 1.3, 0]),
    part(crown(1.25), 1, [0, 3.1, 0], [1.1, 0.6, 1]),
    part(crown(0.85), 0.9, [0.8, 2.85, -0.2], [1, 0.65, 1]),
    part(crown(0.75), 1.06, [-0.7, 2.95, 0.3], [1, 0.65, 1]),
  ]) },
  { share: 0.12, geo: () => build([ // palm
    part(trunk(0.07, 3.0), 0.55, [0, 1.5, 0]),
    part(crown(0.75), 1.1, [0, 3.05, 0], [1.9, 0.32, 1.9]),
  ]) },
];
const DARK = new Color(0x123020), LIGHT = new Color(0x3c6a3e);

/** The green wall: trees scattered either side of the road, kept off it and off the cut rock faces. */
export default function Forest({ curve, count = 1800 }: { curve: CatmullRomCurve3; count?: number }) {
  const meshes = useMemo(() => {
    const samples: Vector3[] = [];
    const n = Math.max(400, Math.ceil(curve.getLength()));
    for (let i = 0; i <= n; i++) samples.push(curve.getPointAt(i / n));
    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const out = SHAPES.map((s) => new InstancedMesh(s.geo(), material, Math.ceil(count * s.share)));
    const placed = out.map(() => 0);
    const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), c = new Color();
    let tries = 0;
    while (placed.reduce((a, b) => a + b, 0) < count && tries < count * 8) {
      tries++;
      // a band either side of the road, out to where the fog has swallowed it
      // denser near the road, thinning outward: the wall you drive past matters most
      const s = samples[Math.floor(Math.random() * samples.length)], a = Math.random() * Math.PI * 2, r = 4.5 + Math.random() ** 1.6 * 34;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      // clear of the road plus the camera's 2.5-unit trailing offset, which swings off the asphalt on hairpins
      if (samples.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 20)) continue;
      // nothing grows on the cut faces; matches where Terrain shades to rock
      const slope = Math.hypot(height(x + 1, z) - height(x - 1, z), height(x, z + 1) - height(x, z - 1)) / 2;
      if (slope > 0.9) continue;
      let kind = 0;
      for (let roll = Math.random(), acc = 0; kind < SHAPES.length - 1; kind++) { acc += SHAPES[kind].share; if (roll < acc) break; }
      if (placed[kind] >= out[kind].count) continue;
      const sc = 0.8 + Math.random() * 0.7;
      m.compose(new Vector3(x, height(x, z) - 0.15, z), q.setFromAxisAngle(up, Math.random() * Math.PI * 2), new Vector3(sc, sc * (0.85 + Math.random() * 0.3), sc));
      out[kind].setMatrixAt(placed[kind], m);
      out[kind].setColorAt(placed[kind], c.lerpColors(DARK, LIGHT, Math.random() ** 1.5));
      placed[kind]++;
    }
    out.forEach((mesh, k) => {
      mesh.count = placed[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    return out;
  }, [curve, count]);
  return <>{meshes.map((mesh, k) => <primitive key={k} object={mesh} />)}</>;
}
