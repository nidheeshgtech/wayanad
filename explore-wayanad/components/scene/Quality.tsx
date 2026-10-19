"use client";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { InstancedMesh, Material, Mesh } from "three";

/* Quality steps, tried in order while the frame rate stays low. Each trades a little looks for speed:
 * render resolution, then forest density (fewer cards everywhere, never a gap), then shadows. */
const LEVELS = [
  { dpr: 2, forest: 1, shadows: true },
  { dpr: 1.5, forest: 1, shadows: true },
  { dpr: 1.25, forest: 0.75, shadows: true },
  { dpr: 1, forest: 0.6, shadows: false },
  { dpr: 0.85, forest: 0.45, shadows: false },
];
const WARMUP = 3; // s before measuring: shader compiles and first uploads are slow on every device
const WINDOW = 2; // s per measurement
const LOW_FPS = 40;

/**
 * Watches the frame rate and steps quality down when it stays low. Down only: stepping back up would flicker
 * between levels. `start` lets the lite tier begin lower. Vegetation meshes are found by name ("veg-*") and keep
 * their full count in userData.full, so thinning is just drawing fewer of the (randomly ordered) instances.
 */
export default function Quality({ start = 0 }: { start?: number }) {
  const { gl, scene, setDpr } = useThree();
  const level = useRef(start), clock = useRef({ t: -WARMUP, frames: 0 });

  const apply = (i: number) => {
    const L = LEVELS[i];
    setDpr(Math.min(window.devicePixelRatio, L.dpr));
    scene.traverse((o) => {
      if (o.name.startsWith("veg-") && (o as InstancedMesh).isInstancedMesh) {
        const mesh = o as InstancedMesh;
        mesh.userData.full ??= mesh.count;
        mesh.count = Math.floor(mesh.userData.full * L.forest);
      }
    });
    if (gl.shadowMap.enabled !== L.shadows) {
      gl.shadowMap.enabled = L.shadows;
      scene.traverse((o) => { const m = (o as Mesh).material as Material | Material[] | undefined; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; }); });
    }
  };

  useEffect(() => { apply(level.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const c = clock.current;
    c.t += dt;
    if (c.t < 0) return;
    c.frames++;
    if (c.t < WINDOW) return;
    const fps = c.frames / c.t;
    c.t = 0; c.frames = 0;
    if (fps < LOW_FPS && level.current < LEVELS.length - 1) {
      level.current++;
      apply(level.current);
      console.info(`[quality] ${fps.toFixed(0)} fps → level ${level.current}`, LEVELS[level.current]);
    }
  });
  return null;
}
