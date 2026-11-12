/**
 * Real people in the traffic up close (components/scene/Traffic): the drivers and passengers of the nearest vehicles,
 * and the riders of the bikes, are the cast (data/drivers.ts: the drivers you can pick and the everyday folk), seated
 * (lib/people). Further off the vehicles keep their simple built occupants. Bodies are pooled per person and reused;
 * at most one new one is made a frame, so a busy junction never stalls a frame.
 */
import { Quaternion, Vector3, type Object3D } from "three";
import { DRIVERS, EXTRAS, personHeight, type PersonId } from "@/data/drivers";
import { lean, loadCast, makeActor, PALM, reach, seat as seatOnBike, settleHands, type Actor } from "@/lib/people";
import type { OccupiedSeat } from "@/lib/occupants";

const ALL: PersonId[] = [...DRIVERS.map((d) => d.id), ...EXTRAS.map((e) => e.id)];
// who drives: grown-ups who'd be at a wheel (no schoolgirl or grandmother driving the bus)
const DRIVING: PersonId[] = ["rider", "racer", "guard", "auto", "mechanic", "estate", "lungi", "student", "conductor", "churidar", "trekker"];

type Loaded = Awaited<ReturnType<typeof loadCast>>;
const ready = new Map<PersonId, Loaded>(), asked = new Set<PersonId>(), free = new Map<PersonId, Actor[]>();
let madeThisFrame = false;
/** Start loading who's needed (once each). */
// (the light copies: seen through a window or on a passing bike, the full detail would be wasted; missing ones just
// stay built)
function want(id: PersonId) { if (!asked.has(id)) { asked.add(id); loadCast(id, true).then((v) => ready.set(id, v), () => {}); } }
/** Call once a frame before taking bodies. */
export function crewFrame() { madeThisFrame = false; }
function take(id: PersonId, height: number): Actor | null {
  want(id);
  const spare = free.get(id)?.pop();
  if (spare) { spare.root.scale.setScalar(height / personHeight(id) / 0.1); spare.root.visible = true; return spare; }
  const src = ready.get(id);
  if (!src || madeThisFrame) return null;
  madeThisFrame = true;
  const a = makeActor(id, src[0], src[1], personHeight(id) / 10);
  a.root.scale.setScalar(height / personHeight(id) / 0.1);
  return a;
}
function give(id: PersonId, a: Actor) { a.root.removeFromParent(); a.root.visible = false; (free.get(id) ?? free.set(id, []).get(id)!).push(a); }

/** Who drives each traffic vehicle (by its id), once seen up close: when you take it, they move over and ride along
 * (components/drive/OnFoot → PlayerCar's passenger). */
const drivers = new Map<number, PersonId>();
export const driverOfVehicle = (id: number) => drivers.get(id) ?? null;
/** Someone who'd be at the wheel, for a vehicle nobody's seen inside yet (seeded by its id). */
export const someDriver = (id: number) => DRIVING[Math.abs(id * 7 + 3) % DRIVING.length];

/** One vehicle's people while it's near: who, their body, and how they sit. */
export type Crew = { people: { id: PersonId; actor: Actor; driver: boolean; hands?: { left: Vector3; right: Vector3 } }[]; done: boolean };
/** Someone for this seat, seeded (so the vehicle keeps its people), from whoever has loaded (the rest start loading). */
const pick = (seed: number, list: PersonId[]) => {
  for (const id of list) want(id);
  const have = list.filter((id) => ready.has(id));
  return have.length ? have[Math.abs(Math.floor(Math.sin(seed * 12.9898) * 43758.5453)) % have.length] : null;
};

/**
 * Seat people in a vehicle (frame `root`: wheels on y = 0, +z forward): in its `seats` (lib/occupants, head positions),
 * or, for a bike (`bike` its length), a rider astride. Who sits where is seeded by the vehicle, so it keeps its people.
 * Returns what it managed this frame (call again next frame until `done`).
 */
