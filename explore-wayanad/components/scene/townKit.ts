/**
 * Drawing the towns' lots (components/scene/realTowns) as a few merged meshes per town: one texture sheet holds every
 * shop front, window row, side wall and door (painted once on a canvas), so all the walls of a town are one draw call;
 * roofs, tiled canopies over the shops, water tanks and rooftop boards' frames are a second, in vertex colours.
 *
 * The look, from photographs of Kalpetta, Sulthan Bathery and Vythiri: concrete buildings in white, cream and Kerala's
 * pastels; at the road a row of shop fronts (rolling shutters, open counters, glass) under painted signboards in
 * English and Malayalam; a sloped red-tile canopy over the shops; windows with sunshades above; flat roofs with a black
 * water tank, or a tiled hip roof on the smaller ones; big boards on Kalpetta's roofs. No real business names.
 */
import { BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, Mesh, MeshStandardMaterial, SRGBColorSpace, ShapeUtils, Vector2 } from "three";
import type { Lot } from "./realTowns";

export const FLOOR = 0.32; // 3.2 m storeys
const BAY = 0.42; // one shop or window bay, ~4 m
const BELOW = 1.2; // walls run this far below the ground (slopes)

/* Wall paints: white, cream, pale yellow, sky blue, mint, peach, light grey, lilac */
export const WALLS = ["#f1efe8", "#efe3c4", "#ecd98f", "#b9d8e6", "#c4e3c8", "#efcdb8", "#d9d8d2", "#d4cde8"];
/* What a shop sells → its signboard (English, Malayalam) and board colours. USE maps OSM's shop and amenity values onto them. */
const SIGNS: [string, string, string, string][] = [
  ["BAKERY", "ബേക്കറി", "#c62828", "#fff"], ["HOTEL", "ഹോട്ടൽ", "#1b5e20", "#fff"], ["TEA STALL", "ചായക്കട", "#f9a825", "#3a2a00"],
  ["MEDICALS", "മെഡിക്കൽസ്", "#2e7d32", "#fff"], ["TEXTILES", "ടെക്സ്റ്റൈൽസ്", "#6a1b9a", "#fff"], ["JEWELLERY", "ജ്വല്ലറി", "#b8860b", "#fff"],
  ["MOBILES", "മൊബൈൽസ്", "#1565c0", "#fff"], ["STORES", "സ്റ്റോഴ്സ്", "#ad1457", "#fff"], ["VEGETABLES", "പച്ചക്കറി", "#388e3c", "#fffde7"],
  ["HARDWARE", "", "#37474f", "#ffeb3b"], ["BANK", "ബാങ്ക്", "#0d47a1", "#fff"], ["CLINIC", "", "#ffffff", "#c62828"],
  ["LODGE", "", "#4e342e", "#ffe0b2"], ["FOOTWEAR", "", "#e65100", "#fff"], ["STATIONERY", "", "#00838f", "#fff"], ["SUPERMARKET", "", "#d32f2f", "#fff"],
];
const USE: Record<string, number> = {
  bakery: 0, confectionery: 0, restaurant: 1, fast_food: 1, food_court: 1, cafe: 2, tea: 2, pharmacy: 3, chemist: 3,
  clothes: 4, fabric: 4, tailor: 4, boutique: 4, jewelry: 5, mobile_phone: 6, electronics: 6, computer: 6, convenience: 7,
  general: 7, variety_store: 7, greengrocer: 8, hardware: 9, doityourself: 9, paint: 9, bank: 10, atm: 10, hospital: 11,
  clinic: 11, doctors: 11, dentist: 11, hotel: 12, guest_house: 12, shoes: 13, books: 14, stationery: 14, supermarket: 15,
  department_store: 15,
};
/* Generic rooftop boards (Kalpetta): no brands */
const BOARDS: [string, string, string][] = [["SILKS & SAREES", "#7b1fa2", "#fff"], ["GOLD & DIAMONDS", "#3e2723", "#ffd54f"], ["MOBILE WORLD", "#1565c0", "#fff"],
  ["FURNITURE", "#ef6c00", "#fff"], ["HOME APPLIANCES", "#c62828", "#fff"], ["WEDDING CENTRE", "#880e4f", "#fff"], ["TOURIST HOME", "#00695c", "#fff"], ["SPICES & TEA", "#33691e", "#fff"]];

