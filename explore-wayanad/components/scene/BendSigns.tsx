"use client";
import { useMemo } from "react";
import { CanvasTexture, CatmullRomCurve3, Group, Mesh, MeshLambertMaterial, BoxGeometry, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from "three";
import { bendTs, height } from "@/lib/terrain";

/** The plate: hairpin number in the counter's amber on the site's dark green, "of 9" beneath. */
function plate(n: number) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 320;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0e1f1a"; ctx.beginPath(); ctx.roundRect(8, 8, 240, 304, 28); ctx.fill();
  ctx.strokeStyle = "#eef2ee"; ctx.lineWidth = 6; ctx.stroke();
  ctx.fillStyle = "#d9a441"; ctx.font = "300 190px Fraunces, Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(n), 128, 140);
  ctx.fillStyle = "#b8c7c0"; ctx.font = "500 34px 'Instrument Sans', Arial, sans-serif";
  ctx.fillText(`hairpin ${n} / 9`, 128, 268);
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; return tex;
}

/** A sign at each of the nine hairpins, on the valley side of the apex, always turned to face the camera. */
export default function BendSigns({ curve }: { curve: CatmullRomCurve3 }) {
  const group = useMemo(() => {
    const g = new Group(), side = new Vector3(), post = new BoxGeometry(0.1, 2.2, 0.1), postMat = new MeshLambertMaterial({ color: 0x3a3a36 });
    bendTs().forEach((t, i) => {
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      side.set(tan.z, 0, -tan.x).normalize();
      // valley side, matching the barrier posts
      const out = height(p.x + side.x * 5, p.z + side.z * 5) < height(p.x - side.x * 5, p.z - side.z * 5) ? 1 : -1;
      const at = p.clone().addScaledVector(side, out * 1.8);
      const ground = height(at.x, at.z);
      const pole = new Mesh(post, postMat); pole.position.set(at.x, ground + 1.1, at.z); g.add(pole);
      const sign = new Sprite(new SpriteMaterial({ map: plate(i + 1) }));
      sign.scale.set(1.3, 1.625, 1); sign.position.set(at.x, ground + 2.9, at.z);
      g.add(sign);
    });
    return g;
  }, [curve]);
  return <primitive object={group} />;
}
