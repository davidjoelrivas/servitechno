import { Transform } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const PERCENT = /^\d{1,3}(\.\d{1,4})?$/;
const roles = ["ADMIN", "TECHNICIAN", "SELLER"];

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @IsArray() @ArrayMinSize(1) @IsIn(roles, { each: true }) roleNames!: string[];
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MaxLength(80) position?: string;
  @IsOptional() @Matches(MONEY) baseSalary?: string;
  @IsOptional() @Matches(PERCENT) commissionPercentage?: string;
  @IsOptional()
  @IsIn(["CONTRIBUTION_MARGIN", "LABOR"])
  commissionBasis?: string;
  @IsOptional() @IsString() @MaxLength(300) commissionNote?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissionCodes?: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(roles, { each: true })
  roleNames?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MaxLength(80) position?: string;
  @IsOptional() @Matches(MONEY) baseSalary?: string;
  @IsOptional() @Matches(PERCENT) commissionPercentage?: string;
  @IsOptional()
  @IsIn(["CONTRIBUTION_MARGIN", "LABOR"])
  commissionBasis?: string;
  @IsOptional() @IsString() @MaxLength(300) commissionNote?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissionCodes?: string[];
}

export class ResetPasswordDto {
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

export class UserFiltersDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(roles) role?: string;
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  active?: boolean;
}
