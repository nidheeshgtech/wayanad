"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh, Matrix4,
  MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3,
} from "three";
import { CAR, game } from "@/lib/game";
import { archT, bendTs, roadShapeAt } from "@/lib/terrain";
import { coin, score } from "@/lib/score";

/* Gold coins on the churam (lib/score): rows of five laid along the road up to the Lakkidi gate — most in your lane,
 * some in the oncoming one, some weaving across it — and one big coin on the inside of each hairpin, hard to reach.
 * They spin and glow; drive through one to pick it up. Each player has their own (nothing is shared in multiplayer).
 * Two instanced meshes (the coins and a soft halo behind each), so the whole lot is two draw calls. Units of 10 m. */
const COIN = { r: 0.032, thick: 0.007, hover: 0.07 };
const BIG = { r: 0.06, hover: 0.1 };
const ROW = { n: 5, gap: 0.32, every: [14, 24] as const, clearOfBends: 6 };
const PICK = 0.3; // s the pick-up takes (rises, spins, shrinks)
const SPIN = 2.6; // rad/s

type Coin = { s: number; lat: number; big: boolean; at: Vector3; phase: number; taken: number };

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

/** A soft round glow (the halo behind each coin). */
function haloTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,214,120,0.9)"); r.addColorStop(0.35, "rgba(255,190,80,0.35)"); r.addColorStop(1, "rgba(255,180,60,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export default function Coins({ curve }: { curve: CatmullRomCurve3 }) {
  const { group, coins, body, halo } = useMemo(() => {
    const L = curve.getLength(), end = archT() * L - 8, bends = bendTs().map((t) => t * L), r = rng(9173), coins: Coin[] = [];
    const place = (s: number, lat: number, big: boolean) => {
      const t = Math.min(0.999, s / L), p = curve.getPointAt(t), tan = curve.getTangentAt(t), left = new Vector3(tan.z, 0, -tan.x).normalize();
      p.addScaledVector(left, lat); p.y += -0.588 + (big ? BIG.hover : COIN.hover);
      coins.push({ s, lat, big, at: p, phase: r() * Math.PI * 2, taken: -1 });
    };
    // rows: own lane, the oncoming lane, or weaving from one to the other
    for (let s = 10; s < end; s += ROW.every[0] + r() * (ROW.every[1] - ROW.every[0])) {
      if (bends.some((b) => Math.abs(b - s) < ROW.clearOfBends)) continue;
      const kind = r(), first = s;
      for (let i = 0; i < ROW.n; i++) {
        const lat = kind < 0.6 ? 0.2 : kind < 0.85 ? -0.2 : 0.2 * Math.cos((i / (ROW.n - 1)) * Math.PI);
        place(first + i * ROW.gap, lat, false);
      }
    }
    // the hairpins: one big coin on the inside of each, out where the road widens round the bend
    for (const b of bends) {
      if (b > end) continue;
      const tan = curve.getTangentAt(Math.min(0.999, b / L)), ahead = curve.getTangentAt(Math.min(0.999, (b + 1) / L));
      const turnsLeft = tan.x * ahead.z - tan.z * ahead.x < 0, widen = roadShapeAt(b / L).widen;
      place(b, (turnsLeft ? 1 : -1) * (0.26 + widen * 0.7), true);
    }

    if (typeof window !== "undefined") (window as unknown as { __wayanadCoins?: unknown }).__wayanadCoins = coins; // for testing: where they are
    const gold = new MeshStandardMaterial({ color: new Color(0xf2b632), metalness: 0.85, roughness: 0.28, emissive: new Color(0xc4840f), emissiveIntensity: 0.6 });
    const geo = new CylinderGeometry(1, 1, 1, 28); geo.rotateX(Math.PI / 2); // face toward +z; spun about y
    const body = new InstancedMesh(geo, gold, coins.length); body.instanceMatrix.setUsage(DynamicDrawUsage); body.frustumCulled = false;
    const glow = new MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.85 });
    const halo = new InstancedMesh(new PlaneGeometry(1, 1), glow, coins.length); halo.instanceMatrix.setUsage(DynamicDrawUsage); halo.frustumCulled = false;
    const group = new Group(); group.name = "coins"; group.add(halo, body);
    return { group, coins, body, halo };
  }, [curve]);

  // a new climb (Start, Restart): every coin back on the road
  const run = useRef(-1);
  useEffect(() => () => { body.geometry.dispose(); halo.geometry.dispose(); }, [body, halo]);

  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3(), p: new Vector3(), y: new Vector3(0, 1, 0) }), []);
  useFrame(({ camera, clock }) => {
    if (run.current !== score.run) { run.current = score.run; for (const c of coins) c.taken = -1; }
    const now = clock.elapsedTime, live = game.started && game.phase === "drive" && !game.paused && game.leg === 0;
    const { m, q, s, p, y } = tmp;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i], r = c.big ? BIG.r : COIN.r;
      // picked up as the car's body passes through it
      if (live && c.taken < 0 && Math.abs(c.s - game.s) < CAR.halfL + r && Math.abs(c.lat - game.lat) < CAR.halfW + r) { c.taken = now; coin(c.big); }
      const k = c.taken < 0 ? 1 : Math.max(0, 1 - (now - c.taken) / PICK);
      const spin = (game.paused ? 0 : now) * SPIN * (c.taken < 0 ? 1 : 4) + c.phase, bob = c.taken < 0 ? Math.sin(now * 2 + c.phase) * 0.006 : (1 - k) * 0.12;
      p.copy(c.at); p.y += bob;
      q.setFromAxisAngle(y, spin); s.set(r * k, r * k, (c.big ? 0.012 : COIN.thick) * k);
      body.setMatrixAt(i, m.compose(p, q, s));
      s.setScalar(r * 4.2 * k); halo.setMatrixAt(i, m.compose(p, camera.quaternion, s));
    }
    body.instanceMatrix.needsUpdate = true; halo.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={group} />;
}
