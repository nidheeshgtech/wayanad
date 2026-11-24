"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, ConeGeometry, CylinderGeometry,
  DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector3,
} from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { archT } from "@/lib/terrain";
import { duskness, nightness } from "@/lib/theme";
import { weather } from "@/lib/weather";
import { rubble } from "./stone";

/* The gateway into Wayanad at Lakkidi: our own, not the real arch. Two tall moss-grown standing stones on low rubble
 * plinths, a dark timber beam between them with WELCOME TO WAYANAD in cream, and on the stone at the driver's left the
 * figures of the Edakkal cave carvings (people in headdresses, a wheel, an elephant, the patterned panels). Ferns and red
 * heliconia at the stones' feet; small lamps on the ground light the stones from below after dusk, and the stone goes
 * darker and glossier in the rain. Modelled in metres (x across the road, y up, z along it; you drive toward +z, and
 * traffic keeps left, so the driver's left is +x) and scaled by 0.1 into the scene. */
const G = {
  clear: 12,                 // m between the stones' inner faces (the road and its shoulders pass between)
  rock: { rx: 1.95, rz: 1.5, h: 8.4 }, // a stone's half-width across the road, along it, and height above its plinth
  plinth: { r: 2.2, h: 0.8, below: 2.5 },
  beam: { y: 6.0, h: 1.3, d: 0.72 }, // its underside, height and thickness
};
const CX = G.clear / 2 + G.plinth.r + 0.05; // each stone's centre, either side
const FRONT = -G.rock.rz * 0.62;           // the flat face toward oncoming traffic (−z), where the carving is

/* — the stone — */

/** A small seeded 3D value noise (fbm), enough to rough up a stone. */
function noise3(seed: number) {
  const hash = (x: number, y: number, z: number) => {
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.3) * 43758.5453;
    return h - Math.floor(h);
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
    let out = 0;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++)
      out += hash(xi + dx, yi + dy, zi + dz) * (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf);
    return out * 2 - 1;
  };
  return (x: number, y: number, z: number, octaves = 4) => {
    let sum = 0, amp = 0.5, f = 1;
    for (let o = 0; o < octaves; o++) { sum += amp * value(x * f, y * f, z * f); amp *= 0.5; f *= 2.1; }
    return sum;
  };
}

/** A standing stone: a stretched, lumpy sphere, narrowing to a rounded top, its road-facing side worn flat. Vertex
 * colours carry the moss: thick on the ledges and the top, running down the faces in streaks, pale lichen in patches. */
function standingStone(seed: number, carved: boolean, away: number) {
  const n = noise3(seed), { rx, rz, h } = G.rock;
  const geo = mergeVertices(new IcosahedronGeometry(1, 22).deleteAttribute("normal").deleteAttribute("uv"));
  const pos = geo.attributes.position, v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const up = (v.y + 1) / 2; // 0 at the foot, 1 at the top
    // a superellipsoid, not a plain stretched sphere: full-bodied up most of its height, a rounded shoulder at the top
    const hor = Math.hypot(v.x, v.z), full = hor > 1e-5 ? Math.pow(hor, v.y > 0 ? 0.5 : 0.25) / hor : 0;
    const taper = 1 - 0.18 * Math.pow(up, 1.6) + 0.06 * (1 - up);
    const lean = 0.2 * up * up; // leans a little away from the road
    const bump = 1 + 0.12 * n(v.x * 1.6, v.y * 2.2, v.z * 1.6) + 0.05 * n(v.x * 6, v.y * 6, v.z * 6, 2);
    let x = v.x * full * rx * taper * bump, z = v.z * full * rz * taper * bump;
    const y = up * h * (1 + 0.04 * n(v.x * 2, 9, v.z * 2));
    if (carved && z < FRONT) z = FRONT + (z - FRONT) * 0.12; // the face the carving's on, nearly flat
    x += away * lean * 0.5;
    pos.setXYZ(i, x, y - 0.25, z);
  }
  geo.computeVertexNormals();
  // texture coordinates for the grit: a slanted planar projection (no seam; the grit is even, so the stretch on the sides doesn't show)
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) uv.set([0.5 * (pos.getX(i) - pos.getZ(i)), 0.35 * pos.getY(i) + 0.2 * (pos.getX(i) + pos.getZ(i))], i * 2);
  geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  const nor = geo.attributes.normal, col = new Float32Array(pos.count * 3);
  const rock = new Color(), moss = new Color(), dark = new Color(0x3a5224), lichen = new Color(0x9a9a82);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ny = nor.getY(i), grain = n(v.x * 0.9, v.y * 0.5, v.z * 0.9, 3);
    rock.setRGB(0.47 + 0.08 * grain, 0.45 + 0.07 * grain, 0.4 + 0.06 * grain, SRGBColorSpace); // (sRGB: vertex colours are linear)
    const streak = n(v.x * 2.4, v.y * 0.18, v.z * 2.4, 3); // long vertical runs
    let m = Math.max(0, ny) * 0.9 + Math.max(0, streak) * 1.6 + Math.max(0, n(v.x * 1.2 + 4, v.y * 0.9, v.z * 1.2, 2)) * 1.1;
    m *= 0.55 + 0.45 * Math.min(1, v.y / G.rock.h + 0.3);
    if (carved && v.z < FRONT + 0.1 && v.y > 1.2 && v.y < 5.0 && Math.abs(v.x) < 1.0) m *= 0.12; // the carving kept clear
    m = Math.min(1, Math.max(0, (m - 0.12) * 1.8));
    moss.copy(dark).lerp(new Color(0x5e7a2e), Math.max(0, n(v.x * 3, v.y * 3, v.z * 3, 2) + 0.4));
    const c = rock.clone().lerp(moss, m);
    const lich = Math.max(0, n(v.x * 3 + 9, v.y * 2.5, v.z * 3, 2) - 0.25) * 2.2 * (1 - m);
    c.lerp(lichen, Math.min(0.6, lich));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new Float32BufferAttribute(col, 3));
  return geo;
}

