import { SEED_RECORDS } from '../../src/data/seed-records';
import type {
  EvaluatedTransaction,
  RawAccountingRecord,
  ValidationIssueCode,
  ValidationStatus,
} from '../../src/domain/models';
import {
  buildTransactionKey,
  evaluateRecords,
  listClients,
  normalizeSupplier,
  summarize,
} from '../../src/domain/validation-engine';

interface Expectation {
  id: string;
  status: ValidationStatus;
  codes: ValidationIssueCode[];
  isDuplicate: boolean;
  duplicateOf: string | null;
  duplicateKind: 'identical' | 'conflicting' | null;
  processedForReporting: boolean;
}

const EXPECTED: Expectation[] = [
  {
    id: 'R001',
    status: 'Valid',
    codes: [],
    isDuplicate: false,
    duplicateOf: null,
    duplicateKind: null,
    processedForReporting: true,
  },
  {
    id: 'R002',
    status: 'Valid',
    codes: [],
    isDuplicate: false,
    duplicateOf: null,
    duplicateKind: null,
    processedForReporting: true,
  },
  {
    id: 'R003',
    status: 'Needs Attention',
    codes: ['TOTAL_MISMATCH'],
    isDuplicate: false,
    duplicateOf: null,
    duplicateKind: null,
    processedForReporting: false,
  },
  {
    id: 'R004',
    status: 'Needs Attention',
    codes: ['MISSING_SUPPLIER'],
    isDuplicate: false,
    duplicateOf: null,
    duplicateKind: null,
    processedForReporting: false,
  },
  {
    id: 'R005',
    status: 'Needs Attention',
    codes: ['DUPLICATE_TRANSACTION'],
    isDuplicate: true,
    duplicateOf: 'R001',
    duplicateKind: 'identical',
    processedForReporting: false,
  },
  {
    id: 'R006',
    status: 'Excluded',
    codes: [],
    isDuplicate: false,
    duplicateOf: null,
    duplicateKind: null,
    processedForReporting: false,
  },
  {
    id: 'R007',
    status: 'Valid',
    codes: [],
    isDuplicate: false,
    duplicateOf: null,
    duplicateKind: null,
    processedForReporting: true,
  },
  {
    id: 'R008',
    status: 'Valid',
    codes: [],
    isDuplicate: false,
    duplicateOf: null,
    duplicateKind: null,
    processedForReporting: true,
  },
  {
    id: 'R009',
    status: 'Excluded',
    codes: [],
    isDuplicate: false,
    duplicateOf: null,
    duplicateKind: null,
    processedForReporting: false,
  },
  {
    id: 'R010',
    status: 'Valid',
    codes: [],
    isDuplicate: false,
    duplicateOf: null,
    duplicateKind: null,
    processedForReporting: true,
  },
  {
    id: 'R011',
    status: 'Needs Attention',
    codes: ['NEGATIVE_BILL_AMOUNT'],
    isDuplicate: false,
    duplicateOf: null,
    duplicateKind: null,
    processedForReporting: false,
  },
];

function evaluateSeed(): Map<string, EvaluatedTransaction> {
  const evaluated = evaluateRecords(SEED_RECORDS);
  return new Map(evaluated.map((record) => [record.id, record]));
}

function makeRecord(overrides: Partial<RawAccountingRecord> & { id: string }): RawAccountingRecord {
  return {
    clientId: 'C01',
    source: 'Xero',
    sourceId: 'X-900',
    type: 'Bill',
    sourceStatus: 'Posted',
    supplier: 'Test Supplier',
    subtotal: '10.00',
    vat: '2.00',
    total: '12.00',
    ...overrides,
  };
}

