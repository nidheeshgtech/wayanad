#!/usr/bin/env bash
# Kerala state-transport livery on "KSRTC Bus 2011" (CC BY, Sketchfab; source is the Karnataka red/grey scheme).
# Runs inside the unpacked model folder (scripts/fetch-sketchfab.mjs). Pixel boxes are in the 1024² body sheet
# (baseColor_1.png, stored upside-down: low rows are low on the bus) and the parts sheet (baseColor_2.png).
# - grey band under the windows → red, with a thin yellow line along the window sill
# - red above the windows and the roof → cream; the roof is mapped to two 13-px strips, so the cream (and the
#   black gaps beside them) is spread wide enough that blurred mip levels don't pull red back in
# - maker badge blanked; the author's name plate replaced by a Kerala-style yellow plate with a made-up number
set -euo pipefail
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
B=baseColor_1.png P=baseColor_2.png
cp "$B" orig_body.png

grey='qs=saturation; ql=lightness; (qs<0.14 && ql>0.40 && ql<0.95)'
magick orig_body.png -channel RGB -fx "$grey ? min(1, u*channel(1.36,0.27,0.26)) : u" +channel red.png
magick orig_body.png -channel RGB -fx "$grey ? min(1, u*channel(1.62,1.32,0.42)) : u" +channel yellow.png
magick orig_body.png -channel RGB -fx "qs=saturation; qh=hue; qy=0.3*u.r+0.59*u.g+0.11*u.b; (qs>0.35 && (qh<0.05 || qh>0.95)) ? min(1, channel(0.93,0.85,0.60)*min(1.12, qy/0.30)) : u" +channel cream.png
magick cream.png -channel RGB -fx "ql=lightness; ql<0.1 ? channel(0.95,0.88,0.64) : u" +channel creamgap.png

# keep `layer` only inside the white boxes of a mask
cut() { magick "$1" -size 1024x1024 \( xc:black -fill white "${@:3}" \) -alpha off -compose CopyOpacity -composite "$2"; }
cut red.png c1.png -draw "rectangle 168,84 851,115" -draw "rectangle 182,289 851,322"
cut yellow.png c2.png -draw "rectangle 168,116 851,124" -draw "rectangle 182,323 851,331"
cut cream.png c3.png -draw "rectangle 160,180 1024,212" -draw "rectangle 160,384 1024,600"
cut creamgap.png c4.png -draw "rectangle 160,196 1024,228" -draw "rectangle 160,412 1024,600"
# front (x 0–165) and rear (x 856–1022) faces, also upside-down: grey panel round the grille and the grey band under
# the rear window → red; the red header over the windscreen → cream
cut red.png c5.png -draw "rectangle 0,250 165,305" -draw "rectangle 856,294 1022,330" \
  -fill black -draw "rectangle 2,260 44,284" -draw "rectangle 122,260 165,284" -draw "rectangle 70,260 94,282" # keep lamps, emblem
cut cream.png c6.png -draw "rectangle 0,386 165,412"
magick orig_body.png c1.png -compose over -composite c2.png -composite c3.png -composite c4.png -composite c5.png -composite c6.png -composite -alpha off "$B"

magick -size 376x76 xc:"#F2C230" -fill "#111" -font "$FONT" -pointsize 58 -gravity center -annotate +0+2 "KL 15 A 2011" \
  -bordercolor "#111" -border 6 -flip plate.png
magick "$P" -fill "#a9adb0" -draw "rectangle 30,236 340,280" plate.png -geometry +436+761 -composite "$P"
rm -f orig_body.png red.png yellow.png cream.png creamgap.png c[1-6].png plate.png
