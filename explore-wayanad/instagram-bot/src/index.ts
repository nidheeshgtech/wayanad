/**
 * "Comment PLAY for the link" — Drive Wayanad's Instagram auto-reply (Instagram API with Instagram Login).
 *
 *   GET  /webhook   Meta's verification: echoes hub.challenge when hub.verify_token matches VERIFY_TOKEN
 *   POST /webhook   comment and message notifications, signed by Meta (X-Hub-Signature-256: HMAC-SHA256 of the body
 *                   with the app secret). For a comment asking for the game (PLAY, link, game, 🎮, പ്ലേ):
 *                     - a private reply (one DM to the commenter, allowed once per comment, within 7 days)
 *                     - a short public reply under the comment ("Sent! Check your DMs 📩")
 *                   For a DM asking the same: the link, in reply.
 *   GET  /          a health line
 *
 * Secrets (never in the repo; `npx wrangler secret put <NAME>`): IG_TOKEN (a long-lived Instagram User access token with
 * instagram_business_basic, instagram_business_manage_comments, instagram_business_manage_messages), APP_SECRET (the
 * Meta app's secret, to check signatures), VERIFY_TOKEN (any string, also typed into the app's webhook settings).
 * KV `SEEN`: comment ids answered (so a retried notification isn't answered twice) and a per-person daily cap.
 */
export interface Env {
  IG_TOKEN: string;
  APP_SECRET: string;
  VERIFY_TOKEN: string;
  SEEN: KVNamespace;
  /** optional: overrides the public reply / DM text and the link */
  LINK?: string;
}

const API = "https://graph.instagram.com/v25.0";
const ASKS = /\b(play|link|game|details|download|app)\b|🎮|പ്ലേ|ലിങ്ക്/iu;
const link = (env: Env, medium: string) => `${env.LINK ?? "https://drivewayanad.com"}/?utm_source=instagram&utm_medium=${medium}`;
const dmText = (env: Env, name: string | undefined, medium: string) =>
  `Hey${name ? ` ${name}` : ""}! 🚗 Here's Drive Wayanad — the Thamarassery churam in 3D, free to play in your browser:\n${link(env, medium)}\n\n` +
  `Nine hairpins, chai at Lakkidi, real Kerala traffic. Drive safe! 🌿`;
const PUBLIC_REPLIES = ["Sent! Check your DMs 📩", "Link's in your DMs 🚗", "Check your DMs — see you on the churam! 🌿"];

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response("drive-wayanad instagram bot: ok\n");
    if (url.pathname !== "/webhook") return new Response("not found", { status: 404 });

    // Meta's verification handshake
    if (req.method === "GET") {
      const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env.VERIFY_TOKEN;
      return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("forbidden", { status: 403 });
    }
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

    // a notification: only Meta's (signed with the app secret)
    const body = await req.text();
    if (!(await signed(body, req.headers.get("x-hub-signature-256"), env.APP_SECRET))) return new Response("bad signature", { status: 401 });
    let note: Notification;
    try { note = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }
    // answer Meta at once (it retries slow endpoints); the replies go on after
    ctx.waitUntil(handle(note, env).catch((e) => console.error("handle", e)));
    return new Response("ok");
  },
};

type Comment = { id: string; text?: string; from?: { id: string; username?: string }; media?: { id: string; media_product_type?: string } };
type Messaging = { sender?: { id: string }; recipient?: { id: string }; message?: { mid?: string; text?: string; is_echo?: boolean } };
type Entry = { id: string; field?: string; value?: Comment; changes?: { field: string; value: Comment }[]; messaging?: Messaging[] };
type Notification = { object?: string; entry?: Entry[] };

export async function handle(note: Notification, env: Env, send = graph) {
  if (note.object !== "instagram") return;
  for (const e of note.entry ?? []) {
    const me = e.id;
    // comments: Instagram Login sends field/value on the entry; the other setups wrap them in `changes`
    const comments = [...(e.field === "comments" && e.value ? [e.value] : []), ...(e.changes ?? []).filter((c) => c.field === "comments").map((c) => c.value)];
    for (const c of comments) {
      if (!c?.id || !c.from || c.from.id === me) continue; // (our own replies come back as comments too)
      if (!ASKS.test(c.text ?? "")) continue;
      if (await env.SEEN.get(`c:${c.id}`)) continue;
      await env.SEEN.put(`c:${c.id}`, "1", { expirationTtl: 60 * 60 * 24 * 8 });
      // (one DM a person a day, however many reels they comment on)
      const capped = await env.SEEN.get(`u:${c.from.id}`);
      if (!capped) {
        await send(env, `${API}/${me}/messages`, { recipient: { comment_id: c.id }, message: { text: dmText(env, c.from.username, "comment") } });
        await env.SEEN.put(`u:${c.from.id}`, "1", { expirationTtl: 60 * 60 * 24 });
      }
      await send(env, `${API}/${c.id}/replies`, { message: PUBLIC_REPLIES[hash(c.id) % PUBLIC_REPLIES.length] });
    }
    // messages: someone DMs "PLAY"
    for (const m of e.messaging ?? []) {
      const who = m.sender?.id, text = m.message?.text ?? "";
      if (!who || who === me || m.message?.is_echo || !ASKS.test(text)) continue;
      if (m.message?.mid && (await env.SEEN.get(`m:${m.message.mid}`))) continue;
      if (m.message?.mid) await env.SEEN.put(`m:${m.message.mid}`, "1", { expirationTtl: 60 * 60 * 24 * 2 });
      await send(env, `${API}/${me}/messages`, { recipient: { id: who }, message: { text: dmText(env, undefined, "dm") } });
    }
  }
}

async function graph(env: Env, url: string, payload: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.IG_TOKEN}` }, body: JSON.stringify(payload) });
  if (!r.ok) console.error("graph", url.replace(API, ""), r.status, (await r.text()).slice(0, 300));
}

/** Meta's signature: "sha256=" + hex HMAC-SHA256 of the raw body, keyed with the app secret; compared in constant time. */
export async function signed(body: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=") || !secret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const want = [...mac].map((b) => b.toString(16).padStart(2, "0")).join(""), got = header.slice(7);
  if (want.length !== got.length) return false;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
