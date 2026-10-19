/**
 * The climb's pace: how far along the road you are for a given scroll position.
 *
 * One unbroken drive from Adivaram through all nine hairpins to the gateway (the owner's choice: continuous, long scroll).
 * The road turns ~5,000° between Adivaram and Lakkidi along a driver's line, so the time spent on each bit of road is
 * proportional to how much it turns: the view turns at a steady PACE.turn degrees per screen of scroll, and never moves
 * faster than PACE.cruise on the straighter bits. It eases right down approaching the gateway, then runs at normal pace
 * onto the plateau.
 *
 * Shared by the 3D camera, the hairpin counter and the mini-map (no three.js here), so they always agree. The scene calls
 * `setPace` with the real road's turning; until then (or without WebGL) scroll maps linearly onto the road.
 */

export const END = 0.98; // t at the end of the act (the road runs on a little past the camera's last point)
/** Units either side over which the road's heading is averaged into a driver's line (pace and camera use the same). */
export const DRIVER_LINE = 8;
const PACE = {
  turn: 45, // ° of view turn per screen of scroll (≈ 45 °/s at a brisk 1 screen per second; less when scrolled gently)
  cruise: 14, // units of road per screen, at most, where the road runs straight (1 unit = 10 m)
  gate: 4, // units per screen easing up to and under the gateway
  gateFrom: 0.012, // the slow approach starts this much t before the arch
  gateTo: 0.003, // and ends this much t after it
  plateau: 30, // units per screen after the gateway
};
const N = 2000;

let cum: Float64Array | null = null;

/**
 * Build the pace from the road's turning: `turn[i]` = degrees the driver's line turns over sample i of N across t 0–END,
 * `length` = road length in units. Returns the climb's length in screens of scroll at this pace.
 */
export function setPace(turn: Float32Array, length: number, arch: number) {
  const dt = END / N, ds = dt * length, screens = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * dt;
    const cap = t > arch + PACE.gateTo ? PACE.plateau : t > arch - PACE.gateFrom ? PACE.gate : PACE.cruise;
    screens[i] = Math.max(turn[i] / PACE.turn, ds / cap);
  }
  const out = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) out[i + 1] = out[i] + screens[i];
  const total = out[N];
  for (let i = 0; i <= N; i++) out[i] /= total;
  cum = out;
  return total;
}

/** Act 1 scroll progress q (0–1) → t on the road (0–END). Linear until setPace has run. */
export function driveT(q: number) {
  const x = Math.min(1, Math.max(0, q));
  if (!cum) return x * END;
  let lo = 0, hi = N;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= x) lo = mid; else hi = mid; }
  const f = cum[hi] > cum[lo] ? (x - cum[lo]) / (cum[hi] - cum[lo]) : 0;
  return ((lo + f) / N) * END;
}
