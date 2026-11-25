/**
 * Traffic on the side streets (lib/streets): autos, bikes, scooters with a pillion rider and the fish seller's bike,
 * going the one way along each street at bazaar pace. They come up the highway in its left lane, turn off into the
 * street, queue behind each other and behind you, and turn back onto the highway at the far end, driving on up it a
 * while before they're gone (and come round again from down the road when nobody's looking at either place).
 *
 * One coordinate for the whole trip, `distance`: below 0 it's on the highway before the street's mouth (main-road s
 * = from + distance), 0…length on the street, past length on the highway after it (s = to + distance − length).
 * They're the highway traffic's own kind of Vehicle (lib/traffic), so the player's car hits them the same way
 * (collidePlayer: bikes go over, autos stop askew). Plain mutable state; components/scene/StreetTraffic draws them,
 * PlayerCar collides with them, Traffic keeps the highway's own traffic off them. Units of 10 m, speeds in units a
 * second (1 ≈ 36 km/h).
 */
import type { CatmullRomCurve3 } from "three";
import { VEHICLES, collidePlayer, isTwoWheeler, type Obstacle, type Player, type Vehicle } from "@/lib/traffic";
import { CAR, game } from "@/lib/game";
import { legRoad, street } from "@/lib/streets";
import type { Road, Street } from "@/lib/streets";

export const AUTO = VEHICLES.findIndex((v) => v.name === "auto-real");
export const BIKE = VEHICLES.findIndex((v) => v.name === "pulsar-real");
/** Bazaar pace (units/s): autos ~16 km/h, bikes ~22; on the highway a little quicker. */
const CRUISE = { auto: 0.45, bike: 0.6, main: 1.35 };
const GAP = 0.12;     // bumper to bumper, queueing
export const RUN = 6; // units of highway each side: where they come from and go on to
const GONE = 25;      // …and how far on up it they drive at most while someone's watching
/** Across the road (left of its centre line): the lane on the street, and on the highway (lib/traffic lanePoint). */
export const LANE = { street: 0.16, main: 0.2 };

/** What it is: an auto, a bike, a scooter with a pillion rider, the fish seller's bike with its crate. */
export type Look = "auto" | "bike" | "pillion" | "fish";
export type StreetCar = Vehicle & { lane: number; cruise: number; look: Look; off?: boolean };
/** Each road's streets (lib/streets streets()) and the vehicles on each. */
type Pack = { fleets: StreetCar[][]; built: Street[] | null };
const fresh = () => ({ by: { churam: { fleets: [], built: null }, forest: { fleets: [], built: null } } as Record<Road, Pack> });
export const streetTraffic: ReturnType<typeof fresh> = ((globalThis as { __wayanadStreetTraffic?: ReturnType<typeof fresh> }).__wayanadStreetTraffic ??= fresh());
/** The vehicles on each street of a road. */
export const fleetsOf = (road: Road) => streetTraffic.by[road].fleets;

const LOOKS: Look[] = ["auto", "pillion", "auto", "fish", "bike", "auto", "pillion"];
/** The vehicles on each street, spaced along it (fewer on a phone), and one or two waiting down the road. */
export function makeStreetFleets(list: Street[], small: boolean, road: Road) {
  let id = road === "forest" ? 9500 : 9000;
  const fleets = list.map((st, si) => {
    const n = Math.max(2, Math.round((st.length / 9) * (small ? 0.5 : 1)) + 1);
    return Array.from({ length: n }, (_, i): StreetCar => {
      const look = LOOKS[(i + si * 2) % LOOKS.length], bike = look !== "auto";
      const on = i < n - 1; // (the last starts off down the road)
      return { id: id++, kind: bike ? BIKE : AUTO, look, direction: 1, distance: on ? 2 + (i + 0.5) * ((st.length - 4) / (n - 1)) : -RUN, speed: 0,
        lane: bike ? -0.08 : 0, slide: bike ? -0.08 : 0, cruise: bike ? CRUISE.bike : CRUISE.auto, off: !on };
    });
  });
  return fleets;
}

/** Main-road s for a trip distance off the street (below 0 or past its length). */
export const mainOf = (st: Street, d: number) => (d < 0 ? st.from + d : st.to + d - st.length);
export const onMain = (st: Street, v: StreetCar) => !v.off && (v.distance < 0 || v.distance > st.length);

/** You, in street i's trip coordinate and across its road there (null if you're nowhere along it). */
function you(i: number, st: Street, d: number, road: Road): { at: number; lat: number; lane: number } | null {
  if (legRoad() !== road) return null;
  if (game.street === i) return d >= 0 && d <= st.length ? { at: street.s, lat: street.lat, lane: LANE.street } : null;
  if (game.street >= 0) return null;
  if (d < 0 && game.s >= st.from - RUN - 2 && game.s <= st.from + 0.5) return { at: game.s - st.from, lat: game.lat, lane: LANE.main };
  if (d > st.length - 1 && game.s >= st.to - 0.5 && game.s <= st.to + GONE + 2) return { at: st.length + game.s - st.to, lat: game.lat, lane: LANE.main };
  return null;
}

/**
 * Each frame. `away(i, end)`: true when the camera is well away from street i's highway start (end 0) or end (end 1)
 * point, where they come and go.
 */
