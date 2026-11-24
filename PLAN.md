# PLAN.md — Koovo Accounting Data Review Workbench (v2, audited)

**Status:** Executable specification. Phases 1–4 run sequentially; each phase ends in a hard verification gate.
**Stack:** TypeScript · NestJS (backend) · React + TypeScript + Vite (frontend) · Jest/Supertest · Vitest/RTL
**Runtime:** Node ≥ 20 (verified on 22.22.3), npm 10.9.8, zero paid services, zero external DB.

---

## 0. Audit of v1 — what was wrong and what changed

The first draft was architecturally sound (pure domain engine, integer-pence math, repository abstraction).
It was **not yet executable without guesswork**: several rules were left open, two gates could not fail, and
three requirements of the brief were untested. Every delta below is now pinned in this document and covered by a test.

| # | Gap in v1 | Why it breaks execution / grading | Resolution in v2 |
|---|---|---|---|
| A1 | `Rules` says "Phases 1–5"; only 4 exist | Ambiguous completion condition | §7 defines exactly Phases 1–4 + gates; no phase 5 |
| A2 | `INVALID_MONETARY_VALUE` declared but **never raised**; parser contract unspecified | Dead code; malformed input would crash or silently pass | §4.4 defines the parser contract, accepted grammar, and the exact issues raised for missing/unparseable amounts |
| A3 | Error status left as "422 **or** 400" throughout | Tests can only assert one; a reviewer will notice | §4.5 is a single decision table: **400** malformed request, **422** rule/state violation, **409** no-op transition, **404** unknown record |
| A4 | Re-marking a record as `Reviewed` when already `Reviewed` undefined | Non-deterministic audit log, untested path | §4.5 → `409 ALREADY_IN_STATE` + UI disables the button |
| A5 | Duplicate detection ignored the "**identical**" qualifier; same key with different values undefined | Brief says "identical repeated records"; a conflicting duplicate is a different conversation with the accountant | §4.3 adds `duplicateKind: 'identical' \| 'conflicting'` and distinct human-readable messages under one code |
| A6 | Excluded records' effect on the dedupe seen-set only implied | `Draft` + `Posted` sharing a key could be scored either way | §4.3: excluded records neither consult nor populate the seen-set (documented as a deliberate choice + tested) |
| A7 | `processedForReporting` defined as "false when Excluded **or** duplicate" | Leaves `Needs Attention` non-duplicates marked as processed — wrong signal for downstream totals | §4.1: `processedForReporting === (validationStatus === 'Valid')` |
| A8 | Money display inconsistent (`£-30.00` in one message, `£` elsewhere) | Visible inconsistency in a finance product | §4.4 single formatter: `-£36.00`, `£0.00`, always 2dp |
| A9 | Timestamps/IDs non-deterministic (implicit `new Date()` / `uuid`) | Audit assertions can't be exact | §4.5 injects a `Clock` port; audit IDs are `AUD-0001…` sequence |
| A10 | Gates ran tests only — **no lint or typecheck** despite "no suppressed errors" rule | Rule was unenforceable; Gate 4's `npm run typecheck` had no defined root script | §7 gates run `lint` + `typecheck` + tests + build; root `package.json` scripts specified in §2.3 |
| A11 | Root `npm install` doesn't install `backend/` or `frontend/` deps | Fresh-clone README would fail at step 2 | §2.3 `npm run setup` installs all three projects; README documents it |
| A12 | E2E on a real port (`3001`) | Port collisions in CI/interview laptops | `createTestApp()` bootstraps the Nest app in-process via Supertest (ephemeral), `configureApp()` shared with `main.ts` |
| A13 | Frontend criteria had **no loading / error / empty / not-found states, no retry, no a11y** | Brief asks for a usable review workflow; a dead-end on API failure is the classic failure | §6.5 makes the four states + retry + dialog semantics explicit and tested |
| A14 | Filters tested only in the UI; server filtering contract unverified for `reviewStatus` and invalid enums | Brief asks for filtering; bad input would 500 | §5 `GET /api/transactions` validates query params (400) and is tested with `clientId`, `validationStatus`, `reviewStatus`, and an invalid value |
| A15 | No test that summary counts stay global while a filter is active | The exact thing an accountant will click | §7 Phase 2 e2e asserts summary invariance under filters |
| A16 | Missing `.gitignore`, git init, and submission hygiene steps | Submission is **a Git repository link** | §7 Phase 4.4 + `.gitignore` (node_modules, dist, coverage, .env, .DS_Store) |
| A17 | `auditHistory` embedded per record only; global endpoint unused by UI | Unused endpoint = untested surface | §5.5 keeps `GET /api/audit-logs`, tested in Phase 2, and the drawer renders per-record history |
| A18 | Issue ordering on records with multiple issues unspecified | Snapshot/story assertions become flaky | §4.3 fixes evaluation order and is asserted in a multi-issue unit test |
| A19 | Reviewer input was a free-text field in the drawer | Attack surface for junk reviewer IDs in an audit log | §6.4 reviewer identity is a constant mock (`acct-nathan`), displayed read-only; validated server-side (`1..64` chars) |
| A20 | No note length bound | Unbounded audit payload | §4.5 note: trimmed `3..500` chars |

