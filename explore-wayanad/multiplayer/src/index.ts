/**
 * The drive's room server: a Cloudflare Worker with two kinds of Durable Object.
 *
 *  GET /join?room=<id>   → the Lobby picks a room: the one asked for (an invite link) if it has space, else the fullest
 *                          room that isn't full, else a new one. Returns { room }.
 *  GET /room/<id>        → WebSocket upgrade into that Room.
 *  GET /create           → a private room for friends: the Lobby makes up a code ("CHAYA-472") and keeps the room out
 *                          of the public ones. Returns { room, code }; the room's id is "p-" + the code in lower case.
 *  GET /join?code=<code> → that private room, if it exists and has space: { room, code }; 404 / 409 otherwise.
 *
 * A private room (up to PRIVATE_CAP drivers) also runs the race: its first player is the host, who picks Race or Free
 * drive and starts it. Race: a three-second countdown for everyone in the room, then the climb; each driver reports
 * their time at the Lakkidi gate and the room ranks them; the results close when everyone's in, or CLOSE_AFTER after the
 * first finisher. Free drive: everyone just drives. The host can bring the room back to its lobby at any time (Race
 * again). If the host drops out the crown waits HOST_GRACE for them to reconnect, then passes on. Players carry a key
 * (made by their browser, kept for the tab) so a dropped connection rejoins as the same racer.
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
 *  client → { t: "hello", name, car: { m, c }, key } once; { t: "s", s, lat, psi, v, br, leg } ~12/s; { t: "car", car } on a change
 *           private rooms, the host: { t: "mode", mode: "race" | "free" } · { t: "start" } · { t: "lobby" }
 *           private rooms, a racer at the gate: { t: "finish", time, points }
 *  server → { t: "welcome", id, name, room, priv } · { t: "roster", players: [{ id, name, car }] } on joins, leaves and car changes
 *           { t: "st", now, p: [[id, s, lat, psi, v, br], ...] } 10/s, the nearby ones (everyone, once a second)
 *           private rooms: { t: "room", host, phase, mode, round, startIn, closeIn, racers: [id], results: [{ id, name, time, points }] }
 *           on every change (phase: "lobby" | "countdown" | "race" | "results" | "free"; startIn / closeIn in ms from now)
 */
import { cleanName } from "./names";

export interface Env { ROOM: DurableObjectNamespace; LOBBY: DurableObjectNamespace }

const CAPACITY = 25, HARD_CAP = 30, PRIVATE_CAP = 8;
const COUNTDOWN = 3000;      // ms: 3, 2, 1, GO
const CLOSE_AFTER = 90_000;  // ms after the first finisher that a race's results close
const HOST_GRACE = 30_000;   // ms a dropped host keeps the crown
const EMPTY_KEEP = 15 * 60_000; // ms an empty private room's code still works (a host sharing the link may drop out meanwhile)
// private room codes: a word from the road and three digits, easy to read out over a call
const WORDS = ["CHAYA", "PUTTU", "APPAM", "KAPPA", "MANGO", "TIGER", "MONKEY", "CHURAM", "KABINI", "JEEP", "MIST", "RAIN",
  "COFFEE", "PEPPER", "BAMBOO", "PEACOCK", "HAIRPIN", "LAKKIDI", "VYTHIRI", "BANANA", "TEAKWOOD", "MONSOON", "HORNBILL", "ELEPHANT"];
