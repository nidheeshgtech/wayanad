"use client";
import { useEffect } from "react";
import { game } from "@/lib/game";

/** How far a swipe turns: radians per pixel dragged. */
const TURN = 0.0065;
/** A tap: down and up within `ms`, moving under `px`; two of them within `gap` ms and `near` px make a double tap. */
const TAP = { ms: 260, px: 14, gap: 330, near: 70 };
export const VIEW_EVENT = "wayanad:view";

/**
 * Swipe to look (phones, and a mouse drag on desktop): a finger dragged across the road itself, not on a button.
 * On foot it turns you, and the camera behind you follows (the arrows still turn too); driving it swings the chase
 * camera round the car (lib/game `look`), which eases back behind once you let go. Each finger is tracked on its own,
 * so a thumb on the steering buttons and another swiping both work.
 * A double tap on the road (while driving) changes the camera: Behind → Close → Bonnet (DriveHud listens for
 * VIEW_EVENT).
 */
export default function SwipeLook() {
  useEffect(() => {
    const fingers = new Map<number, number>(); // pointer id → last x
    const starts = new Map<number, { x: number; y: number; t: number }>(); // pointer id → where and when it went down
    let lastTap = { x: 0, y: 0, t: -1e9 };
    const onRoad = (e: PointerEvent) => e.target instanceof HTMLCanvasElement && e.target.clientWidth >= innerWidth * 0.8;
    const down = (e: PointerEvent) => {
      if (!onRoad(e) || !game.started || game.paused || game.phase !== "drive") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      fingers.set(e.pointerId, e.clientX); game.look.held = true;
      starts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    };
    const move = (e: PointerEvent) => {
      const x0 = fingers.get(e.pointerId); if (x0 === undefined) return;
      const dx = e.clientX - x0; fingers.set(e.pointerId, e.clientX);
      if (game.foot.on) game.foot.yaw -= dx * TURN;
      else game.look.yaw = Math.max(-Math.PI, Math.min(Math.PI, game.look.yaw - dx * TURN));
    };
    const up = (e: PointerEvent) => {
      if (fingers.delete(e.pointerId) && !fingers.size) game.look.held = false;
      const s = starts.get(e.pointerId); starts.delete(e.pointerId);
      if (!s || e.type !== "pointerup" || game.foot.on) return;
      const now = performance.now();
      if (now - s.t > TAP.ms || Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP.px) return; // a swipe or a hold
      if (now - lastTap.t < TAP.gap && Math.hypot(s.x - lastTap.x, s.y - lastTap.y) < TAP.near) {
        lastTap.t = -1e9; game.look.yaw = 0; dispatchEvent(new Event(VIEW_EVENT));
      } else lastTap = { x: s.x, y: s.y, t: now };
    };
    addEventListener("pointerdown", down); addEventListener("pointermove", move);
    addEventListener("pointerup", up); addEventListener("pointercancel", up);
    return () => {
      removeEventListener("pointerdown", down); removeEventListener("pointermove", move);
      removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
      game.look.held = false;
    };
  }, []);
  return null;
}
