import type { ActId } from "@/data/acts";

/**
 * Single source of truth shared between the DOM (GSAP ScrollTrigger writes)
 * and the R3F scene (useFrame reads). Kept as a plain mutable object so the
 * render loop never triggers React re-renders.
 */
export const scrollState = {
  act: "churam" as ActId,
  progress: 0,
  hold: 0,            // 1 while the elephant crossing holds the camera
  /** churam progress (p * 0.98, the camera's t on the road) at each hairpin apex; the scene replaces these with the real bends */
  bends: Array.from({ length: 9 }, (_, i) => (0.88 * (i + 1)) / 9.99),
  fogOverride: null as number | null,
  mistOverride: null as number | null,
};
