/**
 * Police chase (the phone apps; ?chase on the site for testing). Take the police jeep — or any vehicle with a patrol
 * nearby, or ram a patrol — and you're wanted (1–5 stars). Patrols come up the road behind you, lights and siren on:
 * one at a star, two at two, three from three, and from three stars one of them gets by you and slows in front, to box
 * you in. Traffic pulls over for them, as for the ambulance.
 * - Busted: stopped with a patrol right on you for a few seconds. Points off; if you'd taken someone's vehicle, you're
 *   back in your own where you left it.
 * - Escaped: keep them well back (over ~40 m) and the stars drop one at a time; at none you're clear, with a bonus.
 * Not in a friends' room (races stay as they are). No guns, no violence: a driving chase.
 *
 * The chasers are ordinary traffic vehicles (police patrols from the fleet) driven here instead of by advanceTraffic
 * (`driven`): a few per frame, so it costs nothing worth measuring. Traffic draws their lights; lib/emergency their yelp.
 */
import { game, resetCar, CAR } from "@/lib/game";
import { net } from "@/lib/net";
import { announce, bonus, fine } from "@/lib/score";
import { POLICE, VEHICLES, type Vehicle } from "@/lib/traffic";
import { setBorrow, getBorrow } from "@/lib/choice";
import { haptic, platform } from "@/lib/native";
import { scrollState } from "@/lib/scrollState";
import { policeEnd } from "@/lib/jobs";

export type ChaseState = {
  stars: number; peak: number; chasers: number[]; blocker: number; lost: number; held: number; busted: number;
  rammed: Set<number>; nearest: number; version: number;
};
export const chase: ChaseState = ((globalThis as { __wayanadChase?: ChaseState }).__wayanadChase ??=
  { stars: 0, peak: 0, chasers: [], blocker: -1, lost: 0, held: 0, busted: 0, rammed: new Set(), nearest: Infinity, version: 0 });

/** Tuning (units of 10 m, seconds). Your car tops out at 2.8 (100 km/h); a patrol at 2.45 on the straight, slower in
 * the bends than you can take them, so a good line gets away and a bad one gets caught. */
const C = { max: 2.55, bend: 0.7, accel: 0.9, brake: 1.6, behind: 4.5, lose: 4, drop: 8, bust: 2.5, near: 0.5, still: 0.08, gapBehind: 0.35, spacing: 0.6, ahead: 0.7,
  beside: 0.22 }; // the first one rides alongside, just behind your door, 3 m across from you

/** Is the chase on here: the apps, or the site with ?chase (testing); never in a friends' room. */
export function chaseOn() {
  if (typeof window === "undefined" || net.party) return false;
  if (platform() !== "web" || /[?&]chase\b/.test(location.search)) return true;
  // the site: past the Lakkidi gate (the climb itself stays calm), where the speed checks are (lib/checkposts)
  return game.leg === 0 && game.roadLength > 0 && game.s > scrollState.arch * game.roadLength + 3;
}

const want = (stars: number) => (stars <= 0 ? 0 : stars === 1 ? 1 : stars === 2 ? 2 : 3);
const half = (v: Vehicle) => VEHICLES[v.kind].length / 2;

/** You did something: up to `stars` (at least), or `+add` on top. */
export function wanted(why: string, { stars = 0, add = 0 } = {}) {
  if (!chaseOn() || !game.started) return;
  const next = Math.min(5, Math.max(chase.stars + add, stars));
  if (next <= chase.stars) return;
  const fresh = chase.stars === 0;
  chase.stars = next; chase.peak = Math.max(chase.peak, next); chase.lost = 0; chase.version++;
  announce(`${fresh ? "Police! 🚨 " : ""}${why} · ${"⭐".repeat(next)}`, "loss");
  haptic("warning");
}

/** A patrol within this far (units) when you take something: they saw. */
export function patrolNear(fleet: Vehicle[], s: number, within = 6) {
  return fleet.some((v) => v.kind === POLICE && Math.abs(v.distance - s) < within && !chase.chasers.includes(v.id));
}

