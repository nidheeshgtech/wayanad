# Drive Wayanad — Instagram "comment PLAY" bot

A Cloudflare Worker (`src/index.ts`) on the Instagram API with Instagram Login. When someone comments **PLAY** (or link,
game, 🎮, പ്ലേ) under a post or reel, it sends them **one private DM** with the game's link and replies publicly
"Sent! Check your DMs 📩". A DM saying PLAY gets the link too. Each comment is answered once; one DM a person a day.

- Live at `https://drive-wayanad-instagram.nitheeshworld.workers.dev` — webhook URL: `…/webhook`
- `npm run dev` (local, port 8788, fake keys in `.dev.vars`), `npm test` (against it), `npm run deploy`

## Secrets (never committed)
```
npx wrangler secret put IG_TOKEN       # long-lived Instagram User access token
npx wrangler secret put APP_SECRET     # Meta app → App settings → Basic → App secret (Instagram app secret)
npx wrangler secret put VERIFY_TOKEN   # already set; the same string goes in the webhook settings
```

## Meta setup (once)
1. Instagram account → **Professional** (Business or Creator).
2. developers.facebook.com → **Create app** → use case *Manage messaging & content on Instagram* → add **Instagram API
   with Instagram Login**.
3. **Generate access token** for the account, with `instagram_business_basic`, `instagram_business_manage_comments`,
   `instagram_business_manage_messages` → `IG_TOKEN` (long-lived: 60 days; refresh before it expires).
4. **Configure webhooks**: callback URL above, verify token = `VERIFY_TOKEN`; subscribe to **comments** and **messages**.
5. Turn the account's subscription on (dashboard toggle, or
   `POST graph.instagram.com/v25.0/me/subscribed_apps?subscribed_fields=comments,messages&access_token=…`).
6. Instagram app → Settings → Messages → **Allow access to messages** (connected tools).
7. App **Live** mode. Comment webhooks for other people's comments need **Advanced Access** (App Review).
