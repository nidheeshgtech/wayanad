"use client";
import { useCallback, useRef } from "react";
import Act from "./Act";
import type { ActContent } from "@/data/acts";
import { useHud } from "@/components/ui/Hud";
import { scrollState } from "@/lib/scrollState";
import { driveT2 } from "@/lib/drive";
import styles from "./Act.module.scss";

/* Act 2's beats, from the storyboard (verbatim), shown as you pass each place on the road. `before` / `after` are
 * metres of road either side of the place's nearest point on NH766. Pookode Lake sits ~700 m off the road: a glimpse. */
const BEATS: { place: string; scene: string; text: string; before: number; after: number }[] = [
  { place: "Pookode Lake", scene: "Pookode", text: "Pookode: a lake shaped like India, if you squint. Good for an hour.", before: 500, after: 400 },
  { place: "Vythiri", scene: "Vythiri", text: "Vythiri is where the tree houses are. Book one night here, not all of them.", before: 600, after: 600 },
  { place: "Chundale", scene: "Chundale", text: "", before: 300, after: 300 },
];

/** Act 2: the drive from Lakkidi to Kalpetta. The HUD names the stretch you're on; captions come and go with the places;
 * the headline and compass cards arrive with Kalpetta (Act's `reveal`). */
export default function Plateau({ content, children }: { content: ActContent; children?: React.ReactNode }) {
  const hud = useHud();
  const caption = useRef<HTMLParagraphElement>(null), shown = useRef("");
  const onProgress = useCallback((p: number) => {
    const t = driveT2(p), metres = (dt: number) => dt * scrollState.roadMetres;
    let scene = "Lakkidi → Kalpetta", text = "";
    for (const beat of BEATS) {
      const place = scrollState.places.find((pl) => pl.name === beat.place);
      if (!place) continue;
      const m = metres(t - place.t);
      if (m > -beat.before && m < beat.after) { scene = `Lakkidi → Kalpetta · ${beat.scene}`; text = beat.text; }
    }
    if (p > (content.reveal ?? 1)) scene = "Kalpetta";
    hud.setScene(scene);
    if (caption.current && text !== shown.current) {
      shown.current = text;
      caption.current.style.opacity = "0";
      if (text) setTimeout(() => { if (caption.current && shown.current === text) { caption.current.textContent = text; caption.current.style.opacity = "1"; } }, 400);
    }
  }, [hud, content]);
  return (
    <Act content={content} onProgress={onProgress}>
      <p ref={caption} className={styles.caption} aria-live="polite" />
      {children}
    </Act>
  );
}
