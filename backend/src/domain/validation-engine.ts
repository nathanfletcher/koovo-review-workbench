import { formatPence, parseAmountToPence } from './money';
import type {
  DuplicateKind,
  EvaluatedTransaction,
  RawAccountingRecord,
  ReviewBreakdown,
  SourceStatus,
  ValidationIssue,
  ValidationStatus,
  ValidationSummary,
} from './models';

const EXCLUDED_SOURCE_STATUSES: ReadonlySet<SourceStatus> = new Set<SourceStatus>(['Draft', 'Void']);

const AMOUNT_LABELS = {
  subtotal: 'Subtotal',
  vat: 'VAT',
  total: 'Total',
} as const;

/**
 * Identity fields arrive from two accounting systems and are often hand-keyed,
 * so they are trimmed before any comparison. `" C01 "` and `"C01"` are the same
 * client; letting the raw value through would split one transaction into two
 * identities (or hide a genuine duplicate).
 */
export function normalizeIdentifier(raw: string): string {
  return raw.trim();
}

export function buildTransactionKey(
  record: Pick<RawAccountingRecord, 'clientId' | 'source' | 'sourceId'>,
): string {
  return `${normalizeIdentifier(record.clientId)}::${record.source}::${normalizeIdentifier(record.sourceId)}`;
}

/** `null`, `undefined`, `""`, whitespace and the source data's `"-"` placeholder all mean "missing". */
export function normalizeSupplier(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') {
    return null;
  }

  return trimmed;
}

function describeAmountFailure(label: string, rawValue: string, reason: string): string {
  switch (reason) {
    case 'MISSING':
      return `${label} is missing.`;
    case 'OUT_OF_RANGE':
      return `${label} "${rawValue}" is outside the supported amount range.`;
    default:
      return `${label} "${rawValue}" is not a valid GBP amount (at most two decimal places, no symbols or separators).`;
  }
}

/** Amounts are compared as pence when both sides parse, so `"100.0"` and `"100.00"` are the same money. */
function sameAmount(a: string, b: string): boolean {
  const left = parseAmountToPence(a);
  const right = parseAmountToPence(b);

  if (left.ok && right.ok) {
    return left.pence === right.pence;
  }

  return a.trim() === b.trim();
}

function sameValues(a: RawAccountingRecord, b: RawAccountingRecord): boolean {
  return (
    a.type === b.type &&
    a.sourceStatus === b.sourceStatus &&
    normalizeSupplier(a.supplier) === normalizeSupplier(b.supplier) &&
    sameAmount(a.subtotal, b.subtotal) &&
    sameAmount(a.vat, b.vat) &&
    sameAmount(a.total, b.total)
  );
}

function duplicateIssue(
  record: RawAccountingRecord,
  owner: RawAccountingRecord,
  kind: DuplicateKind,
): ValidationIssue {
  const route = `${record.clientId} / ${record.source} / ${record.sourceId}`;
  const message =
    kind === 'identical'
      ? `Repeated source transaction: ${route} was already ingested as ${owner.id}. Identical copy retained for inspection and excluded from financial processing.`
      : `Conflicting source transaction: ${route} was already ingested as ${owner.id} with different values. Retained for inspection and excluded from financial processing.`;

  return { code: 'DUPLICATE_TRANSACTION', field: 'sourceId', message };
}

