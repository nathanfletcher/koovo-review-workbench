import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import type {
  ApiErrorBody,
  AuditLogResponse,
  TransactionListResponse,
  ValidateResponse,
} from '../../src/domain/models';
import { createTestApp } from '../utils/create-test-app';

const REVIEWER = { reviewerId: 'acct-nathan', reviewerName: 'Nathan Fletcher' };

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    clientId: 'C99',
    source: 'Xero',
    sourceId: 'X-900',
    type: 'Bill',
    sourceStatus: 'Posted',
    supplier: 'Test Supplier',
    subtotal: '10.00',
    vat: '2.00',
    total: '12.00',
    ...overrides,
  };
}

describe('POST /api/validate (dry run)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    server = context.server;
  });

  afterAll(async () => {
    await app.close();
  });

  const run = async (
    payload: Record<string, unknown>,
  ): Promise<{ status: number; body: ValidateResponse | ApiErrorBody }> => {
    const response = await request(server).post('/api/validate').send(payload);
    return { status: response.status, body: response.body as ValidateResponse | ApiErrorBody };
  };

  const single = async (overrides: Record<string, unknown> = {}): Promise<ValidateResponse> => {
    const { status, body } = await run({ records: [record(overrides)] });

    expect(status).toBe(200);
    return body as ValidateResponse;
  };

  describe('rule coverage — the interviewer can probe any rule directly', () => {
    it('accepts a clean record', async () => {
      const body = await single();

      expect(body.persisted).toBe(false);
      expect(body.count).toBe(1);
      expect(body.records[0]).toMatchObject({
        validationStatus: 'Valid',
        issues: [],
        processedForReporting: true,
        reviewStatus: 'Unreviewed',
      });
      expect(body.summary).toMatchObject({ total: 1, valid: 1, needsAttention: 0, excluded: 0 });
    });

    it('flags a mismatched total with the exact arithmetic', async () => {
      const body = await single({ subtotal: '300.00', vat: '60.00', total: '365.00' });

      expect(body.records[0]?.validationStatus).toBe('Needs Attention');
      expect(body.records[0]?.issues[0]).toEqual({
        code: 'TOTAL_MISMATCH',
        field: 'total',
        message:
          'Total (£365.00) does not equal Subtotal (£300.00) plus VAT (£60.00) (expected £360.00).',
      });
    });

    it('catches one-penny drift', async () => {
      const body = await single({ subtotal: '100.00', vat: '20.00', total: '120.01' });

      expect(body.records[0]?.issues.map((issue) => issue.code)).toEqual(['TOTAL_MISMATCH']);
    });

    it('accepts float-hostile values that add up in pence', async () => {
      const body = await single({ subtotal: '100.10', vat: '20.20', total: '120.30' });

      expect(body.records[0]?.validationStatus).toBe('Valid');
    });

    it('flags a negative Bill but accepts a negative Credit', async () => {
      const bill = await single({ subtotal: '-30.00', vat: '-6.00', total: '-36.00' });
      expect(bill.records[0]?.issues.map((issue) => issue.code)).toEqual(['NEGATIVE_BILL_AMOUNT']);

      const credit = await single({
        type: 'Credit',
        subtotal: '-100.00',
        vat: '-20.00',
        total: '-120.00',
      });
      expect(credit.records[0]?.validationStatus).toBe('Valid');
    });

    it('flags a missing supplier given as "-", null or omitted', async () => {
      for (const supplier of ['-', null, undefined, '   ']) {
        const body = await single({ supplier });
        expect(body.records[0]?.issues.map((issue) => issue.code)).toEqual(['MISSING_SUPPLIER']);
      }
    });

    it('excludes Draft and Void records without validating them', async () => {
      for (const sourceStatus of ['Draft', 'Void']) {
        const body = await single({ sourceStatus, total: '999.00', supplier: '-' });

        expect(body.records[0]?.validationStatus).toBe('Excluded');
        expect(body.records[0]?.issues).toEqual([]);
        expect(body.summary.excluded).toBe(1);
      }
    });

    it('flags an unparseable amount instead of guessing', async () => {
      const body = await single({ subtotal: '1,000.00' });

      expect(body.records[0]?.issues.map((issue) => issue.code)).toEqual(['INVALID_MONETARY_VALUE']);
      expect(body.records[0]?.issues[0]?.message).toContain('not a valid GBP amount');
    });

    it('reports every issue on a record, in the documented order', async () => {
      const body = await single({
        supplier: '-',
        subtotal: '-10.00',
        vat: '-2.00',
        total: '-13.00',
      });

      expect(body.records[0]?.issues.map((issue) => issue.code)).toEqual([
        'MISSING_SUPPLIER',
        'NEGATIVE_BILL_AMOUNT',
        'TOTAL_MISMATCH',
      ]);
    });

    it('accepts numeric amounts by stringifying them first', async () => {
      const body = await single({ subtotal: 100, vat: 20, total: 120 });

      expect(body.records[0]?.validationStatus).toBe('Valid');
      expect(body.records[0]?.subtotal).toBe('100');
    });
  });

  describe('deduplication contexts', () => {
    it('isolated (default): a record identical to R001 is clean', async () => {
      const body = await single({
        clientId: 'C01',
        sourceId: 'X-101',
        supplier: 'Westline Office',
        subtotal: '100.00',
        vat: '20.00',
        total: '120.00',
      });

      expect(body.context).toBe('isolated');
      expect(body.records[0]?.validationStatus).toBe('Valid');
      expect(body.records[0]?.isDuplicate).toBe(false);
    });

    it('dataset: the same payload collides with R001', async () => {
      const { status, body } = await run({
        context: 'dataset',
        records: [
          record({
            clientId: 'C01',
            sourceId: 'X-101',
            supplier: 'Westline Office',
            subtotal: '100.00',
            vat: '20.00',
            total: '120.00',
          }),
        ],
      });

      expect(status).toBe(200);
      expect(body).toMatchObject({ context: 'dataset', persisted: false, count: 1 });
      expect((body as ValidateResponse).records[0]).toMatchObject({
        isDuplicate: true,
        duplicateOfRecordId: 'R001',
        duplicateKind: 'identical',
      });
    });

    it('dataset: a different client with the same Source ID stays valid', async () => {
      const { body } = await run({
        context: 'dataset',
        records: [
          record({
            clientId: 'C03',
            sourceId: 'X-101',
            supplier: 'Westline Office',
            subtotal: '100.00',
            vat: '20.00',
            total: '120.00',
          }),
        ],
      });

      expect((body as ValidateResponse).records[0]?.isDuplicate).toBe(false);
    });

    it('isolated: duplicates inside one payload are still detected', async () => {
      const { body } = await run({
        records: [record({ id: 'A' }), record({ id: 'B' })],
      });

      const validated = body as ValidateResponse;
      expect(validated.records[0]?.validationStatus).toBe('Valid');
      expect(validated.records[1]).toMatchObject({
        isDuplicate: true,
        duplicateOfRecordId: 'A',
        validationStatus: 'Needs Attention',
      });
    });
  });

  describe('identifiers', () => {
    it('assigns INPUT-n when no id is supplied', async () => {
      const { body } = await run({ records: [record(), record({ sourceId: 'X-901' })] });

      expect((body as ValidateResponse).records.map((candidate) => candidate.id)).toEqual([
        'INPUT-1',
        'INPUT-2',
      ]);
    });

    it('keeps a supplied id', async () => {
      const body = await single({ id: 'MY-ROW-7' });

      expect(body.records[0]?.id).toBe('MY-ROW-7');
    });
  });

  describe('raw values and identity normalisation', () => {
    it('echoes the original amount strings exactly, formatting included', async () => {
      const body = await single({ subtotal: '100.5', vat: ' 20.50 ', total: '121.0' });

      expect(body.records[0]).toMatchObject({
        subtotal: '100.5',
        vat: ' 20.50 ',
        total: '121.0',
        validationStatus: 'Valid',
      });
    });

    it('trims identifiers before building the composite key', async () => {
      const body = await single({ clientId: '  C99  ', sourceId: ' X-900 ' });

      expect(body.records[0]).toMatchObject({
        clientId: 'C99',
        sourceId: 'X-900',
        transactionKey: 'C99::Xero::X-900',
        validationStatus: 'Valid',
      });
    });

    it('detects duplicates across whitespace variants of one identity', async () => {
      const { body } = await run({
        records: [
          record({ id: 'A', clientId: 'C09', sourceId: 'X-909' }),
          record({ id: 'B', clientId: ' C09 ', sourceId: 'X-909 ' }),
        ],
      });

      const validated = body as ValidateResponse;
      expect(validated.records[0]?.isDuplicate).toBe(false);
      expect(validated.records[0]?.validationStatus).toBe('Valid');
      expect(validated.records[1]).toMatchObject({
        clientId: 'C09',
        isDuplicate: true,
        duplicateOfRecordId: 'A',
        duplicateKind: 'identical',
        validationStatus: 'Needs Attention',
      });
    });

    it('keeps raw amounts intact when a dataset-context duplicate is reported', async () => {
      const { body } = await run({
        context: 'dataset',
        records: [record({ clientId: ' C01 ', sourceId: 'X-101', supplier: 'Westline Office' })],
      });

      expect((body as ValidateResponse).records[0]).toMatchObject({
        clientId: 'C01',
        sourceId: 'X-101',
        subtotal: '10.00',
        vat: '2.00',
        total: '12.00',
        isDuplicate: true,
        duplicateOfRecordId: 'R001',
      });
    });
  });

  describe('nothing is persisted', () => {
    it('leaves the dataset, summary and audit log untouched', async () => {
      await run({ records: [record({ clientId: 'C01', sourceId: 'X-999' })] });

      const list = await request(server).get('/api/transactions').expect(200);
      const listBody = list.body as TransactionListResponse;

      expect(listBody.summary).toMatchObject({ total: 11, valid: 5, needsAttention: 4, excluded: 2 });
      expect(listBody.records.every((candidate) => !candidate.id.startsWith('INPUT-'))).toBe(true);

      const audit = await request(server).get('/api/audit-logs').expect(200);
      expect((audit.body as AuditLogResponse).entries).toEqual([]);
    });

    it('a dry run cannot be used to review a record', async () => {
      await run({ records: [record({ clientId: 'C01', sourceId: 'X-101' })] });

      const response = await request(server)
        .post('/api/transactions/R001/review')
        .send({ action: 'MARK_REVIEWED', ...REVIEWER })
        .expect(200);

      expect(response.body).toMatchObject({ record: { reviewStatus: 'Reviewed' } });
    });
  });

  describe('request validation (a bad request is an error, a bad record is data)', () => {
    it('rejects an empty payload', async () => {
      const { status, body } = await run({ records: [] });

      expect(status).toBe(400);
      expect((body as ApiErrorBody).code).toBe('INVALID_REQUEST');
    });

    it('rejects more than 50 records', async () => {
      const records = Array.from({ length: 51 }, (_, index) =>
        record({ sourceId: `X-${1000 + index}` }),
      );
      const { status, body } = await run({ records });

      expect(status).toBe(400);
      expect((body as ApiErrorBody).message).toContain('at most 50');
    });

    it('rejects an unknown source, status, type or context', async () => {
      await expect(
        request(server).post('/api/validate').send({ records: [record({ source: 'QuickBooks' })] }),
      ).resolves.toMatchObject({ status: 400 });

      await expect(
        request(server).post('/api/validate').send({ records: [record({ sourceStatus: 'Open' })] }),
      ).resolves.toMatchObject({ status: 400 });

      await expect(
        request(server).post('/api/validate').send({ records: [record({ type: 'Invoice' })] }),
      ).resolves.toMatchObject({ status: 400 });

      await expect(
        request(server).post('/api/validate').send({ context: 'bogus', records: [record()] }),
      ).resolves.toMatchObject({ status: 400 });
    });

    it('rejects missing required fields and unknown fields', async () => {
      const missing = await run({ records: [{ ...record(), clientId: undefined }] });
      expect(missing.status).toBe(400);

      const blank = await run({ records: [{ ...record(), sourceId: '   ' }] });
      expect(blank.status).toBe(400);

      const extra = await run({ records: [{ ...record(), amount: 12 }] });
      expect(extra.status).toBe(400);
      expect((extra.body as ApiErrorBody).message).toContain('amount');
    });

    it('rejects a missing records array', async () => {
      const { status, body } = await run({});

      expect(status).toBe(400);
      expect((body as ApiErrorBody).message).toContain('records');
    });
  });
});
