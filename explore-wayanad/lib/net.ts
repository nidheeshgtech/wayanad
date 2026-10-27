/**
 * Multiplayer: the connection to the room server (multiplayer/src/index.ts). Off unless NEXT_PUBLIC_MP_URL is set
 * (the server's https address); without it the drive is single-player exactly as before.
 *
 * Joining asks the lobby for a room (the invite's, if there is one), then opens a WebSocket into it. While you drive,
 * ~12 times a second it sends where you are in the game's own road coordinates (s along the road, lat across it, psi,
 * speed, braking); ten times a second the room sends where the drivers near you are. Each remote driver keeps a short
 * buffer of those states, stamped with when they arrived, which components/drive/RemoteCars.tsx plays back a little
 * behind real time so the cars glide between updates. If the connection drops it reconnects to the same room.
 * One object for the page (the HUD and the scene load in different chunks); no React state per message.
 */
import { game } from "@/lib/game";
import { DEFAULT_CHOICE, carOf, type Choice } from "@/data/cars";

export type Snap = { t: number; s: number; lat: number; psi: number; v: number; br: number };
export type Remote = { id: number; name: string; car: Choice; buf: Snap[] };
type NetState = {
  enabled: boolean; status: "off" | "connecting" | "live" | "retrying";
  id: number; name: string; room: string;
  roster: { id: number; name: string; car: Choice }[];
  remotes: Map<number, Remote>;
  /** bumped on every roster change, so the HUD can poll cheaply */
  version: number;
};

const BASE = (process.env.NEXT_PUBLIC_MP_URL ?? "").replace(/\/$/, "");
const SEND_MS = 80;

export const net: NetState = ((globalThis as { __wayanadNet?: NetState }).__wayanadNet ??= {
  enabled: !!BASE, status: "off", id: 0, name: "", room: "", roster: [], remotes: new Map(), version: 0,
});

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

function open(room: string, name: string, car: Choice) {
  const sock = new WebSocket(`${BASE.replace(/^http/, "ws")}/room/${room}`);
  ws = sock;
  sock.onopen = () => { retry = 0; sock.send(JSON.stringify({ t: "hello", name, car: { m: car.car, c: car.colour } })); };
  sock.onmessage = (ev) => {
    let m: { t: string; [k: string]: unknown };
    try { m = JSON.parse(ev.data as string); } catch { return; }
    if (m.t === "welcome") {
      Object.assign(net, { id: m.id as number, name: m.name as string, room: m.room as string, status: "live" });
      net.version++;
      sender ??= setInterval(send, SEND_MS);
    } else if (m.t === "roster") {
      net.roster = (m.players as { id: number; name: string; car?: { m: string; c: string } }[]).filter((p) => p.id !== net.id)
        .map((p) => ({ id: p.id, name: p.name, car: { car: (p.car?.m ?? "lakkidi") as Choice["car"], colour: (p.car?.c ?? "white") as Choice["colour"] } }));
      for (const id of net.remotes.keys()) if (!net.roster.some((p) => p.id === id)) net.remotes.delete(id);
      for (const p of net.roster) { const r = net.remotes.get(p.id); if (r) { r.name = p.name; r.car = p.car; } }
      net.version++;
    } else if (m.t === "st") {
      const now = performance.now();
      for (const [id, s, lat, psi, v, br] of m.p as number[][]) {
        let r = net.remotes.get(id);
        if (!r) { const who = net.roster.find((p) => p.id === id); r = { id, name: who?.name ?? "Driver", car: who?.car ?? DEFAULT_CHOICE, buf: [] }; net.remotes.set(id, r); }
        r.buf.push({ t: now, s, lat, psi, v, br });
        if (r.buf.length > 24) r.buf.splice(0, r.buf.length - 24);
      }
    }
  };
  sock.onclose = () => { if (ws === sock) { ws = null; schedule(); } };
}

function send() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !game.started) return;
  ws.send(JSON.stringify({ t: "s", s: +game.s.toFixed(3), lat: +game.lat.toFixed(3), psi: +game.psi.toFixed(3), v: +game.speed.toFixed(3), br: game.braking ? 1 : 0, leg: game.leg }));
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
  if (forget) wanted = null;
  if (sender) { clearInterval(sender); sender = null; }
  const sock = ws; ws = null; sock?.close();
  net.remotes.clear(); net.roster = []; net.status = "off"; net.version++;
}

/** Where a remote driver is now: their state ~150 ms ago, eased between the two updates around it, or carried on at
 * their speed for up to half a second if updates are late. null when nothing has come for 2 s (out of range, gone). */
const DELAY = 150;
export function remoteState(r: Remote, now: number, out: Snap): Snap | null {
  const b = r.buf;
  if (!b.length || now - b[b.length - 1].t > 2000) return null;
  const t = now - DELAY;
  let i = b.length - 1;
  while (i > 0 && b[i - 1].t > t) i--;
  const a = b[Math.max(0, i - 1)], c = b[i];
  if (t >= c.t || a === c) {
    const ahead = Math.min(0.5, Math.max(0, (t - c.t) / 1000));
    return Object.assign(out, c, { s: c.s + c.v * ahead, t });
  }
  const k = Math.min(1, Math.max(0, (t - a.t) / Math.max(1, c.t - a.t)));
  return Object.assign(out, { t, s: a.s + (c.s - a.s) * k, lat: a.lat + (c.lat - a.lat) * k, psi: a.psi + (c.psi - a.psi) * k, v: c.v, br: c.br });
}

/** Keep your car out of the other drivers': run into one ahead of you (or reverse into one behind) and you're held at
 * the contact at their pace, and can creep round with the wheel turned, as with traffic (lib/traffic collidePlayer).
 * The one behind gives way: a car coming up behind you is stopped on its own screen, so yours is never shoved. Cars
 * already well inside each other (everyone starts at Adivaram; a late update) pass through until they're apart.
 * `p` in road units, changed in place; returns the knock (0 = none). */
const CREEP = 0.25, WIDTH = 0.09; // units/s with full lock; half a car's width, units
export function collideRemotes(p: { s: number; lat: number; speed: number; halfL: number; halfW: number; steer: number }) {
  if (!net.enabled || !net.remotes.size) return 0;
  const now = performance.now(), st = {} as Snap;
  let knock = 0;
  for (const r of net.remotes.values()) {
    if (!remoteState(r, now, st)) continue;
    const reach = carOf(r.car.car).length / 20 + p.halfL, g = st.s - p.s;
    if (Math.abs(g) >= reach || Math.abs(g) < reach * 0.5) continue;
    if (Math.abs(st.lat - p.lat) >= WIDTH + p.halfW) continue;
    const theirs = st.v * Math.cos(st.psi);
    if (g > 0 && p.speed > theirs - 0.01) { p.s = st.s - reach - 0.01; p.speed = Math.min(p.speed, Math.max(0, theirs) + CREEP * Math.min(1, Math.abs(p.steer) * 1.5)); }
    else if (g < 0 && p.speed < Math.min(0, theirs)) { p.s = st.s + reach + 0.01; p.speed = Math.min(0, theirs); } // reversing into them: stopped
    else continue;
    knock = Math.max(knock, Math.min(1, Math.abs(p.speed - theirs)));
  }
  return knock;
}
