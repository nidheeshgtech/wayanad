/**
 * Wayanad live (the room server's /live: multiplayer/src/live.ts): the real Kalpetta weather, today's sunrise and
 * sunset, the space station's track, real flights overhead, how many are playing and where, today's totals and the
 * fastest climb. Asked for when drive mode opens and every POLL ms while the page is visible; each call also reports
 * what this game did since the last (km, chayas, jobs, a finished climb) under a random id made for this visit.
 * Off when there's no room server (NEXT_PUBLIC_MP_URL).
 */
import { game } from "@/lib/game";
import { applyRealWeather, type WeatherName } from "@/lib/weather";
import { followRealSky } from "@/lib/theme";

const BASE = (process.env.NEXT_PUBLIC_MP_URL ?? "").replace(/\/$/, "");
const POLL = 90_000;

export type Plane = { id: string; call: string; lat: number; lon: number; alt: number; gs: number; track: number; at: number };
type Answer = {
  weather: { temp: number; code: number; rain: number; cloud: number; day: boolean } | null;
  sun: [number, number] | null; iss: number[][]; planes: Plane[]; online: number; drivers: number[][];
  today: { km: number; chaya: number; jobs: number; drives: number }; top: { name: string; sec: number } | null;
};
type LiveState = Answer & { ok: boolean; at: number; v: number };
/** (one object for the page, like lib/game's: the scene and the HUD load in different chunks) */
export const live: LiveState = ((globalThis as { __wayanadLive?: LiveState }).__wayanadLive ??= {
  ok: false, at: 0, v: 0, weather: null, sun: null, iss: [], planes: [], online: 0, drivers: [], today: { km: 0, chaya: 0, jobs: 0, drives: 0 }, top: null,
});

const id = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6);
const out = { odo: -1, chaya: 0, jobs: 0, climb: null as null | { name: string; sec: number } };
/** Something worth counting in today's totals (lib/townLife's thattukada, the tea stall, a job paid). */
export function liveCount(what: "chaya" | "jobs") { out[what]++; }
/** A finished churam climb (not one started part-way): for today's fastest, with the driver's name. */
export function liveClimb(name: string, sec: number) { if (!out.climb || sec < out.climb.sec) out.climb = { name, sec }; }

let timer = 0, busy = false;
async function call() {
  if (!BASE || busy || document.visibilityState !== "visible") return;
  busy = true;
  const odo = game.odometer, km = out.odo < 0 || odo < out.odo ? 0 : ((odo - out.odo) * 10) / 1000;
  const body = { id, leg: game.leg, s: Math.round(game.s * 10) / 10, km: Math.round(km * 100) / 100, chaya: out.chaya, jobs: out.jobs, climb: out.climb ?? undefined };
  try {
    // (text/plain: a "simple" request, so no CORS preflight before each one)
    const r = await fetch(`${BASE}/live`, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(body) });
    if (r.ok) {
      Object.assign(live, (await r.json()) as Answer, { ok: true, at: Date.now() }); live.v++;
      out.odo = odo; out.chaya = 0; out.jobs = 0; out.climb = null;
      applyRealWeather(realWeather()); followRealSky(live.sun);
    }
  } catch {}
  busy = false;
}
/** Drive mode's HUD: start asking (once), and keep the sky on the real clock between answers. */
export function startLive() {
  if (timer || typeof window === "undefined") return;
  void call();
  timer = window.setInterval(() => void call(), POLL);
  window.setInterval(() => followRealSky(live.sun), 60_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - live.at > POLL) void call(); });
}

// ---- the weather in words (WMO codes, as Open-Meteo gives them) ----
const KINDS: [number[], WeatherName, string, string][] = [
  [[0, 1], "clear", "clear sky", "theli maanam"],
  [[2], "partly", "a few clouds", "kurachu megham"],
  [[3], "overcast", "cloudy", "kaar moodi"],
  [[45, 48], "mist", "misty", "kodamanju"],
  [[51, 53, 55, 56, 57], "drizzle", "drizzle", "chaaral mazha"],
  [[61, 80], "drizzle", "light rain", "cheriya mazha"],
  [[63, 66, 81], "rain", "rain", "mazha"],
  [[65, 67, 82], "downpour", "heavy rain", "nalla mazha"],
  [[95, 96, 99], "downpour", "thunderstorm", "idiyum minnalum"],
  [[71, 73, 75, 77, 85, 86], "overcast", "cloudy", "kaar moodi"],
];
const kindOf = (code: number) => KINDS.find(([c]) => c.includes(code));
/** The game's weather nearest the real one now, or null before the first answer. */
export function realWeather(): WeatherName | null { return live.weather ? kindOf(live.weather.code)?.[1] ?? null : null; }
/** "21°C · light rain" (English) and "21 degree, cheriya mazha" (the radio's Manglish). */
export function weatherWords() {
  const w = live.weather; if (!w) return null;
  const k = kindOf(w.code), en = k?.[2] ?? "", ml = k?.[3] ?? "";
  return { en: `${w.temp}°C · ${w.day || k?.[1] !== "clear" ? en : "clear night"}`, ml: `${w.temp} degree, ${w.day || k?.[1] !== "clear" ? ml : "nakshathrangal kaanaam"}` };
}

