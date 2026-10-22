"use client";
import { timed } from "@/lib/perf";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, CircleGeometry, DataTexture, DoubleSide, Group, Mesh,
  MeshStandardMaterial, Points, PointsMaterial, Vector3, type WebGLProgramParametersWithUniforms,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SECTION, height, roadDistance, roadShapeAt } from "@/lib/terrain";
import { weather } from "@/lib/weather";
import { game } from "@/lib/game";
import { waterSound } from "@/lib/water";

/* Monsoon waterfalls: streams pouring down the rock cuts beside the road (small trickles on low cuts, wider falls down
 * the tall faces) and big white falls off the far cliffs, spread along the climb and on across the plateau to Kalpetta.
 * Each has wet dark rock and a band of moss around it, a foam pool where it lands and spray and mist rising from it.
 * They run thinner in dry weather and full and white in and after rain (weather.wet). Everything is merged into one
 * mesh per material (7 draw calls for all of them). Units of 10 m. */
const ROADSIDE = { count: 14, spacing: 70, minFace: 0.35, probe: [SECTION.drain + 0.1, SECTION.drain + 3] as [number, number] };
const DISTANT = { count: 6, from: 9, to: 20, steps: 16 };

/** Value noise and the falling-water look, added to a standard material (so it's lit and fogged like everything else). */
const WATER_GLSL = /* glsl */ `
  uniform float uTime, uFlow;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
`;
const water = (time: { value: number }, flow: { value: number }, speed: number) => (shader: WebGLProgramParametersWithUniforms) => {
  shader.uniforms.uTime = time; shader.uniforms.uFlow = flow;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${WATER_GLSL}`)
    .replace("#include <map_fragment>", `
      // uv.x across the stream (0–1), uv.y along it in quarter units from the foot: the pattern keeps its size on any fall
      vec2 wuv = vMapUv;
      float across = min(wuv.x, 1.0 - wuv.x);
      // in dry weather only the middle of the stream runs
      float thin = mix(0.5, 1.0, uFlow);
      float edge = smoothstep(0.5 * (1.0 - thin), 0.5 * (1.0 - thin) + 0.28, across);
      // white water falling: broad slow streaks, fine fast ones, breaking up near the edges
      float s = vnoise(vec2(wuv.x * 6.0, wuv.y * 0.9 + uTime * ${speed.toFixed(2)})) * 0.55
              + vnoise(vec2(wuv.x * 17.0, wuv.y * 2.6 + uTime * ${(speed * 1.7).toFixed(2)})) * 0.3
              + vnoise(vec2(wuv.x * 41.0, wuv.y * 6.0 + uTime * ${(speed * 2.6).toFixed(2)})) * 0.15;
      float body = smoothstep(0.42, 0.78, s + across * 0.25);
      diffuseColor.rgb = mix(vec3(0.42, 0.5, 0.52), vec3(0.97, 0.98, 0.99), body);
      diffuseColor.a = edge * (0.18 + 0.8 * body) * mix(0.6, 1.0, uFlow);`);
};

/** A ribbon `width` wide over the ground along `path` (top first), `lift` above it; uv.y runs down to 0 at the
 * foot (uv.y = distance from the foot, in quarter units) so the water shader's streaks fall downhill. */
function drape(path: Vector3[], width: number, lift: number) {
  const n = path.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx: number[] = [], up = new Vector3(0, 1, 0);
  // distance from the foot, in quarter units (2.5 m), along the path: uv.y
  const along_ = new Float32Array(n);
  for (let i = n - 2; i >= 0; i--) along_[i] = along_[i + 1] + path[i].distanceTo(path[i + 1]) * 4;
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], along = new Vector3().subVectors(b, a).normalize();
    const side = new Vector3().crossVectors(up, along).setY(0).normalize().multiplyScalar(width / 2), p = path[i];
    // narrower near the top, where the stream gathers; a little wider where it spreads at the foot
    const w = 0.55 + 0.45 * Math.min(1, (i / (n - 1)) * 2.5);
    pos.set([p.x - side.x * w, height(p.x - side.x * w, p.z - side.z * w) + lift, p.z - side.z * w, p.x + side.x * w, height(p.x + side.x * w, p.z + side.z * w) + lift, p.z + side.z * w], i * 6);
    uv.set([0, along_[i], 1, along_[i]], i * 4);
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3)); g.setAttribute("uv", new BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A soft round spray sprite. */
function sprayTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, "rgba(255,255,255,0.85)"); r.addColorStop(0.5, "rgba(240,244,246,0.35)"); r.addColorStop(1, "rgba(240,244,246,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** A stream: a path over the ground from where it starts to where it lands (top to bottom), its width, and which way
 * its foot faces (out from the slope, for the spray). */
type Fall = { path: Vector3[]; top: Vector3; bottom: Vector3; width: number; facing: Vector3; distant: boolean };

/** Points from a to b over the ground (straight in plan), `n` of them. */
function overGround(a: Vector3, b: Vector3, n: number) {
  return Array.from({ length: n }, (_, i) => { const f = i / (n - 1), x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f; return new Vector3(x, height(x, z), z); });
}

/** The rock faces beside the churam: where the uphill side stands as a face, its foot and lip (as Creepers.tsx). */
function roadsideFalls(curve: CatmullRomCurve3): Fall[] {
  const L = curve.getLength(), end = L - 10, found: (Fall & { s: number; h: number })[] = [];
  const side = new Vector3();
  for (let s = 20; s < end - 10; s += 0.5) {
    const t = s / L, pt = curve.getPointAt(t), tan = curve.getTangentAt(t), widen = roadShapeAt(t).widen;
    side.set(tan.z, 0, -tan.x).normalize();
    for (const dir of [1, -1]) {
      const out = side.clone().multiplyScalar(dir), bed = pt.y - 0.6;
      let foot = -1, lip = -1, prevY = height(pt.x + out.x * (ROADSIDE.probe[0] + widen), pt.z + out.z * (ROADSIDE.probe[0] + widen));
      for (let d = ROADSIDE.probe[0] + 0.1; d < ROADSIDE.probe[1]; d += 0.1) {
        const y = height(pt.x + out.x * (d + widen), pt.z + out.z * (d + widen)), rise = (y - prevY) / 0.1;
        if (rise > 1.4 && foot < 0) foot = d - 0.1;
        if (foot >= 0 && rise < 0.8) { lip = d; break; }
        prevY = y;
      }
      if (foot < 0 || lip < 0) continue;
      const lipAt = pt.clone().addScaledVector(out, lip + widen - 0.04), lipY = height(lipAt.x, lipAt.z), h = lipY - bed;
      if (h < ROADSIDE.minFace) continue;
      const footAt = pt.clone().addScaledVector(out, foot + widen + 0.02);
      const top = new Vector3(lipAt.x, lipY, lipAt.z), bottom = new Vector3(footAt.x, bed, footAt.z);
      // small trickles on low cuts (~1.5 m wide), up to ~6 m wide down the tallest faces
      found.push({ s, h, path: overGround(top, bottom, 28), top, bottom, width: 0.12 + Math.min(0.45, h * 0.12), facing: out.clone().negate(), distant: false });
    }
  }
  // the tallest faces, spread out along the climb
  const picked: typeof found = [];
  for (const f of found.sort((a, b) => b.h - a.h)) {
    if (picked.length >= ROADSIDE.count) break;
    if (picked.every((p) => Math.abs(p.s - f.s) > ROADSIDE.spacing)) picked.push(f);
  }
  return picked;
}

/** Thin falls on the far slopes: the steepest ground some way off the road, followed downhill. */
function distantFalls(curve: CatmullRomCurve3): Fall[] {
  const L = curve.getLength(), end = L - 10, out: Fall[] = [];
  const grad = (x: number, z: number) => new Vector3(height(x + 0.3, z) - height(x - 0.3, z), 0, height(x, z + 0.3) - height(x, z - 0.3)).divideScalar(0.6);
  const candidates: { at: Vector3; steep: number; s: number }[] = [];
  for (let s = 60; s < end - 30; s += 6) {
    const t = s / L, p = curve.getPointAt(t), tan = curve.getTangentAt(t), side = new Vector3(tan.z, 0, -tan.x).normalize();
    for (const dir of [1, -1]) for (let d = DISTANT.from; d <= DISTANT.to; d += 2) {
      const x = p.x + side.x * d * dir, z = p.z + side.z * d * dir;
      if (roadDistance(x, z) < DISTANT.from * 0.8) continue;
      const g = grad(x, z), steep = g.length();
      if (steep > 0.9) candidates.push({ at: new Vector3(x, height(x, z), z), steep, s });
    }
  }
  for (const c of candidates.sort((a, b) => b.steep - a.steep)) {
    if (out.length >= DISTANT.count) break;
    if (out.some((f) => f.top.distanceTo(c.at) < 40)) continue;
    // follow the slope down from here, in short steps
    const p = c.at.clone(), path = [c.at.clone()];
    for (let i = 0; i < DISTANT.steps * 4; i++) { const g = grad(p.x, p.z); if (g.length() < 0.35) break; p.addScaledVector(g.normalize(), -0.125); p.y = height(p.x, p.z); path.push(p.clone()); }
    if (c.at.y - p.y < 2) continue; // at least 20 m of drop
    const facing = new Vector3(c.at.x - p.x, 0, c.at.z - p.z).normalize().negate();
    // big falls off the high cliffs: wider the longer the drop (up to ~14 m), so they read through the trees from afar
    out.push({ path, top: c.at.clone(), bottom: p.clone(), width: 0.4 + Math.min(1.0, (c.at.y - p.y) * 0.12), facing, distant: true });
  }
  return out;
}

/** Foam where the water lands: churning white in the middle of a disc, breaking up toward its edge. */
const foam = (time: { value: number }, flow: { value: number }) => (shader: WebGLProgramParametersWithUniforms) => {
  shader.uniforms.uTime = time; shader.uniforms.uFlow = flow;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${WATER_GLSL}`)
    .replace("#include <map_fragment>", `
      vec2 q = vMapUv - 0.5; float r = length(q) * 2.0, a = atan(q.y, q.x);
      float n = vnoise(vec2(a * 3.0, r * 5.0 - uTime * 0.9)) * 0.6 + vnoise(vec2(a * 9.0 + 3.0, r * 14.0 - uTime * 1.7)) * 0.4;
      float body = smoothstep(0.35, 0.75, n + (1.0 - r) * 0.45);
      diffuseColor.rgb = mix(vec3(0.5, 0.58, 0.6), vec3(0.95, 0.97, 0.98), body);
      diffuseColor.a = (1.0 - smoothstep(0.55, 1.0, r)) * (0.25 + 0.6 * body) * mix(0.55, 1.0, uFlow);`);
};

