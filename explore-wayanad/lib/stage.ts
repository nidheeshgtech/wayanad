/**
 * Staged scenes for filming reels (never seen in normal play): opened with ?scene=<name> and driven from the browser
 * console or a recording script through window.__wayanadStage. One so far: "rockfall" — a small rockfall blocks the
 * churam in the rain, the traffic stops and queues, the police and Fire & Rescue come down from Lakkidi, the road is
 * cleared and opens again (components/scene/Rockfall.tsx). Plain mutable state like lib/game; Traffic and the player's
 * car read `stageBlock()` so nothing drives through the rocks.
 */
import { game } from "@/lib/game";
import { setWeatherForReview, type WeatherName } from "@/lib/weather";

export type StagePhase = "none" | "falling" | "blocked" | "clearing" | "open";
export const stage = {
  /** the scene asked for in the address (?scene=rockfall), or "" */
  scene: typeof location !== "undefined" ? new URLSearchParams(location.search).get("scene") ?? "" : "",
  phase: "none" as StagePhase,
  /** where the rocks come down (road units, as game.s) */
  s0: 0,
  /** seconds since the phase began */
  t: 0,
  /** the police and the fire truck: 0 not called, then seconds since they set off */
  rescue: -1,
  /** a film shot (components/scene/Rockfall SHOTS) instead of the game's camera, and seconds since it began */
  shot: null as string | null,
  shotT: 0,
  /** bumped on every change, so the scene can react */
  version: 0,
};

const set = (patch: Partial<typeof stage>) => { Object.assign(stage, patch, { t: 0 }); stage.version++; };

/** The block on the road while the rocks are there: both lanes, a little short of the rubble. */
export function stageBlock(): { distance: number; length: number } | null {
  return stage.phase === "falling" || stage.phase === "blocked" || stage.phase === "clearing" ? { distance: stage.s0, length: 0.5 } : null;
}

if (typeof window !== "undefined" && stage.scene) {
  (window as unknown as { __wayanadStage: unknown }).__wayanadStage = {
    stage,
    /** rocks come down `ahead` units in front of you (default 4: 40 m) */
    fall: (ahead = 4) => { set({ phase: "falling", s0: game.s + ahead, rescue: -1 }); game.bump = 0.24; },
    /** the police jeep and the fire truck set off from Lakkidi's side */
    rescue: () => { stage.rescue = 0; stage.version++; },
    /** the crew clears the rocks; the road opens a few seconds later */
    clear: () => set({ phase: "clearing" }),
    reset: () => set({ phase: "none", rescue: -1 }),
    /** a film shot by name (or null for the game's own camera) */
    shot: (name: string | null) => { stage.shot = name; stage.shotT = 0; },
    weather: (name: WeatherName | null) => setWeatherForReview(name),
  };
}
