/**
 * Mirrors the backend contract in `backend/src/domain/models.ts`.
 * Kept as a hand-written copy because the two projects build independently; if
 * the API changes, this file (and the generated test fixture) change with it.
 */

export type AccountingSource = 'Xero' | 'Sage';
export type TransactionType = 'Bill' | 'Credit';
export type SourceStatus = 'Posted' | 'Draft' | 'Void';
export type ValidationStatus = 'Valid' | 'Needs Attention' | 'Excluded';
export type ReviewStatus = 'Unreviewed' | 'Reviewed' | 'Needs Correction';
export type DuplicateKind = 'identical' | 'conflicting';
export type ReviewAction = 'MARK_REVIEWED' | 'MARK_NEEDS_CORRECTION';

export type ValidationIssueCode =
  | 'TOTAL_MISMATCH'
  | 'MISSING_SUPPLIER'
  | 'DUPLICATE_TRANSACTION'
  | 'NEGATIVE_BILL_AMOUNT'
  | 'INVALID_MONETARY_VALUE';

export interface ValidationIssue {
  code: ValidationIssueCode;
  field: 'subtotal' | 'vat' | 'total' | 'supplier' | 'sourceId';
  message: string;
}

export interface ReviewAuditEntry {
  id: string;
  recordId: string;
  action: ReviewAction;
  previousReviewStatus: ReviewStatus;
  newReviewStatus: ReviewStatus;
  reviewerId: string;
  reviewerName: string;
  note: string | null;
  timestamp: string;
}

export interface EvaluatedTransaction {
  id: string;
  clientId: string;
  source: AccountingSource;
  sourceId: string;
  type: TransactionType;
  sourceStatus: SourceStatus;
  supplier: string | null;
  subtotal: string;
  vat: string;
  total: string;
  transactionKey: string;
  isDuplicate: boolean;
  duplicateOfRecordId: string | null;
  duplicateKind: DuplicateKind | null;
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
  summary: ValidationSummary;
  clients: string[];
  records: EvaluatedTransaction[];
}

export interface ReviewActionResponse {
  record: EvaluatedTransaction;
  auditEntry: ReviewAuditEntry;
  summary: ValidationSummary;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

export type ValidationContext = 'isolated' | 'dataset';

export interface CandidateRecord {
  id?: string;
  clientId: string;
  source: AccountingSource;
  sourceId: string;
  type: TransactionType;
  sourceStatus: SourceStatus;
  supplier?: string | null;
  subtotal: string | number;
  vat: string | number;
  total: string | number;
}

export interface ValidateRequest {
  records: CandidateRecord[];
  context?: ValidationContext;
}

export interface ValidateResponse {
  context: ValidationContext;
  persisted: false;
  count: number;
  summary: ValidationSummary;
  records: EvaluatedTransaction[];
}

export interface TransactionFilters {
  clientId?: string;
  validationStatus?: ValidationStatus;
  reviewStatus?: ReviewStatus;
}

export interface ReviewRequest {
  action: ReviewAction;
  note?: string;
  reviewerId: string;
  reviewerName: string;
}

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
