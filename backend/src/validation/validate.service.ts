import { Injectable } from '@nestjs/common';
import type { EvaluatedTransaction, RawAccountingRecord, ValidateResponse } from '../domain/models';
import { evaluateRecords, summarize } from '../domain/validation-engine';
import { WorkbenchRepository } from '../repositories/workbench.repository';
import type { ValidateRequestDto, ValidationContext } from './dto/validate-request.dto';

const DEFAULT_CONTEXT: ValidationContext = 'isolated';

function toRawRecord(record: EvaluatedTransaction): RawAccountingRecord {
  return {
    id: record.id,
    clientId: record.clientId,
    source: record.source,
    sourceId: record.sourceId,
    type: record.type,
    sourceStatus: record.sourceStatus,
    supplier: record.supplier,
    subtotal: record.subtotal,
    vat: record.vat,
    total: record.total,
  };
}

/**
 * Dry run: answers "what would the rules say about this payload?" without
 * touching the review dataset. Nothing is written, no audit entry is produced,
 * and the caller's records never appear in GET /api/transactions.
 *
 * `context: "dataset"` puts the current records in front of the payload so
 * duplicate detection sees the real identities; `context: "isolated"` (default)
 * evaluates the payload only against itself.
 */
@Injectable()
export class ValidateService {
  constructor(private readonly repository: WorkbenchRepository) {}

  validate(request: ValidateRequestDto): ValidateResponse {
    const context = request.context ?? DEFAULT_CONTEXT;

    const inputs: RawAccountingRecord[] = request.records.map((record, index) => ({
      id: record.id?.trim() || `INPUT-${index + 1}`,
      clientId: record.clientId,
      source: record.source,
      sourceId: record.sourceId,
      type: record.type,
      sourceStatus: record.sourceStatus,
      supplier: record.supplier ?? null,
      subtotal: record.subtotal,
      vat: record.vat,
      total: record.total,
    }));

    const baseline =
      context === 'dataset' ? this.repository.findAll().map((record) => toRawRecord(record)) : [];

    const evaluated = evaluateRecords([...baseline, ...inputs]);
    const records = evaluated.slice(baseline.length);

    return {
      context,
      persisted: false,
      count: records.length,
      summary: summarize(records),
      records,
    };
  }
}
