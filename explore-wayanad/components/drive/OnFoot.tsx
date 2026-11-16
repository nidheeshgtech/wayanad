"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, Group, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, type CatmullRomCurve3, type Object3D } from "three";
import { CAR, game, resetCar } from "@/lib/game";
import { patrolNear, wanted } from "@/lib/chase";
import { getBorrow, getChoice, setBorrow } from "@/lib/choice";
import { laneLat, paintOf, trafficControl, vehiclePose, VEHICLES } from "@/lib/traffic";
import type { BorrowId } from "@/data/cars";
import { driverOfVehicle, someDriver } from "@/lib/crew";
import { announce } from "@/lib/score";
import { height, roadShapeAt, SECTION } from "@/lib/terrain";
import { driverOf, personHeight, type DriverId, type PersonId } from "@/data/drivers";
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
/** Traffic you can take — anything stopped beside you, either way along the road: cars, the auto, bikes, the buses, the
 * lorry, the police jeep and the ambulance — by its model, and how close beside it you must be (units past its
 * half-size). Its driver gets out and gives you a piece of their mind (see `Thrown`). */
const TAKE: Record<string, BorrowId | "kuruva"> = {
  "wagonr-real": "t-hatch", "innova-real": "t-mpv", "omni-real": "t-van", "auto-real": "t-auto", "pulsar-real": "kuruva",
  "ksrtc-real": "t-bus", "privatebus-real": "t-pbus", "tourbus-real": "t-tbus", "lorry-real": "t-lorry", police: "t-police", ambulance: "t-amb",
};
const PAINTED = /wagonr|omni/;
const WHITE = /^(police|ambulance)$/;
/** What the driver says as you drive off in their vehicle: a first line, then a second (Manglish, as on the churam). */
const SCOLD: Record<string, string[][]> = {
  bus: [["Eda! Ente bus! 😡", "Ithu KSRTC aanu! 🚌", "Passengers ellam ivide! 😤"], ["Depot-il parayum! 📞", "Ninne kandolaam! 😠"]],
  lorry: [["Ente lorry! 😡", "Load undu, sookshichu! 😤"], ["Owner-ne vilikkum! 📞", "Police-ne vilikkum! 📞"]],
  auto: [["Meter ittitt po! 😤", "Ente auto! 😡"], ["Police-ne vilikkum! 📞", "Ninne kandolaam! 😠"]],
  bike: [["Ente bike! 😡", "Helmet evide? 😤"], ["Police-ne vilikkum! 📞", "Eda, nilkkada! 😠"]],
  police: [["Ithu police vandiyaa! 🚓", "Eda! Nilkkada! 😠"], ["Ninne pidikkum! 🚨", "Wireless-il parayum! 📻"]],
  ambulance: [["Ithu ambulance aanu! 🚑", "Eda! Ente vandi! 😡"], ["Police-ne vilikkum! 📞", "Ninne kandolaam! 😠"]],
  car: [["Eda! Ente vandi! 😡", "Hey! My car! 😠", "Ayyo, ente car! 😩"], ["Police-ne vilikkum! 📞", "Ninne kandolaam! 😠", "Number note cheythu! 📝"]],
};
const scoldKind = (name: string) => /bus|ksrtc/.test(name) ? "bus" : /lorry/.test(name) ? "lorry" : /auto/.test(name) ? "auto" : /pulsar|enfield|bike/.test(name) ? "bike" : name === "police" ? "police" : name === "ambulance" ? "ambulance" : "car";

/** A speech bubble in the game's look (as the HUD's notices): a chamfered panel of dark teal glass, a neon edge — gold
 * at the ends, teal along — glowing a little, a small pointer under it, the words in white bold italic; a sprite above
 * someone's head. */
