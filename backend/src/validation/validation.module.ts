import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { ValidateController } from './validate.controller';
import { ValidateService } from './validate.service';

@Module({
  // Reuses the read-only view of the dataset for `context: "dataset"`.
  imports: [TransactionsModule],
  controllers: [ValidateController],
  providers: [ValidateService],
})
export class ValidationModule {}
