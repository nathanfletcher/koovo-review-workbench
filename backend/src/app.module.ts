import { Module } from '@nestjs/common';
import { ClockModule } from './common/clock.module';
import { HealthController } from './health/health.controller';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [ClockModule, TransactionsModule],
  controllers: [HealthController],
})
export class AppModule {}