**Kept from v1 (good decisions):** pure framework-free domain layer, integer pence (no IEEE-754), repository + append-only audit log, retain duplicates for inspection, separate review state from validation status, single-command root verification.

---

## 1. Objective & Operating Guardrails

Build a local full-stack **Accounting Data Review Workbench**: ingest the supplied 11 GBP records (Xero/Sage), validate them against the brief's rules, expose review-state transitions with guardrails, and give an accountant a usable React workbench.

### Agent execution rules
1. Work **sequentially** through Phases 1–4 (§7). A phase is complete only when its gate command exits `0`.
2. **No external runtime dependencies**: no DB, no Docker, no paid services, no network at test time. State is in-memory, seeded deterministically, resettable.
3. **Strict TypeScript** in both projects: `strict: true`, no `any`, no `@ts-ignore`, no disabled lint rules, no skipped tests.
4. **Integer minor units only.** All monetary validation runs on pence integers. No float arithmetic anywhere in the domain.
5. **Retain the original records**, including duplicates, for inspection; exclude non-`Valid` records from reporting totals.
6. **Review state is separate from validation status** (a `Valid` record may be `Unreviewed`).
7. **Every guardrail is enforced on the server**; the UI only *reflects* it (never the sole gate).

---

## 2. Repository layout & scripts

### 2.1 Tree
```text
koovo_exam/
├── package.json                    # root fan-out scripts (setup/dev/test/verify)
├── README.md                       # run instructions, architecture, decisions, demo script
├── PLAN.md
├── .gitignore
├── backend/
│   ├── package.json  nest-cli.json  tsconfig.json  tsconfig.build.json
│   ├── jest.config.js  eslint.config.mjs
│   ├── src/
│   │   ├── main.ts                 # bootstrap only; delegates to configure-app.ts
│   │   ├── configure-app.ts        # global prefix, CORS, ValidationPipe, exception filter (shared with tests)
│   │   ├── app.module.ts
│   │   ├── domain/
│   │   │   ├── models.ts           # types, enums, issue codes, API envelopes
│   │   │   ├── money.ts            # decimal ↔ integer pence, GBP formatting
│   │   │   ├── validation-engine.ts# pure evaluate() + summarize()
│   │   │   └── review-state.ts     # pure transition decision table
│   │   ├── data/seed-records.ts    # verbatim R001–R011
│   │   ├── repositories/workbench.repository.ts
│   │   ├── common/{clock.ts,api-error.ts,http-exception.filter.ts}
│   │   ├── transactions/{transactions.module.ts,controller,service,dto/}
│   │   └── health/health.controller.ts
│   └── test/
│       ├── jest-e2e.json
│       ├── utils/create-test-app.ts
│       ├── unit/{money.spec.ts,validation-engine.spec.ts,review-state.spec.ts}
│       └── integration/transactions.e2e-spec.ts
└── frontend/
    ├── package.json  tsconfig.json  tsconfig.node.json  vite.config.ts  index.html  eslint.config.mjs
    └── src/
        ├── main.tsx  App.tsx  styles.css
        ├── api/client.ts            # typed fetch wrapper + ApiError
        ├── types/workbench.ts       # mirrors backend contracts (documented in one place)
        ├── hooks/useWorkbench.ts    # data + filters + review actions + error states
        ├── config/reviewer.ts       # mock reviewer identity (single source)
        ├── components/{SummaryCards,FilterBar,RecordsTable,RecordDetailDrawer,AuditHistoryList}.tsx
        ├── test-utils/{mock-workbench-api.ts,records.fixture.ts}
        └── __tests__/{workbench.test.tsx,format-gbp.test.ts}
```

