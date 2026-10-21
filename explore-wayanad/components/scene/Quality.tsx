"use client";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { InstancedMesh, Material, Mesh } from "three";
import { perfStats } from "@/lib/perf";
import { FIXED, LEVELS as DESKTOP, LITE_LEVELS, quality } from "@/lib/quality";
import { loading } from "@/lib/loading";

/* Auto quality, judged on typical frames rather than the average: a frame over HITCH ms is a one-off (a shader
 * compiling the first time something appears, an upload) and is left out — counting those used to drop the quality
 * to its lowest for good a few seconds into every drive. */
const WARMUP = 4;     // s after the start or a level change before judging
const WINDOW = 2;     // s per measurement
const HITCH = 70;     // ms: frames slower than this are one-offs, not the device's pace
const SLOW = 19;      // ms median: below ~52 fps
const SMOOTH = 17.6;  // ms at the 95th percentile: holding 60 fps (vsync) — room to try a step up
const UP_AFTER = 8;   // smooth windows in a row before trying the level above (16 s)
const HOLD_DOWN = 60; // s to stay down after a step up didn't hold

/**
 * Applies the quality level (render resolution, forest density, shadows; lib/quality LEVELS). Fixed modes just apply
 * their level. Auto steps down after two slow windows in a row, and tries one step up after a long smooth spell —
 * going straight back if that doesn't hold, then not trying again for a while. `start` lets the lite tier begin lower;
 * `lite` uses the phone ladder (LITE_LEVELS).
 * Vegetation meshes are found by name ("veg-*") and keep their full count in userData.full, so thinning is just
 * drawing fewer of the (randomly ordered) instances.
 */
export default function Quality({ start = 0, lite = false }: { start?: number; lite?: boolean }) {
  const LEVELS = lite ? LITE_LEVELS : DESKTOP;
  const { gl, scene, setDpr } = useThree();
  const applied = useRef(-1), mode = useRef(quality.mode);
  const s = useRef({ t: -WARMUP, frames: [] as number[], slow: 0, smooth: 0, trial: false, holdUntil: 0, clock: 0 });

  const apply = (i: number) => {
    const L = LEVELS[i];
    applied.current = i; quality.level = i; perfStats.quality = i;
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
    Object.assign(s.current, { t: -WARMUP, frames: [], slow: 0, smooth: 0 });
  };

  useEffect(() => {
    apply(quality.mode === "auto" ? start : FIXED[quality.mode]);
    // the whole scene has been built by the time this effect runs (it mounts last): how long the page took to get here
    if (process.env.NODE_ENV !== "production" || location.search.includes("debug")) console.info(`[scene] built ${Math.round(performance.now())} ms after navigation`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const c = s.current;
    c.clock += dt;
    // a fixed mode chosen in the settings: apply it; switching back to auto starts from the current level
    if (quality.mode !== mode.current) { mode.current = quality.mode; if (quality.mode !== "auto") apply(FIXED[quality.mode]); else Object.assign(c, { t: -WARMUP, frames: [], slow: 0, smooth: 0, trial: false }); }
    if (quality.mode !== "auto") return;
    // loading (models decoding, textures uploading, the forest building) isn't the device's pace: wait for the warm-up
    if (!loading.ready) { c.t = -WARMUP; c.frames = []; return; }
    c.t += dt;
    if (c.t < 0) return;
    if (dt * 1000 < HITCH) c.frames.push(dt * 1000);
    if (c.t < WINDOW) return;
    const f = c.frames.sort((a, b) => a - b), p50 = f[Math.floor(f.length * 0.5)] ?? 0, p95 = f[Math.floor(f.length * 0.95)] ?? 0;
    c.t = 0; c.frames = [];
    if (f.length < WINDOW * 15) return; // mostly hitches (loading, a tab switch): no verdict
    const level = applied.current;
    if (p50 > SLOW) {
      c.smooth = 0;
      // a step up that doesn't hold goes straight back, and up-steps rest for a while
      if (c.trial) { c.trial = false; c.holdUntil = c.clock + HOLD_DOWN; apply(level + 1); console.info(`[quality] step up didn't hold → level ${level + 1}`); return; }
      if (++c.slow >= 2 && level < LEVELS.length - 1) { apply(level + 1); console.info(`[quality] ${p50.toFixed(1)} ms median → level ${level + 1}`, LEVELS[level + 1]); }
      return;
    }
    c.slow = 0; c.trial = false;
    if (p95 <= SMOOTH && ++c.smooth >= UP_AFTER && level > 0 && c.clock > c.holdUntil) { c.trial = true; apply(level - 1); s.current.trial = true; console.info(`[quality] smooth → trying level ${level - 1}`); }
  });
  return null;
}
