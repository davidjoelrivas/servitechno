import { Controller, Get, Param, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/permissions.decorator";
import { DocumentsService } from "./documents.service";

@ApiBearerAuth()
@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @RequirePermissions("documents.read")
  @Get()
  list(@CurrentUser() user: AuthUser) { return this.documents.listForUser(user); }

  @RequirePermissions("documents.read")
  @Get(":id/pdf")
  async pdf(@Param("id") id: string, @CurrentUser() user: AuthUser, @Res() response: Response) {
    const result = await this.documents.renderForUser(id, user);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${result.filename}"`);
    response.send(result.buffer);
  }
}
