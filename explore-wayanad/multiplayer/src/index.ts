/**
 * The drive's room server: a Cloudflare Worker with two kinds of Durable Object.
 *
 *  GET /join?room=<id>   → the Lobby picks a room: the one asked for (an invite link) if it has space, else the fullest
 *                          room that isn't full, else a new one. Returns { room }.
 *  GET /room/<id>        → WebSocket upgrade into that Room.
 *
 * A Room is one shared churam for up to ~25 drivers (CAPACITY; an invite may take it to HARD_CAP). Players are
 * described by where they are on the road (s, lat, psi, speed, braking) — the game's own coordinates — so a state is a
 * few numbers. Each player sends ~12 a second; ten times a second the room sends each player the others within
 * NEAR units of road (600 m) — on one road, "who's near me" is just a difference in s — and once a second everyone on
 * the same leg, wherever they are (the minimap shows them). The server checks each update
 * against the car's top speed and keeps the last good one if a jump is impossible. Names are trimmed, cleaned, and
 * made unique in the room ("Arjun", "Arjun#2").
 *
 * Messages (JSON):
 *  client → { t: "hello", name, car: { m, c } } once; { t: "s", s, lat, psi, v, br, leg } ~12/s; { t: "car", car } on a change
 *  server → { t: "welcome", id, name, room } · { t: "roster", players: [{ id, name, car }] } on joins, leaves and car changes
 *           { t: "st", now, p: [[id, s, lat, psi, v, br], ...] } 10/s, the nearby ones (everyone, once a second)
 */
import { cleanName } from "./names";

export interface Env { ROOM: DurableObjectNamespace; LOBBY: DurableObjectNamespace }

const CAPACITY = 25, HARD_CAP = 30;
const NEAR = 60;          // units of road (10 m): who you're sent
const TICK = 100;         // ms between state broadcasts
const ALL_EVERY = 10;     // every 10th broadcast (1/s) carries everyone on the leg, near or not
const REPORT_EVERY = 600; // every 600th (1/min) the room tells the Lobby it's still here, so it isn't forgotten
const MAX_SPEED = 2.8;    // units/s: the car's top speed (lib/game CAR.max)
const CORS = { "Access-Control-Allow-Origin": "*" };
// the cars and paints a player can pick (data/cars.ts); anything else becomes the default
const CARS = ["lakkidi", "vythiri", "kabini", "banasura", "pookode"], COLOURS = ["white", "black", "red", "blue", "green", "yellow", "silver", "orange"];
const carOf = (v: unknown): { m: string; c: string } => {
  const o = (v ?? {}) as { m?: unknown; c?: unknown };
  return { m: CARS.includes(String(o.m)) ? String(o.m) : CARS[0], c: COLOURS.includes(String(o.c)) ? String(o.c) : COLOURS[0] };
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/join") {
      return env.LOBBY.get(env.LOBBY.idFromName("lobby")).fetch(req);
    }
    const m = url.pathname.match(/^\/room\/([a-z0-9-]{1,24})$/);
    if (m) {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
    }
    return new Response("Explore Wayanad rooms", { headers: CORS });
  },
};

/** Which rooms exist and how full they are; hands out rooms. Rooms report their counts here. The list is kept in the
 * object's storage too: Cloudflare unloads an idle Lobby after a minute or so, and a fresh one that had forgotten the
 * rooms would send the next player (your phone, a friend) into a new, empty room. */
export class Lobby {
  private rooms = new Map<string, { count: number; at: number }>();
  constructor(private state: DurableObjectState) {
    state.blockConcurrencyWhile(async () => {
      this.rooms = new Map(Object.entries((await state.storage.get<Record<string, { count: number; at: number }>>("rooms")) ?? {}));
    });
  }
  private save() { return this.state.storage.put("rooms", Object.fromEntries(this.rooms)); }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/report") {
      const { room, count } = await req.json<{ room: string; count: number }>();
      if (count > 0) this.rooms.set(room, { count, at: Date.now() }); else this.rooms.delete(room);
      await this.save();
      return new Response("ok");
    }
    // forget rooms that stopped reporting (crashed, evicted)
    for (const [id, r] of this.rooms) if (Date.now() - r.at > 10 * 60_000) this.rooms.delete(id);
    const wanted = url.searchParams.get("room");
    let room: string | null = null;
    if (wanted && /^[a-z0-9-]{1,24}$/.test(wanted) && (this.rooms.get(wanted)?.count ?? 0) < HARD_CAP) room = wanted;
    if (!room) {
      let best = -1;
      for (const [id, r] of this.rooms) if (r.count < CAPACITY && r.count > best) { best = r.count; room = id; }
    }
    room ??= Math.random().toString(36).slice(2, 8);
    // count the newcomer now, so a burst of joins doesn't overfill one room before it reports back
    const r = this.rooms.get(room); this.rooms.set(room, { count: (r?.count ?? 0) + 1, at: Date.now() });
    await this.save();
    return Response.json({ room }, { headers: CORS });
  }
}

