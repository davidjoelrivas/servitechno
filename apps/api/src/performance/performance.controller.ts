import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/permissions.decorator";
import { DateRangeDto } from "../operations/operations.dto";
import { PerformanceService } from "./performance.service";

@ApiBearerAuth()
@ApiTags("performance")
@Controller("performance")
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}
  @RequirePermissions("reports.team.read") @Get() team(
    @Query() range: DateRangeDto,
  ) {
    return this.performance.team(range);
  }
  @RequirePermissions("performance.self.read") @Get("me") mine(
    @CurrentUser() user: AuthUser,
    @Query() range: DateRangeDto,
  ) {
    return this.performance.mine(user.sub, range);
  }
  @RequirePermissions("reports.team.read") @Get(":employeeId") one(
    @Param("employeeId") employeeId: string,
    @Query() range: DateRangeDto,
  ) {
    return this.performance.one(employeeId, range);
  }
}
