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
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserFiltersDto,
} from "./users.dto";
import { UsersService } from "./users.service";

@ApiBearerAuth()
@ApiTags("users and staff")
@RequirePermissions("users.manage")
@Controller("admin/users")
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get("meta") meta() {
    return this.users.meta();
  }
  @Get() list(@Query() filters: UserFiltersDto) {
    return this.users.list(filters);
  }
  @Post() create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor.sub);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.update(id, dto, actor.sub);
  }
  @Post(":id/password") resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.resetPassword(id, dto, actor.sub);
  }
  @Get(":id/activity") activity(@Param("id") id: string) {
    return this.users.activity(id);
  }
}
