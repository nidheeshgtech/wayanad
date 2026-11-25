/**
 * Churam Jobs (data/jobs): stop in a job's circle past the Lakkidi gate and the errand starts; drive to the drop and stop
 * in its circle to finish, before the clock (and, with a passenger, without too many hits). Pay goes into the wallet,
 * rupees kept across climbs (localStorage). Plain mutable state like lib/game: the scene (components/drive/Jobs) steps
 * it, the HUD (components/drive/JobHud) and the radar read it. Solo and open rooms only: never in a private room (net.party),
 * where everyone drives the same race.
 */
import { JOBS, type Job } from "@/data/jobs";
import { game } from "@/lib/game";
import { score, announce } from "@/lib/score";
import { net } from "@/lib/net";
import { chime } from "@/lib/horn";
import { haptic } from "@/lib/native";
import { legRoad } from "@/lib/streets";

const WALLET = "wayanad-rupees";
export const STOP = { reach: 0.8, still: 0.04, hold: 1.0 }; // within 8 m along the road, stopped for a second

type Result = { job: Job; ok: boolean; line: string; at: number; title?: string; amount?: string };
const fresh = () => ({
  run: -1,                         // the climb (score.run) the job list belongs to: each job once a climb
  done: new Set<string>(),         // finished or failed this climb
  active: null as null | { job: Job; left: number; crashes: number }, // seconds left on the clock (game.clock stops when you do; this doesn't)
  intro: 0,                        // performance.now() the active job's card went up
  result: null as null | Result,   // the last job's end, for the HUD's card
  wait: 0,                         // seconds stopped in a circle
  near: null as null | Job,        // a job's circle you're in or coming up to (HUD prompt)
  rupees: 0, loaded: false,
  paid: 0,                         // bumped on every payment (the HUD's wallet animates)
});
export const jobs: ReturnType<typeof fresh> = ((globalThis as { __wayanadJobs?: ReturnType<typeof fresh> }).__wayanadJobs ??= fresh());

function load() {
  if (jobs.loaded || typeof window === "undefined") return;
  jobs.loaded = true;
  try { jobs.rupees = Math.max(0, Number(localStorage.getItem(WALLET)) || 0); } catch {}
}
export function wallet() { load(); return jobs.rupees; }
function pay(n: number) {
  load(); jobs.rupees += n; jobs.paid++;
  try { localStorage.setItem(WALLET, String(jobs.rupees)); } catch {}
}

/** Spend from the wallet (lib/shop): false, and nothing taken, if there isn't enough. */
export function spend(n: number) {
  load(); if (jobs.rupees < n) return false;
  jobs.rupees -= n; jobs.paid++;
  try { localStorage.setItem(WALLET, String(jobs.rupees)); } catch {}
  return true;
}

/** Jobs run here: driving the main road (leg 0), past the gate, not in a private room. */
export function jobsOn() {
  return game.started && game.phase === "drive" && game.street < 0 && !net.party && !game.foot.on;
}
/** The jobs on the road you're driving. */
export const jobsHere = () => JOBS.filter((j) => (j.road ?? "churam") === legRoad());

/** Seconds the clock gives a job: the road between at its pace, and half a minute to get going. */
export const allowed = (j: Job) => Math.round(((j.drop - j.pick) * 10) / j.pace + 30);

/** Where the next marker is (road units), for the radar: the drop of the job you're on, else the nearest job ahead. */
export function target(): number {
  if (jobs.active) return jobs.active.job.drop;
  let best = -1;
  for (const j of jobsHere()) if (!jobs.done.has(j.id) && j.pick > game.s - 5 && (best < 0 || j.pick < best)) best = j.pick;
  return best;
}
/** The circles to draw: the active job's drop, or every pickup still open. */
export function markers(): { s: number; drop: boolean; job: Job }[] {
  if (jobs.active) return [{ s: jobs.active.job.drop, drop: true, job: jobs.active.job }];
  return jobsHere().filter((j) => !jobs.done.has(j.id)).map((j) => ({ s: j.pick, drop: false, job: j }));
}

function end(ok: boolean, line: string) {
  const a = jobs.active!;
  jobs.done.add(a.job.id); jobs.active = null;
  jobs.result = { job: a.job, ok, line, at: performance.now() };
  if (ok) { pay(a.job.pay); announce(`+₹${a.job.pay}`, "big"); chime(true); haptic("success"); }
  else { chime(false); haptic("warning"); }
}

/* The police (lib/chase): caught, a fine out of the wallet; got away, the reward for it. SI Rajan has the last word. */
const POLICE: Job = { id: "police", who: "SI Rajan", role: "Kerala Police · Wayanad", initials: "SI", tint: "#2f6bff", kind: "deliver",
  pick: 0, drop: 0, dropName: "", cargo: "", pay: 0, pace: 1, offer: "", done: "", fail: "" };