// ---- the sky: the space station and the flights, where they are now ----
const R = 6371; // km
const rad = (d: number) => (d * Math.PI) / 180;
/** Ground distance (km) and the bearing (deg from north) from (lat, lon) to (lat2, lon2). */
export function distBearing(lat: number, lon: number, lat2: number, lon2: number) {
  const p1 = rad(lat), p2 = rad(lat2), dl = rad(lon2 - lon);
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return { km: 2 * R * Math.asin(Math.min(1, Math.sqrt(a))), bearing: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 };
}
/** How high above the horizon (deg) something at altitude `altKm`, `km` away over the ground, looks from 0.8 km up. */
export function elevation(km: number, altKm: number) {
  const th = km / R, r1 = R + 0.8, r2 = R + altKm;
  return (Math.atan2(r2 * Math.cos(th) - r1, r2 * Math.sin(th)) * 180) / Math.PI;
}
/** The space station now: { lat, lon, alt } between the ten-minute track's points, or null past its end. */
export function issNow(now = Date.now()) {
  const t = live.iss; if (t.length < 2) return null;
  for (let i = 0; i < t.length - 1; i++) {
    const [a, b] = [t[i], t[i + 1]];
    if (now < a[0] || now > b[0]) continue;
    const f = (now - a[0]) / (b[0] - a[0]); let dl = b[2] - a[2]; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
    return { lat: a[1] + (b[1] - a[1]) * f, lon: ((a[2] + dl * f + 540) % 360) - 180, alt: a[3] + (b[3] - a[3]) * f };
  }
  return null;
}
/** A flight now: moved on along its track at its ground speed since it was seen (up to 8 minutes; then dropped). */
export function planeNow(p: Plane, now = Date.now()) {
  const sec = (now - p.at) / 1000; if (sec > 480) return null;
  const d = (p.gs * sec) / 1000 / R, br = rad(p.track), p1 = rad(p.lat), l1 = rad(p.lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
  const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: (p2 * 180) / Math.PI, lon: (l2 * 180) / Math.PI, alt: p.alt };
}
/** "6E 1234" from "IGO1234" for the airlines flying here; others as sent. */
const AIRLINES: Record<string, string> = { IGO: "6E", AIC: "AI", AXB: "IX", IAD: "I5", AKJ: "QP", SEJ: "SG", UAE: "EK", ABY: "G9", ETD: "EY", QTR: "QR", FDB: "FZ", KAC: "KU", OMA: "WY", GFA: "GF", SVA: "SV", ALK: "UL", MAS: "MH" };
export function flightName(call: string) {
  const m = call.match(/^([A-Z]{3})(\d+[A-Z]?)$/);
  return m && AIRLINES[m[1]] ? `${AIRLINES[m[1]]} ${m[2]}` : call || "a flight";
}

/** What's overhead now (components/scene/LiveSky fills it each frame): the space station if it's up, the nearest
 * real flight in sight. The HUD's note line reads it (skyNote). */
export const skyNow = { iss: null as null | { elev: number; bearing: number }, plane: null as null | { name: string; alt: number; km: number; bearing: number } };
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const toward = (b: number) => COMPASS[Math.round(b / 45) % 8];
export function skyNote() {
  if (skyNow.iss && skyNow.iss.elev > 8) return `🛰 Live: the space station is crossing the Wayanad sky now · look ${toward(skyNow.iss.bearing)}, ${Math.round(skyNow.iss.elev)}° up`;
  const p = skyNow.plane;
  if (p && p.km < 30) return `✈ Live: real flight ${p.name} above you · ${(Math.round(p.alt / 100) * 100).toLocaleString("en-IN")} m up, to the ${toward(p.bearing)}`;
  return "";
}