export function stepStreetTraffic(dt: number, away: (i: number, end: 0 | 1) => boolean, road: Road) {
  const { built: list, fleets } = streetTraffic.by[road]; if (!list) return;
  const k = Math.min(dt, 0.1);
  fleets.forEach((fleet, i) => {
    const st = list[i], spec = (v: Vehicle) => VEHICLES[v.kind];
    for (const v of fleet) {
      if (v.off) {
        // round again from down the road, once nobody's looking there and the way's clear
        if (away(i, 0) && !fleet.some((o) => !o.off && o.distance < -RUN + 1.6)) Object.assign(v, { off: false, distance: -RUN, speed: CRUISE.main * 0.8, slide: v.lane, skid: 0, skidLat: 0, down: 0, fall: 0, jolt: 0 });
        continue;
      }
      // knocked over (a bike) or knocked askew (an auto): lying there / stopped a while
      if ((v.down ?? 0) > 0) { v.down = Math.max(0, v.down! - k); v.speed = 0; v.fall = Math.min(1, (v.fall ?? 0) + k * 3); }
      else if ((v.fall ?? 0) > 0) v.fall = Math.max(0, v.fall! - k * 1.5);
      if ((v.jolt ?? 0) > 0) { v.jolt = Math.max(0, v.jolt! - k); v.speed = 0; }
      // thrown by a hit: sliding on, then back to its line
      if (v.skid) { v.distance += v.skid * k; v.skid *= Math.exp(-k * 3); if (Math.abs(v.skid) < 0.01) v.skid = 0; }
      if (v.skidLat) { v.slide = (v.slide ?? 0) + v.skidLat * k; v.skidLat *= Math.exp(-k * 3); if (Math.abs(v.skidLat) < 0.01) v.skidLat = 0; }
      v.slide = Math.max(-0.3, Math.min(0.12, v.slide ?? 0));
      if ((v.down ?? 0) > 0 || (v.jolt ?? 0) > 0 || (v.fall ?? 0) > 0.05) continue;
      v.slide += (v.lane - (v.slide ?? 0)) * (1 - Math.exp(-k * 1.2));
      // the one ahead: another of them, or you (when you're in its way)
      const me = spec(v);
      let room = Infinity, theirs = 0;
      for (const o of fleet) {
        if (o === v || o.off || o.distance <= v.distance) continue;
        const g = o.distance - v.distance - (me.length + spec(o).length) / 2 - GAP;
        if (g < room) { room = g; theirs = o.speed; }
      }
      const y = you(i, st, v.distance, road);
      if (y && y.at > v.distance && Math.abs(y.lat - (y.lane + (v.slide ?? 0))) < me.width / 2 + CAR.halfW + 0.04) {
        const g = y.at - v.distance - me.length / 2 - CAR.halfL - GAP;
        if (g < room) { room = g; theirs = Math.max(0, game.speed); }
      }
      // brisker on the highway, bazaar pace on the street (easing between at the mouths)
      const out = v.distance < 0 ? -v.distance : v.distance > st.length ? v.distance - st.length : 0;
      const cruise = v.cruise + (CRUISE.main - v.cruise) * Math.min(1, out / 3);
      const want = Math.max(0, Math.min(cruise, theirs + room * 1.6));
      v.speed += (want - v.speed) * (1 - Math.exp(-k * (want < v.speed ? 4 : 1.2)));
      v.distance += v.speed * k;
      // gone on up the road: off, once nobody's watching (or far enough on that it doesn't matter)
      if (v.distance > st.length + RUN && (away(i, 1) || v.distance > st.length + GONE)) v.off = true;
    }
  });
}

/** For the highway's own traffic (Traffic): theirs on the highway, to keep clear of. */
export function streetBlocks(): Obstacle[] {
  const { built: list, fleets } = streetTraffic.by.churam, out: Obstacle[] = []; if (!list || game.leg !== 0) return out;
  fleets.forEach((fleet, i) => { for (const v of fleet) if (onMain(list[i], v)) out.push({ distance: mainOf(list[i], v.distance), length: VEHICLES[v.kind].length, lanes: [1], speed: v.speed }); });
  return out;
}

/** You on the highway against theirs on it (near the streets' ends): collidePlayer on the highway, then back. */
export function collideOnMain(main: CatmullRomCurve3, widen: (t: number) => number, p: Player, road: Road) {
  const { built: list, fleets } = streetTraffic.by[road]; let knock = 0; if (!list) return 0;
  fleets.forEach((fleet, i) => {
    const st = list[i], on = fleet.filter((v) => onMain(st, v) && Math.abs(mainOf(st, v.distance) - p.s) < 2);
    if (!on.length) return;
    const proxies = on.map((v) => ({ ...v, distance: mainOf(st, v.distance) }));
    knock = Math.max(knock, collidePlayer(proxies, main, widen, p));
    proxies.forEach((q, j) => { const v = on[j], d = q.distance - mainOf(st, v.distance); Object.assign(v, q, { distance: v.distance + d }); });
  });
  return knock;
}

export const twoWheeler = (v: Vehicle) => isTwoWheeler(v.kind);
