import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import type {
  AuditLogResponse,
  EvaluatedTransaction,
  ReviewActionResponse,
  TransactionListResponse,
} from '../domain/models';
import { ReviewActionDto } from './dto/review-action.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(@Query() query: TransactionQueryDto): TransactionListResponse {
    return this.transactions.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): EvaluatedTransaction {
    return this.transactions.getById(id);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  review(@Param('id') id: string, @Body() dto: ReviewActionDto): ReviewActionResponse {
    return this.transactions.review(id, dto);
  }
}

@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(): AuditLogResponse {
    return this.transactions.auditLog();
  }
}
