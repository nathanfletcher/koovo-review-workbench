# Koovo — Accounting Data Review Workbench

A local full-stack workbench that ingests 11 fictional GBP accounting records from Xero and Sage,
validates them against the supplied business rules, and gives an accountant a reviewable workflow with
an audit trail.

- **Backend:** TypeScript + NestJS (`/backend`), in-memory repository, no database required
- **Frontend:** React + TypeScript + Vite (`/frontend`)
- **Tests:** 162 automated checks — Jest unit (86), Supertest integration (51), Vitest/RTL UI (25), plus 22 live smoke assertions and 20 HTTP rule probes
- **No paid services, no cloud, no Docker, no network access at test time**

---

## Quickstart

Prerequisites: **Node ≥ 20** and npm (verified on Node 22.22.3 / npm 10.9.8).

```bash
# 1. Install (root tooling + both projects)
npm install
npm run setup

# 2. Run both apps (API :3001, UI :5173)
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` to `http://localhost:3001`, so the
browser only ever talks to one origin.

### Other commands

| Command | What it does |
|---|---|
| `npm test` | Backend unit → backend integration → frontend UI tests |
| `npm run typecheck` | `tsc --noEmit` in both projects |
| `npm run lint` | ESLint (flat config, TypeScript rules) in both projects |
| `npm run build` | `nest build` + `tsc --noEmit && vite build` |
| `npm run verify` | typecheck + lint + all tests + build (the one command that gates delivery) |
| `npm run smoke` | Boots the **real built** API and UI, asserts over real HTTP, then shuts both down |
| `npm run probe` | Sends 20 rule probes to a running API (`POST /api/validate`) and checks each verdict |

Individual projects:

```bash
npm --prefix backend run test        # unit (domain)
npm --prefix backend run test:e2e    # API integration (Supertest, no port bound)
npm --prefix frontend run test:run   # UI tests (mocked fetch, real components)
PORT=4000 node backend/dist/main.js  # run the built API on another port
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ frontend/ (React + TS)                                             │
│  App → useWorkbench (fetches, filters, actions, error states)       │
│      → SummaryCards · FilterBar · RecordsTable · Drawer · Timeline  │
│  api/client.ts — typed fetch wrapper, ApiError, one error contract  │
└───────────────────────────┬────────────────────────────────────────┘
                            │ HTTP (proxied /api)
┌───────────────────────────▼────────────────────────────────────────┐
│ backend/ (NestJS)                                                  │
│  TransactionsController / AuditLogController / HealthController     │
│      → TransactionsService  (guardrails → HTTP status mapping)      │
│      → WorkbenchRepository  (in-memory records + append-only audit) │
│      → domain/  ← PURE. no Nest, no HTTP, no I/O                    │
│           money.ts             decimal → integer pence              │
│           validation-engine.ts rules, dedupe, summary               │
│           review-state.ts      transition decision table            │
└────────────────────────────────────────────────────────────────────┘
```

**Why the domain is framework-free.** Every rule is a pure function over typed records, so the
validation logic is exhaustively unit-tested (86 tests) without booting Nest, and can be dropped into a
worker, a batch job, or a different transport unchanged. Nest is only an adapter that maps decisions to
HTTP statuses.

---

## Business rules and expected outcomes

| Rule | Implementation |
|---|---|
| Draft / Void → **Excluded** (counted in summary, no review actions) | Exclusion gate runs first; these records never reach posted rules or the dedupe index |
| Identity = `Client + Source + Source ID`; identical repeats not processed twice | `transactionKey = client::source::sourceId`; first occurrence owns the key, later ones get `DUPLICATE_TRANSACTION`, stay visible, and are excluded from reporting |
| Different clients may share a Source ID | `C01::Xero::X-101` ≠ `C02::Xero::X-101` |
| Posted **Bills** must be non-negative | `NEGATIVE_BILL_AMOUNT` listing Subtotal/VAT/Total |
| Posted **Credits** may be negative | Sign rules only apply to Bills; a Credit failing the math check is still flagged |
| `Total = Subtotal + VAT` to 2dp | Integer pence comparison (`30000 + 6000 ≠ 36500`) |
| Posted records need a supplier | `MISSING_SUPPLIER`; `-`, `""`, whitespace all normalise to missing |

Expected result on load (asserted in unit, integration, UI and smoke tests):

| Status | Count | Records |
|---|---|---|
| Valid | 5 | R001, R002, R007, R008, R010 |
| Needs Attention | 4 | R003 (total mismatch), R004 (missing supplier), R005 (duplicate of R001), R011 (negative bill) |
| Excluded | 2 | R006 (Draft), R009 (Void) |

### Review state machine (separate from validation status)

