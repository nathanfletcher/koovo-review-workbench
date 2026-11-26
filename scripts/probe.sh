#!/usr/bin/env bash
# Probes every validation rule over real HTTP against a running API.
#
#   npm run dev:backend     # in one terminal
#   npm run probe           # in another
#
# Nothing here writes data: POST /api/validate is a dry run, so it is safe to
# probe a shared demo while someone is reviewing.
set -euo pipefail

API="${API:-http://localhost:3001/api}"
failures=0
checks=0

fail() { printf 'FAIL  %s\n' "$*" >&2; failures=$((failures + 1)); }
pass() { printf 'PASS  %s\n' "$*"; }

if ! curl -fsS "$API/health" >/dev/null 2>&1; then
  printf 'API not reachable at %s\nStart it with: npm run dev:backend\n' "$API" >&2
  exit 1
fi

# payload [context] [key=value ...]
#   context: "-" for isolated (default) or "dataset"
#   values: strings by default; prefix with num: for a JSON number; "null" for null
payload() {
  node -e '
    const [context, ...pairs] = process.argv.slice(1);
    const record = {
      clientId: "C99",
      source: "Xero",
      sourceId: "X-900",
      type: "Bill",
      sourceStatus: "Posted",
      supplier: "Test Supplier",
      subtotal: "10.00",
      vat: "2.00",
      total: "12.00",
    };

    for (const pair of pairs) {
      const index = pair.indexOf("=");
      const key = pair.slice(0, index);
      const raw = pair.slice(index + 1);
      record[key] = raw === "null" ? null : raw.startsWith("num:") ? Number(raw.slice(4)) : raw;
    }

    const body = { records: [record] };
    if (context !== "-") body.context = context;
    console.log(JSON.stringify(body));
  ' "$@"
}

# probe <label> <expected fragment of "status | context | result"> <payload>
probe() {
  local label="$1" expected="$2" body="$3" tmp code line
  tmp="$(mktemp)"

  if ! code="$(curl -sS -o "$tmp" -w '%{http_code}' -X POST "$API/validate" \
    -H 'Content-Type: application/json' -d "$body")"; then
    rm -f "$tmp"
    fail "$label (request failed)"
    return
  fi

  line="$(node -e '
    const status = process.argv[1];
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => {
      const d = JSON.parse(raw);
      if (Array.isArray(d.records)) {
        const results = d.records
          .map((r) => r.validationStatus + (r.issues.length ? "[" + r.issues.map((i) => i.code).join(",") + "]" : ""))
          .join(" ; ");
        console.log(`${status} | ${d.context} | ${results}`);
      } else {
        console.log(`${status} | ${d.code ?? "?"} | ${d.message ?? ""}`);
      }
    });
  ' "$code" <"$tmp")"
  rm -f "$tmp"

  checks=$((checks + 1))

  if [[ "$line" == *"$expected"* ]]; then
    pass "$(printf '%-30s %s' "$label" "$line")"
  else
    fail "$(printf '%-30s expected "%s", got "%s"' "$label" "$expected" "$line")"
  fi
}

echo "Dry-run probes against $API/validate"
echo

echo "--- arithmetic (integer pence, never floats) ---"
probe "clean record"          "200 | isolated | Valid"                   "$(payload -)"
probe "total mismatch"        "Needs Attention[TOTAL_MISMATCH]"         "$(payload - subtotal=300.00 vat=60.00 total=365.00)"
probe "one-penny drift"       "Needs Attention[TOTAL_MISMATCH]"         "$(payload - subtotal=100.00 vat=20.00 total=120.01)"
probe "float-hostile, correct" "200 | isolated | Valid"                 "$(payload - subtotal=100.10 vat=20.20 total=120.30)"
probe "single decimal"        "200 | isolated | Valid"                  "$(payload - subtotal=100.5 vat=20.5 total=121)"
probe "unparseable amount"    "Needs Attention[INVALID_MONETARY_VALUE]" "$(payload - subtotal=1,000.00 vat=20.00 total=120.00)"

echo
echo "--- signs ---"
probe "negative bill"         "Needs Attention[NEGATIVE_BILL_AMOUNT]"   "$(payload - subtotal=-30.00 vat=-6.00 total=-36.00)"
probe "negative credit"       "200 | isolated | Valid"                  "$(payload - type=Credit sourceId=X-901 supplier=Caldera subtotal=-100.00 vat=-20.00 total=-120.00)"

echo
echo "--- completeness ---"
probe "supplier '-'"          "Needs Attention[MISSING_SUPPLIER]"       "$(payload - supplier=-)"
probe "supplier null"         "Needs Attention[MISSING_SUPPLIER]"       "$(payload - supplier=null)"

echo
echo "--- exclusions ---"
probe "draft, broken maths"   "200 | isolated | Excluded"               "$(payload - sourceStatus=Draft subtotal=300.00 vat=60.00 total=999.00 supplier=-)"
probe "void record"           "200 | isolated | Excluded"               "$(payload - sourceStatus=Void subtotal=80.00 vat=0.00 total=80.00)"

echo
echo "--- issue ordering ---"
probe "three issues at once"  "MISSING_SUPPLIER,NEGATIVE_BILL_AMOUNT,TOTAL_MISMATCH" \
  "$(payload - supplier=- subtotal=-10.00 vat=-2.00 total=-13.00)"

echo
echo "--- identity and deduplication ---"
probe "isolated: copy of R001"        "200 | isolated | Valid" \
  "$(payload - clientId=C01 sourceId=X-101 supplier='Westline Office' subtotal=100.00 vat=20.00 total=120.00)"
probe "dataset: copy of R001"         "Needs Attention[DUPLICATE_TRANSACTION]" \
  "$(payload dataset clientId=C01 sourceId=X-101 supplier='Westline Office' subtotal=100.00 vat=20.00 total=120.00)"
probe "dataset: same ID, other client" "200 | dataset | Valid" \
  "$(payload dataset clientId=C03 sourceId=X-101 supplier='Westline Office' subtotal=100.00 vat=20.00 total=120.00)"
probe "dataset: padded ids duplicate"  "Needs Attention[DUPLICATE_TRANSACTION]" \
  "$(payload dataset clientId=' C01 ' sourceId='X-101 ' supplier='Westline Office' subtotal=100.00 vat=20.00 total=120.00)"

echo
echo "--- request errors (a bad request is an error, a bad record is data) ---"
probe "empty records array"   "400 | INVALID_REQUEST"                   '{"records":[]}'
probe "unknown source"        "400 | INVALID_REQUEST"                   "$(payload - source=QuickBooks)"
probe "numeric amounts"       "200 | isolated | Valid"                  "$(payload - subtotal=num:100 vat=num:20 total=num:120)"

echo
echo "--- nothing was persisted ---"
read_dataset() {
  curl -fsS "$API/transactions" | node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => {
      const d = JSON.parse(raw);
      console.log(JSON.stringify(d.summary) + " records=" + d.records.length);
    });
  '
}

before="$(read_dataset)"
after="$(read_dataset)"
checks=$((checks + 1))
if [[ "$before" == "$after" && "$before" == *'"total":11'* ]]; then
  pass "$(printf '%-30s %s' "dataset unchanged" "$after")"
else
  fail "dataset changed: $before -> $after"
fi

echo
if (( failures > 0 )); then
  printf '%d of %d probes failed\n' "$failures" "$checks" >&2
  exit 1
fi

printf 'All %d probes passed.\n' "$checks"