/* The sheet: 8 columns × 9 rows of 128 × 104 px cells (a bay wide, a storey tall).
 *   rows 0–1  shop fronts, one per sign (16)          row 2  the same signs, other fronts (8, first half)
 *   row 3     rooftop boards (8)                       rows 4–5  upper-floor windows, two styles × 8 wall colours
 *   row 6     side walls with a small window (8)       row 7  house fronts: door and window (8)
 *   row 8     plinth (col 0), civic fronts (cols 1–7) */
const CW = 128, CH = 104, SW = 1024, SH = 1024;
let sheet: CanvasTexture | null = null, glow: CanvasTexture | null = null;
/** The town's walls (one material per town): their lit signs and windows brighten after dark (components/scene/Town). */
export const townWallMaterials: MeshStandardMaterial[] = [];

function rngOf(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

function paintSheet() {
  const c = document.createElement("canvas"); c.width = SW; c.height = SH;
  const x = c.getContext("2d")!, r = rngOf(7);
  const cell = (col: number, row: number, f: (x0: number, y0: number) => void) => { x.save(); x.beginPath(); x.rect(col * CW, row * CH, CW, CH); x.clip(); f(col * CW, row * CH); x.restore(); };
  const grime = (x0: number, y0: number) => {
    const g = x.createLinearGradient(0, y0 + CH - 22, 0, y0 + CH); g.addColorStop(0, "rgba(60,50,40,0)"); g.addColorStop(1, "rgba(60,50,40,.35)"); x.fillStyle = g; x.fillRect(x0, y0, CW, CH);
    // monsoon streaks running down from the ledges, and a fine mottle
    for (let k = 0; k < 4; k++) { const sx = x0 + r() * CW, w = 3 + r() * 10, h = 20 + r() * 70, sg = x.createLinearGradient(0, y0, 0, y0 + h); sg.addColorStop(0, "rgba(70,72,66,.22)"); sg.addColorStop(1, "rgba(70,72,66,0)"); x.fillStyle = sg; x.fillRect(sx, y0, w, h); }
    for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${0.03 + r() * 0.04})`; x.fillRect(x0 + r() * CW, y0 + r() * CH, 2 + r() * 5, 2 + r() * 5); }
    x.fillStyle = "rgba(0,0,0,.10)"; x.fillRect(x0, y0, CW, 3); // the floor band
  };
  const shutter = (bx: number, by: number, w: number, h: number) => { x.fillStyle = "#8f9294"; x.fillRect(bx, by, w, h); x.fillStyle = "rgba(0,0,0,.2)"; for (let y = by; y < by + h; y += 4) x.fillRect(bx, y, w, 1.3); };
  const counter = (bx: number, by: number, w: number, h: number) => {
    x.fillStyle = "#2a2622"; x.fillRect(bx, by, w, h);
    for (let k = 0; k < 12; k++) { x.fillStyle = `hsl(${Math.floor(r() * 360)},55%,${40 + r() * 25}%)`; x.fillRect(bx + 3 + r() * (w - 10), by + 6 + Math.floor(r() * 3) * (h / 3.2), 5 + r() * 7, 8); }
  };
  const glass = (bx: number, by: number, w: number, h: number) => {
    const g = x.createLinearGradient(bx, by, bx + w, by + h); g.addColorStop(0, "#5d7884"); g.addColorStop(0.5, "#9fb6bf"); g.addColorStop(1, "#4b626c");
    x.fillStyle = g; x.fillRect(bx, by, w, h); x.fillStyle = "#cfd3d4"; x.fillRect(bx + w / 2 - 1, by, 2, h); x.fillRect(bx, by, w, 3);
  };
  const shop = (x0: number, y0: number, sign: number, style: number, wall: string) => {
    const [en, ml, bg, fg] = SIGNS[sign];
    x.fillStyle = wall; x.fillRect(x0, y0, CW, CH);
    x.fillStyle = bg; x.fillRect(x0 + 3, y0 + 4, CW - 6, 30); x.strokeStyle = "rgba(0,0,0,.25)"; x.lineWidth = 2; x.strokeRect(x0 + 3, y0 + 4, CW - 6, 30);
    x.fillStyle = fg; x.textAlign = "center"; x.textBaseline = "middle";
    if (ml) { x.font = "700 11px 'Noto Sans Malayalam','Malayalam Sangam MN',sans-serif"; x.fillText(ml, x0 + CW / 2, y0 + 12); x.font = "800 13px Arial,sans-serif"; x.fillText(en, x0 + CW / 2, y0 + 26); }
    else { x.font = "800 15px Arial,sans-serif"; x.fillText(en, x0 + CW / 2, y0 + 20); }
    const by = y0 + 40, h = CH - 42, bx = x0 + 6, w = CW - 12;
    if (style === 0) shutter(bx, by, w, h); else if (style === 1) counter(bx, by, w, h); else glass(bx, by, w, h);
    grime(x0, y0);
  };
  const window2 = (x0: number, y0: number, wall: string, style: number) => {
    x.fillStyle = wall; x.fillRect(x0, y0, CW, CH);
    for (const wx of [14, 70]) {
      if (style === 0) { x.fillStyle = "#34444c"; x.fillRect(x0 + wx, y0 + 30, 44, 44); x.strokeStyle = "#f6f4ee"; x.lineWidth = 3; x.strokeRect(x0 + wx, y0 + 30, 44, 44); x.fillStyle = "#f6f4ee"; x.fillRect(x0 + wx + 21, y0 + 30, 2, 44); }
      else { x.fillStyle = "#4e6a75"; x.fillRect(x0 + wx - 4, y0 + 26, 52, 52); x.fillStyle = "rgba(255,255,255,.25)"; x.fillRect(x0 + wx - 4, y0 + 26, 52, 8); }
      x.fillStyle = "rgba(0,0,0,.22)"; x.fillRect(x0 + wx - 6, y0 + 22, 56, 5); // sunshade
    }
    if (style === 1) { x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(x0, y0 + CH - 10, CW, 4); } // a balcony edge
    grime(x0, y0);
  };
  WALLS.forEach((wall, i) => {
    cell(i, 4, (x0, y0) => window2(x0, y0, wall, 0));
    cell(i, 5, (x0, y0) => window2(x0, y0, wall, 1));
    cell(i, 6, (x0, y0) => {
      x.fillStyle = wall; x.fillRect(x0, y0, CW, CH);
      for (const wx of [22, 78]) { x.fillStyle = "#3e4d54"; x.fillRect(x0 + wx, y0 + 38, 28, 32); x.strokeStyle = "#f2f0ea"; x.lineWidth = 2; x.strokeRect(x0 + wx, y0 + 38, 28, 32); x.fillStyle = "rgba(0,0,0,.2)"; x.fillRect(x0 + wx - 4, y0 + 33, 36, 4); }
      x.fillStyle = "rgba(0,0,0,.06)"; x.fillRect(x0, y0, 3, CH); grime(x0, y0);
    });
    cell(i, 7, (x0, y0) => {
      x.fillStyle = wall; x.fillRect(x0, y0, CW, CH);
      x.fillStyle = "#6b4a2f"; x.fillRect(x0 + 18, y0 + 30, 30, CH - 30); x.fillStyle = "#2c3a40"; x.fillRect(x0 + 66, y0 + 34, 46, 34);
      x.strokeStyle = "#f6f4ee"; x.lineWidth = 3; x.strokeRect(x0 + 66, y0 + 34, 46, 34); grime(x0, y0);
    });
  });
  for (let s = 0; s < 16; s++) cell(s % 8, Math.floor(s / 8), (x0, y0) => shop(x0, y0, s, s % 3, WALLS[[0, 1, 6, 0, 2, 0, 1, 6][s % 8]]));
  for (let s = 0; s < 8; s++) cell(s, 2, (x0, y0) => shop(x0, y0, s + (s % 2) * 8, (s + 1) % 3, WALLS[[1, 0, 3, 6, 0, 5, 1, 4][s]]));
  BOARDS.forEach(([t, bg, fg], i) => cell(i, 3, (x0, y0) => {
    x.fillStyle = bg; x.fillRect(x0, y0, CW, CH); x.strokeStyle = "#e8e8e8"; x.lineWidth = 5; x.strokeRect(x0 + 2, y0 + 2, CW - 4, CH - 4);
    x.fillStyle = fg; x.textAlign = "center"; x.textBaseline = "middle"; x.font = "900 17px Arial,sans-serif";
    const words = t.split(" "), half = Math.ceil(words.length / 2);
    x.fillText(words.slice(0, half).join(" "), x0 + CW / 2, y0 + CH / 2 - 12); x.fillText(words.slice(half).join(" "), x0 + CW / 2, y0 + CH / 2 + 12);
  }));
  cell(0, 8, (x0, y0) => { x.fillStyle = "#8d8a82"; x.fillRect(x0, y0, CW, CH); x.fillStyle = "rgba(0,0,0,.12)"; for (let y = y0; y < y0 + CH; y += 13) x.fillRect(x0, y, CW, 2); });
  for (let i = 1; i < 8; i++) cell(i, 8, (x0, y0) => { // civic: cream with tall windows and a blue band
    x.fillStyle = WALLS[[1, 0, 2, 1, 0, 6, 1][i - 1]]; x.fillRect(x0, y0, CW, CH); x.fillStyle = "#3f6f8f"; x.fillRect(x0, y0 + 6, CW, 6);
    for (const wx of [12, 48, 84]) { x.fillStyle = "#33424a"; x.fillRect(x0 + wx, y0 + 24, 30, 60); x.strokeStyle = "#f4f2ec"; x.lineWidth = 3; x.strokeRect(x0 + wx, y0 + 24, 30, 60); }
    grime(x0, y0);
  });
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** The same sheet after dark: what's lit, on black (the walls' emissive map). Shop and rooftop boards lit from the
 * front (their own colours, brighter), open counters warm with bulbs, glass fronts cool white tube light, shutters
 * down; some windows upstairs warm (tube light behind curtains) or blue (a television). */
const NEON_SHOP = ["#ff2d95", "#9a4dff", "#ffb35c", "#ff2d95", "#2af0ff"];
function paintGlow(day: HTMLCanvasElement) {
  const c = document.createElement("canvas"); c.width = SW; c.height = SH;
  const x = c.getContext("2d")!, r = rngOf(11);
  x.fillStyle = "#000"; x.fillRect(0, 0, SW, SH);
  const copy = (sx: number, sy: number, w: number, h: number, alpha = 1) => { x.globalAlpha = alpha; x.drawImage(day, sx, sy, w, h, sx, sy, w, h); x.globalAlpha = 1; };
  const lamp = (bx: number, by: number, w: number, h: number, col: string, a: number) => {
    const g = x.createLinearGradient(0, by, 0, by + h); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
    x.globalAlpha = a; x.fillStyle = g; x.fillRect(bx, by, w, h); x.globalAlpha = 1;
  };
  const front = (col: number, row: number, style: number) => {
    const x0 = col * CW, y0 = row * CH, by = y0 + 40, h = CH - 42, bx = x0 + 6, w = CW - 12;
    copy(x0 + 3, y0 + 4, CW - 6, 30);                                     // the signboard
    // the night is neon (lib/neon): open counters in hot pink, violet or warm; glass fronts electric blue or cyan
    const hue = NEON_SHOP[(col + row * 3) % NEON_SHOP.length];
    if (style === 1) { copy(bx, by, w, h, 0.55); x.globalCompositeOperation = "lighter"; lamp(bx, by, w, h, hue, 0.85); x.globalCompositeOperation = "source-over"; }
    else if (style === 2) lamp(bx, by, w, h, (col + row) % 2 ? "#2f6bff" : "#2af0ff", 0.8);
  };
  for (let sgn = 0; sgn < 16; sgn++) front(sgn % 8, Math.floor(sgn / 8), sgn % 3);
  for (let sgn = 0; sgn < 8; sgn++) front(sgn, 2, (sgn + 1) % 3);
  for (let i = 0; i < 8; i++) copy(i * CW, 3 * CH, CW, CH);                    // rooftop boards
  const win = (wx: number, wy: number, w: number, h: number) => {
    const k = r(); if (k > 0.4) return;
    // a lit room seen through the glass: brighter toward the ceiling (the tube light), a curtain edge darker
    // rooms lit in the neon night's colours: electric blue, violet, hot pink, cyan, a little lime, some plain white
    const col = k < 0.08 ? "47,107,255" : k < 0.15 ? "154,77,255" : k < 0.22 ? "255,45,149" : k < 0.29 ? "42,240,255" : k < 0.32 ? "168,255,62" : "236,240,255", a = 0.22 + r() * 0.22;
    const g = x.createLinearGradient(0, wy, 0, wy + h); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},${a * 0.35})`);
    x.fillStyle = g; x.fillRect(wx, wy, w, h);
    if (r() < 0.6) { x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(wx + (r() < 0.5 ? 0 : w * 0.6), wy, w * 0.4, h); }
  };
  for (let i = 0; i < 8; i++) {
    for (const wx of [14, 70]) { win(i * CW + wx + 2, 4 * CH + 32, 40, 40); win(i * CW + wx - 2, 5 * CH + 28, 48, 48); }
    for (const wx of [22, 78]) win(i * CW + wx + 1, 6 * CH + 39, 26, 30);
    win(i * CW + 67, 7 * CH + 35, 44, 32);
  }
  for (let i = 1; i < 8; i++) for (const wx of [12, 48, 84]) win(i * CW + wx + 2, 8 * CH + 26, 26, 56);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** One growing mesh: positions, normals, uvs, colours. */
