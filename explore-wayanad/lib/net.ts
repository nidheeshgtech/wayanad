/**
 * Multiplayer: the connection to the room server (multiplayer/src/index.ts). Off unless NEXT_PUBLIC_MP_URL is set
 * (the server's https address); without it the drive is single-player exactly as before.
 *
 * Joining asks the lobby for a room (the invite's, if there is one), then opens a WebSocket into it. While you drive,
 * ~12 times a second it sends where you are in the game's own road coordinates (s along the road, lat across it, psi,
 * speed, braking); ten times a second the room sends where the drivers near you are. Each remote driver keeps a short
 * buffer of those states, stamped with when they arrived, which components/drive/RemoteCars.tsx plays back a little
 * behind real time so the cars glide between updates. If the connection drops it reconnects to the same room.
 * Private rooms (Play with friends): `createRoom` asks for a new one and gets its code ("CHAYA-472"), `joinCode` joins
 * one by its code; `net.party` then follows the room's lobby and race (multiplayer/src/index.ts), and the host's choices
 * go back with `partyMode`, `partyStart`, `partyLobby`, a finished climb with `partyFinish`.
 * One object for the page (the HUD and the scene load in different chunks); no React state per message.
 */
import { game } from "@/lib/game";
import { DEFAULT_CHOICE, carOf, type Choice } from "@/data/cars";
import { sideContact, type Player } from "@/lib/traffic";

export type Snap = { t: number; s: number; lat: number; psi: number; v: number; br: number };
/** `ghost`: first met already well inside your car (everyone starts at Adivaram), so you pass through until apart;
 * `contact`: when it last touched yours (performance.now()), so a late update that jumps it deeper stays solid. */
export type Remote = { id: number; name: string; car: Choice; buf: Snap[]; ghost?: boolean; contact?: number;
  /** their clock → ours: the smallest (arrival − their send time) seen, allowed to creep up slowly; `offAt` when last set */
  off?: number; offAt?: number };
/** A private room: who hosts it, where its race is (`startAt` / `closeAt`: performance.now() times), who's racing
 * this round and who has finished, in order. */
export type Party = {
  code: string; host: number; phase: "lobby" | "countdown" | "race" | "results" | "free"; mode: "race" | "free"; round: number;
  startAt: number; closeAt: number; racers: number[]; results: { id: number; name: string; time?: number; points?: number }[];
};
type NetState = {
  enabled: boolean; status: "off" | "connecting" | "live" | "retrying";
  id: number; name: string; room: string;
  roster: { id: number; name: string; car: Choice }[];
  remotes: Map<number, Remote>;
  /** bumped on every roster change, so the HUD can poll cheaply */
  version: number;
  party: Party | null;
};

const BASE = (process.env.NEXT_PUBLIC_MP_URL ?? "").replace(/\/$/, "");
const SEND_MS = 80;

export const net: NetState = ((globalThis as { __wayanadNet?: NetState }).__wayanadNet ??= {
  enabled: !!BASE, status: "off", id: 0, name: "", room: "", roster: [], remotes: new Map(), version: 0, party: null,
});
net.party ??= null; // (an object kept from before a hot reload)

/** This tab's key: a dropped connection rejoins a private room as the same racer (and host). */
function key() {
  try { let k = sessionStorage.getItem("wayanad-key"); if (!k) { k = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); sessionStorage.setItem("wayanad-key", k); } return k; }
  catch { return ""; }
}

let ws: WebSocket | null = null, sender: ReturnType<typeof setInterval> | null = null, retry = 0, wanted: { name: string; room: string | null; car: Choice } | null = null;

/** Join a room as `name` driving `car`; `invite`: a room id from an invite link. Safe to call again (rejoins). */
export async function joinRoom(name: string, invite: string | null, car: Choice = DEFAULT_CHOICE) {
  if (!net.enabled) return;
  wanted = { name, room: invite, car };
  leaveRoom(false);
  net.status = "connecting";
  try {
    const q = wanted.room ? `?room=${encodeURIComponent(wanted.room)}` : "";
    const { room } = await (await fetch(`${BASE}/join${q}`)).json() as { room: string };
    wanted.room = room;
    open(room, name, car);
  } catch { schedule(); }
}

/** Play with friends: a new private room. Resolves to an error message, or null once you're on your way in. */
export async function createRoom(name: string, car: Choice = DEFAULT_CHOICE) { return enterPrivate(`${BASE}/create`, name, car); }
/** Play with friends: the room with this code ("chaya 472", "CHAYA-472"). Resolves to an error message, or null. */
export async function joinCode(code: string, name: string, car: Choice = DEFAULT_CHOICE) { return enterPrivate(`${BASE}/join?code=${encodeURIComponent(code)}`, name, car); }
async function enterPrivate(url: string, name: string, car: Choice): Promise<string | null> {
  if (!net.enabled) return "Multiplayer is off.";
  try {
    const r = await fetch(url), body = await r.json() as { room?: string; code?: string; error?: string };
    if (!r.ok || !body.room) return body.error ?? "Couldn't reach the room. Try again.";
    leaveRoom(true);
    wanted = { name, room: body.room, car };
    net.status = "connecting";
    open(body.room, name, car);
    return null;
  } catch { return "No connection. Check your internet and try again."; }
}

