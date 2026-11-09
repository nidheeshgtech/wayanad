"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, CanvasTexture, CatmullRomCurve3, DoubleSide, InstancedMesh, Matrix4,
  MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3,
} from "three";
import { height } from "@/lib/terrain";
import { game } from "@/lib/game";
import { dappleUniforms } from "@/lib/dapple";
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
 * In drive mode they gather round the car (one that falls behind comes back beside the road ahead), and they shine
 * only as strongly as the sun gets through (lib/dapple: none at night or in rain).
 */
const NEAR = { behind: 6, ahead: 32, side: [0.7, 3.2] as const, opacity: 0.16 };
export default function Shafts({ curve, count = 40 }: { curve: CatmullRomCurve3; count?: number }) {
  const { mesh, feet, L } = useMemo(() => {
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
    return { mesh, feet, L: curve.getLength() };
  }, [curve, count]);
  /** A shaft beside the road, `ahead` units along it from s. */
  const place = (foot: Vector3, s: number) => {
    const t = Math.min(0.999, Math.max(0, s / L)), p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const side = (Math.random() < 0.5 ? -1 : 1) * (NEAR.side[0] + Math.random() * (NEAR.side[1] - NEAR.side[0]));
    const x = p.x + tan.z * side, z = p.z - tan.x * side;
    foot.set(x, height(x, z) + 0.3, z);
  };
  const along = useMemo(() => new Float32Array(count).fill(-1e9), [count]);

  const axis = useMemo(() => new Vector3(), []), toCam = useMemo(() => new Vector3(), []), right = useMemo(() => new Vector3(), []);
  const normal = useMemo(() => new Vector3(), []), m = useMemo(() => new Matrix4(), []), q = useMemo(() => new Quaternion(), []);
  const one = useMemo(() => new Vector3(1, 1, 1), []);
  useFrame(({ camera }) => {
    const strength = dappleUniforms.uDapple.value;
    (mesh.material as MeshBasicMaterial).opacity = NEAR.opacity * strength;
    mesh.visible = strength > 0.03;
    if (!mesh.visible) return;
    // drive mode: keep them round the car — any that fell behind (or too far ahead) comes back beside the road ahead
    mesh.count = game.active ? Math.max(6, Math.round(feet.length * 0.35)) : feet.length; // a few round the car is plenty
    if (game.active) for (let i = 0; i < mesh.count; i++) {
      const d = along[i] - game.s;
      if (d < -NEAR.behind || d > NEAR.ahead + 4) { along[i] = game.s + (along[i] < -1e8 ? -NEAR.behind + Math.random() * (NEAR.ahead + NEAR.behind) : NEAR.ahead * (0.5 + Math.random() * 0.5)); place(feet[i], along[i]); }
    }
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
