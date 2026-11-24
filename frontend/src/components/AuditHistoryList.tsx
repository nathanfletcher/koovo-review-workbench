import type { ReactElement } from 'react';
import type { ReviewAuditEntry, ReviewAction } from '../types/workbench';
import { formatTimestamp } from '../utils/format';

interface AuditHistoryListProps {
  entries: ReviewAuditEntry[];
}

const ACTION_LABEL: Record<ReviewAction, string> = {
  MARK_REVIEWED: 'Marked as Reviewed',
  MARK_NEEDS_CORRECTION: 'Marked as Needs Correction',
};

export function AuditHistoryList({ entries }: AuditHistoryListProps): ReactElement {
  if (entries.length === 0) {
    return (
      <p className="muted" data-testid="audit-empty">
        No review actions yet.
      </p>
    );
  }

  const newestFirst = [...entries].reverse();

  return (
    <ol className="timeline" aria-label="Activity history">
      {newestFirst.map((entry) => (
        <li key={entry.id} className="timeline__item" data-testid={`audit-${entry.id}`}>
          <div className="timeline__head">
            <span className={`badge badge--${entry.action === 'MARK_REVIEWED' ? 'reviewed' : 'correction'}`}>
              {ACTION_LABEL[entry.action]}
            </span>
            <span className="timeline__meta">
              {formatTimestamp(entry.timestamp)} · {entry.reviewerName} ({entry.reviewerId})
            </span>
          </div>
          {entry.note ? <p className="timeline__note">“{entry.note}”</p> : null}
          <span className="timeline__transition">
            {entry.previousReviewStatus} → {entry.newReviewStatus}
          </span>
        </li>
      ))}
    </ol>
  );
}
