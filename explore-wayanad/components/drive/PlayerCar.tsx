"use client";
import { use, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending, Box3, BufferAttribute, BufferGeometry, CanvasTexture, CapsuleGeometry, CatmullRomCurve3, Color, Group, Material, Matrix4, Mesh, MeshStandardMaterial,
  Object3D, Quaternion, SphereGeometry, SpotLight, Sprite, SpriteMaterial, Vector3, type PerspectiveCamera,
} from "three";
import { CAR, game } from "@/lib/game";
import { settle, simulate, type RoadInfo } from "@/lib/carPhysics";
import { collidePlayer, trafficControl } from "@/lib/traffic";
import { loadVehicle, mergeInto } from "@/lib/vehicleAssets";
import { forestRoad, height, roadShapeAt } from "@/lib/terrain";
import { scrollState } from "@/lib/scrollState";
import { driveT, driveT2, driveT7, driveT8, FOREST_ROUTE } from "@/lib/drive";
import { weather } from "@/lib/weather";
import { duskness } from "@/lib/theme";
import { hit, impact } from "@/lib/impact";
import { frameTimed } from "@/lib/perf";
import type { ActId } from "@/data/acts";

/* The car you drive: a compact SUV, unbranded (CC BY — public/models/traffic/ATTRIBUTION.md; scripts/retouch/player-suv.mjs
 * takes the maker's badges off and puts WAYANAD on the plates), 4.0 m long, in units
 * of 10 m with +z forward and +x its left. Camera views (C cycles them): behind it, close behind, on the bonnet. */
const LENGTH = 0.4;
/** Phase one ends just past the Lakkidi gate: the car brakes by itself over the last `brake` units and stops `after`
 * units (400 m) beyond the arch, and the HUD says goodbye. */
const GATE = { after: 40, brake: 12 };
/** A soft round glow for the lamp sprites (one texture for all). */
let glowTex: CanvasTexture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,0.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return (glowTex = new CanvasTexture(c));
}
const VIEW = {
  chase: { back: 0.78, up: 0.2, ahead: 0.9, aimUp: 0.06 },
  near: { back: 0.5, up: 0.13, ahead: 0.9, aimUp: 0.07 },
  hood: { at: new Vector3(0, 0.156, 0.05), look: new Vector3(0, 0.132, 1.2) }, // eye just ahead of the windscreen, in the car's frame
};
const YAW = { tau: 0.22, maxRate: 2.4 }; // the chase camera's heading: a damped follow, capped so hairpins never whip it round
const BLEND = 0.4; // s to glide between views
const up = new Vector3(0, 1, 0);

/** scroll progress (0–1) whose drive table gives road position t: the inverse of lib/drive's lookups */
function progressFor(fn: (q: number) => number, t: number) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (fn(mid) < t) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** The plane of a set of points (the steering wheel's rim): its centre and normal, from the points' covariance. */
function plane(points: Vector3[]) {
  const c = points.reduce((a, p) => a.add(p), new Vector3()).divideScalar(points.length);
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of points) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] += d[i] * d[j]; }
  const mul = (v: Vector3) => new Vector3(m[0] * v.x + m[1] * v.y + m[2] * v.z, m[3] * v.x + m[4] * v.y + m[5] * v.z, m[6] * v.x + m[7] * v.y + m[8] * v.z);
  const power = (v: Vector3, not?: Vector3) => { for (let i = 0; i < 40; i++) { v = mul(v); if (not) v.addScaledVector(not, -v.dot(not)); v.normalize(); } return v; };
  const e1 = power(new Vector3(1, 0.3, 0.2)), e2 = power(new Vector3(0.2, 1, 0.3), e1);
  return { centre: c, normal: new Vector3().crossVectors(e1, e2).normalize() };
}

