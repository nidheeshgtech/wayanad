"use client";
import { useMemo } from "react";
import {
  BoxGeometry, CanvasTexture, ConeGeometry, CatmullRomCurve3, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial,
  Path, PlaneGeometry, RepeatWrapping, Shape, SRGBColorSpace,
} from "three";
import { archT } from "@/lib/terrain";

/* The Lakkidi "Welcome to Wayanad" gateway, from photographs of it. Modelled in metres (x across the road, y up,
 * z along it) and scaled by 0.1 into the scene. Two grey rubble-stone piers with small terracotta pyramid caps; a green
 * beam spanning them with a large central arch flanked by two smaller ones, dark green soffits and trim, the lettering
 * across the top; small guard huts beside the piers and the "Enter Wayanad District" board before it. */
const G = {
  clear: 12, // m between the piers' inner faces
  pier: 1.7, pierTop: 5.4, below: 2.5, // pier section, height, and how far it runs down into the ground
  beamEnd: [4.9, 7.3], beamPeak: 7.9, depth: 1.0, // beam's vertical extent at its ends; its gabled top at the centre
  sideArch: [2.6, 1.15], mainArch: [6.8, 1.75], // [span, rise] of the side arches and the central one
};
const GREEN = 0x3f8f57, TRIM = 0x1f5a3d, STONE_MORTAR = "#4b4a45", TERRACOTTA = 0xc0603a;

/** Random rubble masonry: irregular grey-brown stones in dark mortar, tiling. */
function rubble() {
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = STONE_MORTAR; ctx.fillRect(0, 0, 512, 512);
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 12; row++) for (let col = 0; col < 7; col++) {
    const w = 60 + r() * 40, h = 36 + r() * 16, x = col * 76 + (row % 2) * 38 + r() * 8, y = row * 44 + r() * 6;
    const g = 120 + r() * 60, tint = r() * 18;
    ctx.fillStyle = `rgb(${g + tint},${g + tint * 0.6},${g - 6})`;
    for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
      ctx.beginPath();
      const pts = 7;
      for (let k = 0; k < pts; k++) {
        const a = (k / pts) * Math.PI * 2, rr = 0.82 + r() * 0.18;
        ctx.lineTo(x + dx + w / 2 + Math.cos(a) * (w / 2) * rr, y + dy + h / 2 + Math.sin(a) * (h / 2) * rr);
      }
      ctx.closePath(); ctx.fill();
    }
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; return t;
}

/** White lettering, shrunk to fit its width, on `bg` (transparent if not given). Lines stack centred. */
function lettering(lines: string[], w: number, h: number, size: number, bg?: string) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = "#f4f4ef"; ctx.lineWidth = h * 0.03; ctx.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08); }
  ctx.fillStyle = "#f4f4ef"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  const font = (px: number) => `700 ${px}px "Instrument Sans", Arial, sans-serif`;
  let px = size;
  ctx.font = font(px);
  while (px > 8 && Math.max(...lines.map((l) => ctx.measureText(l).width)) > w * 0.9) ctx.font = font((px -= 4));
  lines.forEach((l, i) => ctx.fillText(l, w / 2, (h * (i + 0.5)) / lines.length));
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8; return t;
}

