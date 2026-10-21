import { CatmullRomCurve3, Vector3 } from "three";
import { CAR, game } from "./game";

/**
 * Drive mode's car physics (state and conventions: lib/game.ts). Fixed time step: `simulate` runs as many STEP-long
 * steps as real time asks for and returns how far it is into the next one, so the car is drawn between the last two
 * steps — the same handling at 30, 60 or 120 fps, never tied to the frame rate.
 */
export const STEP = 1 / 120;
const G = 0.981; // gravity, units/s²

export type RoadInfo = { curve: CatmullRomCurve3; length: number; widen: (t: number) => number };

const ta = new Vector3(), tb = new Vector3(), pa = new Vector3(), pb = new Vector3();
/** Signed curvature (1/units, + = bending left) and grade (rise/run) of the road at s. */
export function roadAt(road: RoadInfo, s: number) {
  const L = road.length, d = 0.6, clamp = (x: number) => Math.min(1, Math.max(0, x)), t0 = clamp((s - d) / L), t1 = clamp((s + d) / L);
  road.curve.getTangentAt(t0, ta); road.curve.getTangentAt(t1, tb);
  const turn = Math.atan2(ta.x * tb.z - ta.z * tb.x, ta.x * tb.x + ta.z * tb.z); // + when the road turns toward −x×z: left
  road.curve.getPointAt(t0, pa); road.curve.getPointAt(t1, pb);
  const run = Math.hypot(pb.x - pa.x, pb.z - pa.z) || 1e-6;
  return { curvature: -turn / ((t1 - t0) * L || 1e-6), grade: (pb.y - pa.y) / run };
}

/** How far from the centre line the car's centre may go on each side here (units): the asphalt plus a little shoulder. */
export function laneLimit(road: RoadInfo, s: number) {
  return 0.38 + road.widen(Math.min(1, Math.max(0, s / road.length))) * 0.5 - CAR.halfW;
}

let acc = 0;
/** Advance real time `dt` in fixed steps. Returns 0–1: how far into the next step the drawn pose should be. */
export function simulate(road: RoadInfo, dt: number) {
  acc = Math.min(acc + Math.min(dt, 0.1), 0.1); // a long stall (tab switch) doesn't fast-forward
  while (acc >= STEP) {
    game.prev.s = game.s; game.prev.lat = game.lat; game.prev.psi = game.psi;
    stepCar(road, STEP);
    acc -= STEP;
  }
  return acc / STEP;
}
/** Start stepping afresh (after a reset or a change of road): no half step carried over. */
export function settle() { acc = 0; game.prev = { s: game.s, lat: game.lat, psi: game.psi }; }

/** One physics step. Returns how hard the car hit the road edge (0 = didn't). */
export function stepCar(road: RoadInfo, dt: number) {
  const g = game, i = g.input;
  g.s = Math.min(road.length, Math.max(1.5, g.s));
  // steering: keys and touch buttons are all-or-nothing, so the wheel winds toward them at a steady rate (full lock
  // in ~0.4 s, back to centre in ~0.3 s) and is then eased, so turning in and letting go are both gradual. Less lock
  // the faster you go, so it's calm at speed and sharp when slow — the hairpins at 30 km/h still take a good turn
  const winding = Math.abs(i.steer) > Math.abs(g.turn) && Math.sign(i.steer) === Math.sign(g.turn || i.steer), rate = (winding ? 2.5 : 3.4) * dt;
  g.turn += Math.max(-rate, Math.min(rate, i.steer - g.turn));
  g.steer += (g.turn - g.steer) * (1 - Math.exp(-dt / 0.08));
  const v0 = g.speed, lock = 1 / (1 + (Math.abs(v0) / 1.5) ** 2);
  // pedals: throttle pulls (less toward top speed), the brake stops you and then reverses gently; the climb pulls back
  const { curvature, grade } = roadAt(road, g.s);
  let a = 0;
  if (i.throttle > 0) a += v0 >= -0.02 ? CAR.accel * i.throttle * (1 - (Math.max(0, v0) / CAR.max) ** 1.6) : CAR.brake * i.throttle;
  if (i.brake > 0) a -= v0 > 0.02 ? CAR.brake * i.brake : CAR.accel * 0.5 * i.brake;
  a -= CAR.drag * v0 + Math.sign(v0) * 0.012 + G * grade * 0.5;
  g.speed = Math.max(-CAR.reverse, Math.min(CAR.max, v0 + a * dt));
  if (i.throttle === 0 && i.brake === 0 && Math.abs(g.speed) < 0.015) g.speed = 0;
  g.accel = (g.speed - v0) / dt;
  g.braking = i.brake > 0 && g.speed > 0.02;
  // heading relative to the road: your steering turns the car, the road turns under it; the assist takes part of the
  // road's turn for you and lets go as you steer, so you still drive the bends
  // the assist takes more of the turn the tighter the bend (up to ~90 % on the hairpins), so the car follows the
  // bends without a fight and your steering is for lines and overtakes
  const assist = g.assist + (1 - g.assist) * 0.75 * Math.min(1, Math.max(0, (Math.abs(curvature) - 0.12) / 0.45));
  const v = g.speed, yawRate = (g.steer * lock * v) / CAR.rMin, roadTurn = v * curvature;
  g.psi += (yawRate - roadTurn * (1 - assist)) * dt;
  // tyres straighten along the road as the wheel comes back (blended, not switched, so letting go doesn't jolt)
  g.psi -= g.psi * Math.min(1, dt * (0.8 + 2.6 * assist)) * (1 - Math.min(1, Math.abs(g.steer) * 2.5)) ** 2;
  g.psi = Math.max(-1.1, Math.min(1.1, g.psi));
  // too fast for the bend: grip runs out and the car drifts to the outside
  g.sideways = v * v * curvature;
  const over = Math.abs(g.sideways) - CAR.grip;
  const slide = over > 0 ? over * Math.sign(-curvature) * 0.45 : 0;
  g.lat += (v * Math.sin(g.psi) + slide) * dt;
  const ds = v * Math.cos(g.psi) * dt;
  g.s = Math.min(road.length, Math.max(1.5, g.s + ds));
  g.wheel += (v * dt) / 0.033; // 33 cm tyre radius
  g.odometer += Math.abs(ds); if (Math.abs(v) > 0.01) g.clock += dt;
  // the edge: barrier posts and the bank. Scrape along it: pushed back in, heading straightened, speed scrubbed
  const lim = laneLimit(road, g.s);
  let hit = 0;
  if (Math.abs(g.lat) > lim) {
    hit = Math.min(1, Math.abs(v) * (Math.abs(Math.sin(g.psi)) + 0.15));
    g.lat = Math.sign(g.lat) * lim;
    g.psi *= 0.3;
    g.speed *= 1 - Math.min(0.6, hit * 0.9) * dt * 6;
  }
  g.scrape = Math.max(g.scrape * (1 - dt * 6), hit);
  return hit;
}