export function board(crew: Crew | null, root: Object3D, seed: number, seats: OccupiedSeat[] | null, bike: number | null, max: number): Crew {
  const C = crew ?? { people: [], done: false };
  if (C.done) return C;
  const wanted = bike ? 1 : Math.min(max, seats?.length ?? 0);
  while (C.people.length < wanted) {
    const i = C.people.length, s = bike ? null : seats![i], driver = bike ? true : !!s!.driver;
    const id = pick(seed * 31 + i * 7, driver ? DRIVING : ALL);
    if (!id) return C;
    const k = s ? s.k : 0.1, a = take(id, personHeight(id) * k);
    if (!a) return C; // not loaded yet, or one made already this frame
    if (driver) drivers.set(seed, id);
    if (bike) {
      const placed = seatOnBike(a, root, true, bike);
      C.people.push({ id, actor: a, driver: true, hands: placed.hands });
    } else {
      a.play("sit", 0); a.mixer.update(0.01);
      // the head where the seat plan has it (the plan gives head positions; the body follows)
      root.add(a.root); a.root.position.set(0, 0, 0); a.root.rotation.set(0, 0, 0); a.root.updateMatrixWorld(true);
      const head = a.bones.get("Head"), h = head ? a.root.worldToLocal(head.getWorldPosition(new Vector3())).multiply(a.root.scale) : new Vector3(0, 0.1, 0);
      a.root.position.set(s!.x - h.x, s!.y - h.y, s!.z - h.z);
      const hands = driver ? { left: new Vector3(s!.x + 0.17 * k, s!.y - 0.36 * k, s!.z + 0.42 * k), right: new Vector3(s!.x - 0.17 * k, s!.y - 0.36 * k, s!.z + 0.42 * k) } : undefined;
      C.people.push({ id, actor: a, driver, hands });
    }
  }
  C.done = true;
  // the built stand-ins go: the busts in the windows, or the bike's rider
  if (bike) { const r = root.getObjectByName("rider"); if (r) r.visible = false; }
  else for (const o of root.children) if (o.name === "occupants") o.visible = false;
  return C;
}

const side = new Vector3(), up = new Vector3(), rq = new Quaternion(), tl = new Vector3(), tr = new Vector3();
const POLE = { left: new Vector3(1, -1.2, -0.3).normalize(), right: new Vector3(-1, -1.2, -0.3).normalize() }, pl = new Vector3(), pr = new Vector3(), ql = new Vector3(), qr = new Vector3();
// (on a bike the elbows tuck down and back, as lib/people seat())
const POLE_BIKE = { left: new Vector3(0.45, -1.4, -0.6).normalize(), right: new Vector3(-0.45, -1.4, -0.6).normalize() };
/** Each frame while near: breathe, sit up, drivers' hands to the wheel or bars. */
export function poseCrew(C: Crew, root: Object3D, dt: number, bike: boolean) {
  root.updateWorldMatrix(true, false);
  root.getWorldQuaternion(rq);
  side.set(1, 0, 0).applyQuaternion(rq); up.set(0, 1, 0).applyQuaternion(rq);
  for (const p of C.people) {
    p.actor.mixer.update(Math.min(dt, 0.1));
    lean(p.actor, bike ? 0.55 : -0.15, side, up);
    if (p.hands) reach(p.actor, { left: root.localToWorld(tl.copy(p.hands.left)), right: root.localToWorld(tr.copy(p.hands.right)) },
      { left: pl.copy((bike ? POLE_BIKE : POLE).left).applyQuaternion(rq), right: pr.copy((bike ? POLE_BIKE : POLE).right).applyQuaternion(rq) },
      { left: ql.copy(bike ? PALM.bike.left : PALM.car.left).applyQuaternion(rq), right: qr.copy(bike ? PALM.bike.right : PALM.car.right).applyQuaternion(rq) });
    else settleHands(p.actor);
  }
}

/** The vehicle's moved off: its people back to the pool, its built occupants (or rider) shown again. */
export function disembark(C: Crew, root: Object3D) {
  for (const p of C.people) give(p.id, p.actor);
  for (const o of root.children) if (o.name === "occupants") o.visible = true;
  const r = root.getObjectByName("rider"); if (r) r.visible = true;
}
