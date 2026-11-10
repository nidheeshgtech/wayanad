#!/bin/sh
# The drivers (data/drivers.ts): squeeze each rigged GLB from Higgsfield image → 3D (≈13 MB, 2–4K PNG textures) to
# ≈0.8 MB for the web — textures to 1024 WebP, meshopt geometry, the skeleton and idle animation kept.
#   sh scripts/prepare-drivers.sh <folder of raw glbs named by driver id>
set -e
SRC=${1:?folder of raw glbs}
OUT="$(dirname "$0")/../public/models/drivers"
mkdir -p "$OUT"
for f in "$SRC"/*.glb; do
  id=$(basename "$f" .glb)
  case "$id" in *.min) continue ;; esac
  npx -y @gltf-transform/cli@4.1.1 optimize "$f" "$OUT/$id.glb" \
    --compress meshopt --texture-compress webp --texture-size 1024 \
    --simplify false --instance false --join false --flatten false
done
ls -la "$OUT"
