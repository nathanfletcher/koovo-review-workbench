import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { HttpException } from '@nestjs/common';
import { CLOCK } from '../common/clock';
import type { Clock } from '../common/clock';
import { ErrorCode, apiError } from '../common/api-error';
import type {
  AuditLogResponse,
  EvaluatedTransaction,
  ReviewActionResponse,
  TransactionListResponse,
} from '../domain/models';
import type { ReviewTransitionFailure } from '../domain/review-state';
import { planReviewTransition } from '../domain/review-state';
import { listClients, summarize } from '../domain/validation-engine';
import { WorkbenchRepository } from '../repositories/workbench.repository';
import { ReviewActionDto } from './dto/review-action.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly repository: WorkbenchRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  list(query: TransactionQueryDto): TransactionListResponse {
    const all = this.repository.findAll();

    const records = all.filter((record) => {
      if (query.clientId !== undefined && record.clientId !== query.clientId) {
        return false;
      }
      if (query.validationStatus !== undefined && record.validationStatus !== query.validationStatus) {
        return false;
      }
      if (query.reviewStatus !== undefined && record.reviewStatus !== query.reviewStatus) {
        return false;
      }
      return true;
    });

    return {
      // Summary and clients always describe the full dataset so the accountant's
      // headline numbers do not move when a filter is applied.
      summary: summarize(all),
      clients: listClients(all),
      records,
    };
  }

  getById(recordId: string): EvaluatedTransaction {
    const record = this.repository.findById(recordId);

    if (!record) {
      throw new NotFoundException(
        apiError(404, ErrorCode.RECORD_NOT_FOUND, `No transaction with id ${recordId}.`),
      );
    }

    return record;
  }

  review(recordId: string, dto: ReviewActionDto): ReviewActionResponse {
    // 404 first, then the guardrails (see PLAN.md 4.5).
    const record = this.getById(recordId);
    const decision = planReviewTransition(record, dto.action, dto.note);

    if (!decision.ok) {
      throw this.toHttpException(decision);
    }

    const mutation = {
      recordId,
      action: dto.action,
      previousReviewStatus: record.reviewStatus,
      newReviewStatus: decision.targetStatus,
      note: decision.note,
      reviewerId: dto.reviewerId.trim(),
      reviewerName: (dto.reviewerName ?? dto.reviewerId).trim(),
      timestamp: this.clock.now().toISOString(),
    };

    const { record: updated, auditEntry } = this.repository.applyReview(mutation);

    return {
      record: updated,
      auditEntry,
      summary: summarize(this.repository.findAll()),
    };
  }

  auditLog(): AuditLogResponse {
    return { entries: this.repository.findAuditLog() };
  }

  private toHttpException(failure: ReviewTransitionFailure): HttpException {
    const body = apiError(failure.httpStatus, failure.code, failure.message);

    switch (failure.code) {
      case 'NOTE_REQUIRED':
        return new BadRequestException(body);
      case 'EXCLUDED_RECORD':
      case 'UNRESOLVED_VALIDATION_ISSUES':
        return new UnprocessableEntityException(body);
      case 'ALREADY_IN_STATE':
        return new ConflictException(body);
    }
  }
}
