import { CatmullRomCurve3, Vector3 } from "three";
import { BUS, game } from "./game";

/** Drive mode's bus physics (state and conventions: lib/game.ts). */
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

/** How far from the centre line the bus's centre may go on each side here (units): the asphalt plus a little shoulder. */
export function laneLimit(road: RoadInfo, s: number) {
  return 0.38 + road.widen(Math.min(1, Math.max(0, s / road.length))) * 0.5 - BUS.halfW;
}

/** One physics step. Returns how hard the bus hit the road edge (0 = didn't). */
export function stepBus(road: RoadInfo, dt: number) {
  dt = Math.min(dt, 0.05);
  const g = game, i = g.input;
  g.s = Math.min(road.length, Math.max(1.5, g.s));
  // steering eases in and out (a bus wheel isn't a light switch), less lock at speed
  g.steer += (i.steer - g.steer) * (1 - Math.exp(-dt / 0.18));
  // pedals: throttle pulls (less near top speed), brake stops then reverses slowly; the climb pulls back
  const { curvature, grade } = roadAt(road, g.s);
  let a = 0;
  if (i.throttle > 0) a += BUS.accel * i.throttle * (1 - Math.max(0, g.speed) / BUS.max);
  if (i.brake > 0) a -= (g.speed > 0.02 ? BUS.brake : BUS.accel * 0.6) * i.brake;
  a -= BUS.drag * g.speed + Math.sign(g.speed) * 0.02 + G * grade * 0.35;
  g.speed = Math.max(-BUS.reverse, Math.min(BUS.max, g.speed + a * dt));
  if (i.throttle === 0 && i.brake === 0 && Math.abs(g.speed) < 0.02) g.speed = 0;
  g.braking = i.brake > 0 && g.speed > 0.02;
  // heading relative to the road: your steering turns the bus, the road turns under it; the assist takes part of the
  // road's turn for you and lets go when you steer, so you still drive the bends
  const v = g.speed, yawRate = (g.steer * v) / BUS.rMin, roadTurn = v * curvature;
  g.psi += (yawRate - roadTurn * (1 - g.assist)) * dt;
  if (Math.abs(i.steer) < 0.05) g.psi -= g.psi * Math.min(1, dt * (0.6 + 2.4 * g.assist)); // wheels straighten along the road
  g.psi = Math.max(-1.1, Math.min(1.1, g.psi));
  // too fast for the bend: grip runs out and the bus drifts to the outside
  const sideways = v * v * Math.abs(curvature);
  const slide = sideways > BUS.grip ? (sideways - BUS.grip) * Math.sign(-curvature) * 0.5 : 0;
  g.lat += (v * Math.sin(g.psi) + slide) * dt;
  const ds = v * Math.cos(g.psi) * dt;
  g.s = Math.min(road.length, Math.max(1.5, g.s + ds));
  g.odometer += Math.abs(ds); if (Math.abs(v) > 0.01) g.clock += dt;
  // the edge: barrier posts and the bank. Scrape along it: pushed back in, heading straightened, speed scrubbed
  const lim = laneLimit(road, g.s);
  let hit = 0;
  if (Math.abs(g.lat) > lim) {
    hit = Math.min(1, Math.abs(v) * (Math.abs(Math.sin(g.psi)) + 0.2));
    g.lat = Math.sign(g.lat) * lim;
    g.psi *= 0.3;
    g.speed *= 1 - Math.min(0.6, hit * 0.9) * dt * 6;
  }
  g.scrape = hit;
  return hit;
}