| Current | Action | Result |
|---|---|---|
| any | — | `Unreviewed` initially, even when `Valid` |
| `Valid` | Mark Reviewed | `Reviewed` |
| `Valid` / `Needs Attention` | Mark Needs Correction + note | `Needs Correction` |
| `Needs Correction` (Valid record) | Mark Reviewed | `Reviewed` (correction verified) |
| `Needs Attention` | Mark Reviewed | **422** `UNRESOLVED_VALIDATION_ISSUES` |
| `Excluded` | any action | **422** `EXCLUDED_RECORD` |
| any | same target twice | **409** `ALREADY_IN_STATE` |

---

## API

Base URL `http://localhost:3001/api`. Every non-2xx response has one shape:

```json
{ "statusCode": 422, "code": "UNRESOLVED_VALIDATION_ISSUES", "message": "R003 has 1 unresolved validation issue (TOTAL_MISMATCH) and cannot be marked as Reviewed." }
```

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | `{ status, timestamp }` |
| `GET` | `/transactions?clientId=&validationStatus=&reviewStatus=` | `{ summary, clients, records }`. `summary`/`clients` always describe the **full** dataset; `records` is filtered. Unknown params/enums → `400` |
| `GET` | `/transactions/:id` | One record with `issues` + `auditHistory`; `404` if unknown |
| `POST` | `/transactions/:id/review` | `{ action, note?, reviewerId, reviewerName? }` → `200 { record, auditEntry, summary }` |
| `POST` | `/validate` | **Dry run** — `{ records: [...], context?: "isolated" \| "dataset" }` → validation results, **nothing persisted** |
| `GET` | `/audit-logs` | `{ entries }`, newest first |

Error codes: `INVALID_REQUEST` (400), `NOTE_REQUIRED` (400), `RECORD_NOT_FOUND` (404),
`ALREADY_IN_STATE` (409), `EXCLUDED_RECORD` (422), `UNRESOLVED_VALIDATION_ISSUES` (422).

### Probing the rules yourself (dry run)

The brief hands over the dataset, so there is deliberately **no ingest UI**: a real ingest path needs
idempotency keys, re-validation of neighbouring records and ingest audit events, and faking those in an
in-memory demo would be dishonest. Instead the rules are exposed as a dry run, so anyone can throw a
payload at them without polluting the review queue.

```bash
curl -s -X POST localhost:3001/api/validate -H 'Content-Type: application/json' -d '{
  "records": [{
    "clientId": "C99", "source": "Xero", "sourceId": "X-900",
    "type": "Bill", "sourceStatus": "Posted", "supplier": "Test Supplier",
    "subtotal": "300.00", "vat": "60.00", "total": "365.00"
  }]
}'
# → 200, validationStatus "Needs Attention", issues [TOTAL_MISMATCH]
```

```bash
npm run dev:backend   # terminal 1
npm run probe         # terminal 2 — 20 probes covering every rule, exits non-zero on a regression
```

Contract details:

- `records`: 1–50 candidate records. `id` is optional (`INPUT-1`, `INPUT-2`… assigned for you).
- Amounts accept strings or numbers; numbers are stringified and then parsed by the same strict
  grammar, so nothing reaches the engine as a float. `""` or `"-"` means *missing* (a finding, not an error).
- `context: "isolated"` (default) evaluates the payload against itself; `context: "dataset"` puts the
  current 11 records in front of it so duplicate detection sees real identities.
- **A bad record is data, a bad request is an error**: a mismatched total returns `200` with a finding;
  an unknown `source` returns `400 INVALID_REQUEST` naming the field.
- `persisted: false` is in every response, and the dataset summary is identical before and after
  (asserted by the probes and by `backend/test/integration/validate.e2e-spec.ts`).

Where each rule is proven:

| Rule | Unit test | HTTP proof |
|---|---|---|
| Exclusion (Draft/Void) | `validation-engine.spec.ts` → "excludes Draft and Void" | probe `draft, broken maths`, `void record` |
| Composite identity, identical duplicate | `validation-engine.spec.ts` → R005 | probe `dataset: copy of R001` |
| Cross-client same Source ID | `validation-engine.spec.ts` → R007 | probe `dataset: same ID, other client` |
| Conflicting duplicate | `validation-engine.spec.ts` → "conflicting duplicate" | `POST /validate` with a changed total |
| Bill sign rule | `validation-engine.spec.ts` → R011 | probe `negative bill` |
| Credit may be negative | `validation-engine.spec.ts` → R010 | probe `negative credit` |
| `Total = Subtotal + VAT` in pence | `money.spec.ts` + `validation-engine.spec.ts` → R003 | probes `total mismatch`, `one-penny drift` |
| Missing supplier | `validation-engine.spec.ts` → R004 | probes `supplier '-'`, `supplier null` |
| Unparseable/missing amount | `money.spec.ts` (grammar table) | probe `unparseable amount` |
| Review guardrails (422/409) | `review-state.spec.ts` | `tests/integration/transactions.e2e-spec.ts` + `scripts/smoke-test.sh` |

