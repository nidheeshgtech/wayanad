"use client";
import { timed, frameTimed } from "@/lib/perf";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry, CatmullRomCurve3, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4,
  MeshStandardMaterial, Quaternion, SphereGeometry, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SECTION, archT, bendTs, height, placesT, roadShapeAt } from "@/lib/terrain";
import { inTown, townPlan } from "./Town";
import { weather } from "@/lib/weather";
import { game } from "@/lib/game";

/* People on foot along the road: mostly in and around the towns (Lakkidi, Vythiri, Chundale, Kalpetta…), a sparse few on
 * the churam (never at a hairpin). They walk slowly up and down a stretch of shoulder, between the asphalt and the
 * barrier posts (on the churam mostly on the uphill side, away from the drop), alone or in pairs; some stand, as at a
 * bus stop. Men in white or kasavu mundu or a coloured lungi and shirt, women in saree or churidar; about half carry a
 * black umbrella and open it in the rain.
 * Built in code: a handful of stylised parts per person (skirt, torso, head, hair, two arms, umbrella), each part one
 * InstancedMesh with per-instance colour, so ~6 draw calls for everyone. Each frame only the people within VIEW are
 * written (matrices and colours packed to the front, `count` set), with a walk: a little bob, arms swinging.
 * True scale: a person ~1.7 m (0.17 units). Units of 10 m. */
const COUNT = { full: 120, small: 60 };
const VIEW = { full: 25, small: 15 };              // drawn within this many units of the camera
const LANE: [number, number] = [SECTION.half + 0.07, SECTION.half + 0.13]; // walking line from the centre (posts stand at +0.18)
const WALK = { speed: [0.1, 0.14] as [number, number], range: [2, 7] as [number, number] }; // units/s (1–1.4 m/s); half the stretch walked
const TOWN_SHARE = 0.75, PAIR = 0.35, STAND = 0.15, UMBRELLA = 0.5;

const SKIN = [0x8d5a3b, 0x7a4a2e, 0x9c6845, 0x6a3f27, 0xa87452].map((c) => new Color(c));
const HAIR = new Color(0x141110);
const MUNDU = [0xf1eee4, 0xf1eee4, 0xe8dcbc, 0x3a5a8a, 0x7a2e2e, 0x2f5a3a, 0x5a4a6a].map((c) => new Color(c));
const SHIRT = [0xf3f1ea, 0x9db8d6, 0xe5dcc5, 0x8a8f96, 0x7c3b3b, 0x5f7f9a, 0xc9b98f].map((c) => new Color(c));
const SAREE = [0xb03a5b, 0xc9772f, 0x2f6fa8, 0x6b8f3a, 0x8e3b8e, 0xd4b24a, 0xeadfc0, 0x2f8f8a, 0xa8323a].map((c) => new Color(c));
const UMBRELLA_COLOR = [0x151515, 0x151515, 0x151515, 0x1d2a4a, 0x4a1d24].map((c) => new Color(c));

type Person = {
  s: number; from: number; to: number; dir: 1 | -1; speed: number; side: 1 | -1; lane: number; scale: number;
  phase: number; umbrella: boolean; skin: Color; lower: Color; upper: Color; brolly: Color; woman: boolean; stand: boolean; yaw: number;
};

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];

