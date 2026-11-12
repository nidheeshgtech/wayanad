"use client";
import { useEffect } from "react";
import { game } from "@/lib/game";

/** How far a swipe turns: radians per pixel dragged. */
const TURN = 0.0065;

/**
 * Swipe to look (phones, and a mouse drag on desktop): a finger dragged across the road itself, not on a button.
 * On foot it turns you, and the camera behind you follows (the arrows still turn too); driving it swings the chase
 * camera round the car (lib/game `look`), which eases back behind once you let go. Each finger is tracked on its own,
 * so a thumb on the steering buttons and another swiping both work.
 */
export default function SwipeLook() {
  useEffect(() => {
    const fingers = new Map<number, number>(); // pointer id → last x
    const onRoad = (e: PointerEvent) => e.target instanceof HTMLCanvasElement && e.target.clientWidth >= innerWidth * 0.8;
    const down = (e: PointerEvent) => {
      if (!onRoad(e) || !game.started || game.paused || game.phase !== "drive") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      fingers.set(e.pointerId, e.clientX); game.look.held = true;
    };
    const move = (e: PointerEvent) => {
      const x0 = fingers.get(e.pointerId); if (x0 === undefined) return;
      const dx = e.clientX - x0; fingers.set(e.pointerId, e.clientX);
      if (game.foot.on) game.foot.yaw -= dx * TURN;
      else game.look.yaw = Math.max(-Math.PI, Math.min(Math.PI, game.look.yaw - dx * TURN));
    };
    const up = (e: PointerEvent) => { if (fingers.delete(e.pointerId) && !fingers.size) game.look.held = false; };
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
