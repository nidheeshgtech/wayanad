/**
 * Time of day: "day" (late morning, the sun in the east), "dusk" (about 6.30 pm: the sun low behind the western ridges,
 * a warm horizon under a deep blue sky, headlamps on) or "night" (moon and stars, headlamps doing the work). Chosen with
 * the time-of-day button on either page (day → dusk → night → day) and remembered; ?theme=day|dusk|night for testing.
 * `k` eases along 0 (day) → 1 (dusk) → 2 (night), so a switch fades through the hour between instead of cutting; the
 * scene reads `duskness()` and `nightness()` each frame (Lighting steps it, once a frame).
 * Drive mode can also follow Wayanad's real clock (`auto`, the default until you pick one yourself, and the fourth
 * press of the button): day, the half hour round sunrise and sunset as dusk, night after it (lib/live: today's real
 * sunrise and sunset). The story page stays on its own choice (day unless picked).
 */
export type ThemeName = "day" | "dusk" | "night";
export const THEMES: ThemeName[] = ["day", "dusk", "night"];
type ThemeState = { name: ThemeName; k: number; auto: boolean };

const read = (): { name: ThemeName; auto: boolean } => {
  try {
    const q = new URLSearchParams(location.search).get("theme"), v = q ?? localStorage.getItem("wayanad-theme");
    return { name: v === "dusk" || v === "night" ? v : "day", auto: !q && (v === null || v === "auto") };
  } catch { return { name: "day", auto: false }; }
};
/** One object for the page (the buttons live in the DOM, the scene reads it). */
export const theme: ThemeState = ((globalThis as { __wayanadTheme?: ThemeState }).__wayanadTheme ??= (() => {
  const { name, auto } = typeof window === "undefined" ? { name: "day" as ThemeName, auto: false } : read();
  return { name, k: THEMES.indexOf(name), auto };
})());

export function setTheme(name: ThemeName) {
  theme.name = name; theme.auto = false;
  try { localStorage.setItem("wayanad-theme", name); } catch {}
}
/** Back to Wayanad's real clock (drive mode's button, after night). */
export function setAutoTheme(sun: [number, number] | null) {
  theme.auto = true;
  try { localStorage.setItem("wayanad-theme", "auto"); } catch {}
  followRealSky(sun, true);
}
/** Minutes past midnight in India for a moment (ms). */
const istMin = (ms: number) => (((ms / 60000 + 330) % 1440) + 1440) % 1440;
/** The time of day in Wayanad now: dusk from 40 min before sunset to 35 after, and 25 before sunrise to 20 after;
 * night between. `sun`: today's real sunrise and sunset (ms), else 6.30 am and 6.20 pm. */
export function realThemeNow(sun: [number, number] | null, now = Date.now()): ThemeName {
  const m = istMin(now), rise = sun ? istMin(sun[0]) : 390, set = sun ? istMin(sun[1]) : 1100;
  if (m < rise - 25 || m > set + 35) return "night";
  if (m < rise + 20 || m > set - 40) return "dusk";
  return "day";
}
/** While on `auto`, the scene follows the real clock (called by lib/live each minute and on each answer; `jump`: no fade). */
export function followRealSky(sun: [number, number] | null, jump = false) {
  if (!theme.auto) return;
  theme.name = realThemeNow(sun);
  if (jump) theme.k = THEMES.indexOf(theme.name);
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
