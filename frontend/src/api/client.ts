import type {
  ApiErrorBody,
  EvaluatedTransaction,
  ReviewActionResponse,
  ReviewRequest,
  TransactionFilters,
  TransactionListResponse,
} from '../types/workbench';

const BASE_PATH = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseErrorBody(response: Response): Promise<{ code: string; message: string }> {
  const fallback = {
    code: 'HTTP_ERROR',
    message: `Request failed with status ${response.status}.`,
  };

  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    return {
      code: typeof body.code === 'string' ? body.code : fallback.code,
      message: typeof body.message === 'string' ? body.message : fallback.message,
    };
  } catch {
    return fallback;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_PATH}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    // A dead backend must surface as a readable message, never a silent spinner.
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the review API. Is the backend running on http://localhost:3001?',
    );
  }

  if (!response.ok) {
    const { code, message } = await parseErrorBody(response);
    throw new ApiError(response.status, code, message);
  }

  return (await response.json()) as T;
}

export function buildTransactionsQuery(filters: TransactionFilters): string {
  const params = new URLSearchParams();

  if (filters.clientId) {
    params.set('clientId', filters.clientId);
  }
  if (filters.validationStatus) {
    params.set('validationStatus', filters.validationStatus);
  }
  if (filters.reviewStatus) {
    params.set('reviewStatus', filters.reviewStatus);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export const api = {
  listTransactions(filters: TransactionFilters = {}): Promise<TransactionListResponse> {
    return requestJson<TransactionListResponse>(
      `/transactions${buildTransactionsQuery(filters)}`,
    );
  },

  getTransaction(recordId: string): Promise<EvaluatedTransaction> {
    return requestJson<EvaluatedTransaction>(`/transactions/${encodeURIComponent(recordId)}`);
  },

  reviewTransaction(recordId: string, request: ReviewRequest): Promise<ReviewActionResponse> {
    return requestJson<ReviewActionResponse>(
      `/transactions/${encodeURIComponent(recordId)}/review`,
      { method: 'POST', body: JSON.stringify(request) },
    );
  },
};
