# Traffic asset provenance

All files are local; no runtime third-party requests.

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
