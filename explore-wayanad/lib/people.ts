/**
 * The cast as moving 3D people (data/drivers.ts): any of them, playing any of the shared moves. Used by the garage
 * preview, your driver on the bike or at the wheel (components/drive/PlayerCar), friends' drivers (RemoteCars) and the
 * people walking by the road (components/scene/Pedestrians).
 *  - public/models/drivers/<id>.glb  each person: mesh, skeleton and their own idle (Higgsfield image → 3D, rigged)
 *  - public/models/drivers/moves.glb the moves, one skeleton's worth of clips (walk_m, walk_f, sit_m, sit_f, idle):
 *    all the people share the same rig (bone names), so a clip made on one plays on any. Only rotations are kept, and the
 *    hips' height is carried across in proportion, so a short person doesn't float or sink in someone else's walk.
 */
import { AnimationClip, AnimationMixer, Box3, Group, Quaternion, Vector3, VectorKeyframeTrack, type AnimationAction, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { driverModel, driverOf, type DriverId } from "@/data/drivers";

export type Move = "idle" | "walk" | "sit";
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const people = new Map<DriverId, Promise<{ scene: Object3D; clips: AnimationClip[] }>>();
let moves: Promise<Map<string, AnimationClip>> | null = null;

export function loadDriver(id: DriverId) {
  let p = people.get(id);
  if (!p) { p = loader.loadAsync(driverModel(id)).then((g) => ({ scene: g.scene, clips: g.animations })); people.set(id, p); }
  return p;
}
export function loadMoves() {
  return (moves ??= loader.loadAsync("/models/drivers/moves.glb").then((g) => new Map(g.animations.map((a) => [a.name, a]))));
}
/** Both, ready to make actors from (the same promise each time, so React's `use` can wait on it). */
const casts = new Map<DriverId, Promise<[{ scene: Object3D; clips: AnimationClip[] }, Map<string, AnimationClip>]>>();
export function loadCast(id: DriverId) {
  let p = casts.get(id);
  if (!p) { p = Promise.all([loadDriver(id), loadMoves()]); casts.set(id, p); }
  return p;
}

/** Where the clips' hips stood (cm, the rig's units) on the people they were made on: Arjun (men) and Meera (women). */
const SOURCE_HIPS = { m: new Vector3(0, 93.775, -0.669), f: new Vector3(0.663, 87.918, 9.186) };
const WOMEN = new Set<DriverId>(["racer", "trekker"]);

export type Actor = {
  root: Group; mixer: AnimationMixer; bones: Map<string, Object3D>;
  /** fade to a move (0 s jumps) */ play: (move: Move, fade?: number) => AnimationAction | null;
  /** the hips' place in `root`'s frame in the current pose, after a mixer update */ hips: () => Vector3;
};

/**
 * One person ready to place: `height` tall in the caller's units, feet on y = 0, facing +z (the models don't all face
 * the same way: each is turned by its hips, left hip − right hip crossed with up). Their own idle until `play`.
 */
export function makeActor(id: DriverId, src: { scene: Object3D; clips: AnimationClip[] }, clips: Map<string, AnimationClip>, height: number): Actor {
  const body = clone(src.scene), turn = new Group(); turn.add(body); turn.updateMatrixWorld(true);
  const at = (n: string) => body.getObjectByName(n)?.getWorldPosition(new Vector3());
  const L = at("LeftUpLeg"), R = at("RightUpLeg");
  if (L && R) { const f = L.sub(R).cross(new Vector3(0, 1, 0)); turn.rotation.y = -Math.atan2(f.x, f.z); turn.updateMatrixWorld(true); }
  const box = new Box3().setFromObject(turn, true), size = box.getSize(new Vector3()), c = box.getCenter(new Vector3());
  const k = height / size.y, fit = new Group(); fit.add(turn);
  fit.scale.setScalar(k); fit.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  const bones = new Map<string, Object3D>();
  body.traverse((o) => { o.frustumCulled = false; (o as { castShadow?: boolean }).castShadow = true; if ((o as { isBone?: boolean }).isBone) bones.set(o.name, o); });
  const root = new Group(); root.add(fit);
  const mixer = new AnimationMixer(body);
  // the shared clips, fitted to this person: rotations as they are; the hips' track moved to their own hips' rest
  const hipsBone = bones.get("Hips"), rest = hipsBone ? hipsBone.position.clone() : new Vector3();
  const woman = WOMEN.has(id), fitted = new Map<Move, AnimationClip>();
  const fitClip = (name: string, sex: "m" | "f") => {
    const clip = clips.get(name); if (!clip) return null;
    const from = SOURCE_HIPS[sex], s = rest.y / from.y;
    const tracks = clip.tracks.map((t) => {
      if (!t.name.endsWith("Hips.position")) return t;
      const v = t.values.slice();
      for (let i = 0; i < v.length; i += 3) { v[i] = rest.x + (v[i] - from.x) * s; v[i + 1] = rest.y + (v[i + 1] - from.y) * s; v[i + 2] = rest.z + (v[i + 2] - from.z) * s; }
      return new VectorKeyframeTrack(t.name, t.times, v);
    });
    return new AnimationClip(`${name}:${id}`, clip.duration, tracks);
  };
  const own = src.clips[0];
  if (own) fitted.set("idle", own);
  const walk = fitClip(woman ? "walk_f" : "walk_m", woman ? "f" : "m"), sit = fitClip(woman ? "sit_f" : "sit_m", woman ? "f" : "m");
  if (walk) fitted.set("walk", walk); if (sit) fitted.set("sit", sit);
  let current: AnimationAction | null = null;
  const play = (move: Move, fade = 0.25) => {
    const clip = fitted.get(move); if (!clip) return null;
    const next = mixer.clipAction(clip);
    if (next === current) return next;
    next.reset().play();
    if (current && fade > 0) next.crossFadeFrom(current, fade, false); else current?.stop();
    current = next; return next;
  };
  play("idle", 0);
  const hips = () => { root.updateMatrixWorld(true); return hipsBone ? root.worldToLocal(hipsBone.getWorldPosition(new Vector3())) : new Vector3(0, height * 0.5, 0); };
  return { root, mixer, bones, play, hips };
}

const qa = new Quaternion(), qb = new Quaternion(), va = new Vector3(), vb = new Vector3(), vc = new Vector3(), vd = new Vector3();
/** Turn `bone` (world) so the direction to its child `tip` points along `dir` (world, unit). */
function aim(bone: Object3D, tip: Object3D, dir: Vector3) {
  bone.updateWorldMatrix(true, false); tip.updateWorldMatrix(false, false);
  const from = va.setFromMatrixPosition(tip.matrixWorld).sub(vb.setFromMatrixPosition(bone.matrixWorld)).normalize();
  const delta = qa.setFromUnitVectors(from, dir);
  bone.getWorldQuaternion(qb).premultiply(delta);                       // the bone's wanted world rotation
  const parent = bone.parent!.getWorldQuaternion(new Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(qb));
  bone.updateWorldMatrix(false, true);
}
/**
 * Hands to the bars or the wheel: each arm bent at the elbow (out and down, `pole` in world) so its hand reaches the
 * target (world). Run after the mixer's update, each frame (it overrides the clip's arms).
 */
export function reach(actor: Actor, targets: { left: Vector3; right: Vector3 }, pole: { left: Vector3; right: Vector3 }) {
  for (const side of ["Left", "Right"] as const) {
    const upper = actor.bones.get(`${side}Arm`), fore = actor.bones.get(`${side}ForeArm`), hand = actor.bones.get(`${side}Hand`);
    if (!upper || !fore || !hand) continue;
    const T = side === "Left" ? targets.left : targets.right, P = side === "Left" ? pole.left : pole.right;
    upper.updateWorldMatrix(true, true);
    const S = vb.setFromMatrixPosition(upper.matrixWorld).clone(), E = vc.setFromMatrixPosition(fore.matrixWorld).clone(), H = vd.setFromMatrixPosition(hand.matrixWorld).clone();
    const a = S.distanceTo(E), b = E.distanceTo(H), toT = T.clone().sub(S), d = Math.min(a + b - 1e-5, Math.max(Math.abs(a - b) + 1e-5, toT.length()));
    toT.normalize();
    const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
    const bend = P.clone().addScaledVector(toT, -P.dot(toT)).normalize();
    const elbow = S.clone().addScaledVector(toT, x).addScaledVector(bend, h);
    aim(upper, fore, elbow.clone().sub(S).normalize());
    fore.updateWorldMatrix(true, false);
    aim(fore, hand, T.clone().sub(vc.setFromMatrixPosition(fore.matrixWorld)).normalize());
  }
}
/**
 * Sit up (or lean over the bars): the spine straightened along `up` (world, the vehicle's up) tipped forward by `angle`
 * radians about `side` (world). Bone by bone, each pointed at the next, so whatever slouch the clip has is undone.
 */
// (in these rigs the spine counts down from the hips: Hips → Spine02 → Spine01 → Spine → neck → Head)
const SPINE: [string, string][] = [["Spine02", "Spine01"], ["Spine01", "Spine"], ["Spine", "neck"], ["neck", "Head"]];
export function lean(actor: Actor, angle: number, side: Vector3, up = new Vector3(0, 1, 0)) {
  const dir = up.clone().applyAxisAngle(side, angle).normalize();
  for (const [a, b] of SPINE) {
    const bone = actor.bones.get(a), tip = actor.bones.get(b);
    if (bone && tip) aim(bone, tip, dir);
  }
}
export const isWoman = (id: DriverId) => WOMEN.has(id);
export const heightOf = (id: DriverId) => driverOf(id).height;

/** A driver in their seat: where the hands go and how they sit, in the vehicle's own frame (+x left, +z forward). */
export type Seat = { actor: Actor; hands: { left: Vector3; right: Vector3 }; pole: { left: Vector3; right: Vector3 }; lean: number };
/**
 * Sit `actor` in a vehicle `length` units long (frame: wheels on y = 0, centred): on a bike from the old rider's marks
 * (fractions of its length), leaning over the bars; in a car at its steering wheel's centre `wheel`, upright, right-hand
 * drive. Adds the actor to `frame`.
 */
export function seat(actor: Actor, frame: Object3D, bike: boolean, length: number, wheel?: Vector3 | null): Seat {
  actor.play("sit", 0); actor.mixer.update(0.01);
  const L = length;
  const hipsAt = bike ? new Vector3(0, 0.37 * L, -0.1 * L) : wheel ? new Vector3(wheel.x, wheel.y - 0.04, wheel.z - 0.052) : new Vector3(-0.034, 0.062, -0.01);
  const w = wheel ?? new Vector3(-0.034, 0.102, 0.032);
  const grip = bike ? { x: 0.13 * L, y: 0.47 * L, z: 0.21 * L, cx: 0 } : { x: 0.017, y: w.y + 0.004, z: w.z - 0.006, cx: w.x };
  actor.root.position.copy(hipsAt).sub(actor.hips());
  frame.add(actor.root);
  return {
    actor, lean: bike ? 0.55 : -0.2,
    hands: { left: new Vector3(grip.cx + grip.x, grip.y, grip.z), right: new Vector3(grip.cx - grip.x, grip.y, grip.z) },
    pole: { left: new Vector3(1, -1.2, -0.3).normalize(), right: new Vector3(-1, -1.2, -0.3).normalize() },
  };
}
const sq = new Quaternion(), sl = new Vector3(), sr = new Vector3(), spl = new Vector3(), spr = new Vector3(), sside = new Vector3(), sup = new Vector3();
/** Each frame: play on (`dt` s), then sit up or lean over, hands to the bars or wheel. `frame` is what the seat is in. */
export function poseSeat(S: Seat, frame: Object3D, dt: number) {
  S.actor.mixer.update(Math.min(dt, 0.1));
  frame.updateWorldMatrix(true, false); frame.getWorldQuaternion(sq);
  lean(S.actor, S.lean, sside.set(1, 0, 0).applyQuaternion(sq), sup.set(0, 1, 0).applyQuaternion(sq));
  reach(S.actor, { left: frame.localToWorld(sl.copy(S.hands.left)), right: frame.localToWorld(sr.copy(S.hands.right)) },
    { left: spl.copy(S.pole.left).applyQuaternion(sq), right: spr.copy(S.pole.right).applyQuaternion(sq) });
}
/** Hide a vehicle's built stand-in driver or rider (its parts are named so). */
export function hideStandIn(o: Object3D) { o.traverse((m) => { if (m.name === "simple-driver" || m.name === "rider") m.visible = false; }); }