describe('evaluateRecords — assessment dataset', () => {
  const records = evaluateSeed();

  it('returns every supplied record, in input order', () => {
    expect(Array.from(records.keys())).toEqual(SEED_RECORDS.map((record) => record.id));
  });

  it.each(EXPECTED)('R0xx $id evaluates to $status with $codes', (expectation) => {
    const record = records.get(expectation.id);

    expect(record).toBeDefined();
    expect(record?.validationStatus).toBe(expectation.status);
    expect(record?.issues.map((issue) => issue.code)).toEqual(expectation.codes);
    expect(record?.isDuplicate).toBe(expectation.isDuplicate);
    expect(record?.duplicateOfRecordId).toBe(expectation.duplicateOf);
    expect(record?.duplicateKind).toBe(expectation.duplicateKind);
    expect(record?.processedForReporting).toBe(expectation.processedForReporting);
  });

  it('keeps review state separate from validation status', () => {
    const valid = records.get('R001');
    expect(valid?.validationStatus).toBe('Valid');
    expect(valid?.reviewStatus).toBe('Unreviewed');
    expect(valid?.auditHistory).toEqual([]);
  });

  it('produces the exact summary counts from the brief', () => {
    expect(summarize(Array.from(records.values()))).toEqual({
      total: 11,
      valid: 5,
      needsAttention: 4,
      excluded: 2,
      reviewBreakdown: { unreviewed: 11, reviewed: 0, needsCorrection: 0 },
    });
  });

  it('lists distinct clients in first-seen order', () => {
    expect(listClients(SEED_RECORDS)).toEqual(['C01', 'C02']);
  });

  it('normalises the dash supplier placeholder to null', () => {
    const record = records.get('R004');
    expect(record?.supplier).toBeNull();
    expect(record?.issues[0]?.message).toBe('Posted record is missing a supplier name.');
  });

  it('explains the mismatch with expected and actual totals', () => {
    const message = records.get('R003')?.issues[0]?.message;
    expect(message).toBe(
      'Total (£365.00) does not equal Subtotal (£300.00) plus VAT (£60.00) (expected £360.00).',
    );
  });

  it('explains the negative bill with all three amounts', () => {
    const message = records.get('R011')?.issues[0]?.message;
    expect(message).toBe(
      'Posted Bill records must have non-negative amounts (Subtotal: -£30.00, VAT: -£6.00, Total: -£36.00).',
    );
  });

  it('points the duplicate at the record that owns the identity', () => {
    expect(records.get('R005')?.issues[0]?.message).toBe(
      'Repeated source transaction: C01 / Xero / X-101 was already ingested as R001. Identical copy retained for inspection and excluded from financial processing.',
    );
  });

  it('does not treat a shared Source ID across clients as a duplicate', () => {
    expect(records.get('R007')?.transactionKey).toBe('C02::Xero::X-101');
    expect(records.get('R001')?.transactionKey).toBe('C01::Xero::X-101');
    expect(records.get('R007')?.isDuplicate).toBe(false);
    expect(records.get('R007')?.validationStatus).toBe('Valid');
  });

  it('excludes Draft and Void records without validating them', () => {
    expect(records.get('R006')?.validationStatus).toBe('Excluded');
    expect(records.get('R009')?.validationStatus).toBe('Excluded');
    expect(records.get('R006')?.issues).toEqual([]);
    expect(records.get('R009')?.issues).toEqual([]);
  });
});

