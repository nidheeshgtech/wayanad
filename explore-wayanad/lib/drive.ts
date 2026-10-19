/**
 * The drive's pace: how far along the road you are for a given scroll position, in two acts on one road.
 *
 * Act 1, the churam: one unbroken drive from Adivaram through all nine hairpins to the gateway and a little past it (the
 * owner's choice: continuous, long scroll). The road turns ~5,000° on the way, so the time spent on each bit of road is
 * proportional to how much it turns — the view turns at a steady CHURAM.turn degrees per screen of scroll — and never
 * moves faster than CHURAM.cruise on the straighter bits. It eases right down approaching the gateway.
 * Act 2, Lakkidi → Vythiri → Chundale → Kalpetta: the same rule on the plateau road, at a quicker cruise.
 *
 * Shared by the 3D camera, the hairpin counter and the mini-map (no three.js here), so they always agree. The scene calls
 * `setPace` with the real road's turning; until then (or without WebGL) scroll maps linearly onto the road.
 */

/** Units either side over which the road's heading is averaged into a driver's line, for the pace. */
export const DRIVER_LINE = 8;
/** Where the acts begin and end, as t on the road (set by setPace from the baked road). */
export const ROUTE = { churamEnd: 0.98, end: 0.995 };

const CHURAM = {
  turn: 45, // ° of view turn per screen of scroll (≈ 45 °/s at a brisk 1 screen per second; less when scrolled gently)
  cruise: 14, // units of road per screen, at most, where the road runs straight (1 unit = 10 m)
  gate: 4, // units per screen easing up to and under the gateway
  gateFrom: 0.012, // the slow approach starts this much t before the arch
  gateTo: 0.003, // and ends this much t after it
  after: 30, // units per screen after the gateway
};
const PLATEAU = { turn: 80, cruise: 110 }; // Act 2: wider, gentler road; 1.1 km per screen on the straights

type Table = { from: number; to: number; cum: Float64Array };
let churam: Table | null = null, plateau: Table | null = null;

/**
 * Build both acts' pace from the road's turning: `turn[i]` = degrees the driver's line turns over sample i of
 * turn.length across t 0–ROUTE.end, `length` = road length in units. Returns each act's length in screens of scroll.
 */
export function setPace(turn: Float32Array, length: number, arch: number, churamEnd: number, end = ROUTE.end) {
  ROUTE.churamEnd = churamEnd; ROUTE.end = end;
  const N = turn.length, dt = end / N, ds = dt * length;
  const build = (from: number, to: number, screensAt: (t: number, deg: number) => number): [Table, number] => {
    const i0 = Math.floor(from / dt), i1 = Math.min(N, Math.ceil(to / dt)), cum = new Float64Array(i1 - i0 + 1);
    for (let i = i0; i < i1; i++) cum[i - i0 + 1] = cum[i - i0] + screensAt((i + 0.5) * dt, turn[i]);
    const total = cum[cum.length - 1];
    for (let i = 0; i < cum.length; i++) cum[i] /= total;
    return [{ from: i0 * dt, to: i1 * dt, cum }, total];
  };
  let screens1: number, screens2: number;
  [churam, screens1] = build(0, churamEnd, (t, deg) => {
    const cap = t > arch + CHURAM.gateTo ? CHURAM.after : t > arch - CHURAM.gateFrom ? CHURAM.gate : CHURAM.cruise;
    return Math.max(deg / CHURAM.turn, ds / cap);
  });
  [plateau, screens2] = build(churamEnd, end, (_, deg) => Math.max(deg / PLATEAU.turn, ds / PLATEAU.cruise));
  return { churam: screens1, plateau: screens2 };
}

function lookup(table: Table | null, q: number, from: number, to: number) {
  const x = Math.min(1, Math.max(0, q));
  if (!table) return from + x * (to - from);
  const { cum } = table, n = cum.length - 1;
  let lo = 0, hi = n;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= x) lo = mid; else hi = mid; }
  const f = cum[hi] > cum[lo] ? (x - cum[lo]) / (cum[hi] - cum[lo]) : 0;
  return table.from + ((lo + f) / n) * (table.to - table.from);
}

/** Act 1 scroll progress q (0–1) → t on the road (0–ROUTE.churamEnd). */
export function driveT(q: number) {
  return lookup(churam, q, 0, ROUTE.churamEnd);
}

/** Act 2 scroll progress q (0–1) → t on the road (ROUTE.churamEnd–ROUTE.end). */
export function driveT2(q: number) {
  return lookup(plateau, q, ROUTE.churamEnd, ROUTE.end);
}
