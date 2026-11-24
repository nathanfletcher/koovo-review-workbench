import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ReviewAction } from '../../domain/models';
import { REVIEW_ACTIONS } from '../../domain/review-state';

export class ReviewActionDto {
  @IsIn([...REVIEW_ACTIONS], {
    message: `action must be one of: ${REVIEW_ACTIONS.join(', ')}`,
  })
  action!: ReviewAction;

  /** Optional for MARK_REVIEWED, required (>= 3 trimmed characters) for MARK_NEEDS_CORRECTION. */
  @IsOptional()
  @IsString({ message: 'note must be a string' })
  @MaxLength(500, { message: 'note must be 500 characters or fewer' })
  note?: string;

  @IsString({ message: 'reviewerId is required and must be a string' })
  @MaxLength(64, { message: 'reviewerId must be 64 characters or fewer' })
  reviewerId!: string;

  @IsOptional()
  @IsString({ message: 'reviewerName must be a string' })
  @MaxLength(120, { message: 'reviewerName must be 120 characters or fewer' })
  reviewerName?: string;
}
