/**
 * Pure domain model. No NestJS, no HTTP, no I/O: everything here is plain
 * TypeScript so the validation rules can be unit-tested in isolation and
 * reasoned about in the interview.
 */

export type AccountingSource = 'Xero' | 'Sage';
export type TransactionType = 'Bill' | 'Credit';
export type SourceStatus = 'Posted' | 'Draft' | 'Void';

export type ValidationStatus = 'Valid' | 'Needs Attention' | 'Excluded';
export type ReviewStatus = 'Unreviewed' | 'Reviewed' | 'Needs Correction';

/** "identical" = same identity and same values; "conflicting" = same identity, different values. */
export type DuplicateKind = 'identical' | 'conflicting';

export const ACCOUNTING_SOURCES: readonly AccountingSource[] = ['Xero', 'Sage'];
export const TRANSACTION_TYPES: readonly TransactionType[] = ['Bill', 'Credit'];
export const SOURCE_STATUSES: readonly SourceStatus[] = ['Posted', 'Draft', 'Void'];
export const VALIDATION_STATUSES: readonly ValidationStatus[] = [
  'Valid',
  'Needs Attention',
  'Excluded',
];
export const REVIEW_STATUSES: readonly ReviewStatus[] = [
  'Unreviewed',
  'Reviewed',
  'Needs Correction',
];

export type ValidationIssueCode =
  | 'TOTAL_MISMATCH'
  | 'MISSING_SUPPLIER'
  | 'DUPLICATE_TRANSACTION'
  | 'NEGATIVE_BILL_AMOUNT'
  | 'INVALID_MONETARY_VALUE';

export type ValidationIssueField = 'subtotal' | 'vat' | 'total' | 'supplier' | 'sourceId';

export interface ValidationIssue {
  code: ValidationIssueCode;
  field: ValidationIssueField;
  /** Accountant-readable explanation with money already formatted in GBP. */
  message: string;
}

export interface RawAccountingRecord {
  id: string;
  clientId: string;
  source: AccountingSource;
  sourceId: string;
  type: TransactionType;
  sourceStatus: SourceStatus;
  /** `"-"` in the source data is normalised to `null` during evaluation. */
  supplier: string | null;
  /** Decimal GBP string, e.g. "100.00". Never parsed with floats. */
  subtotal: string;
  vat: string;
  total: string;
}

export type ReviewAction = 'MARK_REVIEWED' | 'MARK_NEEDS_CORRECTION';

export interface ReviewAuditEntry {
  id: string;
  recordId: string;
  action: ReviewAction;
  previousReviewStatus: ReviewStatus;
  newReviewStatus: ReviewStatus;
  reviewerId: string;
  reviewerName: string;
  note: string | null;
  /** ISO-8601 UTC timestamp produced by the injected clock. */
  timestamp: string;
}

export interface EvaluatedTransaction extends RawAccountingRecord {
  /** `${clientId}::${source}::${sourceId}` — the brief's composite identity. */
  transactionKey: string;
  isDuplicate: boolean;
  duplicateOfRecordId: string | null;
  duplicateKind: DuplicateKind | null;
  /** true only when the record is Valid: unresolved/duplicate/excluded rows are not reportable. */
  processedForReporting: boolean;
  validationStatus: ValidationStatus;
  issues: ValidationIssue[];
  reviewStatus: ReviewStatus;
  auditHistory: ReviewAuditEntry[];
}

export interface ReviewBreakdown {
  unreviewed: number;
  reviewed: number;
  needsCorrection: number;
}

export interface ValidationSummary {
  total: number;
  valid: number;
  needsAttention: number;
  excluded: number;
  reviewBreakdown: ReviewBreakdown;
}

export interface TransactionListResponse {
  /** Always describes the full dataset, even when filters are applied. */
  summary: ValidationSummary;
  clients: string[];
  records: EvaluatedTransaction[];
}

export interface ReviewActionResponse {
  record: EvaluatedTransaction;
  auditEntry: ReviewAuditEntry;
  summary: ValidationSummary;
}

export interface AuditLogResponse {
  entries: ReviewAuditEntry[];
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

/** Shape of every non-2xx response body. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
}