export default function Pedestrians({ curve, small }: { curve: CatmullRomCurve3; small: boolean }) {
  const built = useMemo(() => timed("pedestrians", () => {
    const L = curve.getLength(), r = rng(1979), up = new Vector3(0, 1, 0), plan = townPlan(curve);
    const gate = archT() * L, bends = bendTs().map((t) => t * L), towns = [gate + 3, ...placesT().map((p) => p.t * L)];
    const frame = (s: number) => {
      const t = Math.min(0.999, Math.max(0.001, s / L)), p = curve.getPointAt(t), tan = curve.getTangentAt(t).setY(0).normalize();
      return { t, p, tan, left: new Vector3().crossVectors(up, tan).normalize() };
    };
    // a spot on the shoulder: on the ground beside the road (not down the drop, not up the bank, not in a building)
    const foot = (s: number, side: 1 | -1, lane: number) => {
      const { t, p, left } = frame(s), d = lane + roadShapeAt(t).widen;
      const x = p.x + left.x * side * d, z = p.z + left.z * side * d;
      return { x, z, y: height(x, z), road: p.y - 0.6, left };
    };
    const ok = (s: number, side: 1 | -1, lane: number) => {
      if (s < 2 || s > L - 2) return false;
      const t = s / L;
      if (roadShapeAt(t).widen > 0.04) return false; // round a hairpin: no room, and no one stands there
      const f = foot(s, side, lane), beyond = foot(s, side, lane + 0.08);
      if (Math.abs(f.y - f.road) > 0.05 || Math.abs(beyond.y - f.y) > 0.06) return false;
      return !inTown(f.x, f.z, plan);
    };
    const people: Person[] = [], total = small ? COUNT.small : COUNT.full;
    for (let tries = 0; people.length < total && tries < total * 30; tries++) {
      // where: around a town (spread over a few hundred metres), or anywhere on the churam away from the bends
      let s: number;
      if (r() < TOWN_SHARE) s = pick(r, towns) + (r() + r() + r() - 1.5) * 16;
      else { s = 4 + r() * (gate - 8); if (bends.some((b) => Math.abs(b - s) < 3)) continue; }
      const onChuram = s < gate;
      let side: 1 | -1 = r() < 0.5 ? 1 : -1;
      if (onChuram) {
        // the uphill side, away from the barrier and the drop (mostly)
        const a = foot(s, 1, 1.0), b = foot(s, -1, 1.0), uphill = a.y - a.road > b.y - b.road ? 1 : -1;
        side = r() < 0.85 ? uphill : (-uphill as 1 | -1);
      }
      const lane = LANE[0] + r() * (LANE[1] - LANE[0]);
      if (!ok(s, side, lane)) continue;
      // the stretch they walk: as far as the shoulder stays good either way, up to the range
      const want = WALK.range[0] + r() * (WALK.range[1] - WALK.range[0]);
      let from = s, to = s;
      while (from > s - want && ok(from - 0.4, side, lane)) from -= 0.4;
      while (to < s + want && ok(to + 0.4, side, lane)) to += 0.4;
      const stand = r() < STAND || to - from < 1;
      const pair = !stand && r() < PAIR && people.length + 1 < total;
      for (let k = 0; k < (pair ? 2 : 1); k++) {
        const woman = r() < 0.45, dir: 1 | -1 = r() < 0.5 ? 1 : -1;
        const sareeColor = pick(r, SAREE);
        people.push({
          s, from, to, dir, speed: WALK.speed[0] + r() * (WALK.speed[1] - WALK.speed[0]),
          side, lane: lane + (k ? 0.055 * (lane < (LANE[0] + LANE[1]) / 2 ? 1 : -1) : 0), scale: (woman ? 0.92 : 1) * (0.94 + r() * 0.12),
          phase: r() * 10, umbrella: r() < UMBRELLA, skin: pick(r, SKIN), woman, stand,
          lower: woman ? sareeColor : pick(r, MUNDU), upper: woman ? (r() < 0.6 ? sareeColor.clone().multiplyScalar(0.8) : pick(r, SAREE)) : pick(r, SHIRT),
          brolly: pick(r, UMBRELLA_COLOR), yaw: 0,
        });
      }
      // a pair walks together: same way, same pace, side by side
      if (pair) { const [a, b] = people.slice(-2); b.dir = a.dir; b.speed = a.speed; b.s = a.s; }
      // standing people face the road
      if (stand) { const p = people[people.length - 1], { left } = foot(s, side, lane); p.speed = 0; p.yaw = Math.atan2(-left.x * side, -left.z * side); }
    }

    if (process.env.NODE_ENV !== "production") (globalThis as { __peds?: unknown }).__peds = people;
    if (process.env.NODE_ENV !== "production") console.info("[pedestrians]", JSON.stringify({ placed: people.length, towns: people.filter((p) => p.s >= gate).length }));
    // parts, built at the person's feet (y up, facing +z), scaled per person
    const skirt = new CylinderGeometry(0.022, 0.029, 0.085, 8).translate(0, 0.0425, 0);
    const torso = new CylinderGeometry(0.024, 0.021, 0.06, 8).translate(0, 0.115, 0);
    const head = new SphereGeometry(0.0115, 10, 8).translate(0, 0.157, 0);
    const hair = new SphereGeometry(0.0123, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.159, -0.002);
    const arm = new CylinderGeometry(0.0065, 0.0055, 0.058, 6).translate(0, -0.029, 0); // pivot at the shoulder
    const brolly = mergeGeometries([
      new ConeGeometry(0.055, 0.022, 10, 1, true).translate(0, 0.011, 0),
      new CylinderGeometry(0.0018, 0.0018, 0.075, 4).translate(0, -0.03, 0),
    ]) as BufferGeometry;
    const mat = (rough = 0.85) => new MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: 0 });
    const n = people.length, group = new Group(); group.name = "pedestrians";
    const make = (g: BufferGeometry, count: number, m: MeshStandardMaterial, shadow: boolean) => {
      const mesh = new InstancedMesh(g, m, count);
      mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = shadow && !small; mesh.receiveShadow = true;
      mesh.setColorAt(0, new Color()); group.add(mesh); return mesh;
    };
    const umbrellaMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: DoubleSide });
    const parts = {
      skirt: make(skirt, n, mat(), true), torso: make(torso, n, mat(), true), head: make(head, n, mat(0.7), false),
      hair: make(hair, n, mat(0.6), false), arms: make(arm, n * 2, mat(), false), brolly: make(brolly, n, umbrellaMat, true),
    };
    return { group, people, parts, frame };
  }), [curve, small]);

  const tmp = useMemo(() => ({
    base: new Matrix4(), m: new Matrix4(), local: new Matrix4(), q: new Quaternion(), pos: new Vector3(), sc: new Vector3(), up: new Vector3(0, 1, 0),
    shoulder: new Vector3(), open: 0,
  }), []);

  useFrame(({ camera }, dt) => frameTimed("pedestrians", () => {
    const { people, parts, frame } = built, T = tmp, view = small ? VIEW.small : VIEW.full;
    dt = game.paused ? 0 : Math.min(dt, 0.1);
    // umbrellas open together as the rain sets in, and close after it
    T.open += ((weather.rain > 0.2 ? 1 : 0) - T.open) * Math.min(1, dt * 1.5);
    let i = 0, b = 0;
    for (const p of people) {
      // walk the stretch, turning round at either end
      if (p.speed > 0 && dt > 0) {
        p.s += p.dir * p.speed * dt; p.phase += p.speed * dt * 62;
        if (p.s > p.to) { p.s = p.to; p.dir = -1; } else if (p.s < p.from) { p.s = p.from; p.dir = 1; }
      } else p.phase += dt * 0.6;
      const { t, p: c, tan, left } = frame(p.s);
      const d = p.lane + roadShapeAt(t).widen, x = c.x + left.x * p.side * d, z = c.z + left.z * p.side * d;
      if ((x - camera.position.x) ** 2 + (z - camera.position.z) ** 2 > view * view) continue;
      const walking = p.speed > 0, step = Math.sin(p.phase);
      const yaw = walking ? Math.atan2(tan.x * p.dir, tan.z * p.dir) : p.yaw;
      T.pos.set(x, height(x, z) + (walking ? Math.abs(step) * 0.0025 : 0), z);
      T.q.setFromAxisAngle(T.up, yaw);
      T.base.compose(T.pos, T.q, T.sc.setScalar(p.scale));
      for (const part of [parts.skirt, parts.torso, parts.head, parts.hair]) part.setMatrixAt(i, T.base);
      parts.skirt.setColorAt(i, p.lower); parts.torso.setColorAt(i, p.upper); parts.head.setColorAt(i, p.skin); parts.hair.setColorAt(i, HAIR);
      // arms swing opposite to each other while walking; holding an open umbrella, the right one comes up to the chest
      const holding = p.umbrella && T.open > 0.05;
      for (const s of [-1, 1]) {
        const swing = walking ? step * 0.45 * s : Math.sin(p.phase) * 0.04;
        const angle = holding && s === 1 ? -1.25 * T.open + swing * (1 - T.open) : swing;
        T.local.makeRotationX(angle).setPosition(T.shoulder.set(0.028 * s, 0.142, 0));
        parts.arms.setMatrixAt(i * 2 + (s + 1) / 2, T.m.multiplyMatrices(T.base, T.local));
        parts.arms.setColorAt(i * 2 + (s + 1) / 2, p.woman ? p.skin : p.upper); // blouse sleeves are short
      }
      if (holding) {
        T.local.makeScale(T.open, T.open, T.open).setPosition(T.shoulder.set(0.012, 0.2, 0.018));
        parts.brolly.setMatrixAt(b, T.m.multiplyMatrices(T.base, T.local)); parts.brolly.setColorAt(b, p.brolly); b++;
      }
      i++;
    }
    for (const part of [parts.skirt, parts.torso, parts.head, parts.hair]) part.count = i;
    parts.arms.count = i * 2; parts.brolly.count = b;
    for (const part of Object.values(parts)) {
      if (!part.count) continue;
      part.instanceMatrix.needsUpdate = true;
      if (part.instanceColor) part.instanceColor.needsUpdate = true;
    }
  }));

  return <primitive object={built.group} />;
}
