import type { ReactElement } from 'react';
import type { EvaluatedTransaction, ReviewStatus, ValidationStatus } from '../types/workbench';
import { formatGbp } from '../utils/format';

interface RecordsTableProps {
  records: EvaluatedTransaction[];
  loading: boolean;
  onSelect: (record: EvaluatedTransaction) => void;
  onResetFilters: () => void;
}

const VALIDATION_TONE: Record<ValidationStatus, string> = {
  Valid: 'valid',
  'Needs Attention': 'attention',
  Excluded: 'excluded',
};

const REVIEW_TONE: Record<ReviewStatus, string> = {
  Unreviewed: 'neutral',
  Reviewed: 'reviewed',
  'Needs Correction': 'correction',
};

export function RecordsTable({
  records,
  loading,
  onSelect,
  onResetFilters,
}: RecordsTableProps): ReactElement {
  if (!loading && records.length === 0) {
    return (
      <div className="empty" role="status">
        <p>No records match the current filters.</p>
        <button type="button" className="button button--ghost" onClick={onResetFilters}>
          Reset filters
        </button>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="records" aria-busy={loading}>
        <caption className="sr-only">Accounting records awaiting review</caption>
        <thead>
          <tr>
            <th scope="col">Record</th>
            <th scope="col">Client</th>
            <th scope="col">Source / ID</th>
            <th scope="col">Type</th>
            <th scope="col">Source status</th>
            <th scope="col">Supplier</th>
            <th scope="col" className="numeric">
              Subtotal
            </th>
            <th scope="col" className="numeric">
              VAT
            </th>
            <th scope="col" className="numeric">
              Total
            </th>
            <th scope="col">Validation</th>
            <th scope="col">Review</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} data-testid={`row-${record.id}`}>
              <th scope="row">{record.id}</th>
              <td>{record.clientId}</td>
              <td>
                {record.source} · {record.sourceId}
              </td>
              <td>{record.type}</td>
              <td>{record.sourceStatus}</td>
              <td>
                {record.supplier ?? <span className="badge badge--missing">Missing</span>}
              </td>
              <td className="numeric">{formatGbp(record.subtotal)}</td>
              <td className="numeric">{formatGbp(record.vat)}</td>
              <td className="numeric">{formatGbp(record.total)}</td>
              <td>
                <span className={`badge badge--${VALIDATION_TONE[record.validationStatus]}`}>
                  {record.validationStatus}
                </span>
                {record.issues.length > 0 && (
                  <span className="issue-count">
                    {record.issues.length} {record.issues.length === 1 ? 'issue' : 'issues'}
                  </span>
                )}
              </td>
              <td>
                <span className={`badge badge--${REVIEW_TONE[record.reviewStatus]}`}>
                  {record.reviewStatus}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="button button--link"
                  onClick={() => onSelect(record)}
                  aria-label={`Inspect ${record.id}`}
                >
                  Inspect
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