### 2.2 Ports & wiring
- Backend `http://localhost:3001`, global prefix `/api`. CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`.
- Frontend `http://localhost:5173`, `strictPort`, Vite proxy `/api` → `http://localhost:3001` (no CORS in dev, same-origin in production build).
- Tests never open a real socket: Supertest binds the Nest `INestApplication` in-process.

### 2.3 Root scripts (must exist exactly — Gate 4 uses them)
| Script | Behaviour |
|---|---|
| `npm run setup` | `npm install --prefix backend && npm install --prefix frontend` (root deps already installed) |
| `npm run dev` | `concurrently` → backend `start:dev` + frontend `dev` |
| `npm test` | backend unit → backend e2e → frontend vitest |
| `npm run typecheck` | `tsc --noEmit` in backend **and** frontend |
| `npm run lint` | `eslint .` in backend **and** frontend |
| `npm run build` | backend `nest build` + frontend `tsc --noEmit && vite build` |
| `npm run verify` | `typecheck && lint && test && build` (Gate 4) |

---

## 3. Verbatim seed dataset (R001–R011)

`-` means missing (`null`). Amounts are decimal strings in GBP; they are parsed to pence by `money.ts`, never by `parseFloat` in the domain.

| Record | Client | Source | Source ID | Type | Status | Supplier | Subtotal | VAT | Total | Expected status | Expected issues |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R001 | C01 | Xero | X-101 | Bill | Posted | Westline Office | 100.00 | 20.00 | 120.00 | Valid | — |
| R002 | C01 | Sage | S-201 | Bill | Posted | ByteCloud | 200.00 | 40.00 | 240.00 | Valid | — |
| R003 | C01 | Xero | X-102 | Bill | Posted | Global Parts | 300.00 | 60.00 | 365.00 | Needs Attention | `TOTAL_MISMATCH` |
| R004 | C01 | Sage | S-202 | Bill | Posted | *(null)* | 120.00 | 24.00 | 144.00 | Needs Attention | `MISSING_SUPPLIER` |
| R005 | C01 | Xero | X-101 | Bill | Posted | Westline Office | 100.00 | 20.00 | 120.00 | Needs Attention | `DUPLICATE_TRANSACTION` (identical, of R001) |
| R006 | C01 | Sage | S-203 | Bill | Draft | City Couriers | 50.00 | 10.00 | 60.00 | Excluded | — |
| R007 | C02 | Xero | X-101 | Bill | Posted | Westline Office | 400.00 | 80.00 | 480.00 | Valid | — |
| R008 | C01 | Xero | X-103 | Bill | Posted | Delta Supplies | 90.00 | 18.00 | 108.00 | Valid | — |
| R009 | C01 | Sage | S-204 | Bill | Void | Widgets Ltd | 80.00 | 0.00 | 80.00 | Excluded | — |
| R010 | C01 | Xero | X-104 | Credit | Posted | Caldera | -100.00 | -20.00 | -120.00 | Valid | — |
| R011 | C01 | Xero | X-105 | Bill | Posted | Alpha Inc | -30.00 | -6.00 | -36.00 | Needs Attention | `NEGATIVE_BILL_AMOUNT` |

**Initial summary:** Valid **5** (R001, R002, R007, R008, R010) · Needs Attention **4** (R003, R004, R005, R011) · Excluded **2** (R006, R009) · total **11**.

---

## 4. Domain specification

### 4.1 Types (`backend/src/domain/models.ts`)
```ts
export type AccountingSource = 'Xero' | 'Sage';
export type TransactionType = 'Bill' | 'Credit';
export type SourceStatus = 'Posted' | 'Draft' | 'Void';
export type ValidationStatus = 'Valid' | 'Needs Attention' | 'Excluded';
export type ReviewStatus = 'Unreviewed' | 'Reviewed' | 'Needs Correction';
export type DuplicateKind = 'identical' | 'conflicting';

export type ValidationIssueCode =
  | 'TOTAL_MISMATCH' | 'MISSING_SUPPLIER' | 'DUPLICATE_TRANSACTION'
  | 'NEGATIVE_BILL_AMOUNT' | 'INVALID_MONETARY_VALUE';

export interface ValidationIssue {
  code: ValidationIssueCode;
  field: 'subtotal' | 'vat' | 'total' | 'supplier' | 'sourceId';
  message: string;                    // accountant-readable, formatted money
}

export interface RawAccountingRecord {
  id: string; clientId: string; source: AccountingSource; sourceId: string;
  type: TransactionType; sourceStatus: SourceStatus;
  supplier: string | null;            // '-' → null at ingest
  subtotal: string; vat: string; total: string;
}

export interface EvaluatedTransaction extends RawAccountingRecord {
  transactionKey: string;             // `${clientId}::${source}::${sourceId}`
  isDuplicate: boolean;
  duplicateOfRecordId: string | null;
  duplicateKind: DuplicateKind | null;
  processedForReporting: boolean;     // === (validationStatus === 'Valid')
  validationStatus: ValidationStatus;
  issues: ValidationIssue[];
  reviewStatus: ReviewStatus;
  auditHistory: ReviewAuditEntry[];
}
```
`ReviewAuditEntry` is unchanged from v1 (`id, recordId, action, previousReviewStatus, newReviewStatus, reviewerId, reviewerName, note | null, timestamp` ISO-8601 UTC).

