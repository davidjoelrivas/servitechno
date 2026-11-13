import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/permissions.decorator";
import {
  CloseCashDto,
  CompleteRepairDto,
  CreateCustomerDto,
  CreateExpenseDto,
  CreateProductDto,
  CreateRepairDto,
  CreateSaleDto,
  DateRangeDto,
  OpenCashDto,
  RegisterPaymentDto,
  UpdateRepairDto,
} from "./operations.dto";
import { OperationsService } from "./operations.service";

@ApiBearerAuth()
@ApiTags("operations")
@Controller()
export class OperationsController {
  constructor(private operations: OperationsService) {}
  @Get("settings") getSettings() {
    return this.operations.getSettings();
  }
  @Get("payment-methods") paymentMethods() {
    return this.operations.listPaymentMethods();
  }
  @RequirePermissions("cash.read") @Get("cash-registers") cashRegisters() {
    return this.operations.listCashRegisters();
  }
  @Get("expense-categories") expenseCategories() {
    return this.operations.listExpenseCategories();
  }
  @Get("employees") employees() {
    return this.operations.listEmployees();
  }

  @RequirePermissions("customers.read") @Get("customers") customers() {
    return this.operations.listCustomers();
  }
  @RequirePermissions("customers.create") @Post("customers") createCustomer(
    @Body() dto: CreateCustomerDto,
  ) {
    return this.operations.createCustomer(dto);
  }

  @RequirePermissions("inventory.read") @Get("products") products() {
    return this.operations.listProducts();
  }
  @RequirePermissions("inventory.manage") @Post("products") createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.createProduct(dto, user.sub);
  }

  @RequirePermissions("cash.read") @Get("cash/current") currentCash() {
    return this.operations.currentCash();
  }
  @RequirePermissions("cash.open") @Post("cash/open") openCash(
    @Body() dto: OpenCashDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.openCash(dto, user.sub);
  }
  @RequirePermissions("cash.close") @Post("cash/:id/close") closeCash(
    @Param("id") id: string,
    @Body() dto: CloseCashDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.closeCash(id, dto, user.sub);
  }

  @RequirePermissions("sales.read") @Get("sales") sales(
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.listSales(user);
  }
  @RequirePermissions("sales.create") @Post("sales") createSale(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.createSale(dto, user.sub);
  }
  @RequirePermissions("sales.create") @Post("sales/:id/payments") paySale(
    @Param("id") id: string,
    @Body() dto: RegisterPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.paySale(id, dto, user);
  }

  @RequirePermissions("repairs.read") @Get("repairs") repairs(
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.listRepairs(user);
  }
  @RequirePermissions("repairs.create") @Post("repairs") createRepair(
    @Body() dto: CreateRepairDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.createRepair(dto, user.sub);
  }
  @RequirePermissions("repairs.update") @Patch("repairs/:id") updateRepair(
    @Param("id") id: string,
    @Body() dto: UpdateRepairDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.updateRepair(id, dto, user.sub);
  }
  @RequirePermissions("repairs.complete")
  @Post("repairs/:id/complete")
  completeRepair(
    @Param("id") id: string,
    @Body() dto: CompleteRepairDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.completeRepair(id, dto, user);
  }
  @RequirePermissions("repairs.create") @Post("repairs/:id/payments") payRepair(
    @Param("id") id: string,
    @Body() dto: RegisterPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.payRepair(id, dto, user);
  }

  @RequirePermissions("expenses.read") @Get("expenses") expenses() {
    return this.operations.listExpenses();
  }
  @RequirePermissions("expenses.create") @Post("expenses") createExpense(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operations.createExpense(dto, user.sub);
  }

  @RequirePermissions("reports.financial.read") @Get("dashboard") dashboard(
    @Query() range: DateRangeDto,
  ) {
    return this.operations.dashboard(range);
  }
}
