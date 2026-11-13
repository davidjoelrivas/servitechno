import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsEmail, IsISO8601, IsOptional, IsString, Matches, MinLength, ValidateNested } from "class-validator";

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const QUANTITY = /^\d{1,10}(\.\d{1,3})?$/;

export class CreateSupplierDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
}

export class UpdateSupplierDto extends CreateSupplierDto {}

export class PurchaseItemDto {
  @IsString() productId!: string;
  @Matches(QUANTITY) quantity!: string;
  @Matches(MONEY) unitCost!: string;
}

export class PurchasePaymentDto {
  @IsString() methodId!: string;
  @Matches(MONEY) amount!: string;
  @IsString() @MinLength(8) idempotencyKey!: string;
}

export class CreatePurchaseDto {
  @IsString() supplierId!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchasePaymentDto)
  payments!: PurchasePaymentDto[];
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() notes?: string;
}

export class PayPurchaseDto extends PurchasePaymentDto {
  @IsOptional() @IsString() note?: string;
}

