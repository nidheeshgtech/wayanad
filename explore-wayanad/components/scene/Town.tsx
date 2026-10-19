"use client";
import { useMemo } from "react";
import {
  BoxGeometry, BufferGeometry, CanvasTexture, CatmullRomCurve3, ConeGeometry, Float32BufferAttribute, Group, LineBasicMaterial,
  LineSegments, Mesh, MeshStandardMaterial, SRGBColorSpace, Vector3,
} from "three";
import { SECTION, archT, height } from "@/lib/terrain";

/* Lakkidi after the gateway: a strip of shops and houses on both sides, as in photographs of the place — one- and
 * two-storey concrete buildings in Kerala's pastel paints, tiled hip roofs or flat roofs with parapets, shop fronts with
 * rolling shutters or open counters under painted signboards, and a line of electric poles with sagging wires.
 * Generated, not mapped: the buildings are typical, not surveyed. Scene units (1 = 10 m). */
const START = 0.25, END_MARGIN = 0.5; // units after the gate before the first building; kept clear of the road's end
const SETBACK: [number, number] = [SECTION.half + 0.3, SECTION.half + 0.55]; // building front from the centre line: a 3–5 m forecourt
const FLOOR = 0.32; // 3.2 m storeys
const WALLS = ["#efe6c8", "#e8d48a", "#bfe0c4", "#a9cfe0", "#f2f0ea", "#e9c3b5", "#d9e8a0", "#f0d9a8", "#c9c3e3"];
const BOARDS = [["#c62828", "#fff"], ["#1565c0", "#fff"], ["#2e7d32", "#fff"], ["#f9a825", "#222"], ["#6a1b9a", "#fff"], ["#ffffff", "#c62828"]];
const SHOPS = ["TEA STALL", "BAKERY", "STORES", "HOTEL", "TEXTILES", "MEDICALS", "HARDWARE", "FANCY", "MOBILES", "FRUITS", "SPICES", "HOME STAY", "TAILORS", "VEGETABLES"];

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The road-facing wall: shop front (shutters or an open counter) under a signboard, windows above, grime at the foot. */
function facade(r: () => number, wall: string, floors: number, shop: boolean) {
  const W = 256, H = 128 * floors, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = wall; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, H - 40, 0, H); g.addColorStop(0, "rgba(60,50,40,0)"); g.addColorStop(1, "rgba(60,50,40,0.35)");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const ground = H - 128;
  if (shop) {
    const [bg, fg] = BOARDS[Math.floor(r() * BOARDS.length)];
    x.fillStyle = bg; x.fillRect(10, ground + 8, W - 20, 26);
    x.fillStyle = fg; x.font = "700 18px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(SHOPS[Math.floor(r() * SHOPS.length)], W / 2, ground + 22);
    const bays = 2 + Math.floor(r() * 2), bw = (W - 20) / bays;
    for (let b = 0; b < bays; b++) {
      const bx = 10 + b * bw + 4, by = ground + 40, w = bw - 8, h = 84;
      if (r() < 0.5) { // rolling shutter
        x.fillStyle = "#8d9093"; x.fillRect(bx, by, w, h);
        x.fillStyle = "rgba(0,0,0,0.18)"; for (let y = by; y < by + h; y += 5) x.fillRect(bx, y, w, 1.5);
      } else { // open counter: dark interior, goods on shelves
        x.fillStyle = "#2a2622"; x.fillRect(bx, by, w, h);
        for (let k = 0; k < 14; k++) { x.fillStyle = `hsl(${Math.floor(r() * 360)},55%,${40 + r() * 25}%)`; x.fillRect(bx + 4 + r() * (w - 14), by + 8 + Math.floor(r() * 3) * 24, 6 + r() * 8, 10); }
      }
    }
  } else { // house: door and a window
    x.fillStyle = "#6b4a2f"; x.fillRect(W * 0.18, ground + 40, 36, 86);
    x.fillStyle = "#2c3a40"; x.fillRect(W * 0.55, ground + 46, 70, 44);
    x.strokeStyle = "#f6f4ee"; x.lineWidth = 4; x.strokeRect(W * 0.55, ground + 46, 70, 44);
  }
  for (let f = 0; f < floors - 1; f++) { // upper floors: windows with frames, a sunshade above
    const y = f * 128;
    for (const wx of [30, 150]) {
      x.fillStyle = "#33424a"; x.fillRect(wx, y + 38, 76, 50);
      x.strokeStyle = "#f4f2ec"; x.lineWidth = 4; x.strokeRect(wx, y + 38, 76, 50);
      x.fillStyle = "rgba(0,0,0,0.25)"; x.fillRect(wx - 6, y + 30, 88, 6);
    }
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t;
}

