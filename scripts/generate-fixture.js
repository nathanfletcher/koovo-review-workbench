/* eslint-disable */
// One-off generator: writes the frontend test fixture from the REAL backend
// domain engine, so mocked UI tests assert against engine output, not a hand copy.
const fs = require('fs');
const path = require('path');

const backend = path.join(__dirname, '..', 'backend', 'dist');
const { SEED_RECORDS } = require(path.join(backend, 'data', 'seed-records.js'));
const { evaluateRecords, summarize, listClients } = require(
  path.join(backend, 'domain', 'validation-engine.js'),
);

const records = evaluateRecords(SEED_RECORDS);
const summary = summarize(records);
const clients = listClients(records);

const output = `// GENERATED FILE - do not edit by hand.
// Produced by scripts/generate-fixture.js from backend/src/domain/validation-engine.ts
// so the UI tests assert against the real engine's output.
import type { EvaluatedTransaction, ValidationSummary } from '../types/workbench';

export const FIXTURE_SUMMARY: ValidationSummary = ${JSON.stringify(summary, null, 2)};

export const FIXTURE_CLIENTS: string[] = ${JSON.stringify(clients)};

export const FIXTURE_RECORDS: EvaluatedTransaction[] = ${JSON.stringify(records, null, 2)};
`;

const target = path.join(__dirname, '..', 'frontend', 'src', 'test-utils', 'records.fixture.ts');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, output, 'utf8');
console.log(`wrote ${target} (${records.length} records, summary ${JSON.stringify(summary)})`);
