/**
 * The cast as moving 3D people (data/drivers.ts): any of them, playing any of the shared moves. Used by the garage
 * preview, your driver on the bike or at the wheel (components/drive/PlayerCar), friends' drivers (RemoteCars) and the
 * people walking by the road (components/scene/Pedestrians).
 *  - public/models/drivers/<id>.glb  each person: mesh, skeleton and their own idle (Higgsfield image → 3D, rigged)
 *  - public/models/drivers/moves.glb the moves, one skeleton's worth of clips (walk_m, walk_f, sit_m, sit_f, idle):
 *    all the people share the same rig (bone names), so a clip made on one plays on any. Only rotations are kept, and the
 *    hips' height is carried across in proportion, so a short person doesn't float or sink in someone else's walk.
 */
import { AnimationClip, AnimationMixer, Box3, Group, Matrix4, Quaternion, Vector3, VectorKeyframeTrack, type AnimationAction, type Bone, type Object3D, type SkinnedMesh } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { isWomanPerson, personHeight, personModel, type PersonId } from "@/data/drivers";
import { whenReady } from "@/lib/loading";

export type Move = "idle" | "walk" | "sit" | "run";
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const people = new Map<string, Promise<{ scene: Object3D; clips: AnimationClip[] }>>();
let moves: Promise<Map<string, AnimationClip>> | null = null;

/** `lo`: the light copy (about a tenth of the shape, small textures: models/drivers/lo) for people further off. */
export function loadDriver(id: PersonId, lo = false) {
  const url = lo ? personModel(id).replace("/drivers/", "/drivers/lo/") : personModel(id);
  let p = people.get(url);
  if (!p) { p = loader.loadAsync(url).then((g) => ({ scene: g.scene, clips: g.animations })); people.set(url, p); }
  return p;
}
export function loadMoves() {
  return (moves ??= loader.loadAsync("/models/drivers/moves.glb").then((g) => new Map(g.animations.map((a) => [a.name, a]))));
}
/** Both, ready to make actors from (the same promise each time, so React's `use` can wait on it). */
const casts = new Map<string, Promise<[{ scene: Object3D; clips: AnimationClip[] }, Map<string, AnimationClip>]>>();
export function loadCast(id: PersonId, lo = false) {
  const key = `${id}${lo ? ":lo" : ""}`;
  let p = casts.get(key);
  // (the light copies are the roadside people and the traffic's crews: they wait until the road is ready, see whenReady)
  if (!p) { p = (lo ? whenReady() : Promise.resolve()).then(() => Promise.all([loadDriver(id, lo), loadMoves()])); casts.set(key, p); }
  return p;
}

/** Where the clips' hips stood (cm, the rig's units) on the people they were made on: Arjun (men) and Meera (women). */
const SOURCE_HIPS = { m: new Vector3(0, 93.775, -0.669), f: new Vector3(0.663, 87.918, 9.186) };

export type Actor = {
  root: Group; mixer: AnimationMixer; bones: Map<string, Object3D>;
  /** fade to a move (0 s jumps) */ play: (move: Move, fade?: number) => AnimationAction | null;
  /** the hips' place in `root`'s frame in the current pose, after a mixer update */ hips: () => Vector3;
  /** each hand's shape, measured from the model (see handShape): null if the model has no skinned hands */
  palms: { left: HandShape; right: HandShape } | null;
};

/** A hand as modelled, in its bone's own frame: `dir` wrist → middle of the hand (where the fingers point), `palm` the
 * palm's side (flat across the hand), and the bone's rest rotation. */
export type HandShape = { dir: Vector3; palm: Vector3; rest: Quaternion };
const shapes = new WeakMap<Object3D, Map<string, HandShape | null>>();
/**
 * Measure a hand from the skin it moves: every vertex mostly on the hand bone, taken into that bone's frame. Their
 * middle gives where the fingers point; the flattest direction through them, the palm (the side facing in and down at
 * rest). The models were made bent at the wrist, so "in line with the forearm" has to come from the shape, not the bone.
 * Cached per model file (`src`).
 */
