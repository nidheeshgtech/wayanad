"use client";
import { useMemo } from "react";
import { TubeGeometry, Matrix4, Vector3, CatmullRomCurve3, BoxGeometry, MeshLambertMaterial, InstancedMesh } from "three";
import { height } from "@/lib/terrain";

export default function Road({ curve, detail = 900 }: { curve: CatmullRomCurve3; detail?: number }) {
  const asphalt = useMemo(() => new TubeGeometry(curve, detail, 0.62, 6, false), [curve, detail]);
  const centre = useMemo(() => new TubeGeometry(curve, detail, 0.07, 4, false), [curve, detail]);

  /* striped barrier posts along the valley edge — the churam's signature detail */
  const posts = useMemo(() => {
    const n = Math.round(detail * 0.8);
    const geo = new BoxGeometry(0.22, 0.9, 0.22);
    const yellow = new InstancedMesh(geo, new MeshLambertMaterial({ color: 0xe0b531 }), n);
    const black = new InstancedMesh(geo, new MeshLambertMaterial({ color: 0x1a1a1a }), n);
    const m = new Matrix4(), side = new Vector3();
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const pt = curve.getPointAt(t), tan = curve.getTangentAt(t);
      side.set(tan.z, 0, -tan.x).normalize();
      // the drop is on whichever side the ground is lower, sampled past the road cut
      const outer = height(pt.x + side.x * 5, pt.z + side.z * 5) < height(pt.x - side.x * 5, pt.z - side.z * 5) ? 1 : -1;
      const p = pt.clone().add(side.multiplyScalar(outer * 1.05)).add(new Vector3(0, 0.2, 0));
      m.makeTranslation(p.x, p.y, p.z);
      (i % 2 ? yellow : black).setMatrixAt(i, m);
    }
    yellow.instanceMatrix.needsUpdate = true;
    black.instanceMatrix.needsUpdate = true;
    return [yellow, black];
  }, [curve, detail]);

  return (
    <group name="road">
      <mesh geometry={asphalt}><meshLambertMaterial color={0x2a2c2a} /></mesh>
      <mesh geometry={centre} position-y={0.58}><meshBasicMaterial color={0xe8e6dc} /></mesh>
      <primitive object={posts[0]} />
      <primitive object={posts[1]} />
    </group>
  );
}
