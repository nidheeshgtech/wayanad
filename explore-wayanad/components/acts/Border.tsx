"use client";
import { useCallback, useRef } from "react";
import Act from "./Act";
import type { ActContent } from "@/data/acts";
import { useHud } from "@/components/ui/Hud";
import styles from "./Act.module.scss";

/* The prototype's schematic route, Adivaram (left) to Muthanga (right). The only map on the page.
 * A real trace (OSM, Adivaram → Moolehole) can replace this path later; the drawing logic stays. */
const ROUTE = "M8 54 C70 50, 80 14, 140 22 S230 52, 280 36 S380 8, 440 18 S500 34, 512 30";

/** Act 8: counter reads 9/9 and the route draws itself as the camera turns to face back west. */
export default function Border({ content }: { content: ActContent }) {
  const hud = useHud();
  const path = useRef<SVGPathElement>(null), dot = useRef<SVGCircleElement>(null);
  const onProgress = useCallback((p: number) => {
    hud.setScene(content.scene);
    if (content.status) hud.setStatus(content.status);
    hud.setCounter(9);
    const line = path.current;
    if (!line || !dot.current) return;
    const length = line.getTotalLength(), k = Math.min(1, Math.max(0, (p - 0.5) * 2));
    line.style.strokeDasharray = String(length);
    line.style.strokeDashoffset = String(length * (1 - k));
    const at = line.getPointAtLength(length * k);
    dot.current.setAttribute("cx", String(at.x));
    dot.current.setAttribute("cy", String(at.y));
  }, [hud, content]);
  return (
    <Act content={content} onProgress={onProgress}>
      <svg className={styles.route} viewBox="0 0 520 64" role="img" aria-label="Route from Adivaram to Muthanga">
        <path ref={path} d={ROUTE} style={{ strokeDasharray: 1200, strokeDashoffset: 1200 }} />
        <circle ref={dot} cx="8" cy="54" r="4" />
      </svg>
    </Act>
  );
}