/** Let the chasers go: back to being traffic, lights off. */
function release(fleet: Vehicle[], ids: number[]) {
  for (const id of ids) {
    const v = fleet.find((x) => x.id === id); if (!v) continue;
    v.mode = "cruise"; v.shift = 0; v.speed = Math.min(v.speed, VEHICLES[v.kind].speed);
  }
  chase.chasers = chase.chasers.filter((id) => !ids.includes(id));
  if (ids.includes(chase.blocker)) chase.blocker = -1;
}

function end(fleet: Vehicle[]) { release(fleet, [...chase.chasers]); chase.stars = 0; chase.peak = 0; chase.lost = 0; chase.held = 0; chase.blocker = -1; chase.nearest = Infinity; chase.version++; }

/**
 * Each frame (Traffic, drive mode, before advanceTraffic): recruit or let go of chasers for the stars, drive them, make
 * way for them, and see whether you're caught or clear. `length`: the road's; `bendAt(d)`: how sharply it turns there;
 * `latOf(v)`: where a vehicle is across the road (as collidePlayer has it).
 * Returns the ids it drove (advanceTraffic leaves those alone).
 */
export function tickChase(fleet: Vehicle[], length: number, bendAt: (d: number) => number, latOf: (v: Vehicle) => number, dt: number): Set<number> {
  const driven = new Set<number>();
  if (chase.stars === 0) { if (chase.chasers.length) end(fleet); return driven; }
  if (!chaseOn() || !game.started || game.leg !== 0 || game.phase !== "drive") { end(fleet); return driven; }
  if (game.paused) { for (const id of chase.chasers) driven.add(id); return driven; }
  const s = game.s, span = length - 4;
  // ram a patrol: one more star (once per knock)
  // (you into them: it's ahead of you, or you were going some; one of them nudging you from behind isn't yours)
  for (const v of fleet) if (v.kind === POLICE && (v.jolt ?? 0) > 0 && (v.joltT ?? 9) < 0.3 && Math.abs(v.distance - s) < 1.2 && !chase.rammed.has(v.id)
    && (v.distance > s || Math.abs(game.speed) > 0.6)) {
    chase.rammed.add(v.id); wanted("Rammed a patrol", { add: 1 });
  }
  for (const id of [...chase.rammed]) { const v = fleet.find((x) => x.id === id); if (!v || !((v.jolt ?? 0) > 0)) chase.rammed.delete(id); }
  // as many as the stars call for: patrols from the fleet, brought up behind you out of sight
  const need = want(chase.stars);
  if (chase.chasers.length > need) release(fleet, chase.chasers.slice(need));
  while (chase.chasers.length < need) {
    const spare = fleet.filter((v) => v.kind === POLICE && !chase.chasers.includes(v.id))
      .sort((a, b) => Math.abs(a.distance - s) - Math.abs(b.distance - s))[0];
    if (!spare) break;
    const k = chase.chasers.length;
    Object.assign(spare, { direction: 1, distance: Math.max(2.5, s - C.behind - k * 1.2), speed: Math.max(0, game.speed), mode: "cruise", shift: 0, jolt: 0, aside: undefined, wait: 0 });
    chase.chasers.push(spare.id);
  }
  if (chase.stars >= 3 && chase.blocker < 0 && chase.chasers.length) chase.blocker = chase.chasers[0];
  // drive them: close in behind you (in a line), the blocker past you and slowing just ahead
  let nearest = Infinity;
  chase.chasers.forEach((id, k) => {
    const v = fleet.find((x) => x.id === id); if (!v) return;
    driven.add(id);
    if ((v.jolt ?? 0) > 0) { v.jolt = Math.max(0, v.jolt! - dt); if (v.joltT !== undefined) v.joltT += dt; v.speed = 0; return; } // rammed: shaken a moment
    // -1 the blocker (ahead of you), 0 alongside you (where you can see it; with a blocker there's none, it's the one
    // you see), 1… in a line behind
    const line = chase.blocker === id ? -1 : chase.chasers.filter((x) => x !== chase.blocker).indexOf(id) + (chase.blocker >= 0 ? 1 : 0);
    const target = line < 0 ? s + CAR.halfL + half(v) + (Math.abs(game.speed) < 0.3 ? 0.2 : C.ahead) : line === 0 ? s - C.beside : s - CAR.halfL - half(v) - C.gapBehind - (line - 1) * C.spacing;
    const gap = target - v.distance;
    const bend = Math.max(0.3, bendAt(v.distance));
    const cap = Math.min(C.max, C.bend / bend);
    let wantSpeed = Math.max(0, game.speed) + Math.max(-1.2, Math.min(1.6, gap * 1.4));
    if (line < 0 && gap < 0.15) wantSpeed = Math.max(0, game.speed * 0.6); // ahead of you now: ease off, in the way
    wantSpeed = Math.max(0, Math.min(cap, wantSpeed));
    v.speed = v.speed < wantSpeed ? Math.min(wantSpeed, v.speed + C.accel * dt) : Math.max(wantSpeed, v.speed - C.brake * dt);
    // never into the back of you: until it's out beside you (clear across the road), it stays behind
    const room = s - CAR.halfL - half(v) - 0.03 - v.distance;
    const clear = Math.abs(game.lat - latOf(v)) > VEHICLES[v.kind].width / 2 + CAR.halfW + 0.02;
    let move = v.speed * dt;
    if ((line > 0 || !clear) && room > -0.4) { move = Math.min(move, Math.max(0, room)); if (room <= 0) v.speed = Math.min(v.speed, Math.max(0, game.speed)); }
    v.distance = 2 + ((v.distance - 2 + move) % span + span) % span;
    // along the centre line to get by the traffic (and you, for the blocker), else in behind you
    const passing = line < 0 && v.distance < s + CAR.halfL + half(v) + 0.05;
    const busy = fleet.some((o) => o !== v && o.direction === 1 && !chase.chasers.includes(o.id) && o.distance - v.distance > 0 && o.distance - v.distance < 1.4);
    // beside you on whichever side has the room: out over the centre line when you're in your lane, inside you when
    // you're over in the other one (shift in edge-room steps of 0.05 from the lane's middle at 0.2)
    const besideLat = game.lat > 0.02 ? game.lat - 0.3 : game.lat + 0.3;
    const beside = Math.max(-9, Math.min(4, (besideLat - 0.2) / 0.05));
    const goal = line === 0 || passing ? beside : busy ? -4 : Math.max(-4, Math.min(1, (game.lat - 0.2) / 0.05));
    v.shift = (v.shift ?? 0) + (goal - (v.shift ?? 0)) * Math.min(1, dt * 3);
    v.mode = "cruise";
    // make way: the traffic ahead of it pulls over, as for an ambulance
    for (const o of fleet) {
      if (o === v || chase.chasers.includes(o.id)) continue;
      const d = (o.distance - v.distance);
      if (o.direction === 1 ? d > 0 && d < 3.5 : Math.abs(d) < 2.5) o.aside = 1.2;
    }
    nearest = Math.min(nearest, Math.abs(v.distance - s) - half(v) - CAR.halfL);
  });
  // down a side street (lib/streets) they can't follow you: you're getting away
  if (game.street >= 0) nearest = Math.max(nearest, C.lose + 0.5);
  chase.nearest = nearest;
  // caught: stopped with one on you
  if (nearest < C.near && Math.abs(game.speed) < C.still) chase.held += dt; else chase.held = Math.max(0, chase.held - dt * 2);
  if (chase.held > C.bust) { busted(fleet); return driven; }
  // getting away: well clear of them all, the stars fall one by one
  if (nearest > C.lose) {
    chase.lost += dt;
    if (chase.lost > C.drop) {
      chase.lost = 0; chase.stars--; chase.version++;
      if (chase.stars <= 0) { const peak = chase.peak; end(fleet); bonus(100 * peak, "Escaped! 😎"); policeEnd(false, peak); haptic("success"); }
      else announce(`Losing them… ${"⭐".repeat(chase.stars)}`, "badge");
    }
  } else chase.lost = Math.max(0, chase.lost - dt);
  return driven;
}

function busted(fleet: Vehicle[]) {
  const stars = chase.stars;
  end(fleet);
  chase.busted++;
  fine(100 * stars, "Busted! 🚓 Ninne pidichu!");
  policeEnd(true, stars);
  haptic("heavy");
  // back in your own, where you left it (if you'd taken one); else stopped where you are
  const P = game.parked;
  if (getBorrow() && P) {
    setBorrow(null); game.parked = null;
    resetCar(P.s); Object.assign(game, { lat: P.lat, psi: P.psi }); Object.assign(game.prev, { s: P.s, lat: P.lat, psi: P.psi });
  } else { game.speed = 0; }
}
