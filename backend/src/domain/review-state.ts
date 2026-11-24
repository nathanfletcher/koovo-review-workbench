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
 * Declarative guardrails. Order matches PLAN.md §4.5 (first failure wins):
 * request completeness (400) -> excluded (422) -> unresolved issues (422) -> no-op (409).
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
