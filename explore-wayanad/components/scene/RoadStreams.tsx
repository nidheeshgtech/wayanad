"use client";
import { timed, frameTimed } from "@/lib/perf";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Mesh, MeshStandardMaterial, Points, PointsMaterial, Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { SECTION, height, roadShapeAt } from "@/lib/terrain";
import { inTown, townPlan } from "./Town";
import { weather } from "@/lib/weather";
import { game } from "@/lib/game";
import { lanePoint, trafficControl } from "@/lib/traffic";

/* Monsoon streams across the road: at a few cuttings a trickle comes down the bank, gathers in the drain on the uphill
 * side and spills across the asphalt in a shallow sheet, running off toward the downhill edge. Cars drive through it:
 * the player's tyres throw spray (and passing traffic, more lightly). Fuller and faster in rain, a thin film when dry.
 * All the water is one mesh with one material (sheet, pool and trickle told apart by an attribute); the spray is one
 * pooled Points cloud. Units of 10 m; the asphalt sits 0.588 below the curve (Road.tsx, lib/traffic lanePoint). */
const PLACE = { count: 4, spacing: 150, minFace: 0.25, step: 0.5, probe: [SECTION.drain + 0.1, SECTION.drain + 3] as [number, number] };
const SHEET = { length: 0.32, rows: 6, cols: 18, lift: 0.004 }; // 3.2 m of road under water
const POOL = { length: 0.7, rows: 6, cols: 4, lift: 0.006 };
const TRICKLE = { width: 0.07, steps: 16, lift: 0.02 };
const SPRAY = { pool: 260, life: [0.45, 0.8] as [number, number] };
const ROAD_Y = 0.588 - 0.004;

type Crossing = { s: number; side: 1 | -1; face: number };

/** Steep banks on the uphill side, away from hairpins and towns: the tallest few, at least `spacing` apart. */
function placeCrossings(curve: CatmullRomCurve3): Crossing[] {
  const L = curve.getLength(), plan = townPlan(curve), found: Crossing[] = [], side = new Vector3();
  for (let s = 40; s < L - 20; s += PLACE.step) {
    const t = s / L;
    if ([-2, 0, 2].some((d) => roadShapeAt(Math.min(1, Math.max(0, (s + d) / L))).widen > 0.02)) continue; // straight-ish only
    const pt = curve.getPointAt(t), tan = curve.getTangentAt(t);
    side.set(tan.z, 0, -tan.x).normalize();
    for (const dir of [1, -1] as const) {
      const ox = side.x * dir, oz = side.z * dir, bed = pt.y - 0.6;
      let foot = -1, lip = -1, prevY = height(pt.x + ox * PLACE.probe[0], pt.z + oz * PLACE.probe[0]);
      for (let d = PLACE.probe[0] + 0.1; d < PLACE.probe[1]; d += 0.1) {
        const y = height(pt.x + ox * d, pt.z + oz * d), rise = (y - prevY) / 0.1;
        if (rise > 1.4 && foot < 0) foot = d - 0.1;
        if (foot >= 0 && rise < 0.8) { lip = d; break; }
        prevY = y;
      }
      if (foot < 0 || lip < 0) continue;
      const face = height(pt.x + ox * lip, pt.z + oz * lip) - bed;
      if (face < PLACE.minFace || inTown(pt.x + ox * SECTION.drain, pt.z + oz * SECTION.drain, plan)) continue;
      found.push({ s, side: dir, face });
    }
  }
  const picked: Crossing[] = [];
  for (const c of found.sort((a, b) => b.face - a.face)) {
    if (picked.length >= PLACE.count) break;
    if (picked.every((p) => Math.abs(p.s - c.s) > PLACE.spacing)) picked.push(c);
  }
  return picked.sort((a, b) => a.s - b.s);
}

/** Flowing water on a standard material: streaks and ripples moving downstream (uv.y grows downstream, in metres),
 * a little foam, soft edges (aEdge), low roughness so it mirrors the sky. aKind: 0 sheet, 1 pool, 2 trickle. */
