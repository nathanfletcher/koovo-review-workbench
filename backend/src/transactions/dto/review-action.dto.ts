import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ReviewAction } from '../../domain/models';
import { MAX_NOTE_LENGTH, REVIEW_ACTIONS } from '../../domain/review-state';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ReviewActionDto {
  @IsIn([...REVIEW_ACTIONS], {
    message: `action must be one of: ${REVIEW_ACTIONS.join(', ')}`,
  })
  action!: ReviewAction;

  /**
   * Optional for MARK_REVIEWED (retained on the audit entry when supplied),
   * required for MARK_NEEDS_CORRECTION (>= 3 trimmed characters, enforced by
   * the domain guardrail). The 500-character upper bound is a payload limit for
   * either action: an oversized note is rejected here with 400 INVALID_REQUEST
   * before any business rule runs.
   */
  @IsOptional()
  @IsString({ message: 'note must be a string' })
  @MaxLength(MAX_NOTE_LENGTH, {
    message: `note must be ${MAX_NOTE_LENGTH} characters or fewer`,
  })
  note?: string;

  /** The reviewer stamped on the audit entry: 1–64 characters once trimmed. */
  @Transform(trim)
  @IsString({ message: 'reviewerId is required and must be a string' })
  @IsNotEmpty({ message: 'reviewerId must not be empty' })
  @MaxLength(64, { message: 'reviewerId must be 64 characters or fewer' })
  reviewerId!: string;

  /** Optional display name; a blank value falls back to `reviewerId`. */
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'reviewerName must be a string' })
  @MaxLength(120, { message: 'reviewerName must be 120 characters or fewer' })
  reviewerName?: string;
}
