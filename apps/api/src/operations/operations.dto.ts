import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import {
  ProductCondition,
  ProductDocumentType,
  RepairPartSource,
  RepairStatus,
} from "@prisma/client";

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const QUANTITY = /^\d{1,10}(\.\d{1,3})?$/;

export class CreateCustomerDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
}

export class CreateProductDto {
  @IsString() @MinLength(2) sku!: string;
  @IsString() @MinLength(2) name!: string;
  @Matches(MONEY) salePrice!: string;
  @Matches(MONEY) averageCost!: string;
  @Matches(QUANTITY) stock!: string;
  @Matches(QUANTITY) minimumStock!: string;
  @IsOptional() @IsEnum(ProductDocumentType) documentType?: ProductDocumentType;
  @IsOptional() @IsEnum(ProductCondition) condition?: ProductCondition;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) warrantyDays?: number;
}

export class OpenCashDto {
  @IsString() registerId!: string;
  @Matches(MONEY) openingBalance!: string;
}

export class CloseCashDto {
  @Matches(MONEY) countedCash!: string;
  @IsOptional() @IsString() note?: string;
}

export class PaymentInputDto {
  @IsString() methodId!: string;
  @Matches(MONEY) amount!: string;
  @IsString() @MinLength(8) idempotencyKey!: string;
}

export class RegisterPaymentDto extends PaymentInputDto {}

export class SaleItemInputDto {
  @IsString() productId!: string;
  @Matches(QUANTITY) quantity!: string;
  @Matches(MONEY) unitPrice!: string;
  @IsOptional() @IsString() serial?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() capacity?: string;
  @IsOptional() @IsString() specifications?: string;
}

export class CreateSaleDto {
  @IsOptional() @IsString() customerId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items!: SaleItemInputDto[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentInputDto)
  payments!: PaymentInputDto[];
  @IsOptional() @Matches(MONEY) discount?: string;
}

export class CreateRepairDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() technicianId?: string;
  @IsString() deviceType!: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serial?: string;
  @IsString() @MinLength(3) reportedProblem!: string;
  @IsOptional() @IsString() physicalCondition?: string;
  @IsOptional() @IsObject() conditionChecklist?: Record<
    string,
    string | boolean
  >;
  @IsOptional() @IsString() accessories?: string;
  @IsOptional() @IsString() serviceRequested?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
}

export class UpdateRepairDto {
  @IsEnum(RepairStatus) status!: RepairStatus;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() diagnosis?: string;
  @IsOptional() @IsString() workPerformed?: string;
  @IsOptional() @Matches(MONEY) estimatedPrice?: string;
}

export class RepairPartInputDto {
  @IsOptional() @IsEnum(RepairPartSource) source?: RepairPartSource;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() @MinLength(2) description?: string;
  @Matches(QUANTITY) quantity!: string;
  @IsOptional() @Matches(MONEY) unitCost?: string;
  @IsOptional() @Matches(MONEY) unitPrice?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsBoolean() costAlreadyRecorded?: boolean;
}

export class CompleteRepairDto {
  @IsOptional() @Matches(MONEY) finalPrice?: string;
  @IsOptional() @Matches(MONEY) laborPrice?: string;
  @IsString() @MinLength(3) workPerformed!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RepairPartInputDto)
  parts!: RepairPartInputDto[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentInputDto)
  payments!: PaymentInputDto[];
  @IsOptional() @Matches(MONEY) commissionPercentage?: string;
}

export class CreateExpenseDto {
  @IsString() categoryId!: string;
  @IsString() @MinLength(3) concept!: string;
  @Matches(MONEY) amount!: string;
  @IsString() methodId!: string;
}

export class DateRangeDto {
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
}