---

## Testing strategy

| Layer | File | Count | Covers |
|---|---|---|---|
| Unit (money) | `backend/test/unit/money.spec.ts` | 36 | Accepted/rejected amount grammar, negatives, missing values, safe-range overflow, formatting, float-drift cases |
| Unit (rules) | `backend/test/unit/validation-engine.spec.ts` | 35 | All 11 records row-by-row, exact issue codes, cross-client vs duplicate, conflicting duplicates, excluded records and the dedupe index, multi-issue ordering, purity/idempotence, penny boundaries |
| Unit (state) | `backend/test/unit/review-state.spec.ts` | 15 | Every allowed transition and every rejection branch, note bounds, precedence |
| Integration (review workflow) | `backend/test/integration/transactions.e2e-spec.ts` | 28 | Real Nest app + pipes + filter + fixed clock: list shape/order/summary, each filter, summary invariance, 400/404/409/422 contracts, audit append-only, repository reset |
| Integration (dry run) | `backend/test/integration/validate.e2e-spec.ts` | 23 | Every rule through `POST /validate`, both dedupe contexts, id defaulting, numeric coercion, payload limits, request-vs-record errors, proof that nothing persists |
| UI | `frontend/src/__tests__/workbench.test.tsx` | 10 | Summary + 11 rows, client & status filters (asserting the API was called), drawer explanations, disabled guardrails, review flows with audit entries, loading/error/retry/empty states, Escape |
| UI utils | `frontend/src/__tests__/format.test.ts` | 15 | GBP display formatting, timestamps |
| End-to-end | `scripts/smoke-test.sh` | 22 assertions | Real built API + real Vite preview over real HTTP, then clean shutdown |
| Rule probes | `scripts/probe.sh` | 20 assertions | Every rule over HTTP against a running API, including "nothing was persisted" |

The UI test fixture is **generated from the real engine** (`scripts/generate-fixture.js`) so mocked
tests cannot drift from the server's behaviour.

---

## Engineering decisions and trade-offs

1. **Integer pence, not floats.** `100.10 + 20.20` is `120.30000000000001` in IEEE-754, which would
   report a mismatch on a correct invoice. Amounts are parsed to pence with string arithmetic and every
   comparison is integer. Formatting is the only place a `£` appears.
2. **Validation ≠ review state.** Validation is derived (never stored); review state is stored and
   audited. A `Valid` record can sit `Unreviewed`, and `Needs Correction` is a reviewer's judgement, not
   a validation result.
3. **Duplicates are retained, not deleted.** The brief asks to avoid double-processing *and* keep the
   original records for inspection, so the duplicate stays in the dataset flagged as
   `Needs Attention`, with `processedForReporting: false`.
4. **Excluded records bypass the dedupe index.** A `Draft` copy of a posted transaction is excluded, not
   reported as a duplicate: it is never processed, so it can neither claim nor consume a transaction
   identity. Tested both ways round.
5. **`identical` vs `conflicting` duplicates.** Same identity with different values is a different
   conversation with the client, so `duplicateKind` distinguishes them; the issue code stays
   `DUPLICATE_TRANSACTION` so summaries stay stable.
6. **Repeat transitions are rejected (409), not silently logged.** An audit trail with no-op entries is
   noise; the UI disables the button and shows the reason.
7. **Request completeness is checked before record state (400 before 422).** A malformed request is the
   caller's bug; the record's state is business logic. Documented and tested so the ordering is a
   decision, not an accident.
8. **Server-side filtering, server-computed summary.** Filtering in the browser would let the UI and API
   disagree; the summary always describes the full dataset so headline numbers do not move when a filter
   is applied.
9. **Repository boundary + append-only audit.** `WorkbenchRepository` is the only mutable state. Swapping
   it for PostgreSQL means writing the record update and the audit insert in one transaction; nothing
   above it changes.
10. **Deterministic time.** A `Clock` port is injected; integration tests assert exact ISO timestamps and
    audit IDs (`AUD-0001`) instead of "something happened".
11. **No UI framework.** Plain CSS keeps the bundle at ~74 kB gzipped and keeps every element reviewable.
    The brief explicitly says visual polish is not assessed.
