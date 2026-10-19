"use client";
import { useMemo } from "react";
import { ConeGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, CatmullRomCurve3 } from "three";
import { height } from "@/lib/terrain";

/** The green wall: trees scattered on the slope, kept clear of the road. */
export default function Forest({ curve, count = 1800 }: { curve: CatmullRomCurve3; count?: number }) {
  const mesh = useMemo(() => {
    const trees = new InstancedMesh(new ConeGeometry(1.6, 4.2, 6), new MeshLambertMaterial({ color: 0x1b5a2e, flatShading: true }), count);
    const samples: Vector3[] = [];
    const n = Math.max(400, Math.ceil(curve.getLength()));
    for (let i = 0; i <= n; i++) samples.push(curve.getPointAt(i / n));
    const m = new Matrix4(), q = new Quaternion();
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 6) {
      tries++;
      // a band either side of the road, out to where the fog has swallowed it
      const s = samples[Math.floor(Math.random() * samples.length)], a = Math.random() * Math.PI * 2, r = 4.5 + Math.random() * 40;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      // clear of the road plus the camera's 2.5-unit trailing offset, which swings off the asphalt on hairpins
      if (samples.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < 20)) continue;
      const sc = 0.7 + Math.random() * 1.1;
      m.compose(new Vector3(x, height(x, z) + 2.1 * sc, z), q, new Vector3(sc, sc, sc));
      trees.setMatrixAt(placed++, m);
    }
    trees.count = placed;
    trees.instanceMatrix.needsUpdate = true;
    return trees;
  }, [curve, count]);
  return <primitive object={mesh} />;
}
