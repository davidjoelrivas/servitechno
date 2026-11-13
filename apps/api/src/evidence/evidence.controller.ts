import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/permissions.decorator";
import { EvidenceService } from "./evidence.service";

@ApiBearerAuth()
@ApiTags("repair evidence")
@Controller()
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @RequirePermissions("repairs.read")
  @Get("repairs/:repairId/evidence")
  list(@Param("repairId") repairId: string, @CurrentUser() user: AuthUser) {
    return this.evidence.list(repairId, user);
  }

  @RequirePermissions("repairs.read")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FilesInterceptor("photos", 6, {
      limits: { fileSize: 5 * 1024 * 1024, files: 6 },
    }),
  )
  @Post("repairs/:repairId/evidence")
  add(
    @Param("repairId") repairId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthUser,
  ) {
    return this.evidence.add(repairId, files, user);
  }

  @RequirePermissions("repairs.read")
  @Get("repair-evidence/:id/file")
  async file(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.evidence.file(id, user);
    const safeFilename = file.filename
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_");
    response.set({
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${safeFilename}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(file.buffer);
  }
}
