"use client";
import { timed } from "@/lib/perf";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { CatmullRomCurve3, Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { archT, height, roadDistance } from "@/lib/terrain";
import { onTeaRow, teaAt } from "@/lib/estates";
import { inTown, townPlan } from "./Town";

/* Tea bushes in 3D beside the plateau road, where lib/estates puts an estate: rounded, waist-high, standing on the
 * contour rows the ground shader paints further out. Grouped in chunks of road; only chunks near the camera draw. */
const BAND: [number, number] = [1.3, 2.8]; // units from the road's centre line
const STEP = 0.15, CHUNK = 16, VIEW = 22; // units
const BUSH = { w: [0.1, 0.14], h: [0.07, 0.1] };

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export default function TeaHedges({ curve, density = 1 }: { curve: CatmullRomCurve3; density?: number }) {
  const chunks = useMemo(() => timed("tea hedges", () => {
    const L = curve.getLength(), r = rng(1840), plan = townPlan(curve), from = archT() * L;
    const geo = new IcosahedronGeometry(1, 1);
    geo.translate(0, 0.35, 0); // sits on the ground, a little sunk
    const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const green = [new Color(0x3f6e1e), new Color(0x5a8a26), new Color(0x4a7a22)];
    const side = new Vector3(), m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), c = new Color();
    const out: { centre: Vector3; mesh: InstancedMesh }[] = [];
    for (let c0 = from; c0 < L; c0 += CHUNK) {
      const spots: { m: Matrix4; c: Color }[] = [];
      for (let s = c0; s < Math.min(L, c0 + CHUNK); s += STEP) {
        const t = Math.min(0.999, s / L), p = curve.getPointAt(t), tan = curve.getTangentAt(t);
        for (const dir of [1, -1]) {
          side.set(tan.z, 0, -tan.x).normalize().multiplyScalar(dir);
          for (let d = BAND[0]; d < BAND[1]; d += STEP) {
            if (r() > density) continue;
            const x = p.x + side.x * d + (r() - 0.5) * 0.06, z = p.z + side.z * d + (r() - 0.5) * 0.06, y = height(x, z);
            const slope = Math.hypot(height(x + 0.2, z) - height(x - 0.2, z), height(x, z + 0.2) - height(x, z - 0.2)) / 0.4;
            if (teaAt(x, z, y, slope) < 0.5 || !onTeaRow(y, 0.35) || roadDistance(x, z) < BAND[0] || inTown(x, z, plan)) continue;
            const w = BUSH.w[0] + r() * (BUSH.w[1] - BUSH.w[0]), h = BUSH.h[0] + r() * (BUSH.h[1] - BUSH.h[0]);
            m.compose(new Vector3(x, y - h * 0.3, z), q.setFromAxisAngle(up, r() * Math.PI * 2), new Vector3(w, h, w));
            spots.push({ m: m.clone(), c: c.copy(green[Math.floor(r() * green.length)]).multiplyScalar(0.85 + r() * 0.3).clone() });
          }
        }
      }
      if (!spots.length) continue;
      const mesh = new InstancedMesh(geo, material, spots.length);
      spots.forEach((sp, i) => { mesh.setMatrixAt(i, sp.m); mesh.setColorAt(i, sp.c); });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false; mesh.visible = false;
      mesh.name = "tea-hedges";
      out.push({ centre: curve.getPointAt(Math.min(0.999, (c0 + CHUNK / 2) / L)), mesh });
    }
    return out;
  }), [curve, density]);

  useFrame(({ camera }) => { for (const ch of chunks) ch.mesh.visible = camera.position.distanceTo(ch.centre) < VIEW + CHUNK / 2; });
  return <>{chunks.map((ch, i) => <primitive key={i} object={ch.mesh} />)}</>;
}
