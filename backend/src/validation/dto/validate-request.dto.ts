import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { AccountingSource, SourceStatus, TransactionType } from '../../domain/models';
import { ACCOUNTING_SOURCES, SOURCE_STATUSES, TRANSACTION_TYPES } from '../../domain/models';

export type ValidationContext = 'isolated' | 'dataset';

export const VALIDATION_CONTEXTS: readonly ValidationContext[] = ['isolated', 'dataset'];
export const MAX_VALIDATE_RECORDS = 50;

/**
 * One candidate record. `id` is optional (the service assigns `INPUT-n`) so an
 * interviewer can paste a payload without inventing identifiers.
 *
 * Amounts accept strings or numbers; numbers are stringified first and then
 * parsed by the same strict grammar, so nothing reaches the engine as a float.
 * An empty string or `"-"` means "missing", which is data, not a request error.
 */
export class RawRecordDto {
  @IsOptional()
  @IsString({ message: 'id must be a string' })
  @MaxLength(32, { message: 'id must be 32 characters or fewer' })
  id?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'clientId is required' })
  @IsNotEmpty({ message: 'clientId must not be empty' })
  @MaxLength(32, { message: 'clientId must be 32 characters or fewer' })
  clientId!: string;

  @IsIn([...ACCOUNTING_SOURCES], {
    message: `source must be one of: ${ACCOUNTING_SOURCES.join(', ')}`,
  })
  source!: AccountingSource;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'sourceId is required' })
  @IsNotEmpty({ message: 'sourceId must not be empty' })
  @MaxLength(64, { message: 'sourceId must be 64 characters or fewer' })
  sourceId!: string;

  @IsIn([...TRANSACTION_TYPES], {
    message: `type must be one of: ${TRANSACTION_TYPES.join(', ')}`,
  })
  type!: TransactionType;

  @IsIn([...SOURCE_STATUSES], {
    message: `sourceStatus must be one of: ${SOURCE_STATUSES.join(', ')}`,
  })
  sourceStatus!: SourceStatus;

  @IsOptional()
  @IsString({ message: 'supplier must be a string, null, or "-"' })
  @MaxLength(120, { message: 'supplier must be 120 characters or fewer' })
  supplier?: string | null;

  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsString({ message: 'subtotal must be a decimal string such as "100.00"' })
  subtotal!: string;

  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsString({ message: 'vat must be a decimal string such as "20.00"' })
  vat!: string;

  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsString({ message: 'total must be a decimal string such as "120.00"' })
  total!: string;
}

export class ValidateRequestDto {
  @IsArray({ message: 'records must be an array of candidate records' })
  @ArrayMinSize(1, { message: 'records must contain at least one record' })
  @ArrayMaxSize(MAX_VALIDATE_RECORDS, {
    message: `records must contain at most ${MAX_VALIDATE_RECORDS} records`,
  })
  @ValidateNested({ each: true })
  @Type(() => RawRecordDto)
  records!: RawRecordDto[];

  @IsOptional()
  @IsIn([...VALIDATION_CONTEXTS], {
    message: `context must be one of: ${VALIDATION_CONTEXTS.join(', ')}`,
  })
  context?: ValidationContext;
}
