/**
 * The Kerala Forest Department in Muthanga Wildlife Sanctuary, on the forest road (leg 1): slow through the sanctuary,
 * and two forest checks on the way to the border where a guard notes your speed. Over the limit at a check and it's a
 * fine out of the wallet (lib/jobs forestFine), no chase: the guard has your number. components/drive/ForestPosts draws
 * them. Road units (10 m) along the forest road from Sulthan Bathery. The sanctuary's limit here is the game's: verify.
 */
import { game } from "@/lib/game";
import { net } from "@/lib/net";
import { announce } from "@/lib/score";
import { forestFine } from "@/lib/jobs";

export const SANCTUARY = { from: 1375, to: 2025, limit: 40 };
export const FOREST_POSTS = [{ s: 1470, name: "Muthanga" }, { s: 1820, name: "Ponkuzhi" }];
export const POST_WARN = 25; // units: the board this far before

let last = -1;
const on = () => game.started && game.phase === "drive" && game.leg === 1 && !game.paused && !game.foot.on && !net.party;
/** Each frame (ForestPosts). */
export function stepForestPosts() {
  const s = game.s;
  if (!on() || last < 0 || Math.abs(s - last) > 3) { last = s; return; }
  for (const p of FOREST_POSTS) {
    if (!(last < p.s && s >= p.s)) continue;
    const kmh = Math.abs(game.speed) * 36;
    if (kmh > SANCTUARY.limit + 2) forestFine(Math.round(kmh), SANCTUARY.limit, p.name);
    else announce(`🌳 ${p.name} forest check · ${Math.round(kmh)} km/h, OK`, "badge");
  }
  if (last < SANCTUARY.from && s >= SANCTUARY.from) announce("🐘 Muthanga Wildlife Sanctuary · 40 km/h", "big");
  last = s;
}

/** The HUD's word: coming up to a check, or just into the sanctuary. */
export function forestNote(): string {
  if (!game.started || game.phase !== "drive" || game.leg !== 1) return "";
  const s = game.s, fast = Math.abs(game.speed) * 36 > SANCTUARY.limit;
  const p = FOREST_POSTS.find((x) => x.s - s > 0 && x.s - s < POST_WARN);
  if (p) return `🌳 Forest check ahead · ${SANCTUARY.limit} km/h${fast ? " · slow down!" : ""}`;
  if (s > SANCTUARY.from - 12 && s < SANCTUARY.from + 15) return `🐘 Muthanga Wildlife Sanctuary · ${SANCTUARY.limit} km/h · don't stop, don't feed the animals`;
  if (s > SANCTUARY.from && s < SANCTUARY.to && fast) return `🐘 Sanctuary · ${SANCTUARY.limit} km/h · forest guards check speeds`;
  return "";
}
