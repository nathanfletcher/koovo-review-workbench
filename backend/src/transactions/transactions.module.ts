import { Module } from '@nestjs/common';
import { WorkbenchRepository } from '../repositories/workbench.repository';
import { AuditLogController, TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  controllers: [TransactionsController, AuditLogController],
  providers: [WorkbenchRepository, TransactionsService],
  exports: [WorkbenchRepository, TransactionsService],
})
export class TransactionsModule {}
