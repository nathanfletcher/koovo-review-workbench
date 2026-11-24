import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { ValidateResponse } from '../domain/models';
import { ValidateRequestDto } from './dto/validate-request.dto';
import { ValidateService } from './validate.service';

@Controller('validate')
export class ValidateController {
  constructor(private readonly validator: ValidateService) {}

  /** Dry run. Returns validation results only — never persists anything. */
  @Post()
  @HttpCode(HttpStatus.OK)
  validate(@Body() dto: ValidateRequestDto): ValidateResponse {
    return this.validator.validate(dto);
  }
}
