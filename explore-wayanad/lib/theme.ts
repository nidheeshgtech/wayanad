/**
 * Time of day: "day" (late morning, the sun in the east) or "dusk" (about 6.30 pm: the sun low behind the western
 * ridges, a warm horizon under a deep blue sky, headlamps on). Chosen with the sun/moon button on either page and
 * remembered; ?theme=dusk|day for testing. `k` eases 0 (day) → 1 (dusk) over a couple of seconds, so a switch fades
 * instead of cutting; the scene reads `duskness()` each frame (Lighting steps it, once a frame).
 */
export type ThemeName = "day" | "dusk";
type ThemeState = { name: ThemeName; k: number };

const read = (): ThemeName => {
  try {
    const v = new URLSearchParams(location.search).get("theme") ?? localStorage.getItem("wayanad-theme");
    return v === "dusk" ? "dusk" : "day";
  } catch { return "day"; }
};
/** One object for the page (the buttons live in the DOM, the scene reads it). */
export const theme: ThemeState = ((globalThis as { __wayanadTheme?: ThemeState }).__wayanadTheme ??= (() => {
  const name = typeof window === "undefined" ? "day" : read();
  return { name, k: name === "dusk" ? 1 : 0 };
})());

export function setTheme(name: ThemeName) {
  theme.name = name;
  try { localStorage.setItem("wayanad-theme", name); } catch {}
}

const FADE = 2.5; // s for a full switch
export function stepTheme(dt: number) {
  const want = theme.name === "dusk" ? 1 : 0;
  theme.k += Math.max(-dt / FADE, Math.min(dt / FADE, want - theme.k));
}
/** 0 (day) … 1 (dusk), eased at both ends. */
export const duskness = () => theme.k * theme.k * (3 - 2 * theme.k);
