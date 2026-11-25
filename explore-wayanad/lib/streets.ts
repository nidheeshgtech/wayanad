/**
 * Side streets you can drive (drive mode): Kalpetta's one-way bazaar street leaves NH766 on the right, runs behind the
 * block of shops a street over, and comes back onto the main road further up. Typical of the town, not surveyed.
 *
 * The car lives in road coordinates (lib/game): on a street it lives in the street's own (`street.s/lat/psi` here),
 * and `game.s/lat/psi` keep where that is against the main road, so everything that only knows the main road (the
 * radar, the map, the jobs, the police) still has you in the right place. The street leaves and joins the main road
 * gently (a smoothstep over `R`), so the change of coordinates is never a turn the car can't make; at its mouths the
 * main road's edge opens on that side (`room`) and you change roads where you're nearer the street's centre line than
 * the main road's. Units of 10 m.
 */
import { CatmullRomCurve3, Vector3 } from "three";
import { MathUtils } from "three";
import { game } from "@/lib/game";
import { SECTION, buildRoadCurve, height, placesT, setGroundHook } from "@/lib/terrain";
import type { RoadInfo } from "@/lib/carPhysics";

export type StreetDef = { id: string; name: string; ml: string; side: 1 | -1; from: number; to: number; offset: number; R: number };
/* (Vythiri's and Chundale's on straight runs of the road through the town, s from public/terrain/churam-road.json's
 * places: Vythiri 1822, Chundale 2196) */
export const STREETS: StreetDef[] = [
  { id: "vythiri", name: "Vythiri Market Road", ml: "മാർക്കറ്റ് റോഡ്", side: -1, from: 1798, to: 1828, offset: 4.5, R: 7 },
  { id: "chundale", name: "Chundale Junction Road", ml: "ജംഗ്ഷൻ റോഡ്", side: -1, from: 2170, to: 2198, offset: 4.5, R: 7 },
  { id: "bazaar", name: "Kalpetta Bazaar Road", ml: "ബസാർ റോഡ്", side: -1, from: 2740, to: 2782, offset: 5.5, R: 9 },
];
/** The street's asphalt half-width (6.4 m: narrower than the highway), and its footpaths' outer edge. */
export const STREET = { half: 0.32, path: 0.5, lift: 0.035 };

export type Street = StreetDef & {
  curve: CatmullRomCurve3; length: number; info: RoadInfo;
  /** sampled every `step` units along the street: the main road's s there, and the offset from its centre line */
  mainS: Float32Array; off: Float32Array; step: number;
  px: Float32Array; pz: Float32Array; py: Float32Array; box: [number, number, number, number];
};

/** How far off the main road's centre line the street runs at main-road s (0 at its mouths). */
export function offsetAt(d: StreetDef, s: number) {
  if (s <= d.from || s >= d.to) return 0;
  const up = MathUtils.smootherstep(s, d.from, d.from + d.R), down = 1 - MathUtils.smootherstep(s, d.to - d.R, d.to);
  return d.offset * Math.min(up, down);
}

