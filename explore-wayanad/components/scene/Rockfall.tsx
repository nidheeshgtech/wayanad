"use client";
/**
 * The rockfall reel's scene (lib/stage, ?scene=rockfall; filming only, never in normal play). On `fall()` a handful of
 * boulders, gravel and wet mud come off the uphill side onto the churam a little ahead of you, with dust and a rumble,
 * and block both lanes (Traffic and your car stop short: lib/stage stageBlock). On `rescue()` a Kerala Police jeep and a
 * Fire & Rescue truck come down from Lakkidi's side with their lights going and stop past the rubble; Varghese (in
 * khaki) and Shibu step out and walk over, a local in a lungi watches from the shoulder. On `clear()` the rocks are
 * pushed off the downhill edge and the mud washes away; the road opens.
 * Everything here is game assets: the road's rock model, the traffic Scorpio and lorry (repainted), the cast.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending, Box3, BoxGeometry, CanvasTexture, CatmullRomCurve3, Color, DodecahedronGeometry, Group, InstancedMesh,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, SphereGeometry, Sprite,
  SpriteMaterial, SRGBColorSpace, Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { height, roadShapeAt } from "@/lib/terrain";
import { lanePoint } from "@/lib/traffic";
import { loadVehicle } from "@/lib/vehicleAssets";
import { paintCar } from "@/lib/carModel";
import { loadCast, makeActor, settleHands, type Actor } from "@/lib/people";
import { personHeight, type PersonId } from "@/data/drivers";
import { game } from "@/lib/game";
import { stage, stageBlock } from "@/lib/stage";

const widen = (t: number) => roadShapeAt(t).widen;
const UP = new Vector3(0, 1, 0);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const rand = (i: number, k = 1) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

/** A point on the road `d` units along and `lat` across (+ = the road's left), on the asphalt; with the frame there. */
function roadAt(curve: CatmullRomCurve3, d: number, lat: number) {
  const t = clamp01(d / curve.getLength()), tangent = curve.getTangentAt(t);
  const left = new Vector3(tangent.z, 0, -tangent.x).normalize();
  const pos = curve.getPointAt(t).addScaledVector(left, lat); pos.y -= 0.588;
  return { pos, left, forward: new Vector3(tangent.x, 0, tangent.z).normalize() };
}

/** A vehicle `length` long placed on a lane at `d`, facing its way (-1: coming down from Lakkidi). */
function poseOn(curve: CatmullRomCurve3, d: number, direction: 1 | -1, length: number, o: Object3D) {
  const half = length * 0.31;
  const front = lanePoint(curve, d + half * direction, direction, widen), rear = lanePoint(curve, d - half * direction, direction, widen);
  const forward = front.clone().sub(rear).normalize(), right = UP.clone().cross(forward).normalize(), normal = forward.clone().cross(right).normalize();
  o.position.copy(front.add(rear).multiplyScalar(0.5)).addScaledVector(normal, 0.003);
  o.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right, normal, forward));
}

/** A model fitted to a size (units), feet on y = 0, centred, facing +z. */
function fitted(model: Object3D, size: { length: number; width: number; height: number }) {
  const box = new Box3().setFromObject(model), s = box.getSize(new Vector3()), c = box.getCenter(new Vector3());
  const k = new Vector3(size.width / s.x, size.height / s.y, size.length / s.z);
  model.scale.copy(k); model.position.set(-c.x * k.x, -box.min.y * k.y, -c.z * k.z);
  const g = new Group(); g.add(model); return g;
}

