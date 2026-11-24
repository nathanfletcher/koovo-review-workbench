import { Injectable } from '@nestjs/common';

/**
 * Injected so timestamps are deterministic in tests and the audit log is
 * reproducible. Nothing in the domain calls `new Date()` directly.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
