"use client";
import { useCallback } from "react";
import Act from "./Act";
import type { ActContent } from "@/data/acts";
import { useHud } from "@/components/ui/Hud";

/** Acts that only need copy + mood (plus static extras passed as children). Forest and border have their own components. */
export default function Simple({ content, children }: { content: ActContent; children?: React.ReactNode }) {
  const hud = useHud();
  const onProgress = useCallback(() => {
    hud.setScene(content.scene);
    if (content.status) hud.setStatus(content.status);
  }, [hud, content]);
  return <Act content={content} onProgress={onProgress}>{children}</Act>;
}
