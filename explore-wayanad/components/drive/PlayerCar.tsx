"use client";
import { use, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Box3, BufferAttribute, BufferGeometry, CapsuleGeometry, CatmullRomCurve3, Color, Group, Material, Matrix4, Mesh, MeshStandardMaterial,
  Object3D, Quaternion, SphereGeometry, SpotLight, Vector3, type PerspectiveCamera,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CAR, game } from "@/lib/game";
import { settle, simulate, type RoadInfo } from "@/lib/carPhysics";
import { collidePlayer, trafficControl } from "@/lib/traffic";
import { loadVehicle } from "@/lib/vehicleAssets";
import { forestRoad, height, roadShapeAt } from "@/lib/terrain";
import { scrollState } from "@/lib/scrollState";
import { driveT, driveT2, driveT7, driveT8, FOREST_ROUTE } from "@/lib/drive";
import { weather } from "@/lib/weather";
import { frameTimed } from "@/lib/perf";
import type { ActId } from "@/data/acts";

/* The car you drive: a compact SUV (Brezza-style, CC BY — public/models/traffic/ATTRIBUTION.md), 4.0 m long, in units
 * of 10 m with +z forward and +x its left. Camera views (C cycles them): behind it, close behind, on the bonnet. */
const LENGTH = 0.4;
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

/** A copy of `g` with plain float position / normal / uv (the model's are quantized), moved by `m`. */
function plain(g: BufferGeometry, m: Matrix4) {
  const out = new BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const a = g.getAttribute(name) as BufferAttribute | undefined;
    if (!a) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
    out.setAttribute(name, new BufferAttribute(f, a.itemSize));
  }
  if (g.index) out.setIndex(Array.from(g.index.array as ArrayLike<number>));
  out.applyMatrix4(m);
  if (m.determinant() < 0 && out.index) { const ix = out.index.array as number[] | Uint32Array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } }
  return out;
}

