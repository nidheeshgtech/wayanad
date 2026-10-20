/**
 * Drive mode (/drive): you drive the KSRTC bus up NH766. Plain mutable state read by the scene and the DOM, like
 * scrollState — never React state per frame.
 *
 * The bus lives in road coordinates: `s` units along the current road (10 m units), `lat` units left of the centre line
 * (traffic keeps left: +lat is your lane), `psi` its heading relative to the road (radians, + = turning left). That keeps
 * it on the road by construction (the ghat has no run-off) while steering still matters: the road curves under you,
 * so you steer round the hairpins, and too fast in a bend runs you wide into the barrier. The physics is in
 * lib/busPhysics.ts (it needs three.js; this file stays light for the HUD).
 */
export type Leg = 0 | 1; // 0: Adivaram → churam → Kalpetta; 1: Sulthan Bathery → forest → border gate
const fresh = () => ({
  active: false,
  started: false,
  leg: 0 as Leg,
  s: 3, lat: 0.2, psi: 0, speed: 0,          // units, units, radians, units/s
  steer: 0,                                   // eased steering, −1 (right) … 1 (left)
  input: { throttle: 0, brake: 0, steer: 0 }, // from keys / touch: 0–1, 0–1, −1…1
  assist: 0.8,                                // how much the road's own curve is steered for you (0 = all yours)
  braking: false, scrape: 0, bump: 0,         // for lights, camera shake and sound
  /** "between": the Kalpetta → Sulthan Bathery card is up; "finished": stopped at the border gate */
  phase: "drive" as "drive" | "between" | "finished",
  odometer: 0, clock: 0,                      // units driven, seconds driving
  reset: 0,                                   // bumped to put the bus back in lane
  view: "chase" as "chase" | "cab",           // camera: behind the bus, or the driver's seat (C)
  // for the HUD, filled in by the bus each frame
  place: "Adivaram", next: "Lakkidi gate", nextM: 0, bends: 0,
});
/** One object for the page (the HUD and the 3D scene load in different chunks). */
export const game: ReturnType<typeof fresh> = ((globalThis as { __wayanadGame?: ReturnType<typeof fresh> }).__wayanadGame ??= fresh());

/** The bus: half length / half width (units), top speed (65 km/h), and how it pulls, brakes and turns. */
export const BUS = { halfL: 0.47, halfW: 0.1125, max: 1.8, reverse: 0.3, accel: 0.32, brake: 1.1, drag: 0.04, rMin: 1.05, grip: 0.42 };
/** Put the bus back in its lane, facing up the road, stopped. */
export function resetBus(at?: number) {
  if (at !== undefined) game.s = at;
  game.lat = 0.2; game.psi = 0; game.speed = 0; game.steer = 0; game.reset++;
}