12. **Known limitations (deliberate).** No authentication/authorisation — the client asserts a mock
    reviewer (`acct-nathan`), and the server trusts `reviewerId` (documented, not hidden). No persistence
    across restarts. No pagination (11 records). No concurrency/optimistic-locking on review actions.

### What changes for production

- **Persistence:** `transactions` table (composite unique index on `client_id, source, source_id` for
  dedupe at ingestion) + `review_audit` append-only table with `ON DELETE RESTRICT`; both written in one
  transaction so a state change can never exist without its audit entry.
- **Ingestion:** Xero/Sage webhooks → idempotency keys (`client:source:sourceId:update-id`), raw payload
  archive, validation on ingest plus a nightly re-validation sweep (rules change; historical rows must be
  re-scored).
- **Auth/RBAC:** OIDC; `reviewerId` from the token, role checks on transitions (`accountant` can review,
  `read_only` cannot), per-firm tenant scoping.
- **Scale:** keyset pagination on `(created_at, id)`, summary materialised per firm/day, `reviewStatus`
  indexed, optimistic concurrency (`If-Match` on the record version) to stop two reviewers overwriting
  each other.
- **Observability:** structured request logs with record IDs, metrics on rejection codes (a spike in
  `UNRESOLVED_VALIDATION_ISSUES` means upstream data quality dropped).

---

## Assumptions made where the brief was silent

- `"-"` means **missing**, and a missing supplier on a posted record is a `MISSING_SUPPLIER` issue.
- Amount strings are strict: optional sign, up to 2 decimals, no `£`, no thousands separators. Anything
  else is `INVALID_MONETARY_VALUE` rather than being guessed at, and a record whose amounts cannot be
  parsed skips sign/math checks (they would be meaningless).
- A `Needs Attention` record may be sent for correction — that is exactly the accountant's workflow — but
  may never be marked `Reviewed`.
- Excluded records appear in the summary and in the review breakdown as `Unreviewed`.
- Review actions are not allowed to change validation status: correcting the source data is an upstream
  action, not a review action.

---

## Five-minute live demo (interview)

```bash
npm install && npm run setup   # once
npm run verify                 # typecheck + lint + 162 tests + builds
npm run dev                    # http://localhost:5173
```

1. **Summary strip** — 11 records, 5 Valid / 4 Needs Attention / 2 Excluded.
2. **Filter `C02`** — only R007; the summary stays at 5/4/2 (it describes the dataset, not the filter).
   Note R007 is `Valid` because `C02 + Xero + X-101` is a different identity from R001.
3. **Filter `Needs Attention`** — R003, R004, R005, R011. Open **R003**: the drawer states
   `Total (£365.00) ≠ Subtotal (£300.00) + VAT (£60.00) (expected £360.00)` and *Mark as Reviewed* is
   disabled with the reason.
4. **Open R005** — flagged as an identical duplicate of R001, `processedForReporting: false`, retained
   for inspection.
5. **Open R001 → Mark as Reviewed** — review state changes, an audit entry appears with reviewer and
   timestamp, and the summary's review counts update.
6. **Open R003 → Mark as Needs Correction** — the button stays disabled until a 3+ character note is
   entered; submit, and the note lands in the activity history.
7. **Open R006 (Draft)** — both actions disabled with the exclusion reason; it still counts in Excluded.
8. **Prove the guardrails are server-side:** `curl -X POST localhost:3001/api/transactions/R003/review
   -H 'Content-Type: application/json' -d '{"action":"MARK_REVIEWED","reviewerId":"acct-nathan"}'
   → 422`.
9. `npm run smoke` — the same guarantees re-asserted against real processes, then clean shutdown.
10. **`npm run probe`** (API already running) — 20 rule probes over HTTP for anyone who wants to test
    their own numbers: send `subtotal 300.00 / vat 60.00 / total 365.00` and `TOTAL_MISMATCH` comes
    back; send a Draft record and it is excluded; post a copy of R001 with `"context":"dataset"` and it
    is flagged as a duplicate of R001 — and the dataset summary is unchanged afterwards.

### AI assistance

AI coding assistants were used (the brief permits them). To keep that auditable: the specification
(`PLAN.md`) was written and audited first, every rule has a test, the UI fixture is generated from the
engine rather than hand-written, and the smoke script exercises real processes. Nothing in the app
depends on a service I cannot explain line by line.

---

## Repository layout

```
backend/   NestJS API — domain/, data/, repositories/, transactions/, validation/, common/, test/{unit,integration}
frontend/  React workbench — api/, hooks/, components/, utils/, test-utils/, __tests__/
scripts/   smoke-test.sh (real-process E2E), probe.sh (HTTP rule probes), generate-fixture.js (engine → UI fixture)
PLAN.md    Audited execution specification (rules, contracts, gate commands, deviation log)
```
