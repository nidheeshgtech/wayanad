/**
 * Real flights near Wayanad, for the game's sky (lib/live, via the room server's /live: multiplayer/src/live.ts).
 * The public flight feeds turn away Cloudflare's shared addresses, so the room server asks here instead; only it
 * calls this (about once every 4 minutes), never the players, and the CDN keeps each answer 4 minutes.
 * Three free feeds of the same kind (readsb's JSON), then OpenSky; flights only (on the ground, slow or low left out).
 */
const AT = { lat: 11.61, lon: 76.08 };
export const dynamic = "force-dynamic";

type Plane = { id: string; call: string; lat: number; lon: number; alt: number; gs: number; track: number; at: number };
type Ac = { hex: string; flight?: string; lat?: number; lon?: number; alt_baro?: number | string; gs?: number; track?: number; seen_pos?: number };

async function readsb(now: number): Promise<Plane[] | null> {
  for (const url of [`https://api.adsb.lol/v2/point/${AT.lat}/${AT.lon}/150`, `https://opendata.adsb.fi/api/v2/lat/${AT.lat}/lon/${AT.lon}/dist/150`]) {
    const r = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (!r?.ok) continue;
    const j = (await r.json().catch(() => null)) as { ac?: Ac[]; aircraft?: Ac[] } | null;
    if (!j) continue;
    return (j.ac ?? j.aircraft ?? []).filter((a) => a.lat !== undefined && a.lon !== undefined && typeof a.alt_baro === "number" && a.alt_baro > 1500 && (a.gs ?? 0) > 80)
      .slice(0, 40).map((a) => ({ id: a.hex, call: (a.flight ?? "").trim(), lat: a.lat!, lon: a.lon!, alt: Math.round((a.alt_baro as number) * 0.3048), gs: Math.round((a.gs ?? 0) * 0.5144), track: Math.round(a.track ?? 0), at: now - Math.round((a.seen_pos ?? 0) * 1000) }));
  }
  return null;
}
async function opensky(now: number): Promise<Plane[] | null> {
  const r = await fetch("https://opensky-network.org/api/states/all?lamin=9.4&lomin=73.8&lamax=13.8&lomax=78.3", { cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return null;
  const o = (await r.json().catch(() => null)) as { states: (string | number | boolean | null)[][] | null } | null;
  return (o?.states ?? []).filter((x) => typeof x[5] === "number" && typeof x[6] === "number" && !x[8] && typeof x[7] === "number" && x[7] > 450 && Number(x[9] ?? 0) > 40)
    .slice(0, 40).map((x) => ({ id: String(x[0]), call: String(x[1] ?? "").trim(), lat: x[6] as number, lon: x[5] as number, alt: Math.round(x[7] as number), gs: Math.round(Number(x[9] ?? 0)), track: Math.round(Number(x[10] ?? 0)), at: Number(x[3] ?? now / 1000) * 1000 }));
}

export async function GET() {
  const now = Date.now(), planes = (await readsb(now)) ?? (await opensky(now));
  return Response.json({ planes: planes ?? [], ok: !!planes }, { headers: { "Cache-Control": planes ? "public, s-maxage=240, stale-while-revalidate=120" : "public, s-maxage=60" } });
}
