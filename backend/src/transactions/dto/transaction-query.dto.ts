import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ReviewStatus, ValidationStatus } from '../../domain/models';
import { REVIEW_STATUSES, VALIDATION_STATUSES } from '../../domain/models';

export class TransactionQueryDto {
  @IsOptional()
  @IsString({ message: 'clientId must be a string' })
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