class Batch {
  p: number[] = []; n: number[] = []; uv: number[] = []; c: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[], nrm: number[], uv?: [number, number, number, number], col?: [number, number, number]) {
    // a b along the bottom in the ring's direction (for a wall: right to left seen from outside), c d above b and a;
    // wound to face out, the texture's left edge at b
    const flip = Batch.faces(a, c, b, nrm) < 0;
    for (const v of flip ? [a, b, c, a, c, d] : [a, c, b, a, d, c]) this.p.push(v[0], v[1], v[2]);
    for (let i = 0; i < 6; i++) this.n.push(nrm[0], nrm[1], nrm[2]);
    if (uv) { const [u0, v0, u1, v1] = uv; this.uv.push(...(flip ? [u1, v0, u0, v0, u0, v1, u1, v0, u0, v1, u1, v1] : [u1, v0, u0, v1, u0, v0, u1, v0, u1, v1, u0, v1])); }
    if (col) for (let i = 0; i < 6; i++) this.c.push(col[0], col[1], col[2]);
  }
  /** Which way the triangle a b c faces relative to `nrm` (+: the same way). */
  static faces(a: number[], b: number[], c: number[], nrm: number[]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    return (uy * vz - uz * vy) * nrm[0] + (uz * vx - ux * vz) * nrm[1] + (ux * vy - uy * vx) * nrm[2];
  }
  tri(a: number[], b: number[], c: number[], nrm: number[], col: [number, number, number]) {
    for (const v of Batch.faces(a, b, c, nrm) < 0 ? [a, c, b] : [a, b, c]) this.p.push(v[0], v[1], v[2]);
    for (let i = 0; i < 3; i++) { this.n.push(nrm[0], nrm[1], nrm[2]); this.c.push(col[0], col[1], col[2]); }
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.p, 3)); g.setAttribute("normal", new Float32BufferAttribute(this.n, 3));
    if (this.uv.length) g.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
    if (this.c.length) g.setAttribute("color", new Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
const cellUV = (col: number, row: number): [number, number, number, number] => {
  const i = 0.75; // (a little in from the edges, so mipmaps don't bleed the neighbours)
  return [(col * CW + i) / SW, 1 - (row * CH + CH - i) / SH, (col * CW + CW - i) / SW, 1 - (row * CH + i) / SH];
};
const hex = (h: string): [number, number, number] => { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255].map((c) => c ** 2.2) as [number, number, number]; };
const PAVE = hex("#a9a69e"), KERB = hex("#8d8b85"), TILE = hex("#b0533a"), TILE_DARK = hex("#8a3f2c"), CONCRETE = hex("#bab6ad"), TANK = hex("#26282a"), FRAME = hex("#55585a");

