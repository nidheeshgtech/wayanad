/**
 * Kerala road vehicles, built in code (no downloads, no licences): the KSRTC-style fast passenger bus, a private bus,
 * an auto-rickshaw, the open jeep Wayanad runs on, a decorated goods lorry, a hatchback taxi and a classic motorcycle
 * with its rider. Generic liveries only — no operator logos, brand names or number plates of real vehicles.
 *
 * Every builder returns a Group in metres: +Z forward, ground at y = 0, centred on x. Traffic normalises each model to
 * its registry size (data/vehicles.ts), so the proportions here are what matter.
 */
import {
  BoxGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DoubleSide, Group, Material, Mesh, MeshStandardMaterial,
  Object3D, PlaneGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/* ---- shared materials ---- */
const paint = (color: number, roughness = 0.35) => new MeshStandardMaterial({ color, roughness, metalness: 0.15 });
const MAT = {
  glass: new MeshStandardMaterial({ color: 0x1d2a30, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.85 }),
  tyre: new MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.92 }),
  rim: new MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.85 }),
  chrome: new MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.15, metalness: 1 }),
  black: new MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }),
  rubber: new MeshStandardMaterial({ color: 0x232323, roughness: 0.85 }),
  head: new MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xffe6a6, emissiveIntensity: 0.4, roughness: 0.1 }),
  tail: new MeshStandardMaterial({ color: 0x9d1414, emissive: 0x6a0a0a, emissiveIntensity: 0.4, roughness: 0.2 }),
  amber: new MeshStandardMaterial({ color: 0xe89a1e, emissive: 0x7a4a08, emissiveIntensity: 0.3, roughness: 0.2 }),
  canvas: new MeshStandardMaterial({ color: 0xc7b48a, roughness: 0.95, side: DoubleSide }),
  seat: new MeshStandardMaterial({ color: 0x2b2420, roughness: 0.8 }),
  skin: new MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.7 }),
};

/* ---- shared parts ---- */
function add<T extends Object3D>(g: Group, o: T, x = 0, y = 0, z = 0): T { o.position.set(x, y, z); g.add(o); return o; }
function box(w: number, h: number, d: number, m: Material, r = 0) {
  const mesh = new Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)) : new BoxGeometry(w, h, d), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