const WATER_GLSL = /* glsl */ `
  uniform float uTime, uFlow;
  varying vec2 vFlowUv; varying float vEdge, vKind;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
`;
function waterMaterial(time: { value: number }, flow: { value: number }) {
  const m = new MeshStandardMaterial({ color: 0x1c2629, roughness: 0.12, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, envMapIntensity: 0.8 });
  m.customProgramCacheKey = () => "road-streams-2";
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = time; shader.uniforms.uFlow = flow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aFlowUv;\nattribute float aEdge, aKind;\nvarying vec2 vFlowUv;\nvarying float vEdge, vKind;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlowUv = aFlowUv; vEdge = aEdge; vKind = aKind;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${WATER_GLSL}`)
      .replace("#include <map_fragment>", `
        // downstream speed: a trickle falls fast, the sheet runs off steadily, the pool barely moves
        float speed = (vKind > 1.5 ? 2.4 : vKind > 0.5 ? 0.25 : 0.9) * (0.6 + 0.6 * uFlow);
        vec2 q = vFlowUv * vec2(1.6, 1.0) - vec2(0.0, uTime * speed);
        float n = vnoise(q * vec2(1.0, 0.6)) * 0.55 + vnoise(q * 2.7 + 3.1) * 0.3 + vnoise(q * 7.3 + 8.7) * 0.15;
        // foam: where streaks bunch up, more in spate; the trickle is mostly white water
        float wFoam = smoothstep(0.62 - 0.12 * uFlow, 0.9, n) * (vKind > 1.5 ? 1.0 : 0.55) + (vKind > 1.5 ? 0.35 * uFlow : 0.0);
        // streaks: the water darkens and lightens along the flow, so it reads as moving water, not a flat sheen
        diffuseColor.rgb *= 0.7 + 0.6 * n;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.92), clamp(wFoam, 0.0, 1.0));
        // a thin film when dry, a fuller sheet in rain; broken up at its edges by the same noise
        float cover = smoothstep(0.0, 1.0, vEdge * (0.75 + 0.5 * n)) * (0.35 + 0.5 * uFlow);
        diffuseColor.a = clamp(cover + wFoam * 0.35 * vEdge, 0.0, 0.92);`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.1, 0.5, clamp(wFoam, 0.0, 1.0)) + (n - 0.5) * 0.12;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        // ripples: tilt the normal with the moving noise, so the sky's reflection shivers downstream
        vec2 rq = vFlowUv * 5.0 - vec2(0.0, uTime * speed * 2.0);
        normal = normalize(normal + vec3(vnoise(rq) - 0.5, vnoise(rq + 17.3) - 0.5, 0.0) * (0.45 + 0.35 * uFlow));`);
  };
  return m;
}

/** Collects quads into one geometry: position, aFlowUv (across, downstream; metres), aEdge (0–1), aKind. */
function builder() {
  const pos: number[] = [], flowUv: number[] = [], edge: number[] = [], kind: number[] = [], index: number[] = [];
  /** A grid of `rows` × `cols` vertices from `at(r, c)` (r, c in 0–1). */
  const grid = (rows: number, cols: number, k: number, at: (r: number, c: number) => { p: Vector3; uv: [number, number]; e: number }) => {
    const base = pos.length / 3;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const v = at(r / (rows - 1), c / (cols - 1));
      pos.push(v.p.x, v.p.y, v.p.z); flowUv.push(...v.uv); edge.push(v.e); kind.push(k);
      if (r && c) { const a = base + (r - 1) * cols + c - 1, b = a + 1, d = a + cols, e = d + 1; index.push(a, d, b, b, d, e); }
    }
  };
  const done = () => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("aFlowUv", new BufferAttribute(new Float32Array(flowUv), 2));
    g.setAttribute("aEdge", new BufferAttribute(new Float32Array(edge), 1));
    g.setAttribute("aKind", new BufferAttribute(new Float32Array(kind), 1));
    g.setIndex(index);
    g.computeVertexNormals();
    // the faces may wind either way across the road; the water's normal is up
    const n = g.getAttribute("normal") as BufferAttribute;
    for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    return g;
  };
  return { grid, done };
}

/** A soft round spray sprite. */
function sprayTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d")!, r = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  r.addColorStop(0, "rgba(255,255,255,0.9)"); r.addColorStop(0.5, "rgba(235,240,243,0.35)"); r.addColorStop(1, "rgba(235,240,243,0)");
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

