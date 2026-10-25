/**
 * Load test for the room server: N simulated drivers (default 100) join through the lobby and drive up the road,
 * sending ~12 updates a second like the game does. Reports how the rooms filled and, per bot, how many state messages
 * arrived per second and how many drivers each one was sent.   node scripts/bots.mjs [count] [server] [seconds] [room]
 */
import WebSocket from "ws";
const N = Number(process.argv[2] ?? 100), BASE = process.argv[3] ?? "http://localhost:8787", SECS = Number(process.argv[4] ?? 15), ROOM = process.argv[5] ?? "";
const bots = [];
for (let i = 0; i < N; i++) {
  const { room } = await (await fetch(`${BASE}/join${ROOM ? `?room=${ROOM}` : ""}`)).json();
  const ws = new WebSocket(`${BASE.replace(/^http/, "ws")}/room/${room}`);
  const bot = { room, ws, s: 3 + Math.random() * 40, v: 0.3 + Math.random() * 0.6, got: 0, near: 0, welcome: false };
  ws.on("open", () => ws.send(JSON.stringify({ t: "hello", name: `Bot ${i}` })));
  ws.on("message", (d) => { const m = JSON.parse(d.toString()); if (m.t === "welcome") bot.welcome = true; if (m.t === "st") { bot.got++; bot.near += m.p.length; } });
  bots.push(bot);
}
const t0 = Date.now();
const timer = setInterval(() => { for (const b of bots) if (b.ws.readyState === 1) { b.s += b.v * 0.08; b.ws.send(JSON.stringify({ t: "s", s: b.s, lat: 0.2, psi: 0, v: b.v, br: 0, leg: 0 })); } }, 80);
setTimeout(() => {
  clearInterval(timer);
  const secs = (Date.now() - t0) / 1000, rooms = {};
  for (const b of bots) rooms[b.room] = (rooms[b.room] ?? 0) + 1;
  const rates = bots.map((b) => b.got / secs).sort((a, b) => a - b);
  console.log(JSON.stringify({ bots: N, joined: bots.filter((b) => b.welcome).length, rooms: Object.values(rooms), stateMsgsPerSec: { min: +rates[0].toFixed(1), median: +rates[Math.floor(N / 2)].toFixed(1) }, avgDriversSent: +(bots.reduce((a, b) => a + b.near, 0) / Math.max(1, bots.reduce((a, b) => a + b.got, 0))).toFixed(1) }));
  for (const b of bots) b.ws.close();
  setTimeout(() => process.exit(0), 300);
}, SECS * 1000);