const partySend = (m: object) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
/** The host: race or free drive (in the lobby). */
export const partyMode = (mode: Party["mode"]) => partySend({ t: "mode", mode });
/** The host: start the race (a countdown for everyone) or the free drive. */
export const partyStart = () => partySend({ t: "start" });
/** The host: everyone back to the room's lobby (Race again, or ending a drive). */
export const partyLobby = () => partySend({ t: "lobby" });
/** At the Lakkidi gate in a race: your time (s) and points. */
export const partyFinish = (time: number, points: number) => partySend({ t: "finish", time, points });

function open(room: string, name: string, car: Choice) {
  const sock = new WebSocket(`${BASE.replace(/^http/, "ws")}/room/${room}`);
  ws = sock;
  sock.onopen = () => { retry = 0; sock.send(JSON.stringify({ t: "hello", name, car: { m: car.car, c: car.colour }, key: key() })); };
  sock.onmessage = (ev) => {
    let m: { t: string; [k: string]: unknown };
    try { m = JSON.parse(ev.data as string); } catch { return; }
    if (m.t === "welcome") {
      Object.assign(net, { id: m.id as number, name: m.name as string, room: m.room as string, status: "live" });
      if (m.priv) {
        const code = (m.room as string).slice(2).toUpperCase();
        if (net.party?.code !== code) net.party = { code, host: 0, phase: "lobby", mode: "race", round: -1, startAt: 0, closeAt: 0, racers: [], results: [] };
      } else net.party = null;
      net.version++;
      sender ??= setInterval(send, SEND_MS);
    } else if (m.t === "roster") {
      net.roster = (m.players as { id: number; name: string; car?: { m: string; c: string } }[]).filter((p) => p.id !== net.id)
        .map((p) => ({ id: p.id, name: p.name, car: { car: (p.car?.m ?? "lakkidi") as Choice["car"], colour: (p.car?.c ?? "white") as Choice["colour"] } }));
      for (const id of net.remotes.keys()) if (!net.roster.some((p) => p.id === id)) net.remotes.delete(id);
      for (const p of net.roster) { const r = net.remotes.get(p.id); if (r) { r.name = p.name; r.car = p.car; } }
      net.version++;
    } else if (m.t === "room" && net.party) {
      const now = performance.now();
      Object.assign(net.party, {
        host: m.host, phase: m.phase, mode: m.mode, round: m.round, racers: m.racers, results: m.results,
        startAt: now + (m.startIn as number), closeAt: (m.closeIn as number) ? now + (m.closeIn as number) : 0,
      });
      net.version++;
    } else if (m.t === "st") {
      const now = performance.now();
      for (const [id, s, lat, psi, v, br, ts] of m.p as number[][]) {
        let r = net.remotes.get(id);
        if (!r) { const who = net.roster.find((p) => p.id === id); r = { id, name: who?.name ?? "Driver", car: who?.car ?? DEFAULT_CHOICE, buf: [] }; net.remotes.set(id, r); }
        // when the state was really sent, on our clock: their send time plus the offset between the clocks (the fastest
        // delivery seen, creeping up 2 ms a second so a lasting change is followed). Stamping by arrival made cars
        // surge and stall: the room batches updates every 100 ms, and repeats a state until a newer one comes
        let t = now;
        if (ts > 0) {
          const sample = now - ts;
          r.off = r.off === undefined ? sample : Math.min(sample, r.off + (now - (r.offAt ?? now)) * 0.002);
          r.offAt = now; t = ts + r.off;
        }
        const last = r.buf[r.buf.length - 1];
        if (last && (t <= last.t || (!(ts > 0) && last.s === s && last.lat === lat && last.v === v))) continue; // a repeat
        r.buf.push({ t, s, lat, psi, v, br });
        if (r.buf.length > 24) r.buf.splice(0, r.buf.length - 24);
      }
    }
  };
  sock.onclose = () => { if (ws === sock) { ws = null; schedule(); } };
}

function send() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !game.started) return;
  ws.send(JSON.stringify({ t: "s", s: +game.s.toFixed(3), lat: +game.lat.toFixed(3), psi: +game.psi.toFixed(3), v: +game.speed.toFixed(3), br: game.braking ? 1 : 0, leg: game.leg, ts: Math.round(performance.now()) }));
}

/** Try again after a while (1 s, 2 s, 4 s … up to 15 s), into the same room. */
function schedule() {
  if (!wanted) return;
  net.status = "retrying";
  const w = wanted, delay = Math.min(15_000, 1000 * 2 ** retry++);
  setTimeout(() => { if (wanted === w && !ws) { if (w.room) open(w.room, w.name, w.car); else void joinRoom(w.name, null, w.car); } }, delay);
}

