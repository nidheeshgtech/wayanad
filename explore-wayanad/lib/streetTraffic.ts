/**
 * Traffic on the side streets (lib/streets): autos and bikes going the one way along each street at bazaar pace,
 * queueing behind each other and behind you, waiting at the GIVE WAY before they turn back onto the highway (and
 * starting again at the street's mouth when you're well away from both ends, so nobody sees them come and go).
 * They're the highway traffic's own kind of Vehicle (lib/traffic), so the player's car hits them the same way
 * (collidePlayer: bikes go over, autos stop askew). Plain mutable state; components/scene/StreetTraffic draws them,
 * PlayerCar collides with them. Units of 10 m, speeds in units a second (1 ≈ 36 km/h).
 */
import { VEHICLES, isTwoWheeler, type Vehicle } from "@/lib/traffic";
import { CAR, game } from "@/lib/game";
import { street } from "@/lib/streets";
import type { Street } from "@/lib/streets";

export const AUTO = VEHICLES.findIndex((v) => v.name === "auto-real");
export const BIKE = VEHICLES.findIndex((v) => v.name === "pulsar-real");
/** Bazaar pace (units/s): autos ~16 km/h, bikes ~22. */
const CRUISE = { auto: 0.45, bike: 0.6 };
const GAP = 0.12; // bumper to bumper, queueing
const END = 0.6;  // how far short of the street's end they wait (the GIVE WAY line)

export type StreetCar = Vehicle & { lane: number; cruise: number };
const fresh = () => ({ fleets: [] as StreetCar[][], built: null as Street[] | null });
export const streetTraffic: ReturnType<typeof fresh> = ((globalThis as { __wayanadStreetTraffic?: ReturnType<typeof fresh> }).__wayanadStreetTraffic ??= fresh());

/** The vehicles on each street, spaced along it (fewer on a phone). */
export function makeStreetFleets(list: Street[], small: boolean) {
  let id = 9000;
  streetTraffic.fleets = list.map((st) => {
    const n = Math.max(1, Math.round((st.length / 11) * (small ? 0.5 : 1)));
    return Array.from({ length: n }, (_, i): StreetCar => {
      const bike = i % 2 === 1, kind = bike ? BIKE : AUTO;
      return { id: id++, kind, direction: 1, distance: 2 + (i + 0.5) * ((st.length - 4) / n), speed: 0, lane: bike ? -0.08 : 0, slide: bike ? -0.08 : 0, cruise: bike ? CRUISE.bike : CRUISE.auto };
    });
  });
  streetTraffic.built = list;
  return streetTraffic.fleets;
}

/**
 * Each frame. `away(i)`: true when the camera is well away from both ends of street i (vehicles waiting at its end may
 * start again at its mouth).
 */
export function stepStreetTraffic(dt: number, away: (i: number) => boolean) {
  const list = streetTraffic.built; if (!list) return;
  const k = Math.min(dt, 0.1);
  streetTraffic.fleets.forEach((fleet, i) => {
    const st = list[i], mine = game.street === i, spec = (v: Vehicle) => VEHICLES[v.kind];
    for (const v of fleet) {
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
      // the one ahead: another vehicle, or you (when you're in its way across the street)
      const me = spec(v);
      let room = Infinity, theirs = 0;
      for (const o of fleet) {
        if (o === v || o.distance <= v.distance) continue;
        const g = o.distance - v.distance - (me.length + spec(o).length) / 2 - GAP;
        if (g < room) { room = g; theirs = o.speed; }
      }
      if (mine) {
        const myLat = 0.16 + (v.slide ?? 0), g = street.s - v.distance - me.length / 2 - CAR.halfL - GAP;
        if (street.s > v.distance && Math.abs(street.lat - myLat) < me.width / 2 + CAR.halfW + 0.04 && g < room) { room = g; theirs = Math.max(0, game.speed); }
      }
      room = Math.min(room, st.length - END - v.distance);
      const want = Math.max(0, Math.min(v.cruise, theirs + room * 1.6));
      v.speed += (want - v.speed) * (1 - Math.exp(-k * (want < v.speed ? 4 : 1.2)));
      v.distance += v.speed * k;
    }
    // waiting at the end with nobody looking: round again from the street's mouth (if the mouth is clear)
    for (const v of fleet) {
      if (v.distance < st.length - END - 0.05 || !away(i)) continue;
      const first = Math.min(...fleet.filter((o) => o !== v).map((o) => o.distance), Infinity);
      if (first < 1.6) continue;
      Object.assign(v, { distance: 0.8, speed: v.cruise * 0.6, slide: v.lane, skid: 0, skidLat: 0, down: 0, fall: 0, jolt: 0 });
    }
  });
}

export const twoWheeler = (v: Vehicle) => isTwoWheeler(v.kind);
