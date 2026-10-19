# Explore Wayanad

Single-page scroll experience: drive the Thamarassery Churam into Wayanad, then across the plateau to the Karnataka border.
Phase 1 scaffold — the churam ported from the prototype into Next.js 15 + React Three Fiber + GSAP.

## Run
```bash
npm install
npm run dev      # http://localhost:3000
npm run typecheck
```

## Structure
```
app/              layout, fonts, globals, page
components/
  Experience.tsx  composes HUD, pre-roll, smooth scroll, canvas (by tier), acts
  scene/          R3F: Scene (canvas) · Terrain · Road (asphalt, centre line, striped posts) · Forest · Gateway (Lakkidi arch) · Particles · Director
  acts/           Act (generic pinned section writing scrollState) · Churam · Simple
  ui/             Hud · Preroll · SmoothScroll (Lenis ↔ GSAP ticker)
data/acts.ts      copy, scroll lengths, per-act palette
lib/scrollState   mutable state shared by DOM (writes) and the visual layer (reads)
lib/mood.ts       storyboard fog curve keyed to the hairpins (photo and 3D views)
components/photo/ PhotoStage: real photos, scroll-driven; data/story.ts + data/photos.json
lib/terrain.ts    world frame (x east, -z north, origin Adivaram, 1 unit = 10 m), height() from the heightmap with the road cut in,
                  NH766 road curve, bendTs() / archT()
lib/heightmap.ts  16-bit PNG decoder + loaders for public/terrain/
scripts/bake-terrain.ts  Copernicus GLO-30 → public/terrain/churam.png (16-bit, 512²) + churam.json  (npm run bake:terrain)
scripts/bake-road.ts     OSM NH766 → public/terrain/churam-road.json: points every 10 m, nine bends, arch  (npm run bake:road)
hooks/useCapability  full | lite | video tier from a frame probe, not screen width
```

## How it works
Lenis smooths scroll → each `Act` pins with ScrollTrigger and writes `{act, progress}` into `scrollState` →
`Director` reads it in `useFrame` and moves the camera along the road spline (Act 1) or between keyed spots (later acts),
and lerps fog, sky, ground and light toward the act's palette. DOM copy is server-rendered and identical on every tier.

## Visual layer: real photos (default)
Until drone footage exists, each act shows real photographs of the place, from Wikimedia Commons under free licences,
cross-faded at the storyboard beats and slowly pushed/panned by scroll, with fog over the churam keyed to the hairpins.
`components/photo/PhotoStage.tsx` reads `data/story.ts` (which photo, when, how it drifts) and `data/photos.json`
(credits, written by `npm run fetch:photos`, which only accepts CC BY / BY-SA / CC0 / public domain).
The visible photo's credit is always on screen; the full list is under "Photo and map credits" in the Plan act.
The 3D scene is still there for comparison: `/?view=3d`.

## Terrain data
`npm run bake:terrain` reads two internal tiles (~4 MB) of Copernicus GLO-30 from AWS Open Data via HTTP Range
requests (cached in `scripts/.cache`, gitignored) and writes the heightmap. The output is committed; re-bake only to
change bounds or size. If the heightmap fails to load, the scene falls back to the procedural terrain.
Copernicus requires attribution wherever the terrain is shown — the string is in `churam.json` (`attribution`).

`npm run bake:road` routes NH766 through the OSM ways from Adivaram to past Lakkidi (Overpass, cached in `scripts/.cache`)
and keeps the road to where the arch sits at t = 0.9. The nine hairpins are hand-marked in `HAIRPINS_KM` in the script
(the detector finds 12 sharp turns; 7 and 8 are pinned by OSM bus stops named for them, and the script fails if they
disagree). Bends 1–2 are the least certain — verify on site. OSM data is ODbL: credit "© OpenStreetMap contributors".

## Next (from the storyboard doc)
1. **Real churam geometry** — bake SRTM/Copernicus 30 m DEM + OSM NH766 trace to a Draco GLB; swap `lib/terrain.ts`.
2. **Video tier** — scroll-scrubbed footage for `tier === "video"`; same acts, same DOM.
3. **Per-act components** — Kalpetta compass cards, Kuruva water, forest tunnel, border route line (port from prototype).
4. **Shaders.com layers** — Fog, Godrays, Water, FilmGrain per act; post-processing (bloom, DoF).
5. **Content** — Supabase: destinations, stays, itineraries, status chips; inner `/destinations/[slug]` routes.
6. **Audio** — Howler, opt-in, volume keyed to scroll.