/** Tell the room you've changed car (the garage); remembered for reconnects. */
export function sendCar(car: Choice) {
  if (wanted) wanted.car = car;
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "car", car: { m: car.car, c: car.colour } }));
}

export function leaveRoom(forget = true) {
  if (forget) { wanted = null; net.party = null; }
  if (sender) { clearInterval(sender); sender = null; }
  const sock = ws; ws = null; sock?.close();
  net.remotes.clear(); net.roster = []; net.status = "off"; net.version++;
}

/** Where a remote driver is now: their state ~170 ms ago on their own timeline, curved between the two updates around
 * it using their speed at each (so speeding up and braking look smooth, not stepped), or carried on at their speed for
 * up to 0.3 s if updates are late. null when nothing has come for 2 s (out of range, gone). */
const DELAY = 170;
if (typeof window !== "undefined") (window as unknown as { __wayanadRemoteState?: unknown }).__wayanadRemoteState = (r: Remote, now: number) => remoteState(r, now, {} as Snap); // for testing
export function remoteState(r: Remote, now: number, out: Snap): Snap | null {
  const b = r.buf;
  if (!b.length || now - b[b.length - 1].t > 2000) return null;
  const t = now - DELAY;
  let i = b.length - 1;
  while (i > 0 && b[i - 1].t > t) i--;
  const a = b[Math.max(0, i - 1)], c = b[i];
  if (t >= c.t || a === c) {
    const ahead = Math.min(0.3, Math.max(0, (t - c.t) / 1000));
    return Object.assign(out, c, { s: c.s + c.v * Math.cos(c.psi) * ahead, t });
  }
  const span = Math.max(1, c.t - a.t), k = Math.min(1, Math.max(0, (t - a.t) / span)), h = span / 1000;
  // cubic Hermite along the road: the ends match both positions and both speeds; a jump (a restart, a reset) is linear
  const k2 = k * k, k3 = k2 * k, va = a.v * Math.cos(a.psi) * h, vc = c.v * Math.cos(c.psi) * h;
  const s = Math.abs(c.s - a.s) > 3 ? a.s + (c.s - a.s) * k
    : (2 * k3 - 3 * k2 + 1) * a.s + (k3 - 2 * k2 + k) * va + (-2 * k3 + 3 * k2) * c.s + (k3 - k2) * vc;
  return Object.assign(out, { t, s, lat: a.lat + (c.lat - a.lat) * k, psi: a.psi + (c.psi - a.psi) * k, v: a.v + (c.v - a.v) * k, br: c.br });
}

/** Keep your car out of the other drivers': run into one ahead of you (or reverse into one behind) and you're held at
 * the contact at their pace, and can creep round with the wheel turned, as with traffic (lib/traffic collidePlayer);
 * side by side, you're pushed out sideways. End on, whoever's screen it is, the cars never go through each other: each
 * driver sees the other a moment late (network + playback delay), so if theirs comes on into yours you're nudged
 * along at their pace rather than letting it sink in (it used to, and once deep enough it passed right through).
 * Only cars first met already well inside each other (everyone starts at Adivaram) pass through until they're apart.
 * `p` in road units, changed in place; returns the knock (0 = none). */
const CREEP = 0.25, WIDTH = 0.09, STICKY = 600; // units/s with full lock; half a car's width, units; ms a contact stays solid
export function collideRemotes(p: Player) {
  if (!net.enabled || !net.remotes.size) return 0;
  const now = performance.now(), st = {} as Snap;
  let knock = 0;
  for (const r of net.remotes.values()) {
    if (!remoteState(r, now, st)) { r.ghost = false; continue; }
    const reach = carOf(r.car.car).length / 20 + p.halfL, g = st.s - p.s, dLat = p.lat - st.lat, side = WIDTH + p.halfW;
    if (Math.abs(g) >= reach || Math.abs(dLat) >= side) { r.ghost = false; continue; }
    if (r.ghost) continue;
    const deep = Math.abs(g) < reach * 0.5 && Math.abs(dLat) < side * 0.5;
    if (deep && now - (r.contact ?? -Infinity) > STICKY) { r.ghost = true; continue; } // met already inside each other
    r.contact = now;
    const scrape = sideContact(p, dLat, side, reach - Math.abs(g));
    if (scrape >= 0) { knock = Math.max(knock, scrape); continue; }
    const theirs = st.v * Math.cos(st.psi), mine = p.speed;
    // (theirs < 0: they're reversing into you, and you go back with them)
    if (g >= 0) { p.s = st.s - reach - 0.01; p.speed = Math.min(p.speed, theirs < 0 ? theirs : theirs + CREEP * Math.min(1, Math.abs(p.steer ?? 0) * 1.5)); }
    else { p.s = st.s + reach + 0.01; p.speed = Math.max(p.speed, theirs); }
    knock = Math.max(knock, Math.min(1, Math.max(0, (g >= 0 ? mine - theirs : theirs - mine))));
  }
  return knock;
}
