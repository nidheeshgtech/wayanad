#!/usr/bin/env bash
# Rebuild every realistic traffic model from Sketchfab (CC BY 4.0) with the settings each one needs.
# Needs SKETCHFAB_TOKEN in .env.local. Add --reuse to any line to re-bake from .cache without downloading.
# Credits and changes: public/models/traffic/ATTRIBUTION.md.
set -euo pipefail
cd "$(dirname "$0")/.."
f() { node scripts/fetch-sketchfab.mjs "$@" "${EXTRA[@]}"; }
EXTRA=("$@")
f 707cc16fe65f4525b1bc8e6244ad0860 ksrtc-real                                                # + scripts/retouch/ksrtc-real.sh
f 2d4ab65f7a7c470ab14da987a6248b5e privatebus-real
f 71112627f42342099ff95b59e7532663 wagonr-real --ratio 0.15 --error 0.008 --size 512 --turn
f d8f1cb78c9444f4e9bc467ea208b1b63 innova-real --turn
f 8c7650b96d6846de8cc54391ab16cf20 lorry-real --ratio 0.25 --error 0.01 --size 256 --no-normal-maps
f 8d74b6b936da4905a70da602d6b003b5 rider-bike-real
f 44776bcb34e04c1a8b9c18a70376304e auto-real
f 4ad7ea26b90f40338802a5dac2a32a0d omni-real
f f6495bfbffe443e89c499a2ba8766c88 enfield-real --ratio 0.06 --size 512 --turn
f accbf2048c9344718791588b70d2ebf8 pulsar-real --turn