const codeOf = (raw: string) => {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, ""), m = s.match(/^([A-Z]+)(\d{3})$/);
  return m ? `${m[1]}-${m[2]}` : null;
};
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
    if (url.pathname === "/join" || url.pathname === "/create") {
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

  private hits = new Map<string, { n: number; at: number }>();
  /** At most `max` calls a minute from one address (making rooms, trying codes). */
  private limited(req: Request, kind: string, max: number) {
    const ip = `${kind}:${req.headers.get("CF-Connecting-IP") ?? "local"}`, now = Date.now(), h = this.hits.get(ip);
    if (!h || now - h.at > 60_000) { this.hits.set(ip, { n: 1, at: now }); if (this.hits.size > 5000) this.hits.clear(); return false; }
    return ++h.n > max;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url), now = Date.now();
    if (url.pathname === "/report") {
      const { room, count } = await req.json<{ room: string; count: number }>();
      // an empty private room keeps its code for a while (EMPTY_KEEP); an empty public one is forgotten
      if (count > 0 || room.startsWith("p-")) this.rooms.set(room, { count, at: now }); else this.rooms.delete(room);
      await this.save();
      return new Response("ok");
    }
    // forget rooms that stopped reporting (crashed, evicted), and empty private rooms after a while
    for (const [id, r] of this.rooms) if (now - r.at > (id.startsWith("p-") && r.count === 0 ? EMPTY_KEEP : 10 * 60_000)) this.rooms.delete(id);
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

    // a private room for friends
    if (url.pathname === "/create") {
      if (this.limited(req, "create", 10)) return json({ error: "Too many rooms made. Try again in a minute." }, 429);
      for (let i = 0; i < 50; i++) {
        const code = `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${100 + Math.floor(Math.random() * 900)}`, room = `p-${code.toLowerCase()}`;
        if (this.rooms.has(room)) continue;
        this.rooms.set(room, { count: 0, at: now });
        await this.save();
        return json({ room, code });
      }
      return json({ error: "Couldn't make a room. Try again." }, 503);
    }
    const asked = url.searchParams.get("code");
    if (asked !== null) {
      if (this.limited(req, "code", 30)) return json({ error: "Too many tries. Wait a minute." }, 429);
      const code = codeOf(asked), room = code && `p-${code.toLowerCase()}`, r = room ? this.rooms.get(room) : undefined;
      if (!room || !r) return json({ error: "No room with that code." }, 404);
      if (r.count >= PRIVATE_CAP) return json({ error: "That room is full (8 drivers)." }, 409);
      this.rooms.set(room, { count: r.count + 1, at: now });
      await this.save();
      return json({ room, code });
    }

    // the open road: the invite's room, else the fullest public room with space, else a new one
    const wanted = url.searchParams.get("room");
    let room: string | null = null;
    if (wanted && /^[a-z0-9]{1,24}$/.test(wanted) && (this.rooms.get(wanted)?.count ?? 0) < HARD_CAP) room = wanted;
    if (!room) {
      let best = -1;
      for (const [id, r] of this.rooms) if (!id.startsWith("p-") && r.count < CAPACITY && r.count > best) { best = r.count; room = id; }
    }
    room ??= Math.random().toString(36).slice(2, 8);
    // count the newcomer now, so a burst of joins doesn't overfill one room before it reports back
    const r = this.rooms.get(room); this.rooms.set(room, { count: (r?.count ?? 0) + 1, at: now });
    await this.save();
    return json({ room });
  }
}

type Car = { m: string; c: string };
type Player = { id: number; key: string; name: string; car: Car; ws: WebSocket; s: number; lat: number; psi: number; v: number; br: number; leg: number; at: number; seen: boolean };
type Phase = "lobby" | "countdown" | "race" | "results" | "free";
/** A driver in this round's race, by key: their time and points once at the gate (`order`: when they got there). */
type Racer = { name: string; time?: number; points?: number; order?: number };

