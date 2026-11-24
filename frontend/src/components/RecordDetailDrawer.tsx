import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { REVIEWER } from '../config/reviewer';
import type { EvaluatedTransaction, ReviewAction } from '../types/workbench';
import { formatGbp } from '../utils/format';
import { AuditHistoryList } from './AuditHistoryList';

export const MIN_NOTE_LENGTH = 3;

interface RecordDetailDrawerProps {
  record: EvaluatedTransaction;
  onClose: () => void;
  onReview: (action: ReviewAction, note?: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
}

export function RecordDetailDrawer({
  record,
  onClose,
  onReview,
  busy,
  error,
}: RecordDetailDrawerProps): ReactElement {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [record.id]);

  useEffect(() => {
    setNote('');
  }, [record.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isExcluded = record.validationStatus === 'Excluded';
  const isNeedsAttention = record.validationStatus === 'Needs Attention';
  const isReviewed = record.reviewStatus === 'Reviewed';
  const isNeedsCorrection = record.reviewStatus === 'Needs Correction';

  const reviewedBlockedReason = isExcluded
    ? 'Excluded (Draft/Void) records allow no review actions.'
    : isNeedsAttention
      ? `Resolve the ${record.issues.length} validation ${record.issues.length === 1 ? 'issue' : 'issues'} before marking this record Reviewed.`
      : isReviewed
        ? 'This record is already marked as Reviewed.'
        : null;

  const correctionBlockedReason = isExcluded
    ? 'Excluded (Draft/Void) records allow no review actions.'
    : isNeedsCorrection
      ? 'This record is already marked as Needs Correction.'
      : null;

  const trimmedNote = note.trim();
  const noteIsValid = trimmedNote.length >= MIN_NOTE_LENGTH;
  const correctionDisabled = correctionBlockedReason !== null || busy;

  const submitCorrection = async (): Promise<void> => {
    const succeeded = await onReview('MARK_NEEDS_CORRECTION', trimmedNote);
    if (succeeded) {
      setNote('');
    }
  };

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="drawer__header">
          <div>
            <h2 id="drawer-title">Record {record.id}</h2>
            <p className="muted">
              {record.clientId} · {record.source} · {record.sourceId} · {record.type} ·{' '}
              {record.sourceStatus}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="button button--icon"
            onClick={onClose}
            aria-label="Close details"
          >
            ✕
          </button>
        </header>

        <div className="drawer__body">
          <section className="panel">
            <h3>Amounts</h3>
            <dl className="fields">
              <dt>Subtotal</dt>
              <dd data-testid="detail-subtotal">{formatGbp(record.subtotal)}</dd>
              <dt>VAT</dt>
              <dd data-testid="detail-vat">{formatGbp(record.vat)}</dd>
              <dt>Total</dt>
              <dd data-testid="detail-total">{formatGbp(record.total)}</dd>
              <dt>Supplier</dt>
              <dd>{record.supplier ?? <span className="badge badge--missing">Missing</span>}</dd>
            </dl>
          </section>

          <section className="panel">
            <h3>Transaction identity</h3>
            <dl className="fields">
              <dt>Composite key</dt>
              <dd>
                <code data-testid="detail-transaction-key">{record.transactionKey}</code>
              </dd>
              <dt>Repeated source transaction</dt>
              <dd data-testid="detail-duplicate">
                {record.isDuplicate
                  ? `Yes — ${record.duplicateKind} copy of ${record.duplicateOfRecordId}`
                  : 'No'}
              </dd>
              <dt>Counted for reporting</dt>
              <dd data-testid="detail-reporting">{record.processedForReporting ? 'Yes' : 'No'}</dd>
              <dt>Validation status</dt>
              <dd>{record.validationStatus}</dd>
              <dt>Review state</dt>
              <dd>{record.reviewStatus}</dd>
            </dl>
          </section>

          <section className="panel">
            <h3>Validation issues</h3>
            {record.issues.length === 0 ? (
              <p className="muted" data-testid="no-issues">
                No issues found under the supplied rules.
              </p>
            ) : (
              <ul className="issues" data-testid="issue-list">
                {record.issues.map((issue) => (
                  <li key={`${issue.code}-${issue.field}`} className="issues__item">
                    <span className="badge badge--code">{issue.code}</span>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h3>Review</h3>
            <p className="muted">Reviewing as {REVIEWER.label}</p>

            {isExcluded && (
              <p className="callout callout--warning" data-testid="excluded-notice">
                This record has source status {record.sourceStatus} and is excluded from review.
                It still counts in the summary totals.
              </p>
            )}

            <div className="actions">
              <button
                type="button"
                className="button button--primary"
                data-testid="mark-reviewed"
                disabled={reviewedBlockedReason !== null || busy}
                title={reviewedBlockedReason ?? 'Mark this valid record as reviewed'}
                onClick={() => void onReview('MARK_REVIEWED')}
              >
                Mark as Reviewed
              </button>
              <span className="hint" data-testid="reviewed-reason">
                {reviewedBlockedReason ?? 'Allowed: this record passed every validation rule.'}
              </span>
            </div>

            <form
              className="correction"
              onSubmit={(event) => {
                event.preventDefault();
                void submitCorrection();
              }}
            >
              <label htmlFor="correction-note">Correction note</label>
              <textarea
                id="correction-note"
                value={note}
                rows={3}
                disabled={isExcluded}
                onChange={(event) => setNote(event.target.value)}
                aria-describedby="correction-note-help"
                placeholder="What needs to change, and who will fix it?"
              />
              <p id="correction-note-help" className="hint">
                At least {MIN_NOTE_LENGTH} characters (max 500). Required when marking Needs
                Correction.
              </p>
              <div className="actions">
                <button
                  type="submit"
                  className="button"
                  data-testid="mark-needs-correction"
                  disabled={correctionDisabled || !noteIsValid}
                  title={correctionBlockedReason ?? 'Send this record back for correction'}
                >
                  Mark as Needs Correction
                </button>
                <span className="hint" data-testid="correction-reason">
                  {correctionBlockedReason ??
                    (noteIsValid
                      ? 'Entered note will be recorded in the activity history.'
                      : `Type at least ${MIN_NOTE_LENGTH} characters to enable this action.`)}
                </span>
              </div>
            </form>

            {error && (
              <p className="callout callout--error" role="alert" data-testid="review-error">
                {error}
              </p>
            )}
          </section>

          <section className="panel">
            <h3>Activity history</h3>
            <AuditHistoryList entries={record.auditHistory} />
          </section>
        </div>
      </aside>
    </div>
  );
}
