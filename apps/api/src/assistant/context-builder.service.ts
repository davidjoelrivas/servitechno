import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import type { AssistantContext } from "./assistant.types";

@Injectable()
export class ContextBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async build(user: AuthUser): Promise<AssistantContext> {
    const [settings, expenseCategories, paymentMethods] = await Promise.all([
      this.prisma.businessSetting.findUnique({ where: { id: "default" } }),
      this.prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
      this.prisma.paymentMethod.findMany({ orderBy: { name: "asc" } }),
    ]);
    return {
      user,
      timezone:
        settings?.timezone ??
        this.config.get("BUSINESS_TIMEZONE") ??
        "America/Tegucigalpa",
      now: new Date().toISOString(),
      expenseCategories: expenseCategories.map(({ id, name }) => ({ id, name })),
      paymentMethods: paymentMethods.map(({ id, code, name, isCash }) => ({
        id,
        code,
        name,
        isCash,
      })),
    };
  }
}

