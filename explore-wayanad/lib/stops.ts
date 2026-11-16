import { CatmullRomCurve3, Vector3 } from "three";
import { archT, bendTs, height, roadShapeAt } from "@/lib/terrain";

/**
 * The roadside stops of the churam, worked out once from the road (same curve → same places): the Lakkidi View Point
 * near the top (a stone terrace over the valley, the chai break's stall at its corner) and the chai kadas along the
 * climb, on both sides. Vegetation keeps its trees off them (and out of the viewpoint's view: `clearAt`), the scene
 * builds them (components/scene/Viewpoint, ChaiKadas) and the crowds stand in them (StopCrowds). Units of 10 m.
 */
export type KadaStyle = 0 | 1 | 2 | 3; // 0 traditional (tiles), 1 viewpoint café (open, string lights), 2 monsoon (blue tarp), 3 eco hut (thatch)
export type Stop = {
  kind: "viewpoint" | "kada";
  s: number;            // distance along the road (units)
  side: 1 | -1;         // which side of the road (the road's left = +1)
  valley: boolean;      // on the valley (downhill) side
  at: Vector3;          // the stop's road-side edge, middle (on the road's level)
  along: Vector3;       // the road's direction there (flat)
  out: Vector3;         // away from the road, flat
  yaw: number;          // rotation.y that turns local +z to `out` and +x to `along`
  style: KadaStyle;
  /** the viewpoint: which way the view is (flat, unit) — down the valley at the hairpins below */
  view?: Vector3;
};

export const PLAZA = { w: 3.0, d: 1.5 };       // the viewpoint terrace: 30 m along the road, 15 m deep
export const KADA = { w: 0.42, d: 0.34 };      // a chai kada's footprint with its benches
export const APRON = 0.26;                     // the paving from the road's edge to a stop (to just past the barrier line)
const EDGE = 0.4 + 0.24;                       // from the centre line to just past the barrier posts (+ widen)

const cache = new WeakMap<CatmullRomCurve3, Stop[]>();

function frame(curve: CatmullRomCurve3, s: number) {
  const L = curve.getLength(), t = Math.min(1, Math.max(0, s / L));
  const p = curve.getPointAt(t), along = curve.getTangentAt(t).setY(0).normalize(), left = new Vector3(along.z, 0, -along.x).normalize();
  return { t, p, along, left };
}
/** The straightest, unwidened place within `span` units of `s`. */
function straightest(curve: CatmullRomCurve3, s0: number, span: number) {
  const L = curve.getLength();
  let best = s0, bestTurn = Infinity;
  for (let s = s0 - span; s <= s0 + span; s += 0.5) {
    if (s < 2 || s > L - 2) continue;
    const a = curve.getTangentAt((s - 1) / L), b = curve.getTangentAt((s + 1) / L);
    const turn = 1 - a.dot(b) + roadShapeAt(s / L).widen * 4;
    if (turn < bestTurn) { bestTurn = turn; best = s; }
  }
  return best;
}
function make(curve: CatmullRomCurve3, kind: Stop["kind"], s: number, side: 1 | -1, style: KadaStyle): Stop {
  const { t, p, along, left } = frame(curve, s);
  const out = left.clone().multiplyScalar(side), road = p.y - 0.588;
  const at = p.clone().addScaledVector(out, EDGE + roadShapeAt(t).widen); at.y = road;
  const probe = (k: number) => { const q = p.clone().addScaledVector(left, k); return height(q.x, q.z); };
  return { kind, s, side, valley: (probe(side) < probe(-side)), at, along, out, yaw: Math.atan2(out.x, out.z), style };
}

