#!/usr/bin/env bash
# Runs the built app exactly as a reviewer would: real API + real `vite preview`,
# with the proxy pointed at the API port. Ctrl+C stops both.
#
#   npm run build
#   ./scripts/demo.sh                 # API :3001, UI :5173
#   API_PORT=3100 WEB_PORT=5180 ./scripts/demo.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-5173}"
API="http://localhost:${API_PORT}/api"
WEB="http://localhost:${WEB_PORT}"

api_pid=""
web_pid=""

cleanup() {
  [[ -n "$web_pid" ]] && kill "$web_pid" 2>/dev/null || true
  [[ -n "$api_pid" ]] && kill "$api_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [[ ! -f "$ROOT/backend/dist/main.js" || ! -f "$ROOT/frontend/dist/index.html" ]]; then
  printf 'Build first: npm run build\n' >&2
  exit 1
fi

wait_for() {
  local url="$1" name="$2"
  for _ in $(seq 1 80); do
    curl -fsS "$url" >/dev/null 2>&1 && return 0
    sleep 0.25
  done
  printf '%s did not start at %s\n' "$name" "$url" >&2
  exit 1
}

PORT="$API_PORT" node "$ROOT/backend/dist/main.js" >"${TMPDIR:-/tmp}/koovo-demo-api.log" 2>&1 &
api_pid=$!
wait_for "$API/health" "API"

export VITE_API_TARGET="http://localhost:${API_PORT}"
(
  cd "$ROOT/frontend" && exec ./node_modules/.bin/vite preview --port "$WEB_PORT" --strictPort
) >"${TMPDIR:-/tmp}/koovo-demo-web.log" 2>&1 &
web_pid=$!
wait_for "$WEB" "UI"

printf '\n  API  %s\n  UI   %s\n\nCtrl+C to stop.\n' "$API" "$WEB"
wait
