"use client";
import { useCallback, useRef } from "react";
import Act from "./Act";
import { ACTS } from "@/data/acts";
import { useHud } from "@/components/ui/Hud";
import { scrollState } from "@/lib/scrollState";
import { driveT } from "@/lib/drive";

export default function Churam() {
  const hud = useHud();
  const reveal = useRef<HTMLParagraphElement>(null);
  const onProgress = useCallback((p: number) => {
    const t = driveT(p); // same pace as the camera
    hud.setCounter(scrollState.bends.filter((b) => b <= t).length);
    hud.setScene(t > scrollState.arch - 0.03 ? "Lakkidi · the gateway" : "Thamarassery Churam");
    // "Through the arch" fades in as you pass under it
    if (reveal.current) reveal.current.style.opacity = String(Math.min(1, Math.max(0, (t - scrollState.arch) / 0.01)));
  }, [hud]);
  return (
    <Act content={ACTS[0]} onProgress={onProgress}>
      <p ref={reveal} className="serif" style={{ fontSize: 28, opacity: 0 }}>Through the arch. You are in Wayanad.</p>
    </Act>
  );
}