/** All the lots of one town as two meshes: the walls (the sheet) and the rest (vertex colours). */
export function buildTown(lots: Lot[], seed: number, ground: (x: number, z: number) => number) {
  sheet ??= paintSheet();
  glow ??= paintGlow(sheet.image as HTMLCanvasElement);
  const walls = new Batch(), rest = new Batch();
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (const lot of lots) {
    const ring = lot.ring, n = ring.length, y0 = lot.y - BELOW, yg = lot.y, top = yg + lot.floors * FLOOR;
    const roadSign = lot.use ? USE[lot.use] ?? Math.floor(r() * 16) : Math.floor(r() * 16);
    let longest = -1, longestLen = 0;
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const nx = dz / len, nz = -dx / len; // outward (the ring runs counter-clockwise seen from above)
      const facing = nx * lot.toRoad.x + nz * lot.toRoad.z > 0.55 && len > 0.25;
      if (facing && len > longestLen) { longest = i; longestLen = len; }
      const bays = Math.max(1, Math.round(len / BAY)), nrm = [nx, 0, nz];
      // the plinth below the ground floor
      walls.quad([a.x, y0, a.z], [b.x, y0, b.z], [b.x, yg, b.z], [a.x, yg, a.z], nrm, cellUV(0, 8));
      for (let k = 0; k < bays; k++) {
        const u0 = k / bays, u1 = (k + 1) / bays, ax = a.x + dx * u0, az = a.z + dz * u0, bx = a.x + dx * u1, bz = a.z + dz * u1;
        for (let f = 0; f < lot.floors; f++) {
          const ya = yg + f * FLOOR, yb = ya + FLOOR;
          let uv: [number, number, number, number];
          if (lot.kind === "civic") uv = f === 0 && facing ? cellUV(1 + (lot.colour % 7), 8) : cellUV(1 + ((lot.colour + f) % 7), 8);
          else if (f === 0 && facing) uv = lot.kind === "shop" ? (k % 3 === 2 ? cellUV(roadSign % 8, 2) : cellUV(roadSign % 8, Math.floor(roadSign / 8))) : cellUV(lot.colour, 7);
          else uv = facing ? cellUV(lot.colour, f % 2 === 0 ? 4 : 5 - (lot.floors > 3 ? 1 : 0)) : cellUV(lot.colour, 6);
          walls.quad([ax, ya, az], [bx, ya, bz], [bx, yb, bz], [ax, yb, az], nrm, uv);
        }
      }
      // a sloped red-tile canopy over the shop fronts
      if (facing && lot.kind === "shop" && lot.floors > 1) {
        const out = 0.2, ya = yg + FLOOR * 0.97, yb = yg + FLOOR * 0.74;
        rest.quad([a.x + nx * out, yb, a.z + nz * out], [b.x + nx * out, yb, b.z + nz * out], [b.x, ya, b.z], [a.x, ya, a.z], [nx * 0.5, 0.87, nz * 0.5], undefined, r() < 0.75 ? TILE : TILE_DARK);
      }
      // the forecourt: concrete from the shop front out toward the road, at the ground's level (a kerb's height up)
      if (facing && lot.kind !== "house" && !lot.street) { // (a side street's shops open onto its footpath)
        // (its outer edge on the ground there, which rises toward the road bank: never under the grass)
        const out = 0.34, ox = nx * out, oz = nz * out, ya = Math.max(yg, ground(a.x + ox, a.z + oz)) + 0.012, yb = Math.max(yg, ground(b.x + ox, b.z + oz)) + 0.012, yi = yg + 0.012;
        const pave = PAVE.map((v) => v * (0.92 + r() * 0.12)) as [number, number, number];
        rest.quad([a.x + ox, ya, a.z + oz], [b.x + ox, yb, b.z + oz], [b.x, Math.max(yi, (yb + yi) / 2), b.z], [a.x, Math.max(yi, (ya + yi) / 2), a.z], [0, 1, 0], undefined, pave);
        rest.quad([a.x + ox, ya - 0.06, a.z + oz], [b.x + ox, yb - 0.06, b.z + oz], [b.x + ox, yb, b.z + oz], [a.x + ox, ya, a.z + oz], [nx, 0, nz], undefined, KERB);
      }
    }
    // roof: a tiled hip over small rectangular houses, else flat concrete with a water tank (and, in Kalpetta, a board)
    const rect = n === 4 && Math.abs(Math.hypot(ring[1].x - ring[0].x, ring[1].z - ring[0].z) - Math.hypot(ring[3].x - ring[2].x, ring[3].z - ring[2].z)) < 0.08;
    if (rect && lot.floors <= 2 && (lot.kind === "house" || r() < 0.4)) hipRoof(rest, ring, top, r() < 0.7 ? TILE : TILE_DARK);
    else {
      const flat = ShapeUtils.triangulateShape(ring.map((p) => new Vector2(p.x, p.z)), []);
      const shade = CONCRETE.map((v) => v * (0.85 + r() * 0.2)) as [number, number, number];
      for (const [i, j, k] of flat) rest.tri([ring[i].x, top, ring[i].z], [ring[k].x, top, ring[k].z], [ring[j].x, top, ring[j].z], [0, 1, 0], shade);
      // a parapet: a low lip round the roof
      for (let i = 0; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n], len = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = (b.z - a.z) / len, nz = -(b.x - a.x) / len;
        rest.quad([a.x, top, a.z], [b.x, top, b.z], [b.x, top + 0.07, b.z], [a.x, top + 0.07, a.z], [nx, 0, nz], undefined, shade);
      }
      if (r() < 0.55) tank(rest, lot.centre.x + (r() - 0.5) * 0.2, top, lot.centre.z + (r() - 0.5) * 0.2, r() < 0.8 ? TANK : hex("#2f6fb5"));
      if (lot.town === "Kalpetta" && longest >= 0 && lot.floors >= 3 && r() < 0.3) board(walls, rest, ring[longest], ring[(longest + 1) % n], top, Math.floor(r() * 8));
    }
  }
  const wallMat = new MeshStandardMaterial({ map: sheet, roughness: 0.88, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0 });
  townWallMaterials.push(wallMat);
  const restMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: DoubleSide });
  const a = new Mesh(walls.geometry(), wallMat), b = new Mesh(rest.geometry(), restMat);
  a.castShadow = a.receiveShadow = b.castShadow = b.receiveShadow = true;
  return [a, b];
}

