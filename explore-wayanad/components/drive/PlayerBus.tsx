"use client";
import { use, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, CatmullRomCurve3, Color, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, SpotLight, Vector3 } from "three";
import { BUS, game, resetBus } from "@/lib/game";
import { stepBus, type RoadInfo } from "@/lib/busPhysics";
import { collidePlayer, trafficControl, VEHICLES } from "@/lib/traffic";
import { destinationBoard, loadVehicle } from "@/lib/vehicleAssets";
import { forestRoad, height, roadShapeAt } from "@/lib/terrain";
import { scrollState } from "@/lib/scrollState";
import { driveT, driveT2, driveT7, driveT8, FOREST_ROUTE } from "@/lib/drive";
import { weather } from "@/lib/weather";
import type { ActId } from "@/data/acts";

/* The chase camera, units of 10 m: behind the bus and above it, looking a little ahead of its nose. It follows the
 * bus's heading with a lag (time constants), and never drops into the hillside behind a hairpin. */
const CAM = { back: 1.12, up: 0.32, ahead: 1.0, aimUp: 0.13, follow: 0.22, turn: 0.35, clearance: 0.12 };
const SPEC = VEHICLES[0]; // the KSRTC bus, as in traffic
const up = new Vector3(0, 1, 0);

/** scroll progress (0–1) whose drive table gives road position t: the inverse of lib/drive's lookups */
function progressFor(fn: (q: number) => number, t: number) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (fn(mid) < t) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export default function PlayerBus({ curve, forest }: { curve: CatmullRomCurve3; forest: CatmullRomCurve3 | null }) {
  const source = use(loadVehicle("/models/traffic/ksrtc-real.glb"));
  const camera = useThree((s) => s.camera);
  const roads = useMemo<RoadInfo[]>(() => [
    { curve, length: curve.getLength(), widen: (t: number) => roadShapeAt(t).widen },
    ...(forest ? [{ curve: forest, length: forest.getLength(), widen: () => 0 }] : []),
  ], [curve, forest]);

  const { root, brake, head, spot } = useMemo(() => {
    const root = new Group(), model = source.clone(true), box = new Box3().setFromObject(model), size = box.getSize(new Vector3()), c = box.getCenter(new Vector3());
    const k = new Vector3(SPEC.width / size.x, SPEC.height / size.y, SPEC.length / size.z);
    model.scale.copy(k); model.position.set(-c.x * k.x, -box.min.y * k.y, -c.z * k.z);
    model.traverse((o) => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(model, destinationBoard("ksrtc-real", "both", SPEC, model));
    // brake / tail lamps and headlamps: small glowing panels; one headlight beam for rain and mist
    const lamp = new PlaneGeometry(0.03, 0.016);
    const brake = new MeshStandardMaterial({ color: 0x400000, emissive: new Color(0xff2a1a), emissiveIntensity: 0.2 });
    const head = new MeshStandardMaterial({ color: 0xffffff, emissive: new Color(0xfff1c8), emissiveIntensity: 0.2 });
    for (const x of [-SPEC.width * 0.38, SPEC.width * 0.38]) {
      const b = new Mesh(lamp, brake); b.position.set(x, SPEC.height * 0.28, -SPEC.length / 2 - 0.004); b.rotation.y = Math.PI; root.add(b);
      const h = new Mesh(lamp, head); h.position.set(x, SPEC.height * 0.24, SPEC.length / 2 - 0.02); root.add(h);
    }
    const spot = new SpotLight(0xfff0d0, 0, 9, 0.55, 0.6, 1.2);
    spot.position.set(0, SPEC.height * 0.3, SPEC.length / 2);
    const target = new Object3D(); target.position.set(0, -0.2, 4); root.add(spot, target); spot.target = target;
    root.name = "player-bus";
    return { root, brake, head, spot };
  }, [source]);

  const camPos = useRef(new Vector3()), aim = useRef(new Vector3()), started = useRef(false);
  const tmp = useMemo(() => ({ p: new Vector3(), f: new Vector3(), r: new Vector3(), tan: new Vector3(), left: new Vector3(), fwd: new Vector3(), n: new Vector3(), m: new Matrix4(), q: new Quaternion(), want: new Vector3(), look: new Vector3() }), []);
  const lastReset = useRef(game.reset);

  // before the director and traffic each frame (negative priority runs first and leaves rendering to R3F)
  useFrame((_, dt) => {
    const road = roads[Math.min(game.leg, roads.length - 1)];
    if (game.reset !== lastReset.current) { lastReset.current = game.reset; camPos.current.set(0, 0, 0); }
    if (game.started && game.phase === "drive") {
      stepBus(road, dt);
      if (game.leg === 0 && trafficControl.curve === curve) {
        const p = { s: game.s, lat: game.lat, speed: game.speed, halfL: BUS.halfL, halfW: BUS.halfW };
        const knock = collidePlayer(trafficControl.fleet, curve, road.widen, p);
        game.s = p.s; game.speed = p.speed; game.bump = Math.max(game.bump * 0.9, knock);
      }
      // the ends of the two roads: Kalpetta (the card for the road to Sulthan Bathery), and the border barrier
      if (game.leg === 0 && game.s > road.length * 0.995) { game.phase = "between"; game.speed = 0; }
      const stop = FOREST_ROUTE.stop * road.length;
      if (game.leg === 1 && game.s >= stop) { game.s = stop; game.speed = 0; game.phase = "finished"; }
    } else game.input.throttle = 0;
    game.bump *= 0.92;

    // the world follows the bus: the act and its progress, so fog, light, the minimap and which world shows all match
    const t = Math.min(1, game.s / road.length);
    let act: ActId, q: number;
    if (game.leg === 0) { if (t < scrollState.churamEnd) { act = "churam"; q = progressFor(driveT, t); } else { act = "kalpetta"; q = Math.min(0.8, progressFor(driveT2, t)); } }
    else if (t < FOREST_ROUTE.muthanga) { act = "forest"; q = progressFor(driveT7, t); } else { act = "border"; q = progressFor(driveT8, t); }
    scrollState.act = act; scrollState.progress = q; scrollState.hold = 0;
    // for the HUD: where you are, the next stop and how far, hairpins behind you
    if (game.leg === 0) {
      const places = scrollState.places.filter((pl) => pl.t <= t);
      game.bends = scrollState.bends.filter((b) => b <= t).length;
      game.place = t < scrollState.arch ? (game.bends ? `Hairpin ${game.bends}` : "Adivaram") : places.length ? places[places.length - 1].name : "Lakkidi";
      [game.next, game.nextM] = t < scrollState.arch ? ["Lakkidi gate", (scrollState.arch - t) * road.length * 10] : ["Kalpetta", (1 - t) * road.length * 10];
    } else {
      const places = (forestRoad()?.places ?? []).filter((pl) => pl.t <= t);
      game.place = places.length ? places[places.length - 1].name : "Sulthan Bathery";
      [game.next, game.nextM] = ["Border gate", Math.max(0, FOREST_ROUTE.stop - t) * road.length * 10];
    }

    // pose: on the road at s, `lat` across it, turned `psi` from its direction, pitched with the slope
    const L = road.length, { p, tan, left, fwd, n, m, q: rot } = tmp;
    road.curve.getPointAt(t, p); road.curve.getTangentAt(t, tan);
    left.set(tan.z, 0, -tan.x).normalize();
    p.addScaledVector(left, game.lat); p.y -= 0.588; // the asphalt (as Traffic's lanePoint)
    const ahead = road.curve.getPointAt(Math.min(1, (game.s + 0.3) / L)).y - road.curve.getPointAt(Math.max(0, (game.s - 0.3) / L)).y;
    fwd.copy(tan).setY(0).normalize().multiplyScalar(Math.cos(game.psi)).addScaledVector(left, Math.sin(game.psi)).setY(ahead / 0.6).normalize();
    const right = tmp.r.copy(up).cross(fwd).normalize(); n.copy(fwd).cross(right).normalize();
    rot.setFromRotationMatrix(m.makeBasis(right, n, fwd));
    root.position.copy(p).addScaledVector(n, 0.003); root.quaternion.copy(rot);

    // lamps: brake lights when braking; tail and head lamps on in rain, mist and gloom; the beam only then
    const dark = Math.min(1, weather.gloom + weather.mist * 0.6 + weather.rain * 0.5);
    brake.emissiveIntensity = game.braking ? 3 : 0.25 + dark * 0.8;
    head.emissiveIntensity = 0.2 + dark * 2.2;
    spot.intensity = dark * 6; spot.visible = dark > 0.05;

    // the chase camera
    const { want, look } = tmp;
    want.copy(root.position).addScaledVector(fwd.clone().setY(0).normalize(), -CAM.back).addScaledVector(up, CAM.up);
    look.copy(root.position).addScaledVector(fwd, CAM.ahead).addScaledVector(up, CAM.aimUp);
    if (!started.current || camPos.current.lengthSq() === 0) { camPos.current.copy(want); aim.current.copy(look); started.current = true; }
    const kp = 1 - Math.exp(-dt / CAM.follow), ka = 1 - Math.exp(-dt / CAM.turn);
    camPos.current.lerp(want, kp); aim.current.lerp(look, ka);
    const ground = height(camPos.current.x, camPos.current.z) + CAM.clearance;
    if (camPos.current.y < ground) camPos.current.y = ground;
    camera.position.copy(camPos.current);
    const shake = (game.bump + game.scrape * 0.5) * 0.012;
    if (shake > 0.0005) camera.position.add(tmp.want.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    camera.lookAt(aim.current);
  }, -1);

  return <primitive object={root} />;
}

export { resetBus };