/** Lettering on a vehicle's side: a canvas texture on a plane. */
function label(text: string, w: number, h: number, ink: string, paper: string | null, stripe?: string) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = Math.round(1024 * h / w);
  const g = c.getContext("2d")!;
  if (paper) { g.fillStyle = paper; g.fillRect(0, 0, c.width, c.height); }
  if (stripe) { g.fillStyle = stripe; g.fillRect(0, c.height * 0.78, c.width, c.height * 0.22); }
  g.fillStyle = ink; g.font = `800 ${Math.round(c.height * 0.62)}px Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height * (stripe ? 0.42 : 0.52));
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 8;
  return new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: tex, transparent: !paper, roughness: 0.5 }));
}

/** Soft round glow (lights, dust). */
let glowTex: CanvasTexture | null = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return (glowTex = new CanvasTexture(c));
}

/** A bar of flashing lights for a roof: red and blue boxes that glow in turn, with a soft halo each. */
function lightBar(width: number) {
  const bar = new Group();
  const lamps = (["#ff2020", "#2050ff"] as const).map((col, i) => {
    const lamp = new Mesh(new BoxGeometry(width * 0.45, 0.012, 0.03), new MeshBasicMaterial({ color: col }));
    lamp.position.x = (i ? 1 : -1) * width * 0.25;
    const halo = new Sprite(new SpriteMaterial({ map: glow(), color: col, blending: AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(0.28); lamp.add(halo);
    bar.add(lamp);
    return { lamp, halo, col: new Color(col) };
  });
  return { bar, flash: (t: number) => lamps.forEach((l, i) => {
    const on = Math.floor(t * 6 + i * 3) % 6 < 3 ? 1 : 0.08; // alternating double-flash
    (l.lamp.material as MeshBasicMaterial).color.copy(l.col).multiplyScalar(on);
    l.halo.material.opacity = on > 0.5 ? 0.9 : 0;
  }) };
}

/** The jam behind you: traffic models in your lane, each easing in to its place in the queue (their brake lights on). */
const QUEUE = [
  { file: "ksrtc-real", size: { length: 0.94, width: 0.225, height: 0.262 }, gap: 0.78 },
  { file: "auto-real", size: { length: 0.265, width: 0.146, height: 0.17 }, gap: 1.42 },
  { file: "lorry-real", size: { length: 0.78, width: 0.271, height: 0.324 }, gap: 2.12 },
  { file: "wagonr-real", size: { length: 0.36, width: 0.171, height: 0.169 }, gap: 2.83 },
  { file: "privatebus-real", size: { length: 0.94, width: 0.225, height: 0.262 }, gap: 3.62 },
];

type Rock = { mesh: Object3D; from: Vector3; to: Vector3; delay: number; spin: Vector3; off: Vector3 };
type Walker = { id: PersonId; actor: Actor | null; path: Vector3[]; start: number; speed: number; face: Vector3 };

/** Film shots (lib/stage `shot`): where the camera stands and looks, in the road's frame at the rubble — `along` units
 * past it, `lat` across (+ = uphill), `y` up — easing from `from` to `to` over `secs`. null: the game's own camera. */
type Spot = { along: number; lat: number; y: number };
const SHOTS: Record<string, { from: Spot; to: Spot; look: Spot; lookTo?: Spot; secs: number }> = {
  // low on the far side of the rubble, looking back down the road at you coming up, as the hill lets go
  cliff: { from: { along: 1.1, lat: -0.42, y: 0.1 }, to: { along: 0.95, lat: -0.4, y: 0.12 }, look: { along: -1.6, lat: 0.1, y: 0.18 }, secs: 6 },
  // beside the road short of it, looking up at the slope and the rocks coming down
  slope: { from: { along: -0.9, lat: -0.32, y: 0.12 }, to: { along: -0.75, lat: -0.3, y: 0.1 }, look: { along: 0.1, lat: 0.45, y: 0.5 }, lookTo: { along: 0, lat: 0.1, y: 0.06 }, secs: 2.5 },
  // high behind the queue, drifting in: the jam and the rubble
  drone: { from: { along: 3.4, lat: -0.35, y: 1.5 }, to: { along: 2.3, lat: -0.25, y: 1.05 }, look: { along: -2.4, lat: 0, y: 0 }, lookTo: { along: -1.8, lat: 0, y: 0 }, secs: 7 },
  // low by the rubble, looking up the road at the jeep and the fire truck coming down
  rescue: { from: { along: -0.2, lat: -0.58, y: 0.1 }, to: { along: -0.1, lat: -0.56, y: 0.11 }, look: { along: 3, lat: -0.25, y: 0.12 }, lookTo: { along: 1.3, lat: -0.2, y: 0.1 }, secs: 8 },
  // past the rubble on the downhill shoulder, looking up the road: the jeep and the fire truck pulling up, lights going
  arrive: { from: { along: 0.25, lat: -0.62, y: 0.13 }, to: { along: 0.35, lat: -0.6, y: 0.14 }, look: { along: 2.4, lat: -0.15, y: 0.12 }, lookTo: { along: 1.5, lat: -0.15, y: 0.1 }, secs: 9 },
  // from the downhill side: the crew at the rubble, the jeep's lights behind
  crew: { from: { along: -0.25, lat: -0.85, y: 0.2 }, to: { along: 0.25, lat: -0.82, y: 0.19 }, look: { along: 0.6, lat: -0.1, y: 0.06 }, secs: 8 },
};

export default function Rockfall({ curve }: { curve: CatmullRomCurve3 }) {
  const { scene, camera } = useThree();
  // the film camera: set just before each frame is drawn, after the game has placed its own
  useEffect(() => {
    const look = new Vector3(), spot = (sp: Spot) => { const r = roadAt(curve, stage.s0 + sp.along, sp.lat * S.current.uphill); return r.pos.add(new Vector3(0, sp.y + 0.588 - 0.55, 0)); };
    const before = scene.onBeforeRender;
    scene.onBeforeRender = (renderer, sc, cam, ...rest) => {
      before.call(scene, renderer, sc, cam, ...rest);
      const shot = stage.shot && SHOTS[stage.shot];
      if (!shot || cam !== camera) return;
      const k = easeOut(clamp01(stage.shotT / shot.secs)) * 0.5 + clamp01(stage.shotT / shot.secs) * 0.5;
      cam.position.lerpVectors(spot(shot.from), spot(shot.to), k);
      look.lerpVectors(spot(shot.look), spot(shot.lookTo ?? shot.look), k);
      cam.lookAt(look); cam.updateMatrixWorld();
    };
    return () => { scene.onBeforeRender = before; };
  }, [scene, camera, curve]);
  const root = useMemo(() => { const g = new Group(); g.name = "stage-rockfall"; g.visible = false; return g; }, []);
  useEffect(() => { (window as unknown as { __wayanadStageRoot: Group }).__wayanadStageRoot = root; }, [root]); // (for inspecting a take)
  const S = useRef({
    rocks: [] as Rock[], gravel: null as InstancedMesh | null, gravelAt: [] as { from: Vector3; to: Vector3; delay: number }[],
    mud: null as Mesh | null, dust: [] as { sprite: Sprite; from: Vector3; drift: Vector3; delay: number }[],
    jeep: null as Group | null, truck: null as Group | null, flashJeep: null as ((t: number) => void) | null, flashTruck: null as ((t: number) => void) | null,
    walkers: [] as Walker[], queue: [] as { g: Group; gap: number; length: number }[], uphill: 1, built: -1, rockModel: null as Object3D | null, clock: 0,
  });

  // assets: the road's own rock, the traffic Scorpio (as the police jeep) and lorry (as the fire truck), the cast
  useEffect(() => {
    let gone = false;
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("/models/rock_07/rock_07.gltf").then((g) => { if (!gone) S.current.rockModel = g.scene; });
    loadVehicle("/models/traffic/player-4x4.glb").then((m) => {
      if (gone) return;
      const body = paintCar(clone(m), "#f2f3f1"); // Kerala Police: a white Scorpio (the game's own paint, as for your car)
      const jeep = fitted(body, { length: 0.466, width: 0.19, height: 0.19 });
      const { bar, flash } = lightBar(0.12); bar.position.set(0, 0.198, -0.02); jeep.add(bar);
      for (const side of [-1, 1]) {
        const tag = label("KERALA POLICE", 0.2, 0.034, "#1b3f9c", null);
        tag.position.set(side * 0.0965, 0.085, -0.02); tag.rotation.y = side * Math.PI / 2; jeep.add(tag);
      }
      S.current.jeep = jeep; S.current.flashJeep = flash; jeep.visible = false; root.add(jeep);
    });
    loadVehicle("/models/traffic/lorry-real.glb", { merged: true }).then((m) => {
      if (gone) return;
      const body = m.clone(true);
      body.traverse((o) => {
        const mesh = o as Mesh; if (!mesh.isMesh) return;
        const red = (mat: MeshStandardMaterial) => { const c = mat.clone(); c.color.set("#d42a22"); return c; };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => red(m as MeshStandardMaterial)) : red(mesh.material as MeshStandardMaterial);
      });
      const truck = fitted(body, { length: 0.78, width: 0.271, height: 0.324 });
      const { bar, flash } = lightBar(0.2); bar.position.set(0, 0.332, 0.25); truck.add(bar);
      for (const side of [-1, 1]) {
        const tag = label("FIRE & RESCUE  101", 0.46, 0.06, "#ffffff", "#c81e1e", "#f2c200");
        tag.position.set(side * 0.1375, 0.13, -0.1); tag.rotation.y = side * Math.PI / 2; truck.add(tag);
      }
      S.current.truck = truck; S.current.flashTruck = flash; truck.visible = false; root.add(truck);
    });
    for (const q of QUEUE) loadVehicle(`/models/traffic/${q.file}.glb`, { merged: true }).then((m) => {
      if (gone) return;
      const g = fitted(m.clone(true), q.size);
      const brake = new Sprite(new SpriteMaterial({ map: glow(), color: "#ff2a1a", blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
      brake.scale.set(q.size.width * 1.4, q.size.width * 0.5, 1); brake.position.set(0, q.size.height * 0.35, -q.size.length / 2 - 0.01); g.add(brake);
      g.visible = false; root.add(g); S.current.queue.push({ g, gap: q.gap, length: q.size.length });
    });
    return () => { gone = true; };
  }, [root]);

  /** Lay out the rubble for the current s0 (once per fall). */
  function build() {
    const R = S.current, s0 = stage.s0;
    R.built = stage.version;
    for (const r of R.rocks) root.remove(r.mesh);
    R.rocks = [];
    // which side is uphill here: the rocks come off the higher ground
    const c = roadAt(curve, s0, 0), a = c.pos.clone().addScaledVector(c.left, 0.8), b = c.pos.clone().addScaledVector(c.left, -0.8);
    R.uphill = height(a.x, a.z) >= height(b.x, b.z) ? 1 : -1;
    const up = R.uphill;
    if (R.rockModel) {
      const box = new Box3().setFromObject(R.rockModel), size = box.getSize(new Vector3()).length();
      for (let i = 0; i < 11; i++) {
        const big = i < 4, sz = (big ? 0.16 + rand(i) * 0.08 : 0.06 + rand(i) * 0.06);
        const mesh = clone(R.rockModel); mesh.scale.setScalar(sz / size);
        mesh.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.material = (m.material as MeshStandardMaterial).clone(); (m.material as MeshStandardMaterial).color.set("#b3a491"); (m.material as MeshStandardMaterial).roughness = 0.9; (m.material as MeshStandardMaterial).metalness = 0; } });
        const lat = up * (0.3 - (i / 10) * 0.58) + (rand(i, 2) - 0.5) * 0.06, along = (rand(i, 3) - 0.4) * 0.35;
        const to = roadAt(curve, s0 + along, lat).pos.add(new Vector3(0, sz * 0.25, 0));
        const from = to.clone().addScaledVector(c.left, up * (0.5 + rand(i, 4) * 0.4)).add(new Vector3(0, 0.7 + rand(i, 5) * 0.6, 0));
        R.rocks.push({ mesh, from, to, delay: rand(i, 6) * 0.7, spin: new Vector3(rand(i, 7) * 6, rand(i, 8) * 4, rand(i, 9) * 6), off: new Vector3() });
        root.add(mesh);
      }
    }
    // gravel: small stones scattered with the rocks
    if (!R.gravel) {
      R.gravel = new InstancedMesh(new DodecahedronGeometry(1, 0), new MeshStandardMaterial({ color: "#5d5a52", roughness: 0.9 }), 60);
      R.gravel.castShadow = true; root.add(R.gravel);
    }
    R.gravelAt = Array.from({ length: 60 }, (_, i) => {
      const to = roadAt(curve, s0 + (rand(i, 11) - 0.45) * 0.6, up * (0.36 - rand(i, 12) * 0.72)).pos.add(new Vector3(0, 0.006, 0));
      return { to, from: to.clone().addScaledVector(c.left, up * (0.4 + rand(i, 13) * 0.4)).add(new Vector3(0, 0.6 + rand(i, 14) * 0.5, 0)), delay: 0.2 + rand(i, 15) * 0.9 };
    });
    // the mud: a wet brown mound across the road
    if (!R.mud) {
      R.mud = new Mesh(new SphereGeometry(1, 24, 12), new MeshStandardMaterial({ color: "#4f3a28", roughness: 0.85, metalness: 0 }));
      R.mud.receiveShadow = true; root.add(R.mud);
    }
    const m = roadAt(curve, s0 + 0.03, up * 0.06);
    R.mud.position.copy(m.pos); R.mud.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(m.left, UP, m.forward));
    R.mud.scale.set(0.001, 0.001, 0.001);
    // dust: soft clouds rolling down off the slope
    for (const d of R.dust) root.remove(d.sprite);
    R.dust = Array.from({ length: 8 }, (_, i) => {
      const sprite = new Sprite(new SpriteMaterial({ map: glow(), color: "#8a7f70", transparent: true, depthWrite: false, opacity: 0 }));
      root.add(sprite);
      const from = roadAt(curve, s0 + (rand(i, 21) - 0.5) * 0.5, up * (0.45 + rand(i, 22) * 0.3)).pos.add(new Vector3(0, 0.25 + rand(i, 23) * 0.3, 0));
      return { sprite, from, drift: c.left.clone().multiplyScalar(-up * (0.2 + rand(i, 24) * 0.2)).add(new Vector3(0, -0.05, 0)), delay: 0.3 + rand(i, 25) * 0.8 };
    });
    // the crew: Varghese (khaki, from the jeep) and Shibu (from the truck) walk to the rubble; a local watches
    for (const w of R.walkers) if (w.actor) root.remove(w.actor.root);
    const beyond = (dd: number, lat: number) => roadAt(curve, s0 + dd, lat).pos;
    R.walkers = [
      { id: "guard", actor: null, path: [beyond(1.0, -0.36), beyond(0.42, -0.22), beyond(0.32, 0.02)], start: 8.6, speed: 0.13, face: c.forward.clone().negate() },
      { id: "mechanic", actor: null, path: [beyond(1.6, -0.38), beyond(0.5, -0.3), beyond(0.36, -0.16)], start: 9.6, speed: 0.12, face: c.left.clone().multiplyScalar(up) },
      { id: "lungi", actor: null, path: [beyond(-1.4, up * 0.42), beyond(-1.1, up * 0.4)], start: 2.5, speed: 0.08, face: c.forward.clone() },
    ];
    for (const w of R.walkers) loadCast(w.id).then((src) => {
      if (R.built !== stage.version && stage.phase === "falling") return;
      const a = makeActor(w.id, src[0], src[1], personHeight(w.id) / 10); a.root.visible = false; a.play("idle", 0);
      w.actor = a; root.add(a.root);
    });
  }

  useFrame((_, dtRaw) => {
    const R = S.current, dt = Math.min(dtRaw, 0.1);
    if (stage.phase === "none") { root.visible = false; return; }
    root.visible = true;
    if (stage.phase === "falling" && R.built !== stage.version) build();
    stage.t += dt; R.clock += dt; stage.shotT += dt;
    if (stage.rescue >= 0) stage.rescue += dt;
    const t = stage.t, up = R.uphill;

    // the fall: rocks accelerate down and tumble, settle with a small bounce; gravel and dust follow
    if (stage.phase === "falling" || stage.phase === "blocked") {
      if (stage.phase === "falling" && t < 1.6) game.bump = Math.max(game.bump, 0.2); // a rumble (below the HUD's "Bump")
      for (const r of R.rocks) {
        const k = clamp01((t - r.delay) / 0.9);
        r.mesh.position.lerpVectors(r.from, r.to, k).setY(r.from.y + (r.to.y - r.from.y) * k * k);
        if (k >= 1) { const after = t - r.delay - 0.9; r.mesh.position.y += Math.max(0, Math.sin(Math.min(after, 0.35) * Math.PI / 0.35)) * 0.03 * Math.exp(-after * 4); }
        else r.mesh.rotation.set(r.spin.x * t, r.spin.y * t, r.spin.z * t);
        r.mesh.visible = t > r.delay - 0.05;
      }
      if (R.gravel) {
        const m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3();
        R.gravelAt.forEach((g, i) => {
          const k = clamp01((t - g.delay) / 0.8);
          p.lerpVectors(g.from, g.to, k).setY(g.from.y + (g.to.y - g.from.y) * k * k);
          const s = t > g.delay ? 0.008 + rand(i, 30) * 0.012 : 0;
          q.setFromAxisAngle(UP, i); sc.setScalar(s); R.gravel!.setMatrixAt(i, m4.compose(p, q, sc));
        });
        R.gravel.instanceMatrix.needsUpdate = true;
      }
      if (R.mud) { const k = easeOut(clamp01((t - 0.5) / 1.6)); R.mud.scale.set(0.24 * k + 0.001, 0.03 * k + 0.001, 0.14 * k + 0.001); }
      for (const d of R.dust) {
        const k = clamp01((t - d.delay) / 4);
        d.sprite.position.copy(d.from).addScaledVector(d.drift, k * 2);
        d.sprite.scale.setScalar(0.25 + k * 0.9);
        d.sprite.material.opacity = k <= 0 ? 0 : Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.55;
      }
      if (stage.phase === "falling" && t > 2.2) { stage.phase = "blocked"; stage.version++; R.built = stage.version; }
    }

    // the rescue: down the other lane from Lakkidi's side, lights going, stopping just past the rubble
    if (stage.rescue >= 0) {
      const rt = stage.rescue;
      if (R.jeep) { R.jeep.visible = true; poseOn(curve, stage.s0 + 0.95 + 20 * (1 - easeOut(clamp01(rt / 7))), -1, 0.466, R.jeep); R.flashJeep?.(R.clock); }
      if (R.truck) { R.truck.visible = true; poseOn(curve, stage.s0 + 2.05 + 24 * (1 - easeOut(clamp01((rt - 0.8) / 8))), -1, 0.78, R.truck); R.flashTruck?.(R.clock + 0.3); }
    }

    // the jam: from the fall on, each queues in behind the one ahead (easing in from further down the road)
    for (const q of R.queue) {
      const since = stage.phase === "open" || stage.phase === "clearing" ? 99 : t - 1 - q.gap * 0.8, k = easeOut(clamp01(since / 5));
      q.g.visible = since > 0 && stage.phase !== "open";
      if (q.g.visible) poseOn(curve, stage.s0 - 0.42 - q.gap - 6 * (1 - k), 1, q.length, q.g);
    }

    // the people: each walks their path from their start time, then stands (facing their way)
    for (const w of R.walkers) {
      const a = w.actor; if (!a) continue;
      const since = (w.id === "lungi" ? t : stage.rescue) - w.start;
      if (since < 0 || (w.id !== "lungi" && stage.rescue < 0)) { a.root.visible = false; continue; }
      a.root.visible = true;
      let left = since * w.speed, at = w.path[0].clone(), dir = w.face.clone(), walking = false;
      for (let i = 1; i < w.path.length; i++) {
        const seg = w.path[i].clone().sub(w.path[i - 1]), len = seg.length();
        if (left < len) { at = w.path[i - 1].clone().addScaledVector(seg, left / len); dir = seg.setY(0).normalize(); walking = true; break; }
        left -= len; at = w.path[i].clone();
      }
      at.y = height(at.x, at.z) > at.y + 0.05 ? at.y : at.y; // (on the road surface; the path points already are)
      a.root.position.copy(at);
      a.root.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), dir.setY(0).normalize());
      const want = walking ? "walk" : "idle";
      if (a.root.userData.move !== want) { a.play(want, 0.3); a.root.userData.move = want; }
      a.mixer.update(dt); settleHands(a);
    }

    // clearing: the rocks are pushed off the downhill edge, the mud washes away; then the road opens
    if (stage.phase === "clearing") {
      const k = easeOut(clamp01(t / 5));
      for (const r of R.rocks) {
        r.mesh.position.copy(r.to).addScaledVector(roadAt(curve, stage.s0, 0).left, -up * k * 0.8).add(new Vector3(0, -k * k * 0.4, 0));
        r.mesh.visible = k < 0.98;
      }
      if (R.gravel) { R.gravel.visible = k < 0.6; }
      if (R.mud) R.mud.scale.multiplyScalar(1 - Math.min(1, dt * 0.9));
      if (t > 5) { stage.phase = "open"; stage.version++; }
    }

    // nothing drives through the rubble: your car stops short of it
    const block = stageBlock();
    if (block && game.s > block.distance - block.length * 0.85 && game.s < block.distance + 0.3) {
      game.s = block.distance - block.length * 0.85; game.speed = Math.min(game.speed, 0);
    }
  });

  return <primitive object={root} />;
}
