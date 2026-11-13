import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/permissions.decorator";
import { CreateSaleReturnDto } from "./returns.dto";
import { ReturnsService } from "./returns.service";

@ApiBearerAuth()
@ApiTags("returns")
@Controller("returns")
export class ReturnsController {
  constructor(private returns: ReturnsService) {}
  @RequirePermissions("returns.read") @Get() list() { return this.returns.list(); }
  @RequirePermissions("returns.create") @Post("sales/:saleId") create(@Param("saleId") saleId: string, @Body() dto: CreateSaleReturnDto, @CurrentUser() user: AuthUser) { return this.returns.create(saleId, dto, user.sub); }
}

