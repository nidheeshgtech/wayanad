"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import { scrollState } from "@/lib/scrollState";
import type { ActId } from "@/data/acts";

/** The acts set on the forest road (Sulthan Bathery → border gate); every other act is on the churam/plateau road. */
export const FOREST_ACTS: ActId[] = ["forest", "border"];

/** Shows its children only during `acts` (or, with `not`, during every other act), so the GPU never draws both worlds. */
export default function ShowIn({ acts, not = false, children }: { acts: ActId[]; not?: boolean; children: React.ReactNode }) {
  const group = useRef<Group>(null);
  useFrame(() => { if (group.current) group.current.visible = acts.includes(scrollState.act) !== not; });
  return <group ref={group}>{children}</group>;
}
