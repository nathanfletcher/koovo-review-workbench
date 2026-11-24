import type { ReactElement } from 'react';
import { FilterBar } from './components/FilterBar';
import { RecordDetailDrawer } from './components/RecordDetailDrawer';
import { RecordsTable } from './components/RecordsTable';
import { SummaryCards } from './components/SummaryCards';
import { ValidationSandbox } from './components/ValidationSandbox';
import { useWorkbench } from './hooks/useWorkbench';

export default function App(): ReactElement {
  const workbench = useWorkbench();

  return (
    <div className="app">
      <header className="app__header">
        <h1>Accounting Data Review Workbench</h1>
        <p className="muted">
          Xero and Sage records for clients C01 and C02. Validation is computed by the API; review
          state is tracked separately.
        </p>
      </header>

      <SummaryCards summary={workbench.summary} />

      <FilterBar
        clients={workbench.clients}
        filters={workbench.filters}
        onChange={workbench.setFilters}
        onReset={workbench.resetFilters}
      />

      {workbench.error && (
        <div className="callout callout--error" role="alert" data-testid="load-error">
          <p>{workbench.error}</p>
          <button type="button" className="button" onClick={workbench.reload}>
            Retry
          </button>
        </div>
      )}

      {workbench.loading && workbench.summary === null ? (
        <p className="loading" role="status">
          Loading records…
        </p>
      ) : (
        <RecordsTable
          records={workbench.records}
          loading={workbench.loading}
          onSelect={workbench.openRecord}
          onResetFilters={workbench.resetFilters}
        />
      )}

      {workbench.selected && (
        <RecordDetailDrawer
          record={workbench.selected}
          onClose={workbench.closeRecord}
          onReview={workbench.review}
          busy={workbench.reviewBusy}
          error={workbench.reviewError}
        />
      )}

      <ValidationSandbox />
    </div>
  );
}
