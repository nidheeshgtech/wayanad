"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Vector3, type CatmullRomCurve3, type Object3D } from "three";
import { CAR, game } from "@/lib/game";
import { announce } from "@/lib/score";
import { height, roadShapeAt, SECTION } from "@/lib/terrain";
import { driverOf, type DriverId } from "@/data/drivers";
import { loadCast, makeActor, type Actor } from "@/lib/people";

/* Out of the vehicle (lib/game `foot`): stopped, Enter (or the door key) gets your driver out by their door to walk
 * about — the same keys walk (up: forward, down: back, left/right: turn; nitro: hurry) — and look at the view; Enter
 * by the car or bike gets back in. A camera over their shoulder. They keep to the road and its shoulders (no further
 * than `ROAM.side` from the centre line, not up a cut face or over the edge), and not far from where they left the
 * vehicle. Units of 10 m. */
const ROAM = { side: 0.85, along: 25, climb: 0.03, drop: 0.05 }; // off the centre line; from the vehicle; per step up / down
const PACE = { walk: 0.14, hurry: 0.36, turn: 2.2 };                // units/s (1.4 m/s, a jog), radians/s
const DOOR = { out: 0.055, reach: 0.11 };                           // stepped out this far beside it; back in from this close
const CAMERA = { back: 0.36, up: 0.085, eye: 0.15, ahead: 0.6 };

export default function OnFoot({ curve, driver }: { curve: CatmullRomCurve3; driver: DriverId }) {
  const holder = useMemo(() => { const g = new Group(); g.name = "on-foot"; g.visible = false; return g; }, []);
  const actor = useRef<Actor | null>(null);
  useEffect(() => {
    let gone = false;
    void loadCast(driver).then(([src, clips]) => {
      if (gone) return;
      const a = makeActor(driver, src, clips, driverOf(driver).height / 10);
      holder.clear(); holder.add(a.root); actor.current = a;
    });
    return () => { gone = true; actor.current?.mixer.stopAllAction(); actor.current = null; holder.clear(); };
  }, [driver, holder]);

  const S = useRef({ s: 0, y: 0, camYaw: 0, ready: false, lift: 0, moved: 0 });
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

  useFrame(({ camera, scene }, dt) => {
    const F = game.foot, A = actor.current;
    dt = game.paused ? 0 : Math.min(dt, 0.1);
    ride.current ??= scene.getObjectByName("player-car") ?? null;
    const car = ride.current;
    // in or out
    if (F.want) {
      F.want = false;
      if (!F.on && A && car && game.started) {
        // out by the driver's door (the right: Indian cars, and you get off a bike on its right too), facing up the road
        car.updateMatrixWorld();
        const at = T.a.set(-(CAR.halfW + DOOR.out), 0, game.bike ? -0.02 : 0.03).applyMatrix4(car.matrixWorld);
        const fwd = T.dir.set(0, 0, 1).transformDirection(car.matrixWorld);
        const where = place(at.x, at.z, game.s);
        Object.assign(F, { on: true, x: at.x, z: at.z, yaw: Math.atan2(fwd.x, fwd.z), near: true });
        Object.assign(S.current, { s: where.s, y: where.y, ready: false, moved: 0 });
        holder.visible = true; A.play("idle", 0);
        announce(game.bike ? "Off the bike · Enter to ride on" : "Out of the car · Enter to drive on", "badge");
      } else if (F.on && F.near) { F.on = false; holder.visible = false; }
    }
    if (!F.on || !A || !car) return;
    const st = S.current;

    // walking: the drive keys, turned to feet
    const go = game.input.throttle - game.input.brake, hurry = game.input.nitro > 0 && go > 0;
    F.yaw += game.input.steer * PACE.turn * dt;
    const v = go * (hurry ? PACE.hurry : PACE.walk), nx = F.x + Math.sin(F.yaw) * v * dt, nz = F.z + Math.cos(F.yaw) * v * dt;
    if (v !== 0) {
      const next = place(nx, nz, st.s);
      // not up a cut face, not over the edge, not off into the trees, not far from the vehicle
      const ok = Math.abs(next.lat) < ROAM.side && next.y - st.y < ROAM.climb && st.y - next.y < ROAM.drop && Math.abs(next.s - game.s) < ROAM.along;
      if (ok) { F.x = nx; F.z = nz; st.s = next.s; st.y = next.y; st.moved += Math.abs(v) * dt; }
    }
    const act = A.play(v !== 0 ? "walk" : "idle");
    if (act) act.timeScale = v !== 0 ? Math.sign(v) * Math.abs(v) / 0.115 : 1;
    A.mixer.update(dt);
    holder.position.set(F.x, st.y, F.z); holder.rotation.set(0, F.yaw, 0);
    // close enough to get back in?
    car.getWorldPosition(T.a);
    F.near = Math.hypot(F.x - T.a.x, F.z - T.a.z) < CAR.halfW + DOOR.out + DOOR.reach;

    // the camera: over their shoulder, turning after them (B looks back); lifted over any ground in between
    if (!st.ready) { st.camYaw = F.yaw; st.ready = true; }
    if (dt > 0) st.camYaw += Math.atan2(Math.sin(F.yaw - st.camYaw), Math.cos(F.yaw - st.camYaw)) * (1 - Math.exp(-dt / 0.25));
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
