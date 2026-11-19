/**
 * How far visitors get, counted on the free Vercel Web Analytics plan (custom events need Pro): each step is sent as
 * a made-up page view, so the dashboard's Pages list reads as a funnel —
 *   /                  opened the site
 *   /play/loaded       the road finished loading (the title screen appeared)
 *   /play/load-10s …   how long that took: load-10s, load-20s, load-40s, load-60s, load-slow (over a minute)
 *   /play/left-loading closed or switched away before the road loaded (and left-at-10s … how long they'd waited)
 *   /play/started      pressed Start
 *   /play/open, /play/friends   how they played (Solo is started minus these)
 *   /play/1min … 30min still driving after that much play (1, 3, 5, 10, 20, 30; paused and hidden time not counted)
 *   /play/walked       got out and walked;  /play/took  drove off in someone else's vehicle
 *   /play/finished     reached the Lakkidi gate (a full climb, not one started part-way with ?at=)
 *   /play/support      pressed "Buy Me a Chaya" (the support page opens in a new tab)
 *   /play/fps-60 … fps-low   the frame rate over the first minute of driving (after a 10 s settle): 60, 45, 30, 24 or
 *                      low (under 20); and /play/fps-30-android-web etc., the same split by device (desktop,
 *                      android-web, ios-web, android-app, ios-app); /play/jank if frames over 100 ms came often
 * Each step counts once per page load, so "Drive again" doesn't count twice. Totals only: no names, no cookies.
 */
import { pageview } from "@vercel/analytics";
import { platform } from "@/lib/native";

export type Step = "loaded" | "started" | "finished" | "support" | "open" | "friends" | "walked" | "took" | "left-loading" | "jank" | `load-${string}` | `left-at-${string}` | `${number}min` | `fps-${string}`;
const sent = new Set<string>();

export function mark(step: Step) {
  if (sent.has(step)) return;
  sent.add(step);
  const path = `/play/${step}`;
  try { pageview({ route: path, path }); } catch {}
}

/** Seconds into a bucket name: "10s", "20s", "40s", "60s", or "slow" past a minute. */
const bucket = (sec: number) => (sec <= 10 ? "10s" : sec <= 20 ? "20s" : sec <= 40 ? "40s" : sec <= 60 ? "60s" : "slow");

/** The road has loaded: how long since the page opened. */
export function markLoaded() {
  if (sent.has("loaded")) return;
  mark("loaded");
  mark(`load-${bucket(performance.now() / 1000)}`);
}

/**
 * Watch for someone leaving before the road loads (closing the tab, switching app): counted once, with how long they
 * waited. Phones rarely fire "unload", so the page being hidden is the sign.
 */
export function watchLeaving(isReady: () => boolean) {
  const gone = () => {
    if (document.visibilityState !== "hidden" || isReady() || sent.has("left-loading")) return;
    mark("left-loading");
    mark(`left-at-${bucket(performance.now() / 1000)}`);
  };
  document.addEventListener("visibilitychange", gone);
  addEventListener("pagehide", gone);
  return () => { document.removeEventListener("visibilitychange", gone); removeEventListener("pagehide", gone); };
}

/** Minutes of actual driving (call each frame with the frame's seconds while playing, visible and not paused). */
const MINUTES = [1, 3, 5, 10, 20, 30];
let played = 0;
export function tickPlay(dt: number) {
  played += Math.min(dt, 0.5);
  for (const m of MINUTES) if (played >= m * 60) mark(`${m}min`);
  // the frame rate players really get: counted from 10 s to 70 s of driving, once per page load
  if (played > 10 && !sent.has("fps-done")) {
    fps.frames++; fps.time += Math.min(dt, 0.5); if (dt > 0.1) fps.long++;
    if (fps.time >= 60) {
      sent.add("fps-done");
      const r = fps.frames / fps.time, b = r >= 52 ? "60" : r >= 38 ? "45" : r >= 27 ? "30" : r >= 20 ? "24" : "low";
      const where = platform() !== "web" ? `${platform()}-app` : /Android/i.test(navigator.userAgent) ? "android-web" : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios-web" : "desktop";
      mark(`fps-${b}`); mark(`fps-${b}-${where}` as Step);
      if (fps.long >= 6) mark("jank"); // (six or more frames over 100 ms in a minute: the "stuck" feeling)
    }
  }
}
const fps = { frames: 0, time: 0, long: 0 };
