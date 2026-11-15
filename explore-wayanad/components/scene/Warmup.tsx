"use client";
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DefaultLoadingManager, type InstancedMesh, type Material, type Object3D, type Texture } from "three";
import { loading } from "@/lib/loading";
import { timed } from "@/lib/perf";
import { setWarmTarget } from "@/lib/warm";

// models and textures report to the loading state (lib/loading) through three's default loading manager
if (typeof window !== "undefined" && !(globalThis as { __wayanadLoadingHooked?: boolean }).__wayanadLoadingHooked) {
  (globalThis as { __wayanadLoadingHooked?: boolean }).__wayanadLoadingHooked = true;
  const prev = DefaultLoadingManager.onProgress;
  DefaultLoadingManager.onProgress = (url, loaded, total) => { loading.loaded = loaded; loading.total = total; prev?.(url, loaded, total); };
}

const SETTLE = 8; // frames with nothing loading before warming up (React mounts what the loads unblocked)

/**
 * Compiles every shader before the drive starts, so nothing freezes the first time it comes into view. Once all
 * models and textures have loaded, every object is made visible for one frame (traffic, roadside scans, rain, the
 * cab), their shaders compiled (not drawn: lib comment below), and put back as it was. That used
 * to happen on the road: 360–600 ms frames on pressing Start and when the first rain came. `needs`: objects (by name)
 * that load on their own and must be in the scene first.
 */
export default function Warmup({ needs = [] }: { needs?: string[] }) {
  const { gl, scene, camera } = useThree(), quiet = useRef(0), done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    // everything that loads asynchronously is in: the named parts are mounted and no model or texture is pending
    const mounted = needs.every((n) => { const o = scene.getObjectByName(n); return !!o && (o.children.length > 0 || (o as { isMesh?: boolean }).isMesh); });
    quiet.current = mounted && loading.loaded >= loading.total ? quiet.current + 1 : 0;
    if (quiet.current < SETTLE) return;
    done.current = true;
    const hidden: Object3D[] = [], empty: InstancedMesh[] = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    // instanced meshes drawing none right now (walkers, plants and scans out of range) would be skipped: draw one
    scene.traverse((o) => { if ((o as InstancedMesh).isInstancedMesh && (o as InstancedMesh).count === 0) { empty.push(o as InstancedMesh); (o as InstancedMesh).count = 1; } });
    // compiled, not drawn: drawing everything at once (thousands of objects, no culling) was one frame of many seconds
    // on a phone. compileAsync builds every program without a draw call, in parallel where the browser can
    // (KHR_parallel_shader_compile), and lets frames go on meanwhile.
    let compiled: Promise<unknown> = Promise.resolve();
    const tc = performance.now();
    try { compiled = timed("warm-up compile (sync part)", () => gl.compileAsync(scene, camera)); } catch { /* (compiled on first draw instead) */ } finally {
      for (const o of hidden) o.visible = false;
      for (const o of empty) o.count = 0;
    }
    void compiled.catch(() => {}).then(() => {
      ((globalThis as { __wayanadBuild?: string[] }).__wayanadBuild ??= []).push(`warm-up compiled ${Math.round(performance.now() - tc)}ms @${Math.round(tc)}`);
      loading.ready = true;
      setWarmTarget(gl, camera, scene); // (from now on, models that arrive are warmed in the background: lib/warm)
      // and the textures: uploaded a few a frame now, not all in the first frame of the drive
      const textures = new Set<Texture>();
      scene.traverse((o) => {
        const mats = (o as { material?: Material | Material[] }).material;
        for (const m of mats ? ([] as Material[]).concat(mats) : []) for (const v of Object.values(m)) if ((v as Texture)?.isTexture) textures.add(v as Texture);
      });
      const list = [...textures];
      const step = () => { for (let k = 0; k < 4 && list.length; k++) gl.initTexture(list.shift()!); if (list.length) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  });
  return null;
}
