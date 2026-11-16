import {
  BoxGeometry, BufferGeometry, CanvasTexture, CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, Material, Matrix4, Mesh,
  MeshStandardMaterial, RepeatWrapping, SphereGeometry, SRGBColorSpace, Vector3, type Object3D,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { rubble } from "./stone";
import { APRON, type KadaStyle } from "@/lib/stops";

/*
 * The parts of the churam's roadside stops (components/scene/Stops): the chai kadas in four styles — 0 traditional
 * (terracotta tiles, wooden counter, glass jars, a steel tea urn, a bench), 1 the viewpoint café (open sides, dark
 * shingles, string lights, a chalkboard menu in Malayalam), 2 the monsoon stall (blue tarp, red plastic stools, snack
 * packets hanging), 3 the eco hut (thatch, a copper samovar, a log bench) — and the Lakkidi View Point's terrace
 * (stone paving, pillars and black railings with lanterns, the sign, a coin telescope, a tiled gazebo, stone benches).
 * Built from simple shapes and drawn signs, then merged by material (`bake`): a stop is a dozen draws, not a hundred.
 * Units of 10 m; local +x along the road, +z away from it, y = 0 the road's level.
 */

// ---- materials, shared (and merged across) by colour ----
const mats = new Map<string, MeshStandardMaterial>();
export function mat(color: string, o: { metalness?: number; roughness?: number; emissive?: string; opacity?: number } = {}) {
  const key = `${color}|${o.metalness ?? 0}|${o.roughness ?? 0.85}|${o.emissive ?? ""}|${o.opacity ?? 1}`;
  let m = mats.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: o.roughness ?? 0.85, metalness: o.metalness ?? 0 });
    if (o.emissive) { m.emissive.set(o.emissive); m.emissiveIntensity = 0.15; m.userData.glow = true; }
    if (o.opacity !== undefined && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    mats.set(key, m);
  }
  return m;
}
/** Every lamp, bulb and lantern: their glow follows the evening (Stops sets it each frame). */
export const glowMaterials = () => [...mats.values()].filter((m) => m.userData.glow);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const texMats = new Map<string, MeshStandardMaterial>();
function texMat(key: string, make: () => CanvasTexture, o: { roughness?: number; metalness?: number } = {}) {
  let m = texMats.get(key);
  if (!m) { m = new MeshStandardMaterial({ map: make(), roughness: o.roughness ?? 0.85, metalness: o.metalness ?? 0 }); texMats.set(key, m); }
  return m;
}
const ML = "'Noto Sans Malayalam', 'Malayalam Sangam MN', 'Kartika', 'Manjari', sans-serif";