/** A seated driver: shirt, arms to the wheel, head with hair — simple smooth shapes, seen through the glass. */
function driver(wheel: Vector3) {
  const g = new Group(), skin = new MeshStandardMaterial({ color: 0x7a5038, roughness: 0.7 });
  const shirt = new MeshStandardMaterial({ color: 0xd9d4c6, roughness: 0.85 }), hair = new MeshStandardMaterial({ color: 0x141110, roughness: 0.6 });
  const part = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number, rx = 0, rz = 0) => { const m = new Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = false; g.add(m); return m; };
  part(new CapsuleGeometry(0.0155, 0.032, 4, 10), shirt, 0, 0.083, -0.06, -0.12);                      // torso
  part(new SphereGeometry(0.0105, 14, 12), skin, 0, 0.122, -0.052);                                    // head
  part(new SphereGeometry(0.0108, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.1245, -0.054); // hair
  for (const s of [1, -1]) part(new CapsuleGeometry(0.0045, 0.04, 4, 8), shirt, s * 0.014, 0.088, -0.03, -1.15, s * 0.25); // arms forward to the wheel
  g.position.set(wheel.x, 0, wheel.z);
  return g;
}

export default function PlayerCar({ curve, forest }: { curve: CatmullRomCurve3; forest: CatmullRomCurve3 | null }) {
  const source = use(loadVehicle("/models/traffic/player-suv.glb"));
  const camera = useThree((s) => s.camera);
  const roads = useMemo<RoadInfo[]>(() => [
    { curve, length: curve.getLength(), widen: (t: number) => roadShapeAt(t).widen },
    ...(forest ? [{ curve: forest, length: forest.getLength(), widen: () => 0 }] : []),
  ], [curve, forest]);

  const rig = useMemo(() => {
    // scale the model to 4.0 m, wheels on the ground, centred
    const wrap = new Group(), model = source.clone(true); wrap.add(model);
    const box = new Box3().setFromObject(model), size = box.getSize(new Vector3()), k = LENGTH / size.z;
    model.scale.setScalar(k); model.updateMatrixWorld(true);
    const b2 = new Box3().setFromObject(model), c2 = b2.getCenter(new Vector3());
    model.position.set(-c2.x, -b2.min.y, -c2.z); model.updateMatrixWorld(true);

    const root = new Group(); root.name = "player-car";
    const body = new Group(); root.add(body); // pitches and rolls on its springs; the wheels stay on the road
    const under = (o: Object3D, test: (n: Object3D) => boolean) => { for (let p: Object3D | null = o; p; p = p.parent) if (test(p)) return p; return null; };
    const isWheel = (n: Object3D) => /wheel_(lf|rf|lr|rr)_dummy/i.test(n.name), isSteer = (n: Object3D) => /^steer/i.test(n.name);
    const meshes: Mesh[] = []; model.traverse((o) => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
    const stat = meshes.filter((m) => !under(m, isWheel) && !under(m, isSteer)), steer = meshes.filter((m) => !under(m, isWheel) && under(m, isSteer));

    // wheels: a pivot at each wheel's centre (front ones steer about it), a spinner inside it that rolls
    const wheels: { pivot: Group; spinner: Group; front: boolean }[] = [];
    // (in this model one "wheel" node holds all four wheels, each a child: each child with meshes is a wheel)
    const dummies = new Set<Object3D>(); for (const m of meshes) { const d = under(m, isWheel); if (d) dummies.add(d); }
    const units: Object3D[] = [];
    for (const d of dummies) {
      const kids = d.children.filter((c) => { let any = false; c.traverse((o) => { any ||= (o as Mesh).isMesh; }); return any; });
      units.push(...(kids.length > 1 ? kids : [d]));
    }
    for (const d of units) {
      const c = new Box3().setFromObject(d).getCenter(new Vector3());
      const pivot = new Group(), spinner = new Group(); pivot.position.copy(c); pivot.add(spinner); root.add(pivot);
      root.updateMatrixWorld(true);
      const own: Mesh[] = []; d.traverse((o) => { if ((o as Mesh).isMesh) own.push(o as Mesh); });
      mergeInto(own, spinner);
      wheels.push({ pivot, spinner, front: c.z > 0 });
    }
    // the steering wheel: turns about its own column (the normal of the rim's plane)
    let steering: { pivot: Group; axis: Vector3 } | null = null;
    if (steer.length) {
      const pts: Vector3[] = [];
      for (const m of steer) { const p = m.geometry.getAttribute("position"); for (let i = 0; i < p.count; i += 3) pts.push(new Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld)); }
      const { centre, normal } = plane(pts), pivot = new Group(); pivot.position.copy(centre); body.add(pivot); body.updateMatrixWorld(true);
      mergeInto(steer, pivot);
      steering = { pivot, axis: normal };
      body.add(driver(centre));
    }
    mergeInto(stat, body);
    // lamps: the model's own light materials glow (tail and brake lamps red, headlamps warm white)
    const lamps = { head: [] as MeshStandardMaterial[], tail: [] as MeshStandardMaterial[] };
    body.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (!m || !("emissive" in m)) return;
      if (/front_light/i.test(m.name)) { m.emissive = new Color(0xfff2d6); lamps.head.push(m); }
      if (/rear_light/i.test(m.name)) { m.emissive = new Color(0xff2a1a); lamps.tail.push(m); }
    });
    const spot = new SpotLight(0xfff0d0, 0, 9, 0.5, 0.6, 1.2); spot.position.set(0, 0.07, LENGTH / 2);
    const target = new Object3D(); target.position.set(0, -0.15, 4); root.add(spot, target); spot.target = target;
    // brake and reversing glows: soft sprites over the tail lamps, so a press of the brake reads from the chase camera
    // in any light (the lamp material alone is a dull red in daylight)
    const tail = new Box3(); body.updateMatrixWorld(true);
    body.traverse((o) => { const m = o as Mesh; if (m.isMesh && lamps.tail.includes(m.material as MeshStandardMaterial)) tail.expandByObject(m); });
    if (tail.isEmpty()) tail.set(new Vector3(-0.09, 0.07, -LENGTH / 2), new Vector3(0.09, 0.09, -LENGTH / 2 + 0.01));
    const w = tail.max.x - tail.min.x, y = (tail.min.y + tail.max.y) / 2, z = tail.min.z - 0.004;
    const glow = (color: number, size: number, xs: number[]) => {
      const material = new SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, fog: false });
      for (const x of xs) { const sp = new Sprite(material); sp.position.set(x, y, z); sp.scale.setScalar(size); body.add(sp); }
      return material;
    };
    const brakeGlow = glow(0xff2a14, 0.07, [tail.min.x + w * 0.1, tail.max.x - w * 0.1]);
    const reverseGlow = glow(0xfff4e8, 0.045, [tail.min.x + w * 0.3, tail.max.x - w * 0.3]);
    return { root, body, wheels, steering, lamps, spot, brakeGlow, reverseGlow };
  }, [source]);

  const cam = useRef({ yaw: 0, y: 0, lift: 0, ready: false, view: game.view, blend: 1, from: new Vector3(), fromQ: new Quaternion() });
  const lastScrape = useRef(0), contact = useRef({ loss: 0, peak: 0 }), touching = useRef({ peak: 0, clear: 0 }), spring = useRef({ pitch: 0, roll: 0, vp: 0, vr: 0 }), lastReset = useRef(game.reset), lastLeg = useRef(game.leg);
  const tmp = useMemo(() => ({ p: new Vector3(), tan: new Vector3(), left: new Vector3(), fwd: new Vector3(), r: new Vector3(), n: new Vector3(), m: new Matrix4(), q: new Quaternion(), want: new Vector3(), look: new Vector3(), dir: new Vector3(), a: new Vector3(), b: new Vector3(), qa: new Quaternion() }), []);

  // before the director and traffic each frame (negative priority runs first and leaves rendering to R3F)
  useFrame((_, dt) => frameTimed("player", () => {
    const road = roads[Math.min(game.leg, roads.length - 1)];
    if (game.reset !== lastReset.current || game.leg !== lastLeg.current) { lastReset.current = game.reset; lastLeg.current = game.leg; settle(); cam.current.ready = false; }
    let alpha = 1;
    const speedBefore = game.speed;
    if (game.started && game.phase === "drive" && !game.paused) {
      const gateStop = scrollState.arch * road.length + GATE.after, ending = game.leg === 0 && game.s > gateStop - GATE.brake;
      if (ending) { game.input.throttle = 0; game.input.brake = game.speed > 0.02 ? 0.45 : 0; }
      alpha = simulate(road, dt);
      if (ending && (game.speed <= 0.02 || game.s >= gateStop)) { game.speed = 0; game.input.brake = 0; game.phase = "gate"; }
      if (game.leg === 0 && trafficControl.curve === curve) {
        const p = { s: game.s, lat: game.lat, speed: game.speed, halfL: CAR.halfL, halfW: CAR.halfW, steer: game.steer };
        const knock = collidePlayer(trafficControl.fleet, curve, road.widen, p);
        if (p.s !== game.s) { game.s = p.s; game.prev.s = p.s; }
        game.speed = p.speed; game.bump = Math.max(game.bump, knock);
        // collision feedback (lib/impact): a knock is the closing speed, 1 ≈ 36 km/h. One contact shows once (creeping
        // round a vehicle you're touching stays quiet), again only if it gets clearly harder
        const T = touching.current;
        if (knock > 0) { if (knock > T.peak + 0.12) { hit(knock); T.peak = knock; } T.clear = 0; }
        else if ((T.clear += dt) > 0.4) T.peak = 0;
      }
      if (game.leg === 0 && game.s > road.length * 0.995) { game.phase = "between"; game.speed = 0; }
      const stop = FOREST_ROUTE.stop * road.length;
      if (game.leg === 1 && game.s >= stop) { game.s = stop; game.speed = 0; game.phase = "finished"; }
    } else if (!game.paused) game.input.throttle = 0;
    if (!game.paused) game.bump *= Math.exp(-dt * 6);
    // hitting the barrier or the bank: how hard is the speed it takes off you over the contact (the edge's own number
    // only sees the angle, so a fast glancing hit read as a graze); sliding on along it at the same speed stays quiet
    const C2 = contact.current;
    // (one contact shows once, and again only if it gets clearly harder: grinding along doesn't keep the screen red)
    if (game.scrape > 0.04) {
      C2.loss += Math.max(0, Math.abs(speedBefore) - Math.abs(game.speed));
      const strength = Math.min(1, Math.max(game.scrape, C2.loss * 1.6));
      if (strength > C2.peak + 0.12) { hit(strength); C2.peak = strength; }
    } else if (game.scrape < 0.02) { C2.loss = 0; C2.peak = 0; }
    lastScrape.current = game.scrape;

    // drawn between the last two physics steps
    const s = game.prev.s + (game.s - game.prev.s) * alpha, lat = game.prev.lat + (game.lat - game.prev.lat) * alpha, psi = game.prev.psi + (game.psi - game.prev.psi) * alpha;
    const L = road.length, t = Math.min(1, s / L);

    // the world follows the car: the act and its progress, so fog, light, the minimap and which world shows all match
    let act: ActId, q: number;
    if (game.leg === 0) { if (t < scrollState.churamEnd) { act = "churam"; q = progressFor(driveT, t); } else { act = "kalpetta"; q = Math.min(0.8, progressFor(driveT2, t)); } }
    else if (t < FOREST_ROUTE.muthanga) { act = "forest"; q = progressFor(driveT7, t); } else { act = "border"; q = progressFor(driveT8, t); }
    scrollState.act = act; scrollState.progress = q; scrollState.hold = 0;
    if (game.leg === 0) {
      const places = scrollState.places.filter((pl) => pl.t <= t);
      game.bends = scrollState.bends.filter((b) => b <= t).length;
      game.place = t < scrollState.arch ? (game.bends ? `Hairpin ${game.bends}` : "Adivaram") : places.length ? places[places.length - 1].name : "Lakkidi";
      [game.next, game.nextM] = t < scrollState.arch ? ["Lakkidi gate", (scrollState.arch - t) * L * 10] : ["End of the drive", Math.max(0, scrollState.arch * L + GATE.after - s) * 10];
      // the km readout: road distance from Adivaram (units of 10 m → km), out of the drive's length to its stop
      game.km = s / 100; game.kmTotal = (scrollState.arch * L + GATE.after) / 100;
    } else {
      const places = (forestRoad()?.places ?? []).filter((pl) => pl.t <= t);
      game.place = places.length ? places[places.length - 1].name : "Sulthan Bathery";
      [game.next, game.nextM] = ["Border gate", Math.max(0, FOREST_ROUTE.stop - t) * L * 10];
    }

    // pose: on the road at s, `lat` across it, turned `psi` from its direction, pitched with the slope
    const { p, tan, left, fwd, n, m, q: rot } = tmp, { root, body, wheels, steering, lamps, spot, brakeGlow, reverseGlow } = rig;
    road.curve.getPointAt(t, p); road.curve.getTangentAt(t, tan);
    left.set(tan.z, 0, -tan.x).normalize();
    p.addScaledVector(left, lat); p.y -= 0.588; // the asphalt (as Traffic's lanePoint)
    const rise = road.curve.getPointAt(Math.min(1, (s + 0.2) / L)).y - road.curve.getPointAt(Math.max(0, (s - 0.2) / L)).y;
    fwd.copy(tan).setY(0).normalize().multiplyScalar(Math.cos(psi)).addScaledVector(left, Math.sin(psi)).setY(rise / 0.4).normalize();
    const right = tmp.r.copy(up).cross(fwd).normalize(); n.copy(fwd).cross(right).normalize();
    rot.setFromRotationMatrix(m.makeBasis(right, n, fwd));
    root.position.copy(p).addScaledVector(n, 0.002); root.quaternion.copy(rot);

    // springs: the body dips under braking, squats when pulling away, leans out of bends
    if (!game.paused) {
      const sp = spring.current, k = 140, c = 16, d = Math.min(dt, 0.05);
      const wantP = Math.max(-0.035, Math.min(0.035, -game.accel * 0.03)), wantR = Math.max(-0.045, Math.min(0.045, game.sideways * 0.05));
      sp.vp += (k * (wantP - sp.pitch) - c * sp.vp) * d; sp.pitch += sp.vp * d;
      sp.vr += (k * (wantR - sp.roll) - c * sp.vr) * d; sp.roll += sp.vr * d;
      body.rotation.set(sp.pitch, 0, sp.roll);
    }
    for (const w of wheels) { w.spinner.rotation.x = game.wheel; w.pivot.rotation.y = w.front ? game.steer * 0.55 : 0; }
    if (steering) steering.pivot.quaternion.setFromAxisAngle(steering.axis, game.steer * 2.6);

    // lamps: brake lights whenever the brake is pressed (slowing or reversing), reversing lights going backwards; tail
    // and head lamps on in rain, mist, gloom and after dusk; the beam only then
    const dark = Math.min(1, weather.gloom + weather.mist * 0.6 + weather.rain * 0.5 + duskness());
    const braking = !game.paused && game.input.brake > 0, reversing = game.speed < -0.01;
    for (const l of lamps.tail) l.emissiveIntensity = braking ? 4 : 0.3 + dark * 1.2;
    brakeGlow.opacity += ((braking ? 0.95 : dark * 0.18) - brakeGlow.opacity) * Math.min(1, dt * 18);
    reverseGlow.opacity += ((reversing ? 0.9 : 0) - reverseGlow.opacity) * Math.min(1, dt * 12);
    for (const l of lamps.head) l.emissiveIntensity = 0.15 + dark * 2.5;
    // (always in the scene, at zero by day: switching a light on or off rebuilds every material's shader — a stall)
    spot.intensity = dark * 6;

    // the camera
    const C = cam.current, camera3 = camera as PerspectiveCamera, view = game.view, { want, look, dir } = tmp;
    if (view !== C.view) { C.from.copy(camera.position); C.fromQ.copy(camera.quaternion); C.blend = 0; C.view = view; }
    const fov = view === "hood" ? 66 : 60;
    if (Math.abs(camera3.fov - fov) > 0.01) { camera3.fov += (fov - camera3.fov) * Math.min(1, dt * 8); camera3.updateProjectionMatrix(); }
    // the chase camera looks a little toward where the road goes (its direction ~12 m ahead), not only where the car
    // points, so on a hairpin the way out comes into view as you turn instead of the bank
    const ahead = road.curve.getTangentAt(Math.min(1, (s + 1.2) / L), tmp.a), carYaw = Math.atan2(fwd.x, fwd.z);
    const roadYaw = Math.atan2(ahead.x, ahead.z), toRoad = Math.atan2(Math.sin(roadYaw - carYaw), Math.cos(roadYaw - carYaw));
    const heading = carYaw + toRoad * 0.3 * Math.min(1, Math.abs(game.speed) / 0.3);
    if (!C.ready) { C.yaw = heading; C.y = root.position.y; C.ready = true; }
    if (!game.paused) {
      const dy = Math.atan2(Math.sin(heading - C.yaw), Math.cos(heading - C.yaw));
      // damped follow, capped softly (a hard cap kinked the turn: steady swing, then a sudden ease)
      const cap = YAW.maxRate * dt;
      C.yaw += cap * Math.tanh((dy * (1 - Math.exp(-dt / YAW.tau))) / cap);
      C.y += (root.position.y - C.y) * (1 - Math.exp(-dt / 0.15));
    }
    if (view === "hood") {
      root.updateMatrixWorld();
      want.copy(VIEW.hood.at).applyMatrix4(root.matrixWorld); look.copy(VIEW.hood.look).applyMatrix4(root.matrixWorld);
    } else {
      const v = VIEW[view];
      dir.set(Math.sin(C.yaw), 0, Math.cos(C.yaw));
      want.set(root.position.x, C.y, root.position.z).addScaledVector(dir, -v.back).addScaledVector(up, v.up);
      look.set(root.position.x, C.y, root.position.z).addScaledVector(dir, v.ahead).addScaledVector(up, v.aimUp);
      // keep the hillside out of the shot: lift the camera over any ground between it and the car
      // (eased: rises quickly, settles slowly, so the shot never pops)
      let lift = 0;
      for (let i = 1; i <= 5; i++) {
        const f = i / 5, x = root.position.x + (want.x - root.position.x) * f, z = root.position.z + (want.z - root.position.z) * f;
        const need = height(x, z) + 0.06 - (C.y + (want.y + lift - C.y) * f);
        if (need > 0) lift += need / f;
      }
      if (!game.paused) C.lift += (lift - C.lift) * (1 - Math.exp(-dt / (lift > C.lift ? 0.08 : 0.5)));
      want.y += Math.max(C.lift, lift * 0.5);
    }
    // an impact shakes the view: smooth noise (a few sines, not random jitter), mostly up-down and side to side,
    // fading with lib/impact; ~6 cm and a fraction of a degree at full strength
    const k = impact.shake, st = impact.time * 26;
    if (k > 0.002) want.add(tmp.a.set(Math.sin(st * 1.3) + 0.5 * Math.sin(st * 2.9 + 0.7), 0.8 * (Math.sin(st * 1.7 + 1.1) + 0.5 * Math.sin(st * 3.3)), 0).multiplyScalar(k * 0.006));
    camera.position.copy(want); camera.lookAt(look);
    if (k > 0.002) camera.rotateZ(Math.sin(st * 1.1 + 0.3) * k * 0.012);
    if (C.blend < 1) {
      C.blend = Math.min(1, C.blend + dt / BLEND);
      const e = C.blend * C.blend * (3 - 2 * C.blend);
      tmp.qa.copy(camera.quaternion);
      camera.position.lerpVectors(C.from, want, e); camera.quaternion.slerpQuaternions(C.fromQ, tmp.qa, e);
    }
  }), -1);

  return <primitive object={rig.root} />;
}
