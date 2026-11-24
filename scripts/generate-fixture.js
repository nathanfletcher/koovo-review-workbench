/* eslint-disable */
// One-off generator: writes the frontend test fixtures from the REAL backend
// domain engine, so mocked UI tests assert against engine output, not a hand copy.
//
//   npm --prefix backend run build && node scripts/generate-fixture.js
//
// Emits:
//   frontend/src/test-utils/records.fixture.ts  — the 11 evaluated seed records
//   frontend/src/test-utils/sandbox.fixture.ts  — engine answers for every sandbox preset
const fs = require('fs');
const path = require('path');

const backend = path.join(__dirname, '..', 'backend', 'dist');
const { SEED_RECORDS } = require(path.join(backend, 'data', 'seed-records.js'));
const { evaluateRecords, summarize, listClients } = require(
  path.join(backend, 'domain', 'validation-engine.js'),
);

const frontend = path.join(__dirname, '..', 'frontend', 'src');

// ---- records fixture --------------------------------------------------------
const records = evaluateRecords(SEED_RECORDS);
const summary = summarize(records);
const clients = listClients(records);

const recordsOutput = `// GENERATED FILE - do not edit by hand.
// Produced by scripts/generate-fixture.js from backend/src/domain/validation-engine.ts
// so the UI tests assert against the real engine's output.
import type { EvaluatedTransaction, ValidationSummary } from '../types/workbench';

export const FIXTURE_SUMMARY: ValidationSummary = ${JSON.stringify(summary, null, 2)};

export const FIXTURE_CLIENTS: string[] = ${JSON.stringify(clients)};

export const FIXTURE_RECORDS: EvaluatedTransaction[] = ${JSON.stringify(records, null, 2)};
`;

const recordsTarget = path.join(frontend, 'test-utils', 'records.fixture.ts');
fs.mkdirSync(path.dirname(recordsTarget), { recursive: true });
fs.writeFileSync(recordsTarget, recordsOutput, 'utf8');
console.log(`wrote ${recordsTarget} (${records.length} records, summary ${JSON.stringify(summary)})`);

// ---- sandbox fixture --------------------------------------------------------
// Mirrors ValidateService: ids default to INPUT-n, supplier defaults to null, and
// `dataset` context puts the seed records in front of the payload.
function toRawRecord(input, index) {
  return {
    id: input.id ?? `INPUT-${index + 1}`,
    clientId: input.clientId,
    source: input.source,
    sourceId: input.sourceId,
    type: input.type,
    sourceStatus: input.sourceStatus,
    supplier: input.supplier ?? null,
    subtotal: input.subtotal,
    vat: input.vat,
    total: input.total,
  };
}

function stableKey(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableKey).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableKey(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const presets = require(path.join(frontend, 'config', 'sandbox-presets.json'));

// One fixture per preset per context, so a preset can be re-run with the other
// duplicate-detection context without the test double inventing a verdict.
const CONTEXTS = ['isolated', 'dataset'];

const sandboxFixtures = [];
for (const preset of presets) {
  for (const context of CONTEXTS) {
    const inputs = preset.request.records.map(toRawRecord);
    const baseline =
      context === 'dataset' ? SEED_RECORDS.map((seed, index) => toRawRecord(seed, index)) : [];
    const evaluated = evaluateRecords([...baseline, ...inputs]);
    const results = evaluated.slice(baseline.length);

    sandboxFixtures.push({
      presetId: preset.id,
      context,
      // Canonical key of the request body the UI sends (key order independent).
      key: stableKey({ records: preset.request.records, context }),
      response: {
        context,
        persisted: false,
        count: results.length,
        summary: summarize(results),
        records: results,
      },
    });
  }
}

const sandboxOutput = `// GENERATED FILE - do not edit by hand.
// Produced by scripts/generate-fixture.js by running each sandbox preset through
// the real engine, so the UI tests cannot disagree with the server.
import type { ValidateResponse } from '../types/workbench';

export interface SandboxFixture {
  presetId: string;
  context: 'isolated' | 'dataset';
  /** Canonical key of the request body the UI sends. */
  key: string;
  response: ValidateResponse;
}

export const SANDBOX_FIXTURES: SandboxFixture[] = ${JSON.stringify(sandboxFixtures, null, 2)};
`;

const sandboxTarget = path.join(frontend, 'test-utils', 'sandbox.fixture.ts');
fs.writeFileSync(sandboxTarget, sandboxOutput, 'utf8');
console.log(`wrote ${sandboxTarget} (${sandboxFixtures.length} presets)`);
