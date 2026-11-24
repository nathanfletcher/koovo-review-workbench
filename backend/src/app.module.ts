import { Module } from '@nestjs/common';
import { ClockModule } from './common/clock.module';
import { HealthController } from './health/health.controller';
import { TransactionsModule } from './transactions/transactions.module';
import { ValidationModule } from './validation/validation.module';

@Module({
  imports: [ClockModule, TransactionsModule, ValidationModule],
  controllers: [HealthController],
})
export class AppModule {}
