/**
 * Points for the climb. Plain mutable state like lib/game (one object for the page; the HUD and the scene load in
 * different chunks), never React state per frame.
 *
 *   driving          +1 for every 10 m of new road (one unit; reversing and driving it again earns nothing)
 *   gold coin        +10            (components/drive/Coins.tsx lays them on the road)
 *   hairpin coin     +50            (one big coin on the inside of each of the nine hairpins)
 *   hitting a vehicle −50
 *   on the barrier    −5 a second
 *   Reset (R)        −100
 *   monkey ride      +20            (components/scene/Monkeys.tsx: one jumps on your car at a hairpin)
 *   the Lakkidi gate  a time bonus: 2 points for every second under 25 minutes
 *
 * Clean driving multiplies what you earn: ×2 after 30 s on the move without hitting anything, ×3 after 60 s. A crash
 * (a vehicle, or the barrier hard) drops it back to ×1. The score never goes below 0. Each gain or loss is queued in
 * `pops` for the HUD to float up ("+10", "−50", "×2").
 */
import { chime } from "@/lib/horn";
import { NITRO, game } from "@/lib/game";

export const POINTS = { coin: 10, big: 50, crash: 50, scrape: 5, reset: 100 };
const STREAK = [[60, 3], [30, 2]] as const; // seconds clean → multiplier
const PAR = 25 * 60, BONUS_PER_SEC = 2;      // the time bonus: under 25 minutes, 2 points a second
const BEST = "wayanad-best-score";

type Pop = { text: string; kind: "gain" | "big" | "loss" | "mult" | "badge" };
const fresh = () => ({
  run: 0,                           // bumped by begin(): the coins come back
  points: 0, coins: 0, big: 0, crashes: 0,
  clean: 0, mult: 1,                // seconds on the move since the last crash, and what it multiplies by
  far: 0, dist: 0, drag: 0,         // furthest point reached (units), and fractions of a point not yet added
  bonus: 0, best: 0, isNew: false,  // at the gate
  pops: [] as Pop[],
});
export const score: ReturnType<typeof fresh> = ((globalThis as { __wayanadScore?: ReturnType<typeof fresh> }).__wayanadScore ??= fresh());

const add = (n: number) => { score.points = Math.max(0, score.points + n); };
const pop = (text: string, kind: Pop["kind"]) => { if (score.pops.length < 12) score.pops.push({ text, kind }); };

/** A message floating up from the car (a badge earned: lib/badges). */
export function announce(text: string, kind: Pop["kind"] = "badge") { pop(text, kind); }

/** A new climb from road position `s` (units): everything back to zero, the coins back on the road. */
export function begin(s: number) {
  Object.assign(score, { points: 0, coins: 0, big: 0, crashes: 0, clean: 0, mult: 1, far: s, dist: 0, drag: 0, bonus: 0, isNew: false, pops: [] });
  score.run++;
  game.nitro = NITRO.start;
}

/** Each frame on the road: new distance earns points, and time on the move without a crash builds the multiplier. */
export function drive(dt: number, s: number, speed: number) {
  if (s > score.far) { score.dist += (s - score.far) * score.mult; score.far = s; }
  if (score.dist >= 1) { const n = Math.floor(score.dist); score.dist -= n; add(n); }
  if (speed > 0.15) score.clean += dt;
  const mult = STREAK.find(([sec]) => score.clean >= sec)?.[1] ?? 1;
  if (mult > score.mult) pop(`×${mult} clean driving`, "mult");
  score.mult = mult;
}

export function coin(big = false) {
  const n = (big ? POINTS.big : POINTS.coin) * score.mult;
  if (big) score.big++; else score.coins++;
  add(n); pop(`+${n}`, big ? "big" : "gain"); chime(big);
  game.nitro = Math.min(1, game.nitro + (big ? NITRO.big : NITRO.coin)); // coins fill the nitro
}

/** A one-off bonus (a monkey riding on your car), multiplied like the rest; `label` floats up with the points. */
export function bonus(n: number, label: string) {
  const pts = n * score.mult;
  add(pts); pop(`${label} +${pts}`, "big");
}

/** Hit a vehicle (`penalty`), or the barrier hard (no penalty, only the streak lost). */
export function crash(penalty = true) {
  const lost = score.mult > 1;
  score.clean = 0; score.mult = 1;
  if (penalty) { score.crashes++; add(-POINTS.crash); pop(`−${POINTS.crash}`, "loss"); }
  else if (lost) pop("Streak lost", "loss");
}

/** On the barrier: points drain while you grind along it. */
export function scrape(dt: number) {
  score.drag += POINTS.scrape * dt;
  if (score.drag >= 1) { const n = Math.floor(score.drag); score.drag -= n; add(-n); }
}

export function resetPenalty() { add(-POINTS.reset); pop(`−${POINTS.reset}`, "loss"); score.clean = 0; score.mult = 1; }

/** At the gate: the time bonus, and your best score on this device (a climb started part-way isn't kept). */
export function finish(sec: number, keep = true) {
  score.bonus = Math.max(0, Math.round((PAR - sec) * BONUS_PER_SEC));
  add(score.bonus);
  let best = 0;
  try { best = Number(localStorage.getItem(BEST)) || 0; } catch {}
  score.isNew = keep && score.points > best;
  if (score.isNew) { best = score.points; try { localStorage.setItem(BEST, String(best)); } catch {} }
  score.best = best;
}
