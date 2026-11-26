import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ReviewStatus, ValidationStatus } from '../../domain/models';
import { REVIEW_STATUSES, VALIDATION_STATUSES } from '../../domain/models';

/**
 * Filter values are identifiers, not free text: a blank value is a client bug,
 * not a request to filter on `""`. Every blank/whitespace-only value therefore
 * returns `400 INVALID_REQUEST` naming the field instead of silently returning
 * an empty list.
 */
export class TransactionQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'clientId must be a string' })
  @IsNotEmpty({ message: 'clientId must not be empty' })
  @MaxLength(32, { message: 'clientId must be 32 characters or fewer' })
  clientId?: string;

  @IsOptional()
  @IsIn([...VALIDATION_STATUSES], {
    message: `validationStatus must be one of: ${VALIDATION_STATUSES.join(', ')}`,
  })
  validationStatus?: ValidationStatus;

  @IsOptional()
  @IsIn([...REVIEW_STATUSES], {
    message: `reviewStatus must be one of: ${REVIEW_STATUSES.join(', ')}`,
  })
  reviewStatus?: ReviewStatus;
}
