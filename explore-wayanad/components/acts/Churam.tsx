"use client";
import { useCallback, useRef } from "react";
import Act from "./Act";
import { ACTS } from "@/data/acts";
import { useHud } from "@/components/ui/Hud";
import { scrollState } from "@/lib/scrollState";

export default function Churam() {
  const hud = useHud();
  const reveal = useRef<HTMLParagraphElement>(null);
  const onProgress = useCallback((p: number) => {
    const t = p * 0.98; // the Director's camera t on the road
    hud.setCounter(scrollState.bends.filter((b) => b <= t).length);
    hud.setScene(p > 0.9 ? "Lakkidi · the gateway" : "Thamarassery Churam");
    if (reveal.current) reveal.current.style.opacity = String(p > 0.92 ? (p - 0.92) * 12 : 0);
  }, [hud]);
  return (
    <Act content={ACTS[0]} onProgress={onProgress}>
      <p ref={reveal} className="serif" style={{ fontSize: 28, opacity: 0 }}>Through the arch. You are in Wayanad.</p>
    </Act>
  );
}