/** Fine grit for the stone's surface (the vertex colours carry the big patches). */
function grit() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const ctx = c.getContext("2d")!, img = ctx.createImageData(256, 256);
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 256 * 256; i++) { const g = 190 + r() * 65 - (r() < 0.04 ? 70 : 0); img.data.set([g, g, g, 255], i * 4); }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; return t;
}

/** The lamps at a stone's feet, lighting it from below: warm light falling off with distance from each lamp (stone
 * space), on the stone's own colour, scaled by `uLamp` each frame (dark by day). */
function uplit(mat: MeshStandardMaterial, lamps: Vector3[], uLamp: { value: number }, key: string) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLamp = uLamp;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vStone;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvStone = position;");
    const sum = lamps.map((l) => `lit += exp(-0.55 * length(vStone - vec3(${l.x.toFixed(2)}, ${l.y.toFixed(2)}, ${l.z.toFixed(2)})));`).join("\n");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vStone;\nuniform float uLamp;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        float lit = 0.0;
        ${sum}
        totalEmissiveRadiance += uLamp * vec3(1.0, 0.45, 0.14) * diffuseColor.rgb * lit;`);
  };
  mat.customProgramCacheKey = () => "gate-stone-uplit-" + key;
}

/* — the carving, the beam, the plants — */

/** The Edakkal figures, cut into the stone: dark incised lines with a lighter lip below them, transparent between. The
 * same canvas lights them warm at night (the lamps catch the cuts). */
function edakkal() {
  const W = 512, H = 1024, c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const draw = (ctx: CanvasRenderingContext2D, stroke: string, dy: number, width: number) => {
    ctx.save(); ctx.translate(0, dy); ctx.strokeStyle = stroke; ctx.fillStyle = stroke;
    ctx.lineWidth = width; ctx.lineCap = ctx.lineJoin = "round";
    const line = (pts: number[]) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); };
    const ring = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); };
    // the big figure with the radiating headdress
    const fx = 256, fy = 330;
    ring(fx, fy - 140, 26);
    for (let k = 0; k < 9; k++) { const a = Math.PI * (1.05 + (k / 8) * 0.9); line([fx + Math.cos(a) * 34, fy - 140 + Math.sin(a) * 34, fx + Math.cos(a) * 78, fy - 140 + Math.sin(a) * 78]); }
    line([fx, fy - 114, fx, fy + 60]);                                     // body
    line([fx - 70, fy - 70, fx, fy - 50, fx + 70, fy - 70]);              // arms
    line([fx - 70, fy - 70, fx - 86, fy - 20]); line([fx + 70, fy - 70, fx + 92, fy - 110]); // one hand raised
    ring(fx + 98, fy - 128, 16);                                           // holding a cup
    line([fx - 34, fy - 40, fx + 34, fy - 40, fx + 34, fy + 20, fx - 34, fy + 20, fx - 34, fy - 40]); // the patterned body
    line([fx - 34, fy - 10, fx + 34, fy - 10]); line([fx, fy - 40, fx, fy + 20]);
    line([fx, fy + 60, fx - 48, fy + 150]); line([fx, fy + 60, fx + 48, fy + 150]); // legs
    // two small figures either side
    for (const [x, y] of [[96, 420], [420, 440]]) {
      ring(x, y - 62, 13); line([x, y - 49, x, y + 20]); line([x - 30, y - 30, x + 30, y - 30]);
      line([x, y + 20, x - 22, y + 66]); line([x, y + 20, x + 22, y + 66]);
      for (let k = 0; k < 5; k++) { const a = Math.PI * (1.15 + (k / 4) * 0.7); line([x + Math.cos(a) * 17, y - 62 + Math.sin(a) * 17, x + Math.cos(a) * 36, y - 62 + Math.sin(a) * 36]); }
    }
    // the wheel
    ring(130, 620, 54); ring(130, 620, 14);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; line([130 + Math.cos(a) * 14, 620 + Math.sin(a) * 14, 130 + Math.cos(a) * 54, 620 + Math.sin(a) * 54]); }
    // the elephant
    ctx.beginPath(); ctx.ellipse(350, 640, 78, 46, 0, 0, Math.PI * 2); ctx.stroke(); // body
    ring(438, 606, 28);                                                    // head
    line([458, 624, 474, 680, 462, 712]);                                  // trunk
    for (const x of [300, 330, 375, 400]) line([x, 680, x, 740]);          // legs
    line([272, 630, 254, 672]);                                            // tail
    // the patterned panels below: a grid and a run of zig-zags
    for (let i = 0; i <= 4; i++) { line([110 + i * 40, 820, 110 + i * 40, 940]); }
    for (let j = 0; j <= 3; j++) { line([110, 820 + j * 40, 270, 820 + j * 40]); }
    const zig: number[] = []; for (let i = 0; i <= 8; i++) zig.push(310 + i * 20, i % 2 ? 830 : 870); line(zig);
    const zig2: number[] = []; for (let i = 0; i <= 8; i++) zig2.push(310 + i * 20, i % 2 ? 900 : 940); line(zig2);
    ctx.restore();
  };
  draw(ctx, "rgba(224,206,170,0.55)", 5, 11); // the lit lip below each cut
  draw(ctx, "rgba(28,24,18,0.92)", 0, 9);      // the cut
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  // the glow map: just the lips, so the cuts' edges catch the lamp
  const g = document.createElement("canvas"); g.width = W; g.height = H;
  const gctx = g.getContext("2d")!; gctx.fillStyle = "#000"; gctx.fillRect(0, 0, W, H);
  draw(gctx, "rgba(255,255,255,0.8)", 5, 11); draw(gctx, "#000", 0, 9);
  const glow = new CanvasTexture(g); glow.colorSpace = SRGBColorSpace;
  return { map: t, glow };
}

/** Dark weathered timber, planks along its length, with the iron straps' shadow at the ends. */
function timber() {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 128;
  const ctx = c.getContext("2d")!;
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = "#2d2219"; ctx.fillRect(0, 0, 1024, 128);
  for (let k = 0; k < 220; k++) {
    const y = r() * 128, l = 80 + r() * 500, x = r() * 1024, a = 0.08 + r() * 0.18;
    ctx.strokeStyle = r() < 0.5 ? `rgba(14,10,6,${a})` : `rgba(92,70,48,${a})`;
    ctx.lineWidth = 0.6 + r() * 1.6; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + l * 0.3, y + (r() - 0.5) * 4, x + l * 0.6, y + (r() - 0.5) * 4, x + l, y + (r() - 0.5) * 3); ctx.stroke();
  }
  ctx.fillStyle = "rgba(8,6,4,0.75)"; ctx.fillRect(0, 62, 1024, 3); // the joint between the two planks
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = RepeatWrapping; t.anisotropy = 8; return t;
}

/** Lettering: cream, cut-in looking (a dark shadow above-left), on transparent. Lines stack centred. */
function lettering(lines: string[], w: number, h: number, size: number, opts: { bg?: string; ink?: string; spacing?: number } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!, ink = opts.ink ?? "#f1e4c6";
  if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = ink; ctx.lineWidth = h * 0.03; ctx.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08); }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const font = (px: number) => `600 ${px}px "Instrument Sans", Arial, sans-serif`;
  let px = size;
  ctx.font = font(px);
  const spaced = (l: string) => (opts.spacing ? l.split("").join(" ".repeat(opts.spacing)) : l);
  while (px > 8 && Math.max(...lines.map((l) => ctx.measureText(spaced(l)).width)) > w * 0.9) ctx.font = font((px -= 4));
  lines.forEach((l, i) => {
    const y = (h * (i + 0.5)) / lines.length;
    if (!opts.bg) { ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillText(spaced(l), w / 2 - 2, y - 2); }
    ctx.fillStyle = ink; ctx.fillText(spaced(l), w / 2, y);
  });
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8; return t;
}

/** One fern frond: a stem with paired leaflets, shrinking to the tip; green on transparent. */
function frond() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "#3e5a22"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(64, 512); ctx.lineTo(64, 8); ctx.stroke();
  for (let y = 490; y > 20; y -= 14) {
    const k = (y - 10) / 500, len = 56 * Math.sin(Math.PI * Math.min(1, k * 1.15)) + 4, shade = 70 + Math.round(40 * k);
    ctx.fillStyle = `rgb(${shade - 30},${shade + 50},${shade - 45})`;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(64, y);
      ctx.quadraticCurveTo(64 + side * len * 0.5, y - 12, 64 + side * len, y - 16);
      ctx.quadraticCurveTo(64 + side * len * 0.5, y + 2, 64, y + 6); ctx.fill();
    }
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

/** A clump of fronds round (x, z): each a plane hinged at the ground, leaning out and arching, merged into one mesh. */
function fernClump(x: number, z: number, size: number, seed: number) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts: BufferGeometry[] = [];
  const count = 9 + Math.floor(r() * 4);
  for (let i = 0; i < count; i++) {
    const len = size * (0.7 + r() * 0.45), geo = new PlaneGeometry(len * 0.32, len, 1, 4);
    geo.translate(0, len / 2, 0);
    const p = geo.attributes.position; // arch it over: the tip droops forward
    for (let k = 0; k < p.count; k++) { const u = p.getY(k) / len; p.setZ(k, p.getZ(k) + u * u * len * 0.45); }
    geo.rotateX(0.55 + r() * 0.5);
    geo.rotateY((i / count) * Math.PI * 2 + r() * 0.5);
    geo.translate(x, 0, z);
    parts.push(geo);
  }
  return mergeGeometries(parts);
}

/** Red heliconia: a few stalks with bracts, by the ferns. */
function heliconia(x: number, z: number, seed: number) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const stems: BufferGeometry[] = [], flowers: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const dx = x + (r() - 0.5) * 0.6, dz = z + (r() - 0.5) * 0.6, h = 0.9 + r() * 0.5;
    stems.push(new CylinderGeometry(0.02, 0.025, h, 5).translate(dx, h / 2, dz));
    for (let k = 0; k < 4; k++) {
      const b = new ConeGeometry(0.06, 0.26, 5); b.rotateZ((k % 2 ? 1 : -1) * 1.1); b.translate(dx + (k % 2 ? 0.07 : -0.07), h - 0.1 - k * 0.11, dz);
      flowers.push(b);
    }
  }
  return { stems: mergeGeometries(stems), flowers: mergeGeometries(flowers) };
}

/** A soft round glow (the lamps' pools on the ground and halos), white on black for additive blending. */
function glowDisc() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const ctx = c.getContext("2d")!, g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,0.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

type Night = { lamp: { value: number }; glowing: MeshStandardMaterial[]; halos: MeshBasicMaterial; stone: MeshStandardMaterial; beam: MeshStandardMaterial };

function build(): { group: Group; night: Night } {
  const g = new Group();
  const add = (m: Mesh, shadow = true) => { m.castShadow = m.receiveShadow = shadow; g.add(m); return m; };
  const lamp = { value: 0 };

  // the stones, each on its plinth, with two lamps at its feet (on the road side and in front)
  const stoneMat = new MeshStandardMaterial({ vertexColors: true, map: grit(), roughness: 0.92, metalness: 0 });
  const lamps = [new Vector3(-1.1, 0.25, -2.0), new Vector3(0.9, 0.25, -2.1)]; // stone space, for the left stone; mirrored for the right
  const plinthTex = rubble({ weathered: true, seed: 23 }); plinthTex.repeat.set(3, 0.6);
  const plinthMat = new MeshStandardMaterial({ map: plinthTex, roughness: 0.95 });
  for (const side of [1, -1]) {
    const geo = standingStone(side > 0 ? 3 : 8, side > 0, side); // each leans a little away from the road
    const mat = side > 0 ? stoneMat : stoneMat.clone();
    uplit(mat, lamps.map((l) => new Vector3(l.x * side, l.y - G.plinth.h, l.z)), lamp, side > 0 ? "l" : "r");
    const rock = add(new Mesh(geo, mat));
    rock.position.set(side * CX, G.plinth.h, 0);
    rock.scale.setScalar(side > 0 ? 1 : 0.94);
    const plinth = add(new Mesh(new CylinderGeometry(G.plinth.r, G.plinth.r + 0.15, G.plinth.h + G.plinth.below, 9), plinthMat));
    plinth.position.set(side * CX, (G.plinth.h - G.plinth.below) / 2, 0);
    if (side < 0) stoneMat.userData.twin = mat;
  }
  const stones = [stoneMat, stoneMat.userData.twin as MeshStandardMaterial];

  // the Edakkal carving on the left stone's face toward you
  const carving = edakkal();
  const cut = new MeshStandardMaterial({
    map: carving.map, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2,
    emissive: 0xffb466, emissiveMap: carving.glow, emissiveIntensity: 0,
  });
  const panel = new Mesh(new PlaneGeometry(1.7, 3.4), cut);
  panel.position.set(CX - 0.05, G.plinth.h + 3.1, FRONT - 0.1); panel.rotation.y = Math.PI; // faces −z, oncoming traffic
  panel.renderOrder = 1; g.add(panel);

  // the beam: timber, set into both stones, iron straps where it meets them, the lettering on both faces
  const len = 2 * CX + 0.4, wood = timber(); wood.repeat.set(2, 1);
  const beamMat = new MeshStandardMaterial({ map: wood, roughness: 0.8 });
  add(new Mesh(new BoxGeometry(len, G.beam.h, G.beam.d), beamMat)).position.set(0, G.beam.y + G.beam.h / 2, 0);
  const iron = new MeshStandardMaterial({ color: 0x1c1d1e, roughness: 0.55, metalness: 0.6 });
  for (const side of [-1, 1]) for (const dx of [0.35, 0.75]) {
    add(new Mesh(new BoxGeometry(0.1, G.beam.h + 0.06, G.beam.d + 0.06), iron)).position.set(side * (CX - G.rock.rx - dx), G.beam.y + G.beam.h / 2, 0);
  }
  const words = lettering(["WELCOME TO WAYANAD"], 2048, 194, 150, { spacing: 2 });
  const signMat = new MeshStandardMaterial({ map: words, transparent: true, roughness: 0.6, emissive: 0xffe2b0, emissiveMap: words, emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const face of [1, -1]) {
    const sign = new Mesh(new PlaneGeometry(11.6, 1.1), signMat);
    sign.position.set(0, G.beam.y + G.beam.h / 2, face * (G.beam.d / 2 + 0.005)); if (face < 0) sign.rotation.y = Math.PI;
    g.add(sign);
  }

  // the lamps: dark iron boxes on the ground, their glass lit; a pool of light round each, a halo at night
  const lampGeo: BufferGeometry[] = [], glassGeo: BufferGeometry[] = [], poolGeo: BufferGeometry[] = [];
  for (const side of [1, -1]) for (const l of lamps) {
    const x = side * (CX + l.x), z = l.z;
    lampGeo.push(new BoxGeometry(0.34, 0.26, 0.3).translate(x, 0.13, z));
    glassGeo.push(new BoxGeometry(0.26, 0.06, 0.22).translate(x, 0.27, z));
    poolGeo.push(new PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2).translate(x, 0.03, z));
  }
  add(new Mesh(mergeGeometries(lampGeo), iron));
  const glass = new MeshStandardMaterial({ color: 0x3a3226, emissive: 0xffb15c, emissiveIntensity: 0.1, roughness: 0.3 });
  g.add(new Mesh(mergeGeometries(glassGeo), glass));
  const halos = new MeshBasicMaterial({ map: glowDisc(), color: 0xff9a45, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const pools = new Mesh(mergeGeometries(poolGeo), halos); pools.renderOrder = 1; g.add(pools);

  // ferns and red heliconia round the plinths, on the road side and in front
  const fernMat = new MeshStandardMaterial({ map: frond(), alphaTest: 0.45, side: DoubleSide, roughness: 0.75 });
  const ferns: BufferGeometry[] = [], stems: BufferGeometry[] = [], flowers: BufferGeometry[] = [];
  let seed = 101;
  for (const side of [1, -1]) {
    for (const [dx, dz, size] of [[-2.2, -1.4, 1.4], [-0.3, -2.6, 1.6], [1.9, -1.9, 1.3], [2.5, 1.0, 1.5], [-2.0, 1.7, 1.2]] as const) {
      ferns.push(fernClump(side * (CX + dx), dz, size, (seed += 37)));
    }
    const h = heliconia(side * (CX - 1.6), -2.3, (seed += 53)); stems.push(h.stems); flowers.push(h.flowers);
  }
  add(new Mesh(mergeGeometries(ferns), fernMat), false);
  add(new Mesh(mergeGeometries(stems), new MeshStandardMaterial({ color: 0x3f5f25, roughness: 0.8 })), false);
  add(new Mesh(mergeGeometries(flowers), new MeshStandardMaterial({ color: 0xc8281e, roughness: 0.6 })), false);

  // guard huts beyond the stones: painted walls, tiled hip roofs
  const tiles = new MeshStandardMaterial({ color: 0xa8492c, roughness: 0.8 });
  const hutWall = new MeshStandardMaterial({ color: 0xd9cf86, roughness: 0.9 });
  for (const [side, z] of [[-1, 4], [1, -4]]) {
    const x = side * (CX + G.plinth.r + 2.4);
    add(new Mesh(new BoxGeometry(3, 3 + G.plinth.below, 3.2), hutWall)).position.set(x, (3 - G.plinth.below) / 2, z);
    const roof = add(new Mesh(new ConeGeometry(2.6, 1.3, 4), tiles));
    roof.position.set(x, 3.65, z); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 1.1);
  }
  // "Enter Wayanad District" board, 15 m before the gate on the driver's left, facing oncoming traffic
  const bx = G.clear / 2 - 0.5;
  const board = new Mesh(new PlaneGeometry(2.2, 1.3), new MeshStandardMaterial({ map: lettering(["Enter", "Wayanad", "District"], 512, 300, 90, { bg: "#1f7a4a", ink: "#f4f4ef" }), roughness: 0.6 }));
  const boardBack = new Mesh(new BoxGeometry(2.3, 1.4, 0.06), new MeshStandardMaterial({ color: 0x1f7a4a, roughness: 0.6 }));
  boardBack.position.set(bx, 2.4, -15); board.position.set(bx, 2.4, -15.04); board.rotation.y = Math.PI;
  add(boardBack); g.add(board);
  const post = new MeshStandardMaterial({ color: 0x1f3a2d, roughness: 0.6 });
  for (const dx of [-0.8, 0.8]) add(new Mesh(new BoxGeometry(0.08, 2.4 + G.plinth.below, 0.08), post)).position.set(bx + dx, (2.4 - G.plinth.below) / 2, -14.95);

  return { group: g, night: { lamp, glowing: [cut, signMat, glass], halos, stone: stones[0], beam: beamMat } };
}

export default function Gateway({ curve }: { curve: CatmullRomCurve3 }) {
  const { group, night } = useMemo(() => {
    const b = build(), t = archT(), p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    b.group.position.set(p.x, p.y - 0.6, p.z);
    b.group.rotation.y = Math.atan2(tan.x, tan.z);
    b.group.scale.setScalar(0.1); // metres → scene units
    b.group.name = "gateway";
    return b;
  }, [curve]);

  // after dusk the lamps come on: the stones lit from their feet, the carving's edges and the lettering catching it;
  // in the rain, the stone and timber darken and shine
  useFrame(() => {
    const k = Math.max(nightness(), 0.5 * duskness());
    night.lamp.value = 2.2 * k;
    const [cut, sign, glass] = night.glowing;
    cut.emissiveIntensity = 0.9 * k; sign.emissiveIntensity = 0.55 * k; glass.emissiveIntensity = 0.1 + 6 * k;
    night.halos.opacity = 0.5 * k;
    const wet = weather.wet;
    for (const m of [night.stone, night.stone.userData.twin as MeshStandardMaterial]) {
      m.roughness = 0.92 - 0.45 * wet; m.color.setScalar(1 - 0.25 * wet);
    }
    night.beam.roughness = 0.8 - 0.4 * wet; night.beam.color.setScalar(1 - 0.2 * wet);
  });
  return <primitive object={group} />;
}
