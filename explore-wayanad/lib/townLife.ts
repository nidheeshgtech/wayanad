/**
 * Life in the towns past the Lakkidi gate (drive mode): Kalpetta's bus stand with the buses pulling in, the pedestrian
 * crossing in front of it with its signal (the traffic stops on red, and so should you), the traffic police at the
 * junction, the auto stand and the carts; and the places to stop and spend the rupees from Churam Jobs: a petrol pump
 * (fills the nitro), a car wash (takes the dents out) and a paint garage (a new colour for this drive). Stop in a
 * place's bay for a second and it's yours. Plain mutable state like lib/jobs: the scene (components/scene/TownLife)
 * steps it, the HUD (components/drive/StationHud) reads it. The places are typical of the towns, not surveyed.
 * Road units (10 m) like game.s; `side` +1 is the road's left (your lane's side: traffic keeps left).
 */
import { CatmullRomCurve3, Vector3 } from "three";
import { game } from "@/lib/game";
import { net } from "@/lib/net";
import { spend } from "@/lib/jobs";
import { announce } from "@/lib/score";
import { chime } from "@/lib/horn";
import { haptic } from "@/lib/native";
import { chaseOn, chase, wanted } from "@/lib/chase";
import { STREETS, onStreet } from "@/lib/streets";

export type StationKind = "pump" | "wash" | "paint";
export type Station = { id: string; kind: StationKind; s: number; side: 1 | -1; town: string; name: string; price: number };
/** The places you can pull into. `s` is the bay's middle. */
export const STATIONS: Station[] = [
  { id: "pump-vythiri", kind: "pump", s: 1850, side: 1, town: "Vythiri", name: "Vythiri Fuels", price: 50 },
  { id: "paint-chundale", kind: "paint", s: 2215, side: 1, town: "Chundale", name: "Colour Garage", price: 150 },
  { id: "wash-kalpetta", kind: "wash", s: 2730, side: 1, town: "Kalpetta", name: "Splash Car Wash", price: 40 },
  { id: "pump-kalpetta", kind: "pump", s: 2744, side: 1, town: "Kalpetta", name: "Kalpetta Fuels", price: 50 },
];
export const STATION_ICON: Record<StationKind, string> = { pump: "⛽", wash: "🚿", paint: "🎨" };
/** The bay: this far either way along the road (units), on its side of the centre line past `lat`. */
export const BAY = { reach: 0.7, lat: 0.12, still: 0.04, hold: 0.8, size: { w: 1.6, d: 1.3 } };

/** Kalpetta's town centre (units along the road). */
export const KALPETTA = {
  signal: 2758,                      // the pedestrian crossing in front of the bus stand, with its signal
  busStand: { s: 2768, side: 1 as const, w: 1.5, d: 1.25 },
  shelter: { s: 2768, side: -1 as const }, // the bus shelter across the road, for the buses coming down
  autoStand: { s: 2751, side: -1 as const },
  police: { s: 2738.5, side: -1 as const }, // the traffic police on his podium at the junction (lib/streets: the bazaar street)
  carts: [{ s: 2735, side: -1 as const }, { s: 2762, side: -1 as const }, { s: 2779, side: 1 as const }],
};
/** The signal's cycle (s): green for the road, amber, then red while the people cross. */
export const CYCLE = { green: 16, amber: 3, red: 9 };

const fresh = () => ({
  t: 0,                                   // seconds into the signal's cycle (stops while paused)
  light: "green" as "green" | "amber" | "red",
  near: null as Station | null,           // the place you're in or coming up to (HUD prompt)
  wait: 0,                                // seconds stopped in its bay
  used: new Set<string>(),                // served this stop (leave the bay to use it again)
  painting: false,                        // the paint garage's card is up (StationHud)
  paint: null as string | null,           // a respray for this drive (PlayerCar paints the car)
  repaint: 0,                             // bumped on each respray
  washed: 0,                              // bumped on each wash (PlayerCar takes the dents out)
  lastS: -1,                              // where you were last frame, for crossing the line on red
  busAt: new Map<number, number>(),       // each bus's distance last frame, for pulling in at the stand
});
export const town: ReturnType<typeof fresh> = ((globalThis as { __wayanadTown?: ReturnType<typeof fresh> }).__wayanadTown ??= fresh());

