"use client";
import { useCallback } from "react";
import Act from "./Act";
import type { ActContent } from "@/data/acts";
import { useHud } from "@/components/ui/Hud";
import { scrollState } from "@/lib/scrollState";

/** Acts that only need copy + mood. Forest adds the elephant hold; border drives the route line in its own component later. */
export default function Simple({ content, children }: { content: ActContent; children?: React.ReactNode }) {
  const hud = useHud();
  const onProgress = useCallback((p: number) => {
    hud.setScene(content.scene);
    if (content.status) hud.setStatus(content.status);
    if (content.id === "forest") scrollState.hold = p > 0.45 && p < 0.62 ? 1 : 0;
    if (content.id === "border") hud.setCounter(9);
  }, [hud, content]);
  return <Act content={content} onProgress={onProgress}>{children}</Act>;
}
