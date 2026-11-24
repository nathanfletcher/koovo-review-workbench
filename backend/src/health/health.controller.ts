import { Controller, Get, Inject } from '@nestjs/common';
import { CLOCK } from '../common/clock';
import type { Clock } from '../common/clock';
import type { HealthResponse } from '../domain/models';

@Controller('health')
export class HealthController {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  @Get()
  check(): HealthResponse {
    return { status: 'ok', timestamp: this.clock.now().toISOString() };
  }
}
