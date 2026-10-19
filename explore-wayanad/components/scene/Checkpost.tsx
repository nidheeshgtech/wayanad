"use client";
import { useMemo } from "react";
import {
  BoxGeometry, CanvasTexture, CatmullRomCurve3, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry,
  RepeatWrapping, SRGBColorSpace,
} from "three";

/* The Kerala–Karnataka border gate on NH766 (OSM "Kerala-Karnataka Border Gate", closed 21:00–06:00): a red-and-white
 * barrier boom across the road, its post and counterweight, a guard booth on the left with a tiled roof, and boards
 * facing the arriving traffic. Built in metres (x across the road, +z ahead), scaled 0.1 into the scene at the road's end.
 * The boards say only what is known: the checkpost, and the night closure. */
function stripes() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 8;
  const x = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#f2f0ea" : "#c8302a"; x.fillRect(i * 16, 0, 16, 8); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = RepeatWrapping; return t;
}

function board(lines: string[], bg: string, fg: string, w = 1024, h = 512) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d")!;
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = fg; x.lineWidth = h * 0.03; x.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
  x.fillStyle = fg; x.textAlign = "center"; x.textBaseline = "middle";
  lines.forEach((l, i) => {
    let px = Math.floor(h / (lines.length + 1.2));
    x.font = `700 ${px}px "Instrument Sans", Arial, sans-serif`;
    while (x.measureText(l).width > w * 0.86 && px > 10) x.font = `700 ${(px -= 4)}px "Instrument Sans", Arial, sans-serif`;
    x.fillText(l, w / 2, (h * (i + 0.5)) / lines.length * 0.86 + h * 0.07);
  });
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8; return t;
}

function build() {
  const g = new Group(), white = new MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.9 }), grey = new MeshStandardMaterial({ color: 0x6b6b66, roughness: 0.7 });
  const add = (m: Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  // barrier boom across both lanes, pivot post on the left, counterweight behind it, rest post on the right
  const boom = add(new Mesh(new CylinderGeometry(0.07, 0.07, 9.4, 10), new MeshStandardMaterial({ map: stripes(), roughness: 0.6 })), 0, 1.05, 0);
  boom.rotation.z = Math.PI / 2; (boom.material as MeshStandardMaterial).map!.repeat.set(6, 1);
  add(new Mesh(new BoxGeometry(0.35, 1.2, 0.35), grey), 4.9, 0.6, 0);
  add(new Mesh(new BoxGeometry(0.6, 0.35, 0.35), grey), 5.4, 1.05, 0);
  add(new Mesh(new BoxGeometry(0.15, 0.95, 0.15), grey), -4.7, 0.47, 0);
  // guard booth on the driver's left (+x), before the boom
  add(new Mesh(new BoxGeometry(2.4, 2.6 + 1, 2.2), white), 6.6, (2.6 - 1) / 2, -2.5);
  add(new Mesh(new BoxGeometry(1.2, 0.8, 0.02), new MeshStandardMaterial({ color: 0x2c3a40, roughness: 0.2 })), 6.6, 1.6, -1.39);
  const roof = add(new Mesh(new ConeGeometry(2.1, 1.0, 4), new MeshStandardMaterial({ color: 0xa9502f, roughness: 0.85 })), 6.6, 3.1, -2.5);
  roof.rotation.y = Math.PI / 4;
  // boards facing arriving traffic (−z): the checkpost, and the night closure
  const sign = (lines: string[], bg: string, fg: string, x: number, z: number, w: number, h: number) => {
    const m = add(new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: board(lines, bg, fg), roughness: 0.6 })), x, 2.3, z);
    m.rotation.y = Math.PI;
    for (const dx of [-w * 0.35, w * 0.35]) add(new Mesh(new BoxGeometry(0.08, 2.3 + 1, 0.08), grey), x + dx, (2.3 - 1) / 2, z + 0.05);
  };
  sign(["CHECK POST", "STOP"], "#f2c230", "#1a1a1a", 6.2, -6, 2.4, 1.3);
  sign(["NIGHT TRAFFIC BANNED", "9 PM – 6 AM"], "#1f5a3d", "#f4f4ef", -6.4, -10, 2.8, 1.4);
  return g;
}

export default function Checkpost({ curve }: { curve: CatmullRomCurve3 }) {
  const group = useMemo(() => {
    const g = build(), p = curve.getPointAt(1), tan = curve.getTangentAt(1);
    g.position.set(p.x, p.y - 0.6, p.z);
    g.rotation.y = Math.atan2(tan.x, tan.z);
    g.scale.setScalar(0.1);
    g.name = "checkpost";
    return g;
  }, [curve]);
  return <primitive object={group} />;
}