function handShape(src: Object3D, body: Object3D, bones: Map<string, Object3D>, side: "Left" | "Right", hipsAt: Vector3): HandShape | null {
  let bySrc = shapes.get(src); if (!bySrc) { bySrc = new Map(); shapes.set(src, bySrc); }
  if (bySrc.has(side)) return bySrc.get(side)!;
  const hand = bones.get(`${side}Hand`) as Bone | undefined, fore = bones.get(`${side}ForeArm`);
  let out: HandShape | null = null;
  if (hand && fore) {
    const pts: Vector3[] = [], c = new Vector3(), m4 = new Matrix4();
    body.traverse((o) => {
      const m = o as SkinnedMesh; if (!m.isSkinnedMesh) return;
      const bi = m.skeleton.bones.indexOf(hand); if (bi < 0) return;
      const pos = m.geometry.getAttribute("position"), si = m.geometry.getAttribute("skinIndex"), sw = m.geometry.getAttribute("skinWeight");
      if (!pos || !si || !sw) return;
      m4.multiplyMatrices(m.skeleton.boneInverses[bi], m.bindMatrix);
      for (let i = 0; i < pos.count; i++) {
        let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi) w += sw.getComponent(i, k);
        if (w < 0.5) continue;
        const v = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m4); pts.push(v); c.add(v);
      }
    });
    if (pts.length >= 12) {
      c.divideScalar(pts.length);
      const dir = c.clone().normalize();
      // the spread of the points: the palm is the axis they spread least along (smallest of the covariance)
      const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (const p of pts) { const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z; C[0] += x * x; C[1] += x * y; C[2] += x * z; C[4] += y * y; C[5] += y * z; C[8] += z * z; }
      C[3] = C[1]; C[6] = C[2]; C[7] = C[5];
      const mul = (v: Vector3) => new Vector3(C[0] * v.x + C[1] * v.y + C[2] * v.z, C[3] * v.x + C[4] * v.y + C[5] * v.z, C[6] * v.x + C[7] * v.y + C[8] * v.z);
      let a = new Vector3(1, 0.3, 0.2).normalize(); for (let i = 0; i < 40; i++) a = mul(a).normalize();
      let b = new Vector3(0.2, 1, 0.3); b.addScaledVector(a, -b.dot(a)).normalize();
      for (let i = 0; i < 40; i++) { b = mul(b); b.addScaledVector(a, -b.dot(a)).normalize(); }
      const palm = new Vector3().crossVectors(a, b).normalize();
      palm.addScaledVector(dir, -palm.dot(dir)).normalize();
      // which side is the palm: at rest it faces in toward the body and down
      hand.updateWorldMatrix(true, false);
      const H = hand.getWorldPosition(new Vector3()), want = hipsAt.clone().sub(H).setY(0).normalize().add(new Vector3(0, -1, 0)).normalize();
      if (palm.clone().applyQuaternion(hand.getWorldQuaternion(new Quaternion())).dot(want) < 0) palm.negate();
      out = { dir, palm, rest: hand.quaternion.clone() };
    }
  }
  bySrc.set(side, out);
  return out;
}

/**
 * One person ready to place: `height` tall in the caller's units, feet on y = 0, facing +z (the models don't all face
 * the same way: each is turned by its hips, left hip − right hip crossed with up). Their own idle until `play`.
 */
