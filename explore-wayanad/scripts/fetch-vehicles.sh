#!/usr/bin/env bash
# Rebuild every realistic traffic model from Sketchfab (CC BY 4.0) with the settings each one needs.
# Needs SKETCHFAB_TOKEN in .env.local. Add --reuse to any line to re-bake from .cache without downloading.
# Credits and changes: public/models/traffic/ATTRIBUTION.md.
set -euo pipefail
cd "$(dirname "$0")/.."
f() { node scripts/fetch-sketchfab.mjs "$@" "${EXTRA[@]}"; }
EXTRA=("$@")
f 707cc16fe65f4525b1bc8e6244ad0860 ksrtc-real                                                # + scripts/retouch/ksrtc-real.sh
f 707cc16fe65f4525b1bc8e6244ad0860 privatebus-real                                           # + scripts/retouch/privatebus-real.sh
f 71112627f42342099ff95b59e7532663 wagonr-real --ratio 0.15 --error 0.008 --size 512 --turn
f d8f1cb78c9444f4e9bc467ea208b1b63 innova-real --turn --ratio 0.25 --error 0.006
f 8c7650b96d6846de8cc54391ab16cf20 lorry-real --ratio 0.25 --error 0.01 --size 256 --no-normal-maps
f 8d74b6b936da4905a70da602d6b003b5 rider-bike-real
f 44776bcb34e04c1a8b9c18a70376304e auto-real
f 4ad7ea26b90f40338802a5dac2a32a0d omni-real
f f6495bfbffe443e89c499a2ba8766c88 enfield-real --ratio 0.06 --size 512 --turn
f accbf2048c9344718791588b70d2ebf8 pulsar-real --turn
f 1a5cbddc8acb457e9d896d7345fd07d8 brezza-player --ratio 0.08 --error 0.01 --keep-parts --turn --size 512  # the car you drive: then
#   node scripts/retouch/player-suv.mjs public/models/traffic/brezza-player.glb public/models/traffic/player-suv.glb, and delete the input (badges off)
# the other player cars (data/cars.ts): keep each baked file as .cache/sketchfab/<name>.baked.glb, then
#   node scripts/retouch/player-cars.mjs   (emblems off, WAYANAD plates)
f 438c1b0c1a4e4732aa1a3cbb505d19e5 player-hatch --ratio 0.055 --error 0.01 --keep-parts --turn --size 512
f 95451c00cb2d48778f67d798167e7237 player-sedan --ratio 0.027 --error 0.01 --keep-parts --turn --size 512
f 538b10f2860f44e694dc3e9d3e223bf8 player-4x4 --ratio 0.03 --error 0.01 --keep-parts --turn --size 512
f 4f14afac3ac44ec4a2fb153e18452f8b player-mpv --ratio 0.035 --error 0.01 --keep-parts --turn --size 512
f 14d9f8a913eb4fd9b92c32b6fb0fabae tourbus-real --ratio 0.15 --error 0.008
f 50e4b1da03494429b1265fc095f2c530 macaque --ratio 0.25 --error 0.006 --size 512 --out public/models/wildlife  # monkeys at the hairpins