export function stops(curve: CatmullRomCurve3): Stop[] {
  const hit = cache.get(curve); if (hit) return hit;
  const L = curve.getLength(), bends = bendTs().map((t) => t * L), arch = archT() * L, list: Stop[] = [];
  const valleySide = (s: number): 1 | -1 => { const { p, left } = frame(curve, s); const a = p.clone().addScaledVector(left, 1.2), b = p.clone().addScaledVector(left, -1.2); return height(a.x, a.z) < height(b.x, b.z) ? 1 : -1; };

  // the viewpoint: between the eighth hairpin and the gateway, the place on the valley side that sees the most of the
  // road below (each lower point in front of it, below it, and with no hillside in the way)
  {
    const from = (bends[7] ?? arch - 40) + 6, to = arch - 10;
    const lower: Vector3[] = []; for (let s = 2; s < from - 4; s += 2) lower.push(curve.getPointAt(s / L));
    let best = { score: -1, s: (from + to) / 2, side: 1 as 1 | -1, view: new Vector3(1, 0, 0) };
    for (let s = from; s <= to; s += 1) {
      const side = valleySide(s), { p, left, along } = frame(curve, s), out = left.clone().multiplyScalar(side);
      const eye = p.clone().addScaledVector(out, EDGE + PLAZA.d * 0.8); eye.y = p.y - 0.588 + 0.17;
      const turn = 1 - curve.getTangentAt(Math.max(0, (s - 1.5) / L)).dot(curve.getTangentAt(Math.min(1, (s + 1.5) / L)));
      if (turn > 0.02) continue; // a straight: the terrace runs along it
      let score = 0; const sum = new Vector3();
      for (const q of lower) {
        const d = q.clone().sub(eye), flat = Math.hypot(d.x, d.z);
        if (flat < 2 || flat > 45 || d.y > -0.3) continue;
        if ((d.x * out.x + d.z * out.z) / flat < 0.35) continue; // in front of the railing, within ~70° either way
        let clear = true;
        for (let k = 1; k < 14 && clear; k++) { const f = k / 14, x = eye.x + d.x * f, z = eye.z + d.z * f; if (height(x, z) > eye.y + d.y * f + 0.05) clear = false; }
        if (clear) { score++; sum.add(new Vector3(d.x, 0, d.z).normalize()); }
      }
      void along;
      if (score > best.score) best = { score, s, side, view: sum.lengthSq() > 0 ? sum.normalize() : out.clone() };
    }
    const v = make(curve, "viewpoint", best.s, best.side, 1);
    v.view = best.view; list.push(v);
  }
  // chai kadas: on the straights between the hairpins, alternating sides; one in each style, then round again
  const order: KadaStyle[] = [0, 2, 3, 1, 0, 2];
  [0, 1, 2, 4, 5, 6].forEach((b, i) => {
    if (bends[b + 1] === undefined) return;
    const s = straightest(curve, (bends[b] + bends[b + 1]) / 2, Math.max(2, (bends[b + 1] - bends[b]) * 0.25));
    const vs = valleySide(s), side = (i % 2 === 0 ? vs : -vs) as 1 | -1;
    list.push(make(curve, "kada", s, side, order[i]));
  });
  cache.set(curve, list);
  if (typeof window !== "undefined") (window as unknown as { __wayanadStops?: unknown }).__wayanadStops = list.map((x) => ({ kind: x.kind, s: x.s, side: x.side, valley: x.valley, style: x.style, at: x.at.toArray(), out: [x.out.x, x.out.z] })); // for testing
  return list;
}

/** Keep this spot clear? `tall`: the plant's height (units) when it's a tree — in front of the viewpoint, a tree whose
 * crown would stand above the line of sight sloping down to the hairpins (~12° below level) is left out too. */
export function clearAt(curve: CatmullRomCurve3, x: number, z: number, tall = 0) {
  for (const st of stops(curve)) {
    const dx = x - st.at.x, dz = z - st.at.z;
    const u = dx * st.along.x + dz * st.along.z, v = dx * st.out.x + dz * st.out.z; // along the road, out from it
    const w = st.kind === "viewpoint" ? PLAZA.w : KADA.w * 1.6, d = st.kind === "viewpoint" ? PLAZA.d : KADA.d * 1.4;
    if (Math.abs(u) < w / 2 + 0.15 && v > -0.2 && v < d + 0.25) return true;
    if (tall > 0 && st.view && v > 0) {
      const flat = Math.hypot(dx, dz), cos = (dx * st.view.x + dz * st.view.z) / Math.max(1e-6, flat);
      if (flat < 30 && cos > 0.5 && height(x, z) + tall > st.at.y + 0.17 - flat * 0.21) return true;
    }
  }
  return false;
}

/** A stop's own +x (local "along") in the world: the terrace and kadas are built in that frame. */
export function stopX(st: Stop) { return new Vector3(Math.cos(st.yaw), 0, -Math.sin(st.yaw)); }
/** The distance along the road of a point `u` along a stop (its local x). */
export const stopS = (st: Stop, u: number) => st.s + u * stopX(st).dot(st.along);

/** Where the viewpoint's terrace opens to the road: a gap in the barrier there (Road), `u` along the terrace. */
export const ENTRANCE = { u: -0.55, half: 0.45 };
/** The gaps in the barrier: the terrace's way in, and the front of each kada (its customers stand there). */
export function barrierGaps(curve: CatmullRomCurve3) {
  // (the whole of the terrace's front: its own paving and parapet take the barrier's place; each gap at least 0.8 long,
  // so the guard rail breaks there too instead of running on across it — Road breaks a rail at gaps over 0.75)
  return stops(curve).map((st) => st.kind === "viewpoint" ? { s: st.s, half: PLAZA.w / 2 + 0.1, side: st.side } : { s: st.s, half: Math.max(0.4, KADA.w / 2 + 0.08), side: st.side });
}

/**
 * Standing on a stop's floor? The floor's height, and whether (x, z) is inside its walls — the terrace inside its
 * railings, a kada's floor — or null when not on one. On foot (components/drive/OnFoot) the terrace is walked on, not
 * the valley under it, and its railings hold you in.
 */
export function stopFloor(curve: CatmullRomCurve3, x: number, z: number): { y: number; viewpoint: boolean; v: number } | null {
  for (const st of stops(curve)) {
    const dx = x - st.at.x, dz = z - st.at.z, X = stopX(st);
    const u = dx * X.x + dz * X.z, v = dx * st.out.x + dz * st.out.z;
    // (each with a paved apron from the road's edge, APRON deep, at the road's level: walked straight on to)
    if (st.kind === "viewpoint") {
      if (Math.abs(u) < PLAZA.w / 2 - 0.035 && v > -APRON && v < PLAZA.d - 0.05) return { y: st.at.y, viewpoint: true, v };
    } else if (Math.abs(u) < KADA.w / 2 + 0.06 && v > -APRON && v < 0.07 + KADA.d) return { y: st.at.y + (v > 0.03 ? 0.012 : 0.004), viewpoint: false, v };
  }
  return null;
}
