import { SEED_RECORDS } from '../../src/data/seed-records';
import type { EvaluatedTransaction, ReviewAction, ReviewStatus } from '../../src/domain/models';
import { planReviewTransition } from '../../src/domain/review-state';
import { evaluateRecords } from '../../src/domain/validation-engine';

const RECORDS = new Map(evaluateRecords(SEED_RECORDS).map((record) => [record.id, record]));

function record(id: string, reviewStatus: ReviewStatus = 'Unreviewed'): EvaluatedTransaction {
  const found = RECORDS.get(id);
  if (!found) {
    throw new Error(`unknown seed record ${id}`);
  }
  return { ...found, reviewStatus };
}

function attempt(
  id: string,
  action: ReviewAction,
  note?: string | null,
  current: ReviewStatus = 'Unreviewed',
): ReturnType<typeof planReviewTransition> {
  return planReviewTransition(record(id, current), action, note);
}

describe('planReviewTransition — allowed paths', () => {
  it('marks a Valid record as Reviewed', () => {
    expect(attempt('R001', 'MARK_REVIEWED')).toEqual({
      ok: true,
      targetStatus: 'Reviewed',
      note: null,
    });
  });

  it('marks a Credit with negative amounts as Reviewed', () => {
    expect(attempt('R010', 'MARK_REVIEWED').ok).toBe(true);
  });

  it('keeps and trims a note supplied with Reviewed', () => {
    const result = attempt('R001', 'MARK_REVIEWED', '  Matches the supplier invoice  ');
    expect(result).toEqual({ ok: true, targetStatus: 'Reviewed', note: 'Matches the supplier invoice' });
  });

  it('marks a Valid record as Needs Correction with a note', () => {
    expect(attempt('R002', 'MARK_NEEDS_CORRECTION', '  VAT rate looks wrong  ')).toEqual({
      ok: true,
      targetStatus: 'Needs Correction',
      note: 'VAT rate looks wrong',
    });
  });

  it('marks a Needs Attention record as Needs Correction', () => {
    expect(attempt('R003', 'MARK_NEEDS_CORRECTION', 'Ask the client to re-send the bill').ok).toBe(true);
  });

  it('allows a duplicate record (Needs Attention) to be sent for correction', () => {
    expect(attempt('R005', 'MARK_NEEDS_CORRECTION', 'Duplicate of R001 - void at source').ok).toBe(true);
  });

  it('allows a corrected record to move from Needs Correction to Reviewed', () => {
    expect(attempt('R001', 'MARK_REVIEWED', null, 'Needs Correction')).toEqual({
      ok: true,
      targetStatus: 'Reviewed',
      note: null,
    });
  });
});

describe('planReviewTransition — note semantics', () => {
  it('stores an absent or blank note as null when marking Reviewed', () => {
    for (const note of [undefined, null, '', '   ']) {
      expect(attempt('R001', 'MARK_REVIEWED', note)).toEqual({
        ok: true,
        targetStatus: 'Reviewed',
        note: null,
      });
    }
  });

  it('keeps a trimmed note supplied with Reviewed', () => {
    const result = attempt('R001', 'MARK_REVIEWED', '  Matches the supplier invoice  ');
    expect(result).toEqual({ ok: true, targetStatus: 'Reviewed', note: 'Matches the supplier invoice' });
  });

  it('allows a Reviewed record to be reopened for correction', () => {
    expect(attempt('R001', 'MARK_NEEDS_CORRECTION', 'Invoice re-checked', 'Reviewed')).toEqual({
      ok: true,
      targetStatus: 'Needs Correction',
      note: 'Invoice re-checked',
    });
  });
});

