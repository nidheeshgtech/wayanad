/**
 * Time of day: "day" (late morning, the sun in the east), "dusk" (about 6.30 pm: the sun low behind the western ridges,
 * a warm horizon under a deep blue sky, headlamps on) or "night" (moon and stars, headlamps doing the work). Chosen with
 * the time-of-day button on either page (day → dusk → night → day) and remembered; ?theme=day|dusk|night for testing.
 * `k` eases along 0 (day) → 1 (dusk) → 2 (night), so a switch fades through the hour between instead of cutting; the
 * scene reads `duskness()` and `nightness()` each frame (Lighting steps it, once a frame).
 */
export type ThemeName = "day" | "dusk" | "night";
export const THEMES: ThemeName[] = ["day", "dusk", "night"];
type ThemeState = { name: ThemeName; k: number };

const read = (): ThemeName => {
  try {
    const v = new URLSearchParams(location.search).get("theme") ?? localStorage.getItem("wayanad-theme");
    return v === "dusk" || v === "night" ? v : "day";
  } catch { return "day"; }
};
/** One object for the page (the buttons live in the DOM, the scene reads it). */
export const theme: ThemeState = ((globalThis as { __wayanadTheme?: ThemeState }).__wayanadTheme ??= (() => {
  const name = typeof window === "undefined" ? "day" : read();
  return { name, k: THEMES.indexOf(name) };
})());

export function setTheme(name: ThemeName) {
  theme.name = name;
  try { localStorage.setItem("wayanad-theme", name); } catch {}
}

const FADE = 2.5; // s per step (day ↔ dusk, dusk ↔ night)
export function stepTheme(dt: number) {
  theme.k += Math.max(-dt / FADE, Math.min(dt / FADE, THEMES.indexOf(theme.name) - theme.k));
}
const ease = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
/** 0 (day) … 1 (dusk and night): how far the evening has come. */
export const duskness = () => ease(theme.k);
/** 0 (day, dusk) … 1 (night). */
export const nightness = () => ease(theme.k - 1);
