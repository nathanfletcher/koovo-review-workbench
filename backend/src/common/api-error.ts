import type { ApiErrorBody } from '../domain/models';

/** Stable, documented error codes so the client never has to parse prose. */
export const ErrorCode = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  NOTE_REQUIRED: 'NOTE_REQUIRED',
  EXCLUDED_RECORD: 'EXCLUDED_RECORD',
  UNRESOLVED_VALIDATION_ISSUES: 'UNRESOLVED_VALIDATION_ISSUES',
  ALREADY_IN_STATE: 'ALREADY_IN_STATE',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export function apiError(statusCode: number, code: string, message: string): ApiErrorBody {
  return { statusCode, code, message };
}

export function defaultCodeForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return ErrorCode.INVALID_REQUEST;
    case 404:
      return ErrorCode.ROUTE_NOT_FOUND;
    case 409:
      return ErrorCode.ALREADY_IN_STATE;
    case 422:
      return ErrorCode.UNRESOLVED_VALIDATION_ISSUES;
    default:
      return ErrorCode.INTERNAL_ERROR;
  }
}