export default function Waterfalls({ curve }: { curve: CatmullRomCurve3 }) {
  const built = useMemo(() => timed("waterfalls", () => {
    const time = { value: 0 }, flow = { value: 0.5 };
    const white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;
    const make = (speed: number) => {
      const m = new MeshStandardMaterial({ map: white, transparent: true, depthWrite: false, side: DoubleSide, roughness: 0.25, metalness: 0, emissive: 0x2a2e30 });
      m.onBeforeCompile = water(time, flow, speed); m.customProgramCacheKey = () => `waterfall-${speed}`;
      return m;
    };
    const near = make(2.2), far = make(1.2);
    const wet = new MeshStandardMaterial({ color: 0x14181a, roughness: 0.18, transparent: true, opacity: 0.55, depthWrite: false });
    const moss = new MeshStandardMaterial({ color: 0x24401f, roughness: 0.7, transparent: true, opacity: 0.45, depthWrite: false });
    const pool = new MeshStandardMaterial({ map: white, transparent: true, depthWrite: false, roughness: 0.3, metalness: 0 });
    pool.onBeforeCompile = foam(time, flow); pool.customProgramCacheKey = () => "waterfall-foam";
    const spray = new PointsMaterial({ map: sprayTexture(), size: 0.05, transparent: true, depthWrite: false, opacity: 0.35, blending: AdditiveBlending, color: 0xdfe6ea });
    const mist = new PointsMaterial({ map: sprayTexture(), size: 0.32, transparent: true, depthWrite: false, opacity: 0.1, color: 0xe6ecef });
    const group = new Group(); group.name = "waterfalls";
    const falls = [...roadsideFalls(curve), ...distantFalls(curve)];
    if (typeof window !== "undefined") (window as unknown as { __wayanadFalls?: unknown }).__wayanadFalls = falls.map((f) => ({ top: f.top.toArray(), bottom: f.bottom.toArray(), facing: f.facing.toArray(), distant: f.distant, width: f.width }));
    if (process.env.NODE_ENV !== "production") console.info("[waterfalls]", JSON.stringify(falls.map((f) => ({ s: (f as { s?: number }).s ?? null, drop: +(f.top.y - f.bottom.y).toFixed(2), width: +f.width.toFixed(2), distant: f.distant }))));
    const parts = { near: [] as BufferGeometry[], far: [] as BufferGeometry[], wet: [] as BufferGeometry[], moss: [] as BufferGeometry[], pool: [] as BufferGeometry[] };
    // spray (fine, bright, at every foot) and mist (big soft puffs, at the bigger falls): one Points each for all falls
    const sprayAt: { base: Vector3; k: number; from: number; n: number }[] = [], mistAt: typeof sprayAt = [];
    let sprayN = 0, mistN = 0;
    for (const f of falls) {
      const lift = f.distant ? 0.05 : 0.025;
      (f.distant ? parts.far : parts.near).push(drape(f.path, f.width, lift));
      parts.wet.push(drape(f.path, f.width * 2.4, lift - 0.01));
      parts.moss.push(drape(f.path, f.width * 4, lift - 0.018));
      const base = f.bottom.clone().addScaledVector(f.facing, f.width * 0.5);
      parts.pool.push(new CircleGeometry(f.width * 1.3, 20).rotateX(-Math.PI / 2).translate(base.x, height(base.x, base.z) + 0.012, base.z));
      const n = Math.round((f.distant ? 30 : 50) * (0.6 + f.width * 1.5));
      sprayAt.push({ base: f.bottom.clone().addScaledVector(f.facing, 0.05), k: 0.5 + f.width * 1.2, from: sprayN, n }); sprayN += n;
      if (f.width > 0.3) { const m = Math.round(6 + f.width * 14); mistAt.push({ base, k: 1 + f.width * 2, from: mistN, n: m }); mistN += m; }
    }
    const merged = (list: BufferGeometry[], material: MeshStandardMaterial, order: number) => {
      if (!list.length) return;
      const mesh = new Mesh(mergeGeometries(list), material); mesh.renderOrder = order; group.add(mesh);
      for (const g of list) g.dispose();
    };
    merged(parts.moss, moss, 0); merged(parts.wet, wet, 1); merged(parts.pool, pool, 1); merged(parts.near, near, 2); merged(parts.far, far, 2);
    const cloud = (count: number, material: PointsMaterial) => {
      const g = new BufferGeometry(); g.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
      const points = new Points(g, material); points.frustumCulled = false; points.renderOrder = 3; group.add(points);
      const seeds = new Float32Array(count * 3); for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
      return { points, seeds };
    };
    const sprays = { ...cloud(sprayN, spray), at: sprayAt }, mists = { ...cloud(mistN, mist), at: mistAt };
    return { group, time, flow, sprays, mists, falls };
  }), [curve]);

  useFrame(({ camera }, dt) => {
    if (game.paused) return;
    const { time, flow, sprays, mists, falls } = built;
    time.value += Math.min(dt, 0.1);
    flow.value += (0.6 + 0.4 * Math.max(weather.wet, weather.rain) - flow.value) * Math.min(1, dt * 0.2);
    const t = time.value;
    // spray: drops thrown up and out from the foot, falling back; mist: slow puffs rising and drifting off
    for (const [cloud, rise, drift, speed] of [[sprays, 1.1, 0.02, 0.25], [mists, 1.8, 0.08, 0.06]] as const) {
      const p = cloud.points.geometry.getAttribute("position") as BufferAttribute, sd = cloud.seeds;
      for (const at of cloud.at) {
        const k = (0.12 + flow.value * 0.18) * at.k;
        for (let i = at.from; i < at.from + at.n; i++) {
          const a = sd[i * 3], b = sd[i * 3 + 1], c = sd[i * 3 + 2], life = (t * (speed + c * speed * 1.2) + a) % 1;
          p.setXYZ(i, at.base.x + (b - 0.5) * k + Math.sin(a * 40 + t) * drift, at.base.y + life * k * rise, at.base.z + (c - 0.5) * k);
        }
      }
      p.needsUpdate = true;
    }
    // the sound of the nearest one, louder as you come close (only with the sound on: lib/water)
    let nearest = Infinity;
    for (const f of falls) if (!f.distant) nearest = Math.min(nearest, camera.position.distanceTo(f.bottom) / (0.6 + f.width));
    waterSound(nearest, flow.value);
  });
  return <primitive object={built.group} />;
}