type Car = { m: string; c: string };
type Player = { id: number; name: string; car: Car; ws: WebSocket; s: number; lat: number; psi: number; v: number; br: number; leg: number; at: number; seen: boolean };

/** One shared road: relays where everyone is to the players near them. */
export class Room {
  private players = new Map<WebSocket, Player>();
  private nextId = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private room = "";

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    this.room = new URL(req.url).pathname.split("/").pop() ?? "";
    if (this.players.size >= HARD_CAP) return new Response("room full", { status: 503 });
    const pair = new WebSocketPair(), [client, server] = [pair[0], pair[1]];
    server.accept();
    this.connect(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private connect(ws: WebSocket) {
    let me: Player | null = null;
    ws.addEventListener("message", (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
      if (msg.t === "hello" && !me) {
        me = { id: this.nextId++, name: this.unique(cleanName(String(msg.name ?? ""))), car: carOf(msg.car), ws, s: 3, lat: 0.2, psi: 0, v: 0, br: 0, leg: 0, at: Date.now(), seen: false };
        this.players.set(ws, me);
        ws.send(JSON.stringify({ t: "welcome", id: me.id, name: me.name, room: this.room }));
        this.roster(); this.report();
        this.timer ??= setInterval(() => this.tick(), TICK);
      } else if (msg.t === "s" && me) this.move(me, msg);
      else if (msg.t === "car" && me) { me.car = carOf(msg.car); this.roster(); }
    });
    const leave = () => {
      if (!me) return;
      this.players.delete(ws); me = null;
      this.roster(); this.report();
      if (!this.players.size && this.timer) { clearInterval(this.timer); this.timer = null; }
    };
    ws.addEventListener("close", leave);
    ws.addEventListener("error", leave);
  }

  /** An update, if it's possible: no faster than the car can go (with room for jitter), or a reset back down the road. */
  private move(p: Player, m: Record<string, unknown>) {
    const n = (k: string) => (typeof m[k] === "number" && Number.isFinite(m[k]) ? (m[k] as number) : NaN);
    const s = n("s"), lat = n("lat"), psi = n("psi"), v = n("v");
    if ([s, lat, psi, v].some(Number.isNaN)) return;
    const now = Date.now(), dt = (now - p.at) / 1000, leg = n("leg") === 1 ? 1 : 0;
    const reset = s < p.s - 5 || leg !== p.leg; // restarted, or a new leg of the drive
    if (p.seen && !reset && Math.abs(s - p.s) > MAX_SPEED * dt * 1.6 + 0.5) return;
    Object.assign(p, { s, lat: Math.max(-0.6, Math.min(0.6, lat)), psi: Math.max(-1.2, Math.min(1.2, psi)), v: Math.max(-1, Math.min(MAX_SPEED * 1.1, v)), br: n("br") ? 1 : 0, leg, at: now, seen: true });
  }

  /** Ten times a second: each player gets the others on the same leg within NEAR units of road; once a second, all of them. */
  private tick() {
    const all = [...this.players.values()].filter((p) => p.seen), now = Date.now(), everyone = ++this.ticks % ALL_EVERY === 0;
    if (this.ticks % REPORT_EVERY === 0) this.report();
    for (const me of this.players.values()) {
      const near = all.filter((o) => o !== me && o.leg === me.leg && (everyone || Math.abs(o.s - me.s) < NEAR));
      if (!near.length && !me.seen) continue;
      const p = near.map((o) => [o.id, +o.s.toFixed(3), +o.lat.toFixed(3), +o.psi.toFixed(3), +o.v.toFixed(2), o.br]);
      try { me.ws.send(JSON.stringify({ t: "st", now, p })); } catch { /* closing */ }
    }
  }

  private roster() {
    const msg = JSON.stringify({ t: "roster", players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, car: p.car })) });
    for (const p of this.players.values()) { try { p.ws.send(msg); } catch { /* closing */ } }
  }

  private unique(name: string) {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) if (!taken.has(`${name}#${i}`.toLowerCase())) return `${name}#${i}`;
  }

  private report() {
    const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName("lobby"));
    this.state.waitUntil(lobby.fetch("https://lobby/report", { method: "POST", body: JSON.stringify({ room: this.room, count: this.players.size }) }).then(() => {}, () => {}));
  }
}
