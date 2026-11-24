import type { ReviewStatus, ValidationStatus } from '../types/workbench';

/** Badge tone for a validation status — one mapping, used by the table and the sandbox. */
export const VALIDATION_TONE: Record<ValidationStatus, string> = {
  Valid: 'valid',
  'Needs Attention': 'attention',
  Excluded: 'excluded',
};

/** Badge tone for a review state. */
export const REVIEW_TONE: Record<ReviewStatus, string> = {
  Unreviewed: 'neutral',
  Reviewed: 'reviewed',
  'Needs Correction': 'correction',
};
