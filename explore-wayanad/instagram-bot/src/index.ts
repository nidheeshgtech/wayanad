/**
 * "Comment PLAY for the link" — Drive Wayanad's Instagram auto-reply (Instagram API, Unified login or Instagram Login).
 *
 *   GET  /webhook   Meta's verification: echoes hub.challenge when hub.verify_token matches VERIFY_TOKEN
 *   POST /webhook   comment and message notifications, signed by Meta (X-Hub-Signature-256: HMAC-SHA256 of the body
 *                   with the app secret). For a comment asking for the game (PLAY, link, game, 🎮, പ്ലേ):
 *                     - a private reply (one DM to the commenter, allowed once per comment, within 7 days)
 *                     - a short public reply under the comment ("Sent! Check your DMs 📩")
 *                   For a DM asking the same: the link, in reply.
 *   GET  /          a health line
 *
 *   GET  /auth      the redirect URL of the app's login (Instagram API setup with Unified login): Meta sends the owner
 *                   here with a code after they log in; the code is exchanged for the account's token (a system-user
 *                   token, it doesn't expire), kept in KV, never shown. Only the OWNER account's login is kept.
 *
 * New Meta apps (from Oct 2026) only get "Unified login": a Facebook-Login token, used on graph.facebook.com, comments
 * arriving as entry.changes[]. (Older Instagram-Login apps: GRAPH=https://graph.instagram.com/v25.0 and an IG_TOKEN.)
 *
 * Secrets (never in the repo; `npx wrangler secret put <NAME>`): APP_SECRET (the Meta app's secret: signatures and the
 * code exchange), VERIFY_TOKEN (any string, also typed into the app's webhook settings), IG_TOKEN (optional: a token
 * pasted by hand instead of the /auth login). Vars (wrangler.toml): APP_ID, OWNER (the Instagram username).
 * KV `SEEN`: comment ids answered (so a retried notification isn't answered twice), a per-person daily cap, the token.
 */
export interface Env {
  IG_TOKEN?: string;
  APP_SECRET: string;
  APP_ID: string;
  OWNER: string;
  GRAPH?: string;
  VERIFY_TOKEN: string;
  SEEN: KVNamespace;
  /** optional: overrides the public reply / DM text and the link */
  LINK?: string;
}

const GRAPH = "https://graph.facebook.com/v25.0";
const api = (env: Env) => env.GRAPH ?? GRAPH;
const token = async (env: Env) => env.IG_TOKEN || (await env.SEEN.get("token")) || "";
const ASKS = /\b(play|link|game|details|download|app)\b|🎮|പ്ലേ|ലിങ്ക്/iu;
const link = (env: Env, medium: string) => `${env.LINK ?? "https://drivewayanad.com"}/?utm_source=instagram&utm_medium=${medium}`;
const dmText = (env: Env, name: string | undefined, medium: string) =>
  `Hey${name ? ` ${name}` : ""}! 🚗 Here's Drive Wayanad — the Thamarassery churam in 3D, free to play in your browser:\n${link(env, medium)}\n\n` +
  `Nine hairpins, chai at Lakkidi, real Kerala traffic. Drive safe! 🌿`;
const PUBLIC_REPLIES = ["Sent! Check your DMs 📩", "Link's in your DMs 🚗", "Check your DMs — see you on the churam! 🌿"];

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response(`drive-wayanad instagram bot: ok${(await token(env)) ? "" : " (no token yet: log in at the app's login URL)"}\n`);
    if (url.pathname === "/auth") return auth(url, env);
    // the owner's check-up (key = VERIFY_TOKEN): subscribes the account to the app's webhooks, reports what Meta says
    if (url.pathname === "/setup" && url.searchParams.get("key") === env.VERIFY_TOKEN) return Response.json(await setup(env));
    // the owner's read-only account report (key = VERIFY_TOKEN): profile, recent media with likes/comments, insights if allowed
    if (url.pathname === "/report" && url.searchParams.get("key") === env.VERIFY_TOKEN) return Response.json(await report(env));
    if (url.pathname !== "/webhook") return new Response("not found", { status: 404 });

    // Meta's verification handshake
    if (req.method === "GET") {
      const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env.VERIFY_TOKEN;
      return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("forbidden", { status: 403 });
    }
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

    // a notification: only Meta's (signed with the app secret)
    const body = await req.text();
    if (!(await signed(body, req.headers.get("x-hub-signature-256"), env.APP_SECRET?.trim()))) return new Response("bad signature", { status: 401 });
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
  const API = api(env);
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
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token(env)}` }, body: JSON.stringify(payload) });
  if (!r.ok) console.error("graph", url.replace(api(env), ""), r.status, (await r.text()).slice(0, 300));
}

/** The login's redirect: exchange the code, check the token reaches OWNER's Instagram account, keep it. */
async function auth(url: URL, env: Env) {
  const page = (msg: string, status = 200) => new Response(`<!doctype html><meta name=viewport content="width=device-width"><body style="font:16px system-ui;padding:24px;max-width:560px">${msg}</body>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });
  const code = url.searchParams.get("code");
  if (!code) return page(`No code. ${url.searchParams.get("error_description") ?? ""}`.replace(/</g, "&lt;"), 400);
  const back = `${url.origin}/auth`;
  const ex = await fetch(`${GRAPH}/oauth/access_token?` + new URLSearchParams({ client_id: env.APP_ID, client_secret: env.APP_SECRET.trim(), redirect_uri: back, code }));
  const got = (await ex.json()) as { access_token?: string; error?: { message?: string } };
  if (!got.access_token) return page(`Meta refused the code: ${(got.error?.message ?? ex.status).toString().replace(/</g, "&lt;")}`, 400);
  const accounts = await igAccounts(got.access_token);
  const mine = accounts.find((a) => a.username?.toLowerCase() === env.OWNER.toLowerCase());
  if (!mine) return page(`Logged in, but this login doesn't reach @${env.OWNER} (found: ${accounts.map((a) => "@" + a.username).join(", ") || "no Instagram accounts"}). Log in again and tick @${env.OWNER}.`, 403);
  await env.SEEN.put("token", got.access_token);
  await env.SEEN.put("ig", JSON.stringify(mine));
  await setup(env).catch(() => {});
  return page(`✅ Connected to @${mine.username} (id ${mine.id}). You can close this tab.`);
}

