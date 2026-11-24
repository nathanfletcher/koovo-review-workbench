import { vi } from 'vitest';
import type {
  EvaluatedTransaction,
  ReviewAction,
  ReviewAuditEntry,
  ValidationSummary,
} from '../types/workbench';
import { FIXTURE_CLIENTS, FIXTURE_RECORDS } from './records.fixture';

const FIXED_NOW = '2026-11-24T10:15:30.000Z';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function summarize(records: EvaluatedTransaction[]): ValidationSummary {
  const summary: ValidationSummary = {
    total: records.length,
    valid: 0,
    needsAttention: 0,
    excluded: 0,
    reviewBreakdown: { unreviewed: 0, reviewed: 0, needsCorrection: 0 },
  };

  for (const record of records) {
    if (record.validationStatus === 'Valid') {
      summary.valid += 1;
    } else if (record.validationStatus === 'Needs Attention') {
      summary.needsAttention += 1;
    } else {
      summary.excluded += 1;
    }

    if (record.reviewStatus === 'Reviewed') {
      summary.reviewBreakdown.reviewed += 1;
    } else if (record.reviewStatus === 'Needs Correction') {
      summary.reviewBreakdown.needsCorrection += 1;
    } else {
      summary.reviewBreakdown.unreviewed += 1;
    }
  }

  return summary;
}

export interface MockWorkbenchApi {
  /** Every request the UI made, in order — used to prove filters hit the API. */
  calls: string[];
  reviewBodies: Array<Record<string, unknown>>;
  records: () => EvaluatedTransaction[];
  failNextList: () => void;
  restore: () => void;
}

/**
 * In-memory stand-in for the NestJS API, driven by the fixture generated from the
 * real validation engine. Mirrors the server's guardrails so UI tests fail when
 * the client stops honouring them.
 */
export function installMockApi(): MockWorkbenchApi {
  const records: EvaluatedTransaction[] = clone(FIXTURE_RECORDS);
  const calls: string[] = [];
  const reviewBodies: Array<Record<string, unknown>> = [];
  let auditSequence = 0;
  let failListOnce = false;

  const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const errorResponse = (status: number, code: string, message: string): Response =>
    jsonResponse({ statusCode: status, code, message }, status);

  const urlOf = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') {
      return input;
    }
    return input instanceof URL ? input.toString() : input.url;
  };

  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);

    if (method === 'POST' && /^\/api\/transactions\/[^/]+\/review$/.test(url)) {
      const recordId = decodeURIComponent(url.split('/')[3] ?? '');
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      reviewBodies.push(body);

      const action = body.action as ReviewAction;
      const note = typeof body.note === 'string' ? body.note.trim() : '';
      const record = records.find((candidate) => candidate.id === recordId);

      if (!record) {
        return errorResponse(404, 'RECORD_NOT_FOUND', `No transaction with id ${recordId}.`);
      }

      if (action === 'MARK_NEEDS_CORRECTION' && note.length < 3) {
        return errorResponse(
          400,
          'NOTE_REQUIRED',
          'A note of at least 3 characters is required to mark a record as Needs Correction.',
        );
      }

      if (record.validationStatus === 'Excluded') {
        return errorResponse(
          422,
          'EXCLUDED_RECORD',
          `${record.id} is excluded (source status ${record.sourceStatus}). Draft and Void records cannot be reviewed.`,
        );
      }

      if (action === 'MARK_REVIEWED' && record.validationStatus !== 'Valid') {
        return errorResponse(
          422,
          'UNRESOLVED_VALIDATION_ISSUES',
          `${record.id} has ${record.issues.length} unresolved validation issues and cannot be marked as Reviewed.`,
        );
      }

      const target = action === 'MARK_REVIEWED' ? 'Reviewed' : 'Needs Correction';

      if (record.reviewStatus === target) {
        return errorResponse(409, 'ALREADY_IN_STATE', `${record.id} is already marked as ${target}.`);
      }

      auditSequence += 1;
      const auditEntry: ReviewAuditEntry = {
        id: `AUD-${String(auditSequence).padStart(4, '0')}`,
        recordId,
        action,
        previousReviewStatus: record.reviewStatus,
        newReviewStatus: target,
        reviewerId: String(body.reviewerId ?? ''),
        reviewerName: String(body.reviewerName ?? body.reviewerId ?? ''),
        note: note.length > 0 ? note : null,
        timestamp: FIXED_NOW,
      };

      record.reviewStatus = target;
      record.auditHistory = [...record.auditHistory, auditEntry];

      return jsonResponse({
        record: clone(record),
        auditEntry: clone(auditEntry),
        summary: summarize(records),
      });
    }

    if (method === 'GET' && url.startsWith('/api/transactions/')) {
      const recordId = decodeURIComponent(url.replace('/api/transactions/', '').split('?')[0] ?? '');
      const record = records.find((candidate) => candidate.id === recordId);

      return record
        ? jsonResponse(clone(record))
        : errorResponse(404, 'RECORD_NOT_FOUND', `No transaction with id ${recordId}.`);
    }

    if (method === 'GET' && url.startsWith('/api/transactions')) {
      if (failListOnce) {
        failListOnce = false;
        throw new Error('simulated network failure');
      }

      const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
      const params = new URLSearchParams(query);
      const clientId = params.get('clientId');
      const validationStatus = params.get('validationStatus');
      const reviewStatus = params.get('reviewStatus');

      const filtered = records.filter((record) => {
        if (clientId && record.clientId !== clientId) {
          return false;
        }
        if (validationStatus && record.validationStatus !== validationStatus) {
          return false;
        }
        if (reviewStatus && record.reviewStatus !== reviewStatus) {
          return false;
        }
        return true;
      });

      return jsonResponse({
        summary: summarize(records),
        clients: [...FIXTURE_CLIENTS],
        records: clone(filtered),
      });
    }

    if (method === 'GET' && url === '/api/audit-logs') {
      const entries = records
        .flatMap((record) => record.auditHistory)
        .sort((a, b) => b.id.localeCompare(a.id));

      return jsonResponse({ entries: clone(entries) });
    }

    return errorResponse(404, 'ROUTE_NOT_FOUND', `Unhandled mock route ${method} ${url}`);
  };

  vi.stubGlobal('fetch', vi.fn(handler));

  return {
    calls,
    reviewBodies,
    records: () => clone(records),
    failNextList: () => {
      failListOnce = true;
    },
    restore: () => {
      vi.unstubAllGlobals();
    },
  };
}
