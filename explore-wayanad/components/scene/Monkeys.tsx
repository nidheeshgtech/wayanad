"use client";
import { use, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, CatmullRomCurve3, Group, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from "three";
import { bendTs, height, roadShapeAt } from "@/lib/terrain";
import { loadVehicle } from "@/lib/vehicleAssets";
import { game } from "@/lib/game";
import { bonus, score } from "@/lib/score";
import { chatter } from "@/lib/horn";
import { award } from "@/lib/badges";

/* Bonnet macaques at a few of the nine hairpins, where they sit on the barriers and walls of the churam watching the
 * traffic. A troop of two to four at five bends; they turn to look at whatever comes near, breathe, shuffle along now
 * and then, and hop back from a car that passes close. In drive mode one of each troop may jump onto your car as you
 * go by slowly: it rides on the roof (on the bonnet, facing you, in the bonnet view) for a few seconds, then hops off
 * to the roadside wherever you are by then — a bonus in lib/score. Once per troop per climb. Model: "Realsitic Monkey" (CC BY, Sketchfab — see
 * public/models/traffic/ATTRIBUTION.md), 45 cm tall. Units of 10 m. */
const TROOPS = [1, 3, 4, 6, 8];     // which hairpins (0-based)
const SIZE = 0.045;                 // sitting height
const LOOK = { near: 5, rate: 2.2 }; // turn to look at anything within 50 m, this fast (rad/s)
const RIDE = { near: 0.6, slow: 0.9, chance: 0.6, leap: 0.5, ride: [4.5, 6.5] as const, points: 20, scale: 1.7 }; // within 6 m, under ~32 km/h; a bit larger on the car, to be seen from the chase camera

type Monkey = { root: Group; base: Vector3; along: Vector3; out: Vector3; yaw: number; look: number; next: number; hop: number; from: Vector3; to: Vector3; phase: number; rider: boolean; rode: number };
type Ride = { m: Monkey; stage: "on" | "ride" | "off"; t: number; dur: number; from: Vector3; to: Vector3; off?: { to: Vector3; out: Vector3; along: Vector3 } };

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

export default function Monkeys({ curve }: { curve: CatmullRomCurve3 }) {
  const source = use(loadVehicle("/models/wildlife/macaque.glb", { merged: true }));
  const { group, monkeys } = useMemo(() => {
    const group = new Group(); group.name = "monkeys";
    const box = new Box3().setFromObject(source), size = box.getSize(new Vector3()), k = SIZE / size.y, c = box.getCenter(new Vector3());
    const L = curve.getLength(), r = rng(4711), monkeys: Monkey[] = [], bends = bendTs();
    for (const b of TROOPS) {
      const t = bends[b]; if (t === undefined) continue;
      const s0 = t * L + (r() - 0.5) * 1.2, tan = curve.getTangentAt(s0 / L), ahead = curve.getTangentAt(Math.min(1, (s0 + 1) / L));
      // the outer edge of the bend (away from the way it turns) is where the barrier runs above the drop
      const turnsLeft = tan.x * ahead.z - tan.z * ahead.x < 0, outer = turnsLeft ? -1 : 1, widen = roadShapeAt(s0 / L).widen;
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const s = s0 + (i - n / 2) * (0.06 + r() * 0.08), p = curve.getPointAt(Math.min(0.999, s / L)), tn = curve.getTangentAt(Math.min(0.999, s / L));
        const lft = new Vector3(tn.z, 0, -tn.x).normalize(), side = i === n - 1 && r() < 0.5 ? -outer : outer; // one sometimes by the rock
        const out = lft.clone().multiplyScalar(side), d = 0.4 + widen * 0.5 + 0.035 + r() * 0.04;
        const x = p.x + out.x * d, z = p.z + out.z * d, base = new Vector3(x, height(x, z), z);
        const m = source.clone(true), root = new Group(); m.scale.setScalar(k * (0.8 + r() * 0.35)); m.position.set(-c.x * k, -box.min.y * k, -c.z * k);
        m.traverse((o) => { if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        root.add(m); root.position.copy(base); group.add(root);
        const yaw = Math.atan2(-out.x, -out.z) + (r() - 0.5) * 1.4; // mostly facing the road
        root.rotation.y = yaw;
        monkeys.push({ root, base, along: tn.clone().setY(0).normalize(), out, yaw, look: yaw, next: 4 + r() * 10, hop: 1, from: base.clone(), to: base.clone(), phase: r() * 10, rider: i === 0, rode: -1 });
      }
    }
    if (typeof window !== "undefined") (window as unknown as { __wayanadMonkeys?: unknown }).__wayanadMonkeys = monkeys.map((m) => ({ at: m.base.toArray(), out: m.out.toArray() }));
    return { group, monkeys };
  }, [curve, source]);

  const ride = useRef<Ride | null>(null), carRef = useRef<{ car: Object3D; roof: Vector3; bonnet: Vector3 } | null>(null), run = useRef(score.run);
  const tmp = useMemo(() => ({ seat: new Vector3(), q: new Quaternion(), flip: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI), inv: new Matrix4(), box: new Box3(), b: new Box3() }), []);

  /** your car, and where on it a monkey sits (its own frame: roof toward the back, bonnet ahead of the windscreen) */
  const findCar = (scene: Object3D) => {
    const car = scene.getObjectByName("player-car");
    if (!car) return null;
    if (carRef.current?.car === car) return carRef.current;
    car.updateMatrixWorld(true); tmp.inv.copy(car.matrixWorld).invert(); tmp.box.makeEmpty();
    car.traverse((o) => { const g = (o as Mesh).geometry; if (!(o as Mesh).isMesh || !g) return; g.computeBoundingBox(); tmp.b.copy(g.boundingBox!).applyMatrix4(o.matrixWorld).applyMatrix4(tmp.inv); tmp.box.union(tmp.b); });
    if (tmp.box.isEmpty()) return null;
    const { min, max } = tmp.box;
    return (carRef.current = { car, roof: new Vector3(0, max.y - 0.002, min.z * 0.5), bonnet: new Vector3(0, max.y * 0.6, max.z * 0.8) });
  };
  /** where the rider sits this frame, in the world, and which way it faces (back toward the camera) */
  const seatOf = (c: NonNullable<typeof carRef.current>) => {
    c.car.updateMatrixWorld();
    tmp.seat.copy(game.view === "hood" ? c.bonnet : c.roof).applyMatrix4(c.car.matrixWorld);
    c.car.getWorldQuaternion(tmp.q).multiply(tmp.flip);
    return tmp.seat;
  };
  /** larger on the roof, to be seen from behind; life size on the bonnet, right in front of you */
  const big = () => (game.view === "hood" ? 1 : RIDE.scale);
  /** off the car: onto the roadside nearest it, facing the road, and back to its usual ways */
  const land = (m: Monkey) => {
    const L = curve.getLength(), t = Math.min(0.999, Math.max(0, game.s / L)), p = curve.getPointAt(t), tn = curve.getTangentAt(t);
    const left = new Vector3(tn.z, 0, -tn.x).normalize(), side = game.lat >= 0 ? 1 : -1, d = 0.4 + roadShapeAt(t).widen + 0.06;
    const x = p.x + left.x * side * d, z = p.z + left.z * side * d;
    return { to: new Vector3(x, height(x, z), z), out: left.multiplyScalar(side), along: tn.setY(0).normalize() };
  };
  const settleAt = (m: Monkey, to: Vector3, out: Vector3, along: Vector3) => {
    m.base.copy(to); m.from.copy(to); m.to.copy(to); m.out.copy(out); m.along.copy(along);
    m.yaw = m.look = Math.atan2(-out.x, -out.z); m.root.position.copy(to); m.root.rotation.set(0, m.yaw, 0); m.root.scale.setScalar(1); m.hop = 1; m.next = 5;
  };

  useFrame(({ camera, scene }, dt) => {
    if (game.paused) return;
    dt = Math.min(dt, 0.1);
    // a monkey riding your car
    const R = ride.current, c = game.started && game.leg === 0 ? findCar(scene) : null;
    if (R && (run.current !== score.run || !c)) { const o = land(R.m); settleAt(R.m, o.to, o.out, o.along); ride.current = null; } // restarted: off at once
    run.current = score.run;
    if (!ride.current && c && game.phase === "drive" && game.speed > 0.03 && game.speed < RIDE.slow) {
      for (const m of monkeys) {
        if (!m.rider || m.rode === score.run || m.hop < 1 || m.root.position.distanceTo(c.car.position) > RIDE.near) continue;
        m.rode = score.run; // one try per troop per climb
        if (Math.random() < RIDE.chance) { ride.current = { m, stage: "on", t: 0, dur: RIDE.leap, from: m.root.position.clone(), to: new Vector3() }; chatter(); }
        break;
      }
    }
    const r = ride.current;
    if (r && c) {
      const m = r.m; m.root.visible = true; r.t = Math.min(1, r.t + dt / r.dur);
      const e = r.t * r.t * (3 - 2 * r.t);
      if (r.stage === "on") {
        const seat = seatOf(c);
        m.root.position.lerpVectors(r.from, seat, e); m.root.position.y += Math.sin(r.t * Math.PI) * 0.06; m.root.scale.setScalar(1 + (big() - 1) * e);
        if (r.t > 0.5) m.root.quaternion.copy(tmp.q);
        if (r.t >= 1) { Object.assign(r, { stage: "ride", t: 0, dur: RIDE.ride[0] + Math.random() * (RIDE.ride[1] - RIDE.ride[0]) }); bonus(RIDE.points, "🐒 Monkey ride!"); award("monkey"); }
      } else if (r.stage === "ride") {
        const seat = seatOf(c); m.phase += dt;
        m.root.position.copy(seat); m.root.position.y += Math.abs(Math.sin(m.phase * 7)) * 0.002 * Math.min(1, Math.abs(game.speed));
        m.root.quaternion.copy(tmp.q); m.root.rotateY(Math.sin(m.phase * 0.9) * 0.7); // looks about
        m.root.scale.setScalar(big());
        if (r.t >= 1 || game.phase !== "drive") { r.off = land(m); Object.assign(r, { stage: "off", t: 0, dur: 0.55, to: r.off.to }); r.from.copy(m.root.position); chatter(); }
      } else {
        m.root.position.lerpVectors(r.from, r.to, e); m.root.position.y += Math.sin(r.t * Math.PI) * 0.08; m.root.scale.setScalar(big() + (1 - big()) * e);
        if (r.t >= 1 && r.off) { settleAt(m, r.off.to, r.off.out, r.off.along); ride.current = null; }
      }
    }
    for (const m of monkeys) {
      if (ride.current?.m === m) continue;
      const d = camera.position.distanceTo(m.root.position);
      m.root.visible = d < 25;
      if (!m.root.visible) continue;
      m.phase += dt;
      // look at whatever comes near (the camera stands in for the car going by)
      const want = d < LOOK.near ? Math.atan2(camera.position.x - m.root.position.x, camera.position.z - m.root.position.z) : m.yaw;
      const turn = Math.atan2(Math.sin(want - m.look), Math.cos(want - m.look));
      m.look += Math.max(-LOOK.rate * dt, Math.min(LOOK.rate * dt, turn));
      m.root.rotation.y = m.look;
      // now and then a shuffle along the edge; a quick hop back from anything passing very close
      m.next -= dt;
      if (m.hop >= 1 && (m.next <= 0 || d < 0.7)) {
        m.from.copy(m.root.position);
        const step = d < 0.7 ? m.out.clone().multiplyScalar(0.05) : m.along.clone().multiplyScalar((Math.random() - 0.5) * 0.08);
        m.to.copy(m.base).add(step).setY(0); m.to.y = height(m.to.x, m.to.z);
        m.hop = 0; m.next = 6 + Math.random() * 12;
      }
      if (m.hop < 1) {
        m.hop = Math.min(1, m.hop + dt / 0.35);
        m.root.position.lerpVectors(m.from, m.to, m.hop); m.root.position.y += Math.sin(m.hop * Math.PI) * 0.012;
        if (m.hop >= 1 && d >= 0.7) m.base.lerp(m.to, 0.5);
      }
      // breathing
      const b = 1 + Math.sin(m.phase * 2.4) * 0.012;
      m.root.scale.set(1, b, 1);
    }
  });
  return <primitive object={group} />;
}
