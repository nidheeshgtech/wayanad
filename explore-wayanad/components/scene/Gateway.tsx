"use client";
import { useMemo } from "react";
import { CanvasTexture, ExtrudeGeometry, Path, Shape, SRGBColorSpace, CatmullRomCurve3 } from "three";
import { archT } from "@/lib/terrain";

/** The Lakkidi gateway: stone piers, green beam, three scalloped arches, lettering. */
export default function Gateway({ curve }: { curve: CatmullRomCurve3 }) {
  const span = 11, pierH = 4.2, pierW = 1.3;
  const { position, rotationY } = useMemo(() => {
    const p = curve.getPointAt(archT()), t = curve.getTangentAt(archT());
    return { position: [p.x, p.y - 0.6, p.z] as [number, number, number], rotationY: Math.atan2(t.x, t.z) };
  }, [curve]);

  const beam = useMemo(() => {
    const s = new Shape();
    s.moveTo(-span / 2 - pierW, 0); s.lineTo(span / 2 + pierW, 0); s.lineTo(span / 2 + pierW, 2.3);
    s.lineTo(0, 3.1); s.lineTo(-span / 2 - pierW, 2.3); s.lineTo(-span / 2 - pierW, 0);
    [-span / 3, 0, span / 3].forEach((cx) => {
      const h = new Path(); h.absarc(cx, 0, span / 6 - 0.25, 0, Math.PI, false); h.lineTo(cx + span / 6 - 0.25, 0); s.holes.push(h);
    });
    return new ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: false });
  }, []);

  const sign = useMemo(() => {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#2f6b3a"; ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = "#f4f1e6"; ctx.font = "600 64px Instrument Sans, Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("WELCOME TO WAYANAD", 512, 64);
    const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; return tex;
  }, []);

  return (
    // modelled at the prototype's size; 0.1 brings it to the real arch's ~14 m span and ~8 m height
    <group position={position} rotation-y={rotationY} scale={0.1} name="gateway">
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (span / 2 + pierW / 2), pierH / 2, 0]}>
          <boxGeometry args={[pierW, pierH, pierW]} /><meshStandardMaterial color={0x6a6b64} roughness={0.95} />
        </mesh>
      ))}
      <mesh geometry={beam} position={[0, pierH - 0.3, -0.45]}><meshStandardMaterial color={0x2f6b3a} roughness={0.7} /></mesh>
      <mesh position={[0, pierH + 2.9, 0]}><boxGeometry args={[span + 2 * pierW + 0.6, 0.22, 1.2]} /><meshStandardMaterial color={0x3a3a36} /></mesh>
      <mesh position={[0, pierH + 2.15, 0.47]}><planeGeometry args={[span * 0.78, (span * 0.78) / 8]} /><meshBasicMaterial map={sign} transparent /></mesh>
      <mesh position={[0, pierH + 2.15, -0.92]} rotation-y={Math.PI}><planeGeometry args={[span * 0.78, (span * 0.78) / 8]} /><meshBasicMaterial map={sign} transparent /></mesh>
    </group>
  );
}
