# Room server for the drive

Cloudflare Worker + Durable Objects (`src/index.ts`): a lobby that hands out rooms of ~25 drivers, and one Room object
per shared road that relays where nearby drivers are (10 updates a second, only those within 600 m of road).

- `npm install` then `npm run dev`: runs locally on http://localhost:8787. For the site to use it, put
  `NEXT_PUBLIC_MP_URL=http://localhost:8787` in `../.env.local` and rebuild.
- `npm run bots -- 100`: 100 simulated drivers join and drive (add a server address, seconds and a room id to target one).
- Go live: `npx wrangler login`, then `npm run deploy`. It prints the address (https://explore-wayanad-rooms.<you>.workers.dev);
  set that as `NEXT_PUBLIC_MP_URL` in Vercel and redeploy the site. Without it the site stays single-player.