### 4.2 Money contract (`domain/money.ts`)
- `parseAmountToPence(raw: string | null | undefined): ParseResult` where
  `ParseResult = { ok: true; pence: number } | { ok: false; reason: 'MISSING' | 'INVALID_FORMAT' | 'OUT_OF_RANGE' }`.
- Accepted grammar: `^-?\d{1,12}(\.\d{1,2})?$` on the trimmed value. `-0.00` normalises to `0`.
- Missing = `null`, `undefined`, `''`, `'-'`, whitespace-only → `MISSING`.
- No thousands separators, no currency symbols, no exponent notation, >2 decimals → `INVALID_FORMAT`.
- Overflow (`|pence| > Number.MAX_SAFE_INTEGER`) → `OUT_OF_RANGE`.
- `formatPence(pence: number): string` → `£120.00`, `-£36.00`, `£0.00` (sign precedes the symbol, always 2dp).
- Pure functions, no `parseFloat`/`* 100` on floats.

### 4.3 Validation order (deterministic, `domain/validation-engine.ts`)
For every record **in input order**:

1. **Input normalisation** — `supplier`: trim; `''`, `'-'` → `null`.
2. **Exclusion gate** — `sourceStatus` ∈ {`Draft`,`Void`} → `Excluded`, `issues: []`, `processedForReporting: false`, **no** seen-set read or write; stop.
3. **Identity** — `transactionKey = clientId::source::sourceId`. If the key was registered by an earlier **posted** record → `isDuplicate: true`, `duplicateOfRecordId` = that record, `duplicateKind` = `identical` if `type/sourceStatus/supplier/subtotal/vat/total` match the owner, else `conflicting`; push `DUPLICATE_TRANSACTION` (field `sourceId`). Different `clientId` ⇒ different key (R007 vs R001 is **not** a duplicate). The first occurrence is registered even if it is itself invalid (`Needs Attention`).
4. **Monetary parse** — each of `subtotal`, `vat`, `total`: `MISSING`/`INVALID_FORMAT`/`OUT_OF_RANGE` → `INVALID_MONETARY_VALUE` on that field. If any field failed to parse, **skip** sign and math checks (they are undefined), continue to status assignment.
5. **Supplier completeness** (posted) — `supplier === null` → `MISSING_SUPPLIER` (field `supplier`).
6. **Sign rules** (posted, all parsed) — `type === 'Bill'` and any of subtotal/vat/total `< 0` → one `NEGATIVE_BILL_AMOUNT` (field `total`) whose message lists all three formatted amounts. `type === 'Credit'` → negative amounts are legitimate, never an issue (R010 `Valid`).
7. **Math** (posted, all parsed) — `subtotal + vat !== total` in pence → `TOTAL_MISMATCH` (field `total`) with actual, expected, subtotal and VAT formatted.
8. **Status** — `issues.length > 0` → `Needs Attention`, else `Valid`. `processedForReporting = validationStatus === 'Valid'`. `reviewStatus = 'Unreviewed'`, `auditHistory = []`.

Issue order on a multi-issue record is therefore: duplicate → monetary → supplier → sign → math. `evaluate()` is pure and does not mutate its input; evaluating the same input twice yields deep-equal output.

### 4.4 Summary (`summarize(records)`)
`total`, `valid`, `needsAttention`, `excluded`, and `reviewBreakdown { unreviewed, reviewed, needsCorrection }`. Excluded records are counted in `total` and in `reviewBreakdown.unreviewed`.

### 4.5 Review state machine & error decision table (`domain/review-state.ts` + service)
Actions: `MARK_REVIEWED` → target `Reviewed`; `MARK_NEEDS_CORRECTION` → target `Needs Correction`.

