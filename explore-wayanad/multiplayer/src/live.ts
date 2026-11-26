/**
 * Wayanad live: one Durable Object (one instance, "live") that every game asks about every ~90 s while it's open.
 *
 *  POST /live  body (text/plain JSON) { id, leg, s, km, chaya, jobs, climb?: { name, sec } }
 *              id: a random id the browser made for this visit (no name, no account); leg/s: where on the road it is;
 *              km / chaya / jobs: what it did since its last call (added to today's totals, clamped to what's possible);
 *              climb: a finished churam climb, for today's fastest (the name cleaned like the rooms' names).
 *  GET  /live  the same answer without reporting anything (the title screen before Start).
 *
 * Answer: { weather, sun, iss, planes, online, drivers, today, top }
 *  weather  Kalpetta now (Open-Meteo, refreshed every 10 min): { temp, code, rain, cloud, day }
 *  sun      today's sunrise and sunset in Wayanad, ms since 1970
 *  iss      the space station's ground track over the next ten minutes: [[ms, lat, lon, altKm], …] (wheretheiss.at, every 5 min)
 *  planes   flights within ~280 km (the website's /api/planes: adsb.lol, adsb.fi or OpenSky; every 4 min): [{ id, call, lat, lon, alt (m),
 *           gs (m/s), track (deg), at (ms) }]; the game moves them on along their track between refreshes
 *  online   games open in the last 3 minutes; drivers: where up to 60 of them are, [[leg, s], …]
 *  today    { km, chaya, jobs, drives } since midnight in India; top: today's fastest climb { name, sec } or null
 *
 * Totals live in memory and are written to storage at most once a minute (the free plan counts writes).
 */
import { cleanName } from "./names";

const WAYANAD = { lat: 11.61, lon: 76.08 };
const SEEN = 3 * 60_000;            // a game counts as online this long after its last call
const MIN_CLIMB = 150;              // s: a churam climb faster than this isn't possible (top speed alone is ~5 min)
const CAP = { km: 8, chaya: 3, jobs: 3 }; // most one call can add (90 s apart, nitro all the way: ~6 km)
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "content-type" };

type Today = { day: string; km: number; chaya: number; jobs: number; drives: number; top: { name: string; sec: number } | null };
type Plane = { id: string; call: string; lat: number; lon: number; alt: number; gs: number; track: number; at: number };
type Weather = { temp: number; code: number; rain: number; cloud: number; day: boolean };

/** The date in India (midnight there resets today's totals). */
const dayOf = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);
const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0; };

export class Live {
  private today: Today = { day: "", km: 0, chaya: 0, jobs: 0, drives: 0, top: null };
  private seen = new Map<string, { at: number; leg: number; s: number }>();
  private savedAt = 0; private dirty = false;
  private cache: { weather?: { at: number; v: Weather | null; sun: [number, number] | null }; iss?: { at: number; v: number[][] }; planes?: { at: number; v: Plane[] } } = {};
  private hits = new Map<string, { n: number; at: number }>();
  private planesWhy = ""; // (the flights' last fetch: GET /live?why=1 shows it)

  constructor(private state: DurableObjectState, private env: { PLANES_URL?: string }) {
    state.blockConcurrencyWhile(async () => { this.today = (await state.storage.get<Today>("today")) ?? this.today; });
  }

