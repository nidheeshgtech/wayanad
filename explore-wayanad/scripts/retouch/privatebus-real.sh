#!/usr/bin/env bash
# A Kozhikode–Wayanad private bus: deep blue body and front, orange sill line, white-cream top; other passengers.
LOWER="0.12,0.30,0.62" BODY="0.21,0.55,1.06" LINE="1.72,0.95,0.20" TOP="0.95,0.94,0.90" PLATE="KL 11 B 7744" SEED=23 DRIVER="#d8d4ca" \
  exec bash "$(dirname "$0")/bus-livery.sh"