Preconditions are checked in this order (first failure wins):

| # | Condition | HTTP | `code` |
|---|---|---|---|
| 1 | record id unknown | **404** | `RECORD_NOT_FOUND` |
| 2 | body fails DTO validation (missing/invalid `action`, `reviewerId` 1..64 chars, `note` > 500 chars, unknown fields) | **400** | `INVALID_REQUEST` |
| 3 | `MARK_NEEDS_CORRECTION` with `note` trimmed length < 3 | **400** | `NOTE_REQUIRED` |
| 4 | `validationStatus === 'Excluded'` (any action) | **422** | `EXCLUDED_RECORD` |
| 5 | `MARK_REVIEWED` and `validationStatus !== 'Valid'` (i.e. `Needs Attention`) | **422** | `UNRESOLVED_VALIDATION_ISSUES` |
| 6 | target status === current `reviewStatus` | **409** | `ALREADY_IN_STATE` |
| 7 | otherwise | **200** | — (transition applied) |

Allowed happy paths: `Valid` + `MARK_REVIEWED`; `Valid|Needs Attention` + `MARK_NEEDS_CORRECTION`; `Needs Correction` → `Reviewed` on a `Valid` record (correction verified). `MARK_REVIEWED` never applies to `Needs Attention`/`Excluded`.

**Audit** — every successful transition appends an immutable entry to both `record.auditHistory` and the global log:
`id` = `AUD-0001` (monotonic, 4-padded), `timestamp` = injected `Clock.now().toISOString()`, `reviewerId`/`reviewerName`, `note` (trimmed, or `null`), `previousReviewStatus`, `newReviewStatus`.

**Reviewer identity** — client sends the mock reviewer (`acct-nathan` / `Nathan Fletcher`) from a single frontend config constant; the server accepts `reviewerId` (1–64 chars) and optional `reviewerName` and never trusts it for authorisation (no auth in scope, documented as a trade-off).

---

## 5. REST API contracts

Base `http://localhost:3001/api`. **Error envelope for every non-2xx:**
```json
{ "statusCode": 422, "code": "UNRESOLVED_VALIDATION_ISSUES", "message": "R003 has 1 unresolved validation issue (TOTAL_MISMATCH) and cannot be marked as Reviewed." }
```

1. **`GET /api/health`** → `{ status: 'ok', timestamp }` (`timestamp` from the injected clock).
2. **`GET /api/transactions?clientId=&validationStatus=&reviewStatus=`** — all params optional; enums validated (`400 INVALID_REQUEST` otherwise, including unknown values). Response:
```json
{
  "summary": { "total": 11, "valid": 5, "needsAttention": 4, "excluded": 2,
               "reviewBreakdown": { "unreviewed": 11, "reviewed": 0, "needsCorrection": 0 } },
  "clients": ["C01", "C02"],
  "records": [ /* EvaluatedTransaction[], input order, filtered */ ]
}
```
`summary` and `clients` always describe the **full** dataset; `records` is filtered.
3. **`GET /api/transactions/:id`** → `EvaluatedTransaction` | `404 RECORD_NOT_FOUND`.
4. **`POST /api/transactions/:id/review`** — body `{ action, note?, reviewerId, reviewerName? }` → `200 { record, auditEntry, summary }`; guardrails per §4.5.
5. **`GET /api/audit-logs`** → `{ entries: ReviewAuditEntry[] }` newest-first (global activity feed).

---

## 6. Frontend acceptance criteria (`http://localhost:5173`)

1. **Summary strip** — total 11, Valid 5 (green), Needs Attention 4 (amber), Excluded 2 (grey), plus review breakdown; values come from `summary` and never shift when filters change.
2. **Filter bar** — client select (`All clients`, `C01`, `C02`), validation-status select (`All statuses`, three values), review-status select, **Reset filters**; filters hit the API (`clientId`, `validationStatus`, `reviewStatus`), URL-encoding `Needs Attention`.
3. **Table** — columns: Record, Client, Source/ID, Type, Status, Supplier (`Missing` badge when null), Subtotal, VAT, Total (GBP), Validation (badge + issue count), Review. Deterministic order (R001→R011 as returned). Rows are keyboard-focusable buttons; clicking/Enter opens the drawer.
4. **Detail drawer** — `role="dialog" aria-modal`, Escape and ✕ close it, focus moves in on open. Shows raw + computed fields (`transactionKey`, `isDuplicate`, `duplicateKind`, `duplicateOfRecordId`, `processedForReporting`, `sourceStatus`, `reviewStatus`) and **every** validation issue verbatim. Review controls:
   - Reviewer displayed read-only (`Nathan Fletcher · acct-nathan`).
   - **Mark as Reviewed**: enabled only for `Valid` and not already `Reviewed`; otherwise disabled with the reason as visible helper text + `title`.
   - **Mark as Needs Correction**: note textarea (3–500 chars) + submit; disabled on `Excluded`, hidden on non-posted, submit disabled until the note is valid; server rejection messages surface in the drawer.
   - **Audit timeline** — action, reviewer, timestamp (`en-GB`), note; newest first.
