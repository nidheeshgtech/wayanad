# Motion & shader references

Three resources chosen for this build. Use them for what each is good at; don't mix their roles.
(From the owner, 2026-10-19.)

## 1. Shaders.com — https://shaders.com/docs/components

The real package. `npm install shaders` (WebGPU, React components), plus an MCP server and an agent skill. Install the skill/MCP in this repo so Claude Code can wire components directly.

Use for atmosphere and image treatment, layered inside acts:

- Atmosphere: Fog (cursor-reactive on desktop), Godrays, SmokeFlow / ParticleFlow (mist), FloatingParticles (dust, fireflies)
- Water: Water (Kuruva, Soochipara pool), Ripples, CursorRipples on hero imagery
- Imagery: ImageTexture, VideoTexture as the base; DisplacementMap, FlowField over drone footage
- Film look: FilmStock, FilmGrain, LightLeak, Vignette, BokehBlur, ProgressiveBlur
- Transitions between acts: NoiseDissolve, IrisWipe
- Edakkal only: Engraving or Chalkboard over the petroglyph wall
- Avoid: Hologram, Glitch, VHS, Chrome and other sci-fi presets. Wrong mood.

Constraints: WebGPU only. Run their system check on iPhone and a mid-range Android, and make the capability check route non-WebGPU devices to the video tier. It composes 2D layers; the churam camera drive stays in R3F.

## 2. Animmaster Lib — https://animmasterlib.dev

A paid one-time zip of ~300 snippets (GSAP/Three.js, mostly vanilla, some React/Next). Reference material, not a dependency. Use for the connective tissue: scroll choreography patterns, hero/text reveals, nav menu, page transitions, image grids and sliders (Stay grid, Muthanga sighting strip, Plan cards). Port patterns into components with useGSAP cleanup; never paste vanilla files in. Check the licence before shipping anything, and don't lift a hero that is recognisably another brand's site.

## 3. GetLayers — https://www.getlayers.ai/templates

A prompt library (you paste a template's prompt into an AI tool and rebuild it). Inspiration only, for hero composition and award-site pacing. The free ones (Soda, Kimi, Lumora, Laocoon, Baseline) are enough; the travel template (Brewns) is premium. Nothing from here goes into the codebase directly.

## Rules of thumb

- One true 3D set piece (the churam, R3F). Everything else is Shaders layers over imagery + DOM.
- Lazy-load any shader layer per act; keep initial JS under the 300 KB budget in CLAUDE.md.
- Every effect must degrade: no WebGPU → video/static tier; reduced motion → fades only.
