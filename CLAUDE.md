# Explore Wayanad — project brief for Claude Code

Single-page scroll experience about Wayanad, Kerala. The page is one drive: up the Thamarassery Churam
from Adivaram, through the Lakkidi gateway arch, across the plateau, ending at the Kerala–Karnataka border
(Moolehole checkpost). Scroll is the accelerator. Then Stay, Night, Plan.

Owner: Nidheesh (senior frontend dev). Design decisions and the storyboard live in a claude.ai Project;
ask before changing act order, copy tone, palette or type. Code decisions are yours to propose.

## Act order (geographic, do not reorder)
0. Pre-roll — "Adivaram · 14 kilometres · Nine bends", not scroll-driven, covers scene load
1. Thamarassery Churam — Adivaram → nine hairpins → fog thickens → drive under the green "WELCOME TO WAYANAD"
   arch at Lakkidi → camera lifts for the plateau. Hairpin counter 1→9. ~25% of scroll.
2. Lakkidi → Kalpetta — Chain Tree, Vythiri, Pookode, then the hub with three compass cards (South / East / North)
3. Soochipara Falls (south detour) — vertical reveal, audio ramps with scroll
4. Kuruva Island (north detour) — still water, bamboo raft crossing
5. Edakkal Caves — steps, slot of light, carvings resolve
6. Sulthan Bathery — brief, the last town
7. Forest road NH766 — tree tunnel, godrays, the elephant hold (scroll scrub eases to a halt ~1.5 s, then releases)
8. Muthanga safari → the border — camera stops at the barrier, turns 180° to face back west, route line draws Adivaram→Muthanga
9. Stay — dusk over estates, stays grid (Supabase later)
10. Night — fireflies, stars, campfire. Emotional close.
11. Plan — static, server-rendered, SEO: nearest airport, seasons, 3/5/7-day itineraries, WhatsApp. No canvas behind it.

Chembra, Banasura, Meenmutty, Thirunelli go on inner `/destinations/[slug]` routes, not the one-pager.
Dubai-specific travel content is deferred; do not add it.

## Architecture (already in place)
- Next.js 15 App Router, TypeScript, SCSS modules, Lenis synced to GSAP ticker, GSAP ScrollTrigger, React Three Fiber + Drei.
- `lib/scrollState.ts` is the single source of truth: each `components/acts/Act.tsx` pins with ScrollTrigger and
  writes `{act, progress, hold}`; `components/scene/Director.tsx` reads it in `useFrame` and drives camera, fog, sky,
  ground, light, mist and fireflies. Never set React state per scroll frame; mutate refs/DOM imperatively.
- One persistent `<Canvas>` fixed behind the DOM. DOM copy is server-renderable and identical on every tier.
- `hooks/useCapability.ts` picks `full | lite | video` from a frame probe + memory, never from screen width.
  `video` tier = scroll-scrubbed footage with the same DOM (not built yet).
- Per-act palette, copy and scroll lengths live in `data/acts.ts`.
- `lib/terrain.ts` is a procedural stand-in. Replace with real data (below), keep the same exports.

## Visual language
- Palette: bg #0E1F1A, ink #EEF2EE, mute #B8C7C0, dim #8FA89E, line #5E7A70, amber accent #D9A441 (one accent, used sparingly).
- Type: Fraunces 300 for display (headlines, counter), Instrument Sans 400/500 for body/UI.
- Mood: quiet, cinematic, honest. Mist and layered depth, film grain + vignette always on. No sci-fi effects
  (no glitch, hologram, chrome). Copy states facts plainly; no superlatives.
- Churam references: steep green wall, rock face uphill, yellow/black striped barrier posts on the outer edge,
  dark wet asphalt with white centre line, bends stacked tightly, forest closing over the road in mist.
- The Lakkidi arch: two dark stone piers, green beam with three scalloped arches, "WELCOME TO WAYANAD" lettering.

## Performance budget (hard)
- Initial JS < 300 KB gzipped; hero LCP < 2.5 s on 4G; 60 fps scrub on a mid-range Android; page < 3 MB before video.
- Lazy-load heavy scene parts per act. `prefers-reduced-motion` → no pins, static frames, fades only.
- Capability check decides tiers; if the churam can't hold 60 fps on a phone, switch that tier to video, don't shave polygons forever.

## Phase plan
- Phase 1 (done): scaffold + churam ported from the prototype.
- Phase 2 (now): real churam geometry.
  1. Copernicus GLO-30 / SRTM DEM for ~11.45–11.55 N, 75.95–76.05 E → `scripts/bake-terrain.ts` → `public/terrain/churam.png`
     (16-bit heightmap, 512²) + JSON bounds/elevation range → `Terrain.tsx` displaces from it.
  2. NH766 from OpenStreetMap (Overpass) between Adivaram and Lakkidi → local coords matching the heightmap → `buildRoadCurve()`.
     Hand-mark the nine bends as t-values (counter + `ARCH_T`).
  3. Test on iPhone over Wi-Fi (`npm run dev -- -H 0.0.0.0`). Decide video tier.
- Phase 3: per-act components (compass cards, Kuruva water, forest tunnel, border route line), Shaders.com layers, post-processing.
- Phase 4: Supabase content + status chips, inner routes, enquiry flow, Howler audio (opt-in), analytics, Lighthouse ≥ 90.

## Working rules
- Commit small and often. `npm run typecheck` before committing. Don't upgrade framework majors mid-phase.
- Keep facts (timings, prices, closures) out of code; they belong in data/Supabase and are marked "verify".
- Ask before: changing act order or copy voice, adding a dependency over 50 KB, removing the reduced-motion path.
