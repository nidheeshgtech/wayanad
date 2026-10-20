#!/usr/bin/env bash
# "Swift 2024" (CC BY, Sketchfab) is textured from photographs, so its number plates read "SWIFT".
# Blank them to plain white plates (boxes found as bright clusters in the 1024² sheet, 2 px padding).
# Runs inside the unpacked model folder (scripts/fetch-sketchfab.mjs).
set -euo pipefail
magick baseColor_1.png -fill "#e9e9e4" \
  -draw "rectangle 143,72 161,105" -draw "rectangle 80,173 110,189" -draw "rectangle 499,306 512,320" \
  -draw "rectangle 503,383 518,400" -draw "rectangle 572,429 593,448" baseColor_1.png
