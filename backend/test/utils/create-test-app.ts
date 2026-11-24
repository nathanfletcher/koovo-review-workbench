import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/common/clock';
import type { Clock } from '../../src/common/clock';
import { configureApp } from '../../src/configure-app';
import { WorkbenchRepository } from '../../src/repositories/workbench.repository';

/** Fixed timestamp so audit-log assertions are exact, not `expect.any(String)`. */
export const FIXED_NOW = '2026-11-24T10:15:30.000Z';

export class FixedClock implements Clock {
  now(): Date {
    return new Date(FIXED_NOW);
  }
}

export interface TestContext {
  app: INestApplication;
  server: Server;
  repository: WorkbenchRepository;
}

/**
 * Boots the real application (same modules, pipe, filter and prefix as main.ts)
 * in-process, so no port is bound and tests cannot collide.
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useClass(FixedClock)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();

  const server: Server = app.getHttpServer();

  return {
    app,
    server,
    repository: app.get(WorkbenchRepository),
  };
}
