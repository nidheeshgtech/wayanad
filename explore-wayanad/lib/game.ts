/**
 * Drive mode (/drive): you drive a car up NH766. Plain mutable state read by the scene and the DOM, like scrollState —
 * never React state per frame.
 *
 * The car lives in road coordinates: `s` units along the current road (10 m units), `lat` units left of the centre line
 * (traffic keeps left: +lat is your lane), `psi` its heading relative to the road (radians, + = turning left). That keeps
 * it on the road by construction (the ghat has no run-off) while steering still matters: the road curves under you,
 * so you steer round the hairpins, and too fast in a bend runs you wide into the barrier. The physics is in
 * lib/carPhysics.ts (it needs three.js; this file stays light for the HUD).
 */
export type Leg = 0 | 1; // 0: Adivaram → churam → Kalpetta; 1: Sulthan Bathery → forest → border gate
export type View = "chase" | "near" | "hood";
export const VIEWS: View[] = ["chase", "near", "hood"];
const fresh = () => ({
  active: false,
  started: false,
  paused: false,                              // Space: everything that moves holds still
  leg: 0 as Leg,
  s: 3, lat: 0.2, psi: 0, speed: 0,          // units, units, radians, units/s
  prev: { s: 3, lat: 0.2, psi: 0 },           // the previous physics step, for drawing between steps
  accel: 0, sideways: 0,                      // units/s² along and across: the body pitches and rolls with them
  steer: 0,                                   // eased steering, −1 (right) … 1 (left)
  turn: 0,                                    // the steering wheel's position, winding toward input.steer at a steady rate
  input: { throttle: 0, brake: 0, steer: 0 }, // from keys / touch: 0–1, 0–1, −1…1
  assist: 0.65,                               // how much of the road's own curve is steered for you (0 = all yours)
  braking: false, scrape: 0, bump: 0,         // for lights, camera shake and sound
  wheel: 0,                                   // wheel rotation, radians (rolls with distance)
  /** "between": the Kalpetta → Sulthan Bathery card is up; "finished": stopped at the border gate; "gate": the end of
   * phase one, stopped just past the Lakkidi gate */
  phase: "drive" as "drive" | "between" | "finished" | "gate",
  odometer: 0, clock: 0,                      // units driven, seconds driving
  reset: 0,                                   // bumped to put the car back in lane
  view: "chase" as View,                      // camera (C cycles): behind, close behind, on the bonnet
  // for the HUD, filled in by the car each frame
  place: "Adivaram", next: "Lakkidi gate", nextM: 0, bends: 0,
  km: 0, kmTotal: 0,                          // along the road from Adivaram, and to the end of the drive
  roadLength: 0,                              // the road you're on, units (the minimap places other drivers with it)
});
/** One object for the page (the HUD and the 3D scene load in different chunks). */
export const game: ReturnType<typeof fresh> = ((globalThis as { __wayanadGame?: ReturnType<typeof fresh> }).__wayanadGame ??= fresh());

/** The car (a compact SUV): half length / half width (units), top speed (100 km/h) and reverse, how hard it pulls and
 * brakes (units/s²: 0.55 ≈ 0–100 in 5 s, 1.0 ≈ 1 g), rolling drag, turning radius (5.2 m) and grip (≈ 0.8 g). */
export const CAR = { halfL: 0.2, halfW: 0.1, max: 2.8, reverse: 0.45, accel: 0.55, brake: 1.0, drag: 0.035, rMin: 0.52, grip: 0.78 };

/** Put the car back in its lane, facing up the road, stopped. */
export function resetCar(at?: number) {
  if (at !== undefined) game.s = at;
  game.lat = 0.2; game.psi = 0; game.speed = 0; game.steer = 0; game.turn = 0; game.accel = 0; game.sideways = 0;
  game.prev = { s: game.s, lat: game.lat, psi: game.psi };
  game.reset++;
}

/** Space: pause or resume (only once the drive has started and is on the road). */
export function togglePause(on = !game.paused) {
  if (!game.started || game.phase !== "drive") return;
  game.paused = on;
  if (on) Object.assign(game.input, { throttle: 0, brake: 0, steer: 0 });
}
