import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { apiError, defaultCodeForStatus } from './api-error';
import type { ApiErrorBody } from '../domain/models';

/**
 * Every error leaves the API in one shape: { statusCode, code, message }.
 * Nest's default filter leaks `error: "Bad Request"` and array messages, which
 * forces the client to guess.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      response.status(statusCode).json(this.normalize(statusCode, exception.getResponse()));
      return;
    }

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(apiError(500, 'INTERNAL_ERROR', 'Unexpected server error.'));
  }

  private normalize(statusCode: number, payload: string | object): ApiErrorBody {
    if (typeof payload === 'string') {
      return apiError(statusCode, defaultCodeForStatus(statusCode), payload);
    }

    const record = payload as Record<string, unknown>;
    const code = typeof record.code === 'string' ? record.code : defaultCodeForStatus(statusCode);

    const rawMessage = record.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.map((entry) => String(entry)).join('; ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : 'Request failed.';

    return apiError(statusCode, code, message);
  }
}