/** One shared road: relays where everyone is to the players near them. */
export class Room {
  private players = new Map<WebSocket, Player>();
  private nextId = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private room = "";
  // private rooms: the host (by key), the race
  private priv = false;
  private hostKey = "";
  private hostTimer: ReturnType<typeof setTimeout> | null = null;
  private phase: Phase = "lobby";
  private mode: "race" | "free" = "race";
  private round = 0;
  private startAt = 0;
  private closeAt = 0;
  private racers = new Map<string, Racer>();
  private finished = 0;
  private timer2: ReturnType<typeof setTimeout> | null = null;

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    this.room = new URL(req.url).pathname.split("/").pop() ?? "";
    this.priv = this.room.startsWith("p-");
    if (this.players.size >= (this.priv ? PRIVATE_CAP : HARD_CAP)) return new Response("room full", { status: 503 });
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
        const key = typeof msg.key === "string" && /^[a-z0-9]{8,40}$/i.test(msg.key) ? msg.key : Math.random().toString(36).slice(2);
        me = { id: this.nextId++, key, name: this.unique(cleanName(String(msg.name ?? ""))), car: carOf(msg.car), ws, s: 3, lat: 0.2, psi: 0, v: 0, br: 0, leg: 0, at: Date.now(), seen: false };
        this.players.set(ws, me);
        ws.send(JSON.stringify({ t: "welcome", id: me.id, name: me.name, room: this.room, priv: this.priv }));
        if (this.priv) {
          // the first one in is the host; a host coming back within the grace keeps the crown
          if (!this.hostKey || (key === this.hostKey && this.hostTimer)) { this.hostKey = key; if (this.hostTimer) { clearTimeout(this.hostTimer); this.hostTimer = null; } }
          const r = this.racers.get(key); if (r) r.name = me.name;
        }
        this.roster(); this.report(); this.state_();
        this.timer ??= setInterval(() => this.tick(), TICK);
      } else if (msg.t === "s" && me) this.move(me, msg);
      else if (msg.t === "car" && me) { me.car = carOf(msg.car); this.roster(); }
      else if (this.priv && me) this.party(me, msg);
    });
    const leave = () => {
      if (!me) return;
      const gone = me;
      this.players.delete(ws); me = null;
      if (this.priv) {
        // the host's crown waits a while for them, then goes to whoever's been here longest
        if (gone.key === this.hostKey && ![...this.players.values()].some((p) => p.key === gone.key)) {
          if (this.hostTimer) clearTimeout(this.hostTimer);
          this.hostTimer = setTimeout(() => {
            this.hostTimer = null;
            const next = [...this.players.values()].sort((a, b) => a.id - b.id)[0];
            if (next && ![...this.players.values()].some((p) => p.key === this.hostKey)) { this.hostKey = next.key; this.state_(); }
          }, HOST_GRACE);
        }
        this.settle();
      }
      this.roster(); this.report(); this.state_();
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

  /** A private room's own messages: the host's choices, and racers reaching the gate. */
  private party(me: Player, m: Record<string, unknown>) {
    const host = me.key === this.hostKey;
    if (m.t === "mode" && host && this.phase === "lobby" && (m.mode === "race" || m.mode === "free")) { this.mode = m.mode; this.state_(); }
    else if (m.t === "start" && host && (this.phase === "lobby" || this.phase === "results")) {
      this.round++; this.racers.clear(); this.finished = 0; this.closeAt = 0;
      if (this.timer2) { clearTimeout(this.timer2); this.timer2 = null; }
      if (this.mode === "free") { this.phase = "free"; this.state_(); return; }
      for (const p of this.players.values()) this.racers.set(p.key, { name: p.name });
      this.phase = "countdown"; this.startAt = Date.now() + COUNTDOWN;
      const round = this.round;
      this.timer2 = setTimeout(() => { if (this.round === round && this.phase === "countdown") { this.phase = "race"; this.state_(); } }, COUNTDOWN);
      this.state_();
    } else if (m.t === "lobby" && host) {
      if (this.timer2) { clearTimeout(this.timer2); this.timer2 = null; }
      this.phase = "lobby"; this.racers.clear(); this.closeAt = 0; this.round++;
      this.state_();
    } else if (m.t === "finish" && this.phase === "race") {
      const r = this.racers.get(me.key), time = Number(m.time), points = Number(m.points);
      if (!r || r.order !== undefined || !Number.isFinite(time) || time <= 0) return;
      Object.assign(r, { time: Math.round(time * 10) / 10, points: Number.isFinite(points) ? Math.max(0, Math.round(points)) : 0, order: ++this.finished });
      if (this.finished === 1) {
        this.closeAt = Date.now() + CLOSE_AFTER;
        const round = this.round;
        this.timer2 = setTimeout(() => { if (this.round === round && this.phase === "race") { this.phase = "results"; this.state_(); } }, CLOSE_AFTER);
      }
      this.settle();
      this.state_();
    }
  }

  /** The race is over when every racer still here has reached the gate. */
  private settle() {
    if (this.phase !== "race") return;
    const here = new Set([...this.players.values()].map((p) => p.key));
    const waiting = [...this.racers].some(([key, r]) => here.has(key) && r.order === undefined);
    if (!waiting && this.finished > 0) { this.phase = "results"; if (this.timer2) { clearTimeout(this.timer2); this.timer2 = null; } }
  }

  /** Where a private room is: sent to everyone on every change. */
  private state_() {
    if (!this.priv) return;
    const now = Date.now(), byKey = new Map([...this.players.values()].map((p) => [p.key, p.id]));
    const results = [...this.racers].filter(([, r]) => r.order !== undefined).sort((a, b) => a[1].order! - b[1].order!)
      .map(([key, r]) => ({ id: byKey.get(key) ?? 0, name: r.name, time: r.time, points: r.points }));
    const msg = JSON.stringify({
      t: "room", host: byKey.get(this.hostKey) ?? 0, phase: this.phase, mode: this.mode, round: this.round,
      startIn: Math.max(0, this.startAt - now), closeIn: this.closeAt ? Math.max(0, this.closeAt - now) : 0,
      racers: [...this.racers.keys()].map((k) => byKey.get(k)).filter((id) => id !== undefined), results,
    });
    for (const p of this.players.values()) { try { p.ws.send(msg); } catch { /* closing */ } }
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
