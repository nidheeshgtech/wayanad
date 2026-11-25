"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, Box3, BoxGeometry, CanvasTexture, CatmullRomCurve3, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh,
  BufferGeometry, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, SphereGeometry, Vector3, type Material,
} from "three";
import { SECTION, height } from "@/lib/terrain";
import { BAY, MARKET, STATION_ICON, centreOf, frameAt, stationsOn, stepTown, town, type Centre, type Station } from "@/lib/townLife";
import { STREET, legRoad, roadOf, street as onSt, streets } from "@/lib/streets";
import { game } from "@/lib/game";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { NEON, setLights } from "@/lib/neon";
import { duskness, nightness } from "@/lib/theme";
import { loadVehicle } from "@/lib/vehicleAssets";
import { VEHICLES } from "@/lib/traffic";
import { personHeight, type PersonId } from "@/data/drivers";
import { loadCast, makeActor, settleHands, type Actor, type Move } from "@/lib/people";
import { whenReady } from "@/lib/loading";
import { quality } from "@/lib/quality";
import { bake } from "./stopKit";

/* Life in the towns (lib/townLife): the petrol pumps, the car wash and the paint garage you pull into; Kalpetta's bus
 * stand with buses parked in its bays and people waiting, the shelter across the road, the pedestrian crossing with its
 * signal (red, amber, green; people cross on red), the auto stand, the traffic police on his podium at the bazaar
 * street's mouth, and the carts on the footpath. Each place a few merged meshes; signs and lamps glow after dark and
 * the lights are mirrored in the wet road (lib/neon). Local frames: +z away from the road, y = 0 the road's level.
 * Units of 10 m. */