const cache = new WeakMap<CatmullRomCurve3, Street[]>();
const up = new Vector3(0, 1, 0);
let building = false; // (the street's own build reads the natural ground)
/** The streets off this road (the drive from Adivaram only), built once. */
export function streets(main: CatmullRomCurve3): Street[] {
  const hit = cache.get(main); if (hit) return hit;
  building = true;
  try { const out = build(main); cache.set(main, out); return out; } finally { building = false; }
}
function build(main: CatmullRomCurve3): Street[] {
  const L = main.getLength(), out: Street[] = [];
  for (const d of STREETS) {
    if (d.to > L - 1) continue;
    const pts: Vector3[] = [], ms: number[] = [], offs: number[] = [];
    const raw: { p: Vector3; ground: number; bed: number; o: number; s: number }[] = [];
    for (let s = d.from; s <= d.to + 1e-6; s += 0.5) {
      const t = s / L, c = main.getPointAt(t), tan = main.getTangentAt(t).setY(0).normalize(), left = new Vector3().crossVectors(up, tan).normalize();
      const o = offsetAt(d, s), p = c.clone().addScaledVector(left, d.side * o);
      raw.push({ p, ground: height(p.x, p.z), bed: c.y - 0.588, o, s });
    }
    // the street's level: the ground's, smoothed along it, easing into the main road's at the mouths
    for (let i = 0; i < raw.length; i++) {
      let sum = 0, n = 0; for (let k = -6; k <= 6; k++) { const r = raw[Math.min(raw.length - 1, Math.max(0, i + k))]; sum += r.ground; n++; }
      const k = MathUtils.smoothstep(raw[i].o, SECTION.half * 0.5, 2.2);
      const y = raw[i].bed + (sum / n + STREET.lift - raw[i].bed) * k;
      pts.push(new Vector3(raw[i].p.x, y + 0.588, raw[i].p.z)); ms.push(raw[i].s); offs.push(raw[i].o);
    }
    const curve = new CatmullRomCurve3(pts, false, "centripetal"), length = curve.getLength();
    // main-road s and offset, resampled by the street's own arc length
    const step = 0.25, n = Math.ceil(length / step) + 1, mainS = new Float32Array(n), off = new Float32Array(n);
    const lens = curve.getLengths(pts.length - 1); // cumulative at each control point
    for (let i = 0, j = 0; i < n; i++) {
      const at = Math.min(length, i * step);
      while (j < lens.length - 2 && lens[j + 1] < at) j++;
      const u = (at - lens[j]) / Math.max(1e-6, lens[j + 1] - lens[j]);
      mainS[i] = ms[j] + (ms[j + 1] - ms[j]) * u; off[i] = offs[j] + (offs[j + 1] - offs[j]) * u;
    }
    const st = { ...d, curve, length, mainS, off, step } as Street;
    st.info = {
      curve, length, widen: () => STREET.half - SECTION.half,
      // at the mouths the main road lies alongside: open toward it
      room: (s: number, side: number) => { const o = sampled(st, st.off, s); return side === -d.side && o < 2.6 ? Math.max(0, o + SECTION.half - STREET.half) : 0; },
    };
    // the centre line as a polyline, for the "is this on the street" test
    const m = Math.ceil(length / 0.25) + 1; st.px = new Float32Array(m); st.pz = new Float32Array(m);
    for (let i = 0; i < m; i++) { curve.getPointAt(Math.min(1, (i * 0.25) / length), Q); st.px[i] = Q.x; st.pz[i] = Q.z; }
    st.py = new Float32Array(m); for (let i = 0; i < m; i++) { curve.getPointAt(Math.min(1, (i * 0.25) / length), Q); st.py[i] = Q.y - 0.588; }
    st.box = [Math.min(...st.px), Math.max(...st.px), Math.min(...st.pz), Math.max(...st.pz)];
    out.push(st);
  }
  return out;
}
const sampled = (st: Street, a: Float32Array, s: number) => {
  const f = Math.min(a.length - 1, Math.max(0, s / st.step)), i = Math.floor(f), j = Math.min(a.length - 1, i + 1);
  return a[i] + (a[j] - a[i]) * (f - i);
};
/** Where you are against the main road, on a street at s. */
export const streetMainS = (st: Street, s: number) => sampled(st, st.mainS, s);

/** The main road's extra room past its edge on `side` at s (the street mouths): units. */
export function mainRoom(main: CatmullRomCurve3, s: number, side: number) {
  let room = 0;
  for (const st of streets(main)) {
    if (side !== st.side || s < st.from || s > st.to) continue;
    const o = offsetAt(st, s);
    if (o < 2.6) room = Math.max(room, o + STREET.half);
  }
  return room;
}

/** The street you're on and where (its own road coordinates), or `on` −1. */
const fresh = () => ({ on: -1, s: 0, lat: 0, psi: 0, prev: { s: 0, lat: 0, psi: 0 } });
export const street: ReturnType<typeof fresh> = ((globalThis as { __wayanadStreet?: ReturnType<typeof fresh> }).__wayanadStreet ??= fresh());
export const onStreet = () => game.street >= 0;

