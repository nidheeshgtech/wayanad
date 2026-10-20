#!/usr/bin/env bash
# A Kerala bus livery on "KSRTC Bus 2011" (CC BY, Sketchfab; source is the Karnataka red/grey scheme), set by the
# caller (ksrtc-real.sh, privatebus-real.sh):
#   BODY, LINE: colour factors turning the grey panels into the body colour and the sill line; TOP: the colour the red
#   upper body and roof become; PLATE: number plate text; SEED: which passengers; DRIVER: the driver's shirt;
#   LOWER (optional): a colour for the red lower body, front and rear (state transport keeps them red).
# Runs inside the unpacked model folder (scripts/fetch-sketchfab.mjs). Pixel boxes are in the 1024² body sheet
# (baseColor_1.png, stored upside-down: low rows are low on the bus) and the parts sheet (baseColor_2.png).
# - grey band under the windows → body colour, with a thin line along the window sill
# - red above the windows and the roof → the top colour; the roof is mapped to two 13-px strips, so the cream (and the
#   black gaps beside them) is spread wide enough that blurred mip levels don't pull red back in
# - maker badge blanked; the author's name plate replaced by a Kerala-style yellow plate with a made-up number
set -euo pipefail
: "${BODY:?}" "${LINE:?}" "${TOP:?}" "${PLATE:?}" "${SEED:?}" "${DRIVER:?}"
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
B=baseColor_1.png P=baseColor_2.png
cp "$B" orig_body.png

grey='qs=saturation; ql=lightness; (qs<0.14 && ql>0.40 && ql<0.95)'
magick orig_body.png -channel RGB -fx "$grey ? min(1, u*channel($BODY)) : u" +channel red.png # "red": the body colour
magick orig_body.png -channel RGB -fx "$grey ? min(1, u*channel($LINE)) : u" +channel yellow.png
magick orig_body.png -channel RGB -fx "qs=saturation; qh=hue; qy=0.3*u.r+0.59*u.g+0.11*u.b; (qs>0.35 && (qh<0.05 || qh>0.95)) ? min(1, channel($TOP)*min(1.12, qy/0.30)) : u" +channel cream.png
magick cream.png -channel RGB -fx "ql=lightness; ql<0.1 ? channel($TOP) : u" +channel creamgap.png

# keep `layer` only inside the white boxes of a mask
cut() { magick "$1" -size 1024x1024 \( xc:black -fill white "${@:3}" \) -alpha off -compose CopyOpacity -composite "$2"; }
cut red.png c1.png -draw "rectangle 168,84 851,115" -draw "rectangle 182,289 851,322"
cut yellow.png c2.png -draw "rectangle 168,116 851,124" -draw "rectangle 182,323 851,331"
cut cream.png c3.png -draw "rectangle 160,180 1024,212" -draw "rectangle 160,384 1024,600"
cut creamgap.png c4.png -draw "rectangle 160,196 1024,228" -draw "rectangle 160,412 1024,600"
# front (x 0–165) and rear (x 856–1022) faces, also upside-down: grey panel round the grille and the grey band under
# the rear window → body colour; the red header over the windscreen → top colour
cut red.png c5.png -draw "rectangle 0,250 165,305" -draw "rectangle 856,294 1022,330" \
  -fill black -draw "rectangle 2,260 44,284" -draw "rectangle 122,260 165,284" -draw "rectangle 70,260 94,282" # keep lamps, emblem
cut cream.png c6.png -draw "rectangle 0,386 165,412"
magick orig_body.png c1.png -compose over -composite c2.png -composite c3.png -composite c4.png -composite c5.png -composite c6.png -composite -alpha off "$B"
if [ -n "${LOWER:-}" ]; then
  # red lower sides (both), front round the bumper and rear under the lamps → LOWER, keeping the shading
  magick "$B" -channel RGB -fx "qs=saturation; qh=hue; qy=0.3*u.r+0.59*u.g+0.11*u.b; (qs>0.35 && (qh<0.05 || qh>0.95)) ? min(1, channel($LOWER)*min(1.4, qy/0.30)) : u" +channel lower.png
  cut lower.png c7.png -draw "rectangle 150,0 870,84" -draw "rectangle 150,213 870,289" -draw "rectangle 0,225 165,310" -draw "rectangle 856,225 1022,300"
  magick "$B" c7.png -compose over -composite -alpha off "$B"
fi

# passengers behind the side glass, the driver (right side: the side without the door) and a front row in the windscreen;
# masked to the glass so window pillars stay clean (scripts/retouch/passengers.mjs)
HERE="$(dirname "$0")"
cat > pax.json <<JSON
{ "size": 1024, "seed": $SEED,
  "panes": [[178,243,126,165],[254,288,126,165],[299,373,126,165],[382,455,126,165],[463,533,126,165],[540,610,126,165],
            [617,683,126,165],[692,750,126,165],[765,798,126,165],
            [220,253,333,370],[263,323,333,370],[329,398,333,370],[404,474,333,370],[482,552,333,370],[559,629,333,370],
            [637,708,333,370],[774,840,333,370]],
  "screen": { "x0": 10, "x1": 160, "sill": 312, "top": 388, "driverSide": "low", "aspect": 1, "driverShirt": "$DRIVER" } }
JSON
node "$HERE/passengers.mjs" pax.json pax.svg
magick -background none pax.svg -channel A -evaluate multiply 0.72 +channel pax.png
magick "$B" -colorspace gray -threshold 15% \( -size 1024x1024 xc:black -fill white -draw "rectangle 170,126 800,165" -draw "rectangle 215,333 845,370" -draw "rectangle 8,310 162,390" \) -compose multiply -composite glass.png
# figure alpha × glass mask
magick pax.png \( +clone -alpha extract glass.png -compose multiply -composite \) -alpha off -compose CopyOpacity -composite pax_glass.png
magick "$B" pax_glass.png -compose over -composite "$B"

magick -size 376x76 xc:"#F2C230" -fill "#111" -font "$FONT" -pointsize 58 -gravity center -annotate +0+2 "$PLATE" \
  -bordercolor "#111" -border 6 -flip plate.png
magick "$P" -fill "#a9adb0" -draw "rectangle 30,236 340,280" plate.png -geometry +436+761 -composite "$P"
rm -f orig_body.png red.png yellow.png cream.png creamgap.png c[1-7].png lower.png plate.png pax.json pax.svg pax.png glass.png pax_glass.png