const BUSTED = [
  "Saare, license onnu kaanikku. Ithra speed-il aano Wayanad-il? Fine adachittu pokko.",
  "Churam kayari vannathinte aavesham aano? Pathukke po, mone. Ithaa receipt.",
  "Formula One aano ningal? Ivide 60 aanu limit. Fine adakku, ennittu po.",
];
const ESCAPED = [
  "Avan evide poyi?! Adutha thavana njan pidikkum, nokkikko!",
  "Jeep-inu ithra speed illa saare… avan rakshappettu.",
  "Ee payyan aara? Number plate polum kandilla!",
];
export function policeEnd(caught: boolean, stars: number) {
  load();
  const line = (caught ? BUSTED : ESCAPED)[Math.floor(Math.random() * 3)];
  if (caught) {
    const n = Math.min(jobs.rupees, 250 * Math.max(1, stars));
    jobs.rupees -= n; jobs.paid++;
    try { localStorage.setItem(WALLET, String(jobs.rupees)); } catch {}
    jobs.result = { job: POLICE, ok: false, line, at: performance.now(), title: "Pidichu! Fine", amount: n ? `−₹${n}` : "₹0 (pocket kaali!)" };
  } else {
    const n = 150 * Math.max(1, stars);
    pay(n);
    jobs.result = { job: POLICE, ok: true, line, at: performance.now(), title: "Rakshappettu!", amount: `+₹${n}` };
  }
}

/* The forest guards (lib/forestPosts): over the sanctuary's limit at a check, a fine; no chase, they have your number. */
const GUARD: Job = { id: "forest", who: "Forest guard", role: "Kerala Forest Dept · Muthanga", initials: "FD", tint: "#2f6b3a", kind: "deliver",
  pick: 0, drop: 0, dropName: "", cargo: "", pay: 0, pace: 1, offer: "", done: "", fail: "" };
const FINED = [
  "Ithu sanctuary aanu, race track alla! Aana road-il irangiyaal enthu cheyyum? Fine adakku.",
  "Maan-um kaattupothum okke ivide road cross cheyyum, saare. 40-il pokanam. Ithaa receipt.",
  "Speed kurakku, mone. Kaadu avarudethaanu, nammal athithikal maathram.",
];
export function forestFine(kmh: number, limit: number, where: string) {
  load();
  const want = 200 + Math.round(Math.max(0, kmh - limit) / 10) * 50, n = Math.min(jobs.rupees, want);
  jobs.rupees -= n; jobs.paid++;
  try { localStorage.setItem(WALLET, String(jobs.rupees)); } catch {}
  jobs.result = { job: { ...GUARD, role: `Kerala Forest Dept · ${where}` }, ok: false, line: FINED[Math.floor(Math.random() * FINED.length)], at: performance.now(),
    title: `${kmh} km/h in the sanctuary`, amount: n ? `−₹${n}` : "₹0 (pocket kaali!)" };
  chime(false); haptic("warning");
}

/** Give up on the job you're on (the HUD's ✕). */
export function cancelJob() {
  if (!jobs.active) return;
  end(false, "Saramilla, pinne nokkaam.");
}

/** Each frame (components/drive/Jobs). */
export function stepJobs(dt: number) {
  load();
  if (jobs.run !== score.run) { jobs.run = score.run; jobs.done.clear(); jobs.active = null; jobs.wait = 0; } // a new climb
  if (!jobsOn()) { jobs.near = null; jobs.wait = 0; return; }
  if (game.paused) return;
  const still = Math.abs(game.speed) < STOP.still;
  const a = jobs.active;
  if (a && (a.job.road ?? "churam") !== legRoad()) { jobs.active = null; return; } // (driven on to the other road: dropped)
  if (a) {
    jobs.near = null;
    a.left -= Math.min(dt, 0.1);
    if (a.job.crashes !== undefined && score.crashes - a.crashes > a.job.crashes) { end(false, a.job.crashed ?? a.job.fail); return; }
    if (a.left <= 0) { end(false, a.job.fail); return; }
    const inCircle = Math.abs(game.s - a.job.drop) < STOP.reach;
    jobs.wait = inCircle && still ? jobs.wait + Math.min(dt, 0.1) : 0;
    if (jobs.wait >= STOP.hold) { jobs.wait = 0; end(true, a.job.done); }
    return;
  }
  // no job: the nearest open circle ahead, or the one you're in
  let near: Job | null = null;
  for (const j of jobsHere()) {
    if (jobs.done.has(j.id)) continue;
    const d = j.pick - game.s;
    if (d > -STOP.reach && d < 30 && (!near || j.pick < near.pick)) near = j;
  }
  jobs.near = near;
  const inCircle = !!near && Math.abs(game.s - near.pick) < STOP.reach;
  jobs.wait = inCircle && still ? jobs.wait + Math.min(dt, 0.1) : 0;
  if (near && jobs.wait >= STOP.hold) {
    jobs.wait = 0;
    jobs.active = { job: near, left: allowed(near), crashes: score.crashes };
    jobs.intro = performance.now(); jobs.result = null;
    chime(true); haptic("medium");
  }
}
