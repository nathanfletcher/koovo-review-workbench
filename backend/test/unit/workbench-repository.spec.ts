import type { ReviewMutation } from '../../src/repositories/workbench.repository';
import {
  StaleReviewWriteError,
  WorkbenchRepository,
} from '../../src/repositories/workbench.repository';

const FIXED_TIMESTAMP = '2026-11-24T10:15:30.000Z';

function mutation(overrides: Partial<ReviewMutation> = {}): ReviewMutation {
  return {
    recordId: 'R001',
    action: 'MARK_REVIEWED',
    previousReviewStatus: 'Unreviewed',
    newReviewStatus: 'Reviewed',
    note: null,
    reviewerId: 'acct-nathan',
    reviewerName: 'Nathan Fletcher',
    timestamp: FIXED_TIMESTAMP,
    ...overrides,
  };
}

describe('WorkbenchRepository', () => {
  let repository: WorkbenchRepository;

  beforeEach(() => {
    repository = new WorkbenchRepository();
  });

  it('applies a transition and appends exactly one audit entry', () => {
    const { record, auditEntry } = repository.applyReview(mutation());

    expect(record.reviewStatus).toBe('Reviewed');
    expect(record.auditHistory).toEqual([auditEntry]);
    expect(auditEntry).toMatchObject({
      id: 'AUD-0001',
      recordId: 'R001',
      action: 'MARK_REVIEWED',
      previousReviewStatus: 'Unreviewed',
      newReviewStatus: 'Reviewed',
      reviewerId: 'acct-nathan',
      note: null,
      timestamp: FIXED_TIMESTAMP,
    });
    expect(repository.findAuditLog()).toEqual([auditEntry]);
  });

  it('returns the global audit log newest-first', () => {
    repository.applyReview(mutation({ recordId: 'R001' }));
    repository.applyReview(
      mutation({
        recordId: 'R008',
        action: 'MARK_NEEDS_CORRECTION',
        newReviewStatus: 'Needs Correction',
        note: 'Wrong supplier',
        timestamp: '2026-11-24T11:00:00.000Z',
      }),
    );

    expect(repository.findAuditLog().map((entry) => entry.id)).toEqual(['AUD-0002', 'AUD-0001']);
    expect(repository.findAuditForRecord('R008')).toHaveLength(1);
  });

  it('refuses a write planned against a stale snapshot and appends nothing', () => {
    repository.applyReview(mutation());

    // Same token (`Unreviewed`) now that the record is `Reviewed` — the
    // in-memory equivalent of a conditional UPDATE matching zero rows.
    expect(() => repository.applyReview(mutation())).toThrow(StaleReviewWriteError);

    expect(repository.findById('R001')?.reviewStatus).toBe('Reviewed');
    expect(repository.findAuditLog()).toHaveLength(1);
    expect(repository.findById('R001')?.auditHistory).toHaveLength(1);
  });

  it('reports the expected and actual status on a stale write', () => {
    repository.applyReview(mutation());

    try {
      repository.applyReview(mutation());
      throw new Error('expected the stale write to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(StaleReviewWriteError);
      if (error instanceof StaleReviewWriteError) {
        expect(error.recordId).toBe('R001');
        expect(error.expectedStatus).toBe('Unreviewed');
        expect(error.actualStatus).toBe('Reviewed');
        expect(error.message).toBe(
          'R001 changed while this review action was being applied (expected Unreviewed, found Reviewed). Reload the record and retry.',
        );
      }
    }
  });

  it('does not mutate stored history when returning a copy to the caller', () => {
    const { record } = repository.applyReview(mutation());
    record.reviewStatus = 'Unreviewed';
    record.auditHistory[0]!.note = 'tampered';

    expect(repository.findById('R001')?.reviewStatus).toBe('Reviewed');
    expect(repository.findById('R001')?.auditHistory[0]?.note).toBeNull();
  });

  it('reset() restores the seed dataset and clears the audit log', () => {
    repository.applyReview(mutation());
    repository.reset();

    expect(repository.findAuditLog()).toEqual([]);
    expect(repository.findById('R001')?.reviewStatus).toBe('Unreviewed');
    expect(repository.findById('R001')?.auditHistory).toEqual([]);
    expect(repository.findAll()).toHaveLength(11);
  });
});