/* Changing roads: the car's place and heading in the world, then found on the other road. */
const P = new Vector3(), T = new Vector3(), Q = new Vector3();
function worldPose(curve: CatmullRomCurve3, length: number, s: number, lat: number, psi: number) {
  const t = Math.min(1, Math.max(0, s / length));
  curve.getPointAt(t, P); curve.getTangentAt(t, T); T.setY(0).normalize();
  const lx = T.z, lz = -T.x; // left, flat
  return { x: P.x + lx * lat, z: P.z + lz * lat, yaw: Math.atan2(T.x, T.z) + psi };
}
/** Nearest point on `curve` to (x, z), searched around s0 (±span units): s, signed lateral (+ left), tangent yaw. */
function locate(curve: CatmullRomCurve3, length: number, x: number, z: number, s0: number, span: number) {
  let best = { s: s0, d: Infinity };
  for (let s = Math.max(0, s0 - span); s <= Math.min(length, s0 + span); s += 0.1) {
    curve.getPointAt(s / length, Q); const d = (Q.x - x) ** 2 + (Q.z - z) ** 2;
    if (d < best.d) best = { s, d };
  }
  for (let h = 0.05; h > 0.002; h /= 2) for (const ds of [-h, h]) {
    const s = Math.min(length, Math.max(0, best.s + ds)); curve.getPointAt(s / length, Q);
    const d = (Q.x - x) ** 2 + (Q.z - z) ** 2; if (d < best.d) best = { s, d };
  }
  const t = best.s / length; curve.getPointAt(t, Q); curve.getTangentAt(t, T); T.setY(0).normalize();
  const lat = (x - Q.x) * T.z + (z - Q.z) * -T.x;
  return { s: best.s, lat, yaw: Math.atan2(T.x, T.z) };
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * After the physics each frame (PlayerCar): onto a street at its mouth, or back onto the main road. Returns true when
 * the car changed roads (the caller settles the physics and the camera follows on).
 */
export function switchRoads(main: CatmullRomCurve3): boolean {
  if (game.leg !== 0) { if (game.street >= 0) game.street = -1; return false; }
  const L = main.getLength(), list = streets(main);
  if (game.street < 0) {
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (game.s < st.from || game.s > st.to) continue;
      const o = offsetAt(st, game.s);
      if (game.lat * st.side < SECTION.half * 0.9 || Math.abs(game.lat - st.side * o) > Math.abs(game.lat)) continue;
      const w = worldPose(main, L, game.s, game.lat, game.psi);
      const at = locate(st.curve, st.length, w.x, w.z, game.s - st.from, 12);
      Object.assign(street, { on: i, s: at.s, lat: at.lat, psi: Math.max(-1.1, Math.min(1.1, wrap(w.yaw - at.yaw))) });
      street.prev = { s: street.s, lat: street.lat, psi: street.psi };
      game.street = i;
      projectMain(main);
      return true;
    }
    return false;
  }
  const st = list[game.street];
  if (!st) { game.street = -1; return false; }
  const o = sampled(st, st.off, street.s), atEnd = street.s > st.length - 0.3 || street.s < 0.3;
  // nearer the main road's centre line than the street's, at a mouth (or run out of street): back onto it
  const towardMain = -street.lat * st.side; // + when you're over on the main road's side of the street
  if (!atEnd && !(o < 2.6 && towardMain > 0 && o - towardMain < Math.abs(street.lat))) { projectMain(main); return false; }
  const w = worldPose(st.curve, st.length, street.s, street.lat, street.psi);
  const at = locate(main, L, w.x, w.z, streetMainS(st, street.s), 6);
  game.street = -1;
  game.s = at.s; game.lat = at.lat; game.psi = Math.max(-1.1, Math.min(1.1, wrap(w.yaw - at.yaw)));
  game.prev = { s: game.s, lat: game.lat, psi: game.psi };
  return true;
}

/** On a street: where that is against the main road, kept in game.s/lat/psi for everything else. */
export function projectMain(main: CatmullRomCurve3) {
  const st = streets(main)[game.street]; if (!st) return;
  const L = main.getLength(), w = worldPose(st.curve, st.length, street.s, street.lat, street.psi);
  const at = locate(main, L, w.x, w.z, streetMainS(st, street.s), 1.5);
  game.s = at.s; game.lat = at.lat; game.psi = wrap(w.yaw - at.yaw);
  game.prev = { s: game.s, lat: game.lat, psi: game.psi };
}

/** How far (x, z) is from the nearest street's centre line (units; Infinity with none near). */
export function streetDistance(main: CatmullRomCurve3, x: number, z: number) { return nearestStreet(streets(main), x, z).d; }
/** …and the street's surface height there. */
function nearestStreet(list: Street[], x: number, z: number) {
  let best = Infinity, y = 0;
  for (const st of list) {
    const [x0, x1, z0, z1] = st.box, pad = 3;
    if (x < x0 - pad || x > x1 + pad || z < z0 - pad || z > z1 + pad) continue;
    for (let i = 0; i < st.px.length - 1; i++) {
      const ax = st.px[i], az = st.pz[i], bx = st.px[i + 1] - ax, bz = st.pz[i + 1] - az;
      const u = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1)));
      const d = Math.hypot(x - ax - bx * u, z - az - bz * u); if (d < best) { best = d; y = st.py[i] + (st.py[i + 1] - st.py[i]) * u; }
    }
  }
  return { d: best, y };
}

/* The ground under a street and its footpaths is levelled to the street (a little below its surface), easing back to
 * the natural ground over a few metres: the terrain, the road band, the buildings and the plants all see it. */
setGroundHook((x, z, y) => {
  if (building || !placesT().length) return y; // (only on the real road)
  const list = streets(buildRoadCurve()); if (!list.length) return y;
  const near = nearestStreet(list, x, z); if (near.d > STREET.path + 0.8) return y;
  const k = 1 - MathUtils.smoothstep(near.d, STREET.path + 0.05, STREET.path + 0.8);
  return y + (near.y - 0.008 - y) * k;
});
/** True where something would stand on a street or its footpaths (the towns' lots, trees, rocks keep off). */
export const onStreetGround = (main: CatmullRomCurve3, x: number, z: number, margin = 0) => streetDistance(main, x, z) < STREET.path + margin;
