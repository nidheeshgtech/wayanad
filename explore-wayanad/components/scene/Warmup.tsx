"use client";
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DefaultLoadingManager, type Object3D } from "three";
import { loading } from "@/lib/loading";

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
 * cab), rendered once — which compiles the materials and their shadow variants — and put back as it was. That used
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
    const hidden: Object3D[] = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    scene.traverse((o) => { o.userData.__fc = o.frustumCulled; o.frustumCulled = false; });
    try { gl.render(scene, camera); } finally {
      for (const o of hidden) o.visible = false;
      scene.traverse((o) => { if (o.userData.__fc !== undefined) { o.frustumCulled = o.userData.__fc; delete o.userData.__fc; } });
    }
    loading.ready = true;
  });
  return null;
}
