"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { CatmullRomCurve3 } from "three";
import { game } from "@/lib/game";
import { bonus, score } from "@/lib/score";
import { award } from "@/lib/badges";
import { stops } from "@/lib/stops";
import { cafeS } from "@/components/scene/Stops";
import { startVista } from "@/lib/vista";

/* The chai break at the Lakkidi View Point's café (built with the terrace in components/scene/Stops): stop beside it
 * and you're served — once per climb, a bonus and a badge (lib/score, lib/badges); the HUD shows the tea (DriveHud), and
 * the camera goes out over the railing to take in the valley (lib/vista).
 * Units of 10 m. */
const STOP = { reach: 0.45, still: 0.03, hold: 1.2, points: 50 }; // within 4.5 m along the road, stopped 1.2 s

export default function TeaStall({ curve }: { curve: CatmullRomCurve3 }) {
  // the stall is the Lakkidi View Point's café now (components/scene/Stops); this keeps the chai break
  const at = useMemo(() => {
    const s = cafeS(curve), side = stops(curve).find((x) => x.kind === "viewpoint")?.side ?? 1;
    if (typeof window !== "undefined") (window as unknown as { __wayanadStall?: unknown }).__wayanadStall = { s, side }; // for testing
    return s;
  }, [curve]);

  useFrame((_, dt) => {
    game.stall = at;
    // a chai break: stopped beside the stall, once per climb
    if (!game.started || game.phase !== "drive" || game.paused || game.leg !== 0 || game.teaRun === score.run) return;
    const near = Math.abs(game.s - at) < STOP.reach && Math.abs(game.speed) < STOP.still;
    game.teaWait = near ? game.teaWait + Math.min(dt, 0.1) : 0;
    if (game.teaWait >= STOP.hold) {
      game.teaRun = score.run; game.tea = performance.now(); game.teaWait = 0;
      bonus(STOP.points, "☕ Chai break!"); award("chaya");
      startVista(score.run); // the view from the railing while the tea comes (components/drive/Vista)
    }
  });
  return null;
}