/** A tyre with a rim and hub, axle along x; `dual` for the twin rear wheels of buses and lorries. */
function wheel(radius: number, width: number, dual = false) {
  const g = new Group();
  const tyre = new Mesh(new CylinderGeometry(radius, radius, width, 28), MAT.tyre);
  tyre.rotation.z = Math.PI / 2; tyre.castShadow = true; g.add(tyre);
  const sidewall = new Mesh(new TorusGeometry(radius * 0.86, radius * 0.14, 8, 28), MAT.tyre);
  for (const s of [-1, 1]) { const w = sidewall.clone(); w.rotation.y = Math.PI / 2; w.position.x = (s * width) / 2; g.add(w); }
  const rim = new Mesh(new CylinderGeometry(radius * 0.6, radius * 0.6, width * 1.02, 20), MAT.rim);
  rim.rotation.z = Math.PI / 2; g.add(rim);
  const hub = new Mesh(new CylinderGeometry(radius * 0.18, radius * 0.18, width * 1.1, 10), MAT.chrome);
  hub.rotation.z = Math.PI / 2; g.add(hub);
  if (dual) { const twin = g.clone(); twin.position.x = width * 1.05; const out = new Group(); out.add(g, twin); return out; }
  return g;
}
/** Text or graphics painted on a panel: a canvas texture of `w`×`h` px drawn by `draw`. */
function painted(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function decal(width: number, height: number, map: CanvasTexture, emissive = false) {
  const m = new MeshStandardMaterial({ map, transparent: true, roughness: 0.4, ...(emissive ? { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.6 } : {}) });
  return new Mesh(new PlaneGeometry(width, height), m);
}
function lamp(r: number, m: Material) { const l = new Mesh(new CircleGeometry(r, 18), m); return l; }

/* ---- buses ---- */
type BusLivery = { body: number; band: number; stripe: number; roof: number; board: string; skirt: number };

function bus(l: BusLivery) {
  const g = new Group(), L = 11, W = 2.5, H = 3.15, floor = 0.75;
  const body = paint(l.body), band = paint(l.band), stripe = paint(l.stripe);
  add(g, box(W, H - floor, L, body, 0.18), 0, floor + (H - floor) / 2, 0);
  add(g, box(W + 0.02, 0.35, L - 0.4, paint(l.skirt)), 0, floor + 0.18, 0);                 // skirt panel
  add(g, box(W + 0.03, 0.16, L - 0.3, stripe), 0, floor + 0.62, 0);                          // waist stripe
  add(g, box(W + 0.03, 1.05, L - 2.0, band), 0, floor + 1.45, -0.6);                         // window band
  // side windows: dark glass bays with pillars
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
    add(g, box(0.02, 0.85, 0.85, MAT.glass), s * (W / 2 + 0.02), floor + 1.48, -L / 2 + 1.2 + i * 0.98);
  }
  // roof: light colour, luggage carrier rails
  add(g, box(W - 0.1, 0.12, L - 0.3, paint(l.roof, 0.6), 0.05), 0, H + 0.02, 0);
  for (const s of [-1, 1]) add(g, box(0.05, 0.05, L * 0.7, MAT.chrome), s * (W / 2 - 0.25), H + 0.2, -0.5);
  for (let i = 0; i < 6; i++) add(g, box(W - 0.5, 0.04, 0.05, MAT.chrome), 0, H + 0.2, -L / 2 + 2 + i * 1.2);
  // front: big windscreen, destination board, lamps, bumper
  const front = L / 2;
  add(g, box(W - 0.2, 1.25, 0.05, MAT.glass), 0, floor + 1.55, front + 0.01);
  const board = decal(W - 0.3, 0.32, painted(512, 72, (x, w, h) => {
    x.fillStyle = "#120c06"; x.fillRect(0, 0, w, h); x.fillStyle = "#ffae2a"; x.font = "bold 44px Arial"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(l.board, w / 2, h / 2 + 2);
  }), true);
  add(g, board, 0, H - 0.25, front + 0.04);
  for (const s of [-1, 1]) { add(g, lamp(0.13, MAT.head), s * 0.85, floor + 0.55, front + 0.04); add(g, lamp(0.07, MAT.amber), s * 1.08, floor + 0.55, front + 0.04); }
  add(g, box(W + 0.05, 0.28, 0.18, MAT.black, 0.05), 0, floor + 0.2, front + 0.05);
  // rear: tail lamps, back window
  for (const s of [-1, 1]) { const t = add(g, lamp(0.1, MAT.tail), s * 0.95, floor + 0.6, -front - 0.04); t.rotation.y = Math.PI; }
  const back = add(g, box(W - 0.4, 0.8, 0.04, MAT.glass), 0, floor + 1.6, -front - 0.01); back.rotation.y = Math.PI;
  // mirrors on stalks
  for (const s of [-1, 1]) { add(g, box(0.05, 0.05, 0.5, MAT.black), s * (W / 2 + 0.2), H - 0.35, front + 0.1); add(g, box(0.06, 0.3, 0.18, MAT.black, 0.03), s * (W / 2 + 0.42), H - 0.55, front + 0.32); }
  // wheels: single front, dual rear
  for (const s of [-1, 1]) {
    add(g, wheel(0.5, 0.3), s * (W / 2 - 0.2), 0.5, front - 2.3);
    add(g, wheel(0.5, 0.26, true), s * (W / 2 - 0.42), 0.5, -front + 2.8);
  }
  return g;
}
/** Kerala's state transport fast passenger: red with a yellow band (generic livery, no operator marks). */
export const ksrtcBus = () => bus({ body: 0xb3201e, band: 0xb3201e, stripe: 0xf2b316, roof: 0xd8d2c4, board: "KALPETTA", skirt: 0x8d1714 });
/** A private bus, painted bright: white with sea-green and orange stripes. */
export function privateBus() {
  const g = bus({ body: 0xf3f1ea, band: 0xf3f1ea, stripe: 0xe8771c, roof: 0xe9e6dc, board: "SULTHAN BATHERY", skirt: 0x168a7a });
  const art = decal(7.5, 0.55, painted(1024, 76, (x, w, h) => {
    const grad = x.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#168a7a"); grad.addColorStop(0.5, "#2fb3a0"); grad.addColorStop(1, "#e8771c");
    x.fillStyle = grad; x.beginPath(); x.moveTo(0, h * 0.6); x.bezierCurveTo(w * 0.3, 0, w * 0.6, h, w, h * 0.2); x.lineTo(w, h); x.lineTo(0, h); x.fill();
  }));
  for (const s of [-1, 1]) { const a = art.clone(); a.rotation.y = (s * Math.PI) / 2; add(g, a, s * 1.27, 1.12, 0.2); }
  return g;
}

