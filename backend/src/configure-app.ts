import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { INestApplication, ValidationPipeOptions } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { ErrorCode, apiError } from './common/api-error';

function describeValidationErrors(errors: ValidationError[], parent = ''): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;

    for (const constraint of Object.values(error.constraints ?? {})) {
      messages.push(`${path}: ${constraint}`);
    }

    if (error.children && error.children.length > 0) {
      messages.push(...describeValidationErrors(error.children, path));
    }
  }

  return messages;
}

const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  // Reject unknown properties and unknown enum values with 400 INVALID_REQUEST
  // instead of Nest's default body shape.
  exceptionFactory: (errors: ValidationError[]) =>
    new BadRequestException(
      apiError(400, ErrorCode.INVALID_REQUEST, describeValidationErrors(errors).join('; ')),
    ),
};

/**
 * Shared by main.ts and the integration tests, so the tests exercise exactly the
 * pipeline the application runs (prefix, CORS, validation, error shape).
 */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: [/^http:\/\/localhost:5173$/, /^http:\/\/127\.0\.0\.1:5173$/],
    methods: ['GET', 'POST', 'OPTIONS'],
  });
  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
