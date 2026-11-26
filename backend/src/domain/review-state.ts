import type { EvaluatedTransaction, ReviewAction, ReviewStatus } from './models';

export const REVIEW_ACTIONS: readonly ReviewAction[] = ['MARK_REVIEWED', 'MARK_NEEDS_CORRECTION'];

export const MIN_NOTE_LENGTH = 3;
export const MAX_NOTE_LENGTH = 500;

export type ReviewTransitionFailureCode =
  | 'NOTE_REQUIRED'
  | 'EXCLUDED_RECORD'
  | 'UNRESOLVED_VALIDATION_ISSUES'
  | 'ALREADY_IN_STATE';

export interface ReviewTransitionSuccess {
  ok: true;
  targetStatus: ReviewStatus;
  note: string | null;
}

export interface ReviewTransitionFailure {
  ok: false;
  code: ReviewTransitionFailureCode;
  message: string;
  httpStatus: 400 | 409 | 422;
}

export type ReviewTransitionResult = ReviewTransitionSuccess | ReviewTransitionFailure;

function targetStatusFor(action: ReviewAction): ReviewStatus {
  return action === 'MARK_REVIEWED' ? 'Reviewed' : 'Needs Correction';
}

/**
 * Declarative guardrails, first failure wins (PLAN.md §4.5). The order is part
 * of the contract, not an accident:
 *
 *   1. NOTE_REQUIRED (400)                — MARK_NEEDS_CORRECTION without a 3+ char note
 *   2. EXCLUDED_RECORD (422)              — Draft/Void records cannot be reviewed at all
 *   3. UNRESOLVED_VALIDATION_ISSUES (422) — MARK_REVIEWED on anything that is not Valid
 *   4. ALREADY_IN_STATE (409)             — the record is already at the target status
 *
 * Notes: MARK_REVIEWED accepts an optional note and keeps it (trimmed) on the
 * audit entry; an absent/blank note is stored as `null`. MARK_NEEDS_CORRECTION
 * requires a note of at least `MIN_NOTE_LENGTH` characters — the
 * `MAX_NOTE_LENGTH` upper bound is a request-schema limit enforced by
 * `ReviewActionDto` (400 INVALID_REQUEST) and mirrored in the UI, so that an
 * oversized payload is rejected before any business rule runs.
 */
export function planReviewTransition(
  record: EvaluatedTransaction,
  action: ReviewAction,
  note?: string | null,
): ReviewTransitionResult {
  const trimmedNote = typeof note === 'string' ? note.trim() : '';

  if (action === 'MARK_NEEDS_CORRECTION' && trimmedNote.length < MIN_NOTE_LENGTH) {
    return {
      ok: false,
      code: 'NOTE_REQUIRED',
      httpStatus: 400,
      message: `A note of at least ${MIN_NOTE_LENGTH} characters is required to mark a record as Needs Correction.`,
    };
  }

  if (record.validationStatus === 'Excluded') {
    return {
      ok: false,
      code: 'EXCLUDED_RECORD',
      httpStatus: 422,
      message: `${record.id} is excluded (source status ${record.sourceStatus}). Draft and Void records cannot be reviewed.`,
    };
  }

  if (action === 'MARK_REVIEWED' && record.validationStatus !== 'Valid') {
    const codes = record.issues.map((issue) => issue.code).join(', ');
    const plural = record.issues.length === 1 ? 'issue' : 'issues';
    return {
      ok: false,
      code: 'UNRESOLVED_VALIDATION_ISSUES',
      httpStatus: 422,
      message: `${record.id} has ${record.issues.length} unresolved validation ${plural} (${codes}) and cannot be marked as Reviewed.`,
    };
  }

  const targetStatus = targetStatusFor(action);

  if (record.reviewStatus === targetStatus) {
    return {
      ok: false,
      code: 'ALREADY_IN_STATE',
      httpStatus: 409,
      message: `${record.id} is already marked as ${targetStatus}.`,
    };
  }

  return {
    ok: true,
    targetStatus,
    note: trimmedNote.length > 0 ? trimmedNote : null,
  };
}
