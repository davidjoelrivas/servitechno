import { IsOptional, IsString, Matches, MinLength } from "class-validator";

export class PayCommissionDto {
  @IsString() methodId!: string;
  @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount!: string;
  @IsString() @MinLength(8) idempotencyKey!: string;
  @IsOptional() @IsString() note?: string;
}