/** The beam's outline: arches cut up from its underside, gabled top. Extruded, its sides (soffits, top) take the trim colour. */
function beamShape() {
  const half = G.clear / 2 + G.pier, [b0, b1] = G.beamEnd, s = new Shape();
  const arch = (path: Shape | Path, from: number, span: number, rise: number) => {
    // a segmental arch from x = from to from + span, springing at b0
    const steps = 16;
    for (let i = 1; i <= steps; i++) { const u = i / steps; path.lineTo(from + span * u, b0 + rise * Math.sin(Math.PI * u)); }
  };
  s.moveTo(-half, b0);
  s.lineTo(-G.clear / 2, b0);
  arch(s, -G.clear / 2, G.sideArch[0], G.sideArch[1]);
  const mainFrom = -G.mainArch[0] / 2;
  s.lineTo(mainFrom, b0 - 0.25); // a short pendant between the arches
  arch(s, mainFrom, G.mainArch[0], G.mainArch[1]);
  s.lineTo(G.clear / 2 - G.sideArch[0], b0 - 0.25);
  arch(s, G.clear / 2 - G.sideArch[0], G.sideArch[0], G.sideArch[1]);
  s.lineTo(half, b0);
  s.lineTo(half, b1); s.lineTo(0, G.beamPeak); s.lineTo(-half, b1); s.lineTo(-half, b0);
  const geo = new ExtrudeGeometry(s, { depth: G.depth, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -G.depth / 2);
  return geo;
}

function build() {
  const g = new Group(), stone = rubble();
  const pierMat = new MeshStandardMaterial({ map: stone, roughness: 0.95 });
  stone.repeat.set(1, 3);
  const paint = new MeshStandardMaterial({ color: GREEN, roughness: 0.55 }), trim = new MeshStandardMaterial({ color: TRIM, roughness: 0.6 });
  const tiles = new MeshStandardMaterial({ color: TERRACOTTA, roughness: 0.8 });
  const add = (m: Mesh) => { m.castShadow = m.receiveShadow = true; g.add(m); return m; };

  for (const side of [-1, 1]) {
    const x = side * (G.clear / 2 + G.pier / 2), h = G.pierTop + G.below;
    add(new Mesh(new BoxGeometry(G.pier, h, G.pier), pierMat)).position.set(x, h / 2 - G.below, 0);
    // terracotta pyramid caps sit above the beam's ends
    const cap = add(new Mesh(new ConeGeometry(G.pier * 0.78, 1.2, 4), tiles));
    cap.position.set(x, G.beamEnd[1] + 0.6, 0); cap.rotation.y = Math.PI / 4;
    add(new Mesh(new BoxGeometry(G.pier + 0.2, 0.15, G.pier + 0.2), trim)).position.set(x, G.beamEnd[1] + 0.05, 0);
  }
  add(new Mesh(beamShape(), [paint, trim]));
  // lettering on both faces, in the band above the central arch
  const words = lettering(["WELCOME  TO  WAYANAD"], 2048, 220, 170);
  for (const face of [1, -1]) {
    const sign = new Mesh(new PlaneGeometry(9.5, 1.0), new MeshStandardMaterial({ map: words, transparent: true, roughness: 0.5 }));
    sign.position.set(0, 7.05, face * (G.depth / 2 + 0.01)); if (face < 0) sign.rotation.y = Math.PI;
    g.add(sign);
  }
  // guard huts outside the piers: painted walls, tiled hip roofs
  const hutWall = new MeshStandardMaterial({ color: 0xd9cf86, roughness: 0.9 });
  for (const [side, z] of [[-1, 3], [1, -3]]) {
    const x = side * (G.clear / 2 + G.pier + 2.2);
    add(new Mesh(new BoxGeometry(3, 3 + G.below, 3.2), hutWall)).position.set(x, (3 - G.below) / 2, z);
    const roof = add(new Mesh(new ConeGeometry(2.6, 1.3, 4), tiles));
    roof.position.set(x, 3.65, z); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 1.1);
  }
  // "Enter Wayanad District" board, 15 m before the gate on the driver's left (+x when facing +z; traffic keeps left)
  const bx = G.clear / 2 - 0.5;
  const board = new Mesh(new PlaneGeometry(2.2, 1.3), new MeshStandardMaterial({ map: lettering(["Enter", "Wayanad", "District"], 512, 300, 90, "#1f7a4a"), roughness: 0.6 }));
  const boardBack = new Mesh(new BoxGeometry(2.3, 1.4, 0.06), new MeshStandardMaterial({ color: 0x1f7a4a, roughness: 0.6 }));
  boardBack.position.set(bx, 2.4, -15); board.position.set(bx, 2.4, -15.04); board.rotation.y = Math.PI; // faces oncoming traffic
  add(boardBack); g.add(board);
  for (const dx of [-0.8, 0.8]) add(new Mesh(new BoxGeometry(0.08, 2.4 + G.below, 0.08), trim)).position.set(bx + dx, (2.4 - G.below) / 2, -14.95);
  return g;
}

export default function Gateway({ curve }: { curve: CatmullRomCurve3 }) {
  const group = useMemo(() => {
    const g = build(), t = archT(), p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    g.position.set(p.x, p.y - 0.6, p.z);
    g.rotation.y = Math.atan2(tan.x, tan.z);
    g.scale.setScalar(0.1); // metres → scene units
    g.name = "gateway";
    return g;
  }, [curve]);
  return <primitive object={group} />;
}
