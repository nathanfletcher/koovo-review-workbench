import { Global, Module } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { CLOCK, SystemClock } from './clock';

export const CLOCK_PROVIDER: Provider = { provide: CLOCK, useClass: SystemClock };

/** Global so every feature module can inject the clock without re-providing it. */
@Global()
@Module({
  providers: [CLOCK_PROVIDER],
  exports: [CLOCK],
})
export class ClockModule {}
