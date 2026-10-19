"use client";
import { useMemo } from "react";
import { CatmullRomCurve3, Color, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, TextureLoader, Vector3 } from "three";
import CARDS from "@/data/vegetation.json";
import { SECTION, archT, height, roadShapeAt } from "@/lib/terrain";

/* Creepers hanging over the churam's rock cuts, as in photographs of the ghat: vine curtains laid flat against the cut
 * face, their top at the lip of the cut, facing out to the road. Placed only where the uphill side stands as a face
 * taller than a few metres. Single quads (the face is behind them), generated cut-out (public/vegetation/creeper.webp). */
const CREEPER = { every: 0.9, chance: 0.55, width: [0.35, 0.8], probe: [SECTION.drain + 0.1, SECTION.drain + 2.5], minFace: 0.35 };

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export default function Creepers({ curve, density = 1 }: { curve: CatmullRomCurve3; density?: number }) {
  const mesh = useMemo(() => {
    const L = curve.getLength(), end = archT() * L, r = rng(4242), aspect = CARDS.creeper.aspect;
    const map = new TextureLoader().load("/vegetation/creeper.webp");
    map.colorSpace = SRGBColorSpace; map.anisotropy = 4;
    const geo = new PlaneGeometry(1, 1);
    geo.translate(0, -0.5, 0); // origin at the top edge: hangs down from the lip
    const spots: { m: Matrix4; c: Color }[] = [];
    const side = new Vector3(), q = new Quaternion(), up = new Vector3(0, 1, 0);
    for (let s = 0; s < end; s += CREEPER.every) {
      if (r() > CREEPER.chance * density) continue;
      const t = s / L, pt = curve.getPointAt(t), tan = curve.getTangentAt(t), widen = roadShapeAt(t).widen;
      side.set(tan.z, 0, -tan.x).normalize();
      for (const dir of [1, -1]) {
        const out = side.clone().multiplyScalar(dir), bed = pt.y - 0.6;
        // walk out from the drain: the face is where the ground climbs; the lip is where it stops climbing steeply
        let foot = -1, lip = -1, prevY = height(pt.x + out.x * (CREEPER.probe[0] + widen), pt.z + out.z * (CREEPER.probe[0] + widen));
        for (let d = CREEPER.probe[0] + 0.1; d < CREEPER.probe[1]; d += 0.1) {
          const y = height(pt.x + out.x * (d + widen), pt.z + out.z * (d + widen)), rise = (y - prevY) / 0.1;
          if (rise > 1.4 && foot < 0) foot = d - 0.1;
          if (foot >= 0 && rise < 0.8) { lip = d; break; }
          prevY = y;
        }
        if (foot < 0 || lip < 0) continue;
        const lipAt = pt.clone().addScaledVector(out, lip + widen - 0.03), lipY = height(lipAt.x, lipAt.z);
        const faceH = lipY - bed;
        if (faceH < CREEPER.minFace) continue;
        const w = CREEPER.width[0] + r() * (CREEPER.width[1] - CREEPER.width[0]), h = Math.min(faceH * (0.5 + r() * 0.45), w / aspect);
        // facing the road: the plane's +z toward the road (−out), leaning back with the face
        q.setFromAxisAngle(up, Math.atan2(-out.x, -out.z)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.25));
        const m = new Matrix4().compose(new Vector3(lipAt.x + (r() - 0.5) * 0.1, lipY + 0.02, lipAt.z), q, new Vector3(w * (r() < 0.5 ? -1 : 1), h, 1));
        spots.push({ m, c: new Color().setRGB(0.8 + r() * 0.3, 0.85 + r() * 0.25, 0.75 + r() * 0.2) });
      }
    }
    const mesh = new InstancedMesh(geo, new MeshStandardMaterial({ map, alphaTest: 0.45, side: DoubleSide, roughness: 0.9 }), Math.max(1, spots.length));
    spots.forEach((sp, i) => { mesh.setMatrixAt(i, sp.m); mesh.setColorAt(i, sp.c); });
    mesh.count = spots.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = "veg-creepers";
    return mesh;
  }, [curve, density]);
  return <primitive object={mesh} />;
}
