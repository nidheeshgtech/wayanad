"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, CanvasTexture, CatmullRomCurve3, DoubleSide, InstancedMesh, Matrix4,
  MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3,
} from "three";
import { height } from "@/lib/terrain";
import { SUN_DIR } from "./Lighting";

/** Bright core fading to nothing at the sides and at both ends (canvas top = the sun end). */
function beamTexture() {
  const c = document.createElement("canvas"); c.width = 32; c.height = 128;
  const ctx = c.getContext("2d")!;
  const across = ctx.createLinearGradient(0, 0, 32, 0);
  across.addColorStop(0, "rgba(255,255,255,0)"); across.addColorStop(0.5, "rgba(255,255,255,1)"); across.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = across; ctx.fillRect(0, 0, 32, 128);
  ctx.globalCompositeOperation = "destination-in";
  const along = ctx.createLinearGradient(0, 0, 0, 128);
  along.addColorStop(0, "rgba(0,0,0,0)"); along.addColorStop(0.35, "rgba(0,0,0,0.9)"); along.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = along; ctx.fillRect(0, 0, 32, 128);
  return new CanvasTexture(c);
}

const LENGTH = 14, WIDTH = 0.9; // true scale: 140 m of beam, 9 m wide

/**
 * Light shafts through the canopy: long additive quads slanting down from the sun, scattered beside the road.
 * Each one turns about its own axis to face the camera, so it never shows its edge. Fog fades the far ones.
 */
export default function Shafts({ curve, count = 40 }: { curve: CatmullRomCurve3; count?: number }) {
  const { mesh, feet } = useMemo(() => {
    const geo = new PlaneGeometry(WIDTH, LENGTH);
    geo.translate(0, LENGTH / 2, 0); // origin at the foot, beam extends up toward the sun
    const mesh = new InstancedMesh(geo, new MeshBasicMaterial({
      map: beamTexture(), color: 0xf3e2b8, transparent: true, opacity: 0.11, blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
    }), count);
    const feet = Array.from({ length: count }, () => {
      const p = curve.getPointAt(Math.random()), a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 10;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      return new Vector3(x, height(x, z) + 0.3, z);
    });
    mesh.frustumCulled = false;
    return { mesh, feet };
  }, [curve, count]);

  const axis = useMemo(() => new Vector3(), []), toCam = useMemo(() => new Vector3(), []), right = useMemo(() => new Vector3(), []);
  const normal = useMemo(() => new Vector3(), []), m = useMemo(() => new Matrix4(), []), q = useMemo(() => new Quaternion(), []);
  const one = useMemo(() => new Vector3(1, 1, 1), []);
  useFrame(({ camera }) => {
    axis.copy(SUN_DIR);
    feet.forEach((foot, i) => {
      // axis-constrained billboard: up = toward the sun, face = as close to the camera as the axis allows
      toCam.subVectors(camera.position, foot);
      right.crossVectors(axis, toCam).normalize();
      normal.crossVectors(right, axis);
      m.makeBasis(right, axis, normal);
      q.setFromRotationMatrix(m);
      mesh.setMatrixAt(i, m.compose(foot, q, one));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}
