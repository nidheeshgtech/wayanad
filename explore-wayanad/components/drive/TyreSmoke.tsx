"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, Color, Sprite, SpriteMaterial,
  CanvasTexture, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, Object3D, PlaneGeometry, Quaternion, ShaderMaterial, Vector3,
} from "three";
import { CAR, NITRO, game } from "@/lib/game";
import { bonus } from "@/lib/score";
import { exhaust } from "@/lib/engine";
import { getChoice } from "@/lib/choice";
import { carOf } from "@/data/cars";

/* Tyre smoke and drifting, exhaust smoke, and flames from the tailpipe. When the car slides at the edge of its grip in a bend (lib/carPhysics: sideways near
 * CAR.grip), or brakes hard at speed, the rear tyres smoke: soft grey puffs that swell, rise and fade. Hold a clean
 * slide (no barrier) and it pays: "🔥 Drift!" with points for how long it lasted. One pool of billboards, one draw call
 * (a small shader fades each puff). Units of 10 m.
 * The exhaust puffs a little dark smoke as you accelerate — more the harder you pull, and a lot with nitro — and shows
 * a flame: blue and steady while the nitro fires, a quick orange spit when it pops on a lift-off (lib/engine). */
const EXH = { pool: 40, rate: 26, life: [0.45, 0.85] as const, size: [0.018, 0.075] as const };
const POOL = 56, RATE = 46; // puffs, and puffs a second per tyre at full smoke
const PUFF = { life: [0.7, 1.3] as const, size: [0.05, 0.16] as const, rise: 0.06 };
const DRIFT = { from: 0.82, min: 0.7, perSec: 40, max: 120 }; // slide at this share of grip; at least this long (s); points

type Puff = { p: Vector3; v: Vector3; age: number; life: number; size: number; end: number; alpha: number };

function flameTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,230,170,0.95)"); r.addColorStop(0.55, "rgba(255,140,40,0.55)"); r.addColorStop(1, "rgba(255,90,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

function puffTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,0.9)"); r.addColorStop(0.5, "rgba(255,255,255,0.35)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** A pool of soft billboards (one draw call), each with its own fade; `tint` the smoke's colour. */
function smokePool(size: number, tint: [number, number, number], name: string) {
    const geo = new PlaneGeometry(1, 1), fade = new InstancedBufferAttribute(new Float32Array(size), 1);
    geo.setAttribute("aFade", fade);
    const mat = new ShaderMaterial({
      uniforms: { map: { value: puffTexture() }, tint: { value: new Color(...tint) } },
      vertexShader: /* glsl */ `attribute float aFade; varying vec2 vUv; varying float vFade;
        void main() { vUv = uv; vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform sampler2D map; uniform vec3 tint; varying vec2 vUv; varying float vFade;
        void main() { float a = texture2D(map, vUv).a * vFade; if (a < 0.01) discard; gl_FragColor = vec4(tint, a); }`,
      transparent: true, depthWrite: false, side: DoubleSide,
    });
    const mesh = new InstancedMesh(geo, mat, size); mesh.frustumCulled = false; mesh.count = 0; mesh.name = name;
    const puffs: Puff[] = Array.from({ length: size }, () => ({ p: new Vector3(), v: new Vector3(), age: 1, life: 1, size: 0.1, end: 0.16, alpha: 0.55 }));
    return { mesh, fade, puffs };
}

