"use client";
import { startTransition, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import { scrollState } from "@/lib/scrollState";
import type { ActId } from "@/data/acts";

/** The acts set on the forest road (Sulthan Bathery → border gate); every other act is on the churam/plateau road. */
export const FOREST_ACTS: ActId[] = ["forest", "border"];

/** Shows its children only during `acts` (or, with `not`, during every other act), so the GPU never draws both worlds.
 * `defer`: build the children only once the scene has rendered a few frames and the browser is idle, so the world you
 * start in appears first (the forest acts are minutes of scrolling away; it builds behind the pre-roll). */
export default function ShowIn({ acts, not = false, defer = false, children }: { acts: ActId[]; not?: boolean; defer?: boolean; children: React.ReactNode }) {
  const group = useRef<Group>(null), frames = useRef(0), asked = useRef(false);
  const [ready, setReady] = useState(!defer);
  useFrame(() => {
    if (group.current) group.current.visible = acts.includes(scrollState.act) !== not;
    if (ready || asked.current || ++frames.current < 3) return;
    asked.current = true;
    const go = () => startTransition(() => setReady(true));
    if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 500);
  });
  return <group ref={group}>{ready && children}</group>;
}
