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
  /** t on the road (0–1) at each hairpin apex and at the Lakkidi gateway; the scene replaces these with the real road's.
   * Scroll → t goes through lib/drive.ts (the drive slows for bends and the gate). */
  bends: Array.from({ length: 9 }, (_, i) => (0.88 * (i + 1)) / 9.99),
  arch: 0.905,
  /** t where Act 1 ends and Act 2 (Lakkidi → Kalpetta) begins, and the named places along Act 2 */
  churamEnd: 0.98,
  /** the road's length in metres (t × roadMetres = metres from Adivaram) */
  roadMetres: 12800,
  places: [] as { name: string; t: number; off: number }[],
  fogOverride: null as number | null,
  mistOverride: null as number | null,
};