/** Merge meshes into one mesh per material (and per attribute set), in the frame `into` (its world matrix inverted). */
function mergeInto(meshes: Mesh[], into: Object3D) {
  into.updateMatrixWorld(true);
  const inv = new Matrix4().copy(into.matrixWorld).invert(), groups = new Map<string, { material: Material; parts: BufferGeometry[] }>();
  for (const mesh of meshes) {
    const material = mesh.material as Material, g = plain(mesh.geometry, new Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    const key = `${material.uuid}|${Object.keys(g.attributes).sort().join(",")}|${g.index ? 1 : 0}`;
    (groups.get(key) ?? groups.set(key, { material, parts: [] }).get(key)!).parts.push(g);
  }
  const out: Mesh[] = [];
  for (const { material, parts } of groups.values()) {
    const geometry = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
    if (!geometry) continue;
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = !(material as { transparent?: boolean }).transparent; mesh.receiveShadow = true;
    into.add(mesh); out.push(mesh);
  }
  return out;
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
  const source = use(loadVehicle("/models/traffic/brezza-player.glb"));
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
    return { root, body, wheels, steering, lamps, spot };
  }, [source]);

  const cam = useRef({ yaw: 0, y: 0, ready: false, view: game.view, blend: 1, from: new Vector3(), fromQ: new Quaternion() });
  const spring = useRef({ pitch: 0, roll: 0, vp: 0, vr: 0 }), lastReset = useRef(game.reset), lastLeg = useRef(game.leg);
  const tmp = useMemo(() => ({ p: new Vector3(), tan: new Vector3(), left: new Vector3(), fwd: new Vector3(), r: new Vector3(), n: new Vector3(), m: new Matrix4(), q: new Quaternion(), want: new Vector3(), look: new Vector3(), dir: new Vector3(), a: new Vector3(), b: new Vector3(), qa: new Quaternion() }), []);

  // before the director and traffic each frame (negative priority runs first and leaves rendering to R3F)
  useFrame((_, dt) => frameTimed("player", () => {
    const road = roads[Math.min(game.leg, roads.length - 1)];
    if (game.reset !== lastReset.current || game.leg !== lastLeg.current) { lastReset.current = game.reset; lastLeg.current = game.leg; settle(); cam.current.ready = false; }
    let alpha = 1;
    if (game.started && game.phase === "drive" && !game.paused) {
      alpha = simulate(road, dt);
      if (game.leg === 0 && trafficControl.curve === curve) {
        const p = { s: game.s, lat: game.lat, speed: game.speed, halfL: CAR.halfL, halfW: CAR.halfW };
        const knock = collidePlayer(trafficControl.fleet, curve, road.widen, p);
        if (p.s !== game.s) { game.s = p.s; game.prev.s = p.s; }
        game.speed = p.speed; game.bump = Math.max(game.bump, knock);
      }
      if (game.leg === 0 && game.s > road.length * 0.995) { game.phase = "between"; game.speed = 0; }
      const stop = FOREST_ROUTE.stop * road.length;
      if (game.leg === 1 && game.s >= stop) { game.s = stop; game.speed = 0; game.phase = "finished"; }
    } else if (!game.paused) game.input.throttle = 0;
    if (!game.paused) game.bump *= Math.exp(-dt * 6);

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
      [game.next, game.nextM] = t < scrollState.arch ? ["Lakkidi gate", (scrollState.arch - t) * L * 10] : ["Kalpetta", (1 - t) * L * 10];
    } else {
      const places = (forestRoad()?.places ?? []).filter((pl) => pl.t <= t);
      game.place = places.length ? places[places.length - 1].name : "Sulthan Bathery";
      [game.next, game.nextM] = ["Border gate", Math.max(0, FOREST_ROUTE.stop - t) * L * 10];
    }

    // pose: on the road at s, `lat` across it, turned `psi` from its direction, pitched with the slope
    const { p, tan, left, fwd, n, m, q: rot } = tmp, { root, body, wheels, steering, lamps, spot } = rig;
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

    // lamps: brake lights when braking; tail and head lamps on in rain, mist and gloom; the beam only then
    const dark = Math.min(1, weather.gloom + weather.mist * 0.6 + weather.rain * 0.5);
    for (const l of lamps.tail) l.emissiveIntensity = game.braking ? 3.5 : 0.3 + dark * 1.2;
    for (const l of lamps.head) l.emissiveIntensity = 0.15 + dark * 2.5;
    spot.intensity = dark * 6; spot.visible = dark > 0.05;

    // the camera
    const C = cam.current, camera3 = camera as PerspectiveCamera, view = game.view, { want, look, dir } = tmp;
    if (view !== C.view) { C.from.copy(camera.position); C.fromQ.copy(camera.quaternion); C.blend = 0; C.view = view; }
    const fov = view === "hood" ? 66 : 60;
    if (Math.abs(camera3.fov - fov) > 0.01) { camera3.fov += (fov - camera3.fov) * Math.min(1, dt * 8); camera3.updateProjectionMatrix(); }
    const heading = Math.atan2(fwd.x, fwd.z);
    if (!C.ready) { C.yaw = heading; C.y = root.position.y; C.ready = true; }
    if (!game.paused) {
      const dy = Math.atan2(Math.sin(heading - C.yaw), Math.cos(heading - C.yaw));
      C.yaw += Math.max(-YAW.maxRate * dt, Math.min(YAW.maxRate * dt, dy * (1 - Math.exp(-dt / YAW.tau))));
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
      for (let i = 1; i <= 5; i++) {
        const f = i / 5, x = root.position.x + (want.x - root.position.x) * f, z = root.position.z + (want.z - root.position.z) * f;
        const need = height(x, z) + 0.06 - (C.y + (want.y - C.y) * f);
        if (need > 0) want.y += need / f;
      }
    }
    // a bump or a scrape nudges the view a little; never a shake
    const nudge = Math.min(1, game.bump + game.scrape * 0.4) * 0.004;
    if (nudge > 0.0003) want.add(tmp.a.set((Math.random() - 0.5) * nudge, (Math.random() - 0.5) * nudge, (Math.random() - 0.5) * nudge));
    camera.position.copy(want); camera.lookAt(look);
    if (C.blend < 1) {
      C.blend = Math.min(1, C.blend + dt / BLEND);
      const e = C.blend * C.blend * (3 - 2 * C.blend);
      tmp.qa.copy(camera.quaternion);
      camera.position.lerpVectors(C.from, want, e); camera.quaternion.slerpQuaternions(C.fromQ, tmp.qa, e);
    }
  }), -1);

  return <primitive object={rig.root} />;
}
