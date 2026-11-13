import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "./auth/public.decorator";
import { PrismaService } from "./prisma/prisma.service";

@ApiTags("system")
@Controller("health")
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  async getHealth() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", service: "servitechno-api", database: "connected", timestamp: new Date().toISOString() };
  }
}