/* ---- auto-rickshaw ---- */
/** The three-wheeled auto-rickshaw: yellow lower body, black canvas canopy, single front wheel. */
export function autoRickshaw(body = 0xf2c418) {
  const g = new Group(), yellow = paint(body), L = 2.65, W = 1.3;
  add(g, box(W, 0.55, 1.6, yellow, 0.12), 0, 0.55, -0.35);                                   // rear passenger tub
  const nose = add(g, box(0.9, 0.85, 0.7, yellow, 0.2), 0, 0.72, 0.85); nose.scale.x = 0.85;     // front cowl
  add(g, box(0.55, 0.06, 0.4, MAT.black), 0, 1.1, 0.95);                                       // dashboard
  add(g, box(0.95, 0.6, 0.04, MAT.glass), 0, 1.4, 1.02).rotation.x = -0.15;                    // windscreen
  // canopy: black canvas on a frame, open sides
  add(g, box(W + 0.08, 0.08, 1.9, MAT.black, 0.04), 0, 1.78, -0.15);
  for (const [x, z] of [[-W / 2, 0.75], [W / 2, 0.75], [-W / 2, -1.05], [W / 2, -1.05]]) add(g, box(0.04, 1.2, 0.04, MAT.black), x, 1.2, z);
  add(g, box(W + 0.02, 1.0, 0.05, MAT.black, 0.02), 0, 1.3, -1.12);                             // back panel
  add(g, box(W - 0.1, 0.35, 0.5, MAT.seat, 0.08), 0, 0.98, -0.75);                              // bench
  add(g, box(0.3, 0.25, 0.35, MAT.seat, 0.06), 0, 1.0, 0.5);                                    // driver's seat
  add(g, box(0.6, 0.04, 0.04, MAT.chrome), 0, 1.25, 0.82);                                      // handlebar
  add(g, lamp(0.09, MAT.head), 0, 0.92, L / 2 - 0.12);
  for (const s of [-1, 1]) add(g, lamp(0.04, MAT.amber), s * 0.32, 0.8, L / 2 - 0.12);
  for (const s of [-1, 1]) { const t = add(g, lamp(0.05, MAT.tail), s * 0.5, 0.55, -1.16); t.rotation.y = Math.PI; }
  add(g, wheel(0.24, 0.12), 0, 0.24, 1.0);
  for (const s of [-1, 1]) add(g, wheel(0.24, 0.13), s * 0.6, 0.24, -0.75);
  add(g, box(0.18, 0.05, 0.4, MAT.black), 0, 0.42, 1.0);                                        // front mudguard
  return g;
}

