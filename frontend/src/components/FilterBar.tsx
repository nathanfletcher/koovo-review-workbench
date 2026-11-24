import type { ReactElement } from 'react';
import type { ReviewStatus, TransactionFilters, ValidationStatus } from '../types/workbench';
import { REVIEW_STATUSES, VALIDATION_STATUSES } from '../types/workbench';

interface FilterBarProps {
  clients: string[];
  filters: TransactionFilters;
  onChange: (next: TransactionFilters) => void;
  onReset: () => void;
}

function isActive(filters: TransactionFilters): boolean {
  return Boolean(filters.clientId || filters.validationStatus || filters.reviewStatus);
}

export function FilterBar({ clients, filters, onChange, onReset }: FilterBarProps): ReactElement {
  return (
    <section className="filters" aria-label="Filters">
      <div className="field">
        <label htmlFor="client-filter">Client</label>
        <select
          id="client-filter"
          value={filters.clientId ?? ''}
          onChange={(event) =>
            onChange({ ...filters, clientId: event.target.value || undefined })
          }
        >
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client} value={client}>
              {client}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="validation-filter">Validation status</label>
        <select
          id="validation-filter"
          value={filters.validationStatus ?? ''}
          onChange={(event) =>
            onChange({
              ...filters,
              validationStatus: (event.target.value || undefined) as ValidationStatus | undefined,
            })
          }
        >
          <option value="">All statuses</option>
          {VALIDATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="review-filter">Review state</label>
        <select
          id="review-filter"
          value={filters.reviewStatus ?? ''}
          onChange={(event) =>
            onChange({
              ...filters,
              reviewStatus: (event.target.value || undefined) as ReviewStatus | undefined,
            })
          }
        >
          <option value="">All review states</option>
          {REVIEW_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <button type="button" className="button button--ghost" onClick={onReset} disabled={!isActive(filters)}>
        Reset filters
      </button>
    </section>
  );
}
