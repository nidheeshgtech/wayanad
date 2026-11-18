// Local test against `npm run dev` (port 8788, .dev.vars: APP_SECRET=test-secret, VERIFY_TOKEN=test-verify): the
// verification handshake, a forged notification refused, signed ones accepted (comment PLAY, comment hello, a DM, our
// own reply). The replies themselves fail at Meta with the fake token: the worker's log shows each call it made.
import crypto from "node:crypto";
const BASE = process.env.BOT ?? "http://localhost:8788", SECRET = "test-secret";
const sign = (b) => "sha256=" + crypto.createHmac("sha256", SECRET).update(b).digest("hex");
const post = async (obj, sig = true) => { const b = JSON.stringify(obj); const r = await fetch(`${BASE}/webhook`, { method: "POST", headers: { "content-type": "application/json", ...(sig ? { "x-hub-signature-256": sign(b) } : { "x-hub-signature-256": "sha256=00" }) }, body: b }); return r.status; };
const ok = (name, cond) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) process.exitCode = 1; };

let r = await fetch(`${BASE}/webhook?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=12345`);
ok("verification echoes the challenge", r.status === 200 && (await r.text()) === "12345");
r = await fetch(`${BASE}/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`);
ok("wrong verify token refused", r.status === 403);
const ME = "17841400000000000", comment = (id, text, from = "555") => ({ object: "instagram", entry: [{ id: ME, time: 1, field: "comments", value: { id, text, from: { id: from, username: "tester" }, media: { id: "m1", media_product_type: "REELS" } } }] });
ok("unsigned notification refused", (await post(comment("c-forged", "PLAY"), false)) === 401);
ok("comment PLAY accepted", (await post(comment(`c-${Date.now()}`, "PLAY 🔥"))) === 200);
ok("comment hello accepted (no reply)", (await post(comment(`c2-${Date.now()}`, "nice reel"))) === 200);
ok("our own reply ignored", (await post(comment(`c3-${Date.now()}`, "Link's in your DMs 🚗", ME))) === 200);
ok("DM 'play' accepted", (await post({ object: "instagram", entry: [{ id: ME, time: 1, messaging: [{ sender: { id: "777" }, recipient: { id: ME }, timestamp: 1, message: { mid: `mid-${Date.now()}`, text: "play" } }] }] })) === 200);