/* ---- jeep ---- */
/** The open jeep Wayanad still runs on (estate, safari and taxi work): flat bonnet, round lamps, canvas top, spare on the back. */
export function jeep(body = 0x2f4a33) {
  const g = new Group(), p = paint(body, 0.5), W = 1.6, L = 3.8;
  add(g, box(W, 0.6, L - 0.2, p, 0.06), 0, 0.85, 0);                                           // tub
  add(g, box(W - 0.2, 0.3, 1.35, p, 0.05), 0, 1.2, 1.15);                                       // bonnet
  add(g, box(1.0, 0.45, 0.06, MAT.black), 0, 1.1, L / 2 - 0.08);                                 // grille
  for (let i = 0; i < 7; i++) add(g, box(0.05, 0.38, 0.07, p), -0.42 + i * 0.14, 1.1, L / 2 - 0.06);
  for (const s of [-1, 1]) { add(g, lamp(0.11, MAT.head), s * 0.62, 1.13, L / 2 - 0.04); add(g, box(0.36, 0.08, 0.95, p, 0.03), s * (W / 2 + 0.12), 0.95, 1.15); }
  add(g, box(W - 0.15, 0.55, 0.04, MAT.glass), 0, 1.65, 0.45).rotation.x = -0.18;               // windscreen
  add(g, box(W - 0.05, 0.05, 0.05, p), 0, 1.92, 0.42);
  // canvas soft top over the back
  add(g, box(W + 0.04, 0.06, 1.9, MAT.canvas, 0.03), 0, 1.95, -0.6);
  for (const s of [-1, 1]) add(g, box(0.02, 0.75, 1.9, MAT.canvas), s * (W / 2 + 0.02), 1.58, -0.6);
  add(g, box(W, 0.75, 0.02, MAT.canvas), 0, 1.58, -1.55);
  for (const z of [0.4, -0.6, -1.5]) for (const s of [-1, 1]) add(g, box(0.04, 0.9, 0.04, MAT.black), s * (W / 2), 1.5, z);
  add(g, box(1.4, 0.4, 0.45, MAT.seat, 0.08), 0, 1.15, 0.1);                                    // front seats
  add(g, wheel(0.36, 0.25), 0, 1.0, -L / 2 - 0.18).rotation.y = Math.PI / 2;                     // spare wheel
  add(g, box(W + 0.05, 0.12, 0.15, MAT.black), 0, 0.55, L / 2 + 0.02);                           // bumper
  for (const s of [-1, 1]) { const t = add(g, lamp(0.06, MAT.tail), s * 0.65, 0.85, -L / 2 - 0.01); t.rotation.y = Math.PI; }
  for (const s of [-1, 1]) for (const z of [1.2, -1.15]) add(g, wheel(0.36, 0.25), s * (W / 2 - 0.05), 0.36, z);
  return g;
}