describe('planReviewTransition — guardrail precedence', () => {
  it('checks request completeness before exclusion (400 before 422)', () => {
    const result = attempt('R006', 'MARK_NEEDS_CORRECTION');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOTE_REQUIRED');
      expect(result.httpStatus).toBe(400);
    }
  });

  it('checks exclusion before unresolved issues (EXCLUDED_RECORD 422 wins)', () => {
    // The engine never attaches issues to an Excluded record; this synthetic
    // record pins the ordering so a future change cannot let a 422
    // UNRESOLVED_VALIDATION_ISSUES message leak out for a Draft/Void row.
    const excludedWithIssues: EvaluatedTransaction = {
      ...record('R006'),
      issues: [{ code: 'TOTAL_MISMATCH', field: 'total', message: 'synthetic' }],
    };

    const result = planReviewTransition(excludedWithIssues, 'MARK_REVIEWED');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('EXCLUDED_RECORD');
      expect(result.httpStatus).toBe(422);
    }
  });

  it('checks unresolved issues before a repeated transition (422 before 409)', () => {
    const result = attempt('R003', 'MARK_REVIEWED', null, 'Needs Correction');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNRESOLVED_VALIDATION_ISSUES');
      expect(result.httpStatus).toBe(422);
    }
  });

  it('reports ALREADY_IN_STATE only once every other guardrail has passed', () => {
    const result = attempt('R001', 'MARK_REVIEWED', '   ', 'Reviewed');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ALREADY_IN_STATE');
      expect(result.httpStatus).toBe(409);
    }
  });
});

describe('planReviewTransition — guardrails', () => {
  it('rejects Reviewed on a record with unresolved issues', () => {
    const result = attempt('R003', 'MARK_REVIEWED');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNRESOLVED_VALIDATION_ISSUES');
      expect(result.httpStatus).toBe(422);
      expect(result.message).toBe(
        'R003 has 1 unresolved validation issue (TOTAL_MISMATCH) and cannot be marked as Reviewed.',
      );
    }
  });

  it('names every unresolved issue in the rejection message', () => {
    const result = attempt('R005', 'MARK_REVIEWED');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNRESOLVED_VALIDATION_ISSUES');
      expect(result.message).toContain('DUPLICATE_TRANSACTION');
    }
  });

  it('requires a note of at least three characters for Needs Correction', () => {
    for (const note of [undefined, null, '', '   ', 'ab', '  ab  ']) {
      const result = attempt('R003', 'MARK_NEEDS_CORRECTION', note);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NOTE_REQUIRED');
        expect(result.httpStatus).toBe(400);
      }
    }
  });

  it('accepts a three-character note', () => {
    expect(attempt('R003', 'MARK_NEEDS_CORRECTION', 'fix').ok).toBe(true);
  });

  it('checks request completeness before the record state', () => {
    // Documented precedence in PLAN.md 4.5: an incomplete request is a 400 even for an excluded record.
    const result = attempt('R006', 'MARK_NEEDS_CORRECTION');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOTE_REQUIRED');
      expect(result.httpStatus).toBe(400);
    }
  });

  it.each(['MARK_REVIEWED', 'MARK_NEEDS_CORRECTION'] as const)(
    'rejects %s on Draft and Void records',
    (action) => {
      for (const id of ['R006', 'R009']) {
        const result = attempt(id, action, 'Correction requested');

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe('EXCLUDED_RECORD');
          expect(result.httpStatus).toBe(422);
          expect(result.message).toContain(id);
        }
      }
    },
  );

  it('rejects a repeated transition with a conflict', () => {
    const reviewed = attempt('R001', 'MARK_REVIEWED', null, 'Reviewed');

    expect(reviewed.ok).toBe(false);
    if (!reviewed.ok) {
      expect(reviewed.code).toBe('ALREADY_IN_STATE');
      expect(reviewed.httpStatus).toBe(409);
      expect(reviewed.message).toBe('R001 is already marked as Reviewed.');
    }

    const corrected = attempt('R003', 'MARK_NEEDS_CORRECTION', 'still wrong', 'Needs Correction');

    expect(corrected.ok).toBe(false);
    if (!corrected.ok) {
      expect(corrected.code).toBe('ALREADY_IN_STATE');
      expect(corrected.httpStatus).toBe(409);
    }
  });
});
