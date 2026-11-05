#!/usr/bin/env bash
# Renders the share images and app icons. Needs google-chrome (or set CHROME) and rsvg-convert.
set -euo pipefail
cd "$(dirname "$0")/../.."
CHROME="${CHROME:-google-chrome}"
SRC="file://$PWD/tools/share/share.html"
shot() { # height output
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=2000 --window-size=1200,"$1" --screenshot="$PWD/$2" "$SRC?h=$1" >/dev/null 2>&1
}
shot 630 public/og-image.png
shot 600 public/twitter-card.png
rsvg-convert -w 180 -h 180 public/favicon.svg -o public/apple-touch-icon.png
rsvg-convert -w 192 -h 192 public/favicon.svg -o public/icon-192.png
rsvg-convert -w 512 -h 512 public/favicon.svg -o public/icon-512.png
echo "Rendered share images and icons."
