import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/permissions.decorator";
import { CreateConversationDto, SendAssistantMessageDto } from "./assistant.dto";
import { AssistantService } from "./assistant.service";

@ApiBearerAuth()
@ApiTags("assistant")
@RequirePermissions("assistant.use")
@Controller("assistant")
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get("status") status() {
    return this.assistant.status();
  }
  @Get("conversations") list(@CurrentUser() user: AuthUser) {
    return this.assistant.list(user);
  }
  @Post("conversations") create(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assistant.create(user, dto.title);
  }
  @Get("conversations/:id") get(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assistant.get(id, user);
  }
  @Post("conversations/:id/messages") send(
    @Param("id") id: string,
    @Body() dto: SendAssistantMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assistant.send(id, dto.content, user);
  }
  @Post("proposals/:id/confirm") confirm(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assistant.confirm(id, user);
  }
  @Post("proposals/:id/cancel") cancel(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assistant.cancel(id, user);
  }
}

