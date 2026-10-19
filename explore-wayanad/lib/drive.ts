/**
 * The climb's pace: how far along the road you are for a given scroll position, and when the mist hides the road.
 *
 * The road turns ~5,000–6,800° between Adivaram and Lakkidi, far too much to ride at seat level without eye strain in a
 * page-length scroll. So, like a film, the climb is a few seat-level "moments" — hairpin 1, the stacked 3–5, 9, the
 * gateway — joined by stretches the mist swallows (7–8 included: the storyboard has them in full fog). Inside a moment the time spent on each bit of road is
 * proportional to how much it turns, so the view turns at a steady TURN degrees per screen of scroll, never slower than a
 * CRAWL on straighter bits. Between moments the trip moves on at SKIP, hidden (`veilAt` = 1).
 *
 * Shared by the 3D camera, the hairpin counter and the mini-map (no three.js here) so they always agree. The scene calls
 * `setPace` with the real road's turning; until then (or without WebGL) scroll maps linearly onto the road.
 */

export const END = 0.98; // t at the end of the act (the road runs on a little past the camera's last point)
const PACE = {
  turn: 110, // ° of view turn per screen of scroll inside a moment (≈ 110 °/s at a brisk 1 screen per second; less when scrolled gently)
  crawl: 16, // units of road per screen, at least, inside a moment (1 unit = 10 m)
  gate: 9, // units per screen easing up to the gateway
  plateau: 60, // units per screen after the gateway: normal pace, in the open
  skip: 260, // units per screen inside the mist between moments
  edge: 0.006, // t over which the mist closes / clears at a moment's ends
  gateFrom: 0.012, // the gate moment starts this much t before the arch
  gateTo: 0.004, // and the slow crawl ends this much t after it
};
const N = 2000;

type Pace = { cum: Float64Array; veil: Float32Array };
let pace: Pace | null = null;

/** Visible stretches of road (t ranges) from the bend marks: 1, 3–5, 9, then from just before the gate to the end.
 * 7–8 pass inside the fog, as the storyboard has them ("fog at full density, scene nearly white"). */
function moments(bends: number[], arch: number, w = 0.005): [number, number][] {
  return [
    [bends[0] - w, bends[0] + w],
    [bends[2] - w, bends[4] + w],
    [bends[8] - w, bends[8] + w],
    [arch - PACE.gateFrom, END],
  ];
}

/**
 * Build the pace from the road's turning: `turn[i]` = degrees the road's heading turns over sample i of N across t 0–END,
 * `length` = road length in units. Returns the climb's length in screens of scroll at this pace.
 */
export function setPace(turn: Float32Array, length: number, bends: number[], arch: number) {
  const ranges = moments(bends, arch), dt = END / N, ds = dt * length;
  const veil = new Float32Array(N + 1), screens = new Float64Array(N);
  for (let i = 0; i <= N; i++) {
    const t = i * dt;
    let seen = 0;
    for (const [a, b] of ranges) seen = Math.max(seen, Math.min(ramp(t, a - PACE.edge, a), 1 - ramp(t, b, b + PACE.edge)));
    veil[i] = 1 - seen;
  }
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * dt, seen = 1 - (veil[i] + veil[i + 1]) / 2;
    const crawl = t > arch + PACE.gateTo ? PACE.plateau : t > arch - PACE.gateFrom ? PACE.gate : PACE.crawl;
    const inside = Math.max(turn[i] / PACE.turn, ds / crawl), hidden = ds / PACE.skip;
    screens[i] = seen * inside + (1 - seen) * hidden;
  }
  const cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + screens[i];
  const total = cum[N];
  for (let i = 0; i <= N; i++) cum[i] /= total;
  pace = { cum, veil };
  return total;
}

function ramp(x: number, a: number, b: number) {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

/** Act 1 scroll progress q (0–1) → t on the road (0–END). Linear until setPace has run. */
export function driveT(q: number) {
  const x = Math.min(1, Math.max(0, q));
  if (!pace) return x * END;
  const { cum } = pace;
  let lo = 0, hi = N;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= x) lo = mid; else hi = mid; }
  const f = cum[hi] > cum[lo] ? (x - cum[lo]) / (cum[hi] - cum[lo]) : 0;
  return ((lo + f) / N) * END;
}

/** How hidden the road is by the mist at t: 0 in a moment, 1 between moments. */
export function veilAt(t: number) {
  if (!pace) return 0;
  const i = Math.min(N, Math.max(0, Math.round((t / END) * N)));
  return pace.veil[i];
}
