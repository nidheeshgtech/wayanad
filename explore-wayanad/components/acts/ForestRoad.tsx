"use client";
import { useCallback, useRef } from "react";
import Act from "./Act";
import type { ActContent } from "@/data/acts";
import { useHud } from "@/components/ui/Hud";
import { scrollState } from "@/lib/scrollState";
import styles from "./Act.module.scss";

/** Act 7: the elephant hold. The Director slows the camera while `hold` is 1; the badge says why. */
export default function ForestRoad({ content }: { content: ActContent }) {
  const hud = useHud();
  const badge = useRef<HTMLDivElement>(null);
  const onProgress = useCallback((p: number) => {
    hud.setScene(content.scene);
    if (content.status) hud.setStatus(content.status);
    const hold = p > 0.45 && p < 0.62;
    scrollState.hold = hold ? 1 : 0;
    if (badge.current) badge.current.style.opacity = hold ? "1" : "0";
  }, [hud, content]);
  return (
    <Act content={content} onProgress={onProgress}>
      <div ref={badge} className={styles.hold} role="status">An elephant is crossing. Stay in the car.</div>
    </Act>
  );
}
