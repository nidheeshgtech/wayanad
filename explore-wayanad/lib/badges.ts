/**
 * Badges: small awards for things done on the climb, kept on this device (localStorage) — collect all nine. Earning one
 * floats "🏅 …" up from the car (lib/score's pops) with a chime; the end card and the pause menu show the set.
 *
 * Counters that need time (rain, night) run per climb; coins count across every climb on the device.
 */
import { announce } from "@/lib/score";
import { chime } from "@/lib/horn";

export type BadgeId = "finish" | "clean" | "hairpins" | "fast" | "coins" | "monkey" | "rain" | "night" | "friend";
export const BADGES: { id: BadgeId; icon: string; name: string; how: string }[] = [
  { id: "finish", icon: "🏁", name: "Reached Wayanad", how: "Drive up to the Lakkidi gate" },
  { id: "clean", icon: "✨", name: "Clean climb", how: "Reach the gate without hitting a vehicle" },
  { id: "hairpins", icon: "🪙", name: "Hairpin hero", how: "Pick up all nine hairpin coins in one climb" },
  { id: "fast", icon: "⏱️", name: "Quick climb", how: "Reach the gate in under 13 minutes" },
  { id: "coins", icon: "💰", name: "Coin collector", how: "Pick up 500 coins in all" },
  { id: "monkey", icon: "🐒", name: "Monkey rider", how: "Give a monkey a ride" },
  { id: "rain", icon: "🌧️", name: "Rain driver", how: "Drive two minutes in the rain" },
  { id: "night", icon: "🌙", name: "Night driver", how: "Drive two minutes at night" },
  { id: "friend", icon: "🤝", name: "Road buddy", how: "Drive with another player on the road" },
];
export const COIN_GOAL = 500, FAST_SEC = 13 * 60;
const KEY = "wayanad-badges", COINS = "wayanad-coins", TIMED = 120; // seconds of rain / night

type State = { earned: BadgeId[]; fresh: BadgeId[]; coins: number; rainT: number; nightT: number; loaded: boolean };
export const badges: State = ((globalThis as { __wayanadBadges?: State }).__wayanadBadges ??= { earned: [], fresh: [], coins: 0, rainT: 0, nightT: 0, loaded: false });

function load() {
  if (badges.loaded) return;
  badges.loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]") as BadgeId[];
    badges.earned = saved.filter((id) => BADGES.some((b) => b.id === id));
    badges.coins = Number(localStorage.getItem(COINS)) || 0;
  } catch {}
}
/** Badges earned on this device (read once, in the browser). */
export function earned() { load(); return badges.earned; }

export function award(id: BadgeId) {
  load();
  if (badges.earned.includes(id)) return;
  badges.earned = [...badges.earned, id]; badges.fresh = [...badges.fresh, id];
  try { localStorage.setItem(KEY, JSON.stringify(badges.earned)); } catch {}
  const b = BADGES.find((x) => x.id === id)!;
  announce(`🏅 ${b.icon} ${b.name}`); chime(true);
}

/** A new climb: the timed counters and "new this climb" start again. */
export function startRun() { load(); badges.fresh = []; badges.rainT = 0; badges.nightT = 0; }

/** Each frame on the move: time in the rain and in the dark. */
export function tickBadges(dt: number, rain: number, night: number, speed: number) {
  if (Math.abs(speed) < 0.1) return;
  if (rain > 0.35 && (badges.rainT += dt) >= TIMED) award("rain");
  if (night > 0.6 && (badges.nightT += dt) >= TIMED) award("night");
}

export function countCoin() {
  load();
  badges.coins++;
  if (badges.coins % 10 === 0) try { localStorage.setItem(COINS, String(badges.coins)); } catch {}
  if (badges.coins >= COIN_GOAL) award("coins");
}

/** At the gate (a whole climb, not one started part-way): the climb's own badges. */
export function finishBadges({ crashes, hairpins, sec }: { crashes: number; hairpins: number; sec: number }) {
  try { localStorage.setItem(COINS, String(badges.coins)); } catch {}
  award("finish");
  if (crashes === 0) award("clean");
  if (hairpins >= 9) award("hairpins");
  if (sec < FAST_SEC) award("fast");
}
