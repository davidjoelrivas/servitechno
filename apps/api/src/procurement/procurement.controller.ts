import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/permissions.decorator";
import { CreatePurchaseDto, CreateSupplierDto, PayPurchaseDto, UpdateSupplierDto } from "./procurement.dto";
import { ProcurementService } from "./procurement.service";

@ApiBearerAuth()
@ApiTags("procurement")
@Controller()
export class ProcurementController {
  constructor(private procurement: ProcurementService) {}
  @RequirePermissions("suppliers.read") @Get("suppliers") suppliers() { return this.procurement.listSuppliers(); }
  @RequirePermissions("suppliers.manage") @Post("suppliers") createSupplier(@Body() dto: CreateSupplierDto, @CurrentUser() user: AuthUser) { return this.procurement.createSupplier(dto, user.sub); }
  @RequirePermissions("suppliers.manage") @Patch("suppliers/:id") updateSupplier(@Param("id") id: string, @Body() dto: UpdateSupplierDto, @CurrentUser() user: AuthUser) { return this.procurement.updateSupplier(id, dto, user.sub); }
  @RequirePermissions("purchases.read") @Get("purchases") purchases() { return this.procurement.listPurchases(); }
  @RequirePermissions("purchases.create") @Post("purchases") createPurchase(@Body() dto: CreatePurchaseDto, @CurrentUser() user: AuthUser) { return this.procurement.createPurchase(dto, user.sub); }
  @RequirePermissions("purchases.pay") @Post("purchases/:id/payments") payPurchase(@Param("id") id: string, @Body() dto: PayPurchaseDto, @CurrentUser() user: AuthUser) { return this.procurement.payPurchase(id, dto, user.sub); }
}

