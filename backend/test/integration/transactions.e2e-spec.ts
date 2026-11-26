import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import type {
  ApiErrorBody,
  AuditLogResponse,
  EvaluatedTransaction,
  ReviewActionResponse,
  TransactionListResponse,
} from '../../src/domain/models';
import { WorkbenchRepository, StaleReviewWriteError } from '../../src/repositories/workbench.repository';
import { FIXED_NOW, createTestApp } from '../utils/create-test-app';

const REVIEWER = { reviewerId: 'acct-nathan', reviewerName: 'Nathan Fletcher' };

describe('Koovo review API (integration)', () => {
  let app: INestApplication;
  let server: Server;
  let repository: WorkbenchRepository;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    server = context.server;
    repository = context.repository;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Every test starts from the pristine seed dataset.
    repository.reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const list = async (query = ''): Promise<TransactionListResponse> => {
    const response = await request(server).get(`/api/transactions${query}`).expect(200);
    return response.body as TransactionListResponse;
  };

  const idsOf = (body: TransactionListResponse): string[] => body.records.map((record) => record.id);

  describe('GET /api/health', () => {
    it('reports ok with a deterministic timestamp', async () => {
      const response = await request(server).get('/api/health').expect(200);

      expect(response.body).toEqual({ status: 'ok', timestamp: FIXED_NOW });
    });
  });

  describe('GET /api/transactions', () => {
    it('returns all 11 records in input order with the brief summary counts', async () => {
      const body = await list();

      expect(body.summary).toEqual({
        total: 11,
        valid: 5,
        needsAttention: 4,
        excluded: 2,
        reviewBreakdown: { unreviewed: 11, reviewed: 0, needsCorrection: 0 },
      });
      expect(body.clients).toEqual(['C01', 'C02']);
      expect(idsOf(body)).toEqual([
        'R001',
        'R002',
        'R003',
        'R004',
        'R005',
        'R006',
        'R007',
        'R008',
        'R009',
        'R010',
        'R011',
      ]);
    });

    it('returns validation results and retention flags per record', async () => {
      const body = await list();
      const byId = new Map(body.records.map((record) => [record.id, record]));

      expect(byId.get('R003')?.validationStatus).toBe('Needs Attention');
      expect(byId.get('R003')?.issues).toHaveLength(1);
      expect(byId.get('R005')).toMatchObject({
        isDuplicate: true,
        duplicateOfRecordId: 'R001',
        duplicateKind: 'identical',
        processedForReporting: false,
      });
      expect(byId.get('R007')).toMatchObject({
        validationStatus: 'Valid',
        isDuplicate: false,
        processedForReporting: true,
        transactionKey: 'C02::Xero::X-101',
      });
      expect(byId.get('R006')?.validationStatus).toBe('Excluded');
      expect(byId.get('R010')).toMatchObject({ type: 'Credit', validationStatus: 'Valid' });
    });

    it('filters by client and keeps the summary global', async () => {
      const body = await list('?clientId=C02');

      expect(idsOf(body)).toEqual(['R007']);
      expect(body.summary).toMatchObject({ total: 11, valid: 5, needsAttention: 4, excluded: 2 });
      expect(body.clients).toEqual(['C01', 'C02']);
    });

    it('filters by validation status, including the space in "Needs Attention"', async () => {
      expect(idsOf(await list('?validationStatus=Valid'))).toEqual([
        'R001',
        'R002',
        'R007',
        'R008',
        'R010',
      ]);
      expect(idsOf(await list('?validationStatus=Needs%20Attention'))).toEqual([
        'R003',
        'R004',
        'R005',
        'R011',
      ]);
      expect(idsOf(await list('?validationStatus=Excluded'))).toEqual(['R006', 'R009']);
    });

    it('combines client and validation filters', async () => {
      const body = await list('?clientId=C01&validationStatus=Needs%20Attention');

      expect(idsOf(body)).toEqual(['R003', 'R004', 'R005', 'R011']);
    });

    it('filters by review status', async () => {
      await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(200);

      expect(idsOf(await list('?reviewStatus=Reviewed'))).toEqual(['R001']);
      expect(idsOf(await list('?reviewStatus=Unreviewed'))).toHaveLength(10);
    });

    it('keeps summary and clients global for every filter', async () => {
      const global = await list();

      for (const query of [
        '?clientId=C01',
        '?clientId=C02',
        '?validationStatus=Valid',
        '?validationStatus=Needs%20Attention',
        '?validationStatus=Excluded',
        '?reviewStatus=Unreviewed',
        '?clientId=C01&validationStatus=Excluded',
        '?clientId=ZZZ',
      ]) {
        const filtered = await list(query);

        expect(filtered.summary).toEqual(global.summary);
        expect(filtered.clients).toEqual(global.clients);
      }
    });

    it('rejects blank filter values instead of filtering on an empty string', async () => {
      for (const query of [
        '?clientId=',
        '?clientId=%20%20',
        '?validationStatus=',
        '?reviewStatus=',
      ]) {
        const response = await request(server).get(`/api/transactions${query}`).expect(400);

        expect((response.body as ApiErrorBody).code).toBe('INVALID_REQUEST');
      }

      const blankClient = await request(server)
        .get('/api/transactions?clientId=%20%20')
        .expect(400);

      expect((blankClient.body as ApiErrorBody).message).toContain('clientId');
    });

    it('returns an empty list (not an error) for a client with no records', async () => {
      const body = await list('?clientId=ZZZ');

      expect(body.records).toEqual([]);
      expect(body.summary.total).toBe(11);
    });

    it('rejects an unknown validation status with 400 INVALID_REQUEST', async () => {
      const response = await request(server).get('/api/transactions?validationStatus=Bogus').expect(400);
      const body = response.body as ApiErrorBody;

      expect(body.statusCode).toBe(400);
      expect(body.code).toBe('INVALID_REQUEST');
      expect(body.message).toContain('validationStatus');
    });

    it('rejects unknown query parameters with 400', async () => {
      const response = await request(server).get('/api/transactions?orderBy=total').expect(400);

      expect((response.body as ApiErrorBody).code).toBe('INVALID_REQUEST');
    });
  });

  describe('GET /api/transactions/:id', () => {
    it('returns a single record with issues and audit history', async () => {
      const response = await request(server).get('/api/transactions/R003').expect(200);
      const record = response.body as EvaluatedTransaction;

      expect(record.id).toBe('R003');
      expect(record.issues[0]).toEqual({
        code: 'TOTAL_MISMATCH',
        field: 'total',
        message:
          'Total (£365.00) does not equal Subtotal (£300.00) plus VAT (£60.00) (expected £360.00).',
      });
      expect(record.auditHistory).toEqual([]);
      expect(record.reviewStatus).toBe('Unreviewed');
    });

    it('returns 404 RECORD_NOT_FOUND for an unknown id', async () => {
      const response = await request(server).get('/api/transactions/R999').expect(404);
      const body = response.body as ApiErrorBody;

      expect(body.code).toBe('RECORD_NOT_FOUND');
      expect(body.message).toBe('No transaction with id R999.');
    });
  });

  describe('POST /api/transactions/:id/review — allowed transitions', () => {
    it('marks a Valid record as Reviewed and records an audit entry', async () => {
      const response = await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(200);

      const body = response.body as ReviewActionResponse;

      expect(body.record.reviewStatus).toBe('Reviewed');
      expect(body.auditEntry).toEqual({
        id: 'AUD-0001',
        recordId: 'R001',
        action: 'MARK_REVIEWED',
        previousReviewStatus: 'Unreviewed',
        newReviewStatus: 'Reviewed',
        reviewerId: 'acct-nathan',
        reviewerName: 'Nathan Fletcher',
        note: null,
        timestamp: FIXED_NOW,
      });
      expect(body.record.auditHistory).toEqual([body.auditEntry]);
      expect(body.summary.reviewBreakdown).toEqual({
        unreviewed: 10,
        reviewed: 1,
        needsCorrection: 0,
      });
    });

    it('marks a Needs Attention record as Needs Correction with a trimmed note', async () => {
      const response = await request(server)
        .post('/api/transactions/R003/review')
        .send({
          action: 'MARK_NEEDS_CORRECTION',
          note: '  Total does not match the supplier invoice  ',
          ...REVIEWER,
        })
        .expect(200);

      const body = response.body as ReviewActionResponse;

      expect(body.record.reviewStatus).toBe('Needs Correction');
      expect(body.auditEntry.note).toBe('Total does not match the supplier invoice');
      expect(body.auditEntry.previousReviewStatus).toBe('Unreviewed');
      expect(body.auditEntry.newReviewStatus).toBe('Needs Correction');
      expect(body.summary.reviewBreakdown.needsCorrection).toBe(1);
    });

    it('allows a valid Credit with negative amounts to be Reviewed', async () => {
      const response = await request(server)
        .post('/api/transactions/R010/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(200);

      expect((response.body as ReviewActionResponse).record.reviewStatus).toBe('Reviewed');
    });

    it('allows a duplicate record to be sent for correction', async () => {
      const response = await request(server)
        .post('/api/transactions/R005/review')
        .send({
          action: 'MARK_NEEDS_CORRECTION',
          note: 'Duplicate of R001 - ask the client to void at source',
          ...REVIEWER,
        })
        .expect(200);

      expect((response.body as ReviewActionResponse).record.reviewStatus).toBe('Needs Correction');
    });

    it('appends (never rewrites) audit history across transitions', async () => {
      await request(server)
        .post('/api/transactions/R002/review')
        .send({ action: 'MARK_NEEDS_CORRECTION', note: 'VAT rate query', ...REVIEWER })
        .expect(200);

      const response = await request(server)
        .post('/api/transactions/R002/review')
        .send({ action: 'MARK_REVIEWED', note: 'Corrected by the client', ...REVIEWER })
        .expect(200);

      const body = response.body as ReviewActionResponse;

      expect(body.record.auditHistory.map((entry) => entry.id)).toEqual(['AUD-0001', 'AUD-0002']);
      expect(body.record.auditHistory[1]).toMatchObject({
        previousReviewStatus: 'Needs Correction',
        newReviewStatus: 'Reviewed',
        note: 'Corrected by the client',
      });
    });

    it('retains a trimmed note supplied when marking a Valid record Reviewed', async () => {
      const response = await request(server)
        .post('/api/transactions/R001/review')
        .send({
          action: 'MARK_REVIEWED',
          note: '  Checked against the supplier invoice  ',
          ...REVIEWER,
        })
        .expect(200);

      expect((response.body as ReviewActionResponse).auditEntry.note).toBe(
        'Checked against the supplier invoice',
      );
    });

    it('stores a blank note as null', async () => {
      const response = await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', note: '   ', ...REVIEWER })
        .expect(200);

      expect((response.body as ReviewActionResponse).auditEntry.note).toBeNull();
    });

    it('trims the reviewer identity and falls back to reviewerId for a blank name', async () => {
      const response = await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', reviewerId: '  acct-nathan  ', reviewerName: '   ' })
        .expect(200);

      expect((response.body as ReviewActionResponse).auditEntry).toMatchObject({
        reviewerId: 'acct-nathan',
        reviewerName: 'acct-nathan',
      });
    });

    it('rejects repeating Needs Correction with 409 and keeps one audit entry', async () => {
      await request(server)
        .post('/api/transactions/R003/review')
        .send({ action: 'MARK_NEEDS_CORRECTION', note: 'Total does not match', ...REVIEWER })
        .expect(200);

      const again = await request(server)
        .post('/api/transactions/R003/review')
        .send({ action: 'MARK_NEEDS_CORRECTION', note: 'Still does not match', ...REVIEWER })
        .expect(409);

      expect((again.body as ApiErrorBody).code).toBe('ALREADY_IN_STATE');

      const record = await request(server).get('/api/transactions/R003').expect(200);
      expect((record.body as EvaluatedTransaction).reviewStatus).toBe('Needs Correction');
      expect((record.body as EvaluatedTransaction).auditHistory).toHaveLength(1);
    });
  });

  describe('POST /api/transactions/:id/review — guardrails', () => {
    it('refuses to Review a record with unresolved issues (422)', async () => {
      const response = await request(server)
        .post('/api/transactions/R003/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(422);

      const body = response.body as ApiErrorBody;

      expect(body.code).toBe('UNRESOLVED_VALIDATION_ISSUES');
      expect(body.message).toBe(
        'R003 has 1 unresolved validation issue (TOTAL_MISMATCH) and cannot be marked as Reviewed.',
      );
    });

    it('requires a note for Needs Correction (400)', async () => {
      const response = await request(server)
        .post('/api/transactions/R003/review')
        .send({ action: 'MARK_NEEDS_CORRECTION', ...REVIEWER })
        .expect(400);

      expect((response.body as ApiErrorBody).code).toBe('NOTE_REQUIRED');
    });

    it('rejects a note shorter than three characters (400)', async () => {
      const response = await request(server)
        .post('/api/transactions/R003/review')
        .send({ action: 'MARK_NEEDS_CORRECTION', note: '  ab  ', ...REVIEWER })
        .expect(400);

      expect((response.body as ApiErrorBody).code).toBe('NOTE_REQUIRED');
    });

    it.each(['R006', 'R009'])('refuses every review action on excluded record %s (422)', async (id) => {
      const reviewed = await request(server)
        .post(`/api/transactions/${id}/review`)
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(422);

      expect((reviewed.body as ApiErrorBody).code).toBe('EXCLUDED_RECORD');

      const corrected = await request(server)
        .post(`/api/transactions/${id}/review`)
        .send({ action: 'MARK_NEEDS_CORRECTION', note: 'Please correct', ...REVIEWER })
        .expect(422);

      expect((corrected.body as ApiErrorBody).code).toBe('EXCLUDED_RECORD');
    });

    it('rejects a repeated transition with 409 (no duplicate audit entries)', async () => {
      await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(200);

      const response = await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(409);

      expect((response.body as ApiErrorBody).code).toBe('ALREADY_IN_STATE');

      const record = await request(server).get('/api/transactions/R001').expect(200);
      expect((record.body as EvaluatedTransaction).auditHistory).toHaveLength(1);
    });

    it('reports the first failing guardrail over HTTP (422 before 409)', async () => {
      await request(server)
        .post('/api/transactions/R003/review')
        .send({ action: 'MARK_NEEDS_CORRECTION', note: 'Total does not match', ...REVIEWER })
        .expect(200);

      const response = await request(server)
        .post('/api/transactions/R003/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(422);

      expect((response.body as ApiErrorBody).code).toBe('UNRESOLVED_VALIDATION_ISSUES');
    });

    it('rejects a blank reviewer identity with 400', async () => {
      const response = await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', reviewerId: '   ' })
        .expect(400);

      expect((response.body as ApiErrorBody).code).toBe('INVALID_REQUEST');
      expect((response.body as ApiErrorBody).message).toContain('reviewerId');
    });

    it('maps a write planned against a stale snapshot to 409 CONCURRENT_REVIEW_CONFLICT', async () => {
      // The in-memory store cannot interleave calls, so the race is injected:
      // the repository refuses a mutation whose previousReviewStatus is stale.
      jest.spyOn(repository, 'applyReview').mockImplementationOnce(() => {
        throw new StaleReviewWriteError('R001', 'Unreviewed', 'Reviewed');
      });

      const response = await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(409);

      expect((response.body as ApiErrorBody).code).toBe('CONCURRENT_REVIEW_CONFLICT');
      expect((response.body as ApiErrorBody).message).toContain('Reload the record and retry');

      const record = await request(server).get('/api/transactions/R001').expect(200);
      expect((record.body as EvaluatedTransaction).reviewStatus).toBe('Unreviewed');
      expect((record.body as EvaluatedTransaction).auditHistory).toEqual([]);
    });

    it('returns 404 before applying any guardrail for an unknown record', async () => {
      const response = await request(server)
        .post('/api/transactions/R999/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(404);

      expect((response.body as ApiErrorBody).code).toBe('RECORD_NOT_FOUND');
    });

    it('validates the request body (400 INVALID_REQUEST)', async () => {
      const unknownAction = await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'APPROVE', ...REVIEWER })
        .expect(400);
      expect((unknownAction.body as ApiErrorBody).code).toBe('INVALID_REQUEST');

      const missingReviewer = await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED' })
        .expect(400);
      expect((missingReviewer.body as ApiErrorBody).message).toContain('reviewerId');

      const extraField = await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', isAdmin: true, ...REVIEWER })
        .expect(400);
      expect((extraField.body as ApiErrorBody).code).toBe('INVALID_REQUEST');

      const longNote = await request(server)
        .post('/api/transactions/R003/review')
        .send({ action: 'MARK_NEEDS_CORRECTION', note: 'x'.repeat(501), ...REVIEWER })
        .expect(400);
      expect((longNote.body as ApiErrorBody).message).toContain('note');
    });
  });

  describe('GET /api/audit-logs', () => {
    it('returns every review action newest-first', async () => {
      await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(200);
      await request(server)
        .post('/api/transactions/R008/review')
        .send({ action: 'MARK_NEEDS_CORRECTION', note: 'Wrong supplier', ...REVIEWER })
        .expect(200);

      const response = await request(server).get('/api/audit-logs').expect(200);
      const body = response.body as AuditLogResponse;

      expect(body.entries.map((entry) => entry.id)).toEqual(['AUD-0002', 'AUD-0001']);
      expect(body.entries[0]).toMatchObject({
        recordId: 'R008',
        action: 'MARK_NEEDS_CORRECTION',
        note: 'Wrong supplier',
      });
    });

    it('is empty on a fresh dataset', async () => {
      const response = await request(server).get('/api/audit-logs').expect(200);

      expect((response.body as AuditLogResponse).entries).toEqual([]);
    });
  });

  describe('repository isolation', () => {
    it('reset() restores the seed dataset and clears the audit log', async () => {
      await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(200);

      repository.reset();

      const body = await list();
      expect(body.summary.reviewBreakdown.reviewed).toBe(0);
      expect(body.records.every((record) => record.auditHistory.length === 0)).toBe(true);
      const audit = await request(server).get('/api/audit-logs').expect(200);
      expect((audit.body as AuditLogResponse).entries).toEqual([]);
    });
  });
});
