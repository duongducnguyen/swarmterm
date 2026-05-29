#!/usr/bin/env bash
# Open a web preview for the current terminal session in Swarmterm.
# Usage: swarmterm-preview <url>
set -euo pipefail
url="${1:?usage: swarmterm-preview <url>}"
: "${SWARMTERM_SESSION:?not inside a Swarmterm terminal}"
# urlencode the target url
enc=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$url" 2>/dev/null || printf '%s' "$url")
link="swarmterm://preview?session=${SWARMTERM_SESSION}&url=${enc}"
if command -v open >/dev/null 2>&1; then open "$link"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$link"
else echo "no opener (open/xdg-open) found" >&2; exit 1
fi