export default function RoadStreams({ curve, small }: { curve: CatmullRomCurve3; small: boolean }) {
  const built = useMemo(() => timed("streams", () => {
    const L = curve.getLength(), crossings = placeCrossings(curve), b = builder(), up = new Vector3(0, 1, 0);
    if (typeof window !== "undefined") (window as unknown as { __wayanadStreams?: unknown }).__wayanadStreams = crossings.map((c) => ({ s: c.s, km: +(c.s / 100).toFixed(2), side: c.side, face: +c.face.toFixed(2) }));
    const frame = (s: number) => {
      const t = Math.min(1, Math.max(0, s / L)), p = curve.getPointAt(t), tan = curve.getTangentAt(t).setY(0).normalize();
      return { t, p, tan, left: new Vector3().crossVectors(up, tan).normalize() };
    };
    for (const c of crossings) {
      const s0 = c.s - SHEET.length / 2, widen = roadShapeAt(c.s / L).widen, half = SECTION.half + widen;
      // the sheet: from the drain's outer edge on the uphill side to the downhill shoulder, flowing across
      const from = SECTION.drain + widen, to = -(SECTION.shoulder + widen), span = from - to;
      b.grid(SHEET.rows, SHEET.cols, 0, (r, col) => {
        const { p, left } = frame(s0 + r * SHEET.length), d = (from - col * span) * c.side;
        const x = p.x + left.x * d, z = p.z + left.z * d, onRoad = Math.abs(d) <= half;
        const y = onRoad ? p.y - ROAD_Y : Math.max(height(x, z), p.y - 0.6 - 0.08) + SHEET.lift;
        // edges: soft along the road (the sheet's ends) and at the downhill rim, where it runs off into the verge
        const e = Math.min(1, Math.sin(Math.PI * r) * 1.6) * Math.min(1, (1 - col) * 4, 1);
        return { p: new Vector3(x, y, z), uv: [r * SHEET.length * 10, col * span * 10], e };
      });
      // the pool in the drain, a little longer than the sheet: where the trickle gathers
      const p0 = c.s - POOL.length / 2;
      b.grid(POOL.rows, POOL.cols, 1, (r, col) => {
        const { p, left } = frame(p0 + r * POOL.length), d = (half + 0.06 + col * (SECTION.drain - SECTION.half - 0.04)) * c.side;
        const x = p.x + left.x * d, z = p.z + left.z * d;
        const e = Math.min(1, Math.sin(Math.PI * r) * 2) * Math.min(1, Math.sin(Math.PI * Math.min(1, col * 0.9 + 0.05)) * 2);
        return { p: new Vector3(x, height(x, z) + POOL.lift, z), uv: [col * 2, r * POOL.length * 10], e };
      });
      // the trickle down the bank, from the lip of the cut to the drain
      const { p, left } = frame(c.s);
      const top = p.clone().addScaledVector(left, (SECTION.drain + widen + 0.25 + c.face * 0.45) * c.side);
      const foot = p.clone().addScaledVector(left, (SECTION.drain + widen - 0.02) * c.side);
      const side = new Vector3().copy(frame(c.s).tan).multiplyScalar(TRICKLE.width / 2);
      let down = 0;
      b.grid(TRICKLE.steps, 3, 2, (r, col) => {
        const x0 = top.x + (foot.x - top.x) * r, z0 = top.z + (foot.z - top.z) * r, w = (col - 0.5) * 2 * (0.6 + 0.4 * r);
        const x = x0 + side.x * w, z = z0 + side.z * w;
        if (col === 0 && r > 0) down += Math.hypot((foot.x - top.x) / (TRICKLE.steps - 1), (foot.z - top.z) / (TRICKLE.steps - 1)) * 10 * 1.6;
        return { p: new Vector3(x, height(x, z) + TRICKLE.lift, z), uv: [col, down], e: Math.min(1, (1 - Math.abs(col - 0.5) * 2) * 3) * Math.min(1, r * 6) };
      });
    }
    const time = { value: 0 }, flow = { value: 0.5 };
    const mesh = new Mesh(b.done(), waterMaterial(time, flow)); mesh.renderOrder = 2; mesh.name = "road-streams";
    // spray: a fixed pool of droplets, parked far below the world when not flying
    const n = small ? Math.round(SPRAY.pool * 0.6) : SPRAY.pool, positions = new Float32Array(n * 3).fill(-1e4);
    const geo = new BufferGeometry(); geo.setAttribute("position", new BufferAttribute(positions, 3));
    const spray = new Points(geo, new PointsMaterial({ map: sprayTexture(), size: 0.035, transparent: true, depthWrite: false, opacity: 0.55, color: 0xe2e8eb }));
    spray.frustumCulled = false; spray.renderOrder = 3;
    const drops = { vel: new Float32Array(n * 3), life: new Float32Array(n), next: 0, carry: 0, traffic: 0 };
    const zones = crossings.map((c) => ({ from: c.s - SHEET.length / 2 - 0.05, to: c.s + SHEET.length / 2 + 0.05 }));
    return { mesh, spray, positions, drops, zones, time, flow, frame };
  }), [curve, small]);

  const tmp = useMemo(() => ({ p: new Vector3(), o: new Vector3() }), []);
  useFrame(({ camera }, rawDt) => frameTimed("streams", () => {
    const { time, flow, positions, drops, zones, frame } = built;
    const dt = game.paused ? 0 : Math.min(rawDt, 0.1);
    time.value += dt;
    flow.value += (0.35 + 0.65 * Math.min(1, Math.max(weather.rain, weather.wet)) - flow.value) * Math.min(1, dt * 0.3);
    if (dt === 0) return;
    // a droplet from (x, y, z), thrown out with velocity (vx, vy, vz)
    const emit = (x: number, y: number, z: number, vx: number, vy: number, vz: number) => {
      const i = drops.next; drops.next = (drops.next + 1) % drops.life.length;
      positions.set([x, y, z], i * 3); drops.vel.set([vx, vy, vz], i * 3);
      drops.life[i] = SPRAY.life[0] + Math.random() * (SPRAY.life[1] - SPRAY.life[0]);
    };
    const wet = 0.6 + 0.8 * Math.min(1, weather.rain);
    // the player's tyres in the water: spray from all four, sideways and back, more the faster and wetter
    const speed = Math.abs(game.speed);
    if (game.active && speed > 0.1 && zones.some((z) => game.s > z.from && game.s < z.to)) {
      drops.carry += dt * speed * 260 * wet;
      const { p, tan, left } = frame(game.s);
      for (; drops.carry >= 1; drops.carry--) {
        const front = Math.random() < 0.5 ? 1 : -1, out = Math.random() < 0.5 ? 1 : -1;
        tmp.o.copy(p).addScaledVector(left, game.lat + out * 0.085).addScaledVector(tan, front * 0.12);
        const k = speed * (0.4 + Math.random() * 0.6);
        emit(tmp.o.x, tmp.o.y - ROAD_Y + 0.01, tmp.o.z,
          left.x * out * k * 0.5 - tan.x * Math.sign(game.speed) * k * 0.3, 0.25 + k * 0.5 * Math.random(), left.z * out * k * 0.5 - tan.z * Math.sign(game.speed) * k * 0.3);
      }
    }
    // passing traffic near the camera: a lighter splash at each vehicle's middle (a few vehicles at most)
    const fleet = trafficControl.curve === curve ? trafficControl.fleet : null;
    if (fleet) for (const z of zones) {
      if (frame(z.from).p.distanceToSquared(camera.position) > 30 * 30) continue;
      for (const v of fleet) {
        if (v.distance < z.from || v.distance > z.to || v.speed < 0.1) continue;
        drops.traffic += dt * v.speed * 90 * wet;
        if (drops.traffic < 1) continue;
        lanePoint(curve, v.distance, v.direction, (t) => roadShapeAt(t).widen, tmp.p);
        const t = tmp.p, { tan, left } = frame(v.distance);
        for (; drops.traffic >= 1; drops.traffic--) {
          const out = Math.random() < 0.5 ? 1 : -1, k = v.speed * (0.4 + Math.random() * 0.6);
          emit(t.x + left.x * out * 0.09, t.y + 0.01, t.z + left.z * out * 0.09, left.x * out * k * 0.45 - tan.x * v.direction * k * 0.25, 0.22 + k * 0.4 * Math.random(), left.z * out * k * 0.45 - tan.z * v.direction * k * 0.25);
        }
      }
    }
    // fly, fall, land (and park)
    for (let i = 0; i < drops.life.length; i++) {
      if (drops.life[i] <= 0) continue;
      drops.life[i] -= dt;
      if (drops.life[i] <= 0) { positions[i * 3 + 1] = -1e4; continue; }
      drops.vel[i * 3 + 1] -= 0.98 * dt; // gravity: 9.8 m/s² in units of 10 m
      positions[i * 3] += drops.vel[i * 3] * dt; positions[i * 3 + 1] += drops.vel[i * 3 + 1] * dt; positions[i * 3 + 2] += drops.vel[i * 3 + 2] * dt;
    }
    built.spray.geometry.getAttribute("position").needsUpdate = true;
  }));

  return <><primitive object={built.mesh} /><primitive object={built.spray} /></>;
}