/* ---- goods lorry ---- */
/** A decorated goods lorry: orange cab with painted panels, a slatted cargo body under tarpaulin, "HORN OK PLEASE". */
export function lorry() {
  const g = new Group(), W = 2.4, L = 8.5, orange = paint(0xe8761b), cabZ = L / 2 - 1.1;
  add(g, box(W, 1.7, 2.0, orange, 0.12), 0, 1.75, cabZ);                                         // cab
  add(g, box(W - 0.2, 0.75, 0.05, MAT.glass), 0, 2.15, cabZ + 1.01);                              // windscreen
  add(g, decal(W - 0.3, 0.5, painted(512, 108, (x, w, h) => {                                      // painted header
    x.fillStyle = "#c2281c"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { x.fillStyle = ["#f6d02a", "#1e8a4c", "#ffffff"][i % 3]; x.beginPath(); x.arc(30 + i * 56, h / 2, 16, 0, Math.PI * 2); x.fill(); }
  })), 0, 2.7, cabZ + 1.02);
  add(g, box(W - 0.3, 0.45, 0.06, MAT.chrome), 0, 1.05, cabZ + 1.02);                              // grille
  for (const s of [-1, 1]) { add(g, lamp(0.13, MAT.head), s * 0.85, 1.05, cabZ + 1.06); add(g, box(0.5, 0.22, 0.05, MAT.glass), s * (W / 2 + 0.01), 2.1, cabZ + 0.3).rotation.y = (s * Math.PI) / 2; }
  add(g, box(W + 0.08, 0.25, 0.2, MAT.black, 0.04), 0, 0.65, cabZ + 1.05);                         // bumper
  // cargo body: wooden-coloured slats, tarpaulin over a ridge
  const wood = paint(0x8a5a2b, 0.8), tarp = new MeshStandardMaterial({ color: 0x2a4e8a, roughness: 0.9 });
  const bodyL = L - 2.3, bodyZ = -1.1;
  add(g, box(W, 0.2, bodyL, MAT.black), 0, 0.95, bodyZ);
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) add(g, box(0.06, 0.2, bodyL, wood), s * (W / 2 - 0.03), 1.2 + i * 0.27, bodyZ);
  add(g, box(W, 1.35, 0.06, wood), 0, 1.75, bodyZ - bodyL / 2);
  const ridge = add(g, new Mesh(new CylinderGeometry(W / 2, W / 2, bodyL, 3, 1, true), tarp), 0, 2.35, bodyZ);
  ridge.rotation.x = Math.PI / 2; ridge.rotation.y = Math.PI; ridge.scale.set(1, 1, 0.45);
  const back = add(g, decal(W - 0.2, 0.6, painted(512, 128, (x, w, h) => {
    x.fillStyle = "#f6d02a"; x.fillRect(0, 0, w, h); x.fillStyle = "#b3201e"; x.font = "bold 42px Arial"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("HORN OK PLEASE", w / 2, h / 2);
  })), 0, 1.55, bodyZ - bodyL / 2 - 0.04);
  back.rotation.y = Math.PI;
  for (const s of [-1, 1]) { const t = add(g, lamp(0.09, MAT.tail), s * 0.95, 1.05, bodyZ - bodyL / 2 - 0.05); t.rotation.y = Math.PI; add(g, box(0.45, 0.5, 0.02, MAT.rubber), s * 0.85, 0.55, bodyZ - bodyL / 2 + 0.2); }
  for (const s of [-1, 1]) { add(g, wheel(0.52, 0.3), s * (W / 2 - 0.2), 0.52, cabZ); add(g, wheel(0.52, 0.26, true), s * (W / 2 - 0.42), 0.52, bodyZ - bodyL / 2 + 1.4); }
  return g;
}

/* ---- hatchback taxi ---- */
/** A small hatchback, the commonest taxi in Kerala's towns: white, rounded, with a roof sign. */
export function hatchback(body = 0xf2f2ee) {
  const g = new Group(), p = paint(body, 0.25), W = 1.68, L = 3.85;
  add(g, box(W, 0.62, L, p, 0.25), 0, 0.62, 0);                                                    // lower body
  add(g, box(W - 0.16, 0.6, 2.25, p, 0.24), 0, 1.15, -0.25);
  for (const s of [-1, 1]) add(g, box(0.02, 0.42, 1.95, MAT.glass), s * (W / 2 - 0.07), 1.17, -0.25);
  add(g, box(W - 0.3, 0.45, 0.04, MAT.glass), 0, 1.15, 0.92).rotation.x = -0.55;                    // windscreen
  add(g, box(W - 0.35, 0.38, 0.04, MAT.glass), 0, 1.17, -1.4).rotation.x = 0.35;                     // rear glass
  for (const s of [-1, 1]) {
    const hl = add(g, box(0.38, 0.14, 0.06, MAT.head, 0.04), s * 0.55, 0.78, L / 2 - 0.04); hl.rotation.y = s * -0.2;
    const tl = add(g, box(0.18, 0.28, 0.06, MAT.tail, 0.04), s * 0.7, 0.92, -L / 2 + 0.04); tl.rotation.y = Math.PI;
    add(g, box(0.08, 0.08, 0.16, p, 0.03), s * (W / 2 + 0.06), 1.05, 0.65);                           // mirror
  }
  add(g, box(0.9, 0.18, 0.05, MAT.black, 0.04), 0, 0.55, L / 2 + 0.01);                                // grille
  add(g, box(0.5, 0.14, 0.18, paint(0xf2c418), 0.04), 0, 1.53, -0.2);                                  // taxi roof sign
  for (const s of [-1, 1]) for (const z of [1.25, -1.2]) add(g, wheel(0.31, 0.19), s * (W / 2 - 0.12), 0.31, z);
  return g;
}

