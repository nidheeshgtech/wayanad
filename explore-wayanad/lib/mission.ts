/**
 * Missions: jobs with a goal inside drive mode. One so far — the landslide rescue: monsoon rain has brought rocks down
 * across the churam; you drive the digger (data/cars "t-digger"), scoop each boulder in the front bucket and tip it off
 * the valley edge, and open the road while the traffic queues both ways. components/scene/Landslide runs it on the road;
 * components/drive/Mission is its buttons and cards. Plain mutable state like lib/game, plus a subscription for the UI.
 */
export type MissionPhase = "none" | "pending" | "work" | "done";
export type Rock = { s: number; lat: number; r: number; state: "road" | "carried" | "falling" | "gone"; t: number };

export const MISSION = {
  /** where the rocks lie (road units from Adivaram): the straight between hairpins 2 and 3, under a cut face */
  s0: 405,
  /** the digger starts this far before them */
  back: 4.2,
  /** stars: cleared within these many seconds */
  stars: [100, 160] as const,
};

type State = { phase: MissionPhase; rocks: Rock[]; carried: number; t: number; scoop: number; canScoop: boolean; canDump: boolean; best: number; v: number };
export const mission: State = ((globalThis as { __wayanadMission?: State }).__wayanadMission ??= { phase: "none", rocks: [], carried: -1, t: 0, scoop: 0, canScoop: false, canDump: false, best: 0, v: 0 });

const subs = new Set<() => void>();
export const subscribeMission = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const bumpMission = () => { mission.v++; subs.forEach((f) => f()); };

const BEST = "wayanad-landslide-best";
export function loadBest() { try { mission.best = Number(localStorage.getItem(BEST)) || 0; } catch {} return mission.best; }
export function saveBest(sec: number) { if (!mission.best || sec < mission.best) { mission.best = sec; try { localStorage.setItem(BEST, String(Math.round(sec))); } catch {} } }

/** Asked for from the start screen: Landslide sets it up once the drive has started. */
export function requestLandslide() { mission.phase = "pending"; bumpMission(); }
/** The SCOOP / DUMP button (and E): Landslide acts on it next frame. */
export function pressScoop() { mission.scoop = 1; }
/** Rocks still to clear: on the road or in the bucket (one tumbling down the slope is done). */
export const rocksLeft = () => mission.rocks.filter((r) => r.state === "road" || r.state === "carried").length;
export const starsFor = (sec: number) => (sec <= MISSION.stars[0] ? 3 : sec <= MISSION.stars[1] ? 2 : 1);

/** The road closed by the rocks, for the traffic (components/scene/Traffic): both lanes, short of the rubble. */
export function missionBlock(): { distance: number; length: number } | null {
  return mission.phase === "work" ? { distance: MISSION.s0, length: 1.6 } : null;
}