const ML = "'Noto Sans Malayalam','Malayalam Sangam MN','Kartika','Manjari',sans-serif";
const EDGE = SECTION.half + 0.05; // a place's frame starts at the road's edge

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t;
}
const mats = new Map<string, MeshStandardMaterial>();
/** A plain surface (shared by colour); `glow`: its emissive follows the evening (TownLife sets it). */
function M(color: string | number, o: { rough?: number; metal?: number; glow?: string | number } = {}) {
  const key = `${color}|${o.rough ?? 0.8}|${o.metal ?? 0}|${o.glow ?? ""}`;
  let m = mats.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0 });
    if (o.glow !== undefined) { m.emissive.set(o.glow); m.userData.glow = true; }
    mats.set(key, m);
  }
  return m;
}
/** A signboard: the text drawn, lit from within after dark. */
function board(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void) {
  let m = mats.get("board:" + key);
  if (!m) {
    const t = tex(w, h, (g) => draw(g, w, h));
    m = new MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.1, roughness: 0.6 }); m.userData.sign = true;
    mats.set("board:" + key, m);
  }
  return m;
}
const box = (g: Group, w: number, h: number, d: number, m: Material, x: number, y: number, z: number, ry = 0) => {
  const o = new Mesh(new BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; g.add(o); return o;
};
const cyl = (g: Group, r: number, h: number, m: Material, x: number, y: number, z: number, seg = 10) => {
  const o = new Mesh(new CylinderGeometry(r, r, h, seg), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o;
};
/** A sign facing the road (its front toward −z). */
const sign = (g: Group, w: number, h: number, m: Material, x: number, y: number, z: number, ry = Math.PI) => {
  const o = new Mesh(new PlaneGeometry(w, h), m); o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o;
};
/** Paving from the road's edge back `d`, `w` along, with a skirt down to the ground so it never floats. */
function slab(g: Group, w: number, d: number, z0 = 0, colour = 0x6f6b64) {
  box(g, w, 0.5, d, M(colour, { rough: 0.95 }), 0, -0.25 + 0.006, z0 + d / 2);
}

/* ---- the places ---- */
function pump(st: Station) {
  const g = new Group(), w = BAY.size.w, red = M(0xc9252b, { rough: 0.5 }), white = M(0xf2f2ee, { rough: 0.5 });
  slab(g, w + 0.3, BAY.size.d + 0.1, 0.0, 0x77736b);
  // the canopy over the pumps, its fascia in the brand's red with the name, lit underneath at night
  const h = 0.55, z = 0.82;
  box(g, w, 0.05, 0.85, white, 0, h, z);
  const fascia = board("pump:" + st.name, 512, 48, (x, W, H) => {
    x.fillStyle = "#c9252b"; x.fillRect(0, 0, W, H); x.fillStyle = "#fff"; x.font = "800 30px Arial,sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(st.name.toUpperCase(), W / 2, H / 2 + 1);
  });
  sign(g, w, 0.07, fascia, 0, h + 0.005, z - 0.43);
  box(g, w, 0.07, 0.005, red, 0, h + 0.005, z + 0.43);
  const under = M(0xffffff, { glow: 0x5e5850 }); // (lit, not a floodlight: the bloom takes the rest) box(g, w * 0.9, 0.004, 0.7, under, 0, h - 0.027, z);
  for (const x of [-w * 0.32, w * 0.32]) cyl(g, 0.025, h, white, x, h / 2, z + 0.15, 8);
  // two dispensers on an island
  box(g, w * 0.7, 0.03, 0.1, M(0xd8d4c8), 0, 0.015, z + 0.15);
  for (const x of [-w * 0.18, w * 0.18]) {
    box(g, 0.07, 0.16, 0.05, white, x, 0.11, z + 0.15);
    box(g, 0.07, 0.04, 0.051, red, x, 0.17, z + 0.15);
    box(g, 0.035, 0.03, 0.052, M(0x182028, { glow: 0x2af0ff }), x, 0.12, z + 0.15);
  }
  // the kiosk behind and the price totem by the road
  box(g, 0.5, 0.3, 0.3, M(0xe8e4da), w * 0.3, 0.15, BAY.size.d - 0.05);
  box(g, 0.48, 0.1, 0.005, M(0x2c3a40, { glow: 0xffe9b0 }), w * 0.3, 0.17, BAY.size.d - 0.2);
  const totem = board("totem:" + st.name, 128, 320, (x, W, H) => {
    x.fillStyle = "#c9252b"; x.fillRect(0, 0, W, H); x.fillStyle = "#fff"; x.fillRect(8, 90, W - 16, H - 100);
    x.font = "800 44px Arial,sans-serif"; x.textAlign = "center"; x.fillText("⛽", W / 2, 60);
    x.fillStyle = "#1a1a1a"; x.font = "700 20px Arial,sans-serif";
    [["PETROL", "₹102"], ["DIESEL", "₹ 94"], ["NITRO", "₹ 50"]].forEach(([a, b], i) => { x.textAlign = "left"; x.fillText(a, 16, 130 + i * 64); x.textAlign = "right"; x.fillStyle = i === 2 ? "#c9252b" : "#1a1a1a"; x.fillText(b, W - 14, 160 + i * 64); x.fillStyle = "#1a1a1a"; });
  });
  const tx = -w / 2 - 0.05;
  box(g, 0.02, 0.2, 0.02, M(0x555555), tx, 0.1, 0.15);
  sign(g, 0.12, 0.3, totem, tx, 0.35, 0.15, -Math.PI / 2);
  sign(g, 0.12, 0.3, totem, tx, 0.35, 0.15, Math.PI / 2);
  return { g, lights: [{ x: 0, y: h - 0.03, z, color: new Color(0xfff4dc), power: 0.45 }] };
}

function wash(st: Station) {
  const g = new Group(), w = BAY.size.w, blue = M(0x2f6bff, { rough: 0.5 }), steel = M(0xb9bec4, { rough: 0.4, metal: 0.6 });
  slab(g, w + 0.2, BAY.size.d, 0, 0x6a7378);
  // the wash shed: an open bay under a blue roof, the hose stand, a wet floor
  const z = 0.85, h = 0.42;
  for (const x of [-w * 0.38, w * 0.38]) for (const zz of [z - 0.32, z + 0.32]) cyl(g, 0.02, h, steel, x, h / 2, zz, 8);
  box(g, w * 0.85, 0.03, 0.75, blue, 0, h, z);
  box(g, 0.18, 0.22, 0.12, M(0xe6e8ea), w * 0.25, 0.11, z + 0.38);
  cyl(g, 0.012, 0.25, M(0x1a1a1a), w * 0.25 - 0.08, 0.125, z + 0.3, 6);
  const wet = new Mesh(new PlaneGeometry(w * 0.7, 0.6), new MeshStandardMaterial({ color: 0x3a4148, roughness: 0.08, metalness: 0.3 }));
  wet.rotation.x = -Math.PI / 2; wet.position.set(0, 0.0075, z); g.add(wet);
  const b = board("wash", 512, 96, (x, W, H) => {
    x.fillStyle = "#0b2a6b"; x.fillRect(0, 0, W, H); x.fillStyle = "#2af0ff"; x.font = "800 40px Arial,sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("🚿 " + st.name.toUpperCase(), W / 2, H / 2 - 12); x.fillStyle = "#fff"; x.font = "600 22px Arial,sans-serif"; x.fillText("Wash · Polish · Dent fix  ₹40", W / 2, H / 2 + 26);
  });
  sign(g, w * 0.85, 0.16, b, 0, h + 0.1, z - 0.38);
  return { g, lights: [{ x: 0, y: h, z, color: NEON.cyan.clone(), power: 0.7 }] };
}

function paint(st: Station) {
  const g = new Group(), w = BAY.size.w;
  slab(g, w + 0.2, BAY.size.d, 0, 0x6b665f);
  // the garage: a workshop with its shutter up, a spray booth inside, colour swatches on the wall
  const z = 0.95, h = 0.4, wall = M(0xe9e4d8);
  box(g, w * 0.9, h, 0.02, wall, 0, h / 2, z + 0.3);
  for (const s of [-1, 1]) box(g, 0.02, h, 0.6, wall, s * w * 0.45, h / 2, z);
  box(g, w * 0.92, 0.03, 0.65, M(0x8a8f94, { metal: 0.4, rough: 0.5 }), 0, h + 0.015, z);
  box(g, 0.5, 0.3, 0.35, M(0xd6d9dc, { rough: 0.4 }), -w * 0.2, 0.15, z + 0.05);
  box(g, 0.48, 0.2, 0.005, M(0x223038, { glow: 0x5a6878 }), -w * 0.2, 0.18, z - 0.125); // (the booth's window, softly lit: white glared into a blob at night)
  const sw = board("swatches", 256, 128, (x) => { ["#ff2d95", "#2f6bff", "#a8ff3e", "#2af0ff", "#9a4dff", "#b3191f", "#141518", "#f1f1ec", "#2e6b3f"].forEach((c, i) => { x.fillStyle = c; x.fillRect(8 + (i % 5) * 50, 8 + Math.floor(i / 5) * 60, 42, 52); }); });
  sign(g, 0.3, 0.15, sw, w * 0.25, 0.2, z + 0.28);
  const b = board("paint", 512, 96, (x, W, H) => {
    const grad = x.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, "#ff2d95"); grad.addColorStop(0.5, "#9a4dff"); grad.addColorStop(1, "#2f6bff");
    x.fillStyle = grad; x.fillRect(0, 0, W, H); x.fillStyle = "#fff"; x.font = "800 40px Arial,sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("🎨 " + st.name.toUpperCase(), W / 2, H / 2 - 12); x.font = `600 22px ${ML}`; x.fillText("പെയിന്റിംഗ് · Painting ₹150", W / 2, H / 2 + 26);
  });
  sign(g, w * 0.9, 0.16, b, 0, h + 0.1, z - 0.31);
  return { g, lights: [{ x: 0, y: h, z: z - 0.3, color: NEON.pink.clone(), power: 0.7 }] };
}

/** The towns' bus stands' boards: Malayalam over English, and where the buses go. */
const STAND: Record<string, { ml: string; en: string; to: [string, string][] }> = {
  Kalpetta: { ml: "കൽപ്പറ്റ ബസ് സ്റ്റാൻഡ്", en: "KALPETTA BUS STAND", to: [["Kozhikode", "06:40"], ["Mananthavady", "07:15"], ["Bathery", "07:30"], ["Mysuru", "08:05"], ["Vythiri", "08:20"], ["Thamarassery", "08:45"]] },
  "Sulthan Bathery": { ml: "ബത്തേരി ബസ് സ്റ്റാൻഡ്", en: "SULTHAN BATHERY BUS STAND", to: [["Mysuru", "06:20"], ["Kalpetta", "06:50"], ["Pulpally", "07:10"], ["Gundlupet", "07:40"], ["Ooty", "08:00"], ["Kozhikode", "08:30"]] },
};
function busStand(C: Centre) {
  const g = new Group(), { w, d } = C.busStand, words = STAND[C.name] ?? STAND.Kalpetta, green = M(0x1f6b45, { rough: 0.6 }), steel = M(0x9aa1a7, { metal: 0.5, rough: 0.45 });
  slab(g, w + 0.3, d, 0, 0x5f5c57);
  // bay lines on the apron
  for (let i = -2; i <= 2; i++) box(g, 0.012, 0.002, 0.5, M(0xf2f0e6), i * 0.3, 0.008, 0.45);
  // the shelter at the back: a long roof on posts, benches, the board in Malayalam and English
  const z = d - 0.25, h = 0.32;
  box(g, w, 0.025, 0.36, green, 0, h, z);
  for (let x = -w / 2 + 0.08; x <= w / 2 - 0.07; x += 0.34) cyl(g, 0.012, h, steel, x, h / 2, z - 0.15, 6);
  box(g, w, h, 0.02, M(0xe8e2d2), 0, h / 2, z + 0.17);
  for (let x = -w / 2 + 0.2; x < w / 2 - 0.1; x += 0.36) { box(g, 0.24, 0.012, 0.06, steel, x, 0.045, z + 0.08); box(g, 0.24, 0.05, 0.01, steel, x, 0.07, z + 0.11); }
  const b = board(`busstand-${C.name}`, 1024, 128, (x, W, H) => {
    x.fillStyle = "#14532d"; x.fillRect(0, 0, W, H); x.strokeStyle = "#f6d34a"; x.lineWidth = 6; x.strokeRect(6, 6, W - 12, H - 12);
    x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `700 44px ${ML}`; x.fillText(words.ml, W / 2, 42, W - 30);
    x.font = "800 40px Arial,sans-serif"; x.fillStyle = "#f6d34a"; x.fillText(words.en, W / 2, 94, W - 30);
  });
  sign(g, w * 0.8, 0.1, b, 0, h + 0.075, z - 0.17);
  // the timetable board and a tea counter at one end
  const tt = board(`timetable-${C.name}`, 256, 256, (x, W, H) => {
    x.fillStyle = "#101820"; x.fillRect(0, 0, W, H); x.fillStyle = "#f6d34a"; x.font = "700 20px Arial,sans-serif"; x.textAlign = "left";
    x.fillText("DEPARTURES", 14, 30); x.fillStyle = "#e8f0f0"; x.font = "500 17px Arial,sans-serif";
    words.to.forEach(([a, b], i) => { x.textAlign = "left"; x.fillText(a, 14, 66 + i * 30); x.textAlign = "right"; x.fillText(b, W - 14, 66 + i * 30); });
  });
  sign(g, 0.16, 0.16, tt, w / 2 - 0.15, 0.17, z + 0.155);
  return { g, lights: [{ x: -w * 0.3, y: h, z, color: NEON.blue.clone(), power: 0.5 }, { x: w * 0.3, y: h, z, color: NEON.violet.clone(), power: 0.5 }] };
}

function shelter() {
  const g = new Group(), steel = M(0x9aa1a7, { metal: 0.5, rough: 0.45 });
  box(g, 0.5, 0.02, 0.18, M(0x1f6b45), 0, 0.28, 0.2);
  for (const x of [-0.22, 0.22]) cyl(g, 0.01, 0.28, steel, x, 0.14, 0.28, 6);
  box(g, 0.5, 0.26, 0.01, M(0xe8e2d2), 0, 0.13, 0.29);
  box(g, 0.36, 0.012, 0.05, steel, 0, 0.045, 0.25);
  const b = board("stop", 256, 64, (x, W, H) => { x.fillStyle = "#14532d"; x.fillRect(0, 0, W, H); x.fillStyle = "#fff"; x.font = `700 26px ${ML}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("ബസ് സ്റ്റോപ്പ് · BUS STOP", W / 2, H / 2); });
  sign(g, 0.36, 0.06, b, 0, 0.32, 0.11);
  return g;
}

function podium() {
  const g = new Group();
  cyl(g, 0.055, 0.04, M(0xf2f2ee), 0, 0.02, 0, 14);
  cyl(g, 0.057, 0.012, M(0xd22a2a), 0, 0.034, 0, 14);
  cyl(g, 0.004, 0.24, M(0x444444), 0.03, 0.14, 0, 6);
  // a striped umbrella, red and white
  const u = new Mesh(new ConeGeometry(0.1, 0.04, 8, 1, true), M(0xd22a2a, { rough: 0.7 })); u.position.set(0.03, 0.26, 0); g.add(u);
  const u2 = new Mesh(new ConeGeometry(0.1, 0.04, 8, 1, true), M(0xf2f2ee, { rough: 0.7 })); u2.position.set(0.03, 0.2605, 0); u2.rotation.y = Math.PI / 8; u2.scale.setScalar(0.995); g.add(u2);
  return g;
}

function cart(i: number) {
  const g = new Group(), wood = M(0x7a5232), tops = [0x2f6bff, 0xff2d95, 0x1f8a4c];
  box(g, 0.13, 0.05, 0.07, wood, 0, 0.07, 0);
  box(g, 0.12, 0.03, 0.06, M(i % 2 ? 0xd9a441 : 0xc84a2e), 0, 0.105, 0); // peanuts / fruit
  for (const x of [-0.04, 0.04]) { const wh = new Mesh(new CylinderGeometry(0.025, 0.025, 0.008, 12), M(0x2a2a2a)); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.025, 0.04); g.add(wh); }
  cyl(g, 0.003, 0.15, M(0x444444), 0, 0.17, -0.02, 5);
  const top = new Mesh(new ConeGeometry(0.09, 0.035, 8), M(tops[i % 3], { rough: 0.7 })); top.position.set(0, 0.26, -0.02); g.add(top);
  const lamp = new Mesh(new SphereGeometry(0.008, 8, 6), M(0xffffff, { glow: 0xffd27a })); lamp.position.set(0.04, 0.2, -0.02); g.add(lamp);
  return g;
}

/** The bay to pull into at a place: a glowing outline on the forecourt (it pulses when you're coming up to it). */
function bayMark(st: Station) {
  const g = new Group(), w = 1.0, d = 0.3, m = new MeshBasicMaterial({ color: st.kind === "pump" ? 0xffb347 : st.kind === "wash" ? NEON.cyan : NEON.pink, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  for (const [x, z, ww, dd] of [[0, -d / 2, w, 0.012], [0, d / 2, w, 0.012], [-w / 2, 0, 0.012, d], [w / 2, 0, 0.012, d]] as const) {
    const o = new Mesh(new PlaneGeometry(ww, dd), m); o.rotation.x = -Math.PI / 2; o.position.set(x, 0.01, z); g.add(o);
  }
  const icon = new Mesh(new PlaneGeometry(0.16, 0.16), new MeshBasicMaterial({ map: tex(128, 128, (x) => { x.font = "96px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(STATION_ICON[st.kind], 64, 70); }), transparent: true, depthWrite: false }));
  icon.rotation.x = -Math.PI / 2; icon.position.set(0, 0.011, 0); g.add(icon);
  return { g, m };
}

/* ---- Kalpetta's night market (lib/townLife MARKET) ---- */
const FOODS = [["ദോശ", "DOSA", 0xd9a441], ["പൊറോട്ട", "PAROTTA · BEEF", 0xc84a2e], ["കപ്പ", "KAPPA · MEEN", 0x2e8a57], ["ഓംലെറ്റ്", "OMELETTE", 0xe0b43a], ["ജ്യൂസ്", "FRESH JUICE", 0xff2d95], ["ബിരിയാണി", "BIRIYANI", 0x9a4dff], ["കുലുക്കി", "KULUKKI SARBATH", 0x2af0ff]] as const;
/** A food stall: a counter with its food, a striped awning on two poles, a lamp, its name on a board (front: −z). */
function stall(i: number) {
  const g = new Group(), [ml, en, c] = FOODS[i % FOODS.length], wood = M(0x6e4a2c);
  box(g, 0.22, 0.085, 0.1, wood, 0, 0.0425, 0);
  box(g, 0.2, 0.014, 0.08, M(c, { rough: 0.6 }), 0, 0.092, 0.005);
  for (const x of [-0.06, 0, 0.06]) cyl(g, 0.012, 0.02, M(0xb8b8b8, { metal: 0.6, rough: 0.35 }), x, 0.109, 0.02, 8); // pots
  for (const x of [-0.11, 0.11]) cyl(g, 0.004, 0.24, M(0x3c3c3c), x, 0.12, 0.045, 5);
  const awn = box(g, 0.27, 0.008, 0.17, M(i % 2 ? 0xc2185b : 0x1f6fd1, { rough: 0.7 }), 0, 0.235, -0.01); awn.rotation.x = -0.18;
  const b = board(`stall-${i % FOODS.length}`, 256, 72, (x, W, H) => { x.fillStyle = "#111"; x.fillRect(0, 0, W, H); x.fillStyle = `#${c.toString(16).padStart(6, "0")}`; x.textAlign = "center"; x.font = `700 26px ${ML}`; x.fillText(ml, W / 2, 30); x.font = "800 20px Arial,sans-serif"; x.fillText(en, W / 2, 60, W - 12); });
  sign(g, 0.2, 0.056, b, 0, 0.2, -0.065);
  const lamp = new Mesh(new SphereGeometry(0.009, 8, 6), M(0xffffff, { glow: 0xffc86a })); lamp.position.set(0, 0.215, -0.06); g.add(lamp);
  return { g, lights: [{ x: 0, y: 0.21, z: -0.06, color: new Color(0xffc86a), power: 0.3 }] };
}
/** The thattukada: a tea shop on a cart, its big kettle on the boil, jars of snacks, a bench for you. */
function thattukada() {
  const g = new Group(), wood = M(0x5b3a22);
  box(g, 0.32, 0.09, 0.11, wood, 0, 0.045, 0);
  box(g, 0.3, 0.008, 0.1, M(0x2b2b2b), 0, 0.094, 0);
  const kettle = cyl(g, 0.026, 0.05, M(0xc9c9c9, { metal: 0.8, rough: 0.25 }), -0.09, 0.123, 0.01, 14); kettle.castShadow = true;
  cyl(g, 0.006, 0.02, M(0xc9c9c9, { metal: 0.8, rough: 0.25 }), -0.09, 0.158, 0.01, 8);
  for (const [x, col] of [[0.0, 0xd9a441], [0.05, 0xc84a2e], [0.1, 0xe8d6a0]] as const) cyl(g, 0.016, 0.04, M(col, { rough: 0.2 }), x, 0.118, 0.02, 10); // pazham pori, vada, biscuits
  for (const x of [-0.15, 0.15]) cyl(g, 0.004, 0.26, M(0x3c3c3c), x, 0.13, 0.05, 5);
  const tarp = box(g, 0.36, 0.008, 0.2, M(0x1f8a4c, { rough: 0.75 }), 0, 0.255, -0.02); tarp.rotation.x = -0.15;
  const b = board("thattukada", 512, 110, (x, W, H) => { x.fillStyle = "#1f8a4c"; x.fillRect(0, 0, W, H); x.fillStyle = "#fff"; x.textAlign = "center"; x.font = `700 40px ${ML}`; x.fillText("ചായക്കട", W / 2, 46); x.font = "800 30px Arial,sans-serif"; x.fillText(`☕ THATTUKADA · CHAYA + PORI ₹${MARKET.chaya.price}`, W / 2, 92, W - 20); });
  sign(g, 0.3, 0.064, b, 0, 0.215, -0.08);
  box(g, 0.2, 0.012, 0.035, wood, 0, 0.045, -0.13); // the bench
  for (const x of [-0.08, 0.08]) box(g, 0.012, 0.04, 0.03, wood, x, 0.02, -0.13);
  const lamp = new Mesh(new SphereGeometry(0.01, 8, 6), M(0xffffff, { glow: 0xffd27a })); lamp.position.set(0.06, 0.23, -0.07); g.add(lamp);
  return { g, lights: [{ x: 0.06, y: 0.23, z: -0.07, color: new Color(0xffd27a), power: 0.45 }] };
}

/* ---- the signal and the crossing ---- */
const LIGHT = { red: new Color(0xff2a2a), amber: new Color(0xffb020), green: new Color(0x2aff7a) };
function signalHead() {
  const g = new Group(), body = M(0x1c1c1c, { rough: 0.6 });
  box(g, 0.012, 0.42, 0.012, M(0x3c3c3c), 0, 0.21, 0);
  box(g, 0.05, 0.14, 0.04, body, 0, 0.47, 0);
  const lamps = (["red", "amber", "green"] as const).map((k, i) => {
    const m = new MeshBasicMaterial({ color: LIGHT[k].clone().multiplyScalar(0.12) });
    const o = new Mesh(new CylinderGeometry(0.016, 0.016, 0.006, 12), m); o.rotation.x = Math.PI / 2; o.position.set(0, 0.515 - i * 0.045, -0.022); g.add(o);
    return { k, m };
  });
  // the walking man for the people, on the pole below
  const walk = new MeshBasicMaterial({ color: 0x2aff7a });
  const w = new Mesh(new PlaneGeometry(0.03, 0.03), walk); w.position.set(0, 0.33, -0.007); w.rotation.y = Math.PI; g.add(w);
  return { g, lamps, walk };
}

type Spot = { id: PersonId; pos: Vector3; yaw: number; move: Move; cross?: { a: Vector3; b: Vector3; delay: number }; small?: boolean; night?: boolean };
const NEAR = { load: 70, show: 32, move: 24 };

export default function TownLife({ curve, small }: { curve: CatmullRomCurve3; small: boolean }) {
  const built = useMemo(() => {
    const root = new Group(); root.name = "town-life";
    const lights: { x: number; y: number; z: number; color: Color; power: number }[] = [];
    const L = curve.getLength(), spots: Spot[] = [];
    const road = roadOf(curve), C = centreOf(road);
    if (C.busStand.s > L - 2) return { root, lights, heads: [], bays: [], spots, parked: [] as { kind: string; pos: Vector3; yaw: number }[], market: null as Group | null, stallBay: null as MeshBasicMaterial | null, road };
    /** Put `g` at s on `side`, `off` from the centre line (its +z away from the road); returns the frame. */
    const put = (g: Group, s: number, side: 1 | -1, off = EDGE) => {
      const f = frameAt(curve, s), out = f.left.clone().multiplyScalar(side);
      const at = f.p.clone().addScaledVector(out, off);
      g.position.copy(at); g.rotation.y = Math.atan2(out.x, out.z); g.updateMatrixWorld(true);
      return { ...f, out, at };
    };
    const local = (g: Group, x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(g.matrixWorld);
    const keepLights = (g: Group, list: { x: number; y: number; z: number; color: Color; power: number }[]) => {
      for (const l of list) { const w = local(g, l.x, l.y, l.z); lights.push({ x: w.x, y: w.y, z: w.z, color: l.color, power: l.power }); }
    };
    // the places you pull into
    const bays: { st: Station; m: MeshBasicMaterial }[] = [];
    for (const st of stationsOn(road)) {
      if (st.s > L - 2) continue;
      const made = st.kind === "pump" ? pump(st) : st.kind === "wash" ? wash(st) : paint(st);
      const holder = new Group(); put(holder, st.s, st.side); const baked = bake(made.g); holder.add(baked); holder.updateMatrixWorld(true);
      keepLights(holder, made.lights); root.add(holder);
      const mark = bayMark(st), mh = new Group(); put(mh, st.s, st.side, 0.55); mh.add(mark.g); root.add(mh);
      bays.push({ st, m: mark.m });
      // someone to serve you
      const who: PersonId = st.kind === "pump" ? "mechanic" : st.kind === "wash" ? "lungi" : "mechanic";
      spots.push({ id: who, pos: local(holder, -0.15, 0, 0.55), yaw: holder.rotation.y + Math.PI, move: "idle", small: true });
    }
    // Kalpetta's bus stand, the shelter across, the auto stand, the podium, the carts
    const K = C;
    const stand = new Group(); put(stand, K.busStand.s, 1); const made = busStand(C); stand.add(bake(made.g)); stand.updateMatrixWorld(true); keepLights(stand, made.lights); root.add(stand);
    const parked: { kind: string; pos: Vector3; yaw: number }[] = [];
    for (const [x, kind] of [[-0.42, "ksrtc-real"], [0.35, "privatebus-real"]] as const) {
      parked.push({ kind, pos: local(stand, x, 0.006, 0.55), yaw: stand.rotation.y + Math.PI / 2 + 0.35 });
    }
    const waiting: [PersonId, number, number, Move][] = [["conductor", -0.5, 0.95, "talk"], ["student", -0.2, 0.9, "phone"], ["school", 0.0, 0.95, "idle"], ["saree", 0.18, 0.92, "chat"],
      ["granny", 0.33, 1.02, "sitdrink"], ["uncle", 0.55, 0.93, "drink"], ["collegegirl", -0.35, 1.02, "sitdrink"], ["picker", 0.65, 0.88, "gaze"]];
    waiting.forEach(([id, x, z, move], i) => spots.push({ id, pos: local(stand, x, 0.006, z), yaw: stand.rotation.y + Math.PI + (x * 0.8), move, small: i % 3 === 0 }));
    const sh = new Group(); put(sh, K.shelter.s, -1); sh.add(bake(shelter())); root.add(sh); sh.updateMatrixWorld(true);
    spots.push({ id: "kurti", pos: local(sh, -0.1, 0.006, 0.18), yaw: sh.rotation.y + Math.PI, move: "phone" });
    spots.push({ id: "dad", pos: local(sh, 0.12, 0.006, 0.2), yaw: sh.rotation.y + Math.PI - 0.3, move: "idle" });
    const autos = new Group(); put(autos, K.autoStand.s, -1); autos.updateMatrixWorld(true);
    for (const x of [-0.25, 0.0, 0.25]) parked.push({ kind: "auto-real", pos: local(autos, x, 0.004, 0.25), yaw: autos.rotation.y + Math.PI + 0.5 });
    slab(autos, 0.9, 0.5, 0, 0x5f5c57); autos.children.forEach((c) => c.updateMatrixWorld(true)); root.add(autos);
    spots.push({ id: "auto", pos: local(autos, 0.38, 0.006, 0.18), yaw: autos.rotation.y + Math.PI, move: "talk" });
    spots.push({ id: "auto", pos: local(autos, -0.4, 0.006, 0.22), yaw: autos.rotation.y + Math.PI + 0.6, move: "drink" });
    const pod = new Group(); put(pod, K.police.s, -1, SECTION.half + 0.12); pod.add(bake(podium())); root.add(pod); pod.updateMatrixWorld(true);
    spots.push({ id: "guard", pos: local(pod, 0, 0.04, 0), yaw: pod.rotation.y + Math.PI + 0.6, move: "talk", small: true });
    K.carts.forEach((c, i) => {
      const cg = new Group(); put(cg, c.s, c.side, SECTION.half + 0.2); cg.add(bake(cart(i))); root.add(cg); cg.updateMatrixWorld(true);
      spots.push({ id: i % 2 ? "chaiman" : "lungi", pos: local(cg, 0.1, 0.006, 0.05), yaw: cg.rotation.y + Math.PI - 0.5, move: "idle" });
      const l = local(cg, 0.04, 0.2, -0.02); lights.push({ x: l.x, y: l.y, z: l.z, color: new Color(0xffd27a), power: 0.35 });
    });

    // the crossing: zebra stripes, stop lines, the signals (one for each way), people crossing on red
    const f = frameAt(curve, K.signal), yaw = Math.atan2(f.along.x, f.along.z), paintM = new MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    const decal = (along: number, lat: number, la: number, ll: number) => {
      const p = f.p.clone().addScaledVector(f.along, along).addScaledVector(f.left, lat);
      // (flat, its width across the road and its height along it)
      const o = new Mesh(new PlaneGeometry(ll, la), paintM); o.rotation.set(-Math.PI / 2, yaw, 0, "YXZ"); o.position.set(p.x, p.y + 0.004, p.z);
      o.receiveShadow = true; root.add(o);
    };
    for (let lat = -0.36; lat <= 0.361; lat += 0.09) decal(0, lat, 0.28, 0.05);
    decal(-0.4, 0.2, 0.025, 0.38); decal(0.4, -0.2, 0.025, 0.38);
    const heads: ReturnType<typeof signalHead>[] = [];
    for (const side of [1, -1] as const) {
      const h = signalHead(), at = f.p.clone().addScaledVector(f.along, -side * 0.45).addScaledVector(f.left, side * (SECTION.half + 0.12));
      h.g.position.copy(at); h.g.rotation.y = side === 1 ? yaw : yaw + Math.PI; root.add(h.g); heads.push(h);
      h.g.updateMatrixWorld(true);
      for (const l of h.lamps) { const w = new Vector3(0, 0.515 - ["red", "amber", "green"].indexOf(l.k) * 0.045, -0.03).applyMatrix4(h.g.matrixWorld); lights.push({ x: w.x, y: w.y, z: w.z, color: LIGHT[l.k], power: 0 }); }
    }
    const crossers: PersonId[] = ["collegeboy", "mum", "student", "rider"];
    crossers.forEach((id, i) => {
      const along = -0.08 + i * 0.055, from = i % 2 ? -1 : 1;
      const a = f.p.clone().addScaledVector(f.along, along).addScaledVector(f.left, from * 0.56);
      const b = f.p.clone().addScaledVector(f.along, along).addScaledVector(f.left, -from * 0.56);
      a.y = height(a.x, a.z); b.y = height(b.x, b.z);
      spots.push({ id, pos: a.clone(), yaw: 0, move: "idle", cross: { a, b, delay: i * 0.6 }, small: i < 2 });
    });
    // the bazaar street (lib/streets): people on its footpaths, shopping and chatting, and two carts
    const ppl: [PersonId, Move][] = [["saree", "chat"], ["kurti", "phone"], ["uncle", "talk"], ["collegeboy", "drink"], ["granny", "idle"], ["student", "chat"], ["mum", "gaze"], ["lungi", "talk"]];
    for (const st of streets(curve)) {
      let k = 0;
      for (let s = 6; s < st.length - 6; s += 4.2, k++) {
        if (st.id === MARKET.street && s > MARKET.from - 1.5 && s < MARKET.to + 1.5) continue; // (the market's own, below)
        const t = s / st.length, p = st.curve.getPointAt(t), tan = st.curve.getTangentAt(t).setY(0).normalize(), side = k % 2 ? 1 : -1;
        const left = new Vector3(tan.z, 0, -tan.x), at = p.clone().addScaledVector(left, side * (STREET.path - 0.02)); at.y = p.y - 0.588 + 0.016;
        const [id, move] = ppl[k % ppl.length];
        spots.push({ id, pos: at, yaw: Math.atan2(-left.x * side, -left.z * side) + (k % 3 - 1) * 0.6, move, small: k % 2 === 0 });
        if (k % 4 === 1) {
          const cg = new Group(), c2 = p.clone().addScaledVector(left, side * (STREET.path - 0.1)); cg.position.set(c2.x, p.y - 0.588 + 0.016, c2.z);
          cg.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2 * side; cg.add(bake(cart(k))); root.add(cg); cg.updateMatrixWorld(true);
          const l = local(cg, 0.04, 0.2, -0.02); lights.push({ x: l.x, y: l.y, z: l.z, color: new Color(0xffd27a), power: 0.35 });
        }
      }
    }
    // the night market: stalls on both footpaths and lights strung across, after dark; the thattukada day and night
    const market = new Group(); market.name = "night-market"; root.add(market);
    let stallBay: MeshBasicMaterial | null = null;
    const mst = streets(curve).find((st) => st.id === MARKET.street);
    if (mst) {
      const frame = (s: number) => { const t = Math.min(1, s / mst.length), p = mst.curve.getPointAt(t), tan = mst.curve.getTangentAt(t).setY(0).normalize(); return { p, tan, left: new Vector3(tan.z, 0, -tan.x), y: p.y - 0.588 + 0.016 }; };
      const place = (g: Group, s: number, side: 1 | -1, off: number, parent: Group) => {
        const f = frame(s), out = f.left.clone().multiplyScalar(side), at = f.p.clone().addScaledVector(out, off);
        g.position.set(at.x, f.y, at.z); g.rotation.y = Math.atan2(out.x, out.z); parent.add(g); g.updateMatrixWorld(true); return f;
      };
      const C = MARKET.chaya, sellers: PersonId[] = ["uncle", "lungi", "mechanic", "granny", "mum"];
      const buyers: [PersonId, Move][] = [["collegeboy", "chat"], ["kurti", "phone"], ["student", "talk"], ["saree", "gaze"], ["rider", "drink"]];
      let n = 0;
      for (const side of [1, -1] as const) for (let s = MARKET.from; s <= MARKET.to; s += 2.6, n++) {
        if (side === C.side && Math.abs(s - C.s) < 2) continue; // (the thattukada's place)
        const made = stall(n), h = new Group(); place(h, s, side, STREET.half + 0.1, market); h.add(bake(made.g)); h.updateMatrixWorld(true);
        for (const l of made.lights) { const w = local(h, l.x, l.y, l.z); lights.push({ x: w.x, y: w.y, z: w.z, color: l.color, power: 0 }); }
        spots.push({ id: sellers[n % sellers.length], pos: local(h, 0, 0, 0.09), yaw: h.rotation.y + Math.PI, move: "idle", small: n % 3 === 0, night: true });
        if (n % 2 === 0) { const [id, move] = buyers[n % buyers.length]; spots.push({ id, pos: local(h, 0.04, 0, -0.1), yaw: h.rotation.y, move, small: false, night: true }); }
      }
      // lights strung across the street, sagging between poles
      const bulbs = new Map<number, BufferGeometry[]>(), cols = [0xffd27a, 0xff2d95, 0x2af0ff, 0xa8ff3e];
      for (let s = MARKET.from - 0.5, r = 0; s <= MARKET.to + 0.5; s += 3, r++) {
        const f = frame(s), a = f.p.clone().addScaledVector(f.left, STREET.path - 0.03), b = f.p.clone().addScaledVector(f.left, -(STREET.path - 0.03));
        for (const e of [a, b]) { const pole = new Mesh(new CylinderGeometry(0.004, 0.004, 0.46, 5), M(0x3c3c3c)); pole.position.set(e.x, f.y + 0.23, e.z); market.add(pole); }
        for (let j = 0; j <= 12; j++) {
          const u = j / 12, x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u, y = f.y + 0.45 - 0.07 * Math.sin(Math.PI * u), c = cols[(j + r) % cols.length];
          (bulbs.get(c) ?? bulbs.set(c, []).get(c)!).push(new SphereGeometry(0.0065, 6, 4).translate(x, y, z));
        }
      }
      for (const [c, gs] of bulbs) market.add(new Mesh(mergeGeometries(gs), M(0x222222, { glow: c })));
      // the thattukada (open day and night), its people, and the place to pull up beside it
      const tk = thattukada(), th = new Group(); place(th, C.s, C.side, STREET.half + 0.1, root); th.add(bake(tk.g)); th.updateMatrixWorld(true);
      for (const l of tk.lights) { const w = local(th, l.x, l.y, l.z); lights.push({ x: w.x, y: w.y, z: w.z, color: l.color, power: l.power }); }
      spots.push({ id: "uncle", pos: local(th, 0.03, 0, 0.1), yaw: th.rotation.y + Math.PI, move: "idle", small: true });
      spots.push({ id: "lungi", pos: local(th, -0.05, 0, -0.13), yaw: th.rotation.y, move: "sitdrink", small: true });
      spots.push({ id: "collegeboy", pos: local(th, 0.1, 0, -0.16), yaw: th.rotation.y - 0.4, move: "drink", small: false });
      const mk = new Group(), m = new MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
      const w = 0.6, d = 0.26;
      for (const [x, z, ww, dd] of [[0, -d / 2, w, 0.012], [0, d / 2, w, 0.012], [-w / 2, 0, 0.012, d], [w / 2, 0, 0.012, d]] as const) { const o = new Mesh(new PlaneGeometry(ww, dd), m); o.rotation.x = -Math.PI / 2; o.position.set(x, 0, z); mk.add(o); }
      const icon = new Mesh(new PlaneGeometry(0.14, 0.14), new MeshBasicMaterial({ map: tex(128, 128, (x) => { x.font = "96px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("☕", 64, 70); }), transparent: true, depthWrite: false }));
      icon.rotation.x = -Math.PI / 2; icon.position.y = 0.001; mk.add(icon);
      const f = frame(C.s), at = f.p.clone().addScaledVector(f.left, C.side * 0.12);
      mk.position.set(at.x, f.y - 0.016 + 0.005, at.z); mk.rotation.y = Math.atan2(f.left.x, f.left.z) + Math.PI / 2; root.add(mk);
      stallBay = m;
    }
    return { root, lights, heads, bays, spots, parked, market, stallBay, road };
  }, [curve]);

  useEffect(() => { const key = `town-life-${built.road}`; setLights(key, built.lights); return () => setLights(key, []); }, [built]);

  // the parked buses and autos (the traffic's own models, sized as the traffic sizes them)
  useEffect(() => {
    let gone = false; const held: Group[] = [];
    for (const p of built.parked) {
      const spec = VEHICLES.find((v) => v.name === p.kind);
      if (!spec) continue;
      void loadVehicle(`/models/traffic/${p.kind}.glb`, { merged: true }).then((src) => {
        if (gone || !src) return;
        const model = src.clone(true), wrap = new Group();
        model.updateMatrixWorld(true);
        const bb = new Box3().setFromObject(model), size = bb.getSize(new Vector3()), c = bb.getCenter(new Vector3());
        model.scale.set(spec.width / size.x, spec.height / size.y, spec.length / size.z);
        model.position.set(-c.x * spec.width / size.x, -bb.min.y * spec.height / size.y, -c.z * spec.length / size.z);
        wrap.add(model); wrap.position.copy(p.pos); wrap.rotation.y = p.yaw; built.root.add(wrap); held.push(wrap);
      }, () => {});
    }
    return () => { gone = true; held.forEach((h) => h.removeFromParent()); };
  }, [built]);

  // the people (as StopCrowds: real people, loaded as you come near, made one a frame)
  const crowd = useRef({ round: 0, last: "green" as string, group: new Group(), ready: new Map<string, Awaited<ReturnType<typeof loadCast>>>(), asked: new Set<string>(), go: false, actors: new Map<Spot, Actor>(), was: new Map<Spot, Move>() });
  useEffect(() => {
    const S = crowd.current; S.group.name = "town-crowd"; let gone = false;
    void whenReady().then(() => { if (!gone) S.go = true; });
    return () => { gone = true; for (const a of S.actors.values()) a.mixer.stopAllAction(); S.actors.clear(); S.group.clear(); };
  }, [built]);

  useFrame(({ camera, clock }, dt) => {
    if (built.road === legRoad()) stepTown(dt); // (once a frame: the TownLife on the road you're driving)
    // the signal
    const light = town.light, blink = clock.elapsedTime % 1 < 0.5;
    for (const h of built.heads) for (const l of h.lamps) l.m.color.copy(LIGHT[l.k]).multiplyScalar(l.k === light ? 1.5 : 0.12);
    for (const h of built.heads) h.walk.color.set(light === "red" ? 0x2aff7a : blink ? 0x551010 : 0xff2a2a);
    for (const l of built.lights) { const k = (Object.keys(LIGHT) as (keyof typeof LIGHT)[]).find((n) => LIGHT[n] === l.color); if (k) l.power = k === light ? 0.9 : 0; }
    // after dark the signs and lamps; the bays pulse when you're coming up to one
    const glow = 0.1 + duskness() * 0.8 + nightness() * 1.6;
    for (const m of mats.values()) { if (m.userData.glow) m.emissiveIntensity = glow; else if (m.userData.sign) m.emissiveIntensity = 0.05 + (duskness() * 0.35 + nightness() * 0.7); }
    const beat = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 5);
    for (const b of built.bays) b.m.opacity = town.near === b.st ? 0.45 + 0.5 * beat : 0.3;
    const open = nightness() + duskness() * 0.6 > 0.3; // (the market's out after dark)
    if (built.market) built.market.visible = open;
    if (built.stallBay) built.stallBay.opacity = game.street >= 0 && Math.abs(onSt.s - MARKET.chaya.s) < 8 && !town.stallUsed ? 0.45 + 0.5 * beat : 0.3;
    // the people
    const S = crowd.current; if (!S.go) return;
    let made = false;
    const redT = town.t - 19; // (CYCLE: 16 s green, 3 amber, then red)
    if (light === "red" && S.last !== "red") S.round++;
    S.last = light;
    for (const sp of built.spots) {
      const d = sp.pos.distanceTo(camera.position);
      const key = `${sp.id}:lo`;
      if (d < NEAR.load && !S.asked.has(key)) { S.asked.add(key); loadCast(sp.id, true).then((v) => S.ready.set(key, v), () => {}); }
      const wanted = d < NEAR.show && (!small || !!sp.small || quality.people >= 0.6) && (!sp.night || open); // (phones: the few marked `small`; the market's people after dark)
      let a = S.actors.get(sp);
      if (wanted && !a && !made) {
        const src = S.ready.get(key);
        if (src) {
          a = makeActor(sp.id, src[0], src[1], personHeight(sp.id) / 10); made = true;
          a.root.position.copy(sp.pos); a.root.rotation.y = sp.yaw; a.play(sp.move, 0); a.mixer.setTime((sp.pos.x * 7.3) % 5);
          S.group.add(a.root); S.actors.set(sp, a); S.was.set(sp, sp.move);
        }
      }
      if (!a) continue;
      a.root.visible = wanted;
      if (sp.cross) {
        // across on red, one way and then back the next time
        // across on red (this round's way: A → B on odd rounds), then waiting on the far side to come back the next time
        const { a: A, b: B, delay } = sp.cross, odd = S.round % 2 === 1, from = odd ? A : B, to = odd ? B : A;
        const u = light === "red" ? Math.min(1, Math.max(0, (redT - delay) / (9 - 2.2))) : 1;
        a.root.position.copy(from).lerp(to, u);
        const moving = light === "red" && u > 0 && u < 1, move: Move = moving ? "walk" : "idle";
        // facing the way across while it's red, back the way they came while they wait (turning, not snapped round)
        const face = light === "red" ? Math.atan2(to.x - from.x, to.z - from.z) : Math.atan2(from.x - to.x, from.z - to.z);
        a.root.rotation.y += Math.atan2(Math.sin(face - a.root.rotation.y), Math.cos(face - a.root.rotation.y)) * Math.min(1, dt * 4);
        const act = a.play(move, 0.25); S.was.set(sp, move);
        if (act && moving) act.timeScale = Math.min(1.8, from.distanceTo(to) / (9 - 2.2) / a.pace("walk")); else if (act) act.timeScale = 1;
      }
      if (wanted && d < NEAR.move) { a.mixer.update(dt); settleHands(a); }
    }
  });
  return <><primitive object={built.root} /><primitive object={crowd.current.group} /></>;
}
