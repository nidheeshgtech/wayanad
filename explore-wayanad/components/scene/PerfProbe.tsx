"use client";
import { useRef } from "react";
import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Frustum, InstancedMesh, Matrix4, Mesh, type Object3D } from "three";
import { perfStats, probing } from "@/lib/perf";

/** With ?perf: every second, frame-time percentiles, renderer counts, heap and per-system CPU time (lib/perf
 * frameTimed) on window.__wayanadPerf, and a small readout in the corner. Renders nothing otherwise. */
export default function PerfProbe() {
  const { scene, camera } = useThree();
  // what the triangles are: per top-level group, visible and in view, with how much of it casts shadows
  useEffect(() => {
    if (!probing) return;
    (window as unknown as { __wayanadPerfScene: () => unknown }).__wayanadPerfScene = () => {
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const out: Record<string, { tris: number; shadowTris: number; meshes: number }> = {};
      const shown = (o: Object3D) => { for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false; return true; };
      scene.traverse((o) => {
        const m = o as Mesh; if (!m.isMesh || !shown(m)) return;
        let top: Object3D = m; while (top.parent && top.parent !== scene && !top.name) top = top.parent;
        let key = top.name || m.name || "(unnamed)"; key = key.replace(/-\d+$/, "");
        const g = m.geometry, tris = (g.index ? g.index.count : g.attributes.position.count) / 3 * ((m as InstancedMesh).isInstancedMesh ? (m as InstancedMesh).count : 1);
        if (key === "(unnamed)") { const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as { name?: string; map?: { image?: { src?: string } } }; key = `(unnamed) ${g.type} ${mat?.name || ""} ${(mat?.map?.image?.src ?? "").split("/").pop() ?? ""} v${g.attributes.position.count}${(m as InstancedMesh).isInstancedMesh ? " ×" + (m as InstancedMesh).count : ""}`; }
        const inView = m.frustumCulled === false || (g.boundingSphere ?? (g.computeBoundingSphere(), g.boundingSphere)) && frustum.intersectsObject(m);
        const e = (out[key] ??= { tris: 0, shadowTris: 0, meshes: 0 });
        if (inView) { e.tris += tris; e.meshes++; }
        if (m.castShadow) e.shadowTris += tris;
      });
      return Object.entries(out).sort((a, b) => b[1].tris + b[1].shadowTris - a[1].tris - a[1].shadowTris).slice(0, 25).map(([k, v]) => `${k}: ${(v.tris / 1e3).toFixed(0)}k drawn, ${(v.shadowTris / 1e3).toFixed(0)}k shadow, ${v.meshes} meshes`);
    };
  }, [scene, camera]);
  const gl = useThree((s) => s.gl), frames = useRef<number[]>([]), last = useRef(0), el = useRef<HTMLDivElement | null>(null);
  useFrame(() => {
    if (!probing) return;
    // review: window.__wayanadCamera = { from: [x, y, z], to: [x, y, z] } holds the camera there (null lets go)
    const look = (window as unknown as { __wayanadCamera?: { from: number[]; to: number[] } | null }).__wayanadCamera;
    if (look) { camera.position.set(look.from[0], look.from[1], look.from[2]); camera.lookAt(look.to[0], look.to[1], look.to[2]); }
    const now = performance.now();
    if (last.current) frames.current.push(now - last.current);
    last.current = now;
    const total = frames.current.reduce((a, b) => a + b, 0);
    if (total < 1000) return;
    const sorted = [...frames.current].sort((a, b) => a - b), pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const sys = Object.fromEntries(Object.entries(perfStats.systems).map(([k, v]) => [k, +(v.ms / Math.max(1, v.n)).toFixed(2)]));
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const stats = {
      fps: +((frames.current.length * 1000) / total).toFixed(1), p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), worst: +sorted[sorted.length - 1].toFixed(1),
      calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0, heapMB: mem ? Math.round(mem.usedJSHeapSize / 1e6) : null, dpr: gl.getPixelRatio(), quality: perfStats.quality, cpu: sys,
    };
    (window as unknown as { __wayanadPerf: typeof stats }).__wayanadPerf = stats;
    frames.current = []; for (const v of Object.values(perfStats.systems)) { v.ms = 0; v.n = 0; }
    if (!el.current) { el.current = document.createElement("div"); Object.assign(el.current.style, { position: "fixed", left: "8px", bottom: "56px", zIndex: "50", font: "11px/1.4 monospace", color: "#cfe", background: "rgba(0,0,0,.55)", padding: "6px 8px", borderRadius: "6px", pointerEvents: "none", whiteSpace: "pre" }); document.body.append(el.current); }
    el.current.textContent = `${stats.fps} fps · p95 ${stats.p95} ms · worst ${stats.worst} ms\n${stats.calls} draws · ${(stats.triangles / 1e6).toFixed(2)} M tris · q${stats.quality} · dpr ${stats.dpr}\n${Object.entries(sys).map(([k, v]) => `${k} ${v}`).join(" · ")}`;
  });
  return null;
}
