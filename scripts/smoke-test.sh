#!/usr/bin/env bash
# End-to-end smoke test against real processes and real HTTP (no mocks).
# Usage: ./scripts/smoke-test.sh [--no-build]
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
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }

wait_for() {
  local url="$1" name="$2"
  for _ in $(seq 1 80); do
    if curl -fsS "$url" >/dev/null 2>&1; then return 0; fi
    sleep 0.25
  done
  fail "$name did not become ready at $url"
}

# check <url> <js-expression over `d`> <label>
check() {
  local url="$1" expr="$2" label="$3" body
  body="$(curl -fsS "$url")" || fail "$label (request failed: $url)"
  if ! printf '%s' "$body" | node -e '
      let raw = "";
      process.stdin.on("data", (chunk) => (raw += chunk));
      process.stdin.on("end", () => {
        const d = JSON.parse(raw);
        const expression = process.argv[1];
        if (!new Function("d", "return (" + expression + ");")(d)) {
          console.error("assertion failed:", expression);
          process.exit(1);
        }
      });
    ' "$expr"; then
    fail "$label — body: $body"
  fi
  pass "$label"
}

# expect_status <method> <url> <body-json|""> <expected-code> <label>
expect_status() {
  local method="$1" url="$2" body="$3" expected="$4" label="$5" actual
  if [[ -n "$body" ]]; then
    actual="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" -H 'Content-Type: application/json' -d "$body" "$url")"
  else
    actual="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$url")"
  fi
  [[ "$actual" == "$expected" ]] || fail "$label (expected $expected, got $actual)"
  pass "$label -> $actual"
}

if [[ "${1:-}" != "--no-build" ]]; then
  printf 'Building backend and frontend...\n'
  (cd "$ROOT" && npm run build >/dev/null)
fi

printf 'Starting backend on :%s\n' "$API_PORT"
PORT="$API_PORT" node "$ROOT/backend/dist/main.js" >"${TMPDIR:-/tmp}/koovo-api.log" 2>&1 &
api_pid=$!
wait_for "$API/health" backend

printf 'Starting frontend preview on :%s\n' "$WEB_PORT"
(
  cd "$ROOT/frontend" &&
    exec ./node_modules/.bin/vite preview --port "$WEB_PORT" --strictPort
) >"${TMPDIR:-/tmp}/koovo-web.log" 2>&1 &
web_pid=$!
wait_for "$WEB" frontend

echo
echo "--- API ---"
check "$API/health" 'd.status === "ok" && typeof d.timestamp === "string"' "health endpoint"
check "$API/transactions" 'd.summary.total === 11 && d.summary.valid === 5 && d.summary.needsAttention === 4 && d.summary.excluded === 2 && d.records.length === 11' "initial summary 5/4/2 of 11"
check "$API/transactions" 'd.records.find(r => r.id === "R003").issues[0].code === "TOTAL_MISMATCH"' "R003 flagged TOTAL_MISMATCH"
check "$API/transactions" 'd.records.find(r => r.id === "R005").duplicateOfRecordId === "R001"' "R005 is a duplicate of R001"
check "$API/transactions" 'd.records.find(r => r.id === "R007").validationStatus === "Valid"' "R007 valid across clients"
check "$API/transactions?clientId=C02" 'd.records.length === 1 && d.records[0].id === "R007" && d.summary.valid === 5' "client filter keeps global summary"
check "$API/transactions?validationStatus=Needs%20Attention" 'd.records.map(r => r.id).join(",") === "R003,R004,R005,R011"' "validation status filter"
check "$API/transactions?clientId=ZZZ" 'd.records.length === 0 && d.summary.total === 11' "empty filter result is not an error"
expect_status GET "$API/transactions?validationStatus=Bogus" '' 400 "unknown filter rejected"
expect_status GET "$API/transactions/R999" '' 404 "unknown record rejected"

echo
echo "--- Review guardrails ---"
expect_status POST "$API/transactions/R001/review" '{"action":"MARK_REVIEWED","reviewerId":"acct-nathan","reviewerName":"Nathan Fletcher"}' 200 "R001 marked reviewed"
expect_status POST "$API/transactions/R001/review" '{"action":"MARK_REVIEWED","reviewerId":"acct-nathan"}' 409 "repeat transition rejected"
expect_status POST "$API/transactions/R003/review" '{"action":"MARK_REVIEWED","reviewerId":"acct-nathan"}' 422 "R003 cannot be reviewed"
expect_status POST "$API/transactions/R003/review" '{"action":"MARK_NEEDS_CORRECTION","reviewerId":"acct-nathan"}' 400 "note required"
expect_status POST "$API/transactions/R003/review" '{"action":"MARK_NEEDS_CORRECTION","note":"Total does not match the invoice","reviewerId":"acct-nathan"}' 200 "R003 sent for correction"
expect_status POST "$API/transactions/R006/review" '{"action":"MARK_REVIEWED","reviewerId":"acct-nathan"}' 422 "Draft record excluded"
expect_status POST "$API/transactions/R009/review" '{"action":"MARK_NEEDS_CORRECTION","note":"Please correct","reviewerId":"acct-nathan"}' 422 "Void record excluded"
check "$API/transactions" 'd.summary.reviewBreakdown.reviewed === 1 && d.summary.reviewBreakdown.needsCorrection === 1' "summary reflects review actions"
check "$API/audit-logs" 'd.entries.length === 2 && d.entries[0].recordId === "R003"' "audit log newest first"

echo
echo "--- Frontend (production build through the Vite proxy) ---"
if ! curl -fsS "$WEB/" | grep -q 'Koovo'; then fail "frontend index not served"; fi
pass "frontend index served"
check "$WEB/api/transactions?clientId=C01" 'd.records.length === 10' "browser-origin API call via proxy"

echo
printf 'Shutting down...\n'
cleanup
api_pid=""
web_pid=""

sleep 0.5
if lsof -nP -iTCP:"$API_PORT" -sTCP:LISTEN >/dev/null 2>&1; then fail "port $API_PORT still in use"; fi
if lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1; then fail "port $WEB_PORT still in use"; fi
pass "both processes shut down cleanly"

printf '\nSmoke test complete: all checks passed.\n'
