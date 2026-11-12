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
/** Nitro: held (N, or the flame key), it empties the tank in `burn` s of boost — extra pull and a top speed `top`× the
 * car's — and eases back to normal over `fade` units/s² after. Coins (`coin`, `big`) and drifts (`drift`) fill it, and a
 * little comes back on its own while you drive (`trickle` a second). A climb starts with `start`. */
export const NITRO = { burn: 3.2, accel: 0.75, top: 1.3, fade: 0.35, start: 0.35, coin: 0.05, big: 0.3, drift: 0.15, trickle: 0.012 };

const fresh = () => ({
  active: false,
  started: false,
  paused: false,                              // Space: everything that moves holds still
  hold: false,                                // a race's countdown (Play with friends): your car waits on the line
  leg: 0 as Leg,
  s: 3, lat: 0.2, psi: 0, speed: 0,          // units, units, radians, units/s
  prev: { s: 3, lat: 0.2, psi: 0 },           // the previous physics step, for drawing between steps
  accel: 0, sideways: 0,                      // units/s² along and across: the body pitches and rolls with them
  steer: 0,                                   // eased steering, −1 (right) … 1 (left)
  turn: 0,                                    // the steering wheel's position, winding toward input.steer at a steady rate
  input: { throttle: 0, brake: 0, steer: 0, nitro: 0 }, // from keys / touch: 0–1, 0–1, −1…1, nitro held 0/1
  nitro: NITRO.start, boosting: false,        // the nitro tank (0–1: coins and drifts fill it) and whether it's firing
  assist: 0.65,                               // how much of the road's own curve is steered for you (0 = all yours)
  braking: false, scrape: 0, bump: 0,         // for lights, camera shake and sound
  speedFx: 0,                                 // how fast it feels, 0–1 (PlayerCar): a wider view, speed streaks
  wheel: 0,                                   // wheel rotation, radians (rolls with distance)
  /** "between": the Kalpetta → Sulthan Bathery card is up; "finished": stopped at the border gate; "gate": the end of
   * phase one, stopped just past the Lakkidi gate */
  phase: "drive" as "drive" | "between" | "finished" | "gate",
  odometer: 0, clock: 0,                      // units driven, seconds driving
  stall: 0, tea: 0, teaRun: -1, teaWait: 0,  // the tea stall below Lakkidi (components/drive/TeaStall): where, when served, which climb, seconds stopped by it
  driver: "",                                 // the name you drive under: on your car's rear plate
  bike: false,                                // riding a two-wheeler (setVehicle): leans, no dents
  damage: 0,                                  // how battered the car is this climb, 0–1 (PlayerCar's dents): smoke from the bonnet past half
  jumped: false,                              // started part-way up (?at=, for testing): the climb time isn't kept as a best
  reset: 0,                                   // bumped to put the car back in lane
  view: "chase" as View,                      // camera (C cycles): behind, close behind, on the bonnet
  lookBack: false,                            // held (B, or the look-back button): the camera faces back down the road
  look: { yaw: 0, held: false },              // a swipe across the road (components/drive/SwipeLook): the chase camera swung round the car, easing back when let go
  // for the HUD, filled in by the car each frame
  place: "Adivaram", next: "Lakkidi gate", nextM: 0, bends: 0,
  km: 0, kmTotal: 0,                          // along the road from Adivaram, and to the end of the drive
  roadLength: 0,                              // the road you're on, units (the minimap places other drivers with it)
  finishS: 0,                                 // where the climb counts as done (the gate's braking zone, past the Lakkidi arch): lib/race
  /** On foot (components/drive/OnFoot): stopped, Enter gets your driver out to walk about and look at the view; Enter
   * by the car or bike gets back in. `x, z` where they stand (world units), `yaw` which way they face, `near` close
   * enough to their vehicle to get in, `want` asked for (the HUD sets it, OnFoot does it) */
  foot: { on: false, want: false, x: 0, z: 0, yaw: 0, near: false,
    /** where they stand in road terms (along it, left of the centre line), for the traffic to stop for them */
    s: 0, lat: 0,
    /** a vehicle stopped beside them they can take (the traffic's id, −1 none), and its kind, for the key's label */
    hop: -1, hopBike: false,
    /** by your own car, parked while you drive one you've taken */
    byParked: false },
  /** your own vehicle, parked where you left it when you took another (OnFoot; drawn by ParkedCar) */
  parked: null as null | { s: number; lat: number; psi: number; x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number },
});
/** One object for the page (the HUD and the 3D scene load in different chunks). */
export const game: ReturnType<typeof fresh> = ((globalThis as { __wayanadGame?: ReturnType<typeof fresh> }).__wayanadGame ??= fresh());

/** The car (a compact SUV): half length / half width (units), top speed (100 km/h) and reverse, how hard it pulls and
 * brakes (units/s²: 0.55 ≈ 0–100 in 5 s, 1.0 ≈ 1 g), rolling drag, turning radius (5.2 m) and grip (≈ 0.8 g). */
export const CAR = { halfL: 0.2, halfW: 0.1, max: 2.8, reverse: 0.45, accel: 0.55, brake: 1.0, drag: 0.035, rMin: 0.52, grip: 0.78 };
const CAR_DIMS = { ...CAR };
/** A bike (data/cars `bike`): narrow and short (it slips between lanes), a little quicker off the line, turns tighter. */
const BIKE_DIMS = { halfL: 0.105, halfW: 0.04, accel: 0.66, rMin: 0.4, reverse: 0.2 };
/** What you're riding: sets CAR's size and handling for it (PlayerCar, when the vehicle changes). */
export function setVehicle(bike: boolean) { Object.assign(CAR, CAR_DIMS, bike ? BIKE_DIMS : {}); game.bike = bike; }

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
  if (on) Object.assign(game.input, { throttle: 0, brake: 0, steer: 0, nitro: 0 });
}

/** Can you get out now: on the road, stopped (walking pace or less), not paused, not lined up for a race. */
export function canLeave() {
  return game.started && game.phase === "drive" && !game.paused && !game.hold && Math.abs(game.speed) < 0.05;
}
/** Enter: out of the vehicle when you can, back in when you're by it (OnFoot carries it out next frame). */
export function toggleFoot() {
  const F = game.foot;
  if (F.on ? F.near || F.hop >= 0 || F.byParked : canLeave()) F.want = true;
}