function building(r: () => number, width: number) {
  const g = new Group(), floors = r() < 0.6 ? 1 : 2, depth = 0.7 + r() * 0.35, h = floors * FLOOR, below = 1.5;
  const wall = WALLS[Math.floor(r() * WALLS.length)], shop = r() < 0.75;
  const plain = new MeshStandardMaterial({ color: wall, roughness: 0.92 });
  const front = new MeshStandardMaterial({ map: facade(r, wall, floors, shop), roughness: 0.85 });
  // box faces: +x, -x, +y, -y, +z (front, toward the road), -z; runs `below` into the ground for slopes
  const body = new Mesh(new BoxGeometry(width, h + below, depth), [plain, plain, plain, plain, front, plain]);
  body.position.set(0, (h - below) / 2, -depth / 2);
  // the facade texture covers only the part above ground
  front.map!.repeat.set(1, (h + below) / h); front.map!.offset.set(0, -below / h);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  if (r() < 0.55) { // tiled hip roof with eaves
    const geo = new ConeGeometry(Math.SQRT1_2, 1, 4); geo.rotateY(Math.PI / 4); geo.translate(0, 0.5, 0);
    const roof = new Mesh(geo, new MeshStandardMaterial({ color: r() < 0.7 ? 0xb5563a : 0x8a3f2c, roughness: 0.8 }));
    roof.scale.set(width * 1.12, 0.13 + r() * 0.06, depth * 1.15); roof.position.set(0, h, -depth / 2);
    roof.castShadow = true; g.add(roof);
  } else { // flat concrete roof: parapet, and now and then a blue sheet over it
    const parapet = new Mesh(new BoxGeometry(width, 0.08, depth), new MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.95 }));
    parapet.position.set(0, h + 0.04, -depth / 2); g.add(parapet);
    if (r() < 0.35) {
      const sheet = new Mesh(new BoxGeometry(width * 0.7, 0.01, depth * 0.7), new MeshStandardMaterial({ color: 0x2f6fb5, roughness: 0.6 }));
      sheet.position.set(0, h + 0.12, -depth / 2); sheet.rotation.z = 0.08; g.add(sheet);
    }
  }
  if (shop && r() < 0.5) { // a sunshade over the shop front
    const shade = new Mesh(new BoxGeometry(width * 0.95, 0.012, 0.16), new MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.8 }));
    shade.position.set(0, 0.24, 0.08); shade.rotation.x = 0.18; shade.castShadow = true; g.add(shade);
  }
  return g;
}

/** Distance from the road's centre line kept for the buildings: trees and rocks stay behind them (Vegetation, Props). */
export const TOWN_CLEAR = 2.3;

export default function Town({ curve }: { curve: CatmullRomCurve3 }) {
  const group = useMemo(() => {
    const g = new Group(), L = curve.getLength(), r = rng(1966), gate = archT() * L, up = new Vector3(0, 1, 0);
    const frame = (s: number) => {
      const t = Math.min(0.999, s / L), p = curve.getPointAt(t), tan = curve.getTangentAt(t).setY(0).normalize();
      return { p, tan, left: new Vector3().crossVectors(up, tan).normalize() }; // driver's left
    };
    for (const side of [1, -1]) {
      for (let s = gate + START; s < L - END_MARGIN;) {
        const width = 0.6 + r() * 0.5;
        if (r() < 0.18) { s += width; continue; } // an empty plot
        const { p, left } = frame(s + width / 2), off = SETBACK[0] + (SETBACK[1] - SETBACK[0]) * r();
        const at = p.clone().addScaledVector(left, side * off), b = building(r, width);
        b.position.set(at.x, Math.min(height(at.x, at.z), p.y - 0.6), at.z); // never floating: the body runs on down
        // front (+z) toward the road
        const facing = left.clone().multiplyScalar(-side);
        b.rotation.y = Math.atan2(facing.x, facing.z);
        g.add(b);
        s += width + 0.05 + r() * 0.4;
      }
    }
    // electric poles on the left with three sagging wires
    const poleMat = new MeshStandardMaterial({ color: 0x9a9890, roughness: 0.9 }), tops: Vector3[][] = [];
    for (let s = gate - 1; s < L - END_MARGIN; s += 3.5) {
      const { p, tan, left } = frame(s), at = p.clone().addScaledVector(left, SECTION.half + 0.22), y = height(at.x, at.z);
      const pole = new Mesh(new BoxGeometry(0.02, 0.9, 0.02), poleMat); pole.position.set(at.x, y + 0.45, at.z); pole.castShadow = true; g.add(pole);
      const arm = new Mesh(new BoxGeometry(0.12, 0.012, 0.012), poleMat); arm.position.set(at.x, y + 0.85, at.z); arm.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2; g.add(arm);
      tops.push([-0.05, 0, 0.05].map((k) => at.clone().addScaledVector(left, k).setY(y + 0.86)));
    }
    const wires: number[] = [];
    for (let i = 1; i < tops.length; i++) for (let w = 0; w < 3; w++) {
      const a = tops[i - 1][w], b = tops[i][w];
      for (let k = 0; k < 8; k++) {
        const u0 = k / 8, u1 = (k + 1) / 8, sag = (u: number) => 0.06 * 4 * u * (1 - u);
        wires.push(a.x + (b.x - a.x) * u0, a.y + (b.y - a.y) * u0 - sag(u0), a.z + (b.z - a.z) * u0, a.x + (b.x - a.x) * u1, a.y + (b.y - a.y) * u1 - sag(u1), a.z + (b.z - a.z) * u1);
      }
    }
    const wg = new BufferGeometry(); wg.setAttribute("position", new Float32BufferAttribute(wires, 3));
    g.add(new LineSegments(wg, new LineBasicMaterial({ color: 0x2a2a2a })));
    g.name = "town";
    return g;
  }, [curve]);
  return <primitive object={group} />;
}