/** A hip roof over a rectangle: the ridge along the long side, eaves a little out. */
function hipRoof(batch: Batch, ring: { x: number; z: number }[], top: number, col: [number, number, number]) {
  const [p0, p1, , p3] = ring, ux = p1.x - p0.x, uz = p1.z - p0.z, vx = p3.x - p0.x, vz = p3.z - p0.z;
  const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz), cx = (ring[0].x + ring[2].x) / 2, cz = (ring[0].z + ring[2].z) / 2;
  const [L, W, ax, az, bx, bz] = lu >= lv ? [lu, lv, ux / lu, uz / lu, vx / lv, vz / lv] : [lv, lu, vx / lv, vz / lv, ux / lu, uz / lu];
  const e = 0.05, hl = L / 2 + e, hw = W / 2 + e, rise = 0.1 + W * 0.18, ridge = Math.max(0, hl - hw);
  const P = (a: number, b: number, y: number) => [cx + ax * a + bx * b, y, cz + az * a + bz * b];
  const c = [P(-hl, -hw, top), P(hl, -hw, top), P(hl, hw, top), P(-hl, hw, top)], r0 = P(-ridge, 0, top + rise), r1 = P(ridge, 0, top + rise);
  const k = Math.hypot(rise, hw), s1 = [-bx * rise / k, hw / k, -bz * rise / k], s2 = [bx * rise / k, hw / k, bz * rise / k];
  const ke = Math.hypot(rise, hl - ridge), e1 = [ax * rise / ke, (hl - ridge) / ke, az * rise / ke], e2 = [-ax * rise / ke, (hl - ridge) / ke, -az * rise / ke];
  batch.quad(c[0], c[1], r1, r0, s1, undefined, col); batch.quad(c[2], c[3], r0, r1, s2, undefined, col);
  batch.tri(c[1], c[2], r1, e1, col); batch.tri(c[3], c[0], r0, e2, col);
}

