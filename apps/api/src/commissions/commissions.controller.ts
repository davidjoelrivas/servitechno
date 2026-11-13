import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/permissions.decorator";
import { PayCommissionDto } from "./commissions.dto";
import { CommissionsService } from "./commissions.service";

@ApiBearerAuth()
@ApiTags("commissions")
@Controller("commissions")
export class CommissionsController {
  constructor(private commissions: CommissionsService) {}
  @RequirePermissions("commissions.read") @Get() list() { return this.commissions.list(); }
  @RequirePermissions("commissions.approve") @Post(":id/approve") approve(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.commissions.approve(id, user.sub); }
  @RequirePermissions("commissions.pay") @Post(":id/payments") pay(@Param("id") id: string, @Body() dto: PayCommissionDto, @CurrentUser() user: AuthUser) { return this.commissions.pay(id, dto, user.sub); }
}