/** The forecourts: the main road's edge opens this much (units) on a place's side, easing in and out along it. */
export function stationRoom(s: number, side: number) {
  let room = 0;
  for (const st of STATIONS) if (side === st.side) room = Math.max(room, 0.3 * Math.min(1, Math.max(0, (1.2 - Math.abs(s - st.s)) / 0.5)));
  return room;
}

/** The places run here: driving the main road (leg 0), not in a private room's race. */
export const townOn = () => game.started && game.phase === "drive" && game.leg === 0 && !net.party && !game.foot.on && !onStreet();

/** Each frame (TownLife): the signal, and the places. */
export function stepTown(dt: number) {
  if (game.paused) return;
  dt = Math.min(dt, 0.1);
  const T = CYCLE.green + CYCLE.amber + CYCLE.red;
  town.t = (town.t + dt) % T;
  town.light = town.t < CYCLE.green ? "green" : town.t < CYCLE.green + CYCLE.amber ? "amber" : "red";
  // through the crossing on red, going up the road: the police take note
  const s = game.s, last = town.lastS; town.lastS = s;
  if (game.leg === 0 && game.started && game.phase === "drive" && !onStreet() && last > 0 && s - last < 2 && game.speed > 0.25) {
    const line = KALPETTA.signal - 0.35;
    if (last < line && s >= line && town.light === "red") {
      if (chaseOn()) wanted("Red light, Kalpetta", { stars: 1, add: chase.stars > 0 ? 1 : 0 });
      else announce("🚦 Red light!", "loss");
    }
  }
  if (!townOn()) { town.near = null; town.wait = 0; return; }
  let near: Station | null = null;
  for (const st of STATIONS) { const d = st.s - s; if (d > -BAY.reach && d < 25 && (!near || st.s < near.s)) near = st; }
  town.near = near;
  const inBay = !!near && Math.abs(s - near.s) < BAY.reach && game.lat * near.side > BAY.lat;
  if (!inBay) { town.used.clear(); town.wait = 0; if (town.painting && !near) town.painting = false; return; }
  const still = Math.abs(game.speed) < BAY.still;
  town.wait = still ? town.wait + dt : 0;
  if (town.wait < BAY.hold || town.used.has(near!.id)) return;
  town.used.add(near!.id); town.wait = 0;
  serve(near!);
}

function serve(st: Station) {
  if (st.kind === "paint") { town.painting = true; haptic("light"); return; }
  if (st.kind === "pump" && game.nitro > 0.97) { announce("⛽ Tank full already", "badge"); return; }
  if (st.kind === "wash" && game.damage < 0.02) { announce("🚿 Car is already clean, saare!", "badge"); return; }
  if (!spend(st.price)) { announce(`₹${st.price} venam… Churam Jobs cheyyu!`, "loss"); chime(false); return; }
  if (st.kind === "pump") { game.nitro = 1; announce(`⛽ Nitro full · −₹${st.price}`, "big"); }
  else { town.washed++; announce(`🚿 Shining like new · −₹${st.price}`, "big"); }
  chime(true); haptic("success");
}

/** The paint garage's colours (StationHud). */
export const PAINTS = [
  { name: "Neon pink", hex: "#ff2d95" }, { name: "Electric blue", hex: "#2f6bff" }, { name: "Lime", hex: "#a8ff3e" },
  { name: "Cyan", hex: "#2af0ff" }, { name: "Violet", hex: "#9a4dff" }, { name: "KSRTC red", hex: "#b3191f" },
  { name: "Matte black", hex: "#141518" }, { name: "Pearl white", hex: "#f1f1ec" }, { name: "Tea green", hex: "#2e6b3f" },
];
/** Buy a respray (StationHud): false if the wallet's short. */
export function respray(hex: string) {
  const st = STATIONS.find((x) => x.kind === "paint")!;
  if (!spend(st.price)) { announce(`₹${st.price} venam… Churam Jobs cheyyu!`, "loss"); chime(false); return false; }
  town.paint = hex; town.repaint++; town.painting = false;
  announce(`🎨 New colour · −₹${st.price}`, "big"); chime(true); haptic("success");
  return true;
}

