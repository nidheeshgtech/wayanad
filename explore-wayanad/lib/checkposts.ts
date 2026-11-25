/**
 * Kerala Police speed checks on the road past the Lakkidi gate (components/drive/Checkposts draws them): go through one
 * faster than the limit and you're wanted (lib/chase). A board 250 m before each says so. Road units (10 m) like game.s.
 */
import { game } from "@/lib/game";
import { chase, chaseOn, wanted } from "@/lib/chase";
import { announce } from "@/lib/score";

export const LIMIT = 60; // km/h
export const CHECKPOSTS = [
  { s: 1745, name: "Vythiri" },
  { s: 2150, name: "Chundale" },
  { s: 2620, name: "Kalpetta" },
];
export const WARN = 25; // units: the board this far before

let last = -1;
/** Each frame (Checkposts): through a check too fast, the police are after you. */
export function stepCheckposts() {
  const s = game.s;
  if (!chaseOn() || !game.started || game.phase !== "drive" || game.paused || game.leg !== 0 || game.foot.on || last < 0 || s - last > 3) { last = s; return; }
  for (const c of CHECKPOSTS) {
    if (!(last < c.s && s >= c.s)) continue;
    const kmh = Math.abs(game.speed) * 36;
    if (kmh > LIMIT) wanted(`Speed check, ${c.name}: ${Math.round(kmh)} km/h`, { stars: kmh > 95 || game.boosting ? 2 : 1, add: chase.stars > 0 ? 1 : 0 });
    else announce(`🚔 ${c.name} speed check · ${Math.round(kmh)} km/h, OK`, "badge");
  }
  last = s;
}

/** The HUD's word as you come up to a check. */
export function checkNote(): string {
  if (!chaseOn() || game.leg !== 0 || game.phase !== "drive") return "";
  const c = CHECKPOSTS.find((x) => x.s - game.s > 0 && x.s - game.s < WARN);
  if (!c) return "";
  const fast = Math.abs(game.speed) * 36 > LIMIT;
  return `🚔 Police speed check ahead · ${LIMIT} km/h${fast ? " · slow down!" : ""}`;
}
