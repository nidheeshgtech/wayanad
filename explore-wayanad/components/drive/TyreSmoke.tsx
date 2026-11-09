"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CanvasTexture, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, Object3D, PlaneGeometry, Quaternion, ShaderMaterial, Vector3,
} from "three";
import { CAR, game } from "@/lib/game";
import { bonus } from "@/lib/score";

/* Tyre smoke and drifting. When the car slides at the edge of its grip in a bend (lib/carPhysics: sideways near
 * CAR.grip), or brakes hard at speed, the rear tyres smoke: soft grey puffs that swell, rise and fade. Hold a clean
 * slide (no barrier) and it pays: "🔥 Drift!" with points for how long it lasted. One pool of billboards, one draw call
 * (a small shader fades each puff). Units of 10 m. */
const POOL = 56, RATE = 46; // puffs, and puffs a second per tyre at full smoke
const PUFF = { life: [0.7, 1.3] as const, size: [0.05, 0.16] as const, rise: 0.06 };
const DRIFT = { from: 0.82, min: 0.7, perSec: 40, max: 120 }; // slide at this share of grip; at least this long (s); points

type Puff = { p: Vector3; v: Vector3; age: number; life: number; size: number };

function puffTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,0.9)"); r.addColorStop(0.5, "rgba(255,255,255,0.35)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export default function TyreSmoke() {
  const { mesh, fade, puffs } = useMemo(() => {
    const geo = new PlaneGeometry(1, 1), fade = new InstancedBufferAttribute(new Float32Array(POOL), 1);
    geo.setAttribute("aFade", fade);
    const mat = new ShaderMaterial({
      uniforms: { map: { value: puffTexture() } },
      vertexShader: /* glsl */ `attribute float aFade; varying vec2 vUv; varying float vFade;
        void main() { vUv = uv; vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform sampler2D map; varying vec2 vUv; varying float vFade;
        void main() { float a = texture2D(map, vUv).a * vFade; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.86, 0.87, 0.86), a); }`,
      transparent: true, depthWrite: false, side: DoubleSide,
    });
    const mesh = new InstancedMesh(geo, mat, POOL); mesh.frustumCulled = false; mesh.count = 0; mesh.name = "tyre-smoke";
    const puffs: Puff[] = Array.from({ length: POOL }, () => ({ p: new Vector3(), v: new Vector3(), age: 1, life: 1, size: 0.1 }));
    return { mesh, fade, puffs };
  }, []);
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
      if (S.clean && S.slide >= DRIFT.min && game.leg === 0) bonus(Math.min(DRIFT.max, Math.round(S.slide * DRIFT.perSec / 5) * 5), "🔥 Drift!");
      S.slide = 0; S.clean = true;
    }
    // new puffs from both rear tyres
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
        pf.size = PUFF.size[0] * (0.7 + 0.6 * smoke);
      }
    } else S.owed = 0;
    // age, drift, swell and fade; billboards facing the camera
    let n = 0;
    for (const pf of puffs) {
      if (pf.age >= pf.life) continue;
      pf.age += dt; if (pf.age >= pf.life) continue;
      const k = pf.age / pf.life;
      pf.p.addScaledVector(pf.v, dt);
      const size = pf.size + (PUFF.size[1] - pf.size) * k;
      mesh.setMatrixAt(n, tmp.m.compose(pf.p, camera.quaternion, tmp.s.set(size, size, size)));
      fade.setX(n, 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.6 + 0.05)) * (1 - k));
      n++;
    }
    mesh.count = n;
    if (n) { mesh.instanceMatrix.needsUpdate = true; fade.needsUpdate = true; }
  });

  return <primitive object={mesh} />;
}
