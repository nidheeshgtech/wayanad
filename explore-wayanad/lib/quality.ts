/**
 * Graphics quality: Auto (default) or a fixed High / Medium / Low, chosen in drive mode's settings and remembered.
 * Levels go from the best (0) down; each trades a little looks for speed, render resolution first, then forest
 * density, then shadows. components/scene/Quality.tsx applies them and, on Auto, picks the level from the frame times.
 */
export type QualityMode = "auto" | "high" | "medium" | "low";
export const LEVELS = [
  { dpr: 2, forest: 1, shadows: true },     // 0 high
  { dpr: 1.75, forest: 1, shadows: true },  // 1
  { dpr: 1.5, forest: 1, shadows: true },   // 2 medium
  { dpr: 1.25, forest: 0.85, shadows: true }, // 3
  { dpr: 1, forest: 0.7, shadows: false },  // 4 low
  { dpr: 0.85, forest: 0.55, shadows: false }, // 5 lowest (auto only)
];
/** The lite tier (phones): no shadows already, and a sharp picture matters more on a small high-density screen than
 * forest density, so the resolution never drops below 1.25 and the forest thins first. */
export const LITE_LEVELS = [
  { dpr: 2, forest: 0.9, shadows: false },
  { dpr: 1.75, forest: 0.8, shadows: false },
  { dpr: 1.5, forest: 0.75, shadows: false },
  { dpr: 1.5, forest: 0.65, shadows: false },
  { dpr: 1.25, forest: 0.6, shadows: false },
  { dpr: 1.25, forest: 0.55, shadows: false },
];
export const FIXED: Record<Exclude<QualityMode, "auto">, number> = { high: 0, medium: 2, low: 4 };

type QualityState = { mode: QualityMode; level: number };
const read = (): QualityMode => {
  try {
    const q = new URLSearchParams(location.search).get("q"); // ?q=high|medium|low|auto (testing)
    const v = q ?? localStorage.getItem("wayanad-quality");
    return v === "high" || v === "medium" || v === "low" || v === "auto" ? v : "auto";
  } catch { return "auto"; }
};
/** One object for the page (the settings live in the DOM, the scene reads them). */
export const quality: QualityState = ((globalThis as { __wayanadQuality?: QualityState }).__wayanadQuality ??= { mode: typeof window === "undefined" ? "auto" : read(), level: 0 });

export function setQualityMode(mode: QualityMode) {
  quality.mode = mode;
  try { localStorage.setItem("wayanad-quality", mode); } catch {}
}