/** For the traffic (Traffic → advanceTraffic): on red and amber, the stop lines either side of the crossing. */
export function signalStops(): { distance: number; length: number; lanes: (1 | -1)[]; speed: number; keep: number }[] {
  if (town.light === "green") return [];
  return [
    { distance: KALPETTA.signal - 0.4, length: 0.02, lanes: [1], speed: 0, keep: 0.1 },
    { distance: KALPETTA.signal + 0.4, length: 0.02, lanes: [-1], speed: 0, keep: 0.1 },
  ];
}

/** The buses (KSRTC and private, kinds 0 and 7) pull in at Kalpetta's stand going up, and at the shelter coming down,
 * and stand a few seconds (advanceTraffic's `dwell`). */
const BUS_KINDS = new Set([0, 7]);
export function busStops(fleet: { id: number; kind: number; direction: 1 | -1; distance: number; dwell?: number }[]) {
  const stop = KALPETTA.busStand.s;
  for (const v of fleet) {
    if (!BUS_KINDS.has(v.kind)) continue;
    const last = town.busAt.get(v.id); town.busAt.set(v.id, v.distance);
    if (last === undefined || Math.abs(v.distance - last) > 1) continue;
    const at = stop - v.direction * 1.1; // start braking a little before
    if ((last - at) * v.direction < 0 && (v.distance - at) * v.direction >= 0) v.dwell = 7;
  }
}

/** A road frame at s: the centre point on the asphalt, along (flat), left (flat), and the yaw that faces +z along. */
export function frameAt(curve: CatmullRomCurve3, s: number) {
  const L = curve.getLength(), t = Math.min(1, Math.max(0, s / L)), p = curve.getPointAt(t), along = curve.getTangentAt(t).setY(0).normalize();
  const left = new Vector3(along.z, 0, -along.x).normalize();
  p.y -= 0.588;
  return { t, p, along, left };
}

/** Ground kept clear of the towns' buildings and trees for the places (Town's lots, Vegetation via townPlan): centre
 * and radius (units). */
export function townClear(curve: CatmullRomCurve3): { at: Vector3; radius: number }[] {
  const out: { at: Vector3; radius: number }[] = [];
  const add = (s: number, side: 1 | -1, off: number, radius: number) => { const f = frameAt(curve, s); out.push({ at: f.p.clone().addScaledVector(f.left, side * off), radius }); };
  for (const st of STATIONS) add(st.s, st.side, 0.4 + 0.15 + BAY.size.d / 2, 0.95);
  add(KALPETTA.busStand.s, 1, 0.55 + KALPETTA.busStand.d / 2, 0.95);
  add(KALPETTA.busStand.s - 0.55, 1, 0.55 + KALPETTA.busStand.d / 2, 0.7);
  add(KALPETTA.busStand.s + 0.55, 1, 0.55 + KALPETTA.busStand.d / 2, 0.7);
  add(KALPETTA.shelter.s, -1, 0.62, 0.3);
  add(KALPETTA.autoStand.s, -1, 0.7, 0.45);
  for (const c of KALPETTA.carts) add(c.s, c.side, 0.58, 0.15);
  return out;
}

/** The HUD's word (DriveHud's note line): a place coming up, the signal on red, a side street's mouth, or on one. */
export function townNote(): string {
  if (!game.started || game.phase !== "drive" || game.leg !== 0) return "";
  if (onStreet()) return chase.stars > 0 ? "🚓 They can't follow you down here · keep going!" : `${STREETS[game.street]?.name ?? "Side street"} · one way`;
  const s = game.s, n = town.near;
  if (n && n.s - s < 12 && townOn()) return `${STATION_ICON[n.kind]} ${n.name} · stop in the bay for ${n.kind === "pump" ? "a full nitro" : n.kind === "wash" ? "a wash, dents out" : "a new colour"} · ₹${n.price}`;
  const toSignal = KALPETTA.signal - 0.4 - s;
  if (toSignal > 0 && toSignal < 10 && town.light !== "green") return town.light === "red" ? "🚦 Red light · stop at the line" : "🚦 Amber · slow down";
  for (const st of STREETS) if (s > st.from - 10 && s < st.from + 2) return `↘ ${st.name} on the ${st.side > 0 ? "left" : "right"} · one way${chase.stars > 0 ? " · lose the police there!" : ""}`;
  return "";
}