function woodGrain(g: CanvasRenderingContext2D, w: number, h: number, base: string, seed = 3) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`; g.lineWidth = 1 + r() * 2; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + r() * 8 - 4, w * 0.7, y + r() * 8 - 4, w, y + r() * 6 - 3); g.stroke(); }
}
function cup(g: CanvasRenderingContext2D, x: number, y: number, k: number, colour: string) {
  g.strokeStyle = colour; g.lineWidth = 4 * k; g.lineCap = "round";
  g.beginPath(); g.moveTo(x - 18 * k, y - 8 * k); g.lineTo(x - 14 * k, y + 16 * k); g.lineTo(x + 14 * k, y + 16 * k); g.lineTo(x + 18 * k, y - 8 * k); g.closePath(); g.stroke();
  g.beginPath(); g.arc(x + 22 * k, y + 2 * k, 7 * k, -Math.PI / 2, Math.PI / 2); g.stroke();
  for (const dx of [-7, 2]) { g.beginPath(); g.moveTo(x + dx * k, y - 14 * k); g.bezierCurveTo(x + (dx - 6) * k, y - 22 * k, x + (dx + 6) * k, y - 28 * k, x + dx * k, y - 36 * k); g.stroke(); }
}
/** The board over the counter, per style. */
function signMat(style: KadaStyle) {
  return texMat(`sign${style}`, () => canvasTex(512, 160, (g) => {
    if (style === 2) { g.fillStyle = "#121a22"; g.fillRect(0, 0, 512, 160); g.strokeStyle = "#ffd75e"; g.lineWidth = 5; g.strokeRect(8, 8, 496, 144); }
    else woodGrain(g, 512, 160, style === 3 ? "#5a3d22" : "#4a2f1b", 5 + style);
    g.textAlign = "center"; g.textBaseline = "middle";
    if (style === 0) {
      g.fillStyle = "#fff3dc"; g.font = `700 58px ${ML}`; g.fillText("ചായക്കട", 230, 62);
      g.fillStyle = "#ffcc33"; g.font = "700 36px Arial, sans-serif"; g.fillText("Chai Kada", 230, 120); cup(g, 430, 84, 1.3, "#fff3dc");
    } else if (style === 1) {
      cup(g, 92, 84, 1.5, "#fff3dc"); g.fillStyle = "#fff3dc"; g.font = "italic 700 64px Georgia, serif"; g.fillText("Chai Point", 300, 84);
    } else if (style === 2) {
      cup(g, 80, 84, 1.4, "#ffffff"); g.fillStyle = "#ffffff"; g.font = "700 62px Arial, sans-serif"; g.fillText("Tea · Snacks", 300, 84);
    } else {
      g.fillStyle = "#fff3dc"; g.font = "italic 800 46px Arial, sans-serif"; g.fillText("Wayanad", 256, 56);
      g.fillStyle = "#ffcc33"; g.font = "italic 800 54px Arial, sans-serif"; g.fillText("Chai Kada", 256, 112);
    }
  }), { roughness: 0.7 });
}
const menuMat = () => texMat("menu", () => canvasTex(256, 320, (g) => {
  g.fillStyle = "#1c2420"; g.fillRect(0, 0, 256, 320); g.strokeStyle = "#7a5634"; g.lineWidth = 14; g.strokeRect(7, 7, 242, 306);
  g.fillStyle = "#f2efe6"; g.textAlign = "center"; g.font = `600 38px ${ML}`;
  ["ചായ", "കാപ്പി", "പരിപ്പുവട", "ഉള്ളിവട", "ബജ്ജി"].forEach((w, i) => g.fillText(w, 128, 66 + i * 54));
}), { roughness: 0.9 });
const shelfMat = () => texMat("shelf", () => canvasTex(256, 128, (g) => {
  g.fillStyle = "#2a1c12"; g.fillRect(0, 0, 256, 128);
  const cols = ["#d23a2a", "#f2c12e", "#2e7d32", "#1e5fa8", "#f08a24", "#8e44ad", "#e8e2d0"];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) { g.fillStyle = cols[(i * 3 + row) % cols.length]; g.fillRect(4 + i * 21, 8 + row * 40, 16, 30); }
  g.fillStyle = "#5a3a22"; for (let row = 0; row < 4; row++) g.fillRect(0, row * 40 + 2, 256, 5);
}));
const packetsMat = () => texMat("packets", () => canvasTex(256, 64, (g) => {
  g.clearRect(0, 0, 256, 64); const cols = ["#e53935", "#fdd835", "#43a047", "#1e88e5", "#fb8c00", "#8e24aa"];
  for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(i * 16 + 2, 4 + (i % 2) * 6, 12, 50); g.fillStyle = "rgba(255,255,255,.6)"; g.fillRect(i * 16 + 4, 20 + (i % 2) * 6, 8, 8); }
}));
const tilesMat = () => texMat("tiles", () => canvasTex(128, 128, (g) => {
  g.fillStyle = "#8f3f22"; g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) { g.fillStyle = row % 2 ? "#a24a28" : "#984325"; g.fillRect(0, row * 16, 128, 12); g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, row * 16 + 12, 128, 4); for (let i = 0; i < 8; i++) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(i * 16 + (row % 2) * 8, row * 16, 2, 12); } }
}, [3, 2]), { roughness: 0.75 });
const thatchMat = () => texMat("thatch", () => canvasTex(128, 128, (g) => {
  g.fillStyle = "#7d5f33"; g.fillRect(0, 0, 128, 128);
  let s = 9; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 500; i++) { g.strokeStyle = `rgba(${150 + r() * 60},${110 + r() * 50},${50 + r() * 30},.8)`; g.lineWidth = 1; const x = r() * 128, y = r() * 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r() * 4 - 2, y + 10 + r() * 10); g.stroke(); }
}, [3, 2]), { roughness: 1 });
const pavingMat = () => texMat("paving", () => canvasTex(256, 256, (g) => {
  g.fillStyle = "#3b3631"; g.fillRect(0, 0, 256, 256);
  let s = 21; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 8; row++) for (let i = -1; i < 6; i++) {
    const v = 112 + r() * 46, warm = r() * 14, x = i * 46 + (row % 2) * 23 + 2, w = 42 + r() * 3;
    g.fillStyle = `rgb(${v + warm},${v + warm * 0.6},${v - 8})`; g.fillRect(x, row * 32 + 2, w, 28);
    g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; g.fillRect(x + r() * 20, row * 32 + 4 + r() * 16, 10 + r() * 14, 4 + r() * 6); // weathering
  }
}, [16, 8]), { roughness: 0.82 });
let wallTex: CanvasTexture | null = null;
const wallMat = (rx: number, ry: number) => {
  wallTex ??= rubble({ weathered: true, seed: 31 });
  const t = wallTex.clone(); t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(rx, ry); t.needsUpdate = true;
  return new MeshStandardMaterial({ map: t, roughness: 0.95 });
};
const signStoneMat = () => texMat("vpsign", () => canvasTex(512, 300, (g) => {
  woodGrain(g, 512, 300, "#3b2716", 13); g.strokeStyle = "#c9a35a"; g.lineWidth = 6; g.strokeRect(10, 10, 492, 280);
  // the mountain mark
  g.strokeStyle = "#f4ecd8"; g.lineWidth = 6; g.lineJoin = "round"; g.beginPath(); g.moveTo(170, 82); g.lineTo(220, 40); g.lineTo(246, 62); g.lineTo(272, 34); g.lineTo(340, 82); g.stroke();
  g.textAlign = "center"; g.fillStyle = "#f4ecd8"; g.font = "800 64px Arial, sans-serif"; g.fillText("LAKKIDI", 256, 148);
  g.fillStyle = "#ffcc33"; g.font = "800 54px Arial, sans-serif"; g.fillText("VIEW POINT", 256, 208);
  g.fillStyle = "#e8dcc0"; g.font = "500 28px Arial, sans-serif"; g.fillText("Wayanad Churam", 256, 258);
}), { roughness: 0.7 });
const viewPlacard = () => texMat("view360", () => canvasTex(64, 96, (g) => { g.fillStyle = "#ffd21f"; g.fillRect(0, 0, 64, 96); g.fillStyle = "#111"; g.textAlign = "center"; g.font = "800 20px Arial"; g.fillText("VIEW", 32, 40); g.fillText("360°", 32, 68); }));

// ---- building blocks ----
type At = [number, number, number];
function box(parent: Object3D, size: At, at: At, m: Material, rot?: At) { const o = new Mesh(new BoxGeometry(...size), m); o.position.set(...at); if (rot) o.rotation.set(...rot); parent.add(o); return o; }
function cyl(parent: Object3D, r: number, h: number, at: At, m: Material, seg = 10, r2 = r, rot?: At) { const o = new Mesh(new CylinderGeometry(r, r2, h, seg), m); o.position.set(...at); if (rot) o.rotation.set(...rot); parent.add(o); return o; }
function ball(parent: Object3D, r: number, at: At, m: Material, seg = 8) { const o = new Mesh(new SphereGeometry(r, seg, Math.max(4, seg - 2)), m); o.position.set(...at); parent.add(o); return o; }

function bananas(parent: Object3D, at: At) {
  const g = new Group(); g.position.set(...at); parent.add(g);
  const m = mat("#e7c43c", { roughness: 0.6 });
  for (let i = 0; i < 12; i++) { const b = new Mesh(new CapsuleGeometry(0.0035, 0.018, 2, 5), m); const a = (i / 12) * Math.PI * 2; b.position.set(Math.cos(a) * 0.01, -i * 0.0028, Math.sin(a) * 0.01); b.rotation.set(Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6); g.add(b); }
  cyl(parent, 0.0018, 0.04, [at[0], at[1] + 0.02, at[2]], mat("#5b4a2a"), 5);
}
function jars(parent: Object3D, x0: number, y: number, z: number, n: number) {
  const glass = mat("#e9dfc4", { roughness: 0.15, opacity: 0.55 }), snacks = ["#d9a441", "#c46a2b", "#e8c66a", "#9a5a2a"], lid = mat("#c7372f", { roughness: 0.5 });
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 0.03;
    cyl(parent, 0.011, 0.022, [x, y + 0.011, z], mat(snacks[i % snacks.length]), 10);
    cyl(parent, 0.013, 0.03, [x, y + 0.015, z], glass, 12);
    cyl(parent, 0.009, 0.005, [x, y + 0.032, z], lid, 10);
  }
}
function bench(parent: Object3D, at: At, len: number, m: Material, yaw = 0) {
  const g = new Group(); g.position.set(...at); g.rotation.y = yaw; parent.add(g);
  box(g, [len, 0.008, 0.035], [0, 0.042, 0], m);
  for (const s of [-1, 1]) box(g, [0.008, 0.04, 0.03], [s * (len / 2 - 0.02), 0.02, 0], m);
}
function stool(parent: Object3D, at: At, m: Material) { cyl(parent, 0.014, 0.004, [at[0], 0.045, at[2]], m, 10); cyl(parent, 0.012, 0.042, [at[0], 0.022, at[2]], m, 8, 0.016); }

/** A string of small warm bulbs from a to b, dipping between. */
function stringLights(parent: Object3D, a: At, b: At, n: number) {
  const bulb = mat("#ffe2a0", { emissive: "#ffc864", roughness: 0.4 }), wire = mat("#1a1a1a");
  for (let i = 0; i <= n; i++) {
    const f = i / n, sag = Math.sin(f * Math.PI) * 0.02;
    ball(parent, 0.0045, [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - sag - 0.005, a[2] + (b[2] - a[2]) * f], bulb, 6);
  }
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]); const w = cyl(parent, 0.0008, len, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.01, (a[2] + b[2]) / 2], wire, 3);
  w.rotation.z = Math.PI / 2; w.rotation.y = -Math.atan2(b[2] - a[2], b[0] - a[0]);
}
function lantern(parent: Object3D, at: At) {
  const frame = mat("#1b1b1b", { metalness: 0.4, roughness: 0.5 }), glass = mat("#ffd690", { emissive: "#ffb347", roughness: 0.3 });
  box(parent, [0.022, 0.003, 0.022], [at[0], at[1] + 0.036, at[2]], frame);
  box(parent, [0.016, 0.028, 0.016], [at[0], at[1] + 0.02, at[2]], glass);
  box(parent, [0.02, 0.004, 0.02], [at[0], at[1] + 0.004, at[2]], frame);
}

// ---- a chai kada ----
export const KADA_SIZE = { w: 0.34, d: 0.24, h: 0.27 };
/** One chai kada facing the road (local −z), its counter at the front. `stilts`: on the valley side, standing on posts. */
export function buildKada(style: KadaStyle, stilts: boolean) {
  const g = new Group(), { w, d, h } = KADA_SIZE;
  const wood = mat(style === 3 ? "#6b4a2b" : "#5a3a22"), dark = mat("#3a2616"), plank = mat(style === 2 ? "#6d5440" : "#7a5634");
  const front = 0.07, back = front + d;
  // the floor (and posts under it on the valley side)
  box(g, [w + 0.04, 0.012, d + 0.06], [0, 0.006, front + d / 2 - 0.01], mat("#5e5a52", { roughness: 0.9 }));
  box(g, [w + 0.12, 0.008, APRON + 0.04], [0, 0.0, -APRON / 2 + 0.01], mat("#6d6a62", { roughness: 0.95 })); // the packed apron in front, from the road's edge
  if (stilts) for (const x of [-w / 2, w / 2]) for (const z of [front, back]) cyl(g, 0.008, 0.6, [x, -0.3, z], wood, 6);
  // posts, back and side walls
  for (const x of [-w / 2, w / 2]) { cyl(g, 0.007, h, [x, h / 2, front], wood, 6); cyl(g, 0.007, h, [x, h / 2, back], wood, 6); }
  box(g, [w, h, 0.008], [0, h / 2, back], plank); // (the café is open at the sides only)
  if (style !== 1) for (const s of [-1, 1]) box(g, [0.008, h * 0.55, d], [s * w / 2, h * 0.28, front + d / 2], plank);
  // the shelves of packets and tins on the back wall
  const shelves = box(g, [w * 0.8, 0.11, 0.004], [0, 0.17, back - 0.008], shelfMat()); shelves.rotation.y = Math.PI;
  // the counter, the jars on it, the urn or samovar
  box(g, [w * 0.92, 0.1, 0.05], [0, 0.05, front + 0.03], style === 2 ? mat("#2f5d8a") : plank);
  box(g, [w * 0.96, 0.006, 0.06], [0, 0.103, front + 0.03], dark);
  jars(g, -w * 0.4, 0.106, front + 0.025, style === 3 ? 4 : 5);
  if (style === 3) { const cu = mat("#b4602f", { metalness: 0.7, roughness: 0.35 }); cyl(g, 0.026, 0.06, [w * 0.3, 0.136, front + 0.035], cu, 14); cyl(g, 0.012, 0.025, [w * 0.3, 0.178, front + 0.035], cu, 10); ball(g, 0.008, [w * 0.3, 0.195, front + 0.035], cu); }
  else { const steel = mat("#c9cdd1", { metalness: 0.85, roughness: 0.25 }); cyl(g, 0.024, 0.07, [w * 0.32, 0.141, front + 0.035], steel, 14); cyl(g, 0.016, 0.008, [w * 0.32, 0.18, front + 0.035], steel, 12); }
  // glasses of tea on the counter
  const tea = mat("#c98a4a", { roughness: 0.3 }); for (let i = 0; i < 3; i++) cyl(g, 0.005, 0.012, [w * 0.12 + i * 0.016, 0.112, front + 0.015], tea, 8);
  // the roof
  const eave = h + 0.01, ridge = h + 0.07, depth = d + 0.14, slope = Math.atan2(ridge - eave, depth);
  if (style === 0 || style === 1) {
    const roof = box(g, [w + 0.12, 0.012, Math.hypot(depth, ridge - eave)], [0, (eave + ridge) / 2, front + d / 2 - 0.02], style === 0 ? tilesMat() : mat("#2c2621", { roughness: 0.8 }));
    roof.rotation.x = slope;
  } else if (style === 2) {
    const tarp = mat("#1f5fbf", { roughness: 0.55 });
    const roof = box(g, [w + 0.14, 0.004, depth + 0.04], [0, eave + 0.03, front + d / 2 - 0.03], tarp); roof.rotation.x = slope * 0.6;
    box(g, [w + 0.14, 0.05, 0.003], [0, eave + 0.0, front - 0.05], tarp); // the tarp's front flap
    for (const sx of [-1, 1]) { const strip = box(g, [0.035, 0.13, 0.002], [sx * (w / 2 - 0.03), 0.19, front - 0.016], packetsMat()); strip.rotation.z = Math.PI / 2; }
  } else {
    const roof = box(g, [w + 0.16, 0.03, Math.hypot(depth + 0.04, ridge - eave)], [0, (eave + ridge) / 2 + 0.01, front + d / 2 - 0.02], thatchMat()); roof.rotation.x = slope;
  }
  // the board over the counter
  const sign = box(g, [w * 0.95, w * 0.95 * (160 / 512), 0.006], [0, h - 0.035, front - 0.012], signMat(style)); sign.rotation.y = Math.PI;
  // a bulb under the roof, bananas hanging at the corner
  ball(g, 0.008, [0, h - 0.02, front + 0.06], mat("#fff1c8", { emissive: "#ffcf70", roughness: 0.3 }), 8);
  bananas(g, [-w / 2 + 0.04, h - 0.06, front + 0.01]);
  // seats in front, by style; string lights and a menu board for the café
  if (style === 0) bench(g, [0, 0, -0.05], 0.22, wood);
  if (style === 1) { stringLights(g, [-w / 2 - 0.05, eave, front - 0.05], [w / 2 + 0.05, eave, front - 0.05], 10); for (const x of [-0.08, 0.08]) stool(g, [x, 0, -0.05], wood);
    const board = box(g, [0.06, 0.075, 0.004], [-w / 2 - 0.05, 0.045, -0.03], menuMat()); board.rotation.set(-0.2, Math.PI, 0); }
  if (style === 2) { const red = mat("#d32f2f", { roughness: 0.5 }); for (const x of [-0.1, -0.03, 0.05, 0.12]) stool(g, [x, 0, -0.06], red); }
  if (style === 3) { const log = cyl(g, 0.018, 0.2, [0, 0.018, -0.06], mat("#6b4a2b"), 10); log.rotation.z = Math.PI / 2;
    const wheel = new Mesh(new CylinderGeometry(0.05, 0.05, 0.008, 16, 1, true), mat("#5a3a22")); wheel.position.set(w / 2 + 0.04, 0.05, front + 0.05); wheel.rotation.z = Math.PI / 2; g.add(wheel); }
  // a kettle-steam anchor for the scene
  const steamAt = new Group(); steamAt.name = "steam"; steamAt.position.set(style === 3 ? w * 0.3 : w * 0.32, 0.2, front + 0.035); g.add(steamAt);
  return g;
}

// ---- the Lakkidi View Point terrace ----
/** The terrace: `w` along the road, `d` out over the valley, a stone wall `drop` deep beneath its edges. */
export function buildTerrace(w: number, d: number, drop: number) {
  const g = new Group();
  // the paved deck and the walls under it
  box(g, [w, 0.02, d + APRON], [0, -0.01, (d - APRON) / 2], pavingMat()); // (from the road's edge: the apron, lib/stops)
  box(g, [w, drop, 0.06], [0, -drop / 2 - 0.02, d], wallMat(w * 2, drop * 2));
  for (const s of [-1, 1]) box(g, [0.06, drop, d], [s * w / 2, -drop / 2 - 0.02, d / 2], wallMat(d * 2, drop * 2));
  // stone pillars along the outer edge and the ends, black rails between, lanterns on every other pillar
  const stone = wallMat(0.4, 0.8), cap = mat("#9a9488", { roughness: 0.9 }), rail = mat("#151515", { metalness: 0.6, roughness: 0.45 });
  const run = (ax: number, az: number, bx: number, bz: number, lamps: boolean) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.32)), yaw = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i <= n; i++) {
      const f = i / n, x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      box(g, [0.045, 0.11, 0.045], [x, 0.055, z], stone); box(g, [0.055, 0.01, 0.055], [x, 0.115, z], cap);
      if (lamps && i % 2 === 0) lantern(g, [x, 0.122, z]);
      if (i < n) for (const y of [0.05, 0.095]) { const r = box(g, [0.004, 0.004, len / n - 0.05], [x + (bx - ax) / n / 2, y, z + (bz - az) / n / 2], rail); r.rotation.y = yaw; }
    }
  };
  run(-w / 2, d - 0.03, w / 2, d - 0.03, true);
  run(-w / 2 + 0.03, 0.2, -w / 2 + 0.03, d - 0.03, false); run(w / 2 - 0.03, 0.2, w / 2 - 0.03, d - 0.03, false);
  // the sign by the road: a stone plinth with a wooden plaque, facing the traffic
  const plinth = new Group(); plinth.position.set(w * 0.12, 0, 0.16); g.add(plinth);
  box(plinth, [0.36, 0.06, 0.1], [0, 0.03, 0], wallMat(1, 0.3));
  box(plinth, [0.3, 0.17, 0.05], [0, 0.145, 0.01], wallMat(1, 0.6));
  const plaque = box(plinth, [0.26, 0.152, 0.006], [0, 0.15, -0.018], signStoneMat()); plaque.rotation.y = Math.PI;
  // the coin telescope at the railing
  const tele = new Group(); tele.position.set(-w * 0.12, 0, d - 0.16); g.add(tele);
  const steel = mat("#9aa0a6", { metalness: 0.8, roughness: 0.3 });
  cyl(tele, 0.03, 0.01, [0, 0.005, 0], steel, 14); cyl(tele, 0.008, 0.12, [0, 0.065, 0], steel, 10);
  const tube = cyl(tele, 0.016, 0.07, [0, 0.135, 0.01], steel, 12); tube.rotation.x = Math.PI / 2 - 0.12;
  const placard = box(tele, [0.018, 0.026, 0.002], [0, 0.08, -0.009], viewPlacard()); placard.rotation.y = Math.PI;
  // the gazebo: four posts, a tiled pyramid roof, a table inside
  const gz = new Group(); gz.position.set(w * 0.33, 0, d * 0.55); g.add(gz);
  const post = mat("#5a3a22");
  for (const x of [-0.22, 0.22]) for (const z of [-0.22, 0.22]) cyl(gz, 0.012, 0.26, [x, 0.13, z], post, 8);
  const roof = new Mesh(new ConeGeometry(0.4, 0.16, 4, 1), tilesMat()); roof.position.set(0, 0.34, 0); roof.rotation.y = Math.PI / 4; gz.add(roof);
  box(gz, [0.5, 0.012, 0.5], [0, 0.262, 0], post);
  box(gz, [0.2, 0.008, 0.12], [0, 0.07, 0], post); cyl(gz, 0.01, 0.07, [0, 0.035, 0], post, 6);
  bench(gz, [0, 0, -0.12], 0.2, post); bench(gz, [0, 0, 0.12], 0.2, post);
  ball(gz, 0.01, [0, 0.24, 0], mat("#fff1c8", { emissive: "#ffcf70", roughness: 0.3 }), 8);
  stringLights(gz, [-0.25, 0.26, -0.25], [0.25, 0.26, -0.25], 8);
  // stone benches facing the view
  const slab = mat("#8a857a", { roughness: 0.95 });
  for (const x of [-w * 0.3, -w * 0.02]) { box(g, [0.22, 0.014, 0.06], [x, 0.045, d - 0.42], slab); for (const s of [-1, 1]) box(g, [0.03, 0.04, 0.05], [x + s * 0.08, 0.02, d - 0.42], slab); }
  return g;
}

/**
 * Merge a built group's meshes by material into one mesh each (their transforms baked in): the stop draws in a dozen
 * calls. Meshes with a material used once (signs) stay as they are, merged anyway — one each.
 */
export function bake(group: Group) {
  group.updateMatrixWorld(true);
  const inv = new Matrix4().copy(group.matrixWorld).invert(), buckets = new Map<Material, BufferGeometry[]>();
  group.traverse((o) => {
    const m = o as Mesh; if (!m.isMesh) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(new Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
    const mm = m.material as Material; (buckets.get(mm) ?? buckets.set(mm, []).get(mm)!).push(geo);
  });
  const out = new Group(); out.position.copy(group.position); out.quaternion.copy(group.quaternion); out.name = group.name;
  for (const [m, geos] of buckets) {
    const merged = mergeGeometries(geos, false); geos.forEach((x) => x.dispose());
    if (!merged) continue;
    const mesh = new Mesh(merged, m); mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; out.add(mesh);
  }
  // named anchors (e.g. the kettle's steam) carried over in the group's own frame
  group.traverse((o) => { if (o.name === "steam") { const a = new Group(); a.name = "steam"; a.position.copy(o.getWorldPosition(new Vector3()).applyMatrix4(inv)); out.add(a); } });
  return out;
}
