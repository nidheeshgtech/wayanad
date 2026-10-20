# Traffic asset provenance

All files are local; no runtime third-party requests.

## Realistic models (CC BY 4.0, Sketchfab) — downloaded and rebuilt by `scripts/fetch-sketchfab.mjs`

CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ — credit the author, link the source and licence, say what changed.

- `ksrtc-real.glb`: **KSRTC Bus 2011** by BML Palms Authority (https://sketchfab.com/arjun.sajin28), CC BY 4.0.
  https://sketchfab.com/3d-models/ksrtc-bus-2011-707cc16fe65f4525b1bc8e6244ad0860
  Changes: materials converted to metal-rough; repainted from Karnataka red/grey to Kerala state-transport colours
  (red body, yellow sill line, cream roof and header); maker badge blanked; plate replaced with a made-up number
  (`scripts/retouch/ksrtc-real.sh`); compressed (meshopt, WebP). No operator endorsement implied.
- `swift-real.glb`: **Swift 2024** by ShreyanshChaurasia_12 (https://sketchfab.com/shreyanshchaurasia13), CC BY 4.0.
  https://sketchfab.com/3d-models/swift-2024-07cf082bab4d430a8a764a23590e35fa
  Changes: materials converted to metal-rough; number plates blanked (`scripts/retouch/swift-real.sh`); compressed.
  Note: textured from photographs of the production car; under review before wider use (see the vehicles page).

## Earlier models (CC0 / original)

- `sedan.glb`: **Car**, Quaternius, CC0 1.0. https://poly.pizza/m/unqqkULtRU
  Original: https://static.poly.pizza/d35173c8-6078-4367-8f87-b1f2599f0bb7.glb
- `suv.glb`: **SUV**, Quaternius, CC0 1.0. https://poly.pizza/m/xsMtZhBkxL
  Original: https://static.poly.pizza/e5fbf2ee-5c9e-47d5-8ab6-80cacd463baa.glb
  Both source pages explicitly identify these individual models as Public Domain (CC0).
  Modified PBR roughness/metalness with `scripts/prepare-traffic.mjs`; normalized at runtime to scene dimensions.
- `truck.glb`, `van.glb`, `Textures/colormap.png`: **Car Kit 3.1**, Kenney, CC0 1.0.
  https://kenney.nl/assets/car-kit — original license included as `KENNEY-LICENSE.txt`.
  Runtime proportions normalized for a goods truck and tourist van.
- `bus.glb`, `motorcycle.glb`, `scooter.glb`: original geometry authored for this project by `scripts/bake-traffic.mjs`.
  No external model rights required. The bus uses Kerala-inspired red/yellow and green/cream liveries;
  no official KSRTC logos or endorsement are implied. Bikes include helmeted riders.

License reference: https://creativecommons.org/publicdomain/zero/1.0/
These are optimized low-polygon models, not photogrammetry or exact manufacturer replicas.