5. **All four states handled** — (a) loading skeleton/`aria-busy`, (b) empty (`No records match the current filters` + Reset), (c) error banner with **Retry** (and drawer-level action errors), (d) not-found/404 message. No dead ends; the API error `message` is always shown, never swallowed.
6. **After a review action** the row badge, summary review breakdown, and drawer history refresh from the server response.
7. Design: minimal, legible, plain CSS, no UI framework (smaller + reviewable). No console errors in tests.

---

## 7. Phases & verification gates

Each gate is a hard stop: exit code 0 required, no `--passWithNoTests`, no skipped tests, no lint disables.

### Phase 1 — Workspace + domain engine
Scaffold the three projects, `.gitignore`, git init; implement `models.ts`, `money.ts`, `validation-engine.ts`, `review-state.ts`, `seed-records.ts`.
Tests: `test/unit/money.spec.ts` (grammar table, negatives, missing, overflow, formatting, no float drift), `validation-engine.spec.ts` (all 11 records exact `validationStatus`/issue codes/`isDuplicate`/`duplicateKind`/`processedForReporting`, summary 5/4/2/11, cross-client R007 vs R005, duplicate registry semantics, multi-issue ordering, purity/idempotence), `review-state.spec.ts` (decision table including 409 and note bounds).
**Gate 1:** `npm --prefix backend run typecheck && npm --prefix backend run lint && npm --prefix backend run test`

### Phase 2 — NestJS API + integration tests
Repository (in-memory, `reset()`, append-only audit), service, controller, DTOs, clock port, exception filter, health, `configure-app.ts`.
Tests (`test/integration/transactions.e2e-spec.ts`, Supertest + fixed clock): health; list shape/order/summary; each filter incl. `reviewStatus`; summary invariance under filters; invalid query enum → 400; `GET :id` + 404; `R001` → Reviewed with exact audit entry; `R003` → Needs Correction (note required, 400 without, note `<3` → 400); `R003` → Reviewed 422; `R006`/`R009` any action 422; `R005` Needs Correction 200; `R010` Reviewed 200; repeat transition 409; unknown action 400; missing `reviewerId` 400; audit log newest-first; repository reset isolation.
**Gate 2:** `npm --prefix backend run test:e2e && npm --prefix backend run build`

### Phase 3 — React workbench
Typed client, hook, components, styles, reviewer config, fixture generated from the real engine.
Tests (`src/__tests__/workbench.test.tsx` + `format-gbp.test.ts`, mocked fetch): summary 5/4/2/11 + 11 rows; client filter → only R007; validation filter → R003/R004/R005/R011; `R003` drawer shows mismatch text and disables Reviewed; `R006` drawer disables both actions with explanation; R001 Reviewed → status + audit entry + summary update; R003 Needs Correction requires ≥3-char note then succeeds; API failure → error + Retry recovers; empty filter result → empty state.
**Gate 3:** `npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend run test:run && npm --prefix frontend run build`

### Phase 4 — Live smoke, README, submission hygiene
1. `npm run build`; start backend (`node dist/main.js`) and frontend (`vite preview`) as real processes.
2. Curl through the real HTTP surface: health, list (assert `5/4/2`), filter, review R001 → 200, review R003 → 422, review R006 → 422, audit log, then reset by restarting.
3. Kill both processes; assert clean shutdown (no orphan on 3001/5173).
4. Write `README.md` (quickstart, architecture, rule matrix, API table, tests, decisions/trade-offs, production path, 5-minute demo script, AI-assistance note) and commit.
5. `git status` shows a clean tree — only source, tests, docs.
**Gate 4:** `npm run verify` (typecheck + lint + all tests + build) → then live smoke above → `git status --porcelain` empty.
