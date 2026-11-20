"use client";
/**
 * The landslide rescue (lib/mission): on the straight between hairpins 2 and 3 the monsoon has brought boulders and
 * mud down across both lanes; the traffic stops and queues (components/scene/Traffic reads missionBlock). You're in the
 * digger (data/cars "t-digger"): drive up to a boulder, SCOOP (E, or the button) lowers the front loader, takes it and
 * lifts it; drive to the road's edge and DUMP tips it over, and it tumbles away down the slope. Clear them all and the
 * road opens. Boulders are the game's own: low-poly stones in the cut face's grey. Units of 10 m.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, CanvasTexture, CatmullRomCurve3, DodecahedronGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from "three";
import { SECTION, height, roadDistance, roadShapeAt } from "@/lib/terrain";
import { game, resetCar } from "@/lib/game";
import { getBorrow, getChoice, setBorrow } from "@/lib/choice";
import { trafficControl } from "@/lib/traffic";
import { forceWeather } from "@/lib/weather";
import { MISSION, bumpMission, mission, rocksLeft, saveBest, starsFor, type Rock } from "@/lib/mission";
import { announce, bonus } from "@/lib/score";
import { chime } from "@/lib/horn";
import { haptic } from "@/lib/native";
import { mark } from "@/lib/stats";

const ARM = { rest: 0.04, low: 0.2, up: -0.42, ease: 6 }; // the loader's tilt (rad): carrying, scooping (bucket at the ground), raised with a rock
const REACH = 0.24;                                       // bucket to boulder (units, plus its radius)
const COUNT = 7;

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

/** A point on the road `s` along and `lat` across (+: the road's left), on the asphalt. */
function onRoad(curve: CatmullRomCurve3, s: number, lat: number, out = new Vector3()) {
  const t = Math.min(1, Math.max(0, s / curve.getLength())), tan = curve.getTangentAt(t), left = new Vector3(tan.z, 0, -tan.x).normalize();
  curve.getPointAt(t, out).addScaledVector(left, lat);
  out.y -= 0.588;
  return out;
}