/** Subscribe the connected account to the app's webhooks (comments, messages) and report the state (never the token). */
async function setup(env: Env) {
  const t = await token(env), ig = JSON.parse((await env.SEEN.get("ig")) ?? "null") as { id: string; username?: string } | null;
  if (!t || !ig) return { ok: false, why: "not connected" };
  const call = async (method: string, path: string) => {
    const r = await fetch(`${api(env)}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(t)}`, { method });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const subscribe = await call("POST", `/${ig.id}/subscribed_apps?subscribed_fields=comments,messages`);
  const now = await call("GET", `/${ig.id}/subscribed_apps`);
  const me = await call("GET", `/${ig.id}?fields=id,username`);
  return { account: ig, subscribe, now, me };
}

/** Read-only: the account, its recent media (likes, comments, the comments themselves) and insights when permitted. */
async function report(env: Env) {
  const t = await token(env), ig = JSON.parse((await env.SEEN.get("ig")) ?? "null") as { id: string } | null;
  if (!t || !ig) return { ok: false, why: "not connected" };
  const get = async (path: string) => {
    const r = await fetch(`${api(env)}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(t)}`);
    const j = (await r.json().catch(() => null)) as any;
    if (j && path.includes("/insights")) delete j.paging; // (its links carry the token)
    return j;
  };
  const profile = await get(`/${ig.id}?fields=username,name,biography,website,followers_count,follows_count,media_count`);
  const media: any[] = [];
  let next: string | null = `/${ig.id}/media?fields=id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink&limit=50`;
  while (next && media.length < 200) {
    const page = await get(next);
    if (!page?.data) { media.push({ error: page?.error }); break; }
    media.push(...page.data);
    next = page.paging?.next ? page.paging.next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, "").replace(/([?&])access_token=[^&]*&?/, "$1") : null;
  }
  const rel = (next: string) => next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, "").replace(/([?&])access_token=[^&]*&?/, "$1");
  for (const m of media.filter((m) => m.comments_count > 0).slice(0, 40)) {
    const all: any[] = [];
    let at: string | null = `/${m.id}/comments?fields=text,username,timestamp,replies{text,username}&limit=100`;
    while (at && all.length < 1000) {
      const c = await get(at);
      if (!c?.data) { m.comments_error = c?.error?.message; break; }
      all.push(...c.data);
      at = c.paging?.next ? rel(c.paging.next) : null;
    }
    m.comments = all;
  }
  // insights (instagram_manage_insights): the last 28 days for the account, and each post's own numbers
  const until = Math.floor(Date.now() / 1000), since = until - 28 * 86400;
  const insights = {
    totals: await get(`/${ig.id}/insights?metric=reach,views,profile_views,accounts_engaged,total_interactions,website_clicks,follows_and_unfollows&period=day&metric_type=total_value&since=${since}&until=${until}`),
    daily: await get(`/${ig.id}/insights?metric=reach,follower_count&period=day&since=${since}&until=${until}`),
    audience: await get(`/${ig.id}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=city`),
  };
  for (const m of media.filter((m) => m.id).slice(0, 40)) {
    const reel = m.media_product_type === "REELS";
    const r = await get(`/${m.id}/insights?metric=${reel ? "views,reach,saved,shares,total_interactions,ig_reels_avg_watch_time" : "views,reach,saved,shares,total_interactions"}`);
    m.insights = r?.data ? Object.fromEntries(r.data.map((x: any) => [x.name, x.values?.[0]?.value ?? x.total_value?.value])) : r?.error?.message;
  }
  return { profile, media, insights };
}

/** The Instagram accounts a token reaches (a Unified-login system user: assigned accounts; else through Pages). */
async function igAccounts(t: string) {
  const get = async (path: string) => (await (await fetch(`${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(t)}`)).json()) as any;
  const out: { id: string; username?: string }[] = [];
  const a = await get("/me/assigned_instagram_accounts?fields=id,username").catch(() => null);
  for (const x of a?.data ?? []) out.push({ id: x.id, username: x.username });
  if (!out.length) {
    const p = await get("/me/accounts?fields=instagram_business_account{id,username}").catch(() => null);
    for (const x of p?.data ?? []) if (x.instagram_business_account) out.push(x.instagram_business_account);
  }
  if (!out.length) {
    const me = await get("/me?fields=id,username").catch(() => null);
    if (me?.username) out.push({ id: me.id, username: me.username });
  }
  return out;
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
