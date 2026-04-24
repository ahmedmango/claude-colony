#!/usr/bin/env bash
# Record a 45-second screencast of demo.html to docs/demo.mp4 (+ demo.gif).
#
# Requirements: ffmpeg, macOS with Screen Recording permission for Terminal.
# Grant it at: System Settings → Privacy & Security → Screen Recording → Terminal.
#
# Usage:
#   bash docs/record-demo.sh                       # records full main display
#   bash docs/record-demo.sh 2560 1600 0 0         # records rect (w h x y)

set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Make sure server is up
if ! curl -s -o /dev/null http://localhost:4178/demo.html; then
  echo "▸ starting server on :4178"
  bun -e '
    Bun.serve({ port: 4178, fetch(req) {
      let p = new URL(req.url).pathname;
      if (p === "/") p = "/index.html";
      return new Response(Bun.file("./public" + p));
    }});
  ' &
  SERVER_PID=$!
  sleep 1
  trap "kill $SERVER_PID 2>/dev/null || true" EXIT
fi

# 2. Open demo.html in a new Chrome window (app mode = no tabs/url bar)
echo "▸ opening demo in Chrome app window"
open -na "Google Chrome" --args \
  --new-window \
  --app="http://localhost:4178/demo.html" \
  --window-size=1440,900 \
  --window-position=0,0

sleep 2

# 3. List avfoundation devices (screens are numbered)
echo "▸ available capture devices:"
ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep -E "\[[0-9]+\].*screen|\[[0-9]+\].*Capture" || true

# 4. Record 45 seconds from main display
W=${1:-1440}
H=${2:-900}
X=${3:-0}
Y=${4:-0}
OUT="docs/demo.mp4"

echo "▸ recording ${W}x${H} at (${X},${Y}) for 45s → $OUT"
echo "  (if this fails with permission error, grant Screen Recording to Terminal)"

ffmpeg -y \
  -f avfoundation \
  -capture_cursor 0 \
  -framerate 30 \
  -i "2:none" \
  -t 45 \
  -vf "crop=${W}:${H}:${X}:${Y},scale=1280:-2" \
  -c:v libx264 \
  -crf 20 \
  -preset fast \
  -pix_fmt yuv420p \
  "$OUT"

echo "✓ wrote $OUT"

# 5. Optional: generate a GIF for the README
read -p "▸ Also generate demo.gif for README? [y/N] " mk_gif
if [[ "${mk_gif,,}" == "y" ]]; then
  PALETTE=/tmp/palette.png
  ffmpeg -y -i "$OUT" -vf "fps=12,scale=900:-1:flags=lanczos,palettegen" "$PALETTE"
  ffmpeg -y -i "$OUT" -i "$PALETTE" -lavfi "fps=12,scale=900:-1:flags=lanczos [x]; [x][1:v] paletteuse" docs/demo.gif
  echo "✓ wrote docs/demo.gif"
fi

echo ""
echo "◆ done. artifact(s) in docs/"
