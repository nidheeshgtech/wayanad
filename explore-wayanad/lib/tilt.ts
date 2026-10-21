/**
 * Tilt steering for phones: hold the phone and turn it like a steering wheel. The angle is read from gravity in the
 * screen's plane (devicemotion), relative to how the phone was held when steering started, so it works upright or
 * leaning back, portrait or landscape, and on platforms that report the axes inverted. Writes game.input.steer.
 * iOS asks permission (from a tap) and only sends motion to https pages.
 */
import { game } from "@/lib/game";

const DEAD = 3;  // degrees either side of straight that do nothing
const LOCK = 30; // degrees for full lock

export const tilt = { on: false, angle: 0 };
let neutral: number | null = null, smooth = 0, listening = false;

/** Straight ahead is however the phone is held now (on the next reading). */
export function recenter() { neutral = null; smooth = 0; }

function onMotion(e: DeviceMotionEvent) {
  const g = e.accelerationIncludingGravity;
  if (g?.x == null || g.y == null || Math.hypot(g.x, g.y) < 3) return; // lying flat: no wheel to turn
  // paused: the drive resumes straight ahead however the phone is held then
  if (game.paused) { recenter(); return; }
  const a = (Math.atan2(g.x, g.y) * 180) / Math.PI;
  neutral ??= a;
  const d = ((a - neutral + 540) % 360) - 180; // turned clockwise (right) is negative
  smooth += (d - smooth) * 0.35;
  tilt.angle = smooth;
  if (!tilt.on) return;
  // finer near the centre, full lock at LOCK; game.input.steer is +1 left … −1 right
  const m = Math.min(1, Math.max(0, Math.abs(smooth) - DEAD) / (LOCK - DEAD));
  game.input.steer = Math.sign(smooth) * m ** 1.4;
}

/** Turns tilt steering on; false if the phone can't or won't (no sensor, not https, permission refused). Call from a tap. */
export async function enableTilt(): Promise<boolean> {
  const DM = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  if (!DM || !window.isSecureContext) return false;
  try { if (DM.requestPermission && (await DM.requestPermission()) !== "granted") return false; } catch { return false; }
  if (!listening) { addEventListener("devicemotion", onMotion); addEventListener("orientationchange", recenter); listening = true; }
  // some browsers have the API but never send readings: wait for one
  const live = await new Promise<boolean>((resolve) => {
    const once = () => { clearTimeout(timer); removeEventListener("devicemotion", once); resolve(true); };
    const timer = setTimeout(() => { removeEventListener("devicemotion", once); resolve(false); }, 1000);
    addEventListener("devicemotion", once);
  });
  recenter();
  tilt.on = live;
  return live;
}

export function disableTilt() { tilt.on = false; game.input.steer = 0; }
