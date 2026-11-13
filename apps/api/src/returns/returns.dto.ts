import { SaleReturnType } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, Matches, MinLength, ValidateNested } from "class-validator";

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const QUANTITY = /^\d{1,10}(\.\d{1,3})?$/;

export class ReturnItemDto {
  @IsString() saleItemId!: string;
  @Matches(QUANTITY) quantity!: string;
  @IsBoolean() restock!: boolean;
}

export class RefundPaymentDto {
  @IsString() methodId!: string;
  @Matches(MONEY) amount!: string;
  @IsString() @MinLength(8) idempotencyKey!: string;
}

export class CreateSaleReturnDto {
  @IsEnum(SaleReturnType) type!: SaleReturnType;
  @IsString() @MinLength(3) reason!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => RefundPaymentDto)
  refunds!: RefundPaymentDto[];
  @IsOptional() @IsString() note?: string;
}

