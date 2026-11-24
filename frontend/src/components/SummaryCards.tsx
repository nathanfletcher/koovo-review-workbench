import type { ReactElement } from 'react';
import type { ValidationSummary } from '../types/workbench';

interface SummaryCardsProps {
  summary: ValidationSummary | null;
}

function display(value: number | undefined): string {
  return value === undefined ? '—' : String(value);
}

export function SummaryCards({ summary }: SummaryCardsProps): ReactElement {
  return (
    <section className="summary" aria-label="Validation summary">
      <article className="card card--total">
        <span className="card__label">Total records</span>
        <span className="card__value" data-testid="summary-total">
          {display(summary?.total)}
        </span>
      </article>

      <article className="card card--valid">
        <span className="card__label">Valid</span>
        <span className="card__value" data-testid="summary-valid">
          {display(summary?.valid)}
        </span>
      </article>

      <article className="card card--attention">
        <span className="card__label">Needs Attention</span>
        <span className="card__value" data-testid="summary-needs-attention">
          {display(summary?.needsAttention)}
        </span>
      </article>

      <article className="card card--excluded">
        <span className="card__label">Excluded</span>
        <span className="card__value" data-testid="summary-excluded">
          {display(summary?.excluded)}
        </span>
      </article>

      <article className="card card--review">
        <span className="card__label">Review progress</span>
        <span className="card__detail">
          <span data-testid="summary-reviewed">{display(summary?.reviewBreakdown.reviewed)}</span>{' '}
          reviewed ·{' '}
          <span data-testid="summary-needs-correction">
            {display(summary?.reviewBreakdown.needsCorrection)}
          </span>{' '}
          needs correction ·{' '}
          <span data-testid="summary-unreviewed">
            {display(summary?.reviewBreakdown.unreviewed)}
          </span>{' '}
          unreviewed
        </span>
      </article>
    </section>
  );
}
