"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, Vector3, type CatmullRomCurve3, type Object3D } from "three";
import { CAR, game, resetCar } from "@/lib/game";
import { getBorrow, getChoice, setBorrow } from "@/lib/choice";
import { laneLat, paintOf, trafficControl, VEHICLES } from "@/lib/traffic";
import type { BorrowId } from "@/data/cars";
import { driverOfVehicle, someDriver } from "@/lib/crew";
import { announce } from "@/lib/score";
import { height, roadShapeAt, SECTION } from "@/lib/terrain";
import { driverOf, type DriverId } from "@/data/drivers";
import { loadCast, makeActor, settleHands, type Actor } from "@/lib/people";
import { mark } from "@/lib/stats";

/* Out of the vehicle (lib/game `foot`): stopped, Enter (or the door key) gets your driver out by their door to walk
 * about — the same keys walk (up: forward, down: back, left/right: turn; Shift or the nitro key: run) — and look at the view; Enter
 * by the car or bike gets back in. A camera over their shoulder. They keep to the road and its shoulders (no further
 * than `ROAM.side` from the centre line, not up a cut face or over the edge), and not far from where they left the
 * vehicle. Units of 10 m. */
const ROAM = { side: 0.85, along: 25, climb: 0.03, drop: 0.05 }; // off the centre line; from the vehicle; per step up / down
const PACE = { walk: 0.16, run: 0.5, turn: 2.4 };                   // units/s (1.6 m/s; a run, 5 m/s), radians/s
const DOOR = { out: 0.055, reach: 0.11 };                           // stepped out this far beside it; back in from this close
const CAMERA = { back: 0.36, up: 0.085, eye: 0.15, ahead: 0.6 };
/** Traffic you can wave down and take (going your way, up the hill; not the buses or lorries), by its model, and how
 * close beside it you must be (units past its half-size). */
const TAKE: Record<string, BorrowId | "kuruva"> = { "wagonr-real": "t-hatch", "innova-real": "t-mpv", "omni-real": "t-van", "auto-real": "t-auto", "pulsar-real": "kuruva" };
const PAINTED = /wagonr|omni/;
// (in front of it, where it stopped for you — traffic keeps a few metres back — or beside its doors)
const HOP = { ahead: 1.0, along: 0.08, across: 0.25, stopped: 0.12 };