export default function TyreSmoke() {
  const { tyre, exh, flames, group } = useMemo(() => {
    const tyre = smokePool(POOL, [0.86, 0.87, 0.86], "tyre-smoke"), exh = smokePool(EXH.pool, [0.42, 0.44, 0.46], "exhaust-smoke");
    const map = flameTexture();
    const flames = [0, 1].map(() => { const s = new Sprite(new SpriteMaterial({ map, blending: AdditiveBlending, transparent: true, depthWrite: false })); s.visible = false; s.renderOrder = 4; return s; });
    const group = new Object3D(); group.add(tyre.mesh, exh.mesh, ...flames);
    return { tyre, exh, flames, group };
  }, []);
  const ex = useRef({ owed: 0, next: 0 });
  const car = useRef<Object3D | null>(null), state = useRef({ owed: 0, next: 0, slide: 0, clean: true });
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3(), w: new Vector3(), up: new Vector3(0, 1, 0) }), []);

  useFrame(({ scene, camera }, dt) => {
    dt = Math.min(dt, 0.1);
    car.current ??= scene.getObjectByName("player-car") ?? null;
    const root = car.current, S = state.current, live = game.started && game.phase === "drive" && !game.paused;
    // how hard the tyres are working: sliding in a bend, or braking hard at speed
    const slip = Math.max(0, (Math.abs(game.sideways) / CAR.grip - DRIFT.from) / (1 - DRIFT.from + 0.25));
    const braking = game.input.brake > 0 && game.speed > 1.2 ? 0.6 : 0;
    const smoke = live && Math.abs(game.speed) > 0.6 ? Math.min(1, slip + braking) : 0;
    // a drift: a clean slide held long enough pays when it ends (a scrape on the barrier spoils it)
    if (live && slip > 0.15 && game.speed > 1.0) { S.slide += dt; if (game.scrape > 0.05) S.clean = false; }
    else if (S.slide > 0) {
      if (S.clean && S.slide >= DRIFT.min) game.nitro = Math.min(1, game.nitro + NITRO.drift);
      if (S.clean && S.slide >= DRIFT.min && game.leg === 0) bonus(Math.min(DRIFT.max, Math.round(S.slide * DRIFT.perSec / 5) * 5), "🔥 Drift!");
      S.slide = 0; S.clean = true;
    }
    // new puffs from both rear tyres
    const puffs = tyre.puffs;
    if (root && smoke > 0.05) {
      S.owed += RATE * smoke * dt * 2;
      root.updateMatrixWorld();
      while (S.owed >= 1) {
        S.owed -= 1;
        const pf = puffs[S.next]; S.next = (S.next + 1) % POOL;
        const side = Math.random() < 0.5 ? -1 : 1;
        pf.p.set(side * CAR.halfW * 0.8, 0.012, -CAR.halfL * 0.65).applyMatrix4(root.matrixWorld);
        pf.v.set((Math.random() - 0.5) * 0.08, PUFF.rise * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * 0.08);
        pf.age = 0; pf.life = PUFF.life[0] + Math.random() * (PUFF.life[1] - PUFF.life[0]);
        pf.size = PUFF.size[0] * (0.7 + 0.6 * smoke); pf.end = PUFF.size[1]; pf.alpha = 0.55;
      }
    } else S.owed = 0;
    // the tailpipe (the car's back, a little right of centre and low): smoke as you pull, flames with nitro or a pop
    const half = carOf(getChoice().car).length / 20;
    const pull = live && game.speed > -0.02 ? game.input.throttle * Math.min(1, 0.25 + Math.max(0, game.accel) * 1.6) : 0;
    const puffing = Math.min(1.6, pull + (game.boosting ? 1 : 0));
    if (root) root.updateMatrixWorld();
    if (root && puffing > 0.05) {
      const E = ex.current; E.owed += EXH.rate * puffing * dt;
      while (E.owed >= 1) {
        E.owed -= 1;
        const pf = exh.puffs[E.next]; E.next = (E.next + 1) % EXH.pool;
        pf.p.set(0.045 + (Math.random() - 0.5) * 0.01, 0.028, -half * 0.97).applyMatrix4(root.matrixWorld);
        pf.v.set((Math.random() - 0.5) * 0.05, 0.03 + Math.random() * 0.04, (Math.random() - 0.5) * 0.05);
        pf.age = 0; pf.life = EXH.life[0] + Math.random() * (EXH.life[1] - EXH.life[0]);
        pf.size = EXH.size[0]; pf.end = EXH.size[1] * (0.8 + 0.5 * Math.min(1, puffing)); pf.alpha = 0.32 + 0.18 * Math.min(1, puffing);
      }
    } else ex.current.owed = 0;
    // a battered car (PlayerCar's dents) smokes from under the bonnet, more the worse it is
    if (root && live && game.damage > 0.5) {
      const E = ex.current; E.owed += 14 * (game.damage - 0.5) * 2 * dt;
      while (E.owed >= 1) {
        E.owed -= 1;
        const pf = exh.puffs[E.next]; E.next = (E.next + 1) % EXH.pool;
        pf.p.set((Math.random() - 0.5) * 0.05, 0.12, half * 0.62).applyMatrix4(root.matrixWorld);
        pf.v.set((Math.random() - 0.5) * 0.04, 0.08 + Math.random() * 0.05, (Math.random() - 0.5) * 0.04);
        pf.age = 0; pf.life = 1.1 + Math.random() * 0.6; pf.size = 0.03; pf.end = 0.14; pf.alpha = 0.3;
      }
    }
    const popping = performance.now() - exhaust.popAt < 140;
    flames.forEach((f, i) => {
      f.visible = !!root && live && (game.boosting || popping);
      if (!f.visible || !root) return;
      const flick = 0.75 + Math.random() * 0.5;
      f.position.set(0.045, 0.028, -half * 0.97 - (game.boosting ? 0.03 + i * 0.035 : 0.015)).applyMatrix4(root.matrixWorld);
      const sz = (game.boosting ? (i ? 0.09 : 0.06) : 0.05) * flick;
      f.scale.set(sz, sz, 1);
      f.material.color.set(game.boosting ? (i ? 0x6fa8ff : 0xcfe4ff) : 0xffa040);
      f.material.opacity = game.boosting ? (i ? 0.75 : 1) : 0.9;
    });
    // age, drift, swell and fade; billboards facing the camera
    for (const pool of [tyre, exh]) {
      let n = 0;
      for (const pf of pool.puffs) {
        if (pf.age >= pf.life) continue;
        pf.age += dt; if (pf.age >= pf.life) continue;
        const k = pf.age / pf.life;
        pf.p.addScaledVector(pf.v, dt);
        const size = pf.size + (pf.end - pf.size) * k;
        pool.mesh.setMatrixAt(n, tmp.m.compose(pf.p, camera.quaternion, tmp.s.set(size, size, size)));
        pool.fade.setX(n, pf.alpha * Math.sin(Math.PI * Math.min(1, k * 1.6 + 0.05)) * (1 - k));
        n++;
      }
      pool.mesh.count = n;
      if (n) { pool.mesh.instanceMatrix.needsUpdate = true; pool.fade.needsUpdate = true; }
    }
  });

  return <primitive object={group} />;
}
