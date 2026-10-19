"use client";
import { useMemo } from "react";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry, InstancedMesh, Matrix4,
  MeshLambertMaterial, SRGBColorSpace, Vector3,
} from "three";
import { height } from "@/lib/terrain";

const HALF_WIDTH = 0.65; // the old tube's footprint; the camera rides 1.9 above the centre line
const LIFT = 0.25; // above the cut bed, so the terrain mesh's 2.1-unit triangles don't poke through

/** A flat strip following the curve, `lift` above the bed (curve points sit 0.6 above it). */
function ribbon(curve: CatmullRomCurve3, segments: number, halfWidth: number, lift: number) {
  const pos = new Float32Array((segments + 1) * 6), index: number[] = [];
  const side = new Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    side.set(tan.z, 0, -tan.x).normalize().multiplyScalar(halfWidth);
    const y = p.y - 0.6 + lift;
    pos.set([p.x + side.x, y, p.z + side.z, p.x - side.x, y, p.z - side.z], i * 6);
    if (i) { const a = (i - 1) * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } // counter-clockwise from above
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Yellow and black bands, wrapped round the posts. */
function stripes() {
  const c = document.createElement("canvas"); c.width = 4; c.height = 64;
  const ctx = c.getContext("2d")!;
  for (let b = 0; b < 4; b++) { ctx.fillStyle = b % 2 ? "#1a1a1a" : "#e0b531"; ctx.fillRect(0, b * 16, 4, 16); }
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; return tex;
}

export default function Road({ curve, detail = 900 }: { curve: CatmullRomCurve3; detail?: number }) {
  const asphalt = useMemo(() => ribbon(curve, detail, HALF_WIDTH, LIFT), [curve, detail]);
  const centre = useMemo(() => ribbon(curve, detail, 0.045, LIFT + 0.01), [curve, detail]);

  /* striped barrier posts along the valley edge — the churam's signature detail */
  const posts = useMemo(() => {
    const n = Math.round(curve.getLength() / 1.2);
    const mesh = new InstancedMesh(new CylinderGeometry(0.09, 0.09, 0.75, 8), new MeshLambertMaterial({ map: stripes() }), n);
    const m = new Matrix4(), side = new Vector3();
    for (let i = 0; i < n; i++) {
      const t = i / n, pt = curve.getPointAt(t), tan = curve.getTangentAt(t);
      side.set(tan.z, 0, -tan.x).normalize();
      // the drop is on whichever side the ground is lower, sampled past the road cut
      const outer = height(pt.x + side.x * 5, pt.z + side.z * 5) < height(pt.x - side.x * 5, pt.z - side.z * 5) ? 1 : -1;
      const p = pt.clone().addScaledVector(side, outer * (HALF_WIDTH + 0.22));
      m.makeTranslation(p.x, pt.y - 0.6 + LIFT + 0.37, p.z);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [curve]);

  return (
    <group name="road">
      <mesh geometry={asphalt}><meshLambertMaterial color={0x2a2c2a} polygonOffset polygonOffsetFactor={-2} /></mesh>
      <mesh geometry={centre}><meshBasicMaterial color={0xe8e6dc} polygonOffset polygonOffsetFactor={-4} /></mesh>
      <primitive object={posts} />
    </group>
  );
}
