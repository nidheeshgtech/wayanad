# Traffic and weather enhancement

Checkpoint: `checkpoint-before-traffic-weather-20261019` → `94de5a3`.
The working tree was clean before the checkpoint. No route, camera, hairpin, vegetation, minimap, UI, scroll or storyboard files were changed.

## Files

- `components/scene/Scene.tsx`: mounts traffic in the existing mountain/plateau world and the development-only review panel.
- `lib/traffic.ts`: vehicle dimensions, left-hand lane positions, axle-based heading/pitch, elapsed-time movement, curvature limits, snapshot-based following gaps and 15 conservatively reserved narrow sections where opposing traffic yields. 160 pooled vehicles across the 28 km road, with only nearby vehicles rendered; cars dominate the mix. Rain reduces desired speeds by up to 22% and doubles the time-gap component.
- `components/scene/Traffic.tsx`: cached GLTFLoader assets, shared geometry/materials, local shadows, weather-responsive emissive headlamps and conservative footprint checks. Models use +Z forward and the road's existing ten-metres-per-unit scale. One failed asset cannot prevent the original scene loading.
- `lib/weather.ts`: extends existing organic weather with moderate rain; review overrides are development-only. Preserves the existing sunny start, dry visits, 90-second minimum before natural rain, smooth cloud/mist/rain changes and slower drying.
- `components/scene/Rain.tsx`: static particle seeds with GPU-computed streak positions; no per-frame position-buffer uploads, reduced draw count for drizzle, skips rendering while dry.
- `components/scene/WeatherDebug.tsx`: opt-in `?sceneDebug=1` panel, weather selection, traffic pause and live status. `window.wayanadReview.snapshot()` exposes positions and rendering statistics only when this development panel is mounted.
- `public/models/traffic/`: seven GLBs, shared van/truck texture, licenses and attribution (under 1 MB total).
- `scripts/bake-traffic.mjs`, `scripts/prepare-traffic.mjs`: reproducible original asset baking and downloaded-model preparation.
- `scripts/test-traffic.ts`: road-data, following-gap and weather regression checks.

No new dependencies. Existing Three.js, React Three Fiber and Next.js only.

## Validation

Run from `explore-wayanad`:

```
npm run typecheck
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-traffic.ts
npm run build
```

Type checking and production build pass. Production was built in an isolated copy because an existing development server shares `.next`; do not run a build concurrently with that server in the same output directory. The initial sandboxed build could not download the existing Google Fonts; the network-enabled build succeeded. Reported first-load JS: 162 KB (this is not the total downloaded scene/assets).

Automated checks: left-hand lane signs; all nine existing hairpins present; a mixed-size close-following queue under rain; two simulated minutes with dry-to-rain movement and no same-lane overlap (minimum bumper gap ~141 m in the normally spaced fleet); opposing bus simulations in all 15 narrow sections verify no footprint overlap and eventual passage in both directions; smooth rain/wetness ramp and gradual clearing/drying.

Browser checks: clear start; independent traffic movement while scroll is idle; loaded vehicle models and texture; rain review state; live panel; forward and reverse scrolling at desktop and 390×844 viewport. A desktop-host frame sample was ~62 FPS at 1200×794 and ~120 FPS at mobile viewport size. These are short desktop-host samples, not a physical mid-range Android benchmark. Existing adaptive quality remains in place. The existing missing favicon returns 404; vehicle requests and shaders are clean after the asset fix.

Production checks: debug panel absent even with `?sceneDebug=1&weather=rain`; weather override is compiled out. Production starts in daylight.

## Review and remaining limitations

- The user's two camera requirements conflict: the existing camera is centred on the road, while a left-lane visitor would need a camera-path offset. The camera is deliberately unchanged; forward vehicles travel left, opposing vehicles right.
- The existing terrain and baked spline disagree at isolated positions. A whole-route bus footprint audit flags ~2.61% of sampled poses. Vehicles are omitted where a corner enters the terrain or leaves the safe road envelope, so they can disappear briefly at these places. This is a conservative safeguard, not a claim that the underlying route geometry is repaired. Seamless travel there requires an agreed terrain/road correction or a more sophisticated feasible-lane trajectory.
- Asset proportions and materials are calibrated, but models remain low-poly; buses/bikes are original simplified models and the goods/tourist vehicles are stylized. These are not photorealistic Kerala vehicle scans.
- No tire spray was added. Reflections use the existing PBR environment, not expensive planar reflections or per-headlight shadow maps.
- Traffic covers the existing mountain/plateau spline. The separately staged forest/border scene retains its existing elephant and barrier behavior.
- Physical-device performance and exhaustive continuous-time collision validation remain outstanding; sampled opposing-bus tests pass. Scroll-controlled camera movement is not collision constrained and can pass through traffic because the requested camera behavior is preserved.
