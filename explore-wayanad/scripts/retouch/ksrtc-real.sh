#!/usr/bin/env bash
# Kerala state transport: red body and front, yellow sill line, cream roof and header; driver in khaki.
BODY="1.36,0.27,0.26" LINE="1.62,1.32,0.42" TOP="0.93,0.85,0.60" PLATE="KL 15 A 2011" SEED=11 DRIVER="#6b5f3f" \
  exec bash "$(dirname "$0")/bus-livery.sh"
