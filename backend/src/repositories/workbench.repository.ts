import { Injectable } from '@nestjs/common';
import { SEED_RECORDS } from '../data/seed-records';
import type { EvaluatedTransaction, ReviewAction, ReviewAuditEntry, ReviewStatus } from '../domain/models';
import { evaluateRecords } from '../domain/validation-engine';

export interface ReviewMutation {
  recordId: string;
  action: ReviewAction;
  previousReviewStatus: ReviewStatus;
  newReviewStatus: ReviewStatus;
  note: string | null;
  reviewerId: string;
  reviewerName: string;
  timestamp: string;
}

export interface ReviewMutationResult {
  record: EvaluatedTransaction;
  auditEntry: ReviewAuditEntry;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * In-memory store behind an explicit repository boundary. Swapping this for
 * PostgreSQL (records table + append-only audit table, both written in one
 * transaction) changes nothing above it — the service only depends on this
 * interface's methods.
 */
@Injectable()
export class WorkbenchRepository {
  private records: EvaluatedTransaction[] = [];
  private auditLog: ReviewAuditEntry[] = [];
  private auditSequence = 0;

  constructor() {
    this.reset();
  }

  /** Restores the pristine seed state. Used by tests for isolation. */
  reset(): void {
    this.records = evaluateRecords(SEED_RECORDS);
    this.auditLog = [];
    this.auditSequence = 0;
  }

  findAll(): EvaluatedTransaction[] {
    return this.records.map((record) => deepClone(record));
  }

  findById(recordId: string): EvaluatedTransaction | undefined {
    const record = this.records.find((candidate) => candidate.id === recordId);
    return record ? deepClone(record) : undefined;
  }

  /** Newest first. */
  findAuditLog(): ReviewAuditEntry[] {
    return deepClone(this.auditLog).reverse();
  }

  findAuditForRecord(recordId: string): ReviewAuditEntry[] {
    return this.findAuditLog().filter((entry) => entry.recordId === recordId);
  }

  applyReview(mutation: ReviewMutation): ReviewMutationResult {
    const record = this.records.find((candidate) => candidate.id === mutation.recordId);

    if (!record) {
      throw new Error(`applyReview called for unknown record ${mutation.recordId}`);
    }

    const auditEntry: ReviewAuditEntry = {
      id: this.nextAuditId(),
      recordId: mutation.recordId,
      action: mutation.action,
      previousReviewStatus: mutation.previousReviewStatus,
      newReviewStatus: mutation.newReviewStatus,
      reviewerId: mutation.reviewerId,
      reviewerName: mutation.reviewerName,
      note: mutation.note,
      timestamp: mutation.timestamp,
    };

    record.reviewStatus = mutation.newReviewStatus;
    // Append-only: history is never rewritten, in either the record or the log.
    record.auditHistory = [...record.auditHistory, auditEntry];
    this.auditLog = [...this.auditLog, auditEntry];

    return { record: deepClone(record), auditEntry: deepClone(auditEntry) };
  }

  private nextAuditId(): string {
    this.auditSequence += 1;
    return `AUD-${String(this.auditSequence).padStart(4, '0')}`;
  }
}