/** A black plastic water tank on its stand. */
function tank(batch: Batch, x: number, y: number, z: number, col: [number, number, number]) {
  const R = 0.055, H = 0.1, k = 8, y1 = y + 0.04;
  for (let i = 0; i < k; i++) {
    const a0 = (i / k) * Math.PI * 2, a1 = ((i + 1) / k) * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    batch.quad([x + c0 * R, y1, z + s0 * R], [x + c1 * R, y1, z + s1 * R], [x + c1 * R, y1 + H, z + s1 * R], [x + c0 * R, y1 + H, z + s0 * R], [(c0 + c1) / 2, 0, (s0 + s1) / 2], undefined, col);
    batch.tri([x, y1 + H + 0.012, z], [x + c1 * R, y1 + H, z + s1 * R], [x + c0 * R, y1 + H, z + s0 * R], [0, 1, 0], col);
  }
  batch.quad([x - R, y, z - R], [x + R, y, z - R], [x + R, y1, z - R], [x - R, y1, z - R], [0, 0, -1], undefined, FRAME);
}

/** A big board on the roof facing the road, on a steel frame. */
function board(walls: Batch, rest: Batch, a: { x: number; z: number }, b: { x: number; z: number }, top: number, which: number) {
  const len = Math.hypot(b.x - a.x, b.z - a.z), w = Math.min(len * 0.8, 0.9), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, nx = uz, nz = -ux;
  const mx = (a.x + b.x) / 2 - nx * 0.05, mz = (a.z + b.z) / 2 - nz * 0.05, y0 = top + 0.12, y1 = y0 + w * 0.5;
  const L = [mx - ux * w / 2, mz - uz * w / 2], R = [mx + ux * w / 2, mz + uz * w / 2];
  walls.quad([L[0], y0, L[1]], [R[0], y0, R[1]], [R[0], y1, R[1]], [L[0], y1, L[1]], [nx, 0, nz], cellUV(which, 3));
  for (const [px, pz] of [L, R]) rest.quad([px - nx * 0.01, top, pz - nz * 0.01], [px + ux * 0.02 - nx * 0.01, top, pz + uz * 0.02 - nz * 0.01], [px + ux * 0.02 - nx * 0.01, y0, pz + uz * 0.02 - nz * 0.01], [px - nx * 0.01, y0, pz - nz * 0.01], [nx, 0, nz], undefined, FRAME);
}