/* ---- motorcycle ---- */
/** A classic single-cylinder motorcycle with its rider in a helmet: round tank, chrome, spoked look. */
export function motorcycle(tank = 0x1a1a1a) {
  const g = new Group(), p = paint(tank, 0.2);
  for (const z of [0.68, -0.68]) add(g, wheel(0.33, 0.1), 0, 0.33, z);
  add(g, box(0.1, 0.08, 1.35, MAT.black), 0, 0.55, 0);                                               // frame
  const t = add(g, new Mesh(new SphereGeometry(0.2, 18, 12), p), 0, 0.88, 0.2); t.scale.set(0.75, 0.6, 1.3);
  add(g, box(0.26, 0.28, 0.32, MAT.chrome, 0.06), 0, 0.55, 0.1);                                     // engine
  add(g, box(0.07, 0.07, 0.8, MAT.chrome), 0.15, 0.4, -0.35).rotation.x = 0.12;                       // exhaust
  add(g, box(0.28, 0.08, 0.55, MAT.seat, 0.03), 0, 0.88, -0.32);                                      // seat
  add(g, box(0.7, 0.03, 0.03, MAT.chrome), 0, 1.1, 0.55);                                              // handlebar
  add(g, lamp(0.09, MAT.head), 0, 0.95, 0.72);
  add(g, box(0.14, 0.03, 0.3, p), 0, 0.68, 0.68);                                                      // mudguard
  // rider: torso, arms, legs, helmet
  const shirt = paint(0x2c5d8f, 0.8), trousers = paint(0x2b2b30, 0.85);
  add(g, box(0.38, 0.55, 0.24, shirt, 0.08), 0, 1.28, -0.22).rotation.x = 0.25;
  for (const s of [-1, 1]) {
    const arm = add(g, box(0.09, 0.09, 0.55, shirt, 0.04), s * 0.22, 1.32, 0.12); arm.rotation.x = 0.5;
    const leg = add(g, box(0.12, 0.12, 0.5, trousers, 0.05), s * 0.17, 0.85, -0.05); leg.rotation.x = -0.35;
  }
  add(g, new Mesh(new SphereGeometry(0.15, 16, 12), paint(0xf2f2f2, 0.2)), 0, 1.72, -0.12);         // helmet
  add(g, box(0.2, 0.08, 0.05, MAT.glass), 0, 1.7, 0.02);                                               // visor
  return g;
}

/** Every built vehicle, by registry id. */
export const BUILDERS: Record<string, () => Group> = {
  "ksrtc-bus": ksrtcBus,
  "private-bus": privateBus,
  "auto-rickshaw": () => autoRickshaw(),
  jeep: () => jeep(),
  lorry,
  "hatchback-taxi": () => hatchback(),
  "classic-motorcycle": () => motorcycle(),
};

/** Re-tint a built vehicle's body paint (for variety in traffic): every material sharing the first painted colour. */
export function repaint(g: Group, from: number, to: number) {
  const target = new Color(from);
  g.traverse((o) => {
    const m = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (m && "color" in m && m.color.equals(target)) { (o as Mesh).material = m.clone(); ((o as Mesh).material as MeshStandardMaterial).color.set(to); }
  });
  return g;
}
