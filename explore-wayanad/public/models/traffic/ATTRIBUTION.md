# Traffic asset provenance

All files are local; no runtime third-party requests.

## Realistic models (CC BY 4.0, Sketchfab) — downloaded and rebuilt by `scripts/fetch-sketchfab.mjs`

CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ — credit the author, link the source and licence, say what changed.

- `ksrtc-real.glb`: **KSRTC Bus 2011** by BML Palms Authority (https://sketchfab.com/arjun.sajin28), CC BY 4.0.
  https://sketchfab.com/3d-models/ksrtc-bus-2011-707cc16fe65f4525b1bc8e6244ad0860
  Changes: materials converted to metal-rough; repainted from Karnataka red/grey to Kerala state-transport colours
  (red body, yellow sill line, cream roof and header); passengers and a driver painted behind the glass
  (`scripts/retouch/passengers.mjs`); maker badge blanked; plate replaced with a made-up number
  (`scripts/retouch/bus-livery.sh`); compressed (meshopt, WebP). No operator endorsement implied.
- Route boards (`boards/*.webp`): made for this project by `scripts/bake-boards.mjs`, set in Noto Sans Malayalam
  (SIL Open Font License 1.1).
- `privatebus-real.glb`: also **KSRTC Bus 2011** by BML Palms Authority, CC BY 4.0 (same source as above), repainted in a
  private-bus livery (`scripts/retouch/privatebus-real.sh`).
- `wagonr-real.glb`: **2013 Suzuki WagonR** by BHP3D (https://sketchfab.com/BHP3D), CC BY 4.0.
  https://sketchfab.com/3d-models/2013-suzuki-wagonr-71112627f42342099ff95b59e7532663 — simplified to 15%, turned to face +Z.
- `innova-real.glb`: **Toyota Innova 2008** by Hoàng Huy (https://sketchfab.com/danghoanghuy69), CC BY 4.0.
  https://sketchfab.com/3d-models/toyota-innova-2008-d8f1cb78c9444f4e9bc467ea208b1b63 — simplified to 25 %, turned to face +Z.
- `lorry-real.glb`: **Indian Truck** by AFJAL ANSARI (https://sketchfab.com/afjalymail78692), CC BY 4.0.
  https://sketchfab.com/3d-models/indian-truck-8c7650b96d6846de8cc54391ab16cf20 — simplified to 25%, textures 256 px, normal maps removed.
- `rider-bike-real.glb`: **Motorcycle with rider** by sohanmajhi749 (https://sketchfab.com/sohanmajhi749), CC BY 4.0.
  https://sketchfab.com/3d-models/motorcycle-with-rider-8d74b6b936da4905a70da602d6b003b5
- `auto-real.glb`: **Auto Rickshaw** by rSquare (https://sketchfab.com/rSquare), CC BY 4.0.
  https://sketchfab.com/3d-models/auto-rickshaw-44776bcb34e04c1a8b9c18a70376304e
- `omni-real.glb`: **Maruti Suzuki Omni** by BML Palms Authority (https://sketchfab.com/arjun.sajin28), CC BY 4.0.
  https://sketchfab.com/3d-models/maruti-suzuki-omni-4ad7ea26b90f40338802a5dac2a32a0d
- `enfield-real.glb`: **Royal enfield classic 350** by Mansoor (https://sketchfab.com/mansoorman), CC BY 4.0.
  https://sketchfab.com/3d-models/royal-enfield-classic-350-f6495bfbffe443e89c499a2ba8766c88 — simplified to 6%, turned. Vehicles page only (no rider).
- `pulsar-real.glb`: **Pulsar 135 Ls 2** by e-restrepo1114 (https://sketchfab.com/EmanuelRestrepoVelez), CC BY 4.0.
  https://sketchfab.com/3d-models/pulsar-135-ls-2-accbf2048c9344718791588b70d2ebf8 — turned. Vehicles page only (no rider).

- `tourbus-real.glb`: **PRAKASH ZEDONE TOURIST BUS ASHOK LEYLAND BS3** by dkdatta1983 (https://sketchfab.com/dkdatta1983), CC BY 4.0.
  https://sketchfab.com/3d-models/prakash-zedone-tourist-bus-ashok-leyland-bs3-14d9f8a913eb4fd9b92c32b6fb0fabae — simplified to 15 %; glass made see-through.
- `brezza-player.glb` (the car you drive on /drive): **2022 Maruti Suzuki Vitara Brezza** by BHP3D (https://sketchfab.com/BHP3D), CC BY 4.0.
  https://sketchfab.com/3d-models/2022-maruti-suzuki-vitara-brezza-1a5cbddc8acb457e9d896d7345fd07d8 — simplified to 8 %, textures 512 px, turned to face +Z.

People inside the vehicles (lib/occupants.ts) are simple shapes made in code for this project.

- `../wildlife/macaque.glb` (the monkeys at the hairpins): **Realsitic Monkey** by TdoubleU8 (https://sketchfab.com/TdoubleU8), CC BY 4.0.
  https://sketchfab.com/3d-models/realsitic-monkey-50e4b1da03494429b1265fc095f2c530 — simplified to 25 %, textures 512 px.

All of the above: materials converted to metal-rough, compressed (meshopt, WebP); rebuild with `scripts/fetch-vehicles.sh`.
Shapes follow real makes; no maker or operator endorsement implied.

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