export function makeActor(id: PersonId, src: { scene: Object3D; clips: AnimationClip[] }, clips: Map<string, AnimationClip>, height: number): Actor {
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
  // each hand's real shape (which way the fingers point, which side the palm is), measured from the model once
  root.updateMatrixWorld(true);
  let palms: Actor["palms"] = null;
  const hipsAt = bones.get("Hips")?.getWorldPosition(new Vector3());
  if (hipsAt) {
    const left = handShape(src.scene, body, bones, "Left", hipsAt), right = handShape(src.scene, body, bones, "Right", hipsAt);
    if (left && right) palms = { left, right };
  }
  const mixer = new AnimationMixer(body);
  // the shared clips, fitted to this person: rotations as they are; the hips' track moved to their own hips' rest
  const hipsBone = bones.get("Hips"), rest = hipsBone ? hipsBone.position.clone() : new Vector3();
  const woman = isWomanPerson(id), fitted = new Map<Move, AnimationClip>();
  const fitClip = (name: string, sex: "m" | "f") => {
    const clip = clips.get(name); if (!clip) return null;
    const from = SOURCE_HIPS[sex], s = rest.y / from.y;
    // (not the hands: each person was rigged on their own, so their hand bones rest at different angles, 5–33° apart,
    // and another rig's wrist rotations bent theirs back like pushing on a wall. Left out, a hand stays in line with its
    // forearm as modelled.)
    const tracks = clip.tracks.filter((t) => !/(Left|Right)Hand\.quaternion$/.test(t.name)).map((t) => {
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
  const run = fitClip(woman ? "run_f" : "run_m", woman ? "f" : "m");
  if (walk) fitted.set("walk", walk); if (sit) fitted.set("sit", sit); if (run) fitted.set("run", run);
  let current: AnimationAction | null = null;
  const play = (move: Move, fade = 0.25) => {
    const clip = fitted.get(move); if (!clip) return null;
    const next = mixer.clipAction(clip);
    if (next === current) { if (!next.isRunning()) next.reset().play(); return next; } // (stopped, e.g. by stopAllAction: start again)
    next.reset().play();
    if (current && fade > 0) next.crossFadeFrom(current, fade, false); else current?.stop();
    current = next; return next;
  };
  play("idle", 0);
  const hips = () => { root.updateMatrixWorld(true); return hipsBone ? root.worldToLocal(hipsBone.getWorldPosition(new Vector3())) : new Vector3(0, height * 0.5, 0); };
  return { root, mixer, bones, play, hips, palms };
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
export function reach(actor: Actor, targets: { left: Vector3; right: Vector3 }, pole: { left: Vector3; right: Vector3 }, palm?: { left: Vector3; right: Vector3 }) {
  for (const side of ["Left", "Right"] as const) {
    const upper = actor.bones.get(`${side}Arm`), fore = actor.bones.get(`${side}ForeArm`), hand = actor.bones.get(`${side}Hand`);
    if (!upper || !fore || !hand) continue;
    const P = side === "Left" ? pole.left : pole.right;
    upper.updateWorldMatrix(true, true);
    const S = vb.setFromMatrixPosition(upper.matrixWorld).clone(), E = vc.setFromMatrixPosition(fore.matrixWorld).clone(), H = vd.setFromMatrixPosition(hand.matrixWorld).clone();
    // the wrist stops short of the grip (the hand's bone starts at the wrist), so the hand can close round it
    const grip = side === "Left" ? targets.left : targets.right, T = grip.clone().addScaledVector(grip.clone().sub(S).normalize(), palm ? -WRIST : 0);
    const a = S.distanceTo(E), b = E.distanceTo(H), toT = T.clone().sub(S), d = Math.min(a + b - 1e-5, Math.max(Math.abs(a - b) + 1e-5, toT.length()));
    toT.normalize();
    const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
    const bend = P.clone().addScaledVector(toT, -P.dot(toT)).normalize();
    const elbow = S.clone().addScaledVector(toT, x).addScaledVector(bend, h);
    aim(upper, fore, elbow.clone().sub(S).normalize());
    fore.updateWorldMatrix(true, false);
    aim(fore, hand, T.clone().sub(vc.setFromMatrixPosition(fore.matrixWorld)).normalize());
    // and the hand round the grip: palm onto it, fingers bent over
    const want = side === "Left" ? palm?.left : palm?.right;
    if (want) holdHand(actor, side, want, FLEX);
  }
}
const WRIST = 0.006; // units (6 cm): how far short of the grip the wrist stops
const FLEX = 0.6;    // rad (~35°): the wrist bent toward the palm, holding on
/**
 * Hands hanging by the sides (walking, standing, a passenger's lap): each forearm rolled so its palm faces in toward the
 * body. The shared clips' arm rotations come from another rig, which left palms facing back with the wrists flared.
 * Run after the mixer's update.
 */
const sh = new Vector3(), sw = new Vector3();
export function settleHands(actor: Actor) {
  const hips = actor.bones.get("Hips"); if (!hips || !actor.palms) return;
  hips.getWorldPosition(sh);
  for (const side of ["Left", "Right"] as const) {
    const hand = actor.bones.get(`${side}Hand`); if (!hand) continue;
    hand.getWorldPosition(sw); sw.subVectors(sh, sw).setY(0);
    if (sw.lengthSq() < 1e-10) continue;
    holdHand(actor, side, sw.normalize(), RELAX);
  }
}
const RELAX = 0.12; // rad: a hanging hand's slight curl toward the palm
/**
 * Set a hand by its measured shape: fingers along the forearm, bent `flex` rad toward the palm, the palm toward `want`
 * (world). The forearm is rolled first so the wrist doesn't have to twist.
 */
const hx = new Vector3(), hy = new Vector3(), hz = new Vector3(), hA = new Matrix4(), hB = new Matrix4(), hq = new Quaternion(), hq2 = new Quaternion();
function holdHand(actor: Actor, side: "Left" | "Right", want: Vector3, flex: number) {
  const shape = side === "Left" ? actor.palms?.left : actor.palms?.right, fore = actor.bones.get(`${side}ForeArm`), hand = actor.bones.get(`${side}Hand`);
  if (!shape || !fore || !hand) return;
  hand.quaternion.copy(shape.rest);
  twist(fore, hand, shape.palm, want);
  fore.updateWorldMatrix(true, true);
  // the wanted frame in the world: fingers (x), palm (y), across (z)
  const axis = hx.setFromMatrixPosition(hand.matrixWorld).sub(hy.setFromMatrixPosition(fore.matrixWorld)).normalize();
  const P = hy.copy(want).addScaledVector(axis, -want.dot(axis)); if (P.lengthSq() < 1e-8) return; P.normalize();
  const D = hz.copy(axis).multiplyScalar(Math.cos(flex)).addScaledVector(P, Math.sin(flex)).normalize();
  P.addScaledVector(D, -P.dot(D)).normalize();
  hA.makeBasis(D, P, new Vector3().crossVectors(D, P));
  // the same frame in the hand's own terms
  const d = shape.dir, p = shape.palm.clone().addScaledVector(d, -shape.palm.dot(d)).normalize();
  hB.makeBasis(d, p, new Vector3().crossVectors(d, p));
  const world = hq.setFromRotationMatrix(hA).multiply(hq2.setFromRotationMatrix(hB).invert());
  hand.quaternion.copy(fore.getWorldQuaternion(new Quaternion()).invert().multiply(world));
  hand.updateWorldMatrix(false, false);
}
/** Palms on the bars or the wheel, in the vehicle's frame (+x left, +z forward): seat() and lib/crew. */
export const PALM = {
  bike: { left: new Vector3(-0.25, -1, 0.25).normalize(), right: new Vector3(0.25, -1, 0.25).normalize() },
  car: { left: new Vector3(-0.6, -0.2, 0.8).normalize(), right: new Vector3(0.6, -0.2, 0.8).normalize() },
};
/** Roll `fore` about the line to its child `hand` so the hand's `own` direction (hand frame) turns toward `want` (world). */
function twist(fore: Object3D, hand: Object3D, own: Vector3, want: Vector3) {
  fore.updateWorldMatrix(true, true);
  const axis = va.setFromMatrixPosition(hand.matrixWorld).sub(vb.setFromMatrixPosition(fore.matrixWorld)).normalize();
  const now = vc.copy(own).applyQuaternion(hand.getWorldQuaternion(qa)), to = vd.copy(want);
  now.addScaledVector(axis, -now.dot(axis)); to.addScaledVector(axis, -to.dot(axis));
  if (now.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
  now.normalize(); to.normalize();
  const angle = Math.atan2(axis.dot(new Vector3().crossVectors(now, to)), now.dot(to));
  const turn = qb.setFromAxisAngle(axis, angle), world = fore.getWorldQuaternion(new Quaternion()).premultiply(turn);
  fore.quaternion.copy(fore.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(world));
  fore.updateWorldMatrix(false, true);
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
  // and the eyes up, looking where the vehicle goes: the sitting clip looks down into the lap, which seen through a
  // windscreen is the top of a head. Forward is the frame's: up × side
  const head = actor.bones.get("Head"), front = headFront(actor);
  if (head && front) aim(head, front, new Vector3().crossVectors(side, up).normalize().applyAxisAngle(side, 0.08));
}
/** The marker ahead of the face (found once per person: searching the skeleton each frame, for every seated person, added up). */
const fronts = new WeakMap<Actor, Object3D | null>();
function headFront(actor: Actor) {
  let f = fronts.get(actor);
  if (f === undefined) { f = actor.root.getObjectByName("headfront") ?? null; fronts.set(actor, f); }
  return f;
}
export const isWoman = (id: PersonId) => isWomanPerson(id);
export const heightOf = (id: PersonId) => personHeight(id);

/** A driver in their seat: where the hands go and how they sit, in the vehicle's own frame (+x left, +z forward). */
/** `free`: a passenger — hands in the lap as the clip has them, not reaching for anything. */
export type Seat = { actor: Actor; hands: { left: Vector3; right: Vector3 }; pole: { left: Vector3; right: Vector3 }; palm: { left: Vector3; right: Vector3 }; lean: number; free?: boolean };
/**
 * Sit `actor` in a vehicle `length` units long (frame: wheels on y = 0, centred): on a bike from the old rider's marks
 * (fractions of its length), leaning over the bars; in a car at its steering wheel's centre `wheel`, upright, right-hand
 * drive. Adds the actor to `frame`.
 */
export function seat(actor: Actor, frame: Object3D, bike: boolean, length: number, wheel?: Vector3 | null, passenger = false): Seat {
  actor.play("sit", 0); actor.mixer.update(0.01);
  const L = length;
  let hipsAt = bike ? new Vector3(0, 0.37 * L, -0.1 * L) : wheel ? new Vector3(wheel.x, wheel.y - 0.04, wheel.z - 0.052) : new Vector3(-0.034, 0.062, -0.01);
  // a passenger: beside the driver, the other side of the car (or the middle of an auto's back seat); on a bike, behind
  if (passenger) hipsAt = bike ? new Vector3(0, 0.4 * L, -0.31 * L) : Math.abs(hipsAt.x) < 0.01 ? hipsAt.clone().setZ(hipsAt.z - 0.07) : hipsAt.clone().setX(-hipsAt.x);
  const w = wheel ?? new Vector3(-0.034, 0.102, 0.032);
  const grip = bike ? { x: 0.13 * L, y: 0.47 * L, z: 0.21 * L, cx: 0 } : { x: 0.017, y: w.y + 0.004, z: w.z - 0.006, cx: w.x };
  actor.root.position.copy(hipsAt).sub(actor.hips());
  frame.add(actor.root);
  return {
    actor, lean: bike ? (passenger ? 0.3 : 0.55) : -0.2, free: passenger,
    hands: { left: new Vector3(grip.cx + grip.x, grip.y, grip.z), right: new Vector3(grip.cx - grip.x, grip.y, grip.z) },
    // elbows: in a car out and down; on a bike mostly down and back, tucked in (out-first read as arms flung up)
    pole: bike
      ? { left: new Vector3(0.45, -1.4, -0.6).normalize(), right: new Vector3(-0.45, -1.4, -0.6).normalize() }
      : { left: new Vector3(1, -1.2, -0.3).normalize(), right: new Vector3(-1, -1.2, -0.3).normalize() },
    // palms: on a bike down over the grips; at a wheel forward and in, onto the rim
    palm: bike ? PALM.bike : PALM.car,
  };
}
const sq = new Quaternion(), sl = new Vector3(), sr = new Vector3(), spl = new Vector3(), spr = new Vector3(), sside = new Vector3(), sup = new Vector3(), sal = new Vector3(), sar = new Vector3();
/** Each frame: play on (`dt` s), then sit up or lean over, hands to the bars or wheel. `frame` is what the seat is in. */
export function poseSeat(S: Seat, frame: Object3D, dt: number) {
  S.actor.mixer.update(Math.min(dt, 0.1));
  frame.updateWorldMatrix(true, false); frame.getWorldQuaternion(sq);
  lean(S.actor, S.lean, sside.set(1, 0, 0).applyQuaternion(sq), sup.set(0, 1, 0).applyQuaternion(sq));
  if (S.free) settleHands(S.actor);
  else reach(S.actor, { left: frame.localToWorld(sl.copy(S.hands.left)), right: frame.localToWorld(sr.copy(S.hands.right)) },
    { left: spl.copy(S.pole.left).applyQuaternion(sq), right: spr.copy(S.pole.right).applyQuaternion(sq) },
    { left: sal.copy(S.palm.left).applyQuaternion(sq), right: sar.copy(S.palm.right).applyQuaternion(sq) });
}
/** Hide a vehicle's built stand-in driver or rider (its parts are named so). */
export function hideStandIn(o: Object3D) { o.traverse((m) => { if (m.name === "simple-driver" || m.name === "rider") m.visible = false; }); }