function bubble(text: string) {
  const c = document.createElement("canvas"); c.width = 640; c.height = 176;
  const g = c.getContext("2d")!;
  g.font = "italic 800 44px 'Instrument Sans', Arial, sans-serif";
  const w = Math.min(600, g.measureText(text).width + 72), x = (640 - w) / 2, y = 14, h = 118, big = 22, small = 9, mid = 320;
  const shape = () => {
    g.beginPath();
    g.moveTo(x + big, y); g.lineTo(x + w - small, y); g.lineTo(x + w, y + small); g.lineTo(x + w, y + h - big); g.lineTo(x + w - big, y + h);
    g.lineTo(mid + 16, y + h); g.lineTo(mid, y + h + 26); g.lineTo(mid - 16, y + h); // the pointer, down to the speaker
    g.lineTo(x + small, y + h); g.lineTo(x, y + h - small); g.lineTo(x, y + big); g.closePath();
  };
  const glass = g.createLinearGradient(0, y, 0, y + h); glass.addColorStop(0, "rgba(22,58,52,.95)"); glass.addColorStop(1, "rgba(5,14,12,.95)");
  shape(); g.fillStyle = glass; g.fill();
  // the shine across the top half
  g.save(); shape(); g.clip(); g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x, y, w, h * 0.45); g.restore();
  const edge = g.createLinearGradient(x, 0, x + w, 0);
  edge.addColorStop(0, "#ffd34d"); edge.addColorStop(0.16, "#ffcc33"); edge.addColorStop(0.3, "#2fe0cf"); edge.addColorStop(0.7, "#2fe0cf"); edge.addColorStop(0.84, "#ffcc33"); edge.addColorStop(1, "#ffd34d");
  g.shadowColor = "rgba(47,224,207,.75)"; g.shadowBlur = 12; g.lineJoin = "miter"; g.lineWidth = 5; g.strokeStyle = edge; shape(); g.stroke();
  g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 4; g.shadowOffsetY = 2;
  g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, mid, y + h / 2 + 2, w - 44);
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
  const sp = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, transparent: true })); sp.renderOrder = 10;
  sp.scale.set(0.24, 0.066, 1); sp.center.set(0.5, 0);
  return sp;
}
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
  // the driver of a vehicle you took: out by their door, cross with you for a moment, then walking off down the road
  const thrownGroup = useMemo(() => { const g = new Group(); g.name = "thrown-out"; return g; }, []);
  const thrown = useRef<{ actor: Actor | null; h: number; x: number; z: number; y: number; s: number; yaw: number; away: number; t: number; lines: [string, string]; bubble: Sprite | null; said: number } | null>(null);
  const throwOut = (id: PersonId, x: number, z: number, y: number, s: number, faceYaw: number, awayYaw: number, kind: string) => {
    const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
    const [first, second] = SCOLD[kind] ?? SCOLD.car;
    if (thrown.current?.actor) { thrown.current.actor.mixer.stopAllAction(); }
    thrownGroup.clear();
    const T0 = { actor: null as Actor | null, h: personHeight(id) / 10, x, z, y, s, yaw: faceYaw, away: awayYaw, t: 0, lines: [pick(first), pick(second)] as [string, string], bubble: null as Sprite | null, said: -1 };
    thrown.current = T0;
    void loadCast(id, true).then(([src, clips]) => {
      if (thrown.current !== T0) return;
      const a = makeActor(id, src, clips, personHeight(id) / 10); a.play("idle", 0);
      T0.actor = a; thrownGroup.add(a.root);
    }, () => {});
  };

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
    // the driver you took it from: stands and tells you off (two lines), facing you, then walks away down the road
    const W = thrown.current;
    if (W) {
      W.t += dt;
      const a = W.actor;
      if (a) {
        if (W.t < 2.8) {
          const you = scene.getObjectByName("player-car");
          if (you) { you.getWorldPosition(T.look); const want = Math.atan2(T.look.x - W.x, T.look.z - W.z); W.yaw += Math.atan2(Math.sin(want - W.yaw), Math.cos(want - W.yaw)) * Math.min(1, dt * 6); }
          a.play("idle", 0.2);
        } else {
          W.yaw += Math.atan2(Math.sin(W.away - W.yaw), Math.cos(W.away - W.yaw)) * Math.min(1, dt * 4);
          W.x += Math.sin(W.yaw) * 0.13 * dt; W.z += Math.cos(W.yaw) * 0.13 * dt;
          const here = place(W.x, W.z, W.s); W.s = here.s; W.y = here.y;
          const act = a.play("walk", 0.25); if (act) act.timeScale = 0.13 / 0.115;
        }
        a.root.position.set(W.x, W.y, W.z); a.root.rotation.set(0, W.yaw, 0);
        a.mixer.update(dt); settleHands(a);
        // what they say: the first line, then the second, over their head
        const line = W.t < 0.25 ? -1 : W.t < 1.9 ? 0 : W.t < 4.6 ? 1 : -1;
        if (line !== W.said) {
          W.said = line;
          if (W.bubble) { W.bubble.material.map?.dispose(); W.bubble.material.dispose(); W.bubble.removeFromParent(); W.bubble = null; }
          if (line === 0 || line === 1) { W.bubble = bubble(W.lines[line]); thrownGroup.add(W.bubble); }
        }
        W.bubble?.position.set(W.x, W.y + W.h + 0.015, W.z);
      }
      if (W.t > 11) { W.bubble?.material.map?.dispose(); a?.mixer.stopAllAction(); thrownGroup.clear(); thrown.current = null; }
    }
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
          const name = VEHICLES[v.kind].name, own = getChoice(), spec = VEHICLES[v.kind];
          // its driver (the one you saw at the wheel, or someone who'd drive it) gets out by their door — the right — and
          // isn't pleased; then walks off back down the road
          const pose = vehiclePose(curve, v, (tt: number) => roadShapeAt(tt).widen);
          const door = new Vector3(-(spec.width / 2 + 0.05), 0, spec.length * 0.18).applyQuaternion(pose.rotation).add(pose.position);
          const fwd = new Vector3(0, 0, 1).applyQuaternion(pose.rotation), out = new Vector3(-1, 0, 0).applyQuaternion(pose.rotation);
          const there = place(door.x, door.z, v.distance);
          const awayDir = out.clone().multiplyScalar(0.35).addScaledVector(fwd, -1).normalize();
          throwOut(spec.name === "police" ? "guard" : driverOfVehicle(v.id) ?? someDriver(v.id), // (the police jeep's: Varghese, in khaki)
            door.x, door.z, there.y, there.s, Math.atan2(F.x - door.x, F.z - door.z), Math.atan2(awayDir.x, awayDir.z), scoldKind(name));
          setBorrow({ ...own, car: TAKE[name], paintHex: WHITE.test(name) ? "#f2f3f1" : PAINTED.test(name) ? paintOf(v) : undefined }); mark("took");
          const t = Math.min(1, Math.max(0, v.distance / curve.getLength())), lat = Math.max(-0.25, Math.min(0.25, laneLat(v, roadShapeAt(t).widen)));
          resetCar(v.distance); game.lat = lat; game.prev.lat = lat;
          v.distance = (v.distance + curve.getLength() * 0.5) % curve.getLength(); // (gone from the road: it's yours now)
          F.on = false; F.hop = -1; holder.visible = false; ride.current = null; // (the drawn vehicle is about to change)
          announce(`Took the ${TAKE[name] === "kuruva" ? "bike" : spec.name === "police" ? "police jeep 🚓" : spec.name === "ambulance" ? "ambulance 🚑" : /bus|ksrtc/.test(spec.name) ? "bus 🚌" : /lorry/.test(spec.name) ? "lorry 🚚" : /auto/.test(spec.name) ? "auto 🛺" : "car"} · the driver's not happy 😠`, "badge");
          // the police see that (lib/chase; the apps): their own jeep, three stars; anything else with a patrol by, one
          if (spec.name === "police") wanted("Took the police jeep", { stars: 3 });
          else if (patrolNear(trafficControl.fleet, F.s)) wanted("A patrol saw that", { stars: 1 });
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
      // (either way along the road: one coming down is turned round as you take it)
      const front = v.direction === 1 ? ds : -ds;
      if (!(name in TAKE) || Math.abs(v.speed) > HOP.stopped || front > half + HOP.ahead || front < -half - HOP.along) continue;
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

  return <><primitive object={holder} /><primitive object={thrownGroup} /></>;
}
