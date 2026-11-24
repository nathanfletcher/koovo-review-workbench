import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';
import { REVIEWER } from '../config/reviewer';
import type {
  EvaluatedTransaction,
  ReviewAction,
  TransactionFilters,
  TransactionListResponse,
  ValidationSummary,
} from '../types/workbench';

export interface WorkbenchController {
  records: EvaluatedTransaction[];
  summary: ValidationSummary | null;
  clients: string[];
  loading: boolean;
  error: string | null;
  filters: TransactionFilters;
  setFilters: (next: TransactionFilters) => void;
  resetFilters: () => void;
  reload: () => void;
  selected: EvaluatedTransaction | null;
  openRecord: (record: EvaluatedTransaction) => void;
  closeRecord: () => void;
  review: (action: ReviewAction, note?: string) => Promise<boolean>;
  reviewBusy: boolean;
  reviewError: string | null;
  clearReviewError: () => void;
}

function describeError(cause: unknown): string {
  if (cause instanceof ApiError) {
    return cause.message;
  }
  return cause instanceof Error ? cause.message : 'Unexpected error.';
}

/**
 * All server state lives here: filters are applied by the API (not in the
 * browser), and every review action refreshes the summary from the server so the
 * numbers on screen are never optimistic guesses.
 */
export function useWorkbench(): WorkbenchController {
  const [filters, setFiltersState] = useState<TransactionFilters>({});
  const [data, setData] = useState<TransactionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EvaluatedTransaction | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    api
      .listTransactions(filters)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setData(response);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(describeError(cause));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters, reloadToken]);

  const setFilters = useCallback((next: TransactionFilters) => {
    setFiltersState(next);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState({});
  }, []);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const openRecord = useCallback((record: EvaluatedTransaction) => {
    setReviewError(null);
    setSelected(record);
  }, []);

  const closeRecord = useCallback(() => {
    setReviewError(null);
    setSelected(null);
  }, []);

  const review = useCallback(
    async (action: ReviewAction, note?: string): Promise<boolean> => {
      if (!selected) {
        return false;
      }

      setReviewBusy(true);
      setReviewError(null);

      try {
        const response = await api.reviewTransaction(selected.id, {
          action,
          note,
          reviewerId: REVIEWER.id,
          reviewerName: REVIEWER.name,
        });

        setSelected(response.record);

        // Pull the list again so summary counts and filtered rows reflect the server.
        const refreshed = await api.listTransactions(filters);
        setData(refreshed);
        return true;
      } catch (cause) {
        setReviewError(describeError(cause));
        return false;
      } finally {
        setReviewBusy(false);
      }
    },
    [filters, selected],
  );

  const clearReviewError = useCallback(() => setReviewError(null), []);

  return {
    records: data?.records ?? [],
    summary: data?.summary ?? null,
    clients: data?.clients ?? [],
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    reload,
    selected,
    openRecord,
    closeRecord,
    review,
    reviewBusy,
    reviewError,
    clearReviewError,
  };
}
