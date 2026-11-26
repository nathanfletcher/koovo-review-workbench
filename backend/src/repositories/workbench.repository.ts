import { Injectable } from '@nestjs/common';
import { SEED_RECORDS } from '../data/seed-records';
import type { EvaluatedTransaction, ReviewAction, ReviewAuditEntry, ReviewStatus } from '../domain/models';
import { evaluateRecords } from '../domain/validation-engine';

export interface ReviewMutation {
  recordId: string;
  action: ReviewAction;
  /** Optimistic-concurrency token: the status the caller planned the transition against. */
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

/**
 * Raised when a mutation was planned against a snapshot that is no longer
 * current. The in-memory store cannot interleave two synchronous calls, so this
 * is a defensive invariant rather than a routine path — but it is the same
 * contract the PostgreSQL implementation enforces atomically (see
 * `applyReview`), and it stops a stale caller from appending a misleading audit
 * entry if one is ever wired in.
 */
export class StaleReviewWriteError extends Error {
  constructor(
    readonly recordId: string,
    readonly expectedStatus: ReviewStatus,
    readonly actualStatus: ReviewStatus,
  ) {
    super(
      `${recordId} changed while this review action was being applied ` +
        `(expected ${expectedStatus}, found ${actualStatus}). Reload the record and retry.`,
    );
    this.name = 'StaleReviewWriteError';
  }
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

  /**
   * Applies one review transition and appends its audit entry, atomically.
   *
   * The caller passes the `reviewStatus` its decision was computed from, and the
   * write is rejected if that no longer matches — the in-memory equivalent of a
   * conditional UPDATE. In PostgreSQL the same guarantee is one statement:
   *
   * ```sql
   * BEGIN;
   *   UPDATE transactions
   *      SET review_status = $new_status,
   *          version       = version + 1
   *    WHERE id = $record_id
   *      AND review_status = $previous_status;   -- optimistic token
   *   -- rowCount = 0 -> another reviewer won the race. ROLLBACK, re-read the
   *   -- record, re-run the guardrails, then either retry once or return
   *   -- 409 CONCURRENT_REVIEW_CONFLICT. Never write the audit row blindly.
   *
   *   INSERT INTO review_audit
   *     (record_id, action, previous_status, new_status, reviewer_id, note, created_at)
   *   VALUES ($record_id, $action, $previous_status, $new_status, $reviewer_id, $note, $now);
   * COMMIT;
   * ```
   *
   * `previous_status` is the optimistic-concurrency token; a `version` integer
   * (bumped on every mutation, exposed as an ETag and honoured via `If-Match`)
   * gives the same protection across any field, not just review status. The
   * audit insert shares the transaction, so a status can never exist without
   * its history — and history is append-only in either implementation.
   */
  applyReview(mutation: ReviewMutation): ReviewMutationResult {
    const record = this.records.find((candidate) => candidate.id === mutation.recordId);

    if (!record) {
      throw new Error(`applyReview called for unknown record ${mutation.recordId}`);
    }

    if (record.reviewStatus !== mutation.previousReviewStatus) {
      throw new StaleReviewWriteError(
        mutation.recordId,
        mutation.previousReviewStatus,
        record.reviewStatus,
      );
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