  async fetch(req: Request): Promise<Response> {
    const now = Date.now();
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (this.today.day !== dayOf(now)) { this.today = { day: dayOf(now), km: 0, chaya: 0, jobs: 0, drives: 0, top: null }; this.dirty = true; }
    let me = "";
    if (req.method === "POST" && !this.limited(req)) {
      const b = await req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
      const id = String(b.id ?? "").slice(0, 24);
      me = id;
      if (/^[a-z0-9]{6,24}$/.test(id)) {
        if (!this.seen.has(id)) this.today.drives++;
        this.seen.set(id, { at: now, leg: b.leg === 1 ? 1 : 0, s: num(b.s, 0, 5000) });
        this.today.km += num(b.km, 0, CAP.km); this.today.chaya += Math.round(num(b.chaya, 0, CAP.chaya)); this.today.jobs += Math.round(num(b.jobs, 0, CAP.jobs));
        const c = b.climb as { name?: unknown; sec?: unknown } | undefined, sec = num(c?.sec, 0, 36000);
        if (c && sec >= MIN_CLIMB && (!this.today.top || sec < this.today.top.sec)) this.today.top = { name: cleanName(String(c.name ?? "")), sec: Math.round(sec * 10) / 10 };
        this.dirty = true;
      }
    }
    for (const [id, p] of this.seen) if (now - p.at > SEEN) this.seen.delete(id);
    if (this.seen.size > 20000) this.seen.clear();
    if (this.dirty && now - this.savedAt > 60_000) { this.savedAt = now; this.dirty = false; await this.state.storage.put("today", this.today); }

    const [w, iss, planes] = await Promise.all([this.weather(now), this.iss(now), this.planes(now)]);
    const drivers: number[][] = [];
    for (const [pid, p] of this.seen) { if (drivers.length >= 60) break; if (pid === me) continue; drivers.push([p.leg, Math.round(p.s * 10) / 10]); }
    const t = this.today, today = { km: Math.round(t.km), chaya: t.chaya, jobs: t.jobs, drives: t.drives };
    if (new URL(req.url).searchParams.has("why")) return Response.json({ planes: this.planesWhy, n: planes.length }, { headers: CORS });
    return Response.json({ weather: w.v, sun: w.sun, iss, planes, online: this.seen.size, drivers, today, top: t.top }, { headers: { ...CORS, "Cache-Control": "no-store" } });
  }

  /** At most 6 reports a minute from one address. */
  private limited(req: Request) {
    const ip = req.headers.get("CF-Connecting-IP") ?? "local", now = Date.now(), h = this.hits.get(ip);
    if (!h || now - h.at > 60_000) { this.hits.set(ip, { n: 1, at: now }); if (this.hits.size > 5000) this.hits.clear(); return false; }
    return ++h.n > 6;
  }

  private async weather(now: number) {
    const c = this.cache.weather;
    if (c && now - c.at < 10 * 60_000) return c;
    const next = { at: now, v: c?.v ?? null, sun: c?.sun ?? null };
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${WAYANAD.lat}&longitude=${WAYANAD.lon}&current=temperature_2m,weather_code,precipitation,cloud_cover,is_day&daily=sunrise,sunset&timezone=GMT&forecast_days=1`);
      const j = await r.json<{ current: { temperature_2m: number; weather_code: number; precipitation: number; cloud_cover: number; is_day: number }; daily: { sunrise: string[]; sunset: string[] } }>();
      next.v = { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, rain: j.current.precipitation, cloud: j.current.cloud_cover, day: j.current.is_day === 1 };
      next.sun = [Date.parse(j.daily.sunrise[0] + "Z"), Date.parse(j.daily.sunset[0] + "Z")];
    } catch { if (c) next.at = c.at + 60_000; } // (a failed fetch is tried again in a minute)
    return (this.cache.weather = next);
  }

  private async iss(now: number) {
    const c = this.cache.iss;
    if (c && now - c.at < 5 * 60_000) return c.v;
    let v = c?.v ?? [];
    try {
      const t0 = Math.floor(now / 1000), ts = Array.from({ length: 10 }, (_, i) => t0 + i * 60).join(",");
      const r = await fetch(`https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=${ts}&units=kilometers`);
      const j = await r.json<{ timestamp: number; latitude: number; longitude: number; altitude: number }[]>();
      v = j.map((p) => [p.timestamp * 1000, +p.latitude.toFixed(4), +p.longitude.toFixed(4), Math.round(p.altitude)]);
    } catch {}
    this.cache.iss = { at: now, v };
    return v;
  }

  /** Real flights: from the website's /api/planes (the public feeds turn away Cloudflare's addresses; it fetches them). */
  private async planes(now: number) {
    const c = this.cache.planes;
    if (c && now - c.at < 4 * 60_000) return c.v;
    let v = c?.v ?? [];
    try {
      const r = await fetch(this.env.PLANES_URL ?? "https://drivewayanad.com/api/planes", { headers: { Accept: "application/json" } });
      this.planesWhy = `site:${r.status}`;
      const j = await r.json<{ planes: Plane[]; ok: boolean }>();
      if (!j.ok) throw new Error("no feed");
      v = j.planes;
    } catch (e) { this.planesWhy += ` ${String(e).slice(0, 80)}`; this.cache.planes = { at: now - 3 * 60_000, v }; return v; } // (tried again in a minute)
    this.cache.planes = { at: now, v };
    return v;
  }
}
