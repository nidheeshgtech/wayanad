"use client";
import { use, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, CatmullRomCurve3, Group, Mesh, Vector3 } from "three";
import { bendTs, height, roadShapeAt } from "@/lib/terrain";
import { loadVehicle } from "@/lib/vehicleAssets";
import { game } from "@/lib/game";

/* Bonnet macaques at a few of the nine hairpins, where they sit on the barriers and walls of the churam watching the
 * traffic. A troop of two to four at five bends; they turn to look at whatever comes near, breathe, shuffle along now
 * and then, and hop back from a car that passes close. Model: "Realsitic Monkey" (CC BY, Sketchfab — see
 * public/models/traffic/ATTRIBUTION.md), 45 cm tall. Units of 10 m. */
const TROOPS = [1, 3, 4, 6, 8];     // which hairpins (0-based)
const SIZE = 0.045;                 // sitting height
const LOOK = { near: 5, rate: 2.2 }; // turn to look at anything within 50 m, this fast (rad/s)

type Monkey = { root: Group; base: Vector3; along: Vector3; out: Vector3; yaw: number; look: number; next: number; hop: number; from: Vector3; to: Vector3; phase: number };

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

export default function Monkeys({ curve }: { curve: CatmullRomCurve3 }) {
  const source = use(loadVehicle("/models/wildlife/macaque.glb", { merged: true }));
  const { group, monkeys } = useMemo(() => {
    const group = new Group(); group.name = "monkeys";
    const box = new Box3().setFromObject(source), size = box.getSize(new Vector3()), k = SIZE / size.y, c = box.getCenter(new Vector3());
    const L = curve.getLength(), r = rng(4711), monkeys: Monkey[] = [], bends = bendTs();
    for (const b of TROOPS) {
      const t = bends[b]; if (t === undefined) continue;
      const s0 = t * L + (r() - 0.5) * 1.2, tan = curve.getTangentAt(s0 / L), ahead = curve.getTangentAt(Math.min(1, (s0 + 1) / L));
      // the outer edge of the bend (away from the way it turns) is where the barrier runs above the drop
      const turnsLeft = tan.x * ahead.z - tan.z * ahead.x < 0, outer = turnsLeft ? -1 : 1, widen = roadShapeAt(s0 / L).widen;
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const s = s0 + (i - n / 2) * (0.06 + r() * 0.08), p = curve.getPointAt(Math.min(0.999, s / L)), tn = curve.getTangentAt(Math.min(0.999, s / L));
        const lft = new Vector3(tn.z, 0, -tn.x).normalize(), side = i === n - 1 && r() < 0.5 ? -outer : outer; // one sometimes by the rock
        const out = lft.clone().multiplyScalar(side), d = 0.4 + widen * 0.5 + 0.035 + r() * 0.04;
        const x = p.x + out.x * d, z = p.z + out.z * d, base = new Vector3(x, height(x, z), z);
        const m = source.clone(true), root = new Group(); m.scale.setScalar(k * (0.8 + r() * 0.35)); m.position.set(-c.x * k, -box.min.y * k, -c.z * k);
        m.traverse((o) => { if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        root.add(m); root.position.copy(base); group.add(root);
        const yaw = Math.atan2(-out.x, -out.z) + (r() - 0.5) * 1.4; // mostly facing the road
        root.rotation.y = yaw;
        monkeys.push({ root, base, along: tn.clone().setY(0).normalize(), out, yaw, look: yaw, next: 4 + r() * 10, hop: 1, from: base.clone(), to: base.clone(), phase: r() * 10 });
      }
    }
    if (typeof window !== "undefined") (window as unknown as { __wayanadMonkeys?: unknown }).__wayanadMonkeys = monkeys.map((m) => ({ at: m.base.toArray(), out: m.out.toArray() }));
    return { group, monkeys };
  }, [curve, source]);

  useFrame(({ camera }, dt) => {
    if (game.paused) return;
    dt = Math.min(dt, 0.1);
    for (const m of monkeys) {
      const d = camera.position.distanceTo(m.root.position);
      m.root.visible = d < 25;
      if (!m.root.visible) continue;
      m.phase += dt;
      // look at whatever comes near (the camera stands in for the car going by)
      const want = d < LOOK.near ? Math.atan2(camera.position.x - m.root.position.x, camera.position.z - m.root.position.z) : m.yaw;
      const turn = Math.atan2(Math.sin(want - m.look), Math.cos(want - m.look));
      m.look += Math.max(-LOOK.rate * dt, Math.min(LOOK.rate * dt, turn));
      m.root.rotation.y = m.look;
      // now and then a shuffle along the edge; a quick hop back from anything passing very close
      m.next -= dt;
      if (m.hop >= 1 && (m.next <= 0 || d < 0.7)) {
        m.from.copy(m.root.position);
        const step = d < 0.7 ? m.out.clone().multiplyScalar(0.05) : m.along.clone().multiplyScalar((Math.random() - 0.5) * 0.08);
        m.to.copy(m.base).add(step).setY(0); m.to.y = height(m.to.x, m.to.z);
        m.hop = 0; m.next = 6 + Math.random() * 12;
      }
      if (m.hop < 1) {
        m.hop = Math.min(1, m.hop + dt / 0.35);
        m.root.position.lerpVectors(m.from, m.to, m.hop); m.root.position.y += Math.sin(m.hop * Math.PI) * 0.012;
        if (m.hop >= 1 && d >= 0.7) m.base.lerp(m.to, 0.5);
      }
      // breathing
      const b = 1 + Math.sin(m.phase * 2.4) * 0.012;
      m.root.scale.set(1, b, 1);
    }
  });
  return <primitive object={group} />;
}
