"use client";
import { useEffect, useState } from "react";

export type Tier = "full" | "lite" | "video";

/**
 * Decides how much of the visual stack to render. Not screen width:
 * WebGPU/WebGL availability, memory, and a one-second frame probe.
 * "video" is the first-class mobile tier (scroll-scrubbed footage, same DOM).
 */
export function useCapability(): Tier | null {
  const [tier, setTier] = useState<Tier | null>(null);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (reduce || !gl) return setTier("video");
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - start < 800) requestAnimationFrame(tick);
      else {
        const fps = frames / 0.8;
        // a blank page holds 60 fps on any phone, so the probe alone sent phones the desktop stack; a touch-first
        // device (input type, not screen size) is capped at lite
        const touch = matchMedia("(pointer: coarse)").matches;
        setTier(fps > 50 && mem >= 4 && !touch ? "full" : fps > 30 ? "lite" : "video");
      }
    };
    requestAnimationFrame(tick);
  }, []);
  return tier;
}