export default function Landslide({ curve }: { curve: CatmullRomCurve3 }) {
  const scene = useThree((s) => s.scene);
  const { group, rockMeshes, mud } = useMemo(() => {
    const group = new Group(); group.name = "landslide"; group.visible = false;
    const stone = new MeshStandardMaterial({ color: 0x7d776c, roughness: 1, flatShading: true });
    const rockMeshes: Mesh[] = [];
    for (let i = 0; i < COUNT; i++) {
      const geo = new DodecahedronGeometry(1, 1), p = geo.getAttribute("position"), r = rng(31 + i * 7);
      for (let k = 0; k < p.count; k++) { const f = 0.78 + r() * 0.4; p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * 0.8, p.getZ(k) * f); }
      geo.computeVertexNormals();
      const m = new Mesh(geo, stone); m.castShadow = m.receiveShadow = true; rockMeshes.push(m); group.add(m);
    }
    // wet mud fanned across the road
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!;
    const g = x.createRadialGradient(64, 64, 10, 64, 64, 64); g.addColorStop(0, "rgba(92,70,48,.95)"); g.addColorStop(0.7, "rgba(92,70,48,.7)"); g.addColorStop(1, "rgba(92,70,48,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
    const mud = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.4 }));
    mud.receiveShadow = true; group.add(mud);
    return { group, rockMeshes, mud };
  }, []);

  const tmp = useRef({ front: new Vector3(), bucket: new Vector3(), p: new Vector3(), vel: [] as Vector3[], tipLocal: null as Vector3 | null, armT: ARM.rest, dumpT: -1, scoopT: -1 });
  const setup = () => {
    const r = rng(1 + Math.floor(Math.random() * 1e5)), rocks: Rock[] = [];
    for (let i = 0; i < COUNT; i++) rocks.push({ s: MISSION.s0 + (i / (COUNT - 1) - 0.5) * 1.1 + (r() - 0.5) * 0.15, lat: (r() - 0.5) * 0.62, r: 0.06 + r() * 0.06, state: "road", t: 0 });
    Object.assign(mission, { phase: "work", rocks, carried: -1, t: 0, scoop: 0 });
    tmp.current.vel = rocks.map(() => new Vector3()); tmp.current.tipLocal = null;
    game.leg = 0; game.jumped = true; resetCar(MISSION.s0 - MISSION.back);
    game.parked = null; setBorrow({ ...getChoice(), car: "t-digger" });
    for (const v of trafficControl.fleet) if (Math.abs(v.distance - MISSION.s0) < 7) v.distance = MISSION.s0 + (v.distance < MISSION.s0 ? -12 : 12) + (Math.random() - 0.5) * 3;
    forceWeather("drizzle");
    announce("🚜 Landslide! Clear the rocks off the road", "big");
    bumpMission();
  };

  useFrame((_, dt) => {
    const T = tmp.current;
    if (mission.phase === "pending" && game.started && game.phase === "drive") setup();
    // back at the start screen mid-job (or after it): the job ends, the rain lets up, you're back in your own car
    if (!game.started && (mission.phase === "work" || mission.phase === "done")) {
      mission.phase = "none"; mission.carried = -1; forceWeather(null); if (getBorrow()?.car === "t-digger") setBorrow(null); bumpMission();
    }
    group.visible = mission.phase === "work" || (mission.phase === "done" && mission.rocks.some((r) => r.state === "falling"));
    if (!group.visible) return;
    dt = Math.min(dt, 0.05);
    if (!game.paused && mission.phase === "work") mission.t += dt;
    // mud
    const mt = MISSION.s0 / curve.getLength(), mp = onRoad(curve, MISSION.s0, 0, T.p);
    mud.position.set(mp.x, mp.y + 0.004, mp.z); mud.rotation.y = Math.atan2(curve.getTangentAt(mt).x, curve.getTangentAt(mt).z);
    mud.scale.set((SECTION.half + roadShapeAt(mt).widen) * 2.2, 1, 1.6); mud.visible = mission.phase === "work";

    // the digger: its front (the bucket's reach) and the loader
    const car = scene.getObjectByName("player-car"), arm = car?.getObjectByName("digger-arm") ?? null;
    if (arm && !T.tipLocal) { // the bucket's middle, in the loader's own frame (once)
      arm.updateMatrixWorld(true); const box = new Box3().setFromObject(arm), inv = arm.matrixWorld.clone().invert();
      T.tipLocal = new Vector3((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.35, 0).applyMatrix4(inv);
      const far = new Vector3().copy(box.max).applyMatrix4(inv), near = new Vector3().copy(box.min).applyMatrix4(inv);
      T.tipLocal.z = Math.max(far.z, near.z) - Math.abs(far.z - near.z) * 0.18;
    }
    if (arm && T.tipLocal) { arm.updateMatrixWorld(true); T.bucket.copy(T.tipLocal).applyMatrix4(arm.matrixWorld); }
    const front = T.front.copy(arm && T.tipLocal ? T.bucket : car ? car.getWorldPosition(T.front) : T.front);

    // which button: scoop a boulder in reach, or dump the one you carry off the edge
    let near = -1, best = Infinity;
    if (mission.carried < 0) mission.rocks.forEach((r, i) => {
      if (r.state !== "road") return;
      const p = onRoad(curve, r.s, r.lat, T.p), d = Math.hypot(p.x - front.x, p.z - front.z) - r.r;
      if (d < REACH && d < best) { best = d; near = i; }
    });
    // at the edge: the bucket out over the white edge line (the barrier and the bank stop the digger itself; the rock goes over)
    const offEdge = roadDistance(front.x, front.z) > SECTION.half - 0.1;
    const canScoop = mission.phase === "work" && near >= 0 && Math.abs(game.speed) < 0.45 && T.scoopT < 0;
    const canDump = mission.phase === "work" && mission.carried >= 0 && offEdge && T.scoopT < 0;
    if (canScoop !== mission.canScoop || canDump !== mission.canDump) { mission.canScoop = canScoop; mission.canDump = canDump; bumpMission(); }
    if (mission.scoop) {
      mission.scoop = 0;
      if (canScoop) { T.scoopT = 0; mission.carried = near; mission.rocks[near].state = "carried"; haptic("light"); bumpMission(); }
      else if (canDump) {
        const r = mission.rocks[mission.carried], v = T.vel[mission.carried], out = new Vector3(front.x, 0, front.z).sub(car!.getWorldPosition(new Vector3()).setY(0)).normalize();
        v.set(out.x * 1.1, 0.7, out.z * 1.1); r.state = "falling"; r.t = 0; T.dumpT = 0; mission.carried = -1; haptic("medium");
        const left = rocksLeft();
        if (left === 0) finish(); else announce(`🪨 ${left} to go`, "badge");
        bumpMission();
      } else if (mission.carried >= 0) announce("Drive to the road's edge to dump it", "badge");
    }
    // the loader: down to scoop, up while carrying, a tip forward to dump
    let want = mission.carried >= 0 ? ARM.up : ARM.rest;
    if (T.scoopT >= 0) { T.scoopT += dt; want = T.scoopT < 0.45 ? ARM.low : ARM.up; if (T.scoopT > 0.9) T.scoopT = -1; }
    if (T.dumpT >= 0) { T.dumpT += dt; want = T.dumpT < 0.35 ? ARM.low * 0.6 : ARM.rest; if (T.dumpT > 0.8) T.dumpT = -1; }
    T.armT += (want - T.armT) * Math.min(1, dt * ARM.ease);
    if (arm) arm.rotation.x = T.armT;

    // the boulders
    mission.rocks.forEach((r, i) => {
      const m = rockMeshes[i]; m.visible = r.state !== "gone";
      if (!m.visible) return;
      m.scale.setScalar(r.r);
      if (r.state === "road") { const p = onRoad(curve, r.s, r.lat, T.p); m.position.set(p.x, p.y + r.r * 0.55, p.z); m.rotation.set(i, i * 2.1, 0); }
      else if (r.state === "carried") { // in the bucket (while it's going down, the bucket comes to it)
        const p = onRoad(curve, r.s, r.lat, T.p).setY(T.p.y + r.r * 0.55), k = T.scoopT >= 0 && T.scoopT < 0.45 ? 0 : 1;
        if (k) m.position.copy(front).setY(front.y + r.r * 0.6); else m.position.copy(p);
      } else if (r.state === "falling") { // over the edge: thrown out, falls and rolls down the slope, then gone
        const v = T.vel[i]; r.t += dt; v.y -= 2.2 * dt;
        m.position.addScaledVector(v, dt); m.rotation.x += dt * 6; m.rotation.z += dt * 3;
        const ground = height(m.position.x, m.position.z) + r.r * 0.5;
        if (m.position.y < ground) { m.position.y = ground; v.y = Math.abs(v.y) * 0.3; v.x *= 0.92; v.z *= 0.92; }
        if (r.t > 3) r.state = "gone";
      }
    });
  });

  const finish = () => {
    const sec = mission.t, stars = starsFor(sec);
    mission.phase = "done"; saveBest(sec); forceWeather(null);
    bonus(stars * 500, `Road open! ${"⭐".repeat(stars)}`); chime(true); haptic("success"); mark(`landslide-${stars}star`);
  };
  return <primitive object={group} />;
}

