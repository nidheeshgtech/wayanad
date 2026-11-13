/**
 * The bridge to the phone apps around the game; in a plain browser everything here does nothing, so the website is
 * exactly as before.
 *  - iPhone app (WKWebView): the app adds a script message handler named "wayanad"; we post it plain objects —
 *    { type: "ready", achievements } once the road has loaded (the app hides its launch screen, and reports the badges
 *    already earned to Game Center), { type: "haptic", style }, { type: "score", board, value } and
 *    { type: "achievement", id } for Game Center, { type: "share", text, url, image? } for the share sheet
 *    (image: a JPEG data URL).
 *  - Android app (a Trusted Web Activity, so Chrome): no bridge, but Chrome can vibrate. The app opens the site with
 *    an android-app:// referrer; that's remembered for the tab, since the referrer is lost on a reload.
 * Game Center ids (set up in App Store Connect to match): leaderboards drivewayanad.fastest (elapsed time, hundredths
 * of a second, lower is better) and drivewayanad.points; achievements drivewayanad.badge.<BadgeId> (lib/badges).
 */
export type Haptic = "light" | "medium" | "heavy" | "success" | "warning";
type Msg =
  | { type: "ready"; achievements: string[] }
  | { type: "haptic"; style: Haptic }
  | { type: "score"; board: string; value: number }
  | { type: "achievement"; id: string }
  | { type: "share"; text: string; url: string; image?: string };

const ANDROID_APP = "android-app://com.drivewayanad.app";
export const BOARD = { fastest: "drivewayanad.fastest", points: "drivewayanad.points" } as const;
const badgeId = (id: string) => `drivewayanad.badge.${id}`;

function ios(): { postMessage(m: Msg): void } | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { webkit?: { messageHandlers?: { wayanad?: { postMessage(m: Msg): void } } } }).webkit?.messageHandlers?.wayanad;
}
let android: boolean | null = null;
function inAndroidApp() {
  if (android !== null) return android;
  if (typeof window === "undefined") return false;
  try {
    android = document.referrer.startsWith(ANDROID_APP) || sessionStorage.getItem("wayanad-app") === "android";
    if (android) sessionStorage.setItem("wayanad-app", "android");
  } catch { android = false; }
  return android;
}
const post = (m: Msg) => { try { ios()?.postMessage(m); } catch {} };

/** Where the game is running: the iPhone app, the Android app, or a browser. */
export function platform(): "ios" | "android" | "web" { return ios() ? "ios" : inAndroidApp() ? "android" : "web"; }

/** The road has loaded: the iPhone app hides its launch screen and catches Game Center up on badges earned before. */
export function nativeReady(earned: readonly string[]) { post({ type: "ready", achievements: earned.map(badgeId) }); }

/** A buzz in the hand (apps only; at most one every 80 ms so a pile-up doesn't rattle on). */
const BUZZ: Record<Haptic, number | number[]> = { light: 12, medium: 25, heavy: 45, success: [18, 70, 28], warning: [30, 50, 30] };
let lastBuzz = 0;
export function haptic(style: Haptic) {
  if (typeof window === "undefined") return;
  const now = performance.now();
  if (now - lastBuzz < 80) return;
  lastBuzz = now;
  if (ios()) post({ type: "haptic", style });
  else if (inAndroidApp()) { try { navigator.vibrate?.(BUZZ[style]); } catch {} }
}

/** A full climb finished (not one started part-way): the time and points go to the Game Center leaderboards. */
export function submitClimb(sec: number, points: number) {
  if (!ios()) return;
  post({ type: "score", board: BOARD.fastest, value: Math.round(sec * 100) });
  post({ type: "score", board: BOARD.points, value: Math.max(0, Math.round(points)) });
}

/** A badge earned: the matching Game Center achievement. */
export function nativeAchievement(id: string) { post({ type: "achievement", id: badgeId(id) }); }

/** The iPhone app's own share sheet (a web view may not offer the browser's). false outside the iPhone app. */
export async function nativeShare(text: string, url: string, image?: Blob): Promise<boolean> {
  if (!ios()) return false;
  let data: string | undefined;
  if (image) data = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ok(""); r.readAsDataURL(image); }) || undefined;
  post({ type: "share", text, url, image: data });
  return true;
}