export default function OnFoot({ curve, driver }: { curve: CatmullRomCurve3; driver: DriverId }) {
  const holder = useMemo(() => { const g = new Group(); g.name = "on-foot"; g.visible = false; return g; }, []);
  const actor = useRef<Actor | null>(null);
  const { gl, camera: cam0 } = useThree();
  useEffect(() => {
    let gone = false;
    void loadCast(driver).then(([src, clips]) => {
      if (gone) return;
      const a = makeActor(driver, src, clips, driverOf(driver).height / 10);
      holder.clear(); holder.add(a.root); actor.current = a;
      // their shaders built now, while hidden, so the first step out doesn't stutter
      holder.visible = true; try { gl.compile(holder, cam0); } catch {} holder.visible = false;
    });
    return () => { gone = true; actor.current?.mixer.stopAllAction(); actor.current = null; holder.clear(); };
  }, [driver, holder, gl, cam0]);

  // `step`: a few automatic steps — out from the door, or up to it and in — while the keys wait
  const S = useRef({ s: 0, y: 0, camYaw: 0, ready: false, lift: 0, moved: 0, step: null as null | { into: boolean; x: number; z: number; t: number } });
  const T = useMemo(() => ({ p: new Vector3(), tan: new Vector3(), left: new Vector3(), a: new Vector3(), want: new Vector3(), look: new Vector3(), dir: new Vector3() }), []);
  const ride = useRef<Object3D | null>(null);

  /** Where (x, z) is on the road: along it (s, kept from last time and nudged), across it, and the ground's height. */
  const place = (x: number, z: number, s: number) => {
    const L = curve.getLength();
    for (let i = 0; i < 3; i++) {
      const t = Math.min(1, Math.max(0, s / L));
      curve.getPointAt(t, T.p); curve.getTangentAt(t, T.tan).setY(0).normalize();
      s += (x - T.p.x) * T.tan.x + (z - T.p.z) * T.tan.z;
    }
    const t = Math.min(1, Math.max(0, s / L));
    curve.getPointAt(t, T.p); curve.getTangentAt(t, T.tan).setY(0).normalize();
    T.left.set(T.tan.z, 0, -T.tan.x);
    const lat = (x - T.p.x) * T.left.x + (z - T.p.z) * T.left.z, edge = SECTION.half + roadShapeAt(t).widen;
    const y = Math.abs(lat) <= edge + 0.02 ? T.p.y - 0.588 : height(x, z);
    return { s, lat, y };
  };

  /** Is (s, lat) inside a vehicle — the traffic, the one you came in, your own parked one? Vehicles are solid: you walk
   * round them, not through their doors (a step that would take you further in is refused; one out is always let go). */
  const blocked = (s: number, lat: number, s0: number, lat0: number) => {
    const L = curve.getLength(), BODY = 0.025;
    const inside = (cs: number, clat: number, halfL: number, halfW: number, at: number, al: number) =>
      Math.max(Math.abs(at - cs) - halfL, Math.abs(al - clat) - halfW) < BODY;
    const deeper = (cs: number, clat: number, halfL: number, halfW: number) =>
      inside(cs, clat, halfL, halfW, s, lat) && Math.max(Math.abs(s - cs) - halfL, Math.abs(lat - clat) - halfW) < Math.max(Math.abs(s0 - cs) - halfL, Math.abs(lat0 - clat) - halfW);
    if (deeper(game.s, game.lat, CAR.halfL, CAR.halfW)) return true;
    const P = game.parked; if (P && deeper(P.s, P.lat, 0.2, 0.1)) return true;
    for (const v of trafficControl.fleet) {
      if (Math.abs(v.distance - s) > 0.6) continue;
      const spec = VEHICLES[v.kind], t = Math.min(1, Math.max(0, v.distance / L));
      if (deeper(v.distance, laneLat(v, roadShapeAt(t).widen), spec.length / 2, spec.width / 2)) return true;
    }
    return false;
  };

  useFrame(({ camera, scene }, dt) => {
    const F = game.foot, A = actor.current;
    dt = game.paused ? 0 : Math.min(dt, 0.1);
    // the drawn vehicle you came in (found again once the one we had is gone from the scene: after a swap the old
    // one is unmounted and the new one drawn in its place)
    if (!ride.current?.parent) ride.current = scene.getObjectByName("player-car") ?? null;
    const car = ride.current;
    // in or out
    if (F.want) {
      F.want = false;
      if (!F.on && A && car && game.started) {
        // out by the driver's door (the right: Indian cars, and you get off a bike on its right too): from the seat's
        // side of the door, a couple of steps out, then they're yours — facing up the road
        car.updateMatrixWorld();
        const z = game.bike ? -0.02 : 0.03;
        const from = T.a.set(-(CAR.halfW - 0.02), 0, z).applyMatrix4(car.matrixWorld).clone(), to = T.p.set(-(CAR.halfW + DOOR.out), 0, z).applyMatrix4(car.matrixWorld).clone();
        const fwd = T.dir.set(0, 0, 1).transformDirection(car.matrixWorld);
        const where = place(from.x, from.z, game.s);
        Object.assign(F, { on: true, x: from.x, z: from.z, yaw: Math.atan2(fwd.x, fwd.z), near: true }); mark("walked");
        Object.assign(S.current, { s: where.s, y: where.y, ready: false, moved: 0, step: { into: false, x: to.x, z: to.z, t: 0 } });
        holder.visible = true; A.play("walk", 0);
        announce(game.bike ? "Off the bike · Enter to ride on" : "Out of the car · Enter to drive on", "badge");
      } else if (F.on && !F.near && F.byParked && game.parked) {
        // back to your own: the one you took stays where it is no more (it's gone back to its owner); yours drives on
        const P = game.parked; setBorrow(null); game.parked = null;
        resetCar(P.s); Object.assign(game, { lat: P.lat, psi: P.psi }); Object.assign(game.prev, { s: P.s, lat: P.lat, psi: P.psi });
        F.on = false; F.byParked = false; holder.visible = false;
        announce("Back in your own", "badge");
      } else if (F.on && !F.near && F.hop >= 0) {
        // took one: yours stays parked where it is (drawn by ParkedCar; the traffic goes round it); you drive this one
        const v = trafficControl.fleet.find((x) => x.id === F.hop);
        if (v && car) {
          if (!getBorrow()) {
            car.updateMatrixWorld(); const p = car.getWorldPosition(new Vector3()), q = car.quaternion;
            game.parked = { s: game.s, lat: game.lat, psi: game.psi, x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
          }
          const name = VEHICLES[v.kind].name, own = getChoice();
          // its driver moves over and rides along with you (the one you saw at the wheel, or someone who'd drive it)
          setBorrow({ ...own, car: TAKE[name], paintHex: PAINTED.test(name) ? paintOf(v) : undefined, passenger: driverOfVehicle(v.id) ?? someDriver(v.id) }); mark("took");
          const t = Math.min(1, Math.max(0, v.distance / curve.getLength())), lat = laneLat(v, roadShapeAt(t).widen);
          resetCar(v.distance); game.lat = lat; game.prev.lat = lat;
          v.distance = (v.distance + curve.getLength() * 0.5) % curve.getLength(); // (gone from the road: it's yours now)
          F.on = false; F.hop = -1; holder.visible = false; ride.current = null; // (the drawn vehicle is about to change)
          announce(TAKE[name] === "kuruva" ? "Hopped on · they ride pillion" : "Hopped in · they've moved over", "badge");
        }
      } else if (F.on && F.near && !S.current.step && car) {
        // back in: they walk up to the door first, then they're in (not gone from wherever they stood)
        car.updateMatrixWorld();
        const door = T.a.set(-(CAR.halfW + 0.01), 0, game.bike ? -0.02 : 0.03).applyMatrix4(car.matrixWorld);
        S.current.step = { into: true, x: door.x, z: door.z, t: 0 };
      }
    }
    if (!F.on || !A || !car) return;
    const st = S.current;
    // the automatic steps: toward the point at a walk, turning to it; done there (or after a second, whatever)
    const stepping = !!st.step;
    if (st.step) {
      const P = st.step, dx = P.x - F.x, dz = P.z - F.z, d = Math.hypot(dx, dz);
      P.t += dt;
      if (d > 0.004) {
        // (stepping out they keep facing up the road — a side-step clear of the door; going in they turn to it)
        if (P.into) { const want = Math.atan2(dx, dz); F.yaw += Math.atan2(Math.sin(want - F.yaw), Math.cos(want - F.yaw)) * Math.min(1, dt * 10); }
        const k = Math.min(1, (PACE.walk * dt) / d); F.x += dx * k; F.z += dz * k;
        const here = place(F.x, F.z, st.s); st.s = here.s; st.y = here.y;
      }
      const act = A.play("walk", 0.15); if (act) act.timeScale = PACE.walk / 0.115;
      if (d <= 0.004 || P.t > 1.1) {
        st.step = null;
        if (P.into) { F.on = false; holder.visible = false; return; }
        A.play("idle", 0.2);
      }
      A.mixer.update(dt); settleHands(A);
      holder.position.set(F.x, st.y, F.z); holder.rotation.set(0, F.yaw, 0);
    }

    // walking: the drive keys, turned to feet (not while the automatic steps are under way)
    const go = stepping ? 0 : game.input.throttle - game.input.brake, running = game.input.nitro > 0 && go > 0;
    if (!stepping) F.yaw += game.input.steer * PACE.turn * dt;
    const v = go * (running ? PACE.run : PACE.walk), nx = F.x + Math.sin(F.yaw) * v * dt, nz = F.z + Math.cos(F.yaw) * v * dt;
    if (stepping) { /* moved by the steps */ } else if (v !== 0) {
      const next = place(nx, nz, st.s);
      // not up a cut face, not over the edge, not off into the trees, not far from the vehicle
      const ok = Math.abs(next.lat) < ROAM.side && next.y - st.y < ROAM.climb && st.y - next.y < ROAM.drop && Math.abs(next.s - game.s) < ROAM.along
        && !blocked(next.s, next.lat, F.s, F.lat);
      if (ok) { F.x = nx; F.z = nz; st.s = next.s; st.y = next.y; st.moved += Math.abs(v) * dt; }
    } else { const here = place(F.x, F.z, st.s); st.s = here.s; st.y = here.y; } // (standing: kept on the ground wherever they are)
    // the step matched to the pace (the clips cover ~1.15 m/s walking, ~4.5 m/s running); backwards, the walk reversed
    if (!stepping) { // (the automatic steps played and placed them already)
      const act = A.play(running ? "run" : v !== 0 ? "walk" : "idle", 0.2);
      if (act) act.timeScale = running ? v / 0.45 : v !== 0 ? v / 0.115 : 1;
      A.mixer.update(dt); settleHands(A);
      holder.position.set(F.x, st.y, F.z); holder.rotation.set(0, F.yaw, 0);
    }
    // close enough to get back in?
    car.getWorldPosition(T.a);
    F.near = Math.hypot(F.x - T.a.x, F.z - T.a.z) < CAR.halfW + DOOR.out + DOOR.reach;
    // where they stand, for the traffic (it stops for you); a stopped vehicle beside them they could take; your own,
    // parked, if you're in someone else's
    const here = place(F.x, F.z, st.s); F.s = here.s; F.lat = here.lat;
    F.hop = -1; F.hopBike = false;
    if (!F.near && game.leg === 0) for (const v of trafficControl.fleet) {
      const name = VEHICLES[v.kind].name;
      const ds = F.s - v.distance, half = VEHICLES[v.kind].length / 2;
      if (!(name in TAKE) || v.direction !== 1 || Math.abs(v.speed) > HOP.stopped || ds > half + HOP.ahead || ds < -half - HOP.along) continue;
      const t = Math.min(1, Math.max(0, v.distance / curve.getLength()));
      if (Math.abs(laneLat(v, roadShapeAt(t).widen) - F.lat) > VEHICLES[v.kind].width / 2 + HOP.across) continue;
      F.hop = v.id; F.hopBike = TAKE[name] === "kuruva"; break;
    }
    const P = game.parked;
    F.byParked = !!P && !F.near && Math.hypot(F.x - P.x, F.z - P.z) < CAR.halfW + DOOR.out + DOOR.reach + 0.1;

    // the camera: over their shoulder, turning after them (B looks back); lifted over any ground in between
    if (!st.ready) { st.camYaw = F.yaw; st.ready = true; }
    // (held still through the automatic steps, so it never swings across the car's roof)
    if (dt > 0 && !stepping) st.camYaw += Math.atan2(Math.sin(F.yaw - st.camYaw), Math.cos(F.yaw - st.camYaw)) * (1 - Math.exp(-dt / 0.25));
    const dir = T.dir.set(Math.sin(st.camYaw), 0, Math.cos(st.camYaw));
    if (game.lookBack) dir.negate();
    const eye = st.y + CAMERA.eye, { want, look } = T;
    want.set(F.x, eye, F.z).addScaledVector(dir, -CAMERA.back); want.y += CAMERA.up;
    look.set(F.x, eye, F.z).addScaledVector(dir, CAMERA.ahead);
    let lift = 0;
    for (let i = 1; i <= 4; i++) {
      const f = i / 4, x = F.x + (want.x - F.x) * f, z = F.z + (want.z - F.z) * f, need = height(x, z) + 0.04 - (eye + (want.y - eye) * f);
      if (need > 0) lift = Math.max(lift, need / f);
    }
    st.lift += (lift - st.lift) * (1 - Math.exp(-dt / (lift > st.lift ? 0.08 : 0.5)));
    want.y += st.lift;
    camera.position.copy(want); camera.lookAt(look);
  });

  return <primitive object={holder} />;
}