describe('evaluateRecords — edge cases', () => {
  it('reports a conflicting duplicate when the same identity carries different values', () => {
    const [first, second] = evaluateRecords([
      makeRecord({ id: 'R100', sourceId: 'X-777' }),
      makeRecord({ id: 'R101', sourceId: 'X-777', total: '99.00' }),
    ]);

    expect(second.isDuplicate).toBe(true);
    expect(second.duplicateKind).toBe('conflicting');
    expect(second.duplicateOfRecordId).toBe('R100');
    // Duplicate issue is reported first, then the math problem.
    expect(second.issues.map((issue) => issue.code)).toEqual([
      'DUPLICATE_TRANSACTION',
      'TOTAL_MISMATCH',
    ]);
    expect(second.validationStatus).toBe('Needs Attention');
    // The first record still owns the identity.
    expect(first.isDuplicate).toBe(false);
  });

  it('does not let a Draft record claim an identity used by a later posted record', () => {
    const [draft, posted] = evaluateRecords([
      makeRecord({ id: 'R200', sourceId: 'S-555', sourceStatus: 'Draft' }),
      makeRecord({ id: 'R201', sourceId: 'S-555' }),
    ]);

    expect(draft.validationStatus).toBe('Excluded');
    expect(draft.isDuplicate).toBe(false);
    expect(posted.isDuplicate).toBe(false);
    expect(posted.validationStatus).toBe('Valid');
  });

  it('treats a Draft copy of an existing posted transaction as excluded, not duplicated', () => {
    const [posted, draft] = evaluateRecords([
      makeRecord({ id: 'R300', sourceId: 'X-321' }),
      makeRecord({ id: 'R301', sourceId: 'X-321', sourceStatus: 'Draft' }),
    ]);

    expect(posted.validationStatus).toBe('Valid');
    expect(draft.validationStatus).toBe('Excluded');
    expect(draft.issues).toEqual([]);
  });

  it('reports every issue on a record, in the documented order', () => {
    const [record] = evaluateRecords([
      makeRecord({ id: 'R400', supplier: '-', subtotal: '-10.00', vat: '-2.00', total: '-13.00' }),
    ]);

    expect(record.issues.map((issue) => issue.code)).toEqual([
      'MISSING_SUPPLIER',
      'NEGATIVE_BILL_AMOUNT',
      'TOTAL_MISMATCH',
    ]);
    expect(record.issues.map((issue) => issue.field)).toEqual(['supplier', 'total', 'total']);
  });

  it('flags unparseable amounts and skips sign/math checks they would make meaningless', () => {
    const [record] = evaluateRecords([makeRecord({ id: 'R401', subtotal: 'n/a', total: '999.00' })]);

    expect(record.issues.map((issue) => issue.code)).toEqual(['INVALID_MONETARY_VALUE']);
    expect(record.issues[0]?.field).toBe('subtotal');
    expect(record.validationStatus).toBe('Needs Attention');
    expect(record.processedForReporting).toBe(false);
  });

  it('treats a missing amount as invalid rather than zero', () => {
    const [record] = evaluateRecords([makeRecord({ id: 'R402', vat: '-' })]);

    expect(record.issues).toEqual([
      { code: 'INVALID_MONETARY_VALUE', field: 'vat', message: 'VAT is missing.' },
    ]);
  });

  it('accepts penny-boundary arithmetic that would fail in floating point', () => {
    const [record] = evaluateRecords([
      makeRecord({ id: 'R403', subtotal: '100.10', vat: '20.20', total: '120.30' }),
    ]);

    expect(record.issues).toEqual([]);
    expect(record.validationStatus).toBe('Valid');
  });

  it('accepts single-decimal amounts', () => {
    const [record] = evaluateRecords([
      makeRecord({ id: 'R404', subtotal: '100.5', vat: '20.5', total: '121' }),
    ]);

    expect(record.validationStatus).toBe('Valid');
  });

  it('allows a Credit to carry negative amounts without complaint', () => {
    const [record] = evaluateRecords([
      makeRecord({
        id: 'R405',
        type: 'Credit',
        subtotal: '-100.00',
        vat: '-20.00',
        total: '-120.00',
      }),
    ]);

    expect(record.issues).toEqual([]);
    expect(record.validationStatus).toBe('Valid');
  });

  it('applies sign rules to Credits too when the total does not add up', () => {
    const [record] = evaluateRecords([
      makeRecord({
        id: 'R406',
        type: 'Credit',
        subtotal: '-100.00',
        vat: '-20.00',
        total: '-125.00',
      }),
    ]);

    expect(record.issues.map((issue) => issue.code)).toEqual(['TOTAL_MISMATCH']);
  });

  it('normalises whitespace-only and dashed suppliers', () => {
    expect(normalizeSupplier('   ')).toBeNull();
    expect(normalizeSupplier('-')).toBeNull();
    expect(normalizeSupplier(null)).toBeNull();
    expect(normalizeSupplier('  Westline Office  ')).toBe('Westline Office');
  });

  it('builds the composite key from client, source and source id', () => {
    expect(
      buildTransactionKey({ clientId: 'C02', source: 'Sage', sourceId: 'S-1' }),
    ).toBe('C02::Sage::S-1');
  });

  it('is pure and idempotent: input untouched, repeated evaluation deep-equal', () => {
    const input: RawAccountingRecord[] = SEED_RECORDS.map((record) => ({ ...record }));
    const snapshot = JSON.stringify(input);

    const first = evaluateRecords(input);
    const second = evaluateRecords(input);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(second).toEqual(first);
  });

  it('handles an empty dataset', () => {
    expect(evaluateRecords([])).toEqual([]);
    expect(summarize([])).toEqual({
      total: 0,
      valid: 0,
      needsAttention: 0,
      excluded: 0,
      reviewBreakdown: { unreviewed: 0, reviewed: 0, needsCorrection: 0 },
    });
    expect(listClients([])).toEqual([]);
  });
});
