/**
 * The race up the churam with the others in your room (lib/net): everyone drives the same road, so who's ahead is just
 * who's further along it (`s`). `standings()` orders the room — those who've reached Lakkidi first (in the order they
 * got there, as far as this page saw it), then everyone on the road by how far up they are, then those still at the
 * start — with each one's gap to you in metres. `watch()` runs each frame and floats up a word when you pass someone,
 * someone passes you, or someone reaches the top.
 *
 * Positions come from the room's updates: ten a second for drivers within 600 m, once a second for the rest, so far-off
 * gaps step once a second. Plain functions over lib/net and lib/game, no React state.
 */
import { game } from "@/lib/game";
import { net } from "@/lib/net";
import { announce, score } from "@/lib/score";

export type Row = { id: number; name: string; me: boolean; s: number; done: boolean; waiting: boolean; place: number };
export type Standings = { rows: Row[]; me: number; total: number };

const PASS = { margin: 0.25, cooldown: 3000 }; // units clear of each other before it counts as a pass (2.5 m), ms between words about one driver
const side = new Map<number, number>();         // per driver: 1 ahead of you, −1 behind, 0 not known yet
const quiet = new Map<number, number>();        // per driver: no word about them before this time
const doneAt = new Map<number, number>();       // per driver (and you, id 0 → net.id): when they were first seen at the top
const lastS = new Map<number, number>();
let run = -1;

const latest = (id: number) => { const b = net.remotes.get(id)?.buf; return b?.length ? b[b.length - 1] : null; };
const finished = (s: number) => game.finishS > 0 && s >= game.finishS;

export function ordinal(n: number) {
  const t = n % 100, u = n % 10;
  return `${n}${t >= 11 && t <= 13 ? "th" : u === 1 ? "st" : u === 2 ? "nd" : u === 3 ? "rd" : "th"}`;
}

/** "+80 m", "−1.2 km": how far ahead (+) or behind (−) of you, in road distance. */
export function gapText(units: number) {
  const m = Math.round(units * 10), a = Math.abs(m), sign = m > 0 ? "+" : m < 0 ? "−" : "";
  return a < 1000 ? `${sign}${a} m` : `${sign}${(a / 1000).toFixed(1)} km`;
}

/** Is there a race to show: a live room with someone else in it, on the churam. */
export function racing() {
  return net.enabled && net.status === "live" && net.roster.length > 0 && game.leg === 0 && game.started;
}

export function standings(): Standings {
  const now = performance.now(), rows: Row[] = [];
  const meDone = game.phase === "gate";
  if (meDone && !doneAt.has(net.id)) doneAt.set(net.id, now);
  if (!meDone) doneAt.delete(net.id);
  rows.push({ id: net.id, name: game.driver || "You", me: true, s: game.s, done: meDone, waiting: false, place: 0 });
  for (const p of net.roster) {
    const st = latest(p.id), s = st?.s ?? 0, done = !!st && finished(s);
    if (done && !doneAt.has(p.id)) doneAt.set(p.id, now);
    if (!done) doneAt.delete(p.id);
    rows.push({ id: p.id, name: p.name, me: false, s, done, waiting: !st, place: 0 });
  }
  const rank = (r: Row) => (r.done ? 0 : r.waiting ? 2 : 1);
  rows.sort((a, b) => rank(a) - rank(b) || (a.done ? doneAt.get(a.id)! - doneAt.get(b.id)! : b.s - a.s));
  rows.forEach((r, i) => { r.place = i + 1; });
  return { rows, me: rows.findIndex((r) => r.me), total: rows.length };
}

/** Each frame while driving: a word when you pass someone, they pass you, or they reach the top. */
export function watch() {
  if (run !== score.run) { run = score.run; side.clear(); } // a new climb (Start, Restart): nobody's been passed
  if (!racing() || game.phase !== "drive" || game.paused) return;
  const now = performance.now();
  let place = 0;
  for (const p of net.roster) {
    const st = latest(p.id);
    if (!st) continue;
    const before = lastS.get(p.id);
    lastS.set(p.id, st.s);
    if (before !== undefined && st.s < before - 2) { side.set(p.id, 0); continue; } // they restarted
    if (finished(st.s)) {
      if (before !== undefined && !finished(before)) announce(`🏁 ${p.name} reached Lakkidi`, "badge");
      continue;
    }
    const d = st.s - game.s, was = side.get(p.id) ?? 0;
    if (Math.abs(d) < PASS.margin) continue;
    const is = d > 0 ? 1 : -1;
    side.set(p.id, is);
    if (!was || was === is || now < (quiet.get(p.id) ?? 0)) continue;
    quiet.set(p.id, now + PASS.cooldown);
    if (is < 0) { place ||= standings().me + 1; announce(`Passed ${p.name}! ▲ ${ordinal(place)}`, "big"); }
    else announce(`${p.name} passed you`, "loss");
  }
  // drivers who've left the room
  for (const id of lastS.keys()) if (!net.roster.some((p) => p.id === id)) { side.delete(id); quiet.delete(id); lastS.delete(id); doneAt.delete(id); }
}