function evaluateOne(
  raw: RawAccountingRecord,
  seen: Map<string, RawAccountingRecord>,
): EvaluatedTransaction {
  // Identity fields are normalised once, before they are compared or echoed:
  // the evaluated record always carries the cleaned client/source ids.
  const record: RawAccountingRecord = {
    ...raw,
    clientId: normalizeIdentifier(raw.clientId),
    sourceId: normalizeIdentifier(raw.sourceId),
  };
  const transactionKey = buildTransactionKey(record);
  const supplier = normalizeSupplier(record.supplier);
  const excluded = EXCLUDED_SOURCE_STATUSES.has(record.sourceStatus);

  const base: EvaluatedTransaction = {
    ...record,
    supplier,
    transactionKey,
    isDuplicate: false,
    duplicateOfRecordId: null,
    duplicateKind: null,
    processedForReporting: false,
    validationStatus: 'Valid',
    issues: [],
    reviewStatus: 'Unreviewed',
    auditHistory: [],
  };

  // 1. Exclusion gate: Draft/Void never reach posted validation and never touch the dedupe set.
  if (excluded) {
    return { ...base, validationStatus: 'Excluded' };
  }

  // 2. Identity & deduplication (Client + Source + Source ID).
  const issues: ValidationIssue[] = [];
  const owner = seen.get(transactionKey);
  let isDuplicate = false;
  let duplicateKind: DuplicateKind | null = null;
  let duplicateOfRecordId: string | null = null;

  if (owner) {
    isDuplicate = true;
    duplicateKind = sameValues(record, owner) ? 'identical' : 'conflicting';
    duplicateOfRecordId = owner.id;
    issues.push(duplicateIssue(record, owner, duplicateKind));
  } else {
    // The first occurrence owns the identity, even if it is itself invalid.
    seen.set(transactionKey, record);
  }

  // 3. Monetary parsing — a precondition for sign and math checks.
  const subtotal = parseAmountToPence(record.subtotal);
  const vat = parseAmountToPence(record.vat);
  const total = parseAmountToPence(record.total);

  const amountChecks = [
    { field: 'subtotal' as const, label: AMOUNT_LABELS.subtotal, raw: record.subtotal, result: subtotal },
    { field: 'vat' as const, label: AMOUNT_LABELS.vat, raw: record.vat, result: vat },
    { field: 'total' as const, label: AMOUNT_LABELS.total, raw: record.total, result: total },
  ];

  for (const check of amountChecks) {
    if (!check.result.ok) {
      issues.push({
        code: 'INVALID_MONETARY_VALUE',
        field: check.field,
        message: describeAmountFailure(check.label, check.raw, check.result.reason),
      });
    }
  }

  const amountsParsed = subtotal.ok && vat.ok && total.ok;

  // 4. Completeness: posted records need a supplier.
  if (supplier === null) {
    issues.push({
      code: 'MISSING_SUPPLIER',
      field: 'supplier',
      message: 'Posted record is missing a supplier name.',
    });
  }

  if (amountsParsed) {
    const subtotalPence = subtotal.pence;
    const vatPence = vat.pence;
    const totalPence = total.pence;

    // 5. Sign rules: Bills must be non-negative; Credits may legitimately be negative.
    if (record.type === 'Bill' && (subtotalPence < 0 || vatPence < 0 || totalPence < 0)) {
      issues.push({
        code: 'NEGATIVE_BILL_AMOUNT',
        field: 'total',
        message: `Posted Bill records must have non-negative amounts (Subtotal: ${formatPence(subtotalPence)}, VAT: ${formatPence(vatPence)}, Total: ${formatPence(totalPence)}).`,
      });
    }

    // 6. Math consistency in integer pence.
    const expectedTotalPence = subtotalPence + vatPence;
    if (expectedTotalPence !== totalPence) {
      issues.push({
        code: 'TOTAL_MISMATCH',
        field: 'total',
        message: `Total (${formatPence(totalPence)}) does not equal Subtotal (${formatPence(subtotalPence)}) plus VAT (${formatPence(vatPence)}) (expected ${formatPence(expectedTotalPence)}).`,
      });
    }
  }

  const validationStatus: ValidationStatus = issues.length > 0 ? 'Needs Attention' : 'Valid';

  return {
    ...base,
    isDuplicate,
    duplicateOfRecordId,
    duplicateKind,
    // Unresolved, duplicate and excluded records are never reportable.
    processedForReporting: validationStatus === 'Valid',
    validationStatus,
    issues,
  };
}

/**
 * Pure and deterministic: does not mutate `records`, and evaluating the same
 * input twice produces deep-equal output.
 */
export function evaluateRecords(records: readonly RawAccountingRecord[]): EvaluatedTransaction[] {
  const seen = new Map<string, RawAccountingRecord>();
  return records.map((record) => evaluateOne(record, seen));
}

export function summarize(records: readonly EvaluatedTransaction[]): ValidationSummary {
  const reviewBreakdown: ReviewBreakdown = { unreviewed: 0, reviewed: 0, needsCorrection: 0 };

  let valid = 0;
  let needsAttention = 0;
  let excluded = 0;

  for (const record of records) {
    switch (record.validationStatus) {
      case 'Valid':
        valid += 1;
        break;
      case 'Needs Attention':
        needsAttention += 1;
        break;
      case 'Excluded':
        excluded += 1;
        break;
    }

    switch (record.reviewStatus) {
      case 'Reviewed':
        reviewBreakdown.reviewed += 1;
        break;
      case 'Needs Correction':
        reviewBreakdown.needsCorrection += 1;
        break;
      case 'Unreviewed':
        reviewBreakdown.unreviewed += 1;
        break;
    }
  }

  return {
    total: records.length,
    valid,
    needsAttention,
    excluded,
    reviewBreakdown,
  };
}

/** Distinct client ids in first-seen order. */
export function listClients(records: readonly Pick<RawAccountingRecord, 'clientId'>[]): string[] {
  const clients: string[] = [];
  for (const record of records) {
    if (!clients.includes(record.clientId)) {
      clients.push(record.clientId);
    }
  }
  return clients;
}
