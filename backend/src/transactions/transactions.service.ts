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
  ReviewAuditEntry,
  TransactionListResponse,
} from '../domain/models';
import type { ReviewTransitionFailure } from '../domain/review-state';
import { planReviewTransition } from '../domain/review-state';
import { listClients, summarize } from '../domain/validation-engine';
import { WorkbenchRepository, StaleReviewWriteError } from '../repositories/workbench.repository';
import type { ReviewMutation } from '../repositories/workbench.repository';
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

    const reviewerId = dto.reviewerId.trim();

    const mutation = {
      recordId,
      action: dto.action,
      previousReviewStatus: record.reviewStatus,
      newReviewStatus: decision.targetStatus,
      note: decision.note,
      reviewerId,
      // A blank display name must not produce a blank audit entry.
      reviewerName: dto.reviewerName?.trim() || reviewerId,
      timestamp: this.clock.now().toISOString(),
    };

    const { record: updated, auditEntry } = this.applyReview(mutation);

    return {
      record: updated,
      auditEntry,
      summary: summarize(this.repository.findAll()),
    };
  }

  /**
   * The repository refuses a write planned against a stale snapshot. In
   * PostgreSQL that is a conditional UPDATE ... WHERE review_status = $previous
   * returning zero rows (see WorkbenchRepository.applyReview); here it can only
   * happen if the service is ever made concurrent, but it is mapped to the same
   * 409 so callers see one contract either way.
   */
  private applyReview(mutation: ReviewMutation): { record: EvaluatedTransaction; auditEntry: ReviewAuditEntry } {
    try {
      return this.repository.applyReview(mutation);
    } catch (error) {
      if (error instanceof StaleReviewWriteError) {
        throw new ConflictException(
          apiError(409, ErrorCode.CONCURRENT_REVIEW_CONFLICT, error.message),
        );
      }
      throw error;
    }
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
